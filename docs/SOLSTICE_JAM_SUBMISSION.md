# LANCEFALL: THE LAST KEY — break the code, bring back the day

> **dev.to June Solstice Game Jam submission.** Paste this into the DEV submission template.
> Replace the `[…]` placeholders (video embed, repo embed, your screenshots) before publishing.
> Prize category: **Best Ode to Alan Turing.**

---

## What I Built

**LANCEFALL: THE LAST KEY** is a neon dash-combat bullet-hell where your only weapon is a
momentum dash — and your *real* weapon is cryptanalysis.

It welds the **June solstice** and **Alan Turing** into one premise. Lancefall was a star-kingdom
whose memory was kept as **living light-code**. When the dark came, the Six who let it fall didn't
just lose the city — they **enciphered** it, scrambling its light into grey noise so the loss
couldn't be read, or felt. You are the **last key**. You descend through the cipher of the fall,
break each boss's lock, and **decrypt the city back to its longest day** — the solstice, when the
light stands highest and the dark, at last, begins to lose.

**Theme connection.** The solstice is the longest *day* — the peak of light, the turning point
where dark begins to lose ground; the entire game is light clawing its way back from grey (a
COHERENCE dial washes the world gray→neon as you play). And it's an ode to Turing, whose birthday
falls in late June: the code-breaking is the loop, the imitation game is a boss, the halting
problem is the ending, and the whole sim is a deterministic algorithm.

The code-breaking is **real gameplay, not flavor**:

- **🔐 The cipher-lock.** A boss is armored behind a ring of glyph-cores — a *keypad*. A readout
  shows the encrypted sequence; you break the lock by dashing the cores **in the decoded order**
  while dodging the boss's bullet patterns. A wrong key re-locks it. **THE SOVEREIGN** (the final
  boss) is the *master cipher*; and in the new **THE LONGEST DAY** mode, *every* boss is a cipher.
- **🪞 The Mirrorblade is the Imitation Game.** A boss that isn't a person — it's your doubt made
  flesh, moving exactly as you do, in your own colour: *"I learned you move for move. Tell me which
  of us is real."* The Turing test, embodied.
- **⏸️ THE CHOICE is the Halting Problem.** Break the final cipher and you face the one lock that
  *cannot be solved, only chosen*: hold the light at its height, or let the day turn. No machine can
  decide it — that's why it's left to you. A deterministic game handing the player its single
  un-computable input.
- **🎲 Determinism as tribute.** The whole simulation is a deterministic algorithm: one seed
  produces the same world for everyone (the Daily's *"same ciphertext, on the same day"*). Turing's
  machines, made playable.

> ▶️ **Play it now: https://lancefall.pages.dev**
> Open the **◈ THE FALL** card on the title for the story, and try **THE LONGEST DAY** mode for the
> cipher-lock showcase. (Keyboard+mouse, gamepad, or touch.)

*Screenshots:*
- `[title — LANCEFALL / THE LAST KEY]`
- `[the cipher-lock: glyph-cores + the CIPHER readout]`
- `[THE FALL premise card]`

## Video Demo

`[embed a ~2-minute capture with voiceover]`

Suggested beats for the voiceover:
1. The core loop — charge, dash *through* a wall of bullets, skewer a line of enemies, chain the combo.
2. A cipher-lock boss — read the CIPHER readout, dash the glyph-cores in the decoded order, watch a
   wrong key re-lock it, then crack it open and punish the exposed window.
3. The Mirrorblade — name the imitation game out loud as it mirrors you.
4. THE CHOICE — hold the light / let it go, and frame it as the halting problem.

## Code

`[embed your GitHub repo]`

Built on my **open-source LANCEFALL engine (MIT)** — vanilla TypeScript, Canvas 2D, Web Audio, no
framework. **What's new for this jam (THE LAST KEY edition):**

- The **cipher-lock** mechanic — a pure, tested `cipher.ts` module + its boss integration.
- **THE LONGEST DAY** mode (every boss is a cipher-lock).
- The **DAYBREAK** ultimate, the **THE FALL** premise card, and a Turing dedication on the credits.
- A complete **Turing×solstice re-narration** — every narrator line, lore entry, boss dossier, and
  THE CHOICE, unified by one idea: *memory = light-code · forgetting = encryption · remembering =
  decryption.*

Commits are grouped by phase (narrative → cipher-lock → mode → presentation → coherence/QA).

## How I Built It

This is the part that *is* the Turing tribute.

**A pure, deterministic cipher.** `cipher.ts` is side-effect-free: `makeCipher(n, seed)` derives a
glyph permutation and a decoded order from a stable hash of `(runSeed, bossWave)` via a **local**
mulberry32 generator. It draws **zero** entropy from the game's scoring RNG — so the same Daily seed
gives everyone the same cipher, and adding a whole mechanic couldn't perturb the seeded world by a
single bit. That determinism invariant was the hardest constraint and the most satisfying to hold:
the bullet patterns are RNG-driven and shared-seed, so the cipher had to thread *through* that stream
without touching it (it does — verified by construction and by an integration test).

**Re-narrate, don't re-engineer.** The key to a coherent reframe was a single equivalence — *memory
is light-code; to forget is to encrypt; to remember is to decrypt*. That let every existing system
(the COHERENCE light-dial, Memory Fragments, the biome strata, the daily Echo) keep its name and
simply *mean* something new. The whole game became an ode without rewriting its engine.

**The keypad, from the existing parts.** The Sovereign already had orbiting cores you shatter to
crack its armor; THE LAST KEY turns that into a keypad — a dashed core is a *key press* in the
decoded order, not a kill, with one key per dash so you must route to each core deliberately. The
generic version (THE LONGEST DAY) wraps the Warden/Weaver/Beacon the same way, while the Hollow
(a one-time key), Mirrorblade (the imitation game), and Sovereign (the master cipher) are already
code-breaking puzzles in their own right.

**The juice.** Fixed-timestep sim at 60fps decoupled from a global `timeScale` (so hitstop and
slow-mo layer for free), object pools (zero hot-path allocation), a uniform spatial hash + swept
capsule for the dash spear (fast dashes never tunnel), trauma screen-shake, bloom, chromatic
aberration, and a reactive Web-Audio soundtrack.

**Tested + verified.** The pure simulation — including the cipher — is unit-tested (480+ Vitest
tests). Every change went through `tsc` + tests + a production build + an in-browser Playwright
smoke (zero console errors), and a determinism check that the Daily wave stream stays bit-identical.

## Prize Category

**Best Ode to Alan Turing.** The ode runs on three levels and they're all *played*, not just read:
**code-breaking** (the cipher-lock is the core verb), the **imitation game** (the Mirrorblade), the
**halting problem** (THE CHOICE), over a **deterministic-algorithm** core — with a quiet nod to
Turing's morphogenesis in the Bloomgardens' patterns. Made with admiration.

---

*Built in TypeScript. No engine, no framework — just a tab, a spear of light, and a code to break.*
