import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ffmpegPath } from "../media/tools.js";
import { probeMedia } from "../media/probe.js";
import { parseSrt, cuesToAss } from "../captions/srt.js";
import { buildStackGraph } from "./filterBuilder.js";

/**
 * Render two pre-aligned videos (facecam on top, gameplay below) plus optional SRT captions into a
 * 1080x1920 H.264 MP4. Inputs must already start at the same moment; nothing is synchronised.
 */
export async function renderStack({
  facecam, gameplay, output, subtitleText = "", style = "bold", fps = 30, streamerVolume = 1, gameplayVolume = 1,
  onProgress = () => {},
}) {
  const facecamPath = path.resolve(facecam);
  const gameplayPath = path.resolve(gameplay);
  const outputPath = path.resolve(output);
  if (path.extname(outputPath).toLowerCase() !== ".mp4" || [facecamPath, gameplayPath].includes(outputPath)) {
    throw new Error("output must be a new MP4 path, separate from source files");
  }
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  const faceInfo = await probeMedia(facecamPath, "facecam video");
  const gameInfo = await probeMedia(gameplayPath, "gameplay video");
  const duration = Math.min(faceInfo.duration, gameInfo.duration);
  const cues = parseSrt(subtitleText);
  let assPath = null;
  if (cues.length) {
    assPath = path.join(dir, `gta-face-clipper-${crypto.randomBytes(6).toString("hex")}.ass`);
    fs.writeFileSync(assPath, cuesToAss(cues, style), "utf8");
  }
  const cleanup = () => assPath && fs.rmSync(assPath, { force: true });

  const graph = buildStackGraph({
    duration, fps, streamerVolume, gameplayVolume,
    hasStreamerAudio: faceInfo.hasAudio, hasGameplayAudio: gameInfo.hasAudio,
    captions: Boolean(assPath), captionFilename: assPath ? path.basename(assPath) : "captions.ass",
  });
  const args = [
    "-hide_banner", "-nostdin", "-y", "-i", facecamPath, "-i", gameplayPath,
    "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-t", duration.toFixed(3),
    "-r", String(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", outputPath,
  ];
  onProgress(0.18, "Composing facecam and gameplay");

  const code = await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ffmpegPath(), args, { cwd: dir, windowsHide: true });
    } catch (error) {
      reject(new Error(`FFmpeg could not start: ${error.message}`));
      return;
    }
    let stderr = "";
    let stdoutBuffer = "";
    const limit = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg render exceeded the time limit and was stopped."));
    }, Math.max(180, duration * 30) * 1000);
    child.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-3500);
    });
    child.stdout.on("data", (d) => {
      stdoutBuffer += d.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("out_time_ms=")) continue;
        const secs = Number.parseInt(line.split("=")[1], 10) / 1_000_000;
        if (Number.isFinite(secs)) onProgress(Math.min(0.92, 0.28 + (0.62 * secs) / duration), "Rendering video and audio");
      }
    });
    child.on("error", (error) => {
      clearTimeout(limit);
      reject(new Error(`FFmpeg could not start: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      clearTimeout(limit);
      if (exitCode) {
        const err = new Error(`FFmpeg could not render the video. ${stderr.trim()}`);
        reject(err);
      } else resolve(exitCode);
    });
  }).catch((error) => {
    cleanup();
    fs.rmSync(outputPath, { force: true });
    throw error;
  });

  cleanup();
  if (code !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
    throw new Error("FFmpeg finished without producing a usable MP4.");
  }
  onProgress(1, "Video ready");
  return { outputPath, bytes: fs.statSync(outputPath).size };
}
