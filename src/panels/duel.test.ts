// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildDuelPanel, type DuelPanelDeps } from './duel';

const deps = (over: Partial<DuelPanelDeps> = {}): DuelPanelDeps => ({ onAccept: vi.fn(), onChallengeDev: vi.fn(), onClose: vi.fn(), ...over });
const find = (root: HTMLElement, sel: string, text: string) => [...root.querySelectorAll(sel)].find((b) => b.textContent === text) as HTMLElement;

describe('buildDuelPanel', () => {
  it('accepts a pasted code (trimmed) → onClose + onAccept', () => {
    const d = deps();
    const panel = buildDuelPanel(d);
    (panel.root.querySelector('.duel-input') as HTMLTextAreaElement).value = '  L1ABC  ';
    find(panel.root, '.btn-primary', 'ACCEPT DUEL').click();
    expect(d.onAccept).toHaveBeenCalledWith('L1ABC');
    expect(d.onClose).toHaveBeenCalled();
  });

  it('ignores an empty/whitespace code', () => {
    const d = deps();
    const panel = buildDuelPanel(d);
    (panel.root.querySelector('.duel-input') as HTMLTextAreaElement).value = '   ';
    find(panel.root, '.btn-primary', 'ACCEPT DUEL').click();
    expect(d.onAccept).not.toHaveBeenCalled();
  });

  it('CHALLENGE THE DEV → onClose + onChallengeDev', () => {
    const d = deps();
    const panel = buildDuelPanel(d);
    ([...panel.root.querySelectorAll('.btn-ghost')].find((b) => b.textContent?.includes('CHALLENGE THE DEV')) as HTMLElement).click();
    expect(d.onChallengeDev).toHaveBeenCalled();
    expect(d.onClose).toHaveBeenCalled();
  });

  it('open(code) prefills the textarea', () => {
    const panel = buildDuelPanel(deps());
    panel.open('SEEDX');
    expect((panel.root.querySelector('.duel-input') as HTMLTextAreaElement).value).toBe('SEEDX');
  });
});
