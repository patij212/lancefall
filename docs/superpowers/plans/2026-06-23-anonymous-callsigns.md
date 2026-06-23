# Auto-assigned Anonymous Callsigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every nameless LANCEFALL save a unique, on-theme anonymous callsign (e.g. `LANCER-4827`) at boot, so players rank individually instead of collapsing into one shared `ANON` leaderboard row.

**Architecture:** A new pure module (`callsign.ts`) generates the name. A thin `Game.ensureCallsign()` boot step fills a blank `save.handle`, persists it, and adopts it into the live session. Boot ordering in `main.ts` runs it immediately for the common (no-cloud) path, and *after* the cloud merge settles for opted-in account users so a fresh device can't clobber a real chosen name. The dead "set a handle" post-run nudge becomes a once-ever informational toast.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Canvas 2D game (`src/game.ts`), Cloudflare Worker leaderboard (unchanged).

## Global Constraints

- **No `SAVE_VERSION` bump.** The one-time note reuses the additive `taught: string[]` array. No `migrate.ts` change.
- **No worker / backend change.** An auto-name is an ordinary handle; the worker's existing `ANON` fallback and verified-name override stay as-is.
- **Determinism:** `Math.random()` may be called only at boot (name generation), never inside the seeded run simulation. `generateCallsign` takes an injectable `rand` purely for deterministic tests.
- **Handle shape:** callsigns must satisfy the existing `sanitizeHandle()` contract — `\w`/space/hyphen only, trimmed, ≤ 16 chars.
- **CLAUDE.md rule:** run `impact({target, direction:"upstream"})` on every existing symbol before editing it and report the blast radius; run `detect_changes()` before each commit. GitNexus may be stale/locked — if a tool errors, refresh with `node .gitnexus/run.cjs analyze` or fall back to `grep` and say so.
- **Commands:** full suite `npm test`; single file `npx vitest run <path>`; typecheck+build `npm run build`; dev server `npm run dev` (port 5197); minified prod check `npm run build && npm run preview`.
- All ~1491 existing tests must stay green; `npm run build` must succeed (minified prod boot is the real gate — a dev-only pass is not enough).

---

### Task 1: Pure callsign module

**Files:**
- Create: `src/callsign.ts`
- Test: `src/callsign.test.ts`

**Interfaces:**
- Consumes: `sanitizeHandle`, `SaveData` from `src/save.ts` (both already exported — `sanitizeHandle` at [save.ts:287](../../../src/save.ts), `SaveData` is the save interface).
- Produces:
  - `generateCallsign(rand?: () => number): string` — a callsign like `"LANCER-4827"`.
  - `applyCallsign(save: SaveData, rand?: () => number): boolean` — if `save.handle` is blank, set it to a sanitized fresh callsign and return `true`; otherwise leave it and return `false`.

- [ ] **Step 1: Write the failing tests**

Create `src/callsign.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateCallsign, applyCallsign } from './callsign';
import { sanitizeHandle, defaultSave } from './save';

/** Deterministic rand stub: replays the given values, cycling. */
const seq = (xs: number[]): (() => number) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('generateCallsign', () => {
  it('is deterministic for a fixed rand (word index then number)', () => {
    // rand()#1 picks the word (0 -> first word), rand()#2 picks the number (0 -> 100).
    expect(generateCallsign(seq([0, 0]))).toBe('LANCER-100');
  });

  it('maps the top of the rand range to the last word and the max number', () => {
    expect(generateCallsign(seq([0.999999, 0.999999]))).toBe('VESPER-9999');
  });

  it('always matches WORD-NUMBER, is <=16 chars, and is sanitize-stable', () => {
    for (let i = 0; i < 500; i++) {
      const s = generateCallsign(); // real Math.random
      expect(s).toMatch(/^[A-Z]+-\d{3,4}$/);
      expect(s.length).toBeLessThanOrEqual(16);
      expect(sanitizeHandle(s)).toBe(s); // already canonical => sanitize is a no-op
      const n = Number(s.split('-')[1]);
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it('spans more than one word and number across many draws (distribution sanity)', () => {
    const words = new Set<string>();
    const nums = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const [w, n] = generateCallsign().split('-');
      words.add(w);
      nums.add(n);
    }
    expect(words.size).toBeGreaterThan(1);
    expect(nums.size).toBeGreaterThan(1);
  });
});

describe('applyCallsign', () => {
  it('fills a blank handle and reports it assigned', () => {
    const save = defaultSave(); // handle === ''
    expect(applyCallsign(save, seq([0, 0]))).toBe(true);
    expect(save.handle).toBe('LANCER-100');
    expect(sanitizeHandle(save.handle)).toBe(save.handle);
  });

  it('leaves an existing handle untouched and reports no change', () => {
    const save = defaultSave();
    save.handle = 'NEONKNIGHT';
    expect(applyCallsign(save, seq([0, 0]))).toBe(false);
    expect(save.handle).toBe('NEONKNIGHT');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/callsign.test.ts`
