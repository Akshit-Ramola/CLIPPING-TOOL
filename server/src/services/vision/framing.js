/**
 * Pure geometry for choosing crops. Boxes are [x, y, w, h] in source pixels;
 * faceSamples is an array (one entry per sampled frame) of detected face boxes.
 */
import { median } from "../../utils/math.js";

const center = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

/** Crop offset (0..1) that centres the usual over-the-shoulder GTA player position. */
export function gameplayCropOffset(frameWidth, frameHeight, playerX = null) {
  if (frameWidth <= 0 || frameHeight <= 0) return 0.5;
  const cropWidth = (frameHeight * 9) / 16;
  const available = frameWidth - cropWidth;
  if (available <= 0) return 0.5;
  const px = playerX ?? frameWidth * 0.38;
  return Math.min(1, Math.max(0, (px - cropWidth / 2) / available));
}

/**
 * Centre the 9:16 crop on the usual GTA third-person player anchor. Only shift further when a
 * persistent facecam overlay overlaps that crop. Faces in the gameplay (NPCs, cutscenes) never move it.
 */
export function chooseCropOffset(frameWidth, frameHeight, faceSamples) {
  if (frameWidth <= 0 || frameHeight <= 0) return 0.5;
  const cropWidth = (frameHeight * 9) / 16;
  const available = frameWidth - cropWidth;
  if (available <= 0) return 0.5;
  const threshold = Math.max(3, Math.ceil(faceSamples.length * 0.3));
  const small = faceSamples.flat().filter((b) => b.length >= 4 && b[2] > 0 && b[2] < frameWidth * 0.12 && b[3] > 0 && b[3] < frameHeight * 0.22);
  if (small.length < threshold) return 0.5;
  const cx = small.map((b) => center(b)[0]);
  const cy = small.map((b) => center(b)[1]);
  const mx = median(cx);
  const my = median(cy);
  const stable = cx.every((x, i) => Math.abs(x - mx) <= frameWidth * 0.04 && Math.abs(cy[i] - my) <= frameHeight * 0.06);
  if (!stable || (frameHeight * 0.25 <= my && my <= frameHeight * 0.75)) return 0.5;
  const base = gameplayCropOffset(frameWidth, frameHeight);
  // The webcam box is roughly 3x the detected face; does it reach into the player-centred crop?
  const halfCam = 1.5 * median(small.map((b) => b[2]));
  const camL = mx - halfCam;
  const camR = mx + halfCam;
  const left = available * base;
  const right = left + cropWidth;
  if (camR <= left || camL >= right) return base;
  const playerX = frameWidth * 0.38;
  const x0 = mx < playerX ? camR : camL - cropWidth; // slide just clear of the cam
  return Math.min(1, Math.max(0, x0 / available));
}

/** Find gameplay below/above a persistent facecam in stacked portrait streams. */
export function chooseVerticalGameRoi(frameWidth, frameHeight, faceSamples, activeBottom = null) {
  if (frameWidth <= 0 || frameHeight <= 0 || frameWidth / frameHeight > 0.75) return null;
  const topFrames = [];
  const bottomFrames = [];
  for (const detections of faceSamples) {
    const top = detections.filter((b) => b[1] + b[3] / 2 < frameHeight * 0.3);
    const bottom = detections.filter((b) => b[1] + b[3] / 2 > frameHeight * 0.7);
    if (top.length) topFrames.push(top);
    if (bottom.length) bottomFrames.push(bottom);
  }
  const threshold = Math.max(3, Math.ceil(faceSamples.length * 0.3));
  let y0;
  let y1;
  if (topFrames.length >= threshold && bottomFrames.length < threshold) {
    const faceBottom = Math.max(...topFrames.flat().map((b) => b[1] + b[3]));
    y0 = Math.max(Math.trunc(frameHeight * 0.14), Math.trunc(faceBottom + frameHeight * 0.05));
    y1 = activeBottom && activeBottom <= frameHeight ? activeBottom : frameHeight;
  } else if (bottomFrames.length >= threshold && topFrames.length < threshold) {
    const faceTop = Math.min(...bottomFrames.flat().map((b) => b[1]));
    y0 = 0;
    y1 = Math.min(Math.trunc(frameHeight * 0.86), Math.trunc(faceTop - frameHeight * 0.05));
  } else {
    return null;
  }
  if (y1 - y0 < frameHeight * 0.3) return null;
  return [0, y0, frameWidth, y1 - y0];
}

