# LANCEFALL — improvement loop devlog

Self-paced `/loop` ("10x keep improving the game, build marvelous creations").
One substantial, verified, committed improvement per iteration. Target ~10.

## Rough roadmap (adapt as I go)
1. Animated deep-space background — parallax starfield + drifting nebula
2. Score popups + kill-streak / combo-tier announcements
3. Game-over build recap (ship + perks) + build-aware share string
4. Daily Challenge surfacing (date, daily best, result)
5. Cosmetic palette themes (shard-unlockable reskins)
6. New content — a 4th ship or 3rd boss
7. Achievements / milestones + a lifetime-stats screen
8. Gated diegetic onboarding tutorial
9. Audio — adaptive boss music + SFX polish
10. Final balance/juice tuning + perf + docs refresh

## Log
<!-- newest last; each entry: iteration, what shipped, commit -->
- **Iteration 1** — Animated deep-space background: parallax twinkling starfield + drifting tinted nebula clouds (additive, combo-reactive heat), screen-space behind the camera so it stays calm. Readability preserved (dim, low-alpha). `render.ts` only.
- **Iteration 2** — Score juice: per-kill floating `+score` popups (tier-colored) and big center combo-milestone announcements (RAMPAGE→FRENZY→CARNAGE→UNSTOPPABLE→GODLIKE→LEGENDARY) with shake + flash + ding. Tier tracked per chain, resets on combo break. `game.ts`, `ui.ts`, `style.css`, `world.ts`.
- **Iteration 3** — Game-over build recap: shows the ship + every perk taken with stack counts (e.g. "LANCE · Long Lance×2, Chain Reaction×3"); the COPY SCORE share string now embeds the build too. `perks.ts` (describeStacks), `save.ts`, `game.ts`, `ui.ts`, `style.css`.
