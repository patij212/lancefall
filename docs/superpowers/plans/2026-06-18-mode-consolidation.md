# Mode Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 7-card title rail to 6 by folding CASUAL into the ENDLESS card (a `CASUAL·STANDARD` pill) and surfacing the stranded WEEKLY SIEGE via a `DAILY·WEEKLY` pill on the Echo card — UI only, all 8 modes reachable.

**Architecture:** A "card" becomes a UI grouping over one or two mode ids. `modes.ts` gains a `RAIL_CARDS` structure (each card = its variants in pill order); `selectedMode` stays the single source of truth and always holds the *actual* launched mode id, so every sim/scoring/determinism path is untouched. The UI renders a pill on multi-variant cards, flipped with ↑/↓ or click, and keeps an in-memory per-card variant memory for smooth within-session nav. No save-format change.

**Tech Stack:** TypeScript, Vite, Canvas 2D, Vitest, Playwright (smoke). No new deps.

## Global Constraints

- **UI-layer only.** No sim, scoring, difficulty, or save-format change. No `SAVE_VERSION` bump, no new save field, no migration logic.
- **`MODES` data is unchanged** — all 8 modes stay exactly as today.
- **CASUAL stays off-board** (`rules.ranked:false`) and STANDARD = the existing `endless` config — the merge never alters either config's numbers.
- **Labels (verbatim):** ENDLESS card → title `ENDLESS`, pill `CASUAL` · `STANDARD`. Echo card → title `ECHO OF THE FALL`, pill `DAILY` · `WEEKLY`.
- **Input axes:** `←/→` stay rail nav (unchanged). `↑/↓` are the NEW variant flip (currently unused on title). Click on a pill segment selects that variant.
- **Card order (6):** `[casual,endless]`, `[arena]`, `[bossrush]`, `[daily,weekly]`, `[nightmare]`, `[longestday]`. Each card's `variants[0]` is its default landed-on variant.
- **Shared-file coordination:** `src/ui.ts` and `src/style.css` are shared with a parallel card-visuals agent. **Run `git status` before editing either**; stage only your own hunks; commit in small batches.
- **Gate (every task ends green):** `npx tsc --noEmit` clean, `npx vitest run` green, `npx vite build` OK.

---

### Task 1: `modes.ts` — RAIL_CARDS data model, helpers, nextRailMode rewrite, tests

**Files:**
- Modify: `src/modes.ts` (replace `RAIL_MODE_IDS` block ~198-222; rewrite stale comment at ~199)
- Test: `src/modes.test.ts` (rewrite the `§1.1` rail/nav block ~175-194; update flavour iteration ~136-142; add reachability guard)

**Interfaces:**
- Produces:
  - `RAIL_CARDS: readonly (readonly string[])[]` — cards in display order, each = variants in pill order.
  - `RAIL_CARD_IDS: readonly string[]` — `RAIL_CARDS.map(c => c[0])` (default/primary id per card; for digit-jump + nav landing).
  - `RAIL_VARIANT_IDS: readonly string[]` — `RAIL_CARDS.flat()` (every rail-reachable mode id; the reachability set).
  - `cardForMode(id: string): readonly string[]` — the card whose variants include `id` (falls back to `RAIL_CARDS[0]`).
  - `nextRailMode(currentId: string, dir: number, deepestWave: number): string` — walks cards, skips locked, returns the landing card's **primary** id (`variants[0]`).
- Consumes: existing `modeById`, `modeUnlocked`.

- [ ] **Step 1: Write the failing tests** — replace the `describe('§1.1 progressive disclosure (rail unlock gates)', …)` block in `src/modes.test.ts` (the `it('the RAIL is the 7 curated cards'…)` and the two `nextRailMode` its) with:

