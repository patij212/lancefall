# THE BOMBE — Intercepts, the Fragment Economy & the Cockpit Codebreaker Console (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Memory Fragments a *perpetual, meaningful* sink and tell the whole history of Lancefall *through decryption*: a corpus of encrypted **INTERCEPTS** you crack **one word at a time** (decrypting a word reveals it across every transmission — real cryptanalysis), surfaced in an interactive cockpit **BOMBE** console with a master-cipher progress meter, an auto-cracking **Bombe** meta-tool, and optional untimed cryptanalysis **puzzles** that unlock rewards.

**Architecture:** All save-side, **determinism-irrelevant** (no `world.rng`, no sim). Two new pure modules own the logic: `src/intercepts.ts` (the catalog + a *vocabulary* decryption economy — `decryptedWords` is the set of cracked words; a word is decrypted globally or not) and `src/bombe.ts` (the auto-crack meta-tool + the console puzzles + verifiers). A new self-contained `panels/bombe.ts` modal renders the console. `save.ts`/`migrate.ts` get three additive fields (no version bump). `game.ts` gets thin mutator-callbacks mirroring `unlockLore`. `cockpitCipher.ts` reads master-cipher progress to light its backdrop. The existing codex memories stay as the read-only archive.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, happy-dom (panel tests). No new dependencies.

## Global Constraints

- **DEPTH, NOT DIFFICULTY.** This is meta/collection depth — *untimed*, *unfailable*, no combat pressure. Decryption is always optional; partial decryption is useful (a gappy transmission still reads). Nothing here touches the sim, the seed, or scoring.
- **DETERMINISM-SAFE BY CONSTRUCTION.** Pure save mutations only (`fragmentsSpent += cost`, `decryptedWords.push(word)`, `bombeLevel++`, `solvedPuzzles.push(id)`). **Never** `world.rng`, `Math.random`, or `Date.now`. `cipherWord` is a deterministic substitution. Run `src/determinism.test.ts` after every task as a backstop.
- **DON'T GROW THE GOD-FILES.** Logic lives in `intercepts.ts`/`bombe.ts` (pure, tested). The console is `panels/bombe.ts` (the panel convention). `ui.ts` gets only thin lifecycle wiring (build/append/open + a nav button + 3 callback declarations — mirror `heat`); `game.ts` gets only thin mutator-callbacks (mirror `unlockLore`, ~6 lines each).
- **SHARED-TREE STAGING.** `ui.ts`/`style.css` are live-edited by a concurrent card-agent (currently mid-edit on a `sandbox-pips` feature). NEVER `git add -A`. Stage only this plan's files by explicit path; for `ui.ts` verify the diff is *only* your hunks before staging (content-filter if needed — see the `lancefall-shared-tree-staging` memory).
- **Save additive — NO version bump.** Three new fields ride the `migrate.ts` generic loop (the precedent: `taught`/`glossSeen`). Add content sanitizers like `sanitizeTaught`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Branch:** `v6`.
- **Verify cadence:** `npx tsc --noEmit` + `npx vitest run` green after each task; prod build + boot smoke before deploy.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/intercepts.ts` | The intercept catalog + the vocabulary decryption economy. | **NEW** (pure) |
| `src/bombe.ts` | The Bombe auto-crack meta-tool + console puzzles + verifiers. | **NEW** (pure) |
| `src/save.ts` | `decryptedWords`/`bombeLevel`/`solvedPuzzles` fields + defaults. | **~** additive |
| `src/migrate.ts` | Sanitizers for the three fields. | **~** additive |
| `src/game.ts` | Mutator-callbacks (`onDecryptWord`/`onUpgradeBombe`/`onSolvePuzzle`); run-end auto-crack. | **~** thin |
| `src/panels/bombe.ts` | THE BOMBE console modal. | **NEW** (panel) |
| `src/ui.ts` | Build/append/open the panel; nav button; 3 callback decls. | **~** thin wiring |
| `src/cockpitCipher.ts` | Read master-cipher progress → backdrop intensity. | **~** additive read |
| `*.test.ts` | Pure economy/bombe/migrate + a happy-dom panel test. | **NEW/+** |

---

### Task 1: `intercepts.ts` — the catalog + word cipher (content + primitives)

**Files:** Create `src/intercepts.ts`, `src/intercepts.test.ts`.

**Interfaces — Produces:** `interface Intercept { id: string; title: string; loreLink?: string; tokens: string[] }`; `INTERCEPTS: Intercept[]`; `wordKey(token: string): string`; `wordCost(word: string): number`; `vocabulary(): string[]`; `cipherWord(word: string): string`.

- [ ] **Step 1: Write the failing test** — `src/intercepts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { INTERCEPTS, wordKey, wordCost, vocabulary, cipherWord } from './intercepts';
import { loreById } from './lore';

