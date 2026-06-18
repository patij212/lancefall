# STATS parity — HELD (uncommitted) changes

**Date:** 2026-06-18
**Why held:** a concurrent card-agent had uncommitted work in `game.ts` and `style.css`
(a "runShields" survivability feature) when this STATS-parity pass landed. Per the owner's
call, my **isolated** files were committed and my changes to the **shared** files were left
uncommitted in the working tree to avoid entangling the card-agent's WIP in my commits.

## Already committed (clean, isolated)
- `feat(lancefall): v7 RECORDS save fields + migration` — `save.ts`, `migrate.ts`, `migrate.test.ts`
- `feat(lancefall): STATS dossier parity — mock record set, accent hero, colored bars` — `panels/stats.ts`

## HELD — to commit once the tree is clean (card-agent's survival work committed)

### 1. `src/game.ts` — run-end v7 RECORDS writes
Inside the `endRun` `if (!this.inChallenge)` block, immediately AFTER
`this.save.maxHeat = Math.max(this.save.maxHeat, this.runHeat);`:

```ts
// v7 RECORDS — peak single-run bests for the STATS dossier (cosmetic; max/min only,
// never touches sim/seed/scoring). Fastest Arena counts only a WON arena clear.
this.save.longestRunSec = Math.max(this.save.longestRunSec, Math.floor(w.time));
this.save.mostBossesOneRun = Math.max(this.save.mostBossesOneRun, w.bossKills);
if (won && this.mode.id === 'arena') {
  const clr = Math.floor(w.clearTime || w.time);
  this.save.fastestArenaSec = this.save.fastestArenaSec > 0 ? Math.min(this.save.fastestArenaSec, clr) : clr;
}
```

### 2. `src/style.css` — STATS dossier polish (mock parity)
Three edits in the STATS block (~`.stats-hero` … `.stat-cell`):

- `.stats-hero` background → `linear-gradient(160deg, rgba(34,211,238,0.05), rgba(255,255,255,0.012))`,
  border → `1px solid rgba(34,211,238,0.15)`, padding → `16px 20px` (mock `.st-hero`).
- After `.rec-v`, add `.rec-v small { font-size: 10px; color: #8aa0bd; font-weight: 600; }`.
- Replace the `.nem-*` block with the mock `.hbar` proportions + fill-grow animation, and
  make `.stat-cells` a connected hairline grid:

```css
.nem-bars { display: flex; flex-direction: column; gap: 5px; }
.nem-row { display: grid; grid-template-columns: 124px 1fr 60px; align-items: center; gap: 11px; padding: 5px 0; }
.nem-k { font-family: 'Rajdhani', sans-serif; font-size: 10.5px; font-weight: 600; color: #b9c8de; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nem-track { height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 4px; overflow: hidden; }
.nem-fill { height: 100%; border-radius: 4px; animation: nemGrow 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.nem-v { font-family: 'Rajdhani', sans-serif; font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 700; color: #dbe6f7; text-align: right; }
@keyframes nemGrow { from { width: 0; } }
.reduce-motion .nem-fill { animation: none; }
@media (prefers-reduced-motion: reduce) { .nem-fill { animation: none; } }
.stat-cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; overflow: hidden; }
.stat-cell { background: rgba(8, 12, 24, 0.6); padding: 13px 12px; text-align: center; }
```

## Suggested commit once clean
`feat(lancefall): STATS run-end record writes + dossier CSS polish (hero tint, hbar bars, combat grid)`
— `git add src/game.ts src/style.css` ONLY after confirming `git diff` on those files shows
just these hunks (no stray card-agent lines), then commit + ff master.

## ROUND 2 — STATS "absolutely amazing" richness pass (PENDING — blocked on live card-agent)

Owner asked to close the remaining mock gaps. A concurrent card-agent went LIVE-editing the
whole STATS surface (stats.ts, style.css, game.ts, achievements.ts, skins.ts, survival.ts,
ui.ts, migrate.test.ts) for a skin-achievements feature — so this round is deferred to a clean
tree (auto-resume watcher running). Plan to execute once clean:

1. **Labels** (stats.ts): `BEST BY MODE` → `PERSONAL BEST · BY MODE`; hero `runs` → `runs survived`.
2. **COMBAT → 6 cells** (mock parity). Add 3 lifetime counters to the v7 bump (v7 NOT deployed yet,
   so no new version): `lifeGrazes`, `lifeDaybreaks`, `lifeLastBreath` in `save.ts` + DEFAULT_SAVE
   (already drafted in working tree, uncommitted) + migrate clamp. Track at run-end in `game.ts`
   (`if (!this.inChallenge)` block): `lifeGrazes += w.grazeCount; lifeDaybreaks += w.overdriveUses;
   lifeLastBreath += w.clutch.lastBreathUses;`. Render the 6 mock cells: Total Kills, Bosses Down,
   Shards Earned, Bullets Grazed, DAYBREAKs Fired, Last-Breath Saves (drop "Runs Won" — win rate is
   in the hero). Combat grid → `repeat(3,1fr)` (6 cells = 2 rows).
3. **Hero prominence** (style.css): match mock `.st-hs` — bigger values (~19px), wider spread.
4. **Width cap** (style.css): stats panel `max-width` ~1100–1160px centered (mock `.modal` = 1160)
   so it reads as spacious; verify at a 1440px viewport (the earlier "cramped" look was partly a
   narrow-capture artifact — `.panel-wide` has no max-width today).
5. **Achievement text** (stats.ts): unlocked → `Unlocked · X% of players have this`. Honest
   per-achievement PROGRESS BARS are OPTIONAL: achievements are boolean `check()`s with no progress
   metric (the mock's bars are fabricated). If wanted, add a save-metric map in stats.ts for the
   threshold ones only (combo/runs/shards/wave/score) and show a bar where a real fraction exists —
   do NOT fake the rest.
6. Verify (tsc + tests + build), re-capture vs mock at a matched viewport, then commit + ff master + deploy.

## Do NOT deploy yet
`npm run deploy` builds from the working tree, which currently also contains the card-agent's
uncommitted survival WIP — deploying now would publish their unfinished feature. Deploy only
after the tree is clean and coherent.
