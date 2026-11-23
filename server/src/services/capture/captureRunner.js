import fs from "node:fs";
import path from "node:path";
import { CaptureJob } from "../../models/CaptureJob.js";
import { Clip } from "../../models/Clip.js";
import { env } from "../../config/env.js";
import { OUTPUT_DIR, TEST_OUTPUT_DIR, WORK_DIR, mediaUrl } from "../../config/paths.js";
import { analysisLock, sleep } from "../../utils/async.js";
import { clipStamp } from "../../utils/time.js";
import { streamInfo, sourceIdentity } from "../media/ytdlp.js";
import { mediaDuration, videoSize } from "../media/probe.js";
import { isRunning, startRecorder, stopRecorder } from "../media/recorder.js";
import { createLiveChatCollector, summarizeChatWindow } from "../chat/index.js";
import { LanguageLock } from "../speech/whisper.service.js";
import { englishClipWords, pickMoments } from "../analysis/momentPicker.js";
import { detectSmartFrame } from "../vision/smartFrame.js";
import { chooseStackRois } from "../vision/framing.js";
import { trackPlayer } from "../vision/playerTracker.js";
import { captionMarginForVideo } from "../render/filterBuilder.js";
import { cutClip } from "../render/clipCutter.js";

const POLL_MS = 3000;

/**
 * Runs one capture job end to end: record in chunks, score each finished chunk, render the best
 * moments, and store each clip in MongoDB. Nothing is uploaded or published here.
 */
