# LANCEFALL: THE LAST KEY — break the code, bring back the day

> **dev.to June Solstice Game Jam submission.** Paste this into the DEV submission template.
> Three things to drop in before publishing: a **video embed** (Video Demo section), a **repo
> embed** (Code section), and your **screenshots** (What I Built section). Each spot below has an
> explicit "embed here" note in place of the old `[…]` stubs.
> Prize category: **Best Ode to Alan Turing.**

---

## What I Built

**LANCEFALL: THE LAST KEY** is a neon dash-combat bullet-hell where your only weapon is a
momentum dash — and your *real* weapon is cryptanalysis. You don't follow a highlight; you **read
a cipher off the HUD and decode it under fire.**

It welds the **June solstice** and **Alan Turing** into one premise. Lancefall was a star-kingdom
whose memory was kept as **living light-code**. When the dark came, the Six who let it fall didn't
just lose the city — they **enciphered** it, scrambling its light into grey noise so the loss
couldn't be read, or felt. You are the **last key**. You descend through the cipher of the fall,
break each boss's lock, and **decrypt the city back to its longest day** — the solstice, when the
light stands highest and the dark, at last, begins to lose.

**Theme connection.** The solstice is the longest *day* — the peak of light, the turning point
where dark begins to lose ground; the entire game is light clawing its way back from grey (a
COHERENCE dial washes the world gray→neon as you play, and a final authored **FIRST LIGHT**
daybreak floods the frame to full day the instant you win). And it's an ode to Turing, whose
birthday falls in late June: the code-breaking is the loop, the imitation game is a boss, the
halting problem is the ending, and the whole sim is a deterministic algorithm.

The code-breaking is **real cryptanalysis, not number-matching**:

- **🔐 READ THE KEY — a live substitution cipher.** A boss is armored behind a ring of orbiting
  **glyph-cores**, each stamped with a ciphered symbol (Σ Δ Λ Φ Ψ Ω …). The HUD shows two things:
  the **plaintext message** you're decrypting (a short word — `LIGHT`, `DAWN`, `SOLACE`…) and a
  **substitution key** that maps each letter to its cipher symbol. You **read the key**, find the
  core whose symbol matches the next letter, and dash the cores so their symbols **spell the word in
  order.** There is **no give-away "next core" ring** — finding the right core *is* the decode. A
  wrong dash just fizzles (your progress is kept, so you can wait for a safe lane and re-read the
  key). **THE SOVEREIGN** (the final boss) is the *master cipher*; and in **SOLSTICE PROTOCOL**
  mode, *every* boss is a cipher.
- **🪞 The Mirrorblade is the Imitation Game.** A boss that isn't a person — it's your doubt made
  flesh, moving exactly as you do, in your own colour: *"I learned you move for move. Tell me which
  of us is real."* The Turing test, embodied.
- **⏸️ THE CHOICE is the Halting Problem.** Break the final cipher and you face the one lock that
  *cannot be solved, only chosen*: hold the light at its height, or let the day turn. No machine can
  decide it — that's why it's left to you. A deterministic game handing the player its single
  un-computable input.
