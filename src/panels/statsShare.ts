// Shareable STATS card — renders a compact lifetime dossier to a canvas and downloads a PNG.
// Mirrors the canvas→toBlob→anchor-download pattern used by replay.ts (the GIF/PNG share).
import type { SaveData } from '../save';
import { ACHIEVEMENTS } from '../achievements';
import { archetypeName, fmtDuration } from './statsDerive';

/** Draw + download a 800×420 PNG summary card for the given save. */
export function renderShareCard(s: SaveData): void {
  const W = 800, H = 420;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (!x) return;

  // backdrop
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#060a16');
  g.addColorStop(1, '#0a1224');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(34,211,238,0.4)';
  x.lineWidth = 2;
  x.strokeRect(12, 12, W - 24, H - 24);

  x.textBaseline = 'alphabetic';
  x.fillStyle = '#6d89ab';
  x.font = "700 15px Rajdhani, system-ui, sans-serif";
  x.fillText('THE LAST LANCE · LIFETIME DOSSIER', 40, 56);

  x.fillStyle = '#22d3ee';
  x.font = "900 34px Orbitron, system-ui, sans-serif";
  x.fillText(archetypeName(s), 40, 100);

  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const winRate = s.totalRuns > 0 ? `${Math.round((s.lifeWins / s.totalRuns) * 100)}%` : '—';
  const stats: [string, string][] = [
    ['HIGH SCORE', s.highScore.toLocaleString()],
    ['RUNS', String(s.totalRuns)],
    ['WIN RATE', winRate],
    ['DEEPEST WAVE', s.deepestWave > 0 ? String(s.deepestWave) : '—'],
    ['BEST COMBO', `×${s.bestCombo}`],
    ['ACHIEVEMENTS', `${got}/${ACHIEVEMENTS.length}`],
  ];
  stats.forEach(([k, v], i) => {
    const cx = 40 + (i % 3) * 255;
    const cy = 170 + Math.floor(i / 3) * 95;
    x.fillStyle = '#6d89ab';
    x.font = "700 12px Rajdhani, system-ui, sans-serif";
    x.fillText(k, cx, cy);
    x.fillStyle = '#eaf2ff';
    x.font = "700 30px Rajdhani, system-ui, sans-serif";
    x.fillText(v, cx, cy + 34);
  });

  x.fillStyle = '#7a93b2';
  x.font = "italic 13px Rajdhani, system-ui, sans-serif";
  x.fillText(`${fmtDuration(s.lifeTimeSec)} in the City · lancefall.pages.dev`, 40, H - 30);

  cv.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lancefall-stats.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
