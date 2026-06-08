# LANCEFALL — Design

> Design record for the build. The concept was chosen via a multi-agent design
> tournament (6 concepts across distinct genre lenses → 3 judges → an 8-facet
> implementation bible). LANCEFALL won on *marvel × fun × one-session
> achievability*, filling the portfolio's biggest gap: a juicy real-time action
> game.

## Pillars

1. **The dash is the whole game.** One verb — a charged momentum dash — is simultaneously the movement, the weapon (a swept spear), and the defense (i-frames). Mastery is *routing*: threading dense bullet patterns while lining enemies up for a single skewer.
2. **Feel over content.** A tight, juicy core (4 enemies + 1 boss) tuned to a mirror shine beats a sprawling roster. Every effect routes through one global `timeScale` + hitstop/tween spine so juice layers for free.
3. **Greed vs. survival.** The combo decays in 1.5s and stamina gates the dash; grazing bullets is the pressure valve that lets aggressive play sustain itself. The game is a risk dial the player holds.
4. **Zero friction, zero backend.** Static, offline, no downloads. Daily-seed determinism + a copyable score string are the shareable "leaderboard."

## Core loop (30 seconds)

Enemies converge from the edges and bloom telegraphed bullets → you weave through gaps → time a dash to phase *through* a bullet wall while spearing a line of enemies → chain the kills for combo + a slow-mo flourish → land, drift, graze to claw stamina back → repeat. Every ~45s a Warden mini-boss crescendo.

## Systems

- **Charge-dash** — hold 0–0.45s → dash length 180–560px; travel ≈ len/3000 s; i-frames = travel + 0.07s grace; commit direction on release (no mid-dash steering — that's the skill). Post-dash momentum carries into drift.
- **Stamina** — 3 segments × 100; dash costs one; regen 75/s after a 0.35s lockout; graze refunds 16. Sustainable ≈ 1 dash / 1.5s passive, near-continuous when grazing well.
- **Combo** — kills refresh a 1.5s window; multiplier = 1 + combo·0.1 (cap ×12); multi-kills in one dash add an in-dash score bonus; ≥3-kill dash triggers slow-mo.
- **Graze** — bullet within the graze ring (not the hitbox) and approaching → stamina + score + an extension to the combo timer (with the Graze-Burn perk it also scorches the nearest enemy).
- **Difficulty** — a single intensity `I(t)` (ramps 0→1 over 4 min, then unbounded) drives spawn cadence, density, concurrency, and enemy/bullet speed; archetypes unlock by time (stealth tutorial); shields appear late.
- **Enemies** — darter (charger), orbiter (ranged harasser), splitter (dies into 2 minis), bloomer (radial bullet rings); Warden boss alternates a rotating spiral and aimed fans with a rest-window opening.
- **Perks** — 3-of-6 draft every ~30s and after each boss; all stack: Long Lance, Second Wind, Graze Burn, Chain Reaction, Afterimage, Time Thief.

## Juice spec (the marvel)

Trauma screen-shake (shake = trauma², quadratic decay); hitstop 45–90ms scaled by chain size (max(), capped, so massacres don't slideshow); slow-mo to 0.30× for ~120ms on ≥3-kill dashes with an audio whoosh on snap-back; 20–40 additive death-burst particles + trail ribbons + shockwave rings; chromatic aberration that scales with combo (channel-split, gated, off under reduce-flashing); velocity-lean camera + punch-zoom; reactive synthesized audio where the kill *thunk* pitches up with combo and an adaptive drone layers voices with intensity.

## Architecture

Layered: a **pure sim** (`rng, vec, pool, collision, dash, combat, perks, waves, enemies, boss, tune`) with no DOM — fully unit-tested; a **juice/io** layer (`scheduler, shake, particles, audio, render, input, ui, save`); and `game.ts` as the sole orchestrator (fixed-timestep loop, state machine, and the feedback glue that turns sim events into juice). `tune.ts` is the single source of truth for every gameplay number.

## Scope

**Shipped (v1):** the full dash/stamina/combo/graze loop; 4 enemies + Warden; endless director; 6-perk draft; the complete juice stack; reactive audio; daily seed; high-score/best-combo/shards; title/pause/game-over/settings; keyboard+mouse, gamepad, touch; accessibility toggles.

**Added (v1.1):** a 3-ship roster with shard-based meta-progression (Lance/Glaive/Bastion, each a distinct stat profile applied before perks); the perk pool expanded 6→10 (Heavy Lance, Siphon, Slipstream, Nova Dash); a second mini-boss, the Weaver (pinwheel + safe-lane pulse rings), alternating with the Warden; boss-spawn/death screen flashes; resume-protection i-frames; daily-best surfacing. 92 sim tests.

**Deferred (engine supports, future sessions):** palette/skin packs, a dedicated daily-seed UI screen, controller-rumble depth, perk evolutions. Each is a future session, not a gap.

## Autonomy note

This was built in an autonomous overnight session. The brainstorming skill's design-approval gate could not be satisfied (the user was asleep) and was waived per the user's explicit instruction to build independently and the playground's "creative autonomy" mandate. This document stands in for the approved spec.
