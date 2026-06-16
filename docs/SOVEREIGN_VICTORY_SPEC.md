# SPEC — THE LONGEST DAY: a satisfying Sovereign victory in every mode

**Status:** design / agreed direction. Not yet implemented.
**Author intent:** *"I want killing the Sovereign to be really satisfying. It's really hard, so it has to be rewarded."*

## 1. The problem

The Sovereign is the hardest thing in the game — the gravity-warping final boss behind a
cipher lock. Yet **only Arena and Boss Rush pay it off**. In the survival modes, downing the
Sovereign currently does almost nothing:

> `bossDeath()` sets `sovereignDown = true`, drops +1 ARMOR / a power-up / a perk, prints a
> "SOVEREIGN DOWN" float — and the run **just continues**, the boss cycle wrapping back to a
> tougher Warden. No victory, no ending, no payoff, no THE CHOICE.

So the climactic kill is anticlimactic in 6 of 8 modes, and those modes have no completion
state at all. This spec fixes both: it makes the Sovereign kill a **rewarded climax everywhere**
and gives every mode a finish line.

## 2. Design goals

1. Downing the Sovereign is a **screen-filling, audible, emotional payoff** in *every* mode.
2. It is **rewarded** — a record, currency, and a first-clear unlock proportional to the feat.
3. It gives the survival modes a **victory** (which also unlocks "win every mode ≥5%").
4. It preserves a **truly-endless** score chase for the players who want it.
5. **Reuse existing systems** (DAYBREAK bloom, THE CHOICE, the win cinematic) — no new engines.
6. **Determinism + a11y safe**: cosmetic bloom only (no `world.rng`), respects reduce-flashing/motion.

## 3. The moment — "DAYBREAK" on the Sovereign kill

On `sovereignDown` in ANY mode, fire the existing **DAYBREAK** climax (today only the OVERDRIVE
burst triggers it — `game.ts` ~L609): full-screen neon nova, deep slow-mo, COHERENCE kicked to
**full** (`coherenceBeatKick(perfect)` — the gray→neon city blooms fully alive), the choir/loud
master swell, a hard light flash, camera punch, sustained rumble. Layer on top:

- A unique, reverent narration line — e.g. **"THE LONGEST DAY IS WON"** / **"THE LIGHT RETURNS"**
  (Solstice gets a cipher-flavoured variant: *"THE CODE IS BROKEN. DAYBREAK."*).
- The City-of-Lancefall wash holds at full neon for the cinematic (the "dead world fully alive"
  read the whole COHERENCE system is built for — this is its ultimate payoff).
- a11y: the bloom/flash routes through the existing `reduceFlashing`/`reduceMotion`/`clarity`
  gating (the wash and DAYBREAK already respect it) — under those settings it's a calm cross-fade,
  no strobe.

This is the same juice quality as the OVERDRIVE/victory cinematics, aimed at the Sovereign kill.

## 4. THE CHOICE — for everyone

Extend the catch-or-fall narrative branch (`stillpoint.ts` `choiceEnding`) to **any** Sovereign
kill, not just `won` runs. Today: `choicePending = !inChallenge && won && sovereignDown && choice==='none'`.
Change the gate to `!inChallenge && sovereignDown && choice==='none'`. First Sovereign kill in
*any* mode now offers THE CHOICE (the emotional core: catch the falling Sovereign, or let it
fall). It's a once-ever permanent branch, so it fires on the first kill regardless of mode.

## 5. The reward stack (it's hard → reward it)

On the first-ever Sovereign kill, and on every kill thereafter (scaled):

