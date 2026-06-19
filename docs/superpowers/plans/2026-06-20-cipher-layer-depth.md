# THE CIPHER LAYER — depth pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen THE BOMBE / meta-cipher side so decryption feeds back into the run and the world — a 100% payoff (THE LAST TRANSMISSION + reward stack), a real seeded-safe run advantage (Intel), a provably-daily cipher, and Bombe upgrade branches + a boss-drop faucet.

**Architecture:** Four loosely-coupled features. New PURE modules (`intel.ts`, `dailyCipher.ts`) carry the logic and are fully unit-tested; thin wiring in `game.ts`/`ui.ts` calls them. Existing pure modules (`intercepts.ts`, `bombe.ts`, `stillpoint.ts`) get additive helpers. Everything save-side, never rng, never the sim; anything that varies by save is gated OFF in seeded modes via `modeSeeded(cfg)`.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Canvas 2D. No new dependencies.

## Global Constraints

- **Determinism is law.** No new code may draw from a sim rng stream or write sim state. Per-save effects (Intel damage/readability, INSIGHT daily crack) MUST be gated `!modeSeeded(this.mode)` so seeded Daily/Weekly are bit-identical for everyone. `modeSeeded` is in `src/modes.ts` (`seedKind === 'date' || 'week'`), already imported in `game.ts`.
- **Pure meta mutations only:** the only legal writes are to save fields (`decryptedWords`, `stillpointFragments`, `solvedPuzzles`, `solvedDailyCiphers`, `bombeBranches`, `bombeLevel`, `unlockedTrails`, `unlockedThemes`, `unlockedShipSkins`, `achievements`). No rng anywhere in new pure modules.
- **Tests required** for every new pure module + extended `achievements.test.ts` / `migrate.test.ts`. Run `npx vitest run` (must stay green; baseline 1193 tests) and `npx tsc --noEmit` (clean) before every commit.
- **Save:** additive fields, NO `SAVE_VERSION` bump (generic loader tolerates new fields; `migrate.ts` L114-116 documents this). `bombeBranches` needs an explicit sanitizer.
- **Shared-file staging:** `style.css`, `ui.ts`, `game.ts`, `panels/bombe.ts` are live-edited by other agents. NEVER `git add -A`; stage only own hunks (content-filtered `git apply --cached` from repo root — see the `lancefall-shared-tree-staging` memory). Append CSS at file end. `panels/bombe.ts` is owned by the polish agent — keep edits there minimal and coordinate.
- **GitNexus:** run `impact({target, direction:'upstream'})` before editing any existing symbol; `detect_changes()` before each commit; warn on HIGH/CRITICAL. (Fall back to grep if GitNexus is locked.)
- **Repo facts:** default working branch is `v6`. CRLF line endings — use Edit/sed, not gawk. Verify UI via minified `vite preview` (launch.json `lancefall-prod`, port 4350) — `__lf` dev hooks are absent on the prod build.

---

# PART A — THE LAST TRANSMISSION & the 100% payoff

New pure helpers in `intercepts.ts` + a `lastkey` ship skin + `dawn` trail + `decrypted` palette + `longestday-read` achievement, granted when the master cipher completes.

### Task A1: `int-last` transmission (vocabulary-locked) + `isLongestDay`

**Files:**
- Modify: `src/intercepts.ts` (append to `INTERCEPTS`; add `isLongestDay`)
- Test: `src/intercepts.test.ts`

**Interfaces:**
- Produces: `isLongestDay(save: SaveData): boolean`; a 14th `INTERCEPTS` entry `id:'int-last'`, no `loreLink`.

- [ ] **Step 1: Write the failing test** — append to `src/intercepts.test.ts`:

```ts
import { INTERCEPTS, vocabulary, interceptWords, isLongestDay, masterProgress } from './intercepts';
import { defaultSave } from './save';

describe('THE LAST TRANSMISSION (int-last)', () => {
  it('exists, has no loreLink, and adds zero new vocabulary words', () => {
    const last = INTERCEPTS.find((i) => i.id === 'int-last')!;
    expect(last).toBeTruthy();
    expect(last.loreLink).toBeUndefined();
    // every word of int-last must already appear in the other 13 transmissions
    const others = new Set(
      INTERCEPTS.filter((i) => i.id !== 'int-last').flatMap((i) => interceptWords(i)),
    );
    for (const w of interceptWords(last)) expect(others.has(w)).toBe(true);
  });
  it('isLongestDay is true exactly when every vocabulary word is decrypted', () => {
    const s = defaultSave();
    expect(isLongestDay(s)).toBe(false);
    s.decryptedWords = [...vocabulary()];
    expect(masterProgress(s).frac).toBe(1);
    expect(isLongestDay(s)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/intercepts.test.ts` → fails (`isLongestDay` undefined / `int-last` missing).

- [ ] **Step 3: Implement.** In `src/intercepts.ts`, append a 14th entry to `INTERCEPTS` (after `int-gardens`) authored ONLY from words already used in transmissions 01–13. Draft (verify each word is in vocabulary — adjust wording, not the rule):

```ts
  {
    id: 'int-last', title: 'TRANSMISSION XIV — THE LONGEST DAY',
    tokens: toks(
      'The city is whole again. Every cipher broken, every name read, every light returned. ' +
      'You held the line that was always yours. The longest day stands, and the dark has nowhere left to fall.',
    ),
  },
```

Then add the helper near `masterProgress`:

```ts
/** True once every vocabulary word is decrypted — THE LONGEST DAY (100%). Pure save read. */
export function isLongestDay(save: SaveData): boolean {
  return masterProgress(save).frac >= 1;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run src/intercepts.test.ts`. If the vocabulary-subset test fails, edit `int-last` wording until every word already exists in the other transmissions (do NOT relax the test).

