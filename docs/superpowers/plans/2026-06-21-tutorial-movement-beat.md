# Tutorial Movement Teach (Combo-Beat Rework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach W/A/S/D movement by reworking the tutorial's COMBO beat so the player must drift diagonally onto an off-axis row of dummies before one dash can skewer them.

**Architecture:** Two tasks. Task 1 changes the combo dummy geometry (a diagonal row offset from the player's start anchor) and the beat copy — this is the load-bearing, testable mechanic: the existing "skewer ≥2" (`comboDash`) trigger becomes a movement gate purely because the row sits off the start point's dash-ray. Task 2 adds the full cueing (a guide line, a MOVE cue, and a 1-skewer nudge) in the sandbox frame loop. Everything lives in the throwaway sandbox world — no seeded sim, no determinism risk.

**Tech Stack:** Vite + vanilla TypeScript, Canvas2D, Web Audio, Vitest. Single test file: `npx vitest run src/sandbox.test.ts`. Whole suite: `npx vitest run`. Build: `npm run build`. Typecheck: `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-21-tutorial-movement-beat-design.md`.

## Global Constraints

- **Zero determinism risk — and keep it that way.** All changes are confined to the DASH SANDBOX, which runs on a separate non-seeded throwaway world (`createRng(0x5A4D_B0C5)`); it never touches `this.world`, the seeded rng, waves, scoring, or save. Add NO `world.rng`/`Math.random`/`Date`. No `SAVE_VERSION` change.
- **Do not change the trigger.** The combo beat keeps `advanceOn: 'comboDash'` and the `sandboxDashKills >= 2` rule. Movement is gated by geometry, not new completion logic.
- **No copy apostrophes.** To avoid a known UTF-8 smart-apostrophe hazard with the editor on `sandbox.ts`, write the new combo copy WITHOUT apostrophes (em-dashes `—` are fine; the file already uses them). Keep all other existing strings byte-for-byte unchanged.
- **Clean files, per-file commits.** `sandbox.ts`, `sandbox.test.ts`, and `game.ts` are all clean in the working tree. Stage exactly the files each task names with `git add <files>` — never `git add -A`/`.` (the shared monorepo has unrelated dirty files, e.g. `ui.ts`/`style.css`, you must not touch).
- **Run the full suite green before each commit** (`npx vitest run`).

---

### Task 1: Diagonal off-axis combo row + movement copy

**Files:**
- Modify: `src/sandbox.ts` — `sandboxBeatTargets('combo')` (the `case 'combo':` return) and the `combo` entry of `SANDBOX_STEPS` (`text`/`sub`).
- Test: `src/sandbox.test.ts` — replace the `'combo presents a cluster of three'` test; update the combo assertion in `'the overlay text names the mechanic each beat teaches'`; add a combo assertion to `'the trickiest beats name their key idea in the sub'`.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `sandboxBeatTargets('combo')` returns 3 `SandboxTarget`s that are collinear but whose line is ≥60px (perpendicular) from the origin `(0,0)` and spans both axes (a diagonal). Task 2's cueing reads these dummy positions off the world at runtime; it does not import the offsets.

- [ ] **Step 1: Write the failing geometry test**

In `src/sandbox.test.ts`, inside `describe('deep sandbox — per-beat target layouts ...')`, REPLACE the existing test:

```ts
  it('combo presents a cluster of three', () => {
    expect(sandboxBeatTargets('combo').length).toBe(3);
  });
```

with:

```ts
  it('combo is a DIAGONAL row, off the player start axis (movement is required to line up)', () => {
    const t = sandboxBeatTargets('combo');
    expect(t.length).toBe(3);
    const [a, b, c] = t;
    // collinear: all three lie on ONE line, so a single dash CAN spear them once aligned
    const cross = (b.dx - a.dx) * (c.dy - a.dy) - (b.dy - a.dy) * (c.dx - a.dx);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
    // ...but the player START (origin) is well OFF that line: the perpendicular distance from
    // (0,0) to the row's line must clear the dash hit-tolerance, so a straight dash from the
    // anchor cannot clip >=2 — the player MUST drift onto the line first.
    const abx = c.dx - a.dx, aby = c.dy - a.dy;
    const len = Math.hypot(abx, aby);
    const perp = Math.abs(-a.dx * aby - -a.dy * abx) / len; // dist from (0,0) to line a..c
    expect(perp).toBeGreaterThan(60);
    // ...and it is a DIAGONAL (both axes change meaningfully — not a flat row, not a column)
    expect(Math.abs(abx)).toBeGreaterThan(40);
    expect(Math.abs(aby)).toBeGreaterThan(40);
  });
```

- [ ] **Step 2: Update the copy assertions (still part of the failing set)**

In `src/sandbox.test.ts`, in `'the overlay text names the mechanic each beat teaches'`, change the combo line:

```ts
    expect(text('combo')).toContain('combo');
```

to:

```ts
    expect(text('combo')).toContain('move'); // the combo beat now teaches MOVEMENT to line up the row
```

And in `'the trickiest beats name their key idea in the sub'`, add a combo assertion (the combo idea now lives in the sub):

```ts
    expect(sub('combo')).toMatch(/combo|overdrive/);
```

- [ ] **Step 3: Run the tests — verify they FAIL**

Run: `npx vitest run src/sandbox.test.ts`
Expected: FAIL — the current combo row `[{200,0},{310,0},{420,0}]` is horizontal (perp distance from origin = 0, `aby = 0`), and the current main text says "Line them up ... COMBO" (no "move").

- [ ] **Step 4: Replace the combo target geometry**

In `src/sandbox.ts` `sandboxBeatTargets`, replace the `case 'combo':` block:

```ts
    case 'combo':
      // collinear, dead ahead — a single straight dash skewers all three (a vertical spread
      // would let a forward dash miss the flankers, stranding the beat on its cap).
      return [{ dx: 200, dy: 0 }, { dx: 310, dy: 0 }, { dx: 420, dy: 0 }];
```

with:

```ts
    case 'combo':
      // a DIAGONAL row, OFF the player's start axis: from the (re-centred) anchor a straight
      // dash clips at most one, so the player must DRIFT (W/A/S/D) diagonally onto the row's
      // line, then dash along it to spear >=2. Teaches movement + the combo together. The
      // perpendicular distance from the anchor to this line clears the dash hit-tolerance
      // (asserted in sandbox.test.ts), which is what makes moving mandatory.
      return [{ dx: 120, dy: -160 }, { dx: 250, dy: -235 }, { dx: 380, dy: -310 }];
```

- [ ] **Step 5: Rewrite the combo beat copy (no apostrophes)**

In `src/sandbox.ts` `SANDBOX_STEPS`, replace the `combo` entry:

```ts
  {
    step: 'combo',
    text: 'Line them up — spear SEVERAL in one dash to build a COMBO.',
    sub: 'Killing without pausing climbs your combo multiplier and charges OVERDRIVE. Keep the chain alive by always lining up the next target before the last falls.',
    advanceOn: 'comboDash',
  },
```

with:

```ts
  {
    step: 'combo',
    text: 'The row sits off to the side — MOVE (W/A/S/D) to line it up, then dash through it.',
    sub: 'Your dash flies straight, so drift onto the row line first — then one dash spears the whole chain, climbing your COMBO multiplier and charging OVERDRIVE.',
    advanceOn: 'comboDash',
  },
```

- [ ] **Step 6: Run the tests — verify they PASS**

Run: `npx vitest run src/sandbox.test.ts`
Expected: PASS. (The new row: collinear; perpendicular distance from origin ≈ 79px > 60; `abx = 260`, `aby = -150` — both > 40. Main text contains "move"; sub contains "combo"/"overdrive".)

- [ ] **Step 7: Full suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green; build succeeds. (No other test references the combo text/geometry — the curriculum/trigger tests use `comboDash`, unchanged.)

- [ ] **Step 8: Commit**

```bash
git add src/sandbox.ts src/sandbox.test.ts
git commit -m "feat(lancefall): tutorial combo beat teaches W/A/S/D — diagonal off-axis row"
```

---

### Task 2: Full cueing for the move-to-line-up beat

The geometry alone is learnable only if the player understands they must move. Add three cosmetic cues in the sandbox frame loop: a guide line through the row, a MOVE cue pointing the player onto the line, and a contextual nudge after a dash that catches fewer than two. UI/particle code has no unit coverage — verify via typecheck, build, and a manual sandbox run.

**Files:**
- Modify: `src/game.ts` — add a `sandboxComboMissed` field; in `setupSandboxBeat` reset it and skip the generic `AIM →` one-shot for the combo beat; in `stepSandboxFrame` add the guide-line + MOVE cue (cue-tick block), the combo note branch, and the missed-dash detection.

**Interfaces:**
- Consumes: the combo dummy positions exist in the throwaway world `sw.enemies` (3 static drifters placed by `setupSandboxBeat` from Task 1's offsets).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add the nudge-state field**

In `src/game.ts`, find the sandbox state fields (declared near `private sandboxDashKills`, around line 471's initializer `this.sandboxDashKills = 0;` — the field declaration is with the other private fields). Add a field declaration alongside the other `sandbox*` private fields:

```ts
  private sandboxComboMissed = false;
```

- [ ] **Step 2: Reset the flag + suppress the AIM cue for combo, in `setupSandboxBeat`**

In `src/game.ts` `setupSandboxBeat`, the player re-centre block currently ends with:

```ts
    sw.player.phase = 'idle'; sw.player.charge = 0; sw.player.overcharge = 0;
    const px = sw.player.x, py = sw.player.y;
```

Insert the reset right after that first line:

```ts
    sw.player.phase = 'idle'; sw.player.charge = 0; sw.player.overcharge = 0;
    this.sandboxComboMissed = false; // combo move-teach: fresh each (re)stage
    const px = sw.player.x, py = sw.player.y;
```

Then the one-shot directional cue currently reads:

```ts
    // a one-shot directional cue toward the marks (bullet/rhythm beats are their own cue)
    if (targets.length > 0) {
      const t = targets[0];
      const ang = Math.atan2(t.dy, t.dx);
      sw.particles.floatText(px + Math.cos(ang) * 56, py + Math.sin(ang) * 56 - 22, 'AIM →', '#9fd8ff', 1.1);
    }
```

Change the guard so the combo beat skips the generic AIM cue (it gets its own MOVE cue in `stepSandboxFrame`):

```ts
    // a one-shot directional cue toward the marks (bullet/rhythm beats are their own cue;
    // the combo move-teach uses its own pulsing MOVE cue + guide line instead)
    if (targets.length > 0 && step !== 'combo') {
      const t = targets[0];
      const ang = Math.atan2(t.dy, t.dx);
      sw.particles.floatText(px + Math.cos(ang) * 56, py + Math.sin(ang) * 56 - 22, 'AIM →', '#9fd8ff', 1.1);
    }
```

- [ ] **Step 3: Add the guide line + MOVE cue in the cue-tick block**

In `src/game.ts` `stepSandboxFrame`, the cue-tick block currently reads:

```ts
    if (cueTick) {
      const cueColor = step === 'reach' ? '#ffd166' : step === 'heavy' ? '#9fb4d8' : step === 'bossparry' ? '#ff8da3' : '#5beaff';
      sw.enemies.forEachActive((e) => sw.particles.ring(e.x, e.y, e.radius + 14, cueColor, 0.34));
    }
```

Append the combo cueing right after the `forEachActive` line, inside the same `if (cueTick)` block:

```ts
    if (cueTick) {
      const cueColor = step === 'reach' ? '#ffd166' : step === 'heavy' ? '#9fb4d8' : step === 'bossparry' ? '#ff8da3' : '#5beaff';
      sw.enemies.forEachActive((e) => sw.particles.ring(e.x, e.y, e.radius + 14, cueColor, 0.34));
      // COMBO move-teach: a faint guide line through the row + a MOVE cue toward its nearest
      // point, so "drift onto this line" is unmistakable. Cosmetic particles only (no rng).
      if (step === 'combo') {
        const row: { x: number; y: number }[] = [];
        sw.enemies.forEachActive((e) => row.push({ x: e.x, y: e.y }));
        if (row.length >= 2) {
          const a = row[0], b = row[row.length - 1];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            sw.particles.ring(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3, '#5beaff', 0.3);
          }
          const px = sw.player.x, py = sw.player.y;
          const abx = b.x - a.x, aby = b.y - a.y;
          const len2 = abx * abx + aby * aby || 1;
          let tt = ((px - a.x) * abx + (py - a.y) * aby) / len2;
          tt = Math.max(0, Math.min(1, tt));
          const nx = a.x + abx * tt, ny = a.y + aby * tt;
          sw.particles.floatText(px + (nx - px) * 0.45, py + (ny - py) * 0.45 - 8, 'MOVE · W A S D', '#9fd8ff', 1.0);
        }
      }
    }
```

- [ ] **Step 4: Detect a missed (under-2) combo dash**

In `src/game.ts` `stepSandboxFrame`, the skewer block ends with:

```ts
      if (step === 'reach' && ev.skewer) ev.reached = true; // the only mark on the reach beat is the far one
      if (this.sandboxDashKills >= 2) ev.comboDash = true; // a single dash skewered the line
    }
    if (ev.skewer) sw.player.killsThisDash = this.sandboxDashKills; // mirror for any read-back
```

Add the missed-dash detection right after that closing `}` of the `if (dashing && step !== 'bossparry')` block (i.e. after the `if (ev.skewer) sw.player.killsThisDash = ...` line):

```ts
    if (ev.skewer) sw.player.killsThisDash = this.sandboxDashKills; // mirror for any read-back
    // COMBO move-teach: a dash that landed with <2 skewers means the player was not lined up —
    // latch a nudge to drift onto the row. ev.landed fires the frame the dash completes; the
    // kill tally still holds this dash's total (it resets only on the next dash fire).
    if (step === 'combo' && this.ev.landed && freshDash && this.sandboxDashKills < 2) {
      this.sandboxComboMissed = true;
    }
```

- [ ] **Step 5: Show the nudge in the combo note**

In `src/game.ts` `stepSandboxFrame`, the per-beat note logic currently reads:

```ts
    if (step === 'heavy') {
      const cue = overchargeCue(sw.player.charge, sw.player.overcharge);
      if (cue !== 'none') this.ui.setSandboxNote(cue === 'armed' ? 'HEAVY READY — release!' : 'KEEP HOLDING → HEAVY', true);
      else this.ui.setSandboxNote(currentStep(sb).sub ?? '');
      if (cueTick && cue !== 'none') sw.particles.ring(sw.player.x, sw.player.y, sw.player.radius + 18, cue === 'armed' ? '#ffe08a' : '#ffd166', 0.3);
    } else if (step === 'done') {
      this.ui.setSandboxNote('Replay anytime in Settings ▸ Replay tutorial');
    } else {
      // parry / rhythm carry a deeper sub-explanation; other beats have none → clears
      this.ui.setSandboxNote(currentStep(sb).sub ?? '');
    }
```

Insert a `combo` branch before the final `else`:

```ts
    } else if (step === 'combo') {
      // after a miss, swap the sub for the exact fix; otherwise the normal sub
      this.ui.setSandboxNote(this.sandboxComboMissed
        ? 'Almost — drift onto the row line, then dash across all of them.'
        : (currentStep(sb).sub ?? ''));
    } else {
      // parry / rhythm carry a deeper sub-explanation; other beats have none → clears
      this.ui.setSandboxNote(currentStep(sb).sub ?? '');
    }
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 7: Full suite**

Run: `npx vitest run`
Expected: all green (this task adds no tests and changes no tested behavior — it's cosmetic sandbox cueing; the geometry/trigger tests from Task 1 stay green).

- [ ] **Step 8: Manual sandbox verification (the real acceptance check)**

Start/refresh the dev server, then in the game: **Settings ▸ Onboarding ▸ Replay tutorial**, then **DESCEND**. Walk to the COMBO beat (charge → release → reach → heavy → combo) and confirm:
1. The 3 dummies sit on a diagonal up-and-to-the-right, clearly off your starting line.
2. A straight dash from the start position spears **at most one** — it cannot complete the beat.
3. The guide line (dotted) + the **MOVE · W A S D** cue point you onto the row's line.
4. Drifting onto the line (W+D) and dashing along it spears ≥2 and advances the beat.
5. A dash that catches only one flips the note to *"Almost — drift onto the row line, then dash across all of them."*
6. SKIP still bails out.

If the row is unreachable, off-screen, or a straight dash can clip 2 (too close to the line), nudge the offsets in `sandboxBeatTargets('combo')` (raise the `dy` magnitudes / spread) and re-verify — the Task 1 geometry test (perp > 60) is the floor.

- [ ] **Step 9: Commit**

```bash
git add src/game.ts
git commit -m "feat(lancefall): combo move-teach cueing — guide line, MOVE cue, miss nudge"
```

---

## Self-Review

**Spec coverage:**
- Rework combo into move-to-line-up via off-axis geometry → Task 1 (geometry + the perp-distance invariant test). ✓
- Diagonal row → Task 1 offsets + the `abx`/`aby > 40` diagonal assertion. ✓
- Full cueing (guide line, MOVE cue, contextual nudge) → Task 2 Steps 3–5. ✓
- Copy naming W/A/S/D + the line-up idea → Task 1 Step 5 + the copy assertions. ✓
- Trigger unchanged (`comboDash` ≥2) → untouched in both tasks; Global Constraints. ✓
- Determinism/throwaway-world safety, no SAVE_VERSION → Global Constraints; cosmetic particle cues only. ✓
- Tests: geometry invariant + copy + existing trigger/no-stuck stay green → Task 1 Steps 1–2, 7. ✓

**Placeholder scan:** none — every code step has complete code and exact anchors.

**Type/name consistency:** `sandboxComboMissed` is declared (T2 S1), reset (T2 S2), set (T2 S4), and read (T2 S5) with matching name. `sandboxBeatTargets('combo')` shape (3 `SandboxTarget`) is consistent between the test (T1 S1) and the implementation (T1 S4). The cue code reads live `sw.enemies` positions, not the offset literals, so it stays correct if the offsets are tuned.
