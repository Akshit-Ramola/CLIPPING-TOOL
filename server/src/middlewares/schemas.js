import { z } from "zod";

const boolish = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
const evenInt = z.coerce.number().int().refine((n) => n % 2 === 0, "must be an even number");

export const findStreamsQuery = z.object({
  q: z.string().trim().min(1).max(200).default("GTA 6"),
  max: z.coerce.number().int().min(1).max(50).default(25),
});

const captureOptions = z.object({
  chunk: z.coerce.number().int().min(10).max(3600).default(90),
  maxSeconds: z.coerce.number().int().min(0).default(0),
  clipLen: z.coerce.number().int().min(1).max(600).default(30),
  leadIn: z.coerce.number().min(0).max(120).default(6),
  top: z.coerce.number().int().min(1).max(10).default(1),
  layout: z.enum(["stack", "fill", "fit"]).default("stack"),
  facecamRoi: z.union([
    z.tuple([evenInt.refine((n) => n >= 0), evenInt.refine((n) => n >= 0), evenInt.refine((n) => n >= 2), evenInt.refine((n) => n >= 2)]),
    z.null(),
  ]).optional(),
  momentSource: z.enum(["chat", "combined", "audio"]).default("chat"),
  noChat: boolish.optional(),
  spokenLanguage: z.enum(["auto", "en", "hi"]).default("auto"),
  minScore: z.coerce.number().default(2.5),
  keepMinutes: z.coerce.number().int().min(1).default(30),
  gameplayConfirmed: boolish.default(false),
});

/** JSON body for a live URL capture. */
export const createCaptureBody = z.object({
  url: z.string().trim().url(),
  test: boolish.default(false),
  options: captureOptions.default({}),
}).superRefine((value, ctx) => {
  const o = value.options;
  if (o.facecamRoi && o.layout !== "stack") {
    ctx.addIssue({ code: "custom", path: ["options", "facecamRoi"], message: "facecamRoi requires the stack layout" });
  }
  if (!value.test && !o.gameplayConfirmed) {
    ctx.addIssue({
      code: "custom",
      path: ["options", "gameplayConfirmed"],
      message: "First inspect the source and confirm actual GTA gameplay is visible. A GTA title or facecam alone is not gameplay.",
    });
  }
});

/** Multipart body (options as a JSON string) for a local test file capture. */
export const createFileCaptureBody = z.object({
  options: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), captureOptions),
}).superRefine((value, ctx) => {
  if (value.options.facecamRoi && value.options.layout !== "stack") {
    ctx.addIssue({ code: "custom", path: ["options", "facecamRoi"], message: "facecamRoi requires the stack layout" });
  }
});

export const updateClipBody = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  youtubeDescription: z.string().max(5000).nullable().optional(),
  instagramCaption: z.string().max(2200).nullable().optional(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  postAt: z.coerce.date().nullable().optional(),
  approved: z.boolean().optional(),
}).strict();

export const publishClipBody = z.object({
  scheduledFor: z.string().trim().min(1).optional(),
  now: z.boolean().default(false),
  publish: z.boolean().default(false),
  unattended: z.boolean().default(false),
});

export const renderBody = z.object({
  style: z.enum(["bold", "clean", "neon"]).default("bold"),
  fps: z.coerce.number().pipe(z.union([z.literal(30), z.literal(60)])).default(30),
  streamerVolume: z.coerce.number().min(0).max(2).default(1),
  gameplayVolume: z.coerce.number().min(0).max(2).default(1),
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  approved: z.enum(["true", "false"]).optional(),
  test: z.enum(["true", "false"]).optional(),
  job: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  status: z.string().optional(),
});
