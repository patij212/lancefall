# THE CIPHER LAYER — depth pass (4 features)

> Design spec. Deepens THE BOMBE / meta-cipher side of THE LAST LANCE so decryption
> feeds back into the run and the world, instead of being a terminal lorebook.
> Status: APPROVED (design) → pending written-spec review → implementation plan.

## Context (as-built)

The meta-cipher layer today:

- **`intercepts.ts`** — 13 transmissions, ~265 unique vocabulary words. You spend Memory
  Fragments to `decryptWord(save, word, costMul)`; cracking a word resolves it across
  every transmission (vocabulary-based). Fully decrypting a transmission unlocks its
  CODEX memory (`loreLink` → `stillpointLore`). `masterProgress(save)` = done/total/frac;
  **frac === 1 is "THE LONGEST DAY"** — currently only a gold meter + label, no reward.
- **`bombe.ts`** — `bombeLevel` 0..5 single linear ladder: `bombeCostMul` (cost discount)
  + `bombeAutoCracks` (N cheapest words cracked free at run-end, the "overnight" payoff).
  Plus 3 static hand-authored cryptograms (`CONSOLE_PUZZLES`).
- **`stillpoint.ts` `fragmentsForRun`** — the faucet: 1 fragment per descent + 4 milestone
  fragments (firstboss / deep / combo / sovereign). Plus puzzle rewards. That is the whole
  economy.
- **`narrator.ts`** — pure line picker; `bossApproach` / `bossKill` keyed by `EnemyKind`.
- **Save** — additive fields tolerated by the generic loader without a `SAVE_VERSION` bump.
  Relevant: `decryptedWords[]`, `bombeLevel`, `solvedPuzzles[]`, `stillpointFragments[]`,
  `stillpointLore[]`, `stillpointChoice`, `unlockedTrails[]`, `unlockedShipSkins[]`,
  `selectedShipSkins{}`, `dailySeed`.

**Hard constraint (the through-line):** every meta mutation is PURE + save-side, never the
sim, never rng. Seeded modes (`'date'` Daily / `'week'` Weekly) MUST stay bit-identical for
everyone regardless of save state. Anything that varies by a player's save is gated OFF in
seeded modes, exactly like `ngPlusIntensityMul`.

---

## Feature A — THE LAST TRANSMISSION & the 100% payoff

**Goal:** give THE LONGEST DAY (100%) a real culmination + a tangible reward stack.

### Data
- Add a 14th transmission `int-last` (title "TRANSMISSION XIV — THE LONGEST DAY", **no
  `loreLink`**) to `INTERCEPTS`, authored using **only words already present in the existing
  vocabulary** so it adds **zero** new vocab words. Consequence: it is naturally fully
  resolved the instant the master cipher hits 100%, and never shifts the 265 total.
  - Author-time guard: a test asserts `interceptWords(int-last) ⊆ vocabulary-of-the-other-13`.

### Gating + reveal
- New pure helper `isLongestDay(save): boolean` = `masterProgress(save).frac >= 1`.
- The console (`panels/bombe.ts`, owned by the polish agent — coordinate / minimal touch)
  hides `int-last` until `isLongestDay`, then renders it with a "FINAL TRANSMISSION"
  treatment reusing the gold `.done` styling. (If panel edits collide with the polish agent,
  fall back to a list-filter in the data the panel already iterates.)

### Rewards (pure, idempotent)
- `grantLongestDayRewards(save): string[]` returns the newly granted ids; safe to call every
  decrypt. Grants, once ever:
  - trail `dawn` → `unlockedTrails`
  - palette `decrypted` (gold) → palette unlock list
  - ship-skin set `lastkey` for ALL ships → `unlockedShipSkins` (`"<ship>:lastkey"` per ship)
  - achievement `longestday-read` (see Achievements)
  - a cockpit title/badge ("DECIPHERER" or similar) — render-only marker keyed off `isLongestDay`
- Wired at the decrypt call site (`game.ts` / wherever `decryptWord` + `runBombe` resolve) so
  it fires the moment 100% lands, with a celebratory toast + the existing decrypt SFX.

### Ship skin `lastkey`
- New set keyed `lastkey` ("THE LAST KEY") added to the ship-skins registry; rendered through
  the existing per-(ship,skin) `drawPlayer` pipeline as a gold/"decrypted" variant of each
  hull (extends the skin renderer; does not fork it). Reuses the FIRST LIGHT gold treatment
  as the visual base where possible. Gallery entry added.

