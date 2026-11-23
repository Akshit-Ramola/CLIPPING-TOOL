import mongoose from "mongoose";

const MAX_LOG_LINES = 500;

const logSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    message: { type: String, required: true },
  },
  { _id: false },
);

/**
 * One live-stream (or local test file) capture session. Replaces a single run of
 * `gta-face-clipper live ...` from the original CLI.
 */
const captureJobSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ["url", "file"], required: true },
    url: { type: String, trim: true },
    filePath: { type: String },
    fileName: { type: String },
    test: { type: Boolean, default: false },

    options: {
      chunk: { type: Number, default: 90, min: 1 },
      maxSeconds: { type: Number, default: 0, min: 0 },
      clipLen: { type: Number, default: 30, min: 1 },
      leadIn: { type: Number, default: 6, min: 0 },
      top: { type: Number, default: 1, min: 1 },
      layout: { type: String, enum: ["stack", "fill", "fit"], default: "stack" },
      facecamRoi: { type: [Number], default: undefined },
      momentSource: { type: String, enum: ["chat", "combined", "audio"], default: "chat" },
      spokenLanguage: { type: String, enum: ["auto", "en", "hi"], default: "auto" },
      minScore: { type: Number, default: 2.5 },
      keepMinutes: { type: Number, default: 30, min: 1 },
      gameplayConfirmed: { type: Boolean, default: false },
    },

    status: {
      type: String,
      enum: ["queued", "running", "stopping", "completed", "failed", "stopped", "interrupted"],
      default: "queued",
      index: true,
    },
    source: {
      title: String,
      streamer: String,
      credit: String,
      channelId: String,
      videoId: String,
    },
    chat: {
      source: { type: String, default: "disabled" },
      status: { type: String, default: "unavailable" },
      fallbackReason: String,
    },
    chunksAnalysed: { type: Number, default: 0 },
    clipCount: { type: Number, default: 0 },
    outputDir: String,
    error: String,
    startedAt: Date,
    finishedAt: Date,
    logs: { type: [logSchema], default: [] },
  },
  { timestamps: true },
);

captureJobSchema.statics.appendLog = function appendLog(id, message, level = "info") {
  return this.updateOne(
    { _id: id },
    { $push: { logs: { $each: [{ message, level, at: new Date() }], $slice: -MAX_LOG_LINES } } },
  );
};

export const CaptureJob = mongoose.model("CaptureJob", captureJobSchema);
