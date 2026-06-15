import { describe, it, expect } from 'vitest';
import { META_NODES, metaNode, nodeCost, metaApplyFor } from './meta';
import type { RunStats } from './perks';

// A minimal, fully-zeroed RunStats so we can observe exactly what a meta node mutates.
function blankStats(): RunStats {
  return {
    regenPerSec: 0,
    dashLenMul: 0,
    dashHitboxRadius: 0,
    grazeRadius: 0,
    maxSpeed: 100,
    accel: 100,
    comboWindowBonus: 0,
    regenDelay: 1,
    scoreMul: 1,
    shardMul: 1,
    draftSize: 3,
    startPerks: 0,
    reviveTokens: 0,
  } as unknown as RunStats;
}

describe('metaNode lookup', () => {
  it('returns the node for a known id', () => {
    const n = metaNode('recovery');
    expect(n).toBeDefined();
    expect(n!.id).toBe('recovery');
  });

  it('returns undefined for an unknown id', () => {
    expect(metaNode('does-not-exist')).toBeUndefined();
  });

  it('every node in the table is findable by its own id', () => {
    for (const node of META_NODES) {
      expect(metaNode(node.id)).toBe(node);
    }
  });
});

describe('nodeCost', () => {
  it('the first level costs exactly the base cost', () => {
    const node = metaNode('recovery')!;
    expect(nodeCost(node, 0)).toBe(node.baseCost);
  });

  it('cost rises geometrically with current level', () => {
    const node = metaNode('recovery')!;
    expect(nodeCost(node, 1)).toBe(Math.round(node.baseCost * node.costMul));
    expect(nodeCost(node, 2)).toBe(Math.round(node.baseCost * node.costMul * node.costMul));
  });

  it('is strictly increasing per level for every node with costMul > 1', () => {
    for (const node of META_NODES) {
      expect(node.costMul).toBeGreaterThan(1);
      let prev = -Infinity;
      for (let l = 0; l <= node.maxLevel; l++) {
        const c = nodeCost(node, l);
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
    }
  });
});

describe('metaApplyFor', () => {
  it('is a no-op for an empty / all-zero level map', () => {
    const before = blankStats();
    const after = blankStats();
    metaApplyFor({})(after);
    expect(after).toEqual(before);
    metaApplyFor({ recovery: 0 })(after);
    expect(after).toEqual(before);
  });

  it('applies an additive node scaled by its level', () => {
    const s = blankStats();
    metaApplyFor({ recovery: 3 })(s);
    expect(s.regenPerSec).toBe(8 * 3); // +8 stamina regen / sec per level
  });

  it('applies independent nodes additively without cross-contamination', () => {
    const s = blankStats();
    metaApplyFor({ recovery: 1, grazer: 2 })(s);
    expect(s.regenPerSec).toBe(8);
    expect(s.grazeRadius).toBe(3 * 2);
    expect(s.dashLenMul).toBe(0); // untouched node stays at base
  });

  it('the fortune flag flips the draft size to 4', () => {
    const s = blankStats();
    metaApplyFor({ fortune: 1 })(s);
    expect(s.draftSize).toBe(4);
  });

  it('multiplicative momentum compounds maxSpeed and accel', () => {
    const s = blankStats();
    metaApplyFor({ momentum: 2 })(s);
    expect(s.maxSpeed).toBeCloseTo(100 * (1 + 0.03 * 2));
    expect(s.accel).toBeCloseTo(100 * (1 + 0.03 * 2));
  });

  it('iron will shrinks the regen lockout multiplicatively', () => {
    const s = blankStats();
    metaApplyFor({ ironwill: 2 })(s);
    expect(s.regenDelay).toBeCloseTo(Math.pow(0.88, 2));
  });
});
