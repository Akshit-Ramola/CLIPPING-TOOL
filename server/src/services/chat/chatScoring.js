const CHAT_REACTION = new RegExp(
  String.raw`\b(?:lol|lmao|rofl|wtf|omg|no way|clip it|insane|crazy|rip|bruh|` +
    String.raw`that was close|what just happened|holy (?:shit|crap))\b|😂|🤣|💀|😱|😮|` +
    String.raw`\b(?:lul|kekw|pog|poggers|monkas|omegalul)\b`,
  "iu",
);

export const reactionMatch = (message) => CHAT_REACTION.test(String(message ?? ""));

const normalizeText = (text) => String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const normalizeUser = (user) => String(user || "unknown").toLowerCase();

/** Robust burst/reaction signals per window; repeated spam from one chatter is deweighted. */
export function scoreChatWindows(messages, starts, clipLen) {
  const windows = starts.map((start) => {
    const selected = messages.filter((m) => start <= Number(m.t ?? -1) && Number(m.t ?? -1) < start + clipLen);
    const byUser = new Map();
    const buckets = new Map();
    for (const item of selected) {
      const user = normalizeUser(item.user);
      const text = normalizeText(item.text);
      if (!byUser.has(user)) byUser.set(user, new Set());
      byUser.get(user).add(text);
      const bucket = Math.floor((Number(item.t ?? start) - start) / 5);
      if (!buckets.has(bucket)) buckets.set(bucket, { users: new Set(), reactions: new Set() });
      const entry = buckets.get(bucket);
      entry.users.add(user);
      if (reactionMatch(text)) entry.reactions.add(user);
    }
    let reactions = 0;
    let distinctLines = 0;
    for (const texts of byUser.values()) {
      distinctLines += texts.size;
      if ([...texts].some(reactionMatch)) reactions += 1;
    }
    let peakBucket = 0;
    let peak = { users: new Set(), reactions: new Set() };
    let best = -1;
    for (const [bucket, entry] of buckets) {
      const weight = entry.users.size + 2 * entry.reactions.size;
      if (weight > best) {
        best = weight;
        peakBucket = bucket;
        peak = entry;
      }
    }
    return {
      start: Number(start),
      messages: selected.length,
      chatters: byUser.size,
      reactions,
      distinctLines,
      peakT: Number(start + peakBucket * 5 + 2.5),
      peakChatters: peak.users.size,
    };
  });

  const counts = windows.map((row) => Math.min(row.distinctLines, row.chatters * 3));
  if (!counts.length) return [];
  const ordered = [...counts].sort((a, b) => a - b);
  const median = ordered[ordered.length >> 1];
  const deviations = counts.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = Math.max(1, deviations[deviations.length >> 1]);
  return windows.map((row, i) => {
    const burst = Math.max(0, (counts[i] - median) / mad);
    const participation = Math.min(row.chatters, 16) / 16;
    const reactions = Math.min(row.reactions, 5) / 5;
    // A single spammer has little influence; a diverse reaction burst ranks higher.
    const signal = Math.min(2.5, burst * 0.55) + participation * 0.75 + reactions * 1.25;
    return { ...row, signal: Math.round(Math.min(4, signal) * 100) / 100 };
  });
}

export function summarizeChatWindow(messages, start, clipLen) {
  const selected = messages.filter((m) => start <= Number(m.t ?? -1) && Number(m.t ?? -1) < start + clipLen);
  const byUser = new Map();
  for (const item of selected) {
    const user = normalizeUser(item.user);
    if (!byUser.has(user)) byUser.set(user, new Set());
    byUser.get(user).add(normalizeText(item.text));
  }
  let reactionUsers = 0;
  for (const texts of byUser.values()) if ([...texts].some(reactionMatch)) reactionUsers += 1;
  return { messageCount: selected.length, uniqueChatters: byUser.size, reactionChatters: reactionUsers };
}
