// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildArchetypePanel } from './archetype';
import { ARCHETYPES } from '../archetypes';
import type { SaveData } from '../save';

const save = (selectedArchetype = 'none') => ({ selectedArchetype }) as unknown as SaveData;

describe('buildArchetypePanel', () => {
  it('renders a card per archetype', () => {
    const panel = buildArchetypePanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(save());
    expect(panel.root.querySelectorAll('.arch-card')).toHaveLength(ARCHETYPES.length);
  });

  it('highlights the selected archetype', () => {
    const panel = buildArchetypePanel({ onSelect: () => {}, onClose: () => {} });
    panel.open(save(ARCHETYPES[1].id));
    const sel = panel.root.querySelectorAll('.arch-card.sel');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain(ARCHETYPES[1].name);
  });

  it('calls onSelect with the clicked archetype id', () => {
    const onSelect = vi.fn();
    const panel = buildArchetypePanel({ onSelect, onClose: () => {} });
    panel.open(save());
    (panel.root.querySelectorAll('.arch-card')[2] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith(ARCHETYPES[2].id);
  });

  it('calls onClose on DONE', () => {
    const onClose = vi.fn();
    const panel = buildArchetypePanel({ onSelect: () => {}, onClose });
    (panel.root.querySelector('.btn-primary') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
