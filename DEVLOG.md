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
- **Iteration 4** — Daily Challenge surfacing: title caption "Daily Challenge · <date> · your best <n>" and an in-run "◆ DAILY" HUD badge so the seeded run is identifiable. `ui.ts`, `game.ts`, `style.css`.
- **Iteration 5** — Cosmetic palette themes (5: Neon/Sunset/Toxic/Vapor/Mono), shard-unlockable + persisted. Retints player ship, the UI accent (`--cyan`), and the nebula backdrop; enemies/bullets stay fixed for readability. Title palette swatch row. `themes.ts` (new), `render.ts`, `save.ts`, `game.ts`, `ui.ts`, `style.css`.
- **Iteration 6** — Third boss, THE BEACON: a brand-new hazard — a rotating diameter LASER that telegraphs → fires → rests while sweeping; lethal only when active, and dash i-frames phase you through it. Alternates Warden→Weaver→Beacon. Verified lethality (on-beam dies, off-beam safe, dashing safe). `tune.ts`, `types.ts`, `boss.ts`, `render.ts`, `game.ts`, `waves.ts`.
- **Iteration 7** — Achievements (12) + a lifetime-stats screen. Achievements evaluate on game-over against run + lifetime totals, toast on unlock; new STATS title screen shows lifetime totals + a got/locked achievement grid. `achievements.ts` (new, +tests), `save.ts`, `world.ts`, `game.ts`, `ui.ts`, `style.css`. 99 tests.
- **Iteration 8** — Roster 3 → 5 ships: TEMPEST (nimble — fast drift/accel, quick regen, slightly shorter dash) and PHANTOM (knife-edge — 1 stamina segment, fastest regen, 1.6× dash, +speed). Verified in-game stat application. `ships.ts` (+tests, 101 total).
- **Iteration 9** — Adaptive boss audio: a dissonant tritone tension voice fades into the drone while a boss is alive and out on death, plus a triumphant rising stinger when a boss falls. Lifecycle verified (added on spawn, removed on kill, no leaks). `audio.ts`, `game.ts`.
- **Iteration 10** — Wrap-up: docs refreshed to v1.2 (README/DESIGN/CLAUDE.md), backing-store DPR capped at 1.5 for hi-DPI fill-rate headroom, final integrated verification (101 tests, clean build, perf under extreme load, a full bot run reaching the first perk draft, zero console errors). Loop complete. `game.ts`, docs.

— Loop complete (10/10). The game grew from a single ship + one boss into a full roster-and-progression arcade title with 3 bosses, 5 ships, 10 perks, themes, achievements, a daily challenge, an animated cosmos, and adaptive audio.

## Masterpiece push (make it Steam-worthy)
Driven by a multi-agent masterplan audit (`lancefall-masterplan` workflow): enemy/boss/perk/meta/modes/biome/music/UX/difficulty specs + harsh reviewer critique.

- **M2 — Game modes + a winnable ARENA (the #1 reviewer ask: a real "beat it" goal).** New `modes.ts` with a `RunConfig` per mode (replaced the `daily` boolean throughout). Modes: ENDLESS, ARENA (scripted 12-wave gauntlet → VICTORY), DAILY, NIGHTMARE (cranked dials, ×1.75 shards), BOSS RUSH (3 bosses back-to-back). Director rewritten to be mode-aware (time-driven vs scripted arena/bossrush); added a victory flow + VICTORY game-over; mode picker on the title + mode HUD badge; mode shard multipliers; forced-boss spawns. Director progression verified in isolation (Arena: win after 12 waves/3 bosses/6 drafts; Boss Rush: win after 3 bosses). `modes.ts`, `waves.ts`, `boss.ts`, `game.ts`, `ui.ts`, `style.css`.
- **M3 — Three new enemy archetypes (variety the roster lacked).** LANCER (telegraphed sniper: locks aim, shows a dashed laser-sight, fires one fast precise shot — punishes standing still), BOMBER (rushes you, detonates a 14-bullet ring on death — punishes killing it adjacent), WISP (packs of 5 fast tiny chasers in a crescent — multi-kill-dash fodder). Full pipeline: types/tune/enemies AI/render/waves intro+weights/death-effects. Verified render (aim-lines read great) + bomber detonation (0→14 bullets). 4 enemies → 7. `types.ts`, `tune.ts`, `enemies.ts`, `render.ts`, `waves.ts`, `game.ts`.
- **M4 — Fourth boss: THE MIRRORBLADE (dash-duelist).** A red echo of the player that winds up (shows a lunge aim-line), fires a parting fan, then ROCKETS along a committed line — its body lethal mid-lunge — then recovers (vulnerable). Enrages under 50% HP (faster, chained dashes). Dash speed tuned so it can't tunnel at 60fps; you dash *through* it (i-frames) to land hits. Now 4 bosses cycle (Warden→Weaver→Beacon→Mirrorblade); added to Boss Rush. Verified duel collision (contact kills, dashing safe). `types.ts`, `tune.ts`, `boss.ts`, `render.ts`, `waves.ts`, `modes.ts`, `game.ts`.
- **M8 — Biome system (a run that evolves).** Every 45s the run cycles through 5 biomes — THE VOID, EMBERFIELD (rushers), THE LATTICE (ranged), BLOOMGARDEN (swarm), NULLSPACE (fast+shielded) — each retinting the nebula backdrop, biasing the enemy mix, and applying a light speed/shield modifier, with an entry banner. Biome tint overrides the cosmetic theme nebula during play (theme still owns ship/UI). Verified cycling + bias + tint. `biomes.ts` (new), `render.ts`, `waves.ts`, `game.ts`.
- **M6 — Procedural music layer.** A lookahead beat sequencer (112 BPM, 16th grid, scheduled on the audio clock) adds kick + bass + a pentatonic arp over the existing drone — A-minor pentatonic so it's consonant by construction. Layers fade in with run intensity (arp engages as the wave heats up); the arp drops darker during boss fights. Folded into start/stopDrone (game untouched), gated by the music volume slider. Tempo + lifecycle verified (can't audition headlessly). `audio.ts`.
- **M5 — Rich run-summary debrief.** The game-over screen now reads like a real post-run report: a "felled by <cause>" subtitle (bullet / boss bullet / collision / the boss / the beam — tracked through playerDie), a personal-best delta ("+41,978 over your best!"), the full build line (mode · ship · perks), and inline newly-unlocked achievement chips (replacing the old toasts). `game.ts`, `ui.ts`, `style.css`.
- **M1 — Permanent meta-progression tree.** Shards now buy lasting upgrades from a 12-node UPGRADES shop (Quick Recovery, Long Reach, Keen Edge, Grazer, Momentum, Combo Memory, Iron Will, Scavenger, Treasure Hunter, Fortune=+1 draft card, Head Start=begin with random perks, Second Chance=revive once/run). Nodes apply to base RunStats before ship/perks (deriveStats order: base→meta→ship→perks). Added score/shard multipliers, draftSize, revive tokens, head-start perks. Revive verified (consumes token, clears screen, survives; 2nd hit kills). The "one more run" engine. `meta.ts` (new), `perks.ts`, `save.ts`, `world.ts`, `game.ts`, `ui.ts`, `input.ts`, `style.css`.
