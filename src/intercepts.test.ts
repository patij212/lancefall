import { describe, it, expect } from 'vitest';
import {
  INTERCEPTS, wordKey, wordCost, vocabulary, cipherWord,
  isWordDecrypted, interceptWords, interceptProgress, isInterceptComplete, masterProgress, nextWordInIntercept, tokenView,
  decryptWord, syncInterceptLore,
} from './intercepts';
import { loreById, fragmentBalance } from './lore';
import { defaultSave } from './save';

const withWords = (...w: string[]) => ({ ...defaultSave(), decryptedWords: w });
const richSave = (frags: number) => ({ ...defaultSave(), stillpointFragments: Array.from({ length: frags }, (_, i) => `f${i}`) });

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

describe('intercepts — the vocabulary economy', () => {
  it('a word is decrypted globally; interceptWords lists an intercept\'s unique words', () => {
    const ic = INTERCEPTS[0];
    const words = interceptWords(ic);
    expect(words.length).toBeGreaterThan(2);
    const s = withWords(words[0]);
    expect(isWordDecrypted(s, words[0])).toBe(true);
    expect(isWordDecrypted(s, words[1])).toBe(false);
  });

  it('interceptProgress + isInterceptComplete track decrypted/total', () => {
    const ic = INTERCEPTS[0];
    const words = interceptWords(ic);
    expect(interceptProgress(withWords(), ic)).toEqual({ done: 0, total: words.length });
    expect(isInterceptComplete(withWords(...words), ic)).toBe(true);
    expect(interceptProgress(withWords(...words), ic).done).toBe(words.length);
  });

  it('masterProgress is decrypted-vocabulary / total-vocabulary in [0,1]', () => {
    expect(masterProgress(withWords()).frac).toBe(0);
    const all = vocabulary();
    expect(masterProgress(withWords(...all)).frac).toBe(1);
  });

  it('nextWordInIntercept returns the cheapest undecrypted word, or null when complete', () => {
    const ic = INTERCEPTS[0];
    const next = nextWordInIntercept(withWords(), ic);
    expect(next).not.toBeNull();
    const costs = interceptWords(ic).map((w) => wordCost(w));
    expect(wordCost(next!)).toBe(Math.min(...costs));
    expect(nextWordInIntercept(withWords(...interceptWords(ic)), ic)).toBeNull();
  });

  it('tokenView shows plaintext for decrypted words + the glyph cipher for the rest', () => {
    const ic = INTERCEPTS[0];
    const word = interceptWords(ic)[0];
    const tok = ic.tokens.find((t) => wordKey(t) === word)!;
    expect(tokenView(withWords(word), tok).decrypted).toBe(true);
    expect(tokenView(withWords(word), tok).text).toBe(tok);
    expect(tokenView(withWords(), tok).decrypted).toBe(false);
    expect(tokenView(withWords(), tok).text).not.toBe(tok);
  });
});

describe('intercepts — decrypt action', () => {
  it('decryptWord spends exactly wordCost and reveals the word; refuses if unaffordable', () => {
    const s = richSave(10);
    const w = interceptWords(INTERCEPTS[0]).find((x) => wordCost(x) > 1)!;
    const before = fragmentBalance(s);
    expect(decryptWord(s, w)).toBe(true);
    expect(isWordDecrypted(s, w)).toBe(true);
    expect(fragmentBalance(s)).toBe(before - wordCost(w));
    expect(decryptWord(s, w)).toBe(false); // already decrypted → no double-charge
    const poor = { ...defaultSave(), stillpointFragments: [] as string[] };
    expect(decryptWord(poor, w)).toBe(false); // can't afford
    expect(isWordDecrypted(poor, w)).toBe(false);
  });

  it('a costMul (Bombe discount) reduces the charge but never below 1 for a real word', () => {
    const s = richSave(20);
    const w = interceptWords(INTERCEPTS[0]).find((x) => wordCost(x) >= 4)!;
    const before = fragmentBalance(s);
    decryptWord(s, w, 0.5);
    expect(before - fragmentBalance(s)).toBe(Math.max(1, Math.round(wordCost(w) * 0.5)));
  });

  it('syncInterceptLore unlocks a linked LoreEntry once its intercept is fully decrypted', () => {
    const ic = INTERCEPTS.find((i) => i.loreLink)!;
    const s = { ...defaultSave(), decryptedWords: interceptWords(ic) };
    const unlocked = syncInterceptLore(s);
    expect(unlocked).toContain(ic.loreLink);
    expect(s.stillpointLore).toContain(ic.loreLink);
    expect(syncInterceptLore(s)).toEqual([]); // idempotent — no re-unlock
  });
});
