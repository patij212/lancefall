# STATS DOSSIER — "a page to marvel at" — design spec

**Date:** 2026-06-18
**Status:** approved direction; pending spec review → implementation plan
**Visual source of truth:** [`mockups/stats-dossier.html`](../../../mockups/stats-dossier.html) (interactive; Veteran/New-player toggle, reduced-motion toggle, working Share-card export)
**Builds on:** the v7 STATS-parity work now **committed** (`2041fbc` — RECORDS fields + the 6-cell COMBAT lifetime counters in `save.ts`/`game.ts`/`migrate.ts`/`style.css`/`stats.ts`). ⚠️ The shared tree is moving under us (a card-agent is live-editing `ui.ts`/`cockpitCipher`/`shipSkins`); re-read the current `stats.ts`/`style.css` before editing.

## 1. Goal

Turn the STATS panel from "bars + numbers" (current state, matches the old mock) into a rich, satisfying, **graph-driven lifetime dossier** that surfaces *every* stat we can honestly show — and that delights both the seasoned player (148 runs) and the newcomer (3 runs). One long scroll that **unfolds** as you read it.

Non-goal: faking data. Every graph is backed by a real save field, and every graph also prints its number as text. Where a metric doesn't exist, we show an honest empty state, not an invented bar.

## 2. Data model — new tracking (additive; extends v7, which is NOT yet deployed → no version bump)

All new fields are written **only** at run-end inside the existing `if (!this.inChallenge)` block in `game.ts`, using **plain assignment / push / increment only** (never an `rng` method — determinism + Daily bit-identity preserved), validated field-by-field in `migrate.ts`.

| Field | Type | Default | Write (run-end) | Validation / bound |
|---|---|---|---|---|
| `runHistory` | `RunRecord[]` | `[]` | push this run, then keep **last 50** | array; each record coerced field-by-field; non-objects dropped; length capped 50 |
| `playDays` | `Record<string,number>` | `{}` | `playDays[today] = (playDays[today] ?? 0) + 1` | string→number map (like `nemesis`); keys must match `YYYY-MM-DD`; counts clamped `≥0`; **prune keys older than 182 days** on migrate |
| `lifeTimeSec` | `number` | `0` | `+= Math.floor(w.time)` | finite number `≥ 0` |
| `runsByMode` | `Record<string,number>` | `{}` | `runsByMode[mode]++` | string→number map, counts `≥0` |
| `winsByMode` | `Record<string,number>` | `{}` | `winsByMode[mode] += won ? 1 : 0` | string→number map, counts `≥0` |

```ts
interface RunRecord {
  score: number;   // w.score
  wave:  number;   // wave reached
  mode:  string;   // this.mode.id
  won:   boolean;  // won
  sec:   number;   // Math.floor(w.time)  — run duration
  heat:  number;   // this.runHeat
  combo: number;   // w.bestComboRun
  date:  string;   // dateString()  — YYYY-MM-DD (already used for the daily streak)
}
```

`today` = `dateString()` (already called once at run-end for the streak). `migrate.ts` fills defaults for any missing field, so a v7 save written before these fields existed upgrades cleanly. SAVE_VERSION stays **7**.

## 3. Layout — one long scroll (10 reveal blocks, top → bottom)

Each block is wrapped in a `.section` that **reveals on scroll** (see §5.1) — 9 content sections plus the one-line narrator beat. Order:

