# Profile Avatars — Integration (Track B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 24 procedural-SVG avatars into LANCEFALL — derived unlocks, a `selectedAvatar` save field, a profile-panel picker, and a cockpit display — without touching the visual layer or bloating the huge files.

**Architecture:** Pure unlock predicates (`src/avatarUnlocks.ts`) read existing `SaveData` fields and consume the stable visual registry (`src/render/avatars/registry.ts`, Track A). One additive save field. The picker is its own panel module (`src/panels/avatar.ts`); `ui.ts` gains only thin modal-lifecycle delegation; the cockpit gains one `renderAvatar()` call. No `unlockedAvatars` array is stored — unlocks are derived, so veterans own retroactively.

**Tech Stack:** Vite + TypeScript, Vitest, happy-dom for DOM tests, Canvas 2D game loop.

## Global Constraints
- **Prerequisite:** Track A's `src/render/avatars/registry.ts` must export the stable interface: `AVATAR_IDS: readonly string[]`, `avatarVisual(id): AvatarVisual | undefined`, `AVATAR_VISUALS: AvatarVisual[]`, `renderAvatar(id, opts?): string`, `DEFAULT_AVATAR: 'lance'`, and the `AvatarVisual` / `SceneCtx` types. If Track A is not done, first create a minimal stub registry exposing exactly these names (24 ids, trivial `scene`), then swap to the real one later.
- **Do not modify** `src/render/avatars/**` (Track A owns it) beyond importing its public interface.
- **Do not bloat the huge files.** `ui.ts`, `render.ts`, `game.ts` get only thin delegation (a few lines each). All new logic lives in new focused modules.
- **No import cycle.** `save.ts` must NOT import `avatarUnlocks.ts`. `avatarUnlocks.ts` imports `SaveData` (type only) from `save.ts` and the registry. Validity-against-unlock is resolved at the edges via `effectiveAvatar(save)`, never inside `save.ts`.
- **Save field is additive** — no `SAVE_VERSION` bump (currently `9`); follows the `taught`-style additive pattern. `defaultSave()` sets the literal `'lance'`.
- **Local-only display** this pass (profile panel + cockpit). No Worker/leaderboard changes.
- **Accessibility:** picker/cockpit pass `{ animated: !settings.reduceMotion }` to `renderAvatar`; tiles use `variant:'tile'`. Picker tiles are ≥64px touch targets with `aria-label`.
- The UI layer has **zero test coverage** — keep logic out of `ui.ts`; verify UI via the DEV `__lf` hook + `vite preview`.

---

### Task 1: Derived unlock predicates — `src/avatarUnlocks.ts`

**Files:**
- Create: `src/avatarUnlocks.ts`
- Test: `src/avatarUnlocks.test.ts`

