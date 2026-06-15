import { describe, it, expect } from 'vitest';
import { Particles } from './particles';
import { createRng } from './rng';

// The floatText origin (y0) is what the renderer freezes to under reduce-motion (render.ts
// drawFloatingText: `const y = reduceMotion ? t.y0 : t.y`). These guard that y0 captures the
// spawn Y and stays put while the live y drifts — so the reduce-motion freeze has a stable anchor.
describe('floatText reduce-motion origin (y0)', () => {
  it('captures the spawn Y as y0 on emit', () => {
    const p = new Particles(createRng(1));
    p.floatText(40, 120, 'ON BEAT', '#0ff');
    const t = p.texts.find((x) => x.active)!;
    expect(t.y0).toBe(120);
    expect(t.y).toBe(120);
  });

  it('y drifts upward over time but y0 never moves (the reduce-motion anchor is stable)', () => {
    const p = new Particles(createRng(1));
    p.floatText(40, 120, 'PERFECT', '#ffd700');
    const t = p.texts.find((x) => x.active)!;
    for (let i = 0; i < 10; i++) p.update(1 / 60);
    expect(t.y).toBeLessThan(120); // drifted up (vy starts at -60)
    expect(t.y0).toBe(120); // origin untouched → freeze renders in place
  });
});
