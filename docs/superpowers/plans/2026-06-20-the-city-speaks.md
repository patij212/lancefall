# THE CITY SPEAKS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise lancefall's narrative *delivery* to match its writing — wake the city through play (deed-wake), surface it (dosed ceremony + toasts + debrief), frame it (premise card + captioned COHERENCE), inhabit the biomes, personify the long game, fix four voice slips, and give the Vigil mechanical weight (a rising Heat floor).

**Architecture:** A new pure `src/cityVoice.ts` owns the delivery logic (deed→citizen map, the dose, `vigilHeatFloor`, the personified composers). `citizens.isCitizenWoken` ORs a new persisted `citizenDeeds` set. `game.ts` evaluates deeds at key moments and fires beats; `narrator.ts` gains biome/descent pools + a biome-keyed `bossApproach` + the voice-slip fixes; `ui.ts` renders the "A FACE REMEMBERED" beat, the premise card, the debrief line, the Heat-pip floor, and the personified Vigil line. Save v9→10 (additive). Nothing draws `world.rng`; the vigil floor is non-seeded only.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Canvas 2D / DOM UI. No new deps.

## Global Constraints

- **Re-narrate, don't re-engineer.** No system renames; the Heat ladder (MAX_HEAT=7, the 8 levels) is unchanged — the vigil only raises the *floor*. Source: spec §H.
- **Add delivery, not lore.** The only new authoring: the §A surfacing copy, the §C biome/descent lines, the keyed bossApproach located lines, the §D personified templates, and the §E fixes — all terse second-person noir, restraint, Turing diegetic. Source: spec §H.
- **Seeded determinism bit-identical.** No `world.rng` draw added/removed; deed checks read run-stats, never draw; new save fields are meta-only; the **vigil Heat floor applies to non-seeded modes only** (`modeSeeded(cfg)` gate, mirroring NG+). `vocabulary()` unchanged. `src/cityVoice.ts` MUST NOT import `./rng`. Source: spec §F, §G.
- **a11y:** the "A FACE REMEMBERED" beat + premise card route through `reduceMotion`/`reduceFlashing`/`clarity` (calm fade, soft glow, no strobe), keyboard-skippable; ambient beats keep the existing cooldown; **nothing fires during a clutch/last-breath moment** (the wake beat queues). Source: spec §G.
- **The dose is the contract:** only the 8 meaningful wakes (the 6 figure-tied + the Candle-Maker + the Weaver) get the ceremony; everything else is a toast. Source: spec §2, §A.2.
- **Per-commit gate:** `npx tsc --noEmit` + `npx vitest run` (current baseline + new) + `npx vite build`; prod boot via `npx vite preview` (UI verified via the `__lf` dev hook / Playwright).
- **GitNexus:** `impact` before editing `isCitizenWoken`, `setHeat`, `migrateSave`, `bossDeath`, `descend`, `refreshCoherence`; `detect_changes` before each commit.

## Key APIs (from the codebase, verbatim)
- `narrate(bucket: string, surface: 'toast'|'announce', pool: readonly string[], ambient=false)` and `narrateOne(surface, line: string|undefined)` — `game.ts:1019/1029`.
- `biomeAt(time): {biome, index}` cycles every 70s, indices 0–5: 0 COURT, 1 EMBERWALL, 2 VAULTS, 3 BLOOMGARDENS, 4 WARRENS, 5 NULL. So **biome k is reached ⟺ run time ≥ k×70s** (no extra tracking needed).
- `isCitizenWoken(save, c)` — `citizens.ts:214` (decryption/milestone derived; pure).
- World run-stats available: `bossKills`, `sovereignDown`, `killsByKind` (per EnemyKind), `bestComboRun`, `combo`, `overdriveUses` (= DAYBREAK fires), `maxDashChain`, `grazeCount`, `time`, plus `director.wave`.
- `modeSeeded(cfg): boolean` — `modes.ts:161` (`seedKind` is `'date'`/`'week'` → seeded).
- `daysHeld(save)` / `canRelease(save)` — `ending.ts` (the Vigil state, shipped).
- `cityCoherenceTagline(frac)` — `cityCoherence.ts:32`; `paintHeatPips(level)` — `ui.ts:1588`; `descend(cfg)` sandbox gate — `game.ts:423`; `echoLine(seed)` — `stillpoint.ts:44`; daily-echo surface — `game.ts:939`.

---

## The 16 deeds (authored — every one derives from a tracked stat)

| Citizen id | Deed (predicate over run-stats) | Ceremony? |
|---|---|---|
| `gatewarden` | killed `warden` | ✦ |
| `chorister` | killed `weaver` | ✦ |
| `ferryman` | killed `beacon` | ✦ |
| `glassblower` | killed `mirrorblade` | ✦ |
| `stonemason` | killed `hollow` | ✦ |
| `courier` | killed `sovereign` | ✦ |
| `candlemaker` | best combo ≥ 25 | ✦ |
| `weaver-cloth` | bossKills ≥ 3 in the run | ✦ |
| `lamplighter` | best combo ≥ 10 (the first window lights) | toast |
| `bellringer` | survived ≥ 90s | toast |
| `archivist` | reached wave ≥ 8 | toast |
| `clockwright` | maxDashChain ≥ 4 (the mechanism aligned) | toast |
| `cartographer` | reached wave ≥ 12 (mapped far) | toast |
| `stargazer` | fired DAYBREAK (overdriveUses ≥ 1) | toast |
| `gardener` | run time ≥ 210s (reached the Bloomgardens) | toast |
| `vintner` | killed `sovereign` (the longest day) | toast |