| Reward | Detail |
|--------|--------|
| **Victory recorded** | the run is marked a **completion** (`won`-equivalent) — counts toward stats, the debrief reads "REMEMBERED", and it satisfies "win every mode". |
| **THE LONGEST DAY bonus** | a fat one-time score + shard payout, scaled by mode `shardMul` and how *deep/fast/clean* the run was (fold in the existing `clearTimeBonus` shape — speed + no-hit). The hardest feat pays the most. |
| **First-clear unlock** | a signature **"DAYBREAK" dash-trail** cosmetic + an achievement ("Bring Back the Longest Day"). Per-mode first-clears can grant a badge (e.g. "Sovereign down — NIGHTMARE"). |
| **Persistent record** | best Sovereign-kill time / depth per mode, shown on the title + debrief. |

All currency/unlock writes go through the existing save + achievements pipeline; none touch a
seeded run's `world.rng`.

## 6. Run resolution — REMEMBER or KEEP GOING (offered everywhere)

After the DAYBREAK beat + THE CHOICE, the **win is banked immediately** (so it always counts —
toward stats, the leaderboard, and "win every mode" — even if the player then dies). Then every
survival mode **offers a choice**:

- **REMEMBER** — end the run on the victory. A clean "you beat it" debrief.
- **KEEP GOING (ASCEND)** — the run continues into a harder loop (an in-run difficulty step, like a
  soft NG+) for the score chase. "The day is won — but the night still comes." The recorded victory
  stands; everything past it is bonus depth/score.

This offer is **universal** — Nightmare, Solstice, Casual *and* Weekly all let you bank or push on.
The modes still differ by **how they play** (sudden-death walls / cipher bosses / gentle+cushion /
week-seeded-ranked), not by whether you *can* continue.

- **Arena / Boss Rush** (scripted): unchanged — the Sovereign is the last entry, the run ends in
  victory (they gain the upgraded DAYBREAK juice; no ascend — the script is finite by design).
- **Weekly Siege** leans hardest into ASCEND — its ranked weekly board *is* the "how far did you
  climb past the Sovereign" race — and it's the mode that carries the living-daily layer (§6a).

Ascension on a **seeded** week (or a recorded daily sub-goal) must stay deterministic — a fixed
difficulty ramp, no new rng stream — so the weekly board stays fair for everyone.

## 6a. Weekly's living-daily layer (Echo of the Fall, reborn)

Retiring the standalone Daily would drop the strongest retention hook *and* the "Echo of the Fall"
story. Both move **into Weekly** so nothing is lost:

- **Daily sub-goal.** On top of the week-stable siege seed, Weekly surfaces a small **daily
  objective** — a date-derived target the same for everyone that day, refreshing at UTC midnight
  (e.g. *"today: down the Beacon"*, *"today: a 40-combo"*, *"today: clear wave 8 no-hit"*). It's a
  pure function of the date over read-only run stats — it never alters the weekly world seed, so the
  siege stays bit-identical for all. Clearing it feeds a **daily streak** + a shard/cosmetic nibble:
  a reason to log in every day, on the one endless mode.
- **Echo of the Fall.** The Daily's narrative vignette — *one citizen's last memory of the fall* —
  rides the daily sub-goal: each day surfaces its own echo line / citizen memory (the existing pure
  `echoVignette`/`echoLine`, keyed off the **date** so the cadence stays daily). The story the Daily
  carried lives on as Weekly's daily flavour, shown on the title + the run intro.

Net: Weekly becomes the *living* endless mode — a week-long ranked siege you ascend past the
Sovereign, refreshed daily by a goal and a citizen's memory. It absorbs everything the Daily was for.

## 7. The roster (proposed consolidation — see §9 for the recommendation)

Retire **ENDLESS** and **ECHO OF THE FALL (daily)**; **Weekly Siege** becomes the single
endless/competitive survival mode. The resulting **6 modes**, each now distinct *and* paying off
the Sovereign:

