import path from "node:path";
import { pipeline, Tensor, env as hfEnv } from "@huggingface/transformers";
import { env } from "../../config/env.js";
import { MODELS_DIR } from "../../config/paths.js";
import { containsArabicScript, romanizeHindi } from "./romanize.js";

hfEnv.cacheDir = path.join(MODELS_DIR, "hf-cache");

const pipelines = new Map();

function getPipeline(model) {
  if (!pipelines.has(model)) {
    pipelines.set(model, pipeline("automatic-speech-recognition", model));
  }
  return pipelines.get(model);
}

/**
 * Word timings plus caption-language decisions. Equivalent to the Python WordTimings list subclass.
 * words: Array<[start, end, word]>
 */
export function wordTimings(words = [], spokenLanguage = "unknown", captionLanguage = "English", captionFallbackReason = null) {
  return { words, spokenLanguage: spokenLanguage || "unknown", captionLanguage, captionFallbackReason };
}

/**
 * Language lock. Whisper guesses the language again for every chunk, and a Hindi streamer's chunk is
 * sometimes guessed as English. "hi"/"en" forces it; in auto mode, after 3 confident chunks, if half or
 * more were Hindi, every later chunk is transcribed as Hindi (-> Hinglish captions). One lock per capture job.
 */
export class LanguageLock {
  static MIN_VOTES = 3;
  static SHARE = 0.5;

  constructor(forced = null) {
    this.forced = forced === "hi" || forced === "en" ? forced : null;
    this.votes = {};
  }

  locked() {
    if (this.forced) return this.forced;
    const total = Object.values(this.votes).reduce((a, b) => a + b, 0);
    if (total >= LanguageLock.MIN_VOTES && (this.votes.hi || 0) / total >= LanguageLock.SHARE) return "hi";
    return null;
  }

  vote(language) {
    this.votes[language] = (this.votes[language] || 0) + 1;
  }
}

/**
 * faster-whisper runs language ID after its VAD filter has removed non-speech. Without VAD, the
 * loudest 30 s window (by 1 s energy) is used so silence or background noise does not decide it.
 */
function speechWindow(audio, seconds = 30, rate = 16000) {
  const size = seconds * rate;
  if (audio.length <= size) return audio;
  const blocks = Math.floor(audio.length / rate);
  const energy = new Float64Array(blocks);
  for (let b = 0; b < blocks; b += 1) {
    let sum = 0;
    for (let i = b * rate; i < (b + 1) * rate; i += 1) sum += audio[i] * audio[i];
    energy[b] = sum;
  }
  let best = 0;
  let bestSum = -1;
  let running = 0;
  for (let b = 0; b < blocks; b += 1) {
    running += energy[b];
    if (b >= seconds) running -= energy[b - seconds];
    if (b >= seconds - 1 && running > bestSum) {
      bestSum = running;
      best = b - seconds + 1;
    }
  }
  return audio.subarray(best * rate, best * rate + size);
}

/**
 * Whisper language identification, as faster-whisper does it: run the decoder for one step after
 * <|startoftranscript|> on the first 30 s and softmax over the language tokens.
 * transformers.js otherwise silently assumes English when no language is given.
 */
async function detectLanguage(asr, audio) {
  const ids = asr.tokenizer.model.tokens_to_ids;
  const sot = ids.get("<|startoftranscript|>");
  const translate = ids.get("<|translate|>");
  if (sot == null || translate == null) return { language: "unknown", probability: 0 };
  const { input_features: features } = await asr.processor(speechWindow(audio));
  const { logits } = await asr.model({
    input_features: features,
    decoder_input_ids: new Tensor("int64", BigInt64Array.from([BigInt(sot)]), [1, 1]),
  });
  const data = logits.data;
  let max = -Infinity;
  let best = -1;
  for (let id = sot + 1; id < translate; id += 1) {
    if (data[id] > max) {
      max = data[id];
      best = id;
    }
  }
  let sum = 0;
  for (let id = sot + 1; id < translate; id += 1) sum += Math.exp(data[id] - max);
  const token = asr.tokenizer.model.vocab[best] || "";
  return { language: token.replace(/^<\||\|>$/g, "") || "unknown", probability: 1 / sum };
}

const LANGUAGE_NAMES = { en: "english", hi: "hindi" };

/**
 * Transcribe 16 kHz mono float PCM with word timestamps.
 * `finalEnglish` uses the (optionally larger) English caption model for the selected clip only.
 */
export async function whisperWords(audio, { finalEnglish = false, lock = null } = {}) {
  const model = finalEnglish ? env.whisperEnglishModel : env.whisperModel;
  const asr = await getPipeline(model);
  const forced = finalEnglish ? "en" : lock?.locked() ?? null;
  const englishOnlyModel = /\.en\b/.test(model);
  let spokenLanguage = englishOnlyModel ? "en" : forced;
  if (!spokenLanguage) {
    const detected = await detectLanguage(asr, audio);
    spokenLanguage = detected.language;
    if (lock && detected.probability >= 0.6) lock.vote(spokenLanguage);
  }
  // Transcribe in the detected language (Whisper's own behaviour); Hindi stays Devanagari for romanization.
  const decodeLanguage = LANGUAGE_NAMES[spokenLanguage] || (spokenLanguage !== "unknown" ? spokenLanguage : null);
  const output = await asr(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(englishOnlyModel ? {} : { task: "transcribe", language: decodeLanguage }),
  });
  const rawWords = (output.chunks || [])
    .map((chunk) => [Number(chunk.timestamp?.[0]), Number(chunk.timestamp?.[1] ?? chunk.timestamp?.[0]), String(chunk.text || "").trim()])
    .filter(([start, end, word]) => Number.isFinite(start) && Number.isFinite(end) && word);
  const fullText = rawWords.map((w) => w[2]).join(" ");
  if (spokenLanguage === "hi") {
    if (containsArabicScript(fullText)) {
      return wordTimings(rawWords, "hi", "none", "Hindi recognition returned Arabic script; captions omitted");
    }
    const words = rawWords.map(([s, e, w]) => [s, e, romanizeHindi(w)]);
    return wordTimings(words, "hi", "Hinglish");
  }
  if (spokenLanguage === "en") return wordTimings(rawWords, "en", "English");
  return wordTimings(rawWords, spokenLanguage || "unknown", "none", "Captions disabled for unsupported or uncertain language");
}
