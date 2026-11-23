import { secret } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";

const API = "https://www.googleapis.com/youtube/v3/search";

const decodeEntities = (text) =>
  String(text || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/**
 * Current YouTube live streams for a query, in YouTube's viewCount search order.
 * This is a candidate list, not a dependable live concurrent-viewer leaderboard.
 */
export async function findStreams(query, limit = 25) {
  const apiKey = secret("YOUTUBE_API_KEY");
  if (!apiKey) throw new ApiError(400, "Set YOUTUBE_API_KEY in server/.env before searching.");
  const params = new URLSearchParams({
    part: "snippet", eventType: "live", type: "video", q: query,
    maxResults: String(Math.min(Math.max(limit, 1), 50)), order: "viewCount", key: apiKey,
  });
  let response;
  try {
    response = await fetch(`${API}?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new ApiError(502, `Stream search failed (${error.name}). Check the network and API key.`);
  }
  if (!response.ok) throw new ApiError(502, `YouTube API returned HTTP ${response.status}; check the API key and quota.`);
  const payload = await response.json();
  return (payload.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => {
      const s = item.snippet || {};
      return {
        videoId: item.id.videoId,
        title: decodeEntities(s.title),
        channel: s.channelTitle || "",
        channelId: s.channelId || "",
        publishedAt: s.publishedAt || null,
        thumbnail: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || null,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        rankSignal: "YouTube search order=viewCount; not current live viewers",
      };
    });
}
