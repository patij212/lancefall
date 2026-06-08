// Small 2D vector helpers. Pure functions; the hot sim paths inline most math,
// but these are shared + unit-tested.

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function len2(x: number, y: number): number {
  return x * x + y * y;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Returns [nx, ny] unit vector, or [0,0] for a zero vector. */
export function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l < 1e-9) return [0, 0];
  return [x / l, y / l];
}

export function clampLen(x: number, y: number, max: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l <= max || l < 1e-9) return [x, y];
  return [(x / l) * max, (y / l) * max];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smallest signed angular difference a→b in radians, within (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInQuad = (t: number) => t * t;
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