```ts
  it('the RAIL is 6 cards; Endless owns casual+endless, Echo owns daily+weekly', () => {
    expect(RAIL_CARDS.length).toBe(6);
    expect(RAIL_CARDS[0]).toEqual(['casual', 'endless']);
    expect(RAIL_CARDS[3]).toEqual(['daily', 'weekly']);
    // every other card is single-variant
    for (const i of [1, 2, 4, 5]) expect(RAIL_CARDS[i].length).toBe(1);
    expect([...RAIL_CARD_IDS]).toEqual(['casual', 'arena', 'bossrush', 'daily', 'nightmare', 'longestday']);
  });

  it('every mode in MODES is reachable from the rail (no stranded modes)', () => {
    // the regression that stranded WEEKLY: a mode with config but no card is unplayable
    for (const m of MODES) expect(RAIL_VARIANT_IDS).toContain(m.id);
    expect([...RAIL_VARIANT_IDS].sort()).toEqual(MODES.map((m) => m.id).sort());
  });

  it('cardForMode finds the owning card for any variant; junk → first card', () => {
    expect(cardForMode('endless')).toEqual(['casual', 'endless']);
    expect(cardForMode('weekly')).toEqual(['daily', 'weekly']);
    expect(cardForMode('arena')).toEqual(['arena']);
    expect(cardForMode('bogus')).toEqual(RAIL_CARDS[0]);
  });

  it('nextRailMode walks cards, returns the landing card primary, wraps, and SKIPS locked', () => {
    // brand-new player (deepestWave 0): nightmare(5) + longestday(8) locked & skipped
    expect(nextRailMode('casual', 1, 0)).toBe('arena');   // card0 -> card1
    expect(nextRailMode('endless', 1, 0)).toBe('arena');  // a non-primary variant resolves to its card too
    expect(nextRailMode('daily', 1, 0)).toBe('casual');   // card3 -> skip locked 4,5 -> wrap card0
    expect(nextRailMode('weekly', -1, 0)).toBe('bossrush'); // card3 -> card2
    expect(nextRailMode('casual', -1, 0)).toBe('daily');  // wrap left past the locked tail
    // veteran (deepestWave 99): all unlocked, plain wrap
    expect(nextRailMode('daily', 1, 99)).toBe('nightmare');
    expect(nextRailMode('longestday', 1, 99)).toBe('casual');
  });

  it('nextRailMode returns the current id when nothing else is reachable', () => {
    expect(nextRailMode('casual', 1, -1)).toBe('casual'); // deepestWave -1 locks all
  });
```

Also update the imports at the top of `src/modes.test.ts` line 2 — replace `nextRailMode, RAIL_MODE_IDS` with `nextRailMode, RAIL_CARDS, RAIL_CARD_IDS, RAIL_VARIANT_IDS, cardForMode` and update the flavour-iteration test (line ~137) to iterate `RAIL_VARIANT_IDS` instead of `RAIL_MODE_IDS`:

```ts
  it('every rail-reachable mode has explicit flavour copy (head + non-empty body)', () => {
    for (const id of RAIL_VARIANT_IDS) {
      const fl = modeFlavor(modeById(id));
      expect(fl.head.startsWith('◇')).toBe(true);
      expect(fl.body.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modes.test.ts`
Expected: FAIL — `RAIL_CARDS`/`RAIL_CARD_IDS`/`RAIL_VARIANT_IDS`/`cardForMode` are not exported.

- [ ] **Step 3: Implement in `src/modes.ts`** — replace the block from the `RAIL_MODE_IDS` comment (~198) through the end of `nextRailMode` (~222) with:

