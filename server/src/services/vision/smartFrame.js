import { linspace } from "../../utils/math.js";
import { videoSize } from "../media/probe.js";
import { detectFaces, faceSession, INPUT_SIZE } from "./faceDetector.js";
import { grabGrayFrame, grabLetterboxedFrame } from "./frames.js";
import { chooseCropOffset, chooseStackRois, chooseVerticalGameRoi } from "./framing.js";

/**
 * Detect a persistent facecam and return framing decisions for one clip window:
 * { cropOffset, sourceRoi, facecamRoi, gameplayRoi }. Falls back to a centred, uncropped result
 * whenever the model, the video or the detections are unavailable.
 */
export async function detectSmartFrame(videoPath, start, length, sampleCount = 9) {
  const fallback = { cropOffset: 0.5, sourceRoi: null, facecamRoi: null, gameplayRoi: null };
  let session;
  try {
    session = await faceSession();
  } catch {
    return fallback;
  }
  if (!session) return fallback;
  const size = await videoSize(videoPath);
  if (!size) return fallback;
  const [frameWidth, frameHeight] = size;
  const portrait = frameWidth / frameHeight <= 0.75;

  const samples = [];
  const blackRatios = [];
  for (const fraction of linspace(0.1, 0.9, sampleCount)) {
    const time = start + length * fraction;
    const frame = await grabLetterboxedFrame(videoPath, time, frameWidth, frameHeight, INPUT_SIZE);
    const detections = [];
    if (frame) {
      const gray = await grabGrayFrame(videoPath, time, frameWidth, frameHeight);
      if (gray) {
        const rowRatios = new Float64Array(frameHeight);
        for (let y = 0; y < frameHeight; y += 1) {
          let dark = 0;
          for (let x = 0; x < frameWidth; x += 1) if (gray[y * frameWidth + x] < 12) dark += 1;
          rowRatios[y] = dark / frameWidth;
        }
        blackRatios.push(rowRatios);
      }
      const factor = 1 / frame.scale;
      for (const [fx, fy, fw, fh] of await detectFaces(session, frame.data)) {
        const x = Math.trunc(fx);
        const y = Math.trunc(fy);
        const w = Math.trunc(fw);
        const h = Math.trunc(fh);
        const bx = Math.trunc((x - frame.padX) * factor);
        const by = Math.trunc((y - frame.padY) * factor);
        const bw = Math.trunc(w * factor);
        const bh = Math.trunc(h * factor);
        const box = [
          Math.max(0, bx), Math.max(0, by),
          Math.min(frameWidth, bx + bw) - Math.max(0, bx),
          Math.min(frameHeight, by + bh) - Math.max(0, by),
        ];
        if (box[2] <= 0 || box[3] <= 0) continue;
        const cx = box[0] + box[2] / 2;
        if (cx < frameWidth * 0.38 || cx > frameWidth * 0.62 || portrait) detections.push(box);
      }
    }
    samples.push(detections);
  }

  let activeBottom = frameHeight;
  if (blackRatios.length) {
    let row = frameHeight - 1;
    const avg = (y) => blackRatios.reduce((sum, ratios) => sum + ratios[y], 0) / blackRatios.length;
    while (row >= 0 && avg(row) >= 0.98) row -= 1;
    if (frameHeight - 1 - row >= frameHeight * 0.03) activeBottom = row + 1;
  }
  const sourceRoi = chooseVerticalGameRoi(frameWidth, frameHeight, samples, activeBottom);
  const [facecamRoi, gameplayRoi] = chooseStackRois(frameWidth, frameHeight, samples, sourceRoi);
  return {
    cropOffset: chooseCropOffset(frameWidth, frameHeight, samples),
    sourceRoi,
    facecamRoi,
    gameplayRoi,
  };
}
