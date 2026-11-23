/**
 * Follow the player character so the 9:16 crop keeps them in the middle.
 *
 * GTA's third-person camera does not keep the player at the exact centre of a 16:9 frame, and a 9:16 crop
 * shows only ~32% of the width. Frames are sampled at 1 fps, people are detected with YOLOX-S
 * (OpenCV Zoo, Apache-2.0), the player is picked (big person nearest the lower middle, continuing the
 * previous pick), the path is smoothed, and keyframes [t, xCentreFraction] are returned for a panning crop.
 */
import fs from "node:fs";
import path from "node:path";
import ort from "onnxruntime-node";
import { PERSON_MODEL } from "../../config/paths.js";
import { median } from "../../utils/math.js";
import { logger } from "../../utils/logger.js";
import { videoSize } from "../media/probe.js";
import { eachLetterboxedFrame, nms, toChwFloat } from "./frames.js";

const MODEL_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx";
const SIZE = 640;

const IDLE_TIMEOUT_MS = 60_000;

let sessionPromise = null;
let downloadPromise = null;
let grid = null;

/**
 * Download the detector (35 MB) by streaming it to disk. Aborts only when no data arrives for
 * IDLE_TIMEOUT_MS, so slow connections still finish. Concurrent callers share one download.
 */
export function downloadPersonModel({ onProgress } = {}) {
  if (fs.existsSync(PERSON_MODEL)) return Promise.resolve(PERSON_MODEL);
  if (downloadPromise) return downloadPromise;
  downloadPromise = (async () => {
    fs.mkdirSync(path.dirname(PERSON_MODEL), { recursive: true });
    const tmp = `${PERSON_MODEL}.part`;
    const controller = new AbortController();
    let idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    try {
      const response = await fetch(MODEL_URL, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`model download failed: HTTP ${response.status}`);
      const total = Number(response.headers.get("content-length")) || 0;
      const out = fs.createWriteStream(tmp);
      let received = 0;
      for await (const chunk of response.body) {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
        onProgress?.(received, total);
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      if (total && received !== total) throw new Error(`model download incomplete (${received}/${total} bytes)`);
      fs.renameSync(tmp, PERSON_MODEL);
      return PERSON_MODEL;
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      throw error;
    } finally {
      clearTimeout(idle);
      downloadPromise = null;
    }
  })();
  return downloadPromise;
}

/**
 * Returns the ONNX session, or null while the model is not on disk yet. In that case the download is
 * started in the background so a clip render never waits on it; that clip uses the static crop.
 */
function session() {
  if (!fs.existsSync(PERSON_MODEL)) {
    downloadPersonModel().catch((error) => logger.warn(`YOLOX model download failed: ${error.message}`));
    return Promise.resolve(null);
  }
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(PERSON_MODEL, { executionProviders: ["cpu"], intraOpNumThreads: 2 })
      .catch((error) => {
        sessionPromise = null;
        throw error;
      });
  }
  return sessionPromise;
}

function grids() {
  const rows = [];
  for (const stride of [8, 16, 32]) {
    const n = SIZE / stride;
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) rows.push([x, y, stride]);
  }
  return rows;
}

/** Person boxes [x, y, w, h, score] in source-frame pixels. */
async function detectPeople(sess, bgr, ratio, conf = 0.35) {
  grid ??= grids();
  const input = new ort.Tensor("float32", toChwFloat(bgr, SIZE), [1, 3, SIZE, SIZE]);
  const out = await sess.run({ [sess.inputNames[0]]: input });
  const tensor = out[sess.outputNames[0]];
  const data = tensor.data;
  const width = tensor.dims[2];
  const boxes = [];
  const scores = [];
  for (let i = 0; i < grid.length; i += 1) {
    const o = i * width;
    const score = data[o + 4] * data[o + 5]; // objectness * P(person)
    if (score <= conf) continue;
    const [gx, gy, stride] = grid[i];
    const cx = ((data[o] + gx) * stride) / ratio;
    const cy = ((data[o + 1] + gy) * stride) / ratio;
    const bw = (Math.exp(data[o + 2]) * stride) / ratio;
    const bh = (Math.exp(data[o + 3]) * stride) / ratio;
    boxes.push([cx - bw / 2, cy - bh / 2, bw, bh]);
    scores.push(score);
  }
  return nms(boxes, scores, conf, 0.45).map((i) => [...boxes[i], scores[i]]);
}

