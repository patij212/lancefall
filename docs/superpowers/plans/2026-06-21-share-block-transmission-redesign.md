# LAST TRANSMISSION — game-over share block redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static, victory-flavored "SHARE THE DAWN" game-over panel with a theme-aware "LAST TRANSMISSION" console (mirrored solstice gradient, defeat→echo / win→dawn copy, SVG broadcast glyph), and drop the dead DUEL button.

**Architecture:** Pure presentation. A new pure view-model (`src/shareBlock.ts`) maps run outcome+stats → the panel's themed strings (unit-tested). `src/ui.ts` builds the console DOM once and populates it per run from that view-model; theming (the mirrored cold/warm gradient) rides the existing `.go-won`/`.go-lost` classes already on the game-over root, so it's CSS-only. Builds on the already-shipped real captured-frame preview (`go-gif-img`).

**Tech Stack:** Vite + vanilla TypeScript, Vitest, hand-rolled DOM (`el(...)` helper), CSS.

## Global Constraints

- No game logic, no `world.rng`, no SAVE_VERSION bump, no new save fields. Presentation only.
- Spec: `docs/superpowers/specs/2026-06-21-share-block-transmission-redesign.md`.
- Locked copy (verbatim): defeat label `LAST TRANSMISSION`, badge `● SIGNAL LOST · <seed>`, CTA `SEND THE ECHO`, rally `show them it can be held →`; win label `SIGNAL RESTORED`, badge `● FIRST LIGHT · <seed>`, CTA `SEND THE DAWN`, rally `this is what holding looks like →`.
- Seed text matches `replay.buildWatermark`: `DAILY <seed>` when daily, else `SEED <seed>`.
- The duel SYSTEM (`panels/duel.ts`, `ghost.ts`, the `onCreateChallenge` callback) stays intact — only the panel button is removed.
- `ui.ts`/`style.css` carry another agent's uncommitted WIP (a cockpit STREAK stat + `cockpitSolstice` banner). When committing, stage ONLY this plan's hunks (the share-block changes) — never wholesale `git add` those two files. The pure `shareBlock.ts`/`shareBlock.test.ts` and `game.ts` are fully ours.
- Verify with `npx vitest run`, `npx tsc --noEmit`, and a minified `vite preview` boot (the project has shipped dev-green/prod-broken before).

---

### Task 1: Pure view-model `shareBlock.ts` (+ tests)

**Files:**
- Create: `src/shareBlock.ts`
- Test: `src/shareBlock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ShareBlockInput { won: boolean; seed: number; daily: boolean; time: number; wave: number; score: number; clearTime?: number; grade: string; }`
  - `interface ShareStatCell { k: string; v: string; }`
  - `interface ShareBlockView { label: string; pip: 'cold' | 'warm'; badge: string; cta: string; rally: string; stats: [ShareStatCell, ShareStatCell, ShareStatCell]; }`
  - `function shareBlockView(input: ShareBlockInput): ShareBlockView`

- [ ] **Step 1: Write the failing test**