### New cosmetics
- Register trail `dawn` + palette `decrypted` in their respective registries (locate + extend
  the trail/palette tables; default-locked, unlocked only by Feature A).

---

## Feature B — Decryption Intel (the real run advantage)

**Goal:** decryption gives a *real* gameplay advantage — knowledge-as-power — without ever
breaking seeded fairness.

### New pure module `intel.ts`
- `BOSS_TRANSMISSION: Partial<Record<EnemyKind, interceptId>>` — maps each boss kind to its
  transmission (warden→int-warden, weaver→int-weaver, beacon→int-beacon,
  mirrorblade→int-mirror, hollow→int-hollow, sovereign→int-crown).
- `bossIntel(save, kind): { decrypted: boolean; damageBonus: number; tellBonus: number }` —
  `decrypted` = that boss's transmission `isInterceptComplete`. When decrypted (else all 0):
  - `damageBonus` = a small fixed multiplier (design default **+12%**, single tunable const)
    — "you know where to strike."
  - `tellBonus` = a readability buff (design default **+20%** tell/telegraph duration, single
    tunable const) — "you read its pattern": that boss's attack windups telegraph longer so
    they are easier to react to. Knowledge-as-power, both offence and read.
- Pure, no rng, no DOM. Fully unit-tested.

### Sim wiring (determinism-safe)
- In `game.ts`, **hard-gated to non-seeded modes** (`mode.seedKind !== 'date' && !== 'week'`),
  for the boss whose transmission is decrypted:
  - at **boss-damage application**, multiply dealt damage by `1 + damageBonus`.
  - at **boss tell/telegraph timing**, scale the windup/tell duration by `1 + tellBonus`
    (longer = more readable). This must change a duration constant deterministically WITHOUT
    altering rng draw counts or order — verify the tell path draws no rng from a shared sim
    stream; if it does, apply the scale only to the display/reaction window, not the draw.
- Both draw no rng. In seeded modes both bonuses are exactly 0 / ×1 → bit-identical runs
  preserved (the player's decryption never changes a Daily/Weekly).
- `impact()` on the boss-damage AND boss-tell paths BEFORE editing; report blast radius. If
  the tell timing turns out to be sim-entangled (HIGH/CRITICAL), fall back to a render-only
  read aid (a brighter/earlier tell glint) so the readability benefit ships without risking
  determinism — flagged to the user before proceeding.

### Felt layer (render-only, ALL modes)
- Pre-boss **INTEL card**: when `bossIntel.decrypted`, a brief HUD/announce card on boss
  approach ("INTEL: <boss> — pattern read · +dmg" in non-seeded; "INTEL: <boss>" only, in
  seeded). Render-only, no sim impact.
- Unlock that boss's richer `narrator.bossApproach` / `bossKill` lines when decrypted (the
  pool already exists; gate the *richer* variant behind decryption, keep a terse default).

---

## Feature C — Daily Cipher

**Goal:** a seeded, shareable daily cryptogram that feeds the Fragment economy and fits the
existing daily / ghost / duel social layer.

### New pure module `dailyCipher.ts`
- **The seed genuinely rolls over every calendar day.** `dailyCipher` is keyed off
  `seedFromDate()` (returns `YYYYMMDD`, e.g. `20260620` → `20260621` tomorrow) XOR'd with its
  own mask (distinct from every sim stream, like `echoVignette`) so it never touches the sim.
  Signature `dailyCipher(daySeed: number = seedFromDate())`.
- **Real daily variation, not a fake feature** — the output space is large enough that
  consecutive days differ obviously:
  - plaintext from a curated pool of **≥30** lore-voice phrases (`pool[seed % pool.length]`),
  - cipher kind rotated across the 3 (Caesar / substitution / Vigenère) by a second seed draw,
  - the key/shift/Vigenère-word varied by a third draw.
  A test **asserts ≥14 consecutive `seedFromDate` values produce distinct `{kind, prompt,
  answer}` tuples** (catches a degenerate generator that "pretends" to be daily). Another test
  asserts every generated cipher round-trips (`checkDailyCipher(seed, answer) === true`) so no
  day is unsolvable.
- `dailyCipher(daySeed): { kind, prompt, answer, hint, plain }` — picks plaintext + kind + key
  deterministically as above and enciphers it.
- `letterFrequency(text): Record<string, number>` — pure frequency-analysis helper.
- `checkDailyCipher(daySeed, guess): boolean` — case/space-insensitive compare to that day's
  answer.
