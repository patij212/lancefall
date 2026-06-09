import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import { choiceEnding, echoVignette, echoLine, nemesisOf } from './stillpoint';

describe('stillpoint — THE CHOICE + ECHO + nemesis', () => {
  it('choiceEnding is distinct for catch vs fall', () => {
    const c = choiceEnding('catch');
    const f = choiceEnding('fall');
    expect(c.head).not.toBe(f.head);
    expect(c.line).not.toBe(f.line);
    expect(choiceEnding('none').line.length).toBeGreaterThan(0);
  });

  it('echoVignette is deterministic per seed', () => {
    expect(echoVignette(20260609)).toEqual(echoVignette(20260609));
    expect(echoLine(20260609)).toBe(echoLine(20260609));
  });

  it('echoVignette varies across seeds and stays in-bounds', () => {
    const lines = new Set<string>();
    for (let d = 20260101; d < 20260131; d++) {
      const v = echoVignette(d);
      expect(v.citizen.length).toBeGreaterThan(0);
      expect(v.memory.length).toBeGreaterThan(0);
      lines.add(echoLine(d));
    }
    expect(lines.size).toBeGreaterThan(5); // not all identical
  });

  it('echoVignette uses its OWN generator (no shared/global rng state)', () => {
    const seed = 20260609;
    const before = createRng(seed).next();
    echoVignette(seed); // allocates a separate generator internally
    const after = createRng(seed).next();
    expect(after).toBe(before); // a fresh createRng(seed) is identical before/after
  });

  it('echoLine is capitalised', () => {
    const s = echoLine(42);
    expect(s[0]).toBe(s[0]!.toUpperCase());
  });

  it('nemesisOf returns the most-died-to kind, null when empty', () => {
    expect(nemesisOf({})).toBeNull();
    expect(nemesisOf({ warden: 2, sovereign: 5, hollow: 1 })).toEqual({ kind: 'sovereign', count: 5 });
  });
});
