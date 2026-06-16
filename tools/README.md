# LANCEFALL — bot & balance tooling

Two console-only tools for playtesting balance against an automatic player. Neither
modifies the shipped game: every hook/stub is installed at run time and restored in a
`finally`. Both live here and are served by the dev build at `/tools/<file>`.

| File | What it is |
|------|------------|
| `balance-bot.js` | The **PRO autopilot** — overrides `input.poll` with a heuristic player (dash-dodges, joust/hunt/flank offence, beam prediction, mode-aware perk drafting). Also ships the headless probe + a live-watch. |
| `balance-metrics.js` | The **balance telemetry rig** — drives the bot headless and scrapes per-run stats into hotspot tables (kills, bosses, every source of damage taken, death hotspots, economy). |

## Quick start (devtools console on a running `npm run dev`)

```js
// 1. Load the autopilot, then WAIT for its async threat predicates to resolve (see gotcha #1).
await import('/tools/balance-bot.js'); await new Promise(r => setTimeout(r, 450));

// 2a. Watch it play live (a real, rendered window — auto-restarts on death):
__watch('arena');            // any mode id; clearInterval(__watchTimer) to stop

// 2b. …or get a full balance report (headless, fast):
await import('/tools/balance-metrics.js');
await __metrics('arena', 40);          // one mode, 40 runs → prints tables + returns the data
await __metricsAll(30);                // arena + bossrush + endless side by side
```

`__metrics(modeId, runs, opts)` pins **NG+0 (base difficulty)** by default and restores your
save's real NG+ afterward; pass `{ngPlus: 8}` to measure a specific loop.

## The autopilot's functions (`balance-bot.js`)

| Call | Use |
|------|-----|
| `__watch('arena')` | Watch the bot play live (rendered, real-time, auto-restart). Only works in a **foregrounded** browser — headless throttles rAF. |
| `await __sweep()` | Quick multi-mode survival table (median time/bosses/win-rate). |
| `__runProbe(mode, runs, capSteps)` | Low-level: raw per-run rows for one mode. |

The bot reads `window.__botState` (its live state; `__botState.threatFns` must be non-null —
see gotcha #1). It drafts perks by mode: AoE (Nova/Chain) for chaff modes, damage for Boss Rush.

## The telemetry rig's report (`balance-metrics.js`)

`await __metrics(id, runs)` prints (and returns) these sections:

- **OUTCOME / ECONOMY** — win / died / stall %, median wave·time·score, kills, dashes, grazes, avg stamina at death.
- **ENEMIES** — kills by kind, per-run, % via dash vs AoE, % elite. (Confirms the kill verbs fire.)
- **BOSSES** — reached / killed / kill-rate / avg time-to-kill / avg HP / deaths-at-this-boss.
- **DAMAGE TAKEN** — every would-be-fatal hit by source (chaff bullet / boss bullet / collision / boss body / beam / crown beam), % of hits, and how it was absorbed (shield / last-breath / fatal).
- **WHO SHOOTS YOU** — chaff-bullet hits attributed to the **firing enemy** (via bullet colour).
- **WHAT ACTUALLY KILLS YOU** — the same, but **fatal hits only**. *Always read this, not "all hits"* — most hits are absorbed chip; lethality is a different list (e.g. orbiter mines are ~40% of hits but the herald is ~63% of kills).
- **WHO BODY-CHECKS YOU** — collisions by enemy kind.
- **DEATH HOTSPOTS** — `cause @ wave`, ranked. The fastest way to find the wall.

## Which modes can be "won"

**Only ARENA and BOSS RUSH have a victory state** (`waves.ts` sets `d.win` only for these). The
other six — ENDLESS, DAILY, WEEKLY, NIGHTMARE, SOLSTICE (`longestday`), CASUAL — are
**survival / score-chase**: they end only on death, so `won` is never true. Every mode does
cycle the full boss roster, so a meaningful "beat it" proxy for the survival modes is **downing
the Sovereign** (`world.sovereignDown`, the 6th boss in the cycle).

## Measurement gotchas (each one cost hours — heed them)

1. **`threatFns` load race.** The bot `import()`s its beam/Sovereign-armor predicates async. A
   synchronous probe loop never yields, so right after a fresh page load they never resolve and
   the bot plays **blind** (no beam-dodge, no core-hunting) — win-rates collapse 60%→3%. Always
   `await` ~400ms after importing the bot and assert `window.__botState.threatFns` before measuring.
   `__metrics` does this for you.
2. **NG+ confound.** Winning auto-raises `save.ngPlusLevel` (caps at 8), which scales non-seeded
   intensity up to ~1.72×. A session of bot wins silently inflates difficulty, so the *same* bot
   "degrades" across a session. Pin it: `save.ngPlusLevel = 0; save.ngPlusActive = false` each run
   (or use `__metrics`, which pins + restores).
3. **Sample size.** Win-rate variance is huge — a 12-run sample can read 0% or 67% for a true ~45%.
   Use ≥25-30 runs for anything you'll act on.
4. **Don't over-run one eval.** ~100+ headless runs in a single `page.evaluate` can close the tab.
   Keep an eval under ~80 runs; split big sweeps.
5. **The bot dashes THROUGH bullet walls on i-frames**, so threading-fairness levers (herald gap
   width, telegraph) are invisible to it — those are *human* levers. The bot measures stamina-drain
   levers (frequency, density, count). Know which kind you're tuning.
