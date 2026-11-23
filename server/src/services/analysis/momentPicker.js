import { loadAudio, rmsSeries } from "../media/audio.js";
import { whisperWords, wordTimings } from "../speech/whisper.service.js";
import { scoreChatWindows } from "../chat/chatScoring.js";
import { argmax, mean, median } from "../../utils/math.js";
import { reactionScore } from "./reactionScore.js";

export const DEFAULT_MIN_SCORE = 2.5;
const HOP = 0.25;

export function selectClipStart(anchor, leadIn, clipLen, duration) {
  const latest = Math.max(0, duration - clipLen);
  return Math.round(Math.min(Math.max(0, anchor - leadIn), latest) * 100) / 100;
}

/**
 * Find the strongest `top` moments in one recorded chunk.
 * Returns { moments: [[score, start], ...], timings } where timings are the chunk's word timings.
 */
export async function pickMoments(chunkPath, {
  clipLen, top, minScore, leadIn = 6, chatMessages = null, momentSource = "combined", lock = null,
}) {
  const audio = await loadAudio(chunkPath);
  if (audio.length < 16000) return { moments: [], timings: wordTimings() };
  const db = rmsSeries(audio, HOP);
  const timings = await whisperWords(audio, { lock });
  const { words } = timings;
  const med = median(db);
  const mad = median(Array.from(db, (v) => Math.abs(v - med))) + 1;
  const spike = Array.from(db, (v) => (v - med) / mad);
  const dur = db.length * HOP;
  if (dur < clipLen) return { moments: [], timings };

  const starts = [];
  for (let s = 0; s < dur - clipLen + 0.1; s += 5) starts.push(s);
  const chatScores = chatMessages?.length ? scoreChatWindows(chatMessages, starts, clipLen) : [];
  const chatByStart = new Map(chatScores.map((row) => [row.start.toFixed(3), row]));

  const candidates = starts.map((start) => {
    const a = Math.floor(start / HOP);
    const b = Math.floor((start + clipLen) / HOP);
    const seg = spike.slice(a, b).sort((x, y) => x - y);
    const loud = mean(seg.slice(-Math.max(3, Math.floor(seg.length / 10))));
    const inWindow = words.filter((w) => start <= w[0] && w[0] < start + clipLen);
    const density = inWindow.length / clipLen;
    const reaction = reactionScore(inWindow);
    const chatRow = chatByStart.get(start.toFixed(3));
    // Chat mode ranks by viewer reactions; speech and sound remain for captions and fallback.
    let audioScore = 0.45 * loud + 0.2 * Math.min(density, 4) + 1.2 * reaction;
    if (reaction === 0) audioScore *= 0.45;
    let score;
    if (momentSource === "chat") score = chatRow ? 1.5 * chatRow.signal : 0;
    else if (momentSource === "audio") score = audioScore;
    else score = audioScore + (chatRow ? 0.85 * chatRow.signal : 0);
    return { score, start, chatRow };
  });
  candidates.sort((x, y) => (y.score - x.score) || (y.start - x.start));

  const chosen = [];
  for (const { score, start, chatRow } of candidates) {
    if (score < minScore || chosen.length >= top) continue;
    // Same rule as the original: compare the window start with already chosen (snapped) clip starts.
    if (chosen.some((c) => Math.abs(start - c.start) < clipLen)) continue;
    const a = Math.floor(start / HOP);
    const b = Math.floor((start + clipLen) / HOP);
    let peak = argmax(spike, a, Math.min(b, spike.length)) * HOP;
    if (momentSource === "chat" && chatRow) peak = chatRow.peakT;
    else if (momentSource === "combined" && chatRow && chatRow.signal >= 1.2 && chatRow.peakChatters >= 2) peak = chatRow.peakT;
    let clipStart = selectClipStart(peak, leadIn, clipLen, dur);
    // Snap the start to the nearest word start within 2 s so a clip never begins mid-word.
    const near = words.map((w) => w[0]).filter((t) => Math.abs(t - clipStart) <= 2);
    if (near.length) clipStart = near.reduce((best, t) => (Math.abs(t - clipStart) < Math.abs(best - clipStart) ? t : best));
    chosen.push({ score: Math.round(score * 100) / 100, start: clipStart });
  }
  return { moments: chosen.map((c) => [c.score, c.start]), timings };
}

/** Re-transcribe just the selected clip with the English caption model for tighter caption timing. */
export async function englishClipWords(chunkPath, start, length, chunkTimings, log = () => {}) {
  const audio = await loadAudio(chunkPath, start, length);
  if (!audio.length) return chunkTimings;
  try {
    const refined = await whisperWords(audio, { finalEnglish: true });
    return wordTimings(
      refined.words.map(([s, e, w]) => [start + s, start + e, w]),
      refined.spokenLanguage, refined.captionLanguage, refined.captionFallbackReason,
    );
  } catch (error) {
    log(`clip caption refinement unavailable; using chunk timestamps (${error.name})`, "warn");
    return chunkTimings;
  }
}