(✦ = the 8 meaningful wakes that get the "A FACE REMEMBERED" beat. The Vintner + Courier both wake on the Sovereign kill — a deliberate double moment, Courier ceremony + Vintner toast.)

---

## PHASE 1 — Pure core (TDD)

### Task 1: `cityVoice.ts` — the deed map + evaluator

**Files:** Create `src/cityVoice.ts`, `src/cityVoice.test.ts`.

**Interfaces — Produces:**
- `export interface RunDeedCtx { bossKindsKilled: string[]; sovereignDown: boolean; bestCombo: number; bossKills: number; daybreaks: number; maxDashChain: number; timeSec: number; wave: number }`
- `export function deedsMet(ctx: RunDeedCtx): string[]` — the citizen ids whose deed `ctx` satisfies.

- [ ] **Step 1: failing test** — `src/cityVoice.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { deedsMet, type RunDeedCtx } from './cityVoice';

const EMPTY: RunDeedCtx = { bossKindsKilled: [], sovereignDown: false, bestCombo: 0, bossKills: 0, daybreaks: 0, maxDashChain: 0, timeSec: 0, wave: 0 };

describe('deedsMet — citizens wake through play', () => {
  it('no deeds met on an empty run', () => {
    expect(deedsMet(EMPTY)).toEqual([]);
  });
  it('felling a figure wakes its citizen', () => {
    expect(deedsMet({ ...EMPTY, bossKindsKilled: ['warden'] })).toContain('gatewarden');
    expect(deedsMet({ ...EMPTY, bossKindsKilled: ['beacon'] })).toContain('ferryman');
  });
  it('the Sovereign kill wakes BOTH the Courier and the Vintner', () => {
    const got = deedsMet({ ...EMPTY, bossKindsKilled: ['sovereign'], sovereignDown: true });
    expect(got).toContain('courier');
    expect(got).toContain('vintner');
  });
  it('combo milestones wake the lamplighter (x10) then the candle-maker (x25)', () => {
    expect(deedsMet({ ...EMPTY, bestCombo: 12 })).toEqual(['lamplighter']);
    expect(deedsMet({ ...EMPTY, bestCombo: 26 })).toEqual(expect.arrayContaining(['lamplighter', 'candlemaker']));
  });
  it('depth/time/skill deeds', () => {
    expect(deedsMet({ ...EMPTY, wave: 8 })).toContain('archivist');
    expect(deedsMet({ ...EMPTY, wave: 12 })).toEqual(expect.arrayContaining(['archivist', 'cartographer']));
    expect(deedsMet({ ...EMPTY, timeSec: 95 })).toContain('bellringer');
    expect(deedsMet({ ...EMPTY, timeSec: 215 })).toEqual(expect.arrayContaining(['bellringer', 'gardener']));
    expect(deedsMet({ ...EMPTY, maxDashChain: 4 })).toContain('clockwright');
    expect(deedsMet({ ...EMPTY, daybreaks: 1 })).toContain('stargazer');
    expect(deedsMet({ ...EMPTY, bossKills: 3 })).toContain('weaver-cloth');
  });
});
```

- [ ] **Step 2: run, verify fail** — `npx vitest run src/cityVoice.test.ts` → FAIL (no module).

- [ ] **Step 3: implement** — `src/cityVoice.ts`

```typescript
// src/cityVoice.ts — THE CITY SPEAKS. The delivery layer that makes lancefall's authored story
// land on the median path. PURE: no DOM, no ctx, and (determinism invariant) NO './rng' import.
// Citizens wake through PLAY here (deed-wake), in parallel to decryption; the Codebreaker still
// gates the deeper truth. Also: the dose (ceremony vs toast), the Vigil's Heat floor, and the
// personified long-game composers.

/** Run-stats a deed predicate reads. Filled by the caller from World/run state. */
export interface RunDeedCtx {
  bossKindsKilled: string[]; // EnemyKind ids of bosses felled this run
  sovereignDown: boolean;
  bestCombo: number;
  bossKills: number;
  daybreaks: number;     // overdrive/DAYBREAK fires this run
  maxDashChain: number;  // most kills in one dash this run
  timeSec: number;       // elapsed run seconds
  wave: number;          // deepest wave reached
}

/** Each citizen id → the predicate that wakes them through play. Pure. */
const DEEDS: Record<string, (c: RunDeedCtx) => boolean> = {
  // the 6 figure-tied — you meet the person as you fell the keeper they served
  gatewarden:    (c) => c.bossKindsKilled.includes('warden'),
  chorister:     (c) => c.bossKindsKilled.includes('weaver'),
  ferryman:      (c) => c.bossKindsKilled.includes('beacon'),
  glassblower:   (c) => c.bossKindsKilled.includes('mirrorblade'),
  stonemason:    (c) => c.bossKindsKilled.includes('hollow'),
  courier:       (c) => c.bossKindsKilled.includes('sovereign'),
  // the longest day — the Vintner's wine, opened on the Sovereign kill
  vintner:       (c) => c.sovereignDown,
  // the others, on fitting deeds
  lamplighter:   (c) => c.bestCombo >= 10,   // the first window lights
  candlemaker:   (c) => c.bestCombo >= 25,   // light against the dark
  bellringer:    (c) => c.timeSec >= 90,     // the hours kept
  archivist:     (c) => c.wave >= 8,         // the long evening, recorded
  cartographer:  (c) => c.wave >= 12,        // mapped far
  clockwright:   (c) => c.maxDashChain >= 4, // the mechanism aligned
  stargazer:     (c) => c.daybreaks >= 1,    // watched for the dawn
  gardener:      (c) => c.timeSec >= 210,    // reached the Bloomgardens (biome 3 ≥ 3×70s)
  'weaver-cloth':(c) => c.bossKills >= 3,    // the city's colours rewoven
};

export function deedsMet(ctx: RunDeedCtx): string[] {
  return Object.keys(DEEDS).filter((id) => DEEDS[id](ctx));
}
```

