import { ffmpegPath } from "../media/tools.js";
import { run } from "../media/process.js";

/**
 * Grab one frame at `time` seconds, scaled to fit `size`x`size` and centred on black padding
 * (the same letterbox the original applied before running YuNet). Returns BGR bytes or null.
 */
export async function grabLetterboxedFrame(file, time, frameWidth, frameHeight, size) {
  const scale = Math.min(size / frameWidth, size / frameHeight);
  const rw = Math.max(1, Math.round(frameWidth * scale));
  const rh = Math.max(1, Math.round(frameHeight * scale));
  const padX = Math.floor((size - rw) / 2);
  const padY = Math.floor((size - rh) / 2);
  const r = await run(ffmpegPath(), [
    "-loglevel", "error", "-ss", time.toFixed(3), "-i", file, "-frames:v", "1",
    "-vf", `scale=${rw}:${rh}:flags=area,pad=${size}:${size}:${padX}:${padY}:black`,
    "-f", "rawvideo", "-pix_fmt", "bgr24", "-",
  ], { binary: true, timeoutMs: 60_000 });
  if (r.code || r.stdout.length < size * size * 3) return null;
  return { data: r.stdout.subarray(0, size * size * 3), scale, padX, padY };
}

/** Full-resolution grayscale frame (used to find black bars at the bottom of portrait streams). */
export async function grabGrayFrame(file, time, frameWidth, frameHeight) {
  const r = await run(ffmpegPath(), [
    "-loglevel", "error", "-ss", time.toFixed(3), "-i", file, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "gray", "-",
  ], { binary: true, timeoutMs: 60_000 });
  if (r.code || r.stdout.length < frameWidth * frameHeight) return null;
  return r.stdout;
}

/**
 * Stream frames at `fps` between start and start+length, each letterboxed into the top-left of a
 * `size`x`size` canvas filled with grey 114 (YOLOX preprocessing). Calls onFrame(bgr, index).
 */
export async function eachLetterboxedFrame(file, { start, length, fps, frameWidth, frameHeight, size }, onFrame) {
  const ratio = Math.min(size / frameWidth, size / frameHeight);
  const rw = Math.round(frameWidth * ratio);
  const rh = Math.round(frameHeight * ratio);
  const r = await run(ffmpegPath(), [
    "-loglevel", "error", "-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", file,
    "-vf", `fps=${fps},scale=${rw}:${rh},pad=${size}:${size}:0:0:0x727272`,
    "-f", "rawvideo", "-pix_fmt", "bgr24", "-",
  ], { binary: true, timeoutMs: 600_000 });
  const frameBytes = size * size * 3;
  const count = Math.floor(r.stdout.length / frameBytes);
  for (let i = 0; i < count; i += 1) {
    await onFrame(r.stdout.subarray(i * frameBytes, (i + 1) * frameBytes), i, ratio);
  }
  return count;
}

/** HWC uint8 BGR -> CHW float32 (no normalisation, as both ONNX models expect). */
export function toChwFloat(bgr, size) {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    out[i] = bgr[i * 3];
    out[plane + i] = bgr[i * 3 + 1];
    out[2 * plane + i] = bgr[i * 3 + 2];
  }
  return out;
}

/** Greedy non-maximum suppression. boxes: [x, y, w, h]; returns kept indices. */
export function nms(boxes, scores, scoreThreshold, iouThreshold, topK = 5000) {
  const order = scores
    .map((s, i) => [s, i])
    .filter(([s]) => s >= scoreThreshold)
    .sort((a, b) => b[0] - a[0])
    .slice(0, topK)
    .map(([, i]) => i);
  const keep = [];
  for (const i of order) {
    const [ax, ay, aw, ah] = boxes[i];
    let suppressed = false;
    for (const j of keep) {
      const [bx, by, bw, bh] = boxes[j];
      const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      const inter = ix * iy;
      const union = aw * ah + bw * bh - inter;
      if (union > 0 && inter / union > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) keep.push(i);
  }
  return keep;
}
