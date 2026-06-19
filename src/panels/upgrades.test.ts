// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildUpgradesPanel } from './upgrades';
import type { SaveData } from '../save';

const save = (shards = 0) => ({ shards, meta: {} }) as unknown as SaveData;

describe('buildUpgradesPanel', () => {
  it('renders the meta-tree + live shard balance on open', () => {
    const panel = buildUpgradesPanel({ onBuy: () => {}, onClose: () => {} });
    panel.open(save(1234));
    expect(panel.root.querySelector('.panel-balance')?.textContent).toBe('◆ 1,234 shards');
    expect(panel.root.querySelector('.upg-tree, .tnode')).toBeTruthy();
  });

  it('DONE → onClose', () => {
    const onClose = vi.fn();
    const panel = buildUpgradesPanel({ onBuy: () => {}, onClose });
    (panel.root.querySelector('.btn-primary') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
