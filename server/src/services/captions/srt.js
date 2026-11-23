const TIMESTAMP = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;
const TIMING_LINE = /^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/;

export const CAPTION_STYLES = {
  bold: { font: "Georgia", size: 104, primary: "&H0000FF00", outline: 9 },
  clean: { font: "Georgia", size: 96, primary: "&H0000FF00", outline: 8 },
  neon: { font: "Georgia", size: 102, primary: "&H0000FF00", outline: 10 },
};

function seconds(value) {
  const match = TIMESTAMP.exec(value);
  if (!match) throw new Error("invalid subtitle cue timestamp");
  const [h, m, s, ms] = match.slice(1).map(Number);
  if (m > 59 || s > 59) throw new Error("invalid subtitle cue timestamp");
  return h * 3600 + m * 60 + s + ms / 1000;
}

/** Parse standard SRT blocks, preserving multiline cue text. Returns [{start, end, text}] sorted. */
export function parseSrt(source) {
  const normalized = String(source || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const cues = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((line) => line.replace(/^\ufeff|\ufeff$/g, ""));
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
    if (timingIndex < 0 || timingIndex + 1 >= lines.length) {
      throw new Error("invalid subtitle cue: expected timing line and text");
    }
    const [, a, b] = TIMING_LINE.exec(lines[timingIndex]);
    const start = seconds(a);
    const end = seconds(b);
    const text = lines.slice(timingIndex + 1).map((l) => l.trim()).filter(Boolean).join(" ");
    if (end <= start || !text) throw new Error("invalid subtitle cue: end must follow start and text is required");
    cues.push({ start, end, text });
  }
  return cues.sort((x, y) => x.start - y.start || x.end - y.end);
}

function assTime(value) {
  let cs = Math.max(0, Math.round(value * 100));
  const h = Math.floor(cs / 360000);
  cs -= h * 360000;
  const m = Math.floor(cs / 6000);
  cs -= m * 6000;
  const s = Math.floor(cs / 100);
  cs -= s * 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const assText = (value) => value.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");

/** Bold green, black-outlined captions that pop at the facecam/gameplay seam. */
export function cuesToAss(cues, style = "bold", captionY = 760) {
  const selected = CAPTION_STYLES[style];
  if (!selected) throw new Error(`unknown caption style: ${style}`);
  if (!Number.isInteger(captionY) || captionY < 0 || captionY > 1920) throw new Error("captionY must be between 0 and 1920");
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2", "ScaledBorderAndShadow: yes",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${selected.font},${selected.size},${selected.primary},&H0000FF00,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${selected.outline},4,5,40,40,0,1`,
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const text = assText(words.join(" ").toUpperCase());
    const fontSize = Math.min(selected.size, Math.max(58, Math.round(1080 / (0.62 * text.length))));
    const pop = `{\\an5\\pos(540,${captionY})\\fs${fontSize}\\fscx88\\fscy88\\t(0,120,\\fscx100\\fscy100)}${text}`;
    lines.push(`Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${pop}`);
  }
  return lines.join("\n") + "\n";
}
