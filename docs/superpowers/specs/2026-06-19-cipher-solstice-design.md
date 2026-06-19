# THE LAST KEY — Cipher & Solstice Deepening (design spec)

> **Status:** approved in brainstorming (2026-06-19). The owner asked for **all** of it,
> taken to completion, with **depth and complexity — not difficulty**. This spec is the
> source of truth the implementation plan will be cut from.
>
> **Jam:** dev.to June Solstice Game Jam — *Best Ode to Alan Turing*. Two topics, one premise:
> the **solstice** (light clawing back from grey to its longest day) and **Turing** (the loop
> *is* cryptanalysis; the imitation game is a boss; the halting problem is the ending).

---

## 1. The pivot in one sentence

Take LANCEFALL's already-shipped code-breaking verb from *"read a key you're handed"* to
**"read *and deduce* the key,"** make **SOLSTICE PROTOCOL** the game's main spine, and tell the
**entire history of Lancefall through decryption** — in combat (a fast, forgiving deduce-verb)
and in a new **interactive cockpit codebreaker console** (THE BOMBE) where Memory Fragments buy
**partial, costly** message decryption, fixing the dead-currency problem and turning the lore
into something you *break*, not something you *buy*.

## 2. The unifying equivalence (already true — we lean all the way in)

One idea makes every system mean the same thing without re-engineering the engine:

> **memory = light-code · to forget = to encrypt · to remember = to decrypt**

The city was written in living light. The Six who let it fall *enciphered* it — scrambled its
memory into grey noise so the loss couldn't be read or felt. You are **the Last Key**. Every
boss is a lock; the descent is a decryption; the longest day is the city, finally, fully read.

## 3. What already ships (the foundation this spec builds ON)

This is **not** a from-scratch build. The following already exist and stay:

| Already shipped | Where |
|---|---|
| **READ THE KEY** — a live substitution cipher: ciphered glyph-cores ringing a boss; HUD shows the plaintext word + a substitution key; dash the cores to spell the word in order; wrong dash fizzles (progress kept); no give-away "next core" ring (survives only as a Casual assist) | `cipher.ts` (pure reducer), `cipherDecode.ts` (pure view), `game.ts` keypad wiring, `world.cipher` |
| **SOLSTICE PROTOCOL** mode — every boss is a cipher-lock | `modes.ts` (`id:'longestday'`, `cipherLock`) |
| **FIRST LIGHT** — authored daybreak wash on a winning cipher-crack | render path |
| **Mirrorblade = the Imitation Game**; **THE CHOICE = the Halting Problem** | `src/bosses/*`, sovereign path |
| **THE FALL** premise card + a complete Turing×solstice re-narration of every narrator line / lore entry / dossier | `lore.ts`, ui |
| **Memory Fragments** collected + spent on lore in a Codex | `save.ts` (`stillpointFragments`, `fragmentsSpent`, `stillpointLore`), `lore.ts` |
| **Determinism guard** — the cipher derives its code from `(world.seed, bossWave, cipherCycle)` and draws **zero** scoring RNG, so the Daily is bit-identical for everyone | `cipher.ts` `cipherSeed`, `determinism.test.ts` |
| **CIPHER STORM** — a passive animated decode backdrop on the cockpit title | `cockpitCipher.ts` |

The honest delta below is what's **new**.

## 4. The one hard constraint: depth, not difficulty

Every piece is judged against this. It is a **gate**, not a slogan:

- **No piece may add bullets, shrink timing windows, or raise damage.** The cipher is a
  *reasoning* layer laid over the *same* fight. Difficulty is unchanged; what deepens is *what
  you're thinking about*.
- **In-combat cryptography is always forgiving + glanceable.** The key is on the HUD at all
  times (no memory tax). A wrong dash is a cosmetic no-op — progress is never lost, never
  punished. The Casual `cipherAssist` next-core ring stays, so the deduce-layer is **opt-in
  depth** — a player who never wants to read a cipher can still play.
