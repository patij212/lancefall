import { describe, it, expect } from 'vitest';
import { BIOMES, BIOME_DURATION, biomeAt } from './biomes';
import type { EnemyKind } from './types';

describe('biomes', () => {
  it('has unique ids and starts in THE VOID', () => {
    const ids = BIOMES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BIOMES[0].id).toBe('void');
  });

  it('every biome has a complete, sane definition', () => {
    for (const b of BIOMES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.nebula).toHaveLength(3);
      expect(b.speedMul).toBeGreaterThan(0);
      expect(b.shieldBonus).toBeGreaterThanOrEqual(0);
      // bias multipliers must be positive and target real enemy kinds
      for (const [k, v] of Object.entries(b.bias)) {
        expect(v).toBeGreaterThan(0);
        expect(typeof k).toBe('string');
      }
    }
  });

  it('cycles every BIOME_DURATION seconds and wraps with the array length', () => {
    expect(biomeAt(0).index).toBe(0);
    expect(biomeAt(BIOME_DURATION - 0.1).index).toBe(0);
    expect(biomeAt(BIOME_DURATION).index).toBe(1);
    // wraps cleanly after the full set (no off-by-one with the new biome count)
    expect(biomeAt(BIOME_DURATION * BIOMES.length).index).toBe(0);
    expect(biomeAt(BIOME_DURATION * (BIOMES.length + 2)).index).toBe(2);
  });

  it('THE WARREN biases the priority-target enemies (brooder/shade/drifter)', () => {
    const warren = BIOMES.find((b) => b.id === 'warren');
    expect(warren).toBeDefined();
    const bias = warren!.bias as Partial<Record<EnemyKind, number>>;
    expect((bias.brooder ?? 1)).toBeGreaterThan(1);
    expect((bias.shade ?? 1)).toBeGreaterThan(1);
    expect((bias.drifter ?? 1)).toBeGreaterThan(1);
  });
});
