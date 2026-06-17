const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const targets = [
    ['proposal-b-biomech.html', 'proposal-b-verify.png'],
  ];
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 720 });
  for (const [src, out] of targets) {
    const f = 'file:///' + path.resolve(__dirname, '..', src).replace(/\\/g, '/');
    await p.goto(f);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.resolve(__dirname, out) });
    console.log('rendered', src, '->', out);
  }
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
