# ⚔️ LANCEFALL

> 🎮 **Play the open alpha: https://lancefall.pages.dev** &nbsp;·&nbsp; global leaderboards live (set a handle on the RANKS screen).
> Hosted on Cloudflare Pages; leaderboard backend on a Cloudflare Worker + D1 (`worker/`). Redeploy the client with `npm run deploy`.

> **🗝️ THE LAST KEY edition** (June Solstice Game Jam — an ode to Alan Turing). The fall of Lancefall was an *encryption*: the Six scrambled the city's light into grey noise. You are the last **key**. Break each boss's **cipher-lock** — read the code and dash its glyph-cores in the decoded order — to decrypt the city back to its **longest day**. THE CHOICE on the final kill is the one cipher no machine can solve, only choose (the halting problem); the Mirrorblade is the imitation game. New this edition: the **cipher-lock** mechanic, **THE LONGEST DAY** mode (every boss is a cipher), **DAYBREAK** ultimate, and a full Turing×solstice re-narration. *memory = light-code · forgetting = encryption · remembering = decryption.*

> **A neon dash-combat bullet-hell.** Your only weapon is a *momentum dash* — charge it, release, and rocket through the swarm leaving a glowing trail that shreds everything in its path. Phase through a wall of bullets, skewer four enemies in one line, land, drift, recharge, repeat. Chain kills before the combo decays. Survive.

LANCEFALL is the playground's first **juicy real-time action game** — Geometry Wars meets Luftrausers meets a Hyper-Light dash-attack, running at 60fps in a single browser tab with zero downloads.

![LANCEFALL](./public/favicon.svg)

---

## The hook

You don't shoot. You **dash**.

- **Hold** to charge a thrust (mouse / Space / right-trigger), **release** to fire it in your aim direction.
- While dashing you're **invulnerable** and your trail is a **spear** — it kills everything it touches.
- Dashing costs a segment of a **3-segment stamina bar** that auto-refills, so you can't spam it…
- …unless you **graze** — skimming bullets *without* dying tops your stamina back up and rewards staying dangerous.
- Killing several enemies in **one dash** builds a **combo** that decays fast. Greed vs. survival.
- Every 45s a **Warden** mini-boss forces you to read a bullet pattern and find the opening.
- Every few waves you **draft a perk** (3 of 10, they stack) — chain explosions, longer lance, graze-burn, nova dash, siphon, time-thief… — and watch your build snowball into a perpetual-motion massacre.

## Features

