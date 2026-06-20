// Render the trailer's lower-third captions + end/title cards as transparent 1920x1080 PNGs,
// in LANCEFALL's brand fonts (Orbitron / Rajdhani / Space Grotesk). Cinematic lower-third:
// a soft bottom scrim for legibility, a branded ◈ kicker with an accent rule, refined type.
//   node tools/trailer/captions.mjs
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
const uri = (p) => 'data:font/woff2;base64,' + fs.readFileSync(p).toString('base64');
const FONTS = `
@font-face{font-family:'Orbitron';font-weight:800;src:url('${uri(path.join(fontDir('orbitron'), 'orbitron-latin-800-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Orbitron';font-weight:900;src:url('${uri(path.join(fontDir('orbitron'), 'orbitron-latin-900-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:600;src:url('${uri(path.join(fontDir('rajdhani'), 'rajdhani-latin-600-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Rajdhani';font-weight:700;src:url('${uri(path.join(fontDir('rajdhani'), 'rajdhani-latin-700-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Space Grotesk';font-weight:400;src:url('${uri(path.join(fontDir('space-grotesk'), 'space-grotesk-latin-400-normal.woff2'))}') format('woff2');}
@font-face{font-family:'Space Grotesk';font-weight:500;src:url('${uri(path.join(fontDir('space-grotesk'), 'space-grotesk-latin-500-normal.woff2'))}') format('woff2');}
`;

const CYAN = '#34d8f0', AMBER = '#f5b942', GOLD = '#ffd54a', VIOLET = '#b08cff', ROSE = '#ff5d7e';

const CAPTIONS = [
  { id: 'bosses', label: 'BULLET-HELL', line: 'Twelve enemies. Six bosses. A sky of fire — and one spear to thread it.', accent: ROSE },
  { id: 'fall', label: 'THE FALL', line: 'A kingdom of living light — until the Six who let it fall <b>enciphered</b> it into grey.', accent: CYAN },
  { id: 'verb', label: 'ONE VERB', line: 'You are the last key. You don’t shoot — you <b>dash</b> a spear of light.', accent: CYAN },
  { id: 'flow1', label: 'THE CHAIN', line: 'Spear a cluster, graze the gap, dash again — and the <b>combo never breaks</b>.', accent: CYAN },
  { id: 'flow2', label: 'FLOW STATE', line: 'Momentum is the only weapon. Read the swarm; <b>never stop moving</b>.', accent: VIOLET },
  { id: 'coherence', label: 'COHERENCE', line: 'Chain the kills. The grey burns off. The city <b>remembers</b>.', accent: CYAN },
  { id: 'readkey', label: 'READ THE KEY', line: 'Every boss is a cipher. <b>Read the key</b> — and decode it under fire.', accent: AMBER },
  { id: 'solstice', label: 'SOLSTICE PROTOCOL', line: 'Every boss, a code to break. Six ships, stacking drafts, a daily everyone shares.', accent: AMBER },
  { id: 'sovereign', label: 'THE SOVEREIGN', line: 'The master cipher — a stepping rotor that re-scrambles with every key.', accent: AMBER },
  { id: 'mirror', label: 'THE IMITATION GAME', line: 'The Mirrorblade moves as you do. <b>Tell me which of us is real.</b>', accent: VIOLET },
  { id: 'daybreak', label: 'DAYBREAK', line: 'Charge the light. A death isn’t always the end.', accent: AMBER },
  { id: 'choice', label: 'THE CHOICE', line: 'The one cipher no machine can solve — only <b>choose</b>.', accent: GOLD },
  { id: 'firstlight', label: 'FIRST LIGHT', line: 'Break the last code. Bring back the <b>longest day</b>.', accent: GOLD },
];

function lowerThird(c) {
  return `<!doctype html><meta charset=utf-8><style>${FONTS}
  *{margin:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  /* cinematic legibility scrim — gentle, confined to the lower band */
  .scrim{position:absolute;left:0;right:0;bottom:0;height:42%;
    background:linear-gradient(to top, rgba(3,5,12,.82) 0%, rgba(3,5,12,.55) 34%, rgba(3,5,12,.18) 66%, transparent 100%);}
  .lt{position:absolute;left:104px;bottom:104px;max-width:1260px}
  .kicker{display:flex;align-items:center;gap:14px;margin-bottom:16px}
  .rule{width:46px;height:2px;background:${c.accent};box-shadow:0 0 12px ${c.accent};}
  .dia{width:9px;height:9px;background:${c.accent};transform:rotate(45deg);box-shadow:0 0 12px ${c.accent};}
  .label{font-family:'Rajdhani';font-weight:700;font-size:25px;letter-spacing:.46em;color:${c.accent};
    text-shadow:0 0 20px ${c.accent}cc;}
  .line{font-family:'Space Grotesk';font-weight:400;font-size:52px;line-height:1.18;color:#f2f6ff;
    text-shadow:0 2px 26px rgba(0,0,0,.7);letter-spacing:.004em;}
  .line b{font-weight:500;color:#fff;text-shadow:0 0 26px ${c.accent}, 0 2px 26px rgba(0,0,0,.7);}
  </style>
  <div class="scrim"></div>
  <div class="lt">
    <div class="kicker"><span class="rule"></span><span class="dia"></span><span class="label">${c.label}</span></div>
    <div class="line">${c.line}</div>
  </div>`;
}

const END = `<!doctype html><meta charset=utf-8><style>${FONTS}
  *{margin:0}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .logo{font-family:'Orbitron';font-weight:900;font-size:132px;letter-spacing:.05em;
    background:linear-gradient(90deg,${CYAN},#9fd8ff 55%,${VIOLET});-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 0 36px ${CYAN}77);}
  .sub{font-family:'Rajdhani';font-weight:700;font-size:38px;letter-spacing:.54em;color:${AMBER};text-shadow:0 0 22px ${AMBER}88;margin-top:8px}
  .url{font-family:'Space Grotesk';font-weight:500;font-size:40px;color:#fff;margin-top:42px;letter-spacing:.03em}
  .jam{font-family:'Rajdhani';font-weight:600;font-size:25px;letter-spacing:.34em;color:#9fb2c8;margin-top:14px}
  .cred{position:absolute;bottom:40px;left:0;right:0;text-align:center;font-family:'Space Grotesk';font-weight:400;font-size:16px;color:#5d6e86;letter-spacing:.02em}
  </style><div class="wrap"><div class="logo">LANCEFALL</div><div class="sub">THE LAST KEY</div>
  <div class="url">lancefall.pages.dev</div><div class="jam">JUNE GAME JAM · AN ODE TO ALAN TURING</div></div>
  <div class="cred">Music: Punch Deck &amp; FSM Team / &lt;e s c p&gt; (CC BY) · SFX: Kenney (CC0) · Built in TypeScript, no engine</div>`;

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
  for (const c of CAPTIONS) await render(lowerThird(c), `cap_${c.id}.png`);
  await render(END, 'card_end.png');
  await browser.close();
})();
