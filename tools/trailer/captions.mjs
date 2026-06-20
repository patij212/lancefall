// Render the trailer's lower-third captions + the end card as transparent 1920x1080 PNGs,
// using LANCEFALL's own brand fonts (Orbitron / Rajdhani / Space Grotesk) for a matched look.
//   node tools/trailer/captions.mjs
// Output: tools/trailer/assets/cap_<id>.png  +  card_end.png  +  card_title.png
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(__dirname, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

const W = 1920, H = 1080;
const fontDir = (f) => path.join(ROOT, 'node_modules', '@fontsource', f, 'files');
const dataUri = (p) => 'data:font/woff2;base64,' + fs.readFileSync(p).toString('base64');
const FONTS = `
@font-face{font-family:'Orbitron';font-weight:800;src:url('${dataUri(path.join(fontDir('orbitron'), 'orbitron-latin-800-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Orbitron';font-weight:900;src:url('${dataUri(path.join(fontDir('orbitron'), 'orbitron-latin-900-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:600;src:url('${dataUri(path.join(fontDir('rajdhani'), 'rajdhani-latin-600-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:700;src:url('${dataUri(path.join(fontDir('rajdhani'), 'rajdhani-latin-700-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Space Grotesk';font-weight:500;src:url('${dataUri(path.join(fontDir('space-grotesk'), 'space-grotesk-latin-500-normal.woff2'))}') format('woff2');}
`;

const CYAN = '#22d3ee', AMBER = '#fbbf24', GOLD = '#fde047', VIOLET = '#a78bfa';

// Lower-third captions — one per trailer beat. `accent` tints the bar + label glow.
const CAPTIONS = [
  { id: 'fall', label: 'THE FALL', line: 'A kingdom of living light. The Six who let it fall <b>enciphered</b> it into grey.', accent: CYAN },
  { id: 'verb', label: 'ONE VERB', line: 'You are the last key. You don’t shoot — you <b>dash</b> a spear of light.', accent: CYAN },
  { id: 'coherence', label: 'COHERENCE', line: 'Chain the kills. The grey burns off. The city <b>remembers</b>.', accent: CYAN },
  { id: 'readkey', label: 'READ THE KEY', line: 'Every boss is a cipher. <b>Read the key</b> — and decode it under fire.', accent: AMBER },
  { id: 'solstice', label: 'SOLSTICE PROTOCOL', line: 'Every boss, a code to break. Six ships. Stacking drafts. A daily everyone shares.', accent: AMBER },
  { id: 'mirror', label: 'THE IMITATION GAME', line: 'The Mirrorblade moves as you do. <b>Tell me which of us is real.</b>', accent: VIOLET },
  { id: 'daybreak', label: 'DAYBREAK', line: 'Charge the light. A death isn’t always the end.', accent: AMBER },
  { id: 'choice', label: 'THE CHOICE', line: 'The one cipher no machine can solve — only <b>choose</b>.', accent: GOLD },
  { id: 'firstlight', label: 'FIRST LIGHT', line: 'Break the last code. Bring back the <b>longest day</b>.', accent: GOLD },
];

function lowerThirdHTML(c) {
  return `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  .lt{position:absolute;left:96px;bottom:118px;max-width:1360px}
  .bar{width:64px;height:5px;background:${c.accent};box-shadow:0 0 16px ${c.accent};margin-bottom:18px;border-radius:2px}
  .label{font-family:'Rajdhani';font-weight:700;font-size:26px;letter-spacing:.42em;color:${c.accent};
    text-shadow:0 0 18px ${c.accent}99;margin-bottom:10px}
  .line{font-family:'Space Grotesk';font-weight:500;font-size:50px;line-height:1.16;color:#eef3ff;
    text-shadow:0 3px 22px #000c,0 0 2px #000}
  .line b{color:#fff;font-weight:500;text-shadow:0 0 22px ${c.accent}cc,0 3px 22px #000c}
  </style><div class="lt"><div class="bar"></div><div class="label">${c.label}</div>
  <div class="line">${c.line}</div></div>`;
}

const END_HTML = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;
    display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .logo{font-family:'Orbitron';font-weight:900;font-size:128px;letter-spacing:.06em;color:#eafcff;
    text-shadow:0 0 40px ${CYAN}aa,0 0 80px ${CYAN}55}
  .sub{font-family:'Rajdhani';font-weight:700;font-size:40px;letter-spacing:.52em;color:${AMBER};
    text-shadow:0 0 24px ${AMBER}88;margin-top:6px}
  .url{font-family:'Space Grotesk';font-weight:500;font-size:42px;color:#fff;margin-top:40px;letter-spacing:.04em}
  .jam{font-family:'Rajdhani';font-weight:600;font-size:26px;letter-spacing:.32em;color:#9fb2c8;margin-top:16px}
  .cred{position:absolute;bottom:38px;left:0;right:0;text-align:center;font-family:'Space Grotesk';
    font-weight:500;font-size:17px;color:#5f7088;letter-spacing:.02em}
  </style>
  <div class="wrap"><div class="logo">LANCEFALL</div><div class="sub">THE LAST KEY</div>
  <div class="url">lancefall.pages.dev</div>
  <div class="jam">JUNE GAME JAM · AN ODE TO ALAN TURING</div></div>
  <div class="cred">Music: Punch Deck &amp; FSM Team / &lt;e s c p&gt; (CC BY) · SFX: Kenney (CC0) · Built in TypeScript, no engine</div>`;

const TITLE_HTML = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;
    display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .logo{font-family:'Orbitron';font-weight:900;font-size:150px;letter-spacing:.06em;color:#eafcff;
    text-shadow:0 0 50px ${CYAN}aa,0 0 100px ${CYAN}44}
  .sub{font-family:'Rajdhani';font-weight:700;font-size:46px;letter-spacing:.6em;color:${AMBER};
    text-shadow:0 0 26px ${AMBER}88;margin-top:10px}
  </style><div class="wrap"><div class="logo">LANCEFALL</div><div class="sub">THE LAST KEY</div></div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const render = async (html, out) => {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(ASSETS, out), omitBackground: true });
    console.log('[captions] ✓', out);
  };
  for (const c of CAPTIONS) await render(lowerThirdHTML(c), `cap_${c.id}.png`);
  await render(END_HTML, 'card_end.png');
  await render(TITLE_HTML, 'card_title.png');
  await browser.close();
})();
