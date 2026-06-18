# UI Morph — Keyed Reconciler (No-Rebuild Cockpit & Modals)

**Date:** 2026-06-18
**Status:** Approved design — pending spec review → implementation plan
**Scope surfaces:** Title/cockpit menu + modal panels (NOT in-run HUD, NOT game-over)

## Problem

Every interaction in the title/cockpit (select mode, equip ship, toggle Heat, flip a
variant pill, pick a theme/trail) routes through a callback that persists to `save` and
re-enters `UI.refreshTitle(save)`. `refreshTitle` then calls `replaceChildren()` on the
**mode rail, ship row, theme row, trail row, heat pips, and armor pips** — wiping and
rebuilding every section from scratch on every click. Modal panels do the same: their
bodies `replaceChildren(...renderXxx())` on open and on every in-modal buy/select/tab.

Consequences:
- Visible section "reloads" / flicker on each click (no morph).
- CSS transitions cannot fire — new DOM nodes have no prior state to animate from.
- Focus and scroll position are lost.
- Canvas ship-glyphs are re-painted on every refresh.
- A real bug: variant-pill listeners rely on `stopPropagation`, which is "unreliable"
  (per the in-code comment) precisely because `onSelectMode` re-renders synchronously and
  destroys the clicked node mid-event.

Root cause: full rebuild on state change, plus event listeners that **capture per-refresh
state in closures** (`activeId`, `unlocked`), which is what made rebuilding necessary in
the first place.

## Goal

Clicking a UI element morphs it to its next state **in place**, with no visible rebuild of
that section or any sibling section. "Buttery smooth."

## Approach (chosen)

A single keyed-reconciler primitive. Rejected alternatives: per-section hand-rolled
in-place updates (no shared primitive, repetitive, each its own thing to re-verify) and
View Transitions crossfade (still a full rebuild under a crossfade — loses focus, reflashes
canvases, bug remains).

## Components

### 1. `reconcile()` — `src/panels/dom.ts`

```ts
export function reconcile<T>(
  container: HTMLElement,
  items: readonly T[],
  keyFn: (item: T, index: number) => string,
  createFn: (item: T, index: number) => HTMLElement,
  updateFn: (node: HTMLElement, item: T, index: number) => void,
): void
```

- Maintains a module-level `WeakMap<HTMLElement, Map<string, HTMLElement>>` so the
  container element is never polluted and entries are GC'd with the container.
- For each item in order: look up the keyed node; reuse it or `createFn` it; run `updateFn`
  (always — idempotent state application); then `insertBefore(node, container.childNodes[i])`
  only when the node is not already in slot `i`. Because slots `0..i-1` are already correct,
  placing `desired[i]` at index `i` keeps the prefix correct (O(n) DOM ops, fine for our
  small lists).
- After the pass, remove any previously-keyed node whose key is absent from the new items.
- **Contract:** `keyFn` MUST return unique, stable keys per list (documented in JSDoc).
  `createFn` attaches event listeners ONCE. `updateFn` must be idempotent — it sets
  classes/text/attrs to the desired state on every call (toggling an already-set class is a
  visual no-op; CSS transitions fire only on real changes).

### 2. Live-state listeners (correctness)

Listeners are attached once in `createFn` and must read **current** state at click time, not
a captured snapshot. `updateFn` stashes the per-node live state (e.g. current `activeId`,
`unlocked`, selected variant) on a `node → state` WeakMap; the handler reads from it. This
removes the need to rebuild on click and makes `stopPropagation` unnecessary for the
variant pill (the clicked node now survives the event).

### 3. CSS transitions — `src/style.css`

With stable nodes, selection becomes a class toggle. Add short transitions (~140ms) to the
selection visuals — `border-color`, `box-shadow`, `background`, `transform` — on
`.mode-card`, `.p-card` (ship/cosmetic tiles), `.ck-heat-pip`, `.ck-armor-pip`. Gate motion
behind `prefers-reduced-motion`, consistent with the existing coherence a11y handling.

## Data flow (unchanged contracts)

`onSelect*` callback → persists to `save` → `refreshTitle(save)` → per-section `reconcile()`
calls. The public `refreshTitle(save)` signature and all callback contracts are unchanged;
only the *interior* of the six list blocks (and the modal refreshers) change from
rebuild to reconcile. Header/loadout text fields (`hsBest`, `shipArtName`, …) already update
in place and are left untouched.

## Phasing

- **Phase 1 — primitive + tests.** Add `happy-dom` devDependency. Implement `reconcile()`.
  New `src/panels/dom.test.ts` with `// @vitest-environment happy-dom` pragma (keeps the
  global `node` env and all existing logic tests unchanged). Cases: create-in-order;
  identity preserved across calls; reorder moves (does not recreate) nodes; add inserts at
  correct slot; remove drops gone nodes; `updateFn` receives the correct item/index.
- **Phase 2 — cockpit/title.** Convert the six list blocks in `refreshTitle` plus
  `paintHeatPips` / `paintArmorPips` to `reconcile()`, keyed by stable id:
  - mode rail — key by primary mode id (RAIL_CARDS)
  - ship row — key by `ship.id`; canvas glyph + stat bars built once in `createFn`
  - theme row — key by `theme.id`
  - trail row — key by `trail.id`
  - heat pips — key by index `1..MAX_HEAT`
  - armor pips — key by index; the `STRIPPED` state is its own keyed node
  Move listener-captured state to live `node → state`. Add the Phase-3 CSS transitions.
- **Phase 3 — modal panel item grids.** Same primitive, keyed by item id, for the grids
  that rebuild on in-modal interaction: SKINS cards (`refreshSkins`), CODEX memories +
  bestiary, UPGRADES tree nodes, RANKS rows, STATS tab content. Modal open/close itself is
  left as-is (already CSS-animated via the `.hidden` class); only the body stops reflashing.

## Testing & verification

- `reconcile()` unit-tested in isolation under happy-dom (Phase 1).
- Each phase gates on `npm test` (vitest) + `tsc` (via `npm run build`'s typecheck).
- Visual verification per phase via the existing `tools/ui-capture` harness and/or
  `vite preview`, since `ui.ts` itself is not unit-tested.
- No game-logic / determinism modules are touched; reconcile is pure DOM.

## Risks & constraints

- **`ui.ts` is co-edited by a card-agent.** `git status` before each editing session; keep
  edits localized to the six list blocks, the pip painters, and the modal refreshers.
- **Stale-closure listeners** are the one real correctness hazard — addressed by the live
  `node → state` WeakMap. This is the primary thing to verify in review.
- **Flat-DOM flex cards** convention (modal panel children must be `width:auto`, not `100%`,
  or the inset clips them) must be preserved.
- Game ships are otherwise considered LOCKED; this UI-polish work stream is explicitly
  authorized by the owner.

## Out of scope

In-run HUD, game-over / debrief screen, modal open/close choreography, and any gameplay or
determinism changes.
