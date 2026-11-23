import dotenv from "dotenv";
import path from "node:path";
import { SERVER_ROOT } from "./paths.js";

dotenv.config({ path: path.join(SERVER_ROOT, ".env") });

const str = (name, fallback = "") => (process.env[name] ?? fallback).toString().trim();

/**
 * Non-secret settings are read once here. Secrets (API keys, account IDs) are read
 * lazily through `secret()` so they are never copied into logs or responses.
 */
export const env = {
  port: Number(str("PORT", "5000")) || 5000,
  host: str("HOST", "127.0.0.1"),
  clientOrigin: str("CLIENT_ORIGIN", "http://localhost:5173"),
  mongoUri: str("MONGODB_URI", "mongodb://127.0.0.1:27017/gta-face-clipper"),
  ffmpegPath: str("FFMPEG_PATH"),
  ffprobePath: str("FFPROBE_PATH"),
  ytdlpPath: str("YTDLP_PATH"),
  whisperModel: str("WHISPER_MODEL", "onnx-community/whisper-base_timestamped"),
  whisperEnglishModel: str("WHISPER_EN_MODEL", "onnx-community/whisper-base_timestamped"),
  playerTracking: str("ENABLE_PLAYER_TRACKING", "1") !== "0",
};

export function secret(name) {
  return str(name);
}

export function hasSecret(name) {
  return Boolean(str(name));
}
