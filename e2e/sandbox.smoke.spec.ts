import { test, expect, type Page } from './fixtures';

// §1.2 DASH SANDBOX onboarding smoke. Verifies the first-run-only no-fail teach in a real
// headless Chromium against the production bundle: a FRESH save shows the sandbox on DESCEND,
// SKIP drops into a real run, and a returning player (seenSandbox=true) bypasses it entirely.

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Drop any persisted save BEFORE the app script runs so each test starts brand-new.
async function freshSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.removeItem('lancefall.save'); localStorage.removeItem('lancefall.v1'); } catch { /* ignore */ }
  });
}

test('a brand-new player sees the no-fail DASH SANDBOX on DESCEND, and SKIP starts the run', async ({ page }) => {
  const errors = trackErrors(page);
  await freshSave(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/LANCEFALL/);

  // a TRUSTED click on DESCEND routes a first-run player into the sandbox FIRST.
  await page.getByRole('button', { name: /Descend/i }).click();

  // the sandbox overlay is up with its teach text + an interactive SKIP button.
  const overlay = page.locator('.sandbox-overlay:not(.hidden)');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/HOLD to charge/i);
  await expect(page.locator('.sandbox-skip')).toBeVisible();

  // the playing HUD is NOT shown during the teach.
  await expect(page.locator('.hud')).toHaveClass(/hidden/);

  // SKIP → the overlay closes and a real run begins (HUD becomes visible).
  await page.locator('.sandbox-skip').click();
  await expect(page.locator('.sandbox-overlay')).toHaveClass(/hidden/);
  await expect(page.locator('.hud')).not.toHaveClass(/hidden/);

  // skipping records the flag so it never repeats.
  const seen = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lancefall.save') || '{}').seenSandbox === true; } catch { return false; }
  });
  expect(seen).toBe(true);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('dashing through the targets completes the lesson and drops into a real run', async ({ page }) => {
  const errors = trackErrors(page);
  await freshSave(page);

  await page.goto('/');
  await page.getByRole('button', { name: /Descend/i }).click();
  await expect(page.locator('.sandbox-overlay:not(.hidden)')).toBeVisible();

  // drive the canvas like a player: aim to the RIGHT (toward the dummy targets), then
  // HOLD (mousedown) → RELEASE (mouseup) to charge+dash. Repeat a few times; each dash
  // advances the scripted teach. The sandbox is unfailable, so this can never die.
  const canvas = page.locator('#game');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  const aimX = box.x + box.width * 0.7; // right of the centred player → toward the dummies
  const aimY = box.y + box.height * 0.5;
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(aimX, aimY);
    await page.mouse.down();
    await page.waitForTimeout(180); // charge briefly
    await page.mouse.up(); // release → dash
    await page.waitForTimeout(220);
    if (await page.locator('.sandbox-overlay').evaluate((e) => e.classList.contains('hidden'))) break;
  }

  // the lesson completes → overlay hidden + the real run is live (HUD up).
  await expect(page.locator('.sandbox-overlay')).toHaveClass(/hidden/, { timeout: 12_000 });
  await expect(page.locator('.hud')).not.toHaveClass(/hidden/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a returning player (seenSandbox=true) goes straight into the run — no sandbox', async ({ page }) => {
  const errors = trackErrors(page);
  // seed a save that has already seen the sandbox.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lancefall.save', JSON.stringify({ version: 6, seenSandbox: true, seenTutorial: true }));
    } catch { /* ignore */ }
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Descend/i }).click();

  // the sandbox never appears; the run starts immediately (HUD up, overlay hidden).
  await expect(page.locator('.hud')).not.toHaveClass(/hidden/);
  await expect(page.locator('.sandbox-overlay')).toHaveClass(/hidden/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Esc to SKIP the sandbox starts a LIVE run — the loop must not freeze (regression)', async ({ page }) => {
  const errors = trackErrors(page);
  await freshSave(page);

  await page.goto('/');
  await page.getByRole('button', { name: /Descend/i }).click();
  await expect(page.locator('.sandbox-overlay:not(.hidden)')).toBeVisible();

  // Esc is the universal "get me out". REGRESSION: the skip branch in frame() must keep the
  // requestAnimationFrame chain alive — it previously bare-returned before re-scheduling, so
  // finishSandbox()→start() left NO pending rAF and the whole game froze on the first frame.
  await page.keyboard.press('Escape');
  await expect(page.locator('.sandbox-overlay')).toHaveClass(/hidden/);
  await expect(page.locator('.hud')).not.toHaveClass(/hidden/);

  // PROVE the loop is still ticking: the HUD (run clock + score) must change over ~1.2s.
  // A frozen loop would leave it byte-identical.
  const t0 = await page.locator('.hud').textContent();
  await page.waitForTimeout(1200);
  const t1 = await page.locator('.hud').textContent();
  expect(t1, 'the run clock must advance after an Esc-skip — a frozen loop leaves the HUD unchanged').not.toBe(t0);

  expect(errors, errors.join('\n')).toEqual([]);
});