- [ ] **Step 4: run, verify pass** — `npx vitest run src/cityVoice.test.ts` → PASS.

- [ ] **Step 5: commit**

```bash
git add src/cityVoice.ts src/cityVoice.test.ts
git commit -m "feat(lancefall): cityVoice deed-wake — citizens wake through play"
```

### Task 2: the dose (ceremony vs toast)

**Files:** Modify `src/cityVoice.ts`, `src/cityVoice.test.ts`.
**Interfaces — Produces:** `export const CEREMONY_CITIZENS: ReadonlySet<string>`; `export function wakeIsCeremony(citizenId: string): boolean`.

- [ ] **Step 1: failing test** (append to `cityVoice.test.ts`)

```typescript
import { wakeIsCeremony } from './cityVoice';
describe('the dose — only the 8 meaningful wakes get the ceremony', () => {
  it('figure-tied + candle-maker + weaver get the ceremony', () => {
    for (const id of ['gatewarden','chorister','ferryman','glassblower','stonemason','courier','candlemaker','weaver-cloth'])
      expect(wakeIsCeremony(id)).toBe(true);
  });
  it('the common wakes are toasts', () => {
    for (const id of ['lamplighter','bellringer','archivist','cartographer','clockwright','stargazer','gardener','vintner'])
      expect(wakeIsCeremony(id)).toBe(false);
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement** (append to `cityVoice.ts`)

```typescript
// The dose: the 6 figure-tied + the 2 milestone citizens get the "A FACE REMEMBERED" ceremony;
// everything else is a restrained toast (restraint preserved for the common case).
export const CEREMONY_CITIZENS: ReadonlySet<string> = new Set([
  'gatewarden', 'chorister', 'ferryman', 'glassblower', 'stonemason', 'courier', 'candlemaker', 'weaver-cloth',
]);
export function wakeIsCeremony(citizenId: string): boolean {
  return CEREMONY_CITIZENS.has(citizenId);
}
```

- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): the dose — ceremony for the 8 meaningful wakes"`

### Task 3: the Vigil's Heat floor

**Files:** Modify `src/cityVoice.ts`, `src/cityVoice.test.ts`.
**Interfaces — Consumes:** `daysHeld(save)` from `./ending`. **Produces:** `export function vigilHeatFloor(save: SaveData): number`.

- [ ] **Step 1: failing test** (append)

```typescript
import { vigilHeatFloor } from './cityVoice';
import { defaultSave } from './save';
function holding(totalRuns: number, vigilSince: number) {
  const s = defaultSave(); s.stillpointChoice = 'catch'; s.totalRuns = totalRuns; s.vigilSince = vigilSince; return s;
}
describe('vigilHeatFloor — holding the light costs more every 5 days', () => {
  it('0 when not holding', () => { expect(vigilHeatFloor(defaultSave())).toBe(0); });
  it('rises by 1 every 5 days held, capped at MAX_HEAT', () => {
    expect(vigilHeatFloor(holding(2, 2))).toBe(0);   // 0 days
    expect(vigilHeatFloor(holding(7, 2))).toBe(1);   // 5 days
    expect(vigilHeatFloor(holding(12, 2))).toBe(2);  // 10 days
    expect(vigilHeatFloor(holding(200, 2))).toBe(7); // capped at MAX_HEAT
  });
  it('resets to 0 once released (no longer catch)', () => {
    const s = holding(50, 2); s.released = true; s.stillpointChoice = 'fall';
    expect(vigilHeatFloor(s)).toBe(0);
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement** (append; add imports at top of `cityVoice.ts`)

```typescript
import type { SaveData } from './save';
import { daysHeld } from './ending';
import { MAX_HEAT } from './heat';
// ...
// THE VIGIL'S WEIGHT — holding the light raises the Heat floor (the dark presses in). Pure read off
// daysHeld; resets to 0 the moment the day is let turn (daysHeld returns 0 when not catch/released).
// The non-seeded gate lives at the call site (game.ts) so the Daily stays bit-identical.
export function vigilHeatFloor(save: SaveData): number {
  return Math.min(MAX_HEAT, Math.floor(daysHeld(save) / 5));
}
```

> NOTE: `daysHeld` already returns 0 unless `stillpointChoice === 'catch' && !released && vigilSince >= 0`, so the reset is free.

- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): vigilHeatFloor — the Vigil's weight (rises every 5 days held)"`

### Task 4: the personified composers

**Files:** Modify `src/cityVoice.ts`, `src/cityVoice.test.ts`.
**Interfaces — Consumes:** `wokenCitizens(save)` + `CITIZENS` from `./citizens`; `echoVignette(daySeed)` from `./stillpoint`. **Produces:** `vigilCitizenName(save): string|null`, `agedEcho(daySeed, totalRuns): string`.

- [ ] **Step 1: failing test** (append)

