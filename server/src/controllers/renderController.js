import fs from "node:fs";
import { RenderJob } from "../models/RenderJob.js";
import { ApiError } from "../utils/ApiError.js";
import { renderBody } from "../middlewares/schemas.js";
import { startRenderJob } from "../services/render/renderJobRunner.js";

const removeUploads = (files) => {
  for (const list of Object.values(files || {})) for (const f of list) fs.rmSync(f.path, { force: true });
};

export async function createRender(req, res) {
  const facecam = req.files?.facecam?.[0];
  const gameplay = req.files?.gameplay?.[0];
  const captions = req.files?.captions?.[0];
  if (!facecam || !gameplay) {
    removeUploads(req.files);
    throw ApiError.badRequest("Both a facecam video and a gameplay video are required.");
  }
  const parsed = renderBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    removeUploads(req.files);
    const details = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message]));
    throw ApiError.badRequest("Invalid request", details);
  }
  const job = await RenderJob.create({
    facecamPath: facecam.path,
    gameplayPath: gameplay.path,
    captionsPath: captions?.path,
    facecamName: facecam.originalname,
    gameplayName: gameplay.originalname,
    captionsName: captions?.originalname,
    options: parsed.data,
  });
  startRenderJob(job._id);
  res.status(201).json({ render: job });
}

export async function listRenders(req, res) {
  const { page, limit } = req.validatedQuery;
  const [items, total] = await Promise.all([
    RenderJob.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    RenderJob.countDocuments(),
  ]);
  res.json({ items, total, page, limit });
}

export async function getRender(req, res) {
  const render = await RenderJob.findById(req.params.id).lean();
  if (!render) throw ApiError.notFound("Render not found");
  res.json({ render });
}

export async function deleteRender(req, res) {
  const render = await RenderJob.findById(req.params.id);
  if (!render) throw ApiError.notFound("Render not found");
  if (render.status === "running" || render.status === "queued") throw ApiError.conflict("Wait for the render to finish.");
  for (const file of [render.facecamPath, render.gameplayPath, render.captionsPath, render.outputPath]) {
    if (file) fs.rmSync(file, { force: true });
  }
  await render.deleteOne();
  res.json({ ok: true });
}
