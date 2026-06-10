# LANCEFALL — Autoplay Balance Probe

A headless playtest run on **2026-06-10**. A scripted "dodge-and-dash" bot drives the
*real* game (`Game.frame()` with synthetic timestamps; `requestAnimationFrame`,
`render`, and `updateHud` stubbed) so thousands of sim-steps run per second with the
genuine sim, director, spawns, drafts, bosses, clutch, and overdrive all live.

The bot is a **cautious intermediate** player: it flees incoming bullets, repels off
close (contact-lethal) enemies and walls, drifts to gems when safe, aims at the
nearest enemy, and charge-dashes into reachable targets (firing OVERDRIVE when full).
It does **not** chain combos aggressively, so its numbers are a *floor*, not a ceiling
— a skilled human survives far longer. The value is the **relative** signal across
modes, the **shape** of the difficulty curve, and **determinism/perf** verification.

Reproduce: paste `tools/balance-bot.js` into the devtools console on the running game
(`npm run dev`), then `await __sweep()`.

## Results (per mode, n runs, 120–150 s step cap)

| Mode      | median surv | mean | max   | win rate | notes |
|-----------|------------:|-----:|------:|---------:|-------|
| endless   | **62 s**    | 67 s | 113 s | n/a      | smooth ramp, no spike |
| daily     | **62 s**    | —    | —     | n/a      | **bit-identical across 3 runs** (det. ✓) |
| nightmare | **46 s**    | 56 s | 106 s | 0        | harder than endless ✓ |
| arena     | **31 s**    | 24 s | 48 s  | 0        | ramps harder/faster (focused gauntlet) |
| bossrush  | **25 s**    | 39 s | 148 s | 0        | boss gauntlet, high variance |

Difficulty ordering is intuitive and correct:
`bossrush < arena < nightmare < endless ≈ daily`.

## Findings

1. **No instant-death or unwinnable spike.** The opening minute is gentle; once a run
   gets going the earliest deaths cluster ~22–42 s — never in the first few seconds.
2. **Daily determinism holds under autoplay.** Three bot runs of the daily seed
   produced *identical* time/score/boss-kills (62.1 s · 14 028 · 1) — confirming the
   cosmetic/personal state (coherence, ghost, narrator) never perturbs the seeded
   sim. This is the single most important invariant and it is intact.
3. **Performance has enormous headroom.** Peak concurrent bullets **118** against a
   **1600** pool cap; peak enemies **11** (cap ~26). The screen never approaches
   saturation, so there's no readability-by-overload or GC-pressure risk.
4. **Bullet density tracks bosses, as designed.** Average on-screen bullets spike at
   ~45 s and ~90 s — exactly the `bossInterval` crescendos. Between bosses the field
   is calm (0–7 avg). The breathe-then-bloom rhythm is working.
5. **No bot got "stuck."** Drafts and mid-run events resolve cleanly (bot picks slot
   0); no soft-locks, no NaN, zero console errors across ~50 runs.

## Conclusion

The foundation is **solid**: the curve is well-shaped, the modes are ordered
sensibly, the daily is deterministic, and there is massive perf headroom. There is no
balance emergency to fix. The right investment is **adding joy** (new content / feel),
not re-tuning a healthy game. Any future tuning should be validated against *skilled*
play (a stronger bot or human telemetry), since this bot only exercises the early-mid
curve.