```typescript
import { vigilCitizenName, agedEcho } from './cityVoice';
import { vocabulary } from './intercepts';
describe('personified long game', () => {
  it('vigilCitizenName returns a woken citizen name, or null if none woken', () => {
    expect(vigilCitizenName(defaultSave())).toBeNull();
    const s = defaultSave(); s.decryptedWords = vocabulary();
    expect(typeof vigilCitizenName(s)).toBe('string');
  });
  it('agedEcho keeps the shared citizen/memory and only deepens the framing by run count', () => {
    const early = agedEcho(1234, 3);
    const mid = agedEcho(1234, 25);
    const vet = agedEcho(1234, 60);
    expect(early.length).toBeGreaterThan(0);
    expect(mid).toMatch(/THE /);          // run 20+ names the citizen
    expect(vet).toMatch(/time/i);          // run 50+ adds "...the Nth time"
    // the same daySeed → the same underlying memory clause in all three
    const clause = agedEcho(1234, 0);
    expect(mid).toContain(clause.replace(/^[A-Z]/, (m) => m.toLowerCase()).split(' ').slice(-3).join(' '));
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement** (append; add imports)

```typescript
import { wokenCitizens } from './citizens';
import { echoVignette } from './stillpoint';
// ...
/** A woken citizen's name to personify the Vigil line ("You hold the light for THE FERRYMAN").
 *  Deterministic pick by daysHeld so it's stable within a vigil-day; null if none woken. */
export function vigilCitizenName(save: SaveData): string | null {
  const woken = wokenCitizens(save);
  if (!woken.length) return null;
  return woken[daysHeld(save) % woken.length].name;
}

/** The Daily Echo, AGED by the player's run count. The shared citizen/memory (keyed by daySeed) is
 *  preserved — only the framing deepens, so everyone still sees the same memory; veterans see it
 *  held more closely. Pure; echoVignette uses its own rng (never the sim stream). */
export function agedEcho(daySeed: number, totalRuns: number): string {
  const v = echoVignette(daySeed);            // { citizen: 'a lamplighter', memory: 'remembers the bells…' }
  const name = 'THE ' + v.citizen.replace(/^(a|an) /, '').toUpperCase();
  if (totalRuns >= 50) return `${name} ${v.memory.replace(/\.$/, '')} — you have stood here ${totalRuns} times.`;
  if (totalRuns >= 20) return `${name} — ${v.memory}`;
  const s = `${v.citizen} ${v.memory}`;        // the original shared line (verbatim shape of echoLine)
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): personified Vigil name + aged Daily Echo"`

### Task 5: save v9→10 — `citizenDeeds` + `seenPremiseCard`

**Files:** Modify `src/save.ts`, `src/migrate.ts`, `src/migrate.test.ts`, `src/cloudMerge.ts`, `src/cloudMerge.test.ts`.
**Interfaces — Produces:** `SaveData` gains `citizenDeeds: string[]` (default `[]`) + `seenPremiseCard: boolean` (default `false`); `SAVE_VERSION === 10`.

- [ ] **Step 1: failing test** (append to `src/migrate.test.ts`)

```typescript
describe('v9 -> v10 (THE CITY SPEAKS)', () => {
  it('default-fills citizenDeeds + seenPremiseCard for a v9 save', () => {
    const out = migrateSave({ version: 9, highScore: 5 }, defaultSave());
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.version).toBe(10);
    expect(out.citizenDeeds).toEqual([]);
    expect(out.seenPremiseCard).toBe(false);
  });
  it('sanitizes a hand-edited citizenDeeds to a deduped string[]', () => {
    const out = migrateSave({ version: 10, citizenDeeds: ['a', 'a', 1, 'b'] }, defaultSave());
    expect(out.citizenDeeds.sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3:** add the fields to `SaveData` (`src/save.ts`, after the v9 vigil fields):

```typescript
  // ── v10 THE CITY SPEAKS — delivery layer. All additive; meta-only (never read in seeded sim). ──
  /** citizen ids woken through in-run deeds (parallel to decryption); see cityVoice.deedsMet. */
  citizenDeeds: string[];
  /** the once-ever premise card has been shown (or skipped) before the first sandbox. */
  seenPremiseCard: boolean;
```

- [ ] **Step 4:** add defaults in `defaultSave()`:

```typescript
    citizenDeeds: [],
    seenPremiseCard: false,
```

- [ ] **Step 5:** bump + sanitize in `src/migrate.ts`: change `SAVE_VERSION = 9` → `10`; after the v9 clamp, add:

```typescript
  // v9 → v10: THE CITY SPEAKS — citizenDeeds (open-ended id set, deduped like `taught`) + the
  //           seenPremiseCard flag. Additive → the generic loader default-fills; this filters the set.
  out.citizenDeeds = sanitizeTaught(out.citizenDeeds);
```

(`sanitizeTaught` already exists in migrate.ts and dedupes a string[]. `seenPremiseCard` is a boolean handled by the generic per-field loop.)

- [ ] **Step 6:** `src/cloudMerge.ts` — add the two fields to `MERGE_CATEGORIES`:

```typescript
  citizenDeeds: 'set', seenPremiseCard: 'latest',
```

and append a coverage assertion to `cloudMerge.test.ts`:

```typescript
  it('merges citizenDeeds as a union (never lose a met deed)', () => {
    const m = mergeSaves(mk({ citizenDeeds: ['gatewarden'] }), mk({ citizenDeeds: ['ferryman'] }), 1, 2);
    expect(new Set(m.citizenDeeds)).toEqual(new Set(['gatewarden', 'ferryman']));
  });
