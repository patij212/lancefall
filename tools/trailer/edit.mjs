// LANCEFALL trailer assembler (v2). Smooth deterministic gameplay clips (render.mjs) + panel
// stills + key art, with motion-faded cinematic captions and a CC-BY music bed → a ~1.5 min
// 1080p trailer. Hard cuts (the music drives the energy); fade from/to black at the ends.
//
//   node tools/trailer/edit.mjs
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MP4 = path.join(__dirname, 'mp4');
const ASSETS = path.join(__dirname, 'assets');
const SEGS = path.join(__dirname, 'segs');
const PRESS = path.join(ROOT, 'press');
const OUT = path.join(PRESS, 'lancefall-trailer.mp4');
const POSTER = path.join(PRESS, 'lancefall-trailer-poster.png');
const MUSIC = path.join(ROOT, 'audio-src', 'flagship', 'masters', 'cyberpunk-renaissance.mp3');
// key art for the opening (owner-provided); falls back to the generated end card if absent.
const KEYART = fs.existsSync(path.join(PRESS, 'keyart.png')) ? path.join(PRESS, 'keyart.png') : path.join(ASSETS, 'card_end.png');

const W = 1920, H = 1080, FPS = 60;
fs.rmSync(SEGS, { recursive: true, force: true });
fs.mkdirSync(SEGS, { recursive: true });
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
const clip = (n) => path.join(MP4, n + '.mp4');
const cap = (id) => path.join(ASSETS, `cap_${id}.png`);

// kinds: 'clip' = smooth gameplay (trim ss..ss+t); 'panel' = a still grabbed from a screencast
// clip at ss (ken-burns); 'still' = a PNG (ken-burns); 'card' = a static PNG.
const SHOTS = [
  { id: 'title',      kind: 'still', src: KEYART, t: 6.0, zoom: 'out' },   // key art opens; the art speaks (no caption)
  { id: 'combat',     kind: 'clip',  src: 'combat',     ss: 2.0, t: 10.5, cap: 'verb' },
  { id: 'coherence',  kind: 'clip',  src: 'coherence',  ss: 2.0, t: 9.5,  cap: 'coherence' },
  { id: 'cipher',     kind: 'clip',  src: 'cipher',     ss: 3.0, t: 13.0, cap: 'readkey' },
  { id: 'sovereign',  kind: 'clip',  src: 'sovereign',  ss: 1.4, t: 3.5,  cap: 'sovereign' },
  { id: 'bossfight',  kind: 'clip',  src: 'bossfight',  ss: 2.5, t: 8.5,  cap: 'bosses' },
  { id: 'modes',      kind: 'panel', src: 'modes',      ss: 9.0, t: 4.0,  cap: 'solstice' },
  { id: 'draft',      kind: 'panel', src: 'draft',      ss: 8.0, t: 3.0 },
  { id: 'heat',       kind: 'panel', src: 'heat',       ss: 8.0, t: 3.0 },
  { id: 'codex',      kind: 'panel', src: 'codex',      ss: 9.0, t: 3.0 },
  { id: 'mirror',     kind: 'clip',  src: 'mirror',     ss: 2.0, t: 6.5,  cap: 'mirror' },
  { id: 'daybreak',   kind: 'clip',  src: 'daybreak',   ss: 0.3, t: 6.5,  cap: 'daybreak' },
  { id: 'choice',     kind: 'panel', src: 'choice',     ss: 8.0, t: 5.5,  cap: 'choice' },
  { id: 'firstlight', kind: 'still', src: path.join(PRESS, 'firstlight-winframe.png'), t: 6.0, cap: 'firstlight', zoom: 'in' },
  { id: 'endcard',    kind: 'card',  src: path.join(ASSETS, 'card_end.png'), t: 5.5 },
];

const TOTAL = SHOTS.reduce((s, x) => s + x.t, 0);
console.log(`[edit] ${SHOTS.length} shots, ${TOTAL.toFixed(1)}s`);

