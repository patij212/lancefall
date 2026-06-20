# SPEC — THE CITY SPEAKS: raise the delivery to match the writing

> **Status:** approved in brainstorm (2026-06-20); ready for implementation plan.
> **Builds on:** the shipped **THE LAST WORD** ending (`docs/superpowers/specs/2026-06-20-the-last-word-ending-design.md`)
> and the **story bible** (`docs/superpowers/specs/2026-06-14-last-key-story-bible.md`). Obeys the bible's
> invariants: re-narrate not re-engineer; no system renames; seeded determinism bit-identical;
> pure-sim unit-tested; a11y-gate every new visual; terse second-person noir, restraint, Turing stays diegetic.
> **Intent:** a craft audit found lancefall has *"a 10/10 spine and a 6/10 nervous system."* The writing is
> world-class but **under-delivered**: the median player (≤30 runs, no decryption grind) meets **zero** of the
> 16 citizens, hears ~6 boss lines + 2–3 biome lines, watches COHERENCE rise with no idea it means "the cipher
> is breaking," and reaches THE CHOICE — a choice to hold the light *for people* — having met no one. This spec
> raises the nervous system to match the spine, **adding delivery paths, not new lore prose** (one mechanic
> exception: citizens can now wake through play).

---

## 1. The diagnosis (one wound, every angle)

- **The richest writing is invisible on the median path.** Citizens wake *silently* into save state, dossiers
  tier up silently, lore unlocks silently — and citizens currently wake **only by decryption** (a between-runs
  Codebreaker action the median player never does). So no surfacing alone fixes it: *the city must wake through
  play.*
- **No premise frame.** You learn the dash before you learn the world; the Phase-3 premise card was specced and
  never built. The `runStart` announce fires, but with no frame it lands as mood, not inciting incident.
- **COHERENCE is labelled but not meant.** The title meter reads *"CITY COHERENCE / THE CITY SLEEPS IN GREY"* —
  opaque. The grey→neon wash + the choir bloom ARE the story being told; nothing captions them as such.
- **Biomes are visited, not inhabited.** One line at entry, then 70s of mute mechanical escalation. NULL's
  no-graze rule silently breaks the skill economy with zero narrative warning.
- **The Vigil's weight is told, not felt.** Holding the light escalates only in *narrator lines*; mechanically
  it costs nothing, so "the weight that grows" is asserted, not experienced.
- **Local voice slips** dent the noir mandate the rest of the writing upholds.

## 2. Design decisions (settled in brainstorm)

| Fork | Decision |
|------|----------|
| **Scope** | The full nervous-system pass (all of §A–§F below). |
| **Delivery tone** | **Dose the ceremony.** Common beats stay restrained toasts in the existing voice; the *meaningful* wakes (the 6 figure-tied citizens + the 2 milestone ones) get a distinct "A FACE REMEMBERED" beat. |
| **Wake model** | Citizens wake by **decryption OR in-run deed** (new). Deed-wake gives the *face* (name + memory + confession); the Codebreaker still gates the *deeper* truth + dossiers — they complement, nothing devalued. |
| **The Vigil's weight** | Holding the light **raises a Heat floor** (the owner's idea, §F): every 5 days held disables the next-lowest Heat. Non-seeded only; the release resets it. |

---

## A. Wake the city through play (the keystone)

### A.1 Deed-wake
Each of the 16 citizens gets an in-run **deed** that wakes them, in parallel to the existing decryption path.
`isCitizenWoken(save, c)` becomes **decrypted OR deed-met**; a new persisted `citizenDeeds: string[]` holds the
ids deed-woken. Deeds are pure predicates over a `RunDeedCtx` (run-stats the caller fills); a citizen whose deed
references an untracked stat simply doesn't deed-wake (graceful). The **figure-tied 6 wake on felling their
figure** — you meet the person as you defeat the keeper they served:

