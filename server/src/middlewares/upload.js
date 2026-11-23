import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { UPLOAD_DIR } from "../config/paths.js";
import { ApiError } from "../utils/ApiError.js";

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".ts", ".m4v", ".avi", ".flv"]);
const SUBTITLE_EXT = new Set([".srt"]);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = file.fieldname === "captions" ? SUBTITLE_EXT : VIDEO_EXT;
  if (!allowed.has(ext)) {
    cb(ApiError.badRequest(`${file.fieldname}: unsupported file type ${ext || "(none)"}`));
    return;
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 ** 3, files: 3 },
});
