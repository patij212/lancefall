// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildInspectPanel, describeBuild } from './inspect';
import type { BuildDna } from '../buildDna';

const dna = (over: Partial<BuildDna> = {}) =>
  ({ ship: 'lancer', heat: 3, arch: 'none', stacks: {}, evos: [], relics: [], ...over }) as unknown as BuildDna;

describe('describeBuild', () => {
  it('leads with SHIP and includes a HEAT row when heat > 0', () => {
    const rows = describeBuild(dna({ heat: 3 }));
    expect(rows[0].label).toBe('SHIP');
    expect(rows.find((r) => r.label === 'HEAT')?.value).toContain('3');
  });
  it('omits the HEAT row at heat 0', () => {
    expect(describeBuild(dna({ heat: 0 })).some((r) => r.label === 'HEAT')).toBe(false);
  });
});

describe('buildInspectPanel', () => {
  const find = (root: HTMLElement, sel: string, text: string) =>
    [...root.querySelectorAll(sel)].find((b) => b.textContent === text) as HTMLElement;

  it('rejects an invalid code on INSPECT', () => {
    const panel = buildInspectPanel({ onClose: () => {} });
    (panel.root.querySelector('.duel-input') as HTMLTextAreaElement).value = 'not-a-code';
    find(panel.root, '.btn', 'INSPECT').click();
    expect(panel.root.querySelector('.howto-rules')!.textContent).toContain('not a valid');
  });

  it('prompts when INSPECT is pressed with no code', () => {
    const panel = buildInspectPanel({ onClose: () => {} });
    find(panel.root, '.btn', 'INSPECT').click();
    expect(panel.root.querySelector('.howto-rules')!.textContent).toContain('Paste a build code');
  });

  it('open() clears any prior result + input', () => {
    const panel = buildInspectPanel({ onClose: () => {} });
    const input = panel.root.querySelector('.duel-input') as HTMLTextAreaElement;
    input.value = 'stale';
    find(panel.root, '.btn', 'INSPECT').click(); // leaves an error row
    panel.open();
    expect(input.value).toBe('');
    expect(panel.root.querySelector('.howto-rules')!.textContent).toBe('');
  });

  it('calls onClose on CLOSE', () => {
    const onClose = vi.fn();
    const panel = buildInspectPanel({ onClose });
    find(panel.root, '.btn-ghost', 'CLOSE').click();
    expect(onClose).toHaveBeenCalled();
  });
});
