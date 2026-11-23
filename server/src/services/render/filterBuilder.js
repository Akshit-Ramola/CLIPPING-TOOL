import { videoSize } from "../media/probe.js";
import { cropXExpr } from "../vision/playerTracker.js";

/** Place captions near the lower third of visible gameplay, not the blurred canvas edge. */
export async function captionMarginForVideo(videoPath, crop = false, sourceRoi = null) {
  const outW = 1080;
  const outH = 1920;
  let panelHeight;
  if (crop && !sourceRoi) panelHeight = outH;
  else if (sourceRoi) {
    const [, , sw, sh] = sourceRoi;
    panelHeight = Math.min(outH, (outW * sh) / Math.max(1, sw));
  } else {
    const size = await videoSize(videoPath);
    panelHeight = size ? Math.min(outH, (outW * size[1]) / Math.max(1, size[0])) : outH;
  }
  const panelTop = Math.max(0, (outH - panelHeight) / 2);
  const captionCenter = panelTop + panelHeight * 0.76;
  return Math.max(100, Math.min(1100, Math.round(outH - captionCenter - 55)));
}

/** Only crop when facecam evidence supports it; otherwise preserve the full source. */
export function shouldApplySmartCrop(requested, cropOffset, sourceRoi) {
  return Boolean(requested && (sourceRoi !== null || Math.abs(Number(cropOffset) - 0.5) > 0.01));
}

/**
 * layout "stack": detected facecam (1080x760) above gameplay (1080x1160).
 * layout "fill":  gameplay covers the whole 9:16 frame, centred, shifted away from a side facecam,
 *                 or panning with the tracked player.
 * layout "fit":   the full source sits in the middle over a blurred copy.
 */
export function buildVideoFilter(assName, {
  crop = false, cropOffset = 0.5, sourceRoi = null, layout = "fit", panKeys = null, facecamRoi = null, gameplayRoi = null,
} = {}) {
  const offset = Math.min(1, Math.max(0, Number(cropOffset)));
  const effectiveLayout = crop ? "fill" : layout;
  if (effectiveLayout === "stack") {
    if (!facecamRoi || !gameplayRoi) throw new Error("stack layout requires a confidently detected facecam and gameplay region");
    const [fx, fy, fw, fh] = facecamRoi;
    const [gx, gy, gw, gh] = gameplayRoi;
    return (
      "[0:v]split[cam_src][game_src];" +
      `[cam_src]crop=${fw}:${fh}:${fx}:${fy},scale=1080:760:force_original_aspect_ratio=decrease:force_divisible_by=2:` +
      "flags=lanczos,pad=1080:760:(ow-iw)/2:oh-ih:color=0x141414,setsar=1[cam];" +
      `[game_src]crop=${gw}:${gh}:${gx}:${gy},scale=1080:1160:force_original_aspect_ratio=increase,` +
      "crop=1080:1160,setsar=1[game];" +
      `[cam][game]vstack=inputs=2,ass=${assName}`
    );
  }
  if (effectiveLayout === "fill") {
    let pre = "";
    if (sourceRoi) {
      const [x, y, w, h] = sourceRoi;
      pre = `crop=${w}:${h}:${x}:${y},`;
    }
    if (panKeys && !sourceRoi) {
      return (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase," +
        `crop=1080:1920:'${cropXExpr(panKeys)}':(ih-1920)/2,ass=${assName}`
      );
    }
    return (
      `[0:v]${pre}scale=1080:1920:force_original_aspect_ratio=increase,` +
      `crop=1080:1920:(iw-1080)*${offset.toFixed(4)}:(ih-1920)/2,ass=${assName}`
    );
  }
  if (sourceRoi) {
    const [x, y, w, h] = sourceRoi;
    return (
      `[0:v]crop=${w}:${h}:${x}:${y},split[a][b];` +
      "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];[b]scale=1080:-2[fg];" +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=${assName}`
    );
  }
  return (
    "[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920,boxblur=30:5[bg];[b]scale=1080:-2[fg];" +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass=${assName}`
  );
}

/** Manual render: fill both panels with source footage and put captions directly over their seam. */
export function buildStackGraph({
  duration, fps, streamerVolume, gameplayVolume, hasStreamerAudio, hasGameplayAudio, captions = true, captionFilename = "captions.ass",
}) {
  const check = (value, name, low, high) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < low || n > high) throw new Error(`${name} must be between ${low} and ${high}`);
    return n;
  };
  const d = check(duration, "duration", 0.05, 24 * 60 * 60).toFixed(3);
  if (fps !== 30 && fps !== 60) throw new Error("fps must be 30 or 60");
  const volumes = [check(streamerVolume, "streamer volume", 0, 2), check(gameplayVolume, "gameplay volume", 0, 2)];
  const graph = [
    `[0:v:0]trim=duration=${d},setpts=PTS-STARTPTS,scale=1080:760:force_original_aspect_ratio=increase,crop=1080:760,setsar=1,fps=${fps},format=yuv420p[top]`,
    `[1:v:0]trim=duration=${d},setpts=PTS-STARTPTS,scale=1080:1160:force_original_aspect_ratio=increase,crop=1080:1160,setsar=1,fps=${fps},format=yuv420p[bottom]`,
    "[top][bottom]vstack=inputs=2:shortest=1[stack]",
    captions
      ? `[stack]subtitles=filename='${captionFilename}':original_size=1080x1920,format=yuv420p[vout]`
      : "[stack]format=yuv420p[vout]",
  ];
  [hasStreamerAudio, hasGameplayAudio].forEach((exists, index) => {
    const volume = volumes[index].toFixed(3);
    graph.push(
      exists
        ? `[${index}:a:0]aresample=48000,atrim=duration=${d},asetpts=PTS-STARTPTS,volume=${volume}[a${index}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS,volume=${volume}[a${index}]`,
    );
  });
  graph.push("[a0][a1]amix=inputs=2:duration=shortest:dropout_transition=0,alimiter=limit=0.95[aout]");
  return graph.join(";");
}
