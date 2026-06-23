# Auto-assigned anonymous callsigns — design

**Date:** 2026-06-23
**Status:** approved (ready for implementation plan)

## Problem

A new LANCEFALL player has no name. `save.handle` defaults to `''`
([save.ts:325](../../../src/save.ts)), the empty-string "not set / anonymous" sentinel.
Two consequences:

1. **One shared bucket.** The Cloudflare worker substitutes `ANON` for a blank handle and
   aggregates *every* handle-less player under a single `ANON` leaderboard row
   ([api.ts:46](../../../src/api.ts)). A nameless player can never see their own score ranked.
2. **Friction.** After a scoring run with no handle, the game force-opens RANKS once per session
   to nag the player to type a name ([game.ts:3526](../../../src/game.ts)).

## Goal

Every player has a **distinct, on-theme anonymous name** (e.g. `LANCER-4827`) from their first
run, so they rank individually with zero manual setup. Renaming in the RANKS handle field works
exactly as today.

## Decisions (locked with the owner)

- **Name style:** themed callsign + number — `WORD-<number>` (e.g. `LANCER-4827`, `VIGIL-583`).
- **Scope:** backfill *everyone* anonymous — any save with a blank handle (brand-new **or** an
  existing nameless save) gets a callsign on next load. Nobody stays in the shared `ANON` bucket.

## Non-goals

- No change to the worker / leaderboard backend. An auto-name is an ordinary handle; the existing
  `ANON` fallback stays as a defensive path for a genuinely empty submission.
- No globally-guaranteed-unique names (no server round-trip to reserve a name). See Uniqueness.
- No `SAVE_VERSION` bump. The one-time note reuses the additive `taught: string[]` array.
- The account `name` field (OAuth display name, server-owned) is untouched — this is purely
  `save.handle`, the field the anonymous leaderboard submit already uses
  ([game.ts:3465](../../../src/game.ts)).

## Design

### 1. New pure module `src/callsign.ts`

```ts
export function generateCallsign(rand: () => number = Math.random): string
```

- **Word pool** (~24 short, pilot-flavored, on-theme words, all ≤ 7 chars):
  `LANCER, PILOT, SPEAR, VIGIL, ECHO, ASH, DAWN, EMBER, NEON, COMET, NOVA, RELAY, WARD, KITE,
  DUSK, GLASS, RONIN, WRAITH, DRIFT, FLARE, BLADE, HALO, ONYX, VESPER`.
- **Number:** `100–9999` (`Math.floor(rand() * 9900) + 100`) → format `` `${WORD}-${n}` ``.
  Max length `WRAITH-9999` = 11 chars, always ≤ the 16-char handle cap.
- **Sanitize-stable by construction:** the raw `WORD-<number>` already satisfies every
  `sanitizeHandle()` rule ([save.ts:287](../../../src/save.ts)) — letters/digits/hyphen only, no
  leading/trailing space, ≤ 16 chars — so `sanitizeHandle(callsign) === callsign`. The canonical
  sanitize is applied once at the assignment boundary in `ensureCallsign()` (§2), matching the
  typed-handle path in `setHandle()`; `generateCallsign()` itself does not call it.
- `rand` is injectable **only** so tests are deterministic; production callers pass the default
  `Math.random`.

**Uniqueness:** ~24 × 9 900 ≈ 238k combinations — *reasonably* unique, not guaranteed. A rare
collision between two real anonymous players behaves exactly as today: the worker groups anon
scores by name (best score wins that row), and either player can rename in RANKS. This is an
accepted limitation, documented here rather than solved with a name-reservation server call.

### 2. Assignment pipeline — `Game.ensureCallsign()` + boot ordering

New public method on `Game`:

```ts
public ensureCallsign(): void {
  const s = loadSave();                  // re-read — a cloud merge may have adopted a newer save
  if (s.handle) { this.save = s; return; }   // already named (typed or cloud-synced) → adopt, done
  s.handle = sanitizeHandle(generateCallsign());
  saveSave(s);                           // persist (also triggers the cloud flush for account users)
  this.save = s;                         // adopt into the live session
  // one-time note handled at game-over (see §3), not here, so it surfaces in context.
}
```

Why a dedicated boot step (not `defaultSave()` or `loadSave()`):

- `defaultSave()` must stay pure/deterministic — it is the baseline for `cloudMerge` and for many
  tests; and it cannot backfill existing saves.
