import { test as base, expect } from '@playwright/test';

// Shared e2e fixture — make CSS animations/transitions instant so elements are click-stable.
//
// The title's DESCEND CTA carries `.btn-play { animation: pulse 1.4s infinite }` whose keyframe
// does `transform: scale(1.04)`. That perpetual ~1.4s breathing scale means the button's rendered
// box NEVER settles, so a real `locator.click()` trips Playwright's actionability stability gate
// ("element is not stable") and times out — even though a human clicks the breathing button fine.
//
// We DON'T emulate prefers-reduced-motion to fix this: the cockpit treats reduce-motion as a
// gameplay/a11y preference and SKIPS the first-run dash sandbox under it (shouldShowSandbox), which
// would break the sandbox smoke tests that need the teach to appear. Instead we zero animation +
// transition DURATIONS via an injected stylesheet — purely a rendering-timing change, invisible to
// app logic — so animations snap to their resting frame and every element is immediately stable.
// Injected at document-start so it applies before the first paint / first interaction.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const css = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}';
      const apply = () => {
        const style = document.createElement('style');
        style.setAttribute('data-test-no-anim', '');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    });
    await use(page);
  },
});

export { expect };
export type { Page } from '@playwright/test';
