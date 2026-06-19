// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildHeatPanel } from './heat';
import type { SaveData } from '../save';

// the heat panel only reads `selectedHeat` off the save — a partial is enough.
const saveAt = (selectedHeat: number) => ({ selectedHeat }) as unknown as SaveData;

describe('buildHeatPanel', () => {
  it('renders a curve bar and a card for every Heat level', () => {
    const panel = buildHeatPanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(saveAt(0));
    expect(panel.root.querySelectorAll('.heat-mult-bar')).toHaveLength(8);
    expect(panel.root.querySelectorAll('.heat-pcard')).toHaveLength(8);
  });

  it('highlights the selected level on both the curve and its card', () => {
    const panel = buildHeatPanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(saveAt(3));
    const sel = panel.root.querySelectorAll('.heat-pcard.sel');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('HEAT 3');
    expect(panel.root.querySelectorAll('.heat-mult-bar.on')).toHaveLength(1);
  });

  it('makes HEAT 0 a full-width legend of the six modifiers', () => {
    const panel = buildHeatPanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(saveAt(0));
    const cold = panel.root.querySelector('.heat-pcard') as HTMLElement; // first card = HEAT 0
    expect(cold.style.gridColumn).toBe('1 / -1');
    const keys = [...cold.querySelectorAll('.heat-legend-k')].map((n) => n.textContent);
    expect(keys).toEqual(['SPEED', 'DENSITY', 'BOSSES', 'REVIVES', 'ARMOR', 'GRAZE']);
  });

  it('shows a modifier grid (not a legend) on a non-zero level', () => {
    const panel = buildHeatPanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(saveAt(0));
    const blazing = panel.root.querySelectorAll('.heat-pcard')[4]; // HEAT 4
    expect(blazing.querySelector('.heat-legend')).toBeNull();
    const mods = [...blazing.querySelectorAll('.heat-mod .k')].map((n) => n.textContent);
    expect(mods).toContain('SPEED');
    expect(mods).toContain('REVIVES');
  });

  it('calls onSelect with the clicked level', () => {
    const onSelect = vi.fn();
    const panel = buildHeatPanel({ onSelect, onClose: () => {} });
    panel.open(saveAt(0));
    (panel.root.querySelectorAll('.heat-pcard')[5] as HTMLElement).click(); // HEAT 5
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  it('calls onClose when DONE is pressed', () => {
    const onClose = vi.fn();
    const panel = buildHeatPanel({ onSelect: () => {}, onClose });
    (panel.root.querySelector('.btn-primary') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('re-renders in place on repeated open (no duplicate cards)', () => {
    const panel = buildHeatPanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(saveAt(0));
    panel.open(saveAt(7));
    expect(panel.root.querySelectorAll('.heat-pcard')).toHaveLength(8);
    expect((panel.root.querySelector('.heat-pcard.sel') as HTMLElement).textContent).toContain('HEAT 7');
  });
});
