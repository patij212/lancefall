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
- ✅ **#6 Per-boss music themes** — each of the 6 bosses layers a distinct drone chord + arp colour over the soundtrack (Sovereign = grand 4-voice). Pure `bossThemes.ts`. (`39b5b2d`)
- ✅ **#7 REAVER ship** — a 6th ship: snowball aggression (dash-kills refund stamina, wider bite; slow regen + weak graze refund). Pure `ships.ts` profile. (`91c730c`)
- ✅ **#8 BROODER enemy** — a 10th enemy: a slow spawner pod that hatches up to 4 mini drones (telegraphed); prioritise it or get flooded. (`76405e8`)
- ✅ **#9 Discoverability pass** — HOW TO PLAY codex + title legend now teach OVERDRIVE [F], Combo Eruption, power-ups, Last Breath, the Sovereign's cores, and the unlockables. (`302a462`)
- ✅ **Cumulative review (10 agents)** — over the not-yet-reviewed features + cross-feature interactions. Clean except 2 real BROODER bugs (subPhase not reset on pool recycle → inert duds; hatches drew world.rng → Daily desync), both fixed + 3 regression tests. (`83684dc`)
- ✅ Redeployed to the live alpha; **220 tests**, tsc clean, build clean, zero console errors; owner save restored.

Deferred (needs the user's go-ahead — touches the live worker backend): weekly challenge + online board.

— v4.0 shipped: **OVERDRIVE ultimate · THE SOVEREIGN (6th boss) · LAST BREATH + COMBO ERUPTION · POWER-UP DROPS · cosmetic dash trails · per-boss music**, capped by adversarial-review passes (12 findings fixed).