export async function runCapture(jobId, signal) {
  const job = await CaptureJob.findById(jobId);
  if (!job) return;
  const o = job.options;
  // Chain log writes so lines are stored in the order they were produced.
  let logChain = Promise.resolve();
  const log = (message, level = "info") => {
    logChain = logChain.then(() => CaptureJob.appendLog(jobId, message, level)).catch(() => {});
    return logChain;
  };
  const update = (fields) => CaptureJob.updateOne({ _id: jobId }, { $set: fields });

  let recorder = null;
  let chat = null;
  let workDir = null;
  let clipCount = 0;
  let chunksAnalysed = 0;
  try {
    await update({ status: "running", startedAt: new Date() });

    // ---------- source info + permission gate ----------
    let who;
    let title;
    if (job.sourceType === "url") {
      log("reading stream information ...");
      const info = await streamInfo(job.url);
      if (!info.is_live && !job.test) throw new Error("The source is not live. Use test mode for a non-live input.");
      who = sourceIdentity(info, job.test);
      title = info.title || "";
      await update({ source: { title, streamer: who.name, credit: who.credit, channelId: who.channelId, videoId: info.id } });
      job.$locals.videoId = info.id;
    } else {
      who = sourceIdentity({ uploader: "local source" }, true);
      title = job.fileName || path.basename(job.filePath);
      await update({ source: { title, streamer: who.name, credit: who.credit } });
    }
    const outDir = who.test ? TEST_OUTPUT_DIR : OUTPUT_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    workDir = fs.mkdtempSync(path.join(WORK_DIR, "capture-"));
    await update({ outputDir: outDir });
    log(`source: "${title}" by ${who.name}`);
    log(`moment finder: ${o.momentSource} (chat mode falls back to audio/speech when chat is unavailable)`);

    // ---------- live chat ----------
    let chatSource = "disabled";
    let chatFallback = null;
    if (job.sourceType === "url" && !job.test && o.momentSource !== "audio") {
      const created = createLiveChatCollector(job.url, job.$locals.videoId);
      chatSource = created.source;
      chatFallback = created.fallbackReason;
      chat = created.collector;
      if (chat) chat.start();
      else {
        chatSource = "audio-speech-fallback";
        log(`live chat unavailable (${chatFallback}); using audio/speech scoring`, "warn");
      }
    } else {
      chatFallback = "disabled by test mode or audio-only mode";
    }
    await update({ chat: { source: chatSource, status: chat ? chat.status : "unavailable", fallbackReason: chatFallback } });

    // ---------- record + analyse loop ----------
    const lock = new LanguageLock(o.spokenLanguage === "auto" ? null : o.spokenLanguage);
    recorder = await startRecorder({
      url: job.sourceType === "url" ? job.url : null,
      file: job.sourceType === "file" ? job.filePath : null,
      chunk: o.chunk,
      maxSeconds: o.maxSeconds,
      outdir: workDir,
    });
    log(`recording in ${o.chunk}s chunks${o.maxSeconds > 0 ? ` for up to ${o.maxSeconds}s` : " until stopped"}`);
    const done = new Set();

    while (true) {
      const chunks = fs.readdirSync(workDir).filter((f) => /^chunk_\d+\.ts$/.test(f)).sort().map((f) => path.join(workDir, f));
      const recording = isRunning(recorder);
      const finished = recording ? chunks.slice(0, -1) : chunks;
      const todo = finished.filter((c) => !done.has(c));
      if (signal.aborted && recording) {
        log("stopping capture; finishing current work ...");
        await stopRecorder(recorder);
        continue;
      }
      if (!todo.length) {
        if (!recording) break;
        await sleep(POLL_MS, signal);
        continue;
      }
      const chunkPath = todo[0];
      done.add(chunkPath);
      log(`analysing ${path.basename(chunkPath)} ...`);
      const chunkLength = await mediaDuration(chunkPath);
      if (chunkLength <= 0) {
        log("skipped empty or unreadable capture segment", "warn");
        continue;
      }
      const chunkEndEpoch = fs.statSync(chunkPath).mtimeMs / 1000;
      const chunkStartEpoch = chunkEndEpoch - chunkLength;
      const chunkChat = chat
        ? chat.messagesBetween(chunkStartEpoch, chunkEndEpoch).map((m) => ({ t: m.epoch - chunkStartEpoch, user: m.user, text: m.text }))
        : [];
      let chunkMomentSource = o.momentSource;
      if ((chunkMomentSource === "chat" || chunkMomentSource === "combined") && !chunkChat.length) {
        chunkMomentSource = "audio";
        if (o.momentSource === "chat" && chat) log("no live chat messages for this chunk; using audio/speech instead");
      }

      const { moments, timings } = await analysisLock.run(() => pickMoments(chunkPath, {
        clipLen: o.clipLen, top: o.top, minScore: o.minScore, leadIn: o.leadIn,
        chatMessages: chunkChat, momentSource: chunkMomentSource, lock,
      }));
      chunksAnalysed += 1;
      if (!moments.length) log("  no moment above the minimum score in this chunk");

      for (const [score, start] of moments) {
        const created = await renderMoment({
          job, o, who, title, chunkPath, start, score, timings, chunkChat, chunkMomentSource, chat, chatSource, chatFallback, outDir, log,
          index: clipCount + 1,
        });
        if (created) {
          clipCount += 1;
          log(`  clip ${created.name}.mp4  score ${score}`);
        }
      }
      await update({ chunksAnalysed, clipCount, "chat.status": chat ? chat.status : "unavailable" });

      // Drop analysed chunks older than keepMinutes.
      for (const file of done) {
        try {
          if (Date.now() - fs.statSync(file).mtimeMs > o.keepMinutes * 60_000) fs.rmSync(file, { force: true });
        } catch {
          /* already removed */
        }
      }
      chat?.discardBefore(chunkEndEpoch - 5);
    }

    if (recorder.exitCode && !signal.aborted && !chunksAnalysed) {
      throw new Error(`recording failed: ${recorder.stderrTail.slice(-400) || `ffmpeg exit code ${recorder.exitCode}`}`);
    }
    log(`done. ${clipCount} clip(s) in ${outDir}. Nothing posted.`);
    await update({ status: signal.aborted ? "stopped" : "completed", finishedAt: new Date(), chunksAnalysed, clipCount });
  } catch (error) {
    log(error.message || String(error), "error");
    await update({ status: "failed", error: error.message || String(error), finishedAt: new Date(), chunksAnalysed, clipCount });
  } finally {
    if (chat) await chat.stop();
    if (recorder) await stopRecorder(recorder);
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function renderMoment({
  job, o, who, title, chunkPath, start, score, timings, chunkChat, chunkMomentSource, chat, chatSource, chatFallback, outDir, log, index,
}) {
  const name = `gta-${clipStamp()}-${index}`;
  const mp4 = path.join(outDir, `${name}.mp4`);
  const layout = o.layout;
  let cropOffset = 0.5;
  let sourceRoi = null;
  let facecamRoi = null;
  let gameplayRoi = null;

  if (layout === "stack") {
    if (o.facecamRoi?.length === 4) {
      const size = await videoSize(chunkPath);
      [facecamRoi, gameplayRoi] = size ? chooseStackRois(size[0], size[1], [], null, [...o.facecamRoi]) : [null, null];
      if (!gameplayRoi) {
        log("  skipped stacked render: the specified webcam rectangle does not leave a usable gameplay region", "warn");
        return null;
      }
    } else {
      ({ cropOffset, sourceRoi, facecamRoi, gameplayRoi } = await analysisLock.run(() => detectSmartFrame(chunkPath, start, o.clipLen)));
    }
    if (!facecamRoi) {
      log("  skipped stacked render: no stable facecam region detected; use the fill layout for this source", "warn");
      return null;
    }
    if (!gameplayRoi) {
      log("  skipped stacked render: could not isolate a safe gameplay panel", "warn");
      return null;
    }
  } else if (layout === "fill") {
    ({ cropOffset, sourceRoi } = await analysisLock.run(() => detectSmartFrame(chunkPath, start, o.clipLen)));
  }

  const smartCrop = layout === "fill";
  let panKeys = null;
  if (smartCrop && !sourceRoi && env.playerTracking) {
    panKeys = await analysisLock.run(() => trackPlayer(chunkPath, start, o.clipLen));
    if (!panKeys) cropOffset = 0.5; // driving / cutscene: the car sits mid-frame
  }
  const captionMarginV = layout === "stack"
    ? 1160
    : await captionMarginForVideo(chunkPath, smartCrop, smartCrop ? null : sourceRoi);
  const videoCredit = layout !== "stack" ? who.credit : null;
  const clipTimings = layout === "stack" && timings.captionLanguage === "English"
    ? await analysisLock.run(() => englishClipWords(chunkPath, start, o.clipLen, timings, log))
    : timings;

  const result = await cutClip(chunkPath, clipTimings, start, o.clipLen, mp4, videoCredit, {
    crop: smartCrop, cropOffset, sourceRoi, captionMarginV, layout, panKeys, facecamRoi, gameplayRoi,
  });
  if (!result.ok) {
    log(`  ${result.error}`, "error");
    return null;
  }

  const text = clipTimings.words.filter((w) => start <= w[0] && w[0] < start + o.clipLen).map((w) => w[2]).join(" ");
  let captionLanguage = clipTimings.captionLanguage;
  let captionReason = clipTimings.captionFallbackReason;
  if (!text.trim()) {
    captionLanguage = "none";
    captionReason = captionReason || "No timed speech detected in the selected clip.";
  }
  const chatSummary = summarizeChatWindow(chunkChat, start, o.clipLen);
  const selectionSignals = chunkMomentSource === "chat"
    ? ["live-chat"]
    : chunkMomentSource === "combined" ? ["audio", "speech", "live-chat"] : ["audio", "speech"];
  const chatUnavailable = !chat || chat.status === "unavailable";

  return Clip.create({
    name,
    job: job._id,
    videoPath: mp4,
    videoUrl: mediaUrl(mp4),
    channel: "gta",
    sourceUrl: job.url || job.fileName,
    streamer: who.name,
    credit: who.credit,
    streamTitle: title,
    score,
    clipStart: start,
    clipLength: o.clipLen,
    transcript: text,
    spokenLanguage: clipTimings.spokenLanguage,
    captionLanguage,
    captionFallbackReason: captionReason,
    captionPosition: layout === "stack" ? "center-panel-join" : "lower-third-of-visible-gameplay",
    framing: layout === "stack" ? "stack-facecam-gameplay" : smartCrop ? "fill-9x16" : "full-source-blur-fill",
    facecamRoi: facecamRoi || undefined,
    gameplayRoi: gameplayRoi || undefined,
    sourceRoi: sourceRoi || undefined,
    cropOffset: smartCrop ? cropOffset : null,
    playerTrack: panKeys ? panKeys.map(([t, x]) => [Math.round(t * 100) / 100, Math.round(x * 1000) / 1000]) : undefined,
    gameplayConfirmed: o.gameplayConfirmed,
    momentSourceRequested: o.momentSource,
    momentSourceUsed: chunkMomentSource,
    selectionSignals,
    liveChatSource: chatSource,
    liveChatStatus: chat ? chat.status : "unavailable",
    chatFallbackReason: chatUnavailable ? (chat ? chat.error : chatFallback) : null,
    chatMessageCount: chatSummary.messageCount,
    uniqueChatters: chatSummary.uniqueChatters,
    reactionChatters: chatSummary.reactionChatters,
    test: who.test,
  });
}
