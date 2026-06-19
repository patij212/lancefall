// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { buildCreditsPanel } from './credits';

describe('buildCreditsPanel', () => {
  it('renders the credits with a music section and a working DONE', () => {
    const onClose = vi.fn();
    const root = buildCreditsPanel(onClose);
    expect(root.querySelector('h2')?.textContent).toBe('CREDITS');
    expect(root.textContent).toContain('MUSIC');
    (root.querySelector('.btn-primary') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