describe('intercepts — catalog + word primitives', () => {
  it('has a rich, well-formed catalog; every loreLink is a real LoreEntry', () => {
    expect(INTERCEPTS.length).toBeGreaterThanOrEqual(10);
    for (const ic of INTERCEPTS) {
      expect(ic.id).toMatch(/^[a-z0-9-]+$/);
      expect(ic.title.length).toBeGreaterThan(0);
      expect(ic.tokens.length).toBeGreaterThan(3);
      if (ic.loreLink) expect(loreById(ic.loreLink)).toBeTruthy();
    }
    // ids are unique
    expect(new Set(INTERCEPTS.map((i) => i.id)).size).toBe(INTERCEPTS.length);
  });

  it('wordKey canonicalises tokens; punctuation-only tokens key to empty', () => {
    expect(wordKey('Light,')).toBe('light');
    expect(wordKey('—')).toBe('');
    expect(wordKey("city's")).toBe("city's");
  });

  it('wordCost: punctuation free, stopwords cheap, long/key words dearer (pure, bounded 1..6)', () => {
    expect(wordCost('')).toBe(0);
    expect(wordCost('the')).toBe(1);
    expect(wordCost('light')).toBeGreaterThanOrEqual(2);
    expect(wordCost('enciphered')).toBeGreaterThanOrEqual(wordCost('light'));
    for (const w of ['a', 'sovereign', 'remember', 'key']) expect(wordCost(w)).toBeLessThanOrEqual(6);
  });

  it('vocabulary is the unique decryptable word set (no empties, deduped, lowercase)', () => {
    const v = vocabulary();
    expect(v.length).toBeGreaterThan(20);
    expect(new Set(v).size).toBe(v.length);
    expect(v).not.toContain('');
    expect(v.every((w) => w === w.toLowerCase())).toBe(true);
  });

  it('cipherWord is a deterministic, length-preserving glyph display (≠ plaintext)', () => {
    expect(cipherWord('light')).toBe(cipherWord('light')); // stable
    expect(cipherWord('light').length).toBe('light'.length);
    expect(cipherWord('light')).not.toBe('light');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/intercepts.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/intercepts.ts` — the primitives + the **full authored catalog**. Author **≥12 intercepts** telling the complete history (founding → the long evening → the Six, one transmission deepening each boss → the night it fell → the Last Key → the Choice → a Turing/morphogenesis nod), drawing voice + facts from `src/lore.ts` (the 13 entries) and `docs/SOLSTICE_JAM_SUBMISSION.md`. Each intercept's `loreLink` points at the matching `LoreEntry` id (`first-light`, `long-evening`, `the-fall`, `warden-lore`, `weaver-lore`, `beacon-lore`, `mirror-lore`, `hollow-lore`, `sovereign-lore`, `last-lance`, `echo`, `what-remains`). Write the prose as `tokens` (split on spaces; keep punctuation attached, e.g. `'light.'`). Primitives:

```ts
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

/** split an authored sentence into tokens (whitespace) — keeps punctuation attached to words. */
function toks(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

export const INTERCEPTS: Intercept[] = [
  {
    id: 'int-first-light', title: 'TRANSMISSION 01 — THE FIRST LIGHT', loreLink: 'first-light',
    tokens: toks('Before the battlefield a kingdom. Before the kingdom one light someone refused to let go out. They wrote the city around it in living code so the dark would always have somewhere to fail.'),
  },
  {
    id: 'int-long-evening', title: 'TRANSMISSION 02 — THE LONG EVENING', loreLink: 'long-evening',
    tokens: toks('No kingdom falls in a night. Lancefall fell over a hundred quiet evenings — a door unguarded a record unkept a key never turned. Each too small to call the end.'),
  },
  // … author the remaining ≥10 (one per boss + the fall + the last key + the choice + a Turing nod),
  //   each with its loreLink, in the same voice. Keep tokens ≥ 4; vary length 20–45 words.
];

const STOPWORDS = new Set([
  'the','a','an','of','and','to','in','it','is','was','as','for','on','no','so','we','i','you','they',
  'its','their','his','her','that','this','but','not','all','one','had','has','have','were','be','by',
  'at','or','with','who','what','when','why','how','than','then','up','out','down','over','into','if',
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
```

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run src/intercepts.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/intercepts.ts src/intercepts.test.ts` + commit `feat(lancefall): intercept catalog + word-cipher primitives (the history, encrypted)`.

---

### Task 2: `intercepts.ts` — the vocabulary decryption economy

**Files:** Modify `src/intercepts.ts`, `src/intercepts.test.ts`.

**Interfaces — Produces:** `isWordDecrypted(save, word): boolean`; `interceptWords(ic): string[]`; `interceptProgress(save, ic): { done: number; total: number }`; `isInterceptComplete(save, ic): boolean`; `masterProgress(save): { done: number; total: number; frac: number }`; `nextWordInIntercept(save, ic): string | null`; `tokenView(save, token): { text: string; decrypted: boolean; word: string; cost: number }`.

- [ ] **Step 1: Write the failing test** — append to `src/intercepts.test.ts`:

```ts
import { isWordDecrypted, interceptWords, interceptProgress, isInterceptComplete, masterProgress, nextWordInIntercept, tokenView } from './intercepts';
import { defaultSave } from './save';

const withWords = (...w: string[]) => ({ ...defaultSave(), decryptedWords: w });

describe('intercepts — the vocabulary economy', () => {
  it('a word is decrypted globally; interceptWords lists an intercept\'s unique words', () => {
    const ic = INTERCEPTS[0];
    const words = interceptWords(ic);
    expect(words.length).toBeGreaterThan(2);
    const s = withWords(words[0]);
    expect(isWordDecrypted(s, words[0])).toBe(true);
    expect(isWordDecrypted(s, words[1])).toBe(false);
  });

  it('interceptProgress + isInterceptComplete track decrypted/total', () => {
    const ic = INTERCEPTS[0];
    const words = interceptWords(ic);
    expect(interceptProgress(withWords(), ic)).toEqual({ done: 0, total: words.length });
    expect(isInterceptComplete(withWords(...words), ic)).toBe(true);
    expect(interceptProgress(withWords(...words), ic).done).toBe(words.length);
  });

  it('masterProgress is decrypted-vocabulary / total-vocabulary in [0,1]', () => {
    expect(masterProgress(withWords()).frac).toBe(0);
    const all = vocabulary();
    expect(masterProgress(withWords(...all)).frac).toBe(1);
  });

  it('nextWordInIntercept returns the cheapest undecrypted word, or null when complete', () => {
    const ic = INTERCEPTS[0];
    const next = nextWordInIntercept(withWords(), ic);
    expect(next).not.toBeNull();
    // it is the cheapest among the intercept's undecrypted words
    const costs = interceptWords(ic).map((w) => wordCost(w));
    expect(wordCost(next!)).toBe(Math.min(...costs));
    expect(nextWordInIntercept(withWords(...interceptWords(ic)), ic)).toBeNull();
  });

  it('tokenView shows plaintext for decrypted words + the glyph cipher for the rest', () => {
    const ic = INTERCEPTS[0];
    const word = interceptWords(ic)[0];
    const tok = ic.tokens.find((t) => wordKey(t) === word)!;
    expect(tokenView(withWords(word), tok).decrypted).toBe(true);
    expect(tokenView(withWords(word), tok).text).toBe(tok);
    expect(tokenView(withWords(), tok).decrypted).toBe(false);
    expect(tokenView(withWords(), tok).text).not.toBe(tok); // glyph-ciphered
  });
});
```

- [ ] **Step 2: Run, verify fail.** **Step 3: Implement** (append to `src/intercepts.ts`):

```ts
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

export function masterProgress(save: SaveData): { done: number; total: number; frac: number } {
  const vocab = vocabulary();
  const done = vocab.filter((w) => isWordDecrypted(save, w)).length;
  return { done, total: vocab.length, frac: vocab.length ? done / vocab.length : 0 };
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
```

- [ ] **Step 4: Run, verify pass.** **Step 5: Commit** `feat(lancefall): vocabulary decryption economy — global word reveals, master-cipher progress`.

---

### Task 3: Save fields + migrate sanitizers (additive, no version bump)

**Files:** Modify `src/save.ts`, `src/migrate.ts`, `src/migrate.test.ts`.

**Interfaces — Produces:** `SaveData` gains `decryptedWords: string[]`, `bombeLevel: number`, `solvedPuzzles: string[]`; `defaultSave()` defaults `[]/0/[]`; migrate sanitizes them.

- [ ] **Step 1: Failing test** — append to `src/migrate.test.ts` (match its existing import of `migrateSave`/`defaultSave`):

```ts
describe('migrate — BOMBE meta fields (additive)', () => {
  it('defaults the three new fields and survives a missing/garbage blob', () => {
    const d = migrateSave({}, defaultSave());
    expect(d.decryptedWords).toEqual([]);
    expect(d.bombeLevel).toBe(0);
    expect(d.solvedPuzzles).toEqual([]);
    const g = migrateSave({ decryptedWords: 'x', bombeLevel: -3.5, solvedPuzzles: 7 }, defaultSave());
    expect(g.decryptedWords).toEqual([]);     // non-array → reset
    expect(g.bombeLevel).toBe(0);             // negative/fractional → clamped to 0
    expect(g.solvedPuzzles).toEqual([]);
  });
  it('keeps valid string-array contents (deduped) and a sane bombeLevel', () => {
    const m = migrateSave({ decryptedWords: ['light', 'light', 'dawn'], bombeLevel: 2, solvedPuzzles: ['p1'] }, defaultSave());
    expect(m.decryptedWords.sort()).toEqual(['dawn', 'light']);
    expect(m.bombeLevel).toBe(2);
    expect(m.solvedPuzzles).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run, verify fail.** **Step 3: Implement.**

`src/save.ts` — add to the `SaveData` interface (after `lastRuns: LastRunDetail[];`):

```ts
  // ── THE BOMBE (Plan 2) — the meta decryption layer. All additive; save-side only (no rng). ──
  /** cracked vocabulary words (lowercased keys) — a word decrypted here resolves across every intercept */
  decryptedWords: string[];
  /** THE BOMBE meta-tool level (0 = not built); higher = cheaper words + more run-end auto-cracks */
  bombeLevel: number;
  /** ids of console cryptanalysis puzzles already solved (once-ever; unlocks their rewards) */
  solvedPuzzles: string[];
```

`src/save.ts` — add to `defaultSave()` return (after `lastRuns: [],`):

```ts
    decryptedWords: [],
    bombeLevel: 0,
    solvedPuzzles: [],
```

`src/migrate.ts` — after the `out.taught = sanitizeTaught(out.taught);` line, add:

```ts
  // Plan 2 BOMBE — additive. decryptedWords/solvedPuzzles are open-ended string sets (deduped,
  // capped like `taught`); bombeLevel is a non-negative integer (the generic loop only ensured
  // it's a finite number). No version bump — the generic loader already default-filled them.
  out.decryptedWords = sanitizeTaught(out.decryptedWords);
  out.solvedPuzzles = sanitizeTaught(out.solvedPuzzles);
  if (typeof out.bombeLevel === 'number') out.bombeLevel = Math.max(0, Math.floor(out.bombeLevel));
```

(`sanitizeTaught` already dedups + caps + filters to strings — reuse it; it's the exact contract these two fields need.)

- [ ] **Step 4: Run `npx vitest run src/migrate.test.ts` → pass.** **Step 5: Commit** `feat(lancefall): additive BOMBE save fields (decryptedWords/bombeLevel/solvedPuzzles) + sanitizers`.

---

### Task 4: The decrypt action + lore-on-completion (pure mutators)

**Files:** Modify `src/intercepts.ts`, `src/intercepts.test.ts`.

**Interfaces — Produces:** `decryptWord(save, word, costMul?): boolean` (spend + reveal; returns false if already done / unaffordable); `syncInterceptLore(save): string[]` (push loreLinks of any now-complete intercept not yet in `stillpointLore`; returns newly-unlocked ids).

- [ ] **Step 1: Failing test** — append to `src/intercepts.test.ts`:

```ts
import { decryptWord, syncInterceptLore } from './intercepts';
import { fragmentBalance } from './lore';

const richSave = (frags: number) => ({ ...defaultSave(), stillpointFragments: Array.from({ length: frags }, (_, i) => `f${i}`) });

describe('intercepts — decrypt action', () => {
  it('decryptWord spends exactly wordCost and reveals the word; refuses if unaffordable', () => {
    const s = richSave(10);
    const w = interceptWords(INTERCEPTS[0]).find((x) => wordCost(x) > 1)!;
    const before = fragmentBalance(s);
    expect(decryptWord(s, w)).toBe(true);
    expect(isWordDecrypted(s, w)).toBe(true);
    expect(fragmentBalance(s)).toBe(before - wordCost(w));
    expect(decryptWord(s, w)).toBe(false); // already decrypted → no double-charge
    const poor = { ...defaultSave(), stillpointFragments: [] };
    expect(decryptWord(poor, w)).toBe(false); // can't afford
    expect(isWordDecrypted(poor, w)).toBe(false);
  });

  it('a costMul (Bombe discount) reduces the charge but never below 1 for a real word', () => {
    const s = richSave(20);
    const w = interceptWords(INTERCEPTS[0]).find((x) => wordCost(x) >= 4)!;
    const before = fragmentBalance(s);
    decryptWord(s, w, 0.5);
    expect(before - fragmentBalance(s)).toBe(Math.max(1, Math.round(wordCost(w) * 0.5)));
  });

  it('syncInterceptLore unlocks a linked LoreEntry once its intercept is fully decrypted', () => {
    const ic = INTERCEPTS.find((i) => i.loreLink)!;
    const s = { ...defaultSave(), decryptedWords: interceptWords(ic) };
    const unlocked = syncInterceptLore(s);
    expect(unlocked).toContain(ic.loreLink);
    expect(s.stillpointLore).toContain(ic.loreLink);
    expect(syncInterceptLore(s)).toEqual([]); // idempotent — no re-unlock
  });
});
```

- [ ] **Step 2: Run, verify fail.** **Step 3: Implement** (append to `src/intercepts.ts`):

```ts
import { fragmentBalance } from './lore';

/** Decrypt one vocabulary word: charge ceil/round(cost*costMul) Fragments (min 1 for a real word)
 *  and reveal it everywhere. Returns false (no-op) if already decrypted or unaffordable. The ONLY
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
```

- [ ] **Step 4: Run, verify pass.** **Step 5: Commit** `feat(lancefall): decryptWord spend/reveal + lore-on-completion (the perpetual Fragment sink)`.

---

### Task 5: `bombe.ts` — the auto-crack meta-tool + console puzzles

**Files:** Create `src/bombe.ts`, `src/bombe.test.ts`.

**Interfaces — Produces:** `BOMBE_MAX_LEVEL: number`; `bombeCostMul(level): number`; `bombeAutoCracks(level): number`; `upgradeBombeCost(level): number`; `runBombe(save): string[]` (free auto-decrypt of the globally-cheapest undecrypted words, count = `bombeAutoCracks`); `upgradeBombe(save): boolean`; `CONSOLE_PUZZLES: ConsolePuzzle[]`; `checkPuzzle(id, guess): boolean`; `solvePuzzle(save, id, guess): boolean`.

- [ ] **Step 1: Failing test** — `src/bombe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BOMBE_MAX_LEVEL, bombeCostMul, bombeAutoCracks, upgradeBombeCost, runBombe, upgradeBombe, CONSOLE_PUZZLES, checkPuzzle, solvePuzzle } from './bombe';
import { defaultSave } from './save';
import { vocabulary, isWordDecrypted } from './intercepts';

const frags = (n: number) => ({ ...defaultSave(), stillpointFragments: Array.from({ length: n }, (_, i) => `f${i}`) });

describe('bombe — the auto-crack meta-tool', () => {
  it('higher levels lower word cost and crack more per run; bounded', () => {
    expect(bombeCostMul(0)).toBe(1);
    expect(bombeCostMul(BOMBE_MAX_LEVEL)).toBeLessThan(1);
    expect(bombeCostMul(2)).toBeLessThanOrEqual(bombeCostMul(1));
    expect(bombeAutoCracks(0)).toBe(0);
    expect(bombeAutoCracks(1)).toBeGreaterThanOrEqual(1);
  });

  it('runBombe decrypts the globally-cheapest undecrypted words for FREE (no fragment spend)', () => {
    const s = { ...frags(0), bombeLevel: 1 };
    const before = s.fragmentsSpent;
    const cracked = runBombe(s);
    expect(cracked.length).toBe(bombeAutoCracks(1));
    expect(s.fragmentsSpent).toBe(before); // free — the Bombe runs on its own
    for (const w of cracked) expect(isWordDecrypted(s, w)).toBe(true);
    expect(runBombe({ ...frags(0), bombeLevel: 0 })).toEqual([]); // no Bombe → nothing
  });

  it('upgradeBombe spends Fragments and raises the level, capped', () => {
    const s = { ...frags(50), bombeLevel: 0 };
    expect(upgradeBombe(s)).toBe(true);
    expect(s.bombeLevel).toBe(1);
    expect(s.fragmentsSpent).toBe(upgradeBombeCost(0));
    const maxed = { ...frags(999), bombeLevel: BOMBE_MAX_LEVEL };
    expect(upgradeBombe(maxed)).toBe(false); // already maxed
  });
});

describe('bombe — console cryptanalysis puzzles', () => {
  it('each puzzle has a prompt, a non-empty answer, and verifies case/space-insensitively', () => {
    expect(CONSOLE_PUZZLES.length).toBeGreaterThanOrEqual(3);
    for (const p of CONSOLE_PUZZLES) {
      expect(p.prompt.length).toBeGreaterThan(0);
      expect(p.answer.length).toBeGreaterThan(0);
      expect(checkPuzzle(p.id, p.answer)).toBe(true);
      expect(checkPuzzle(p.id, '  ' + p.answer.toLowerCase() + ' ')).toBe(true);
      expect(checkPuzzle(p.id, 'definitely-wrong')).toBe(false);
    }
  });
  it('solvePuzzle records a correct solve once; a wrong guess does nothing', () => {
    const p = CONSOLE_PUZZLES[0];
    const s = defaultSave();
    expect(solvePuzzle(s, p.id, 'nope')).toBe(false);
    expect(solvePuzzle(s, p.id, p.answer)).toBe(true);
    expect(s.solvedPuzzles).toContain(p.id);
    expect(solvePuzzle(s, p.id, p.answer)).toBe(false); // already solved
  });
});
```

- [ ] **Step 2: Run, verify fail.** **Step 3: Implement** `src/bombe.ts`:

```ts
// src/bombe.ts — THE BOMBE: a meta-tool that cracks the intercepts faster (an ode to Turing's
// bombe), plus the cockpit's optional cryptanalysis PUZZLES. PURE + save-side (no rng, no sim):
// upgradeBombe/runBombe/solvePuzzle only spend Fragments / push decrypted words / push solved ids.
import type { SaveData } from './save';
import { vocabulary, wordCost, isWordDecrypted } from './intercepts';

export const BOMBE_MAX_LEVEL = 5;

/** Word-cost multiplier from the Bombe level: 1.0 at L0 down to 0.5 at max (a smooth discount). */
export function bombeCostMul(level: number): number {
  const l = Math.max(0, Math.min(BOMBE_MAX_LEVEL, level));
  return 1 - (l / BOMBE_MAX_LEVEL) * 0.5;
}

/** How many words the Bombe auto-cracks for free at run-end (0 until built; +1 per ~2 levels). */
export function bombeAutoCracks(level: number): number {
  return level <= 0 ? 0 : Math.ceil(level / 2);
}

/** Fragment price to go from `level` to `level+1` (rising). */
export function upgradeBombeCost(level: number): number {
  return 8 + level * 6;
}

/** Run the Bombe: decrypt the globally-cheapest still-undecrypted words for FREE (no spend). The
 *  "it ran overnight" payoff. Returns the words cracked. Pure save mutation. */
export function runBombe(save: SaveData): string[] {
  const n = bombeAutoCracks(save.bombeLevel);
  if (n <= 0) return [];
  const undone = vocabulary().filter((w) => !isWordDecrypted(save, w)).sort((a, b) => wordCost(a) - wordCost(b) || a.localeCompare(b));
  const cracked = undone.slice(0, n);
  for (const w of cracked) save.decryptedWords.push(w);
  return cracked;
}

/** Build / upgrade the Bombe (spends Fragments). Returns false if maxed or unaffordable. */
export function upgradeBombe(save: SaveData): boolean {
  if (save.bombeLevel >= BOMBE_MAX_LEVEL) return false;
  const cost = upgradeBombeCost(save.bombeLevel);
  if (Math.max(0, save.stillpointFragments.length - save.fragmentsSpent) < cost) return false;
  save.fragmentsSpent += cost;
  save.bombeLevel += 1;
  return true;
}

export interface ConsolePuzzle {
  id: string;
  kind: 'caesar' | 'substitution' | 'vigenere';
  prompt: string;   // the ciphertext shown
  hint: string;     // a one-line nudge
  answer: string;   // the plaintext solution
  reward: string;   // human-readable reward label (wired to an unlock in game.ts)
}

/** Canonicalise a puzzle guess/answer for comparison (case + whitespace insensitive). */
function norm(s: string): string { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }

export const CONSOLE_PUZZLES: ConsolePuzzle[] = [
  { id: 'pz-caesar-1', kind: 'caesar', prompt: 'EULQJ EDFN WKH OLJKW', hint: 'A Caesar shift of 3. Turn it back.', answer: 'BRING BACK THE LIGHT', reward: 'A dash-trail cosmetic' },
  { id: 'pz-sub-1', kind: 'substitution', prompt: '★◆● ◇◆★★', hint: 'Three glyphs, four — the same word the Weaver scrambled. Read the shape.', answer: 'THE FALL', reward: 'A lore fragment' },
  { id: 'pz-vig-1', kind: 'vigenere', prompt: 'PVCS" XS WlE�', hint: 'Vigenère, key LANCE. The Beacon never sent it.', answer: 'LIGHT THE SIGNAL', reward: 'A Bombe boost' },
  // author more as desired — each must satisfy checkPuzzle(answer)===true.
];

export function checkPuzzle(id: string, guess: string): boolean {
  const p = CONSOLE_PUZZLES.find((x) => x.id === id);
  return !!p && norm(guess) === norm(p.answer);
}

/** Record a correct, first-time solve. Returns true only on the transition to solved. */
export function solvePuzzle(save: SaveData, id: string, guess: string): boolean {
  if (save.solvedPuzzles.includes(id)) return false;
  if (!checkPuzzle(id, guess)) return false;
  save.solvedPuzzles.push(id);
  return true;
}
```

> Author the puzzle `prompt`s so `checkPuzzle(answer)` holds (the test enforces it) — don't ship a prompt whose `answer` is wrong. (The `prompt` strings above are illustrative; verify each during implementation.)

- [ ] **Step 4: Run, verify pass.** **Step 5: Commit** `feat(lancefall): THE BOMBE auto-crack meta-tool + console cryptanalysis puzzles`.

---

### Task 6: `panels/bombe.ts` — THE BOMBE console modal

**Files:** Create `src/panels/bombe.ts`, `src/panels/bombe.test.ts`.

**Interfaces — Consumes:** `Panel` (`./panel`), `el`/`reconcile` (`./dom`), all of `intercepts.ts` + `bombe.ts`, `fragmentBalance` (`../lore`). **Produces:** `interface BombePanelDeps { onDecrypt: (interceptId: string) => void; onUpgradeBombe: () => void; onSolvePuzzle: (puzzleId: string, guess: string) => void; onClose: () => void }`; `buildBombePanel(deps): Panel`.

- [ ] **Step 1: Failing test** — `src/panels/bombe.test.ts` (happy-dom; mirror `panels/heat.test.ts` setup):

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildBombePanel } from './bombe';
import { defaultSave } from '../save';
import { INTERCEPTS, interceptWords, masterProgress } from '../intercepts';

describe('buildBombePanel', () => {
  const deps = { onDecrypt: vi.fn(), onUpgradeBombe: vi.fn(), onSolvePuzzle: vi.fn(), onClose: vi.fn() };
  it('renders a master meter + one card per intercept + a DECRYPT control', () => {
    const p = buildBombePanel(deps);
    p.open(defaultSave());
    expect(p.root.querySelector('.bombe-master')).toBeTruthy();
    const cards = p.root.querySelectorAll('.bombe-intercept');
    expect(cards.length).toBe(INTERCEPTS.length);
    expect(p.root.textContent).toMatch(/0%/); // master at 0% on a fresh save
  });
  it('a fully-decrypted intercept reads as plaintext; the master meter reflects progress', () => {
    const ic = INTERCEPTS[0];
    const save = { ...defaultSave(), decryptedWords: interceptWords(ic) };
    const p = buildBombePanel(deps);
    p.open(save);
    const card = p.root.querySelectorAll('.bombe-intercept')[0] as HTMLElement;
    expect(card.textContent).toContain(ic.tokens[0]); // first plaintext token shown
    expect(masterProgress(save).frac).toBeGreaterThan(0);
  });
  it('DECRYPT calls back with the intercept id', () => {
    const p = buildBombePanel(deps);
    p.open(defaultSave());
    const btn = p.root.querySelector('.bombe-intercept .bombe-decrypt') as HTMLButtonElement;
    btn.click();
    expect(deps.onDecrypt).toHaveBeenCalledWith(INTERCEPTS[0].id);
  });
});
```

- [ ] **Step 2: Run, verify fail.** **Step 3: Implement** `src/panels/bombe.ts` — the console: a master-cipher meter (`masterProgress.frac` → a width + a grey→neon class), a fragment-balance + Bombe status/upgrade row, a reconciled intercept list (each card: title, `done/total`, the ciphertext rendered token-by-token via `tokenView` with decrypted tokens in plaintext + a `bombe-decrypt` button showing `nextWordInIntercept`'s cost), and a puzzles section (each: prompt, an `<input>`, a submit calling `onSolvePuzzle`). Build the shell once; `open(save)` reconciles. Follow `panels/heat.ts` for the head/lead/body/close structure and `reconcile` for the lists. Keep all logic reads in `intercepts.ts`/`bombe.ts` — the panel only renders + calls back.

- [ ] **Step 4: Run, verify pass.** **Step 5: Commit** `feat(lancefall): THE BOMBE cockpit console panel (master meter + intercepts + puzzles)`.

---

### Task 7: Wire the console into game.ts + ui.ts (thin)

**Files:** Modify `src/game.ts`, `src/ui.ts`. (No new unit tests — verify via tsc + the panel test + a boot smoke; `ui.ts` has no coverage.)

**Interfaces — Consumes:** the pure mutators (`decryptWord`/`syncInterceptLore`/`upgradeBombe`/`solvePuzzle`/`nextWordInIntercept`), `buildBombePanel`. **Produces:** `UICallbacks` gains `onDecryptWord`/`onUpgradeBombe`/`onSolvePuzzle`; `UI` gains `openBombe()` + the panel; a cockpit nav button opens it.

- [ ] **Step 1: `game.ts` — the mutator methods** (mirror `unlockLore`, ~6 lines each). Add to the `cb` object (near `onUnlockLore`):

```ts
      onDecryptWord: (interceptId) => this.decryptIntercept(interceptId),
      onUpgradeBombe: () => this.upgradeBombe(),
      onSolvePuzzle: (puzzleId, guess) => this.solveConsolePuzzle(puzzleId, guess),
```

Add the methods (near `unlockLore`):

```ts
  private decryptIntercept(interceptId: string): void {
    const ic = INTERCEPTS.find((i) => i.id === interceptId);
    if (!ic) return;
    const word = nextWordInIntercept(this.save, ic);
    if (!word) return;
    if (!decryptWord(this.save, word, bombeCostMul(this.save.bombeLevel))) return;
    for (const id of syncInterceptLore(this.save)) this.ui.toast(`MEMORY DECRYPTED — ${loreById(id)?.title ?? ''}`);
    saveSave(this.save);
    this.ui.refreshMemories();
    this.ui.openBombe();
  }
  private upgradeBombe(): void {
    if (!upgradeBombe(this.save)) return;
    saveSave(this.save);
    this.ui.openBombe();
  }
  private solveConsolePuzzle(puzzleId: string, guess: string): void {
    if (!solvePuzzle(this.save, puzzleId, guess)) return;
    // reward hook: a solved puzzle grants a free Bombe word-crack (cheap, deterministic)
    runBombe(this.save);
    saveSave(this.save);
    this.ui.toast('CIPHER SOLVED');
    this.ui.openBombe();
  }
```

Add imports at the top of `game.ts`: `import { INTERCEPTS, nextWordInIntercept, decryptWord, syncInterceptLore } from './intercepts';` and `import { bombeCostMul, upgradeBombe, solvePuzzle, runBombe } from './bombe';` (and ensure `loreById` is imported — it likely already is for `unlockLore`).

> Use the real `UI` toast method name (check how `unlockLore`/announcements surface — e.g. `this.ui.toast(...)` or `this.ui.announce(...)`); match the existing call. If there is no toast, drop the toast lines (the visual is optional; the unlock still persists).

- [ ] **Step 2: `game.ts` — run-end auto-crack.** Find where a run ends + the save is persisted (near where `runHistory`/streak is written). Add: `for (const w of runBombe(this.save)) void w;` (the Bombe "runs overnight") BEFORE that `saveSave`. Keep it one line; it's free + deterministic.

- [ ] **Step 3: `ui.ts` — callbacks + panel + open + nav (thin, mirror `heat`).**
  - In the `UICallbacks` interface (near `onUnlockLore`): add `onDecryptWord: (interceptId: string) => void; onUpgradeBombe: () => void; onSolvePuzzle: (puzzleId: string, guess: string) => void;`.
  - Field + build (mirror `heatP`/`heatPanel`): `private bombeP!: Panel; private bombePanel!: HTMLElement;` then where panels are built: `this.bombeP = buildBombePanel({ onDecrypt: (id) => this.cb.onDecryptWord(id), onUpgradeBombe: () => this.cb.onUpgradeBombe(), onSolvePuzzle: (id, g) => this.cb.onSolvePuzzle(id, g), onClose: () => this.closeModal(this.bombePanel) }); this.bombePanel = this.bombeP.root;`
  - Append `this.bombePanel` to the `this.root.append(...)` list and add `[this.bombePanel, 'THE BOMBE']` to the modal-label registry (mirror `[this.heatPanel, 'Heat ascension']`).
  - `openBombe()` (public, mirror `openHeat`): `const s = this.saveRef; if (!s) return; this.bombeP.open(s); this.openModal(this.bombePanel);` (use the real open-modal call the other panels use).
  - A cockpit nav button (mirror the `codex` navBtn at ~1360): `navBtn('bombe', 'THE BOMBE', () => this.openBombe(), 'THE BOMBE — decrypt the intercepts, build the machine, break the city back into meaning.')`.
  - Import `buildBombePanel` + `type Panel`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run` green; build + boot smoke (open THE BOMBE in dev, decrypt a word, confirm the master meter rises + the intercept resolves + a completed intercept toasts its memory).

- [ ] **Step 5: Commit (content-filtered for `ui.ts`)** — stage `src/game.ts` + your `ui.ts` hunks only; `feat(lancefall): wire THE BOMBE console — decrypt/upgrade/solve callbacks + run-end auto-crack`.

---

### Task 8: `cockpitCipher.ts` — the master cipher lights the city

**Files:** Modify `src/cockpitCipher.ts`. (Verify via boot smoke; the module is defensive + untested by design.)

**Interfaces — Consumes:** `masterProgress` (`./intercepts`), the save (read from `localStorage` the same decoupled way it reads `stillpointChoice`).

- [ ] **Step 1: Implement** — in `cockpitCipher.ts`, read the save's `decryptedWords` (via the existing `localStorage.getItem('lancefall.save')` + `JSON.parse` pattern used by `readChoice`) and fold `masterProgress({...}).frac` into the backdrop's effective coherence floor — i.e. the more of the history you've decrypted, the more the CIPHER STORM resolves grey→neon (the meta mirror of FIRST LIGHT). Keep it inside the existing `targetCoh()`/`readChoice()` decoupling (a `readDecryptFrac()` helper, re-read on cockpit (re)entry like `choice`), clamped, and **never throwing into boot** (wrap in try/catch like `readChoice`). Respect reduce-motion (the STILL CITY path already holds a resolved frame).

- [ ] **Step 2: Verify** — build + boot smoke: a save with many `decryptedWords` shows a more-resolved title backdrop than a fresh save; 0 console errors.

- [ ] **Step 3: Commit** — `feat(lancefall): cockpit backdrop resolves with master-cipher decryption (the longest day, meta)`.

---

## Final verification

- [ ] `npx tsc --noEmit` clean (only the card-agent's unrelated `sandbox-pips` errors, if still present, are theirs).
- [ ] `npx vitest run` green (1150 + the new intercepts/bombe/migrate/panel tests).
- [ ] `npx vitest run src/determinism.test.ts` green (proves the meta layer never perturbs the sim).
- [ ] `npx vite build` + minified preview boots 0 errors; open THE BOMBE, decrypt words, watch the master meter + a memory unlock + the title backdrop resolve; solve a console puzzle.

## Self-Review (against the spec, pieces 3–5)

- **Piece 3 (history through decryption):** intercepts ⇄ lore via `loreLink` + `syncInterceptLore` (Task 4); decrypting completes the memory. ✓
- **Piece 4 (partial, costly Fragment economy):** vocabulary decryption, `decryptWord` charges `wordCost` (Tasks 2/4), cross-intercept reveal is intrinsic (a word is global), perpetual sink (≥12 intercepts × many words). ✓
- **Piece 5 (THE BOMBE console + meta-tool + puzzles):** `bombe.ts` (Task 5) + `panels/bombe.ts` (Task 6) + master-cipher backdrop (Task 8). ✓
- **Determinism:** every mutator is a pure save write (no rng/sim); `cipherWord` is deterministic; the determinism test is the backstop. ✓
- **Structural:** logic in `intercepts.ts`/`bombe.ts`; the console is a `panels/*` module; `ui.ts`/`game.ts` get only thin wiring. ✓
- **Type consistency:** `decryptedWords`/`bombeLevel`/`solvedPuzzles`, `Intercept`/`ConsolePuzzle`, `decryptWord`/`runBombe`/`solvePuzzle`/`masterProgress`/`nextWordInIntercept` are named identically across tasks + consumers. ✓
```