Expected: FAIL — `Failed to resolve import "./callsign"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/callsign.ts`:

```ts
// Auto-assigned anonymous player callsigns. A nameless save would otherwise collapse into the
// worker's single shared "ANON" leaderboard row; a unique on-theme callsign lets every player
// rank individually with zero setup. Pure: the only randomness is the injected `rand` (defaults
// to Math.random), called at BOOT only — never inside the seeded run simulation.
import { sanitizeHandle, type SaveData } from './save';

/** On-theme, pilot-flavored words (all <= 7 chars, so `WORD-9999` is always <= 16). */
const WORD_POOL = [
  'LANCER', 'PILOT', 'SPEAR', 'VIGIL', 'ECHO', 'ASH', 'DAWN', 'EMBER',
  'NEON', 'COMET', 'NOVA', 'RELAY', 'WARD', 'KITE', 'DUSK', 'GLASS',
  'RONIN', 'WRAITH', 'DRIFT', 'FLARE', 'BLADE', 'HALO', 'ONYX', 'VESPER',
] as const;

/** A unique-ish anonymous callsign like "LANCER-4827". `rand` is injectable only so tests are
 *  deterministic; production passes the default Math.random. The result already satisfies
 *  sanitizeHandle (letters/digit/hyphen, <= 16 chars), so sanitizing it is a no-op. */
export function generateCallsign(rand: () => number = Math.random): string {
  const idx = Math.min(WORD_POOL.length - 1, Math.floor(rand() * WORD_POOL.length));
  const word = WORD_POOL[idx];
  const n = Math.floor(rand() * 9900) + 100; // 100..9999
  return `${word}-${n}`;
}

/** Fill a blank handle with a fresh, sanitized callsign. Mutates `save` and returns true iff it
 *  assigned one; a save that already has a handle (typed or cloud-synced) is left untouched. This
 *  is the single canonical sanitize boundary, mirroring setHandle(). */
export function applyCallsign(save: SaveData, rand: () => number = Math.random): boolean {
  if (save.handle) return false;
  save.handle = sanitizeHandle(generateCallsign(rand));
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/callsign.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `tsc` succeeds and `vite build` completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/callsign.ts src/callsign.test.ts
git commit -m "feat(lancefall): pure anonymous-callsign generator + applyCallsign"
```

---

### Task 2: Assign the callsign at boot (cloud-safe)

**Files:**
- Modify: `src/game.ts` — add `import { applyCallsign } from './callsign';` to the existing import block; add a public `ensureCallsign()` method directly after `setHandle` ([game.ts:1474-1477](../../../src/game.ts)).
- Modify: `src/account.ts` — `init()` ([account.ts:192-195](../../../src/account.ts)) gains an optional post-sync callback.
- Modify: `src/main.ts` — boot ordering in the try-block ([main.ts:57-76](../../../src/main.ts)).
- Test: `src/account.test.ts` — add the no-op/back-compat cases for `init`.

**Interfaces:**
- Consumes: `applyCallsign(save, rand?)` from Task 1; `loadSave`, `saveSave` (already imported in `game.ts`).
- Produces:
  - `Game.ensureCallsign(): void` — public; called once from `main.ts`.
  - `account.init(onSettled?: () => void): void` — `onSettled` fires exactly once after the cloud sync settles (success, early-return, or offline error).

- [ ] **Step 1: Impact analysis (required before editing)**

Run (report blast radius for each; warn the user if any is HIGH/CRITICAL before proceeding):
```
impact({target: "init", direction: "upstream"})       # account.ts
impact({target: "ensureCallsign", direction: "upstream"})  # new — expect none
```
If GitNexus errors/stale: `node .gitnexus/run.cjs analyze`, else fall back to `grep -rn "account.init\|\.init(" src/` and note the fallback. `init`'s only caller is `main.ts:75` (expected LOW).

- [ ] **Step 2: Write the failing account.ts test**

Add to `src/account.test.ts` (in a suitable `describe`, e.g. a new `describe('init', ...)`):

