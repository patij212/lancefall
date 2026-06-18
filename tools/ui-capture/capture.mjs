// LANCEFALL UI capture harness — drives the LIVE game (Vite dev) and the design
// MOCKUPS into every UI state and screenshots each at a matched viewport, so the
// gap between "what we shipped" and "what we designed" is visible side by side.
//
//   Live dev server must be running:  npm run dev   (defaults to :5197, falls back)
//   Run:  LIVE_URL=http://localhost:5201 node tools/ui-capture/capture.mjs
//
// Output: tools/ui-capture/out/{live,mock}/<key>.png  +  out/gallery.html
//
// Design notes:
//  - Full-viewport screenshots (not per-element) so a modal/overlay on top of a
//    screen is captured without depending on fragile per-modal selectors.
//  - Live UI is driven via window.__lf (the dev-only Game hook from main.ts);
//    TS `private` is erased at runtime so __lf.ui.<method>() is reachable.
//  - Real draft cards / events are pulled from the Vite-served source modules so
//    the glyph art is authentic, not a hand-stub.
//  - Every shot is best-effort: a failure logs and continues; the gallery shows
//    whatever was captured. This is a diagnostic loop, not a test gate.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..'); // lancefall/
const MOCK_DIR = path.join(ROOT, 'mockups-ui', 'public');
const OUT = path.join(__dirname, 'out');
const OUT_LIVE = path.join(OUT, 'live');
const OUT_MOCK = path.join(OUT, 'mock');

const LIVE_URL = process.env.LIVE_URL || 'http://localhost:5197';
const VW = 1440;
const VH = 900;

// Optional state filter: `node capture.mjs cockpit settings` re-captures only those
// (both sides). The gallery always reads whatever PNGs are on disk, so partial
// re-runs just refresh some cells — exactly what the tight iterate loop needs.
const ONLY = new Set(process.argv.slice(2));
const want = (k) => ONLY.size === 0 || ONLY.has(k);

for (const d of [OUT, OUT_LIVE, OUT_MOCK]) fs.mkdirSync(d, { recursive: true });

const results = []; // { key, title, live?:bool, mock?:bool, note?:string }
const log = (...a) => console.log('[capture]', ...a);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the paired state list. Each entry: live(page) drives the live game into the
//    state; mock = {file, reveal?} loads a mock and reveals the same state. ──────
const STATES = [
  // ---- cockpit / menu ----
  { key: 'cockpit', title: 'Cockpit (title)', live: async () => {}, mock: { file: 'cockpit.html' } },
  { key: 'upgrades', title: 'UPGRADES panel', live: (g) => g.ui.openUpgrades(), mock: { file: 'cockpit.html', reveal: revealMockPanel('UPGRADES') } },
  { key: 'ranks', title: 'RANKS / leaderboard', live: (g) => g.ui.openLeaderboard(false), mock: { file: 'cockpit.html', reveal: revealMockPanel('RANKS') } },
  { key: 'stats', title: 'STATS panel', live: (g) => g.ui.openStats(), mock: { file: 'cockpit.html', reveal: revealMockPanel('STATS') } },
  { key: 'build', title: 'BUILD / archetype', live: (g) => g.ui.openArchetype(), mock: { file: 'cockpit.html', reveal: revealMockPanel('BUILD') } },
  { key: 'codex', title: 'CODEX panel', live: (g) => g.ui.showCodex(), mock: { file: 'cockpit.html', reveal: revealMockPanel('CODEX') } },
  { key: 'fall', title: 'THE FALL panel', live: (g) => g.ui.showFall(), mock: { file: 'cockpit.html', reveal: revealMockPanel('FALL') } },
  { key: 'inspect', title: 'INSPECT panel', live: (g) => g.ui.openInspect(), mock: { file: 'cockpit.html', reveal: revealMockPanel('INSPECT') } },
  { key: 'credits', title: 'CREDITS panel', live: (g) => g.ui.showCredits(), mock: { file: 'cockpit.html', reveal: revealMockPanel('CREDITS') } },
  { key: 'howto', title: 'HOW TO panel', live: (g) => g.ui.showHowTo(), mock: { file: 'cockpit.html', reveal: revealMockPanel('HOW') } },
  { key: 'settings', title: 'SETTINGS panel', live: (g) => g.ui.openSettings(), mock: { file: 'cockpit.html', reveal: revealMockPanel('SETTINGS') } },
  { key: 'heat', title: 'HEAT ladder', live: (g) => g.ui.openHeat(), mock: { file: 'cockpit.html', reveal: revealMockPanel('HEAT') } },
  { key: 'cosmetics', title: 'COSMETICS panel', live: (g) => g.ui.openCosmetics(), mock: { file: 'cockpit.html', reveal: revealMockPanel('COSMETICS') } },
  { key: 'shippicker', title: 'Ship picker', live: async (g, page) => { await page.click('.ck-change-ship').catch(() => {}); }, mock: { file: 'cockpit.html', reveal: revealMockClick('.change-ship-btn') } },

  // ---- title variant (mock has a separate "clean" title) ----
  { key: 'title', title: 'Title (alt)', live: async () => {}, mock: { file: 'title.html' } },
];

