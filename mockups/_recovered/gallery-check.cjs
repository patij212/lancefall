const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.setViewportSize({ width: 1500, height: 950 });
  const f = 'file:///' + path.resolve(__dirname, '..', 'biomech-bestiary-variants.html').replace(/\\/g, '/');
  await p.goto(f);
  await p.waitForTimeout(1400);

  const before = await p.evaluate(() => ({
    prog: (document.getElementById('prog') || {}).textContent,
    locked: document.querySelectorAll('.card.locked').length,
    unlocked: document.querySelectorAll('.card.unlocked').length,
    legendHTML: !!document.querySelector('#legend .tier')
  }));

  // single unlock: click the first locked card's lockwrap
  await p.evaluate(() => { const l = document.querySelector('.card.locked .lockwrap'); if (l) l.click(); });
  await p.waitForTimeout(750);
  const afterOne = await p.evaluate(() => ({ locked: document.querySelectorAll('.card.locked').length, prog: (document.getElementById('prog')||{}).textContent }));

  // unlock all (this reloads the page)
  await p.evaluate(() => document.getElementById('b-all').click());
  await p.waitForTimeout(2600);
  const allState = await p.evaluate(() => {
    const cvs = Array.from(document.querySelectorAll('.card.unlocked canvas'));
    let painted = 0;
    for (const cv of cvs) { const d = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let nz=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) nz++; if (nz>80) painted++; }
    return { unlockedCanvases: cvs.length, painted, prog: (document.getElementById('prog')||{}).textContent };
  });

  // rough frame health: count rAF ticks over 1s
  const fps = await p.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function tick(){ n++; if (performance.now()-t0 < 1000) requestAnimationFrame(tick); else res(n); })();
  }));

  await b.close();
  console.log('BEFORE', JSON.stringify(before));
  console.log('AFTER 1 click', JSON.stringify(afterOne));
  console.log('UNLOCK ALL', JSON.stringify(allState));
  console.log('~fps (all unlocked):', fps, '| console errors:', errs.length ? errs : 'none');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
