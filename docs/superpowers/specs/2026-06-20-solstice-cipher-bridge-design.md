# Solstice Protocol — the Cipher Bridge (combat ⇄ console)

> Status: DESIGN (approved in brainstorming 2026-06-20). Next: implementation plan.
> Scope: **Solstice Protocol (`longestday`) ONLY.** Every other mode is untouched.

## 1. Problem & intent

THE LAST LANCE has **two cipher layers that don't talk to each other**:

1. **In-combat ring-cipher** — already live in Solstice (`cipherLock: true`): Warden/Weaver/Beacon/Sovereign spawn *armored*; you break them by dashing their orbiting cipher cores in the decoded order (per-class escalation: Caesar → substitution → partial → rotor). Deterministic (pure seed hash, **zero `world.rng`**), forgiving.
2. **The meta BOMBE console** — decrypt the 13 lore transmissions word-by-word with Fragments + cryptanalysis puzzles. Untimed, unfailable, save-side, and **completely disconnected from any run**.

The owner wants the cipher/decryption/puzzle layer to **become part of combat — for Solstice Protocol specifically** (the campaign spine; "every boss is a cipher"), done carefully, with other modes left exactly as they are.

The design connects the two layers into a **two-way loop**, both directions gated on `mode.cipherLock`:

- **Combat → Console (always on in Solstice):** downing a boss decrypts words of *its own* transmission, scaled by how well you won. Play feeds the meta history; THE LONGEST DAY (100%) becomes reachable through skilled play, not just Fragment-grinding.
- **Console → Combat (two independent opt-in toggles, both default OFF):** what you've decrypted at peace makes the locks easier to read (and, fully earned, to skip) under fire — but only if you opt in, so the default Solstice experience is unchanged (**depth, not difficulty**, held by default).

### Decisions locked in brainstorming
- Spine = **A (bridge) + C (campaign decode)**; **B (mid-run solving input)** explicitly deferred.
- Grant size = **scales with how you won** (a deterministic decode-grade → word count).
- Console→combat = **two independent toggles**, both **opt-in / default off**.
- Mastery-skip threshold = **per-boss AND proven**: a boss spawns pre-broken only when you've **fully decrypted its own transmission** *and* **downed it before in Solstice**.

## 2. Architecture

| Piece | Where | Why |
|---|---|---|
| Boss↔transmission map, decode-grade→words math, legibility-floor math, skip predicate | **NEW pure `src/cipherBridge.ts`** (unit-tested, zero rng) | one focused, testable home; keeps `game.ts` to thin reads |
| Save fields (additive) | `src/save.ts` + `src/migrate.ts` | `cipherLegibility: boolean` (def false), `cipherSkip: boolean` (def false), `solsticeBossKills: string[]` (def []) — sanitized like `taught`, **no SAVE_VERSION bump** (generic loader tolerates additive fields) |
| Two Settings toggles | `src/panels/settings.ts` (+ thin `ui.ts`/`game.ts` wiring) | a clear opt-in surface, off by default |
| Boss-down grant + kill record | thin hook in the existing boss-death path in `game.ts` (gated on `mode.cipherLock`) | calls `cipherBridge` + mutates save; no rng |
| Legibility floor | extend the `revealed` computation that `cipherDecode.ts` already feeds the HUD | view-layer only — never the cores/order/seed |
| Pre-broken at spawn | extend the `spawnCipherRing` gate (`game.ts` ~3539) + `bossCipherArmored` (~2208) | decided from a **run-start save snapshot** |