/** The player: a large person in the lower-middle of the screen, close to the previous pick. */
export function pickPlayer(people, frameW, frameH, prevX = null) {
  let best = null;
  let bestCost = null;
  for (const [x, y, w, h] of people) {
    if (h < frameH * 0.12) continue; // far-away pedestrians
    const cx = (x + w / 2) / frameW;
    const cy = (y + h / 2) / frameH;
    if (cx < 0.12 || cx > 0.88) continue; // edge people are rarely the player
    let cost = Math.abs(cx - 0.45) * 1.2 + Math.abs(cy - 0.6) * 0.6 - (h / frameH) * 1.5;
    if (prevX !== null) cost += Math.abs(cx - prevX) * 1.5;
    if (bestCost === null || cost < bestCost) {
      best = cx;
      bestCost = cost;
    }
  }
  return best;
}

/** Fill gaps by holding the last position, then 3-point median + speed-limited easing. */
export function smoothPath(times, xs, fallback = 0.5, maxSpeed = 0.12) {
  let last = null;
  const filled = xs.map((x) => {
    const value = x ?? last;
    if (value !== null) last = value;
    return value;
  });
  const first = filled.find((x) => x !== null) ?? fallback;
  const complete = filled.map((x) => x ?? first);
  const med = complete.map((_, i) => median(complete.slice(Math.max(0, i - 1), i + 2)));
  const out = [med[0]];
  for (let i = 1; i < med.length; i += 1) {
    const dt = Math.max(1e-3, times[i] - times[i - 1]);
    const step = Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, med[i] - out[out.length - 1]));
    out.push(out[out.length - 1] + step);
  }
  return out;
}

/** Keyframes [[tFromClipStart, xCentreFraction], ...] or null if tracking is unavailable/unclear. */
export async function trackPlayer(videoPath, start, length, fps = 1) {
  let sess;
  try {
    sess = await session();
  } catch {
    return null;
  }
  if (!sess) return null;
  const size = await videoSize(videoPath);
  if (!size) return null;
  const [fw, fh] = size;
  if (fw <= 0 || fh <= 0 || fw / fh < 1.2) return null; // portrait sources: nothing to pan
  const times = [];
  const xs = [];
  let prev = null;
  await eachLetterboxedFrame(videoPath, { start, length, fps, frameWidth: fw, frameHeight: fh, size: SIZE }, async (bgr, i, ratio) => {
    const x = pickPlayer(await detectPeople(sess, bgr, ratio), fw, fh, prev);
    if (x !== null) prev = x;
    times.push(i / fps);
    xs.push(x);
  });
  const found = xs.filter((x) => x !== null).length;
  if (found < Math.max(2, Math.floor(xs.length / 5))) return null; // driving / cutscene: keep the static crop
  const smooth = smoothPath(times, xs);
  return times.map((t, i) => [t, smooth[i]]);
}

/** FFmpeg expression for crop x (input already scaled to 1920 high): piecewise-linear pan through keys. */
export function cropXExpr(keys, outW = 1080) {
  const at = (x) => `(iw*${x.toFixed(4)}-${Math.floor(outW / 2)})`;
  let expr = at(keys[keys.length - 1][1]);
  const pairs = keys.slice(0, -1).map((k, i) => [k, keys[i + 1]]).reverse();
  for (const [[t0, x0], [t1, x1]] of pairs) {
    if (t1 <= t0) continue;
    const seg = `(${at(x0)}+(${at(x1)}-${at(x0)})*(t-${t0.toFixed(2)})/${(t1 - t0).toFixed(2)})`;
    expr = `if(lt(t\\,${t1.toFixed(2)})\\,${seg}\\,${expr})`;
  }
  return `max(0\\,min(iw-${outW}\\,${expr}))`;
}
