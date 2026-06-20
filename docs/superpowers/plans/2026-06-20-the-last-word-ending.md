# THE LAST WORD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind THE CHOICE into the climax of the whole game — fuse decryption, the Sovereign kill, and the choice into one act (the last un-decryptable word), reveal the Sixth (everyone) by accretion, and make the choice an ongoing, revisitable relationship (the Vigil arc).

**Architecture:** A new **pure `src/ending.ts`** becomes the single source of truth for all ending copy + logic (choice text, the Last Word, the Sixth, the Vigil arc, the completion epilogue). Per-citizen confession/fate strings live with the citizen data in `src/citizens.ts`. Three additive save fields (`vigilSince`, `released`, `choiceDate`) track the Vigil; SAVE_VERSION bumps 8→9. UI wiring touches `game.ts` (stamp/release), `narrator.ts` (beats), `panels/bombe.ts` (the Last Word), `panels/fall.ts`+`ui.ts` (YOUR LANCEFALL + the Sixth), and `ui.ts` (the completion sequence). Nothing draws `world.rng`; determinism + a11y invariants hold.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Canvas 2D / DOM UI. No new deps.

## Global Constraints

- **Re-narrate, do not re-engineer.** No system renames (COHERENCE / Memory Fragments / DAYBREAK / mode ids / save keys / daily seed stay). Source: spec §12.
- **Seeded determinism is bit-identical.** No `world.rng` draw added/removed/reordered. `vocabulary()` length stays pinned (the Last Word is display-only, NOT in `vocabulary()`). `src/ending.ts` MUST NOT import `./rng`. Source: spec §10.
- **Pure-sim stays unit-tested.** `ending.ts` + citizen data + save migration are TDD'd in Vitest.
- **a11y-gate every new visual.** All new visuals route through `reduceFlashing` / `reduceMotion` / `clarity`; keyboard/d-pad reachable; 64px touch targets; non-colour-only state. Source: spec §10.
- **Tone (bible §5):** terse second-person noir; restraint is the soul; Turing stays diegetic — felt, never announced.
- **Test-asserted choice heads stay verbatim:** `'THE LIGHT HOLDS'` (catch) / `'THE LIGHT RELEASED'` (fall). `stillpoint.test.ts` asserts them.
- **Per-commit gate:** `npx tsc --noEmit` + `npx vitest run` (≈1262 green + new) + `npx vite build`; prod boot verified under `npx vite preview` (minified) before any UI claim is "done".
- **GitNexus:** run `npx gitnexus analyze` before editing code; run `impact({target, direction:'upstream'})` before editing `choiceEnding`, `migrateSave`, `makeChoice`, `resolveChoice`; `detect_changes()` before each commit. The index is currently stale.
- **Shared working tree:** concurrent agents live-edit `ui.ts`/`style.css`. Stage only your own hunks (content-filtered `git apply --cached`); never wholesale `git add` a shared tracked file. `ui.ts` is CRLF — use Edit, not tools that mangle CR.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/ending.ts` | **NEW.** Single source of truth: choice copy, the Last Word, the Sixth, the Vigil arc, the completion epilogue. Pure; no DOM, no rng. | Create |
| `src/ending.test.ts` | **NEW.** Full unit coverage of `ending.ts`. | Create |
| `src/citizens.ts` | Add `confession` / `fateHold` / `fateRelease` to `Citizen` + author all 16. | Modify |
| `src/citizens.test.ts` | Assert the new citizen fields are present + non-empty. | Modify |
| `src/stillpoint.ts` | `choiceEnding` re-exports from `ending.ts` (keep the name + heads). | Modify |
| `src/intercepts.ts` | `CHOICE_TAIL` / `choiceTail` MOVE OUT to `ending.ts` (acyclic). | Modify |
| `src/save.ts` | Add `vigilSince` / `released` / `choiceDate` to `SaveData` + `defaultSave()`. | Modify |
| `src/migrate.ts` | SAVE_VERSION 8→9; v8→v9 additive migration + `vigilSince` clamp. | Modify |
| `src/migrate.test.ts` | Assert v8→v9 default-fills. | Modify |
| `src/narrator.ts` | Add the pre-Sovereign foreshadow + Vigil beats (the Sovereign hand-off lives in `ending.ts`). | Modify |
| `src/narrator.test.ts` | Cover the new narrator keys. | Modify |
| `src/game.ts` | Stamp the Vigil on catch; the `releaseTheDay()` path; use `ending.choiceEnding`. | Modify |
| `src/panels/bombe.ts` | The Last Word trailing glyph on `int-what-remains` + the 100% reframe; import choice-tail from `ending.ts`. | Modify |
| `src/panels/fall.ts` | `renderYourLancefall(save)` + `renderTheSixth(save)`. | Modify |
| `src/ui.ts` | Mount YOUR LANCEFALL + the Sixth in the FALL tab; the Sixth reveal + completion sequence at the choice; the title Vigil line + release affordance. | Modify |

---

## PHASE 1 — The pure core (TDD)

### Task 1: `ending.ts` skeleton — unify the choice copy (no behavior change)

**Files:**
- Create: `src/ending.ts`
- Create: `src/ending.test.ts`
- Modify: `src/stillpoint.ts` (re-export `choiceEnding`)
- Modify: `src/intercepts.ts` (remove `CHOICE_TAIL`/`choiceTail`)
- Modify: `src/panels/bombe.ts` (import `choiceTail` from `./../ending`)

**Interfaces:**
- Produces: `export type Choice = 'catch' | 'fall' | 'none'`; `export interface ChoiceEnding { head: string; line: string }`; `export function choiceEnding(choice: Choice): ChoiceEnding`; `export const CHOICE_TAIL: Record<'catch'|'fall', string>`; `export function choiceTail(save: SaveData): string | null`.

- [ ] **Step 1: Write the failing test** — `src/ending.test.ts`

```typescript
// src/ending.test.ts — THE LAST WORD. Tests for the single-source ending module.
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { choiceEnding, CHOICE_TAIL, choiceTail } from './ending';

describe('choiceEnding (single source)', () => {
  it('keeps the test-asserted heads verbatim', () => {
    expect(choiceEnding('catch').head).toBe('THE LIGHT HOLDS');
    expect(choiceEnding('fall').head).toBe('THE LIGHT RELEASED');
    expect(choiceEnding('catch').line.length).toBeGreaterThan(20);
    expect(choiceEnding('fall').line.length).toBeGreaterThan(20);
    expect(choiceEnding('none').head).toBe('THE LIGHT HOLDS');
  });
});

