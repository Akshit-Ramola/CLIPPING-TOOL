const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ळ": "l", "क़": "q",
  "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "r", "ढ़": "rh",
  "फ़": "f",
};
const VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
  "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
};
const MATRAS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
};
const VIRAMA = "्";
const NUKTA = "़";

/** Render Hindi in familiar Latin letters for Hinglish captions. */
export function romanizeHindi(text) {
  const chars = [...text];
  const result = [];
  let i = 0;
  while (i < chars.length) {
    const char = chars[i];
    if (char in CONSONANTS) {
      let consonant = char;
      if (chars[i + 1] === NUKTA && (char + NUKTA) in CONSONANTS) {
        consonant = char + NUKTA;
        i += 1;
      }
      result.push(CONSONANTS[consonant]);
      i += 1;
      if (i < chars.length && chars[i] in MATRAS) {
        result.push(MATRAS[chars[i]]);
        i += 1;
      } else if (chars[i] === VIRAMA) {
        i += 1;
      } else {
        result.push("a");
      }
      continue;
    }
    if (char in VOWELS) result.push(VOWELS[char]);
    else if (char === "ं" || char === "ँ") result.push("n");
    else if (char === "ः") result.push("h");
    else if (char === "ऽ") result.push("'");
    else if (char === "।" || char === "॥") result.push(". ");
    else if (char !== VIRAMA) result.push(char);
    i += 1;
  }
  return result.join("");
}

export const containsArabicScript = (text) => /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(text);
export const containsDevanagari = (text) => /[ऀ-ॿ]/.test(text);
