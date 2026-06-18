// Region-level live-vs-mock comparison. Element screenshots are tightly cropped to
// each component, so they display at real detail (full-screen shots get downscaled to
// unreadable thumbnails). Also dumps computed styles for an exact numeric diff.
//
//   LIVE_URL=http://localhost:5201 node tools/ui-capture/compare.mjs cockpit
//
// Output: out/regions/<region>.{live,mock}.png  +  printed style diff per region.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MOCK_DIR = path.join(ROOT, 'mockups-ui', 'public');
const OUT = path.join(__dirname, 'out', 'regions');
const LIVE_URL = process.env.LIVE_URL || 'http://localhost:5197';
const VW = 1440, VH = 900;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// regions: { name, live, mock } selector pairs per state.
const REGIONS = {
  cockpit: [
    { name: 'header', live: '.ck-header', mock: '.header' },
    { name: 'coherence', live: '.ck-coh', mock: '.coherence-wrap' },
    { name: 'mode-selected', live: '.ck-mi.selected', mock: '.mi.sel' },
    { name: 'mode-unselected', live: '.ck-mi:not(.selected)', mock: '.mi:not(.sel)' },
    { name: 'hero', live: '.ck-hero', mock: '.hero' },
    { name: 'ship', live: '.ck-ship-display', mock: '.ship-display' },
    { name: 'loadout-row', live: '.ck-lo-row', mock: '.lo-row' },
    { name: 'nav-btn', live: '.ck-nav-btn', mock: '.nav-btn' },
  ],
};

// computed-style props worth diffing.
const PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'lineHeight',
  'color', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow',
  'padding', 'gap', 'width', 'height', 'opacity', 'textShadow',
];

async function styleOf(page, sel) {
  return page.evaluate(({ sel, props }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = { _box: `${Math.round(r.width)}x${Math.round(r.height)}` };
    for (const p of props) o[p] = cs[p];
    return o;
  }, { sel, props: PROPS });
}

function shorten(v) {
  if (typeof v !== 'string') return v;
  return v.length > 64 ? v.slice(0, 61) + '…' : v;
}

async function snapPair(livePage, mockPage, region) {
  const lEl = await livePage.$(region.live);
  const mEl = await mockPage.$(region.mock);
  if (lEl) await lEl.screenshot({ path: path.join(OUT, `${region.name}.live.png`) }).catch((e) => console.log('live shot fail', region.name, e.message));
  if (mEl) await mEl.screenshot({ path: path.join(OUT, `${region.name}.mock.png`) }).catch((e) => console.log('mock shot fail', region.name, e.message));
  const lS = await styleOf(livePage, region.live);
  const mS = await styleOf(mockPage, region.mock);
  console.log(`\n=== ${region.name}  (live ${region.live}  vs  mock ${region.mock}) ===`);
  if (!lS) { console.log('  LIVE element MISSING'); }
  if (!mS) { console.log('  MOCK element MISSING'); }
  if (lS && mS) {
    console.log(`  box: live ${lS._box}  |  mock ${mS._box}`);
    for (const p of PROPS) {
      if (lS[p] !== mS[p]) console.log(`  ${p}:\n     live: ${shorten(lS[p])}\n     mock: ${shorten(mS[p])}`);
    }
  }
}

(async () => {
  const state = process.argv[2] || 'cockpit';
  const regions = REGIONS[state];
  if (!regions) { console.log('no region map for', state); process.exit(1); }

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });

  // LIVE
  const live = await ctx.newPage();
  await live.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await live.waitForFunction(() => !!window.__lf, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  await live.evaluate(async () => {
    const g = window.__lf; if (!g) return;
    const s = g.save;
    try { const m = await import('/src/ships.ts'); if (m.SHIPS) s.unlockedShips = Object.keys(m.SHIPS); } catch {}
    Object.assign(s, { seenSandbox: true, highScore: 184260, bestCombo: 52, shards: 4200, selectedHeat: 2, maxHeat: 7, deepestWave: 60, ngPlusLevel: 1 });
    try { g.ui.refreshTitle(s); } catch {}
    try { const c = [...document.querySelectorAll('.ck-mi, .mode-card')].find((x) => /ECHO|DAILY/i.test(x.textContent || '')); if (c) c.click(); } catch {}
  });
  await sleep(2400);

  // MOCK
  const mock = await ctx.newPage();
  await mock.goto(pathToFileURL(path.join(MOCK_DIR, 'cockpit.html')).href, { waitUntil: 'load', timeout: 20000 });
  await sleep(2400);

  for (const region of regions) await snapPair(live, mock, region);

  await browser.close();
  console.log('\nregion crops →', OUT);
})();
