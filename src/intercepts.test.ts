import { describe, it, expect } from 'vitest';
import { INTERCEPTS, wordKey, wordCost, vocabulary, cipherWord } from './intercepts';
import { loreById } from './lore';

describe('intercepts — catalog + word primitives', () => {
  it('has a rich, well-formed catalog; every loreLink is a real LoreEntry', () => {
    expect(INTERCEPTS.length).toBeGreaterThanOrEqual(10);
    for (const ic of INTERCEPTS) {
      expect(ic.id).toMatch(/^[a-z0-9-]+$/);
      expect(ic.title.length).toBeGreaterThan(0);
      expect(ic.tokens.length).toBeGreaterThan(3);
      if (ic.loreLink) expect(loreById(ic.loreLink)).toBeTruthy();
    }
    expect(new Set(INTERCEPTS.map((i) => i.id)).size).toBe(INTERCEPTS.length);
  });

  it('wordKey canonicalises tokens; punctuation-only tokens key to empty', () => {
    expect(wordKey('Light,')).toBe('light');
    expect(wordKey('—')).toBe('');
    expect(wordKey("city's")).toBe("city's");
  });

  it('wordCost: punctuation free, stopwords cheap, long/key words dearer (pure, bounded 1..6)', () => {
    expect(wordCost('')).toBe(0);
    expect(wordCost('the')).toBe(1);
    expect(wordCost('light')).toBeGreaterThanOrEqual(2);
    expect(wordCost('enciphered')).toBeGreaterThanOrEqual(wordCost('light'));
    for (const w of ['a', 'sovereign', 'remember', 'key']) expect(wordCost(w)).toBeLessThanOrEqual(6);
  });

  it('vocabulary is the unique decryptable word set (no empties, deduped, lowercase)', () => {
    const v = vocabulary();
    expect(v.length).toBeGreaterThan(20);
    expect(new Set(v).size).toBe(v.length);
    expect(v).not.toContain('');
    expect(v.every((w) => w === w.toLowerCase())).toBe(true);
  });

  it('cipherWord is a deterministic, length-preserving glyph display (≠ plaintext)', () => {
    expect(cipherWord('light')).toBe(cipherWord('light'));
    expect(cipherWord('light').length).toBe('light'.length);
    expect(cipherWord('light')).not.toBe('light');
  });
});
