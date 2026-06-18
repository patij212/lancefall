# Mode Consolidation — Endless/Casual merge + reachable Weekly

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Scope:** Title-screen mode rail only (UI layer). No sim, scoring, or save-format changes.

## Problem

The title rail surfaces **7 cards** (`RAIL_MODE_IDS`) over **8 data modes** (`MODES`), and two issues sit in it:

1. **CASUAL and ENDLESS are the same mode with different dials.** They share `seedKind`, `perks`, `canFail`, `shardMul`, and `speedBonus`. CASUAL differs only in difficulty numbers (`intensityMul` 0.62 vs 1, `spawnMul` 1.4 vs 1, `bossInterval` 75 vs 70, `shieldStart` 180 vs 110, `shieldMax` 0.2 vs 0.35), plus `rules.ranked:false` (off-board) and `rules.casualShields:6` (+6 ARMOR). Two cards for one verb — exactly the "fold Casual into a difficulty toggle, not its own card" the `PERFECT_10_SPEC.md` §4 recommended.

2. **WEEKLY SIEGE (`weekly`) is stranded — fully built but unreachable.** It has a complete config, a determinism guarantee, `pickWeeklyMutators`, a weekly PB-ghost key, a dedicated (always-empty) leaderboard tab, and tests asserting it is ranked — but **no launch path**. `selectedMode` is only ever set via `onSelectMode` (game.ts:1031) fed by `nextRailMode` (ui.ts:3199), which walks `RAIL_MODE_IDS` — and that list has no `weekly`. The `modes.ts:199` comment claiming it is "reachable as the Daily/Echo card's weekly variant" is stale; that variant toggle was never built.

## Goal

Collapse the rail from **7 cards → 6** while making **all 8 modes reachable**, using one consistent interaction pattern: a card that owns two mode variants and exposes a pill to switch between them.

- **ENDLESS card** owns `['casual', 'endless']`, pill `[ CASUAL · STANDARD ]`.
- **ECHO OF THE FALL card** owns `['daily', 'weekly']`, pill `[ DAILY · WEEKLY ]`.

This lands on the original mock-v6 6-card vision (CASUAL folds in; WEEKLY surfaces without adding a card).

## Decisions (locked with the owner)

