# LANCEFALL: crack the code, bring back the day

> *An Ode to Alan Turing · June Solstice Game Jam*

**You don't shoot. You *dash*. And the city you're saving is a code you have to break.**

> *[Top GIF — drag `press/lancefall-cipher.gif` into the editor here. READY (640×360, 7 s, 7.6 MB): a boss cipher decoded under fire, climaxing on CIPHER BROKEN. It autoplays and loops on dev.to.]*

**Play free in your browser — no download:** **https://lancefall.pages.dev**

## Summary

- Built **solo, from scratch, in 13 days** for the jam. 100% vanilla TypeScript, **1,400+ automated tests**.
- A dash-combat bullet-hell where your only power is a **momentum light-spear** — but your *real* weapon is **cryptanalysis**.
- Not a puzzle or a visual novel — a **full real-time roguelite** where you crack codes *mid-firefight*, at 60 frames a second.
- Every boss is a **live cipher you decode under fire**. Solve the ciphers to defeat them and restore light to a city that was made to forget itself.

## How to play

- **You don't shoot — you dash.** Timing is everything: wait for the right moment and dash your ship *straight through* the enemies to cut them down, all while dodging everything else.
- **Bosses are harder** — you can't just dash through them. Each one hides behind a **cipher**: solve it and the boss breaks open. Crack the final code and Lancefall returns to colour and daylight.

## The story

Lancefall was a Star Kingdom lost to darkness — but not left in ruins. The **Six** who let it fall *enciphered* it, scrambling its light into grey static so that the loss could not even be remembered. You are its last hope: descend through the coded history of the Fall, break each boss's cipher, and decrypt the city back to daylight.

## The basics

- **6 bosses, 12 enemies**
- **6 playable ships**, each with its own feel
- An **8-level difficulty ladder** (Heat) for the score-chasers
- **6 game modes** — including **daily** and **weekly** challenges
- **11 in-run perks** to draft, with **7 upgraded "fusion" versions**
- A **guided, no-fail tutorial**

## Key features

- **Decrypting in combat.** Each boss is ringed by ciphered symbols (Σ Δ Λ Φ Ψ Ω…). The HUD shows you a word to spell — `LIGHT`, `DAWN` — and the key to read it by. Dash through the symbols *in the right order* to spell the word and break the boss open. Nothing is highlighted for you: finding the right symbol *is* the puzzle.
- **Memory Fragments.** As you fight through the Fall you collect **Memory Fragments** — recovered pieces of everything that was lost.
- **The Codebreaker.** Between runs you build a machine — **THE CODEBREAKER** — and spend your Memory Fragments to decrypt the transmissions of the Fall, word by word, slowly piecing the kingdom's story back together.
- **The Mirrorblade — the ultimate imitation game.** A boss that isn't a person: it's your own doubt made flesh, identical to you in every way, moving exactly as you move. *Can you even tell yourself apart from a machine?*

## How it fits the theme

**An ode to Alan Turing — one you *play*, not just read.** Turing cracked Nazi codes in WWII and helped invent the computer, so it felt right to build a game where **breaking codes is the whole point.** His biggest ideas are *mechanics* here, not lore:

- **The Bombe** (his code-breaking machine) → the boss cipher-locks and **THE CODEBREAKER**.
- **The imitation game** → the **Mirrorblade**, the boss that plays you back.
- **The halting problem** → the **ending**: a choice no computer could make for you — you simply have to decide, yourself.
- And the whole game runs **the same for every player**, like a machine following precise rules.

**The solstice — the longest day.** Every fight you win and every code you crack restores a little colour to the grey. Crack the final code and the Star Kingdom breaks into daylight: the sun rises over Lancefall again. The longest day of the year is the day the light finally wins.

This is my entry for **Best Ode to Alan Turing**.

## How I Built It

The honest headline: this was built **from scratch, for the jam** — first commit 8 June 2026, **674 commits over 13 days** — and it's a real game engine, not a single HTML file.