```

- [ ] **Step 7: run** — `npx vitest run src/migrate.test.ts src/cloudMerge.test.ts src/save.test.ts && npx tsc --noEmit` → PASS. (Update any `defaultSave()` snapshot test to include the two fields + version 10.)
- [ ] **Step 8: commit** — `git commit -m "feat(lancefall): SAVE_VERSION 10 — citizenDeeds + seenPremiseCard"`

### Task 6: `isCitizenWoken` ORs the deed set

**Files:** Modify `src/citizens.ts`, `src/citizens.test.ts`.
**Interfaces — Consumes:** `save.citizenDeeds` (Task 5).

- [ ] **Step 1: failing test** (append to `citizens.test.ts`)

```typescript
describe('deed-wake — citizens wake through play, not only decryption', () => {
  it('a citizen whose id is in save.citizenDeeds is woken, even with no decryption', () => {
    const s = defaultSave();
    expect(wokenCitizens(s)).toHaveLength(0);
    s.citizenDeeds = ['gatewarden'];
    expect(wokenCitizens(s).some((c) => c.id === 'gatewarden')).toBe(true);
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3:** in `src/citizens.ts` `isCitizenWoken`, OR the deed set (keep the existing decryption logic):

```typescript
export function isCitizenWoken(save: SaveData, c: Citizen): boolean {
  if (save.citizenDeeds.includes(c.id)) return true; // woken through play (cityVoice deed-wake)
  if (c.wakeBy in MILESTONE_WAKE) return masterProgress(save).frac >= MILESTONE_WAKE[c.wakeBy];
  const ic = INTERCEPTS.find((i) => i.id === c.wakeBy);
  return !!ic && isInterceptComplete(save, ic);
}
```

- [ ] **Step 4: run, verify pass.** (`npx vitest run src/citizens.test.ts`)
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): isCitizenWoken ORs the deed set (wake through play)"`

---

## PHASE 2 — Narrator data + voice slips

### Task 7: narrator pools — biome beats, descent, keyed bossApproach, the 4 voice slips

**Files:** Modify `src/narrator.ts`, `src/narrator.test.ts`.

**Interfaces — Produces:** `NARRATOR.biomeBeat: string[][]` (6 biomes × ≥1 "teach" line), `NARRATOR.biomeLate: string[][]` (6 × ≥1 "boss-nears" line), `NARRATOR.descent: string[]`, and `NARRATOR.bossApproach` restructured to `Partial<Record<EnemyKind,string>>[]` (index 0 = the existing generic lines/fallback; other indices add located lines).

- [ ] **Step 1: failing test** (append to `narrator.test.ts`)

```typescript
describe('THE CITY SPEAKS narrator additions', () => {
  it('has a teach + late beat for all 6 biomes, and NULL warns about graze', () => {
    expect(NARRATOR.biomeBeat).toHaveLength(6);
    expect(NARRATOR.biomeLate).toHaveLength(6);
    for (let i = 0; i < 6; i++) { expect(NARRATOR.biomeBeat[i][0].length).toBeGreaterThan(8); expect(NARRATOR.biomeLate[i][0].length).toBeGreaterThan(8); }
    expect(NARRATOR.biomeBeat[5][0].toLowerCase()).toMatch(/dash/); // NULL teaches "dash only"
  });
  it('has a descent pool', () => { expect(NARRATOR.descent.length).toBeGreaterThan(0); });
  it('bossApproach[0] keeps a generic line per boss (fallback)', () => {
    expect(NARRATOR.bossApproach[0].warden).toBeTruthy();
    expect(NARRATOR.bossApproach[0].sovereign).toBeTruthy();
  });
  it('tier-75 + Mirrorblade lines are the restored, restrained forms', () => {
    expect(NARRATOR.comboTier[75]).toBe('Lancefall blazes. The grey breaks.');
    expect(NARRATOR.bossKill.mirrorblade).toBe('Your doubt fell. You are still here.');
  });
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3:** in `src/narrator.ts`:

(a) The four voice slips — edit the existing lines verbatim:
- `comboTier` `75:` → `'Lancefall blazes. The grey breaks.'`
- `bossKill.mirrorblade` → `'Your doubt fell. You are still here.'`
- (bestiary fix in Task 7b below — see note)

(b) Restructure `bossApproach` from the flat object to an array; index 0 carries the CURRENT six lines (the generic fallback), and add located lines where a boss meets its biome:

```typescript
  // bossApproach[biomeIndex][bossKind]; index 0 (THE COURT) is the generic fallback for every boss.
  bossApproach: [
    { // 0 — generic fallback (the existing lines)
      warden: 'He held the walls, then turned the first key against us.',
      weaver: 'She enciphered every thread. Read her, or stay lost.',
      beacon: 'The light that lied still turns above. The key it kept never went out.',
      mirrorblade: 'It wears your colour. It learned you move for move.',
      hollow: 'Its key shows for one instant. Strike then.',
      sovereign: 'The master cipher. It could have unlocked everything.',
    },
    { warden: 'He held the throne, then turned the first key against us.' }, // 1 EMBERWALL: Warden located
    {}, // 2 VAULTS
    {}, // 3 BLOOMGARDENS
    {}, // 4 WARRENS
    {}, // 5 NULL
  ] as Partial<Record<EnemyKind, string>>[],
```

> The located set starts small (only the Warden gets a biome line); the fallback to `[0]` keeps every other boss correct. More located lines can be added later without touching the call site.

(c) Add the biome beats + descent pools (after `strata`):

```typescript
  // mid-biome (~30s): teach the biome's rule AS flavour, keyed by biome index 0..5
  biomeBeat: [
    ['The throne-hall remembers. You are reading the code.'],
    ['The heat climbs — the fire is patient, and it accelerates. Read the flame.'],
    ['The vaults lock tighter. Every key sealed inside.'],
    ['The patterns bloom at your touch — the garden is generous here.'],
    ['The undercity stirs. Things move in the shadow, and they wait.'],
    ['The signal dies. Grazing won’t mend it here — dash, only dash, will save you.'],
  ],
  // late-biome (~60s): the boss nears; the place closes in
  biomeLate: [
    ['The throne-hall closes in.'],
    ['The ramparts burn hotter. Faster. Closer.'],
    ['The vaults seal toward you.'],
    ['The garden riots — all petals and thorns.'],
    ['The undercity swarms.'],
    ['The null reaches the edge of everything.'],
  ],
  descent: ['Below, the signal weakens. The cipher spirals down.', 'Deeper. The dark has further to fall.'],
```

- [ ] **Step 3b:** the Mirrorblade bestiary quote (a wink) lives in `src/bestiary.ts`, not narrator. Edit it there: change the boss blurb quote `"…Tell me which of us is real."` → a statement, e.g. `"I learned you. I became you."` (search `bestiary.ts` for `mirrorblade`'s quote; preserve the surrounding blurb). Add a one-line comment in `src/audio.ts` at the choir-bloom onset (search `choirOnset`/`leadOnset`): `// two-tier bloom: lead @0.34 = the lone hero; choir @0.6 = the collective city materializes.`

- [ ] **Step 4: run** — `npx vitest run src/narrator.test.ts && npx tsc --noEmit`. The `bossApproach` shape change will break the existing call site (game.ts:3612) and possibly other tests — that call site is updated in Task 9; if `tsc` flags game.ts here, proceed to Task 9 immediately (these two tasks are a unit). Update any test asserting the old flat `bossApproach` shape.
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): narrator biome/descent pools, biome-keyed bossApproach, 4 voice slips"`

---

## PHASE 3 — Wiring (game.ts)

### Task 8: evaluate deeds + wake the city (the surfacing trigger)

**Files:** Modify `src/game.ts`.
**Interfaces — Consumes:** `deedsMet`, `wakeIsCeremony` from `./cityVoice`; `CITIZENS` from `./citizens`; a new `ui.cityFaceBeat(...)` / toast (Task 12 — add a stub first if executing strictly in order). **Produces:** `private runWokenFaces: string[]` (ids deed-woken THIS run, for the debrief).

- [ ] **Step 1:** add a field `private runWokenFaces: string[] = [];` (reset it where the run resets — search the run-init that clears per-run state) and a method:

```typescript
  /** Evaluate the in-run deeds against current World state; wake any newly-met citizen (persist +
   *  surface the dosed beat). Pure-derived; no world.rng. Called at deed moments (boss kill, combo
   *  tier, overdrive, wave/time ticks). */
  private checkCityDeeds(): void {
    const w = this.world;
    const ctx = {
      bossKindsKilled: Object.keys(w.killsByKind).filter((k) => BOSS_KINDS.has(k)),
      sovereignDown: w.sovereignDown,
      bestCombo: w.bestComboRun,
      bossKills: w.bossKills,
      daybreaks: w.overdriveUses,
      maxDashChain: w.maxDashChain,
      timeSec: w.time,
      wave: this.director.wave,
    };
    for (const id of deedsMet(ctx)) {
      if (this.save.citizenDeeds.includes(id)) continue;            // already woken
      this.save.citizenDeeds.push(id);
      this.runWokenFaces.push(id);
      const c = CITIZENS.find((x) => x.id === id);
      if (!c) continue;
      if (wakeIsCeremony(id) && !this.inClutch()) this.ui.cityFaceBeat(c.name, c.confession); // §A.2 ceremony
      else this.narrate('city_wake', 'toast', [`A face remembered — ${c.name}.`], false);    // restrained toast
    }
    saveSave(this.save);
  }
```

> `BOSS_KINDS` is a `Set` of the 6 boss EnemyKinds — define it near the top of game.ts (or import from a shared list). `inClutch()` — reuse the existing last-breath/clutch predicate (search `lastBreath`/`clutch`); if none exists, gate on `w.player.lastBreathActive`-equivalent. The ceremony queues if in clutch: simplest v1 — fall back to a toast when in clutch (shown above).

- [ ] **Step 2:** call `checkCityDeeds()` at the deed moments — after `bossDeath()`'s `w.bossKills++` block; in `checkComboTier()` after a tier crosses; after an overdrive/DAYBREAK fires (search `overdriveUses++`); and once per second in the run update (a cheap throttle for the time/wave deeds). Each call is idempotent (dedups on `citizenDeeds`).

- [ ] **Step 3:** the descent foreshadow — in `bossDeath()` after `w.bossKills++`:

```typescript
    if (w.bossKills === 2 || w.bossKills === 3) this.narrate('descent', 'toast', NARRATOR.descent, false);
```

- [ ] **Step 4: gate** — `npx tsc --noEmit && npx vitest run` (add the `ui.cityFaceBeat` stub from Task 12 if needed). Determinism unaffected (no rng).
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): wake the city through play — deed checks + descent foreshadow"`

### Task 9: biome beats + the located bossApproach

**Files:** Modify `src/game.ts`.

- [ ] **Step 1:** add `private biomeEntryTime = 0; private biomeBeatFired = false; private biomeLateFired = false;` near `biomeIndex`. In `setBiome()` when `announce`, set `this.biomeEntryTime = this.world.time; this.biomeBeatFired = false; this.biomeLateFired = false;`.

- [ ] **Step 2:** in the run update (the frame body that already calls the biome cycle, ~game.ts:1528), after the biome-cycle check add the two time-based beats:

```typescript
    const inBiome = this.world.time - this.biomeEntryTime;
    if (!this.biomeBeatFired && inBiome >= 30) { this.biomeBeatFired = true; this.narrate('biome_beat', 'toast', NARRATOR.biomeBeat[this.biomeIndex], true); }
    if (!this.biomeLateFired && inBiome >= 60) { this.biomeLateFired = true; this.narrate('biome_late', 'toast', NARRATOR.biomeLate[this.biomeIndex], true); }
```

- [ ] **Step 3:** update the bossApproach call site (game.ts:3612) to the keyed lookup with fallback:

```typescript
    if (boss) {
      const lines = NARRATOR.bossApproach[this.biomeIndex] ?? NARRATOR.bossApproach[0];
      this.narrateOne('toast', lines[boss.kind] ?? NARRATOR.bossApproach[0][boss.kind]);
    }
```

- [ ] **Step 4: gate** — `npx tsc --noEmit && npx vitest run && npx vite build`.
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): inhabit the biomes — mid/late beats + located bossApproach"`

