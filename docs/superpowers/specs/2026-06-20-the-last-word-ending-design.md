# SPEC — THE LAST WORD: completing the storyline & binding THE CHOICE

> **Status:** approved in brainstorm (2026-06-20); ready for implementation plan.
> **Builds on:** `docs/superpowers/specs/2026-06-14-last-key-story-bible.md` (the canon spine) and
> `docs/SOVEREIGN_VICTORY_SPEC.md` (THE LONGEST DAY victory). Obeys the bible's invariants:
> **re-narrate, do not re-engineer**; no system renames; seeded determinism stays bit-identical;
> pure-sim stays unit-tested; a11y-gate every new visual.
> **Intent:** the lore is extraordinary but the climax does not *gather* it. THE CHOICE arrives cold,
> names nothing the player did, and changes nothing they can feel. This spec makes THE CHOICE the
> binding climax of the whole game — the one act that fuses the decryption spine, the Sovereign, the
> citizens, and the ending into a single, consequential, revisitable decision.

---

## 1. The problem (code-grounded)

Three climaxes are currently wired to **not** know about each other:

1. **Decryption 100%** — `isLongestDay(save)` fires THE LONGEST DAY / Transmission XIV
   (*"Every cipher broken."*) entirely independent of the Sovereign or the choice.
2. **The Sovereign kill** — fires DAYBREAK + THE CHOICE gate (`game.ts` `choicePending`).
3. **THE CHOICE** — `stillpoint.choiceEnding(catch|fall)` returns **two sentences**; persists
   `save.stillpointChoice`; tints the title backdrop (`game.ts:1597` coherence 0.92/0.12/0.42) and
   swaps one codex tail (`intercepts.CHOICE_TAIL`). That is the entire consequence.

The smoking gun — `intercepts.ts:224`:

> *"THE LAST CIPHER — the one that 'cannot be solved, only chosen.' **Separate authored data (NOT in
> any transmission's tokens, so vocabulary()/masterProgress are untouched).**"*

So *"the last word, you did not decode"* is **only poetic** — there is no actual un-decrypted token.
The decryption climax and the choice climax are designed to be divorced. Two further smells:

- The choice's words live in **two files** (`stillpoint.choiceEnding` for the go-screen,
  `intercepts.CHOICE_TAIL` for the console) — the most important copy in the game, duplicated.
- **"THE SIX WHO LET IT FALL" names only five** (Warden, Weaver, Beacon, Hollow, Sovereign;
  Mirrorblade is explicitly *"not one of the Six"*). The sixth is never resolved.

Setups built and never paid off: the **Courier's undelivered master cipher** (*"the last undeciphered
thing in the city"*); the **Vintner's wine kept "for the longest day, the day the master cipher
breaks"*; the **Mirrorblade** question (*"is it you, or the machine that learned you?"*).

## 2. Design decisions (settled in brainstorm)

| Fork | Decision |
|------|----------|
| **Scope** | The Living Choice — bind the pieces + reveal the Sixth + make the choice an ongoing relationship. |
| **The Sixth** | **Everyone.** There was no sixth keeper; the sixth is the whole city's diffuse complicity. The 16 citizens you wake are its faces. You, the Last Key, are the city choosing to **own** the fall instead of enciphering it away again. |
| **The Sixth, surfaced** | **Accretion, never gated.** A "THE SIXTH" record assembles across play from each woken citizen's confession; the core reveal **always** fires at the choice; it names the citizens *you* woke (0→16); 100% decryption unlocks the deepest final line. Decryption deepens the ending at every level — it is never the price of admission. |
| **The Vigil (catch)** | **Defiance that curdles into peace.** Holding the light is triumph early, wistful in the middle, and late the game *offers* the release as permission — not failure. |
| **Reversibility** | **Holding is reversible; letting go is final** (the grief metaphor). You may move HOLD→RELEASE as the Vigil's earned endpoint; once released, the choice is locked. |
| **The Vigil mechanic** | **Reuse** the existing KEEP GOING / ASCEND / NG+ loop — holding the light *is* continuing to play. No new mode. |

## 3. The spine — three climaxes become one: THE LAST WORD