```ts
/** §1.1 — the curated title-screen mode CARDS, in display order. A "card" is a UI grouping
 *  over one or two mode ids; `variants[0]` is the card's DEFAULT landed-on variant. Two cards
 *  carry a second variant surfaced via an on-card pill: ENDLESS owns [casual, endless]
 *  (CASUAL·STANDARD difficulty) and ECHO owns [daily, weekly] (DAILY·WEEKLY seed cadence).
 *  The rail is a pure UI concern; MODES stays the full 8-mode data set. */
export const RAIL_CARDS: readonly (readonly string[])[] = [
  ['casual', 'endless'],
  ['arena'],
  ['bossrush'],
  ['daily', 'weekly'],
  ['nightmare'],
  ['longestday'],
];

/** The default (primary) mode id per card, in rail order — digit-jump + nav landing target. */
export const RAIL_CARD_IDS: readonly string[] = RAIL_CARDS.map((c) => c[0]);

/** Every mode id reachable from the rail (all variants, flattened) — the reachability set the
 *  modes test guards against to keep a fully-built mode from being stranded (see WEEKLY). */
export const RAIL_VARIANT_IDS: readonly string[] = RAIL_CARDS.flat();

/** The rail card (variant list) that owns `id`; falls back to the first card for a junk id. */
export function cardForMode(id: string): readonly string[] {
  return RAIL_CARDS.find((c) => c.includes(id)) ?? RAIL_CARDS[0];
}

/** §1.1 progressive disclosure — is this mode unlocked at the player's best-ever wave? A pure
 *  display gate (absent unlockedAtWave = always unlocked). Never touches sim/seed/scoring. */
export function modeUnlocked(cfg: RunConfig, deepestWave: number): boolean {
  return (cfg.unlockedAtWave ?? 0) <= deepestWave;
}

/** §1.1 — step the selected mode along the rail CARDS (dir<0 left / dir>=0 right), wrapping and
 *  SKIPPING locked cards so keyboard/d-pad nav never lands on an unplayable card. Returns the
 *  landing card's PRIMARY id (variants[0]); the UI layer resolves that to the card's remembered
 *  variant. Falls back to the current id if nothing else is unlocked. Pure. */
export function nextRailMode(currentId: string, dir: number, deepestWave: number): string {
  const n = RAIL_CARDS.length;
  const cur = cardForMode(currentId);
  const start = Math.max(0, RAIL_CARDS.indexOf(cur));
  const step = dir < 0 ? -1 : 1;
  for (let k = 1; k <= n; k++) {
    const card = RAIL_CARDS[(((start + step * k) % n) + n) % n];
    if (modeUnlocked(modeById(card[0]), deepestWave)) return card[0];
  }
  return currentId;
}

/** @deprecated transitional alias = RAIL_CARD_IDS so the UI/game consumers compile until they
 *  migrate to RAIL_CARDS (removed in Task 4). */
export const RAIL_MODE_IDS: readonly string[] = RAIL_CARD_IDS;
```

