// Prints which external tools the server will use and whether they work.
import fs from "node:fs";
import { ffmpegPath, ffprobePath, ytdlpPath } from "../src/services/media/tools.js";
import { run } from "../src/services/media/process.js";
import { FACE_MODEL } from "../src/config/paths.js";

const checks = [
  ["ffmpeg", ffmpegPath(), ["-hide_banner", "-version"]],
  ["ffprobe", ffprobePath(), ["-hide_banner", "-version"]],
  ["yt-dlp", ytdlpPath(), ["--version"]],
];
let ok = true;
for (const [name, bin, args] of checks) {
  const r = await run(bin, args, { timeoutMs: 20_000 });
  const line = (r.stdout || r.stderr).split("\n")[0].trim();
  console.log(`${r.code === 0 ? "OK  " : "MISSING"} ${name.padEnd(8)} ${bin}${r.code === 0 ? `  (${line})` : ""}`);
  if (r.code !== 0) ok = false;
}
const ff = await run(ffmpegPath(), ["-hide_banner", "-filters"]);
const hasAss = / ass /.test(ff.stdout);
console.log(`${hasAss ? "OK  " : "MISSING"} libass   (needed for burned-in captions)`);
console.log(`${fs.existsSync(FACE_MODEL) ? "OK  " : "MISSING"} face model ${FACE_MODEL}`);
if (!ok || !hasAss) {
  console.log("\nRun `npm run setup:ytdlp` for yt-dlp, or set FFMPEG_PATH / FFPROBE_PATH / YTDLP_PATH in server/.env.");
  process.exitCode = 1;
}
