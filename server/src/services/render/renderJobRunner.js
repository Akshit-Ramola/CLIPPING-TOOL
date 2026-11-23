import fs from "node:fs";
import path from "node:path";
import { RenderJob } from "../../models/RenderJob.js";
import { RENDER_DIR, mediaUrl } from "../../config/paths.js";
import { analysisLock } from "../../utils/async.js";
import { logger } from "../../utils/logger.js";
import { renderStack } from "./stackRenderer.js";

/** Runs a manual facecam + gameplay render in the background and records progress on the job. */
export function startRenderJob(jobId) {
  run(String(jobId)).catch((error) => logger.error(`render ${jobId} crashed`, error));
}

async function run(id) {
  const job = await RenderJob.findById(id);
  if (!job) return;
  const output = path.join(RENDER_DIR, `short-${id}.mp4`);
  let lastWrite = 0;
  const onProgress = (progress, message) => {
    const now = Date.now();
    if (progress < 1 && now - lastWrite < 750) return; // throttle DB writes
    lastWrite = now;
    RenderJob.updateOne({ _id: id }, { $set: { progress, message } }).catch(() => {});
  };
  try {
    await RenderJob.updateOne({ _id: id }, { $set: { status: "running", message: "Reading inputs", progress: 0.05 } });
    const subtitleText = job.captionsPath ? fs.readFileSync(job.captionsPath, "utf8").replace(/^﻿/, "") : "";
    const result = await analysisLock.run(() => renderStack({
      facecam: job.facecamPath,
      gameplay: job.gameplayPath,
      output,
      subtitleText,
      style: job.options.style,
      fps: job.options.fps,
      streamerVolume: job.options.streamerVolume,
      gameplayVolume: job.options.gameplayVolume,
      onProgress,
    }));
    await RenderJob.updateOne({ _id: id }, {
      $set: {
        status: "completed", progress: 1, message: "Video ready", finishedAt: new Date(),
        outputPath: result.outputPath, outputUrl: mediaUrl(result.outputPath), outputBytes: result.bytes,
      },
    });
  } catch (error) {
    await RenderJob.updateOne({ _id: id }, {
      $set: { status: "failed", message: "Render failed", error: error.message || String(error), finishedAt: new Date() },
    });
  }
}