- **The genuinely intricate cryptanalysis lives in the untimed cockpit console**, where there
  is no combat pressure — so it can be as deep as a newspaper cryptogram without ever being
  *hard* in the bullet-hell sense. This combat/console split is the spine of the whole design.
- **One new idea per boss, telegraphed.** The escalation is spread across the descent and each
  class gets a one-line read-hint on first sighting (coordinated with the onboarding work).

If any item below starts to read as "harder," it's wrong — re-cut it as "deeper."

---

## 5. PIECE 1 — The deduce-verb: escalating cipher *classes*

Today the decode **view** hands the player the entire key (`cipherDecode.decodeView` returns,
per step, the exact cipher symbol to dash). That's *reading a lookup table*, not *breaking a
code*. The elevation: keep the pure reducer **exactly as is** (`dashCipherCore(c, slot)` still
just checks `slot === order[progress]`), but vary **how the code is generated** and **how much
of the key the view reveals**, by a new `CipherClass`. The player deduces the rest from
structure. This is the literal history of cryptanalysis, played in order:

| Boss (descent order) | Class | What you deduce | The Turing/crypto idea |
|---|---|---|---|
| **WARDEN** (early) | `caesar` | The cores show the plaintext word shifted by a constant *k*. The HUD reveals **one** solved pair (a crib, e.g. `L → O`). Deduce *k* from it, apply it to every other letter. | The crib — one known pair cracks a shift |
| **WEAVER** (mid) | `substitution` | A full arbitrary substitution, but the HUD legend is only **partly** filled. Deduce the missing letters from word structure (repeats, position). | Frequency / pattern analysis |
| **BEACON** (mid-late) | `partial` | The key starts mostly hidden; the Beacon's own beam sweep **reveals one core's symbol each pass**, *or* you spend a small in-run decode charge (earned by grazing) to reveal one more — a live, optional cost/benefit. | Partial-information attack; pay-to-reveal |
| **SOVEREIGN** (final, master cipher) | `rotor` | The key **advances one step after each correct dash** (an Enigma rotor stepping). You can't memorise a static key; track the offset, shown as a dial on the HUD. | The polyalphabetic / Enigma machine |

**Why this is depth not difficulty:** the bullet pattern, boss HP, arena, and timing are
identical to today. What changes is the *thought*: a crib, then frequency, then partial-info
economics, then a moving key. Each is glanceable (the partial key / crib / rotor-dial is always
on the HUD) and forgiving (wrong dash keeps progress). A player using the Casual assist sees the
next-core ring and never has to deduce at all.

**The other two bosses already *are* ciphers** and stay as-is (no ring-class): **THE HOLLOW** is
a one-time key (kill an echo to open the window — its own puzzle), and **THE MIRRORBLADE** is the
imitation game (Piece 6). So the four `CipherClass` values apply only to the ring-cipher bosses
(`bossUsesRingCipher`); Hollow/Mirrorblade are untouched by Piece 1.

