# LANCEFALL: THE LAST KEY — Story Bible & Production Plan

> **Edition:** LANCEFALL: THE LAST KEY (June Solstice Game Jam cut)
> **Target:** dev.to June Solstice Game Jam · "Best Ode to Alan Turing" + Overall · deadline 2026-06-21
> **Status:** Phase 0 — coherence contract. Supersedes & absorbs `2026-06-14-ws6-story-rename-design.md`.
> **This document is the single source of truth.** Every narrative string and the codebreak
> mechanic must derive from the Premise and the Lexicon below. If a later edit can't be justified
> against this doc, the edit is wrong — or this doc must change first.

---

## 1. The Premise (the canon spine)

Lancefall was a star-kingdom whose memory was kept as **living light-code** — every name, bell,
and street written as a luminous cipher that kept the dark out. The lit city was the *plaintext*.

When the fear came, the Six did not simply let the city fall. They **enciphered** it — scrambled
the light-code into grey noise so the loss could not be read, or felt. The plaintext became
ciphertext: a grey ruin that no longer remembers it was ever bright.

You are the kingdom's **last key** — a spear that reads patterns and breaks them. You descend
through the cipher of the fall, crack the six rotor-keepers who each hold one wheel of the great
code, and **decrypt the city back to its longest day** — the solstice, when the light stands
highest and the dark, at last, begins to lose.

**To decrypt is to remember. To remember is to relight.**

At the bottom waits the Sovereign's master cipher — and past it, the one lock no machine can open.
It cannot be *solved*, only *chosen*: **hold the light at its height, or let the day turn.**

### The fusion that makes it coherent
The pre-existing game runs on a **memory** motif (the city forgot itself; you remember it back).
The Turing edition adds a **code** motif. They are the **same motif**:

> **memory = light-code · forgetting = encryption · remembering = decryption · light = plaintext**

This is why nothing wired needs renaming. We **re-narrate; we do not re-engineer.**

---

## 2. The Lexicon (the coherence table)

Every term, its canon meaning, where it lives, and how its *flavor* reframes. **System names in
the "Keep" column do NOT change** (they are wired into audio / COHERENCE / save / tests).

| Term | Keep name? | Canon meaning (new flavor) | Lives in |
|---|---|---|---|
| **LANCEFALL** | ✅ | the star-kingdom whose memory was light-code | title, render skyline, ships, save |
| **THE LAST KEY** | (new subtitle) | you — the spear that reads patterns & breaks them; the cryptographic key; the last one left | title subtitle, tagline, share head |
| **THE FALL** | ✅ | the encryption — the Six scrambled the light into grey noise | narrator, lore, modes (daily), go-over |
| **THE SIX** | ✅ | the rotor-keepers who enciphered the city | bestiary, lore (conceptual label) |
| **COHERENCE** (system) | ✅ | the signal cohering — decryption resolving grey→light (already a signal/crypto word) | tune, audio, render, coherence.ts |
| **Memory Fragment ◆** | ✅ | a recovered shard of the broken cipher (a piece of the key) | lore, ui codex, stillpoint |
| codex unlock verb `REMEMBER` | → **`DECRYPT`** | spend fragments to decrypt a lost memory back to plaintext | ui.ts:743 |
| codex locked `— forgotten —` | → **`— enciphered —`** | the memory is still ciphertext | ui.ts:747 |
| codex locked blurb | reword | "A memory of the fall, enciphered. ◆X to decrypt it." | ui.ts:748 |
| **DAYBREAK** (the ultimate) | ✅ (your pick) | the decryption floods through at once — light breaks, the longest day dawns | game.ts, ui.ts, achievements |
| ex-`REMEMBER EVERYTHING` | → **DAYBREAK** | (the 8 rename sites, §6) | game.ts:517/529, ui.ts:240/771/1225, ach.ts:53/54 |
| **THE CHOICE** | ✅ | the halting problem — the one cipher that can only be chosen, not solved | stillpoint.ts |
| **THE MIRRORBLADE** | ✅ | the Imitation Game — is it you, or the machine that learned you? | bestiary, lore, boss |
| **THE HOLLOW** | ✅ | the one-time key — solvable only in the single instant its key shows (the i-frame dash window) | bestiary, lore, boss |
| **ECHO OF THE FALL** (daily) | ✅ | the shared ciphertext — the same seed/echo for everyone today (determinism) | modes.ts, ui, achievements |
| **THE LIGHT DIMS** (game-over) | ✅ | the cipher reasserts; you fell back into grey | ui.ts:381 |
| Biomes: **THE COURT / EMBERWALL / VAULTS / BLOOMGARDENS / WARRENS / NULL** | ✅ all | strata of the enciphered city you descend through | biomes.ts, narrator.strata |
| **Shards** (meta-currency) | ✅ | fragments of recovered light, banked between descents | save, ui |
| Tagline `remember the fall` | → **`break the code. bring back the day.`** | the new logline (the "remember" echo survives inside narrator.runStart) | ui.ts:266 |
| Share head `THE LAST LANCE` | → **`THE LAST KEY`** | the edition name | save.ts:216 |