**Interfaces:**
- Consumes: `AVATAR_IDS`, `avatarVisual`, `DEFAULT_AVATAR`, `AvatarVisual` from `./render/avatars/registry`; `SaveData` from `./save`; `vocabulary` from `./intercepts`.
- Produces: `isAvatarUnlocked(id: string, s: SaveData): boolean`, `unlockedAvatars(s: SaveData): AvatarVisual[]`, `effectiveAvatar(s: SaveData): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/avatarUnlocks.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave, type SaveData } from './save';
import { isAvatarUnlocked, unlockedAvatars, effectiveAvatar } from './avatarUnlocks';
import { vocabulary } from './intercepts';

const FREE = ['lance', 'ring', 'beat', 'fall', 'graze', 'comet', 'skyline', 'chevron'];

describe('avatarUnlocks', () => {
  it('a fresh save unlocks exactly the 8 free avatars', () => {
    const s = defaultSave();
    const ids = unlockedAvatars(s).map((a) => a.id).sort();
    expect(ids).toEqual([...FREE].sort());
  });

  it('killing a boss unlocks its crest', () => {
    const s = defaultSave();
    s.killsByKind = { warden: 1 };
    expect(isAvatarUnlocked('warden', s)).toBe(true);
    expect(isAvatarUnlocked('weaver', s)).toBe(false);
  });

  it('the Sovereign crest unlocks on a kill OR on making THE CHOICE', () => {
    const a = defaultSave(); a.killsByKind = { sovereign: 1 };
    const b = defaultSave(); b.stillpointChoice = 'fall';
    expect(isAvatarUnlocked('sovereign', a)).toBe(true);
    expect(isAvatarUnlocked('sovereign', b)).toBe(true);
    expect(isAvatarUnlocked('sovereign', defaultSave())).toBe(false);
  });

  it('cipher line: 25% decrypts codebreaker, 100% adds remember', () => {
    const total = vocabulary().length;
    const s = defaultSave();
    s.decryptedWords = vocabulary().slice(0, Math.ceil(total * 0.25));
    expect(isAvatarUnlocked('codebreaker', s)).toBe(true);
    expect(isAvatarUnlocked('remember', s)).toBe(false);
    s.decryptedWords = [...vocabulary()];
    expect(isAvatarUnlocked('remember', s)).toBe(true);
  });

  it('THE CHOICE + the Vigil', () => {
    const c = defaultSave(); c.stillpointChoice = 'fall';
    const v = defaultSave(); v.stillpointChoice = 'catch';
    expect(isAvatarUnlocked('choice', c)).toBe(true);
    expect(isAvatarUnlocked('vigil', c)).toBe(false);   // 'fall' is not the Vigil
    expect(isAvatarUnlocked('choice', v)).toBe(true);
    expect(isAvatarUnlocked('vigil', v)).toBe(true);
  });

  it('pilot line thresholds', () => {
    const heat = defaultSave(); heat.maxHeat = 5;
    const day = defaultSave(); day.lifeDaybreaks = 50;
    const breath = defaultSave(); breath.lifeLastBreath = 25;
    const sol = defaultSave(); sol.winsByMode = { longestday: 1 };
    const unt = defaultSave(); unt.achievements = ['pristine'];
    expect(isAvatarUnlocked('heat', heat)).toBe(true);
    expect(isAvatarUnlocked('daybreak', day)).toBe(true);
    expect(isAvatarUnlocked('lastbreath', breath)).toBe(true);
    expect(isAvatarUnlocked('solstice', sol)).toBe(true);
    expect(isAvatarUnlocked('untouched', unt)).toBe(true);
  });

  it('eternal unlocks on NG+ OR all six bosses felled', () => {
    const ng = defaultSave(); ng.ngPlusLevel = 1;
    const six = defaultSave();
    six.killsByKind = { warden: 1, weaver: 1, beacon: 1, mirrorblade: 1, hollow: 1, sovereign: 1 };
    expect(isAvatarUnlocked('eternal', ng)).toBe(true);
    expect(isAvatarUnlocked('eternal', six)).toBe(true);
    expect(isAvatarUnlocked('eternal', defaultSave())).toBe(false);
  });

  it('effectiveAvatar coerces unknown/locked selections to the default', () => {
    const s = defaultSave();
    s.selectedAvatar = 'sovereign';            // locked on a fresh save
    expect(effectiveAvatar(s)).toBe('lance');
    s.selectedAvatar = 'not-a-real-id';
    expect(effectiveAvatar(s)).toBe('lance');
    s.selectedAvatar = 'ring';                 // free → allowed
    expect(effectiveAvatar(s)).toBe('ring');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/avatarUnlocks.test.ts`
Expected: FAIL — `Cannot find module './avatarUnlocks'` (and `selectedAvatar` may not exist yet — Task 2 adds it; if the type errors, add the field in Task 2 first, then return).

- [ ] **Step 3: Write the implementation**

