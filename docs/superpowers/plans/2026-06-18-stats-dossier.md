# STATS Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the STATS panel into a rich, graph-driven, animated lifetime dossier that surfaces every honestly-available stat and delights both veterans and newcomers.

**Architecture:** New additive save tracking (run history + activity/per-mode aggregates) feeds a rewritten `renderStats` that composes SVG/DOM graphs (donut, score-trend area chart, playstyle radar, GitHub-style heatmap, mode table, ranked bars, cell grids, collection bars). Pure derivations live in a new, unit-tested `statsDerive.ts`; the canvas share card lives in `statsShare.ts`. Scroll-reveal + count-up/draw-on animations self-initialize and degrade gracefully.

**Tech Stack:** Vite + vanilla TypeScript, Canvas 2D, inline SVG, Vitest. No new dependencies.

**Visual/structural source of truth:** the verified mockup [`mockups/stats-dossier.html`](../../../mockups/stats-dossier.html) — its `bHero/bPerformance/bActivity/bModes/bBars/bCombat/bRecords/bCollection/drawShareCard` builders are the canonical markup/SVG/CSS to port. This plan gives the TypeScript adaptations (the `el()`/`SaveData` versions) and the exact integration; where SVG/markup is verbatim, port it from the named mockup function.

## Global Constraints