**Implementation shape (additive, pure, determinism-safe):**
- `cipher.ts`: add `CipherClass = 'caesar' | 'substitution' | 'partial' | 'rotor'` to
  `CipherState` (default `'substitution'` = today's behaviour, so absent ⇒ no change).
  `makeCipher(n, seed, cls)` generates `glyphs`/`order` per class from the **same seeded local
  RNG** it already uses — never `world.rng`.
- **The reducer `dashCipherCore(c, slot)` stays byte-for-byte unchanged** — it still only checks
  `slot === order[progress]`, and `order` (the correct core sequence) is fixed for the whole
  fight. All four classes differ purely in (a) how `makeCipher` lays out `glyphs`/`order` and (b)
  how much of the key the *view* reveals. **The rotor is a view+generation concern, not a reducer
  one:** `makeCipher('rotor', …)` must lay out `glyphs`/`order` so that applying a per-step legend
  shift of `progress` to `plain[progress]` lands exactly on the symbol worn by `order[progress]`
  (the rotor relationship is baked in at generation, seeded + pure). The view then shows the
  offset as a dial; the player reads the *rotated* legend each step. No per-step mutation of
  `order`, no new reducer state.
- `cipherDecode.ts`: add a per-class **`keyReveal`** policy — how much of the
  `key[]` the view exposes (`caesar` → 1 crib; `substitution` → a seeded subset; `partial` →
  grows with beam-passes / spent charge; `rotor` → base legend + current offset). Stays pure,
  derives only from `CipherState`, draws zero RNG. Extend `DecodeView` with `revealed: boolean[]`
  (per step) and `rotorOffset?: number`.
- `game.ts`: one thin line — pick the class for the boss from mode/boss data and pass it to
  `makeCipher`. No new `world.rng` draw. The keypad path (`keyCipherCore` → `dashCipherCore` →
  `solveCipher`) is **unchanged**.
- The in-fight **HUD** (READ THE KEY panel) gains per-class chrome — the crib line, the partial
  legend, the rotor dial — drawn in a focused `src/render/*` module, **not** `render.ts`.

## 6. PIECE 2 — SOLSTICE PROTOCOL as the main mode (the campaign spine)

Today Solstice is one card among several, gated at wave 8. Promote it to **the game's primary
mode and default selection** — the authored descent that tells the story and showcases the verb.

- The mode becomes a **structured descent**: a fixed boss sequence whose cipher classes escalate
  in the Piece-1 order (Warden `caesar` → Weaver `substitution` → Beacon `partial` → Sovereign
  `rotor`), with the lore beats (Piece 3) decrypting between fights. It remains winnable.
- The title rail **defaults to Solstice** (selected card), framed as "the story." Endless / Boss
  Rush / Daily / Nightmare stay as the replay/competition/challenge satellites around it.
- Each boss appearance unlocks/decrypts its history beat, so a full Solstice run is the **whole
  history of Lancefall, read in order** — completing the lore by *playing the decryption*.
- **Determinism:** the boss sequence + class assignment is **fixed data** on the mode (not an
  RNG draw); the per-boss cipher still seeds from `world.seed` so a Daily-Solstice is identical
  for everyone. The promotion touches mode selection/data only — no seeded-sim change.

## 7. PIECE 3 — The history, told *through* decryption

Lore today is *bought whole* with fragments and read in a Codex. The pivot: lore is
**decrypted**, never purchased outright — you break it open.

- The 13+ `lore.ts` entries are reframed as **MESSAGE INTERCEPTS**: each is an encrypted
  transmission (ciphertext words) that resolves to a plaintext history beat.
- Beats unlock two ways, both *earned by codebreaking*: **(a) in a Solstice run**, defeating the
  boss that guards a beat decrypts it (story-paced); **(b) in the cockpit console** (Piece 5),
  by spending fragments to decrypt it word-by-word at your own pace (collection-paced).
- The text resolves **in place** with the existing decode aesthetic (the cockpitCipher
  scanline's noise→readable snap, made persistent), so reading the history *looks* like
  breaking it. `stillpointLore` stays the unlocked-set; "unlocked" now means "fully decrypted."

## 8. PIECE 4 — The Memory-Fragment decryption economy (the dead-currency fix)

The owner's exact complaint: fragments *"quickly become useless."* Today
`fragmentBalance = collected − spent`, and once you've bought the lore there's nothing to spend
on. The fix is a **perpetual, partial, costly** sink:

- You spend fragments to decrypt an intercept **one ciphered token at a time** (a token = one
  word of the message). Common tokens are cheap; the **key tokens** (the revelations) cost more —
  so there's always a next token to buy, and a meaningful order to buy them in.
- **Partial decryption is useful on its own**: a half-decrypted intercept still reads as a
  tantalising, gappy transmission (the gaps *are* the hook), and decrypting a shared ciphered
  token in one intercept **reveals it everywhere** (a cross-intercept key — small cryptanalysis
  reasoning in the meta layer too).
- This makes fragments a **forever sink** and ties the currency directly to the jam's verb:
  every fragment you spend is a letter of the city's memory brought back to light.

**Save changes (additive — determinism-irrelevant, it's meta/save-side):**
- Add `decryptedWords: string[]` — ids like `"intercept:warden:3"` for each decrypted word.
- Keep `stillpointFragments` / `fragmentsSpent`; `fragmentBalance` is unchanged. Spending on a
  word increments `fragmentsSpent` and pushes the word id.
- A pure `src/intercepts.ts` owns the catalog (intercept id, ciphertext words, plaintext, per-word
  cost, lore link) + pure helpers (`costOfNextWord`, `decryptState`, `isFullyDecrypted`). Tested
  like `lore.ts`. `migrate.ts` gets per-field validation for `decryptedWords` (defaults `[]`);
  the generic loader already tolerates an additive array, so **no SAVE_VERSION bump** unless the
  card-agent's in-flight migrate work forces one (land after it settles — see the stats-dossier
  precedent in memory).

## 9. PIECE 5 — THE BOMBE: the interactive cockpit codebreaker console

The marquee new piece, and the owner's "elements in the cockpit." Today `cockpitCipher.ts` is a
**passive** backdrop. Make the cockpit a **working codebreaker station**:

- A cockpit panel — **THE BOMBE** (a `panels/*` modal, built with the `buildXPanel(deps) →
  Panel {root, open(save)}` convention and the `panels/dom.ts` reconciler) — opened from a
  cockpit control alongside RANKS/HEAT/STATS/SKINS.
- It renders **THE MASTER CIPHER**: the city's whole history as one large encrypted document
  that **lights up grey→neon as you decrypt more** — the coherence/solstice dial made literal
  and interactive. Reaching **100% decrypted is the meta mirror of FIRST LIGHT** (Piece 9): the
  city, fully remembered.
- Inside it you **spend fragments to decrypt intercepts** (Piece 4, surfaced) and watch the
  document resolve.
- **THE BOMBE meta-tool** (ode to Turing's bombe): an unlockable/upgradable engine that **cracks
  faster** — e.g. each completed run it auto-decrypts the single cheapest unrevealed word
  ("running overnight"), and higher Bombe levels reduce per-word fragment cost. A gentle,
  perpetual, *idle* cryptanalysis loop that rewards just playing — pure depth, zero added
  difficulty.
- **Cryptanalysis puzzles to unlock things** (the owner's phrase): the console hosts a handful
  of **optional, untimed, self-contained ciphers** (a Caesar, a substitution cryptogram, a
  Vigenère) whose solutions unlock **cosmetics** (dash-trail / ship skins), **lore**, or even a
  **mode**. These live entirely in the meta layer — no combat clock, no seeded sim — so they can
  be genuinely brain-bending (depth) while being impossible to *lose* (not difficulty). The
  cockpit HUD glyphs resolve as each puzzle is solved (the station "comes online").

**Implementation shape:**
- New pure `src/bombe.ts` — Bombe level/effects (auto-crack target, cost multiplier) + the
  console-puzzle definitions and **answer verifiers** (pure; tested). No RNG.
- New `panels/bombe.ts` — the modal (reconciler-driven list of intercepts + the master-cipher
  meter + the puzzle board). Happy-dom panel tests like the other extracted panels.
- `cockpitCipher.ts` — additive read only: the backdrop's decode progress reflects
  `decryptedWords.length / total` (it already reads `--coh` and THE CHOICE the same decoupled
  way). The interactive surface is the panel on top; the backdrop just *responds*.
- Save: `bombeLevel: number`, `solvedPuzzles: string[]` (additive, defaulted, migrate-validated).

## 10. PIECE 6 — The Imitation Game (Mirrorblade) — keep, name it louder

Already the Turing test embodied (a boss that moves as you do, in your colour). No mechanical
change needed; ensure the **first-sighting read-hint** and its dossier name the imitation game
explicitly, and that beating it (breaking the mirror) decrypts its history beat like every other
boss. It is the *human* answer to a machine that learned you.

## 11. PIECE 7 — The unbreakable final cipher = THE CHOICE (the Halting Problem)

Already shipped and it stays the climax: break the master cipher and you reach the one lock that
*cannot be solved, only chosen* — hold the light at its height or let the day turn. A
deterministic game handing the player its single un-computable input. Ensure the decryption arc
*lands here*: THE CHOICE is the last "decryption" and the only one no machine (or Bombe) can do
for you. THE CHOICE's coherence floor already feeds the cockpit backdrop — keep that wiring.

## 12. PIECE 8 — The longest day (victory = the solstice)

FIRST LIGHT already floods the frame to full day on a winning cipher-crack. Tie it to the whole:
the **in-run** climax is FIRST LIGHT; the **meta** climax is the cockpit master cipher reaching
100% decrypted — both are "the city fully read, the longest day returned." The two share the
grey→neon coherence language so winning a run and completing the archive *feel* like the same
act at two scales. No new tech — a wiring + framing pass.

---

## 13. Architecture & file structure (the structural mandate)

Never grow the god-files (`skins.ts` ~5048, `ui.ts` ~4217, `game.ts` ~3040, `render.ts` ~2503).
New work goes in **focused modules** following the established `dash.ts` / `src/bosses/*` /
`src/render/*` / `panels/*` precedents. Extract opportunistically when a god-file is touched.

| Concern | Home | Pure? | Tested by |
|---|---|---|---|
| Cipher classes (generation) | extend `src/cipher.ts` | yes (seeded-local RNG only) | `cipher.test.ts` + class cases |
| Key-reveal policy + rotor offset | extend `src/cipherDecode.ts` | yes | `cipherDecode.test.ts` |
| In-fight per-class HUD chrome (crib / partial legend / rotor dial) | new `src/render/cipherHud.ts` | drawing | render smoke + pure helpers |
| Intercept catalog + decrypt economy | new `src/intercepts.ts` | yes | new `intercepts.test.ts` |
| Bombe meta-tool + console puzzles + verifiers | new `src/bombe.ts` | yes | new `bombe.test.ts` |
| The cockpit codebreaker console modal | new `panels/bombe.ts` | DOM (reconciler) | happy-dom panel test |
| Master-cipher backdrop response | additive read in `src/cockpitCipher.ts` | — | existing |
| Solstice-as-main: boss sequence + class data, default selection | `src/modes.ts` (+ rail default) | data | `modes.test.ts` |
| Lore ⇄ intercept linkage; history-through-decryption | `src/lore.ts` ⇄ `src/intercepts.ts` | yes | lore/intercept tests |
| Per-boss class pick (one line); pass-through | thin in `src/game.ts` | — | `cipherIntegration.test.ts` |
| New save fields + validation | `src/save.ts` + `src/migrate.ts` | yes | `migrate.test.ts` |
| First-encounter read-hints per class/boss | `src/onboarding.ts` (coordinate with onboarding handoff) | yes | `onboarding.test.ts` |

## 14. Data flow & the determinism boundary (the cardinal rule)

Two cipher worlds that **never cross**:

```
COMBAT (seeded, pure, bit-identical for everyone)
  world.seed ─▶ cipherSeed(seed, bossWave, cipherCycle) ─▶ makeCipher(n, seed, class)
            ─▶ CipherState ─▶ dashCipherCore (reducer) ─▶ solveCipher
            ─▶ cipherDecode.decodeView (read-only) ─▶ render/cipherHud
  Draws ZERO world.rng. Class + boss-sequence are FIXED DATA. Daily stays identical.

META (save-side, no sim, determinism-irrelevant)
  save.decryptedWords / fragmentsSpent / bombeLevel / solvedPuzzles
            ─▶ intercepts.ts (economy) ─▶ bombe.ts (auto-crack, puzzles)
            ─▶ panels/bombe.ts (console) ─▶ cockpitCipher (backdrop responds)
  Pure save mutations only (array push / counter inc). Never touches world.rng.
```

**The release-blocking invariant:** a single new `world.rng` draw in a seeded path is a bug.
Combat ciphers seed from `world.seed` (read, never drawn) + a seeded-local generator, exactly as
today. Meta decryption is plain save mutation. Run `determinism.test.ts` + `cipher.test.ts` +
`cipherIntegration.test.ts` after **every** change; the Daily wave stream must stay
bit-identical.

## 15. Accessibility

- In-fight key is **always on the HUD** (no memory tax); wrong dash is a cosmetic no-op; the
  Casual `cipherAssist` next-core ring remains so the deduce-layer is opt-in.
- Console puzzles are **untimed** and **unfailable** (you can leave and return; no penalty).
- No flashing: the master-cipher light-up and FIRST LIGHT are sustained cross-fades; honor
  `reduce-motion` (the cockpit's existing "STILL CITY" held-frame pattern) and `reduce-flashing`.
- Every new visual respects the existing clarity settings, matching the shipped FIRST LIGHT bar.

## 16. Testing strategy

- **Pure-first:** `cipher.ts`, `cipherDecode.ts`, `intercepts.ts`, `bombe.ts` are pure → unit
  tests are the primary safety net (each cipher class decoded end-to-end; each puzzle verifier;
  the decrypt-economy cost/state helpers; the partial-key reveal policies).
- **Determinism guard:** extend `determinism.test.ts` to prove the new classes + meta layer
  never perturb the seeded stream (same Daily seed ⇒ identical waves *and* identical on-screen
  key, for every class).
- **Panel:** happy-dom test for `panels/bombe.ts` (open with a stub save, decrypt a word, assert
  the master-cipher meter + intercept list reconcile; a Bombe auto-crack applies).
- **Migrate:** `migrate.test.ts` cases for the new additive fields (defaults, bad-type coercion).
- **Integration + smoke:** `cipherIntegration.test.ts` for the per-boss class pick; `tsc
  --noEmit` clean; full `vitest run` green (1101+ today, grows with the new suites); a production
  build + Playwright boot-smoke with zero console errors before deploy.

## 17. Save schema changes (all additive)

```
decryptedWords: string[]   // "intercept:<id>:<wordIndex>" per decrypted word     (default [])
bombeLevel:     number     // 0 = locked; higher = faster/cheaper auto-crack       (default 0)
solvedPuzzles:  string[]   // console-puzzle ids the player has solved              (default [])
```

`stillpointFragments` / `fragmentsSpent` / `stillpointLore` / `stillpointChoice` unchanged.
Prefer **no SAVE_VERSION bump** (generic loader + per-field migrate validation tolerate additive
fields — the stats-dossier precedent); only bump if the in-flight card-agent migrate rework makes
it necessary, and land after that settles to avoid clobbering a shared `migrate.ts`.

## 18. Out of scope (YAGNI)

- No new bosses, enemies, bullet patterns, or arenas — this is a *reasoning* layer over existing
  combat, plus a meta console.
- No multiplayer/cipher-duel layer beyond the existing async seed duels.
- No procedural cipher generation beyond the four authored classes (authored = legible + jam-able).
- No rewrite of the narrative — it's already re-narrated; we *complete its delivery* via
  decryption, not rewrite it.

## 19. Decisions locked (from brainstorming)

- **All pieces, taken to completion** — no phasing-out, no "Phase 2 optional." (Owner: *"I want
  all the pieces please."*)
- **Depth and complexity, not difficulty** — the gate in §4, applied to every piece.
- **No visual mockup needed** before implementation. (Owner: *"no need to mock."*)
- **Mid-fight is non-negotiable** for the verb; the deep cryptanalysis lives in the untimed
  cockpit console. (Owner: *"it definitely has to happen mid fight … read and deduce."*)
- **Fragments must become a forever sink** via partial, costly decryption. (Owner: *"partial and
  costly message decryption which would help to utilize the memory fragments."*)
- **The cockpit gets interactive cipher elements** + unlock-puzzles. (Owner: *"add this elements
  in the cockpit … maybe some cryptography puzzles to unlock things."*)
- **Determinism + structural mandates are sacred** — combat ciphers seeded/pure, meta save-side,
  god-files never grow.

---

*The descent is a decryption. The currency is light. Break the city back into meaning, and the
day stands at its longest. — THE LAST KEY.*