- [ ] **Step 5: Commit** — `git add src/intercepts.ts src/intercepts.test.ts && git commit` — `feat(lancefall): THE LAST TRANSMISSION — vocabulary-locked 14th intercept + isLongestDay`

### Task A2: `dawn` trail + `decrypted` palette + `longestday-read` achievement (data)

**Files:**
- Modify: `src/trails.ts` (add `dawn`), `src/themes.ts` (add `unlockAch?` field + `canUnlockTheme` + `decrypted` theme), `src/achievements.ts` (add `longestday-read`)
- Test: `src/achievements.test.ts`, new `src/themes.test.ts`

**Interfaces:**
- Produces: trail id `dawn` (unlockAch `longestday-read`); theme id `decrypted` (unlockAch `longestday-read`); `canUnlockTheme(def, shards, achievements): boolean`; achievement `longestday-read`.

- [ ] **Step 1: Write failing tests.** New `src/themes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { THEMES, themeById, canUnlockTheme } from './themes';

describe('themes — achievement-gated palette', () => {
  it('decrypted palette is achievement-gated, unlocked only by longestday-read', () => {
    const d = themeById('decrypted');
    expect(d.id).toBe('decrypted');
    expect(d.unlockAch).toBe('longestday-read');
    expect(canUnlockTheme(d, 999999, [])).toBe(false);          // shards never unlock it
    expect(canUnlockTheme(d, 0, ['longestday-read'])).toBe(true);
  });
  it('shard themes still unlock by shards', () => {
    const neon = themeById('neon');
    expect(canUnlockTheme(neon, 0, [])).toBe(true); // 0-cost
  });
});
```

Append to `src/achievements.test.ts` inside the meta block:

```ts
    expect(m({ masterFrac: 1 })).toContain('longestday-read');
    expect(m({ masterFrac: 0.99 })).not.toContain('longestday-read');
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/themes.test.ts src/achievements.test.ts`.

- [ ] **Step 3: Implement.**
  - `src/trails.ts` — add after the `daybreak` entry:
    ```ts
    // DAWN — the decryption prestige trail: bring the master cipher to 100% (THE LONGEST DAY).
    { id: 'dawn', name: 'DAWN', unlockShards: 0, unlockAch: 'longestday-read', base: '#fde68a', bright: '#fff7cd' },
    ```
  - `src/themes.ts` — add `unlockAch?: string;` to `ThemeDef`; add the theme + the gate fn:
    ```ts
    // DECRYPTED — the gold prestige palette, unlocked only at THE LONGEST DAY (100% decryption).
    { id: 'decrypted', name: 'DECRYPTED', unlockShards: 0, unlockAch: 'longestday-read', accent: '#fde047', accent2: '#fff7cd', nebula: ['#2a2410', '#241c08', '#1a1404'] },
    ```
    ```ts
    /** Is the gating met to unlock this theme? Achievement-gated themes need the achievement
     *  (and are otherwise free); shard themes need enough shards. Mirrors canUnlockTrail. */
    export function canUnlockTheme(def: ThemeDef, shards: number, achievements: string[]): boolean {
      if (def.unlockAch) return achievements.includes(def.unlockAch);
      return shards >= def.unlockShards;
    }
    ```
  - `src/achievements.ts` — add to `BASE_ACHIEVEMENTS` after `mastercipher`:
    ```ts
    { id: 'longestday-read', name: 'The Longest Day, Read', desc: 'Decrypt every word — reach 100% master cipher.', check: (c) => (c.masterFrac ?? 0) >= 1 },
    ```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/themes.test.ts src/achievements.test.ts`.

- [ ] **Step 5: Commit** — `feat(lancefall): DAWN trail + DECRYPTED palette + longestday-read achievement (data)`

### Task A3: `grantLongestDayRewards` (pure) + tests

**Files:**
- Create: `src/longestDay.ts`
- Test: `src/longestDay.test.ts`

**Interfaces:**
- Consumes: `isLongestDay` (A1); trail `dawn`, theme `decrypted`, achievement `longestday-read` (A2); `SHIP_SKINS`/`shipSkinKey` (`shipSkins.ts`); the ship roster.
- Produces: `grantLongestDayRewards(save: SaveData): string[]` — newly granted ids; idempotent; safe to call any time.

- [ ] **Step 1: Write failing test** — `src/longestDay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';
import { grantLongestDayRewards } from './longestDay';
import { SHIPS } from './ships';

describe('grantLongestDayRewards', () => {
  it('grants nothing until 100%', () => {
    const s = defaultSave();
    expect(grantLongestDayRewards(s)).toEqual([]);
    expect(s.unlockedTrails).not.toContain('dawn');
  });
  it('at 100% grants trail+palette+achievement+lastkey for every ship, once', () => {
    const s = defaultSave();
    s.decryptedWords = [...vocabulary()];
    const granted = grantLongestDayRewards(s);
    expect(granted.length).toBeGreaterThan(0);
    expect(s.unlockedTrails).toContain('dawn');
    expect(s.unlockedThemes).toContain('decrypted');
    expect(s.achievements).toContain('longestday-read');
    for (const ship of SHIPS) expect(s.unlockedShipSkins).toContain(`${ship.id}:lastkey`);
    // idempotent: a second call grants nothing new
    expect(grantLongestDayRewards(s)).toEqual([]);
  });
});
```

(Confirm the ship roster export name first — `grep -n "export const SHIPS\|export interface Ship" src/ships.ts`. If it differs, use the real name in both the test and impl.)

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/longestDay.test.ts`.

- [ ] **Step 3: Implement** `src/longestDay.ts`:

