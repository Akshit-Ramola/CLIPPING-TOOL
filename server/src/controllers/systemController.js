import fs from "node:fs";
import mongoose from "mongoose";
import { hasSecret } from "../config/env.js";
import { FACE_MODEL, PERSON_MODEL } from "../config/paths.js";
import { ffmpegPath, ytdlpPath } from "../services/media/tools.js";
import { run } from "../services/media/process.js";
import { configuredAccounts } from "../services/publish/zernio.service.js";

/** GET /api/system/status — readiness of tools and which integrations are configured (never the secrets). */
export async function systemStatus(_req, res) {
  const [ffmpeg, ytdlp] = await Promise.all([
    run(ffmpegPath(), ["-hide_banner", "-version"], { timeoutMs: 15_000 }),
    run(ytdlpPath(), ["--version"], { timeoutMs: 15_000 }),
  ]);
  res.json({
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    tools: {
      ffmpeg: ffmpeg.code === 0 ? ffmpeg.stdout.split("\n")[0] : null,
      ytdlp: ytdlp.code === 0 ? ytdlp.stdout.trim() : null,
      faceModel: fs.existsSync(FACE_MODEL),
      personModel: fs.existsSync(PERSON_MODEL),
    },
    integrations: {
      youtubeApi: hasSecret("YOUTUBE_API_KEY"),
      twitchChat: hasSecret("TWITCH_CHAT_USERNAME") && hasSecret("TWITCH_CHAT_TOKEN"),
      zernio: hasSecret("ZERNIO_API_KEY"),
      zernioAccounts: configuredAccounts().map(([platform]) => platform),
      unattendedPosts: process.env.GTA_UNATTENDED_POSTS === "1",
    },
  });
}
