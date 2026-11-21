// Card encoding matches the program: rank = c % 13 (0 = 2 .. 12 = A), suit = c / 13.
export const NO_CARD = 255;
const RANKS = "23456789TJQKA";
const SUITS = ["♣", "♦", "♥", "♠"];

export const rankLabel = (c: number) => {
  const r = RANKS[c % 13];
  return r === "T" ? "10" : r;
};
export const suitLabel = (c: number) => SUITS[Math.floor(c / 13)];
export const isRed = (c: number) => {
  const s = Math.floor(c / 13);
  return s === 1 || s === 2;
};

const CATEGORY = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

function eval5(cards: number[]): number {
  const counts = new Array(13).fill(0);
  cards.forEach((c) => counts[c % 13]++);
  const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
  const groups = counts
    .map((n, r) => [n, r] as [number, number])
    .filter(([n]) => n > 0)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let straightHigh = -1;
  if (groups.length === 5) {
    const hi = groups[0][1];
    const lo = groups[4][1];
    if (hi - lo === 4) straightHigh = hi;
    else if (hi === 12 && groups[1][1] === 3) straightHigh = 3;
  }
  const [c0, c1] = [groups[0][0], groups[1]?.[0]];
  let cat = 0;
  if (straightHigh >= 0 && flush) cat = 8;
  else if (c0 === 4) cat = 7;
  else if (c0 === 3 && c1 === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh >= 0) cat = 4;
  else if (c0 === 3) cat = 3;
  else if (c0 === 2 && c1 === 2) cat = 2;
  else if (c0 === 2) cat = 1;
  let score = cat << 20;
  if (cat === 4 || cat === 8) return score | (straightHigh << 16);
  groups.forEach(([, r], i) => (score |= r << (16 - 4 * i)));
  return score;
}

/** Name of the best 5-card hand from 5-7 known cards. */
export function handName(cards: number[]): string {
  const known = cards.filter((c) => c !== NO_CARD);
  if (known.length < 5) return "";
  let best = 0;
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === 5) {
      best = Math.max(best, eval5(chosen));
      return;
    }
    for (let i = start; i < known.length; i++) pick(i + 1, [...chosen, known[i]]);
  };
  pick(0, []);
  const cat = best >> 20;
  if (cat === 8 && ((best >> 16) & 0xf) === 12) return "Royal flush";
  return CATEGORY[cat];
}
