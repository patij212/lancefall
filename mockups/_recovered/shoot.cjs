const { chromium } = require('playwright');
const path = require('path');

// usage: node shoot.cjs <relative-html> <out.png> [waitMs] [width] [fullPage(0|1)]
const src = process.argv[2] || 'biomech-bestiary-variants.html';
const out = process.argv[3] || 'bestiary-verify.png';
const waitMs = parseInt(process.argv[4] || '2200', 10);
const width = parseInt(process.argv[5] || '1500', 10);
const fullPage = (process.argv[6] || '1') === '1';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  await p.setViewportSize({ width, height: 900 });
  const f = 'file:///' + path.resolve(__dirname, '..', src).replace(/\\/g, '/') + '?eager=1';
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(f);
  await p.waitForTimeout(waitMs);
  await p.screenshot({ path: path.resolve(__dirname, out), fullPage });
  await b.close();
  console.log('rendered', src, '->', out, '| console errors:', errs.length ? errs : 'none');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