```ts
// src/shareBlock.test.ts
import { describe, it, expect } from 'vitest';
import { shareBlockView } from './shareBlock';

const base = { seed: 20260621, daily: false, time: 252, wave: 7, score: 42800, grade: '—' };

describe('shareBlockView — themed game-over share block copy', () => {
  it('defeat speaks the echo→rally voice with HELD/WAVE/SCORE', () => {
    const v = shareBlockView({ ...base, won: false });
    expect(v.label).toBe('LAST TRANSMISSION');
    expect(v.pip).toBe('cold');
    expect(v.cta).toBe('SEND THE ECHO');
    expect(v.rally).toBe('show them it can be held →');
    expect(v.badge).toBe('● SIGNAL LOST · SEED 20260621');
    expect(v.stats.map((c) => c.k)).toEqual(['HELD', 'WAVE', 'SCORE']);
    expect(v.stats[0].v).toBe('4:12'); // 252s → 4:12
    expect(v.stats[1].v).toBe('7');
    expect(v.stats[2].v).toBe('42,800');
  });

  it('victory speaks of first light held with CLEARED/GRADE/SCORE', () => {
    const v = shareBlockView({ ...base, won: true, clearTime: 588, grade: 'S', score: 128500 });
    expect(v.label).toBe('SIGNAL RESTORED');
    expect(v.pip).toBe('warm');
    expect(v.cta).toBe('SEND THE DAWN');
    expect(v.rally).toBe('this is what holding looks like →');
    expect(v.badge).toBe('● FIRST LIGHT · SEED 20260621');
    expect(v.stats.map((c) => c.k)).toEqual(['CLEARED', 'GRADE', 'SCORE']);
    expect(v.stats[0].v).toBe('9:48'); // 588s → 9:48
    expect(v.stats[1].v).toBe('S');
    expect(v.stats[2].v).toBe('128,500');
  });

  it('a Daily badge says DAILY, matching the GIF watermark', () => {
    expect(shareBlockView({ ...base, won: false, daily: true }).badge).toBe('● SIGNAL LOST · DAILY 20260621');
    expect(shareBlockView({ ...base, won: true, daily: true, clearTime: 0 }).badge).toBe('● FIRST LIGHT · DAILY 20260621');
  });

  it('a win with no clearTime falls back to time survived', () => {
    const v = shareBlockView({ ...base, won: true, clearTime: undefined, time: 600, grade: 'A' });
    expect(v.stats[0]).toEqual({ k: 'CLEARED', v: '10:00' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shareBlock.test.ts`
Expected: FAIL — `Failed to resolve import "./shareBlock"` / `shareBlockView is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shareBlock.ts
// Pure view-model for the game-over "LAST TRANSMISSION" share block. Maps a run's
// outcome + stats to the themed strings the panel renders — no DOM, no world.rng — so
// the copy/voice logic is unit-tested even though ui.ts itself isn't. The cold→warm
// gradient theming is CSS (driven by the .go-won/.go-lost class), not this module.

export interface ShareBlockInput {
  won: boolean;
  seed: number;
  daily: boolean;
  time: number; // seconds survived (HELD on a loss)
  wave: number;
  score: number;
  clearTime?: number; // seconds to clear (CLEARED on a win)
  grade: string; // computed upstream in ui.ts ('S' | 'A' | 'B' | '—')
}

export interface ShareStatCell {
  k: string;
  v: string;
}

export interface ShareBlockView {
  label: string; // header label (after the pip)
  pip: 'cold' | 'warm';
  badge: string; // signal badge text
  cta: string; // primary button label
  rally: string; // rally subline
  stats: [ShareStatCell, ShareStatCell, ShareStatCell];
}

/** mm:ss — mirrors ui.ts formatTime (kept local so this module stays DOM-free and pure). */
function mmss(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Seed line shared verbatim with replay.buildWatermark so the badge + GIF agree. */
function seedText(seed: number, daily: boolean): string {
  return daily ? `DAILY ${seed}` : `SEED ${seed}`;
}

export function shareBlockView(input: ShareBlockInput): ShareBlockView {
  const score = input.score.toLocaleString('en-US');
  const seed = seedText(input.seed, input.daily);
  if (input.won) {
    return {
      label: 'SIGNAL RESTORED',
      pip: 'warm',
      badge: `● FIRST LIGHT · ${seed}`,
      cta: 'SEND THE DAWN',
      rally: 'this is what holding looks like →',
      stats: [
        { k: 'CLEARED', v: mmss(input.clearTime ?? input.time) },
        { k: 'GRADE', v: input.grade },
        { k: 'SCORE', v: score },
      ],
    };
  }
  return {
    label: 'LAST TRANSMISSION',
    pip: 'cold',
    badge: `● SIGNAL LOST · ${seed}`,
    cta: 'SEND THE ECHO',
    rally: 'show them it can be held →',
    stats: [
      { k: 'HELD', v: mmss(input.time) },
      { k: 'WAVE', v: String(input.wave) },
      { k: 'SCORE', v: score },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shareBlock.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shareBlock.ts src/shareBlock.test.ts
git commit -m "feat(lancefall): pure view-model for the LAST TRANSMISSION share block"
```

---

### Task 2: Plumb the run `seed` into `GameOverInfo`

