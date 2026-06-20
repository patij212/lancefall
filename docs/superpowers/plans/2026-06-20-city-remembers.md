# THE CITY REMEMBERS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make decryption the act of bringing a dead city back — deep authored CITIZENS, the dossier web, the choice-authored last cipher, an Enigma puzzle, a district-by-district skyline rebuild, 25/50/75% milestone beats, and a "signal restored" moment.

**Architecture:** New PURE modules (`citizens.ts`, `dossiers.ts`, `cipherMilestones.ts`) carry the logic, fully unit-tested and DERIVED from existing save state (no new "woken"/"milestone" save fields). Thin additive wiring in `game.ts`/`ui.ts`/`panels/*`/`cockpitCipher.ts`. Everything is pure/meta/render — nothing touches the run sim or rng.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Canvas 2D, Web Audio. No new dependencies.

## Global Constraints

- **No run-sim / rng contact.** Every new symbol is pure save-read or render. No `world.rng`/`eventRng` use. (Encrypted relics — the only run-layer idea — are DEFERRED, not in this plan.)
- **No new mid-run reading.** All text lives in calm contexts (codex, run-end debrief, cockpit, the signal-restored console moment). Mid-run, citizen returns are purely VISUAL (skyline windows).
- **Derive, don't store.** Citizens woken, dossier progress, and milestones all derive from `decryptedWords`/`stillpointLore`/`stillpointChoice`/`achievements`. NO `SAVE_VERSION` bump; additive fields only if unavoidable (none expected).
- **Tests** for every pure module + extended `achievements.test.ts`/`intercepts.test.ts`. `npx tsc --noEmit` clean + `npx vitest run` green (baseline ~1239) before every commit.
- **Shared-file staging:** `ui.ts`, `style.css`, `panels/bombe.ts` are live-edited by other agents. NEVER `git add -A`; stage only own hunks (content-filtered `git apply --cached` from repo root — Python hunk-extraction, decode UTF-8 with `errors='surrogateescape'`; plain `git apply --cached`, NOT `--recount`). Append CSS at file end.
- **No UTF-8 BOM:** every source file must start directly with its first char (`//`/`import`/`:root`). Verify first 3 bytes after editing.
- **GitNexus:** `impact` before editing existing symbols; `detect_changes` before commits; fall back to grep if locked.
- Repo: branch `v6`, CRLF (git autocrlf — use Edit/sed). The 14 transmission ids: `int-first-light, int-long-evening, int-warden, int-weaver, int-beacon, int-mirror, int-hollow, int-crown, int-the-fall, int-last-key, int-echo, int-what-remains, int-gardens, int-last`. The Six (EnemyKind): `warden, weaver, beacon, mirrorblade, hollow, sovereign`.

---

## Task 1: `citizens.ts` — the roster + woken-derive (pure)

**Files:** Create `src/citizens.ts`, `src/citizens.test.ts`

**Interfaces:**
- Consumes: `INTERCEPTS`, `isInterceptComplete`, `masterProgress` (`./intercepts`); `EnemyKind` (`./types`); `SaveData` (`./save`).
- Produces: `Citizen` interface; `CITIZENS: Citizen[]` (16); `wokenCitizens(save): Citizen[]`; `cityRememberedCount(save): {woken:number; total:number}`; `MILESTONE_WAKE = {m50:0.5, m75:0.75}`.