```ts
import { init } from './account';

describe('init', () => {
  it('is a no-op and never throws with no backend configured (accounts disabled)', () => {
    // In tests VITE_LEADERBOARD_URL is unset => accountEnabled() is false => init early-returns.
    expect(() => init()).not.toThrow();
  });

  it('accepts an optional onSettled callback without throwing (back-compat + new arg)', () => {
    let called = false;
    expect(() => init(() => { called = true; })).not.toThrow();
    // Accounts are disabled in tests, so the callback path is not exercised here; the contract is
    // simply that passing a callback is safe. (The fired-after-sync path is covered by the prod
    // boot smoke in Step 8.)
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/account.test.ts`
Expected: FAIL — `init` currently takes no parameter, so `init(() => {...})` is a TS arity error at typecheck / the new `describe` references behavior not yet present.

- [ ] **Step 4: Update `account.init` to fire the callback after boot settles**

In `src/account.ts`, replace the `init` function ([account.ts:191-195](../../../src/account.ts)):

```ts
/** One-time wiring: register the save listener + boot the session. Call once from main.ts.
 *  `onSettled` (optional) fires exactly once after the cloud sync settles — success, early
 *  return, or offline error — so the caller can run a post-merge step (e.g. ensureCallsign). */
export function init(onSettled?: () => void): void {
  if (!accountEnabled()) return;
  boot().finally(() => { if (onSettled) { try { onSettled(); } catch { /* never break boot */ } } });
}
```
(`boot()` swallows its own errors and never rejects, so `.finally` always runs exactly once.)

- [ ] **Step 5: Run the account test to verify it passes**

Run: `npx vitest run src/account.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `Game.ensureCallsign()`**

In `src/game.ts`, add to the existing import that pulls from `./callsign` (create the import line near the other local imports, e.g. after the `./save` import at [game.ts:71](../../../src/game.ts)):

```ts
import { applyCallsign } from './callsign';
```

Then add this method immediately after `setHandle` ([game.ts:1477](../../../src/game.ts)):

```ts
  /** Boot step (called once from main.ts). Give a nameless save a unique anonymous callsign so the
   *  player ranks individually instead of collapsing into the shared ANON board row. Re-reads the
   *  save so a cloud-merged handle is honored, and never overwrites an existing (typed or cloud)
   *  handle. For account users main.ts defers this until AFTER the cloud merge settles, so a fresh
   *  device can't clobber a real chosen name. Math.random here is outside the seeded run RNG. */
  public ensureCallsign(): void {
    const s = loadSave();
    if (applyCallsign(s)) saveSave(s);
    this.save = s;
  }
```

- [ ] **Step 7: Wire boot ordering in `main.ts`**

In `src/main.ts`, replace the account block ([main.ts:71-76](../../../src/main.ts)):

```ts
  // Opt-in cloud save — strict no-op unless the player opted in AND a backend is configured.
  if (account.accountEnabled()) {
    account.adoptFragmentSession(); // absorb any OAuth return token before booting
    onSaveWrite(account.noteChange);
    // Assign the anonymous callsign AFTER the cloud merge settles, so a fresh device never clobbers
    // a real chosen name (handle merges by 'latest' write-timestamp).
    account.init(() => game.ensureCallsign());
  } else {
    // No cloud to reconcile against — assign immediately at boot.
    game.ensureCallsign();
  }
```
(`boot()` at [game.ts:354](../../../src/game.ts) is synchronous and never writes `this.save` asynchronously, so the non-account `ensureCallsign()` running right after `game.boot()` cannot be clobbered by a later frame.)

- [ ] **Step 8: Verify the full suite + a real boot**

Run: `npm test`
Expected: PASS (all ~1491 + the new tests).

Run: `npm run build && npm run preview`, open the printed URL with a **cleared** save (in DevTools console: `localStorage.clear()` then reload). Confirm in the console:
```
JSON.parse(localStorage.getItem('lancefall.save')).handle
```
Expected: a `WORD-NNNN` string (e.g. `"VIGIL-583"`), not `""`. Reload again and confirm the handle is **unchanged** (not regenerated each boot).

- [ ] **Step 9: detect_changes + commit**

Run `detect_changes()` (or `detect_changes({scope:"compare", base_ref:"v6"})`); confirm only `callsign.ts`, `game.ts`, `account.ts`, `main.ts`, `account.test.ts` are affected.

```bash
git add src/game.ts src/account.ts src/account.test.ts src/main.ts
git commit -m "feat(lancefall): assign anonymous callsign at boot (cloud-safe ordering)"
```

---

### Task 3: Replace the dead handle nudge with a once-ever toast

**Files:**
- Modify: `src/game.ts` — `finishGameOver` ([game.ts:3526-3529](../../../src/game.ts)); remove the now-orphaned `nudgedHandle` field ([game.ts:157](../../../src/game.ts)).

**Interfaces:**
- Consumes: `this.save.handle` (now always set, from Task 2), `this.save.taught` (string[]), `this.ui.toast(msg)`, `saveSave` — all already in use in `finishGameOver` (the `bombe:intro` toast at [game.ts:3450-3453](../../../src/game.ts) is the exact pattern to mirror).
- Produces: nothing new (behavioral change only).

- [ ] **Step 1: Impact analysis (required before editing)**

Run: `impact({target: "finishGameOver", direction: "upstream"})` and report the blast radius (warn if HIGH/CRITICAL). Expected callers: the run-end paths (`playerDie`, `winRun`/victory). Also grep the field to confirm it's safe to delete:
`grep -rn "nudgedHandle" src/` — expected only the declaration ([game.ts:157](../../../src/game.ts)) and its use in the nudge block being replaced.

- [ ] **Step 2: Replace the nudge block**

In `src/game.ts`, replace the post-run handle nudge ([game.ts:3522-3529](../../../src/game.ts)):

```ts
    // playtest (Nick): "work on the anon player name" — surface name entry after a scoring run
    // with no handle (once per session). The handle also labels ghost replays, so prompt even
    // when online boards are off; skip while THE CHOICE is pending (that screen takes priority).
    // Fired AFTER showGameOver so the RANKS field overlays the gameover screen (no modal race).
    if (!this.save.handle && w.score > 0 && !this.nudgedHandle && !info.choicePending) {
      this.nudgedHandle = true;
      this.ui.openLeaderboard(true);
    }
