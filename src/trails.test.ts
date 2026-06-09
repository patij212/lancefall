import { describe, it, expect } from 'vitest';
import { TRAILS, trailById, trailParticleColor, trailGhostColor, canUnlockTrail } from './trails';

describe('trails', () => {
  it('has unique ids and a free default', () => {
    const ids = TRAILS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TRAILS[0].id).toBe('pulse');
    expect(TRAILS[0].unlockShards).toBe(0);
    expect(TRAILS[0].combo).toBe(true);
  });

  it('trailById falls back to PULSE for unknown ids', () => {
    expect(trailById('nope').id).toBe('pulse');
    expect(trailById('ember').id).toBe('ember');
  });

  it('PULSE follows the live combo colour; fixed trails use their own', () => {
    const pulse = trailById('pulse');
    const ember = trailById('ember');
    expect(trailParticleColor(pulse, '#abcdef')).toBe('#abcdef'); // tracks combo
    expect(trailGhostColor(pulse, '#123456')).toBe('#123456'); // tracks theme
    expect(trailParticleColor(ember, '#abcdef')).toBe(ember.base);
    expect(trailGhostColor(ember, '#123456')).toBe(ember.bright);
  });

  it('shard trails unlock by shard balance', () => {
    const ember = trailById('ember'); // 600
    expect(canUnlockTrail(ember, 599, [])).toBe(false);
    expect(canUnlockTrail(ember, 600, [])).toBe(true);
  });

  it('CROWN is achievement-gated, not shard-gated', () => {
    const crown = trailById('crown');
    expect(crown.unlockAch).toBe('regicide');
    expect(canUnlockTrail(crown, 999999, [])).toBe(false); // shards alone do nothing
    expect(canUnlockTrail(crown, 0, ['regicide'])).toBe(true); // the achievement unlocks it free
  });
});