- [ ] **Step 1: Write failing tests** — `src/citizens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords } from './intercepts';
import { CITIZENS, wokenCitizens, cityRememberedCount } from './citizens';

const TRANSMISSION_IDS = new Set(INTERCEPTS.map((i) => i.id));
const FIGURES = new Set(['warden','weaver','beacon','mirrorblade','hollow','sovereign']);

describe('CITIZENS roster', () => {
  it('has 16 citizens with unique ids and non-empty memory + deeper text', () => {
    expect(CITIZENS).toHaveLength(16);
    expect(new Set(CITIZENS.map((c) => c.id)).size).toBe(16);
    for (const c of CITIZENS) {
      expect(c.name).toBeTruthy(); expect(c.role).toBeTruthy();
      expect(c.memory.length).toBeGreaterThan(20);
      expect(c.deeper.length).toBeGreaterThan(20);
    }
  });
  it('every wakeBy is a real transmission id or a milestone key; every figure is real', () => {
    for (const c of CITIZENS) {
      const ok = TRANSMISSION_IDS.has(c.wakeBy) || c.wakeBy === 'm50' || c.wakeBy === 'm75';
      expect(ok).toBe(true);
      if (c.figure) expect(FIGURES.has(c.figure)).toBe(true);
    }
  });
  it('every transmission wakes exactly one citizen', () => {
    for (const ic of INTERCEPTS) {
      expect(CITIZENS.filter((c) => c.wakeBy === ic.id)).toHaveLength(1);
    }
  });
});

describe('wokenCitizens', () => {
  it('none woken on a fresh save; rises as transmissions complete', () => {
    const s = defaultSave();
    expect(wokenCitizens(s)).toHaveLength(0);
    // complete the warden transmission → its citizen wakes
    const warden = INTERCEPTS.find((i) => i.id === 'int-warden')!;
    s.decryptedWords.push(...interceptWords(warden));
    const woken = wokenCitizens(s);
    expect(woken.some((c) => c.wakeBy === 'int-warden')).toBe(true);
  });
  it('milestone citizens wake at 50%/75% master fraction', () => {
    const s = defaultSave();
    const { vocabulary } = require('./intercepts');
    const vocab: string[] = vocabulary();
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.5));
    expect(wokenCitizens(s).some((c) => c.wakeBy === 'm50')).toBe(true);
    expect(wokenCitizens(s).some((c) => c.wakeBy === 'm75')).toBe(false);
  });
  it('cityRememberedCount reports woken/total', () => {
    const s = defaultSave();
    expect(cityRememberedCount(s)).toEqual({ woken: 0, total: 16 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/citizens.test.ts`.