describe('choiceTail (moved from intercepts)', () => {
  it('is null until a choice is made, then the chosen tail', () => {
    const s = defaultSave();
    expect(choiceTail(s)).toBeNull();
    s.stillpointChoice = 'catch';
    expect(choiceTail(s)).toBe(CHOICE_TAIL.catch);
    s.stillpointChoice = 'fall';
    expect(choiceTail(s)).toBe(CHOICE_TAIL.fall);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ending.test.ts`
Expected: FAIL — "Cannot find module './ending'".

- [ ] **Step 3: Create `src/ending.ts` with the migrated copy**

```typescript
// src/ending.ts — THE LAST WORD. The single source of truth for THE CHOICE, the ending, the Vigil,
// and the Sixth. PURE: no DOM, no ctx, and (determinism invariant) NO './rng' import. Reads save
// state and citizen/intercept data only. Absorbs the choice copy that was split across
// stillpoint.choiceEnding + intercepts.CHOICE_TAIL so the most important words in the game live in
// ONE place (story-bible "single source of truth" mandate).
import type { SaveData } from './save';

export type Choice = 'catch' | 'fall' | 'none';

// ── THE CHOICE — the Sovereign-kill ending. Heads are test-asserted; keep them verbatim. ──
export interface ChoiceEnding { head: string; line: string; }
export function choiceEnding(choice: Choice): ChoiceEnding {
  if (choice === 'fall')
    return { head: 'THE LIGHT RELEASED', line: 'You let it go. The day completes, the dark comes gently, and it is finally, mercifully over.' };
  if (choice === 'catch')
    return { head: 'THE LIGHT HOLDS', line: 'You held it. The longest day stands, and the city wakes — and stays awake, in your keeping.' };
  return { head: 'THE LIGHT HOLDS', line: 'Lancefall remembers itself.' };
}

// ── THE LAST CIPHER tail — the console epilogue under "What Remains" (moved here from intercepts). ──
export const CHOICE_TAIL: Record<'catch' | 'fall', string> = {
  catch: 'And the last word, you did not decode — you held it. The light stays. The longest day does not end.',
  fall: 'And the last word, you did not decode — you let it go. The light is released, and the dark comes gently, and it is over.',
};
export function choiceTail(save: SaveData): string | null {
  return save.stillpointChoice === 'catch' || save.stillpointChoice === 'fall' ? CHOICE_TAIL[save.stillpointChoice] : null;
}
```

- [ ] **Step 4: Re-point `stillpoint.ts` and `intercepts.ts`**

In `src/stillpoint.ts`, REMOVE the local `Choice` type + `ChoiceEnding` interface + `choiceEnding` function (lines ~7–20) and replace with a re-export at the top of the file (after the existing imports):

```typescript
// THE CHOICE copy now lives in ./ending (single source). Re-exported so existing
// importers (game.ts, ui.ts, stillpoint.test.ts) keep working unchanged.
export { choiceEnding, type Choice, type ChoiceEnding } from './ending';
```

In `src/intercepts.ts`, REMOVE the `CHOICE_TAIL` const + `choiceTail` function (lines ~224–233) and replace with a re-export so any other importer still resolves:

```typescript
// THE LAST CIPHER tail moved to ./ending (single source). Re-exported for back-compat.
export { CHOICE_TAIL, choiceTail } from './ending';
```

> NOTE: this makes `intercepts.ts` import (transitively) from `ending.ts`, and `ending.ts` imports nothing from `intercepts.ts` YET. After Task 4 `ending.ts` will import `isLongestDay`/`masterProgress` from `intercepts.ts`. A re-export (`export { } from`) is a type/value pass-through and does NOT create a runtime cycle with those pure functions; if `tsc`/vitest flags a cycle warning at Task 4, change `intercepts.ts` to keep NO reference to ending and instead update the ONE consumer (`panels/bombe.ts`) to import `choiceTail` from `./../ending` directly, then delete the re-export line. Verify the importer in the next step.

- [ ] **Step 5: Update the `choiceTail` consumer in the console**

In `src/panels/bombe.ts`, find the import of `choiceTail` (currently from `'../intercepts'`) and point it at `'../ending'`:

```typescript
import { choiceTail } from '../ending';
```

(Leave the other `../intercepts` imports — `tokenView`, `wordRarity`, `INTERCEPTS`, etc. — unchanged.)

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run src/ending.test.ts src/stillpoint.test.ts src/intercepts.test.ts src/cipherIntegration.test.ts && npx tsc --noEmit`
Expected: PASS (the choice heads still match; nothing imports a now-missing symbol).

- [ ] **Step 7: Commit**

```bash
git add src/ending.ts src/ending.test.ts src/stillpoint.ts src/intercepts.ts src/panels/bombe.ts
git commit -m "refactor(lancefall): ending.ts becomes the single source for THE CHOICE copy"
```

---

### Task 2: THE LAST WORD — the un-decryptable token (display-only)

**Files:**
- Modify: `src/ending.ts`
- Modify: `src/ending.test.ts`

**Interfaces:**
- Consumes: `choiceEnding`, `Choice` (Task 1).
- Produces: `export const LAST_WORD_PLACEHOLDER = 'CHOSEN'`; `export const LAST_WORD_CAPTION: string`; `export const LONGEST_DAY_REFRAME: string`; `export function lastWordResolved(save: SaveData): string | null` (null while `'none'`; `'HELD'` for catch; `'RELEASED'` for fall).

- [ ] **Step 1: Write the failing test** — append to `src/ending.test.ts`

```typescript
import { lastWordResolved, LAST_WORD_PLACEHOLDER } from './ending';
import { vocabulary, isLongestDay, masterProgress } from './intercepts';

describe('THE LAST WORD (display-only, outside the cipher)', () => {
  it('resolves only after a choice; placeholder is a non-empty glyph', () => {
    const s = defaultSave();
    expect(LAST_WORD_PLACEHOLDER.length).toBeGreaterThan(0);
    expect(lastWordResolved(s)).toBeNull();
    s.stillpointChoice = 'catch';
    expect(lastWordResolved(s)).toBe('HELD');
    s.stillpointChoice = 'fall';
    expect(lastWordResolved(s)).toBe('RELEASED');
  });
  it('does NOT enter the cipher vocabulary — 100% stays reachable without choosing', () => {
    const before = vocabulary().length;
    const s = defaultSave();
    s.decryptedWords = vocabulary();
    expect(isLongestDay(s)).toBe(true);          // remembered everything, never chose
    expect(masterProgress(s).frac).toBe(1);
    s.stillpointChoice = 'catch';                 // choosing never grows the cipher
    expect(vocabulary().length).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ending.test.ts`
Expected: FAIL — `lastWordResolved` not exported.

- [ ] **Step 3: Implement in `src/ending.ts`** (append after `choiceTail`)

```typescript
// ── THE LAST WORD — the single token at the foot of "What Remains" that is never bought, only
// chosen. Display-only: deliberately NOT part of intercepts.vocabulary(), so masterProgress()/the
// 265-word pin and all seeded determinism are untouched (same discipline as CHOICE_TAIL). The Bombe
// (the machine) breaks every cipher and then HALTS here — the halting problem, made literal. ──
export const LAST_WORD_PLACEHOLDER = 'CHOSEN'; // the grey, un-buyable glyph shown while 'none'
export const LAST_WORD_CAPTION = 'This word is not bought. It is chosen — on the longest day.';
export const LONGEST_DAY_REFRAME =
  'The machine is finished. Every cipher is broken. One word remains — and it was never the machine’s to read. No machine decides it. It waits for the longest day.';
export function lastWordResolved(save: SaveData): string | null {
  if (save.stillpointChoice === 'catch') return 'HELD';
  if (save.stillpointChoice === 'fall') return 'RELEASED';
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ending.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ending.ts src/ending.test.ts
git commit -m "feat(lancefall): THE LAST WORD — the un-decryptable token bound to THE CHOICE"
```

---

### Task 3: Citizen confessions + fates (the Sixth's faces)

**Files:**
- Modify: `src/citizens.ts` (extend `Citizen`, add fields to all 16)
- Modify: `src/citizens.test.ts`

**Interfaces:**
- Produces: `Citizen` gains `confession: string` (≤12 words — "I kept to my task, and trusted the rest to someone else"), `fateHold: string` (≤16 — eternal/luminous/never-finished), `fateRelease: string` (≤16 — completion/rest).

- [ ] **Step 1: Write the failing test** — append to `src/citizens.test.ts`

```typescript
describe('citizen confessions + fates (the Sixth / the completion)', () => {
  it('every citizen has a non-empty confession, fateHold, and fateRelease', () => {
    for (const c of CITIZENS) {
      expect(c.confession.length).toBeGreaterThan(8);
      expect(c.fateHold.length).toBeGreaterThan(8);
      expect(c.fateRelease.length).toBeGreaterThan(8);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/citizens.test.ts`
Expected: FAIL — `confession` is undefined.

- [ ] **Step 3: Extend the `Citizen` interface** in `src/citizens.ts` (after the existing `deeper: string;` field, line ~16):

```typescript
  /** ≤12 words, first person — the small "I kept to my task and trusted the rest to someone else"
   *  that makes this citizen one of the diffuse Sixth. Distilled from `deeper`. */
  confession: string;
  /** ≤16 words — this citizen's fate if the player HOLDS the light (eternal, luminous, unfinished). */
  fateHold: string;
  /** ≤16 words — this citizen's fate if the player LETS GO (completion, rest). */
  fateRelease: string;
```

- [ ] **Step 4: Add the three strings to each of the 16 `CITIZENS` entries.** Author verbatim (drop these into each citizen object, matching `id`):

```
lamplighter:  confession: 'I kept the lamps lit, and trusted the walls to someone else.'
              fateHold:    'He climbs the towers still, lighting lamps that never go out.'
              fateRelease: 'The last tower lights. He climbs down at last, and rests.'
archivist:    confession: 'I filed the fall, line by line, and never looked up.'
              fateHold:    'She files on, in a hall where the last line is never written.'
              fateRelease: 'The final page is written. The archive can close.'
gatewarden:   confession: 'I followed the protocol. It never imagined a citizen’s face.'
              fateHold:    'He stands the wall forever, the lock warm under his hand.'
              fateRelease: 'He sets the keys down. The gate is no one’s to hold now.'
chorister:    confession: 'I sang what I was given, and never the silences.'
              fateHold:    'She holds the last note open, and will not let it fall.'
              fateRelease: 'She sings the ending the Weaver never wrote, and is heard.'
ferryman:     confession: 'I kept to my route. The ships waited for a signal I never carried.'
              fateHold:    'He waits at the dock still, lantern lit, for a crossing that never comes.'
              fateRelease: 'He poles out past the dark water at last, and is not afraid.'
glassblower:  confession: 'I made the glass. The city could not bear its own reflection.'
              fateHold:    'She polishes mirrors still, each holding the unbearable light.'
              fateRelease: 'She sets the last mirror down, and lets the city look away.'
stonemason:   confession: 'I laid my tools down and grieved. It was not enough.'
              fateHold:    'He keeps the keystone touched and warm, outlasting even grief.'
              fateRelease: 'The stone sings as the light leaves it, the way he always knew.'
courier:      confession: 'I ran the route perfectly. The door was locked from the inside.'
              fateHold:    'He holds the sealed cipher still, at a tower that never opens.'
              fateRelease: 'The sealed cipher is delivered at last. The last word is read.'
bellringer:   confession: 'I rang the hours to a city that could no longer hear.'
              fateHold:    'He rings the evening peal forever, to a city awake to hear it.'
              fateRelease: 'The last peal lands true, and the city has its hour.'
clockwright:  confession: 'I built perfect time, and let the one moment pass.'
              fateHold:    'The mechanism runs on, holding the hour at its brightest.'
              fateRelease: 'The great clock strikes the longest day, and may finally stop.'
cartographer: confession: 'I mapped the city’s absence. The names dissolved as I drew.'
              fateHold:    'She maps the held city forever, the names refusing to fade.'
              fateRelease: 'The map is whole now — every street leads somewhere again.'
stargazer:    confession: 'I watched the sky, and called the watching a choice.'
              fateHold:    'She watches still, the dawn held forever at the sky’s edge.'
              fateRelease: 'The light she waited for arrives; she stops listening, content.'
gardener:     confession: 'I grew beauty from a rule, and trusted it to keep itself.'
              fateHold:    'The gardens bloom on, the old rule iterating without end.'
              fateRelease: 'The spirals finish their pattern, seed the ash, and rest.'
vintner:      confession: 'I kept a wine for a day I would not live to see.'
              fateHold:    'The bottle waits, uncorked forever, for a day that never ends.'
              fateRelease: 'The wine is opened at last. Someone believed the day would come.'
candlemaker:  confession: 'I poured light against the dark, and left the dark the rest.'
              fateHold:    'He pours candles still, each burning against a night held at bay.'
              fateRelease: 'The last candle gutters out, its long argument finally won.'
weaver-cloth: confession: 'I wove the city’s colours, and left the last threads to others.'
              fateHold:    'She works the loom forever, the pattern bright and never finished.'
              fateRelease: 'The final thread is set. The weave holds — it is a city.'
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/citizens.test.ts`
Expected: PASS (16 citizens, all three fields non-empty).

- [ ] **Step 6: Commit**

```bash
git add src/citizens.ts src/citizens.test.ts
git commit -m "feat(lancefall): citizen confessions + hold/release fates (the Sixth's faces)"
```

---

### Task 4: THE SIXTH — accretion + the scaled reveal

**Files:**
- Modify: `src/ending.ts`
- Modify: `src/ending.test.ts`

**Interfaces:**
- Consumes: `wokenCitizens` + `Citizen` from `./citizens`; `isLongestDay` from `./intercepts`.
- Produces: `export const SIXTH_THESIS`, `SIXTH_UNWOKEN_PULL`, `SIXTH_DEEPEST: string`; `export interface SixthReveal { thesis: string; faces: { name: string; line: string }[]; unwokenPull: string | null; deepest: string | null }`; `export function sixthReveal(save: SaveData): SixthReveal`.

- [ ] **Step 1: Write the failing test** — append to `src/ending.test.ts`

```typescript
import { sixthReveal, SIXTH_THESIS } from './ending';
import { CITIZENS } from './citizens';
import { interceptWords, INTERCEPTS } from './intercepts';

describe('THE SIXTH — never gated, scales with woken citizens', () => {
  it('fires for everyone (thesis always present), with no faces on a fresh save', () => {
    const s = defaultSave();
    const r = sixthReveal(s);
    expect(r.thesis).toBe(SIXTH_THESIS);
    expect(r.faces).toHaveLength(0);
    expect(r.unwokenPull).not.toBeNull();   // 16 still grey → the gentle pull
    expect(r.deepest).toBeNull();           // not 100%
  });
  it('names the citizens you woke, and shows the deepest line only at 100%', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary();         // remembered everything → all 16 woken
    const r = sixthReveal(s);
    expect(r.faces.length).toBe(CITIZENS.length);
    expect(r.faces[0]).toHaveProperty('name');
    expect(r.faces[0]).toHaveProperty('line');
    expect(r.unwokenPull).toBeNull();        // none left grey
    expect(r.deepest).not.toBeNull();        // the bottom of the well
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ending.test.ts`
Expected: FAIL — `sixthReveal` not exported.

- [ ] **Step 3: Implement in `src/ending.ts`**

Add imports at the top of `ending.ts`:

```typescript
import { wokenCitizens, type Citizen } from './citizens';
import { isLongestDay } from './intercepts';
```

Append:

```typescript
// ── THE SIXTH — "everyone is the sixth." Never gated: the thesis fires for everyone at the choice;
// it names the citizens you woke (the faces); the unwoken are a gentle pull, not a punishment; 100%
// decryption unlocks the deepest line. The accretion (one confession per woken citizen) is read in
// THE FALL tab as it assembles across play. ──
export const SIXTH_THESIS =
  'There were never six. There were a hundred thousand — every citizen who believed someone else was holding the line. The Six is a number we gave the guilt so it had somewhere to sit.';
export const SIXTH_UNWOKEN_PULL = 'And the rest are still grey. Their faces are here too, waiting to be remembered.';
export const SIXTH_DEEPEST = 'And the last face — the one that woke them all, that came back down to own the fall — is yours.';

export interface SixthReveal {
  thesis: string;
  faces: { name: string; line: string }[]; // one per woken citizen — their confession
  unwokenPull: string | null;              // present iff some citizens are still asleep
  deepest: string | null;                  // present iff 100% decryption (remembered everything)
}
export function sixthReveal(save: SaveData): SixthReveal {
  const woken = wokenCitizens(save);
  const faces = woken.map((c: Citizen) => ({ name: c.name, line: c.confession }));
  return {
    thesis: SIXTH_THESIS,
    faces,
    unwokenPull: faces.length < 16 ? SIXTH_UNWOKEN_PULL : null,
    deepest: isLongestDay(save) ? SIXTH_DEEPEST : null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ending.test.ts`
Expected: PASS.

> If `tsc` reports an import cycle (`ending` ↔ `intercepts` via the Task-1 re-export), apply the fallback in Task 1 Step 4 NOTE: delete the `export { CHOICE_TAIL, choiceTail } from './ending'` line in `intercepts.ts` (nothing inside intercepts uses them; `bombe.ts` already imports from `./../ending` after Task 1 Step 5). Re-run.

- [ ] **Step 5: Commit**

```bash
git add src/ending.ts src/ending.test.ts
git commit -m "feat(lancefall): THE SIXTH — everyone, named by the citizens you woke (ungated, scaled)"
```

---

### Task 5: THE VIGIL — the defiance→peace arc

**Files:**
- Modify: `src/ending.ts`
- Modify: `src/ending.test.ts`

**Interfaces:**
- Consumes: `SaveData` fields `stillpointChoice`, `totalRuns`, `vigilSince`, `released` (the last two land in Task 7; reference them now — TS will compile once Task 7 adds them, so DO Task 7 before running Phase-3 wiring, but this task's test uses a cast helper to avoid ordering pain — see Step 1).
- Produces: `export type VigilStage = 'defiance' | 'wistful' | 'permission'`; `export const VIGIL_PERMISSION_THRESHOLD = 11`; `export function daysHeld(save): number`; `export function vigilStage(days: number): VigilStage`; `export function vigilBeat(save): { stage: VigilStage; line: string } | null`; `export function canRelease(save): boolean`.

> ORDERING: This task references `save.vigilSince` / `save.released`. To keep the build green, **do Task 7 (save fields) immediately before this task's Step 4**, OR implement Steps 1–3 here and run them after Task 7. The plan lists Vigil here for narrative locality; the executor may swap Task 5 and Task 7 freely.

- [ ] **Step 1: Write the failing test** — append to `src/ending.test.ts`

```typescript
import { daysHeld, vigilStage, vigilBeat, canRelease, VIGIL_PERMISSION_THRESHOLD } from './ending';

function holding(totalRuns: number, vigilSince: number) {
  const s = defaultSave();
  s.stillpointChoice = 'catch';
  s.totalRuns = totalRuns;
  s.vigilSince = vigilSince;
  return s;
}

describe('THE VIGIL — defiance → wistful → permission', () => {
  it('daysHeld is 0 unless actively holding', () => {
    const s = defaultSave();               // 'none'
    expect(daysHeld(s)).toBe(0);
    expect(daysHeld(holding(5, 2))).toBe(3);
  });
  it('stages by days held', () => {
    expect(vigilStage(1)).toBe('defiance');
    expect(vigilStage(3)).toBe('defiance');
    expect(vigilStage(4)).toBe('wistful');
    expect(vigilStage(10)).toBe('wistful');
    expect(vigilStage(VIGIL_PERMISSION_THRESHOLD)).toBe('permission');
    expect(vigilStage(99)).toBe('permission');
  });
  it('vigilBeat is null unless holding (and after release)', () => {
    expect(vigilBeat(defaultSave())).toBeNull();
    const b = vigilBeat(holding(13, 2));
    expect(b?.stage).toBe('permission');
    expect(b?.line.length).toBeGreaterThan(10);
  });
  it('canRelease only at/after the permission threshold, and not once released', () => {
    expect(canRelease(holding(2 + VIGIL_PERMISSION_THRESHOLD - 1, 2))).toBe(false); // held 10
    const ready = holding(2 + VIGIL_PERMISSION_THRESHOLD, 2);                       // held 11
    expect(canRelease(ready)).toBe(true);
    ready.released = true;
    expect(canRelease(ready)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ending.test.ts`
Expected: FAIL — `daysHeld` not exported (and, if Task 7 not yet done, a TS error on `save.vigilSince` — do Task 7 first if so).

- [ ] **Step 3: Implement in `src/ending.ts`**

```typescript
// ── THE VIGIL — holding the light (catch) is the existing ASCEND/NG+ loop; this is its narrative
// arc over runs held. daysHeld derives from a one-time stamp (vigilSince = totalRuns at catch) so
// nothing mutable can desync. defiance (1–3) → wistful (4–10) → permission (11+, the release is
// offered as permission, never failure). ──
export type VigilStage = 'defiance' | 'wistful' | 'permission';
export const VIGIL_PERMISSION_THRESHOLD = 11;

const VIGIL_LINES: Record<VigilStage, string[]> = {
  defiance: ['You are holding the longest day. Hold.', 'The light has not dimmed. You will not let it.'],
  wistful: ['The day still has not turned.', 'You have held the light a long while now.', 'The city is awake, and does not tire. You might.'],
  permission: [
    'You have held the light a long time. You may let it turn now. No one will call it failure.',
    'The longest day can end whenever you choose. Letting go is not losing.',
  ],
};

export function daysHeld(save: SaveData): number {
  if (save.stillpointChoice !== 'catch' || save.vigilSince < 0) return 0;
  return Math.max(0, save.totalRuns - save.vigilSince);
}
export function vigilStage(days: number): VigilStage {
  if (days >= VIGIL_PERMISSION_THRESHOLD) return 'permission';
  if (days >= 4) return 'wistful';
  return 'defiance';
}
/** A vigil beat for the title / run-start / debrief. Null when not holding (or after release).
 *  Deterministic line pick by daysHeld (no rng — invariant). */
export function vigilBeat(save: SaveData): { stage: VigilStage; line: string } | null {
  if (save.stillpointChoice !== 'catch' || save.released) return null;
  const d = daysHeld(save);
  const stage = vigilStage(d);
  const pool = VIGIL_LINES[stage];
  return { stage, line: pool[d % pool.length] };
}
export function canRelease(save: SaveData): boolean {
  return save.stillpointChoice === 'catch' && !save.released && daysHeld(save) >= VIGIL_PERMISSION_THRESHOLD;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ending.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ending.ts src/ending.test.ts
git commit -m "feat(lancefall): THE VIGIL — the defiance->peace arc + the re-offerable release"
```

---

### Task 6: THE COMPLETION — citizen-fate epilogue per choice

**Files:**
- Modify: `src/ending.ts`
- Modify: `src/ending.test.ts`

**Interfaces:**
- Produces: `export interface CitizenFate { name: string; line: string }`; `export function completionEpilogue(save: SaveData, choice: 'catch'|'fall'): CitizenFate[]` (one entry per woken citizen, fate chosen by `choice`).

- [ ] **Step 1: Write the failing test** — append to `src/ending.test.ts`

```typescript
import { completionEpilogue } from './ending';

describe('THE COMPLETION — citizen fates per choice', () => {
  it('names every woken citizen with the choice-appropriate fate', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary();          // all 16 woken
    const rel = completionEpilogue(s, 'fall');
    const hold = completionEpilogue(s, 'catch');
    expect(rel).toHaveLength(16);
    expect(hold).toHaveLength(16);
    // the Vintner payoff: release opens the wine; hold leaves it uncorked-forever
    const vRel = rel.find((f) => f.name === 'The Vintner')!;
    const vHold = hold.find((f) => f.name === 'The Vintner')!;
    expect(vRel.line).toMatch(/opened/i);
    expect(vHold.line).not.toBe(vRel.line);
  });
  it('only names the citizens actually woken', () => {
    const s = defaultSave();                   // none woken
    expect(completionEpilogue(s, 'fall')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ending.test.ts`
Expected: FAIL — `completionEpilogue` not exported.

- [ ] **Step 3: Implement in `src/ending.ts`**

```typescript
// ── THE COMPLETION — the ending sequence names every woken citizen's fate. Release lets each one
// finish (the Vintner's wine is opened, the Courier's cipher delivered); Hold keeps each awake in
// the held moment, luminous and unfinished. Pure over wokenCitizens × choice. ──
export interface CitizenFate { name: string; line: string; }
export function completionEpilogue(save: SaveData, choice: 'catch' | 'fall'): CitizenFate[] {
  return wokenCitizens(save).map((c: Citizen) => ({
    name: c.name,
    line: choice === 'fall' ? c.fateRelease : c.fateHold,
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ending.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ending.ts src/ending.test.ts
git commit -m "feat(lancefall): THE COMPLETION — citizen-fate epilogue per choice"
```

---

## PHASE 2 — Save + determinism

### Task 7: Save fields + SAVE_VERSION 8→9 migration

**Files:**
- Modify: `src/save.ts` (`SaveData` + `defaultSave`)
- Modify: `src/migrate.ts` (`SAVE_VERSION` + clamp)
- Modify: `src/migrate.test.ts`

**Interfaces:**
- Produces: `SaveData` gains `vigilSince: number` (default -1), `released: boolean` (default false), `choiceDate: string` (default ''). `SAVE_VERSION === 9`.

- [ ] **Step 1: Write the failing test** — append to `src/migrate.test.ts`

```typescript
describe('v8 -> v9 (THE LAST WORD vigil fields)', () => {
  it('default-fills vigilSince/released/choiceDate for a v8 save', () => {
    const v8 = { version: 8, highScore: 1234, stillpointChoice: 'catch' };
    const out = migrateSave(v8, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.version).toBe(9);
    expect(out.highScore).toBe(1234);
    expect(out.vigilSince).toBe(-1);
    expect(out.released).toBe(false);
    expect(out.choiceDate).toBe('');
  });
  it('clamps a hand-edited vigilSince to an integer >= -1', () => {
    const out = migrateSave({ version: 9, vigilSince: 4.7 }, defaultSave());
    expect(out.vigilSince).toBe(4);
    const out2 = migrateSave({ version: 9, vigilSince: -50 }, defaultSave());
    expect(out2.vigilSince).toBe(-1);
    const out3 = migrateSave({ version: 9, vigilSince: 'x' }, defaultSave());
    expect(out3.vigilSince).toBe(-1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/migrate.test.ts`
Expected: FAIL — `version` is 8, `vigilSince` undefined.

- [ ] **Step 3: Add the fields to `SaveData`** in `src/save.ts` (after the `bombeBranches` field, before the closing `}` of the interface, line ~198):

```typescript
  // ── v9 THE LAST WORD — the Vigil (holding the light) as a relationship over runs. All additive;
  //    meta-only (never read in seeded sim). ──
  /** totalRuns ordinal stamped when THE CHOICE was first made as 'catch'; -1 = not holding. The
   *  Vigil's "days held" = totalRuns - vigilSince. */
  vigilSince: number;
  /** the player later let the day turn after holding (catch -> fall). Once true, the choice is final. */
  released: boolean;
  /** YYYY-MM-DD (dateString()) when THE CHOICE was first made; '' = never made. */
  choiceDate: string;
```

- [ ] **Step 4: Add the defaults** in `defaultSave()` (after `bombeBranches: { ... },`, line ~316):

```typescript
    vigilSince: -1,
    released: false,
    choiceDate: '',
```

- [ ] **Step 5: Bump SAVE_VERSION + add the clamp** in `src/migrate.ts`:

Change line 17 `export const SAVE_VERSION = 8;` → `export const SAVE_VERSION = 9;`

Add a migration-comment line after the `v7 → v8` block (line ~52) :

```typescript
  // v8 → v9: added the v9 vigil fields (vigilSince, released, choiceDate). Purely additive → an
  //          older save default-fills (-1 / false / ''); the clamp below forces vigilSince to an
  //          integer >= -1, and the generic loop coerces released (bool) / choiceDate (string).
```

Add the clamp after the `playStreak` clamp (line ~92):

```typescript
  // v9 — vigilSince is a totalRuns ordinal or the -1 "not holding" sentinel: integer >= -1.
  if (typeof o.vigilSince === 'number') o.vigilSince = Math.max(-1, Math.floor(o.vigilSince));
  else o.vigilSince = b.vigilSince;
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/migrate.test.ts src/save.test.ts && npx tsc --noEmit`
Expected: PASS (the generic per-field loop already handles `released`/`choiceDate`; the clamp handles `vigilSince`).

> If `src/save.test.ts` (or any snapshot of `defaultSave()`) hard-asserts a field set or version, update it to include the three new fields + version 9.

- [ ] **Step 7: Commit**

```bash
git add src/save.ts src/migrate.ts src/migrate.test.ts
git commit -m "feat(lancefall): SAVE_VERSION 9 — vigilSince/released/choiceDate (the Vigil)"
```

---

### Task 8: Determinism guard

**Files:**
- Modify: `src/ending.test.ts`

**Interfaces:** none new — this is an invariant test.

- [ ] **Step 1: Write the test** — append to `src/ending.test.ts`

```typescript
describe('determinism invariants (THE LAST WORD never perturbs the seeded sim)', () => {
  it('ending.ts source does not import the rng module', async () => {
    // ending.ts is pure-over-save; importing ./rng would risk a sim-perturbing draw.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./ending.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from ['"]\.\/rng['"]/);
  });
  it('a vigil run does not change the cipher (vocabulary stable) or master progress', () => {
    const before = vocabulary().length;
    const s = defaultSave();
    s.decryptedWords = vocabulary();
    s.stillpointChoice = 'catch';
    s.vigilSince = 0;
    s.totalRuns = 50;                         // 50 vigil runs later
    expect(vocabulary().length).toBe(before); // the cipher never grows
    expect(masterProgress(s).frac).toBe(1);   // decryption is choice-independent
    expect(lastWordResolved(s)).toBe('HELD');
  });
});
```

- [ ] **Step 2: Run to verify pass** (this asserts existing invariants — should pass immediately)

Run: `npx vitest run src/ending.test.ts`
Expected: PASS. If the import-scan fails, remove any `./rng` import from `ending.ts` (there should be none).

- [ ] **Step 3: Full pure-layer gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — whole suite green (≈1262 + new).

- [ ] **Step 4: Commit**

```bash
git add src/ending.test.ts
git commit -m "test(lancefall): determinism guard — ending.ts is rng-free, the cipher is choice-stable"
```

---

## PHASE 3 — Wiring (game.ts + narrator)

### Task 9: Stamp the Vigil on catch

**Files:**
- Modify: `src/game.ts` (`makeChoice`, line ~3319; the `choiceEnding` import)

**Interfaces:**
- Consumes: `choiceEnding` (now from `./stillpoint` re-export or `./ending`), `dateString` from `./rng`.

- [ ] **Step 1: Run impact analysis (CLAUDE.md mandate)**

Run: `npx gitnexus analyze` then `impact({target: "makeChoice", direction: "upstream"})`. Report the blast radius. Expected LOW (single private method).

- [ ] **Step 2: Update `makeChoice`** in `src/game.ts` to stamp the Vigil on the first catch:

```typescript
  /** THE CHOICE — the player decides the kingdom's fate after felling the Sovereign. On CATCH the
   *  Vigil begins (stamp the run ordinal + date so daysHeld can derive). Cosmetic/personal: saved
   *  to localStorage, never touches rng. */
  private makeChoice(c: 'catch' | 'fall'): void {
    this.save.stillpointChoice = c;
    if (this.save.choiceDate === '') this.save.choiceDate = dateString();
    if (c === 'catch' && this.save.vigilSince < 0) this.save.vigilSince = this.save.totalRuns;
    saveSave(this.save);
    const end = choiceEnding(c);
    this.ui.resolveChoice(end.head, end.line);
  }
```

Ensure `dateString` is imported in `game.ts` (it imports from `./rng` already for seeds — confirm `dateString` is in that import list; add it if missing).

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game.ts
git commit -m "feat(lancefall): stamp the Vigil (vigilSince/choiceDate) on the catch choice"
```

---

### Task 10: The release path (`releaseTheDay`)

**Files:**
- Modify: `src/game.ts` (new method + a public entry the UI calls)

**Interfaces:**
- Consumes: `canRelease`, `choiceEnding`, `completionEpilogue` from `./ending`.
- Produces: `public requestReleaseTheDay(): boolean` — returns true if the release fired (so the UI can play the completion sequence).

- [ ] **Step 1: Add the method** in `src/game.ts` (near `makeChoice`):

```typescript
  /** THE LIVING CHOICE — let the day turn after a long Vigil. Permitted only once daysHeld reaches
   *  the threshold (ending.canRelease). Flips catch -> fall (the completion), marks it final, and
   *  asks the UI to play the completion sequence. Returns whether it fired. Save-side; no rng. */
  public requestReleaseTheDay(): boolean {
    if (!canRelease(this.save)) return false;
    this.save.stillpointChoice = 'fall';
    this.save.released = true;
    saveSave(this.save);
    const end = choiceEnding('fall');
    this.ui.playCompletion('fall', this.save, end.head, end.line); // added in Task 14
    return true;
  }
```

Add `canRelease` (and any not-yet-imported ending symbols) to the `./stillpoint`/`./ending` import line in `game.ts`.

- [ ] **Step 2: Verify build (UI method `playCompletion` lands in Task 14 — temporarily stub if executing strictly in order)**

If `playCompletion` does not yet exist on `ui`, add a no-op stub to `ui.ts` now (replaced in Task 14):

```typescript
playCompletion(_which: 'catch' | 'fall', _save: SaveData, _head: string, _line: string): void { /* Task 14 */ }
```

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/game.ts src/ui.ts
git commit -m "feat(lancefall): releaseTheDay — the Vigil's earned, final release path"
```

---

### Task 11: Narrator beats — the foreshadow + the Vigil

**Files:**
- Modify: `src/narrator.ts`
- Modify: `src/narrator.test.ts`
- Modify: `src/ending.ts` (the Sovereign hand-off line constant)

**Interfaces:**
- Produces: `NARRATOR.sovereignForeshadow: string[]` (pre-fight); `ending.SOVEREIGN_HANDOFF: string` (spoken at the choice). The Vigil beats are already in `ending.vigilBeat` (Task 5).

- [ ] **Step 1: Write the failing test** — append to `src/narrator.test.ts`

```typescript
describe('THE LAST WORD narrator additions', () => {
  it('has a non-empty sovereign foreshadow pool', () => {
    expect(NARRATOR.sovereignForeshadow.length).toBeGreaterThan(0);
    for (const l of NARRATOR.sovereignForeshadow) expect(l.length).toBeGreaterThan(10);
  });
});
```

(Ensure `NARRATOR` is imported in `narrator.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/narrator.test.ts`
Expected: FAIL — `sovereignForeshadow` undefined.

- [ ] **Step 3: Add the pool** in `src/narrator.ts` (inside the `NARRATOR` object, after `daybreak`):

```typescript
  // pre-Sovereign: the moment that is coming is named, so THE CHOICE never arrives cold
  sovereignForeshadow: [
    'The master cipher kept the last word from everyone. It will offer it to you.',
    'There is always a moment. Below, it is waiting for yours.',
  ],
```

- [ ] **Step 4: Add the hand-off constant** in `src/ending.ts`:

```typescript
// Spoken by the dying Sovereign as THE CHOICE opens — the rhyme with its own crime ("I kept the
// crown"). Surfaced in the choice prompt (ui.ts).
export const SOVEREIGN_HANDOFF = 'There is always a moment. I kept the crown. Here is yours.';
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/narrator.test.ts src/ending.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Wire the foreshadow** in `src/game.ts` — find where `NARRATOR.bossApproach` is narrated for a boss spawn and add, for the sovereign only, a one-time foreshadow toast. Locate the boss-approach narrate call (search `bossApproach`) and after it add:

```typescript
    if (kind === 'sovereign') this.narrate('sovereignForeshadow', 'toast', NARRATOR.sovereignForeshadow);
```

(Match the existing `this.narrate(bucket, surface, pool)` signature used for `daybreak`.)

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run`

```bash
git add src/narrator.ts src/narrator.test.ts src/ending.ts src/game.ts
git commit -m "feat(lancefall): pre-Sovereign foreshadow + the Sovereign hand-off line"
```

---

## PHASE 4 — UI surfacing (verify via minified preview + __lf + Playwright; no unit tests for ui.ts)

> For every Phase-4 task: after the edit, run `npx tsc --noEmit && npx vitest run && npx vite build`, then `npx vite preview` and verify the screen via the `__lf` dev hook / a Playwright snapshot. UI a11y: re-check under `reduceMotion` + `reduceFlashing` + `clarity`.

### Task 12: The Last Word in the console

**Files:**
- Modify: `src/panels/bombe.ts` (token render for `int-what-remains`, ~line 233; the choice-tail reconcile, ~246)
- Modify: `src/style.css` (the `.bombe-tok.last-word` style)

- [ ] **Step 1:** In `src/panels/bombe.ts`, import the Last Word helpers:

```typescript
import { lastWordResolved, LAST_WORD_PLACEHOLDER, LAST_WORD_CAPTION, LONGEST_DAY_REFRAME } from '../ending';
import { isLongestDay } from '../intercepts';
```

- [ ] **Step 2:** After the token `.map(...)` that fills `text` (line ~233), append the Last Word for `int-what-remains` only:

```typescript
      if (ic.id === 'int-what-remains') {
        const resolved = lastWordResolved(save);
        const lw = el('span', {
          class: 'bombe-tok last-word' + (resolved ? ' r-key' : ' enc'),
          title: resolved ? '' : LAST_WORD_CAPTION,
        }, (resolved ?? LAST_WORD_PLACEHOLDER) + ' ');
        text.appendChild(lw);
      }
```

- [ ] **Step 3:** In the choice-tail reconcile for `int-what-remains` (line ~246), when `isLongestDay(save) && !choiceTail(save)`, prefer the reframe over the generic pending line:

```typescript
    } else {
      tail.textContent = isLongestDay(save)
        ? LONGEST_DAY_REFRAME
        : '— this cipher is not solved; it is chosen, on the longest day —';
      tail.style.color = '';
    }
```

- [ ] **Step 4:** Add styling in `src/style.css` (near the other `.bombe-tok` rules):

```css
.bombe-tok.last-word.enc { color: #6b7280; letter-spacing: 0.12em; opacity: 0.85; }
.bombe-tok.last-word.r-key { color: var(--amber); text-shadow: 0 0 18px #ffd88488; }
```

- [ ] **Step 5:** Build + preview-verify the console shows one grey trailing word on "What Remains" pre-choice, the reframe line at 100%, and the resolved word post-choice.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`

- [ ] **Step 6: Commit** (stage only your hunks in the shared tree)

```bash
git add src/panels/bombe.ts src/style.css
git commit -m "feat(lancefall): THE LAST WORD in the console — the cipher the machine cannot read"
```

---

### Task 13: The Sixth reveal at the choice

**Files:**
- Modify: `src/ui.ts` (the choice prompt, line ~1752; show the Sixth thesis + faces + the Sovereign hand-off)
- Modify: `src/style.css`

- [ ] **Step 1:** In `src/ui.ts`, import the Sixth + hand-off:

```typescript
import { sixthReveal, SOVEREIGN_HANDOFF } from './ending';
```

- [ ] **Step 2:** Extend the choice prompt (the `.go-choice-prompt` block built at line ~1757). Add a Sixth block after the existing turing line. Because the prompt is built once, populate it at show time — add a member `private goSixth!: HTMLElement;` and create it in the prompt:

```typescript
        (this.goSixth = el('div', { class: 'go-sixth' })),
```

- [ ] **Step 3:** Fill `goSixth` from the save whenever the choice is shown. In `showGameOver` (line ~3808), inside the `info.choicePending` branch, after `this.choiceRow.classList.toggle('hidden', !info.choicePending)`, add a call `this.renderSixth(saveRef)` — `showGameOver` needs the save; if it isn't already passed, read it from the existing `this.saveRef` the UI keeps (search for `saveRef` — the UI stores a save reference for the dev `__lf` hook + panels). Then add:

```typescript
  /** Render THE SIXTH reveal into the choice prompt — the thesis (always), the faces you woke,
   *  the gentle pull if any sleep, and the deepest line at 100%. Read-only over save. */
  private renderSixth(save: SaveData): void {
    const r = sixthReveal(save);
    const kids: HTMLElement[] = [
      el('div', { class: 'go-sixth-handoff' }, SOVEREIGN_HANDOFF),
      el('div', { class: 'go-sixth-thesis' }, r.thesis),
    ];
    if (r.faces.length) {
      const faces = el('div', { class: 'go-sixth-faces' });
      for (const f of r.faces) faces.append(el('div', { class: 'go-sixth-face' }, el('b', {}, f.name), ' — ' + f.line));
      kids.push(faces);
    }
    if (r.unwokenPull) kids.push(el('div', { class: 'go-sixth-pull' }, r.unwokenPull));
    if (r.deepest) kids.push(el('div', { class: 'go-sixth-deepest' }, r.deepest));
    this.goSixth.replaceChildren(...kids);
  }
```

- [ ] **Step 4:** Add CSS for `.go-sixth*` (restrained — small caps, dim, scrollable if many faces; a11y: respects `prefers-reduced-motion` via no animation). Keep it readable, not flashy.

```css
.go-sixth { margin-top: 14px; max-height: 30vh; overflow-y: auto; text-align: left; font-size: 0.86rem; line-height: 1.5; color: #c9d4e0; }
.go-sixth-handoff { font-style: italic; color: #ffd884; margin-bottom: 8px; }
.go-sixth-thesis { color: #aeb9c7; margin-bottom: 8px; }
.go-sixth-faces { display: flex; flex-direction: column; gap: 2px; opacity: 0.92; }
.go-sixth-pull { margin-top: 8px; color: #8a94a3; }
.go-sixth-deepest { margin-top: 8px; color: #ffd884; font-style: italic; }
```

- [ ] **Step 5:** Build + preview-verify: on a fresh save (no woken citizens) the thesis + pull show, no faces; at 100% all 16 faces + the deepest line show. Verify keyboard scroll + reduce-motion.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat(lancefall): THE SIXTH reveal at the choice — the hand-off, the thesis, the faces"
```

---

### Task 14: The completion sequence (name the fates)

**Files:**
- Modify: `src/ui.ts` (replace the Task-10 `playCompletion` stub; extend `resolveChoice`)
- Modify: `src/style.css`

- [ ] **Step 1:** Import the epilogue composer in `src/ui.ts`:

```typescript
import { completionEpilogue } from './ending';
```

- [ ] **Step 2:** Replace the `playCompletion` stub with the real sequence. It reuses the existing full-screen wash (`goResolve`/`goResolveHead`/`goResolveLine`) and then lists the fates. a11y: under reduce-motion it shows the list immediately (no staged reveal).

```typescript
  /** THE COMPLETION — play the chosen ending over the skyline and name every woken citizen's fate.
   *  Reuses the resolve wash; the fate list reveals immediately under reduce-motion. */
  playCompletion(which: 'catch' | 'fall', save: SaveData, head: string, line: string): void {
    this.resolveChoice(head, line); // the wash (already a11y-gated)
    const fates = completionEpilogue(save, which);
    const list = el('div', { class: 'go-fates' });
    for (const f of fates) list.append(el('div', { class: 'go-fate' }, el('b', {}, f.name), ' — ' + f.line));
    this.goResolveLine.after(list);
    // tidy: drop the list when the wash ends (resolveChoice already schedules goResolve hide)
    window.setTimeout(() => list.remove(), 6000);
  }
```

- [ ] **Step 3:** Also call the completion sequence on the *normal* (first) choice commit, not only the late release. In `resolveChoice` (line ~3777), after the wash is set up, append the fate list there too (so the catch/fall ending always names the fates). Refactor: extract a `private renderFates(which, save)` and call it from both `resolveChoice` and `playCompletion`. `resolveChoice` currently has no `save` — pass `this.saveRef` (the UI's stored save reference).

```typescript
  private renderFates(which: 'catch' | 'fall', save: SaveData): void {
    const existing = this.goResolve.querySelector('.go-fates'); if (existing) existing.remove();
    const fates = completionEpilogue(save, which);
    if (!fates.length) return;
    const list = el('div', { class: 'go-fates' });
    for (const f of fates) list.append(el('div', { class: 'go-fate' }, el('b', {}, f.name), ' — ' + f.line));
    this.goResolve.append(list);
  }
```

Call `this.renderFates(which, this.saveRef)` at the end of `resolveChoice`, and have `playCompletion` call `resolveChoice` (which now renders fates) — drop the duplicated list code in `playCompletion`.

- [ ] **Step 4:** CSS for `.go-fates` (calm, scrollable, restrained):

```css
.go-fates { margin-top: 16px; max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; text-align: center; font-size: 0.9rem; color: #e6edf5; }
.go-fate b { color: #ffd884; }
```

- [ ] **Step 5:** Build + preview-verify: committing catch names the 16 hold-fates (the Vintner "uncorked forever"); committing fall names the release-fates (the Vintner "wine opened"). Verify under reduce-motion (no stagger) + that the list scrolls with keyboard.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add src/ui.ts src/style.css
git commit -m "feat(lancefall): THE COMPLETION — the ending names every woken citizen's fate"
```

---

### Task 15: THE FALL tab — YOUR LANCEFALL + the Sixth accretion

**Files:**
- Modify: `src/panels/fall.ts` (add `renderYourLancefall` + `renderTheSixth`)
- Modify: `src/ui.ts` (mount them near line 2032)
- Modify: `src/style.css`

- [ ] **Step 1:** In `src/panels/fall.ts`, add imports + two render functions:

```typescript
import type { SaveData } from '../save';
import { CITIZENS, isCitizenWoken } from '../citizens';
import { sixthReveal, daysHeld } from '../ending';

/** YOUR LANCEFALL — the player's permanent, revisitable record of THE CHOICE. */
export function renderYourLancefall(save: SaveData): HTMLElement {
  const box = el('div', { class: 'your-lancefall' });
  const woke = CITIZENS.filter((c) => isCitizenWoken(save, c)).length;
  if (save.stillpointChoice === 'none') {
    box.append(el('div', { class: 'yl-pending' }, 'The last word is unread. Descend, fell the Sovereign, and choose.'));
    return box;
  }
  const held = save.released
    ? 'You held the light, then let the day turn. It is finished.'
    : `You hold the longest day. Day held: ${daysHeld(save)}.`;
  const verb = save.stillpointChoice === 'catch' && !save.released ? 'YOU HOLD THE LIGHT' : 'YOU LET IT GO';
  box.append(
    el('div', { class: 'yl-verb' }, verb),
    el('div', { class: 'yl-line' }, held),
    el('div', { class: 'yl-meta' }, `Chosen ${save.choiceDate || '—'} · ${woke}/16 remembered`),
  );
  return box;
}

/** THE SIXTH — the accreting confession list (one per woken citizen). */
export function renderTheSixth(save: SaveData): HTMLElement {
  const box = el('div', { class: 'the-sixth' });
  const r = sixthReveal(save);
  box.append(el('div', { class: 'sixth-thesis' }, r.thesis));
  if (r.faces.length) {
    const list = el('div', { class: 'sixth-list' });
    for (const f of r.faces) list.append(el('div', { class: 'sixth-row' }, el('b', {}, f.name), ' — ' + f.line));
    box.append(list);
  }
  if (r.unwokenPull) box.append(el('div', { class: 'sixth-pull' }, r.unwokenPull));
  if (r.deepest) box.append(el('div', { class: 'sixth-deepest' }, r.deepest));
  return box;
}
```

(Confirm `el` is imported in `fall.ts` as `renderTheSix` already uses it.)

- [ ] **Step 2:** In `src/ui.ts` near line 2032 (where `renderTheSix()` is appended under "THE SIX WHO LET IT FALL"), import + append the two new sections after it:

```typescript
import { renderTheSix, renderYourLancefall, renderTheSixth } from './panels/fall';
// ...
body.append(el('div', { class: 'stats-label' }, 'THE SIX WHO LET IT FALL'), renderTheSix());
body.append(el('div', { class: 'stats-label' }, 'THE SIXTH'), renderTheSixth(save));
body.append(el('div', { class: 'stats-label' }, 'YOUR LANCEFALL'), renderYourLancefall(save));
```

(Use the `save` in scope where the FALL tab body is built — confirm the variable name; the FALL tab render has the save available as it renders `renderTheSix()` in the same block.)

- [ ] **Step 3:** CSS for `.your-lancefall` / `.the-sixth` (restrained, consistent with the codex panels).

```css
.your-lancefall { padding: 10px 0; }
.yl-verb { font-weight: 700; letter-spacing: 0.08em; color: #ffd884; }
.yl-line { color: #c9d4e0; margin-top: 4px; }
.yl-meta { color: #8a94a3; font-size: 0.8rem; margin-top: 4px; }
.yl-pending { color: #8a94a3; font-style: italic; }
.the-sixth .sixth-thesis { color: #aeb9c7; line-height: 1.5; }
.the-sixth .sixth-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; font-size: 0.86rem; color: #c9d4e0; }
.the-sixth .sixth-pull { color: #8a94a3; margin-top: 8px; }
.the-sixth .sixth-deepest { color: #ffd884; font-style: italic; margin-top: 8px; }
```

- [ ] **Step 4:** Build + preview-verify the FALL tab now shows THE SIX, THE SIXTH (accreting), and YOUR LANCEFALL; values update as citizens wake and as the choice/vigil change.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`

- [ ] **Step 5: Commit**

```bash
git add src/panels/fall.ts src/ui.ts src/style.css
git commit -m "feat(lancefall): THE FALL tab — YOUR LANCEFALL record + the Sixth accretion"
```

---

### Task 16: The title Vigil line + the release affordance

**Files:**
- Modify: `src/ui.ts` (title / loadout — a vigil line + a "let the day turn" button gated by `canRelease`)
- Modify: `src/style.css`

- [ ] **Step 1:** Import the Vigil helpers in `src/ui.ts`:

```typescript
import { vigilBeat, canRelease } from './ending';
```

- [ ] **Step 2:** Find where the title/loadout reads `save` to paint its status (search for where `selectedMode` / the loadout footer is built). Add a vigil line element painted on each title refresh:

```typescript
  /** Paint the Vigil status on the title (the held-light line + the release affordance). Read-only. */
  private renderVigil(save: SaveData): void {
    const beat = vigilBeat(save);
    this.vigilLine.textContent = beat ? beat.line : '';
    this.vigilLine.classList.toggle('hidden', !beat);
    const can = canRelease(save);
    this.releaseBtn.classList.toggle('hidden', !can);
  }
```

Create the elements where the title footer is built:

```typescript
    this.vigilLine = el('div', { class: 'vigil-line hidden' });
    this.releaseBtn = el('button', { class: 'btn vigil-release hidden' }, 'LET THE DAY TURN');
    this.releaseBtn.addEventListener('click', () => this.cb.onReleaseTheDay());
```

- [ ] **Step 3:** Add the `onReleaseTheDay` callback to the UI callbacks interface (near `onChoice`, line ~88) and wire it in `main.ts`/`game.ts` to call `game.requestReleaseTheDay()`:

```typescript
  onReleaseTheDay: () => void;
```

In the game's UI-callback wiring (search `onChoice:`), add:

```typescript
      onReleaseTheDay: () => { this.requestReleaseTheDay(); },
```

- [ ] **Step 4:** Call `this.renderVigil(save)` wherever the title repaints (alongside the existing loadout paint). CSS:

```css
.vigil-line { color: #c9d4e0; font-style: italic; font-size: 0.86rem; margin-top: 6px; }
.vigil-release { margin-top: 8px; min-height: 64px; }
```

- [ ] **Step 5:** Build + preview-verify: with a catch save + `vigilSince` set so daysHeld ≥ 11 (force via `__lf` save edit), the title shows the permission beat + the LET THE DAY TURN button; clicking it plays the completion + flips to fall + the button disappears.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add src/ui.ts src/style.css src/game.ts
git commit -m "feat(lancefall): title Vigil line + the LET THE DAY TURN release affordance"
```

---

### Task 17: a11y + final gate

**Files:** none (verification + any fixes surfaced)

- [ ] **Step 1:** Full gate.

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: all green (≈1262 + new ending/citizens/migrate/narrator tests).

- [ ] **Step 2:** Prod boot under minified preview.

Run: `npx vite preview` → open the served URL → confirm boot is clean (only the known CSP CF-beacon console error), the title paints, the FALL tab renders the three sections.

- [ ] **Step 3:** a11y matrix. With SETTINGS, toggle each and re-verify the new visuals stay calm + reachable:
  - `reduceMotion` — completion sequence has no stagger; the wash is held, no time-warp.
  - `reduceFlashing` — no strobe on the Last Word / Sixth reveal.
  - `clarity` — text legible over the coherence backdrop.
  - keyboard/d-pad — the choice cards, the Sixth scroll, the LET THE DAY TURN button (64px) all reachable.

- [ ] **Step 4:** `detect_changes()` (GitNexus) — confirm the touched symbols match this plan's scope; investigate any unexpected flow change.

- [ ] **Step 5: Commit** any a11y fixes.

```bash
git add -A -- src/
git commit -m "polish(lancefall): a11y pass + final gate for THE LAST WORD"
```

> Do NOT deploy. Deployment to lancefall.pages.dev needs explicit owner sign-off (per repo convention). This plan ends at a committed, green `v6` branch.

---

## Self-Review

**Spec coverage:**
- §3 The spine (Last Word) → Tasks 2, 12. ✓
- §4 The journey (foreshadow, hand-off) → Task 11. ✓
- §5 Choice rewritten / unified text → Task 1. ✓
- §6 The Sixth (accretion + scaled reveal) → Tasks 3, 4, 13, 15. ✓
- §7 The Vigil (arc + re-offerable release, irreversibility) → Tasks 5, 9, 10, 16. ✓
- §8 The endings (completion sequence, all 16 fates) → Tasks 3, 6, 14. ✓
- §9 Persistent canon (YOUR LANCEFALL, unify text) → Tasks 1, 15. ✓
- §10 Architecture (ending.ts, save, determinism, a11y) → Tasks 1, 7, 8, 17. ✓
- §11 Authored strings → Tasks 3 (citizens), 4/5/11 (constants). ✓
- §12 Invariants / not-doing → Global Constraints + no new bosses/modes. ✓

**Placeholder scan:** No "TBD"/"add appropriate X". All strings authored; all test bodies concrete. ✓

**Type consistency:** `Choice` defined in `ending.ts` (Task 1), re-exported by `stillpoint.ts`. `sixthReveal`→`{thesis, faces[{name,line}], unwokenPull, deepest}` used identically in Tasks 4/13/15. `completionEpilogue`→`CitizenFate[{name,line}]` used in Tasks 6/14. `daysHeld`/`vigilStage`/`vigilBeat`/`canRelease` signatures consistent across Tasks 5/9/10/16. Save fields `vigilSince:number`/`released:boolean`/`choiceDate:string` consistent Tasks 5/7/9/10/15/16. ✓

**Ordering note:** Task 5 (Vigil) references save fields added in Task 7 — the executor should do Task 7 before Task 5's implementation step (flagged inline in Task 5).