// In-run + overlay states (driven separately; see runLive()).
const RUN_STATES = [
  { key: 'hud', title: 'In-game HUD', mock: { file: 'ingame.html' } },
  { key: 'pause', title: 'Pause overlay', mock: { file: 'ingame.html', reveal: revealMockClick('[data-open="pauseOv"]') } },
  { key: 'draft', title: 'Perk DRAFT', mock: { file: 'ingame.html', reveal: revealMockClick('[data-open="draftOv"]') } },
  { key: 'event', title: 'Event choice', mock: { file: 'ingame.html', reveal: revealMockClick('[data-open="eventOv"]') } },
  { key: 'runend_lost', title: 'Run end — defeat', mock: { file: 'runend.html' } },
  { key: 'runend_choice', title: 'Run end — THE CHOICE', mock: { file: 'runend.html' } },
  { key: 'runend_resolved', title: 'THE CHOICE — resolved', mock: { file: 'runend.html', reveal: revealMockClick('.choice.catch') } },
  { key: 'share', title: 'Share preview', mock: { file: 'runend.html' } },
];

// ── mock reveal helpers ───────────────────────────────────────────────────────
// The mock nav buttons render their label as text; click the one containing it.
function revealMockPanel(label) {
  // some mock entry points aren't <button>s (loadout rows, CUSTOMIZE→cosmetics);
  // find the SHORTEST element whose text matches and click it (click bubbles).
  const aliases = { COSMETICS: ['COSMETICS', 'CUSTOMIZE'], HOW: ['HOWTO', 'HOWTOPLAY'] };
  return async (page) => {
    const wants = (aliases[label] || [label]).map((s) => s.toUpperCase().replace(/[^A-Z]/g, ''));
    const opened = await page.evaluate((wants) => {
      const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');
      const els = [...document.querySelectorAll('button, .nav-btn, .lo-row, .lo-key, .cust-btn, .change-ship-btn, [role=button], [onclick], a, div, span')];
      let best = null, bestLen = Infinity;
      for (const el of els) {
        const t = norm(el.textContent);
        if (!t) continue;
        if (wants.some((w) => t.includes(w)) && t.length < bestLen && t.length < 40) { best = el; bestLen = t.length; }
      }
      if (best) { best.click(); return true; }
      return false;
    }, wants).catch(() => false);
    if (!opened) throw new Error(`mock panel "${label}" not found (may not exist in mock)`);
    await sleep(450);
  };
}
function revealMockClick(selector) {
  return async (page) => {
    const el = await page.$(selector);
    if (!el) throw new Error(`mock selector ${selector} not found`);
    await el.click();
    await sleep(600);
  };
}