**Files:**
- Modify: `src/ui.ts` (the `GameOverInfo` interface, ~line 138)
- Modify: `src/game.ts` (the `GameOverInfo` literal in `finishGameOver`, ~line 3308)

**Interfaces:**
- Consumes: nothing.
- Produces: `GameOverInfo.seed: number` (read by Task 3).

- [ ] **Step 1: Add the field to the interface**

In `src/ui.ts`, in `interface GameOverInfo`, directly after the existing `previewFrame?: string;` line, add:

```ts
  /** the run's seed — shown in the LAST TRANSMISSION badge (matches the GIF watermark) */
  seed: number;
```

- [ ] **Step 2: Populate it in game.ts**

In `src/game.ts`, in `finishGameOver`, in the `const info: GameOverInfo = { ... }` literal, directly after the `previewFrame: this.replay.lastFrameImage() ?? undefined,` line, add:

```ts
      seed: this.seed,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no output). Confirms `seed` is required and the sole builder (game.ts) supplies it.

- [ ] **Step 4: Commit**

```bash
git add src/ui.ts src/game.ts
git commit -m "feat(lancefall): carry the run seed into GameOverInfo for the share badge"
```

(Note: `src/ui.ts` has co-agent WIP — stage only this hunk. See Global Constraints.)

---

### Task 3: Rebuild the share panel as the LAST TRANSMISSION console (ui.ts)

**Files:**
- Modify: `src/ui.ts` — the `GO_GIF_HTML` constant (~line 359), the field declarations (~line 525), the share-panel build in `buildGameOver` (~lines 1823–1843), and the `showGameOver` wiring (after the grade computation, ~line 4126).

**Interfaces:**
- Consumes: `shareBlockView`, `ShareBlockView` from `./shareBlock` (Task 1); `GameOverInfo.seed` (Task 2).
- Produces: the rendered console (verified in Task 5).

- [ ] **Step 1: Import the view-model**

At the top of `src/ui.ts`, with the other local imports, add:

```ts
import { shareBlockView } from './shareBlock';
```

- [ ] **Step 2: Drop the old "GIF · 6s" badge from the frame chrome**

Replace the `GO_GIF_HTML` constant (it currently ends with a `go-gif-badge` span) with just the sky/glow/shimmer chrome — the badge is replaced by the themed `go-tx-badge`:

```ts
// The signal-feed frame chrome (a static dawn frame — no canvas dependency). The badge is
// now the themed LAST TRANSMISSION badge, added in buildGameOver, not baked in here.
const GO_GIF_HTML = `<span class="go-gif-sky"></span><span class="go-gif-glow"></span><span class="go-gif-shimmer"></span>`;
```

- [ ] **Step 3: Add the broadcast glyph constant**

Near `GO_GIF_HTML`, add the hand-drawn SVG (matches the game's `MODE_ICONS`/`NAV_ICONS` idiom — `viewBox`, `fill="none"`, `stroke="currentColor"`; `currentColor` so it inherits the CTA's themed color). A center emitter dot with two concentric arcs radiating each way — a transmit/broadcast mark:

```ts
// Broadcast/transmit glyph for the SEND THE ECHO / SEND THE DAWN button. currentColor.
const TX_GLYPH = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="1.7" fill="currentColor"/><path d="M5 11a4.2 4.2 0 010-6M2.9 13.1a7.2 7.2 0 010-10.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 5a4.2 4.2 0 010 6M13.1 2.9a7.2 7.2 0 010 10.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
```

- [ ] **Step 4: Declare the new element refs**

With the other game-over field declarations (right after the existing `private goGifImg!: HTMLImageElement;` line, ~525), add:

```ts
  private goTxLbl!: HTMLElement; // themed console label ("LAST TRANSMISSION" / "SIGNAL RESTORED")
  private goTxBadge!: HTMLElement; // signal badge over the frame ("● SIGNAL LOST · SEED ####")
  private goTxStrip!: HTMLElement; // the 3-cell stat strip
  private goTxCtaTxt!: HTMLElement; // the primary CTA's text node ("SEND THE ECHO" / "SEND THE DAWN")
  private goTxRally!: HTMLElement; // rally subline
