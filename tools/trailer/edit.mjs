// LANCEFALL trailer assembler. Takes the per-beat clips in clips/ + the caption/card PNGs in
// assets/ + a CC-BY music bed, and produces press/lancefall-trailer.mp4 (1920x1080, 30fps).
//
//   node tools/trailer/edit.mjs
//
// Pipeline: each SHOT → a normalized 1080p30 H.264 segment (trim/scale, optional ken-burns,
// burned-in lower-third caption) → concat (hard cuts, the music drives energy) → mux the
// loudness-normalized music bed → faststart mp4 + a poster frame.
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CLIPS = path.join(__dirname, 'clips');
const ASSETS = path.join(__dirname, 'assets');
const SEGS = path.join(__dirname, 'segs');
const PRESS = path.join(ROOT, 'press');
const OUT = path.join(PRESS, 'lancefall-trailer.mp4');
const POSTER = path.join(PRESS, 'lancefall-trailer-poster.png');
const MUSIC = path.join(ROOT, 'audio-src', 'flagship', 'masters', 'cyberpunk-renaissance.mp3');

const W = 1920, H = 1080, FPS = 30;
fs.mkdirSync(SEGS, { recursive: true });
for (const f of fs.readdirSync(SEGS)) fs.rmSync(path.join(SEGS, f), { force: true });

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
const clip = (n) => path.join(__dirname, 'mp4', n + '.mp4'); // CFR-normalized (reliable seeking)
const cap = (id) => path.join(ASSETS, `cap_${id}.png`);

// ── the shot list (order = trailer order). ss/t in seconds; cap = lower-third id; zoom = ken-burns.
// kind 'clip' (default) trims a beat clip; 'still' loops a PNG; 'card' loops a full-frame card.
const SHOTS = [
  { id: 'title',      src: 'title',      ss: 5.5,  t: 6.0, cap: 'fall' },
  { id: 'combat',     src: 'combat',     ss: 8.0,  t: 9.0, cap: 'verb' },
  { id: 'coherence',  src: 'coherence',  ss: 20.0, t: 9.0, cap: 'coherence' },
  { id: 'cipher',     src: 'cipher',     ss: 12.5, t: 10.5, cap: 'readkey' },
  { id: 'modes',      src: 'modes',      ss: 6.0,  t: 3.5, cap: 'solstice' },
  { id: 'draft',      src: 'draft',      ss: 6.0,  t: 3.0 },
  { id: 'heat',       src: 'heat',       ss: 6.0,  t: 3.0 },
  { id: 'codex',      src: 'codex',      ss: 6.0,  t: 3.0 },
  { id: 'mirror',     src: 'mirror',     ss: 11.0, t: 5.0, cap: 'mirror' },
  { id: 'daybreak',   src: 'daybreak',   ss: 13.0, t: 6.0, cap: 'daybreak' },
  { id: 'choice',     src: 'choice',     ss: 4.5,  t: 5.5, cap: 'choice' },
  { id: 'firstlight', kind: 'still', src: path.join(PRESS, 'firstlight-winframe.png'), t: 5.5, cap: 'firstlight', zoom: 'in' },
  { id: 'endcard',    kind: 'card',  src: path.join(ASSETS, 'card_end.png'), t: 5.0 },
];

const TOTAL = SHOTS.reduce((s, x) => s + x.t, 0);
console.log(`[edit] ${SHOTS.length} shots, ${TOTAL.toFixed(1)}s total`);

// build one normalized segment
function buildSeg(shot, i, isFirst, isLast) {
  const out = path.join(SEGS, `seg_${String(i).padStart(2, '0')}.mp4`);
  const t = shot.t;
  const inputs = [];
  let base;
  if (shot.kind === 'still' || shot.kind === 'card') {
    if (shot.zoom) {
      // gentle ken-burns: ONE input frame (not -loop, which feeds zoompan many frames and
      // corrupts it); zoompan generates `frames` output frames from the single still.
      const frames = Math.round(t * FPS);
      const z = shot.zoom === 'in' ? `min(zoom+0.0010,1.13)` : `if(eq(on,0),1.13,max(zoom-0.0010,1.0))`;
      inputs.push(`-i "${shot.src}"`);
      base = `[0:v]scale=${Math.round(W * 1.5)}:${Math.round(H * 1.5)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.5)}:${Math.round(H * 1.5)},zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[b]`;
    } else {
      inputs.push(`-loop 1 -t ${t} -i "${shot.src}"`);
      base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}[b]`;
    }
  } else {
    inputs.push(`-ss ${shot.ss} -t ${t} -i "${clip(shot.src)}"`);
    base = `[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS}[b]`;
  }

  const parts = [base];
  let last = 'b';
  if (shot.cap) {
    inputs.push(`-loop 1 -t ${t} -i "${cap(shot.cap)}"`);
    const fo = Math.max(0.2, t - 0.5).toFixed(2);
    parts.push(`[1:v]format=rgba,fade=in:st=0:d=0.35:alpha=1,fade=out:st=${fo}:d=0.45:alpha=1[c]`);
    parts.push(`[b][c]overlay=0:0[bc]`);
    last = 'bc';
  }
  // fade from/to black at the very ends of the whole film
  if (isFirst) { parts.push(`[${last}]fade=in:st=0:d=0.6[fb]`); last = 'fb'; }
  if (isLast) { parts.push(`[${last}]fade=out:st=${(t - 1.0).toFixed(2)}:d=1.0[fb2]`); last = 'fb2'; }
  parts.push(`[${last}]format=yuv420p[o]`);

  const fc = parts.join(';');
  sh(`ffmpeg -y -loglevel error ${inputs.join(' ')} -filter_complex "${fc}" -map "[o]" -r ${FPS} -frames:v ${Math.round(t * FPS)} -c:v libx264 -crf 18 -preset veryfast -an "${out}"`);
  console.log(`[edit] ✓ seg ${shot.id} (${t}s)`);
  return out;
}

const segFiles = SHOTS.map((s, i) => buildSeg(s, i, i === 0, i === SHOTS.length - 1));

// concat (hard cuts — uniform codec params so -c copy is safe)
const listFile = path.join(SEGS, 'list.txt');
fs.writeFileSync(listFile, segFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
const silent = path.join(SEGS, 'video.mp4');
sh(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${silent}"`);
console.log('[edit] ✓ concatenated video');

// music bed: loudness-normalize, loop+trim to TOTAL, fade in/out
const bed = path.join(SEGS, 'bed.m4a');
sh(`ffmpeg -y -loglevel error -stream_loop -1 -i "${MUSIC}" -t ${TOTAL.toFixed(2)} -af "loudnorm=I=-15:TP=-1.5,afade=in:st=0:d=0.8,afade=out:st=${(TOTAL - 3).toFixed(2)}:d=3" -c:a aac -b:a 192k "${bed}"`);
console.log('[edit] ✓ music bed');

// mux
sh(`ffmpeg -y -loglevel error -i "${silent}" -i "${bed}" -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart -shortest "${OUT}"`);
// poster: the FIRST LIGHT hero still
sh(`ffmpeg -y -loglevel error -i "${path.join(PRESS, 'firstlight-winframe.png')}" -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}" -frames:v 1 "${POSTER}"`);

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\n[edit] ✅ ${OUT}  (${mb} MB, ${TOTAL.toFixed(1)}s)`);
console.log(`[edit] ✅ poster ${POSTER}`);