// ── live driving ──────────────────────────────────────────────────────────────
const POPULATE = async () => {
  // run IN the page: enrich the real (valid) save object, then refresh the title.
  const g = window.__lf;
  if (!g) return 'no __lf';
  const s = g.save;
  try {
    const mod = await import('/src/ships.ts');
    const SHIPS = mod.SHIPS || mod.default;
    if (SHIPS) s.unlockedShips = Object.keys(SHIPS);
  } catch (e) { /* ignore */ }
  Object.assign(s, {
    seenSandbox: true, seenTutorial: true,
    highScore: 184260, bestCombo: 52, bestWave: 15,
    shards: 4200, selectedHeat: 2, maxHeat: 7,
    deepestWave: 60, playStreak: 4, ngPlusLevel: 1,
  });
  try { g.ui.refreshTitle(s); } catch (e) { return 'refresh failed: ' + e.message; }
  // match the mock's selected mode (it shows the Daily "ECHO OF THE FALL") so the
  // cockpit diff compares like-for-like accent instead of cyan-vs-amber.
  try {
    const cards = [...document.querySelectorAll('.ck-mi, .mode-card')];
    const want = cards.find((c) => /ECHO|DAILY/i.test(c.textContent || ''));
    if (want) want.click();
  } catch (e) { /* ignore */ }
  return 'ok';
};

async function shot(page, dir, key) {
  await page.screenshot({ path: path.join(dir, key + '.png') });
}

async function closeLiveModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
}

