import { describe, it, expect } from 'vitest';
import { deriveStats, applyPerk, rollDraft, PERKS } from './perks';
import type { PerkStacks } from './perks';
import { createRng } from './rng';
import { TUNE } from './tune';

describe('deriveStats', () => {
  it('returns base stats with no perks', () => {
    const s = deriveStats({});
    expect(s.dashLenMul).toBe(1);
    expect(s.staminaSegments).toBe(TUNE.stamina.segments);
    expect(s.chainRadius).toBe(0);
    expect(s.grazeBurnDmg).toBe(0);
  });

  it('Long Lance stacks dash length and hitbox', () => {
    const s = deriveStats({ longreach: 2 });
    expect(s.dashLenMul).toBeCloseTo(1.5);
    expect(s.dashHitboxRadius).toBe(TUNE.dash.hitboxRadius + 10);
  });

  it('Second Wind adds segments and regen', () => {
    const s = deriveStats({ secondwind: 1 });
    expect(s.staminaSegments).toBe(TUNE.stamina.segments + 1);
    expect(s.regenPerSec).toBe(TUNE.stamina.regenPerSec + 12);
  });

  it('Graze Burn enables graze damage and doubles graze stamina', () => {
    const s = deriveStats({ grazeburn: 1 });
    expect(s.grazeBurnDmg).toBe(1);
    expect(s.grazeStaminaRefund).toBe(TUNE.stamina.grazeRefund * 2);
    expect(s.grazeComboBonus).toBeGreaterThan(0);
  });

  it('Chain Reaction grows its radius per stack', () => {
    expect(deriveStats({ chain: 1 }).chainRadius).toBe(70);
    expect(deriveStats({ chain: 2 }).chainRadius).toBe(92);
  });

  it('Time Thief grants slow-mo extension and instant stamina', () => {
    const s = deriveStats({ timethief: 1 });
    expect(s.timeThiefExtra).toBeGreaterThan(0);
    expect(s.timeThiefStamina).toBe(40);
  });

  it('Heavy Lance increases dash damage', () => {
    expect(deriveStats({}).dashDamage).toBe(1);
    expect(deriveStats({ pierce: 2 }).dashDamage).toBe(3);
  });

  it('Siphon refunds stamina per kill', () => {
    expect(deriveStats({ siphon: 2 }).killStaminaRefund).toBe(40);
  });

  it('Slipstream extends the combo window', () => {
    expect(deriveStats({ slipstream: 1 }).comboWindowBonus).toBeCloseTo(0.6);
  });

  it('Nova Dash enables a launch shockwave that grows per stack', () => {
    expect(deriveStats({}).dashNovaRadius).toBe(0);
    expect(deriveStats({ nova: 1 }).dashNovaRadius).toBe(90);
    expect(deriveStats({ nova: 2 }).dashNovaRadius).toBe(120);
  });
});

describe('applyPerk', () => {
  it('increments stack count', () => {
    const stacks: PerkStacks = {};
    applyPerk(stacks, 'chain');
    applyPerk(stacks, 'chain');
    expect(stacks.chain).toBe(2);
  });
});

describe('rollDraft', () => {
  it('always offers exactly 3 cards', () => {
    const rng = createRng(1);
    expect(rollDraft(rng, {}).length).toBe(3);
  });

  it('offers distinct perks when enough are eligible', () => {
    const rng = createRng(5);
    const ids = rollDraft(rng, {}).map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('excludes maxed perks and falls back to Shard Cache', () => {
    // Max out every real perk
    const stacks: PerkStacks = {};
    for (const id of Object.keys(PERKS)) {
      if (id === 'shardcache') continue;
      stacks[id as keyof PerkStacks] = PERKS[id as keyof typeof PERKS].maxStacks;
    }
    const rng = createRng(9);
    const draft = rollDraft(rng, stacks);
    expect(draft.length).toBe(3);
    expect(draft.every((p) => p.id === 'shardcache')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = rollDraft(createRng(2026), {}).map((p) => p.id);
    const b = rollDraft(createRng(2026), {}).map((p) => p.id);
    expect(a).toEqual(b);
  });
});
