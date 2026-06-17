const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.setViewportSize({ width: 1400, height: 900 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  const f = 'file:///' + path.resolve(__dirname, '..', 'biomech-bestiary-variants.html').replace(/\\/g, '/');
  await p.goto(f);
  await p.waitForTimeout(1500);
  // sample a hero canvas to confirm it painted a static frame (non-blank)
  const painted = await p.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return 'no-canvas';
    const cx = cv.getContext('2d');
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let nonZero = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonZero++;
    return nonZero > 50 ? 'painted(' + nonZero + ')' : 'blank';
  });
  await b.close();
  console.log('reduced-motion:', 'errors=', errs.length ? errs : 'none', '| firstCanvas=', painted);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