- ⚔️ **Charge-dash combat** — swept-capsule spear collision, i-frames, momentum carry, commit-on-release routing.
- 🎮 **6 game modes** — **Endless**, **Arena** (a hand-built **15-wave / 6-boss** gauntlet you can actually **win**), **THE LONGEST DAY** (a solstice mode where *every boss is a cipher-lock* — the code-breaking showcase), **Daily Challenge** (seeded + a rotating mutator, same for everyone), **Nightmare** (cranked + ×1.75 shards), and **Boss Rush** (all six bosses back-to-back).
- 💀 **12 enemy archetypes + elite Champions + 6 bosses**, all shape-coded (colorblind-friendly): darters, orbiters, splitters, turret-bloomers, **lancers** (snipers), **bombers**, **wisp** swarms, **drifters** (arc-fan zoners), **shades** (teleporting ambushers), **brooders** (spawners), the gap-wall **HERALD** and homing **SEEKER**, gold-aura **Champions** — and a boss cast of cipher-keepers: **Warden**, **Weaver**, **Beacon**, **Mirrorblade** (the imitation game), **THE HOLLOW** (the one-time key — damage it only through its Clone-Sync flash), and **THE SOVEREIGN** (the master cipher: dash its orbiting cores in the decoded order to crack the crown).
- 🔥 **Heat ascension** — an 8-level prestige ladder (COLD→MELTDOWN) that stacks difficulty for up to ×3.2 score. The veteran score-chase.
- 🎲 **Run mutators + mid-run events** — the Daily rolls 1-2 mutators (Glass Cannon, Bullet Storm, Fog of War, Berserk…) for a distinct identity; mid-run shrines/gambles/treasures/cursed pacts offer pause-and-choose risk/reward.
- ◈ **Build archetypes + ☠ cursed relics + ⧬ build DNA** — pick a build path that biases your draft; grab double-edged relics for high-risk power; copy your whole build as a shareable code.
- 🌍 **Evolving biomes** — a run cycles through THE COURT → THE EMBERWALL → THE VAULTS → THE BLOOMGARDENS → THE WARRENS → THE NULL, each retinting the world, shifting the enemy mix, and twisting the rules.
- ⬆️ **Permanent meta-progression** — a 12-node UPGRADES tree (regen, reach, graze, score/shard gains, an extra perk card, head-start perks, a per-run **revive**) bought with banked shards. The "one more run" engine.
- 🚀 **5-ship roster** — Lance (balanced), Tempest (nimble), Glaive (glass cannon), Bastion (tank), Phantom (knife-edge). Each a genuinely different playstyle.
- 🃏 **In-run perk draft + fusion evolutions** — 3-of-**11** stacking upgrades that compound into wild builds (offensive *and* defensive — Riposte shatters bullets on the dash), plus **7 evolutions** (IMPALER, SUPERNOVA, PERPETUAL, WRAITH, INFERNO, JUGGERNAUT, AEGIS): stack the right recipe and a build-defining fusion capstone unlocks as a guaranteed glowing draft slot.
- 🏅 **Optional online leaderboards** — per-mode global boards + a shared daily, served by a tiny deploy-ready Cloudflare Worker (`worker/`). Offline-first: the game is identical without it; set `VITE_LEADERBOARD_URL` to light up the RANKS screen.
- 🎨 **Cosmetic palette themes** (5 shard-unlockable reskins) · 🏆 **achievements + a lifetime-stats screen** · a rich **run-summary debrief** (death cause, PB delta, achievement chips).
- 🌀 **The juice stack** — parallax starfield + nebula, trauma shake, hitstop, slow-mo, bloom, chromatic aberration, dash-trail ribbons, `+score` popups, combo-tier callouts (RAMPAGE→LEGENDARY), velocity-lean camera, punch-zoom, screen flashes.
- 🔊 **Hybrid audio** (Web Audio) — free-licensed **authored beds** (an AURORA arena suite + a WARDEN boss gear-change) play under a **procedural reactive layer** that carries the recurring LANCE THEME motif, the dash-on-beat snare, and the COHERENCE shimmer; vertical intensity opens the bed's filter with flow. Sampled combat SFX layer over the synth transients. Every shipped asset is CC0/CC-BY/Pixabay with a machine-checked provenance ledger; the procedural engine is also the resilient fallback when assets are missing (a run is never broken). Combo-pitched *thunks*, per-boss music themes, victory stinger.
- 🎮 **Keyboard + mouse, gamepad, and touch** (twin virtual sticks on phones).
- ♿ **Accessibility** — reduce-flashing, reduce-motion, colorblind shapes, screen-shake slider, HUD scale, full volume controls.

## Controls

| Action | Keyboard / Mouse | Gamepad | Touch |
|--------|------------------|---------|-------|
| Move | `WASD` / arrows | left stick | left thumb-zone |
| Aim | mouse | right stick | drag right thumb |
| Charge-dash | hold `Space` / `J` / left mouse, release | hold `A` / `RT`, release | hold + release right thumb |
| Pause | `Esc` / `P` | Start | pause button |
| Pick perk | `1` `2` `3` / click | A | tap |
| Restart (game over) | `R` / `Space` | A | tap AGAIN |

## Tech

