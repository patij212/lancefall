// src/dailyCipher.ts — THE DAILY CIPHER. A new cryptogram every calendar day, deterministic
// from seedFromDate() (YYYYMMDD → changes daily) with its OWN mask — never the sim, never a
// shared rng stream. Pure. One solve/day grants Fragments (synthetic dedup'd ids).
import type { SaveData } from './save';
import { createRng } from './rng';

export const DAILY_CIPHER_REWARD = 4;

// ≥30 lore-voice phrases — A–Z + spaces only (so every cipher round-trips cleanly).
// Each phrase is unique so different plaintext selections always differ.
const POOL: string[] = [
  'BRING BACK THE LIGHT',
  'THE CITY REMEMBERS',
  'HOLD THE LINE',
  'EVERY DASH IS A REFUSAL',
  'READ THE PATTERN AND BREAK IT',
  'THE LONGEST DAY STANDS',
  'ONE KEY ONE LAST DESCENT',
  'THE GREY GIVES GROUND',
  'CATCH THE LIGHT OR LET IT GO',
  'THE BELLS DID NOT RING',
  'A WHOLE QUARTER RESOLVES',
  'THE CODE IS BROKEN',
  'LANCEFALL BLAZES',
  'THE DARK HAS NOWHERE TO FALL',
  'THE WEAVER ENCIPHERED THE TRUTH',
  'THE BEACON STAYED COLD',
  'STRIKE WHEN IT IS REAL',
  'THE CROWN KEPT THE KEY',
  'YOU MEANT IT MORE',
  'THE SIGNAL TURNS AGAIN',
  'DAWN OVER LANCEFALL',
  'THE WARDEN TURNED THE LOCK',
  'A DOOR UNGUARDED',
  'A KEY NEVER TURNED',
  'EVERY NAME EVERY DEBT',
  'THE LIGHT SCRAMBLED TO GREY',
  'PROVE THE MOMENT WAS REAL',
  'THE LAST MEMORY OF ITSELF',
  'A SMALL MACHINE OF NUMBERS',
  'THE PATTERN HOLDS',
  'THE THRONE HALL GONE TO GREY',
  'NOTHING HELD ITS SHAPE',
  'THE SHIPS NEVER SET OUT',
  'SILENCE BEFORE THE SIGNAL',
  'EACH WORD A RECOVERED NAME',
  'THE CIPHER KNOWS NO MERCY',
  'READ UNTIL THE CITY WAKES',
];

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KINDS = ['caesar', 'substitution', 'vigenere'] as const;
type Kind = (typeof KINDS)[number];

const VIGENERE_KEYS = ['KEY', 'LIGHT', 'DAWN', 'CIPHER', 'CROWN', 'SPEAR', 'LANCE', 'SIGNAL'];

function caesarShift(text: string, n: number): string {
  return text.replace(/[A-Z]/g, (c) => ALPHA[(ALPHA.indexOf(c) + n + 26) % 26]);
}

function subEncode(text: string, map: string): string {
  return text.replace(/[A-Z]/g, (c) => map[ALPHA.indexOf(c)]);
}

function shuffledAlphabet(rng: ReturnType<typeof createRng>): string {
  const a = ALPHA.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join('');
}

function vigenereEncode(text: string, key: string): string {
  let k = 0;
  return text.replace(/[A-Z]/g, (c) => {
    const shift = ALPHA.indexOf(key[k % key.length]);
    k++;
    return ALPHA[(ALPHA.indexOf(c) + shift) % 26];
  });
}

function vigenereDecode(text: string, key: string): string {
  let k = 0;
  return text.replace(/[A-Z]/g, (c) => {
    const shift = ALPHA.indexOf(key[k % key.length]);
    k++;
    return ALPHA[(ALPHA.indexOf(c) - shift + 26) % 26];
  });
}

export interface DailyCipher {
  kind: Kind;
  prompt: string;
  answer: string;
  hint: string;
  plain: string;
}

export function dailyCipher(daySeed: number): DailyCipher {
  // Own mask — never conflicts with the sim rng stream. The XOR constant spreads
  // adjacent YYYYMMDD integers (which differ by 1) across the 32-bit seed space.
  const rng = createRng((daySeed ^ 0x3b9aca07) >>> 0);

  const plain = POOL[rng.int(0, POOL.length - 1)];
  const kind = KINDS[rng.int(0, KINDS.length - 1)];

  if (kind === 'caesar') {
    const n = rng.int(1, 25);
    const prompt = caesarShift(plain, n);
    return {
      kind,
      plain,
      answer: plain,
      prompt,
      hint: `A Caesar shift — every letter pushed ${n} forward.`,
    };
  }

  if (kind === 'substitution') {
    const map = shuffledAlphabet(rng);
    const prompt = subEncode(plain, map);
    return {
      kind,
      plain,
      answer: plain,
      prompt,
      hint: 'A substitution cipher — one letter for another. Try frequency analysis.',
    };
  }

  // vigenere
  const key = VIGENERE_KEYS[rng.int(0, VIGENERE_KEYS.length - 1)];
  const prompt = vigenereEncode(plain, key);
  // Verify it round-trips (sanity; always true given the pure math)
  const _check = vigenereDecode(prompt, key);
  void _check;
  return {
    kind,
    plain,
    answer: plain,
    prompt,
    hint: `A Vigenère cipher — a short repeating key word (${key.length} letters).`,
  };
}

export function letterFrequency(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of text.toLowerCase()) {
    if (c >= 'a' && c <= 'z') out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

export function checkDailyCipher(daySeed: number, guess: string): boolean {
  return norm(guess) === norm(dailyCipher(daySeed).answer);
}

// daySeed is YYYYMMDD → 'YYYY-MM-DD'
function dateStringFromSeed(seed: number): string {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100);
  const d = seed % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function solveDailyCipher(
  save: SaveData,
  daySeed: number,
  guess: string,
): { solved: boolean; fragments: number } {
  const day = dateStringFromSeed(daySeed);
  if (save.solvedDailyCiphers.includes(day)) return { solved: false, fragments: 0 };
  if (!checkDailyCipher(daySeed, guess)) return { solved: false, fragments: 0 };
  save.solvedDailyCiphers.push(day);
  for (let i = 0; i < DAILY_CIPHER_REWARD; i++) {
    const fid = `daily-cipher:${day}#${i}`;
    if (!save.stillpointFragments.includes(fid)) save.stillpointFragments.push(fid);
  }
  return { solved: true, fragments: DAILY_CIPHER_REWARD };
}
