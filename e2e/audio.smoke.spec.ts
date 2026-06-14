import { test, expect, type Page } from '@playwright/test';

// Collect console + page errors from navigation onward.
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Wrap AudioBufferSourceNode.start BEFORE any game code runs, so we can observe whether an authored
// LOOPING source ever plays (loop===true distinguishes the authored bed from procedural one-shots).
async function instrumentLoops(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __loopStarts: number[] }).__loopStarts = [];
    const proto = AudioBufferSourceNode.prototype;
    const orig = proto.start;
    proto.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof orig>) {
      try {
        if (this.loop && this.buffer) (window as unknown as { __loopStarts: number[] }).__loopStarts.push(+this.buffer.duration.toFixed(2));
      } catch { /* ignore */ }
      return orig.apply(this, args);
    };
  });
}

test('flagship audio: assets preload + the authored AURORA bed actually plays, no console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await instrumentLoops(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/LANCEFALL/);

  // a TRUSTED click starts a run → audio.ensure() → preloadCore() (a programmatic click would not
  // unlock the AudioContext). ARENA is the WARDEN-bearing mode.
  await page.getByRole('button', { name: 'ARENA' }).click();

  // within a few seconds: the 25 flagship assets fetch AND an authored loop starts. If the asset
  // manager's fetch binding (or any browser-only decode/playback step) regressed, this stays false —
  // this is the exact assertion that would have caught the "Illegal invocation" preload failure.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const flagship = performance.getEntriesByType('resource').filter((r) => r.name.includes('/audio/flagship/')).length;
          const loops = (window as unknown as { __loopStarts: number[] }).__loopStarts.length;
          return flagship >= 20 && loops >= 1;
        }),
      { timeout: 20_000, message: 'flagship assets preload and an authored loop starts' },
    )
    .toBe(true);

  // the started loop is an authored arena bed (32 bars @ 96–120 BPM ⇒ ~64–120s) — proves the whole
  // chain: fetch → decode → director → LayerPlayer → looping playback.
  const loopDurations = await page.evaluate(() => [...new Set((window as unknown as { __loopStarts: number[] }).__loopStarts)]);
  expect(loopDurations.some((d) => d >= 60 && d <= 125)).toBe(true);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('audio credits screen lists the CC-BY attributions (license compliance surface)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'CREDITS' }).click();

  const panel = page.locator('.screen-settings:not(.hidden)', { hasText: 'AUDIO CREDITS' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Magenta Metropolis');
  await expect(panel).toContainText('Cyberpunk Renaissance');
  await expect(panel).toContainText('Cyber Thriller');
  await expect(panel).toContainText(/CC BY/);
  await expect(panel).toContainText(/Kenney/i);
  expect(errors, errors.join('\n')).toEqual([]);
});