/**
 * Estimate a stable corner facecam panel from repeated small-face detections. Deliberately
 * conservative: uncertain or moving in-game faces return null so stacked rendering is skipped.
 */
export function chooseFacecamRoi(frameWidth, frameHeight, faceSamples, targetAspect = 1080 / 760) {
  if (frameWidth <= 0 || frameHeight <= 0 || !faceSamples.length) return null;
  const threshold = Math.max(3, Math.ceil(faceSamples.length * 0.3));
  const candidates = faceSamples.flat().filter((b) => {
    const cx = b[0] + b[2] / 2;
    return b.length >= 4 && b[2] > 0 && b[2] < frameWidth * 0.12 && b[3] > 0 && b[3] < frameHeight * 0.22
      && (cx < frameWidth * 0.38 || cx > frameWidth * 0.62);
  });
  if (candidates.length < threshold) return null;
  const mx = median(candidates.map((b) => center(b)[0]));
  const my = median(candidates.map((b) => center(b)[1]));
  const near = candidates.filter((b) => Math.abs(center(b)[0] - mx) <= frameWidth * 0.035 && Math.abs(center(b)[1] - my) <= frameHeight * 0.05);
  if (near.length < threshold) return null;
  // A persistent small face at a horizontal edge is a common streamer inset. A centred gameplay face is not.
  if (frameWidth * 0.25 <= mx && mx <= frameWidth * 0.75 && frameHeight * 0.25 <= my && my <= frameHeight * 0.75) return null;
  const faceW = median(near.map((b) => b[2]));
  const faceH = median(near.map((b) => b[3]));
  let height = Math.min(frameHeight, Math.max(faceH * 2.8, faceW * targetAspect * 1.15));
  const width = Math.min(frameWidth, height * targetAspect * 1.15);
  height = width / targetAspect;
  const centerY = my + faceH * 0.15;
  const x = Math.round(Math.min(Math.max(0, mx - width / 2), frameWidth - width));
  const y = Math.round(Math.min(Math.max(0, centerY - height / 2), frameHeight - height));
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < frameWidth * 0.12 || h < frameHeight * 0.1) return null;
  return [x, y, w, h];
}

/** Return [facecam, gameplay] crops for a no-gap stacked vertical composition (either may be null). */
export function chooseStackRois(frameWidth, frameHeight, faceSamples, sourceGameRoi = null, cameraOverride = null) {
  if (sourceGameRoi) {
    const [, gy] = sourceGameRoi;
    if (gy > frameHeight * 0.3) return [[0, 0, frameWidth, gy], sourceGameRoi];
  }
  const camera = cameraOverride || chooseFacecamRoi(frameWidth, frameHeight, faceSamples);
  if (!camera) return [null, null];
  const [x, y, w, h] = camera;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > frameWidth || y + h > frameHeight) return [null, null];
  // Remove the webcam overlay, then keep the original gameplay centre as close as the safe region allows.
  let sideCamera = true;
  let game;
  if (x + w <= frameWidth * 0.45) game = [x + w, 0, frameWidth - x - w, frameHeight];
  else if (x >= frameWidth * 0.55) game = [0, 0, x, frameHeight];
  else if (y + h <= frameHeight * 0.45) {
    sideCamera = false;
    game = [0, y + h, frameWidth, frameHeight - y - h];
  } else if (y >= frameHeight * 0.55) {
    sideCamera = false;
    game = [0, 0, frameWidth, y];
  } else return [null, null];
  if (game[2] < frameWidth * 0.35 || game[3] < frameHeight * 0.35) return [null, null];
  if (sideCamera) {
    const [gx, top, safeWidth, height] = game;
    // The lower panel is 1080 x 1160. Preselect its horizontal window so FFmpeg
    // does not centre it on the webcam-free strip.
    const left = Math.ceil(gx / 2) * 2;
    const right = Math.floor((gx + safeWidth) / 2) * 2;
    const width = Math.min(right - left, Math.ceil((height * 1080) / 1160 / 2) * 2);
    const cx = Math.round((frameWidth - width) / 4) * 2;
    game = [Math.min(Math.max(cx, left), right - width), top, width, height];
  }
  return [camera, game];
}
