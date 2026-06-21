// Capture LANCEFALL UI panels as native-1080p stills for the trailer's depth/story montage.
// Spins its own HMR-off Vite server, seeds a rich save, opens each panel via __lf.ui.*, screenshots.
//   node tools/trailer/panels.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'panels');
fs.mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[panels]', ...a);

const SEED = async () => {
  const g = window.__lf;
  try { const m = await import('/src/ships.ts'); const S = m.SHIPS || m.default; if (S) g.save.unlockedShips = Object.keys(S); } catch {}
  // decryptedWords is a string[] (the decoded vocab) — populate ~all of it so codex/story panels
  // show a richly-DECRYPTED city (a number here throws on .includes and breaks every modal).
  try { const m = await import('/src/intercepts.ts'); if (m.vocabulary) g.save.decryptedWords = m.vocabulary(); } catch { g.save.decryptedWords = []; }
  Object.assign(g.save, {
    seenSandbox: true, seenTutorial: true, seenIntro: true,
    highScore: 248600, bestCombo: 91, bestWave: 15, deepestWave: 72,
    shards: 18400, maxHeat: 7, selectedHeat: 4, ngPlusLevel: 2, playStreak: 11,
    lifeKills: 41200, lifeRuns: 318,
  });
  try { g.ui.refreshTitle(g.save); } catch (e) { return 'refresh fail: ' + e.message; }
  return 'ok';
};

// each: open the panel, wait, shoot. Driven by __lf.ui.* (private at TS, reachable at runtime).
const PANELS = [
  { key: 'codebreaker', open: (g) => g.ui.openBombe && g.ui.openBombe() }, // in-cockpit decryption console
  { key: 'skins', open: (g) => g.ui.openSkins && g.ui.openSkins() },       // ship-skins + bestiary gallery
  { key: 'fall', open: (g) => g.ui.showFall && g.ui.showFall() },
  { key: 'codex', open: (g) => g.ui.showCodex && g.ui.showCodex() },
  { key: 'upgrades', open: (g) => g.ui.openUpgrades && g.ui.openUpgrades() },
  { key: 'archetype', open: (g) => g.ui.openArchetype && g.ui.openArchetype() },
  { key: 'cosmetics', open: (g) => g.ui.openCosmetics && g.ui.openCosmetics() },
  { key: 'ranks', open: (g) => g.ui.openLeaderboard && g.ui.openLeaderboard(false) },
  { key: 'stats', open: (g) => g.ui.openStats && g.ui.openStats() },
  { key: 'inspect', open: (g) => g.ui.openInspect && g.ui.openInspect() },
];

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { hmr: false, host: '127.0.0.1' } });
await server.listen();
const URL = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
log('vite (hmr off) @', URL);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('PAGEERR', e.message.slice(0, 100)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
await page.evaluate(SEED);
await sleep(2400);

// ship picker (a click, not an __lf method)
try {
  await page.evaluate(() => { const b = document.querySelector('.ck-change-ship'); if (b) b.click(); });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'ships.png') });
  log('✓ ships');
  await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(300);
} catch (e) { log('✗ ships', e.message); }

for (const p of PANELS) {
  try {
    await page.evaluate(`(${p.open.toString()})(window.__lf)`);
    await sleep(750);
    await page.screenshot({ path: path.join(OUT, p.key + '.png') });
    log('✓', p.key);
  } catch (e) { log('✗', p.key, e.message.slice(0, 80)); }
  await page.keyboard.press('Escape').catch(() => {}); await sleep(250);
  await page.keyboard.press('Escape').catch(() => {}); await sleep(250);
}

await browser.close();
await server.close();
log('done →', OUT);