(Note: `modeUnlocked` already exists above this block in the current file — DELETE the old standalone `modeUnlocked` definition so it isn't declared twice. Keep the single copy shown here.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modes.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. (UI still compiles via the `RAIL_MODE_IDS` alias.)

- [ ] **Step 5: Commit**

```bash
git add src/modes.ts src/modes.test.ts
git commit -m "feat(lancefall): RAIL_CARDS model + nextRailMode card-walk + reachability guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `ui.ts` — rail render with the variant pill + in-memory variant memory

**Files:**
- Modify: `src/ui.ts` (the `MODE_ICONS`/`RAIL_ACCENTS` maps ~313-350; the rail render loop ~3022-3065; add `cardVariant` field + `flipVariant` method near `moveModeSelection` ~3197)
- Modify: `src/style.css` (add `.ck-mi-pill` styles — **git status first**, shared file)

**Interfaces:**
- Consumes: `RAIL_CARDS`, `RAIL_CARD_IDS`, `cardForMode`, `modeById`, `modeUnlocked`, `modeBrief` from `./modes`.
- Produces: `Ui.flipVariant(dir: number): void` (used by Task 3); `Ui` keeps `private cardVariant = new Map<string, string>()` keyed by card primary.

- [ ] **Step 1: Add the weekly accent.** In `src/ui.ts` `RAIL_ACCENTS` (~339), add a line so the Echo card re-skins subtly when toggled to WEEKLY:

```ts
  daily: '#fbbf24',
  weekly: '#f59e0b',
  nightmare: '#f87171',
```

- [ ] **Step 2: Add the import + label maps.** Update the `./modes` import to include `RAIL_CARDS, RAIL_CARD_IDS, cardForMode` (alongside the existing `modeById, modeUnlocked, …`). Below `RAIL_ACCENTS`/`railAccent` (~350), add:

```ts
/** Fixed family title for a MULTI-variant rail card (keyed by card primary id) — the card title
 *  stays put while the pill switches variants, so the card is never named after one of its own
 *  variants (ENDLESS card shows CASUAL·STANDARD; the active variant drives the hero, not the title). */
const CARD_TITLE: Record<string, string> = { casual: 'ENDLESS', daily: 'ECHO OF THE FALL' };
/** Short pill-segment label per variant id. */
const VARIANT_LABEL: Record<string, string> = { casual: 'CASUAL', endless: 'STANDARD', daily: 'DAILY', weekly: 'WEEKLY' };
```

- [ ] **Step 3: Add the variant-memory field.** In the `Ui` class field block (near `private descendOverlay`), add:

```ts
  /** In-memory per-card active variant (keyed by card primary id). NOT persisted — cross-session
   *  memory rides selectedMode; this only smooths within-session ←/→ nav so returning to a card
   *  restores the variant you last had on it this session. */
  private cardVariant = new Map<string, string>();
```

- [ ] **Step 4: Rewrite the rail render loop.** Replace the `for (const id of RAIL_MODE_IDS) { … }` loop (~3024-3065) with a per-card loop. Key changes: iterate `RAIL_CARDS`; the active variant = `selectedMode` if it's in the card, else the remembered/default; record it into `cardVariant`; multi-variant cards render a pill; "selected" matches any variant:

```ts
    this.modeGrid.replaceChildren();
    for (const variants of RAIL_CARDS) {
      const primary = variants[0];
      const multi = variants.length > 1;
      // active variant: the selected mode if it belongs to this card, else this card's remembered
      // (this session) or default variant. Record it so ←/→ nav can restore it on return.
      const onThisCard = variants.includes(save.selectedMode);
      const activeId = onThisCard ? save.selectedMode : (this.cardVariant.get(primary) ?? primary);
      this.cardVariant.set(primary, activeId);
      const m = modeById(activeId);
      const selected = onThisCard;
      const unlocked = modeUnlocked(modeById(primary), save.deepestWave);
      const brief = modeBrief(m);
      const card = el('button', {
        class: 'mode-card ck-mi' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked'),
        'aria-pressed': String(selected),
        'aria-disabled': unlocked ? 'false' : 'true',
        tabindex: selected ? '0' : '-1',
      });
      card.style.setProperty('--accent', railAccent(activeId));
      card.style.setProperty('--accent-rgb', hexToRgb(railAccent(activeId)));
      const title = multi ? (CARD_TITLE[primary] ?? m.name) : m.name;
      const text = el(
        'div',
        { class: 'ck-mi-text' },
        el('div', { class: 'ck-mi-name' }, title),
        el('div', { class: 'ck-mi-sub' }, `${brief.tier}${brief.note ? ` · ${brief.note}` : ''}`),
      );
      if (selected) {
        const pb = m.seedKind === 'date'
          ? (save.dailyBest > 0 ? save.dailyBest.toLocaleString() : '—')
          : (save.highScore > 0 ? save.highScore.toLocaleString() : '—');
        text.append(el('div', { class: 'ck-mi-pb' }, pb));
      }
      // variant pill (multi-variant cards only): two segments, the active one lit. A segment
      // click selects that variant directly (and stops the card's own select).
      if (multi) {
        const pill = el('div', { class: 'ck-mi-pill', role: 'group', 'aria-label': 'Variant' });
        for (const vid of variants) {
          const seg = el('button', {
            class: 'ck-mi-pill-seg' + (vid === activeId ? ' on' : ''),
            type: 'button',
            tabindex: '-1',
            'aria-pressed': String(vid === activeId),
          }, VARIANT_LABEL[vid] ?? modeById(vid).name);
          seg.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!unlocked) return;
            this.cardVariant.set(primary, vid);
            this.quietReskin = true;
            this.cb.onSelectMode(vid);
          });
          pill.append(seg);
        }
        text.append(pill);
      }
      card.append(iconEl('ck-mi-icon', MODE_ICONS[activeId] ?? MODE_ICONS[primary] ?? ''), text);
      if (!unlocked) {
        card.append(el('div', { class: 'ck-mi-badge locked' }, `LOCKED · reach wave ${modeById(primary).unlockedAtWave}`));
      } else if (activeId === 'casual' && save.totalRuns === 0) {
        card.append(el('div', { class: 'ck-mi-badge start' }, 'START HERE'));
      } else if (m.seedKind === 'date') {
        card.append(el('div', { class: 'ck-mi-badge daily' }, 'DAILY'));
      }
      card.title = unlocked ? m.desc : `Locked — reach wave ${modeById(primary).unlockedAtWave} to unlock ${title}.`;
      card.addEventListener('click', () => { if (unlocked) this.cb.onSelectMode(activeId); });
      this.modeGrid.append(card);
    }