- **Determinism:** new save writes happen ONLY at run-end inside the existing `if (!this.inChallenge)` block in `game.ts`, using plain assignment/push/increment — NEVER an `rng` method. This keeps the Daily bit-identical.
- **Save version:** bump `SAVE_VERSION` 8 → **9**; all new fields are additive (default-filled by the spread + validated per-field). Reuse the existing migration patterns (`coerceNumberRecord`, dedicated sanitizers, the post-loop clamp loop).
- **Honest data only:** every graph is backed by a real field and also prints its number as text; missing data shows an empty state, never an invented bar.
- **Animation gating (codebase convention):** JS reads `document.documentElement.classList.contains('reduce-motion')` (set in `game.ts:351`); CSS animations also add `.reduce-motion .X { animation: none }` AND `@media (prefers-reduced-motion: reduce)`. Reveal/animation must NEVER leave content invisible — if `IntersectionObserver` is missing, the scroll root/viewport is 0/unknown, or reduce-motion is on → reveal everything immediately.
- **Shared-file discipline (a card-agent co-edits `game.ts`/`save.ts`/`migrate.ts`/`style.css`/`ui.ts`):** `git diff` before editing; stage and commit ONLY your hunks (content-filtered `git apply --cached` from the repo root if a blanket `git add` would catch their work — note `cockpitCipher` may be staged in the index). **Do NOT `npm run deploy`** (it builds the working tree, which holds others' WIP). `stats.ts`, `statsDerive.ts`, `statsShare.ts` are isolated and safe.
- **Repo rules (CLAUDE.md):** run gitnexus `impact({target, direction:"upstream"})` before editing each existing symbol (`endRun`, `migrateSave`, `defaultSave`, `renderStats`); report HIGH/CRITICAL; run `detect_changes()` before any commit.
- **No `ui.ts` edits required:** the share button is rendered inside the dossier; the reveal observer finds its own scroll container. Avoid touching `ui.ts` (volatile).
- **Lint/types:** `npx tsc --noEmit` clean and `npx vitest run` green after every task.

---

### Task 1: Save schema — RunRecord + 5 additive fields

**Files:**
- Modify: `src/save.ts` (SaveData interface ~line 129; `defaultSave()` ~line 231)
- Test: `src/save.test.ts` (create)

**Interfaces:**
- Produces: `interface RunRecord { score:number; wave:number; mode:string; won:boolean; sec:number; heat:number; combo:number; date:string }` and `SaveData` fields `runHistory: RunRecord[]`, `playDays: Record<string,number>`, `lifeTimeSec: number`, `runsByMode: Record<string,number>`, `winsByMode: Record<string,number>`.

- [ ] **Step 1: Write the failing test**

Create `src/save.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';

describe('defaultSave — v9 dossier fields', () => {
  it('seeds the new tracking fields empty', () => {
    const s = defaultSave();
    expect(s.runHistory).toEqual([]);
    expect(s.playDays).toEqual({});
    expect(s.lifeTimeSec).toBe(0);
    expect(s.runsByMode).toEqual({});
    expect(s.winsByMode).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/save.test.ts`
Expected: FAIL — `runHistory` is undefined.

- [ ] **Step 3: Add the type + fields**

In `src/save.ts`, add above `interface SaveData` (near the other exported types):
```ts
/** One completed (non-challenge) run, kept in a bounded ring for the STATS dossier graphs. */
export interface RunRecord {
  score: number;
  wave: number;
  mode: string;
  won: boolean;
  sec: number;   // run duration, whole seconds
  heat: number;
  combo: number;
  date: string;  // YYYY-MM-DD (local), matches dateString()
}
```
Inside `interface SaveData`, after `mostBossesOneRun: number;` (end of the v7 RECORDS block):
```ts
  // ── v9 DOSSIER — bounded run history + lifetime activity for the STATS graphs.
  //    Additive; written only at run-end via push/assign (never rng). ──
  /** last 50 completed runs (newest last) — the score-trend chart + recent list */
  runHistory: RunRecord[];
  /** YYYY-MM-DD → runs that day (the activity heatmap); capped to recent keys on migrate */
  playDays: Record<string, number>;
  /** total seconds played across all runs ("time in the City") */
  lifeTimeSec: number;
  /** mode id → runs played (per-mode plays) */
  runsByMode: Record<string, number>;
  /** mode id → runs won (per-mode win rate = winsByMode / runsByMode) */
  winsByMode: Record<string, number>;
```
In `defaultSave()`, after `mostBossesOneRun: 0,`:
```ts
    runHistory: [],
    playDays: {},
    lifeTimeSec: 0,
    runsByMode: {},
    winsByMode: {},
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/save.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (your hunks only)**

```bash
git add src/save.ts src/save.test.ts
git commit -m "feat(lancefall): v9 save fields — runHistory + activity/per-mode aggregates"
```
(If `git status` shows a card-agent file staged, `git reset` it first or use `git commit -- src/save.ts src/save.test.ts`.)

---

### Task 2: Migration — bump v9, sanitize/clamp/cap the new fields

**Files:**
- Modify: `src/migrate.ts` (`SAVE_VERSION` line 16; transform comment ~line 53; post-loop clamps ~line 92-97; new helpers near the other sanitizers)
- Test: `src/migrate.test.ts` (extend)

**Interfaces:**
- Consumes: `RunRecord`, the 5 fields from Task 1.
- Produces: `SAVE_VERSION === 9`; `migrateSave` cleans `runHistory` (array of valid records, capped 50), `playDays` (finite≥0 counts, ≤200 most-recent YYYY-MM-DD keys), `lifeTimeSec` (≥0 int), `runsByMode`/`winsByMode` (finite≥0 int counts).

- [ ] **Step 1: Write the failing tests**

Append to `src/migrate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { migrateSave, SAVE_VERSION } from './migrate';
import { defaultSave, type RunRecord } from './save';

const rec = (o: Partial<RunRecord> = {}): RunRecord =>
  ({ score: 1000, wave: 5, mode: 'casual', won: false, sec: 120, heat: 0, combo: 7, date: '2026-06-18', ...o });

describe('migrate — v9 dossier fields', () => {
  it('stamps version 9', () => {
    expect(migrateSave({}, defaultSave()).version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(9);
  });
  it('keeps valid runHistory and caps it to the last 50', () => {
    const many = Array.from({ length: 70 }, (_, i) => rec({ score: i }));
    const out = migrateSave({ runHistory: many }, defaultSave());
    expect(out.runHistory).toHaveLength(50);
    expect(out.runHistory[0].score).toBe(20); // newest 50 → scores 20..69
    expect(out.runHistory[49].score).toBe(69);
  });
  it('drops malformed run records and coerces field types', () => {
    const out = migrateSave({ runHistory: [rec(), null, 5, { score: 'x' }, rec({ won: 'yes' as unknown as boolean, wave: 9.7 })] }, defaultSave());
    expect(out.runHistory).toHaveLength(2);
    expect(out.runHistory[1].won).toBe(false); // non-true → false
    expect(out.runHistory[1].wave).toBe(9);    // floored
  });
  it('resets a non-array runHistory to []', () => {
    expect(migrateSave({ runHistory: 'nope' }, defaultSave()).runHistory).toEqual([]);
  });
  it('clamps playDays counts and keeps only the 200 most-recent date keys', () => {
    const days: Record<string, number> = { '2020-01-01': 3, '2026-06-18': -2, 'junk': 9 };
    for (let i = 0; i < 250; i++) days[`2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`] = 1;
    const out = migrateSave({ playDays: days }, defaultSave());
    expect(Object.keys(out.playDays).length).toBeLessThanOrEqual(200);
    expect(out.playDays['junk']).toBeUndefined();
    expect(out.playDays['2026-06-18']).toBe(0); // -2 clamped to 0
  });
  it('clamps lifeTimeSec and per-mode counts', () => {
    const out = migrateSave({ lifeTimeSec: -50.7, runsByMode: { casual: 4.9, bad: NaN }, winsByMode: { casual: -1 } }, defaultSave());
    expect(out.lifeTimeSec).toBe(0);
    expect(out.runsByMode.casual).toBe(4);
    expect(out.runsByMode.bad).toBeUndefined();
    expect(out.winsByMode.casual).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/migrate.test.ts`
Expected: FAIL — `SAVE_VERSION` is 8 / helpers absent.

- [ ] **Step 3: Implement migration**

In `src/migrate.ts`: change `export const SAVE_VERSION = 8;` → `= 9;`. Add to the transform comment block (after the v7→v8 note):
```ts
  // v8 → v9: added the STATS dossier tracking (runHistory, playDays, lifeTimeSec,
  //          runsByMode, winsByMode). Purely additive → default-filled by the spread;
  //          sanitizeRunHistory caps the ring at 50 + drops malformed records, capPlayDays
  //          keeps the 200 most-recent date keys, and the clamp loop forces non-negative
  //          integer counts / seconds. No explicit transform needed.
```
Add `'lifeTimeSec'` to the existing clamp loop:
```ts
  for (const k of ['longestRunSec', 'fastestArenaSec', 'mostBossesOneRun', 'lifeTimeSec']) {
    if (typeof o[k] === 'number') o[k] = Math.max(0, Math.floor(o[k] as number));
  }
```
After that loop (and before `return out;`), add:
```ts
  // v9 dossier — the {string:number} records were already content-cleaned to finite numbers by
  // the generic coerceNumberRecord pass; clamp to non-negative ints, and bound playDays growth
  // to the 200 most-recent YYYY-MM-DD keys (date strings sort chronologically — no clock needed).
  out.runHistory = sanitizeRunHistory(out.runHistory);
  out.playDays = capPlayDays(out.playDays);
  out.runsByMode = clampCounts(out.runsByMode);
  out.winsByMode = clampCounts(out.winsByMode);
```
Add these helpers near `sanitizeShipSkins` (and import the type — extend the existing `import type { SaveData } from './save';` to `import type { SaveData, RunRecord } from './save';`):
```ts
/** Coerce a stored run-history blob to valid, capped RunRecords (newest-last, max 50). Pure. */
function sanitizeRunHistory(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out: RunRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const score = num(o.score), wave = num(o.wave), sec = num(o.sec), heat = num(o.heat), combo = num(o.combo);
    if (score === null || wave === null || sec === null || heat === null || combo === null) continue;
    if (typeof o.mode !== 'string' || typeof o.date !== 'string') continue;
    out.push({
      score: Math.max(0, Math.floor(score)), wave: Math.max(0, Math.floor(wave)),
      mode: o.mode, won: o.won === true,
      sec: Math.max(0, Math.floor(sec)), heat: Math.max(0, Math.floor(heat)),
      combo: Math.max(0, Math.floor(combo)), date: o.date,
    });
  }
  return out.slice(-50);
}

/** Clamp a {string:number} record to non-negative integers (drops nothing; values already finite). */
function clampCounts(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(rec)) out[k] = Math.max(0, Math.floor(rec[k]));
  return out;
}

/** Keep the 200 most-recent YYYY-MM-DD keys (lexical sort == chronological), clamped. Pure. */
function capPlayDays(rec: Record<string, number>): Record<string, number> {
  const keys = Object.keys(rec).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-200);
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = Math.max(0, Math.floor(rec[k]));
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/migrate.test.ts`
Expected: PASS (all new + existing cases).

- [ ] **Step 5: Commit (your hunks only)**

```bash
git add src/migrate.ts src/migrate.test.ts
git commit -m "feat(lancefall): v9 migration — validate/clamp/cap dossier tracking fields"
```

---

### Task 3: Run-end writes in `game.ts`

**Files:**
- Modify: `src/game.ts` — inside `endRun`, the `if (!this.inChallenge)` block, immediately after `this.save.lifeLastBreath += w.clutch.lastBreathUses;` (currently ~line 2574). `playedDay` (the `dateString()` value) is already defined above (~line 2550).

**Interfaces:**
- Consumes: `w.score`, `w.bestComboRun`, `w.bossKills`, `w.time`, local `wave`, local `won`, `this.runHeat`, `this.mode.id`, `playedDay`; the Task 1 save fields.

- [ ] **Step 1: Pre-edit safety check**

Run gitnexus `impact({ target: "endRun", direction: "upstream" })`; report risk. Run `git diff src/game.ts` to confirm no card-agent hunks are mixed in around the insertion site.

- [ ] **Step 2: Insert the writes**

After `this.save.lifeLastBreath += w.clutch.lastBreathUses;` add:
```ts
      // v9 DOSSIER — bounded run history (last 50, newest last) + lifetime activity for the
      // STATS graphs. Plain push/assign only (determinism-safe); genuine runs only (this block).
      this.save.runHistory.push({
        score: w.score, wave, mode: this.mode.id, won,
        sec: Math.floor(w.time), heat: this.runHeat, combo: w.bestComboRun, date: playedDay,
      });
      if (this.save.runHistory.length > 50) this.save.runHistory = this.save.runHistory.slice(-50);
      this.save.playDays[playedDay] = (this.save.playDays[playedDay] ?? 0) + 1;
      this.save.lifeTimeSec += Math.floor(w.time);
      this.save.runsByMode[this.mode.id] = (this.save.runsByMode[this.mode.id] ?? 0) + 1;
      if (won) this.save.winsByMode[this.mode.id] = (this.save.winsByMode[this.mode.id] ?? 0) + 1;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no errors). Confirms field names + `w`/local references resolve.

- [ ] **Step 4: Sanity-run the suite**

Run: `npx vitest run`
Expected: green (no test exercises `endRun` directly, but nothing should regress).

- [ ] **Step 5: Commit (your hunk only)**

```bash
git add -p src/game.ts   # stage ONLY the dossier-writes hunk
git commit -m "feat(lancefall): record run history + activity at run-end (dossier tracking)"
```

---

### Task 4: `statsDerive.ts` — pure, tested derivations

**Files:**
- Create: `src/panels/statsDerive.ts`
- Test: `src/panels/statsDerive.test.ts`

**Interfaces (Produces):**
```ts
export interface RadarAxis { name: string; value: number; rating: number; norm: number; }
export function radarAxes(s: SaveData): RadarAxis[];        // 6 axes, self-relative norm (dominant → 1)
export function archetypeName(s: SaveData): string;          // dominant axis → name; <5 runs → "FINDING YOUR LANCE"
export function trendDeltaPct(runs: RunRecord[]): number | null; // last10 avg vs first10 avg; null if <10
export function narratorLine(s: SaveData): string;
export function fmtDuration(sec: number): string;            // 51720 → "14h 22m"; 760 → "12m"
export interface HeatDay { date: string; count: number; }
export function heatmapWindow(playDays: Record<string, number>, now: Date, days?: number): HeatDay[];
export interface ModeStat { id: string; name: string; color: string; plays: number; winPct: number; best: number; }
export function modeStats(s: SaveData): ModeStat[];          // sorted by plays desc
```

- [ ] **Step 1: Write the failing tests**

Create `src/panels/statsDerive.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defaultSave, type SaveData, type RunRecord } from '../save';
import { radarAxes, archetypeName, trendDeltaPct, fmtDuration, heatmapWindow, modeStats } from './statsDerive';

const save = (o: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), ...o });
const rec = (o: Partial<RunRecord> = {}): RunRecord =>
  ({ score: 1000, wave: 5, mode: 'casual', won: false, sec: 60, heat: 0, combo: 1, date: '2026-06-01', ...o });

describe('fmtDuration', () => {
  it('formats hours+minutes and minutes-only', () => {
    expect(fmtDuration(51720)).toBe('14h 22m');
    expect(fmtDuration(760)).toBe('12m');
    expect(fmtDuration(0)).toBe('0m');
  });
});

describe('radarAxes', () => {
  it('returns 6 axes with the dominant normalized to 1', () => {
    const s = save({ totalRuns: 10, lifeKills: 900, lifeWins: 1, lifeGrazes: 0, lifeDaybreaks: 0, lifeLastBreath: 0, deepestWave: 3 });
    const ax = radarAxes(s);
    expect(ax).toHaveLength(6);
    expect(Math.max(...ax.map((a) => a.norm))).toBeCloseTo(1, 5);
    expect(ax.every((a) => a.norm >= 0 && a.norm <= 1)).toBe(true);
  });
});

describe('archetypeName', () => {
  it('is the newcomer label under 5 runs', () => {
    expect(archetypeName(save({ totalRuns: 3 }))).toBe('FINDING YOUR LANCE');
  });
  it('names the dominant trait', () => {
    const s = save({ totalRuns: 20, deepestWave: 29, lifeKills: 10, lifeWins: 0, lifeGrazes: 0, lifeDaybreaks: 0, lifeLastBreath: 0 });
    expect(archetypeName(s)).toBe('THE DELVER');
  });
});

describe('trendDeltaPct', () => {
  it('is null with fewer than 10 runs', () => {
    expect(trendDeltaPct([rec(), rec()])).toBeNull();
  });
  it('computes last-10 vs first-10 percentage', () => {
    const runs = [...Array(10)].map(() => rec({ score: 100 })).concat([...Array(10)].map(() => rec({ score: 150 })));
    expect(trendDeltaPct(runs)).toBe(50);
  });
});

describe('heatmapWindow', () => {
  it('returns `days` entries ending today with counts joined', () => {
    const now = new Date(2026, 5, 18); // local
    const out = heatmapWindow({ '2026-06-18': 4, '2026-06-17': 1 }, now, 7);
    expect(out).toHaveLength(7);
    expect(out[6]).toEqual({ date: '2026-06-18', count: 4 });
    expect(out[5]).toEqual({ date: '2026-06-17', count: 1 });
    expect(out[0].count).toBe(0);
  });
});

describe('modeStats', () => {
  it('joins plays/wins/best per mode, sorted by plays desc', () => {
    const s = save({ runsByMode: { casual: 4, arena: 9 }, winsByMode: { casual: 2 }, bestByMode: { arena: 5000, casual: 3000 } });
    const ms = modeStats(s);
    expect(ms[0].id).toBe('arena');
    expect(ms[0].winPct).toBe(0);
    expect(ms[1]).toMatchObject({ id: 'casual', plays: 4, winPct: 50, best: 3000 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/panels/statsDerive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `statsDerive.ts`**

Create `src/panels/statsDerive.ts`:
```ts
// Pure derivations for the STATS dossier — no DOM, fully unit-tested. The DOM layer
// (stats.ts) and the share card (statsShare.ts) both consume these.
import type { SaveData, RunRecord } from '../save';
import { dateString } from '../rng';
import { modeById } from '../modes';

const MODE_COLOR: Record<string, string> = {
  casual: '#34d399', endless: '#22d3ee', arena: '#22d3ee', bossrush: '#fb923c',
  daily: '#fbbf24', weekly: '#f59e0b', nightmare: '#f87171', longestday: '#c084fc',
};

export interface RadarAxis { name: string; value: number; rating: number; norm: number; }

// [label, per-run value fn, cap, archetype-if-dominant]
const AXES: [string, (s: SaveData) => number, number, string][] = [
  ['Aggression', (s) => s.lifeKills / Math.max(1, s.totalRuns), 90, 'THE EXECUTIONER'],
  ['Survival', (s) => (s.lifeWins / Math.max(1, s.totalRuns)) * 100, 60, 'THE SURVIVOR'],
  ['Precision', (s) => s.lifeGrazes / Math.max(1, s.totalRuns), 70, 'THE DANCER'],
  ['Power', (s) => s.lifeDaybreaks / Math.max(1, s.totalRuns), 10, 'THE STORM'],
  ['Clutch', (s) => s.lifeLastBreath / Math.max(1, s.totalRuns), 3, 'THE DAREDEVIL'],
  ['Depth', (s) => s.deepestWave, 30, 'THE DELVER'],
];

export function radarAxes(s: SaveData): RadarAxis[] {
  const raw = AXES.map(([name, fn, cap]) => ({ name, value: Math.round(fn(s) * 10) / 10, rating: Math.min(1, fn(s) / cap) }));
  const maxR = Math.max(...raw.map((a) => a.rating), 0.0001);
  return raw.map((a) => ({ ...a, norm: Math.max(0.04, a.rating / maxR) }));
}

export function archetypeName(s: SaveData): string {
  if (s.totalRuns < 5) return 'FINDING YOUR LANCE';
  let best = AXES[0], bestR = -1;
  for (const ax of AXES) { const r = Math.min(1, ax[1](s) / ax[2]); if (r > bestR) { bestR = r; best = ax; } }
  return best[3];
}

export function trendDeltaPct(runs: RunRecord[]): number | null {
  if (runs.length < 10) return null;
  const avg = (a: RunRecord[]) => a.reduce((t, r) => t + r.score, 0) / a.length;
  const first = avg(runs.slice(0, 10)), last = avg(runs.slice(-10));
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 100);
}

export function narratorLine(s: SaveData): string {
  if (s.totalRuns < 5) return 'The City is just beginning to remember you.';
  const hrs = Math.floor(s.lifeTimeSec / 3600);
  if (hrs >= 1) return `You've held the light for ${hrs} hour${hrs === 1 ? '' : 's'} across ${s.totalRuns} descents.`;
  return `${s.totalRuns} descents into the City, and counting.`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h >= 1 ? `${h}h ${m}m` : `${m}m`;
}

export interface HeatDay { date: string; count: number; }
export function heatmapWindow(playDays: Record<string, number>, now: Date, days = 182): HeatDay[] {
  const out: HeatDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = dateString(d);
    out.push({ date: key, count: playDays[key] ?? 0 });
  }
  return out;
}

export interface ModeStat { id: string; name: string; color: string; plays: number; winPct: number; best: number; }
export function modeStats(s: SaveData): ModeStat[] {
  const ids = new Set<string>([...Object.keys(s.runsByMode), ...Object.keys(s.bestByMode)]);
  const out: ModeStat[] = [];
  for (const id of ids) {
    if (modeById(id).id !== id) continue; // real modes only (modeById falls back otherwise)
    const plays = s.runsByMode[id] ?? 0;
    out.push({ id, name: modeById(id).name, color: MODE_COLOR[id] ?? '#22d3ee', plays,
      winPct: plays > 0 ? Math.round(((s.winsByMode[id] ?? 0) / plays) * 100) : 0, best: s.bestByMode[id] ?? 0 });
  }
  return out.sort((a, b) => b.plays - a.plays);
}
```
(Confirm `dateString` is exported from `src/rng.ts` — `save.ts` already imports it.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/panels/statsDerive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/panels/statsDerive.ts src/panels/statsDerive.test.ts
git commit -m "feat(lancefall): pure STATS-dossier derivations (radar, archetype, trend, heatmap, modes)"
```

---

### Task 5: Dossier CSS block in `style.css`

**Files:**
- Modify: `src/style.css` — append a self-contained block AFTER the existing STATS block (after the `@media` breakpoint at ~line 1748), so it never overwrites the card-agent's lines.

**Interfaces (Produces):** the class names consumed by Tasks 6-8 — `.st-narrator`, `.st-chips`/`.st-chip`, `.wow-row`, `.st-card`/`.st-card-h`/`.st-card-t`/`.st-card-sub`/`.st-delta`, `.st-trend`, `.st-radar`/`.radar-arch`, `.st-heat*`, `.st-modes`/`.mrow`, `.st-coll*`, `.dossier-section` (reveal), `.st-share-btn`.

- [ ] **Step 1: Append the CSS**

Port the component CSS verbatim from `mockups/stats-dossier.html` (the `.st-chip`, `.wow-row`, `.card`, `.trend-*`, `.radar-*`, `.heat-*`, `.mode-*`, `.coll-*`, `.section` reveal, `.st-narrator`, share-button rules), **prefixing the generic names** (`.card`→`.st-card`, `.mode-row`→`.mrow`, `.section`→`.dossier-section`, `.heat-grid`→`.st-heat-grid`, etc.) to avoid clashes with existing/in-flight classes. Wrap in a banner comment:
```css
/* ════════ STATS DOSSIER v9 — trend / radar / heatmap / modes / collection / reveal ════════ */
/* (full rules ported from mockups/stats-dossier.html, names prefixed st-/dossier-/mrow) */
.dossier-section { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s cubic-bezier(.22,.61,.36,1); }
.dossier-section.in { opacity: 1; transform: none; }
.reduce-motion .dossier-section { opacity: 1; transform: none; transition: none; }
@media (prefers-reduced-motion: reduce) { .dossier-section { opacity: 1; transform: none; transition: none; } }
/* …trend/radar/heatmap/modes/collection/chips/narrator/share rules… */
```
Every animated rule (`.st-trend-line` draw-on, `.st-radar-shape` pop, `.st-heat-cell` fade, bar grows) MUST also get the `.reduce-motion` + `@media (prefers-reduced-motion)` no-animation guard.

- [ ] **Step 2: Type/build check**

Run: `npx tsc --noEmit` (CSS doesn't type-check, but confirms nothing else broke) and visually confirm in Step 3 of Task 6.

- [ ] **Step 3: Commit (your hunk only)**

```bash
git add -p src/style.css   # stage ONLY the appended dossier block
git commit -m "style(lancefall): STATS dossier v9 component styles + scroll-reveal"
```

---

### Task 6: `stats.ts` — render the dossier (structure + non-SVG sections)

**Files:**
- Modify: `src/panels/stats.ts` — rewrite `renderStats` to build the new section list; keep using `el`/`stat` from `./dom` and import from `./statsDerive`.

**Interfaces:**
- Consumes: `statsDerive` exports; `el`, `stat`, `iconEl` from `./dom`; `ACHIEVEMENTS`, `bossName`, `modeById`, `heatLevel` as today; the Task 1 save fields.
- Produces: `renderStats(s: SaveData): HTMLElement[]` returns `[…dossierSections]` where each section is a `.dossier-section` wrapper.

- [ ] **Step 1: Build the section scaffold + simple sections**

Rewrite `renderStats` so it returns an array of `.dossier-section` wrappers in this order, porting markup from the mockup builders (adapt `el()`-style; reuse existing `donutEl`, `barChart`, `rec`, `cell` helpers, expanding COMBAT to 8 cells with `Runs Won` + `Time Played` via `fmtDuration(s.lifeTimeSec)`):
1. Hero (`donutEl` + 4 `stat()` + chips: Time in the City `fmtDuration`, 🔥 streak `s.playStreak`, ↻ NG+ `s.ngPlusLevel` when >0) — port `bHero`.
2. Narrator (`narratorLine(s)`).
3. Performance wrapper (filled by Task 7) — leave a placeholder container `el('div', { class: 'wow-row' })` for now.
4. Activity (filled by Task 7) — placeholder.
5. By mode — `modeStats(s)` table (`.st-modes`/`.mrow`); empty state if no plays.
6. Nemesis — existing `barChart`; empty state line if none.
7. Kills by foe — two-column `barChart` from `s.killsByKind` (top 10 by count, per-kind color via the existing palette or `bossName`/kind colors).
8. Combat — 8-cell grid.
9. Records — existing `rec` grid.
10. Collection — bars: Ships `s.unlockedShips.length`/total, Trails, Themes, Skins (derive totals from the registries already imported elsewhere — `SHIPS`, `THEMES`, `TRAILS`, `ACHIEVEMENTS`), Meta nodes, Achievements.

Wrap each in `el('div', { class: 'dossier-section' }, …)`. Add a small `el('button', { class: 'st-share-btn' }, …)` in the hero (wired in Task 8).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. Resolve any registry import names (e.g., confirm the ships/themes/trails source modules).

- [ ] **Step 3: Visual smoke (DEV)**

Start the dev server and open STATS (via the existing DEV hook, e.g. `__lf.ui.openStats?.()` or navigate the cockpit). Confirm all non-graph sections render with real numbers, the empty states show on a fresh save, and nothing throws (`preview_console_logs`).

- [ ] **Step 4: Commit**

```bash
git add src/panels/stats.ts
git commit -m "feat(lancefall): STATS dossier — hero chips, narrator, modes, kills, 8-cell combat, collection"
```

---

### Task 7: `stats.ts` — the SVG graphs (trend + radar + heatmap)

**Files:**
- Modify: `src/panels/stats.ts` — fill the Performance + Activity containers.

**Interfaces:**
- Consumes: `radarAxes`, `archetypeName`, `trendDeltaPct`, `heatmapWindow` from `./statsDerive`.
- Produces: `buildTrend(s)`, `buildRadar(s)`, `buildActivity(s)` returning `HTMLElement`, invoked from `renderStats`.

- [ ] **Step 1: Implement the three graph builders**

Port `bPerformance` (trend + radar) and `bActivity` from the mockup into TS functions that build SVG via `el('div', …).innerHTML = '<svg …>'` (author-controlled markup, safe). Key adaptations:
- Trend: `s.runHistory`; dashed line at `s.highScore`; win dots; delta badge from `trendDeltaPct`; `< 5` runs → empty-state element. Live hover marker + tooltip.
- Radar: `radarAxes(s)` for points; `archetypeName(s)` headline.
- Heatmap: `heatmapWindow(s.playDays, new Date())`; pad to weekday alignment; weekday + month labels; per-day hover tooltip; streak badge (`s.playStreak`); mini-summary (this-month / active-days / busiest from the window).

A shared module-level tooltip `<div>` (created once, appended to `document.body`) backs the hover; mirror the mockup's `showTip/hideTip`.

- [ ] **Step 2: Type-check + visual**

Run: `npx tsc --noEmit`; then dev-server visual: confirm the trend draws, radar shows the right archetype, heatmap fills from `playDays`, hover tooltips work, and the empty trend state shows on a <5-run save.

- [ ] **Step 3: Commit**

```bash
git add src/panels/stats.ts
git commit -m "feat(lancefall): STATS dossier graphs — score trend, playstyle radar, activity heatmap"
```

---

### Task 8: Reveal-on-scroll + animations + share card

**Files:**
- Modify: `src/panels/stats.ts` (reveal/animation wiring)
- Create: `src/panels/statsShare.ts` (canvas card)

**Interfaces:**
- Consumes: the built sections; `radarAxes`/`archetypeName`/`fmtDuration` for the card.
- Produces: `renderShareCard(s: SaveData): void` (draws + downloads PNG); reveal self-init inside `renderStats`.

- [ ] **Step 1: Reveal + animation self-init**

At the end of `renderStats`, schedule a one-shot setup that runs after mount:
```ts
requestAnimationFrame(() => setupReveal(sections));
```
`setupReveal` (in stats.ts): compute `const reduce = document.documentElement.classList.contains('reduce-motion');`. Find the scroll root by walking up from `sections[0].parentElement` to the nearest ancestor with `scrollHeight > clientHeight` and `overflow-y` auto/scroll (else `null`). If `reduce`, or no `IntersectionObserver`, or the sections aren't mounted (`!sections[0].isConnected`), or the root viewport size is 0 → add `.in` to all + run each section's `_animate()` immediately and return. Otherwise observe each; on intersect add `.in`, run `_animate()`, unobserve. Also reveal any section already within the fold on setup. Each builder attaches its animation as `section._animate` (count-up numbers, draw-on line via `getTotalLength`, radar scale pop, bar width grows, heatmap cell fade) — guarded so reduce-motion jumps to the final state.

- [ ] **Step 2: Share card**

Create `src/panels/statsShare.ts` mirroring `replay.ts:224-245`'s canvas→`toBlob`→`a.download` pattern; port `drawShareCard` from the mockup (archetype + High Score / Runs / Win Rate / Deepest Wave / Best Combo / Achievements + `lancefall.pages.dev`). Wire the hero `.st-share-btn` click in `stats.ts` to `renderShareCard(s)`.

- [ ] **Step 3: Type-check + visual**

Run: `npx tsc --noEmit`; dev-server: scroll the panel and confirm sections reveal/animate as they enter view; toggle reduce-motion (Settings) and confirm instant render with no animation and nothing hidden; click Share and confirm a PNG downloads.

- [ ] **Step 4: Commit**

```bash
git add src/panels/stats.ts src/panels/statsShare.ts
git commit -m "feat(lancefall): STATS dossier scroll-reveal + animations + shareable stats card"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full type + test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: types clean; all tests green (incl. the new save/migrate/derive suites).

- [ ] **Step 2: Production-build sanity (per deploy-gotcha memory)**

Run: `npx vite build && npx vite preview` and open STATS in the minified preview (a past rolldown re-export bug was green in dev/tests but crashed the prod build). Confirm the dossier renders and the share card works. **Do NOT `npm run deploy`** (tree holds card-agent WIP).

- [ ] **Step 3: Regression scope**

Run gitnexus `detect_changes({ scope: "compare", base_ref: "master" })`; confirm only `save.ts`, `migrate.ts`, `migrate.test.ts`, `save.test.ts`, `game.ts`, `style.css`, `panels/stats.ts`, `panels/statsDerive*.ts`, `panels/statsShare.ts` changed — no stray card-agent symbols.

- [ ] **Step 4: Manual matrix**

Open STATS on (a) a rich save and (b) a fresh save (`localStorage.clear()` then play 1-2 runs or hand-seed): verify graphs, empty states, reveals, reduce-motion, and share for both. Capture before/after if the screenshot tool is working.

## Self-Review

**Spec coverage:** Data model → Tasks 1-3. The 10 dossier blocks → Tasks 6-7. Radar/archetype → Task 4. 7 polish tweaks: scroll-reveal + early-state + hover marker + animations → Tasks 6-8; archetype + narrator + delta → Tasks 4/6/7; crisp heatmap → Task 7; share card → Task 8. Accessibility (reduce-motion gating, text-always, colorblind echoes in-game accents) → Tasks 5-8. Testing → Tasks 1,2,4,9. Guardrails (shared files, no deploy, gitnexus) → Global Constraints + per-task steps. No gaps.

**Placeholder scan:** Task 3/5 use `git add -p`/manual staging by necessity (shared files) — flagged, not a code placeholder. Render/CSS port references the in-repo verified mockup by exact function name (DRY — the 600-line SVG/CSS is canonical there) rather than duplicating it; all logic, types, and integration points are spelled out here.

**Type consistency:** `RunRecord`/the 5 fields are defined once (Task 1) and consumed with the same names in Tasks 2-4,6-8. `statsDerive` signatures in Task 4's Interfaces match their test (Task 4 Step 1) and consumers (Tasks 6-8). `SAVE_VERSION === 9` consistent (Tasks 1-2,9).
