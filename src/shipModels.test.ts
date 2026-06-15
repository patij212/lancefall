import { describe, it, expect } from 'vitest';
import { shipModel, traceShipPath, drawShipSilhouette } from './shipModels';
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

  it('hulls + detail + core stay within a sane sprite-radius envelope', () => {
    for (const id of IDS) {
      const m = shipModel(id);
      const pts = [...m.hull, ...(m.detail ?? []), ...(m.core ? [m.core] : [])];
      for (const [x, y] of pts) {
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

// A tiny recording stub so we can assert the draw helpers issue the expected canvas ops
// without a real DOM canvas (jsdom has none under vitest's node environment).
function stubCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (..._a: unknown[]) => calls.push(name);
  return {
    calls,
    ctx: {
      lineJoin: '',
      lineCap: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      beginPath: rec('beginPath'),
      moveTo: rec('moveTo'),
      lineTo: rec('lineTo'),
      closePath: rec('closePath'),
      fill: rec('fill'),
      stroke: rec('stroke'),
      arc: rec('arc'),
    } as unknown as CanvasRenderingContext2D,
  };
}

describe('ship silhouette draw helpers', () => {
  it('traceShipPath emits a moveTo then a lineTo per remaining point, scaled', () => {
    const { ctx, calls } = stubCtx();
    const hull = shipModel('reaver').hull;
    traceShipPath(ctx, hull, 16);
    expect(calls.filter((c) => c === 'moveTo').length).toBe(1);
    expect(calls.filter((c) => c === 'lineTo').length).toBe(hull.length - 1);
  });

  it('drawShipSilhouette fills + strokes the hull and draws the core when asked', () => {
    const { ctx, calls } = stubCtx();
    drawShipSilhouette(ctx, 'lance', 16, { fill: '#000', stroke: '#0ff', detail: '#fff', core: '#fff' });
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
    expect(calls).toContain('arc'); // the cockpit core dot (lance has one)
  });

  it('drawShipSilhouette skips the core when no colour is given', () => {
    const { ctx, calls } = stubCtx();
    drawShipSilhouette(ctx, 'lance', 16, { fill: '#000', stroke: '#0ff' });
    expect(calls).not.toContain('arc');
  });
});
