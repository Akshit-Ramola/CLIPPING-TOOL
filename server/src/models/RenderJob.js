import mongoose from "mongoose";

/** A manual facecam + gameplay (+ SRT) render. Replaces `gta-face-clipper render`. */
const renderJobSchema = new mongoose.Schema(
  {
    facecamPath: { type: String, required: true },
    gameplayPath: { type: String, required: true },
    captionsPath: String,
    facecamName: String,
    gameplayName: String,
    captionsName: String,
    options: {
      style: { type: String, enum: ["bold", "clean", "neon"], default: "bold" },
      fps: { type: Number, enum: [30, 60], default: 30 },
      streamerVolume: { type: Number, min: 0, max: 2, default: 1 },
      gameplayVolume: { type: Number, min: 0, max: 2, default: 1 },
    },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "interrupted"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, default: 0 },
    message: { type: String, default: "Queued" },
    outputPath: String,
    outputUrl: String,
    outputBytes: Number,
    error: String,
    finishedAt: Date,
  },
  { timestamps: true },
);

export const RenderJob = mongoose.model("RenderJob", renderJobSchema);
