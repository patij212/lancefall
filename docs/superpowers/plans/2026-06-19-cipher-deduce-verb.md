# THE DEDUCE-VERB + Solstice-as-Main — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate LANCEFALL's shipped "read the key" cipher into a true *read-AND-deduce* verb via four escalating cipher **classes** (Caesar crib → full substitution → partial/earned key → Enigma rotor), and make SOLSTICE PROTOCOL the game's primary mode — without adding one bullet, one second of timing pressure, or one `world.rng` draw.

**Architecture:** The four classes are **pure VIEW policies over an unchanged `CipherState`**. `makeCipher` gains a `cls` tag; the reducer (`dashCipherCore`) and the seeded glyph/order generation stay **byte-for-byte identical**, so determinism and the Daily are trivially preserved. `cipherDecode.ts` (already pure, already the read-only decode view) grows per-class branches: how much of the key is legible (`revealed[]`), what mark each core wears (`coreSymbolForSlot` — Greek glyphs, or shifted *letters* for Caesar), and a `rotorOffset` the player accounts for. The HUD (`ui.ts` `cipherEl`) and the per-core symbol (`render.ts`) read the extended view. The boss→class mapping is pure data wired at the two existing cipher-arm sites (`bosses/sovereign.ts`). Solstice becomes the lead rail card.

**Tech Stack:** Vite + vanilla TypeScript, Canvas 2D, Web Audio, Vitest. No new dependencies.

## Global Constraints

These are copied from the spec (`docs/superpowers/specs/2026-06-19-cipher-solstice-design.md`) and apply to **every** task:

- **DEPTH, NOT DIFFICULTY.** No task may add bullets, shrink timing windows, or raise damage. The cipher is a *reasoning* layer over the *same* fight. In-combat cryptography is always **forgiving** (a wrong dash keeps progress — never reset, never punished — this is already true in `dashCipherCore` and must stay true) and **glanceable** (the key/crib/rotor-offset is always on the HUD; no memory tax). The Casual `cipherAssist` next-core ring stays, so the deduce-layer is **opt-in depth**.
- **DETERMINISM IS SACRED.** The combat cipher draws **ZERO `world.rng`**. It seeds from `world.seed` (read, never drawn) via `cipherSeed(...)` + a LOCAL `createRng`. Every new per-class parameter derives purely from existing `CipherState` data (`seed`, `glyphs`, `order`, `progress`) — never from `world.rng`, never from `Math.random`/`Date.now`. A single new `world.rng` draw in a seeded path is a **release-blocking bug**. Run `src/determinism.test.ts` + `src/cipher.test.ts` + `src/cipherDecode.test.ts` + `src/cipherIntegration.test.ts` after every task.
- **THE REDUCER IS FROZEN.** `dashCipherCore(c, slot)` and the `glyphs`/`order` generation in `makeCipher` do not change behaviour. All four classes differ ONLY in (a) the `cls` tag and (b) the decode VIEW. `order` (the correct core sequence) is fixed for the whole fight; nothing mutates it per step.
- **DON'T GROW THE GOD-FILES.** `ui.ts` (~4250), `render.ts` (~2500), `skins.ts` (~5048), `game.ts` (~3040). New logic lives in the pure modules (`cipher.ts`, `cipherDecode.ts`); the `ui.ts`/`render.ts` edits are **minimal additive reads** of the pure view (a few lines each), not new systems.
- **SHARED-TREE STAGING.** `ui.ts`, `render.ts`, and `style.css` may be live-edited by a concurrent card-agent. NEVER `git add -A`. Stage ONLY the files this plan changed, by explicit path (`git add src/cipher.ts src/cipher.test.ts …`). If a shared file has other agents' hunks, stage just yours with a content-filtered `git apply --cached` from the repo root (see the `lancefall-shared-tree-staging` memory).
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Branch:** all work on `v6` (the active dev branch).
- **Verify cadence:** `npx tsc --noEmit` clean + `npx vitest run` green (1101+ today) after each task; a production `npx vite build` boot-smoke before the final commit.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/cipher.ts` | Pure reducer + seeded generation. | **+** `CipherClass`, `cls`/`seed` on `CipherState`, `makeCipher` `cls` param, `cipherClassFor()`. Generation + reducer unchanged. |
| `src/cipherDecode.ts` | Pure read-only decode view. | **+** `revealed[]`/`rotorOffset`/`cls` on `DecodeView`; per-class branches; `caesarShift`/`caesarShiftLetter`/`rotateSymbol`/`partialRevealed`/`coreSymbolForSlot`. |
| `src/bosses/sovereign.ts` | The two cipher-arm helpers. | **~** two one-line `makeCipher(...)` calls gain `cipherClassFor(boss.kind)`. |
| `src/render.ts` | Per-core symbol draw (`:1629`). | **~** `cipherSymbol(glyph)` → `coreSymbolForSlot(cipher, slot)` (+ import). |
| `src/ui.ts` | `cipherEl` HUD (`:3794`). | **~** gate key pairs on `v.revealed[i]`; add a rotor-offset line. Minimal additive. |
| `src/modes.ts` | Mode data + rail. | **~** Solstice → lead rail card + always-unlocked + story copy. |
| `*.test.ts` (5 files) | Pure unit + integration + determinism. | **+** per-class decode tests, class-tag tests, mode-default test. |

---

### Task 1: `CipherClass` — tag the state, map bosses to classes

**Files:**
- Modify: `src/cipher.ts`
- Test: `src/cipher.test.ts`

**Interfaces:**
- Produces: `type CipherClass = 'caesar' | 'substitution' | 'partial' | 'rotor'`; `CipherState` gains `cls: CipherClass` + `seed: number`; `makeCipher(n: number, seed: number, cls?: CipherClass): CipherState` (default `'substitution'`); `cipherClassFor(bossKind: string): CipherClass`.

- [ ] **Step 1: Write the failing test** — append to `src/cipher.test.ts` (inside the existing `describe`, or a new one):

```ts
import { cipherSeed, makeCipher, dashCipherCore, ciphertext, cipherClassFor } from './cipher';

