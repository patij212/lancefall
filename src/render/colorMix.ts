// Tiny shared colour helpers for the renderer + its render/*.ts draw modules. Pulled
// out of render.ts so the split-out draw files (spear.ts, …) can mix colours without
// importing render.ts (which would be a cycle). Pure string math, no canvas.

export function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Linear blend from colour a → b at t (0..1). Returns an `rgb(...)` string. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)},${Math.round(ca.g + (cb.g - ca.g) * t)},${Math.round(
    ca.b + (cb.b - ca.b) * t,
  )})`;
}
