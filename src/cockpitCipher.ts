// ── Pure logic (unit-tested in cockpitCipher.test.ts) ────────────────────────

/** Clamp to the [0, 1] coherence range. */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Stable per-column noise in [0, 1) — the classic fract(sin) hash. Deterministic so a
 *  column's "resolve threshold" is fixed for the session (no per-frame strobe). */
export function hash01(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** A column "breaks the key" (snaps from noise to the readable phrase) once COHERENCE
 *  rises past its fixed threshold. Monotonic in coh: more meaning as the city remembers. */
export function isResolved(i: number, coh: number): boolean {
  return hash01(i) < coh;
}

/** The decoded glyph for a column, wrapping the phrase (offset scrolls it). Tolerates
 *  negative offsets so the scroll can run either way. */
export function decodeCharAt(phrase: string, i: number, offset: number): string {
  const n = phrase.length;
  return phrase[(((i + offset) % n) + n) % n];
}

/** Frame-rate-independent exponential smoothing toward a target (dt in seconds). dt=0 is a
 *  no-op; large dt converges without overshoot. Used to glide the overlay's coherence. */
export function easeToward(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Coherence floor implied by THE CHOICE on the Sovereign kill: held the light → the city
 *  remembers (mostly decoded); let it fall → near-noise. `null` means "no choice yet" — defer
 *  to the boot-in --coh rise so new players still get the waking moment. */
export function choiceCoherence(choice: string): number | null {
  if (choice === 'catch') return 0.9;
  if (choice === 'fall') return 0.14;
  return null;
}

/** A free-running pulse envelope in [0, 1] at the given beat period (s) — spikes to 1 at each
 *  beat and decays. Runs on the cockpit's own ~120bpm heartbeat (no audio coupling). beat<=0
 *  means "no beat" → 0 (flat). */
export function beatEnvelope(t: number, beat: number): number {
  if (beat <= 0) return 0;
  const phase = (t % beat) / beat;
  return Math.exp(-phase * 6);
}

/** Parse a CSS `--accent-rgb` triple ("34, 211, 238") into [r,g,b], falling back to cyan on
 *  empty/malformed input so the tint never crashes the loop. */
export function parseAccentRgb(value: string): [number, number, number] {
  const CYAN: [number, number, number] = [34, 211, 238];
  const parts = (value || '').split(',').map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return CYAN;
  return [parts[0], parts[1], parts[2]];
}

/** Split an FFT magnitude array (0..255 per bin) into normalized bass/mid/treble/level (0..1) —
 *  the drivers behind the music reactivity. Pure so it's testable without an AudioContext. */
export function audioBands(
  freq: Uint8Array | number[],
): { bass: number; mid: number; treble: number; level: number } {
  const n = freq.length;
  if (!n) return { bass: 0, mid: 0, treble: 0, level: 0 };
  const avg = (lo: number, hi: number): number => {
    const a = Math.max(0, Math.floor(lo * n));
    const b = Math.min(n, Math.ceil(hi * n));
    if (b <= a) return 0;
    let s = 0;
    for (let i = a; i < b; i++) s += freq[i];
    return s / (b - a) / 255;
  };
  return { bass: avg(0, 0.08), mid: avg(0.08, 0.4), treble: avg(0.4, 1), level: avg(0, 1) };
}

// ── THE CIPHER STORM overlay (Turing decode) ─────────────────────────────────
// A self-contained animated backdrop layer for the COCKPIT title screen: falling cipher
// glyphs, a faint machine lattice + Enigma-rotor core, and a decode scanline where noise
// snaps into readable lore as COHERENCE "breaks the key". It sits BETWEEN the #game canvas
// and #ui-root (z-index 5) so it overlays the title's static radial background while every
// cockpit panel + the film grain stay on top and fully legible. Transparent base — the
// existing background shows through. Mounts itself, shows only while the cockpit is visible,
// honors reduce-motion ("STILL CITY" — a held, resolved frame), and never throws into boot.

/** Glyphs that rain: code-breaking caps/digits + a few operators and Greek for cipher flavor. */
const CIPHER_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789ΔΘΛΞΣΦΨΩ#%&@/<>=*+'.split('');

/** Lore + Solstice phrases the decode scanline resolves into (the data-narration of the fall,
 *  plus the jam's Turing nods). Spaces ride along so words breathe. */
const CIPHER_PHRASES = [
  'THE LONGEST DAY ',
  'BREAK THE SAME KEY ',
  'REMEMBER EVERYTHING ',
  'THE LIGHT DIMS ',
  'WE LET IT FALL ',
  'ECHO OF THE FALL ',
  'THE MACHINE LEARNED TO THINK ',
];

const CELL = 20; // logical px per glyph cell
const MAX_DPR = 1.5; // cap device-pixel-ratio (perf)
const SCRIM_ALPHA = 0.16; // a whisper-thin deepening so glyphs seat on the backdrop (0 = pure overlay)
const COH_FALLBACK = 0.5; // used if --coh can't be read
const BEAT = 0.5; // free-running pulse period (s) — ~120bpm, the cockpit's own heartbeat
const BEAT_GLOW = 0.12; // gentle beat "breath" brightness (kept low — flashing-safe)
const CENTER_FALLOFF = 0.82; // fade the cipher away from the central content column (0 = even)
const PARALLAX = 16; // px of pointer parallax on the rotor; lattice uses half
const CYAN_RGB: [number, number, number] = [34, 211, 238];
const BASS_GLOW = 0.6; // how hard the kick/bass pumps the whole field's brightness
const SKYLINE_H = 0.17; // neon city band height (fraction of viewport, anchored to the bottom)
const NEON = ['#22d3ee', '#818cf8', '#fbbf24']; // window palette (cyan / indigo / amber)

interface Column {
  head: number; // current head row (fractional)
  speed: number; // rows/sec
  trail: number; // lit cells above the head
  glyphs: number[]; // index into CIPHER_CHARS per row
  rows: number;
  hue: 0 | 1; // 0 = cyan trail, 1 = indigo trail
}

interface Node2 {
  x: number; // 0..1
  y: number; // 0..1
  ph: number;
  sp: number;
}

interface Win {
  x: number; // px within building
  y: number; // px within building
  w: number;
  h: number;
  ph: number; // flicker phase
  base: number; // base brightness
  col: string;
}
interface Building {
  x: number; // px
  w: number;
  h: number; // px (height above the bottom)
  windows: Win[];
}

// ── Music reactivity: a read-only master tap ─────────────────────────────────
// We patch AudioNode.connect ONCE so whatever the engine routes to ctx.destination is ALSO fed
// into our AnalyserNode (the same non-destructive trick audio.ts's getAnalyser uses, reached
// without importing the shared audio/game modules). Installed at module load — before main.ts
// constructs the Game — so it's in place when the engine builds its graph.
let sharedAnalyser: AnalyserNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let tapInstalled = false;

function installAudioTap(): void {
  if (tapInstalled || typeof AudioNode === 'undefined' || typeof AudioDestinationNode === 'undefined') return;
  tapInstalled = true;
  const proto = AudioNode.prototype as unknown as { connect: (...args: unknown[]) => unknown };
  const orig = proto.connect;
  proto.connect = function (this: AudioNode, ...args: unknown[]): unknown {
    const ret = orig.apply(this, args);
    try {
      if (args[0] instanceof AudioDestinationNode) {
        if (!sharedAnalyser) {
          sharedAnalyser = this.context.createAnalyser();
          sharedAnalyser.fftSize = 256;
          sharedAnalyser.smoothingTimeConstant = 0.55;
          freqData = new Uint8Array(sharedAnalyser.frequencyBinCount);
        }
        orig.call(this, sharedAnalyser); // tap (output dropped; analyser still reads its input)
      }
    } catch {
      /* a tap must never break audio */
    }
    return ret;
  };
}

/** Live spectrum → normalized bands (all zeros until audio is actually flowing). */
function readBands(): { bass: number; mid: number; treble: number; level: number } {
  if (!sharedAnalyser || !freqData) return { bass: 0, mid: 0, treble: 0, level: 0 };
  sharedAnalyser.getByteFrequencyData(freqData);
  return audioBands(freqData);
}

installAudioTap();

let started = false;

/** Mount + start the cockpit cipher overlay. Idempotent and defensive — any failure is
 *  swallowed so it can never break game boot. Returns a handle to stop + remove it. */
export function startCockpitCipher(): { stop(): void } {
  const noop = { stop() {} };
  if (started || typeof document === 'undefined') return noop;
  started = true;
  try {
    return mountCipher();
  } catch (err) {
    started = false;
    // eslint-disable-next-line no-console
    console.warn('[cockpitCipher] disabled:', err);
    return noop;
  }
}

function mountCipher(): { stop(): void } {
  const canvas = document.createElement('canvas');
  canvas.id = 'cockpit-cipher';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;display:none;';
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot && uiRoot.parentElement) uiRoot.parentElement.insertBefore(canvas, uiRoot);
  else document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    throw new Error('no 2d context');
  }

  let W = 0;
  let H = 0;
  let cols: Column[] = [];
  let nodes: Node2[] = [];
  let rafId = 0;
  let lastT = 0;
  let cohEased = COH_FALLBACK;
  let cohTarget = COH_FALLBACK;
  let cohReadAcc = 0;
  let t = 0;
  let phraseIdx = 0;
  let phraseTimer = 0;
  let cockpitShown = false;
  let accentRgb: [number, number, number] = CYAN_RGB; // per-mode tint (lattice + scan beam)
  let choice = 'none'; // THE CHOICE from the save → coherence floor
  let burst = 0; // decode-burst envelope (0..1), spiked on DESCEND
  const mouse = { x: 0.5, y: 0.5 }; // normalized pointer (parallax)
  let buildings: Building[] = []; // neon skyline
  let rBass = 0; // smoothed reactive bands (the music made visible)
  let rMid = 0;
  let rTreble = 0;
  let rLevel = 0;

  const cockpitEl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.screen-cockpit');

  // Visible == rendered (display:none screens have no client rects). Works regardless of how
  // ui.ts toggles screens, so no coupling to its internals.
  const isCockpitVisible = (): boolean => {
    const el = cockpitEl();
    return !!el && el.getClientRects().length > 0;
  };

  const prefersReducedMotion = (): boolean => {
    if (document.documentElement.classList.contains('reduce-motion')) return true;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };

  const readCoh = (): number => {
    const el = cockpitEl();
    if (!el) return cohTarget;
    const v = parseFloat(getComputedStyle(el).getPropertyValue('--coh'));
    return Number.isFinite(v) ? clamp01(v) : cohTarget;
  };

  // THE CHOICE on the Sovereign kill, read straight from the save (decoupled from game.ts).
  const readChoice = (): string => {
    try {
      const raw = localStorage.getItem('lancefall.save');
      if (!raw) return 'none';
      const c = (JSON.parse(raw) as { stillpointChoice?: string }).stillpointChoice;
      return c === 'catch' || c === 'fall' ? c : 'none';
    } catch {
      return 'none';
    }
  };

  // Per-mode accent rides --accent-rgb on .ck-main (set by ui.ts as a numeric triple).
  const readAccent = (): [number, number, number] => {
    const m = document.querySelector<HTMLElement>('.ck-main');
    if (!m) return CYAN_RGB;
    return parseAccentRgb(getComputedStyle(m).getPropertyValue('--accent-rgb').trim());
  };

  // Effective coherence target: THE CHOICE sets a floor; new players defer to the boot --coh rise.
  const targetCoh = (): number => {
    const cc = choiceCoherence(choice);
    return cc !== null ? cc : readCoh();
  };

  const rgbaT = (rgb: [number, number, number], a: number): string =>
    `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  const build = (): void => {
    const nCols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 2;
    cols = [];
    for (let i = 0; i < nCols; i++) {
      const glyphs = new Array<number>(rows);
      for (let j = 0; j < rows; j++) glyphs[j] = (Math.random() * CIPHER_CHARS.length) | 0;
      cols.push({
        head: -Math.random() * rows,
        speed: 5 + Math.random() * 11,
        trail: 8 + ((Math.random() * 12) | 0),
        glyphs,
        rows,
        hue: Math.random() < 0.72 ? 0 : 1,
      });
    }
    nodes = [];
    for (let i = 0; i < 30; i++)
      nodes.push({ x: Math.random(), y: Math.random(), ph: Math.random() * 6.28, sp: 0.4 + Math.random() });
    buildSkyline();
  };

  /** A neon City-of-Lancefall skyline along the bottom — silhouettes with windows that ignite
   *  and pulse with the bass. Rebuilt on resize. */
  const buildSkyline = (): void => {
    buildings = [];
    const skyH = H * SKYLINE_H;
    let x = -10;
    while (x < W + 10) {
      const w = 22 + Math.random() * 64;
      const h = skyH * (0.32 + Math.random() * 0.68);
      const windows: Win[] = [];
      const cols = Math.max(1, Math.floor(w / 13));
      const rows = Math.max(1, Math.floor(h / 13));
      for (let c = 0; c < cols; c++)
        for (let ro = 0; ro < rows; ro++) {
          if (Math.random() > 0.5) continue;
          const hue = Math.random();
          windows.push({
            x: 5 + (c * (w - 8)) / cols,
            y: 5 + (ro * (h - 8)) / rows,
            w: 2 + Math.random() * 2,
            h: 3 + Math.random() * 2,
            ph: Math.random() * 6.28,
            base: 0.4 + Math.random() * 0.6,
            col: hue < 0.5 ? NEON[0] : hue < 0.8 ? NEON[1] : NEON[2],
          });
        }
      buildings.push({ x, w, h, windows });
      x += w + 1 + Math.random() * 7;
    }
  };

  const ensureSize = (): void => {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (W === w && H === h && canvas.width === Math.round(w * dpr)) return;
    W = w;
    H = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  };

  const rgba = (hex: string, a: number): string => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /** Shared backdrop drawn under both the animated + still frames. */
  const drawBase = (coh: number): void => {
    ctx.clearRect(0, 0, W, H);
    if (SCRIM_ALPHA > 0) {
      ctx.fillStyle = rgba('#04050a', SCRIM_ALPHA);
      ctx.fillRect(0, 0, W, H);
    }
    // faint machine lattice grid (the Turing machine, barely there)
    ctx.strokeStyle = rgba('#22d3ee', 0.015 + coh * 0.025);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += CELL * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y <= H; y += CELL * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  };

  /** The Enigma-rotor / Turing-machine core: three faint concentric tick rings. */
  const drawRotor = (coh: number, glow: number): void => {
    const cx = W / 2 + (mouse.x - 0.5) * -PARALLAX;
    const cy = H * 0.5 + (mouse.y - 0.5) * -PARALLAX;
    ctx.globalCompositeOperation = 'lighter';
    for (let ri = 0; ri < 3; ri++) {
      const rad = Math.min(W, H) * (0.15 + ri * 0.09) * (1 + rBass * 0.12); // rings breathe on the kick
      const ticks = 24 + ri * 12;
      const rot = t * (0.05 - ri * 0.012) * (ri % 2 ? -1 : 1);
      ctx.strokeStyle = rgba(ri === 1 ? '#818cf8' : '#22d3ee', (0.03 + coh * 0.06) * glow);
      ctx.lineWidth = 1;
      for (let k = 0; k < ticks; k++) {
        const a = rot + (k / ticks) * 6.28;
        const r0 = rad;
        const r1 = rad + 5 + (k % 3 === 0 ? 5 : 0);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /** Constellation lattice — nodes wire themselves together as coherence rises. Links carry the
   *  per-mode accent (the mode reads through); nodes stay bright white so they always sparkle. */
  const drawLattice = (coh: number, glow: number): void => {
    ctx.globalCompositeOperation = 'lighter';
    const lpx = (mouse.x - 0.5) * -PARALLAX * 0.5;
    const lpy = (mouse.y - 0.5) * -PARALLAX * 0.5;
    const pts = nodes.map((n) => ({
      x: n.x * W + Math.sin(t * 0.2 + n.ph) * 12 + lpx,
      y: n.y * H + Math.cos(t * 0.18 + n.ph) * 12 + lpy,
    }));
    const linkDist = Math.min(W, H) * (0.13 + coh * 0.11);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          ctx.strokeStyle = rgbaT(accentRgb, (1 - d / linkDist) * (0.025 + coh * 0.11) * glow);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const n = nodes[i];
      const pul = 0.5 + 0.5 * Math.sin(t * n.sp + n.ph);
      ctx.fillStyle = rgba('#bdf3ff', (0.12 + coh * 0.4) * pul * glow * (1 + rMid * 0.7)); // mids light the nodes
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 1.2 + pul * 1.3, 0, 6.28);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /** The decode scanline: a band sweeping down where columns past their threshold show the
   *  readable phrase in amber, the rest stay dim noise. Subtle so it never fights the UI. */
  const drawScanline = (coh: number, glow: number): void => {
    const scanY = ((t * 0.06) % 1.25 - 0.12) * H;
    ctx.globalCompositeOperation = 'lighter';
    const band = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, rgbaT(accentRgb, (0.04 + coh * 0.08) * glow));
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, scanY - 20, W, 40);
    ctx.strokeStyle = rgbaT(accentRgb, (0.08 + coh * 0.22) * glow);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(W, scanY);
    ctx.stroke();

    ctx.font = `700 ${CELL - 3}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    const phrase = CIPHER_PHRASES[phraseIdx];
    const offset = Math.floor(t * 6);
    const nCols = Math.ceil(W / CELL);
    for (let i = 0; i < nCols; i++) {
      const resolved = isResolved(i, coh);
      const ch = resolved ? decodeCharAt(phrase, i, offset) : CIPHER_CHARS[(Math.random() * CIPHER_CHARS.length) | 0];
      if (ch === ' ') continue;
      // resolved meaning stays amber (the Turing-decode signature); noise stays dim + un-glowed
      ctx.fillStyle = resolved ? rgba('#ffd98a', (0.4 + coh * 0.5) * glow) : rgba('#3a4a66', 0.08 + coh * 0.12);
      ctx.fillText(ch, i * CELL, scanY);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /** The falling glyph rain (cyan/indigo — the city identity stays untinted). */
  const drawRain = (dt: number, coh: number, glow: number): void => {
    ctx.font = `700 ${CELL - 4}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (dt > 0) c.head += c.speed * dt;
      if (c.head - c.trail > c.rows) c.head = -Math.random() * 10;
      if (dt > 0 && Math.random() < 0.5) c.glyphs[(Math.random() * c.rows) | 0] = (Math.random() * CIPHER_CHARS.length) | 0;
      const x = i * CELL;
      const hr = Math.floor(c.head);
      for (let k = 0; k < c.trail; k++) {
        const row = hr - k;
        if (row < 0 || row >= c.rows) continue;
        const f = 1 - k / c.trail;
        let color: string;
        let a: number;
        if (k === 0) {
          color = '#eafdff';
          a = 0.7 * (0.45 + coh * 0.55) * glow * (1 + rTreble * 0.6); // heads shimmer on treble
        } else {
          color = c.hue ? '#818cf8' : '#22d3ee';
          a = f * f * (0.12 + coh * 0.4);
        }
        if (a < 0.03) continue;
        ctx.fillStyle = rgba(color, a);
        ctx.fillText(CIPHER_CHARS[c.glyphs[row]], x, row * CELL);
      }
    }
  };

  /** The neon City of Lancefall along the bottom — dark silhouettes whose windows ignite and
   *  pump with the bass (the city "springing to life" with the music). */
  const drawSkyline = (coh: number, glow: number): void => {
    if (!buildings.length) return;
    // silhouettes + accent-lit rooftops
    for (const b of buildings) {
      ctx.fillStyle = rgba('#060a14', 0.9);
      ctx.fillRect(b.x, H - b.h, b.w, b.h);
      ctx.fillStyle = rgbaT(accentRgb, 0.1 + coh * 0.18 + rBass * 0.25);
      ctx.fillRect(b.x, H - b.h, b.w, 1.2);
    }
    // window neon — additive; collective flare on the kick + per-window flicker
    ctx.globalCompositeOperation = 'lighter';
    const pump = 0.45 + rBass * 1.9 + beatEnvelope(t, BEAT) * 0.18 * (1 - Math.min(1, rLevel * 3));
    for (const b of buildings) {
      for (const wn of b.windows) {
        const flick = 0.6 + 0.4 * Math.sin(t * 2.2 + wn.ph);
        const a = wn.base * flick * (0.16 + coh * 0.4) * pump * glow;
        if (a < 0.02) continue;
        ctx.fillStyle = rgba(wn.col, Math.min(0.95, a));
        ctx.fillRect(b.x + wn.x, H - b.h + wn.y, wn.w, wn.h);
      }
    }
    // a ground bloom rising off the skyline, brightening with the bass
    const gy = H - H * SKYLINE_H;
    const gg = ctx.createLinearGradient(0, H, 0, gy);
    gg.addColorStop(0, rgbaT(accentRgb, 0.06 + coh * 0.06 + rBass * 0.12));
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.globalCompositeOperation = 'source-over';
  };

  /** #1 — fade the cipher away from the central content column so it FRAMES the hero/title/
   *  DESCEND rather than competing. A taller-than-wide erase ellipse keeps the edges alive. */
  const applyCenterFalloff = (): void => {
    if (CENTER_FALLOFF <= 0) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, 1.55); // vertical column (title → hero → descend)
    const r = Math.min(W, H) * 0.5;
    const mask = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    mask.addColorStop(0, `rgba(0,0,0,${CENTER_FALLOFF})`);
    mask.addColorStop(0.6, `rgba(0,0,0,${CENTER_FALLOFF * 0.45})`);
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(-W, -H, W * 2, H * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };

  const drawFrame = (dt: number, coh: number): void => {
    t += dt;
    phraseTimer += dt;
    if (phraseTimer > 7) {
      phraseTimer = 0;
      phraseIdx = (phraseIdx + 1) % CIPHER_PHRASES.length;
    }
    // #3 — DESCEND decode burst: a quick spike that forces the field to fully resolve + flash.
    if (burst > 0) burst = Math.max(0, burst - dt / 0.55);
    const effCoh = clamp01(coh + burst * (1 - coh));
    // Brightness throb: the free-running beat carries it when silent, but FADES OUT once real
    // audio is flowing — then the live bass takes over (that's the "reaction to the music").
    const freeRun = beatEnvelope(t, BEAT) * BEAT_GLOW * (1 - Math.min(1, rLevel * 3));
    const glow = 1 + freeRun + rBass * BASS_GLOW + burst * 0.9;
    drawBase(effCoh);
    drawSkyline(effCoh, glow);
    drawRotor(effCoh, glow);
    drawRain(dt, effCoh, glow);
    drawScanline(effCoh, glow);
    drawLattice(effCoh, glow);
    applyCenterFalloff();
  };

  /** "STILL CITY" — a held, resolved frame for reduce-motion: no rain, the lore already
   *  decoded, the lattice already wired. Calm, not degraded. */
  const drawStill = (): void => {
    accentRgb = readAccent();
    const coh = clamp01(targetCoh());
    drawBase(coh);
    drawSkyline(coh, 1); // the neon city, lit and held (no pump under reduce-motion)
    drawLattice(coh, 1);
    // a settled field of already-decoded lore — the city remembering, held still
    ctx.font = `700 ${CELL - 4}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    const rows = Math.ceil(H / CELL);
    const nCols = Math.ceil(W / CELL);
    for (let i = 0; i < nCols; i++) {
      if (!isResolved(i, coh)) continue;
      const phrase = CIPHER_PHRASES[i % CIPHER_PHRASES.length];
      for (let r = 0; r < rows; r += 3) {
        ctx.fillStyle = rgba(i % 5 === 0 ? '#818cf8' : '#22d3ee', 0.05 + coh * 0.08);
        ctx.fillText(decodeCharAt(phrase, r, 0), i * CELL, r * CELL);
      }
    }
    applyCenterFalloff();
  };

  const loop = (now: number): void => {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (cockpitShown && !document.hidden) {
      cohReadAcc += dt;
      if (cohReadAcc >= 0.2) {
        cohReadAcc = 0;
        cohTarget = targetCoh();
        accentRgb = readAccent();
      }
      cohEased = easeToward(cohEased, cohTarget, dt, 3);
      // music reactivity: punchy attack + smooth release on the kick, gentler on the rest
      const bands = readBands();
      rBass = bands.bass > rBass ? easeToward(rBass, bands.bass, dt, 22) : easeToward(rBass, bands.bass, dt, 6);
      rMid = easeToward(rMid, bands.mid, dt, 9);
      rTreble = easeToward(rTreble, bands.treble, dt, 12);
      rLevel = easeToward(rLevel, bands.level, dt, 5);
      if (import.meta.env.DEV)
        (window as unknown as { __cipherBands?: unknown }).__cipherBands = { bass: rBass, mid: rMid, treble: rTreble, level: rLevel };
      drawFrame(dt, cohEased);
    }
    rafId = requestAnimationFrame(loop);
  };

  const startLoop = (): void => {
    if (!rafId) {
      lastT = 0;
      rafId = requestAnimationFrame(loop);
    }
  };
  const stopLoop = (): void => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  // Decide what to run based on cockpit visibility + reduce-motion. Cheap; called from the
  // observer + resize, not every frame.
  const refresh = (): void => {
    const wasShown = cockpitShown;
    cockpitShown = isCockpitVisible();
    if (!cockpitShown) {
      stopLoop();
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    ensureSize();
    if (!wasShown) choice = readChoice(); // re-read THE CHOICE only on (re)entry to the title
    if (prefersReducedMotion()) {
      stopLoop();
      drawStill();
    } else {
      startLoop();
    }
  };

  const onResize = (): void => {
    if (!cockpitShown) return;
    ensureSize();
    if (prefersReducedMotion()) drawStill();
  };
  const onVisibility = (): void => {
    if (document.hidden) stopLoop();
    else refresh();
  };
  const onPointer = (e: PointerEvent): void => {
    mouse.x = e.clientX / window.innerWidth;
    mouse.y = e.clientY / window.innerHeight;
  };
  // #3 — DESCEND (or Enter while the cockpit is up) → a decode burst: the field snaps to fully
  // decoded for a beat, the machine "solving" as you dive in. Watches the same user gesture, so
  // no game.ts hook (the click handler launches ~130ms later, leaving the flash visible first).
  const onDescendClick = (e: Event): void => {
    const tgt = e.target as Element | null;
    if (tgt && typeof tgt.closest === 'function' && tgt.closest('.ck-descend')) burst = 1;
  };
  const onKeyLaunch = (e: KeyboardEvent): void => {
    if (cockpitShown && e.key === 'Enter') burst = 1;
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('click', onDescendClick, true);
  document.addEventListener('keydown', onKeyLaunch, true);

  // React to screen switches (cockpit show/hide) + reduce-motion class flips on <html>.
  const obs = new MutationObserver(() => refresh());
  if (uiRoot) obs.observe(uiRoot, { attributes: true, attributeFilter: ['class', 'style'], subtree: true, childList: true });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  accentRgb = readAccent();
  refresh(); // the title is usually already up at boot

  return {
    stop() {
      stopLoop();
      obs.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('click', onDescendClick, true);
      document.removeEventListener('keydown', onKeyLaunch, true);
      canvas.remove();
      started = false;
    },
  };
}
