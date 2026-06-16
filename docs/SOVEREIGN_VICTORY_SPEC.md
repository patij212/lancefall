# SPEC — THE LONGEST DAY: the Sovereign victory & the living endless mode

**Status:** approved, in implementation.
**Intent:** *"Killing the Sovereign must be really satisfying. It's really hard, so it has to be rewarded."*
**Themes it serves:** the solstice/longest-day arc, the Turing codebreaking ode, the COHERENCE
"dead city → full neon" bloom, and "win every mode ≥5%".

---

## 1. Vision

The Sovereign is the summit of LANCEFALL. Beating it should feel like **the light coming back** —
a held, screen-filling DAYBREAK — and it should *pay out*: a recorded victory, a fat reward, a
permanent unlock, and a real choice about whether to bask in the won day (**GREET THE DAWN**) or
push on as night falls (**KEEP GOING**). Today only Arena & Boss Rush honour it; this spec makes it
the climax of **every** mode and turns the survival roster into six distinct, goal-driven modes —
with **Weekly Siege** as the one *living, truly-endless* mode that absorbs the retiring Daily's
retention loop and story.

## 2. Design goals & engagement principles

| Principle | How this spec applies it |
|-----------|--------------------------|
| **A summit worth climbing** | the Sovereign kill is the game's defined "you won", in every mode, with a unique cinematic. |
| **Reward proportional to difficulty** | THE LONGEST DAY bonus scales with speed/no-hit/depth; a first-clear cosmetic + achievement; per-mode records. |
| **Meaningful choice** | THE CHOICE (catch/fall) for everyone; GREET THE DAWN vs KEEP GOING after every win. |
| **Mastery curve / "one more run"** | KEEP GOING → ASCEND loops with escalating difficulty *and* score multiplier. |
| **Daily habit** | Weekly's date-derived daily sub-goal + daily streak → a reason to log in every day. |
| **Story & identity** | Echo of the Fall vignette rides the daily goal; THE CHOICE is a permanent identity mark. |
| **Recognition / social** | weekly ranked board ("how far past the Sovereign did you climb"), per-mode best-kill records, ghost races. |
| **No dead ends** | the win is *banked first*, so dying after never costs the achievement; KEEP GOING is pure upside. |

## 3. The gap today

`bossDeath()` on the Sovereign sets `sovereignDown = true`, drops +1 ARMOR / a power-up / a perk /
a "SOVEREIGN DOWN" float — and in survival modes **the run just continues**, the boss cycle wrapping
to a tougher Warden. No victory, no cinematic, no THE CHOICE, no reward, no completion state. The
hardest feat in the game is, in 6 of 8 modes, a shrug.

## 4. Player-experience walkthrough (the moment)

1. The Sovereign's last core shatters; the crown's HP hits 0.
2. **Hitstop** (~0.25s) — the world freezes on the kill.
3. **DAYBREAK**: a full-screen warm nova, **COHERENCE snaps to full** (the gray city blooms to full
   neon — the payoff the whole COHERENCE system is built toward), deep slow-mo (~0.3× for ~2.5s),
   choir/master swell + a bespoke daybreak sting, camera punch, sustained rumble.
