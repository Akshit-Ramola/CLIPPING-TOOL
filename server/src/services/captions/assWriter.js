import fs from "node:fs";
import { maskWord } from "./profanity.js";

export function assTime(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * Pop-up captions: a short phrase (max 3 words, one line) sits at one fixed spot. Each word pops in
 * when it is spoken, in yellow; words already said turn white; words not yet said stay invisible, so the
 * line never shifts. Events never overlap in time (overlapping events make libass stack lines).
 *
 * timings: { words: [[start, end, word]], captionLanguage }
 */
export function buildWordPopAss(timings, start, length, credit, captionMarginV = 400, captionPositionY = null) {
  const head =
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n" +
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n" +
    `Style: Word,Arial Black,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,2,40,40,${Math.trunc(captionMarginV)},1\n` +
    "Style: Credit,Arial,44,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,1,8,40,40,150,1\n\n" +
    "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n";
  const events = [];
  const inside = timings.words.filter((w) => start <= w[0] && w[0] < start + length);
  const language = timings.captionLanguage ?? "English";

  if (language === "English" || language === "Hinglish") {
    const groups = [];
    let group = [];
    for (const [s, e, w] of inside) {
      const clean = maskWord(w.replace(/[^\p{L}\p{N}_'!?.,-]/gu, "")).toUpperCase();
      if (!clean) continue;
      if (group.length) {
        const prev = group[group.length - 1];
        const phraseLen = group.reduce((n, part) => n + part[2].length + 1, 0) + clean.length;
        if (s - prev[1] > 0.6 || group.length >= 3 || phraseLen > 18 || /[.!?]$/.test(prev[2])) {
          groups.push(group);
          group = [];
        }
      }
      group.push([s, e, clean]);
    }
    if (group.length) groups.push(group);

    // One timeline of (tOn, tOff, phrase, spokenIndex); tOff never passes the next tOn.
    const steps = [];
    groups.forEach((phrase, gi) => {
      let phraseEnd = phrase[phrase.length - 1][1] + 0.2;
      if (gi + 1 < groups.length) phraseEnd = Math.min(phraseEnd, groups[gi + 1][0][0]);
      phrase.forEach(([s], i) => {
        const tOff = i + 1 < phrase.length ? phrase[i + 1][0] : phraseEnd;
        steps.push([s - start, tOff - start, phrase, i]);
      });
    });

    for (const [rawOn, rawOff, phrase, i] of steps) {
      // Whisper can anticipate the first syllable slightly; a short buffer avoids flashing words early.
      const buffer = captionPositionY !== null ? 0.1 : 0;
      const tOn = Math.max(0, rawOn + buffer);
      const tOff = Math.min(length, rawOff + buffer);
      const aTxt = assTime(tOn);
      const bTxt = assTime(tOff);
      if (bTxt <= aTxt) continue;
      const parts = phrase.map(([, , txt], j) => {
        if (j < i) return String.raw`{\alpha&H00&\c&HFFFFFF&\fscx100\fscy100}` + txt;
        if (j === i) return String.raw`{\alpha&H00&\c&H00FFFF&\fscx100\fscy100}` + txt;
        return String.raw`{\alpha&HFF&\fscx100\fscy100}` + txt;
      });
      const chars = phrase.reduce((n, p) => n + p[2].length, 0) + phrase.length - 1;
      let fs = Math.max(64, Math.min(104, Math.trunc(1000 / (0.74 * Math.max(1, chars))))); // always one line on 1080 px
      let placement = "";
      if (captionPositionY !== null) {
        // A thick glyph outline keeps the picture visible between letters.
        fs = Math.max(72, Math.min(112, Math.trunc(1000 / (0.72 * Math.max(1, chars)))));
        placement = String.raw`\an5\pos(540,${Math.trunc(captionPositionY)})\b900\bord11\shad3`;
      }
      events.push(`Dialogue: 1,${aTxt},${bTxt},Word,,0,0,0,,{${placement}\\fs${fs}}${parts.join(" ")}`);
    }
  }
  if (credit) events.push(`Dialogue: 1,${assTime(0)},${assTime(4)},Credit,,0,0,0,,via ${credit}`);
  return head + events.join("\n") + "\n";
}

export function writeWordPopAss(filePath, ...args) {
  fs.writeFileSync(filePath, buildWordPopAss(...args), "utf8");
}
