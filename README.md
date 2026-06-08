# ⚔️ LANCEFALL

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
- Every few waves you **draft a perk** (3 of 6, they stack) — chain explosions, longer lance, graze-burn, afterimage, time-thief, second wind — and watch your build snowball into a perpetual-motion massacre.

## Features

- ⚔️ **Charge-dash combat** — swept-capsule spear collision, i-frames, momentum carry, commit-on-release routing.
- 💀 **4 enemy archetypes + 2 mini-bosses**, all shape-coded (colorblind-friendly): darters, orbiters, splitters, turret-bloomers, the two-phase **Warden** (spiral + aimed fans) and the **Weaver** (pinwheel + safe-lane pulse rings), which alternate as the run escalates.
- 🚀 **3-ship roster (meta-progression)** — bank shards across runs to unlock **Lance** (balanced), **Glaive** (glass cannon: long dash, 2 stamina) and **Bastion** (tank: 4 stamina, fast regen). Each is a genuinely different playstyle.
- 🃏 **In-run perk draft** — 3-of-**10** stacking upgrades (Long Lance, Second Wind, Graze Burn, Chain Reaction, Afterimage, Time Thief, Heavy Lance, Siphon, Slipstream, Nova Dash) that compound into wild builds.
- 🌀 **The juice stack** — trauma screen-shake, hitstop, time-dilation slow-mo on big chains, additive bloom, channel-split chromatic aberration, dash-trail ribbons, particle storms, floating combo numbers, velocity-lean camera, punch-zoom, and boss-spawn/death screen flashes.
- 🔊 **Fully-synthesized reactive audio** (Web Audio, no asset files) — a bass *thunk* that pitches **up** with your combo so a clean run literally plays an ascending scale, a charging arpeggio, graze ticks, and an adaptive drone that layers more voices as the wave heats up.
- 🎲 **Endless escalating wave director** driven by a single intensity scalar, plus a **daily-seed** mode (deterministic for everyone, no backend) and a copyable score-brag string.
- 🏆 **localStorage** high score, best combo, shards, unlocked ships, and daily best.
- 🎮 **Keyboard + mouse, gamepad, and touch** (twin virtual sticks on phones).
- ♿ **Accessibility** — reduce-flashing, reduce-motion, colorblind shapes, screen-shake slider, HUD scale, and full volume controls.

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

## Run it

```bash
npm install
npm run dev      # http://localhost:5197
npm run build    # production bundle (~22 KB gzipped)
npm run preview
```

## Test

```bash
npm test         # 92 unit tests on the pure simulation
```

Tests cover the deterministic core: RNG determinism + daily seeds, vector math, spatial-hash + segment/circle collision, charge-dash kinematics + stamina, combo/score/graze economy, the 10-perk draft (stacking + max-stack exclusion), ship stat profiles, and the wave-director intensity curve.

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
