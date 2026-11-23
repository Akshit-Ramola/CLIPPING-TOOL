import { Router } from "express";
import streamRoutes from "./stream.routes.js";
import jobRoutes from "./job.routes.js";
import clipRoutes from "./clip.routes.js";
import renderRoutes from "./render.routes.js";
import { systemStatus } from "../controllers/systemController.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));
router.get("/system/status", systemStatus);
router.use("/streams", streamRoutes);
router.use("/jobs", jobRoutes);
router.use("/clips", clipRoutes);
router.use("/renders", renderRoutes);

export default router;