```ts
// src/longestDay.ts — THE LONGEST DAY reward grant. Pure + save-side (no rng, no sim).
// Fired when the master cipher hits 100%; idempotent (only pushes ids not already owned).
import type { SaveData } from './save';
import { isLongestDay } from './intercepts';
import { SHIPS } from './ships';
import { shipSkinKey } from './shipSkins';

export function grantLongestDayRewards(save: SaveData): string[] {
  if (!isLongestDay(save)) return [];
  const granted: string[] = [];
  const add = (arr: string[], id: string, tag: string) => {
    if (!arr.includes(id)) { arr.push(id); granted.push(tag); }
  };
  add(save.achievements, 'longestday-read', 'ach:longestday-read');
  add(save.unlockedTrails, 'dawn', 'trail:dawn');
  add(save.unlockedThemes, 'decrypted', 'theme:decrypted');
  for (const ship of SHIPS) add(save.unlockedShipSkins, shipSkinKey(ship.id, 'lastkey'), `skin:${ship.id}:lastkey`);
  return granted;
}
```

- [ ] **Step 4: Run, expect PASS.** Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(lancefall): grantLongestDayRewards — idempotent 100% reward grant (pure)`

### Task A4: `lastkey` ship-skin set (render + registry)

**Files:**
- Modify: `src/shipSkins.ts` (add `lastkey` to `SHIP_SKINS` + a `drawLastKey` + register in `DRAW`)
- Test: `src/shipSkins.test.ts` (registry assertions only — drawing is visual)

**Interfaces:**
- Consumes: existing pure draw helpers in `shipSkins.ts` (`outline`, `glyphRing`, `edgeBeads`, `lightPass`, `rimStroke`, `modelFor`, `rgba`).
- Produces: `SHIP_SKINS` entry `{ id:'lastkey', unlockAch:'longestday-read', names:{...6 ships} }`; `DRAW.lastkey`.

- [ ] **Step 1: Write failing test** — append to `src/shipSkins.test.ts` (create if absent):

```ts
import { describe, it, expect } from 'vitest';
import { SHIP_SKINS, shipSkinById, canUnlockShipSkin, shipSkinName } from './shipSkins';

