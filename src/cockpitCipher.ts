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
  const drawRotor = (coh: number): void => {
    const cx = W / 2;
    const cy = H * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    for (let ri = 0; ri < 3; ri++) {
      const rad = Math.min(W, H) * (0.15 + ri * 0.09);
      const ticks = 24 + ri * 12;
      const rot = t * (0.05 - ri * 0.012) * (ri % 2 ? -1 : 1);
      ctx.strokeStyle = rgba(ri === 1 ? '#818cf8' : '#22d3ee', 0.03 + coh * 0.06);
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

  /** Constellation lattice — nodes wire themselves together as coherence rises. */
  const drawLattice = (coh: number): void => {
    ctx.globalCompositeOperation = 'lighter';
    const pts = nodes.map((n) => ({
      x: n.x * W + Math.sin(t * 0.2 + n.ph) * 12,
      y: n.y * H + Math.cos(t * 0.18 + n.ph) * 12,
    }));
    const linkDist = Math.min(W, H) * (0.13 + coh * 0.11);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          ctx.strokeStyle = rgba('#22d3ee', (1 - d / linkDist) * (0.025 + coh * 0.11));
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
      ctx.fillStyle = rgba('#bdf3ff', (0.12 + coh * 0.4) * pul);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 1.2 + pul * 1.3, 0, 6.28);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /** The decode scanline: a band sweeping down where columns past their threshold show the
   *  readable phrase in amber, the rest stay dim noise. Subtle so it never fights the UI. */
  const drawScanline = (coh: number): void => {
    const scanY = ((t * 0.06) % 1.25 - 0.12) * H;
    ctx.globalCompositeOperation = 'lighter';
    const band = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, rgba('#22d3ee', 0.04 + coh * 0.08));
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, scanY - 20, W, 40);
    ctx.strokeStyle = rgba('#9fe9ff', 0.08 + coh * 0.22);
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
      ctx.fillStyle = resolved ? rgba('#ffd98a', 0.4 + coh * 0.5) : rgba('#3a4a66', 0.08 + coh * 0.12);
      ctx.fillText(ch, i * CELL, scanY);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  /** The falling glyph rain. */
  const drawRain = (dt: number, coh: number): void => {
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
          a = 0.7 * (0.45 + coh * 0.55);
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

  const drawFrame = (dt: number, coh: number): void => {
    t += dt;
    phraseTimer += dt;
    if (phraseTimer > 7) {
      phraseTimer = 0;
      phraseIdx = (phraseIdx + 1) % CIPHER_PHRASES.length;
    }
    drawBase(coh);
    drawRotor(coh);
    drawRain(dt, coh);
    drawScanline(coh);
    drawLattice(coh);
  };

  /** "STILL CITY" — a held, resolved frame for reduce-motion: no rain, the lore already
   *  decoded, the lattice already wired. Calm, not degraded. */
  const drawStill = (): void => {
    const coh = clamp01(readCoh());
    drawBase(coh);
    drawLattice(coh);
    // a settled column of resolved glyphs, dim
    ctx.font = `700 ${CELL - 4}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    const rows = Math.ceil(H / CELL);
    const nCols = Math.ceil(W / CELL);
    for (let i = 0; i < nCols; i++) {
      if (!isResolved(i, coh)) continue;
      for (let r = 0; r < rows; r += 3) {
        ctx.fillStyle = rgba(i % 5 === 0 ? '#818cf8' : '#22d3ee', 0.05 + coh * 0.08);
        ctx.fillText(decodeCharAt(CIPHER_PHRASES[0], i + r, 0), i * CELL, r * CELL);
      }
    }
  };

  const loop = (now: number): void => {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (cockpitShown && !document.hidden) {
      cohReadAcc += dt;
      if (cohReadAcc >= 0.2) {
        cohReadAcc = 0;
        cohTarget = readCoh();
      }
      cohEased = easeToward(cohEased, cohTarget, dt, 3);
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
    cockpitShown = isCockpitVisible();
    if (!cockpitShown) {
      stopLoop();
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    ensureSize();
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

  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  // React to screen switches (cockpit show/hide) + reduce-motion class flips on <html>.
  const obs = new MutationObserver(() => refresh());
  if (uiRoot) obs.observe(uiRoot, { attributes: true, attributeFilter: ['class', 'style'], subtree: true, childList: true });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  refresh(); // the title is usually already up at boot

  return {
    stop() {
      stopLoop();
      obs.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
      started = false;
    },
  };
}
