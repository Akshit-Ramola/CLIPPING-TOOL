import fs from "node:fs";
import ort from "onnxruntime-node";
import { FACE_MODEL } from "../../config/paths.js";
import { nms, toChwFloat } from "./frames.js";

/**
 * Frames are letterboxed to the model's native 640x640 input. The original ran YuNet at 320x320, where
 * a webcam face small enough to pass its own "inset" size rules (< 12% of width, < 22% of height, and a
 * panel estimate that fits beside the gameplay) was usually too small to clear the 0.8 score threshold.
 * The geometry rules in framing.js are unchanged; only detection resolution is higher.
 */
export const INPUT_SIZE = 640;
const SCORE_THRESHOLD = 0.8;
const NMS_THRESHOLD = 0.3;
const TOP_K = 5000;
const STRIDES = [8, 16, 32];

let sessionPromise = null;

/** Lazily load YuNet (face_detection_yunet_2023mar.onnx). Returns null when the model is missing. */
export function faceSession() {
  if (!fs.existsSync(FACE_MODEL)) return null;
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(FACE_MODEL, { executionProviders: ["cpu"] }).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

/**
 * Detect faces on a 640x640 BGR canvas. Mirrors OpenCV's FaceDetectorYN post-processing:
 * score = sqrt(cls * obj), box centre = (grid + offset) * stride, size = exp(log_wh) * stride.
 * Returns boxes [x, y, w, h, score] in canvas pixels.
 */
export async function detectFaces(session, bgr) {
  const size = INPUT_SIZE; // the exported model has a fixed 640x640 input
  const input = new ort.Tensor("float32", toChwFloat(bgr, size), [1, 3, size, size]);
  const outputs = await session.run({ [session.inputNames[0]]: input });
  const boxes = [];
  const scores = [];
  for (const stride of STRIDES) {
    const cls = outputs[`cls_${stride}`].data;
    const obj = outputs[`obj_${stride}`].data;
    const bbox = outputs[`bbox_${stride}`].data;
    const cols = size / stride;
    const rows = size / stride;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const idx = r * cols + c;
        const clsScore = Math.min(1, Math.max(0, cls[idx]));
        const objScore = Math.min(1, Math.max(0, obj[idx]));
        const score = Math.sqrt(clsScore * objScore);
        if (score < SCORE_THRESHOLD) continue;
        const cx = (c + bbox[idx * 4]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;
        boxes.push([cx - w / 2, cy - h / 2, w, h]);
        scores.push(score);
      }
    }
  }
  return nms(boxes, scores, SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K).map((i) => [...boxes[i], scores[i]]);
}
