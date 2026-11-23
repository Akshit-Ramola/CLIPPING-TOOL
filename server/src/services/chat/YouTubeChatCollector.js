import { LiveChatCollector } from "./LiveChatCollector.js";

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeChatCollector extends LiveChatCollector {
  constructor(videoId, apiKey) {
    super();
    this.videoId = videoId;
    this.apiKey = apiKey;
  }

  wait(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.onStop = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async getJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const error = new Error(`YouTube API HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async run() {
    const params = new URLSearchParams({ part: "liveStreamingDetails", id: this.videoId, key: this.apiKey });
    const details = await this.getJson(`${API}/videos?${params}`);
    const liveChatId = details.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!liveChatId) {
      this.status = "unavailable";
      this.error = "no active YouTube live chat";
      return;
    }
    let pageToken = null;
    this.status = "connected";
    while (!this.stopped) {
      const query = new URLSearchParams({
        part: "snippet,authorDetails", liveChatId, maxResults: "200", key: this.apiKey,
      });
      if (pageToken) query.set("pageToken", pageToken);
      let data;
      try {
        data = await this.getJson(`${API}/liveChat/messages?${query}`);
      } catch (error) {
        this.status = "unavailable";
        this.error = error.status ? `YouTube API HTTP ${error.status}` : error.name;
        return;
      }
      for (const item of data.items || []) {
        const snippet = item.snippet || {};
        const author = item.authorDetails || {};
        const parsed = Date.parse(snippet.publishedAt);
        const epoch = Number.isFinite(parsed) ? parsed / 1000 : Date.now() / 1000;
        const text = snippet.textMessageDetails?.messageText || snippet.displayMessage || "";
        this.add(epoch, author.channelId || author.displayName, text, item.id);
      }
      pageToken = data.nextPageToken;
      const waitSeconds = Math.max(1, Number(data.pollingIntervalMillis ?? 5000) / 1000);
      await this.wait(waitSeconds * 1000);
    }
  }
}
