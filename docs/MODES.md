# LANCEFALL — game modes reference

> **STATUS (2026-06-21).** The Sovereign-victory climax shipped: downing the Sovereign now fires a
> **DAYBREAK** victory beat + the **FIRST LIGHT** day-wash and, in survival modes, an event offering
> **GREET THE DAWN** (end on the win) or **KEEP GOING (ASCEND ×N)** for the score chase. The
> proposed 8→6 roster consolidation (retiring ENDLESS + ECHO OF THE FALL into WEEKLY) was **not
> adopted** — all 8 modes remain, surfaced as 6 title-rail cards. See
> [`SOVEREIGN_VICTORY_SPEC.md`](SOVEREIGN_VICTORY_SPEC.md) for the original design intent.

There are currently **8 modes**, each a data-only `RunConfig` in [`src/modes.ts`](../src/modes.ts)
that the director + game read off (no per-mode `if` soup). They split into two families:

- **WINNABLE (scripted)** — **ARENA** and **BOSS RUSH**. A finite script with a real **victory
  state**: clear it and the run ends in "REMEMBERED". These are the only two modes where `won`
  can ever be true.
- **SURVIVAL (time-driven)** — **ENDLESS, ECHO OF THE FALL, WEEKLY SIEGE, NIGHTMARE, SOLSTICE
  PROTOCOL, CASUAL**. No finish line: bosses cycle on a clock and the run ends only on death.
  Pure score / depth chase. A meaningful "beat it" milestone is **downing the Sovereign** (the
  6th boss in the cycle), but the run does not end on it.

## At a glance

| Mode | id | Family | Seed | Difficulty\* | Shards | Ranked | Signature |
|------|-----|--------|------|------------|--------|--------|-----------|
| ENDLESS | `endless` | survival | random | STANDARD (1.00) | ×1.0 | ✅ | the baseline survival run |
| ARENA | `arena` | **winnable** | random | STANDARD | ×1.1 | ✅ | 15 scripted waves + 6 bosses, clear-to-advance |
| ECHO OF THE FALL | `daily` | survival | **date** | HARD (1.00) | ×1.0 | ✅ daily board | one seed for everyone today, best-of-3 |
| WEEKLY SIEGE | `weekly` | survival | **week** | HARD (1.15) | ×1.3 | ✅ weekly board | one seed all week, spicier mutators |
| NIGHTMARE | `nightmare` | survival | random | **BRUTAL (1.89)** | ×1.75 | ✅ | sudden-death shrinking walls, **no ARMOR** |
| BOSS RUSH | `bossrush` | **winnable** | random | STANDARD | ×1.3 | ✅ | all 6 bosses back-to-back, **no chaff** |
| SOLSTICE PROTOCOL | `longestday` | survival | random | HARD (1.05) | ×1.25 | ✅ | **every boss is a cipher** (the Turing ode) |
| CASUAL | `casual` | survival | random | **easiest (0.44)** | ×1.0 | ❌ off-board | gentle, **+6 ARMOR**, see the whole game |

\*Difficulty = the `modeBrief` heuristic `intensityMul × (1/spawnMul) × (1+speedBonus)` — the
relative pressure of the survival spawn curve. Tiers: ≥1.3 BRUTAL · ≥1.1 HARD · else STANDARD.
The two winnable modes are scripted, so the number is nominal — their difficulty is the script.
SOLSTICE PROTOCOL and ECHO OF THE FALL carry a `briefTier:'HARD'` display override (their cipher /
seeded pressure reads harder than the raw heuristic), so the rail shows **HARD** for both.

## The config knobs (what actually differs)

Every mode sets these in `src/modes.ts`:

