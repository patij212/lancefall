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
- ✅ **#1 OVERDRIVE** — combo-charged ultimate meter; tap F for a time-dilated screen-clearing nova. (`b25e088`)
- ✅ **#2 THE SOVEREIGN** — the 6th & final boss: armored crown + 3 orbiting Cores, gravity-warped bullets, CROWN BEAMS + NOVA SPIRAL; now in Endless / Arena (15 waves) / Boss Rush; +2 achievements. (`a11a36d`)
- ✅ **#3 CLUTCH moments** — LAST BREATH (auto bullet-time second wind) + COMBO ERUPTION (bullet-clearing nova at ×50/×100…). (`a78892a`)
- ✅ **Adversarial review** — 22 agents / 4 dimensions; 8 verified findings, all fixed (Sovereign armor invariant centralised in `spearBlocked()`; Cores made dash-only; ERUPTION spares boss bullets; `gravityPull` hot-path alloc inlined; nova ring camera-projected). (`5465800`)
- ✅ **#4 POWER-UP DROPS** — 5 temporary build-agnostic buffs (OVERREACH / HASTE / FRENZY / GREED / AEGIS) from bosses + elites; HUD badge + aura + pickup orbs. (`8b36d8e`) + focused review (8 agents): the **Daily-determinism break** (drops drew from the shared `world.rng`) fixed with a separate per-run `dropRng`. (`04dc822`)
- ✅ **#5 Cosmetic dash-trail unlocks** — 6 trail styles on the title (PULSE/EMBER/FROST/VOID/ACID + CROWN, the Sovereign-kill prestige trail); pure-cosmetic, save schema v3→v4. (`9a26b05`)
- ✅ Redeployed to the live alpha; **210 tests**, tsc clean, build clean, zero console errors; owner save restored.

Deferred (room for a future v5): weekly challenge + board, per-boss music themes.

— v4.0 shipped: **OVERDRIVE ultimate · THE SOVEREIGN (6th boss) · LAST BREATH + COMBO ERUPTION · POWER-UP DROPS · cosmetic dash trails**, capped by adversarial-review passes (12 findings fixed).
