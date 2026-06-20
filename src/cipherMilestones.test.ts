// src/cipherMilestones.test.ts — TDD for the 25/50/75% decryption milestone beats.
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';
import { grantCipherMilestones, CIPHER_MILESTONES, MILESTONE_FRAGMENTS } from './cipherMilestones';

describe('grantCipherMilestones', () => {
  it('grants each tier once as the master fraction crosses it; idempotent', () => {
    const s = defaultSave();
    const vocab = vocabulary();
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.5)); // 50%
    const g1 = grantCipherMilestones(s);
    expect(g1.map((x) => x.tier).sort()).toEqual([0.25, 0.5]); // 25 + 50 crossed
    expect(grantCipherMilestones(s)).toEqual([]); // idempotent
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.75));
    expect(grantCipherMilestones(s).map((x) => x.tier)).toEqual([0.75]);
  });

  it('grants Fragments via dedup-safe synthetic ids', () => {
    const s = defaultSave();
    s.decryptedWords = vocabulary().slice(0, Math.ceil(vocabulary().length * 0.25));
    grantCipherMilestones(s);
    expect(s.stillpointFragments.filter((f) => f.startsWith('cipher-milestone:25')).length).toBe(MILESTONE_FRAGMENTS);
  });

  it('grants nothing on a fresh save with 0 decrypted words', () => {
    const s = defaultSave();
    expect(grantCipherMilestones(s)).toEqual([]);
    expect(s.stillpointFragments.filter((f) => f.startsWith('cipher-milestone:')).length).toBe(0);
  });

  it('CIPHER_MILESTONES has exactly the three expected tiers', () => {
    expect([...CIPHER_MILESTONES]).toEqual([0.25, 0.5, 0.75]);
  });

  it('MILESTONE_FRAGMENTS is a positive integer', () => {
    expect(MILESTONE_FRAGMENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MILESTONE_FRAGMENTS)).toBe(true);
  });

  it('does not grant 75% unless 75% actually reached', () => {
    const s = defaultSave();
    const vocab = vocabulary();
    // exactly 74% — should not trigger 0.75
    s.decryptedWords = vocab.slice(0, Math.floor(vocab.length * 0.74));
    const g = grantCipherMilestones(s);
    expect(g.map((x) => x.tier)).not.toContain(0.75);
  });
});
