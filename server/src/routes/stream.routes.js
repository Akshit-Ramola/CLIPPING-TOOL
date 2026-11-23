import { Router } from "express";
import { searchStreams } from "../controllers/streamController.js";
import { validate } from "../middlewares/validate.js";
import { findStreamsQuery } from "../middlewares/schemas.js";

const router = Router();

router.get("/search", validate(findStreamsQuery, "query"), searchStreams);

export default router;
