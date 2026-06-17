const { chromium } = require('playwright');
const path = require('path');

// usage: node closeup.cjs <html> <out-prefix> <entityName1,entityName2,...> [waitMs]
const src = process.argv[2] || 'biomech-bestiary-variants.html';
const prefix = process.argv[3] || 'closeup';
const names = (process.argv[4] || 'DARTER').split(',');
const waitMs = parseInt(process.argv[5] || '2400', 10);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  await p.setViewportSize({ width: 1400, height: 900 });
  const f = 'file:///' + path.resolve(__dirname, '..', src).replace(/\\/g, '/') + '?eager=1';
  await p.goto(f);
  await p.waitForTimeout(waitMs);
  for (const name of names) {
    const handle = await p.evaluateHandle((nm) => {
      const heads = Array.from(document.querySelectorAll('.entity'));
      return heads.find((e) => e.querySelector('.nm') && e.querySelector('.nm').textContent.trim() === nm) || null;
    }, name);
    const el = handle.asElement();
    if (el) {
      const safe = name.replace(/[^A-Z0-9]/gi, '').toLowerCase();
      await el.screenshot({ path: path.resolve(__dirname, prefix + '-' + safe + '.png') });
      console.log('shot', name);
    } else {
      console.log('NOT FOUND', name);
    }
  }
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
