// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildStatsPanel } from './stats';

// (renderStats itself is covered by statsDerive.test.ts; this guards the panel shell + wiring.)
describe('buildStatsPanel', () => {
  it('renders the STATS shell with a DONE that closes', () => {
    const onClose = vi.fn();
    const panel = buildStatsPanel({ onClose });
    expect(panel.root.querySelector('.panel-head-title')?.textContent).toBe('STATS');
    expect(panel.root.querySelector('.stats-body')).toBeTruthy();
    (panel.root.querySelector('.btn-primary') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
