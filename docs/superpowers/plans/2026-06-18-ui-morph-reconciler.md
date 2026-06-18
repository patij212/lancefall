# UI Morph — Keyed Reconciler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `replaceChildren()`-and-rebuild churn in the title/cockpit and modal panels with a single keyed `reconcile()` primitive so clicks morph elements in place — no visible section reloads.

**Architecture:** One new tested DOM primitive (`reconcile()`) in `src/panels/dom.ts`. Each list (mode rail, ship/theme/trail rows, heat/armor pips, modal grids) routes through it instead of wiping its container. Element identity stays stable, so CSS transitions fire, focus/scroll survive, and canvases paint once. Event listeners attach once and read live state (off the node), removing the stale-closure reason rebuilds existed.

**Tech Stack:** Vite + vanilla TypeScript, Canvas 2D, Vitest (+ happy-dom for the one DOM test), existing `el()` factory in `src/panels/dom.ts`.

## Global Constraints

- Add `happy-dom` as a **devDependency only**; the one DOM test opts in via a `// @vitest-environment happy-dom` file pragma. The global Vitest environment stays `node` — do NOT change `vite.config.ts`'s `test` block. Every other `*.test.ts` must keep passing unchanged.
- `src/ui.ts` is co-edited by a card-agent. Run `git status` (from the parent repo root `C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground`) before each editing session; keep edits localized to the named blocks.
- The repo uses the **parent** repo's `.git`. `git add` only the specific files each task touches — never `git add -A` (the tree has dozens of unrelated untracked projects).
- Branch is `v6` (not the default `main`); stay on `v6`.
- Modal panel children must be `width:auto`, not `100%`, or the 22px card inset clips them. Preserve this.
- Motion must respect `prefers-reduced-motion` (the codebase already gates other motion this way).
- No gameplay/determinism modules are touched. `reconcile()` is pure DOM.
- TypeScript is strict; the project typechecks via `npm run build` (`tsc && vite build`). Each code task ends green on `tsc`.
- Commit message footer (repo convention): end every commit body with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Task 1: The `reconcile()` primitive + tests

**Files:**
- Modify: `src/panels/dom.ts` (append the primitive)
- Create: `src/panels/dom.test.ts`
- Modify: `package.json` (add `happy-dom` devDependency)

**Interfaces:**
- Produces: `reconcile<T>(container: HTMLElement, items: readonly T[], keyFn: (item: T, index: number) => string, createFn: (item: T, index: number) => HTMLElement, updateFn: (node: HTMLElement, item: T, index: number) => void): void`
- Contract: `container` holds ONLY reconcile-managed children (no mixed-in text/other nodes). `keyFn` returns a unique, stable key per item. `createFn` attaches event listeners once. `updateFn` is idempotent (sets desired class/text/attr state every call).

- [ ] **Step 1: Install happy-dom**

Run:
```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground/lancefall"
npm install -D happy-dom
```
Expected: `package.json` gains `"happy-dom"` under devDependencies; `package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Create `src/panels/dom.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { reconcile } from './dom';

function ids(c: HTMLElement): string[] {
  return Array.from(c.children).map((n) => n.textContent ?? '');
}

