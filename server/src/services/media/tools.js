import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { env } from "../../config/env.js";
import { BIN_DIR } from "../../config/paths.js";

const exe = process.platform === "win32" ? ".exe" : "";

/** Resolve tool binaries: explicit env path > bundled npm binary > bin/ folder > PATH. */
export function ffmpegPath() {
  return env.ffmpegPath || ffmpegStatic || "ffmpeg";
}

export function ffprobePath() {
  return env.ffprobePath || ffprobeStatic?.path || "ffprobe";
}

export function ytdlpPath() {
  if (env.ytdlpPath) return env.ytdlpPath;
  const local = path.join(BIN_DIR, `yt-dlp${exe}`);
  return fs.existsSync(local) ? local : "yt-dlp";
}

/** yt-dlp needs a JavaScript runtime for YouTube; it only looks for deno by default, so point it at Node. */
export function ytdlpArgs(...args) {
  return ["--js-runtimes", "node", ...args];
}
