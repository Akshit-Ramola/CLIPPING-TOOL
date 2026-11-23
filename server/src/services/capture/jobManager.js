import { CaptureJob } from "../../models/CaptureJob.js";
import { RenderJob } from "../../models/RenderJob.js";
import { logger } from "../../utils/logger.js";
import { runCapture } from "./captureRunner.js";

/** In-process registry of running capture jobs so they can be stopped from the API. */
const running = new Map();

export function startCaptureJob(jobId) {
  const id = String(jobId);
  if (running.has(id)) return;
  const controller = new AbortController();
  const promise = runCapture(id, controller.signal)
    .catch((error) => logger.error(`capture ${id} crashed`, error))
    .finally(() => running.delete(id));
  running.set(id, { controller, promise });
}

export async function stopCaptureJob(jobId) {
  const id = String(jobId);
  const entry = running.get(id);
  if (!entry) return false;
  await CaptureJob.updateOne({ _id: id }, { $set: { status: "stopping" } });
  entry.controller.abort();
  return true;
}

export const isCaptureRunning = (jobId) => running.has(String(jobId));

/** Abort everything on shutdown and wait (bounded) for recorders to close. */
export async function stopAllCaptureJobs(timeoutMs = 15_000) {
  for (const { controller } of running.values()) controller.abort();
  await Promise.race([
    Promise.allSettled([...running.values()].map((e) => e.promise)),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Jobs left "running" by a crashed or restarted server can never resume; mark them clearly. */
export async function markInterruptedJobs() {
  const capture = await CaptureJob.updateMany(
    { status: { $in: ["queued", "running", "stopping"] } },
    { $set: { status: "interrupted", finishedAt: new Date(), error: "Server restarted while this job was running." } },
  );
  const render = await RenderJob.updateMany(
    { status: { $in: ["queued", "running"] } },
    { $set: { status: "interrupted", finishedAt: new Date(), error: "Server restarted while this render was running." } },
  );
  const total = capture.modifiedCount + render.modifiedCount;
  if (total) logger.warn(`marked ${total} unfinished job(s) as interrupted`);
}