```ts
// src/avatarUnlocks.ts — pure; the ONLY avatar module that knows about the save.
import type { SaveData } from './save';
import { AVATAR_IDS, avatarVisual, DEFAULT_AVATAR, type AvatarVisual } from './render/avatars/registry';
import { vocabulary } from './intercepts';

const FREE = new Set(['lance', 'ring', 'beat', 'fall', 'graze', 'comet', 'skyline', 'chevron']);
const BOSSES = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'] as const;
const FLAWLESS = ['flawlessgauntlet', 'pristine', 'flawlesskey'];

// Tunable thresholds (feel-tuned during verification).
const HEAT_MIN = 5;          // of MAX_HEAT = 7 — a high but attainable tier
const DAYBREAK_MIN = 50;     // lifetime OVERDRIVE fires
const LASTBREATH_MIN = 25;   // lifetime clutch saves

const kills = (s: SaveData, k: string) => s.killsByKind?.[k] ?? 0;

const PREDICATES: Record<string, (s: SaveData) => boolean> = {
  warden: (s) => kills(s, 'warden') > 0,
  weaver: (s) => kills(s, 'weaver') > 0,
  beacon: (s) => kills(s, 'beacon') > 0,
  mirrorblade: (s) => kills(s, 'mirrorblade') > 0,
  hollow: (s) => kills(s, 'hollow') > 0,
  sovereign: (s) => kills(s, 'sovereign') > 0 || s.stillpointChoice !== 'none',
  codebreaker: (s) => s.decryptedWords.length >= Math.ceil(vocabulary().length * 0.25),
  remember: (s) => s.decryptedWords.length >= vocabulary().length,
  choice: (s) => s.stillpointChoice !== 'none',
  vigil: (s) => s.stillpointChoice === 'catch',
  heat: (s) => s.maxHeat >= HEAT_MIN,
  untouched: (s) => FLAWLESS.some((id) => s.achievements.includes(id)),
  daybreak: (s) => s.lifeDaybreaks >= DAYBREAK_MIN,
  lastbreath: (s) => s.lifeLastBreath >= LASTBREATH_MIN,
  solstice: (s) => (s.winsByMode?.longestday ?? 0) > 0,
  eternal: (s) => s.ngPlusLevel >= 1 || BOSSES.every((b) => kills(s, b) > 0),
};

export function isAvatarUnlocked(id: string, s: SaveData): boolean {
  if (FREE.has(id)) return true;
  return PREDICATES[id]?.(s) ?? false;
}

export function unlockedAvatars(s: SaveData): AvatarVisual[] {
  return AVATAR_IDS.filter((id) => isAvatarUnlocked(id, s))
    .map((id) => avatarVisual(id))
    .filter((v): v is AvatarVisual => !!v);
}

/** The avatar actually shown: the selection if it exists AND is unlocked, else the default. */
export function effectiveAvatar(s: SaveData): string {
  const id = s.selectedAvatar;
  return avatarVisual(id) && isAvatarUnlocked(id, s) ? id : DEFAULT_AVATAR;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/avatarUnlocks.test.ts`