```

- [ ] **Step 5: Add `flipVariant` + seed memory in `moveModeSelection`.** Replace `moveModeSelection` (~3197) and add `flipVariant` right after it:

```ts
  /** §5 U2 — step the selected mode along the rail CARDS (keyboard/gamepad), skipping locked
   *  cards, restoring each card's remembered variant, persist, and re-focus the selected card. */
  moveModeSelection(dir: number): void {
    const s = this.saveRef;
    if (!s) return;
    this.quietReskin = true; // arrow-nav: light hero swap only, skip the heavy panel pulse (mock)
    const primary = nextRailMode(s.selectedMode, dir, s.deepestWave);
    const remembered = this.cardVariant.get(primary) ?? primary;
    this.cb.onSelectMode(remembered); // persists → refreshTitle rebuilds the rail
    (this.modeGrid.querySelector('.mode-card.selected') as HTMLElement | null)?.focus();
  }

  /** §mode-consolidation — flip the SELECTED card's variant (↑ = first/left segment, ↓ = second).
   *  No-op on a single-variant card. Remembers the choice for this session + persists via
   *  onSelectMode (selectedMode is the launch source of truth). */
  flipVariant(dir: number): void {
    const s = this.saveRef;
    if (!s) return;
    const variants = cardForMode(s.selectedMode);
    if (variants.length < 2) return; // single-variant card: nothing to flip
    const target = dir < 0 ? variants[0] : variants[1];
    if (target === s.selectedMode) return; // already on it
    this.cardVariant.set(variants[0], target);
    this.quietReskin = true;
    this.cb.onSelectMode(target);
    (this.modeGrid.querySelector('.mode-card.selected') as HTMLElement | null)?.focus();
  }
```

Add `nextRailMode` and `cardForMode` to the `./modes` import if not already present.

- [ ] **Step 6: Add pill CSS.** `git status` first. Append to `src/style.css` (place near the `.ck-mi` rules):

```css
.ck-mi-pill { display: inline-flex; gap: 2px; margin-top: 4px; padding: 2px; border-radius: 6px;
  background: rgba(var(--accent-rgb), 0.08); border: 1px solid rgba(var(--accent-rgb), 0.22); }
.ck-mi-pill-seg { font: inherit; font-size: 9px; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 4px;
  color: rgba(255,255,255,0.5); background: transparent; border: 0; cursor: pointer; line-height: 1.4; }