### Task 10: the Vigil Heat floor + the aged Daily Echo

**Files:** Modify `src/game.ts`.
**Interfaces — Consumes:** `vigilHeatFloor`, `agedEcho` from `./cityVoice`; `modeSeeded` from `./modes`.

- [ ] **Step 1:** run impact — `impact({target:"setHeat",direction:"upstream"})`.

- [ ] **Step 2:** at the runHeat assignment (game.ts:854), clamp up to the vigil floor on **non-seeded** runs:

```typescript
    this.runHeat = challenge ? Math.max(0, Math.min(MAX_HEAT, Math.round(challenge.heat ?? 0))) : this.save.selectedHeat;
    if (!modeSeeded(cfg) && this.save.stillpointChoice === 'catch' && !this.save.released) {
      this.runHeat = Math.max(this.runHeat, vigilHeatFloor(this.save)); // THE VIGIL'S WEIGHT
    }
```

- [ ] **Step 3:** the aged Daily Echo — change game.ts:939 from `echoLine(this.seed)` to `agedEcho(this.seed, this.save.totalRuns)` (keeps the shared citizen/memory; only the framing deepens).

- [ ] **Step 4: gate** — `npx tsc --noEmit && npx vitest run`. **Determinism check:** confirm the Daily's seeded sim is untouched (the echo uses its own rng; the heat floor is non-seeded-gated). Add a determinism.test case asserting a seeded run's effective Heat is unchanged by `citizenDeeds`/vigil (or assert `modeSeeded` short-circuits the clamp).
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): the Vigil Heat floor (non-seeded) + the aged Daily Echo"`