function buildSeg(shot, i, isFirst, isLast) {
  const out = path.join(SEGS, `seg_${String(i).padStart(2, '0')}.mp4`);
  const t = shot.t, frames = Math.round(t * FPS);
  const inputs = [];
  let base;

  // resolve the visual source to a base [b] at WxH, FPS
  if (shot.kind === 'clip') {
    inputs.push(`-ss ${shot.ss} -t ${t} -i "${clip(shot.src)}"`);
    base = `[0:v]scale=${W}:${H}:flags=lanczos,unsharp=5:5:0.45:5:5:0.0,setsar=1,fps=${FPS}[b]`;
  } else {
    // panel: pull a single clean still from the screencast clip; still/card: a PNG
    let img;
    if (shot.kind === 'panel') {
      img = path.join(SEGS, `still_${shot.id}.png`);
      sh(`ffmpeg -y -loglevel error -ss ${shot.ss} -i "${clip(shot.src)}" -frames:v 1 "${img}"`);
    } else { img = shot.src; }
    if (shot.zoom) {
      const z = shot.zoom === 'in' ? `min(zoom+0.0009,1.12)` : `if(eq(on,0),1.12,max(zoom-0.0009,1.0))`;
      inputs.push(`-i "${img}"`);
      base = `[0:v]scale=${Math.round(W * 1.5)}:${Math.round(H * 1.5)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.5)}:${Math.round(H * 1.5)},zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[b]`;
    } else {
      inputs.push(`-loop 1 -t ${t} -i "${img}"`);
      base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}[b]`;
    }
  }

  const parts = [base];
  let last = 'b';
  if (shot.cap) {
    inputs.push(`-loop 1 -t ${t} -i "${cap(shot.cap)}"`);
    const fo = Math.max(0.3, t - 0.55).toFixed(2);
    parts.push(`[1:v]format=rgba,fade=in:st=0:d=0.45:alpha=1,fade=out:st=${fo}:d=0.5:alpha=1[c]`);
    parts.push(`[b][c]overlay=0:0[bc]`);
    last = 'bc';
  }
  if (isFirst) { parts.push(`[${last}]fade=in:st=0:d=0.7[fb]`); last = 'fb'; }
  if (isLast) { parts.push(`[${last}]fade=out:st=${(t - 1.1).toFixed(2)}:d=1.1[fb2]`); last = 'fb2'; }
  parts.push(`[${last}]format=yuv420p[o]`);

  sh(`ffmpeg -y -loglevel error ${inputs.join(' ')} -filter_complex "${parts.join(';')}" -map "[o]" -r ${FPS} -frames:v ${frames} -c:v libx264 -crf 18 -preset veryfast -an "${out}"`);
  console.log(`[edit] ✓ seg ${shot.id} (${t}s)`);
  return out;
}

const segFiles = SHOTS.map((s, i) => buildSeg(s, i, i === 0, i === SHOTS.length - 1));
const listFile = path.join(SEGS, 'list.txt');
fs.writeFileSync(listFile, segFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
const silent = path.join(SEGS, 'video.mp4');
sh(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${silent}"`);
console.log('[edit] ✓ concatenated');

const bed = path.join(SEGS, 'bed.m4a');
sh(`ffmpeg -y -loglevel error -stream_loop -1 -i "${MUSIC}" -t ${TOTAL.toFixed(2)} -af "loudnorm=I=-15:TP=-1.5,afade=in:st=0:d=0.8,afade=out:st=${(TOTAL - 3).toFixed(2)}:d=3" -c:a aac -b:a 192k "${bed}"`);
sh(`ffmpeg -y -loglevel error -i "${silent}" -i "${bed}" -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart -shortest "${OUT}"`);
sh(`ffmpeg -y -loglevel error -i "${path.join(PRESS, 'firstlight-winframe.png')}" -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}" -frames:v 1 "${POSTER}"`);

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\n[edit] ✅ ${OUT} (${mb} MB, ${TOTAL.toFixed(1)}s)  ·  keyart: ${KEYART.endsWith('keyart.png') ? 'YES' : 'fallback'}`);