describe('cipher classes — the deduce-verb tagging', () => {
  it('makeCipher defaults to substitution and records its seed (additive, non-breaking)', () => {
    const seed = cipherSeed(123, 4);
    const c = makeCipher(4, seed);
    expect(c.cls).toBe('substitution');
    expect(c.seed).toBe(seed >>> 0);
  });

  it('makeCipher carries the requested class; generation is unchanged by it', () => {
    const seed = cipherSeed(123, 4);
    const sub = makeCipher(4, seed, 'substitution');
    const rot = makeCipher(4, seed, 'rotor');
    expect(rot.cls).toBe('rotor');
    // the SAME seed yields the SAME glyph/order permutations regardless of class —
    // the class is a VIEW tag only, so the seeded sim can never diverge by class.
    expect(rot.order).toEqual(sub.order);
    expect(rot.glyphs).toEqual(sub.glyphs);
  });

  it('cipherClassFor maps each ring boss to its escalating class', () => {
    expect(cipherClassFor('warden')).toBe('caesar');
    expect(cipherClassFor('weaver')).toBe('substitution');
    expect(cipherClassFor('beacon')).toBe('partial');
    expect(cipherClassFor('sovereign')).toBe('rotor');
    expect(cipherClassFor('darter')).toBe('substitution'); // unknown → plain key
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipher.test.ts`
Expected: FAIL — `cipherClassFor` is not exported / `c.cls` undefined.

- [ ] **Step 3: Implement** — in `src/cipher.ts`, add the type, extend the interface + `makeCipher`, and add the mapping:

```ts
/** Which CLASS of cipher a lock presents. Drives ONLY the decode VIEW (how the key reads) —
 *  never the reducer or the seeded generation, so it can't perturb the sim. An ode to the
 *  history of cryptanalysis: a Caesar crib, a full substitution, a partial/earned key, a rotor. */
export type CipherClass = 'caesar' | 'substitution' | 'partial' | 'rotor';

export interface CipherState {
  /** glyph id shown on the core at orbit-slot i (a permutation of 0..n-1) */
  glyphs: number[];
  /** the required dash order, as orbit-slot indices (a permutation of 0..n-1) */
  order: number[];
  /** correct dashes so far (0..order.length) */
  progress: number;
  /** cosmetic: 1 right after a wrong dash, decays in render — never gates sim */
  wrongFlash: number;
  solved: boolean;
  /** which cipher class this lock is (VIEW-only; default 'substitution' = legacy behaviour) */
  cls: CipherClass;
  /** the seed this cipher was built from — per-class view params derive from it, purely */
  seed: number;
}
```

Update `makeCipher` (keep the existing generators — only add the two fields + the param):

```ts
export function makeCipher(n: number, seed: number, cls: CipherClass = 'substitution'): CipherState {
  return {
    glyphs: shuffle(n, createRng((seed ^ 0xa5a5a5a5) >>> 0)),
    order: shuffle(n, createRng(seed >>> 0)),
    progress: 0,
    wrongFlash: 0,
    solved: false,
    cls,
    seed: seed >>> 0,
  };
}
```

Add at the end of the file:

```ts
/** The cipher CLASS a boss presents (pure data). Warden teaches the crib (Caesar), Weaver the
 *  full substitution, Beacon the partial/earned key, the Sovereign the stepping rotor. Anything
 *  else falls to the plain substitution key. VIEW-only — never read by the sim/reducer. */
export function cipherClassFor(bossKind: string): CipherClass {
  switch (bossKind) {
    case 'warden': return 'caesar';
    case 'weaver': return 'substitution';
    case 'beacon': return 'partial';
    case 'sovereign': return 'rotor';
    default: return 'substitution';
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipher.test.ts src/cipherDecode.test.ts src/cipherIntegration.test.ts src/determinism.test.ts`
Expected: PASS (existing tests unaffected — the new fields are additive; the decode view already only reads `glyphs`/`order`).

- [ ] **Step 5: Commit**

```bash
git add src/cipher.ts src/cipher.test.ts
git commit -m "$(printf 'feat(lancefall): cipher CLASS tag + cipherClassFor (deduce-verb foundation)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Extend `DecodeView`; substitution stays the baseline

**Files:**
- Modify: `src/cipherDecode.ts`
- Test: `src/cipherDecode.test.ts`

**Interfaces:**
- Consumes: `CipherState` (with `cls`/`seed` from Task 1).
- Produces: `DecodeView` gains `revealed: boolean[]`, `rotorOffset: number`, `cls: CipherClass`. `decodeView(c)` returns, for `cls==='substitution'`, today's full key with `revealed` all-true and `rotorOffset` 0.

- [ ] **Step 1: Write the failing test** — append to `src/cipherDecode.test.ts`:

```ts
import { makeCipher, cipherSeed } from './cipher';
import { decodeView } from './cipherDecode';

describe('decodeView — extended, class-aware shape', () => {
  it('substitution is unchanged: full key, all revealed, no rotor', () => {
    const c = makeCipher(5, cipherSeed(20260621, 97), 'substitution');
    const v = decodeView(c);
    expect(v.cls).toBe('substitution');
    expect(v.rotorOffset).toBe(0);
    expect(v.revealed).toEqual([true, true, true, true, true]);
    // the legacy solve property still holds (read the full key in order → solve)
    expect(v.key.length).toBe(5);
    expect(new Set(v.symbolForSlot).size).toBe(5);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipherDecode.test.ts`
Expected: FAIL — `v.revealed`/`v.rotorOffset`/`v.cls` undefined.

- [ ] **Step 3: Implement** — in `src/cipherDecode.ts`, extend the interface and rewrite `decodeView` to branch (substitution path identical to today, plus the new fields). Replace the `DecodeView` interface and `decodeView` function:

```ts
import type { CipherClass, CipherState } from './cipher';

export interface DecodeView {
  /** the plaintext letters, in required dash order (the message being decoded) */
  plaintext: string[];
  /** the mark displayed on the core at each orbit slot (index = slot) */
  symbolForSlot: string[];
  /** the substitution key, in dash order: plaintext letter ↔ its (displayed) cipher mark */
  key: { plain: string; cipher: string }[];
  /** per step: is this key pair legible on the HUD? false = the player must deduce it */
  revealed: boolean[];
  /** the rotor step the player must account for (0 for non-rotor classes) */
  rotorOffset: number;
  /** the cipher class (so the HUD picks the right chrome) */
  cls: CipherClass;
  /** how many letters are decoded so far (= cipher.progress) */
  progress: number;
  /** true once fully decoded */
  solved: boolean;
}

/** Build the read-only, class-aware decode view for a cipher (pure; zero rng). */
export function decodeView(c: CipherState): DecodeView {
  const n = c.order.length;
  const word = plaintextFor(n);
  const plaintext = Array.from({ length: n }, (_, i) => word[i] ?? '?');
  // the mark each core wears (Greek glyph, or a shifted LETTER for Caesar — see coreSymbolForSlot)
  const symbolForSlot = Array.from({ length: n }, (_, slot) => coreSymbolForSlot(c, slot));
  const off = c.cls === 'rotor' ? rotorOffset(c) : 0;
  // the key, in dash order; the rotor shows each true mark rotated by the current offset
  const key = c.order.map((slot, i) => ({
    plain: plaintext[i],
    cipher: c.cls === 'rotor' ? rotateSymbol(symbolForSlot[slot], off) : symbolForSlot[slot],
  }));
  const revealed = revealPolicy(c);
  return { plaintext, symbolForSlot, key, revealed, rotorOffset: off, cls: c.cls, progress: c.progress, solved: c.solved };
}

/** Per-class key visibility. Substitution/rotor reveal the full key (the rotor's challenge is the
 *  rotation, not hiding); Caesar reveals only the crib; partial reveals a seeded ~half. */
function revealPolicy(c: CipherState): boolean[] {
  const n = c.order.length;
  if (c.cls === 'caesar') return Array.from({ length: n }, (_, i) => i === 0);
  if (c.cls === 'partial') return partialRevealed(c);
  return Array.from({ length: n }, () => true);
}
```

> Caesar/partial/rotor helpers (`coreSymbolForSlot`, `caesarShift`, `rotateSymbol`, `partialRevealed`, `rotorOffset`) are added in Tasks 3–5. To compile NOW, add minimal stubs at the bottom of the file that make substitution correct and the others fall back to today's behaviour:

```ts
/** The mark a core wears, given its orbit slot. Default: the Greek cipher symbol (substitution /
 *  partial / rotor). Caesar overrides this with a shifted LETTER in Task 3. */
export function coreSymbolForSlot(c: CipherState, slot: number): string {
  return cipherSymbol(c.glyphs[slot]);
}

/** The rotor step to account for. 0 until Task 5 makes it step with progress. */
export function rotorOffset(_c: CipherState): number {
  return 0;
}

/** Rotate a Greek cipher mark by k positions within the alphabet (identity until Task 5). */
export function rotateSymbol(sym: string, _k: number): string {
  return sym;
}

/** Which key pairs are legible for a partial cipher (all true until Task 4). */
export function partialRevealed(c: CipherState): boolean[] {
  return Array.from({ length: c.order.length }, () => true);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipherDecode.test.ts`
Expected: PASS — both the legacy "reading the key solves it" test and the new shape test pass (substitution branch is behaviourally identical to before).

- [ ] **Step 5: Commit**

```bash
git add src/cipherDecode.ts src/cipherDecode.test.ts
git commit -m "$(printf 'feat(lancefall): extend DecodeView (revealed/rotorOffset/cls); substitution baseline\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Caesar — the crib (Warden)

**Files:**
- Modify: `src/cipherDecode.ts`
- Test: `src/cipherDecode.test.ts`

**Interfaces:**
- Produces: real `coreSymbolForSlot` (shifted letters for Caesar) + `caesarShift(c): number` + `caesarShiftLetter(letter, k): string`. The cores wear the plaintext letters shifted by a constant `k`; only the crib (pair 0) is revealed; deriving `k` from the crib and shifting each known plaintext letter reproduces the solution.

- [ ] **Step 1: Write the failing test** — append to `src/cipherDecode.test.ts`:

```ts
import { dashCipherCore } from './cipher';
import { caesarShift, caesarShiftLetter } from './cipherDecode';

describe('decodeView — Caesar (the crib)', () => {
  it('cores wear shifted LETTERS; only the crib pair is revealed', () => {
    const c = makeCipher(5, cipherSeed(7, 5), 'caesar'); // n=5 → plaintext LIGHT
    const v = decodeView(c);
    expect(v.cls).toBe('caesar');
    expect(v.revealed.filter(Boolean).length).toBe(1); // just the crib
    expect(v.revealed[0]).toBe(true);
    expect(new Set(v.symbolForSlot).size).toBe(5); // distinct shifted letters
    expect(v.symbolForSlot.every((s) => /^[A-Z]$/.test(s))).toBe(true);
  });

  it('deducing k from the crib, then shifting each letter, solves the cipher', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [5, 999]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 13), 'caesar');
      const v = decodeView(c);
      // a player derives k from the one revealed pair (plain[0] → its shifted letter)…
      const crib = v.key[0];
      const k = (crib.cipher.charCodeAt(0) - crib.plain.charCodeAt(0) + 26) % 26;
      // …then for each plaintext letter computes its shifted mark and finds that core.
      for (let step = 0; step < n; step++) {
        const mark = caesarShiftLetter(v.plaintext[step], k);
        const slot = v.symbolForSlot.indexOf(mark);
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true);
      }
      expect(c.solved).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipherDecode.test.ts`
Expected: FAIL — `caesarShift`/`caesarShiftLetter` not exported; cores still show Greek.

- [ ] **Step 3: Implement** — in `src/cipherDecode.ts`, replace the `coreSymbolForSlot` stub from Task 2 and add the two helpers:

```ts
/** The Caesar shift for this cipher, in 1..25 (never 0 — a 0-shift would be no cipher). Derived
 *  purely from the seed, so it's stable + Daily-shared. */
export function caesarShift(c: CipherState): number {
  return 1 + (c.seed % 25);
}

/** Shift an A–Z letter forward by k (mod 26). The plaintext words are unique-lettered, so the
 *  shift is a clean bijection → the cores wear distinct letters. */
export function caesarShiftLetter(letter: string, k: number): string {
  const code = letter.charCodeAt(0) - 65;
  if (code < 0 || code > 25) return letter; // non-letter (e.g. the '?' fallback) passes through
  return String.fromCharCode(65 + ((code + k) % 26));
}

/** The mark a core wears, given its orbit slot. Caesar shows the SHIFTED LETTER of that core's
 *  decode step; all other classes show the Greek cipher symbol. */
export function coreSymbolForSlot(c: CipherState, slot: number): string {
  if (c.cls === 'caesar') {
    const step = c.order.indexOf(slot);
    const word = plaintextFor(c.order.length);
    const letter = word[step] ?? '?';
    return caesarShiftLetter(letter, caesarShift(c));
  }
  return cipherSymbol(c.glyphs[slot]);
}
```

(Delete the placeholder `coreSymbolForSlot` stub added in Task 2 — this replaces it.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipherDecode.test.ts src/cipher.test.ts src/determinism.test.ts`
Expected: PASS — Caesar solves via the crib; substitution/integration unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/cipherDecode.ts src/cipherDecode.test.ts
git commit -m "$(printf 'feat(lancefall): Caesar cipher class — shifted-letter cores + crib reveal (Warden)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Partial — the earned key (Beacon)

**Files:**
- Modify: `src/cipherDecode.ts`
- Test: `src/cipherDecode.test.ts`

**Interfaces:**
- Produces: real `partialRevealed(c): boolean[]` — a seeded contiguous ~half of the key is legible, ALWAYS including the current step (so the next move is never unfair); revealed entries equal the true key; reading the revealed pairs (and reaching hidden cores by forgiving trial) solves it.

- [ ] **Step 1: Write the failing test** — append to `src/cipherDecode.test.ts`:

```ts
describe('decodeView — partial (the earned key)', () => {
  it('reveals ~half the key, ALWAYS including the current step (fair next move)', () => {
    const c = makeCipher(6, cipherSeed(3, 6), 'partial');
    const v = decodeView(c);
    expect(v.cls).toBe('partial');
    expect(v.revealed.filter(Boolean).length).toBeGreaterThanOrEqual(3); // >= ceil(6/2)
    expect(v.revealed[v.progress]).toBe(true); // the next step is legible
  });

  it('revealed pairs are the TRUE key, and decoding still solves under fire', () => {
    const c = makeCipher(6, cipherSeed(20260621, 6), 'partial');
    // the true substitution key (what a fully-revealed view would show) for cross-check
    const truth = decodeView({ ...c, cls: 'substitution' }).key;
    for (let step = 0; step < 6; step++) {
      const v = decodeView(c); // re-read each step (reveal of the current step tracks progress)
      expect(v.revealed[step]).toBe(true);
      expect(v.key[step].cipher).toBe(truth[step].cipher); // a revealed pair is never a lie
      const slot = v.symbolForSlot.indexOf(v.key[step].cipher);
      const r = dashCipherCore(c, slot);
      expect(r === 'progress' || r === 'solved').toBe(true);
    }
    expect(c.solved).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipherDecode.test.ts`
Expected: FAIL — the stub `partialRevealed` reveals all (the `>= ceil(n/2)` passes but the "always includes current step" intent isn't enforced; the count assertion may pass trivially, so the failing signal is the next test's `revealed` shape once we tighten — write the real impl regardless).

> Note: the stub returns all-true, which would pass the assertions above. To make this a real RED, first tighten the stub-replacement test by asserting **not** all are revealed:

```ts
  it('does NOT reveal the whole key (it is partial)', () => {
    const c = makeCipher(6, cipherSeed(3, 6), 'partial');
    expect(decodeView(c).revealed.some((r) => r === false)).toBe(true);
  });
```

Run again: FAIL (stub reveals all).

- [ ] **Step 3: Implement** — in `src/cipherDecode.ts`, replace the `partialRevealed` stub:

```ts
/** Beacon's partial key: a seeded contiguous window (~half the legend) is legible, and the
 *  CURRENT step is always legible so the next move is never unfair. The rest you route to by
 *  forgiving trial (or the fight reveals more — beam passes / a spent charge, wired in game.ts
 *  in Plan 2). Pure + seeded; reveals shrink the read without ever blocking it. */
export function partialRevealed(c: CipherState): boolean[] {
  const n = c.order.length;
  const out = Array.from({ length: n }, () => false);
  const count = Math.ceil(n / 2);
  const start = c.seed % n;
  for (let k = 0; k < count; k++) out[(start + k) % n] = true;
  out[Math.min(c.progress, n - 1)] = true; // the immediate next step is ALWAYS readable
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipherDecode.test.ts src/determinism.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cipherDecode.ts src/cipherDecode.test.ts
git commit -m "$(printf 'feat(lancefall): partial cipher class — seeded half-key, current step always legible (Beacon)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Rotor — the stepping key (Sovereign)

**Files:**
- Modify: `src/cipherDecode.ts`
- Test: `src/cipherDecode.test.ts`

**Interfaces:**
- Produces: real `rotorOffset(c): number` (= `c.progress`) + real `rotateSymbol(sym, k): string` (rotate within `CIPHER_ALPHABET`). The displayed key is the true mark rotated by the current offset; the player un-rotates by the (HUD-shown) offset to find the core. Reproduces the solution end-to-end.

- [ ] **Step 1: Write the failing test** — append to `src/cipherDecode.test.ts`:

```ts
import { rotateSymbol } from './cipherDecode';

describe('decodeView — rotor (the stepping key, Enigma)', () => {
  it('the rotor offset steps with progress; the legend rotates each step', () => {
    const c = makeCipher(5, cipherSeed(11, 5), 'rotor');
    expect(decodeView(c).rotorOffset).toBe(0);
    dashCipherCore(c, c.order[0]); // one correct key (order[0] is always the right first slot)
    expect(decodeView(c).rotorOffset).toBe(1);
  });

  it('accounting for the offset (un-rotating the displayed key) solves it', () => {
    for (const [n, seed] of [[3, 1], [4, 42], [6, 999]] as const) {
      const c = makeCipher(n, cipherSeed(seed, n * 17), 'rotor');
      for (let step = 0; step < n; step++) {
        const v = decodeView(c);
        const off = v.rotorOffset;            // shown on the HUD as a dial
        const displayed = v.key[step].cipher;  // the rotated mark the player reads
        const trueMark = rotateSymbol(displayed, -off); // un-rotate by the offset
        const slot = v.symbolForSlot.indexOf(trueMark);
        const r = dashCipherCore(c, slot);
        expect(r === 'progress' || r === 'solved').toBe(true);
      }
      expect(c.solved).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipherDecode.test.ts`
Expected: FAIL — `rotorOffset` is the stub `0`; `rotateSymbol` is identity, so un-rotation is a no-op and the offset never steps.

- [ ] **Step 3: Implement** — in `src/cipherDecode.ts`, replace the `rotorOffset` and `rotateSymbol` stubs:

```ts
/** The rotor's current step = how many cores you've keyed. The legend rotates by this each
 *  correct dash, so the key can't be memorised — you track the offset (shown on the HUD). */
export function rotorOffset(c: CipherState): number {
  return c.progress;
}

/** Rotate a Greek cipher mark by k positions within CIPHER_ALPHABET (wraps; tolerates negative k
 *  for un-rotating). The rotor scrambles the DISPLAYED key by the offset; the player un-rotates. */
export function rotateSymbol(sym: string, k: number): string {
  const L = CIPHER_ALPHABET.length;
  const idx = CIPHER_ALPHABET.indexOf(sym);
  if (idx < 0) return sym; // not a rotatable mark (defensive)
  return CIPHER_ALPHABET[(((idx + k) % L) + L) % L];
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipherDecode.test.ts src/cipher.test.ts src/cipherIntegration.test.ts src/determinism.test.ts`
Expected: PASS — all four classes now decode end-to-end; the reducer and seeded streams are untouched.

- [ ] **Step 5: Commit**

```bash
git add src/cipherDecode.ts src/cipherDecode.test.ts
git commit -m "$(printf 'feat(lancefall): rotor cipher class — stepping legend, account for the offset (Sovereign/Enigma)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Wire the class at the two arm sites

**Files:**
- Modify: `src/bosses/sovereign.ts`
- Test: `src/cipherIntegration.test.ts`

**Interfaces:**
- Consumes: `cipherClassFor` (Task 1).
- Produces: `world.cipher.cls` matches `cipherClassFor(boss.kind)` after either arm; still ZERO `world.rng`.

- [ ] **Step 1: Write the failing test** — append to `src/cipherIntegration.test.ts`:

```ts
import { cipherClassFor } from './cipher';
import { SOVEREIGN, CIPHER } from './tune';

describe('cipher class wiring — the right class per boss, still rng-free', () => {
  it('a generic ring boss is armed with its boss-kind class (Warden → caesar)', () => {
    const w = new World(createRng(0xfeed));
    w.reset(800, 600);
    w.seed = 12345;
    const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
    boss.kind = 'warden';
    boss.isBoss = true;
    boss.bossWave = 1;
    spawnCipherRing(w, boss, CIPHER.ringCount);
    expect(w.cipher!.cls).toBe(cipherClassFor('warden')); // 'caesar'
  });

  it('the Sovereign arms the rotor class', () => {
    const w = new World(createRng(0xfeed));
    w.reset(800, 600);
    w.seed = 777;
    const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
    boss.kind = 'sovereign';
    boss.bossWave = 6;
    spawnSovereignCores(w, boss);
    expect(w.cipher!.cls).toBe('rotor');
  });
});
```

(`spawnCipherRing`/`spawnSovereignCores` are already imported at the top of this test file.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/cipherIntegration.test.ts`
Expected: FAIL — `w.cipher.cls` is `'substitution'` (the default) for both.

- [ ] **Step 3: Implement** — in `src/bosses/sovereign.ts`, import `cipherClassFor` and pass it at both `makeCipher` calls:

Change the import (line ~7):

```ts
import { cipherSeed, makeCipher, cipherClassFor } from '../cipher';
```

In `spawnSovereignCores` (line ~53):

```ts
  world.cipher = makeCipher(SOVEREIGN.coreCount, cipherSeed(world.seed, boss.bossWave * 97 + world.cipherCycle), cipherClassFor(boss.kind));
  world.cipherCycle++; // each re-lock is a fresh code
```

In `spawnCipherRing` (line ~75):

```ts
  world.cipher = makeCipher(n, cipherSeed(world.seed, boss.bossWave * 97 + world.cipherCycle), cipherClassFor(boss.kind));
  world.cipherCycle++; // each re-lock is a fresh code
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/cipherIntegration.test.ts src/determinism.test.ts`
Expected: PASS — the class is set per boss; the existing "spawnCipherRing draws ZERO world.rng" test still passes (`cipherClassFor` is pure data).

- [ ] **Step 5: Commit**

```bash
git add src/bosses/sovereign.ts src/cipherIntegration.test.ts
git commit -m "$(printf 'feat(lancefall): arm each boss cipher with its escalating class (Warden..Sovereign)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Per-class HUD + core symbol (the thin display layer)

**Files:**
- Modify: `src/render.ts` (`:1629` — per-core symbol)
- Modify: `src/ui.ts` (`:3796–3818` — the `cipherEl` HUD)
- Test: manual (`ui.ts`/`render.ts` have no unit coverage; the pure view tests are the safety net). Verify via `tsc`, the dev hook, and a prod boot-smoke.

**Interfaces:**
- Consumes: `coreSymbolForSlot` (Task 3), `decodeView` extended fields `revealed`/`rotorOffset`/`cls` (Tasks 2–5).
- Produces: cores wear the class-correct mark; the HUD hides unrevealed pairs (shows `?`) and shows a rotor-offset line.

- [ ] **Step 1: render.ts — the per-core mark.** In `src/render.ts`, add `coreSymbolForSlot` to the cipherDecode import (line ~22):

```ts
import { cipherSymbol, coreSymbolForSlot } from './cipherDecode';
```

Then replace the symbol line (`:1629`):

```ts
      const sym = coreSymbolForSlot(cipher, slot);
```

(Everything else in that block stays — `slot`, `keyed`, `isNext` are already computed from `cipher`/`e.phase`.)

- [ ] **Step 2: ui.ts — gate pairs on `revealed` + a rotor line.** In `src/ui.ts`, in the `cipherEl` block (`:3805–3818`), replace the `cipher-key` div so unrevealed pairs render a `?` and a rotor offset shows for the rotor class:

```ts
        el(
          'div',
          { class: 'cipher-key' },
          ...v.key.map((k, i) =>
            el(
              'span',
              { class: 'cipher-pair' + cls(i) + (v.revealed[i] ? '' : ' dim') },
              el('span', { class: 'cipher-plain' }, k.plain),
              el('span', { class: 'cipher-eq' }, '→'),
              el('span', { class: 'cipher-sym' }, v.revealed[i] ? k.cipher : '?'),
            ),
          ),
        ),
        ...(v.cls === 'rotor'
          ? [el('div', { class: 'cipher-label' }, `ROTOR +${v.rotorOffset}`)]
          : []),
```

> The `dim` class is optional polish; `style.css` is card-agent-shared, so do NOT add CSS in this task unless the agent has finished — the `?` glyph alone communicates "deduce this." If you do add a rule, stage only your hunk (content-filtered).

- [ ] **Step 3: tsc + build smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green (the pure decode tests cover the logic; the UI edit is a thin read).

Run a prod boot-smoke:

```bash
npx vite build && npx vite preview --port 4399 &
# load http://localhost:4399 via the project's Playwright smoke or the dev __lf hook; expect 0 console errors
```

- [ ] **Step 4: Verify the read in a dev run.** With `npm run dev`, start a SOLSTICE run (or use the `__lf` dev hook to arm a boss cipher), and confirm at the first boss: Warden cores show LETTERS + only the crib pair is lit (others `?`); Beacon shows ~half the key; the Sovereign shows `ROTOR +n` stepping each keyed core. Confirm a wrong dash still keeps progress (forgiving).

- [ ] **Step 5: Commit (content-filtered — shared files)**

```bash
# stage ONLY this plan's hunks in the shared files; never `git add -A`
git add src/render.ts src/ui.ts
git commit -m "$(printf 'feat(lancefall): per-class cipher HUD — letter cores, partial key, rotor dial\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

> If `git status` shows other agents' hunks in `ui.ts`/`render.ts`, do NOT wholesale-add. Filter your hunks via `git apply --cached` from the repo root (see the `lancefall-shared-tree-staging` memory) and commit just those.

---

### Task 8: SOLSTICE PROTOCOL becomes the main mode

**Files:**
- Modify: `src/modes.ts`
- Test: `src/modes.test.ts`

**Interfaces:**
- Produces: `longestday` is the lead rail card (`RAIL_CARD_IDS[0]`), always unlocked (no `unlockedAtWave` gate), with story-spine copy. The class escalation falls out of the existing boss order (Warden → Weaver → Beacon → … → Sovereign) via `cipherClassFor`.

- [ ] **Step 1: Write the failing test** — append to `src/modes.test.ts` (import what it needs at the top if not present: `RAIL_CARD_IDS`, `modeById`, `modeUnlocked`):

```ts
import { RAIL_CARD_IDS, modeById, modeUnlocked, RAIL_VARIANT_IDS } from './modes';

describe('SOLSTICE PROTOCOL is the main mode', () => {
  it('is the lead rail card (the default landing)', () => {
    expect(RAIL_CARD_IDS[0]).toBe('longestday');
  });

  it('is always unlocked (the campaign spine, not a gated side-mode)', () => {
    expect(modeUnlocked(modeById('longestday'), 0)).toBe(true);
  });

  it('still reaches every built mode from the rail (no mode stranded)', () => {
    for (const id of ['casual', 'endless', 'arena', 'bossrush', 'daily', 'weekly', 'nightmare', 'longestday']) {
      expect(RAIL_VARIANT_IDS).toContain(id);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/modes.test.ts`
Expected: FAIL — `RAIL_CARD_IDS[0]` is `'casual'`; `longestday` has `unlockedAtWave: 8`.

- [ ] **Step 3: Implement** — in `src/modes.ts`:

(a) Remove the `unlockedAtWave: 8` line from the `longestday` config and update its copy to the story spine:

```ts
  {
    id: 'longestday', name: 'SOLSTICE PROTOCOL',
    desc: 'The campaign. Every boss is a cipher — read the key, deduce the code, and bring back the longest day.',
    seedKind: 'random', intensityMul: 1.05, spawnMul: 1, bossInterval: 38, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1.25, perks: true, canFail: true, arena: false, bossrush: false,
    cipherLock: true,
    flavorHead: '◇ SOLSTICE PROTOCOL', flavor: 'The story of the fall, told in cipher.<br>Read each lock, and the day grows longer.',
  },
```

(b) Reorder `RAIL_CARDS` so Solstice leads (move `['longestday']` to the front):

```ts
export const RAIL_CARDS: readonly (readonly string[])[] = [
  ['longestday'],
  ['casual', 'endless'],
  ['arena'],
  ['bossrush'],
  ['daily', 'weekly'],
  ['nightmare'],
];
```

(`RAIL_CARD_IDS` and `RAIL_VARIANT_IDS` derive from `RAIL_CARDS`, so they update automatically.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/modes.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Verify the rail lands on Solstice.** With `npm run dev` and a FRESH save (clear `localStorage`), confirm the title rail opens on SOLSTICE PROTOCOL as the selected card, and that Casual/Endless/Arena/etc. remain reachable by rail nav.

- [ ] **Step 6: Commit**

```bash
git add src/modes.ts src/modes.test.ts
git commit -m "$(printf 'feat(lancefall): SOLSTICE PROTOCOL is the main mode — lead rail card, always unlocked\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Final verification (before handing off / deploying)

- [ ] `npx tsc --noEmit` → clean.
- [ ] `npx vitest run` → green (1101+; +~14 new cipher/mode tests).
- [ ] `npx vitest run src/determinism.test.ts src/cipher.test.ts src/cipherDecode.test.ts src/cipherIntegration.test.ts src/modes.test.ts` → green (the determinism + cipher core, run together).
- [ ] `npx vite build` → succeeds; `npx vite preview` boots with **0 console errors** (the prod path is minified — verify here, not just dev).
- [ ] Manual: a SOLSTICE run reads Warden (crib) → Weaver (full key) → Beacon (partial) → Sovereign (rotor); each is forgiving + glanceable; the Casual assist ring still works as an opt-out of deduction.

## Self-Review (run against the spec)

**Spec coverage:** Piece 1 (deduce-verb, all 4 classes) → Tasks 1–7. Piece 2 (Solstice as main) → Task 8. Pieces 3–5 (intercepts / fragment economy / Bombe console) → **Plan 2** (out of scope here, by the §14 subsystem split). Pieces 6–8 (Mirrorblade / THE CHOICE / FIRST LIGHT) already ship — no code here. ✓

**Determinism:** every class param derives from `CipherState.seed`/`glyphs`/`order`/`progress` (pure); the generation + reducer are frozen; the integration test asserts zero `world.rng`. ✓

**Type consistency:** `CipherClass`, `cls`, `seed`, `cipherClassFor`, `coreSymbolForSlot`, `caesarShift`, `caesarShiftLetter`, `rotateSymbol`, `rotorOffset`, `partialRevealed`, and the `DecodeView` fields (`revealed`/`rotorOffset`/`cls`) are named identically across Tasks 1–8 and their consumers (render.ts/ui.ts). ✓

**Depth not difficulty:** no task touches bullets/HP/timing; forgiveness (`dashCipherCore` wrong = keep progress) and glanceability (HUD always shows the key/crib/offset) are preserved; the Casual assist remains. ✓

---

## Plan 2 (to follow): Meta — intercepts + fragment economy + THE BOMBE console

Pieces 3–5 of the spec: `src/intercepts.ts` (pure decrypt economy), `src/bombe.ts` (meta-tool + console puzzles), `panels/bombe.ts` (the cockpit codebreaker console), additive `save.ts` fields (`decryptedWords`/`bombeLevel`/`solvedPuzzles`) + `migrate.ts` validation, and `cockpitCipher.ts` reading decrypt progress. Save-side, determinism-irrelevant. Written after Plan 1 lands (or in parallel — the two subsystems don't share hot code).