```

- [ ] **Step 5: Rebuild the share panel DOM**

Replace the current share-panel block in `buildGameOver` (from `this.saveReplayBtn = el('button', { class: 'go-sbtn primary' }, '⧉ SHARE THE DAWN') ...` through the `const sharePanel = el('div', { class: 'go-share-panel' }, ... )` literal) with:

```ts
    // ── LAST TRANSMISSION console — theme-aware share/invite block (replaces SHARE THE DAWN).
    // The cold→warm gradient + pip/badge/CTA colors are CSS, driven by the .go-won/.go-lost
    // class on the game-over root; this builds the structure, showGameOver fills the strings.
    this.goTxLbl = el('span', {}, 'LAST TRANSMISSION');
    const txLabel = el('div', { class: 'go-tx-lbl' }, el('span', { class: 'go-tx-pip' }), this.goTxLbl);

    // signal-feed frame: the real captured frame (go-gif-img, set per run) under a scanline
    // overlay + the themed signal badge + an idle waveform.
    const sharePreview = el('span', { class: 'go-gif go-tx-frame', 'aria-hidden': 'true' });
    sharePreview.innerHTML = GO_GIF_HTML;
    this.goGifImg = el('img', { class: 'go-gif-img', alt: '' }) as HTMLImageElement;
    sharePreview.querySelector('.go-gif-glow')?.after(this.goGifImg);
    this.goTxBadge = el('span', { class: 'go-tx-badge' }, '● SIGNAL LOST');
    const txWave = el('span', { class: 'go-tx-wave' }, ...Array.from({ length: 5 }, () => el('i')));
    sharePreview.append(el('span', { class: 'go-tx-scan' }), this.goTxBadge, txWave);

    this.goTxStrip = el('div', { class: 'go-tx-strip' });

    // primary CTA → opens the existing SHARE modal (unchanged share flow).
    this.saveReplayBtn = el('button', { class: 'go-tx-cta' }) as HTMLButtonElement;
    this.goTxCtaTxt = el('span', {}, 'SEND THE ECHO');
    this.saveReplayBtn.innerHTML = TX_GLYPH;
    this.saveReplayBtn.append(this.goTxCtaTxt);
    this.saveReplayBtn.addEventListener('click', () => this.cb.onSaveReplay());

    this.goTxRally = el('div', { class: 'go-tx-rally' }, 'show them it can be held →');

    const copy = el('button', { class: 'go-tx-chip' }, '⧉ COPY SCORE');
    copy.addEventListener('click', () => this.cb.onCopyScore());
    const dna = el('button', { class: 'go-tx-chip' }, '⧬ COPY BUILD');
    dna.addEventListener('click', () => this.cb.onCopyBuildDna());

    const sharePanel = el(
      'div',
      { class: 'go-share-panel' },
      txLabel,
      sharePreview,
      this.goTxStrip,
      this.saveReplayBtn,
      this.goTxRally,
      el('div', { class: 'go-tx-chips' }, copy, dna),
    );