- `solveDailyCipher(save, daySeed, guess): { solved, fragments }` — first solve/day grants
  Fragments via synthetic dedup'd ids `daily-cipher:<dateString>` (design default **◆4**).
  Keyed by `dateString` so each calendar day is a fresh, separately-rewarded puzzle.

### Save
- Additive `solvedDailyCiphers: string[]` (dateStrings). No version bump (generic loader).

### UI
- A "DAILY CIPHER" block at the top of THE BOMBE console: today's ciphertext in big mono
  glyphs, the frequency helper (a compact letter-count strip), an input + SOLVE, a solved
  state, and a **SHARE** button reusing the existing share-string path
  ("LANCEFALL daily cipher <date> — solved in N tries" style). One attempt-set per day;
  re-opens as solved.

---

## Feature D — Bombe branches + boss-drop faucet

**Goal:** turn the single linear Bombe ladder into meaningful build choices and self-feed the
economy. **Highest blast radius** — `bombeCostMul` / `bombeAutoCracks` / `upgradeBombe` are
called by both the panel and run-end. `impact()` each before editing.

### Branch model (back-compat preserving)
- Add `bombeBranches: { thrift: number; speed: number; insight: number }` to save.
- Keep `bombeLevel` as the **derived total** (`= thrift + speed + insight`) so existing reads
  (`BOMBE_MAX_LEVEL` gating, displays) keep working; cap total at `BOMBE_MAX_LEVEL` (raise to
  e.g. 9 = 3 per branch, tunable).
- `bombeCostMul(save)` reads `thrift`; `bombeAutoCracks(save)` reads `speed`; INSIGHT adds the
  key-word behaviour. (Signatures change from `(level)` to `(save)` or add overloads — chosen
  during planning after `impact`; prefer additive overloads to shrink blast radius.)
- **Migration:** seed `thrift = ceil(oldLevel/2)`, `speed = floor(oldLevel/2)`, `insight = 0`
  (no progress lost). Add to `migrate.ts`; bump `SAVE_VERSION` only if the generic loader
  can't tolerate the new nested object (verify first — prefer no bump).

### INSIGHT branch
- `runBombe` / `crackCheapestFree` variant that prioritises `wordRarity` key > rare > common
  when `insight > 0`; plus one **daily free key-word crack** (dedup'd by dateString).

### New faucet — boss-drop encrypted fragments
- `fragmentsForRun` gains `enc-frag:<runOrdinal>:<n>` ids, **n = bossKills this run** (one
  encrypted fragment per boss felled). They count toward `stillpointFragments` like any other
  (kept simple: they're spendable Fragments themed as "encrypted" in the readout, not a
  separate locked currency — avoids a second economy). Tunable: gate to `bossKills` so it's a
  genuine new source tied to combat.
- Console readout shows the encrypted-fragment inflow in the "ran overnight" / status area.

---

## Cross-cutting

- **Determinism:** all new logic pure + tested; save-varying effects (Feature B damage,
  INSIGHT daily crack) gated OFF in seeded modes. Daily cipher uses its own date-seeded mask,
  never the sim.
- **Save:** additive fields (`solvedDailyCiphers`, `bombeBranches`); migration only for
  Feature D, no version bump if tolerated.
- **Tests:** new `*.test.ts` per pure module (`intel`, `dailyCipher`, branch logic,
  `int-last` vocabulary guard, `grantLongestDayRewards` idempotency, `fragmentsForRun`
  encrypted-frag, migration). Extend `achievements.test.ts`.
- **Staging:** shared hot files (`bombe.ts` panel, `style.css`, `game.ts`, `ui.ts`) are
  live-edited by other agents — commit only own hunks (content-filtered `git apply --cached`,
  per the shared-tree-staging convention). Append CSS at file end.
- **GitNexus:** `impact()` before editing any existing symbol (`bombeCostMul`,
  `bombeAutoCracks`, `upgradeBombe`, `fragmentsForRun`, boss-damage path, `decryptWord`
  call site); `detect_changes()` before each commit. Warn on HIGH/CRITICAL.

## Build order
A → B → C → D (D last; largest blast radius). Independent pure modules (`intel.ts`,
`dailyCipher.ts`) can be built in parallel during execution. Each feature: pure module + tests
green → wiring → verify (tsc + vitest + minified preview) → content-filtered commit.

## Out of scope (YAGNI)
- A separate locked "encrypted currency" (encrypted fragments are just themed Fragments).
- Procedurally-generated transmissions (THE LAST TRANSMISSION is hand-authored).
- Multiplayer cipher duels (the existing duel layer is untouched).
- Deploy — owner triggers explicitly.