| Mode | Identity | Sovereign kill = |
|------|----------|-----------------|
| **Arena** | scripted waves + bosses | scripted victory (DAYBREAK juice) |
| **Boss Rush** | bosses only, no chaff | scripted victory (DAYBREAK juice) |
| **Nightmare** | sudden-death, no ARMOR | **win** + offer KEEP GOING — the ultimate flex |
| **Solstice Protocol** | every boss a cipher | **win** + offer KEEP GOING — the Turing payoff |
| **Casual** | gentle, off-board | **win** + offer KEEP GOING — accessible clear |
| **Weekly Siege** | one seed/week, ranked, **+ daily sub-goal & Echo of the Fall story** | **win → ASCEND** (the living, truly-endless mode) |

Every mode now has a clear identity and a Sovereign climax; the old Endless/Daily/Weekly overlap
is gone.

## 8. Implementation outline

- **Trigger:** generalise the victory path so `sovereignDown` drives it in survival modes. Cleanest:
  in `bossDeath()` for the Sovereign, branch — Arena/Boss Rush keep the director's `d.win`; survival
  modes call a new `sovereignVictory()` that fires DAYBREAK + sets the win + resolves END/ASCEND.
- **DAYBREAK reuse:** factor the OVERDRIVE-burst climax (nova + slow-mo + `coherenceBeatKick(perfect)`
  + announce) into a reusable beat; call it from `sovereignVictory()` with the victory narration.
- **THE CHOICE:** drop the `won` gate (use `sovereignDown`) in the `choicePending` computation.
- **ASCEND (Weekly):** a post-victory state that bumps an in-run difficulty multiplier and resumes
  the boss cycle; deterministic (fixed ramp, no new rng) so the seeded weekly stays bit-identical.
- **Rewards:** new "DAYBREAK" trail + "Bring Back the Longest Day" achievement; THE LONGEST DAY
  score/shard bonus (reuse `clearTimeBonus` shape); per-mode best-kill record in save.
- **Roster removal:** delete ENDLESS + daily configs; update the worker MODES allow-list
  (`worker/src/validate.ts`), the modes test (`MODES.length`), the title mode-cards, default
  `selectedMode`, and the Daily-only save fields (`dailySeed/dailyBest/dailyAttempts/dailyAttemptDate`)
  via a SAVE_VERSION migration. Determinism suite + `workerValidate` test must stay green.
- **a11y/determinism guards:** the bloom is cosmetic and a11y-gated; no `world.rng` is touched on
  any kill-timed path (the determinism invariant the whole codebase guards).

## 9. Reaching the Sovereign (the other half of "win every mode ≥5%")

A victory the player can't *reach* isn't a victory. Today even a strong survival run dies around
boss 1–3 in the dense escalation — the Sovereign (6th boss) is rarely seen. So this spec must ship
**with** a survival-difficulty pass so the Sovereign is attainable: ease the mid-game escalation
(the wave-9–14 density that the telemetry already flagged) enough that reaching boss 6 is a real,
earned outcome — validated with the bot/telemetry rig at base difficulty. Without that, the new
victory exists but stays at 0%.

## 10. Decisions & remaining questions

**Decided:**
- **Daily retention** — the standalone Daily retires; its retention loop *and* the Echo of the Fall
  story move into Weekly as a **daily sub-goal + daily echo vignette** (§6a).
- **ASCEND scope** — "keep going" is **offered in every survival mode** after the Sovereign win
  (not Weekly-only); the win is banked first either way. Weekly leans into it via its ranked board.

**Still open:**
- **NG+ vs ASCEND:** NG+ already loops difficulty per *win*; ASCEND is an *in-run* continuation.
  On a seeded Weekly, a Sovereign kill must **not** advance NG+ (seeded modes keep NG+ off) — so
  ASCEND there is a fixed in-run ramp only. For random survival modes, decide whether banking the
  win *also* ticks NG+ for the next run (probably yes, like Arena/Boss Rush do today).
- **Daily sub-goal pool:** the set of date-derived objectives (boss kill / combo / no-hit wave /
  depth) and their streak/reward economy — to be designed when §6a is built.
