import fs from "node:fs";
import path from "node:path";
import { ffmpegPath } from "../media/tools.js";
import { run, tail } from "../media/process.js";
import { mediaStartTime } from "../media/probe.js";
import { writeWordPopAss } from "../captions/assWriter.js";
import { buildVideoFilter } from "./filterBuilder.js";

const removeQuietly = (file) => {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* ignore */
  }
};

/**
 * Cut [start, start+length) out of a recorded chunk into a 1080x1920 H.264 MP4 with burned captions.
 * Returns { ok: true } or { ok: false, error }.
 */
export async function cutClip(chunkPath, timings, start, length, outMp4, credit, {
  crop = false, cropOffset = 0.5, sourceRoi = null, captionMarginV = 400, layout = "fit", panKeys = null,
  facecamRoi = null, gameplayRoi = null,
} = {}) {
  const outputPath = path.resolve(outMp4);
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  // The ass= filter is given a bare file name and FFmpeg runs in `dir`, avoiding Windows drive-letter escaping.
  const assName = `cap_${path.basename(outputPath)}.ass`;
  const assPath = path.join(dir, assName);
  let rendered = false;
  try {
    writeWordPopAss(assPath, timings, start, length, credit, captionMarginV, layout === "stack" ? 735 : null);
    let graph = buildVideoFilter(assName, { crop, cropOffset, sourceRoi, layout, panKeys, facecamRoi, gameplayRoi });
    const origin = (await mediaStartTime(chunkPath)) + start;
    // Trim both streams against the container clock; FFmpeg can otherwise pick a different zero
    // when decoding only audio for transcription.
    graph = `[0:v]trim=start=${origin.toFixed(6)},setpts=PTS-(${origin.toFixed(6)})/TB[clip_v];` + graph.replace("[0:v]", "[clip_v]");
    const audioFilter = `atrim=start=${origin.toFixed(6)},asetpts=PTS-(${origin.toFixed(6)})/TB`;
    const r = await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-y", "-copyts",
      "-i", path.resolve(chunkPath), "-t", String(length),
      "-filter_complex", graph, "-af", audioFilter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      path.basename(outputPath),
    ], { cwd: dir });
    if (r.code) return { ok: false, error: `ffmpeg cut failed: ${tail(r.stderr || "FFmpeg returned a non-zero exit code.", 300)}` };
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return { ok: false, error: "ffmpeg cut failed: FFmpeg reported success but produced no output file." };
    }
    rendered = true;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `ffmpeg cut could not run: ${error.message}` };
  } finally {
    removeQuietly(assPath);
    if (!rendered) removeQuietly(outputPath);
  }
}