### Task 11: the premise card gate (first boot)

**Files:** Modify `src/game.ts`.
**Interfaces:** calls `ui.showPremiseCard(onDone)` (Task 15 — add a stub first if executing in order).

- [ ] **Step 1:** in `descend()` (game.ts:423), before the sandbox gate, insert the once-ever premise frame for a brand-new player:

```typescript
    if (!this.save.seenPremiseCard && this.save.totalRuns === 0) {
      this.save.seenPremiseCard = true; saveSave(this.save);
      this.ui.showPremiseCard(() => this.descend(cfg)); // re-enter descend after the card closes
      return;
    }
```

- [ ] **Step 2: gate** — `npx tsc --noEmit && npx vitest run` (with the Task-15 stub).
- [ ] **Step 3: commit** — `git commit -m "feat(lancefall): premise card gate before the first sandbox"`

---

## PHASE 4 — UI surfacing (verify via build + minified preview + __lf/Playwright)

> Each Phase-4 task: `npx tsc --noEmit && npx vitest run && npx vite build`, then preview-verify via `__lf`. a11y re-check under reduceMotion/reduceFlashing/clarity. Locate sites by SEARCH (line numbers are approximate). `ui.ts` is CRLF — use Edit.

### Task 12: the "A FACE REMEMBERED" beat + the city toasts surface
**Files:** Modify `src/ui.ts`, `src/style.css`.
- [ ] **Step 1:** add `cityFaceBeat(name: string, confession: string): void` to `Ui` — a lower-third card (reuse the announce/toast architecture): a `.city-face` element with `A FACE REMEMBERED` eyebrow + the name + the confession, fading in/out over ~3s, with a soft choir note (`this.audio`-equivalent — reuse an existing soft cue) and the citizen's skyline window flare (a soft glow, NOT strobe; gated by reduceMotion/reduceFlashing). Keyboard-dismissable; never blocks input.
- [ ] **Step 2:** CSS `.city-face` (lower-third, calm fade, max-width, high contrast under `clarity`).
- [ ] **Step 3:** build + preview-verify a ceremony wake renders (drive via `__lf`: push a figure id into `save.citizenDeeds` isn't enough — call `ui.cityFaceBeat('The Ferryman','I kept to my route…')` directly to see the beat). Verify under reduceMotion (no strobe).
- [ ] **Step 4: commit** — `git commit -m "feat(lancefall): A FACE REMEMBERED beat + city-wake toast surface"`

### Task 13: the debrief "faces remembered this run" line
**Files:** Modify `src/ui.ts` (GameOverInfo + showGameOver), `src/game.ts` (populate).
- [ ] **Step 1:** add `facesRemembered?: string[]` to `GameOverInfo` (ui.ts:140-165); in `finishGameOver` set `info.facesRemembered = this.runWokenFaces.map(id => CITIZENS.find(c=>c.id===id)?.name).filter(Boolean)`.
- [ ] **Step 2:** in `showGameOver`, when `facesRemembered?.length`, render a debrief line *"FACES REMEMBERED THIS RUN — The Ferryman, The Courier…"* (append to the grade note or a new stat row, lines ~4004-4036).
- [ ] **Step 3:** build + preview-verify (drive a run-end with `runWokenFaces` populated via `__lf`).
- [ ] **Step 4: commit** — `git commit -m "feat(lancefall): debrief names the faces remembered this run"`

### Task 14: the Heat-pip floor (loadout + HEAT panel)
**Files:** Modify `src/ui.ts` (`paintHeatPips`), `src/panels/heat.ts`, `src/style.css`.
- [ ] **Step 1:** `paintHeatPips` (ui.ts:1588) — compute `const floor = vigilHeatFloor(this.saveRef)` (import from `./cityVoice`); in the pip factory, `pip.disabled = n < floor;` + `if (n < floor) pip.title = 'the vigil holds the floor at HEAT ' + floor;`. Style `.ck-heat-pip:disabled` (dim, locked cursor).
- [ ] **Step 2:** `panels/heat.ts` open() — compute the floor from the save passed to `open(save)`; for each card `if (lvl.level < floor) { card.disabled = true; card.title = 'the vigil holds the floor at HEAT ' + floor; card.classList.add('vigil-locked'); }`. Style `.vigil-locked`.
- [ ] **Step 3:** build + preview-verify: with a catch save + `vigilSince`/`totalRuns` forced so daysHeld≥10 (floor 2) via `__lf`, Heat 0–1 pips are disabled with the tooltip; releasing resets it.
- [ ] **Step 4: commit** — `git commit -m "feat(lancefall): the Vigil Heat floor disables low Heat in the loadout + ladder"`

### Task 15: the premise card modal + COHERENCE caption + personified Vigil line
**Files:** Modify `src/ui.ts`, `src/cityCoherence.ts`, `src/panels/fall.ts`, `src/style.css`.
- [ ] **Step 1:** `showPremiseCard(onDone)` in `Ui` — a once-ever modal (reuse `openModal`/`closeModal`, ui.ts:816/837): the city SVG washing grey→cyan, three lines (*"THE LAST KEY / Lancefall was light-code. The Six scrambled it grey. / Break the code. Bring back the day."*), a soft choir swell, a single SKIP/DESCEND button that calls `onDone()`. a11y: keyboard-focusable, skippable, no strobe.
- [ ] **Step 2:** caption COHERENCE — revise `cityCoherenceTagline` (cityCoherence.ts:32) copy to the cipher-breaking framing: `0 → 'THE CIPHER HOLDS · THE CITY SLEEPS IN GREY'`, `<0.34 → 'THE CODE IS BREAKING · A FEW LIGHTS REMEMBER'`, `<0.67 → 'THE CODE IS BREAKING · NEON BLOOMS'`, `<1 → 'ALMOST DECRYPTED · THE CITY WAKES'`, `1 → 'DAYBREAK · THE CITY IS WHOLE'`. (Update any cityCoherence.test assertions.)
- [ ] **Step 3:** personify the Vigil line — in `panels/fall.ts` `renderYourLancefall` (the held line), when holding and a citizen is woken, use `vigilCitizenName(save)`: *"You hold the light for The Ferryman. Day held: N."* (fall back to the existing line when none woken). Mirror in the title vigil line (`renderVigil`, from the ending).
- [ ] **Step 4:** build + preview-verify: a fresh save (`totalRuns:0`, `seenPremiseCard:false`) shows the premise card before the sandbox; the title meter reads the new captions; the FALL tab personifies the vigil line.
- [ ] **Step 5: commit** — `git commit -m "feat(lancefall): premise card + captioned COHERENCE + personified Vigil line"`

---

## PHASE 5 — a11y + final gate

### Task 16: a11y matrix + full gate
- [ ] **Step 1:** full gate — `npx tsc --noEmit && npx vitest run && npx vite build` (all green; baseline + new).
- [ ] **Step 2:** prod boot under `npx vite preview`; confirm clean boot + the premise card on a fresh save.
- [ ] **Step 3:** a11y matrix — toggle `reduceMotion` / `reduceFlashing` / `clarity` and re-verify: the FACE beat is a calm fade (no strobe, the window-flare is a soft glow); the premise card no strobe; all new text legible; the Heat-pip lock + FACE beat keyboard-reachable.
- [ ] **Step 4:** `detect_changes()` — confirm scope; then `git commit -m "polish(lancefall): a11y pass + final gate for THE CITY SPEAKS"`.

> Do NOT deploy — owner sign-off required (per repo convention). This plan ends at a committed, green branch.

---

## Self-Review

**Spec coverage:** §A wake-through-play → T1,T6,T8,T12 ✓; §A.2 dose + dossier/lore toasts → T2,T8,T12 (dossier/lore-tier toasts fold into the city_wake toast surface in T8/T12) ✓; §A debrief → T13 ✓; §B premise + coherence caption → T11,T15 ✓; §C biomes + located bosses → T7,T9 ✓; §D personify + descent → T4,T7,T8,T10,T15 ✓; §E voice slips → T7 ✓; §F vigil Heat floor → T3,T10,T14 ✓; §G architecture (cityVoice, save v10, determinism, a11y) → T1-T5,T16 ✓.

**Placeholder scan:** no TBD/“add appropriate X”; all deed predicates, strings, and tests are concrete. The few "search for the exact site" notes are precise (named method + approx line + the anchor to match).

**Type consistency:** `RunDeedCtx` fields match between `deedsMet` (T1) and `checkCityDeeds` (T8). `vigilHeatFloor(save)` used in T3/T10/T14 identically. `citizenDeeds: string[]` / `seenPremiseCard: boolean` consistent T5/T6/T8/T11. `cityFaceBeat(name, confession)` defined T12, called T8. `showPremiseCard(onDone)` defined T15, called T11. `facesRemembered?: string[]` T13.

**Ordering note:** T8 calls `ui.cityFaceBeat` (T12) and T11 calls `ui.showPremiseCard` (T15) — add the UI stubs when wiring if executing strictly in order (flagged inline), or do the paired UI task immediately after. T7's `bossApproach` reshape and T9's call-site update are a unit.
