import { run, tail } from "./process.js";
import { ytdlpArgs, ytdlpPath } from "./tools.js";

/** Read stream metadata without downloading (yt-dlp --dump-single-json). */
export async function streamInfo(url) {
  const r = await run(ytdlpPath(), ytdlpArgs("--dump-single-json", "--no-download", "--no-warnings", url), {
    timeoutMs: 120_000,
  });
  if (r.code) throw new Error("yt-dlp could not read that URL: " + tail(r.stderr));
  return JSON.parse(r.stdout);
}

/** Direct media URLs for a <=720p rendition (video + audio may come back as two URLs). */
export async function streamUrls(url) {
  const r = await run(
    ytdlpPath(),
    ytdlpArgs("-g", "--no-warnings", "-f", "bv[height<=720]+ba/b[height<=720]/b", url),
    { timeoutMs: 120_000 },
  );
  const lines = r.stdout.split(/\r?\n/).filter((line) => line.startsWith("http"));
  if (r.code || !lines.length) throw new Error("could not get a stream URL: " + tail(r.stderr));
  return lines;
}

export function sourceIdentity(info, test = false) {
  const name = info.uploader || info.channel || "local source";
  return {
    name,
    credit: info.uploader || info.channel || null,
    channelId: info.channel_id || null,
    test: Boolean(test),
  };
}
