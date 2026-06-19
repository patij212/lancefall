// src/intercepts.ts — THE INTERCEPTS. The full history of Lancefall as encrypted transmissions
// you DECRYPT word-by-word with Memory Fragments. PURE + save-side: the only writes are
// fragmentsSpent += cost and decryptedWords.push(word) — never rng, never the sim. Decryption is
// by VOCABULARY: cracking a word reveals every occurrence across all transmissions (you build the
// key — cryptanalysis-true), so Fragments are a perpetual sink and the history is told by decoding.
import type { SaveData } from './save';

export interface Intercept {
  id: string;
  title: string;
  /** the LoreEntry id this transmission deepens — unlocked when fully decrypted (optional) */
  loreLink?: string;
  /** the plaintext, as ordered tokens (a token = a word, punctuation attached) */
  tokens: string[];
}

/** Split an authored sentence into tokens (whitespace) — keeps punctuation attached to words. */
function toks(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

// The thirteen transmissions — the complete history of the dead star-kingdom, intercepted and
// enciphered. Twelve deepen a CODEX memory (loreLink); the thirteenth is a bonus (the Gardens —
// a quiet nod to Turing's morphogenesis). Voice carried from src/lore.ts.
export const INTERCEPTS: Intercept[] = [
  {
    id: 'int-first-light', title: 'TRANSMISSION 01 — THE FIRST LIGHT', loreLink: 'first-light',
    tokens: toks(
      'Before the battlefield, a kingdom. Before the kingdom, one light someone refused to let go out. ' +
      'They wrote the city around it in living code — tower by tower, bell by bell — so the dark would always have somewhere to fail.',
    ),
  },
  {
    id: 'int-long-evening', title: 'TRANSMISSION 02 — THE LONG EVENING', loreLink: 'long-evening',
    tokens: toks(
      'No kingdom falls in a single night. Lancefall fell over a hundred quiet evenings — a door unguarded, ' +
      'a record unkept, a key never turned. Each loss too small to call the end, until every small loss was the end.',
    ),
  },
  {
    id: 'int-warden', title: 'TRANSMISSION 03 — THE FIRST GATE', loreLink: 'warden-lore',
    tokens: toks(
      'The Warden loved the gates more than the people behind them. Forty years he held the wall against every enemy. ' +
      'On the last night he forgot which side he stood on, and turned the first wheel of the lock himself.',
    ),
  },
  {
    id: 'int-weaver', title: 'TRANSMISSION 04 — THE SCRIBE OF LIGHT', loreLink: 'weaver-lore',
    tokens: toks(
      'The Weaver kept the memory of the kingdom — every name, every debt, every promise — written in light. ' +
      'When the fear came she enciphered the parts that hurt, scrambling them to grey until no one could read why the city was worth dying for. A kindness, she called it.',
    ),
  },
  {
    id: 'int-beacon', title: 'TRANSMISSION 05 — THE SIGNAL UNSENT', loreLink: 'beacon-lore',
    tokens: toks(
      'The Beacon had one duty: to turn the light when help was needed, the signal that carried the key to the ships beyond the dark. ' +
      'On the last night it stayed cold, and the rescue that might have come never knew to set out.',
    ),
  },
  {
    id: 'int-mirror', title: 'TRANSMISSION 06 — THE IMITATION', loreLink: 'mirror-lore',
    tokens: toks(
      'The Mirrorblade is not one of the Six. It is the doubt you carry down — that you will falter, that the city is already lost. ' +
      'It moves as you move, in your own colour, because it learned you. You beat it by being the one that means it.',
    ),
  },
  {
    id: 'int-hollow', title: 'TRANSMISSION 07 — THE ONE WHO STAYED', loreLink: 'hollow-lore',
    tokens: toks(
      'The last to leave was the one who could not. Grief hollowed them until nothing held its shape. ' +
      'The key to what they were shows for only an instant, when the mourning forgets itself and it is briefly real. Strike then. It is a mercy.',
    ),
  },
  {
    id: 'int-crown', title: 'TRANSMISSION 08 — THE CROWN’S CHOICE', loreLink: 'sovereign-lore',
    tokens: toks(
      'The Sovereign could have unlocked everything. There is always one moment when a single turn of the key would hold the line. ' +
      'The Sovereign kept the crown instead, and enciphered the kingdom rather than fight for it. Now it warps the ground itself to stop you reading the last cipher.',
    ),
  },
  {
    id: 'int-the-fall', title: 'TRANSMISSION 09 — THE NIGHT IT FELL', loreLink: 'the-fall',
    tokens: toks(
      'When it came, it came as silence — and then as noise. The bells did not ring. The light scrambled to grey. ' +
      'Everyone had believed someone else was holding the line. The line had been theirs.',
    ),
  },
  {
    id: 'int-last-key', title: 'TRANSMISSION 10 — THE LAST KEY', loreLink: 'last-lance',
    tokens: toks(
      'You are not a soldier. You are the kingdom’s last memory of itself, sharpened to a single edge — ' +
      'the last key, a spear that reads the pattern and breaks it, sent back down through the fall. Every dash is the city refusing to stay scrambled.',
    ),
  },
  {
    id: 'int-echo', title: 'TRANSMISSION 11 — AN ECHO, DAILY', loreLink: 'echo',
    tokens: toks(
      'Each day a different citizen wakes inside the memory and lives one ordinary moment again — the bells, the markets, the gardens. ' +
      'The same echo for everyone, on the same day: one seed, one ciphertext, shared. It is not much. It is everything left.',
    ),
  },
  {
    id: 'int-what-remains', title: 'TRANSMISSION 12 — WHAT REMAINS', loreLink: 'what-remains',
    tokens: toks(
      'You cannot stop the fall. You were never meant to. Every cipher here can be broken but one — ' +
      'and that one cannot be solved, only chosen: catch the light, or let it go. No machine decides it. Prove that a dead thing remembered is not entirely dead.',
    ),
  },
  {
    id: 'int-gardens', title: 'TRANSMISSION 13 — THE GARDENS',
    tokens: toks(
      'In the Bloomgardens the patterns grew themselves — spots and spirals from nothing but a rule and a seed, ' +
      'the same quiet maths that decides a creature’s stripes. The city loved that a small machine of numbers could flower. So do we.',
    ),
  },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'to', 'in', 'it', 'is', 'was', 'as', 'for', 'on', 'no', 'so', 'we', 'i', 'you', 'they',
  'its', 'their', 'his', 'her', 'that', 'this', 'but', 'not', 'all', 'one', 'had', 'has', 'have', 'were', 'be', 'by',
  'at', 'or', 'with', 'who', 'what', 'when', 'why', 'how', 'than', 'then', 'up', 'out', 'down', 'over', 'into', 'if',
  'do', 'does', 'did', 'are', 'am', 'been', 'being', 'from', 'them', 'there', 'here', 'about', 'again', 'until', 'every',
]);

/** Canonical lowercase key for a token (strips surrounding punctuation; '' for pure punctuation). */
export function wordKey(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
}

/** Fragment cost to decrypt a vocabulary word — punctuation free, stopwords cheap, long/key words
 *  dearer. Pure + bounded [1..6]. Tunable; the gradient is what makes the economy read. */
export function wordCost(word: string): number {
  if (!word) return 0;
  if (STOPWORDS.has(word)) return 1;
  return Math.max(1, Math.min(6, 2 + Math.floor(word.length / 3)));
}

/** Every unique decryptable vocabulary word across all intercepts (lowercased; punctuation excluded). */
export function vocabulary(): string[] {
  const set = new Set<string>();
  for (const ic of INTERCEPTS) for (const t of ic.tokens) { const w = wordKey(t); if (w) set.add(w); }
  return [...set];
}

const GLYPHS = 'αβγδεζηθικλμνξοπρστυφχψω0123456789'.split('');
/** A deterministic, length-preserving glyph display for an undecrypted word (no rng). */
export function cipherWord(word: string): string {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i);
    out += /[a-z0-9]/i.test(word[i]) ? GLYPHS[(c * 7 + i * 13) % GLYPHS.length] : word[i];
  }
  return out;
}
