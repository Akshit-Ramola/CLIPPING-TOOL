import { Router } from "express";
import { createFileJob, createUrlJob, deleteJob, getJob, listJobs, stopJob } from "../controllers/jobController.js";
import { validate } from "../middlewares/validate.js";
import { upload } from "../middlewares/upload.js";
import { createCaptureBody, listQuery } from "../middlewares/schemas.js";

const router = Router();

router.get("/", validate(listQuery, "query"), listJobs);
router.post("/", validate(createCaptureBody), createUrlJob);
router.post("/file", upload.single("video"), createFileJob);
router.get("/:id", getJob);
router.post("/:id/stop", stopJob);
router.delete("/:id", deleteJob);

export default router;
