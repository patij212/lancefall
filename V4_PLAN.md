# LANCEFALL v4 — "make it more fun" (autonomous overnight build)

Mandate: 6 hours, full autonomy, make the game more FUN + spectacular, keep the
live alpha (https://lancefall.pages.dev) improving. Rhythm: design (workflow) →
build sequentially → verify (tsc + vitest + build + in-browser) → commit → redeploy.

## Candidate fun-levers (to be sequenced by the v4 design workflow)
- OVERDRIVE / ultimate meter — a combo-charged screen-clearing power-fantasy burst.
- Power-up drops — bosses/elites drop temporary buffs (twin spear, bullet-time, magnet, shield) for spikes of power.
- A 6th / final boss — a climactic encounter + spectacle.
- Weekly Challenge + weekly leaderboard — retention (reuses daily infra + mutators + the live worker).
- Cosmetic unlocks — dash-trail styles / ship skins via achievements/shards.
- Audio/juice expansion — per-boss themes, richer SFX, more spectacle.
- Wildcard — anything that maximizes joy.

## Invariants (do not break)
- Daily determinism (separate rng for cosmetic/personal choices; no extra world.rng for archetype/relic offers).
- Offline-first: game works with no backend; leaderboard fire-and-forget.
- 164 tests green, tsc clean, build clean, zero console errors before each commit.
- After in-browser tests, restore the owner save (highScore 46472, bestCombo 31, handle '').
- Save schema via migrate.ts (currently v3); bump once per schema change.

## Progress
- (kicking off v4 design workflow)
