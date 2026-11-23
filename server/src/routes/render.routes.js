import { Router } from "express";
import { createRender, deleteRender, getRender, listRenders } from "../controllers/renderController.js";
import { validate } from "../middlewares/validate.js";
import { upload } from "../middlewares/upload.js";
import { listQuery } from "../middlewares/schemas.js";

const router = Router();

router.get("/", validate(listQuery, "query"), listRenders);
router.post(
  "/",
  upload.fields([{ name: "facecam", maxCount: 1 }, { name: "gameplay", maxCount: 1 }, { name: "captions", maxCount: 1 }]),
  createRender,
);
router.get("/:id", getRender);
router.delete("/:id", deleteRender);

export default router;