```

(This removes the `duel` button + its `onCreateChallenge` listener, the old `go-panel-lbl`, the `go-share-btns` rows, and the `go-share-note`. `this.cb.onCreateChallenge` stays defined on the callback interface — just unused here.)

- [ ] **Step 6: Wire the per-run content in showGameOver**

In `showGameOver`, immediately AFTER the existing grade line (`const grade = !info.won ? '—' : flawless ? 'S' : info.newBest ? 'A' : 'B';`, ~line 4125), add:

```ts
    // LAST TRANSMISSION console — themed strings + stat strip from the pure view-model.
    const sv = shareBlockView({
      won: info.won, seed: info.seed, daily: info.daily, time: info.time,
      wave: info.wave, score: info.score, clearTime: info.clearTime, grade,
    });
    this.goTxLbl.textContent = sv.label;
    this.goTxBadge.textContent = sv.badge;
    this.goTxCtaTxt.textContent = sv.cta;
    this.goTxRally.textContent = sv.rally;
    this.goTxStrip.replaceChildren(
      ...sv.stats.map((c) =>
        el('div', { class: 'go-tx-cell' }, el('div', { class: 'go-tx-k' }, c.k), el('div', { class: 'go-tx-v' }, c.v)),
      ),
    );
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (If tsc flags an unused `onCreateChallenge` — it won't; unused interface members are allowed. If it flags the removed local `duel`/`copy` names elsewhere, ensure no stale references remain.)

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(lancefall): rebuild the game-over share panel as the LAST TRANSMISSION console"
```

(Stage only the share-block hunks in `src/ui.ts` — see Global Constraints. `git diff src/ui.ts`, apply only this task's hunks to the index.)

---

### Task 4: Transmission console styles + mirrored solstice gradient (style.css)

**Files:**
- Modify: `src/style.css` — add a `.go-tx-*` block near the existing `.go-gif*` / `.go-share-panel` rules (~line 5338+), and add the new classes to the existing `.reduce-motion` game-over rule (~line 5500).

**Interfaces:**
- Consumes: the DOM classes from Task 3 (`go-tx-lbl`, `go-tx-pip`, `go-tx-frame`, `go-tx-scan`, `go-tx-badge`, `go-tx-wave`, `go-tx-strip`, `go-tx-cell`, `go-tx-k`, `go-tx-v`, `go-tx-cta`, `go-tx-rally`, `go-tx-chips`, `go-tx-chip`) + the existing `.go-won`/`.go-lost` on `.go-frame`/`goScreenInner`.
- Produces: the visual treatment (verified in Task 5).

- [ ] **Step 1: Add the transmission styles**

Append after the existing `.go-gif-dot { ... }` rule (~line 5343) in `src/style.css`:

```css
/* ── LAST TRANSMISSION console — theme-aware share/invite block ────────────────── */
.go-share-panel {
  position: relative; border-radius: 14px; overflow: hidden; padding: 15px 15px 16px;
  border: 1px solid rgba(255, 255, 255, 0.09); box-shadow: 0 16px 50px rgba(0, 0, 0, 0.5);
}
/* mirrored solstice gradient: defeat climbs cold→warm (bottom), victory falls bright→dark */
.go-lost .go-share-panel {
  background: linear-gradient(180deg, rgba(179,155,255,0.16) 0%, rgba(12,14,28,0.55) 38%,
    rgba(60,40,30,0.4) 74%, rgba(255,178,74,0.16) 100%), #0a0d1a;
}
.go-won .go-share-panel {
  background: linear-gradient(180deg, rgba(255,216,132,0.30) 0%, rgba(150,100,50,0.34) 28%,
    rgba(22,18,16,0.55) 66%, rgba(9,8,15,0.72) 100%), #0d0a12;
}
.go-share-panel::after { content: ''; position: absolute; left: 0; right: 0; height: 50%; pointer-events: none; }
.go-lost .go-share-panel::after { bottom: 0; background: radial-gradient(120% 80% at 50% 120%, rgba(255,200,120,0.22), transparent 70%); }
.go-won .go-share-panel::after { top: 0; background: radial-gradient(120% 85% at 50% -22%, rgba(255,224,150,0.30), transparent 72%); }

.go-tx-lbl { position: relative; display: flex; align-items: center; gap: 7px; margin-bottom: 11px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.24em; }
.go-lost .go-tx-lbl { color: #a99cf0; } .go-won .go-tx-lbl { color: #ffd07a; }
.go-tx-pip { width: 6px; height: 6px; border-radius: 50%; }
.go-lost .go-tx-pip { background: #b39bff; box-shadow: 0 0 8px #b39bff; }
.go-won .go-tx-pip { background: #ffd884; box-shadow: 0 0 8px #ffd884; }

/* the signal-feed frame reuses .go-gif / .go-gif-img; these add the console overlays */
.go-tx-frame { position: relative; }
.go-tx-scan { position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(91,234,255,0.06) 0 2px, transparent 2px 4px); }
.go-won .go-tx-scan { background: repeating-linear-gradient(0deg, rgba(255,210,140,0.07) 0 2px, transparent 2px 4px); }
.go-tx-badge { position: absolute; top: 8px; left: 8px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
  letter-spacing: 0.1em; padding: 3px 9px; border-radius: 20px; background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.14); color: #8fd9ee; }
.go-won .go-tx-badge { color: #ffe1a8; }
.go-tx-wave { position: absolute; right: 9px; bottom: 9px; display: flex; gap: 3px; align-items: flex-end; height: 22px; }
.go-tx-wave i { width: 3px; height: 40%; background: #5beaff; box-shadow: 0 0 6px #5beaff; animation: goTxWave 1.1s ease-in-out infinite; }
.go-tx-wave i:nth-child(2) { height: 78%; animation-delay: 0.12s; }
.go-tx-wave i:nth-child(3) { height: 55%; animation-delay: 0.24s; }
.go-tx-wave i:nth-child(4) { height: 95%; animation-delay: 0.36s; }
.go-tx-wave i:nth-child(5) { height: 32%; animation-delay: 0.48s; }
.go-won .go-tx-wave i { background: #ffd884; box-shadow: 0 0 6px #ffd884; }
@keyframes goTxWave { 0%,100% { transform: scaleY(0.7); } 50% { transform: scaleY(1.15); } }

.go-tx-strip { position: relative; display: flex; margin-top: 12px; border: 1px solid rgba(255,255,255,0.11);
  border-radius: 9px; overflow: hidden; background: rgba(10,14,26,0.5); }
.go-won .go-tx-strip { background: rgba(26,18,10,0.55); }
.go-tx-cell { flex: 1; text-align: center; padding: 8px 4px; }
.go-tx-cell + .go-tx-cell { border-left: 1px solid rgba(255,255,255,0.08); }
.go-tx-k { font-family: 'JetBrains Mono', monospace; font-size: 8px; letter-spacing: 0.16em; color: #7b80a0; }
.go-tx-v { font-family: 'JetBrains Mono', monospace; font-size: 14px; margin-top: 3px; color: #bfe9ff; }
.go-won .go-tx-v { color: #ffe1a8; }

.go-tx-cta { position: relative; display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%;
  border: none; border-radius: 10px; padding: 12px; margin-top: 13px; cursor: pointer;
  font-family: 'Orbitron', sans-serif; font-weight: 800; font-size: 13px; letter-spacing: 0.07em;
  background: linear-gradient(180deg, #ffe9b0, #f0b24a); color: #231803; box-shadow: 0 8px 22px rgba(240,178,74,0.34); }
.go-tx-cta svg { width: 16px; height: 16px; }
.go-tx-cta:hover { filter: brightness(1.06); }
.go-tx-cta:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

.go-tx-rally { position: relative; text-align: center; font-size: 13px; font-style: italic; margin-top: 10px; color: #f3d9a4; }

.go-tx-chips { position: relative; display: flex; gap: 9px; justify-content: center; margin-top: 12px; }
.go-tx-chip { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; cursor: pointer;
  padding: 6px 11px; border-radius: 8px; color: #d8b878; border: 1px solid rgba(255,216,132,0.26);
  background: rgba(255,216,132,0.05); }
.go-tx-chip:hover { background: rgba(255,216,132,0.12); }
.go-tx-chip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
```

- [ ] **Step 2: Gate the waveform under reduce-motion**

Add `.go-tx-wave i` to the existing reduce-motion `animation: none` group (the rule listing `.reduce-motion .go-gif-shimmer, .reduce-motion .go-gif-dot, ...`, ~line 5500). Insert a line into that selector list:

```css
.reduce-motion .go-tx-wave i,
```

(Place it alongside `.reduce-motion .go-gif-dot,` so it shares the `animation: none !important;` block. Under reduce-motion the bars rest at their CSS heights — static EQ, no motion.)

- [ ] **Step 3: Build to confirm CSS parses**

Run: `npx vite build`
Expected: `✓ built` with no CSS errors (the 500 kB chunk warning is pre-existing and fine).

- [ ] **Step 4: Commit**

```bash
git commit -m "style(lancefall): LAST TRANSMISSION console + mirrored solstice gradient"
```

(Stage only the share-block CSS hunks in `src/style.css` — see Global Constraints.)

---

### Task 5: Verify both outcomes + full regression

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite + types**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all tests pass (existing count + 4 new from Task 1); tsc clean.

- [ ] **Step 2: Drive the real game-over screen (dev)**

Start the dev server (`.claude/launch.json` → `lancefall`, port 5197) via the preview tooling, resize the viewport to ~900×820 (else the canvas collapses), then in the page (rAF is throttled headless — drive frames manually):

```js
(() => {
  const g = window.__lf;
  const out = {};
  for (const won of [false, true]) {
    g.start(g.mode); g.world.player.iframe = 999;
    let t = performance.now(); for (let i=0;i<30;i++){ t+=16.7; g.frame(t); g.replay.capture(); }
    g.finishGameOver(won);
    out[won ? 'win' : 'defeat'] = {
      label: document.querySelector('.go-tx-lbl span:last-child')?.textContent,
      badge: document.querySelector('.go-tx-badge')?.textContent,
      cta: document.querySelector('.go-tx-cta')?.textContent?.trim(),
      rally: document.querySelector('.go-tx-rally')?.textContent,
      stats: [...document.querySelectorAll('.go-tx-cell')].map(c => c.querySelector('.go-tx-k')?.textContent + ':' + c.querySelector('.go-tx-v')?.textContent),
      hasGlyph: !!document.querySelector('.go-tx-cta svg'),
      duelGone: !document.querySelector('.go-share-panel button')?.textContent?.includes('DUEL') && ![...document.querySelectorAll('.go-share-panel button')].some(b => /DUEL/.test(b.textContent)),
      themeClass: document.querySelector('.go-frame')?.className.match(/go-(won|lost)/)?.[0],
    };
  }
  return out;
})()
```

Expected: `defeat` → label `LAST TRANSMISSION`, cta `SEND THE ECHO`, rally `show them it can be held →`, stats `HELD/WAVE/SCORE`, theme `go-lost`; `win` → label `SIGNAL RESTORED`, cta `SEND THE DAWN`, stats `CLEARED/GRADE/SCORE`, theme `go-won`; both `hasGlyph: true`, `duelGone: true`.

- [ ] **Step 3: Confirm the actions still fire**

In the page, click the CTA and the chips (or call the callbacks) and confirm: the SHARE modal opens (CTA), and COPY SCORE / COPY BUILD trigger their toasts. Confirm the no-frame fallback: `g.start(g.mode); g.replay.frames = []; g.finishGameOver(false);` → the frame shows the gradient placeholder (`.go-gif-img` not `.shown`), badge/strip/CTA still render.

- [ ] **Step 4: Prod-boot smoke**

Start the minified preview (`.claude/launch.json` → `lancefall-prod`, port 4350) after `npx vite build`; confirm the page boots with no fatal overlay and the title renders (the `__lf` hook is DEV-only and absent here — boot-clean is the check).

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git commit -m "fix(lancefall): share-block verification fixups"
```

(Only if Steps 2–4 surfaced adjustments; otherwise nothing to commit.)

---

## Self-Review

**Spec coverage:** theme-aware voice (Task 1 view-model + Task 3 wiring) ✓; mirrored solstice gradient (Task 4) ✓; LAST TRANSMISSION frame/badge/waveform (Tasks 3–4) ✓; stat strip HELD/WAVE/SCORE vs CLEARED/GRADE/SCORE (Task 1) ✓; SEND THE ECHO/DAWN + rally copy (Task 1, verbatim) ✓; SVG broadcast glyph (Task 3) ✓; DUEL button removed, duel system kept (Task 3) ✓; `seed` field (Task 2) ✓; no-frame fallback + reduce-motion + choicePending-as-win (Task 4 CSS via `.go-won`, Task 5 verify) ✓; testing via dev hook + suite + prod boot (Task 5) ✓.

**Placeholder scan:** every code step contains complete code; commands have expected output; no TBD/TODO. ✓

**Type consistency:** `shareBlockView`/`ShareBlockInput`/`ShareBlockView`/`ShareStatCell` names match between Task 1 (def) and Task 3 (use); field names (`label`/`pip`/`badge`/`cta`/`rally`/`stats`/`k`/`v`) consistent; `GameOverInfo.seed` defined in Task 2, consumed in Task 3; DOM class names match between Task 3 (build) and Task 4 (CSS). ✓
