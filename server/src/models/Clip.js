import mongoose from "mongoose";

/**
 * A rendered highlight clip. This document replaces the JSON metadata file the
 * original tool wrote next to each MP4.
 */
const clipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "CaptureJob", index: true },
    videoPath: { type: String, required: true },
    videoUrl: { type: String, required: true },
    channel: { type: String, default: "gta" },
    sourceUrl: String,
    streamer: String,
    credit: String,
    streamTitle: String,
    score: Number,
    clipStart: Number,
    clipLength: Number,
    transcript: { type: String, default: "" },
    spokenLanguage: { type: String, default: "unknown" },
    captionLanguage: { type: String, default: "English" },
    captionFallbackReason: String,
    captionPosition: String,
    framing: String,
    facecamRoi: { type: [Number], default: undefined },
    gameplayRoi: { type: [Number], default: undefined },
    sourceRoi: { type: [Number], default: undefined },
    cropOffset: Number,
    playerTrack: { type: [[Number]], default: undefined },
    gameplayConfirmed: Boolean,
    momentSourceRequested: String,
    momentSourceUsed: String,
    selectionSignals: { type: [String], default: [] },
    liveChatSource: String,
    liveChatStatus: String,
    chatFallbackReason: String,
    chatMessageCount: { type: Number, default: 0 },
    uniqueChatters: { type: Number, default: 0 },
    reactionChatters: { type: Number, default: 0 },

    // Publishing metadata, filled in by a reviewer.
    title: { type: String, default: null },
    youtubeDescription: { type: String, default: null },
    instagramCaption: { type: String, default: null },
    hashtags: { type: [String], default: [] },
    postAt: { type: Date, default: null },
    approved: { type: Boolean, default: false, index: true },
    test: { type: Boolean, default: false },

    zernio: {
      idempotencyKey: String,
      postId: String,
      status: String,
      scheduledFor: String,
    },
  },
  { timestamps: true },
);

export const Clip = mongoose.model("Clip", clipSchema);
