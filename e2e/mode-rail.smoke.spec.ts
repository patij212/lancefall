import { test, expect, type Page } from '@playwright/test';

// mode-consolidation smoke. Verifies the 6-card rail in a real headless Chromium against the
// production bundle: the rail collapses to 6 cards, the ENDLESS + ECHO cards carry variant pills
// (CASUAL·STANDARD / DAILY·WEEKLY), and flipping a pill (click or ↑/↓) swaps the live hero to the
// exact mode that will launch — proving every mode (incl. the once-stranded WEEKLY) is reachable.

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// A returning player (no tutorial/sandbox overlays) with everything unlocked, so the rail shows all
// six cards cleanly. selectedMode is left unset → it defaults to CASUAL (the fresh-save default).
async function seedReturningPlayer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lancefall.save', JSON.stringify({
        version: 6, seenSandbox: true, seenTutorial: true, deepestWave: 99,
      }));
    } catch { /* ignore */ }
  });
}

test('the rail is 6 cards; ENDLESS + ECHO carry variant pills; default lands on CASUAL', async ({ page }) => {
  const errors = trackErrors(page);
  await seedReturningPlayer(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/LANCEFALL/);

  // 6 cards, exactly two of them carrying a variant pill (ENDLESS, ECHO).
  await expect(page.locator('.mode-card')).toHaveCount(6);
  await expect(page.locator('.ck-mi-pill')).toHaveCount(2);

  // both pills expose their two labelled segments.
  for (const label of ['CASUAL', 'STANDARD', 'DAILY', 'WEEKLY']) {
    await expect(page.locator('.ck-mi-pill-seg', { hasText: label })).toHaveCount(1);
  }

  // the fresh-save default selection is CASUAL → the hero names it.
  await expect(page.locator('.ck-hero-title')).toHaveText('CASUAL');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('activating a pill segment swaps the hero to the exact launchable mode (incl. WEEKLY)', async ({ page }) => {
  const errors = trackErrors(page);
  await seedReturningPlayer(page);

  await page.goto('/');
  const hero = page.locator('.ck-hero-title');
  await expect(hero).toHaveText('CASUAL');

  // NOTE: dispatchEvent('click'), not .click(). The cockpit `.frame` carries a fit-to-viewport
  // `transform: scale()`; Playwright mis-maps real-mouse coordinates through that transform and
  // misses the ~14px segment (real Chrome hit-tests it fine — verified via elementFromPoint).
  // The keyboard test below exercises the real synthetic-input path; here we assert the segment→
  // hero wiring directly. A segment click selects that exact mode regardless of which card is live.
  const seg = (label: string) => page.locator('.ck-mi-pill-seg', { hasText: label });

  await seg('STANDARD').dispatchEvent('click'); // ENDLESS card → the ranked endless config
  await expect(hero).toHaveText('ENDLESS');

  await seg('WEEKLY').dispatchEvent('click'); // ECHO card → the once-stranded WEEKLY SIEGE, now reachable
  await expect(hero).toHaveText('WEEKLY SIEGE');

  await seg('DAILY').dispatchEvent('click'); // back to the date-seeded echo
  await expect(hero).toHaveText('ECHO OF THE FALL');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('arrow keys flip the selected card variant (down = second segment)', async ({ page }) => {
  const errors = trackErrors(page);
  await seedReturningPlayer(page);

  await page.goto('/');
  const hero = page.locator('.ck-hero-title');
  await expect(hero).toHaveText('CASUAL'); // selected card = ENDLESS, variant CASUAL

  // ↓ flips the ENDLESS card to its second variant (STANDARD); ↑ flips back.
  await page.keyboard.press('ArrowDown');
  await expect(hero).toHaveText('ENDLESS');
  await page.keyboard.press('ArrowUp');
  await expect(hero).toHaveText('CASUAL');

  expect(errors, errors.join('\n')).toEqual([]);
});