4. **Narration**, reverent, mode-flavoured: *"THE LONGEST DAY IS WON."* (Solstice: *"THE CODE IS
   BROKEN — DAYBREAK."*)
5. The win is **banked** (recorded immediately).
6. **THE CHOICE** (first Sovereign kill ever, any mode): catch the falling Sovereign, or let it fall.
   A once-ever permanent branch.
7. **Resolution prompt**: **GREET THE DAWN** (end on the victory → debrief) · **KEEP GOING** (ASCEND
   into a harder loop for score). Scripted modes (Arena/Boss Rush) skip the prompt — they simply end.
8. Debrief shows the victory, THE LONGEST DAY bonus, any first-clear unlock, the new record.

All flashing/slow-mo routes through the existing `reduceFlashing`/`reduceMotion`/`clarity` gates
(§10): under them it's a calm cross-fade with no strobe and no time-warp.

## 5. Systems in detail

### 5.1 The DAYBREAK victory sequence

Reuse the existing DAYBREAK climax (today only OVERDRIVE fires it — `game.ts` ~L609:
`coherenceBeatKick(perfect)` + nova + slow-mo + "DAYBREAK" announce). Factor it into a reusable
`daybreakBeat(opts)` and call it from the new `sovereignVictory()`.

Beat sheet (tunable in `TUNE.victory`):

| t (s) | Event | a11y-reduced variant |
|------|-------|----------------------|
| 0.00 | HP→0, **hitstop** `victory.hitstop` (0.25) | same (hitstop is not flashing) |
| 0.05 | nova ring + warm **light flash** `victory.flash` (0.6), camera zoom punch, rumble | no flash; gentle bloom only |
| 0.05 | `coherenceBeatKick(perfect)` → COHERENCE eases to **1.0** (full city) | eased cross-fade (already a11y-safe in `washSaturation`) |
| 0.05 | **slow-mo** `victory.slowmo` (0.3) for `victory.slowmoHold` (2.5s) | **no slow-mo** under reduceMotion |
| 0.10 | audio: `bossMusic(false)`, `daybreakStinger()` (new), master swell | same (audio honours mute, not motion) |
| 0.50 | narration `NARRATOR.daybreak[mode-flavour]` | same |
| ~2.5 | slow-mo eases out → THE CHOICE (if first ever) → resolution prompt | same |

### 5.2 THE CHOICE — for everyone

`stillpoint.ts` `choiceEnding(catch|fall)` already exists. Today `choicePending` is gated
`!inChallenge && won && sovereignDown && choice==='none'`. **Change the gate to drop `won`**:
`!inChallenge && sovereignDown && choice==='none'`. The first Sovereign kill in *any* mode now
offers the permanent catch/fall branch. (Unchanged: it's once-ever; subsequent kills skip it.)

### 5.3 The reward stack

On `sovereignVictory()`:

| Reward | Detail / formula |
|--------|------------------|
| **Recorded victory** | set a `won`-equivalent completion flag; debrief reads the victory; counts for stats + "win every mode". Banked before the resolution prompt so death after never revokes it. |
| **THE LONGEST DAY bonus** | `longestDayBonus = base × speedFactor × noHitFactor × modeShardMul × ascendMul`, reusing the `clearTimeBonus` curve shape (faster + fewer hits = more). Paid to score **and** shards. |
| **First-clear unlock** | a signature **DAYBREAK dash-trail** (new `trails.ts` entry) + achievement **"Bring Back the Longest Day"**. |
| **Per-mode badge** | first Sovereign kill *per mode* grants a small badge/achievement (e.g. "Daybreak — NIGHTMARE"). |
| **Records (save)** | `sovereignBest[modeId] = { time, ascensions, hitsTaken, date }` — best per mode, shown on title + debrief. |

All writes go through the existing save/achievements pipeline; **none touch `world.rng`** (rewards
are computed from run stats after the kill, not during seeded simulation).

### 5.4 Resolution — GREET THE DAWN vs KEEP GOING

After the beat (+ THE CHOICE if first), survival modes show a two-option prompt (reuse the
event/choice modal UI; keyboard + d-pad + 64px touch targets, like the title):

- **GREET THE DAWN** *(end — solstice phrasing, replaces "REMEMBER")* — close the run on the
  victory; go to the win debrief. The warm, "you brought the day back, rest in it" option.
- **KEEP GOING** *(ASCEND)* — continue into a harder loop (§5.5). The win already stands; this is
  the score chase. Flavour: *"The day is won — but the night still comes."*

Scripted modes (Arena, Boss Rush) **skip the prompt** — their script is finite, so the Sovereign
ends the run (DAYBREAK juice still plays). Default if the player ignores the prompt for
`victory.promptTimeout` (e.g. 20s): **GREET THE DAWN** (bank + end — never strand a won run).

### 5.5 ASCEND — the endless tail

KEEP GOING enters **ascension**: an in-run difficulty loop layered on the existing endless director.

- `world.ascension` counter, starts 0, **+1 each Sovereign kill** taken while continuing (you can
  re-climb the full boss cycle and beat the Sovereign again, each time bumping it).
- **Difficulty**: multiply the endless intensity by `1 + ascension × VICTORY.ascendIntensityPerLoop`
  (≈0.12), composing with the run's existing curve. Bosses keep their `bossCount` HP scaling. No new
  rng draws — a **fixed deterministic ramp** (critical for seeded Weekly: the board stays fair).
- **Reward**: a score multiplier `1 + ascension × VICTORY.ascendScorePerLoop` (≈0.25) — risk pays.
  An "ASCENSION ×N" HUD pip + a per-ascension narration escalation ("the night deepens…").
- **NG+ interaction**: ascension is *in-run*; it never advances `save.ngPlusLevel` on a **seeded**
  Weekly (seeded modes keep NG+ off). On random survival modes, banking the win advances NG+ for the
  *next* run exactly as Arena/Boss Rush do today.
- **Soft cap**: difficulty ramp caps at `VICTORY.ascendMaxLoop` (≈8, mirroring NG+) so it stays
  playable; the score multiplier may keep climbing past the cap (pure upside for leaderboard chase).

### 5.6 Weekly's living-daily layer (Echo of the Fall, reborn)

Weekly = a **week-stable siege seed** + a **daily overlay** so the Daily's retention + story survive.

**Daily sub-goal** (`dailyGoal.ts`, new — pure):
- A date-derived objective the same for everyone that day, refreshing at UTC midnight. Pure hash of
  the date → pick `{ type, param }` from a pool; **never alters the week seed** (read-only over run
  stats), so the siege stays bit-identical for all.
- **Pool** (initial): `downBoss(kind)` · `reachWave(n)` · `combo(n)` · `noHitWave` · `graze(n)` ·
  `dashChain(n)` · `sovereignUnder(seconds)`. Difficulty of the param scales mildly with weekday.
- **Tracking**: evaluated against the live run; on completion → a toast + reward. Locked at run
  start (a run spanning midnight keeps the goal it began under).
- **Streak**: `save.dailyGoalStreak` (+ `lastGoalDate`); consecutive days completing the goal.
  Milestones (3/7/14/30) → shard bundles + cosmetic nibbles. Missing a day resets to 0 (gentle: a
  one-day "grace token" earned every 7 days is a future nicety, not v1).
- **Reward**: a per-completion shard bonus (`×dailyGoal.shardReward`) + the streak milestones.

**Echo of the Fall** (story): the existing pure `echoVignette(seed)`/`echoLine(seed)` (one citizen's
last memory) keyed off the **date** (not the week seed) so the *daily* narrative cadence survives.
Shown on the Weekly title card and the run-intro. Weekly's title card surfaces: the week seed, the
weekly board rank, **today's sub-goal**, the **streak**, and **today's echo line**.

## 6. The roster (8 → 6)

| Mode | Identity | After the Sovereign |
|------|----------|---------------------|
| **Arena** | scripted waves + bosses | scripted victory (DAYBREAK juice) |
| **Boss Rush** | bosses only, no chaff | scripted victory (DAYBREAK juice) |
| **Nightmare** | sudden-death, no ARMOR | **win** + GREET THE DAWN / KEEP GOING — the ultimate flex |
| **Solstice Protocol** | every boss a cipher | **win** + … — the Turing payoff |
| **Casual** | gentle, off-board | **win** + … — accessible, see-it-all clear |
| **Weekly Siege** | one seed/week, ranked, **+ daily sub-goal & Echo of the Fall** | **win → ASCEND** — the living, truly-endless mode |

**Retired:** ENDLESS (least-signature; freeplay → Casual, competitive → Weekly) and ECHO OF THE FALL
/ Daily (its retention + story fold into Weekly §5.6).

## 7. Reachability — the survival-difficulty pass (required co-ship)

A victory the player can't *reach* is worthless. Today even a strong survival run dies ~boss 1–3 in
the dense escalation; the Sovereign (6th boss) is rarely seen. Ship this spec **with** a measured
easing of the survival mid-game (the wave-9–14 density the telemetry already flagged) so reaching
boss 6 is a real, earned outcome — validated at base difficulty with `tools/balance-metrics.js`
(target: the bot kills the Sovereign **≥5%** per mode; a skilled human notably more). Track per
mode; tune `intensityMul`/`spawnMul`/the late spawn curve, **not** by gutting the bosses.

## 8. Engagement loops (why this retains)

- **Session loop:** dodge → combo → boss → … → Sovereign → DAYBREAK + CHOICE + reward → KEEP GOING
  (ascend, score multiplier climbs) → death → debrief with a new record. A clean "one more run".
- **Daily loop (Weekly):** new sub-goal + new echo line every UTC midnight → streak pressure →
  log-in habit. Mild FOMO (streak resets) without punishment spirals.
- **Weekly loop:** a fresh global siege seed every Monday → ranked board reset → "climb past the
  Sovereign farther than last week / than your rivals". Ghost races on the shared seed.
- **Meta loop:** per-mode first-clears, the DAYBREAK trail, NG+ on random modes, the permanent CHOICE
  → long-tail mastery + identity.

## 9. Implementation plan

Sequenced so each step is independently shippable behind the per-commit gate
(`tsc --noEmit` + `vitest run` + `vite build`), determinism + a11y green.

**Phase 1 — the Sovereign victory mechanic** (no roster change yet)
1. `TUNE.victory` constants (beat timings, ascend/score factors, prompt timeout). `NARRATOR.daybreak`.
2. `daybreakBeat()` refactor of the OVERDRIVE climax → reusable; unit-cover the pure bits.
3. `sovereignVictory()` in `game.ts`: fire on `sovereignDown` in survival modes — DAYBREAK + bank
   win + reward stack; Arena/Boss Rush keep the director `d.win` path but call `daybreakBeat()`.
4. THE CHOICE gate: drop `won` (use `sovereignDown`).
5. Reward: `save.sovereignBest`, THE LONGEST DAY bonus (combat.ts helper, unit-tested), DAYBREAK
   trail (`trails.ts`), "Bring Back the Longest Day" achievement (`achievements.ts`).
6. Resolution prompt UI (`ui.ts`, reuse the event modal): GREET THE DAWN / KEEP GOING; timeout default.

**Phase 2 — ASCEND**
7. `world.ascension`, the deterministic intensity ramp + score multiplier (`waves.ts`/`game.ts`),
   HUD pip, escalating narration. Determinism test: ascension adds no `world.rng` draw.

**Phase 3 — reachability pass** (§7) — tune + validate to ≥5% bot Sovereign-kill per survival mode.

**Phase 4 — Weekly living-daily layer**
8. `dailyGoal.ts` (pure pool + date hash + evaluator) + tests; streak in save; title/HUD surfacing;
   Echo of the Fall (date-keyed `echoVignette`) on Weekly title + intro.

**Phase 5 — roster consolidation**
9. Remove ENDLESS + Daily from `MODES`; default `selectedMode` → weekly/arena; update the title
   mode-cards + `nextModeId` coverage. Worker `MODES` allow-list (`worker/src/validate.ts`) + the
   `workerValidate` test. **SAVE_VERSION bump + migration**: drop `dailySeed/dailyBest/dailyAttempts/
   dailyAttemptDate`; add `sovereignBest`, `ascension` records, `dailyGoalStreak`/`lastGoalDate`.
   `modes.test.ts` `MODES.length` → 6; the daily-attempt logic retargets to the Weekly daily-goal.

Each phase commits independently; Phase 5 (the destructive roster change) lands last, after the new
value is proven.

## 10. Determinism & a11y guardrails (non-negotiable)

- **Determinism:** the victory/DAYBREAK/coherence bloom, ascension ramp, daily sub-goal and Echo are
  all **cosmetic or pure-over-run-stats** — they draw **zero `world.rng`**. ASCEND is a fixed ramp.
  The daily goal/echo key off the **date**, never the seed. `determinism.test.ts` must stay green;
  add a case asserting a Sovereign kill + ascension adds no `world.rng` draw on the seeded path.
- **a11y:** the nova/flash/slow-mo all honour `reduceFlashing`/`reduceMotion`/`clarity` (calm
  cross-fade, no strobe, no time-warp); the prompt is keyboard/d-pad reachable with 64px targets and
  a non-colour-only state. Audio honours mute. (LANCEFALL's standing a11y invariant.)

## 11. Edge cases

- **Multiple Sovereign kills in one ascending run:** first kill fires THE CHOICE + first-clear
  unlock; subsequent kills bump ascension + score + record only (no repeat CHOICE/cinematic-spam —
  a shorter DAYBREAK re-beat).
- **Duel/challenge runs (`inChallenge`):** no progression (already gated) — DAYBREAK plays, but no
  records/unlocks/board/NG+ (bragging-rights only, unchanged invariant).
- **Casual is off-board:** the victory + records + unlocks count **locally**; nothing submits
  (`rules.ranked:false`), so the cushion can't game the boards.
- **Death during the resolution prompt / mid-ascend:** the win is already banked → never lost.
- **Run spanning UTC midnight:** the daily sub-goal + echo lock at run start.
- **reduceMotion:** the whole sequence still resolves (no slow-mo); the prompt still appears.

## 12. Validation & telemetry

- Extend `tools/balance-metrics.js`: report **sovereign-kill rate** + **ascension reached** per mode;
  confirm the Phase-3 easing lifts each survival mode to ≥5% Sovereign-kill at NG+0.
- Manual: watch the DAYBREAK beat under each a11y setting; verify the prompt + timeout; verify the
  daily goal/echo refresh at the date boundary; verify the seeded Weekly stays bit-identical across
  two clients (the determinism test + a shared-seed spot check).
- Gate every commit (tsc + vitest + build); never ship a red determinism or worker-validate test.

## 13. Tunable constants (initial — all in `tune.ts`)

```
VICTORY = {
  hitstop: 0.25, flash: 0.6, slowmo: 0.3, slowmoHold: 2.5, promptTimeout: 20,
  ascendIntensityPerLoop: 0.12, ascendScorePerLoop: 0.25, ascendMaxLoop: 8,
  longestDayBase: 5000, // pre-multiplier base of THE LONGEST DAY bonus
}
DAILY_GOAL = { shardReward: 250, streakMilestones: [3,7,14,30] }
```

## 14. Open decisions (small, deferred to build)

- Exact daily-goal pool params + weekday difficulty curve (§5.6) — design while building Phase 4.
- Whether random-mode banked wins tick NG+ (lean yes — parity with Arena/Boss Rush).
- DAYBREAK trail visual + the per-mode badge art/names.
