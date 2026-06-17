const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 1500, height: 950 });
  const f = 'file:///' + path.resolve(__dirname, '..', 'biomech-bestiary-variants.html').replace(/\\/g, '/') + '?eager=1';
  await p.goto(f);
  await p.waitForTimeout(600);
  await p.evaluate(() => { allCanvasTakes().forEach(t => { unlockedSet[t.key] = true; }); saveStore(); });
  await p.goto(f);                  // reload (eager) — now every skin unlocked + painting
  await p.waitForTimeout(2600);
  await p.screenshot({ path: path.resolve(__dirname, 'gallery-allunlocked.png'), fullPage: true });
  await b.close();
  console.log('rendered all-unlocked showcase');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