describe('reconcile', () => {
  const create = (s: string) => {
    const d = document.createElement('div');
    d.dataset.created = '1';
    return d;
  };
  const update = (n: HTMLElement, s: string) => { n.textContent = s; };

  it('creates nodes in item order', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });

  it('preserves node identity across calls (no recreate)', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b'], (s) => s, create, update);
    const firstA = c.children[0];
    reconcile(c, ['a', 'b'], (s) => s, create, update);
    expect(c.children[0]).toBe(firstA); // same DOM node, updated in place
  });

  it('reorders by moving existing nodes, not recreating them', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    const nodeB = c.children[1];
    reconcile(c, ['c', 'b', 'a'], (s) => s, create, update);
    expect(ids(c)).toEqual(['c', 'b', 'a']);
    expect(c.children[1]).toBe(nodeB); // b kept its node
  });

  it('inserts a new item at the correct slot', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'c'], (s) => s, create, update);
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });

  it('removes nodes whose key is gone', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    reconcile(c, ['a', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'c']);
  });

  it('passes the correct item and index to updateFn', () => {
    const c = document.createElement('div');
    const seen: Array<[string, number]> = [];
    reconcile(c, ['x', 'y'], (s) => s, create, (_n, s, i) => seen.push([s, i]));
    expect(seen).toEqual([['x', 0], ['y', 1]]);
  });

  it('throws on duplicate keys', () => {
    const c = document.createElement('div');
    expect(() => reconcile(c, ['a', 'a'], (s) => s, create, update)).toThrow(/duplicate key/);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx vitest run src/panels/dom.test.ts`
Expected: FAIL — `reconcile is not a function` / not exported.

- [ ] **Step 4: Implement `reconcile()`**

Append to `src/panels/dom.ts`:
```ts
/** Per-container key→node map. WeakMap so it's GC'd with the container and never
 *  pollutes the element. */
const RKEYS = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

/** Keyed list reconciler — the foundation for morph-in-place UI. Instead of wiping a
 *  container and rebuilding (replaceChildren), this reuses each child by key: existing
 *  nodes are updated in place (so CSS transitions fire, focus/scroll/canvas survive),
 *  new keys are created, gone keys are removed, and order is fixed with minimal moves.
 *
 *  CONTRACT: `container` holds only reconcile-managed children. `keyFn` returns a unique,
 *  stable key per item. `createFn` attaches event listeners ONCE. `updateFn` is idempotent
 *  — it applies the desired class/text/attr state on every call (read live state there, not
 *  in a create-time closure). */
export function reconcile<T>(
  container: HTMLElement,
  items: readonly T[],
  keyFn: (item: T, index: number) => string,
  createFn: (item: T, index: number) => HTMLElement,
  updateFn: (node: HTMLElement, item: T, index: number) => void,
): void {
  let prev = RKEYS.get(container);
  if (!prev) { prev = new Map(); RKEYS.set(container, prev); }
  const next = new Map<string, HTMLElement>();
  let i = 0;
  for (const item of items) {
    const key = keyFn(item, i);
    if (next.has(key)) throw new Error(`reconcile: duplicate key "${key}"`);
    let node = prev.get(key);
    if (!node) node = createFn(item, i);
    updateFn(node, item, i);
    // place node at slot i (insertBefore moves it if it's elsewhere; appends if new)
    const atPos = container.childNodes[i] ?? null;
    if (atPos !== node) container.insertBefore(node, atPos);
    next.set(key, node);
    i++;
  }
  for (const [key, node] of prev) if (!next.has(key)) node.remove();
  RKEYS.set(container, next);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/panels/dom.test.ts`
Expected: PASS — all 7 cases green.

- [ ] **Step 6: Confirm the full suite is unaffected**

Run: `npm test`
Expected: PASS — existing suites unchanged; the new file is the only addition.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/panels/dom.ts lancefall/src/panels/dom.test.ts lancefall/package.json lancefall/package-lock.json
git commit -m "feat(lancefall): keyed reconcile() DOM primitive + happy-dom tests"
```

---

## Task 2: Heat & armor pips → reconcile

**Files:**
- Modify: `src/ui.ts` — `paintHeatPips` (currently ~1412–1417) and `paintArmorPips` (~1422–1430)
- Modify: `src/ui.ts` import line for `./panels/dom` (add `reconcile`)

**Interfaces:**
- Consumes: `reconcile` from Task 1; existing `el`, `MAX_HEAT`, `HEAT_LEVELS`, `SaveData`.
- Produces: nothing new (same private method signatures).

- [ ] **Step 1: Add `reconcile` to the dom import**

Find the existing import of `el`/`iconEl` from `./panels/dom` in `src/ui.ts` and add `reconcile`:
```ts
import { el, iconEl, stat, reconcile } from './panels/dom';
```
(Match whatever symbols are already imported; just add `reconcile`.)

- [ ] **Step 2: Replace `paintHeatPips`**

```ts
/** Paint the loadout HEAT pips (one per level 1..MAX_HEAT; first `level` lit). Morphs in
 *  place — pips persist across refreshes so the .on toggle can transition. */
private paintHeatPips(level: number): void {
  const pips = Array.from({ length: MAX_HEAT }, (_, i) => i + 1);
  reconcile(
    this.heatPipsWrap,
    pips,
    (n) => `h${n}`,
    () => el('div', { class: 'ck-heat-pip' }),
    (node, n) => node.classList.toggle('on', n <= level),
  );
}
```

- [ ] **Step 3: Replace `paintArmorPips`**

```ts
/** Paint the loadout ARMOR pips — effective shields for the selected Heat. The STRIPPED
 *  state is its own keyed node, so switching to/from it adds/removes cleanly. */
private paintArmorPips(save: SaveData): void {
  const eff = Math.max(0, save.baseShields - (HEAT_LEVELS[save.selectedHeat]?.shieldsLost ?? 0));
  const items = eff <= 0 ? ['stripped'] : Array.from({ length: eff }, (_, i) => `a${i}`);
  reconcile(
    this.armorPipsWrap,
    items,
    (id) => id,
    (id) => id === 'stripped'
      ? el('div', { class: 'ck-armor-none' }, 'STRIPPED')
      : el('div', { class: 'ck-armor-pip' }),
    () => {}, // pip/STRIPPED nodes carry no per-refresh state
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: `tsc` passes (build completes).

- [ ] **Step 5: Visual check**

Run `npm run dev`, open the cockpit, step Heat up/down. Expected: heat pips light/dim and armor pips add/remove without the row flashing; no full-row rebuild.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts
git commit -m "feat(lancefall): heat & armor pips morph in place via reconcile"
```

---

## Task 3: Theme & trail cosmetic rows → reconcile

**Files:**
- Modify: `src/ui.ts` — extract `rgbOf`/`rarLabel` to module scope; replace the `themeRow` block (~2981–3001) and `trailRow` block (~3003–3028) in `refreshTitle`.

**Interfaces:**
- Consumes: `reconcile`, `el`, `THEMES`, `TRAILS`, `this.saveRef`, callbacks `onSelectTheme/onUnlockTheme/onSelectTrail/onUnlockTrail`.
- Produces: module-level `rgbOf(hex: string): string` and `rarLabel(cost: number, star: boolean): string`.

- [ ] **Step 1: Lift `rgbOf` and `rarLabel` to module scope**

Near the other file-private helpers (e.g. by `hexToRgb`/`darken` ~line 364), add:
```ts
/** "#rrggbb" or "#rgb" → "r,g,b" string for rgba() interpolation. */
function rgbOf(hex: string): string {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
}
/** Cosmetic rarity label by shard cost (★ for achievement-locked). */
function rarLabel(cost: number, star: boolean): string {
  return star ? '★ Achievement' : cost === 0 ? 'Free' : cost <= 800 ? 'Common' : cost <= 1200 ? 'Rare' : 'Epic';
}
```
Then delete the local `const rgbOf = …` and `const rarLabel = …` and `const cosState = …` lines (~2976–2979) inside `refreshTitle`.

- [ ] **Step 2: Replace the `themeRow` block**

```ts
reconcile(
  this.themeRow,
  THEMES,
  (t) => t.id,
  (theme) => {
    const card = el('button', { class: 'p-card cos-card', type: 'button', title: theme.name });
    card.style.setProperty('--ca', theme.accent);
    card.style.setProperty('--ca-rgb', rgbOf(theme.accent));
    const prev = el('div', { class: 'cos-prev' });
    prev.style.background = `linear-gradient(120deg, ${theme.accent}, ${theme.accent2})`;
    const dot = el('span', { class: 'p-dot' });
    dot.style.background = `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`;
    dot.style.color = theme.accent;
    const foot = el('div', { class: 'p-card-foot' }, el('span', { class: 'p-state' }));
    card.append(
      prev,
      el('div', { class: 'p-card-top' }, dot, el('div', { class: 'p-card-name' }, theme.name)),
      el('div', { class: 'cos-rar' }, rarLabel(theme.unlockShards, false)),
      foot,
    );
    card.addEventListener('click', () => {
      if (card.dataset.unlocked === '1') this.cb.onSelectTheme(theme.id);
      else this.cb.onUnlockTheme(theme.id);
    });
    return card;
  },
  (card, theme) => {
    const s = this.saveRef!;
    const unlocked = s.unlockedThemes.includes(theme.id);
    const selected = s.selectedTheme === theme.id;
    card.dataset.unlocked = unlocked ? '1' : '0';
    card.classList.toggle('sel', selected);
    card.classList.toggle('locked', !unlocked);
    const st = card.querySelector('.p-state') as HTMLElement;
    st.className = 'p-state ' + (selected ? 'eq' : unlocked ? 'tap' : 'lock');
    st.textContent = selected ? 'EQUIPPED' : unlocked ? 'tap to equip' : `◆ ${theme.unlockShards.toLocaleString()}`;
  },
);
```

- [ ] **Step 3: Replace the `trailRow` block**

```ts
reconcile(
  this.trailRow,
  TRAILS,
  (t) => t.id,
  (trail) => {
    const acc = trail.combo ? '#22d3ee' : trail.base;
    const card = el('button', { class: 'p-card cos-card', type: 'button', title: trail.name });
    card.style.setProperty('--ca', acc);
    card.style.setProperty('--ca-rgb', rgbOf(acc));
    const prev = el('div', { class: 'cos-prev' });
    prev.style.background = `radial-gradient(ellipse at 50% 130%, rgba(${rgbOf(acc)}, 0.25), transparent 70%)`;
    const streak = el('span', { class: 'streak' });
    streak.style.background = `linear-gradient(90deg, transparent, ${acc} 60%, ${trail.bright})`;
    prev.append(streak);
    const dot = el('span', { class: 'p-dot' });
    dot.style.background = `linear-gradient(90deg, ${acc}, ${trail.bright})`;
    dot.style.color = acc;
    const foot = el('div', { class: 'p-card-foot' }, el('span', { class: 'p-state' }));
    card.append(
      prev,
      el('div', { class: 'p-card-top' }, dot, el('div', { class: 'p-card-name' }, trail.name)),
      el('div', { class: 'cos-rar' }, rarLabel(trail.unlockShards, !!trail.unlockAch)),
      foot,
    );
    card.addEventListener('click', () => {
      if (card.dataset.unlocked === '1') this.cb.onSelectTrail(trail.id);
      else this.cb.onUnlockTrail(trail.id);
    });
    return card;
  },
  (card, trail) => {
    const s = this.saveRef!;
    const unlocked = s.unlockedTrails.includes(trail.id);
    const selected = s.selectedTrail === trail.id;
    const star = !!trail.unlockAch;
    card.dataset.unlocked = unlocked ? '1' : '0';
    card.classList.toggle('sel', selected);
    card.classList.toggle('locked', !unlocked);
    const st = card.querySelector('.p-state') as HTMLElement;
    st.className = 'p-state ' + (selected ? 'eq' : unlocked ? 'tap' : 'lock');
    st.textContent = selected ? 'EQUIPPED' : unlocked ? 'tap to equip' : (star ? '★ ACHIEVEMENT' : `◆ ${trail.unlockShards.toLocaleString()}`);
  },
);
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 5: Visual check**

`npm run dev` → open CUSTOMIZE. Click between themes/trails. Expected: EQUIPPED chip moves and the `sel` glow shifts without the row rebuilding; locked→unlock updates the tapped card only.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts
git commit -m "feat(lancefall): theme & trail cosmetic rows morph in place via reconcile"
```

---

## Task 4: Ship row → reconcile

**Files:**
- Modify: `src/ui.ts` — replace the `shipRow` block (~2934–2972) in `refreshTitle`. The roster-constant `SHIP_STAT_KEYS`/`shipStats`/`statRanges` computation (~2921–2932) stays above the reconcile call and is closed over.

**Interfaces:**
- Consumes: `reconcile`, `el`, `SHIPS`, `this.saveRef`, `this.paintShipGlyph`, callbacks `onSelectShip/onUnlockShip`, and the local `shipStats`/`statRanges`/`SHIP_STAT_KEYS`.

- [ ] **Step 1: Replace the `shipRow` for-loop with a reconcile call**

Keep lines ~2921–2933 (the stat-range setup and `this.shipBalanceEl.textContent = …`). Replace `this.shipRow.replaceChildren();` and the `for (const ship of SHIPS) { … }` loop with:
```ts
reconcile(
  this.shipRow,
  SHIPS,
  (ship) => ship.id,
  (ship) => {
    // static per-hull tile: glyph + stat bars are roster-constant → built once here.
    const card = el('button', { class: 'p-card ship-card', title: ship.desc, type: 'button' });
    card.style.setProperty('--ca', ship.accent);
    card.style.setProperty('--ca-rgb', rgbOf(ship.accent));
    const glyph = el('canvas', { class: 'ship-glyph', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    this.paintShipGlyph(glyph, ship.id, ship.accent);
    const stage = el('div', { class: 'glyph-stage' }, glyph);
    const st = shipStats.get(ship.id)!;
    const bars = el('div', { class: 'sbars' });
    SHIP_STAT_KEYS.forEach((m, i) => {
      const r = statRanges[i];
      const norm = r.max > r.min ? (m.get(st) - r.min) / (r.max - r.min) : 0.5;
      const lit = Math.max(1, Math.round(norm * 5));
      const track = el('div', { class: 'sbar-track' });
      for (let sg = 0; sg < 5; sg++) track.append(el('div', { class: 'sbar-seg' + (sg < lit ? ' on' : '') }));
      bars.append(el('div', { class: 'sbar' }, el('div', { class: 'sbar-k' }, m.key), track));
    });
    const foot = el('div', { class: 'p-card-foot' }, el('span', { class: 'p-state' }));
    card.append(stage, el('div', { class: 'p-card-name' }, ship.name), el('div', { class: 'p-card-desc' }, ship.desc), bars, foot);
    card.addEventListener('click', () => {
      if (card.dataset.unlocked === '1') this.cb.onSelectShip(ship.id);
      else this.cb.onUnlockShip(ship.id);
    });
    return card;
  },
  (card, ship) => {
    const s = this.saveRef!;
    const unlocked = s.unlockedShips.includes(ship.id);
    const selected = s.selectedShip === ship.id;
    card.dataset.unlocked = unlocked ? '1' : '0';
    card.classList.toggle('sel', selected);
    card.classList.toggle('locked', !unlocked);
    const st = card.querySelector('.p-state') as HTMLElement;
    st.className = 'p-state ' + (selected ? 'eq' : unlocked ? 'tap' : 'lock');
    st.textContent = selected ? 'EQUIPPED' : unlocked ? 'tap to equip' : `◆ ${ship.unlockShards.toLocaleString()}`;
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 3: Visual check**

`npm run dev` → cockpit. Click between hulls. Expected: EQUIPPED chip and `sel` glow move without the row rebuilding; glyph canvases are NOT repainted on each click (they persist).

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts
git commit -m "feat(lancefall): ship row morphs in place via reconcile (glyphs painted once)"
```

---

## Task 5: Mode rail → reconcile (with live-state listeners)

**Files:**
- Modify: `src/ui.ts` — replace the `modeGrid` block (~3041–3118) in `refreshTitle`.

**Interfaces:**
- Consumes: `reconcile`, `el`, `iconEl`, `RAIL_CARDS`, `modeById`, `cardForMode`, `modeUnlocked`, `modeBrief`, `railAccent`, `hexToRgb`, `CARD_TITLE`, `VARIANT_LABEL`, `MODE_ICONS`, `this.cardVariant`, `this.quietReskin`, callbacks `onSelectMode`.
- Note: this is the most complex conversion. `createFn` builds every possible child slot once (PB line, badge, pill segments); `updateFn` toggles their content/visibility. Card and segment listeners read live `activeId`/`unlocked` from `dataset`.

- [ ] **Step 1: Replace the `modeGrid` block**

Replace `this.modeGrid.replaceChildren();` and the `for (const variants of RAIL_CARDS) { … }` loop with:
```ts
reconcile(
  this.modeGrid,
  RAIL_CARDS,
  (variants) => variants[0], // key by the card's primary mode id
  (variants) => {
    const primary = variants[0];
    const multi = variants.length > 1;
    const cardTitle = multi ? (CARD_TITLE[primary] ?? modeById(primary).name) : modeById(primary).name;
    const card = el('button', { class: 'mode-card ck-mi' });
    const nameEl = el('div', { class: 'ck-mi-name' }, cardTitle);
    const subEl = el('div', { class: 'ck-mi-sub' });
    const pbEl = el('div', { class: 'ck-mi-pb hidden' });
    const text = el('div', { class: 'ck-mi-text' }, nameEl, subEl, pbEl);
    const iconEl_ = iconEl('ck-mi-icon', '');
    // variant pill (multi only): one segment per variant, built once.
    if (multi) {
      const pill = el('div', { class: 'ck-mi-pill', role: 'group', 'aria-label': 'Variant' });
      for (const vid of variants) {
        const seg = el('span', { class: 'ck-mi-pill-seg', role: 'button' }, VARIANT_LABEL[vid] ?? modeById(vid).name);
        seg.dataset.vid = vid;
        seg.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (card.dataset.unlocked !== '1') return;
          this.cardVariant.set(primary, vid);
          this.quietReskin = true;
          this.cb.onSelectMode(vid);
        });
        pill.append(seg);
      }
      text.append(pill);
    }
    const badge = el('div', { class: 'ck-mi-badge hidden' });
    card.append(iconEl_, text, badge);
    card.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.ck-mi-pill')) return; // segment handles its own
      if (card.dataset.unlocked === '1') this.cb.onSelectMode(card.dataset.activeId ?? primary);
    });
    return card;
  },
  (card, variants) => {
    const s = this.saveRef!;
    const primary = variants[0];
    const multi = variants.length > 1;
    const onThisCard = variants.includes(s.selectedMode);
    const activeId = onThisCard ? s.selectedMode : (this.cardVariant.get(primary) ?? primary);
    this.cardVariant.set(primary, activeId);
    const m = modeById(activeId);
    const selected = onThisCard;
    const unlocked = modeUnlocked(modeById(primary), s.deepestWave);
    const brief = modeBrief(m);
    const title = multi ? (CARD_TITLE[primary] ?? m.name) : m.name;

    // live state read by the once-attached listeners
    card.dataset.activeId = activeId;
    card.dataset.unlocked = unlocked ? '1' : '0';

    card.classList.toggle('selected', selected);
    card.classList.toggle('locked', !unlocked);
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
    card.tabIndex = selected ? 0 : -1;
    card.style.setProperty('--accent', railAccent(activeId));
    card.style.setProperty('--accent-rgb', hexToRgb(railAccent(activeId)));
    card.title = unlocked ? m.desc : `Locked — reach wave ${modeById(primary).unlockedAtWave} to unlock ${title}.`;

    (card.querySelector('.ck-mi-icon') as HTMLElement).innerHTML = MODE_ICONS[activeId] ?? MODE_ICONS[primary] ?? '';
    (card.querySelector('.ck-mi-sub') as HTMLElement).textContent = `${brief.tier}${brief.note ? ` · ${brief.note}` : ''}`;

    // PB line — selected card only
    const pb = card.querySelector('.ck-mi-pb') as HTMLElement;
    pb.classList.toggle('hidden', !selected);
    if (selected) {
      pb.textContent = m.seedKind === 'date'
        ? (s.dailyBest > 0 ? s.dailyBest.toLocaleString() : '—')
        : (s.highScore > 0 ? s.highScore.toLocaleString() : '—');
    }

    // pill segment lit-state
    if (multi) {
      for (const seg of Array.from(card.querySelectorAll('.ck-mi-pill-seg')) as HTMLElement[]) {
        const on = seg.dataset.vid === activeId;
        seg.classList.toggle('on', on);
        seg.setAttribute('aria-pressed', String(on));
      }
    }

    // badge — locked / start-here / daily / none
    const badge = card.querySelector('.ck-mi-badge') as HTMLElement;
    if (!unlocked) {
      badge.className = 'ck-mi-badge locked';
      badge.textContent = `LOCKED · reach wave ${modeById(primary).unlockedAtWave}`;
    } else if (activeId === 'casual' && s.totalRuns === 0) {
      badge.className = 'ck-mi-badge start';
      badge.textContent = 'START HERE';
    } else if (m.seedKind === 'date') {
      badge.className = 'ck-mi-badge daily';
      badge.textContent = 'DAILY';
    } else {
      badge.className = 'ck-mi-badge hidden';
      badge.textContent = '';
    }
  },
);
```

- [ ] **Step 2: Verify `.hidden` exists as a display-none utility**

Run: `grep -n "^\.hidden\|\.hidden\b" src/style.css | head`
Expected: a `.hidden { display: none }` (or equivalent) rule exists (it's already used widely, e.g. `hsStreak`/`ngBtn`). If absent, add `.hidden { display: none !important; }` to `style.css`. (It is present — this step is a guard.)

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 4: Visual + interaction check (the key regression surface)**

`npm run dev` → cockpit. Verify:
- Clicking a mode card selects it; the rail does NOT rebuild (other cards keep their nodes).
- On a multi-variant card (Endless / Echo), clicking a variant **pill segment** switches the variant and does NOT also re-select via the card (the old stopPropagation bug). The `START HERE`/`DAILY`/`LOCKED` badges and PB line update on the affected card only.
- Keyboard: the selected card has `tabindex=0`, others `-1` (roving tabindex intact).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts
git commit -m "feat(lancefall): mode rail morphs in place; listeners read live state (kills the pill double-select)"
```

---

## Task 6: CSS transitions for cockpit selection (the buttery payoff)

**Files:**
- Modify: `src/style.css`

**Interfaces:** none (pure styling). Targets the now-stable nodes from Tasks 2–5.

- [ ] **Step 1: Inspect current selection rules**

Run: `grep -n "\.mode-card\|\.ck-mi\b\|\.p-card\|\.ck-heat-pip\|\.ck-armor-pip\|p-state" src/style.css | head -40`
Expected: locate the base rules for `.mode-card`/`.ck-mi`, `.p-card`, `.ck-heat-pip`, `.ck-armor-pip`, `.p-state`. Note which already declare `transition`.

- [ ] **Step 2: Add transitions to the base selectors**

For each base selector that lacks one, add a `transition` covering the properties that change on selection (border-color, box-shadow, background, color, transform, opacity). Example block to add/merge (adjust selectors to the real ones found in Step 1):
```css
.mode-card,
.p-card,
.ck-heat-pip,
.ck-armor-pip,
.p-state {
  transition: border-color 140ms ease, box-shadow 140ms ease,
    background-color 140ms ease, color 140ms ease, transform 140ms ease, opacity 140ms ease;
}
```
Place this AFTER the existing base rules for those selectors (so it merges rather than fighting specificity). Do not add `transition: all` (it would animate layout props and stutter).

- [ ] **Step 3: Respect reduced motion**

Find the existing `@media (prefers-reduced-motion: reduce)` block (search `grep -n "prefers-reduced-motion" src/style.css`). Inside it, add:
```css
.mode-card, .p-card, .ck-heat-pip, .ck-armor-pip, .p-state { transition: none; }
```
If no such block exists, append one at end of file with the rule above.

- [ ] **Step 4: Visual check**

`npm run dev` → cockpit. Click between modes/ships/themes; step Heat. Expected: the glow/border/chip cross-fade over ~140ms instead of snapping. Toggle OS "reduce motion" → transitions disabled.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/style.css
git commit -m "feat(lancefall): cockpit selection cross-fades (reduced-motion gated) now that nodes are stable"
```

---

## Task 7: SKINS grid → reconcile

**Files:**
- Modify: `src/ui.ts` — `refreshSkins` (~2332–2373).

**Interfaces:**
- Consumes: `reconcile`, `el`, `PORTED_KINDS`, `skinsForKind`, `canUnlockSkin`, `skinUnlockHint`, `this.paintSkinPreview`, `UI.KIND_LABEL`, `UI.SKIN_PREVIEW_COLOR`, callbacks `onSelectSkin/onUnlockSkin`.
- Note: per-kind grids are dedicated containers, so each kind's grid is its own reconcile target. The kind LABELS + grids themselves are reconciled on `skinsBody` keyed by kind; each grid's cards are reconciled keyed by skin id. Drop the recursive `this.refreshSkins()` call inside the click handler — a select/unlock persists then calls `refreshTitle` which already drives `refreshSkins`; with stable nodes the in-place update is enough.

- [ ] **Step 1: Replace `refreshSkins` body**

```ts
refreshSkins(): void {
  const s = this.saveRef;
  if (!this.skinsBody || !s) return;
  const kinds = PORTED_KINDS.filter((k) => skinsForKind(k).length > 0);
  // one [label, grid] pair per kind, reconciled on skinsBody so kinds don't rebuild.
  reconcile(
    this.skinsBody,
    kinds,
    (kind) => `k:${kind}`,
    (kind) => {
      const wrap = el('div', { class: 'skin-kind' });
      wrap.append(
        el('div', { class: 'stats-label' }, UI.KIND_LABEL[kind] ?? kind.toUpperCase()),
        el('div', { class: 'codex-grid skin-grid' }),
      );
      return wrap;
    },
    (wrap, kind) => {
      const grid = wrap.querySelector('.skin-grid') as HTMLElement;
      const takes = skinsForKind(kind);
      const selectedId = s.selectedSkins[kind] ?? takes[0].id;
      const color = UI.SKIN_PREVIEW_COLOR[kind] ?? '#22d3ee';
      reconcile(
        grid,
        takes,
        (skin) => skin.id,
        (skin) => {
          const card = el('button', { class: 'codex-entry skin-card', type: 'button' });
          card.style.setProperty('--accent', color);
          const canvas = el('canvas', { class: 'skin-preview' }) as HTMLCanvasElement;
          this.paintSkinPreview(canvas, skin, color, canUnlockSkin(skin, s.achievements));
          card.append(
            canvas,
            el('div', { class: 'skin-name' }, skin.name),
            el('div', { class: 'skin-rarity rarity-' + skin.rarity }, skin.rarity.toUpperCase()),
            el('div', { class: 'skin-status' }),
          );
          card.addEventListener('click', () => {
            if (card.dataset.unlocked === '1') this.cb.onSelectSkin(kind, skin.id);
            else this.cb.onUnlockSkin(kind, skin.id);
          });
          return card;
        },
        (card, skin) => {
          const unlocked = canUnlockSkin(skin, s.achievements);
          const selected = (s.selectedSkins[kind] ?? takes[0].id) === skin.id;
          card.dataset.unlocked = unlocked ? '1' : '0';
          card.classList.toggle('selected', selected);
          card.classList.toggle('locked', !unlocked);
          card.setAttribute('aria-pressed', String(selected));
          card.setAttribute('aria-label', `${UI.KIND_LABEL[kind] ?? kind} — ${skin.name} (${skin.rarity}${unlocked ? '' : ', locked'})`);
          card.title = unlocked ? `${skin.name} — ${skin.rarity}` : `${skin.name} — locked: ${skinUnlockHint(skin)}`;
          (card.querySelector('.skin-status') as HTMLElement).textContent = unlocked ? (selected ? 'EQUIPPED' : 'tap to equip') : skinUnlockHint(skin);
        },
      );
      void selectedId; // selection is read per-card above
    },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `tsc` passes. (If `selectedId`/`void` reads awkward, inline it — the per-card `updateFn` already recomputes selection.)

- [ ] **Step 3: Visual check**

`npm run dev` → open SKINS. Tap skins across kinds. Expected: EQUIPPED moves to the tapped card with no grid reflash; preview canvases persist (painted once); locked taps still fire the unlock path.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts
git commit -m "feat(lancefall): SKINS grid morphs in place via nested reconcile (no reflash on tap)"
```

---

## Task 8: UPGRADES tree → build-shell + reconcile nodes

**Files:**
- Modify: `src/panels/upgrades.ts` — split `renderUpgrades` into a one-time shell builder + an in-place updater.
- Modify: `src/ui.ts` — `openUpgrades` (~1989) and the buy handler (~1996) to build the shell once and update on buy.

**Interfaces:**
- Produces (from `upgrades.ts`):
  - `buildUpgradesShell(onBuy: (id: string) => void): { root: HTMLElement; update: (s: SaveData) => void }`
  - `update(s)` reconciles the 12 branch `.tnode`s (keyed by meta id) + refreshes balance + link layer in place. The root node (THE LAST LANCE) is built once.
- Consumes in `ui.ts`: store `this.upgShell` once; `openUpgrades` builds it if absent then calls `update(s)`; buy handler calls `update(s)` after `onBuyMeta`.

- [ ] **Step 1: Read the current `renderUpgrades` to confirm the per-node state**

Run: `sed -n '54,146p' src/panels/upgrades.ts`
Expected: confirm the per-node derived state — `lvl`, `unlocked`, `maxed`, `cost`, `afford`, the `cls`, the `--fill` var, the `.tnode-lv` text, and the cost element (button when affordable, label otherwise). These are exactly what the updater must set per node.

- [ ] **Step 2: Refactor `renderUpgrades` into shell + update**

Replace the `export function renderUpgrades(...)` with:
```ts
export function buildUpgradesShell(onBuy: (id: string) => void): { root: HTMLElement; update: (s: SaveData) => void } {
  const root = el('div');

  // balance summary (values updated in update())
  const sumV = { shards: el('div', { class: 'upg-sum-v' }), owned: el('div', { class: 'upg-sum-v' }), levels: el('div', { class: 'upg-sum-v' }) };
  const sumCard = (k: string, v: HTMLElement) => el('div', { class: 'upg-sum' }, v, el('div', { class: 'upg-sum-k' }, k));
  root.append(el('div', { class: 'upg-balance' }, sumCard('Shards', sumV.shards), sumCard('Nodes Owned', sumV.owned), sumCard('Total Levels', sumV.levels)));

  // legend (static)
  const legend = el('div', { class: 'upg-legend' });
  for (const b of BRANCHES) { const dot = el('i'); dot.style.background = b.color; legend.append(el('span', {}, dot, b.name)); }
  root.append(legend);

  // tree shell: link layer (innerHTML refreshed in update) + root node + 12 tnodes
  const tree = el('div', { class: 'upg-tree' });
  const linkLayer = el('div', { class: 'upg-link-layer' });
  tree.append(linkLayer);
  const rootNode = el('div', { class: 'tnode tnode-root' });
  rootNode.style.left = '50%'; rootNode.style.top = TY[0] + '%';
  const rootFace = el('div', { class: 'tnode-face' }); rootFace.innerHTML = ICONS.root;
  rootNode.append(el('div', { class: 'tnode-badge' }, rootFace), el('div', { class: 'tnode-name' }, 'THE LAST LANCE'));
  tree.append(rootNode);
  // a dedicated container for the 12 reconciled nodes (so reconcile owns only them)
  const nodeLayer = el('div', { class: 'upg-node-layer' });
  tree.append(nodeLayer);
  root.append(tree);
  root.append(el('p', { class: 'upg-lead' }, 'Permanent upgrades carry between every descent. Each branch unlocks downward — buy a node to reveal the next. Glowing nodes are affordable.'));

  // flatten the 12 nodes with their branch + tier coords for reconcile
  const flat = BRANCHES.flatMap((b) => b.nodes.map((id, i) => ({ id, b, i }))).filter((n) => metaNode(n.id));

  const update = (s: SaveData) => {
    const lvlOf = (id: string) => s.meta?.[id] ?? 0;
    sumV.shards.textContent = `◆ ${s.shards.toLocaleString()}`;
    sumV.owned.textContent = `${META_NODES.filter((n) => lvlOf(n.id) > 0).length} / ${META_NODES.length}`;
    const totalLevels = META_NODES.reduce((sum, n) => sum + Math.min(lvlOf(n.id), n.maxLevel), 0);
    const maxLevels = META_NODES.reduce((sum, n) => sum + n.maxLevel, 0);
    sumV.levels.textContent = `${totalLevels} / ${maxLevels}`;

    // links (cheap SVG string; not the visible flicker source) refreshed wholesale
    let links = '';
    for (const b of BRANCHES) {
      links += link(50, TY[0], b.x, TY[1], b.color, true, lvlOf(b.nodes[0]) > 0);
      for (let i = 0; i < 3; i++) links += link(b.x, TY[i + 1], b.x, TY[i + 2], b.color, lvlOf(b.nodes[i]) > 0, lvlOf(b.nodes[i + 1]) > 0);
    }
    linkLayer.innerHTML = `<svg class="upg-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>`;

    reconcile(
      nodeLayer,
      flat,
      (n) => n.id,
      (n) => {
        const tn = el('div', { class: 'tnode' });
        tn.style.left = n.b.x + '%';
        tn.style.top = TY[n.i + 1] + '%';
        tn.style.setProperty('--bc', n.b.color);
        tn.style.setProperty('--bc-rgb', n.b.rgb);
        const ring = el('div', { class: 'tnode-ring' });
        const face = el('div', { class: 'tnode-face' });
        const badge = el('div', { class: 'tnode-badge' }, ring, face, el('div', { class: 'tnode-lv' }));
        tn.append(badge, el('div', { class: 'tnode-name' }, metaNode(n.id)!.name), el('div', { class: 'tnode-cost' }));
        tn.dataset.id = n.id;
        // one click wiring; afford-gating is enforced in update via dataset.afford
        tn.addEventListener('click', () => { if (tn.dataset.afford === '1') onBuy(n.id); });
        (tn.querySelector('.tnode-cost') as HTMLElement).addEventListener('click', (e) => { e.stopPropagation(); if (tn.dataset.afford === '1') onBuy(n.id); });
        return tn;
      },
      (tn, n) => {
        const node = metaNode(n.id)!;
        const lvl = lvlOf(n.id);
        const unlocked = n.i === 0 || lvlOf(n.b.nodes[n.i - 1]) > 0 || lvl > 0;
        const maxed = lvl >= node.maxLevel;
        const cost = nodeCost(node, lvl);
        const afford = unlocked && !maxed && s.shards >= cost;
        tn.className = 'tnode' + (maxed ? ' maxed' : !unlocked ? ' locked' : afford ? ' afford' : lvl > 0 ? ' owned' : '');
        tn.title = node.desc;
        tn.dataset.afford = afford ? '1' : '0';
        tn.style.setProperty('--fill', String(Math.round((lvl / node.maxLevel) * 100)));
        (tn.querySelector('.tnode-face') as HTMLElement).innerHTML = unlocked ? (ICONS[n.id] ?? ICONS.fortune) : LOCK_SVG;
        const lv = tn.querySelector('.tnode-lv') as HTMLElement;
        lv.classList.toggle('hidden', !unlocked);
        lv.textContent = `${lvl}/${node.maxLevel}`;
        const costEl = tn.querySelector('.tnode-cost') as HTMLElement;
        costEl.className = 'tnode-cost ' + (afford ? 'afford' : maxed ? 'max' : !unlocked ? 'lock' : '');
        costEl.textContent = maxed ? '◆ MAX' : !unlocked ? 'LOCKED' : `◆ ${cost.toLocaleString()}`;
      },
    );
  };

  return { root, update };
}
```
Add `reconcile` to the `./dom` import at the top of `upgrades.ts`:
```ts
import { el, reconcile } from './dom';
```

- [ ] **Step 3: Wire `ui.ts` to build-once + update**

In `src/ui.ts`, add a field near the other panel fields:
```ts
private upgShell?: { root: HTMLElement; update: (s: SaveData) => void };
```
Update the import:
```ts
import { buildUpgradesShell } from './panels/upgrades';
```
(Replace the old `renderUpgrades` import.) Then in `openUpgrades` replace `body.replaceChildren(renderUpgrades(s, (id) => this.cb.onBuyMeta(id)));` with:
```ts
if (!this.upgShell) {
  this.upgShell = buildUpgradesShell((id) => this.cb.onBuyMeta(id));
  body.replaceChildren(this.upgShell.root);
}
this.upgShell.update(s);
```
Find the buy-refresh site (the place that re-rendered upgrades after a buy — same `body.replaceChildren(renderUpgrades(...))` pattern) and replace it with `this.upgShell?.update(this.saveRef!);`.

- [ ] **Step 4: Verify `.tnode-cost` as a `<div>` is acceptable**

The original used a `<button>` only when affordable. Here cost is always a `<div>` with a click handler gated by `dataset.afford`. Confirm keyboard access is preserved by the parent `.tnode`'s click or leave a note: if keyboard buy is required, make the whole `.tnode` focusable (`tabindex=0`) when `afford`. Add in `updateFn`:
```ts
tn.tabIndex = afford ? 0 : -1;
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 6: Visual check**

`npm run dev` → open UPGRADES, buy a node. Expected: the bought node's level/fill/cost morph and the next tier unlocks WITHOUT the whole tree reflashing; balance summary updates in place.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/panels/upgrades.ts lancefall/src/ui.ts
git commit -m "feat(lancefall): UPGRADES tree morphs in place (build-shell + reconcile nodes)"
```

---

## Task 9: STATS rarity-tab content → reconcile

**Files:**
- Modify: `src/ui.ts` — the stats body fill (~1957) and the rarity-tab re-render (~1966).

**Interfaces:**
- Consumes: `renderStats(s, this.statsRarity)` from `./panels/stats`. The cheapest correct win here is to make the tab switch update in place. `renderStats` returns an array of section nodes; reconcile them on the stats body keyed by a stable section key.

- [ ] **Step 1: Read `renderStats`’s return shape**

Run: `sed -n '1,60p' src/panels/stats.ts`
Expected: confirm `renderStats(s, rarity)` returns `HTMLElement[]` (an ordered list of section blocks). Identify a stable per-section key (e.g. a leading `.stats-label` text, or add a `data-sec` attribute to each section in `renderStats`).

- [ ] **Step 2: Give each section a stable key**

In `src/panels/stats.ts`, ensure every top-level returned section carries `data-sec="<stable-name>"` (add `'data-sec': 'hero'`, `'rarity'`, etc. to each section's `el(...)` attrs). This is the reconcile key source.

- [ ] **Step 3: Replace the two `replaceChildren(...renderStats(...))` sites**

Define a small private helper in `ui.ts`:
```ts
private paintStats(body: HTMLElement, s: SaveData): void {
  const sections = renderStats(s, this.statsRarity);
  reconcile(
    body,
    sections,
    (sec) => sec.getAttribute('data-sec') ?? sec.className,
    (sec) => sec,           // renderStats already built it; adopt as-is
    (node, sec) => { if (node !== sec) node.replaceWith(sec); }, // swap content if changed
  );
}
```
Note: because `renderStats` rebuilds fresh section nodes, identity can't be preserved per-element here without a deeper refactor; the win is that unchanged sections’ keys keep their slot and only changed sections swap — and the modal no longer wholesale-reflashes on a tab click. Replace both `body.replaceChildren(...renderStats(s, this.statsRarity));` sites (1957 and 1966) with `this.paintStats(body, s);`. Keep the surrounding open/guard logic.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 5: Visual check**

`npm run dev` → open STATS, switch rarity tabs. Expected: the achievement grid updates without the hero/header re-flashing.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts lancefall/src/panels/stats.ts
git commit -m "feat(lancefall): STATS sections reconcile on rarity-tab switch (no hero reflash)"
```

---

## Task 10: CODEX & RANKS grids → reconcile (open-time + async)

**Files:**
- Modify: `src/ui.ts` — `refreshMemories` (~2445–2483 region, the `codexMemories.replaceChildren()` at ~2448 and `codexBestiary.replaceChildren(...renderBestiary(...))` at ~2483); the ranks list fill (the `listWrap.replaceChildren(...)` sites ~2731/2733).

**Interfaces:**
- Consumes: `reconcile`, `renderBestiary(killsByKind)` from `./panels/codex`, the memories source, and the ranks entry list.
- Note: these churn only on open/async-load (not on an in-modal click), so this is the lowest-jank surface — but converting keeps them consistent and avoids reflash if re-opened while data streams in. Key bestiary by enemy kind; key memories by memory id; key ranks rows by a stable entry key (rank or `handle+score`).

- [ ] **Step 1: Read the three current fills**

Run: `sed -n '2445,2485p' src/ui.ts` and `sed -n '2720,2745p' src/ui.ts`
Expected: confirm the item collections — memories list, `renderBestiary` (returns per-kind grid nodes), and the ranks entries array (incl. the `Loading…` placeholder and empty states).

- [ ] **Step 2: Convert bestiary**

Replace `this.codexBestiary.replaceChildren(...renderBestiary(this.saveRef.killsByKind));` with a reconcile over the bestiary section nodes. If `renderBestiary` returns `HTMLElement[]`, add `data-kind` to each section in `panels/codex.ts` and reconcile keyed by it (same adopt-as-is pattern as Task 9 Step 3). Commit boundary note: keep `renderBestiary` returning nodes; only the mount site changes.

- [ ] **Step 3: Convert memories**

Replace the `this.codexMemories.replaceChildren()` + append loop with a `reconcile(this.codexMemories, memories, (m) => m.id, createMemoryCard, updateMemoryCard)` where `createMemoryCard` builds the card once and `updateMemoryCard` toggles the locked/unlocked + revealed text state. Use the exact field logic from the existing loop (read it in Step 1).

- [ ] **Step 4: Convert ranks**

For the ranks list, model the states as keyed items: `['loading']` while fetching, `['empty']` on no entries, else the entries keyed by `r:${entry.rank}:${entry.handle}`. Reconcile `listWrap` over that, so a re-open or refetch swaps rows in place rather than clearing to `Loading…` then reflashing the full list.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `tsc` passes.

- [ ] **Step 6: Visual check**

`npm run dev` → open CODEX (memories + bestiary render; kill counts correct) and RANKS (loads; rows appear). Re-open each. Expected: no full reflash on re-open; lists settle in place.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/ui.ts lancefall/src/panels/codex.ts
git commit -m "feat(lancefall): CODEX & RANKS grids reconcile (no reflash on re-open/refetch)"
```

---

## Task 11: Full-suite + visual regression sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all suites PASS (including the new `dom.test.ts`); no regressions.

- [ ] **Step 2: Typecheck + production build**

Run: `npm run build`
Expected: `tsc` + `vite build` succeed (prod is minified — per project memory, dev passing is not enough).

- [ ] **Step 3: Production preview smoke**

Run: `npm run preview` and open the served URL. Click through: cockpit mode/ship/theme/trail/heat selection, variant pills, then SKINS/UPGRADES/STATS/CODEX/RANKS modals. Expected: every interaction morphs in place; no section reload; no console errors (the CSP-blocked CF beacon is the one known-harmless error).

- [ ] **Step 4: ui-capture visual diff (optional but preferred)**

Run the existing capture harness in `tools/ui-capture` per its README to snapshot the panels and eyeball against the committed references. Expected: layout unchanged (we changed update mechanics, not structure).

- [ ] **Step 5: detect_changes before final wrap**

Once GitNexus’ index is available again, run `detect_changes({scope: "compare", base_ref: "main"})` (or `unstaged`) to confirm the change set only touches `ui.ts`, `panels/dom.ts`, `panels/upgrades.ts`, `panels/stats.ts`, `panels/codex.ts`, `style.css`, and the test/package files — no gameplay/determinism flows.

- [ ] **Step 6: No commit** (verification task; any fixes are committed under their own task).

---

## Self-Review notes

- **Spec coverage:** primitive (T1) ✓; cockpit lists — pips (T2), cosmetics (T3), ships (T4), mode rail (T5) ✓; CSS transitions (T6) ✓; modal grids — SKINS (T7), UPGRADES (T8), STATS (T9), CODEX+RANKS (T10) ✓; verification (T11) ✓.
- **Live-state listener hazard** (spec’s primary risk) is addressed in T3/T4/T5/T7/T8 via `dataset`-stored state read by once-attached handlers.
- **Type consistency:** `reconcile` signature is identical everywhere; `buildUpgradesShell` return type `{ root; update }` is used consistently in T8.
- **Known soft spots called out, not hidden:** T9/T10 “adopt-as-is” reconcile preserves slot/keys but not per-element identity for sections built by `renderStats`/`renderBestiary` (those return fresh trees); the win is no wholesale reflash and stable section ordering. A deeper per-element refactor of those two render functions is explicitly out of scope for this pass.
