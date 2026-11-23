import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, "..", "..");
export const STORAGE_DIR = path.join(SERVER_ROOT, "storage");
export const OUTPUT_DIR = path.join(STORAGE_DIR, "output");
export const TEST_OUTPUT_DIR = path.join(STORAGE_DIR, "test_out");
export const WORK_DIR = path.join(STORAGE_DIR, "work");
export const UPLOAD_DIR = path.join(STORAGE_DIR, "uploads");
export const RENDER_DIR = path.join(STORAGE_DIR, "renders");
export const MODELS_DIR = path.join(SERVER_ROOT, "models");
export const BIN_DIR = path.join(SERVER_ROOT, "bin");

export const FACE_MODEL = path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx");
export const PERSON_MODEL = path.join(MODELS_DIR, "person_yolox_s_2022nov.onnx");

export function ensureStorageDirs() {
  for (const dir of [OUTPUT_DIR, TEST_OUTPUT_DIR, WORK_DIR, UPLOAD_DIR, RENDER_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Capture jobs cannot resume after a restart, so recording chunks left by a crash are useless.
 * Called once at startup, before any job runs.
 */
export function clearStaleWorkDirs() {
  for (const entry of fs.readdirSync(WORK_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("capture-")) {
      fs.rmSync(path.join(WORK_DIR, entry.name), { recursive: true, force: true });
    }
  }
}

/** Public URL path for a file stored under STORAGE_DIR (served at /media). */
export function mediaUrl(absolutePath) {
  const relative = path.relative(STORAGE_DIR, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return "/media/" + relative.split(path.sep).map(encodeURIComponent).join("/");
}
