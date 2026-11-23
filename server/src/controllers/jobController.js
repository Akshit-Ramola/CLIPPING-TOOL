import fs from "node:fs";
import { CaptureJob } from "../models/CaptureJob.js";
import { Clip } from "../models/Clip.js";
import { ApiError } from "../utils/ApiError.js";
import { createFileCaptureBody } from "../middlewares/schemas.js";
import { isCaptureRunning, startCaptureJob, stopCaptureJob } from "../services/capture/jobManager.js";

function normalizeOptions(options) {
  const o = { ...options };
  if (o.noChat) o.momentSource = "audio";
  delete o.noChat;
  if (!o.facecamRoi) delete o.facecamRoi;
  return o;
}

/** POST /api/jobs — capture from a live URL (or a URL in test mode). */
export async function createUrlJob(req, res) {
  const { url, test, options } = req.body;
  const job = await CaptureJob.create({ sourceType: "url", url, test, options: normalizeOptions(options) });
  startCaptureJob(job._id);
  res.status(201).json({ job });
}

/** POST /api/jobs/file — capture from an uploaded local video (always test mode, like --file --test). */
export async function createFileJob(req, res) {
  const file = req.file;
  if (!file) throw ApiError.badRequest("Upload a video in the 'video' field.");
  let parsed;
  try {
    parsed = createFileCaptureBody.safeParse(req.body);
  } catch {
    parsed = { success: false, error: { issues: [{ path: ["options"], message: "options must be valid JSON" }] } };
  }
  if (!parsed.success) {
    fs.rmSync(file.path, { force: true });
    const details = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message]));
    throw ApiError.badRequest("Invalid request", details);
  }
  const job = await CaptureJob.create({
    sourceType: "file",
    filePath: file.path,
    fileName: file.originalname,
    test: true,
    options: normalizeOptions(parsed.data.options),
  });
  startCaptureJob(job._id);
  res.status(201).json({ job });
}

export async function listJobs(req, res) {
  const { page, limit, status } = req.validatedQuery;
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    CaptureJob.find(filter).select("-logs").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CaptureJob.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
}

export async function getJob(req, res) {
  const job = await CaptureJob.findById(req.params.id).lean();
  if (!job) throw ApiError.notFound("Capture job not found");
  const clips = await Clip.find({ job: job._id }).sort({ createdAt: -1 }).lean();
  res.json({ job: { ...job, active: isCaptureRunning(job._id) }, clips });
}

export async function stopJob(req, res) {
  const job = await CaptureJob.findById(req.params.id);
  if (!job) throw ApiError.notFound("Capture job not found");
  const stopped = await stopCaptureJob(job._id);
  if (!stopped) throw ApiError.conflict(`Job is not running (status: ${job.status}).`);
  res.json({ ok: true, status: "stopping" });
}

export async function deleteJob(req, res) {
  const job = await CaptureJob.findById(req.params.id);
  if (!job) throw ApiError.notFound("Capture job not found");
  if (isCaptureRunning(job._id)) throw ApiError.conflict("Stop the job before deleting it.");
  if (job.sourceType === "file" && job.filePath) fs.rmSync(job.filePath, { force: true });
  await job.deleteOne();
  // Clips are kept: they are independent deliverables and may already be scheduled.
  res.json({ ok: true });
}
