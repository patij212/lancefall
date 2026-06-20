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

## Steady-state grid (Node harness, 30 runs/cell · Casual 24)

A higher-sample re-run via the headless Node harness (`tools/balance-node.mjs`) — the noisy
12-run browser numbers smoothed out. arena/bossrush = win%; the rest = Sovereign-down%.

| Mode | H0 | H1 | H2 | H3 | H4 | H5 | H6 | H7 |
|------|----|----|----|----|----|----|----|----|
| **Boss Rush** | 87 | 93 | 93 | 100 | 83 | 87 | 67 | **40** |
| **Arena** | 10 | 13 | 0 | 3 | 3 | 0 | 0 | 0 |
| **Casual** (Sov%) | 38 | 42 | 46 | 17 | 67 | 0\* | 0\* | 0\* |
| Endless / Daily / Solstice / Weekly / Nightmare (Sov%) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- **Boss Rush is solved at every Heat**, MELTDOWN (H7) settling at **40 %** over 30 runs.
- **Casual genuinely beats the game** — the Sovereign goes down **38–67 % at Heat 0–4** (median
  run kills 5 bosses, ~785 s). `*`H5–7 read 0 % but are **cap-limited**: high-Heat Casual was
  given a 32k-frame cap on the assumption it dies fast, but it actually survives and stalls at
  boss 3–4, so the true rate there is low-but-untested (full-cap Casual is ~20 s/run, expensive).
- The escalating survival modes (Endless/Daily/Weekly/Nightmare) stay **0 %** — the bot is
  boss-competent but chaff-survival-limited, and those modes out-escalate it before boss 6.

## SOLSTICE — cipher mastered (0 % → 4–8 % Sovereign-down)

A focused follow-up taught the bot the **SOLSTICE PROTOCOL cipher**: its bosses are armored until
the orbiting cores are dashed in the *decoded order*. The bot can read the order straight off
`w.cipher.order[progress]` (a core carries its slot in `.phase`), so it now solves deliberately.
A death-cause trace showed the real wall wasn't the cipher (it solves ~4×/run) but **dying at
Weaver to bullets** — the cipher-locked fights dragged and the bot loitered in the bullet field.
Three fixes (in `tools/bot-core.mjs`): solve via a safe **mode-3 dash**, draft **damage perks**
for cipher-lock modes, and — the big one — **stamina-aware positioning** (crowd the ring only when
ready to key; otherwise kite out to regen). Boss-reach over 24 runs went Warden 24, Weaver 17→**23**,
Beacon 5→**16**, Hollow 2→**10**, **Sovereign reached**; median boss kills **1 → 4**, and Solstice
Sovereign-down **0 % → 4–8 %** (H0–2). No regression (Boss Rush 100/100/57 %, Arena 6 %/0 %).

## Survival ceiling pushed — candidate-direction dodge (broad win)

The bot's deepest limiter was raw bullet survival (it died stamina-starved in escalating chaff
before boss 6). A **parallel A/B workflow** tried 5 dodging hypotheses against a churn-proof frozen
snapshot; two won and merged into one change in `tools/bot-core.mjs`:

- **Candidate-direction movement dodge** — instead of summing a perpendicular nudge per bullet
  (which can vector-cancel or steer *into* a second shot), sample 16 move directions and pick the
  one whose closest approach to any bullet over a ~0.45 s drift is safest.
- **Wider/earlier awareness** — scan bullets to 460 px (was 360) with a 1.1 s horizon (was 0.7),
  leaning out of a forming wall before it's lethal.

Large-sample A/B (50 runs/cell, frozen src) — **improved or held every cell, zero regression**:

| | baseline → merged |
|---|---|
| Endless H0 median survival | **206 → 401 s (+94 %)** (medBoss 1→3) |
| Endless H2 | 267 → 377 s (+41 %) |
| **Boss Rush H7 (MELTDOWN)** | win **40 → 76 %** |
| **Arena H0 / H2** | win **8→24 % / 6→16 %** |
| **Solstice** (40-run confirm) | median boss kills **1 → 5** (now reaches the Sovereign reliably) |
| Daily | medBoss 2→3, longer survival |

(Rejected: graze-for-stamina — Boss Rush 90→73. Neutral: escapeplus, spacing — gains were noise.)
Nightmare stays walled at boss 1–2 — its sudden-death shrinking walls aren't a dodging problem.
**Net: the single biggest capability jump of the whole pass — it lifts survival, boss fights, and
Arena/Boss-Rush win-rates together.** Sovereign-down in the open survival modes is still the final
hurdle (the bot now *reaches* the Sovereign; *downing* it consistently is the remaining ceiling).

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