1. **Hero band** — achievement-completion **donut** (arc draws on open) + 4 count-up stats (High Score · Best Combo · Runs Survived · Win Rate) + chips: ⏱ Time in the City (`lifeTimeSec`) · 🔥 Day streak (`playStreak`) · ↻ NG+ loop (`ngPlusLevel`, hidden when 0).
2. **Narrator line** — one soulful, generated line in the game's restrained voice, e.g. *"You've held the light for **14 hours** across **148** descents."* New-player variant: *"The City is just beginning to remember you."*
3. **Performance (the wow row)** — two cards side by side:
   - **Score Trend** — `runHistory` as a gradient area chart; line **draws on**; green dots mark wins; dashed gold line = **all-time best** (`highScore`); a `+N% vs first runs` delta badge (last-10 avg vs first-10 avg of the window); live hover marker (vertical guide + point + tooltip: run #, score, mode, won/fell). <5 runs → friendly empty state.
   - **Playstyle radar** — 6 axes from lifetime ratios (see §4); **self-relative** (dominant axis reaches the edge → reads as a *shape*); each spoke labelled with its real number; pops out from center on open. Headline: a derived **archetype name** (THE DELVER / THE EXECUTIONER / …). <5 runs → "FINDING YOUR LANCE".
4. **Activity** — GitHub-style cyan **heatmap**, 26 weeks (182 days from `playDays`), dense 15px cells, weekday (Mon/Wed/Fri) + month labels, per-day hover tooltip, a 🔥 streak badge, and a right-side mini-summary (This month · Active days · Busiest day). Empty grid is fine and honest; it blooms over time.
5. **By mode** — sorted table: accent dot · mode · plays (`runsByMode`) · win-rate bar (`winsByMode`/`runsByMode`) · best score (`bestByMode`).
6. **Nemesis** — ranked glowing bars (`nemesis`, bosses only). Empty → *"Nothing has ended you yet. Hold the light."*
7. **Kills by foe** — ranked bars from `killsByKind`, two columns, per-enemy color.
8. **Combat · lifetime** — 8-cell grid: Total Kills · Bosses Felled · Shards Earned · Bullets Grazed (`lifeGrazes`) · DAYBREAKs Fired (`lifeDaybreaks`) · Last-Breath Saves (`lifeLastBreath`) · Runs Won · Time Played.
9. **Records** — the existing 6-cell records grid (Deepest Wave · Highest Heat · Longest Run · Fastest Arena · Biggest Combo · Bosses·One Run).
10. **Collection** — completion bars: Ships · Dash Trails · Themes · Enemy Skins · Meta Nodes · Achievements (gold fill at 100%).

(Achievements GRID stays in the CODEX — STATS keeps only the completion donut, as shipped.)

## 4. Playstyle radar — axes & archetype

Each axis: `rating = clamp(value / cap, 0, 1)`, then **self-relative rescale**: `norm = rating / max(allRatings)` so the dominant trait hits the rim. Labels show `value`.

| Axis | value (lifetime) | cap | archetype if dominant |
|---|---|---|---|
| Aggression | `lifeKills / totalRuns` | 90 | THE EXECUTIONER |
| Survival | `lifeWins / totalRuns × 100` | 60 | THE SURVIVOR |
| Precision | `lifeGrazes / totalRuns` | 70 | THE DANCER |
| Power | `lifeDaybreaks / totalRuns` | 10 | THE STORM |
| Clutch | `lifeLastBreath / totalRuns` | 3 | THE DAREDEVIL |
| Depth | `deepestWave` | 30 | THE DELVER |

`totalRuns < 5` → archetype "FINDING YOUR LANCE". Caps/names are tunable constants in `stats.ts`.

## 5. The 7 polish tweaks

1. **Scroll-triggered reveals** — sections start `opacity:0; translateY`, gain `.in` via `IntersectionObserver` (root = the scrollable modal body) when entering view, then run their own count-up / draw-on / bar-grow / radar-pop. **Graceful degradation (hard rule): never leave content invisible.** If `IntersectionObserver` is unavailable, the viewport height is `0`/unknown, or reduced-motion is on → reveal everything immediately. Above-the-fold sections reveal on load.
2. **Early-state grace** — sparse/new saves still feel designed: trend <5 runs → "Play a few runs…"; nemesis empty → honest line; radar works from run 1; copy encourages rather than showing broken charts.
3. **Playstyle identity** — the archetype headline (§4).
4. **"You're improving" beat + narrator line** — the trend delta badge + the §3.2 narrator line.
5. **Crisp heatmap** — dense 15px cells, weekday/month labels, mini-summary (replaces the earlier chunky full-width stretch).
6. **Live hover marker on the trend** — vertical guide + highlighted point tracking the cursor.
7. **Shareable stats card** — a "Share card" button renders a compact dossier image to a `<canvas>` (archetype + High Score / Runs / Win Rate / Deepest Wave / Best Combo / Achievements + `lancefall.pages.dev`) and downloads PNG, reusing the game's existing share/download approach. Matches the GIF / build-DNA social layer.

## 6. Accessibility

- Every animation gated by **reduced-motion** and **Clarity** (instant, no transition/draw-on) — already the project convention.
- **Colorblind-safe**: charts never rely on hue alone; values are always printed as text; mode/enemy colors echo the in-game accents already used elsewhere.
- Hover affordances are enhancements; all data is present without hover.
- Heatmap intensity has a legend (Less→More).

## 7. Implementation surface & guardrails

| File | Change | Notes |
|---|---|---|
| `src/save.ts` | +5 fields in `SaveData` + `defaultSave()` | extends the v7 fields already committed (`2041fbc`) |
| `src/migrate.ts` | validate/clamp/prune the 5 fields | mirror the existing map coercion; add the 182-day prune for `playDays` |
| `src/game.ts` | run-end writes (push/increment) | **inside** the existing `if (!this.inChallenge)` block; plain assignments only |
| `src/panels/stats.ts` | the whole new dossier render | **isolated module — the main work happens here** |
| `src/style.css` | dossier styles (trend/radar/heatmap/table/collection/reveal/share) | **shared file** |
| `src/migrate.test.ts` | round-trip + clamp + prune tests for new fields | extends the held edits |
| (share) | canvas card render | reuse existing download helper if present |

**Shared-file discipline (per memory — a card-agent co-edits these):** before editing `game.ts` / `save.ts` / `migrate.ts` / `style.css`, `git diff` them; commit **only my hunks** (content-filtered `git apply --cached` from repo root if needed); **do not deploy** (`npm run deploy` builds the working tree, which may hold others' WIP). `stats.ts` is isolated and safe.

## 8. Testing & verification

- `migrate.test.ts`: new fields round-trip; out-of-range/garbage coerced; `runHistory` capped at 50; `playDays` pruned past 182 days; missing fields default.
- `npx tsc --noEmit` clean; `npx vitest run` green.
- Manual: open the live STATS panel (DEV `__lf.ui.openUpgrades`-style hook) on a rich save and a fresh save; confirm reveals, empty states, reduced-motion, and the share export.
- `detect_changes()` before commit to confirm only expected symbols changed.

## 9. Out of scope / future

- Percentile/rank flavor ("top 12%") — needs verified leaderboard data; skipped to stay honest.
- Per-run wave-sum tracking for a true "avg wave" radar axis (using `deepestWave` for now).
- Animating the share card / exporting a GIF of the dossier.