| Field | Meaning |
|-------|---------|
| `seedKind` | `random` · `date` (Daily) · `week` (Weekly). Seeded modes are **reproducible for everyone** and force **NG+ OFF** + their own seeded-PB ghost. |
| `intensityMul` | scales the endless intensity curve (spawn density/variety over time). |
| `spawnMul` | spawn-interval multiplier — **smaller = denser** waves. |
| `bossInterval` | seconds between bosses (time-driven modes). |
| `speedBonus` | flat add to enemy + bullet speed multipliers. |
| `shieldStart` / `shieldMax` | when (seconds) shielded ("armored") variants begin, and their max chance. |
| `shardMul` | run-currency multiplier (stacks with the meta Treasure Hunter tree). |
| `arena` / `bossrush` | the two scripted/winnable flags. |
| `cipherLock` | ring-cipher bosses are armored-until-decoded (SOLSTICE only). |
| `rules` | declarative extras: `events`, `scoreFrame`, `suddenDeath`, `ranked`, `casualShields`. |

## Each mode in depth

### ENDLESS — *"Survive as long as you can. The classic."*
The reference survival run. Baseline everything (intensity 1, spawn 1, `bossInterval` 70s).
Bosses arrive on a stretching clock: the first inter-boss wave is ~70s, each next wave is
`waveExtend` (15s) longer, capped at `waveLenMax` (120s) so a marathon keeps a steady boss
drumbeat. Shielded variants from 110s. Normal mid-run events. Default **2 ARMOR** shields.
No win — chase wave/score.

