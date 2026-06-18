// Panel-level comparison: opens each nav panel on live + mock and element-screenshots
// the panel CARD (sharper than a downscaled full-screen shot), so panel content gaps
// are visible. LIVE_URL=http://localhost:5201 node tools/ui-capture/panels.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MOCK = path.join(ROOT, 'mockups-ui', 'public', 'cockpit.html');
const OUT = path.join(__dirname, 'out', 'panels');
const LIVE_URL = process.env.LIVE_URL || 'http://localhost:5197';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// key = output name; method = live UI opener; label = mock nav button text.
const PANELS = [
  { key: 'upgrades', method: 'openUpgrades', label: 'UPGRADES' },
  { key: 'stats', method: 'openStats', label: 'STATS' },
  { key: 'codex', method: 'showCodex', label: 'CODEX' },
  { key: 'ranks', method: 'openLeaderboard', label: 'RANKS' },
];

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  const live = await ctx.newPage();
  await live.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await live.waitForFunction(() => !!window.__lf, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  await live.evaluate(async () => {
    const g = window.__lf; if (!g) return;
    const s = g.save;
    try { const m = await import('/src/ships.ts'); if (m.SHIPS) s.unlockedShips = Object.keys(m.SHIPS); } catch {}
    Object.assign(s, { seenSandbox: true, highScore: 184260, bestCombo: 52, shards: 4200, selectedHeat: 2, maxHeat: 7, deepestWave: 60, ngPlusLevel: 1, lifeKills: 15420, lifeBoss: 8, lifeWins: 3 });
    try { g.ui.refreshTitle(s); } catch {}
  });
  await sleep(1500);

  const mock = await ctx.newPage();
  await mock.goto(pathToFileURL(MOCK).href, { waitUntil: 'load', timeout: 20000 });
  await sleep(2400);

  for (const p of PANELS) {
    // LIVE: open via method, shoot the visible modal card
    try {
      await live.keyboard.press('Escape').catch(() => {});
      await sleep(150);
      await live.evaluate((m) => { try { window.__lf.ui[m](); } catch (e) { /* some are private — still callable */ } }, p.method);
      await sleep(600);
      const card = await live.$('.screen-modal:not(.hidden) .panel');
      if (card) await card.screenshot({ path: path.join(OUT, `${p.key}.live.png`) });
      else console.log('LIVE card missing for', p.key);
    } catch (e) { console.log('live', p.key, e.message); }
    // MOCK: click nav button by text, shoot the modal card
    try {
      await mock.keyboard.press('Escape').catch(() => {});
      await sleep(150);
      const opened = await mock.evaluate((label) => {
        const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');
        const want = norm(label);
        const els = [...document.querySelectorAll('button, .nav-btn, [onclick], a')];
        const hit = els.find((e) => norm(e.textContent).includes(want) && norm(e.textContent).length < 24);
        if (hit) { hit.click(); return true; }
        return false;
      }, p.label);
      await sleep(600);
      const card = await mock.$('.modal-card, .modal.open .modal-card');
      if (opened && card) await card.screenshot({ path: path.join(OUT, `${p.key}.mock.png`) });
      else console.log('MOCK card missing for', p.key, 'opened=', opened);
    } catch (e) { console.log('mock', p.key, e.message); }
    console.log('panel', p.key, 'done');
  }

  await browser.close();
  console.log('panel crops →', OUT);
})();
