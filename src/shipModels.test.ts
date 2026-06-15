import { describe, it, expect } from 'vitest';
import { shipModel } from './shipModels';
import { SHIPS } from './ships';

const IDS = SHIPS.map((s) => s.id);

describe('ship silhouettes', () => {
  it('every roster ship has a non-trivial hull', () => {
    for (const id of IDS) {
      const m = shipModel(id);
      expect(m.hull.length).toBeGreaterThanOrEqual(3); // a real polygon
    }
  });

  it('every hull points nose-forward (a clear vertex toward +x)', () => {
    for (const id of IDS) {
      const xs = shipModel(id).hull.map((p) => p[0]);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(0.8); // a distinct nose ahead of the body
    }
  });

  it('hulls stay within a sane sprite-radius envelope', () => {
    for (const id of IDS) {
      for (const [x, y] of shipModel(id).hull) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(y)).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('the six silhouettes are all distinct', () => {
    const sigs = IDS.map((id) => JSON.stringify(shipModel(id).hull));
    expect(new Set(sigs).size).toBe(IDS.length);
  });

  it('detail strokes, when present, are open polylines of 2+ points', () => {
    for (const id of IDS) {
      const d = shipModel(id).detail;
      if (d) expect(d.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('an unknown id falls back to THE LAST LANCE', () => {
    expect(shipModel('nope')).toEqual(shipModel('lance'));
  });
});
