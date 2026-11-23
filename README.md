# GTA Face Clipper — MERN

A MongoDB + Express + React + Node rewrite of [GTA Face Clipper](https://github.com/AnIntellectualBeing/gta-face-clipper).
It finds live GTA streams, records them in chunks, scores highlight moments from live chat, audio loudness and speech,
and renders 1080×1920 clips with the streamer's facecam above the gameplay and word-pop captions at the join.
Approved clips can be scheduled to YouTube and Instagram through Zernio.

The Python CLI is replaced by a web UI and a REST API. The processing pipeline runs entirely in Node:

| Original (Python)                 | This rewrite (Node)                                   |
| --------------------------------- | ----------------------------------------------------- |
| `faster-whisper`                  | Whisper via `@huggingface/transformers` (ONNX)        |
| OpenCV `FaceDetectorYN` (YuNet)   | Same YuNet ONNX model via `onnxruntime-node`          |
| `onnxruntime` YOLOX player track  | Same YOLOX model via `onnxruntime-node`               |
| numpy audio scoring               | Plain JS ports in `services/analysis`                 |
| JSON sidecar per clip             | `Clip` document in MongoDB                            |
| `argparse` CLI flags              | Capture form / `POST /api/jobs` body                  |

## Requirements

- Node.js 20+
- MongoDB 6+ (local service or an Atlas connection string)
- FFmpeg and FFprobe come from npm (`ffmpeg-static`, `ffprobe-static`; libx264 + libass included)
- yt-dlp is downloaded by `npm run setup:ytdlp`

## Setup

```sh
npm install            # root: installs concurrently
npm run install:all    # server + client dependencies, downloads yt-dlp into server/bin
cp server/.env.example server/.env    # then fill in keys you have
npm run setup:models --prefix server   # optional: 35 MB YOLOX player tracker for the fill layout
npm run check          # verifies ffmpeg, ffprobe, yt-dlp, libass and the face model
npm run dev            # API on http://127.0.0.1:5000, UI on http://localhost:5173
```

For production: `npm run build`, then `npm start`. Express serves `client/dist` itself.

The first capture downloads the Whisper model (to `server/models/hf-cache`). If the YOLOX model is not
present, the server downloads it in the background the first time a `fill` clip is rendered. Clips rendered
before it finishes use a static crop.

## Configuration (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Mongo connection string |
| `HOST`, `PORT` | API bind address. Keep `127.0.0.1`: the API has no login and starts FFmpeg/yt-dlp |
| `YOUTUBE_API_KEY` | Stream search and YouTube live chat |
| `TWITCH_CHAT_USERNAME`, `TWITCH_CHAT_TOKEN` | Twitch live chat (optional) |
| `ZERNIO_API_KEY`, `ZERNIO_YOUTUBE_ACCOUNT_ID`, `ZERNIO_INSTAGRAM_ACCOUNT_ID` | Scheduling (optional) |
| `GTA_UNATTENDED_POSTS` | `1` allows unattended scheduling of unapproved clips |
| `WHISPER_MODEL`, `WHISPER_EN_MODEL` | transformers.js Whisper models (must be `_timestamped` variants for word timings) |
| `ENABLE_PLAYER_TRACKING` | `0` disables YOLOX player tracking in the `fill` layout |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `YTDLP_PATH` | Override bundled binaries |

Secrets are read on the server only and are never returned by the API.

## Workflow

1. **Find streams.** Search live YouTube streams. Results are candidates, not a live-viewer ranking.
2. **Check the stream yourself.** Confirm visible GTA gameplay and that your rights policy allows the source.
3. **New capture.** Paste the URL, tick the gameplay confirmation and choose options. The job page shows a live log
   and the clips as they render. A local video can be uploaded instead; it always runs in test mode.
4. **Review.** Watch each clip's opening, middle and end. Write the title, description, caption and hashtags, then approve.
5. **Schedule.** Run a dry run, then publish to Zernio. Test clips and unapproved clips are refused.
6. **Manual render.** Upload an aligned facecam video, gameplay video and optional SRT to compose a short directly.

### Layouts

- **stack** (default): detects a stable small face at a frame edge, puts that webcam region on top (1080×760),
  and crops gameplay without the webcam below (1080×1160). If detection is ambiguous, the moment is skipped and
  the log says why. Use a measured webcam rectangle (Advanced → facecam ROI, even source pixels) when detection misses.
- **fill**: gameplay-only 9:16 crop, panning with the detected player when possible.
- **fit**: the full source over a blurred background.

## Project structure

```
server/src/
  config/        env, MongoDB connection, storage paths
  models/        CaptureJob, Clip, RenderJob (Mongoose)
  controllers/   request handlers
  routes/        /api/streams, /api/jobs, /api/clips, /api/renders, /api/system
  middlewares/   zod validation, multer uploads, error handling
  services/
    youtube/     live stream search
    chat/        YouTube + Twitch chat collectors, chat burst scoring
    media/       ffmpeg/ffprobe/yt-dlp wrappers, chunk recorder, PCM audio
    speech/      Whisper word timings, language lock, Hindi → Hinglish
    analysis/    reaction scoring, moment picking
    vision/      YuNet face detection, framing geometry, YOLOX player tracking
    captions/    word-pop ASS writer, SRT parser, profanity masking
    render/      filter graphs, clip cutter, manual stack renderer
    capture/     capture runner + in-process job manager
    publish/     Zernio scheduling
  utils/
client/src/
  api/ components/ pages/ context/ hooks/ utils/ styles/
```

## API summary

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/system/status` | Tool + integration readiness |
| GET | `/api/streams/search?q=&max=` | Live YouTube search |
| POST | `/api/jobs` | `{ url, test, options }`; `options.gameplayConfirmed` is required unless `test` |
| POST | `/api/jobs/file` | multipart `video` + `options` JSON (test mode) |
| GET | `/api/jobs`, `/api/jobs/:id` | Job with logs and its clips |
| POST | `/api/jobs/:id/stop` | Stop recording; already-recorded chunks are still analysed |
| GET/PATCH/DELETE | `/api/clips/:id` | Edit publishing metadata, approve |
| POST | `/api/clips/:id/publish` | `{ scheduledFor, now, publish, unattended }`; dry run unless `publish: true` |
| POST | `/api/renders` | multipart `facecam`, `gameplay`, optional `captions` + style/fps/volumes |

## Differences from the Python version

- **Language detection.** transformers.js assumes English when no language is given, so the server runs
  Whisper's own language identification (one decoder step over the language tokens) before transcribing.
  faster-whisper did this after a voice-activity filter; here the loudest 30 s of the chunk is used instead.
  Forcing English or Hindi in the capture form skips detection.
- **No voice-activity filter** before transcription.
- **Facecam detection runs at 640×640** (the model's native size) instead of 320×320. At 320, a webcam face
  small enough to pass the original's own inset rules was usually too small to reach the 0.8 confidence
  threshold. The geometry rules are unchanged. They remain conservative: on a 1280×720 source a side webcam
  is only accepted when the face is under ~125 px tall, because the estimated panel (~4.6× the face height
  wide) must end before 45% of the frame width. For larger webcams, measure the rectangle once and use the
  facecam ROI option.
- **Model download.** The YOLOX download streams to disk in the background and never blocks a render.
- **Stopping a capture** analyses the chunks that were already recorded before the job ends.
- **Concurrency.** Several captures can run at once, but Whisper, ONNX inference and renders run one at a time.
- **Restarts.** A server restart marks unfinished jobs as interrupted and clears their temporary recordings.

Use footage you are authorized to record, edit and publish. Creator credit does not replace permission.
This is an independent fan-made project, not affiliated with Rockstar Games, Take-Two Interactive, YouTube,
Instagram, Meta or Zernio. See `LICENSE` and `STREAMER-RENDERER-LICENSE`.
