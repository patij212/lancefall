// src/dossiers.test.ts — THE DOSSIER WEB. Tests for figureDossier, DOSSIER_FIGURES,
// citizenDeeperUnlocked. All pure / save-side; no rng, no run-sim contact.
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords } from './intercepts';
import { figureDossier, DOSSIER_FIGURES, citizenDeeperUnlocked } from './dossiers';
import { CITIZENS } from './citizens';

describe('figureDossier', () => {
  it('covers the six figures, each with a positive mention total', () => {
    expect(DOSSIER_FIGURES).toHaveLength(6);
    for (const k of DOSSIER_FIGURES) {
      const d = figureDossier(defaultSave(), k);
      expect(d.total).toBeGreaterThan(0);
      expect(d.revealed).toBe(0); // nothing decrypted yet
      expect(d.lines).toHaveLength(0);
    }
  });
  it('reveals progressively as that figure\'s mentions are decrypted', () => {
    const s = defaultSave();
    const warden = INTERCEPTS.find((i) => i.id === 'int-warden')!;
    s.decryptedWords.push(...interceptWords(warden));
    const d = figureDossier(s, 'warden');
    expect(d.revealed).toBeGreaterThan(0);
    expect(d.frac).toBeGreaterThan(0);
    expect(d.lines.length).toBeGreaterThan(0); // at least the first threshold line
  });
});

describe('citizenDeeperUnlocked', () => {
  it('false for a figure-citizen until the figure dossier completes', () => {
    const s = defaultSave();
    const gw = CITIZENS.find((c) => c.id === 'gatewarden')!;
    expect(citizenDeeperUnlocked(s, gw)).toBe(false);
  });
});
