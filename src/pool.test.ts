import { describe, it, expect } from 'vitest';
import { Pool } from './pool';

interface Thing {
  active: boolean;
  v: number;
}

function makePool(size: number) {
  return new Pool<Thing>(() => ({ active: false, v: 0 }), size);
}

describe('Pool', () => {
  it('pre-allocates the requested number of items', () => {
    const p = makePool(8);
    expect(p.items.length).toBe(8);
    expect(p.items.every((i) => !i.active)).toBe(true);
  });

  it('obtain activates an item and tracks the active count', () => {
    const p = makePool(4);
    const a = p.obtain();
    expect(a).not.toBeNull();
    expect(a!.active).toBe(true);
    expect(p.activeCount).toBe(1);
  });

  it('returns null when exhausted instead of throwing', () => {
    const p = makePool(2);
    p.obtain();
    p.obtain();
    expect(p.obtain()).toBeNull();
    expect(p.activeCount).toBe(2);
  });

  it('release frees a slot for reuse', () => {
    const p = makePool(2);
    const a = p.obtain()!;
    p.obtain();
    expect(p.obtain()).toBeNull();
    p.release(a);
    expect(p.activeCount).toBe(1);
    expect(p.obtain()).not.toBeNull();
  });

  it('double release does not underflow the count', () => {
    const p = makePool(2);
    const a = p.obtain()!;
    p.release(a);
    p.release(a);
    expect(p.activeCount).toBe(0);
  });

  it('forEachActive visits only active items', () => {
    const p = makePool(4);
    const a = p.obtain()!;
    a.v = 1;
    const b = p.obtain()!;
    b.v = 2;
    p.release(a);
    const seen: number[] = [];
    p.forEachActive((t) => seen.push(t.v));
    expect(seen).toEqual([2]);
  });

  it('clear deactivates everything', () => {
    const p = makePool(4);
    p.obtain();
    p.obtain();
    p.clear();
    expect(p.activeCount).toBe(0);
    expect(p.items.every((i) => !i.active)).toBe(true);
  });
});
