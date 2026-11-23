import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { secret } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";

const API = "https://zernio.com/api/v1";
const PLATFORMS = [
  ["youtube", "ZERNIO_YOUTUBE_ACCOUNT_ID"],
  ["instagram", "ZERNIO_INSTAGRAM_ACCOUNT_ID"],
];

/** Convert an ISO time with offset to local IST wall time ("YYYY-MM-DDTHH:MM:SS"), as Zernio expects. */
export function scheduledLocalTime(value) {
  if (!/([+-]\d{2}:?\d{2}|Z)$/i.test(String(value).trim())) {
    throw ApiError.badRequest("schedule time must include a timezone offset, e.g. 2026-11-18T12:00:00+05:30");
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) throw ApiError.badRequest("schedule time is not a valid ISO date");
  const ist = new Date(when.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 19);
}

export function configuredAccounts() {
  return PLATFORMS.map(([platform, variable]) => [platform, secret(variable)]).filter(([, id]) => id);
}

function validateMetadata(clip) {
  if (!clip.title || !clip.youtubeDescription || !clip.instagramCaption) {
    throw ApiError.badRequest("metadata needs a title, YouTube description, and Instagram caption");
  }
  if (clip.test) throw ApiError.badRequest("test clips cannot be published");
}

function postBody(clip, publicUrl, accounts, schedule) {
  const platforms = accounts.map(([platform, accountId]) => {
    const entry = { platform, accountId };
    if (platform === "youtube") {
      entry.customContent = clip.youtubeDescription;
      entry.platformSpecificData = { title: clip.title.slice(0, 100), visibility: "public", categoryId: "20", madeForKids: false };
    } else {
      entry.customContent = clip.instagramCaption;
    }
    return entry;
  });
  const body = {
    content: clip.instagramCaption,
    mediaItems: [{ url: publicUrl, type: "video" }],
    platforms,
    timezone: "Asia/Kolkata",
  };
  if (schedule === "now") body.publishNow = true;
  else body.scheduledFor = schedule;
  return body;
}

/**
 * Validate every publishing gate (same rules as zernio_publish.py) and return the plan.
 * With publish=false this is the dry run; nothing is sent.
 */
export function planPublish(clip, { scheduledFor, now = false, publish = false, unattended = false }) {
  validateMetadata(clip);
  if (now && scheduledFor) throw ApiError.badRequest("Use either now or scheduledFor, not both.");
  const schedule = now ? "now" : scheduledFor ? scheduledLocalTime(scheduledFor) : null;
  if (unattended && now) throw ApiError.badRequest("Unattended mode only schedules future posts; it cannot publish immediately.");
  if (publish && !schedule) throw ApiError.badRequest("Choose a scheduled time or 'now' before publishing.");
  if (clip.zernio?.postId) {
    throw ApiError.conflict(`This clip already has a Zernio post ID (${clip.zernio.postId}); check its status before retrying.`);
  }
  if (!clip.approved && !unattended) {
    throw ApiError.badRequest("Clip metadata is not approved. Review and approve it, or configure unattended posting.");
  }
  if (unattended && secret("GTA_UNATTENDED_POSTS") !== "1") {
    throw ApiError.badRequest("Set GTA_UNATTENDED_POSTS=1 in server/.env to enable unattended publishing.");
  }
  const accounts = configuredAccounts();
  if (publish && !accounts.length) {
    throw ApiError.badRequest("Set ZERNIO_YOUTUBE_ACCOUNT_ID and/or ZERNIO_INSTAGRAM_ACCOUNT_ID in server/.env.");
  }
  if (publish && !secret("ZERNIO_API_KEY")) {
    throw ApiError.badRequest("Set ZERNIO_API_KEY in server/.env. Do not put it in a prompt or source file.");
  }
  const destinations = accounts.map(([p]) => p).join(", ") || "YouTube + Instagram (account IDs not configured)";
  return { schedule, accounts, plan: `${clip.name}: ${schedule || "DRY RUN — no schedule sent"} -> ${destinations}` };
}

async function zernioFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new ApiError(502, `Zernio returned HTTP ${response.status}. Check the Zernio dashboard before retrying.`);
  return response;
}

/** Upload the MP4 and create the scheduled post. Persists the idempotency key before posting. */
export async function uploadAndSchedule(clip, { schedule, accounts }) {
  const apiKey = secret("ZERNIO_API_KEY");
  const headers = { Authorization: `Bearer ${apiKey}` };
  const size = fs.statSync(clip.videoPath).size;
  try {
    const presign = await zernioFetch(`${API}/media/presign`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ filename: path.basename(clip.videoPath), contentType: "video/mp4", size }),
      signal: AbortSignal.timeout(60_000),
    });
    const upload = await presign.json();
    await zernioFetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
      body: fs.createReadStream(clip.videoPath),
      duplex: "half",
      signal: AbortSignal.timeout(900_000),
    });

    clip.zernio = clip.zernio || {};
    clip.zernio.idempotencyKey ||= crypto.randomUUID();
    await clip.save();

    const response = await zernioFetch(`${API}/posts`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": clip.zernio.idempotencyKey },
      body: JSON.stringify(postBody(clip, upload.publicUrl, accounts, schedule)),
      signal: AbortSignal.timeout(300_000),
    });
    const post = (await response.json())?.post || {};
    if (!post._id) throw new ApiError(502, "Zernio did not return a post ID; check the Zernio dashboard before retrying");
    clip.zernio.postId = post._id;
    clip.zernio.status = post.status || "accepted";
    clip.zernio.scheduledFor = post.scheduledFor || schedule;
    await clip.save();
    return post;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, `Zernio request failed (${error.name}). Check the Zernio dashboard before retrying.`);
  }
}