describe('lastkey ship skin', () => {
  it('is registered, achievement-gated by longestday-read, and named per ship', () => {
    const def = shipSkinById('lastkey')!;
    expect(def).toBeTruthy();
    expect(def.unlockAch).toBe('longestday-read');
    expect(canUnlockShipSkin(def, 0, [])).toBe(false);
    expect(canUnlockShipSkin(def, 0, ['longestday-read'])).toBe(true);
    expect(shipSkinName('lance', 'lastkey')).not.toBe('');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Add to `SHIP_SKINS`:

```ts
  {
    id: 'lastkey', name: 'THE LAST KEY', tag: 'the longest day, read', unlockShards: 0, unlockAch: 'longestday-read',
    names: { lance: 'DECIPHER', glaive: 'CLEARTEXT', bastion: 'KEYVAULT', tempest: 'PLAINSONG', phantom: 'REVEAL', reaver: 'LASTWORD' },
  },
```

Add a `drawLastKey(ctx, m, id, s, T, rm, silh)` composed from existing helpers — identity: **decrypted gold core + resolved cyan glyph-ring** (the cipher, read). Reuse `drawFirstLight`'s bloom structure with a gold→cyan palette and a fully-lit `glyphRing` (litFrac 1.0 = every glyph resolved). Register `lastkey: drawLastKey` in `DRAW`. This is a VISUAL task — verify in Task A6's preview, iterate the palette until it reads as "the cipher, fully decrypted, gold."

- [ ] **Step 4: Run, expect PASS** (registry test) + `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(lancefall): THE LAST KEY ship-skin set (lastkey) — render + registry`

### Task A5: Wire the grant + palette gating into game/UI

**Files:**
- Modify: `src/game.ts` (`evalMetaAchievements` ~L3326-3350: call `grantLongestDayRewards`; `unlockTheme` ~L1224-1238: gate via `canUnlockTheme`)
- Modify: `src/ui.ts` (theme picker ~L2838-2875: show `★ ACHIEVEMENT` for ach-gated themes; `unlockedThemes` check already present)

**Interfaces:**
- Consumes: `grantLongestDayRewards` (A3), `canUnlockTheme` (A2).

- [ ] **Step 1: impact** — `impact({target:'evalMetaAchievements'})` and `impact({target:'unlockTheme'})`; report blast radius. Proceed if ≤MEDIUM.

- [ ] **Step 2:** In `game.ts` `evalMetaAchievements`, after the `for (const a of newAch)` loop, add:

```ts
    // THE LONGEST DAY — grant the 100% reward stack the moment the master cipher completes.
    for (const g of grantLongestDayRewards(this.save)) {
      if (g === 'trail:dawn') this.ui.toast('DAWN trail unlocked!');
      if (g === 'theme:decrypted') this.ui.toast('DECRYPTED palette unlocked!');
      if (g.startsWith('skin:lance:')) this.ui.toast('THE LAST KEY skins unlocked!');
    }
```

Add the import: `import { grantLongestDayRewards } from './longestDay';`

- [ ] **Step 3:** In `game.ts` `unlockTheme`, replace the shard-only gate with `canUnlockTheme(theme, this.save.shards, this.save.achievements)` and only subtract shards when `!theme.unlockAch` (mirror `unlockTrail` exactly). Import `canUnlockTheme`.

- [ ] **Step 4:** In `ui.ts` theme picker, mirror the trail picker's star logic:

```ts
const star = !!theme.unlockAch;
st.textContent = selected ? 'EQUIPPED' : unlocked ? 'tap to equip' : (star ? '★ ACHIEVEMENT' : `◆ ${theme.unlockShards.toLocaleString()}`);
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit && npx vitest run`. `detect_changes()`. Then content-filtered commit of only these hunks — `feat(lancefall): wire LONGEST DAY rewards + achievement-gated DECRYPTED palette`

### Task A6: Visual verification (Part A)

- [ ] Build + minified preview (`vite preview`, port 4350). Fund a 100% save: `localStorage.setItem('lancefall.save', JSON.stringify({version:8, decryptedWords:/* full vocab via console */, stillpointFragments:[]}))` — or in console set `decryptedWords` to the full `vocabulary()` then reload.
- [ ] Open THE BOMBE: confirm THE LAST TRANSMISSION (XIV) is revealed + gold; the reward toasts fired; `dawn` trail, `decrypted` palette, and `lastkey` skins appear unlocked in CUSTOMIZE/SKINS; equip the `lastkey` skin and confirm it renders as a decrypted-gold hull. Screenshot.
- [ ] Re-check reduce-motion (skin calm, no spin). Commit any palette tweaks to `drawLastKey`.

---

# PART B — Decryption Intel (the real run advantage)

### Task B1: `intel.ts` pure module + tests

**Files:**
- Create: `src/intel.ts`
- Test: `src/intel.test.ts`

**Interfaces:**
- Consumes: `INTERCEPTS`, `isInterceptComplete` (`intercepts.ts`); `EnemyKind` (`types.ts`).
- Produces: `BOSS_TRANSMISSION: Partial<Record<EnemyKind,string>>`; `INTEL_DAMAGE = 0.12`; `INTEL_TELL = 0.25`; `bossIntel(save, kind): { decrypted: boolean; damageBonus: number; tellBonus: number }`.

- [ ] **Step 1: Write failing test** — `src/intel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords } from './intercepts';
import { bossIntel, BOSS_TRANSMISSION, INTEL_DAMAGE, INTEL_TELL } from './intel';

function decryptIntercept(save: ReturnType<typeof defaultSave>, id: string) {
  const ic = INTERCEPTS.find((i) => i.id === id)!;
  save.decryptedWords.push(...interceptWords(ic));
}

describe('bossIntel', () => {
  it('zero bonuses until the boss transmission is fully decrypted', () => {
    const s = defaultSave();
    const r = bossIntel(s, 'warden');
    expect(r.decrypted).toBe(false);
    expect(r.damageBonus).toBe(0);
    expect(r.tellBonus).toBe(0);
  });
  it('grants the fixed bonuses once the mapped transmission is complete', () => {
    const s = defaultSave();
    decryptIntercept(s, BOSS_TRANSMISSION.warden!);
    const r = bossIntel(s, 'warden');
    expect(r.decrypted).toBe(true);
    expect(r.damageBonus).toBe(INTEL_DAMAGE);
    expect(r.tellBonus).toBe(INTEL_TELL);
  });
  it('maps all six bosses to a real transmission id', () => {
    for (const id of Object.values(BOSS_TRANSMISSION)) {
      expect(INTERCEPTS.some((i) => i.id === id)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/intel.ts`:

```ts
// src/intel.ts — DECRYPTION INTEL. Fully decrypting a boss's transmission grants a real run
// advantage vs THAT boss: +damage and a tell-readability emphasis. PURE save read (no rng, no
// sim). The CALLER applies the effect ONLY in non-seeded modes (seeded Daily/Weekly stay
// bit-identical for everyone) — this module just reports the numbers.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, isInterceptComplete } from './intercepts';

export const BOSS_TRANSMISSION: Partial<Record<EnemyKind, string>> = {
  warden: 'int-warden', weaver: 'int-weaver', beacon: 'int-beacon',
  mirrorblade: 'int-mirror', hollow: 'int-hollow', sovereign: 'int-crown',
};

export const INTEL_DAMAGE = 0.12; // +12% damage vs a decrypted boss
export const INTEL_TELL = 0.25;   // telegraph reads ~25% earlier/stronger (render-side)

export interface BossIntel { decrypted: boolean; damageBonus: number; tellBonus: number; }

export function bossIntel(save: SaveData, kind: EnemyKind): BossIntel {
  const id = BOSS_TRANSMISSION[kind];
  const ic = id ? INTERCEPTS.find((i) => i.id === id) : undefined;
  const decrypted = !!ic && isInterceptComplete(save, ic);
  return {
    decrypted,
    damageBonus: decrypted ? INTEL_DAMAGE : 0,
    tellBonus: decrypted ? INTEL_TELL : 0,
  };
}
```

(`int-crown` etc. must match the real `INTERCEPTS` ids — confirmed in `intercepts.ts`.)

- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(lancefall): intel.ts — per-boss decryption Intel (pure, seeded-safe by contract)`

### Task B2: Apply the damage bonus (seeded-gated)

**Files:**
- Modify: `src/game.ts` `damageEnemy` (~L2219-2241, `e.hp -= dmg` at L2227)

- [ ] **Step 1: impact** — `impact({target:'damageEnemy'})`; report blast radius (it's hit by `resolveDashHits`/`resolveGhostHits`). Warn if HIGH.
- [ ] **Step 2:** In `damageEnemy`, immediately before `e.hp -= dmg;`:

```ts
    // DECRYPTION INTEL — +damage vs a boss whose transmission you've decrypted. Non-seeded only
    // (seeded Daily/Weekly untouched). No rng → determinism preserved.
    if (e.isBoss && !modeSeeded(this.mode)) {
      const intel = bossIntel(this.save, e.kind);
      if (intel.damageBonus) dmg *= 1 + intel.damageBonus;
    }
```

Add import: `import { bossIntel } from './intel';` (and confirm `modeSeeded` is imported — it is, from `./modes`).

- [ ] **Step 3: Test (determinism guard).** Add to a determinism test (or `src/intel.test.ts`) a note-level assertion that `bossIntel` is pure: calling it does not mutate save. Add:

```ts
  it('is a pure read (does not mutate save)', () => {
    const s = defaultSave();
    const before = JSON.stringify(s);
    bossIntel(s, 'sovereign');
    expect(JSON.stringify(s)).toBe(before);
  });
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx vitest run`. `detect_changes()` (expect only `damageEnemy` + import affected).
- [ ] **Step 5: Commit** — `feat(lancefall): apply Intel damage bonus vs decrypted bosses (non-seeded only)`

### Task B3: Render-side tell emphasis + INTEL card

**Files:**
- Modify: `src/game.ts` (set an `intelActive` flag per boss frame: compute `bossIntel(save,kind).tellBonus>0 && !modeSeeded(mode)`; on boss approach, announce the INTEL card)
- Modify: `src/render/boss.ts` (when the boss is intel-flagged, emphasise the existing `telegraph` value — ramp to full ~`tellBonus` earlier and add a distinct read-ring)

**Interfaces:**
- Consumes: `bossIntel` (B1). Produces: a render flag on the boss enemy (e.g. `e.intelRead?: boolean` on the Enemy type, render-only) OR pass through the world; choose the lowest-blast option during impact.

- [ ] **Step 1: impact** — `impact` on the boss render entry in `src/render/boss.ts` and on the Enemy type if adding a field. Prefer a render-only field flagged each frame in `game.ts` (no sim use).
- [ ] **Step 2:** In `game.ts`, where the boss is updated each frame, set the render flag:

```ts
    // render-only: Intel makes the tell read earlier/brighter (non-seeded only). Never sim.
    boss.intelRead = boss.isBoss && !modeSeeded(this.mode) && bossIntel(this.save, boss.kind).tellBonus > 0;
```

- [ ] **Step 3:** In `src/render/boss.ts`, where `telegraph` drives the tell visual, when `e.intelRead` map the displayed telegraph through an earlier/stronger curve, e.g. `const tg = e.intelRead ? Math.min(1, e.telegraph * (1 + INTEL_TELL)) : e.telegraph;` and add a subtle accent read-ring at `tg > 0`. Import `INTEL_TELL` from `intel.ts`. RENDER-ONLY — never feeds back into sim/`e.telegraph`.
- [ ] **Step 4:** INTEL card on boss approach — in `game.ts` where `narrator.bossApproach` is surfaced, when `bossIntel(save,kind).decrypted` also `this.ui.announce` an "INTEL — <boss>: pattern read" line (in seeded modes show "INTEL — <boss>" without the bonus claim). Render-only.
- [ ] **Step 5: Verify** visually in preview (decrypt a boss transmission, enter that boss in Endless, confirm the tell reads earlier + the INTEL card shows; in Daily it shows the card but no advantage). `npx tsc --noEmit && npx vitest run`. Commit — `feat(lancefall): Intel render — earlier tell read + pre-boss INTEL card`

### Task B4: Richer narrator lines gated by decryption (optional polish)

- [ ] In `game.ts` where `narrator.bossApproach`/`bossKill` are picked, prefer the existing rich line when `bossIntel(save,kind).decrypted`, else a terse default. Pure data choice; no new rng bucket. Commit — `feat(lancefall): decrypted bosses unlock their richer narrator lines`

---

# PART C — Daily Cipher

### Task C1: `dailyCipher.ts` pure module + tests (provably daily)

**Files:**
- Create: `src/dailyCipher.ts`
- Test: `src/dailyCipher.test.ts`

**Interfaces:**
- Consumes: `seedFromDate`, `dateString` (`rng.ts`); a curated phrase pool (in-module).
- Produces: `dailyCipher(daySeed?: number): { kind: 'caesar'|'substitution'|'vigenere'; prompt: string; answer: string; hint: string; plain: string }`; `letterFrequency(text): Record<string,number>`; `checkDailyCipher(daySeed, guess): boolean`; `solveDailyCipher(save, daySeed, guess): { solved: boolean; fragments: number }`; `DAILY_CIPHER_REWARD = 4`.

- [ ] **Step 1: Write failing tests** — `src/dailyCipher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { dailyCipher, checkDailyCipher, solveDailyCipher, letterFrequency, DAILY_CIPHER_REWARD } from './dailyCipher';

describe('dailyCipher — provably daily', () => {
  it('is deterministic for a given day seed', () => {
    expect(dailyCipher(20260620)).toEqual(dailyCipher(20260620));
  });
  it('14 consecutive days produce distinct {kind,prompt,answer} tuples', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 14; d++) {
      const c = dailyCipher(20260620 + d);
      seen.add(`${c.kind}|${c.prompt}|${c.answer}`);
    }
    expect(seen.size).toBe(14); // not a fake-daily generator
  });
  it('every generated cipher round-trips (no unsolvable day)', () => {
    for (let d = 0; d < 40; d++) {
      const seed = 20260601 + d;
      const c = dailyCipher(seed);
      expect(checkDailyCipher(seed, c.answer)).toBe(true);
      expect(c.prompt).not.toBe(c.answer); // it's actually enciphered
    }
  });
  it('letterFrequency counts letters case-insensitively', () => {
    expect(letterFrequency('Abb!')).toEqual({ a: 1, b: 2 });
  });
});

describe('solveDailyCipher', () => {
  it('first correct solve/day grants fragments, then is idempotent', () => {
    const s = defaultSave();
    const c = dailyCipher(20260620);
    const r = solveDailyCipher(s, 20260620, c.answer);
    expect(r.solved).toBe(true);
    expect(r.fragments).toBe(DAILY_CIPHER_REWARD);
    expect(solveDailyCipher(s, 20260620, c.answer).solved).toBe(false); // already solved today
  });
  it('rejects a wrong guess', () => {
    const s = defaultSave();
    expect(solveDailyCipher(s, 20260620, 'nope').solved).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/dailyCipher.ts`. Use the date seed (its own mask) to pick plaintext + kind + key; implement the three ciphers purely. Sketch (fill the pool with ≥30 lore-voice phrases, ALL CAPS A–Z + spaces only so every cipher round-trips):

```ts
// src/dailyCipher.ts — THE DAILY CIPHER. A new cryptogram every calendar day, deterministic
// from seedFromDate() (YYYYMMDD → changes daily) with its OWN mask — never the sim, never a
// shared rng stream. Pure. One solve/day grants Fragments (synthetic dedup'd ids).
import type { SaveData } from './save';
import { seedFromDate, dateString, createRng } from './rng';

export const DAILY_CIPHER_REWARD = 4;

// ≥30 lore-voice phrases — A–Z + spaces only (so every cipher round-trips cleanly).
const POOL: string[] = [
  'BRING BACK THE LIGHT', 'THE CITY REMEMBERS', 'HOLD THE LINE', 'EVERY DASH IS A REFUSAL',
  'READ THE PATTERN AND BREAK IT', 'THE LONGEST DAY STANDS', 'ONE KEY ONE LAST DESCENT',
  'THE GREY GIVES GROUND', 'CATCH THE LIGHT OR LET IT GO', 'THE BELLS DID NOT RING',
  'A WHOLE QUARTER RESOLVES', 'THE CODE IS BROKEN', 'LANCEFALL BLAZES', 'THE DARK HAS NOWHERE TO FALL',
  'THE WEAVER ENCIPHERED THE TRUTH', 'THE BEACON STAYED COLD', 'STRIKE WHEN IT IS REAL',
  'THE CROWN KEPT THE KEY', 'YOU MEANT IT MORE', 'THE SIGNAL TURNS AGAIN', 'DAWN OVER LANCEFALL',
  'THE WARDEN TURNED THE LOCK', 'A DOOR UNGUARDED', 'A KEY NEVER TURNED', 'EVERY NAME EVERY DEBT',
  'THE LIGHT SCRAMBLED TO GREY', 'PROVE THE MOMENT WAS REAL', 'THE LAST MEMORY OF ITSELF',
  'A SMALL MACHINE OF NUMBERS', 'THE PATTERN HOLDS', 'THE THRONE HALL GONE TO GREY',
  'NOTHING HELD ITS SHAPE', 'THE SHIPS NEVER SET OUT',
];

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function caesarShift(text: string, n: number): string {
  return text.replace(/[A-Z]/g, (c) => ALPHA[(ALPHA.indexOf(c) + n + 26) % 26]);
}
function subEncode(text: string, map: string): string {
  return text.replace(/[A-Z]/g, (c) => map[ALPHA.indexOf(c)]);
}
function subDecodeMap(map: string): string {
  const inv = Array(26).fill('A');
  for (let i = 0; i < 26; i++) inv[ALPHA.indexOf(map[i])] = ALPHA[i];
  return inv.join('');
}
function vigenere(text: string, key: string, dir: 1 | -1): string {
  let k = 0;
  return text.replace(/[A-Z]/g, (c) => {
    const shift = ALPHA.indexOf(key[k % key.length]) * dir;
    k++;
    return ALPHA[(ALPHA.indexOf(c) + shift + 26) % 26];
  });
}
function shuffledAlphabet(rng: ReturnType<typeof createRng>): string {
  const a = ALPHA.split('');
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.join('');
}

export interface DailyCipher { kind: 'caesar' | 'substitution' | 'vigenere'; prompt: string; answer: string; hint: string; plain: string; }

export function dailyCipher(daySeed: number = seedFromDate()): DailyCipher {
  const rng = createRng((daySeed ^ 0x3b9aca07) >>> 0); // own mask — never a sim stream
  const plain = POOL[rng.int(0, POOL.length - 1)];
  const kind = (['caesar', 'substitution', 'vigenere'] as const)[rng.int(0, 2)];
  if (kind === 'caesar') {
    const n = rng.int(1, 25);
    return { kind, plain, answer: plain, prompt: caesarShift(plain, n), hint: `A Caesar shift — every letter pushed ${n} forward.` };
  }
  if (kind === 'substitution') {
    const map = shuffledAlphabet(rng);
    return { kind, plain, answer: plain, prompt: subEncode(plain, map), hint: 'A substitution cipher — one letter for another. Try frequency analysis.' };
  }
  const keys = ['KEY', 'LIGHT', 'DAWN', 'CIPHER', 'CROWN', 'SPEAR'];
  const key = keys[rng.int(0, keys.length - 1)];
  return { kind, plain, answer: plain, prompt: vigenere(plain, key, 1), hint: `A Vigenère cipher — a short repeating key word (${key.length} letters).` };
}

export function letterFrequency(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of text.toLowerCase()) if (c >= 'a' && c <= 'z') out[c] = (out[c] ?? 0) + 1;
  return out;
}

function norm(s: string): string { return s.toUpperCase().replace(/[^A-Z]/g, ''); }

export function checkDailyCipher(daySeed: number, guess: string): boolean {
  return norm(guess) === norm(dailyCipher(daySeed).answer);
}

export function solveDailyCipher(save: SaveData, daySeed: number, guess: string): { solved: boolean; fragments: number } {
  const day = dateStringFromSeed(daySeed);
  if (save.solvedDailyCiphers.includes(day)) return { solved: false, fragments: 0 };
  if (!checkDailyCipher(daySeed, guess)) return { solved: false, fragments: 0 };
  save.solvedDailyCiphers.push(day);
  for (let i = 0; i < DAILY_CIPHER_REWARD; i++) {
    const fid = `daily-cipher:${day}#${i}`;
    if (!save.stillpointFragments.includes(fid)) save.stillpointFragments.push(fid);
  }
  return { solved: true, fragments: DAILY_CIPHER_REWARD };
}

// daySeed is YYYYMMDD → 'YYYY-MM-DD'
function dateStringFromSeed(seed: number): string {
  const y = Math.floor(seed / 10000), m = Math.floor((seed % 10000) / 100), d = seed % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
```

> Note: `solvedDailyCiphers` is added to save in Task C2 — write C2 first if running strictly TDD, or stub the field. Recommended order: **C2 then C1's impl**. (Test file C1 can be written first; it imports the field via `defaultSave`.)

- [ ] **Step 4: Run, expect PASS** (after C2 adds the save field) + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(lancefall): dailyCipher.ts — deterministic provably-daily cryptogram (pure)`

### Task C2: `solvedDailyCiphers` save field + migration sanitize

**Files:**
- Modify: `src/save.ts` (interface + `defaultSave`), `src/migrate.ts` (sanitize like `taught`)
- Test: `src/migrate.test.ts`

- [ ] **Step 1:** Add to `SaveData` (after the BOMBE block): `/** YYYY-MM-DD days whose daily cipher is solved (once each, additive). */ solvedDailyCiphers: string[];` and to `defaultSave()`: `solvedDailyCiphers: [],`.
- [ ] **Step 2:** In `migrate.ts`, sanitize: `out.solvedDailyCiphers = sanitizeTaught(out.solvedDailyCiphers);` (reuse the existing string-array sanitizer; confirm its name).
- [ ] **Step 3:** Add a migrate test asserting a save lacking the field loads with `solvedDailyCiphers: []` and a malformed value is coerced to `[]`. Run, expect PASS.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run`.
- [ ] **Step 5: Commit** — `feat(lancefall): save.solvedDailyCiphers (additive, no version bump)`

### Task C3: Daily-cipher host callbacks + nav/share

**Files:**
- Modify: `src/game.ts` (a `solveDailyCipher` callback + reward toast + `evalMetaAchievements` re-eval; a share method reusing `buildShareString`)
- Modify: `src/ui.ts` (pass a `onSolveDailyCipher` dep + `onShareDailyCipher` to the panel)

- [ ] Wire `onSolveDailyCipher(guess)` → call `solveDailyCipher(this.save, seedFromDate(), guess)`, toast the reward, `saveSave`, re-open the panel; `onShareDailyCipher()` → `buildShareString`-style string for "daily cipher <date> solved" → clipboard (mirror `copyScore` at game.ts ~L1406). Commit — `feat(lancefall): daily-cipher host callbacks + share`

### Task C4: Daily-cipher console UI block

**Files:**
- Modify: `src/panels/bombe.ts` (add a "DAILY CIPHER" block above the static puzzles — ciphertext, freq strip, input+SOLVE, solved state, SHARE). **Polish-agent-owned file — coordinate; keep the hunk isolated.**
- Modify: `src/style.css` (append `.bombe-daily-*` styles at file end)

- [ ] Add the block + deps to `BombePanelDeps` (`onSolveDailyCipher`, `onShareDailyCipher`). Reuse `.bombe-pz-*` styling where possible; add a compact `.bombe-freq` letter-count strip. Verify in preview. Content-filtered commit — `feat(lancefall): DAILY CIPHER console block + styles`

### Task C5: Visual verification (Part C)

- [ ] Preview: open THE BOMBE, see today's cipher; solve it (use `dailyCipher(seedFromDate()).answer` from console to test), confirm Fragments granted + solved state + SHARE copies a dated string; reload → still solved; confirm the freq helper renders. Screenshot. reduce-motion clean.

---

# PART D — Bombe branches + boss-drop faucet

> **Highest blast radius.** Do `impact` on each Bombe symbol first. Keep `bombeLevel` as a synced derived total so all ~15 existing read-sites keep working.

### Task D1: `bombeBranches` save field + migration + sanitizer

**Files:**
- Modify: `src/save.ts` (interface + default), `src/migrate.ts` (seed from `bombeLevel` + sanitize)
- Test: `src/migrate.test.ts`

- [ ] **Step 1:** Add `bombeBranches: { thrift: number; speed: number; insight: number };` to `SaveData`; default `{ thrift: 0, speed: 0, insight: 0 }`.
- [ ] **Step 2:** In `migrate.ts`, after the generic loop, seed + sanitize:

```ts
  // v8 additive — BOMBE BRANCHING. Seed the three branches from the legacy bombeLevel (no
  // progress lost); keep bombeLevel as the synced derived total. No version bump.
  {
    const b = (out.bombeBranches ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    let branches = { thrift: num(b.thrift), speed: num(b.speed), insight: num(b.insight) };
    if (branches.thrift + branches.speed + branches.insight === 0 && (out.bombeLevel ?? 0) > 0) {
      const lvl = out.bombeLevel; // legacy ladder → thrift+speed split
      branches = { thrift: Math.ceil(lvl / 2), speed: Math.floor(lvl / 2), insight: 0 };
    }
    out.bombeBranches = branches;
    out.bombeLevel = branches.thrift + branches.speed + branches.insight;
  }
```

- [ ] **Step 3:** Migrate test: a legacy save with `bombeLevel:3, bombeBranches` absent → loads `{thrift:2,speed:1,insight:0}` and `bombeLevel:3`. Run, expect PASS.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run`.
- [ ] **Step 5: Commit** — `feat(lancefall): save.bombeBranches + migration seeds from legacy bombeLevel`

### Task D2: Branch-aware bombe.ts (back-compat signatures)

**Files:**
- Modify: `src/bombe.ts`
- Test: `src/bombe.test.ts`

**Interfaces:**
- Produces: `BRANCH_MAX = 3`; `bombeTotal(save): number`; `upgradeBombeBranch(save, branch): boolean`; `upgradeBranchCost(level): number`; INSIGHT-aware `runBombe`. Keep `bombeCostMul(level)`/`bombeAutoCracks(level)`/`upgradeBombeCost(level)` signatures intact (driven by the relevant branch level passed by callers).

- [ ] **Step 1: impact** — `impact({target:'bombeCostMul'})`, `bombeAutoCracks`, `upgradeBombe`, `upgradeBombeCost`. Report blast radius.
- [ ] **Step 2: Write failing tests** — `src/bombe.test.ts`: thrift drives `bombeCostMul(save.bombeBranches.thrift)`; speed drives auto-cracks; `upgradeBombeBranch(save,'insight')` raises insight + bumps `bombeLevel`; INSIGHT `runBombe` prioritises key/rare words; each branch caps at `BRANCH_MAX`.
- [ ] **Step 3: Implement.** Keep the level-param helpers; add branch upgraders + an INSIGHT-aware crack:
  - `upgradeBombeBranch(save, branch)`: cost `upgradeBranchCost(save.bombeBranches[branch])`, cap `BRANCH_MAX`, on success bump that branch + `save.bombeLevel = sum`.
  - INSIGHT crack: when `save.bombeBranches.insight > 0`, `crackCheapestFree` sorts by `wordRarity` rank (key>rare>common) before cost.
  - Daily free key-word crack (INSIGHT): a dedup'd `insight-daily:<date>` synthetic crack — gated `!modeSeeded` is N/A here (meta, no run); dedup by date keeps it once/day.
- [ ] **Step 4: Run, expect PASS** + `npx tsc --noEmit && npx vitest run` (full — catches any broken caller).
- [ ] **Step 5: Commit** — `feat(lancefall): branch-aware THE BOMBE (THRIFT/SPEED/INSIGHT) with back-compat helpers`

### Task D3: Branch upgrade UI (panel)

**Files:**
- Modify: `src/panels/bombe.ts` (three branch upgrade controls instead of the single button) — **polish-agent-owned; coordinate, minimal isolated hunk**
- Modify: `src/ui.ts` (deps: `onUpgradeBombe(branch)`), `src/game.ts` (callback → `upgradeBombeBranch`)
- Modify: `src/style.css` (append `.bombe-branch-*`)

- [ ] Replace the single BUILD/UPGRADE button with three labelled branch controls (THRIFT/SPEED/INSIGHT) showing level/cost; wire each to `onUpgradeBombe(branch)`. Keep the machine + status readout. Verify in preview. Content-filtered commits per file — `feat(lancefall): THE BOMBE branch upgrade UI`

### Task D4: Boss-drop encrypted-fragment faucet

**Files:**
- Modify: `src/stillpoint.ts` `fragmentsForRun` (add `enc-frag:<runOrdinal>:<n>` per boss felled)
- Test: `src/stillpoint.test.ts`

- [ ] **Step 1: Write failing test** — `fragmentsForRun({runOrdinal:5, bossKills:2, ...})` includes `enc-frag:5:0` and `enc-frag:5:1`; `bossKills:0` adds none.
- [ ] **Step 2:** Implement the loop (per the recon excerpt). The game.ts call site (L3143-3151) needs no change — it pushes all returned ids.
- [ ] **Step 3: Run, expect PASS.**
- [ ] **Step 4:** `npx vitest run`.
- [ ] **Step 5: Commit** — `feat(lancefall): boss-drop encrypted-fragment faucet (one per boss felled)`

### Task D5: Surface encrypted-fragment inflow + INSIGHT readout

**Files:**
- Modify: `src/panels/bombe.ts` status/overnight area (show "+N encrypted fragments from the last descent") + INSIGHT daily-crack note. Minimal isolated hunk.

- [ ] Reflect the new faucet + INSIGHT daily crack in the console readout. Verify in preview. Commit — `feat(lancefall): console readout for encrypted-fragment inflow + INSIGHT`

### Task D6: Full verification (Part D)

- [ ] `npx tsc --noEmit && npx vitest run` (all green). `detect_changes({scope:'compare', base_ref:'main'})` for a regression sweep.
- [ ] Preview: build the three branches, confirm THRIFT lowers cost, SPEED raises overnight cracks, INSIGHT cracks key words first + the daily key-word; fell a boss in a run and confirm encrypted fragments arrive. Screenshot.

---

# Final integration pass

- [ ] Full `npx tsc --noEmit && npx vitest run` (≥1193 + all new tests green).
- [ ] Minified `vite preview` boot clean (no console errors); walk A→D once end-to-end.
- [ ] `detect_changes({scope:'compare', base_ref:'main'})` — confirm only expected symbols/flows changed; warn on anything unexpected.
- [ ] Deploy ONLY on the owner's explicit OK (`npm run deploy` → lancefall.pages.dev).

## Self-review notes (coverage)
- Spec Feature A → Tasks A1–A6 (transmission, cosmetics, grant, skin, wiring, verify). ✓
- Spec Feature B → Tasks B1–B4 (intel module, damage, render tell + card, narrator). Readability realized render-side (spec-blessed). ✓
- Spec Feature C → Tasks C1–C5 (module, save field, callbacks, UI, verify); provably-daily tests included. ✓
- Spec Feature D → Tasks D1–D6 (save+migration, branch logic, UI, faucet, readout, verify). ✓
- Determinism gate (`!modeSeeded`) on every per-save sim effect (B2, B3). ✓
- No SAVE_VERSION bump; additive + sanitized fields. ✓
