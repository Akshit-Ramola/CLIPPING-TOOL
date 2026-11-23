import { ffprobePath } from "./tools.js";
import { run } from "./process.js";

export async function mediaDuration(file) {
  const r = await run(ffprobePath(), [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const value = Number.parseFloat(r.stdout.trim());
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export async function mediaStartTime(file) {
  const r = await run(ffprobePath(), [
    "-v", "error", "-show_entries", "format=start_time", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const value = Number.parseFloat(r.stdout.trim());
  return Number.isFinite(value) ? value : 0;
}

/** [width, height] of the first video stream, or null. */
export async function videoSize(file) {
  const r = await run(ffprobePath(), [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", file,
  ]);
  for (const line of r.stdout.split(/\r?\n/)) {
    const match = /^(\d+)x(\d+)$/.exec(line.trim());
    if (match) return [Number(match[1]), Number(match[2])];
  }
  return null;
}

/** Duration + audio presence for the manual renderer; throws a readable error for unusable inputs. */
export async function probeMedia(file, label) {
  const r = await run(ffprobePath(), [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file,
  ], { timeoutMs: 90_000 });
  if (r.code) throw new Error(`Could not read ${label}: ${r.stderr.trim().slice(-1000)}`);
  let data;
  try {
    data = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Could not read video information from ${label}`);
  }
  const duration = Number.parseFloat(data?.format?.duration);
  const streams = data?.streams || [];
  if (!Number.isFinite(duration) || duration <= 0 || !streams.some((s) => s.codec_type === "video")) {
    throw new Error(`${label} must contain a video track with a valid duration`);
  }
  return { duration, hasAudio: streams.some((s) => s.codec_type === "audio") };
}