async function runLive(browser) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('LIVE pageerror:', e.message));

  log('live: goto', LIVE_URL);
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // wait for the dev hook + cockpit to exist
  await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 }).catch(() => log('live: __lf never appeared'));
  await sleep(800);
  const pop = await page.evaluate(POPULATE).catch((e) => 'evaluate threw: ' + e.message);
  log('live: populate →', pop);
  await sleep(2200); // cohRise + coherence-fill + boot-in settle

  // menu states
  for (const st of STATES) {
    if (!want(st.key)) continue;
    try {
      await closeLiveModal(page);
      const r = await page.evaluate(async (key) => {
        const g = window.__lf; if (!g) return 'no __lf';
        return 'ok';
      }, st.key);
      if (typeof st.live === 'function') {
        // run the driver: some need the page (clicks), most just need __lf
        if (st.live.length >= 2) {
          await st.live(null, page); // page-driven (e.g. ship picker click)
        } else {
          await page.evaluate(`(${st.live.toString()})(window.__lf)`);
        }
      }
      await sleep(700);
      await shot(page, OUT_LIVE, st.key);
      results.push({ key: st.key, title: st.title, live: true });
      log('live ✓', st.key);
    } catch (e) {
      results.push({ key: st.key, title: st.title, live: false, note: 'live: ' + e.message });
      log('live ✗', st.key, e.message);
    }
  }
  await closeLiveModal(page);

  // ── in-run: start a real run via a trusted DESCEND click ──
  let playing = false;
  if (want('hud') || want('pause')) try {
    // DESCEND breathes (perpetual transform/glow) and the scaled cockpit frame can
    // push it past the viewport edge, so a real mouse click is unreliable. The run
    // start handler doesn't require a trusted event (sandbox is pre-skipped), so a
    // direct DOM click is the robust path; fall back to a forced mouse click.
    const started = await page.evaluate(() => {
      const b = document.querySelector('.ck-descend');
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
    if (!started) await page.getByRole('button', { name: /descend/i }).click({ force: true, timeout: 5000 });
    await page.waitForSelector('.hud:not(.hidden)', { timeout: 8000 });
    // play a short burst so the HUD shows real values (score odometer, combo, wave,
    // the stamina/overdrive/armor dock) — an empty score-0 frame is an unfair diff.
    const cv = await page.$('#game');
    const box = cv && (await cv.boundingBox());
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        await page.mouse.move(cx + Math.cos(ang) * 280, cy + Math.sin(ang) * 180);
        await page.mouse.down(); await sleep(150); await page.mouse.up();
        await sleep(280);
      }
    }
    await sleep(900); // settle on a representative mid-run frame
    if (want('hud')) { await shot(page, OUT_LIVE, 'hud'); results.push({ key: 'hud', title: 'In-game HUD', live: true }); log('live ✓ hud'); }
    playing = true;
  } catch (e) {
    results.push({ key: 'hud', title: 'In-game HUD', live: false, note: 'live: ' + e.message });
    log('live ✗ hud', e.message);
  }

  // pause
  if (want('pause')) try {
    if (!playing) throw new Error('not in a run');
    await page.evaluate(() => window.__lf.pause && window.__lf.pause());
    await sleep(500);
    await shot(page, OUT_LIVE, 'pause');
    results.push({ key: 'pause', title: 'Pause overlay', live: true });
    log('live ✓ pause');
  } catch (e) {
    results.push({ key: 'pause', title: 'Pause overlay', live: false, note: 'live: ' + e.message });
    log('live ✗ pause', e.message);
  }

  // overlays from a clean title context (show* swaps the screen regardless of state)
  try { await page.evaluate(() => window.__lf.toTitle && window.__lf.toTitle()); await sleep(400); } catch {}

  // draft — real cards from the Vite source modules
  if (want('draft')) try {
    const r = await page.evaluate(async () => {
      const g = window.__lf;
      const [perks, evos] = await Promise.all([import('/src/perks.ts'), import('/src/evolutions.ts')]);
      const P = Object.values(perks.PERKS);
      const E = Object.values(evos.EVOLUTIONS);
      const cards = [P[0], P[1], E[0]].filter(Boolean);
      g.ui.showDraft(cards);
      return cards.length + ' cards';
    });
    await sleep(700);
    await shot(page, OUT_LIVE, 'draft');
    results.push({ key: 'draft', title: 'Perk DRAFT', live: true });
    log('live ✓ draft', r);
  } catch (e) {
    results.push({ key: 'draft', title: 'Perk DRAFT', live: false, note: 'live: ' + e.message });
    log('live ✗ draft', e.message);
  }

  // event
  if (want('event')) try {
    await page.evaluate(() => {
      const g = window.__lf;
      const noop = () => {};
      const choices = [
        { id: 'keen', name: 'Keen Spear', desc: '+1 dash damage, permanently.', accent: '#f97316', risk: 'none', resolve: noop },
        { id: 'reserves', name: 'Deep Reserves', desc: '+1 stamina segment and faster regen.', accent: '#34d399', risk: 'low', resolve: noop },
        { id: 'gamble', name: 'Glory or Dust', desc: '+50% score, but one less revive.', accent: '#fb7185', risk: 'high', resolve: noop },
      ];
      g.ui.showEvent('SHRINE OF THE LANCE', 'An old altar hums. Take one blessing — it lasts the run.', '#22d3ee', choices, '✦');
    });
    await sleep(700);
    await shot(page, OUT_LIVE, 'event');
    results.push({ key: 'event', title: 'Event choice', live: true });
    log('live ✓ event');
  } catch (e) {
    results.push({ key: 'event', title: 'Event choice', live: false, note: 'live: ' + e.message });
    log('live ✗ event', e.message);
  }

  const goBase = {
    score: 184260, combo: 52, wave: 15, time: 848, newBest: true, daily: false,
    highScore: 162000, shardsEarned: 420, dailyBest: 0, ship: 'THE LAST LANCE',
    perks: 'Long Lance · Chain Reaction · Overdrive Core', mode: 'Endless',
    pbDelta: 22260, newAchievements: ['WAVE 15', 'COMBO 50'],
    mutators: [{ name: 'FRENZY', accent: '#fb7185' }],
  };

  // run end — defeat
  if (want('runend_lost')) try {
    await page.evaluate((info) => window.__lf.ui.showGameOver(info), { ...goBase, won: false, deathCause: 'felled by a Lancer', nemesis: 'THE WARDEN ×4' });
    await sleep(1400);
    await shot(page, OUT_LIVE, 'runend_lost');
    results.push({ key: 'runend_lost', title: 'Run end — defeat', live: true });
    log('live ✓ runend_lost');
  } catch (e) {
    results.push({ key: 'runend_lost', title: 'Run end — defeat', live: false, note: 'live: ' + e.message });
    log('live ✗ runend_lost', e.message);
  }

  // run end — THE CHOICE (Sovereign win pending)
  if (want('runend_choice')) try {
    await page.evaluate((info) => window.__lf.ui.showGameOver(info), { ...goBase, won: true, choicePending: true, canReplay: true, deathCause: '', nemesis: '', clearTime: 720, hitsTaken: 0 });
    await sleep(1400);
    await shot(page, OUT_LIVE, 'runend_choice');
    results.push({ key: 'runend_choice', title: 'Run end — THE CHOICE', live: true });
    log('live ✓ runend_choice');
  } catch (e) {
    results.push({ key: 'runend_choice', title: 'Run end — THE CHOICE', live: false, note: 'live: ' + e.message });
    log('live ✗ runend_choice', e.message);
  }

  // THE CHOICE — resolved (catch)
  if (want('runend_resolved')) try {
    await page.evaluate(async () => {
      const g = window.__lf;
      let head = 'FIRST LIGHT HELD', line = 'The dawn goes on.';
      try { const sp = await import('/src/stillpoint.ts'); const e = sp.choiceEnding('catch'); head = e.head; line = e.line; } catch {}
      g.ui.resolveChoice(head, line);
    });
    await sleep(1000);
    await shot(page, OUT_LIVE, 'runend_resolved');
    results.push({ key: 'runend_resolved', title: 'THE CHOICE — resolved', live: true });
    log('live ✓ runend_resolved');
  } catch (e) {
    results.push({ key: 'runend_resolved', title: 'THE CHOICE — resolved', live: false, note: 'live: ' + e.message });
    log('live ✗ runend_resolved', e.message);
  }

  // share preview — synthesize a real PNG blob so the <img> renders
  if (want('share')) try {
    await page.evaluate(async () => {
      const g = window.__lf;
      const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
      const cx = cv.getContext('2d');
      const grd = cx.createLinearGradient(0, 0, 480, 270);
      grd.addColorStop(0, '#0a0b0f'); grd.addColorStop(1, '#1a2440');
      cx.fillStyle = grd; cx.fillRect(0, 0, 480, 270);
      cx.fillStyle = '#22d3ee'; cx.font = 'bold 28px sans-serif'; cx.fillText('THE LAST LANCE', 110, 140);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      g.ui.showSharePreview({ blob, caption: 'THE LAST LANCE — 184,260 pts. How much can you hold?' });
    });
    await sleep(700);
    await shot(page, OUT_LIVE, 'share');
    results.push({ key: 'share', title: 'Share preview', live: true });
    log('live ✓ share');
  } catch (e) {
    results.push({ key: 'share', title: 'Share preview', live: false, note: 'live: ' + e.message });
    log('live ✗ share', e.message);
  }

  await ctx.close();
}