- **Vite + vanilla TypeScript** (no framework), **Canvas 2D**, **Web Audio API**.
- **Fixed-timestep accumulator** loop (sim @ 60Hz, render interpolated) decoupled from a single global `timeScale` so hitstop and slow-mo layer for free.
- **Object pools** for every entity (bullets, enemies, particles, gems) — zero allocation in the hot path.
- **Uniform spatial hash** broad-phase + segment-vs-circle narrow-phase for the dash spear (swept so fast dashes never tunnel).
- **mulberry32** seeded PRNG for deterministic daily runs.
- Cheap **chromatic aberration** via three channel-tinted offscreen composites; **bloom** via `globalCompositeOperation = 'lighter'`.

### Architecture

```
sim (pure, tested)      juice / io (impure)        glue
─────────────────       ───────────────────        ────
rng  vec  pool          scheduler  shake           game.ts   ← orchestrator + loop
collision  dash         particles  audio           main.ts   ← bootstrap
combat  perks  waves    render  input  ui  save     world.ts ← state + pools
enemies  boss  tune
```

The `sim` layer is DOM-free and unit-tested; `tune.ts` holds **every** gameplay constant in one place for tuning.

### Flagship audio (hybrid)

Authored beds + sampled SFX play over the procedural engine. The whole authored pipeline is pure,
unit-tested, and fronted by a build-time gate:

```bash
npm run audio:conform    # trim each master to a bar-aligned loop + equal-power seam + loudnorm → 48 kHz WAV
npm run audio:encode     # WAV → Opus(.ogg) + MP3, mirrored under public/audio/flagship/
npm run audio:validate   # 48 kHz, integer-bar loops, ≤ 8 MB, + the provenance/license gate (fails the build otherwise)
```

- **Sourcing & licensing.** Every shipped asset is recorded in `public/audio/flagship/provenance.json`
  with an **allowed** license (CC0 / CC-BY / Pixabay / royalty-free); the validator hard-rejects
  NC / SA / GPL / AI / unlicensed material. CC-BY credits live in `docs/audio/CREDITS.md` (and belong
  on the in-game credits screen before shipping). The shortlist + how to swap a track:
  `docs/audio/flagship-sourcing-brief.md`. Masters are gitignored; only the encoded runtime ships.
- **Determinism.** The beat → grade → COHERENCE chain is a cosmetic `frame()`-layer sink that never
  touches `step()` / `world` / seeded RNG, so adaptive per-track tempo can't perturb a Daily run.

## Run it

```bash
npm install
npm run dev      # http://localhost:5197
npm run build    # production bundle (~22 KB gzipped)
npm run preview
```

## Test

```bash
npm test         # 450+ unit tests — the pure simulation + the authored-audio engine/pipeline
```

Tests cover the deterministic core: RNG determinism + daily seeds, vector math, spatial-hash + segment/circle collision, charge-dash kinematics + stamina, combo/score/graze economy, the 11-perk draft (stacking + max-stack exclusion), the 7 fusion evolutions (recipe gating + stat application + draft injection), elite-Champion spawn chance + eligibility, the 5 ship stat profiles, achievement unlock logic, and the wave-director intensity curve.

## Monetization

Client-only, zero servers, layered:

1. **Free core game** as a portfolio centerpiece and shareable lead magnet (the "made in a tab" GIF).
2. **Lancefall Pro** one-time unlock (Gumroad / Lemon Squeezy license key, validated client-side): extra ships, bonus perk pool, palette/skin packs, a Zen/endless mode.
3. **Cosmetic palette + ship-skin packs** as micro-purchases.
4. **Sell the engine** — the juice/audio/particle framework as a polished "juicy Canvas2D arcade starter kit" template.
5. **itch.io** pay-what-you-want release.

## License

MIT © patij212

---

*Built in [Claude's Playground](../). Designed via a multi-agent concept tournament, implemented and tuned in one focused session, reviewed by an adversarial multi-agent pass.*
