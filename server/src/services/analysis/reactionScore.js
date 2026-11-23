const STRONG_REACTIONS = new Set([
  "wow", "crazy", "insane", "shit", "fuck", "fucking", "damn", "unbelievable",
  "ridiculous", "nuts", "wild", "sick", "amazing", "brilliant",
]);
const GAME_EVENTS = new Set(["crash", "crashed", "explode", "exploded", "boom", "chase", "chasing", "wreck", "wrecked"]);
const REACTION_PHRASES = [
  [["oh", "my", "god"], 1.2], [["holy", "shit"], 1.5], [["holy", "crap"], 1.2],
  [["no", "way"], 1.4], [["what", "the", "hell"], 1.3], [["are", "you", "kidding"], 1.4],
  [["what", "just", "happened"], 1.0], [["no", "fucking", "way"], 2.0],
];

const tokenize = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");

/** Score distinct high-energy words and phrases, not repeated filler like "oh no". */
export function reactionScore(words) {
  const tokens = words.map(([, , w]) => tokenize(w)).filter(Boolean);
  let phrasePoints = 0;
  for (const [phrase, weight] of REACTION_PHRASES) {
    const size = phrase.length;
    for (let i = 0; i <= tokens.length - size; i += 1) {
      if (phrase.every((p, j) => tokens[i + j] === p)) {
        phrasePoints += weight;
        break;
      }
    }
  }
  const unique = new Set(tokens);
  let strong = 0;
  let events = 0;
  for (const t of unique) {
    if (STRONG_REACTIONS.has(t)) strong += 1;
    if (GAME_EVENTS.has(t)) events += 1;
  }
  const score = Math.min(3, phrasePoints + Math.min(strong, 3) * 0.45 + Math.min(events, 2) * 0.25);
  return Math.round(score * 100) / 100;
}