- [ ] **Step 3: Implement** `src/citizens.ts`. Author all 16 in the ECHO voice (second person/elegiac, matching `stillpoint.ts ECHO_MEMORIES`). Use this EXACT mapping (citizen ↔ transmission ↔ figure); author `memory` (2–3 sentences, what they remember of the city) + `deeper` (a fuller paragraph — their part in the fall, revealed once their figure's dossier completes or — for figure-less citizens — at 100%):

```ts
// src/citizens.ts — THE CITY REMEMBERS. The people of Lancefall, woken by decryption. PURE +
// derived: a citizen is "woken" iff the transmission (or master-% milestone) that names them is
// decrypted — no stored "woken" field. Read in calm contexts (codex/debrief); felt mid-run only
// as a skyline window lighting. Voice carried from stillpoint.ts ECHO_MEMORIES.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, isInterceptComplete, masterProgress } from './intercepts';

export interface Citizen {
  id: string;
  name: string;            // 'The Lamplighter'
  role: string;            // one line — what they were
  wakeBy: string;          // transmission id, or 'm50' | 'm75'
  figure?: EnemyKind;      // the Six figure they're tied to (dossier weave)
  memory: string;          // 2–3 sentences — what they remember
  deeper: string;          // fuller paragraph — revealed once figure dossier complete / 100%
}

export const MILESTONE_WAKE: Record<string, number> = { m50: 0.5, m75: 0.75 };

export const CITIZENS: Citizen[] = [
  { id: 'lamplighter', name: 'The Lamplighter', role: 'kept the lattice-lights', wakeBy: 'int-first-light',
    memory: '…', deeper: '…' },
  { id: 'archivist', name: 'The Archivist', role: 'kept the records', wakeBy: 'int-long-evening',
    memory: '…', deeper: '…' },
  { id: 'gatewarden', name: 'The Gate-Warden', role: 'stood the wall', wakeBy: 'int-warden', figure: 'warden',
    memory: '…', deeper: '…' },
  { id: 'chorister', name: 'The Chorister', role: 'sang the evening down', wakeBy: 'int-weaver', figure: 'weaver',
    memory: '…', deeper: '…' },
  { id: 'ferryman', name: 'The Ferryman', role: 'waited at the dark water', wakeBy: 'int-beacon', figure: 'beacon',
    memory: '…', deeper: '…' },
  { id: 'glassblower', name: 'The Glassblower', role: 'made the mirrors', wakeBy: 'int-mirror', figure: 'mirrorblade',
    memory: '…', deeper: '…' },
  { id: 'stonemason', name: 'The Stonemason', role: 'built what outlived them', wakeBy: 'int-hollow', figure: 'hollow',
    memory: '…', deeper: '…' },
  { id: 'courier', name: 'The Courier', role: 'carried the last order', wakeBy: 'int-crown', figure: 'sovereign',
    memory: '…', deeper: '…' },
  { id: 'bellringer', name: 'The Bell-Ringer', role: 'rang the hours', wakeBy: 'int-the-fall',
    memory: '…', deeper: '…' },
  { id: 'clockwright', name: 'The Clockwright', role: 'made the mechanism', wakeBy: 'int-last-key',
    memory: '…', deeper: '…' },
  { id: 'cartographer', name: 'The Cartographer', role: 'mapped what is gone', wakeBy: 'int-echo',
    memory: '…', deeper: '…' },
  { id: 'stargazer', name: 'The Stargazer', role: 'watched for the dawn', wakeBy: 'int-what-remains',
    memory: '…', deeper: '…' },
  { id: 'gardener', name: 'The Gardener', role: 'tended the Bloomgardens', wakeBy: 'int-gardens',
    memory: '…', deeper: '…' },
  { id: 'vintner', name: 'The Vintner', role: 'kept a wine for the longest day', wakeBy: 'int-last',
    memory: '…', deeper: '…' },
  { id: 'candlemaker', name: 'The Candle-Maker', role: 'against the dark', wakeBy: 'm50',
    memory: '…', deeper: '…' },
  { id: 'weaver-cloth', name: 'The Weaver', role: 'wove the city its colours', wakeBy: 'm75',
    memory: '…', deeper: '…' },
];

/** A citizen is woken once the transmission (or master-% milestone) that names them is decrypted. */
export function isCitizenWoken(save: SaveData, c: Citizen): boolean {
  if (c.wakeBy in MILESTONE_WAKE) return masterProgress(save).frac >= MILESTONE_WAKE[c.wakeBy];
  const ic = INTERCEPTS.find((i) => i.id === c.wakeBy);
  return !!ic && isInterceptComplete(save, ic);
}

export function wokenCitizens(save: SaveData): Citizen[] {
  return CITIZENS.filter((c) => isCitizenWoken(save, c));
}

export function cityRememberedCount(save: SaveData): { woken: number; total: number } {
  return { woken: wokenCitizens(save).length, total: CITIZENS.length };
}
```

Replace every `'…'` with authored prose (the test enforces length > 20; author in voice). `int-last` is the 14th transmission (THE LONGEST DAY) — its citizen the Vintner.

- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add src/citizens.ts src/citizens.test.ts && git commit` → `feat(lancefall): citizens.ts — the people of Lancefall, woken by decryption (pure)` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Task 2: `dossiers.ts` — the figure dossier web (pure)

**Files:** Create `src/dossiers.ts`, `src/dossiers.test.ts`

**Interfaces:**
- Consumes: `INTERCEPTS`, `wordKey`, `isWordDecrypted`, `wordRarity` (`./intercepts`); `EnemyKind`.
- Produces: `figureDossier(save, kind): { revealed: number; total: number; frac: number; lines: string[] }`; `DOSSIER_FIGURES: EnemyKind[]`; `citizenDeeperUnlocked(save, c): boolean` (consumed by Task 6 UI).

- [ ] **Step 1: Write failing tests** — `src/dossiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords } from './intercepts';
import { figureDossier, DOSSIER_FIGURES, citizenDeeperUnlocked } from './dossiers';
import { CITIZENS } from './citizens';

describe('figureDossier', () => {
  it('covers the six figures, each with a positive mention total', () => {
    expect(DOSSIER_FIGURES).toHaveLength(6);
    for (const k of DOSSIER_FIGURES) {
      const d = figureDossier(defaultSave(), k);
      expect(d.total).toBeGreaterThan(0);
      expect(d.revealed).toBe(0); // nothing decrypted yet
      expect(d.lines).toHaveLength(0);
    }
  });
  it('reveals progressively as that figure’s mentions are decrypted', () => {
    const s = defaultSave();
    const warden = INTERCEPTS.find((i) => i.id === 'int-warden')!;
    s.decryptedWords.push(...interceptWords(warden));
    const d = figureDossier(s, 'warden');
    expect(d.revealed).toBeGreaterThan(0);
    expect(d.frac).toBeGreaterThan(0);
    expect(d.lines.length).toBeGreaterThan(0); // at least the first threshold line
  });
});

