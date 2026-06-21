// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { initPwa } from './pwa';

describe('initPwa', () => {
  it('never throws even when PWA APIs are absent (degrades silently)', () => {
    expect(() => initPwa()).not.toThrow();
  });

  it('registers a one-shot touchend listener for fullscreen-on-first-touch', () => {
    let added = '';
    const orig = window.addEventListener.bind(window);
    (window as unknown as { addEventListener: typeof window.addEventListener }).addEventListener = ((
      type: string,
      ...rest: unknown[]
    ) => {
      if (type === 'touchend') added = type;
      return (orig as unknown as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener;
    initPwa();
    expect(added).toBe('touchend');
  });
});
