import { Router } from "express";
import { deleteClip, getClip, listClips, publishClip, updateClip } from "../controllers/clipController.js";
import { validate } from "../middlewares/validate.js";
import { listQuery, publishClipBody, updateClipBody } from "../middlewares/schemas.js";

const router = Router();

router.get("/", validate(listQuery, "query"), listClips);
router.get("/:id", getClip);
router.patch("/:id", validate(updateClipBody), updateClip);
router.delete("/:id", deleteClip);
router.post("/:id/publish", validate(publishClipBody), publishClip);

export default router;