- `loadSave()` is called in non-boot contexts (the cloud merge calls `loadSave()` itself), so
  assigning there would mutate at the wrong times and is blind to cloud timing.
- A single `ensureCallsign()` runs **once at boot**, backfills new *and* existing nameless saves,
  and can be ordered relative to the cloud sync.

**Boot ordering in `main.ts` (cloud-safe):**

The cloud merge resolves `handle` by `'latest'` write-timestamp ([cloudMerge.ts:38](../../../src/cloudMerge.ts)).
If a fresh second device assigned + persisted a callsign *before* the merge, its newer timestamp
would win and clobber not just a real chosen handle but every other `'latest'` field
(`selectedShip`, `selectedTheme`, …) back to defaults. So:

- **No account (the default for every new player):** call `game.ensureCallsign()` immediately
  after `game.boot()` → instant callsign.
- **Cloud account enabled:** pass it as a post-sync callback —
  `account.init(() => game.ensureCallsign())` — so it runs *after* `account.boot()`'s merge +
  `adopt()` settle. `ensureCallsign()` then re-reads the merged save: if cloud carried a real
  handle it adopts it (no auto-name); if both sides were blank it assigns a fresh callsign, which
  syncs up via the normal flush.

A brand-new player is never account-enabled (cloud is opt-in, off by default), so they always take
the instant path; there is no cloud save to clobber regardless (`mergeCloud` returns local
unchanged when there is no cloud save, [account.ts:63](../../../src/account.ts)).

**`account.init()` change:** gains an optional `onSettled?: () => void` parameter, invoked in a
`.finally()` on `boot()` so it fires exactly once whether the sync succeeds, returns early, or
throws (offline). `main.ts` is the only caller. When accounts are disabled, `main.ts` calls
`game.ensureCallsign()` directly instead — so the callback runs exactly once via one path or the
other.

### 3. One-time note (replaces the dead forced nudge)

The game-over nudge at [game.ts:3526](../../../src/game.ts) — `if (!this.save.handle && w.score > 0
&& !this.nudgedHandle && !info.choicePending) this.ui.openLeaderboard(true)` — can never fire once
`handle` is always set. Replace it with a gentle, **once-ever** toast on the first scoring run,
mirroring the `bombe:intro` taught-gated toast directly above it ([game.ts:3450](../../../src/game.ts)):

```ts
if (w.score > 0 && !this.save.taught.includes('callsign:intro') && !info.choicePending) {
  this.save.taught.push('callsign:intro');
  this.ui.toast(`◇ RACING AS ${this.save.handle} — RENAME IN RANKS`);
  saveSave(this.save);
}
```

- Gated by the new `taught` entry `'callsign:intro'` → shows once ever, persisted; no version bump.
- Skipped while THE CHOICE is pending (that screen takes priority — same guard as the old nudge).
- The now-unused `nudgedHandle` session field is removed if nothing else references it (verify
  before deleting).

### 4. Determinism & safety

- `Math.random()` runs exactly once, at boot, entirely outside the seeded run RNG. Daily and
  seeded runs stay bit-identical.
- No worker / backend change.
- No `SAVE_VERSION` bump (additive `taught` key only).

## Files & tests

**New**
- `src/callsign.ts` — `generateCallsign()` + word pool.
- `src/callsign.test.ts` — format matches `^[A-Z]+-\d+$`; length ≤ 16; output equals its own
  `sanitizeHandle()`; deterministic for a fixed injected `rand`; spans multiple words/numbers
  across the unit range (distribution sanity); never empty.

**Edit**
- `src/game.ts` — add `ensureCallsign()`; swap the nudge for the `callsign:intro` toast; remove
  `nudgedHandle` if orphaned.
- `src/account.ts` — `init(onSettled?)` fires the callback in `boot().finally(...)`.
- `src/main.ts` — boot ordering: `ensureCallsign()` direct when accounts off, as the `init`
  callback when on.

**Gate:** full suite (~1491 tests) green; production (minified `vite preview`) boots clean on
desktop; a fresh save boots straight into a callsign.

## Impact analysis (required by CLAUDE.md before editing)

Run `impact({target, direction: "upstream"})` and report blast radius before editing each of:
`init` (account.ts), the game-over method enclosing line 3526 (game.ts), and the `main.ts` boot
sequence. Run `detect_changes()` before committing. New files (`callsign.ts`) carry no upstream
impact.
