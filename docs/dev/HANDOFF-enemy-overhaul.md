# HANDOFF — ENEMY OVERHAUL (12 enemies, 12 distinct identities)

> Brainstormed + owner-approved 2026-06-19. Goal: **keep all 12 enemies, make each special and unique** — *depth, not difficulty*. Six of the twelve currently play the same ("it chases, you dash it"); this gives every enemy a distinct **tactical role + one light signature**, each shipping with a **readable tell and a clear counterplay**, so the roster gets richer to *read*, not harder to *survive*.

---

## PROMPT (paste this to spawn the agent)

> Overhaul the 12 enemies in THE LAST LANCE (lancefall) per the design in this doc. The roster currently has 6 distinct enemies (Bloomer/Lancer/Drifter/Orbiter/Herald/Seeker) and 6 that all play identically as "chase you, you dash them" (Darter/Splitter/Wisp/Shade/Bomber/Brooder). Give each enemy a distinct **tactical role + one light signature**, per the per-enemy table below. **This is "depth, not difficulty"** — every new wrinkle MUST ship with a clear telegraph and a fair counterplay; the OVERALL difficulty must stay roughly flat (the Shade actually gets *safer* to buy budget for the spicier ones). Do NOT change how many enemies spawn (that's the director's job) — only their per-enemy behavior.
>
> **Hard structural rule (improve the codebase, don't bloat it):** put the new enemy **tells/telegraph drawing** in a NEW focused render module `src/render/enemyTells.ts` — add ZERO inline drawing to `render.ts` (2495 lines) and especially NOTHING to `skins.ts` (5048 lines, the biggest god-file). Pure pattern-math for the new behaviors (counter-lunge geometry, split-on-non-sweep decision, mine-zone, rotating-wedge) goes in **tested helpers** following the `dash.ts`/`src/bosses/*` precedent; if an enemy's behavior grows complex, extract it to `src/enemies/<name>.ts` (mirror the boss split). `enemies.ts` stays tidy.
>
> **Determinism is load-bearing** (seeded Daily): every new behavior uses fixed offsets / `subPhase % N` counters — NEVER a new `world.rng` draw (the existing enemy "verbs" already do this; copy that discipline). Gate any flash behind `reduceFlashing`/`reduceMotion`. Build the **6 reworked chasers FIRST** (the headline fix), ship + playtest, THEN sharpen the 6 keepers. Verify each with `npx tsc --noEmit` + `npx vitest run` (1026+ green) + a prod-build boot-smoke. Commit per enemy with the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Design philosophy — DEPTH, NOT DIFFICULTY (read this first)

The owner's hard constraint: **make enemies deeper and more unique without making the game impossible.** Concretely:
- Each enemy = **one distinct role + one *light* signature touch** (a smaller-scale hybrid — not a full kit per enemy).
- **Every new threat ships with a readable TELL and a fair counterplay.** Depth comes from *interesting reads*, never from unfair surprises.
- **Spend a flat difficulty budget:** a couple get spicier (Darter, Bomber), a couple get *more readable / safer* (Shade is only dangerous during its telegraphed strike now). Net difficulty ≈ neutral.
- **Density is untouched** — how many spawn stays the director's (`waves.ts`) job. This overhaul is per-enemy depth only.
- Watch the **Darter** hardest: it pokes the player's *core* dash verb, so it needs a generous tell + forgiving counter-window. **Ship a tame version first**, tune up only if it feels toothless.

## The 12 — role · signature · tell/counterplay

### The 6 reworked chasers (BUILD FIRST — this is where "they all play the same" dies)

| Enemy | Role + light signature | Tell / counterplay (keeps it fair) |
|---|---|---|
| **Darter** | *Dash-duelist* — counter-lunges along your line when you dash **toward** it | A clear wind-up flash before the counter; triggers ONLY on a dash aimed at it. Bait it then punish/parry; weaving past is always safe. **Tame-first.** |
| **Splitter** | *The parry's signature target* — see the dedicated section below | Looks cracked/unstable (it *will* split). You choose: dash to be done, or parry to milk it. |
| **Wisp** | *Weave-swarm* — a tight erratic 5-pack; graze through for refill, one dash sweeps the cluster | Slow-damage; a faint light-thread links them (don't camp the middle). A graze *treat*, not a threat. |
| **Shade** | *Timing-duel* — faded + harmless while drifting, **phases in to strike** on a tell | The phase-in flash is the tell; dash through it (i-frames) or sidestep. **Safe between strikes** — the deliberate easing that funds our budget. |
| **Bomber** | *Don't-greed bomb* — rushes to self-detonate; killing it pops a ring | A clear arming pulse as it nears + a brief charge before the death-ring. Kill from range, or dash *through* so the blast lands behind you. |
| **Brooder** | *Priority target* — hangs at the edge, hatches drones (capped) | Slow, fragile, visibly "pulsing" before each hatch. Break off and kill the source fast — about prioritizing, not raw danger. |

### The 6 keepers (sharpen their lane — mostly readability, ~difficulty-neutral)

| Enemy | Sharpen into |
|---|---|
| **Orbiter** | *Area-denial* — its parked mines become a visible **zone** you steer around (control space, not just dodge shots). |
| **Bloomer** | *Ring-read turret* — the safe wedge **rotates predictably** so it reads as "track the gap and move into it." Keep the wedge generous. |
| **Lancer** | *The snipe* — keep the **double-tap** (don't dodge predictably into the second bolt); that IS its identity. Keep the lock telegraph. |
| **Drifter** | *The curve* — lean into "its shots **bend**": read curved volleys differently than straight fire. |
| **Herald** | *The gap-wall* — keep it (already a standout); optionally let the **previewed** lane drift slightly for a touch more read. |
| **Seeker** | *The juke* — keep the homing + **feint** (don't panic-dash the fake). Already distinct. |

## SPLITTER — the parry's signature target (detailed; has a cross-feature dependency)

Today a dash-kill spawns minis but the dash **sweep also kills them** (they spawn in the swept area) — so the split is silently nullified. **Embrace that** instead of fighting it:

- **A SWEEP kill (dash / heavy) = the CLEAN kill** — the sweep takes the parent *and* its spawn in one pass. Quick, gone, no consequence.
- **A NON-sweep kill (parry-riposte / graze-burn / a from-range AoE) = the REAL split** — the minis spawn and live, as a **combo shower**: make them *weak + slow + short-lived* combo/stamina fodder you mop up. So a parry "shatters" the Splitter into a satisfying little flurry → it's a **reward**, and the Splitter is the enemy that teaches *"parry pays off."*
- Net rule: *does your kill method also cover the spawn point?* Sweep → clean. Point/range → shower. Choice = "be done (dash)" vs "milk it for combo (parry)."

**⚠ Cross-feature dependency:** the parry-split assumes a parry can **kill the Splitter** — that needs the **RIPOSTE** from the PARRY OVERHAUL (`docs/HANDOFF-parry-overhaul.md`, Pillar 1), which damages enemies in the parry arc. If that hasn't merged yet, build the Splitter so the **split-survives path hooks the riposte/graze/AoE kill path** (any non-sweep kill), and coordinate with the parry agent. The minis-as-reward keep it balanced (small, weak, short-lived).

## Structural mandate (where the work goes)

| New/changed | Where | Why |
|---|---|---|
| New enemy **tells / telegraph drawing** (Darter wind-up, Bomber arming pulse, Shade phase-in, Brooder hatch-pulse, Splitter cracked look, Orbiter mine-zone, Bloomer rotating wedge) | **NEW `src/render/enemyTells.ts`** | keep it OUT of `skins.ts` (5048 — the biggest god-file) and `render.ts`; continue the `render/*` split the boss agent started |
| Pure pattern-math (counter-lunge target, split-decision, mine-zone test, rotating-wedge index) | **tested helpers** (`enemies.ts` companion fns or `src/enemies/<name>.ts`) | follows `dash.ts`/`sovereign.ts` precedent; unit-testable, deterministic |
| Per-enemy behavior that grows complex | extract to **`src/enemies/<name>.ts`** (mirror `src/bosses/*`) | keep `enemies.ts` (563 lines) a tidy dispatcher; opportunistic, not mandatory for the simple ones |
| Tuning constants (tells, counter-windows, mine radius, split-mini stats) | the per-enemy blocks in **`tune.ts`** | single source of truth — nothing else hardcodes a number |

`enemies.ts` is NOT a god-file (563 lines) — it may grow modestly, but the **tells must not bloat `skins.ts`/`render.ts`.** That's the bar.

## Current state you're building on
- **`src/enemies.ts`** (~563): per-enemy `update*` logic, the existing deterministic "verbs" via `subPhase % N` counters (e.g. Orbiter mine every 4th, Bloomer wedge every 3rd, Drifter scatter every 3rd) — copy that pattern for the new behaviors.
- **`tune.ts`**: per-enemy blocks (HP, speeds, cadences, spreads) ~lines 200–400. Add the new tell/counter/mine/split constants here.
- **`skins.ts`** (5048): enemy *visuals* (canvas draw). Do NOT add behavior here, and put new TELL drawing in `render/enemyTells.ts`, not here.
- **`waves.ts`**: the director (spawn cadence/density) — **do not touch** (density stays flat).
- **The player verbs** the roles pull on: dash (sweep kill + i-frames), the PARRY (deflect + riposte — overhaul in flight), graze (refill/combo), the HEAVY overcharge dash. Several reworks (Splitter, the projectile zoners) deliberately become **parry-bait** — good synergy with the parry overhaul.

## Sequencing
- **Phase 1 — the 6 chasers** (Darter, Splitter, Wisp, Shade, Bomber, Brooder): this is the headline that kills "they all play the same." Ship + playtest the *feel and the difficulty* before Phase 2.
- **Phase 2 — sharpen the 6 keepers** (Orbiter mine-zone, Bloomer rotating wedge, Lancer/Drifter/Herald/Seeker polish).

## Verification (every enemy)
1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **1026+ green** (add per-behavior pure-helper tests).
3. `npx vitest run src/determinism.test.ts src/waves.test.ts` → green (proves no rng/timing drift).
4. Prod boot-smoke: `npx vite build && npx vite preview --port 4183 --strictPort`, load it, **0 console errors** (only the CSP-blocked CF beacon is allowed). **Playtest each reworked enemy in dev via the `__lf` hook** — confirm the tell reads and the counterplay works, and that the overall run isn't harder, just richer.

## Definition of done
- All 12 enemies have a distinct role + a readable signature; no two of the old chasers play the same.
- The Splitter splits into a combo-shower on a non-sweep kill (parry/graze/AoE), clean on a dash/heavy sweep.
- Every new threat is telegraphed; the run is **richer to read, not harder to survive** (verify by playtest — net difficulty ~flat).
- New tells live in `src/render/enemyTells.ts` (nothing added to `skins.ts`/`render.ts`); pattern-math is pure + tested; determinism preserved (no new rng).
- tsc clean, full suite green, prod boots clean. Committed per enemy, then `npm run deploy` and confirm `lancefall.pages.dev` boots.

---

## STATUS — SHIPPED + DEPLOYED (2026-06-19)

All 12 enemies now play a distinct tactical role. tsc clean, **1093 tests green** (+~40
new), prod build boots clean (runtime smoke: full spawn→combat→death→debrief run, 0
console errors bar the harmless CSP-blocked CF beacon), **deployed to lancefall.pages.dev**.

**Phase 1 — the 6 reworked chasers** (one commit each):
- **Splitter** — parry signature target: a SWEEP kill (dash/heavy) is clean; a NON-sweep
  kill (parry-riposte / graze-burn / AoE, all `damageEnemy(...,false)`) shatters it into a
  weak+slow+short-lived combo-shower (`splitInto(e,w,fromSweep)`; ephemeral minis phase 1).
- **Shade** — timing-duel: faded + HARMLESS while drifting, lethal only mid telegraphed
  STRIKE (`shadeLethal()` gates the body-collision). Removed the old blink edgeSpawn → now
  fully rng-free. The budget-saver (it used to be a contact kill at all times).
- **Bomber** — don't-greed kamikaze: RUSH → ARM in range (telegraphed charge) →
  SELF-DETONATE a deterministic blast ring (or kill from range / dash through).
- **Wisp** — weave-swarm: slow dual-frequency weave (graze treat), light-thread tell.
- **Darter** — dash-duelist: counter-lunges ALONG YOUR LINE only on a dash aimed at it
  (cone+range), generous wind-up + wide-open recovery. Extracted to `src/enemies/darter.ts`
  (pure `darterDetectsDash` + the PATROL→WINDUP→COUNTER→RECOVER machine). **Tame-first.**
- **Brooder** — priority target: hangs at a fixed edge perch + a clearer hatch-pulse tell.

**Phase 2 — the keepers:**
- **Orbiter** — parked mines now read as a denied ZONE (render-only hazard disc/ring).
- **Bloomer** — ring-read turret: EVERY bloom leaves a safe wedge that ROTATES a fixed step
  ("track the gap"); dropped the per-bloom random ring rotation → now rng-free.
- **Lancer / Drifter / Herald / Seeker** — KEPT as-is (already distinct roles + readable
  aim-line tells: double-tap / curved arc / gap-wall / homing-feint). The Herald lane-drift
  was flagged *optional* and skipped to preserve the shipped, tuned balance.

**Structure honoured:** all new tells live in NEW `src/render/enemyTells.ts` (one delegated
call from `render.ts drawEnemies`; ZERO inline drawing added to `render.ts` / `skins.ts`).
Pure pattern-math is unit-tested (`src/enemyRoles.test.ts`, `src/darter.test.ts`,
`src/zonerVerbs.test.ts`). Every new behaviour draws ZERO `world.rng` (asserted), so the
seeded Daily stays bit-identical. All flash/strobe gated by reduceFlashing/reduceMotion.
