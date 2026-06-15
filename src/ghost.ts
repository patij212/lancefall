// src/ghost.ts — GHOST REPLAYS + seed challenges. A ghost is a recorded position
// trace of a run, sampled at a fixed WORLD-time interval, replayed as a translucent
// ship racing alongside you on the SAME seed. PURE: record / interpolate / downsample
// / (de)serialize. A ghost is also the entire challenge payload — seed + score +
// path in one string — so "race a stored run" and "challenge a seed" share a format.
// The ghost is a render-only overlay that reads positions and NEVER touches the sim,
// so a Daily/seeded run stays bit-identical for everyone.

export interface Ghost {
  seed: number;
  mode: string;
  name: string;
  score: number;
  wave: number;
  interval: number; // seconds between samples
  xs: number[];
  ys: number[];
  // run-defining modifiers, baked in so a DUEL reproduces the challenger's fight
  // (same seed AND same difficulty). Optional: a plain replay ghost leaves them
  // undefined; an old challenge code decodes them as 0 (COLD / no NG+).
  heat?: number;
  ngPlus?: number;
}

export const GHOST_INTERVAL = 0.1; // sample every 0.1s of world time (10 Hz)
const MAX_SAMPLES = 2400; // cap ~4 minutes of trace
export const CHALLENGE_SAMPLES = 90; // downsample target for a shareable challenge code

export function newGhost(seed: number, mode: string): Ghost {
  return { seed, mode, name: '', score: 0, wave: 0, interval: GHOST_INTERVAL, xs: [], ys: [] };
}

/** Append a sample for the slot at `worldTime`, if not already filled (and under
 *  the cap). Skipped slots (after a stall) are back-filled with the latest
 *  position so sample index stays aligned to world time. Reads positions only. */
export function recordGhost(g: Ghost, worldTime: number, x: number, y: number): void {
  const idx = Math.floor(worldTime / g.interval);
  if (idx < g.xs.length || g.xs.length >= MAX_SAMPLES) return;
  while (g.xs.length < idx && g.xs.length < MAX_SAMPLES) {
    g.xs.push(x);
    g.ys.push(y);
  }
  if (g.xs.length < MAX_SAMPLES) {
    g.xs.push(x);
    g.ys.push(y);
  }
}

/** Interpolated ghost position at world time `t`; `done` once the trace ends. */
export function ghostAt(g: Ghost, t: number): { x: number; y: number; done: boolean } | null {
  const n = g.xs.length;
  if (n === 0) return null;
  const f = t / g.interval;
  const i = Math.floor(f);
  if (i >= n - 1) return { x: g.xs[n - 1], y: g.ys[n - 1], done: true };
  if (i < 0) return { x: g.xs[0], y: g.ys[0], done: false };
  const a = f - i;
  return { x: g.xs[i] + (g.xs[i + 1] - g.xs[i]) * a, y: g.ys[i] + (g.ys[i + 1] - g.ys[i]) * a, done: false };
}

/** Downsample to ~n samples, stretching the interval so playback stays time-aligned. */
export function downsampleGhost(g: Ghost, n: number): Ghost {
  if (g.xs.length <= n || n <= 1) return { ...g, xs: g.xs.slice(), ys: g.ys.slice() };
  const step = g.xs.length / n;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.min(g.xs.length - 1, Math.round(i * step));
    xs.push(g.xs[j]);
    ys.push(g.ys[j]);
  }
  return { ...g, interval: g.interval * step, xs, ys };
}

// ── compact (de)serialization: a JSON header + base64 Int16 position stream ──
function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function serializeGhost(g: Ghost): string {
  const n = g.xs.length;
  const buf = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    buf[i * 2] = Math.max(-32768, Math.min(32767, Math.round(g.xs[i])));
    buf[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(g.ys[i])));
  }
  const head = { s: g.seed, m: g.mode, n: g.name, sc: g.score, w: g.wave, iv: Math.round(g.interval * 1000), h: g.heat ?? 0, ng: g.ngPlus ?? 0 };
  return JSON.stringify(head) + '|' + b64encode(new Uint8Array(buf.buffer));
}

export function deserializeGhost(str: string): Ghost | null {
  try {
    const bar = str.indexOf('|');
    if (bar < 0) return null;
    const head = JSON.parse(str.slice(0, bar)) as Record<string, number | string>;
    const u = b64decode(str.slice(bar + 1).trim());
    const buf = new Int16Array(u.buffer, u.byteOffset, Math.floor(u.byteLength / 2));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + 1 < buf.length; i += 2) {
      xs.push(buf[i]);
      ys.push(buf[i + 1]);
    }
    return {
      seed: Number(head.s) || 0,
      mode: String(head.m ?? 'endless'),
      name: String(head.n ?? ''),
      score: Number(head.sc) || 0,
      wave: Number(head.w) || 0,
      interval: (Number(head.iv) || GHOST_INTERVAL * 1000) / 1000,
      heat: Number(head.h) || 0, // old codes (no h) → 0 = COLD, the correct default
      ngPlus: Number(head.ng) || 0,
      xs,
      ys,
    };
  } catch {
    return null;
  }
}

/** A compact challenge code = a downsampled ghost (one shareable string). */
export function toChallengeCode(g: Ghost): string {
  return serializeGhost(downsampleGhost(g, CHALLENGE_SAMPLES));
}
export function fromChallengeCode(code: string): Ghost | null {
  const g = deserializeGhost(code.trim());
  return g && g.xs.length > 0 ? g : null;
}