---

## 3. The Six — rotor-keeper dossiers

Each holds one wheel of the great cipher. Quotes shift **taunt → regret** (the dossier prose is
kept). Each carries exactly one Turing facet so the pillars don't overlap (§4).

1. **THE WARDEN · Keeper of the First Gate** — the outermost wheel. *Facet: the first lock.*
   - Quote: `"I bolted the gate and the first wheel from the inside. I called it duty."`
   - Narrator approach: `He held the walls, then turned the first key against us.`
   - Narrator kill: `"I bolted it from the inside. Forgive me."`
2. **THE WEAVER · Spinner of the Lie** — the substitution wheel; the kingdom's cryptographer.
   *Facet: the cipher itself (encryption).*
   - Quote: `"I enciphered every thread that held you. I thought scrambling the loss was mercy."`
3. **THE BEACON · The Light That Lied** — the key that was never transmitted. *Facet: the unsent key / dead channel.*
   - Quote: `"I let the signal go dark. I still hear it asking."`
4. **THE MIRRORBLADE · Your Own Doubt** — not one of the Six. *Facet: the Imitation Game.*
   - Quote: `"I learned you move for move. Tell me which of us is real."`
5. **THE HOLLOW · What Grief Left** — the cipher that erased its own key. *Facet: the one-time key (the single instant it can be applied).*
   - Quote: `"There was nothing left in me to hold."` (kept — already regret)
6. **THE SOVEREIGN · The Crown That Fell First** — the master cipher. *Facet: the master key / final code.*
   - Quote: `"I was the key to everything. I chose to lose it."`

---

## 4. The Turing pillars — one home each (no overlap)

