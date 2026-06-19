// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildBombePanel } from './bombe';
import { defaultSave } from '../save';
import { INTERCEPTS, interceptWords, masterProgress } from '../intercepts';
import { CONSOLE_PUZZLES } from '../bombe';

describe('buildBombePanel', () => {
  const deps = { onDecrypt: vi.fn(), onUpgradeBombe: vi.fn(), onSolvePuzzle: vi.fn(), onClose: vi.fn() };

  it('renders a master meter + one card per intercept + a DECRYPT control + a puzzle per cryptogram', () => {
    const p = buildBombePanel(deps);
    p.open(defaultSave());
    expect(p.root.querySelector('.bombe-master')).toBeTruthy();
    expect(p.root.querySelectorAll('.bombe-intercept').length).toBe(INTERCEPTS.length);
    expect(p.root.querySelectorAll('.bombe-puzzle').length).toBe(CONSOLE_PUZZLES.length);
    expect(p.root.textContent).toMatch(/0%/); // master at 0% on a fresh save
  });

  it('a fully-decrypted intercept reads as plaintext; the master meter reflects progress', () => {
    const ic = INTERCEPTS[0];
    const save = { ...defaultSave(), decryptedWords: interceptWords(ic) };
    const p = buildBombePanel(deps);
    p.open(save);
    const card = p.root.querySelectorAll('.bombe-intercept')[0] as HTMLElement;
    expect(card.textContent).toContain(ic.tokens[0]); // first plaintext token shown
    expect(masterProgress(save).frac).toBeGreaterThan(0);
  });

  it('DECRYPT calls back with the intercept id; SOLVE calls back with the puzzle id + guess', () => {
    const p = buildBombePanel(deps);
    // a funded save so the DECRYPT button is enabled (it disables at 0 Fragments by design)
    const save = { ...defaultSave(), stillpointFragments: Array.from({ length: 20 }, (_, i) => `f${i}`) };
    p.open(save);
    (p.root.querySelector('.bombe-intercept .bombe-decrypt') as HTMLButtonElement).click();
    expect(deps.onDecrypt).toHaveBeenCalledWith(INTERCEPTS[0].id);
    const pz = p.root.querySelector('.bombe-puzzle') as HTMLElement;
    (pz.querySelector('.bombe-pz-input') as HTMLInputElement).value = 'bring back the light';
    (pz.querySelector('.bombe-pz-btn') as HTMLButtonElement).click();
    expect(deps.onSolvePuzzle).toHaveBeenCalledWith(CONSOLE_PUZZLES[0].id, 'bring back the light');
  });
});