// ── mock driving ──────────────────────────────────────────────────────────────
async function runMock(browser) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const all = [...STATES, ...RUN_STATES].filter((s) => s.mock && want(s.key));
  for (const st of all) {
    const page = await ctx.newPage();
    const url = pathToFileURL(path.join(MOCK_DIR, st.mock.file)).href;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await sleep(st.mock.file === 'runend.html' ? 2600 : st.mock.file === 'ingame.html' ? 600 : 2200);
      if (st.mock.reveal) await st.mock.reveal(page);
      await shot(page, OUT_MOCK, st.key);
      const row = results.find((r) => r.key === st.key);
      if (row) row.mock = true; else results.push({ key: st.key, title: st.title, mock: true });
      log('mock ✓', st.key);
    } catch (e) {
      const row = results.find((r) => r.key === st.key);
      if (row) { row.mock = false; row.note = (row.note ? row.note + ' | ' : '') + 'mock: ' + e.message; }
      else results.push({ key: st.key, title: st.title, mock: false, note: 'mock: ' + e.message });
      log('mock ✗', st.key, e.message);
    }
    await page.close();
  }
  await ctx.close();
}

// ── gallery ───────────────────────────────────────────────────────────────────
function buildGallery() {
  // unify keys preserving STATES then RUN_STATES order
  const order = [...STATES, ...RUN_STATES].map((s) => s.key);
  const seen = new Set();
  const rows = [];
  for (const key of order) {
    if (seen.has(key)) continue; seen.add(key);
    const r = results.find((x) => x.key === key) || { key };
    const liveImg = fs.existsSync(path.join(OUT_LIVE, key + '.png')) ? `live/${key}.png` : null;
    const mockImg = fs.existsSync(path.join(OUT_MOCK, key + '.png')) ? `mock/${key}.png` : null;
    rows.push({ ...r, title: r.title || key, liveImg, mockImg });
  }
  const cell = (img, label) => img
    ? `<figure><figcaption>${label}</figcaption><img loading="lazy" src="${img}"></figure>`
    : `<figure class="missing"><figcaption>${label}</figcaption><div class="none">— not captured —</div></figure>`;
  const body = rows.map((r) => `
    <section>
      <h2>${r.title} <span class="key">${r.key}</span></h2>
      ${r.note ? `<p class="note">${r.note}</p>` : ''}
      <div class="pair">
        ${cell(r.liveImg, 'LIVE (shipped)')}
        ${cell(r.mockImg, 'MOCK (target)')}
      </div>
    </section>`).join('\n');
  const html = `<!doctype html><meta charset=utf-8><title>LANCEFALL UI gap — live vs mock</title>
<style>
  body{margin:0;background:#0a0b0f;color:#e6e8ef;font:14px/1.5 system-ui,sans-serif}
  header{padding:24px 32px;border-bottom:1px solid #2a2c38;position:sticky;top:0;background:#0a0b0fee;backdrop-filter:blur(6px);z-index:2}
  h1{margin:0;font-size:20px;letter-spacing:.04em}
  .sub{color:#8b8d99;margin-top:4px}
  section{padding:24px 32px;border-bottom:1px solid #1a1c24}
  h2{font-size:15px;margin:0 0 10px;letter-spacing:.06em;text-transform:uppercase}
  .key{color:#5b6b80;font-weight:400;font-size:12px;margin-left:8px;font-family:ui-monospace,monospace}
  .note{color:#fbbf24;font-size:12px;margin:0 0 10px;font-family:ui-monospace,monospace}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  figure{margin:0;background:#000;border:1px solid #2a2c38;border-radius:8px;overflow:hidden}
  figcaption{padding:6px 10px;font-size:11px;letter-spacing:.08em;color:#8b8d99;border-bottom:1px solid #2a2c38;text-transform:uppercase}
  img{display:block;width:100%;height:auto}
  .missing .none{padding:60px 10px;text-align:center;color:#5b6b80}
  @media(max-width:1000px){.pair{grid-template-columns:1fr}}
</style>
<header><h1>LANCEFALL — UI gap: <span style="color:#22d3ee">LIVE</span> vs <span style="color:#fbbf24">MOCK</span></h1>
<div class="sub">${rows.length} states · viewport ${VW}×${VH} · live=${LIVE_URL}</div></header>
${body}`;
  fs.writeFileSync(path.join(OUT, 'gallery.html'), html);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log('gallery →', path.join(OUT, 'gallery.html'));
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  try {
    await runLive(browser);
    await runMock(browser);
  } finally {
    await browser.close();
  }
  buildGallery();
  const ok = results.filter((r) => r.live || r.mock).length;
  log(`done — ${ok}/${results.length} states captured (some side).`);
})();