Expected: PASS (after Task 2's `selectedAvatar` field exists — do Task 2 first if the type fails to compile, then re-run).

- [ ] **Step 5: Commit**

```bash
git add src/avatarUnlocks.ts src/avatarUnlocks.test.ts
git commit -m "feat(lancefall): derived avatar unlock predicates"
```

---

### Task 2: `selectedAvatar` save field

**Files:**
- Modify: `src/save.ts` (the `SaveData` interface near the cosmetics block ~line 87; `defaultSave()` ~line 274)
- Test: `src/avatarSave.test.ts`

**Interfaces:**
- Produces: `SaveData.selectedAvatar: string` (default `'lance'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/avatarSave.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';

describe('selectedAvatar save field', () => {
  it('defaults to the lance avatar', () => {
    expect(defaultSave().selectedAvatar).toBe('lance');
  });
  it('is a string that survives a JSON round-trip', () => {
    const s = defaultSave();
    s.selectedAvatar = 'warden';
    const round = JSON.parse(JSON.stringify(s));
    expect(round.selectedAvatar).toBe('warden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/avatarSave.test.ts`
Expected: FAIL — `selectedAvatar` is missing / `undefined`.

- [ ] **Step 3: Add the field to the interface**

In `src/save.ts`, in the `SaveData` interface, immediately after the dash-trail cosmetic fields (`selectedTrail: string;`), add:

```ts
  /** chosen profile avatar id (see render/avatars). 'lance' = default. Validity-against-unlock is
   *  resolved at the edges via effectiveAvatar() — never sanitized here (would cycle save↔avatarUnlocks). */
  selectedAvatar: string;
```

- [ ] **Step 4: Add the default to `defaultSave()`**

In the object returned by `defaultSave()`, immediately after `selectedTrail: '...',`, add:

```ts
    selectedAvatar: 'lance',
```

(Literal `'lance'` — do NOT import `DEFAULT_AVATAR` here, to avoid coupling `save.ts` to the registry.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/avatarSave.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the migrate loader tolerates the additive field (no version bump)**

Run: `npx vitest run src/migrate.test.ts src/save.test.ts`
Expected: PASS (existing save tests unaffected; the generic loader preserves the new field; `SAVE_VERSION` stays `9`).

- [ ] **Step 7: Commit**

```bash
git add src/save.ts src/avatarSave.test.ts
git commit -m "feat(lancefall): add selectedAvatar save field (additive, default lance)"
```

---

### Task 3: Avatar picker panel — `src/panels/avatar.ts`

**Files:**
- Create: `src/panels/avatar.ts`
- Test: `src/panels/avatar.test.ts`
- Read for the exact deps/lifecycle template: an existing extracted panel (e.g. `src/panels/upgrades.ts` or `src/panels/stats.ts`) and the shared `src/panels/dom.ts` (`reconcile()` helper).

**Interfaces:**
- Consumes: `renderAvatar`, `AVATAR_VISUALS`, `type AvatarVisual` from `../render/avatars/registry`; `isAvatarUnlocked`, `effectiveAvatar` from `../avatarUnlocks`; `type SaveData` from `../save`.
- Produces: `buildAvatarPanel(deps: AvatarPanelDeps): Panel` where `Panel = { root: HTMLElement; open(save: SaveData): void }` and `AvatarPanelDeps = { onSelect(id: string): void; reduceMotion(): boolean }`.

- [ ] **Step 1: Write the failing test (happy-dom render smoke + selection)**

```ts
// src/panels/avatar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { defaultSave } from '../save';
import { buildAvatarPanel } from './avatar';

describe('avatar picker panel', () => {
  it('renders all 24 tiles, locks the non-free ones, and selects an unlocked one', () => {
    const onSelect = vi.fn();
    const panel = buildAvatarPanel({ onSelect, reduceMotion: () => true });
    panel.open(defaultSave());

    const tiles = panel.root.querySelectorAll('[data-avatar-id]');
    expect(tiles.length).toBe(24);
    const locked = panel.root.querySelectorAll('[data-locked="true"]');
    expect(locked.length).toBe(16);

    // a free avatar tile is selectable
    const ring = panel.root.querySelector('[data-avatar-id="ring"]') as HTMLElement;
    ring.click();
    expect(onSelect).toHaveBeenCalledWith('ring');

    // a locked tile does not select
    onSelect.mockClear();
    const warden = panel.root.querySelector('[data-avatar-id="warden"]') as HTMLElement;
    warden.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('passes static (non-animated) svg when reduceMotion is on', () => {
    const panel = buildAvatarPanel({ onSelect: () => {}, reduceMotion: () => true });
    panel.open(defaultSave());
    expect(panel.root.innerHTML).not.toContain('<animate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/panels/avatar.test.ts`
Expected: FAIL — `Cannot find module './avatar'`.

- [ ] **Step 3: Implement the panel**

Mirror the deps/lifecycle shape of the existing panel you read in step 0. Avatar-specific logic:

```ts
// src/panels/avatar.ts
import { AVATAR_VISUALS, renderAvatar, type AvatarVisual } from '../render/avatars/registry';
import { isAvatarUnlocked } from '../avatarUnlocks';
import type { SaveData } from '../save';

export interface AvatarPanelDeps { onSelect(id: string): void; reduceMotion(): boolean; }
export interface Panel { root: HTMLElement; open(save: SaveData): void; }

export function buildAvatarPanel(deps: AvatarPanelDeps): Panel {
  const root = document.createElement('div');
  root.className = 'avatar-panel';
  const grid = document.createElement('div');
  grid.className = 'avatar-grid';
  root.appendChild(grid);

  function tile(v: AvatarVisual, unlocked: boolean, selectedId: string): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'avatar-tile';
    el.dataset.avatarId = v.id;
    el.dataset.locked = unlocked ? 'false' : 'true';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', v.id === selectedId ? 'true' : 'false');
    el.setAttribute('aria-label', unlocked ? v.name : `${v.name} — locked: ${v.unlockHint}`);
    el.disabled = !unlocked;
    el.innerHTML =
      renderAvatar(v.id, { size: 72, variant: 'tile', animated: !deps.reduceMotion() }) +
      `<span class="avatar-name">${unlocked ? v.name : 'LOCKED'}</span>`;
    if (unlocked) el.addEventListener('click', () => deps.onSelect(v.id));
    return el;
  }

  return {
    root,
    open(save: SaveData) {
      grid.replaceChildren(
        ...AVATAR_VISUALS.map((v) => tile(v, isAvatarUnlocked(v.id, save), save.selectedAvatar)),
      );
    },
  };
}
```

(If the codebase's other panels use `reconcile()` from `panels/dom.ts` instead of `replaceChildren`, follow that convention; the test only asserts the DOM result.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/panels/avatar.test.ts`
Expected: PASS.

- [ ] **Step 5: Add minimal panel styles**

In `src/style.css`, add a focused block (grid layout, tile sizing ≥64px, locked dimming, selected ring). Keep it scoped under `.avatar-panel`:

```css
.avatar-panel .avatar-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.avatar-tile { display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 64px; min-height: 64px; background: none; border: 1px solid transparent;
  border-radius: 10px; cursor: pointer; padding: 8px; }
.avatar-tile[aria-selected="true"] { border-color: var(--accent, #7df9ff); }
.avatar-tile[data-locked="true"] { opacity: 0.4; cursor: not-allowed; }
.avatar-tile .avatar-name { font-size: 11px; letter-spacing: 1px; }
```

- [ ] **Step 6: Commit**

```bash
git add src/panels/avatar.ts src/panels/avatar.test.ts src/style.css
git commit -m "feat(lancefall): avatar picker panel (24 tiles, lock-aware, motion-safe)"
```

---

### Task 4: Open the picker from the profile/account area (thin `ui.ts` delegation)

**Files:**
- Modify: `src/ui.ts` (mirror how an existing extracted panel is constructed + opened — grep `buildUpgradesPanel` or similar to find the wiring spot)

**Interfaces:**
- Consumes: `buildAvatarPanel` from `./panels/avatar`; the existing save accessor + a persist/change call (grep how `selectedTrail` / `selectedShip` is written, e.g. a `setSelectedTrail`-style setter on the game/save, then `noteChange()`-style persist).

- [ ] **Step 1: Construct the panel once, alongside the other panels**

Where the other panels are instantiated in `ui.ts`, add (matching local style):

```ts
const avatarPanel = buildAvatarPanel({
  reduceMotion: () => settings.reduceMotion,           // use the same settings ref the other panels read
  onSelect: (id) => {
    save.selectedAvatar = id;                            // or the existing setter used for cosmetics
    persistSave();                                       // the same persist call cosmetics use (e.g. saveSave + account noteChange)
    avatarPanel.open(save);                              // re-render to move the selected ring
    refreshCockpitAvatar?.();                            // Task 5 hook, if present
  },
});
```

- [ ] **Step 2: Add an entry point that opens it**

In the profile/account section of the loadout/title UI, add an "AVATAR" button (mirror an existing panel-opening button) whose handler runs the modal-open lifecycle the other panels use and calls `avatarPanel.open(save)`.

- [ ] **Step 3: Verify in the running app (no unit test — ui.ts is untested)**

Run: `npm run dev`, then in the browser console:

```js
__lf.ui.openAvatar?.()   // if you exposed a dev hook; otherwise click the AVATAR button
```

Expected: the picker opens, shows 24 tiles, free ones selectable, locked ones dimmed with an unlock hint; selecting one persists (reload → still selected).

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts
git commit -m "feat(lancefall): open avatar picker from the profile area"
```

---

### Task 5: Cockpit display of the selected avatar

**Files:**
- Modify: the file that renders the player handle on the title cockpit (grep for where `save.handle` / the handle label is drawn — likely `src/ui.ts` cockpit section or `src/render/*`)

**Interfaces:**
- Consumes: `renderAvatar` from `./render/avatars/registry`; `effectiveAvatar` from `./avatarUnlocks`.

- [ ] **Step 1: Render the avatar beside the handle**

At the handle render spot, inject a small avatar tile (DOM cockpit) next to the name:

```ts
import { renderAvatar } from './render/avatars/registry';
import { effectiveAvatar } from './avatarUnlocks';

// where the handle element is built/updated:
avatarSlot.innerHTML = renderAvatar(effectiveAvatar(save), {
  size: 40, variant: 'tile', animated: !settings.reduceMotion,
});
```

Use `effectiveAvatar(save)` (not `save.selectedAvatar`) so a never-unlocked/stale id falls back to `lance`.

- [ ] **Step 2: Verify in the running app**

Run: `npm run dev`. Expected: the cockpit shows the avatar next to your handle; changing it in the picker updates it; with `reduceMotion` on, the cockpit avatar is static.

- [ ] **Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat(lancefall): show selected avatar beside the cockpit handle"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all green, including `avatarUnlocks.test.ts`, `avatarSave.test.ts`, `panels/avatar.test.ts`, and Track A's `registry.test.ts`. No regressions.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production-build smoke (minified — catches what dev/tests miss)**

Run: `npm run build && npm run preview`
Open the preview URL; confirm: picker opens, 24 tiles render, lock states correct, selection persists across reload, cockpit shows the avatar, and no console errors (the CSP-blocked CF beacon line is the known harmless exception).

- [ ] **Step 4: reduceMotion check**

In Settings, enable Reduce Motion (or set `prefers-reduced-motion`), reopen the picker + reload: avatars render as fully-composed **static** frames (no `<animate>`), no layout shift.

- [ ] **Step 5: detect_changes before finishing**

Run GitNexus `detect_changes({ scope: "compare", base_ref: "main" })` (or `v6`) and confirm only the expected new/modified symbols are affected; then the branch is ready for review/merge.

---

## Self-Review notes
- **Spec coverage:** §4 unlocks → Task 1 (all 24 predicates, grounded in `MAX_HEAT=7`, `vocabulary()`, flawless ids `flawlessgauntlet`/`pristine`/`flawlesskey`, `winsByMode.longestday`). §6 save field → Task 2. §7 picker + cockpit → Tasks 3–5. §3.4 reduceMotion/tile → Tasks 3/5 + Task 6 step 4. §9 tests → Tasks 1–3 + Task 6. Track A visual layer is out of scope here (its own handoff).
- **No-cycle invariant** stated in Global Constraints and enforced by `effectiveAvatar` living in `avatarUnlocks.ts`, with `save.ts` using the literal `'lance'`.
- **Type consistency:** `Panel`/`buildAvatarPanel`/`AvatarPanelDeps` names match across Tasks 3–4; `effectiveAvatar`/`isAvatarUnlocked`/`unlockedAvatars` match across Tasks 1, 4, 5; registry names match the spec §5.1 interface.
