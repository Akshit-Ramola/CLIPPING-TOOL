// Downloads the official yt-dlp standalone binary into server/bin/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const binDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin");
const asset = { win32: "yt-dlp.exe", darwin: "yt-dlp_macos", linux: "yt-dlp_linux" }[process.platform] || "yt-dlp";
const target = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

fs.mkdirSync(binDir, { recursive: true });
console.log(`Downloading ${url}`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status}`);
  process.exit(1);
}
fs.writeFileSync(`${target}.part`, Buffer.from(await response.arrayBuffer()));
fs.renameSync(`${target}.part`, target);
if (process.platform !== "win32") fs.chmodSync(target, 0o755);
console.log(`Saved ${target}`);