describe('citizenDeeperUnlocked', () => {
  it('false for a figure-citizen until the figure dossier completes', () => {
    const s = defaultSave();
    const gw = CITIZENS.find((c) => c.id === 'gatewarden')!;
    expect(citizenDeeperUnlocked(s, gw)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `src/dossiers.ts`:

```ts
// src/dossiers.ts — THE DOSSIER WEB. Each of the Six has a dossier that synthesises from how many
// of that figure's key-word mentions are decrypted across all transmissions. PURE + derived.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, wordKey, isWordDecrypted } from './intercepts';

export const DOSSIER_FIGURES: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];

// The decryptable word(s) that name each figure (lowercased keys). The dossier reveals as these
// occurrences are decrypted across the transmissions.
const FIGURE_WORDS: Record<EnemyKind, string[]> = {
  warden: ['warden'], weaver: ['weaver'], beacon: ['beacon'],
  mirrorblade: ['mirrorblade'], hollow: ['hollow'], sovereign: ['sovereign', 'crown'],
} as Record<EnemyKind, string[]>;

// 3 authored dossier lines per figure, unlocked at 1/3, 2/3, full of their decrypted mentions.
const DOSSIER_LINES: Record<EnemyKind, [string, string, string]> = {
  warden: ['…', '…', '…'], weaver: ['…', '…', '…'], beacon: ['…', '…', '…'],
  mirrorblade: ['…', '…', '…'], hollow: ['…', '…', '…'], sovereign: ['…', '…', '…'],
} as Record<EnemyKind, [string, string, string]>;

/** Every token occurrence (across all transmissions) whose word key is one of the figure's words. */
function figureOccurrences(kind: EnemyKind): string[] {
  const words = new Set(FIGURE_WORDS[kind] ?? []);
  const out: string[] = [];
  for (const ic of INTERCEPTS) for (const t of ic.tokens) { const w = wordKey(t); if (words.has(w)) out.push(w); }
  return out;
}

export function figureDossier(save: SaveData, kind: EnemyKind): { revealed: number; total: number; frac: number; lines: string[] } {
  const occ = figureOccurrences(kind);
  const total = occ.length;
  const revealed = occ.filter((w) => isWordDecrypted(save, w)).length;
  const frac = total ? revealed / total : 0;
  const lines = DOSSIER_LINES[kind];
  const shown: string[] = [];
  if (frac > 0) shown.push(lines[0]);
  if (frac >= 2 / 3) shown.push(lines[1]);
  if (frac >= 1) shown.push(lines[2]);
  return { revealed, total, frac, lines: shown };
}

/** A figure-citizen's `deeper` unlocks when its figure's dossier is complete; figure-less citizens
 *  unlock `deeper` at 100% master cipher. */
export function citizenDeeperUnlocked(save: SaveData, c: { figure?: EnemyKind }): boolean {
  if (c.figure) return figureDossier(save, c.figure).frac >= 1;
  return INTERCEPTS.length > 0 && require('./intercepts').masterProgress(save).frac >= 1;
}
```

> Replace `'…'` with authored dossier prose (3 escalating lines per figure, in the lore voice — e.g. warden: rumour → record → the turned lock). Author so each reads as a deepening intelligence file. Use a static `import { masterProgress }` at top instead of `require` (the `require` above is illustrative — convert to a normal import).

- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(lancefall): dossiers.ts — the figure dossier web (pure)`.

## Task 3: THE LAST CIPHER — choice-authored tail

**Files:** Modify `src/intercepts.ts` (add `CHOICE_TAIL` + `choiceTail`); Test: `src/intercepts.test.ts`

**Interfaces:** Produces `CHOICE_TAIL: Record<'catch'|'fall', string>`; `choiceTail(save): string | null`.

- [ ] **Step 1: Write failing test** (append to `src/intercepts.test.ts`):

```ts
import { CHOICE_TAIL, choiceTail, vocabulary } from './intercepts';

describe('THE LAST CIPHER (choice-authored tail)', () => {
  it('is null until a choice is made, then the chosen sentence', () => {
    const s = defaultSave();
    expect(choiceTail(s)).toBeNull();
    s.stillpointChoice = 'catch'; expect(choiceTail(s)).toBe(CHOICE_TAIL.catch);
    s.stillpointChoice = 'fall'; expect(choiceTail(s)).toBe(CHOICE_TAIL.fall);
  });
  it('the tail text adds NO new vocabulary words (100% reachable without a choice)', () => {
    const vocab = new Set(vocabulary());
    const tailWords = `${CHOICE_TAIL.catch} ${CHOICE_TAIL.fall}`.toLowerCase().match(/[a-z0-9']+/g) ?? [];
    // tail is separate data — it must not be among INTERCEPTS tokens, so vocab is unchanged size.
    expect(vocab.size).toBe(265); // adjust to the current vocabulary count if it differs
  });
});
```

(If the vocab count differs from 265, set the literal to `vocabulary().length` captured before — i.e. assert it equals the pre-existing constant; the point is the tail does NOT change it.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `src/intercepts.ts` (near `isLongestDay`):

```ts
/** THE LAST CIPHER — the one that "cannot be solved, only chosen." Separate authored data (NOT in
 *  any transmission's tokens, so vocabulary()/masterProgress are untouched). Resolves by the
 *  Sovereign-kill choice. Echoes stillpoint.choiceEnding. */
export const CHOICE_TAIL: Record<'catch' | 'fall', string> = {
  catch: 'And the last word, you did not decode — you held it. The light stays. The longest day does not end.',
  fall: 'And the last word, you did not decode — you let it go. The light is released, and the dark comes gently, and it is over.',
};
export function choiceTail(save: SaveData): string | null {
  return save.stillpointChoice === 'catch' || save.stillpointChoice === 'fall' ? CHOICE_TAIL[save.stillpointChoice] : null;
}
```

- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(lancefall): THE LAST CIPHER — choice-authored tail (pure, vocab-untouched)`.

## Task 4: THE ENIGMA puzzle + cryptanalyst INSIGHT bonus

**Files:** Modify `src/bombe.ts`; Test: `src/bombe.test.ts`

**Interfaces:** Adds `'enigma'` to `ConsolePuzzle.kind`; a `pz-enigma-1` entry; `grantCryptanalystBonus(save): boolean` (idempotent — grants +1 INSIGHT when all puzzles solved).

- [ ] **Step 1: impact** — `impact({target:'solvePuzzleReward'})`; report.
- [ ] **Step 2: Write failing tests** — append to `src/bombe.test.ts`:

```ts
import { CONSOLE_PUZZLES, checkPuzzle, solvePuzzleReward, grantCryptanalystBonus } from './bombe';

describe('THE ENIGMA puzzle', () => {
  it('exists, is kind enigma, and round-trips (prompt decodes to answer, prompt != answer)', () => {
    const p = CONSOLE_PUZZLES.find((x) => x.id === 'pz-enigma-1')!;
    expect(p.kind).toBe('enigma');
    expect(checkPuzzle('pz-enigma-1', p.answer)).toBe(true);
    expect(p.prompt).not.toBe(p.answer);
  });
});

describe('grantCryptanalystBonus', () => {
  it('grants +1 INSIGHT once all puzzles are solved, idempotent', () => {
    const s = defaultSave();
    s.solvedPuzzles = CONSOLE_PUZZLES.map((p) => p.id);
    expect(grantCryptanalystBonus(s)).toBe(true);
    expect(s.bombeBranches.insight).toBe(1);
    expect(grantCryptanalystBonus(s)).toBe(false); // idempotent
    expect(s.bombeBranches.insight).toBe(1);
  });
  it('does nothing until all are solved', () => {
    const s = defaultSave();
    s.solvedPuzzles = CONSOLE_PUZZLES.slice(0, -1).map((p) => p.id);
    expect(grantCryptanalystBonus(s)).toBe(false);
  });
});
```

- [ ] **Step 3: Implement.**
  - Add `| 'enigma'` to `ConsolePuzzle.kind`.
  - Author a `pz-enigma-1` entry. A simple single-rotor cipher the player CAN solve by hand: e.g. a Caesar whose shift INCREMENTS by 1 each letter (a 1-step rotor). Author `prompt` (ciphertext), `answer` (plaintext, lore-voiced), `hint` ("A single rotor — the shift advances by one with every letter."), `reward` string. **Verify by hand the prompt decodes to the answer** under the stated rule. Because `checkPuzzle` compares `norm(guess)===norm(answer)`, no check-logic change is needed.
  - Add `grantCryptanalystBonus(save)`: `const all = CONSOLE_PUZZLES.every(p => save.solvedPuzzles.includes(p.id)); if (!all || save.bombeBranches.insight >= BRANCH_MAX) ... ` — only grant if all solved AND insight not already raised by this bonus. To keep idempotent without a new field, gate on a synthetic marker: push `'cryptanalyst-insight'` to `save.solvedPuzzles`? No — cleaner: track via a dedup using `save.achievements` is wrong domain. Use: grant only if `all && !save.solvedPuzzles.includes('__cryptanalyst_bonus__')`, then push that sentinel id (it's a string set already; sentinel never matches a real puzzle). Increment `save.bombeBranches.insight` (capped `BRANCH_MAX`) + resync `save.bombeLevel`. Return whether granted.
- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit && npx vitest run`.
- [ ] **Step 5: Commit** — `feat(lancefall): THE ENIGMA puzzle + cryptanalyst INSIGHT bonus`.

## Task 5: `cipherMilestones.ts` — 25/50/75% beats (pure) + achievements

**Files:** Create `src/cipherMilestones.ts`, `src/cipherMilestones.test.ts`; Modify `src/achievements.ts` (+ `achievements.test.ts`).

**Interfaces:** Produces `CIPHER_MILESTONES = [0.25,0.5,0.75]`; `grantCipherMilestones(save): {tier:number; fragments:number}[]` (idempotent, synthetic dedup'd fragment ids); achievements `decrypt25/decrypt50/decrypt75`.

- [ ] **Step 1: Write failing tests** — `src/cipherMilestones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';
import { grantCipherMilestones, CIPHER_MILESTONES, MILESTONE_FRAGMENTS } from './cipherMilestones';

describe('grantCipherMilestones', () => {
  it('grants each tier once as the master fraction crosses it; idempotent', () => {
    const s = defaultSave();
    const vocab = vocabulary();
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.5)); // 50%
    const g1 = grantCipherMilestones(s);
    expect(g1.map((x) => x.tier).sort()).toEqual([0.25, 0.5]); // 25 + 50 crossed
    expect(grantCipherMilestones(s)).toEqual([]); // idempotent
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.75));
    expect(grantCipherMilestones(s).map((x) => x.tier)).toEqual([0.75]);
  });
  it('grants Fragments via dedup-safe synthetic ids', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary().slice(0, Math.ceil(vocabulary().length * 0.25));
    grantCipherMilestones(s);
    expect(s.stillpointFragments.filter((f) => f.startsWith('cipher-milestone:25')).length).toBe(MILESTONE_FRAGMENTS);
  });
});
```

Append to `achievements.test.ts` meta block: `expect(m({ masterFrac: 0.25 })).toContain('decrypt25');` etc.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `src/cipherMilestones.ts`:

```ts
// src/cipherMilestones.ts — 25/50/75% decryption milestone beats. PURE + save-side; idempotent via
// dedup'd synthetic Fragment ids (no new save field). 100% is handled by grantLongestDayRewards.
import type { SaveData } from './save';
import { masterProgress } from './intercepts';

export const CIPHER_MILESTONES = [0.25, 0.5, 0.75] as const;
export const MILESTONE_FRAGMENTS = 3;

export function grantCipherMilestones(save: SaveData): { tier: number; fragments: number }[] {
  const frac = masterProgress(save).frac;
  const out: { tier: number; fragments: number }[] = [];
  for (const tier of CIPHER_MILESTONES) {
    if (frac < tier) continue;
    const tag = `cipher-milestone:${Math.round(tier * 100)}`;
    if (save.stillpointFragments.some((f) => f.startsWith(tag))) continue; // already granted
    for (let i = 0; i < MILESTONE_FRAGMENTS; i++) save.stillpointFragments.push(`${tag}#${i}`);
    out.push({ tier, fragments: MILESTONE_FRAGMENTS });
  }
  return out;
}
```

Add to `BASE_ACHIEVEMENTS` (after `transmission`): `{ id: 'decrypt25', name: 'A Quarter Lit', desc: 'Decrypt 25% of the master cipher.', check: (c) => (c.masterFrac ?? 0) >= 0.25 }`, and `decrypt50` ('Half the City Back', 0.5), `decrypt75` ('Three Quarters to Dawn', 0.75).

- [ ] **Step 4: Run, expect PASS** + tsc.
- [ ] **Step 5: Commit** — `feat(lancefall): cipher milestone beats (25/50/75%) + achievements`.

## Task 6: Wire milestones + signal-restored + citizen debrief into game.ts

**Files:** Modify `src/game.ts` (`decryptIntercept` ~L3374-3388; run-end debrief area)

**Interfaces:** Consumes `grantCipherMilestones` (T5), `wokenCitizens`/`cityRememberedCount` (T1), `signalRestored` (T7 — UI). game.ts is currently clean → safe to `git add src/game.ts`.

- [ ] **Step 1: impact** — `impact({target:'decryptIntercept'})`.
- [ ] **Step 2:** In `decryptIntercept`, after `this.evalMetaAchievements();`, add:

```ts
    // 25/50/75% milestone beats — narrator line + Fragments + (backdrop bloom reads the save).
    for (const m of grantCipherMilestones(this.save)) {
      this.ui.toast(`CIPHER MILESTONE — ${Math.round(m.tier * 100)}% · the city remembers more (+◆${m.fragments})`);
    }
```

Add imports: `import { grantCipherMilestones } from './cipherMilestones';` and `import { wokenCitizens } from './citizens';`.

- [ ] **Step 3: Signal restored** — in `decryptIntercept` where `completed` (from `syncInterceptLore`) is non-empty (it already toasts + plays `transmissionChord`), additionally fire the moment for the first completed transmission, naming its citizen:

```ts
    if (completed.length) {
      const ic = INTERCEPTS.find((i) => i.loreLink === completed[0]);
      const cz = wokenCitizens(this.save).find((c) => ic && c.wakeBy === ic.id);
      this.ui.signalRestored(ic?.title ?? 'TRANSMISSION RESTORED', ic ? ic.tokens.join(' ') : '', cz?.name);
    }
```

- [ ] **Step 4: Debrief line** — find the run-end debrief assembly (where per-run summary lines are built for the game-over screen). Add a line from `cityRememberedCount(this.save)` only if a citizen woke this run (compare a count captured at run start vs end — if no such hook exists, show the absolute `"the city remembers N of 16"` line unconditionally on the debrief). Keep it render-only.
- [ ] **Step 5: Verify** `npx tsc --noEmit && npx vitest run`. `detect_changes`. Commit (game.ts clean) — `feat(lancefall): wire milestone beats + signal-restored + city-remembered debrief`.

## Task 7: "Signal restored" UI overlay + CITIZENS/DOSSIER codex panes

**Files:** Modify `src/ui.ts` (add `signalRestored` method + the CITIZENS/DOSSIER content in the FALL pane via `renderFallContent`), `src/panels/codex.ts` (citizen/dossier render helpers), `src/style.css` (append). **Shared files — content-filter; do NOT commit, controller stages.**

- [ ] **Step 1:** `signalRestored(title, text, citizen?)` overlay in `ui.ts`: a dismissable screen that typesets `text` in, fades the `citizen` name up ("— the Chorister returns —"), reuses the cockpit accent. a11y: reduce-motion → instant; reduce-flashing → soft fade. (The choir swell already fires via `audio.transmissionChord` at the call site.)
- [ ] **Step 2:** Add CITIZENS + DOSSIER rendering to `renderFallContent()` (the FALL pane, after memories): two `reconcile`-driven grids (mirror `refreshMemories`): a `renderCitizens(save)` grid (per-citizen card: woken → name/role/memory, `deeper` shown when `citizenDeeperUnlocked`; un-woken → "— still lost —") and a `renderDossiers(save)` grid (per-figure card showing `figureDossier` lines + `revealed/total`). Helpers live in `panels/codex.ts`; consume `CITIZENS`/`wokenCitizens`/`citizenDeeperUnlocked`/`figureDossier`/`DOSSIER_FIGURES`.
- [ ] **Step 3:** `style.css` — append `.citizen-*` / `.dossier-*` / `.signal-restored*` styles, consistent with existing `.codex-*` (mono, `--accent`, `calc(px*var(--hud-scale))`, a11y-safe).
- [ ] **Step 4:** Verify visually in preview (Task 9). `npx tsc --noEmit && npx vitest run`. Content-filtered commit — `feat(lancefall): CITIZENS + DOSSIER codex panes + signal-restored overlay + styles`.

## Task 8: THE LAST CIPHER + ENIGMA render in the console panel

**Files:** Modify `src/panels/bombe.ts` (render the choice-tail on `int-what-remains`; the enigma puzzle uses the existing puzzle block automatically). **Polish-agent-owned — content-filter; minimal hunk.**

- [ ] **Step 1:** In the intercept card render, for `ic.id === 'int-what-remains'`, append the choice tail: `choiceTail(save)` → the chosen sentence (gold for catch / dusk for fall) if non-null, else a muted line "— this cipher is not solved; it is chosen, on the longest day —". Import `choiceTail` from `../intercepts`.
- [ ] **Step 2:** Confirm the enigma puzzle renders in the existing puzzle reconcile (it's just another `CONSOLE_PUZZLES` entry) — add a distinct label/treatment if trivial.
- [ ] **Step 3:** Verify in preview. Content-filtered commit — `feat(lancefall): render THE LAST CIPHER choice-tail + enigma in the console`.

## Task 9: Skyline districts + milestone bursts + citizen glow (cockpitCipher.ts)

**Files:** Modify `src/cockpitCipher.ts`

- [ ] **Step 1: impact**/read `buildSkyline` (~L420) + `drawSkyline` (~L629) + `maybeCelebrateLongestDay` (~L376) + `readDecryptFrac` (~L336).
- [ ] **Step 2:** In `buildSkyline`, give each building a deterministic `resolveThreshold = (i + 0.5) / buildingCount`. In `drawSkyline`, scale that building's window neon by how far `decryptFrac` is past its threshold (below → dim/grey, at/after → full), blending smoothly — so the city lights left→right (district by district) as decryption rises.
- [ ] **Step 3:** Extend the 100%-only bloom into `maybeCelebrateMilestones()` that also fires a brief `burst` when `decryptFrac` first crosses 0.25/0.5/0.75, each gated by its own `localStorage` flag (`lancefall.cipher25/50/75`) like the existing `lancefall.longestday`.
- [ ] **Step 4:** Citizen glow: read woken count from the save the backdrop already parses (`stillpointLore` length ≈ completed transmissions) and give the corresponding left-most buildings a one-frame extra "just lit" glow when the count increases (reuse the burst path). Keep it subtle.
- [ ] **Step 5:** a11y: respect the file's existing reduce-motion/reduce-flashing handling (thresholds resolve as a held brighten, no strobe). Verify visually. Commit (cockpitCipher.ts is standalone/clean) — `feat(lancefall): skyline rebuilds district-by-district + milestone bursts + citizen glow`.

## Task 10: Final integration + visual sweep

- [ ] `npx tsc --noEmit && npx vite build && npx vitest run` (all green; ≥1239 + new).
- [ ] Minified `vite preview` (port 4350): fund a save, walk the arc — decrypt to 25/50/75 (milestone toasts + skyline lighting + backdrop bursts), complete a transmission (signal-restored moment + citizen wakes), open CODEX → CITIZENS (memories, `deeper` after a dossier completes) + DOSSIERS (progressive), reach 100% (THE LONGEST DAY), then verify `int-what-remains` tail reads "unchosen" and resolves after a Sovereign-kill choice. Solve all puzzles incl. enigma → INSIGHT +1. Screenshot each. Re-check reduce-motion/reduce-flashing/clarity.
- [ ] `detect_changes({scope:'compare', base_ref:'main'})` — confirm only expected scope. Deploy ONLY on owner's explicit OK.

## Self-review notes (coverage)
- Feature 1 CITIZENS → T1 (+ T7 panes, T9 glow, T6 debrief/signal). Deep authored memory+deeper, derived woken, calm reading, visual mid-run. ✓
- Feature 2 THE LAST CIPHER → T3 (data) + T8 (render). Two choice-authored readings; vocab untouched. ✓
- Feature 3 DOSSIER WEB → T2 (+ T7 pane). ✓
- Feature 4 ENIGMA → T4 (+ T8 render). Mastery → INSIGHT. ✓
- Feature 5 SKYLINE → T9. ✓
- Feature 6 MILESTONES → T5 (+ T6 wiring, T9 bursts). ✓
- Feature 7 SIGNAL RESTORED → T7 (+ T6 trigger). ✓
- No run-sim/rng contact; additive/derived save; no version bump. ✓
