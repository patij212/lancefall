const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.setViewportSize({ width: 1500, height: 900 });
  await p.goto('https://lancefall-mockups.patij212.workers.dev/bestiary');
  await p.waitForTimeout(2500);
  const stats = await p.evaluate(() => {
    const cvs = Array.from(document.querySelectorAll('canvas'));
    let painted = 0, blank = 0;
    for (const cv of cvs) {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let nz = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nz++;
      if (nz > 80) painted++; else blank++;
    }
    return { canvases: cvs.length, painted, blank, entities: document.querySelectorAll('.entity').length };
  });
  await b.close();
  console.log('LIVE bestiary:', JSON.stringify(stats), '| console errors:', errs.length ? errs : 'none');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
