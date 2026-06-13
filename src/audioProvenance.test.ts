import { describe, it, expect } from 'vitest';
import {
  isLicenseAllowed,
  requiresAttribution,
  validateProvenance,
  type ProvenanceEntry,
} from './audioProvenance';

describe('audio license policy', () => {
  it('allows CC0, CC-BY, Pixabay, and royalty-free game licenses', () => {
    expect(isLicenseAllowed('CC0')).toBe(true);
    expect(isLicenseAllowed('CC-BY')).toBe(true);
    expect(isLicenseAllowed('pixabay')).toBe(true);
    expect(isLicenseAllowed('royalty-free')).toBe(true);
  });

  it('rejects NC, SA, GPL, AI-generated, and unlicensed', () => {
    expect(isLicenseAllowed('CC-BY-NC')).toBe(false);
    expect(isLicenseAllowed('CC-BY-SA')).toBe(false);
    expect(isLicenseAllowed('GPL')).toBe(false);
    expect(isLicenseAllowed('ai-generated')).toBe(false);
    expect(isLicenseAllowed('unknown')).toBe(false);
  });

  it('requires attribution only for CC-BY', () => {
    expect(requiresAttribution('CC-BY')).toBe(true);
    expect(requiresAttribution('CC0')).toBe(false);
    expect(requiresAttribution('pixabay')).toBe(false);
    expect(requiresAttribution('royalty-free')).toBe(false);
  });
});

describe('validateProvenance', () => {
  const ok: ProvenanceEntry = {
    asset: 'sfx/dash_fire_1.ogg',
    source: 'Sonniss GDC 2023',
    url: 'https://sonniss.com/gameaudiogdc',
    license: 'royalty-free',
    author: 'Sonniss',
  };

  it('passes a complete, allowed entry', () => {
    expect(validateProvenance([ok])).toEqual([]);
  });

  it('flags a missing required field', () => {
    const errs = validateProvenance([{ ...ok, author: '' }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('sfx/dash_fire_1.ogg');
  });

  it('flags a rejected license', () => {
    const errs = validateProvenance([{ ...ok, license: 'CC-BY-NC' }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/license/i);
  });

  it('flags CC-BY without attribution but passes CC-BY with it', () => {
    const missing = validateProvenance([{ ...ok, license: 'CC-BY', author: 'Kevin MacLeod' }]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/attribution/i);

    const present = validateProvenance([
      { ...ok, license: 'CC-BY', author: 'Kevin MacLeod', attribution: 'Music by Kevin MacLeod (incompetech.com), CC BY 4.0' },
    ]);
    expect(present).toEqual([]);
  });

  it('returns one error per failing asset across a batch', () => {
    const errs = validateProvenance([ok, { ...ok, asset: 'x', license: 'GPL' }, { ...ok, asset: 'y', url: '' }]);
    expect(errs).toHaveLength(2);
  });
});