- **No framework, all by hand.** Vanilla TypeScript, Canvas 2D, and the Web Audio API — no game engine, no UI library. A fixed-timestep simulation holds a steady **60 fps**, decoupled from one global time-scale so slow-motion and hit-stop layer for free; object pools keep the hot path allocation-free; and the dash uses *swept* collision so even the fastest dash never tunnels through an enemy. About **290 KB** gzipped, in one browser tab.
- **The cipher is pure — and it never touches chance.** The whole code-breaking layer is built to draw **zero** randomness from the game's scoring. That sounds small; it's the part I'm proudest of. It means the **daily challenge is identical for every player on earth** — same enemies, same bullets, same cipher — and that bolting a brand-new code-breaking system on top couldn't shift that shared world by a single bit. A deterministic machine, provably unchanged. That felt like the right way to honour Turing.
- **I made the cipher real, not a quiz.** The first version printed the answer as numbers and highlighted the next target — so you were matching numbers, not breaking a code. I tore it out: now the symbols sit on the boss, the key sits on the HUD, and nothing is highlighted. You genuinely read, deduce, and decode under fire. A wrong step just fizzles, so it stays *cryptanalysis*, not a memory test.
- **1,400+ automated tests** — the part I almost never see in a jam. The whole simulation is covered, including a test that plays a cipher from start to finish and a guard that runs the daily seed and checks the entire wave-by-wave stream still matches, exactly, so the shared challenge can never silently drift. Every change went through the tests, a type-check, a production build, and an in-browser smoke run before it shipped.

## Demo

> *[Video — upload the ~83-second trailer to YouTube (unlisted is fine) and paste the URL on its own line; dev.to auto-embeds it. File: `press/lancefall-trailer.mp4`.]*

> *[Screenshots — retaken & ready in `press/`; drag each into the editor: `gameplay-cipher.png` (a boss cipher mid-decode — READ THE KEY), `gameplay-combat.png` (a mid-run bullet-hell — weaving through bullet-streams and a wave of enemies), `the-choice.png` (the ending — "no machine can decide it", over a flawless win).]*

## Code

**https://github.com/patij212/lancefall** — licensed under the **PolyForm Noncommercial License 1.0.0**: free to play, read, and learn from for any non-commercial purpose, but **all commercial rights are reserved by the author (patij212).**

## Where to play

**Play free in your browser — nothing to download:** **https://lancefall.pages.dev**

## Credits

**Audio.** CC-BY beds via [Free Stock Music](https://www.free-stock-music.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):

- *"Magenta Metropolis," "Afterglow Love,"* and *"Cyber Thriller"* (the WARDEN boss) — **FSM Team & ‹e s c p›**
- *"Cyberpunk Renaissance," "Neon Drive"* — **Punch Deck**

Combat sound effects are CC0 from [Kenney](https://kenney.nl). The **LANCE THEME** motif and beat layer are original to LANCEFALL by **patij212**.

---

*For Alan Turing (1912–1954) — who broke the world's hardest ciphers, asked whether a machine could think, and was never allowed his own daylight. This one is played in his honour.*

<!--
═══════════════════════════════════════════════════════════════════════════════
 ✂  OWNER ONLY — DO NOT PASTE BELOW THIS LINE INTO THE dev.to EDITOR.
═══════════════════════════════════════════════════════════════════════════════

PUBLISH CHECKLIST — the steps only you can do:

1. LICENCE — DONE. The project is now PolyForm Noncommercial 1.0.0 (source-available;
   all commercial rights reserved by you). LICENSE.md, package.json, the README, and the
   "Code" line above are already updated — nothing to do here.

2. PUSH THE JAM BUILD. The public remote is stale/diverged from the jam build —
   push it so judges play what this post describes:
     git push origin v6     (then fast-forward your default branch to it, or
                             point the DEV repo embed at the v6 branch)
   Confirm: git ls-remote https://github.com/patij212/lancefall.git
   Do NOT submit while the remote is stale.

3. TOP GIF — BUILT. press/lancefall-cipher.gif is ready (640x360, 7s, 7.6 MB: the
   READ THE KEY cipher decoded under fire -> CIPHER BROKEN). Just drag it into the
   editor at the "[Top GIF ...]" placeholder. This is your single biggest edge —
   almost NO competing entry embeds a GIF, and dev.to autoplays them.

4. VIDEO. Upload the ~83s trailer (press/lancefall-trailer.mp4) to YouTube and
   paste the URL on its own line under "Demo".

5. SCREENSHOTS — RETAKEN & READY (clean, no tooltips, well-framed). Drag these in
   where each placeholder sits (local press/… paths will NOT resolve once published):
     press/gameplay-cipher.png · press/gameplay-combat.png · press/the-choice.png
   COVER IMAGE: set press/firstlight-winframe.png (the 1080p key-art hero) as the
   dev.to article cover image (the "Add a cover image" button at the top of the editor).

6. DELETE every remaining "[ … ]" placeholder line after uploading its media.

7. Confirm the repo is PUBLIC and the link works.

8. Paste the post body (everything ABOVE this comment) into the DEV June Game Jam
   template: https://dev.to/challenges/june-game-jam-2026-06-03

9. Select prize category: BEST ODE TO ALAN TURING.

10. Submit before the deadline. (Reactions are the tiebreaker — post early.)
-->
