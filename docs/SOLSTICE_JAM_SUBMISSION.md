# LANCEFALL: THE LAST KEY — break the code, bring back the day

> **dev.to June Game Jam submission** ([June Game Jam 2026](https://dev.to/challenges/june-game-jam-2026-06-03)).
> Prize category: **Best Ode to Alan Turing.**
> Paste the body below into the DEV submission template. Three slots are filled in-place — the
> repo URL (Code section), the screenshot references (What I Built), and the video placeholder
> (Video Demo) — each marked **[OWNER ACTION]** with the exact remaining human step. See the
> **Owner publish checklist** at the very bottom before you hit submit.

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

**Screenshots.** Three stills (a fourth optional):

![LANCEFALL / THE LAST KEY — the title cockpit](press/title-cockpit.png)
![READ THE KEY in action — glyph-cores ringing a boss with the plaintext message + substitution key lit on the HUD (the money shot: it proves the decode is real)](press/gameplay-cipher.png)
![FIRST LIGHT — the warm white→gold daybreak flooding the frame on a winning cipher-crack](press/firstlight-winframe.png)
![THE CHOICE — the halting problem, the one lock that can only be chosen](press/the-choice.png)

> **[OWNER ACTION: on dev.to these must be uploaded — drag each file into the DEV editor (or use its image button); the `press/…` paths above will NOT resolve in the published post. Files: `press/title-cockpit.png` (Title) · `press/gameplay-cipher.png` (READ THE KEY money shot) · `press/firstlight-winframe.png` (FIRST LIGHT) · `press/the-choice.png` (optional THE CHOICE).]**

## Video Demo

**[OWNER ACTION: upload `press/lancefall-trailer.mp4` to YouTube (unlisted is fine) and paste the
URL on its own line here — DEV auto-embeds it.]**

A **~75-second trailer** (1080p, on-screen captions, no voiceover) is rendered at
`press/lancefall-trailer.mp4` (poster at `press/lancefall-trailer-poster.png`). All footage is
captured from the live build. It tells the story in order: the grey City of Lancefall → the
dash-spear verb → the gray→neon **COHERENCE** wash ("the city remembers") → the **READ THE KEY**
cipher decode under fire, *including a wrong-dash fizzle* and a "CIPHER BROKEN" crack → the
**SOLSTICE PROTOCOL** / perk-draft / **Heat** / bestiary breadth → the **Mirrorblade** (the
imitation game) → **DAYBREAK** → **THE CHOICE** (the halting problem) → and closes on the gold
**FIRST LIGHT** daybreak. The bed is the game's own CC-BY soundtrack.

## Code

https://github.com/patij212/lancefall

> **[OWNER ACTION: the repo is PUBLIC, but the remote is NOT current — `main`/remote HEAD is `f808429`, and the jam build (THE LAST KEY) lives on the local `v6` branch at HEAD `de826ed`, which has DIVERGED from the remote (it is not a fast-forward). Push the jam build so judges play what this post describes — `git push origin v6` (and merge/ff it to your default branch, or point DEV at the `v6` branch) BEFORE submitting. Do not submit while the remote is stale.]**

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
unit-tested (1262 Vitest tests, incl. a test that plays the substitution decode end-to-end and a
determinism guard for the Daily stream). Every change went through `tsc` + tests + a production
build + an in-browser Playwright smoke (zero console errors).

## Prize Category

**Best Ode to Alan Turing.** The ode runs on three levels and they're all *played*, not just read:
**cryptanalysis** (READ THE KEY — a live substitution cipher is the core verb), the **imitation
game** (the Mirrorblade), the **halting problem** (THE CHOICE), over a **deterministic-algorithm**
core — with a quiet nod to Turing's morphogenesis in the Bloomgardens' patterns. Made with
admiration.

---

**Audio credits.** The arena beds layer free-licensed CC-BY music under the procedural engine:
*"Magenta Metropolis"* and *"Afterglow Love"* by **FSM Team & \<e s c p\>**, *"Cyberpunk
Renaissance"* and *"Neon Drive"* by **Punch Deck**, and *"Cyber Thriller"* (WARDEN boss) by **FSM
Team & \<e s c p\>** — all via [Free Stock Music](https://www.free-stock-music.com/) under
[CC BY](https://creativecommons.org/licenses/by/4.0/). Combat SFX are CC0 from
[Kenney](https://kenney.nl). The LANCE THEME motif and beat layer are original to LANCEFALL.

*Built in TypeScript. No engine, no framework — just a tab, a spear of light, and a code to break.*

---

## Owner publish checklist

Exact remaining human steps (Claude has filled everything it can; these need you):

1. **Push the jam build.** The remote is public but stale and DIVERGED — push the local `v6` branch
   (HEAD `de826ed`) to GitHub so judges play THE LAST KEY: `git push origin v6`. Then either merge/
   fast-forward it to your default branch, or point the DEV repo embed at the `v6` branch. Confirm
   `git ls-remote https://github.com/patij212/lancefall.git` shows your jam HEAD before submitting.
2. **Upload the trailer.** Put `press/lancefall-trailer.mp4` on YouTube (unlisted is fine) and paste
   the URL on its own line in **Video Demo** (DEV auto-embeds it). *(No `.mp4` exists in `press/` yet
   — render one from `press/trailer-storyboard.html` or capture a fresh ~2-min run.)*
3. **Drag in the 3 (or 4) screenshots** in **What I Built** — `press/title-cockpit.png`,
   `press/gameplay-cipher.png`, `press/firstlight-winframe.png` (+ optional `press/the-choice.png`).
   Local paths won't resolve in the published post; upload the files through the DEV editor.
4. **Confirm the repo is public** (it is — `visibility: PUBLIC`) and the README/link work.
5. **Paste this post** into the [DEV June Game Jam](https://dev.to/challenges/june-game-jam-2026-06-03)
   submission template.
6. **Select the prize category:** **Best Ode to Alan Turing.**
7. **Submit before the deadline.**