| Pillar | Its single home | Surfaced as |
|---|---|---|
| **Code-breaking** | core metaphor + the boss cipher-lock mechanic (Phase 2) | gameplay verb + all prose |
| **The Imitation Game** | THE MIRRORBLADE | bestiary/lore/quote + a pre-fight beat (Phase 3) |
| **The Halting Problem** | THE CHOICE | "every cipher breaks; this one can only be chosen" |
| **The one-time key** | THE HOLLOW | its existing dash-through-the-flash window, re-narrated |
| **Determinism** | ECHO OF THE FALL (daily seed) | the shared-ciphertext framing + the "How I Built It" post |
| **Morphogenesis** (Turing's pattern paper) | THE BLOOMGARDENS | a strata line + the radial bloom patterns as reaction-diffusion (deep cut) |
| **The Bombe / the war** | DAYBREAK + "the longest day" | the ult's in-fiction engine + the WWII/solstice resonance |

---

## 5. The solstice frame & tone rules

- **Solstice = the longest DAY**, light at its peak — the *goal state*. You decrypt the city back
  up toward full light; DAYBREAK is the dawn of that day. (Never "longest night.")
- **Passage of time** = the descent itself + the COHERENCE rise (grey→neon) + the roguelite loop.
- **Tone (the "professional" guardrail):** terse second-person noir; restraint is the soul; the
  Turing references stay **diegetic** — woven into the world, never winking ("hey, it's Alan
  Turing!"). The ode is *felt*, not announced. No countdown-style combo lines; show, don't tell.

---

## 6. Narrative-surface inventory (Phase 1 checklist)

Every site, with its reframe owner. **Text/data only — no system renames.**

- `ui.ts:265-266` — add `THE LAST KEY` subtitle; tagline → `break the code. bring back the day.`
- `ui.ts:743/747/748` — codex verb `DECRYPT`; `— enciphered —`; reworded locked blurb
- `ui.ts:771` — HOW-TO rule `REMEMBER EVERYTHING` → `DAYBREAK` (+ reworded)
- `ui.ts:240/1225` — HUD od label → `DAYBREAK` / `DAYBREAK READY [F]`
- `ui.ts:381` — `THE LIGHT DIMS` kept (canon-correct)
- `ui.ts:1103` — game-over sub lines reframed (decrypt/relight voice)
- `game.ts:517/529/530` — DAYBREAK floatText + announce + comment
- `achievements.ts:53/54` — descs → DAYBREAK; consider Turing-flavored *names* (keep ids)
- `achievements.ts:43` — `Echo of the Fall` desc kept; verify coherence
- `narrator.ts` — runStart (keep the "remember it lit" echo), loop, firstKill, **comboTier ×6 rising lines**, comboBreak, bossApproach ×6, bossKill ×6, strata ×6 (BLOOMGARDENS morphogenesis nod), lastBreath, victory, highCoherence — all to the cipher/light voice
- `lore.ts` — 12 entries: heavier-restraint pass + cipher coherence (Weaver = cryptographer, Last Lance = "the last key", What Remains = halting problem)
- `bestiary.ts` — 6 boss blurbs (rotor-keeper quotes, §3); enemy blurbs light-touch
- `stillpoint.ts:16/18/19` — THE CHOICE as the halting problem (heads `THE LIGHT HOLDS`/`THE LIGHT RELEASED` KEPT — tests assert them); Echo memories kept/light-touch
- `modes.ts:39` — `ECHO OF THE FALL` kept; desc verify
- `save.ts:216` — share head `THE LAST LANCE` → `THE LAST KEY`; body verify
- `ships.ts:21` — lance desc "last spear left standing" → align to "last key" lightly
- `index.html` / `<title>` / meta — edition title + description (Phase 3)

**Tests touched:** `narrator.test.ts:98` (comboTier → `[10,20,35,50,75,100]`); confirm
`stillpoint.test.ts` heads unchanged; `achievements.test.ts` keys off ids (safe).

---

## 7. The phases

- **Phase 0** — this bible + the completed audit. *(done on approval)*
- **Phase 1** — core narrative reframe (the §6 text/data list + DAYBREAK rename). Gate: tsc +
  tests + build + in-browser + coherence-vs-this-doc.
- **Phase 2** — the **boss cipher-lock** code-breaking mechanic. Pure `cipher.ts` (deterministic,
  tested) first; wire into `boss.ts`/`game.ts`/`render.ts` with **GitNexus impact analysis before
  each symbol edit** + **Daily golden-replay byte-identical** check. Optional "THE LONGEST DAY" timed mode.
- **Phase 3** — Turing presentation: premise/intro card, Mirrorblade imitation beat, BLOOMGARDENS
  morphogenesis nod, codebreak HUD, tasteful Turing dedication on credits. a11y-gate every visual.
- **Phase 4** — the dev.to submission: "What I Built" / "How I Built It" (algorithmic craft as the
  tribute) + cipher/imitation/halting mapping + honest attribution (engine vs. new-this-window);
  voiced video demo; GIF; reactions plan. Category: Best Ode to Alan Turing.
- **Phase 5** — adversarial coherence + QA capstone (hunt stray taunts/contradictions vs. this
  doc; determinism; full gate; a11y; cross-mode smoke); deploy; update README/CLAUDE.md/MEMORY.

## 8. Invariants (do not violate)

1. **No system renames.** COHERENCE, Memory Fragments, DAYBREAK, biome ids, save keys, mode ids,
   the daily seed — names stay. Re-narrate only.
2. **Daily / seeded determinism is bit-identical.** No `world.rng` draw added/removed/reordered.
   The cipher mechanic (Phase 2) is pure-first + golden-replay verified.
3. **Pure-sim stays unit-tested**; new logic (`cipher.ts`) is pure + Vitest-covered.
4. **a11y-gate every new visual** (reduceFlashing/reduceMotion/clarity).
5. **Coherence:** nothing contradicts §1–§2. The bible changes first, then the code.