**Boss → transmission map** (by existing `loreLink`):
`warden→warden-lore` (THE FIRST GATE) · `weaver→weaver-lore` (THE SCRIBE OF LIGHT) · `beacon→beacon-lore` (THE SIGNAL UNSENT) · `mirrorblade→mirror-lore` (THE IMITATION) · `hollow→hollow-lore` (THE ONE WHO STAYED) · `sovereign→sovereign-lore` (THE CROWN'S CHOICE).

## 3. Flow A — Combat → Console (always on in Solstice)

On **boss death in a `cipherLock` run**:

1. **Record the kill:** add the boss `kind` to `save.solsticeBossKills` (deduped) — the "proven" half of the skip predicate.
2. **Compute the decode-grade** from how the fight went (deterministic; no rng):
   - base **2 words** — downed a Solstice boss;
   - **+2** — *flawless lock*: broke its cipher with **zero wrong dashes** (ring/rotor bosses; Mirrorblade/Hollow, which have no ring cipher, skip this tier);
   - **+2** — *untouched*: took **no would-be-fatal hit** during that boss fight.
   - → **2–6 words**, then **clamped to the words still undecrypted in that boss's transmission**.
3. **Grant:** decrypt the *cheapest still-undecrypted words of that boss's transmission* (a transmission-scoped `crackCheapestFree`), reusing the proven word-reveal path. This advances `masterProgress` and can complete the transmission (unlocking its CODEX memory via the existing `syncInterceptLore`).
4. **Feedback:** a `+N WORDS DECODED — THE FIRST GATE` floatText on the kill; a one-time gloss the first time it happens ("the fall, decoding through battle"); the decrypt tick sfx.

**Instrumentation needed:** a per-boss **wrong-dash counter** (extend the cipher reducer / track on `world.cipher`) and a **hit-during-this-boss flag** (compare `hitsTaken` at boss-spawn vs boss-death). Both deterministic.

This flow **ignores the toggles** — playing Solstice always feeds the console. It is the campaign spine (decision C) and the combat→console half of the bridge (decision A) unified: *the same transmission you fill by fighting a boss is that boss's story.*

## 4. Flow B — Console → Combat (two independent opt-in toggles, both default OFF)

Both read a **run-start snapshot** of the save (so nothing shifts a lock mid-fight; the snapshot is taken when the run starts, like other run config). A consequence: words decrypted **by Flow A during a run take effect on the *next* run's locks**, not the current one — locks stay stable for the whole fight, and there's no surprising intra-run easing. Both are **no-ops in every non-`cipherLock` mode**.

### 4a. Cipher Legibility Assist (`cipherLegibility`, default off)
When on, the boss-cipher HUD pre-reveals **more of the decode key**, scaling with master-cipher %: it raises the floor of the `revealed[]` booleans `cipherDecode` already computes (e.g. reveal `floor(masterFrac × keyLen)` extra key letters), **capped so at least the final step / the rotor's live stepping is never pre-given** — the lock stays a real act even at 100%. It changes **only** what the HUD shows; cores, order, and seed are identical. "What you studied at peace, you read under fire."

### 4b. Mastery Skip (`cipherSkip`, default off) — *per-boss AND proven*
When on, a ring-cipher boss spawns **pre-broken** (armor off, no cores) **iff both**:
- its **own transmission is fully decrypted** (`isInterceptComplete` of the mapped intercept), **and**
- its `kind` is in `save.solsticeBossKills` (you've downed it before in Solstice).

A pre-broken boss shows a brief `LOCK ALREADY READ` HUD note. (A pre-broken boss yields no break-event, so Flow A grants only its base words — consistent, and its transmission is already complete anyway.)

The two toggles are **fully independent**: a player can have readable locks without skips, skips without the reading aid, both, or neither (the default).

## 5. Determinism, safety & scope guarantees

- **No `world.rng` in any seeded path.** Word grants are save-side mutations at boss-death (like the shipped puzzle reward). The pre-broken decision is made at boss-spawn from the **run-start snapshot**; `spawnCipherRing` already draws zero `world.rng`, and *not* spawning it draws zero — the seeded wave stream is provably untouched.
- **Legibility is view-only** — the `cipherDecode.revealed[]` floor, never cores/order/seed.
- **Solstice is `seedKind: 'random'`** (not bit-identical-for-all like the Daily), so there is no cross-player determinism contract to break; the contract we *do* keep is "player/console state never perturbs the wave RNG stream" — verified by test.
- **Other modes untouched:** every hook early-returns unless `mode.cipherLock` is true (only Solstice today).
- **Depth, not difficulty, by default:** both easings are opt-in and off by default, so the out-of-the-box Solstice fight is exactly as it is today. The combat→console grant only *adds* meta progress; it never makes a run harder.

## 6. Feedback & a11y
- Boss-down word-earn: floatText + first-time gloss + decrypt tick (reuse shipped surfaces).
- Pre-broken: a short `LOCK ALREADY READ` HUD note.
- Settings: two clearly-described toggles under a "SOLSTICE / CIPHER" group, both off.
- All new visuals honor `reduceMotion` (held), `reduceFlashing` (soft), `clarity`, `hudScale` like the rest.

## 7. Testing
- **Pure (`cipherBridge.test.ts`):** boss→transmission map; decode-grade→word-count tiers + the clamp-to-remaining; the legibility-floor function (monotonic in masterFrac, capped, never reveals the final step); the skip predicate (true only when transmission complete AND kind in solsticeBossKills).
- **Save (`migrate.test.ts`):** the three additive fields default + sanitize; non-array/garbage coerced.
- **Integration (extend `cipherIntegration.test.ts`):** downing a Solstice boss grants the right words to its transmission and records the kill; a `cipherSkip` pre-broken spawn draws **zero `world.rng`**; non-`cipherLock` modes grant nothing and never pre-break.
- **`determinism.test.ts` green** (the cardinal check).
- **Prod build + minified `vite preview`:** play a Solstice boss, see the word-earn; toggle each setting and confirm legibility/skip behave; 0 console errors; reduceMotion/reduceFlashing honored.

## 8. Out of scope (this pass)
- **B — mid-run solving input** (call-the-plaintext / candidate-pick). Deferred; revisit after this ships and feels good.
- Any change to non-Solstice modes, the Daily's bit-identical contract, or the existing ring-cipher feel for purists (default experience unchanged).
- New puzzle types / daily intercept / leaderboard changes.

## 9. Definition of done
- In Solstice, downing a boss visibly decrypts words of its transmission, scaled by how you won; the master cipher advances through play.
- Two independent, off-by-default Settings toggles: Legibility Assist (capped reading aid) and Mastery Skip (per-boss-AND-proven pre-broken).
- All bridge logic in pure `cipherBridge.ts`; `game.ts` thin reads; additive save fields sanitized; **zero `world.rng`** in seeded paths; `determinism.test.ts` green.
- Other modes provably unchanged; default Solstice experience unchanged (both easings opt-in).
- tsc clean, full suite green (+ new tests), prod boot clean. Owner OKs any deploy.