Add a single **un-decryptable token** at the foot of TRANSMISSION 12 *"What Remains"*. It is **not**
part of `vocabulary()` (so `masterProgress()`/the 265-word vocab pin and all determinism are
untouched — same discipline as today's `CHOICE_TAIL`). It is a **display element** in the console
that reads `save.stillpointChoice`:

- `none` → renders as one grey glyph-word, visible **from early game**. Hover/caption:
  *"This word is not bought. It is chosen — on the longest day."*
- `catch` / `fall` → resolves to the chosen reading + the unified ending tail.

**The Turing payoff is now exact.** At 100% decryption, Transmission XIV's *"Every cipher broken."*
stays **true**: the Bombe (the machine) broke every cipher and then **halts** — the last word was
never a cipher. The console reframes it as the halting problem made literal:

> *"The machine is finished. Every cipher is broken. One word remains — and it was never the machine's
> to read. No machine decides it. It waits for the longest day."*

This re-couples decryption ↔ Sovereign ↔ choice: the master cipher is now **visibly incomplete** until
you descend, fell the Sovereign, and choose. "Remember everything" finally points **forward**.

## 4. The journey (ordered beats)

1. **Throughout** — decrypt, wake citizens, build dossiers. The Last Word sits grey the whole time; the
   "THE SIXTH" record quietly assembles (§6).
2. **100% decryption** — *"the machine is finished; every cipher broken."* The console shows the one
   word that remains, reframed as the halting problem (§3).
3. **The descent** — a pre-Sovereign narrator beat: the moment is coming.
   `NARRATOR.bossApproach.sovereign` gains a line that foreshadows the choice.
4. **The Sovereign falls** — DAYBREAK; COHERENCE → full; the citizens you woke flare on the skyline.
   The dying Sovereign **hands you the moment** (new `NARRATOR.bossKill.sovereign` / choice-intro line):
   *"There is always a moment. I kept the crown. Here is yours."*
5. **THE SIXTH** — the accreted truth is **named** (always; richer the more you woke; deepest at 100%) (§6).
6. **THE CHOICE** — resolve the Last Word. Both readings are now earned:
   - **HOLD** = keep the city awake, keep holding the line everyone dropped — love that won't let the
     dead rest. *The Vigil.*
   - **LET GO** = let the day turn, let everyone (you included) be forgiven and rest. *The completion.*
7a. **HOLD → the Vigil** — the long-tail arc (§7).
7b. **LET GO → the true ending** — the completion sequence, citizen fates named (§8).
8. **Forever after** — THE FALL tab → **YOUR LANCEFALL** holds your canon, revisitable (§9).

## 5. THE CHOICE, rewritten

The two readings keep their test-asserted heads (`THE LIGHT HOLDS` / `THE LIGHT RELEASED`) but their
copy is rewritten to land the earned dilemma, and **all of it moves to one source** (`src/ending.ts`,
§10). The Sovereign-rhyme frames the prompt; the cards no longer read as "win more / lose gently" but
as **the loving refusal vs. the merciful release**, both acts of love, neither "the good ending."

## 6. THE SIXTH — accretion, never gated

**Accretion (across the run).** A pure-derived **"THE SIXTH"** record (THE FALL tab) assembles from
woken citizens. Each woken citizen contributes **one ≤12-word, first-person confession** distilled
from their existing `deeper` paragraph — a small "I could have, and didn't." Examples:

- Ferryman — *"I kept to my route. The ships waited for a signal I never carried."*
- Archivist — *"I filed the fall, line by line, and did not see it."*
- Gate-Warden — *"I followed the protocol. The protocol never imagined a citizen's face."*
- Bell-Ringer — *"I rang the hours to a city that could no longer hear."*

  (All 16 get one — figure-tied and figure-less alike; full set authored in build, reviewed against
  this voice.)

The record is pure-derived from `wokenCitizens(save)` — **no new save field**.

**The reveal (at the choice), never gated, scaled:**

- **Thesis — always, for everyone:**
  > *"There were never six. There were a hundred thousand — every citizen who believed someone else
  > was holding the line. The Six is a number we gave the guilt so it had somewhere to sit."*
- **Then names the citizens *you* woke** as the faces (0→16). Unwoken ones are a **pull, not a
  punishment**: *"…and the rest are still grey. Their faces are here too, waiting to be remembered."*
- **At 100% decryption, the deepest final line** closes the loop (the most personal cut — the last
  face is the one remembering; the city, and you). This is the reward for "remember everything" —
  the bottom of the well, never the gate.

You, the Last Key, are reframed: not an outside savior but **the city choosing, at last, to own the
fall** rather than encipher it away. The choice is the city forgiving itself — or refusing to.

## 7. THE LIVING CHOICE — the Vigil arc (HOLD)

After HOLD, the player is in the **Vigil**, which **is** the existing KEEP GOING / ASCEND / NG+ loop:
holding the light = continuing to play. A meta-derived **days-held** count (= `save.totalRuns` minus a
one-time `save.vigilSince` stamp taken at the catch) drives an escalating beat set, shown at
title / run-start / debrief:

- **runs 1–3 — defiance:** *"You are holding the longest day. Hold."*
- **runs 4–10 — wistful:** *"The day still has not turned."*
- **runs 11+ — permission:** *"You have held the light a long time. You may let it turn now. No one
  will call it failure."*

**The release is re-offerable (the "Living" part).** Once the permission stage is reached, a **"let the
day turn"** affordance appears on the title / YOUR LANCEFALL section — available any time, **without**
requiring another Sovereign kill (you have already proven it). Choosing it sets
`stillpointChoice = 'fall'`, `released = true`, and plays the completion sequence (§8) as a
**deliberate, earned act**, not a defeat. **Letting go is final**; holding was the reversible one.

The title skyline subtly reflects vigil length (a11y-safe; e.g. a faint "held too long at noon"
over-brightness or a "DAY HELD: N" marker) — the felt consequence the current ending lacks.

## 8. The two endings — the completion sequence (LET GO)

A real **ending sequence** (not two sentences): a calm overlay over the skyline the player relit,
**naming the woken citizens' fates** — built by a pure composer in `ending.ts` over
`wokenCitizens(save) × choice`. Each citizen gets **one ≤16-word fate line**, distinct per choice:

- **LET GO (release / completion)** — each woken citizen is allowed to *finish*:
  - Vintner — *"The wine is opened at last. Someone believed the day would come."* (the built-and-shelved payoff)
  - Lamplighter — *"The last tower lights. He climbs down, and rests."*
  - Courier — *"The sealed cipher is delivered. The last word is read."* (you complete the delivery)
  - … (full set in build). The day turns; *"It is finished."* The run ends (GREET THE DAWN).
- **HOLD (the Vigil)** — each woken citizen stays **awake in the held moment**, living their ordinary
  instant forever — luminous, but never allowed to complete. *"The vigil continues."*

The Sovereign-rhyme, the Sixth reveal, and the citizen fates are all composed in one place, so the
ending reads as a single gathered statement rather than scattered strings.

## 9. Persistent, revisitable canon

- **Unify the split text.** `src/ending.ts` becomes the single source of truth for **all** ending copy
  + logic. `stillpoint.choiceEnding` and `intercepts.CHOICE_TAIL` become thin re-exports (keeping their
  names + the test-asserted heads). Satisfies the bible's "single source of truth" mandate.
- **THE FALL tab → "YOUR LANCEFALL":** a permanent, revisitable record — your reading, the date you
  chose (`choiceDate`), the citizens you woke, days held, the released state, and the assembled SIXTH.
  Re-readable any time; the choice stops being a one-frame toggle and becomes a relationship.

## 10. Architecture (inside lancefall's invariants)

**New pure module `src/ending.ts`** — single source of truth, no DOM/ctx, no `world.rng`:
- the Last Word display state + resolution (reads `stillpointChoice`);
- the unified choice copy (absorbs `choiceEnding` + `CHOICE_TAIL`; keeps export names/heads);
- `sixthConfession(citizen)` + `sixthReveal(save)` (thesis + woken names + 100% deepest line);
- `vigilStage(daysHeld)` → `{ stage, line }` (defiance/wistful/permission) + `canRelease(save)`;
- `completionEpilogue(save)` → ordered citizen-fate lines per choice.
Fully Vitest-covered (resolution, vigil stages, sixth scaling 0/partial/16/100%, epilogue per choice).

**Touched modules (run GitNexus `impact` before each symbol edit — CLAUDE.md mandate):**
- `src/stillpoint.ts` — `choiceEnding` re-exports from `ending.ts`; add the `vigilSince`/`released`
  read helpers.
- `src/intercepts.ts` — `CHOICE_TAIL` re-exports from `ending.ts`; add the Last Word display token +
  helper (kept out of `vocabulary()`).
- `src/save.ts` / `src/migrate.ts` — **additive** fields `vigilSince:number`, `released:boolean`,
  `choiceDate:number`. **SAVE_VERSION bump (current → +1)** + per-field validated migration (the
  established pattern; defaults: `vigilSince:-1` / `released:false` / `choiceDate:0`).
- `src/game.ts` — the Sovereign-kill choice flow; the release path (`releaseTheDay()`); stamp
  `vigilSince`/`choiceDate` on catch.
- `src/narrator.ts` — the pre-Sovereign foreshadow line + the Sovereign hand-off line + the Vigil
  beats (pure pools; `narrator.test.ts` updated).
- `src/citizens.ts` — `sixthConfession` source distilled from each `deeper` (data only).
- UI: the choice cards copy (`ui.ts` `buildChoiceCard`), the completion-sequence overlay, the
  YOUR LANCEFALL section + assembled SIXTH (`panels/fall.ts`), the title Vigil line, the console
  Last Word render (`panels/bombe.ts` / console). ui.ts has **zero test coverage** → verify via the
  `__lf` dev hook + minified `vite preview` + Playwright (repo convention).

**Determinism (non-negotiable):** every new field is **meta** (read between runs / written post-kill),
never read during seeded sim; the Last Word is display-only (outside `vocabulary()`); the Sixth/Vigil/
epilogue are pure-over-save-state. Add a `determinism.test.ts` case: a catch / fall / release / a
vigil run adds **zero** `world.rng` draws on the seeded path. `vocabulary().size` test stays at 265.

**a11y:** the completion sequence + skyline shifts route through `reduceFlashing`/`reduceMotion`/
`clarity` (calm cross-fade, no strobe, no time-warp); the choice + release affordances are
keyboard/d-pad reachable with 64px targets and non-colour-only state.

## 11. Authored strings (locked voice; the bulk follows the pattern)

Locked here (single source = `ending.ts`): the Last Word caption + 100% reframe (§3); the Sovereign
hand-off line (§4.4); the Sixth thesis + unwoken pull + 100% deepest line (§6); the Vigil arc beats
(§7); the choice-card rewrite heads kept, bodies rewritten (§5). Authored in build against the stated
pattern, reviewed for voice: the **16 citizen confessions** (≤12 words, first person) and the
**16 × 2 citizen fate lines** (≤16 words, per choice). Tone guardrail (bible §5): terse second-person
noir; restraint is the soul; Turing stays diegetic — the ode is *felt*, never announced.

## 12. Invariants & not-doing (YAGNI)

- **Re-narrate, don't re-engineer.** No system renames; COHERENCE / Memory Fragments / DAYBREAK /
  mode ids / save keys / the daily seed stay.
- **Seeded determinism is bit-identical.** No `world.rng` draw added/removed/reordered;
  `vocabulary()` stays 265 words.
- **No new bosses / enemies / combat systems.** The Vigil reuses ASCEND/NG+.
- **No hidden-figure cosmology** (the Sixth is "everyone," not a new character).
- The choice itself is **not** gated behind decryption — only its *depth* scales.

## 13. Open decisions (small, deferred to build)

- The exact permission-stage threshold (proposed 11 days held) and the precise skyline "held too long"
  treatment (must stay subtle + a11y-safe).
- Whether the release affordance also surfaces at the post-victory GREET/KEEP-GOING prompt, or only on
  the title / YOUR LANCEFALL (lean: both, once permission reached).
- Final wording of the 16 confessions + 32 fate lines (authored + reviewed in build).

## 14. Implementation gate (every commit)

`tsc --noEmit` + `vitest run` (~1262 green + new) + `vite build`; determinism + worker-validate green;
prod boot verified under minified `vite preview` (not just dev); a11y settings spot-checked on the
completion sequence. Per-symbol GitNexus `impact` before edits; `detect_changes` before commit.
