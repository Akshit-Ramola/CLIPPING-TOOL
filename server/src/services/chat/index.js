import { secret } from "../../config/env.js";
import { YouTubeChatCollector } from "./YouTubeChatCollector.js";
import { TwitchChatCollector } from "./TwitchChatCollector.js";

const YOUTUBE_VIDEO_RE = /(?:v=|youtu\.be\/|youtube\.com\/live\/)([A-Za-z0-9_-]{6,})/;

/** Returns { collector, source, fallbackReason } without exposing credentials. */
export function createLiveChatCollector(url, videoId = null) {
  let parsed;
  try {
    parsed = new URL(url || "");
  } catch {
    return { collector: null, source: "unsupported", fallbackReason: "invalid URL" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    const apiKey = secret("YOUTUBE_API_KEY");
    if (!apiKey) return { collector: null, source: "unavailable", fallbackReason: "YOUTUBE_API_KEY is not set" };
    const resolved = videoId || YOUTUBE_VIDEO_RE.exec(url)?.[1];
    if (!resolved) return { collector: null, source: "unavailable", fallbackReason: "could not read YouTube video ID" };
    return { collector: new YouTubeChatCollector(resolved, apiKey), source: "youtube-live-chat", fallbackReason: null };
  }
  if (host === "twitch.tv") {
    const channel = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const username = secret("TWITCH_CHAT_USERNAME");
    const token = secret("TWITCH_CHAT_TOKEN");
    if (!username || !token) {
      return { collector: null, source: "unavailable", fallbackReason: "TWITCH_CHAT_USERNAME and TWITCH_CHAT_TOKEN are not set" };
    }
    if (!channel) return { collector: null, source: "unavailable", fallbackReason: "could not read Twitch channel from URL" };
    return { collector: new TwitchChatCollector(channel, username, token), source: "twitch-chat", fallbackReason: null };
  }
  return { collector: null, source: "unsupported", fallbackReason: "this platform has no live-chat connector" };
}

export { scoreChatWindows, summarizeChatWindow, reactionMatch } from "./chatScoring.js";