- **🎲 Determinism as tribute.** The whole simulation is a deterministic algorithm: one seed
  produces the same world for everyone (the Daily's *"same ciphertext, on the same day"*) — and the
  decode surface draws **zero** scoring entropy, so it reads identically for every player on a given
  seed. Turing's machines, made playable.

> ▶️ **Play it now: https://lancefall.pages.dev**
> Open the **◈ THE FALL** card on the title for the story, and try **SOLSTICE PROTOCOL** mode for
> the cipher showcase. (Keyboard+mouse, gamepad, or touch.)

**Screenshots — embed three images here** (drag them into the DEV editor or use `![alt](url)`):
- **Title** — LANCEFALL / THE LAST KEY.
- **READ THE KEY in action** — the glyph-cores ringing a boss, with the **plaintext message + the
  substitution key** lit on the HUD (this is the money shot — it proves the decode is real).
- **FIRST LIGHT** — the warm white→gold daybreak flooding the frame on a winning cipher-crack.
  *(Optional fourth: THE FALL premise card.)*

## Video Demo

**Embed your ~2-minute capture here** — paste the YouTube/Vimeo URL on its own line (DEV
auto-embeds it), or use a `{% embed %}` liquid tag. **No bare placeholder should remain.**

Cut it to **open on a real decode and close on FIRST LIGHT.** Suggested voiceover beats:
1. **Open mid-decode, not on flavor.** Push in on the HUD: *"This boss is enciphered. The screen
   gives me the word to recover and the key to recover it with — nothing else."* Read one letter off
   the key, find the core wearing that symbol, dash it. Let the viewer watch you **solve a
   substitution cipher while dodging** — and show a wrong dash fizzling so they see it's skill, not
   luck.
2. **Scale it up.** Cut to SOLSTICE PROTOCOL where *every* boss is a cipher, and to THE SOVEREIGN as
   the master cipher — the same verb, harder.
3. **The Mirrorblade** — name the imitation game out loud as it mirrors you move-for-move.
4. **THE CHOICE → FIRST LIGHT.** Frame the choice as the halting problem (*"no machine decides
   this one"*), then **close on FIRST LIGHT**: the cipher breaks, the grey burns off, and the
   authored daybreak floods the frame to full day. *"You read the key. You brought back the
   longest day."* Hold on the sunrise and end.

## Code

**Embed your GitHub repo here** — paste the repository URL on its own line (DEV renders a repo
card), or use `{% github owner/repo %}`. **No bare placeholder should remain.**

Built on my **open-source LANCEFALL engine (MIT)** — vanilla TypeScript, Canvas 2D, Web Audio, no
framework. **What's new for this jam (THE LAST KEY edition):**

- **READ THE KEY** — the cipher is a *real on-screen substitution decode*, not number-matching: a
  pure `cipher.ts` reducer + a pure, read-only `cipherDecode.ts` view (plaintext word + glyph
  symbols + the substitution key) wired into the HUD and the boss cores. The old give-away
  next-core ring is gone (it survives only as a Casual opt-in assist).
- **SOLSTICE PROTOCOL** mode (renamed from THE LONGEST DAY) — every boss is a cipher-lock.
- **FIRST LIGHT** — an authored daybreak wash on a winning cipher-crack (a sustained white→gold
  sky cross-fade above the neon, the vignette inverting into a golden halo).
- The **DAYBREAK** ultimate, the **THE FALL** premise card, and a Turing dedication on the credits.
- A complete **Turing×solstice re-narration** — every narrator line, lore entry, boss dossier, and
  THE CHOICE, unified by one idea: *memory = light-code · forgetting = encryption · remembering =
  decryption.*

Commits are grouped by phase (narrative → cipher-lock → READ THE KEY decode → mode → presentation →
coherence/QA).

## How I Built It

This is the part that *is* the Turing tribute.

**A pure, deterministic cipher — with a pure decode view on top.** `cipher.ts` is side-effect-free:
`makeCipher(n, seed)` derives a glyph permutation and a decoded order from a stable hash of
`(runSeed, bossWave)` via a **local** mulberry32 generator. `cipherDecode.ts` then builds a
read-only *view* — the plaintext word, the symbol on each core, and the letter→symbol key — deriving
**only** from that state. Both draw **zero** entropy from the game's scoring RNG, so the same Daily
seed gives everyone the same cipher *and* the same on-screen key, and adding a whole code-breaking
layer couldn't perturb the seeded world by a single bit. That determinism invariant was the hardest
constraint and the most satisfying to hold: the bullet patterns are RNG-driven and shared-seed, so
the cipher had to thread *through* that stream without touching it (it does — guarded by a
dedicated determinism test that the Daily wave stream stays bit-identical).

**Make the decode legible, then make it real.** The first cut printed the answer order as numbers
and white-ringed the next core — which meant the player *matched numbers*, not *broke a code*. The
ship turns it into an actual substitution cipher: ciphered symbols on the cores, the message and key
on the HUD, no highlight. Now you genuinely read the key, locate the symbol, and decode under fire —
the Turing verb, *played*. Reading is kept forgiving (a wrong dash fizzles without losing progress)
so it's cryptanalysis, not a memory tax.

**Re-narrate, don't re-engineer.** The key to a coherent reframe was a single equivalence — *memory
is light-code; to forget is to encrypt; to remember is to decrypt*. That let every existing system
(the COHERENCE light-dial, Memory Fragments, the biome strata, the daily Echo) keep its name and
simply *mean* something new. The whole game became an ode without rewriting its engine.

**The keypad, from the existing parts.** The Sovereign already had orbiting cores you shatter to
crack its armor; THE LAST KEY turns that into a cipher keypad — a dashed core is a *decode step* in
plaintext order, not a kill, with one step per dash so you must route to each core deliberately.
SOLSTICE PROTOCOL wraps the Warden/Weaver/Beacon the same way, while the Hollow (a one-time key),
Mirrorblade (the imitation game), and Sovereign (the master cipher) are already code-breaking
puzzles in their own right.

**The juice.** Fixed-timestep sim at 60fps decoupled from a global `timeScale` (so hitstop and
slow-mo layer for free), object pools (zero hot-path allocation), a uniform spatial hash + swept
capsule for the dash spear (fast dashes never tunnel), trauma screen-shake, bloom, chromatic
aberration, the FIRST LIGHT daybreak compositor, and a reactive Web-Audio soundtrack. Every new
visual — the decode HUD and FIRST LIGHT included — respects the reduce-flashing / reduce-motion /
clarity accessibility settings (FIRST LIGHT is a no-strobe, no-motion sustained cross-fade).

**Tested + verified.** The pure simulation — including the cipher *and* the decode view — is
unit-tested (730+ Vitest tests, incl. a test that plays the substitution decode end-to-end and a
determinism guard for the Daily stream). Every change went through `tsc` + tests + a production
build + an in-browser Playwright smoke (zero console errors).

## Prize Category

**Best Ode to Alan Turing.** The ode runs on three levels and they're all *played*, not just read:
**cryptanalysis** (READ THE KEY — a live substitution cipher is the core verb), the **imitation
game** (the Mirrorblade), the **halting problem** (THE CHOICE), over a **deterministic-algorithm**
core — with a quiet nod to Turing's morphogenesis in the Bloomgardens' patterns. Made with
admiration.

---

*Built in TypeScript. No engine, no framework — just a tab, a spear of light, and a code to break.*