| Citizen | Deed |
|---|---|
| The Gate-Warden (→warden) | kill the WARDEN |
| The Chorister (→weaver) | kill the WEAVER |
| The Ferryman (→beacon) | kill the BEACON |
| The Glassblower (→mirrorblade) | kill the MIRRORBLADE |
| The Stonemason (→hollow) | kill the HOLLOW |
| The Courier (→sovereign) | kill the SOVEREIGN |
| The Vintner | first SOVEREIGN kill (*the longest day* — a deliberate double-wake with the Courier) |
| The Candle-Maker | reach combo ×25 (*light against the dark*) |
| The Lamplighter | a high-coherence peak in a run (*the towers light*) |
| The Archivist | reach wave ≥ 8 (*the long evening, recorded*) |
| The Bell-Ringer | survive ≥ 90s (*the hours kept*) |
| The Clockwright | an on-beat dash streak ≥ 5 (*the mechanism aligned*) |
| The Cartographer | reach wave ≥ 10 (*mapped far*) |
| The Stargazer | trigger DAYBREAK / overdrive (*watched for the dawn*) |
| The Gardener | reach the BLOOMGARDENS biome (*her place*) |
| The Weaver (cloth) | fell ≥ 3 bosses in one run (*the city's colours rewoven*) |

(Exact stat sources verified in build; the 6 boss-kills + combo + wave + daybreak are already tracked. Deeds
referencing coherence-peak / biome-reached / on-beat-streak read existing run-state where available.)

### A.2 Surfacing — dose the ceremony
- **Meaningful wakes** (the 6 figure-tied citizens + the 2 milestone ones — the Candle-Maker and the Weaver) → a
  brief **"A FACE REMEMBERED"** lower-third beat: the citizen's **name** + their **≤12-word confession** + a soft
  choir note + their **skyline window flaring**. Queued — it **never fires during a clutch / last-breath moment**
  (drains when safe). (The Vintner still wakes on the Sovereign kill, as a toast alongside the Courier's
  ceremony — that moment is already rich without a second beat.)
- **Common wakes + the new ambient lines** → quiet restrained toasts in the existing narrator voice.
- **The silent unlocks surface too:** a toast when a **dossier tier** advances (rumour→record→truth) and when a
  **lore entry** unlocks (the moment of discovery the median player never had).
- **Debrief beat:** the game-over screen gains a **"FACES REMEMBERED THIS RUN"** line naming who woke this run.

This closes the loop with THE LAST WORD: a median player now reaches THE CHOICE having met real faces, so the
Sixth reveal + the completion fates name people they know.

## B. The frame — premise + a captioned COHERENCE

- **Premise card** — a once-ever, **skippable** card before the sandbox: the city SVG washing grey→cyan, three
  lines (*"THE LAST KEY / Lancefall was light-code. The Six scrambled it grey. / Break the code. Bring back the
  day."*), a soft choir swell. Persisted `seenPremiseCard`. The `runStart` line then lands *after* the frame.
- **Caption COHERENCE** — the title meter's band taglines tell the story: *"THE CIPHER HOLDS"* @0 → *"THE CODE
  IS BREAKING · N%"* (mid) → *"DAYBREAK — THE CITY REMEMBERS"* @100, replacing *"THE CITY SLEEPS IN GREY"*; the
  in-run HUD echoes it so the rising bar reads as the cipher breaking. (Coordinate with the existing
  `cityCoherence.ts` band taglines — extend, don't duplicate.)

## C. The world — inhabited biomes + located bosses

- **Inhabit the biomes** — a mid-biome beat (~35s in, once per biome per run, keyed by biomeIndex) that *teaches
  the rule as flavour* + a one-shot escalation line when the pre-boss swell peaks (~`stretchSwell ≥ 1.2`). NULL
  gets an explicit *"The signal dies. Dash — only dash will save you."* (fixes the silent no-graze punishment);
  the Bloomgardens *"the patterns bloom at your touch"* (hints 2× graze). Pure narrator data + two `narrateOne`
  call sites in the biome/wave update; the existing 6s ambient cooldown applies.
- **Key bosses to their biome** — `NARRATOR.bossApproach` becomes a `[biomeIndex]?.[bossKind] ?? [bossKind]`
  lookup (generic fallback preserved), so the Warden-in-the-Court can speak the throne. Pure data + one lookup
  change at the existing approach call site.

## D. The long game — make repetition accrete

- **Personify the Vigil** — *"You hold the light for The Ferryman. Day held: 11."* (a woken citizen, chosen
  deterministically per run from the woken set; falls back to the un-personified line if none woken).
- **Name citizens in the combo-tier coherence text** — ×10 *"the lamplighter lights one tower"* → ×100 *"every
  street remembers"* (extend the existing `NARRATOR.comboTier` voice; keep it terse).
- **Age the Daily Echo** — run 20+ names the citizen (*"THE [name] — [memory]"*); run 50+ adds *"…the Nth time"*,
  so the daily deepens instead of repeating. Pure over `save.totalRuns` + the existing `echoVignette`.
- **Foreshadow the descent** — after the 2nd–3rd boss kill, a one-shot *"Below, the signal weakens. The cipher
  spirals down."* toast (plants the deeper power→erasure shape most runs never reach).

## E. The four voice slips
Verbatim line edits (some test-asserted — update the assertions):
- Tier-75 `"Lancefall blazes. The noise can't hold it."` → `"Lancefall blazes. The grey breaks."` (restores the
  parallel with tier-50's restrained *"the grey gives ground"*; drops the anthropomorphized "noise" agent).
- Mirrorblade bestiary quote `"…Tell me which of us is real."` → a **statement, not an Imitation-Game riddle**
  (e.g. `"I learned you. I became you."`) — a *doubt-made-flesh* beast shouldn't pose a paradox (no-winking rule).
- Mirrorblade kill line `"Your doubt, face-down. You meant it more."` → active/definitive
  (e.g. `"Your doubt fell. You are still here."`) — matches the restraint of the other five kills.
- Add a code comment in `audio.ts` documenting the two-tier choir bloom intent (lead @0.34 = the lone hero;
  choir @0.6 = the collective city materializes).

## F. THE VIGIL'S WEIGHT — the rising Heat floor (the owner's idea)

Holding the light costs more every day. While **holding** (`stillpointChoice === 'catch' && !released`):

```
vigilHeatFloor(save) = min(MAX_HEAT, floor(daysHeld(save) / 5))   // 0 when not holding/seeded
```

- Heat cards below the floor are **disabled** in the loadout pips (`ui.ts` `ck-heat-pips`) and the HEAT panel
  (`panels/heat.ts`), each locked with a tooltip *"the vigil holds the floor at HEAT N"*. `setHeat` clamps the
  selection to `[floor, MAX_HEAT]`; a run launches at `max(selectedHeat, floor)`. (`selectedHeat` is freely
  0–7 today, no unlock gate — confirmed game.ts:1363 — so the floor only raises the minimum.)
- **By day 11 (the release-permission threshold) the floor is already 2**, so the mechanical pressure arrives
  exactly when the release is offered — the difficulty curve and the defiance→peace arc point the same way.
- **The release is the relief:** letting the day turn ends the vigil → `daysHeld` returns 0 → floor resets to 0
  (pure derivation; no extra state). Releasing is mechanical rest as well as narrative completion.
- A quiet bonus: Heat lifts score/shards, so the rising floor is also a reward (risk pays, like ASCEND).
- **Determinism guardrail:** applies to **non-seeded modes only** (mirrors `ngPlusIntensityMul`'s `'date'`/
  `'week'` gate), so the Daily/Weekly stay bit-identical for everyone regardless of any player's vigil.

---

## G. Architecture (inside lancefall's invariants)

**New pure `src/cityVoice.ts`** — single home for the delivery logic; no DOM, no `world.rng`:
- the deed→citizen map + `deedWoken(ctx): string[]` (pure predicates over `RunDeedCtx`);
- `beatForWake(citizenId): 'ceremony' | 'toast'` (the dose);
- the biome mid-beats + biome-escalation lines + keyed-bossApproach helper;
- `vigilHeatFloor(save)` + `effectiveHeat(save, seeded)`;
- the personified composers (`vigilLine(save)`, `comboTierLine(tier, save)`, `agedEchoLine(save)`);
- dossier-tier-up + lore-unlock diff helpers (what newly crossed a threshold this surfacing).
Fully Vitest-covered.

**Touched modules** (run GitNexus `impact` before each symbol edit):
- `src/citizens.ts` — `isCitizenWoken` ORs `save.citizenDeeds` (the deed map lives in `cityVoice.ts`).
- `src/narrator.ts` — biome mid-beats + escalation + descent pools; `bossApproach` keyed by `[biome][boss]`;
  the §E voice-slip fixes. (`narrator.test.ts` updated.)
- `src/save.ts` / `src/migrate.ts` — additive `citizenDeeds: string[]` + `seenPremiseCard: boolean`;
  **SAVE_VERSION 9→10**, validated migration; `cloudMerge.ts` categories (`citizenDeeds: 'set'`,
  `seenPremiseCard: 'latest'`).
- `src/game.ts` — fire deed-wake checks on boss kill + combo/wave/daybreak/biome milestones → surface beats;
  the descent foreshadow; the premise card on first boot; the `setHeat` floor clamp + run-launch
  `effectiveHeat` (non-seeded).
- `src/ui.ts` — the "A FACE REMEMBERED" beat, the premise card modal, the debrief "faces remembered" line, the
  COHERENCE caption, the personified Vigil line, the HEAT-pip floor (disable < floor + tooltip).
- `src/panels/heat.ts` — disable Heat cards below the vigil floor.
- audio — reuse a soft choir note for the wake ceremony (no new asset).

**Guardrails (non-negotiable):**
- **Determinism:** every new beat is cosmetic/pure-over-run-stats — **zero `world.rng`**; deed checks read
  run-stats, never draw; new save fields are meta-only; the vigil heat floor is **non-seeded only**. Add a
  determinism test: a deed-wake / vigil-floor adds no seeded-sim rng draw, and a seeded run's effective Heat is
  unaffected by `citizenDeeds`/vigil.
- **a11y:** the "A FACE REMEMBERED" beat + premise card route through `reduceMotion`/`reduceFlashing`/`clarity`
  (calm fade, no strobe, the window-flare is a soft glow), keyboard-skippable; ambient beats keep the 6s
  cooldown + no-repeat; **nothing fires during a clutch/last-breath moment** (the wake beat queues).
- **Restraint:** the dose is the contract — only the 8 meaningful wakes get the ceremony; everything else is a
  toast. No beat interrupts gameplay flow; the premise card is once-ever and skippable.

## H. Not doing (YAGNI)
- **No new lore prose** — deed-wake *delivers* what's already written; the only authoring is the §A surfacing
  copy, the §C biome/escalation lines, the §D personified templates, and the §E fixes (all short, to the bible voice).
- No system renames; no new bosses/biomes/modes; no determinism changes to the seeded path; the Heat ladder
  itself (MAX_HEAT, the 8 levels) is unchanged — the vigil only raises the *floor*.

## I. Open decisions (small, deferred to build)
- Exact stat sources for the 4 non-trivial deeds (coherence-peak / biome-reached / on-beat-streak); fall back to
  the nearest tracked stat if one isn't cheaply available.
- The premise card's exact art (reuse `GO_CITY_SVG` vs a bespoke grey→neon wash) — keep it short + skippable.
- Whether the COHERENCE caption renames the label or only the sub-tagline (lean: keep "COHERENCE", restyle the
  sub-line + the HUD read).

## J. Implementation gate (every commit)
`npx tsc --noEmit` + `npx vitest run` (current baseline + new) + `npx vite build`; determinism + a11y green;
prod boot verified under `npx vite preview` (UI verified via the `__lf` dev hook / Playwright). Per-symbol
GitNexus `impact` before edits; `detect_changes` before commit.