```

with the once-ever informational toast (every player now already has a handle from Task 2):

```ts
    // Every player now boots with an auto-assigned anonymous callsign (see ensureCallsign), so the
    // old "set a handle" nudge is dead. Instead, surface their board name ONCE EVER on the first
    // scoring run so they know it and that it's renameable in RANKS. Skip while THE CHOICE pends.
    if (w.score > 0 && !this.save.taught.includes('callsign:intro') && !info.choicePending) {
      this.save.taught.push('callsign:intro');
      this.ui.toast(`◇ RACING AS ${this.save.handle} — RENAME IN RANKS`);
      saveSave(this.save);
    }
```

- [ ] **Step 3: Remove the orphaned `nudgedHandle` field**

In `src/game.ts`, delete the field declaration ([game.ts:157](../../../src/game.ts)):

```ts
  private nudgedHandle = false; // show the "set a handle" leaderboard nudge once per session
```
(Only do this if Step 1's grep confirmed no other references remain.)

- [ ] **Step 4: Typecheck + full suite**

Run: `npm run build`
Expected: succeeds (no unused-variable / reference errors from the removed field).

Run: `npm test`
Expected: PASS (all green). If any test asserted the old `openLeaderboard(true)` nudge, update it to assert the `callsign:intro` taught-gating instead (search: `grep -rn "nudgedHandle\|openLeaderboard" src/*.test.ts`).

- [ ] **Step 5: Verify the toast behavior in a real boot**

Run: `npm run build && npm run preview`. With a cleared save, play (or use the DEV `__lf` hook) to finish one scoring run. Confirm:
- the toast `◇ RACING AS <CALLSIGN> — RENAME IN RANKS` appears once, and
- `JSON.parse(localStorage.getItem('lancefall.save')).taught` includes `"callsign:intro"`, and
- a second scoring run does **not** show it again.

- [ ] **Step 6: detect_changes + commit**

Run `detect_changes()`; confirm only `game.ts` (and any updated test) is affected.

```bash
git add src/game.ts
git commit -m "feat(lancefall): once-ever callsign toast replaces the dead handle nudge"
```

---

## Self-Review

**Spec coverage:**
- Callsign generator (`WORD-<number>`, pool, range, sanitize-stable, injectable rand, uniqueness) → Task 1. ✓
- Backfill new *and* existing nameless saves via a single boot step → Task 2 (`ensureCallsign` re-reads + `applyCallsign`). ✓
- Cloud-safe deferral (defer for account users, immediate otherwise; `init` callback in `.finally`) → Task 2 Steps 4, 7. ✓
- Once-ever toast replacing the forced nudge, `callsign:intro` taught key, skip on choicePending → Task 3. ✓
- No `SAVE_VERSION` bump / no worker change / determinism → Global Constraints; honored throughout. ✓
- Impact analysis + detect_changes per CLAUDE.md → Task 2 Step 1, Task 3 Step 1, Task 2 Step 9, Task 3 Step 6. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete. ✓

**Type consistency:** `generateCallsign(rand?)`/`applyCallsign(save, rand?)` signatures match across Task 1 definition and Task 2 usage; `ensureCallsign()` and `init(onSettled?)` names/signatures consistent between definition (Task 2) and call site (`main.ts`, Task 2). `taught` is `string[]` (matches `.includes`/`.push`). ✓
