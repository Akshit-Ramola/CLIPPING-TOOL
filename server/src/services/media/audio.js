import { ffmpegPath } from "./tools.js";
import { run } from "./process.js";
import { mediaStartTime } from "./probe.js";

export const SAMPLE_RATE = 16000;

/**
 * Decode mono 16 kHz float PCM. Raw PCM has no timestamps, so the initial offset and gaps
 * are filled before transcription to keep sample positions on the source timeline.
 */
export async function loadAudio(file, start = null, length = null) {
  const origin = (await mediaStartTime(file)) + (start || 0);
  const duration = length == null ? [] : ["-t", String(length)];
  const r = await run(
    ffmpegPath(),
    [
      "-loglevel", "error", "-copyts", "-i", file, "-vn", ...duration,
      "-af", `atrim=start=${origin.toFixed(6)},asetpts=PTS-(${origin.toFixed(6)})/TB,aresample=16000:async=1:first_pts=0`,
      "-f", "f32le", "-ac", "1", "-ar", "16000", "-",
    ],
    { binary: true },
  );
  const buf = r.stdout;
  const usable = buf.length - (buf.length % 4);
  const samples = new Float32Array(usable / 4);
  for (let i = 0; i < samples.length; i += 1) samples[i] = buf.readFloatLE(i * 4);
  return samples;
}

/** Loudness in dB per `hop` seconds (numpy rms_series port). */
export function rmsSeries(samples, hop = 0.25) {
  const n = Math.floor(SAMPLE_RATE * hop);
  const k = Math.floor(samples.length / n);
  if (k === 0) return new Float64Array(1);
  const out = new Float64Array(k);
  for (let i = 0; i < k; i += 1) {
    let sum = 0;
    for (let j = i * n; j < (i + 1) * n; j += 1) sum += samples[j] * samples[j];
    out[i] = 20 * Math.log10(Math.sqrt(sum / n) + 1e-6);
  }
  return out;
}
