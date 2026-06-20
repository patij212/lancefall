// src/intercepts.ts — THE INTERCEPTS. The full history of Lancefall as encrypted transmissions
// you DECRYPT word-by-word with Memory Fragments. PURE + save-side: the only writes are
// fragmentsSpent += cost and decryptedWords.push(word) — never rng, never the sim. Decryption is
// by VOCABULARY: cracking a word reveals every occurrence across all transmissions (you build the
// key — cryptanalysis-true), so Fragments are a perpetual sink and the history is told by decoding.
import type { SaveData } from './save';
import { fragmentBalance } from './lore';

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
  {
    id: 'int-last', title: 'TRANSMISSION XIV — THE LONGEST DAY',
    tokens: toks(
      'Every name read. Every cipher broken. You held the line from the last dark edge to the light — ' +
      'the kingdom’s last memory, now written again. The fall is not the end. The light did not fail.',
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

// The high-meaning words — the names + verbs that carry the fall. Cracking one of these resolves a
// load-bearing piece of the history (display-only rarity; it does NOT change wordCost — depth, not
// difficulty). Lowercase keys.
const KEY_WORDS = new Set([
  'lancefall', 'sovereign', 'warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'light', 'key',
  'cipher', 'enciphered', 'remember', 'memory', 'kingdom', 'crown', 'fall', 'fell', 'spear', 'echo',
]);

export type WordRarity = 'common' | 'rare' | 'key';

/** Display-only rarity of a vocabulary word — for the console's glyph styling + a "key word" badge.
 *  KEY words are the load-bearing names/verbs of the fall; long/dear words read as rare; the rest
 *  common. Pure; independent of wordCost so it never shifts the economy. */
export function wordRarity(word: string): WordRarity {
  if (!word) return 'common';
  if (KEY_WORDS.has(word)) return 'key';
  return word.length >= 8 || wordCost(word) >= 5 ? 'rare' : 'common';
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

// ── the vocabulary decryption economy ───────────────────────────────────────

export function isWordDecrypted(save: SaveData, word: string): boolean {
  return save.decryptedWords.includes(word);
}

/** The unique decryptable words in one intercept (lowercased keys). */
export function interceptWords(ic: Intercept): string[] {
  const set = new Set<string>();
  for (const t of ic.tokens) { const w = wordKey(t); if (w) set.add(w); }
  return [...set];
}

export function interceptProgress(save: SaveData, ic: Intercept): { done: number; total: number } {
  const words = interceptWords(ic);
  return { done: words.filter((w) => isWordDecrypted(save, w)).length, total: words.length };
}

export function isInterceptComplete(save: SaveData, ic: Intercept): boolean {
  const { done, total } = interceptProgress(save, ic);
  return total > 0 && done === total;
}

/** How many transmissions are fully decrypted (for the decryption achievements + the console
 *  completion count). Pure, save-side. */
export function transmissionsComplete(save: SaveData): number {
  return INTERCEPTS.filter((ic) => isInterceptComplete(save, ic)).length;
}

export function masterProgress(save: SaveData): { done: number; total: number; frac: number } {
  const vocab = vocabulary();
  const done = vocab.filter((w) => isWordDecrypted(save, w)).length;
  return { done, total: vocab.length, frac: vocab.length ? done / vocab.length : 0 };
}

/** True once every vocabulary word is decrypted — THE LONGEST DAY (100%). Pure save read. */
export function isLongestDay(save: SaveData): boolean {
  return masterProgress(save).frac >= 1;
}

/** The cheapest still-undecrypted word in an intercept (the "decrypt next" + Bombe target). */
export function nextWordInIntercept(save: SaveData, ic: Intercept): string | null {
  const undone = interceptWords(ic).filter((w) => !isWordDecrypted(save, w));
  if (!undone.length) return null;
  return undone.reduce((best, w) => (wordCost(w) < wordCost(best) ? w : best), undone[0]);
}

/** How a token renders in the console: plaintext if its word is decrypted (or it's punctuation),
 *  else the glyph cipher. `word` is its key ('' for punctuation), `cost` its decrypt price. */
export function tokenView(save: SaveData, token: string): { text: string; decrypted: boolean; word: string; cost: number } {
  const word = wordKey(token);
  const decrypted = !word || isWordDecrypted(save, word);
  const text = decrypted ? token : token.replace(/[a-z0-9]+/gi, (m) => cipherWord(m));
  return { text, decrypted, word, cost: wordCost(word) };
}

/** Is there at least one still-undecrypted word the player can afford right now (at the given cost
 *  multiplier)? Drives the THE BOMBE nav pip — "decryption waiting". Pure, save-side, no rng. */
export function hasAffordableDecrypt(save: SaveData, costMul = 1): boolean {
  const bal = fragmentBalance(save);
  if (bal <= 0) return false;
  for (const w of vocabulary()) {
    if (isWordDecrypted(save, w)) continue;
    if (Math.max(1, Math.round(wordCost(w) * costMul)) <= bal) return true;
  }
  return false;
}

// ── the decrypt action + lore-on-completion (pure save mutators) ─────────────

/** Decrypt one vocabulary word: charge round(cost*costMul) Fragments (min 1 for a real word) and
 *  reveal it everywhere. Returns false (no-op) if already decrypted or unaffordable. The ONLY
 *  writes are fragmentsSpent + decryptedWords — pure save mutation, no rng. */
export function decryptWord(save: SaveData, word: string, costMul = 1): boolean {
  if (!word || isWordDecrypted(save, word)) return false;
  const cost = Math.max(1, Math.round(wordCost(word) * costMul));
  if (fragmentBalance(save) < cost) return false;
  save.fragmentsSpent += cost;
  save.decryptedWords.push(word);
  return true;
}

/** Push the loreLink of every now-fully-decrypted intercept not already remembered. Returns the
 *  newly-unlocked lore ids (for a toast). Idempotent. Pure save mutation. */
export function syncInterceptLore(save: SaveData): string[] {
  const out: string[] = [];
  for (const ic of INTERCEPTS) {
    if (ic.loreLink && isInterceptComplete(save, ic) && !save.stillpointLore.includes(ic.loreLink)) {
      save.stillpointLore.push(ic.loreLink);
      out.push(ic.loreLink);
    }
  }
  return out;
}