.ck-mi-pill-seg.on { color: #04060a; background: var(--accent); font-weight: 700; }
.mode-card.locked .ck-mi-pill-seg { cursor: not-allowed; }
```

- [ ] **Step 7: Build + smoke compile.**

Run: `npx tsc --noEmit && npx vite build`
Expected: clean. Then `npm run dev`, open the title: the rail shows 6 cards; Endless shows a `CASUAL·STANDARD` pill, Echo shows `DAILY·WEEKLY`; clicking a segment re-skins the hero to that variant and lights the segment.

- [ ] **Step 8: Commit** (stage only your hunks — shared files)

```bash
git add src/ui.ts src/style.css
git commit -m "feat(lancefall): variant pill on Endless/Echo rail cards + in-memory variant memory

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `input.ts` + `game.ts` — ↑/↓ variant flip wiring

**Files:**
- Modify: `src/input.ts` (fields ~38-43; keydown ~93-94; scroll-prevent ~100; `clearHeld` ~255; add `consumeVariant`)
- Modify: `src/game.ts` (`handleMeta` title branch ~1311-1326)
- Test: `src/input.test.ts` if present (else verify via the Task 6 smoke)

**Interfaces:**
- Produces: `Input.consumeVariant(): number` — one-shot ↑/↓ edge (−1 up / +1 down / 0).
- Consumes: `Ui.flipVariant` from Task 2.

- [ ] **Step 1: Add the edge field.** In `src/input.ts` near `private menuEdge = 0;` (~39):

```ts
  private menuEdge = 0; // §5 U2 — relative title mode-card nav (-1 left / +1 right); consumed on the title
  private variantEdge = 0; // mode-consolidation — title variant pill flip (-1 up / +1 down)
```

- [ ] **Step 2: Wire the keys.** After the `arrowright` line (~94), add `arrowup`/`arrowdown`:

```ts
      if (k === 'arrowleft') this.menuEdge = -1; // §5 U2 — title mode-card nav (ignored mid-run)
      if (k === 'arrowright') this.menuEdge = 1;
      if (k === 'arrowup') this.variantEdge = -1; // title variant pill (ignored mid-run)
      if (k === 'arrowdown') this.variantEdge = 1;
```

Confirm the existing "prevent page scroll on space / arrows" block (~100) already calls `preventDefault()` for ArrowUp/ArrowDown (the comment says "arrows"); if it filters specific keys, add `'arrowup'`/`'arrowdown'`.

- [ ] **Step 3: Reset in clearHeld + add the consumer.** In `clearHeld` (~255) after `this.menuEdge = 0;` add `this.variantEdge = 0;`. Add the method next to `consumeMenu` (~292):

```ts
  /** Consume the title variant-flip edge (arrows up/down): -1, 0, or +1. */
  consumeVariant(): number {
    const v = this.variantEdge;
    this.variantEdge = 0;
    return v;
  }
```

- [ ] **Step 4: Wire into `handleMeta`.** In `src/game.ts` title branch, after the `if (dir !== 0) { … } else { … }` menu block and before `consumeStart` (~1325), add:

```ts
      const vdir = this.input.consumeVariant();
      if (vdir !== 0) this.ui.flipVariant(vdir);
```

- [ ] **Step 5: Verify.**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green. `npm run dev`: on the title with the Endless card selected, ↑ selects CASUAL, ↓ selects STANDARD; on Echo, ↑=DAILY, ↓=WEEKLY; ↑/↓ on a single-variant card does nothing.

- [ ] **Step 6: Commit**

```bash
git add src/input.ts src/game.ts
git commit -m "feat(lancefall): up/down arrows flip the selected card's variant pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Migrate digit-jump to `RAIL_CARD_IDS` and remove the transitional alias

**Files:**
- Modify: `src/game.ts` (digit-jump ~1318-1324 + the `./modes` import ~50)
- Modify: `src/modes.ts` (remove the `RAIL_MODE_IDS` alias added in Task 1)

**Interfaces:**
- Consumes: `RAIL_CARD_IDS` from `./modes`.

- [ ] **Step 1: Migrate game.ts digit-jump.** In `src/game.ts`, change the `./modes` import (line ~50) `RAIL_MODE_IDS` → `RAIL_CARD_IDS`, and update the digit-jump block (~1321):

```ts
        if (idx >= 0 && idx < RAIL_CARD_IDS.length) {
          const id = RAIL_CARD_IDS[idx];
          if (modeUnlocked(modeById(id), this.save.deepestWave)) this.selectMode(id);
        }
```

- [ ] **Step 2: Grep for any remaining consumer.**

Run: `grep -rn "RAIL_MODE_IDS" src/`
Expected: zero hits outside `src/modes.ts`. (Task 1 updated `modes.test.ts`; Task 2 updated `ui.ts`.)

- [ ] **Step 3: Remove the alias.** Delete the `@deprecated … export const RAIL_MODE_IDS = RAIL_CARD_IDS;` line from `src/modes.ts`.

- [ ] **Step 4: Verify the tree compiles without the alias.**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/modes.ts
git commit -m "refactor(lancefall): digit-jump walks RAIL_CARD_IDS; drop RAIL_MODE_IDS alias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `save.ts` default → CASUAL for fresh saves

**Files:**
- Modify: `src/save.ts` (`defaultSave` ~202)
- Test: `src/migrate.test.ts` (~61, ~141)

**Interfaces:** none new.

- [ ] **Step 1: Update the failing tests first.** In `src/migrate.test.ts`, change the two assertions that expect the old default:

```ts
    // line ~61 — a fresh/legacy save defaults selectedMode to the suggested first-run mode
    expect(out.selectedMode).toBe('casual');
    // line ~141 — a corrupted id falls back to the default
    expect(migrateSave({ version: 6, selectedMode: 'garbage-not-a-mode' }, defaultSave()).selectedMode).toBe('casual');
```

Leave line ~142 (`'nightmare'` preserved) unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/migrate.test.ts`
Expected: FAIL — current default is still `'endless'`.

- [ ] **Step 3: Change the default.** In `src/save.ts` `defaultSave()` (~202):

```ts
    selectedMode: 'casual',
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/migrate.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/save.ts src/migrate.test.ts
git commit -m "feat(lancefall): fresh saves default to CASUAL (suggested first run)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Stale-comment cleanup + Playwright smoke + full gate

**Files:**
- Modify: `src/modes.ts` (rewrite the now-true reachability comment, if any stale phrasing survived Task 1)
- Test: `tests/` or the existing Playwright smoke harness (mirror the existing UI smoke pattern)

**Interfaces:** none new.

- [ ] **Step 1: Rewrite any stale comment.** Confirm no comment still claims WEEKLY is "reachable as the Daily/Echo card's weekly variant" as a future/aspirational thing — it is now literally true via `RAIL_CARDS[3]`. Ensure the `RAIL_CARDS` doc comment (Task 1) describes it as implemented.

- [ ] **Step 2: Add a Playwright smoke** (mirror the project's existing title smoke — locate it with `grep -rn "console" tests/ e2e/ 2>/dev/null` or the harness used for prior UI smokes). The smoke must:
  - load the title, assert **6** `.mode-card` elements,
  - select the Endless card, assert a `.ck-mi-pill` with segments `CASUAL` and `STANDARD`,
  - click `STANDARD`, assert the hero title reads `ENDLESS` (the `endless` config name),
  - select the Echo card, click `WEEKLY`, assert the hero title reads `WEEKLY SIEGE`,
  - assert **0 console errors** throughout.

If no Playwright harness exists in-repo, perform this as a manual `npm run dev` checklist and record the result in the commit body instead.

- [ ] **Step 3: Run the full gate.**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tsc clean, all suites green (incl. the new modes/migrate tests), build OK.

- [ ] **Step 4: Manual end-to-end check** (`npm run dev`): fresh save (clear localStorage) lands on the **Endless card / CASUAL** with a START HERE badge; ↑/↓ and clicks flip both pills; DESCEND launches the exact selected variant (CASUAL is off-board, WEEKLY posts to the weekly board); ←/→ nav across the 6 cards restores each card's last variant this session.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(lancefall): rail consolidation smoke + reachability; stale comment cleanup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Ergonomic note (for the implementer / verification)

The rail is a **vertical** left column, yet `←/→` drive card nav (existing, shipped, tested) and the new `↑/↓` drive the horizontal pill. This is the owner-approved mapping and the lowest-risk change (it leaves the shipped `←/→` nav + its tests untouched). If the vertical-rail ↑/↓-moves-cards instinct proves stronger in playtest, inverting the axes is a follow-up — but it would re-map existing nav and rewrite the nav tests, so it is deliberately out of scope here.

## Self-review

- **Spec coverage:** RAIL_CARDS model (Task 1) · CASUAL·STANDARD + DAILY·WEEKLY pills (Task 2) · ↑/↓ + click (Tasks 2–3) · CASUAL-default + in-memory memory, no save-format change (Tasks 2, 5) · automatic scoring/board behavior (no task needed — falls out of unchanged configs; verified in Task 6 manual check) · reachability guard test (Task 1) · stale-comment cleanup (Tasks 1, 6) · labels verbatim (Task 2 `CARD_TITLE`/`VARIANT_LABEL`). All spec sections map to a task.
- **Placeholder scan:** none — every code/test step shows real code; the only conditional ("if no Playwright harness exists") gives an explicit fallback.
- **Type consistency:** `RAIL_CARDS` (`readonly (readonly string[])[]`), `RAIL_CARD_IDS`/`RAIL_VARIANT_IDS` (`readonly string[]`), `cardForMode → readonly string[]`, `nextRailMode → string`, `Ui.flipVariant(dir: number)`, `Input.consumeVariant(): number` are used identically across tasks. `cardVariant` is keyed by card primary in both the render loop and `flipVariant`.
- **Scope:** single rail/UI feature, six bite-sized tasks; no decomposition needed.
