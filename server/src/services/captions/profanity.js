// Burned-in captions: swear and sexual words are masked (F***) so platforms do not cut reach. Audio is unchanged.
const MASK_WORDS = new Set([
  "fuck", "fucking", "fucked", "fucker", "motherfucker", "shit", "shitty", "bullshit", "bitch", "bitches",
  "pussy", "dick", "cock", "cunt", "nigga", "niggas", "nigger", "whore", "slut", "porn", "sex", "sexy",
  "ass", "asshole", "bastard", "boobs", "tits", "chutiya", "madarchod", "bhenchod", "behenchod", "bc", "mc",
  "gandu", "randi", "lund", "bsdk",
]);
const MASK_PREFIXES = ["fuck", "motherf", "shit", "nigg"];

export function maskWord(word) {
  const core = word.toLowerCase().replace(/[^a-z]/g, "");
  if (MASK_WORDS.has(core) || MASK_PREFIXES.some((p) => core.startsWith(p))) {
    return word.slice(0, 1) + "*".repeat(Math.max(2, word.length - 1));
  }
  return word;
}
