import fs from "node:fs";
import { Clip } from "../models/Clip.js";
import { ApiError } from "../utils/ApiError.js";
import { planPublish, uploadAndSchedule } from "../services/publish/zernio.service.js";

export async function listClips(req, res) {
  const { page, limit, approved, test, job } = req.validatedQuery;
  const filter = {};
  if (approved) filter.approved = approved === "true";
  if (test) filter.test = test === "true";
  if (job) filter.job = job;
  const [items, total] = await Promise.all([
    Clip.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Clip.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
}

export async function getClip(req, res) {
  const clip = await Clip.findById(req.params.id).lean();
  if (!clip) throw ApiError.notFound("Clip not found");
  res.json({ clip });
}

export async function updateClip(req, res) {
  const clip = await Clip.findById(req.params.id);
  if (!clip) throw ApiError.notFound("Clip not found");
  if (clip.zernio?.postId) throw ApiError.conflict("This clip was already sent to Zernio; edit it in the Zernio dashboard.");
  Object.assign(clip, req.body);
  await clip.save();
  res.json({ clip });
}

export async function deleteClip(req, res) {
  const clip = await Clip.findById(req.params.id);
  if (!clip) throw ApiError.notFound("Clip not found");
  fs.rmSync(clip.videoPath, { force: true });
  await clip.deleteOne();
  res.json({ ok: true });
}

/** Dry run by default; `publish: true` uploads to Zernio and schedules the post. */
export async function publishClip(req, res) {
  const clip = await Clip.findById(req.params.id);
  if (!clip) throw ApiError.notFound("Clip not found");
  if (!fs.existsSync(clip.videoPath)) throw ApiError.notFound("The clip's MP4 file is missing on disk.");
  const plan = planPublish(clip, req.body);
  if (!req.body.publish) {
    res.json({ dryRun: true, plan: plan.plan, message: "No post sent. Publish to schedule this clip." });
    return;
  }
  const post = await uploadAndSchedule(clip, plan);
  res.json({ dryRun: false, plan: plan.plan, message: `Zernio accepted post ${post._id} with status ${post.status || "accepted"}.`, clip });
}
