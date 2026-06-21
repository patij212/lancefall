import { describe, it, expect } from 'vitest';
import { SIGILS, SIGIL_COUNT, sigilFor, sigilSvgMarkup } from './cipherSigils';

describe('cipherSigils — the designed cipher mark set', () => {
  it('has 10 marks, each with a non-empty path', () => {
    expect(SIGIL_COUNT).toBe(10);
    for (const s of SIGILS) expect(s.d.length).toBeGreaterThan(0);
  });

  it('paths are distinct (no two marks share a silhouette)', () => {
    expect(new Set(SIGILS.map((s) => s.d)).size).toBe(SIGIL_COUNT);
  });

  it('sigilFor wraps negative + out-of-range indices into [0, COUNT)', () => {
    expect(sigilFor(0)).toBe(SIGILS[0]);
    expect(sigilFor(SIGIL_COUNT)).toBe(SIGILS[0]);
    expect(sigilFor(-1)).toBe(SIGILS[SIGIL_COUNT - 1]);
    expect(sigilFor(SIGIL_COUNT * 3 + 2)).toBe(SIGILS[2]);
  });

  it('sigilSvgMarkup emits a well-formed <svg> with the path (+ dot when present)', () => {
    const orb = sigilSvgMarkup(0); // has a centre dot
    expect(orb).toContain('<svg');
    expect(orb).toContain('viewBox="0 0 100 100"');
    expect(orb).toContain('aria-hidden="true"');
    expect(orb).toContain(SIGILS[0].d);
    expect(orb).toContain('<circle');
    const spire = sigilSvgMarkup(1); // no dot
    expect(spire).not.toContain('<circle');
    expect(sigilSvgMarkup(0, 'chip-sig')).toContain('class="chip-sig"');
  });
});
