# Automated playtest sweep — every mode × every Heat (2026-06-20)

Driver: the PRO autopilot in `tools/balance-bot.js` (v2, PARRY-aware), run headless via
`__heatSweep(mode, heats, runs, cap)`. All cells pinned **NG+0**. "Win" = a real victory
state (Arena/Boss Rush only); for the survival modes the beat-it proxy is **Sovereign-down**
(`world.sovereignDown`, the 6th boss). Numbers are win% / Sovereign% unless noted.

## The headline

The enemy + boss overhaul had **regressed the bot to 0% Arena wins** — 75–100% of runs
*stalled* (never died, never finished) on enemies it could no longer kill. After teaching it
the new mechanics it is a genuinely capable player again:

| Mode | Heat 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Verdict |
|------|----|----|----|----|----|----|----|----|---------|
| **Boss Rush** | 100 | 83 | 100 | 92 | 100 | 75 | 92 | **67** | **Solved — wins at every Heat incl. MELTDOWN** |
| **Arena** | 17 | 13 | 8 | 4 | 0 | 0 | 0 | 0 | Winnable at low Heat; chaff gauntlet walls it ≥H4 |
| **Casual** | ~40* | — | — | — | — | — | — | — | Downs the Sovereign (*needs ~840 s; eased mode) |
| **Endless** | boss 3–4 | | | | | | | | No Sovereign-down (chaff escalation) |
| **Daily** | boss 3 | | | | | | | | Seeded Endless; same ceiling |
| **Weekly** | boss 3 | | | | | | | | Hardest seeded mode (this week's seed) |
| **Solstice** | boss 4–5 | | | | | | | | Cipher bosses reached; no Sovereign-down |
| **Nightmare** | boss 1–2 | | | | | | | | Sudden-death shrinking walls — likely beyond human too |

Boss kill-rates in Arena (the bosses are NOT the wall): Warden 100 / Weaver 100 / Beacon 94 /
Mirrorblade 100 / Hollow 100 / **Sovereign 80**. Runs are lost in the **chaff waves between
bosses**, not at the bosses.

## What broke the bot, and the fixes (all in `tools/balance-bot.js`)

1. **Shielded stragglers.** Only `darter`/`orbiter` can be shielded; their shield tracks the
   player and clangs the head-on spear, so the last 1–2 of them never die → the wave never
   empties → **stall**. The riposte does *not* fix this (the engine only runs the enemy
   counter-burst when the parry also catches a bullet — a bare melee darter can't be parried).
   The shield-proof kills are **Overdrive nova (360 px)**, the **dash skewer-through** (the
   block test uses the dash-*start* angle, which falls outside the cone once you've shot past),
   and the **Nova-Dash launch shockwave**. Bot now uses all three + a "stuck" detector.
2. **Enraged Beacon cross-beam.** Below 50 % HP Beacon fires a **2-arm cross** (`arms=2`) the
   bot didn't model, so it dodged *into* the second arm and died at the wave-12 wall. Routing
   Beacon through the engine's `beamHitsPoint(arms)` took **Boss Rush ~50 % → ~95 %**.
3. **Stamina-starved deaths.** Telemetry: avg stamina at death **62 (< 1 dash)** — the bot
   spent its reserve hunting and couldn't dash through the wall that killed it. Raised the
   offensive-dash floors + added a low-stamina chaff kite.
4. **Wrong target priority.** It hunted the *nearest* chaff; the *dangerous* chaff (orbiter
   bullets+mines+body, herald gap-walls, seeker bolts) are the real killers. Threat-weighted
   targeting lifted **Arena H0 from 0 % → 17 %**.
5. **PARRY taught** — Mirrorblade lunge-stagger, reflectable-orb reflect, defensive deflect.

## Balance observations for the game (not bot issues)

- **Casual is slow to "see the ending":** brooders hatch new chaff faster than a clear, so the
  eased mode needs ~840 s (14 min) of clean play to reach the Sovereign — at odds with its
  "let anyone see the content" goal. Worth a look at brooder hatch-rate / spawn density.
- **Wave-14 herald wall** is the Arena death hotspot (~28 % of fatal hits = herald) — matches
  the intended "pre-Mirrorblade climax" note in `modes.ts`. Fair, but it *is* the wall.
- **Nightmare + Heat** kills even an optimal dasher at boss 1–2 every time (sudden-death
  shrinking walls). Confirm that's the intended brutality and not accidentally unsurvivable.
- **Heat scales cleanly** — the death wave compresses smoothly with Heat across every mode.

## How to reproduce

```js
// devtools console on a dev build (or: node tools, headless)
await import('/tools/balance-bot.js');
await new Promise(r => setTimeout(r, 450));         // let threatFns resolve
await __heatSweep('arena', [0,1,2,3,4,5,6,7], 16);  // win/sov% per Heat, NG+0 pinned
__watch('bossrush');                                 // or watch it play, live + rendered
```
