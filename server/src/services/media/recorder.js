import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ffmpegPath } from "./tools.js";
import { streamUrls } from "./ytdlp.js";

/**
 * Start FFmpeg writing the source into fixed-length MPEG-TS chunks (chunk_00000.ts, ...).
 * Returns the child process; `exitCode !== null` means recording has finished.
 */
export async function startRecorder({ url, file, chunk, maxSeconds, outdir }) {
  fs.mkdirSync(outdir, { recursive: true });
  const pattern = path.join(outdir, "chunk_%05d.ts");
  let clockOptions = [];
  let inputs;
  if (file) {
    inputs = ["-i", file];
  } else {
    const lines = await streamUrls(url);
    inputs = ["-i", lines[0]];
    if (lines.length > 1) {
      // Separate live renditions from the same broadcast share a clock.
      // Keep their start-time difference instead of zeroing both feeds.
      clockOptions = ["-copyts", "-start_at_zero"];
      inputs.push("-isync", "0", "-i", lines[1]);
    }
  }
  const maps = clockOptions.length ? ["-map", "0:v:0", "-map", "1:a:0"] : ["-map", "0:v:0", "-map", "0:a:0?"];
  const duration = maxSeconds > 0 ? ["-t", String(maxSeconds)] : [];
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", ...clockOptions, ...inputs, ...duration,
    ...maps, "-c", "copy", "-f", "segment", "-segment_time", String(chunk),
    "-reset_timestamps", "1", pattern,
  ];
  const child = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  child.stderrTail = "";
  child.stderr.on("data", (data) => {
    child.stderrTail = (child.stderrTail + data.toString()).slice(-2000);
  });
  child.finished = new Promise((resolve) => child.on("close", resolve));
  return child;
}

export function isRunning(child) {
  return child && child.exitCode === null && child.signalCode === null;
}

/** Ask FFmpeg to finish cleanly ("q"), then force-kill if it does not exit in time. */
export async function stopRecorder(child, timeoutMs = 10_000) {
  if (!isRunning(child)) return;
  try {
    child.stdin.write("q");
  } catch {
    child.kill();
  }
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  await child.finished;
  clearTimeout(timer);
}