### ARENA — *"15 hand-built waves + 6 bosses. Clear it to WIN."*  ⟵ WINNABLE
A fixed 21-entry script (`ARENA_SCRIPT`): 15 chaff waves interleaved with the 6 bosses
(warden → weaver → beacon → mirrorblade → hollow → **sovereign**), ending in victory. **Each
wave must be fully cleared to advance** (kill every enemy — there's no timer). Shielded variants
appear early (70s). **Cleartime scoring** (`scoreFrame: 'cleartime'`): a speed bonus + a folded
no-hit bonus, so a fast flawless clear scores best. **No mid-run events** (`events: 'none'`) — the
script is the structure. The known wall is **wave 14** (the herald-heavy pre-mirrorblade climax).

### ECHO OF THE FALL — *the Daily.*  (`daily`)
**Date-seeded**: the same waves, bosses and events for everyone on a given day, a fresh seed at
UTC midnight. Reproducible ⇒ **NG+ is forced off** and it races/saves its own daily-PB ghost.
**Best-of-3 attempts per day** (`MAX_DAILY_ATTEMPTS`). Curated **high-risk** event pool (drawn off
a separate `eventRng` so the wave stream stays bit-identical for all). Ranked to the daily board.
Survival.

### WEEKLY SIEGE — *one seed, all week.*  (`weekly`)
**Week-seeded** (snaps to the week's Monday, fresh each Monday) — same global-reproducibility +
seeded protections as the Daily, ranked to the **weekly** board. A notch harder than Endless
(intensity 1.05, denser spawns `spawnMul` 0.95, `speedBonus` 0.04, shields from 100s up to 0.38)
and a spicier **curated** mutator/event rotation. Best shards of the survival modes outside
Nightmare (×1.3). Survival.

### NIGHTMARE — *"Sudden death — the walls close in, no ARMOR. +75% shards."*
The veteran tier. Hardest pressure curve (intensity **1.35**, denser `spawnMul` 0.8, `speedBonus`
0.12, shields early at 55s up to 0.5). **Sudden death** (`suddenDeath: { afterBoss: 1 }`): from the
2nd boss on, the safe play-area **insets ~6% per side per boss**, capped at 30%/side (never below
40% of the arena) — the walls literally close in. **ARMOR is stripped to 0** (no shield cushion —
one would-be-fatal hit goes straight to LAST BREATH/death). Curated high-risk events. Top shards
(×1.75). Survival.

### BOSS RUSH — *"All six bosses, back to back. No chaff."*  ⟵ WINNABLE
The 6-boss gauntlet (`BOSSRUSH_SEQUENCE`) with **no chaff between** — each boss spawns, you kill
it, the next arrives. `shieldStart: 999` / `shieldMax: 0` (moot — there's no chaff to shield).
Slightly faster enemies (`speedBonus` 0.06). **Cleartime scoring**, no events. Ends in victory
after the Sovereign. *This is the most reliably winnable mode* (the bot clears it ~83-92%).

### SOLSTICE PROTOCOL — *"Every boss is a cipher."*  (`longestday`)  — the Turing ode
`cipherLock: true`: the three ring-pattern bosses (Warden / Weaver / Beacon) are **armored until
you read their cipher and dash the cores in the decoded order** (the Hollow & Mirrorblade are
already their own puzzles; the Sovereign always has its cipher). Fast boss cadence (`bossInterval`
38s) so the codebreaking comes thick. Mild extra intensity (1.05). The solstice/Turing theme:
break the code, bring back the longest day. Survival.

### CASUAL — *"See it all — bosses, biomes, the story. Extra ARMOR, no pressure."*
The **easiest** mode and the only **off-board** one (`rules.ranked: false` → scores never submit,
so the fat cushion can't game the leaderboards). Gentler curve (intensity **0.62**, sparser
`spawnMul` 1.4, slow boss cadence 75s, fewer/late shields). **+6 ARMOR** on top of the default 2
(**8 absorbs**). Meant for seeing the content — bosses, biomes, the re-narration — without the
pressure. Survival.

## Cross-cutting systems that vary by mode

- **Victory state** — only `arena` + `bossrush` (`waves.ts` sets `d.win`). Everything else is
  survival; `won` is structurally never true there.
- **Seeding & fairness** — `random` vs `date`/`week`. Seeded modes (Daily, Weekly) are identical
  for every player and disable NG+ so a known-good seed can't be farmed for records.
- **ARMOR shields** — default **2**; Casual **+6** (=8); Nightmare **0** (stripped); Heat ascension
  also strips shields (SEARING −1 … MELTDOWN −all).
- **Mid-run events** — `normal` (Endless), `none` (Arena, Boss Rush — scripted), `curated`
  high-risk pool (Daily, Weekly, Nightmare).
- **Scoring** — `cleartime` completion scoring (Arena, Boss Rush: speed + no-hit) vs running
  survival score (everyone else).
- **NG+ (New Game Plus)** — a per-win difficulty loop (up to ×1.72 intensity at loop 8). Applies
  only to **random-seed** modes; seeded Daily/Weekly always run at base.

## What happens after the final boss (the Sovereign)

- **Arena / Boss Rush** — the Sovereign is the last script entry, so killing it triggers the win:
  a victory cinematic ("REMEMBERED"), cleartime score bonus, **THE CHOICE** (catch/fall, first time
  only), NG+ increments, score submitted.
- **Survival modes** — killing the Sovereign sets `sovereignDown`, fires the **DAYBREAK** victory
  beat + the **FIRST LIGHT** day-wash + a "THE LONGEST DAY IS WON" callout, then pops an event:
  **GREET THE DAWN** (end the run on the victory) or **KEEP GOING (ASCEND ×N)** to press on into a
  tougher loop for the score. (The full catch/fall **THE CHOICE** stillpoint ending resolves on the
  *winnable* modes; survival's climax is the DAYBREAK / GREET-THE-DAWN beat.)

## How this bears on "win every mode ≥5%"

The [Sovereign Victory spec](SOVEREIGN_VICTORY_SPEC.md) turns "down the Sovereign" into a real
completion in every mode, so the goal becomes reachable:

- **Boss Rush** — already there (~83-92% on base difficulty).
- **Arena** — winnable in principle; the bot currently walls at wave 14 (~0-3%). Reaching ≥5%
  means easing the late script or improving the clearer.
- **Nightmare / Solstice / Casual / Weekly** — gain a Sovereign victory (per the spec), *and* need
  the survival-difficulty pass (spec §9) so the Sovereign (6th boss, currently unreached ~boss 1-3)
  is actually attainable. The win exists once both land.