1. **Merge depth: UI-only.** Both configs stay as data in `MODES`; the merge is purely a rail/UI concern. All off-board/ARMOR/determinism wiring keeps reading off whichever config is launched. No sim/save/scoring changes.
2. **WEEKLY: surface via the Echo card's DAILY⇄WEEKLY pill** (not cut, not a new card).
3. **Toggle input:** on-card segmented pill, flipped with **↑/↓** (←/→ stay rail nav) or **click**. Discoverable across keyboard, d-pad, mouse, and touch.
4. **Default variant + memory:** a fresh save defaults the Endless card to **CASUAL** (honors the spec's "suggested mode for run 1"); thereafter the player's last-played variant is remembered. The Echo card defaults to **DAILY**.
5. **Data model: Approach A** — a dedicated `RAIL_CARDS` structure replaces `RAIL_MODE_IDS`. `RunConfig` stays a pure sim/scoring object; cards are a UI concern.

## Architecture

`selectedMode` remains the single source of truth and always holds the *actual* launched mode id (`casual`/`endless`/`daily`/`weekly`/…). Every existing sim/scoring/determinism/ghost path reads off `modeById(selectedMode)` unchanged. A "card" is a new, UI-only grouping over modes.

### `modes.ts`
- Replace `RAIL_MODE_IDS: readonly string[]` with an ordered `RAIL_CARDS` list. Each card is `{ variants: readonly string[] }` (in display order). Single-variant cards: `arena`, `bossrush`, `nightmare`, `longestday`. Multi-variant cards: Endless `['casual','endless']`, Echo `['daily','weekly']`.
- Card display order (preserves today's left-to-right intent, casual folded into the Endless slot): `endless-card`, `arena`, `bossrush`, `echo-card`, `nightmare`, `longestday`.
- Helpers:
  - `cardForMode(id): RailCard` — the card whose `variants` include `id` (falls back to the first card for junk ids).
  - `cardVariants(id): readonly string[]` — the variants of that card.
  - `cardIsMulti(card): boolean` — `variants.length > 1`.
- `nextRailMode(currentId, dir, deepestWave)` walks **cards** (not flat ids), wrapping and skipping locked cards, and returns the **landing card's identity** (its default/first variant id). "Locked" is evaluated via the existing `modeUnlocked` (only single-variant cards carry `unlockedAtWave`; the two variant cards are always unlocked). Responsibility split: `nextRailMode` picks the *card*; the UI layer then resolves that card to its *remembered* variant (see UI memory below) before setting `selectedMode`. This keeps `modes.ts` free of session memory.
- `MODES` data is **unchanged** — all 8 modes stay.
- Rewrite the stale `modes.ts:199` comment to describe `RAIL_CARDS` and the now-true Echo→weekly reachability.

### `save.ts`
- Change `defaultSave().selectedMode` from `'endless'` → `'casual'`. `migrate` already guards `selectedMode` to a valid mode id, so old saves are unaffected and a corrupted id still falls back to default. **No `SAVE_VERSION` bump, no new field.**

### `ui.ts`
- **In-memory per-card variant map** (not persisted), seeded on load from `selectedMode`: the card owning the persisted `selectedMode` remembers that variant; other multi-variant cards use their default (`endless`→`casual`, `echo`→`daily`). Cross-session memory is already provided by `selectedMode` persistence; this map only smooths within-session ←/→ navigation.
- Rail render: multi-variant cards render a segmented pill of their variant labels with the active one lit. Card "selected" state matches when `selectedMode` ∈ the card's variants.
- Input:
  - **←/→**: rail nav (unchanged path through `nextRailMode`), landing on a card sets `selectedMode` to that card's remembered/default variant.
  - **↑/↓**: on a multi-variant selected card, flip the variant — update the in-memory map **and** `selectedMode`, re-render. On a single-variant card, no-op (no deny-shake).
  - **Click** on a pill segment: select that variant directly.
- kbd-hint row: add the ↑/↓ "switch variant" affordance.
- DESCEND: unchanged. The descend mode-line and "INITIATING DESCENT" overlay already render the config `name`, so CASUAL / ENDLESS / ECHO OF THE FALL / WEEKLY SIEGE all display correctly.

### Labels
- Endless card: title `ENDLESS`, pill `[ CASUAL · STANDARD ]` (STANDARD = the ranked `endless` config).
- Echo card: title `ECHO OF THE FALL`, pill `[ DAILY · WEEKLY ]`.

## Scoring & leaderboards (no new wiring)

Falls out of the existing per-config rules:
- CASUAL: `rules.ranked:false` → `modeRanked` false → submit skipped at game.ts:2613.
- STANDARD (`endless`): ranked → `endless` board, as today.
- DAILY: date-seeded → date-scoped daily board, best-of-3 attempts unchanged.
- WEEKLY: week-seeded → `weekly` board, which now populates for the first time.
- Leaderboard tab list (ui.ts:2703) unchanged — already has `weekly`, correctly has no `casual`.

## Testing

- **`modes.test.ts`**: `RAIL_CARDS` shape — Endless card variants `['casual','endless']`, Echo card variants `['daily','weekly']`, all other cards single-variant; `nextRailMode` walks cards and skips locked; `cardForMode`/`cardVariants`/`cardIsMulti` behavior.
- **Reachability guard** (the regression that stranded WEEKLY): assert **every `MODES` id is reachable** — present in some `RAIL_CARDS` card's variants. Prevents future stranding.
- **`save` default**: fresh save `selectedMode === 'casual'`; `migrate` still guards a junk id to default and preserves a real one.
- **Determinism**: existing weekly determinism test stays green; add an assertion that `weekly` is launchable via its card.
- **Playwright smoke**: flip the Endless pill CASUAL↔STANDARD and the Echo pill DAILY↔WEEKLY; confirm DESCEND launches the matching config and 0 console errors.

## Out of scope / non-goals

- No change to BOSS RUSH or ARENA (kept as distinct cards per the owner's earlier call).
- No new save fields, no `SAVE_VERSION` bump, no migration logic.
- No sim/difficulty re-tuning — CASUAL/ENDLESS keep their current numbers.
- No NIGHTMARE/SOLSTICE changes — they stay single-variant, progress-gated cards.

## Risk

Low. The change is confined to the rail (UI) layer plus a one-line save default. `RunConfig` and all sim/scoring/determinism paths are untouched; modes are launched by id exactly as today. The main care points are UI-mechanical: card-highlight matching either variant, `nextRailMode` walking cards, and the kbd-hint/pill rendering — all covered by unit tests + a Playwright smoke.
