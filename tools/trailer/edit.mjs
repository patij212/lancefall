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
// END CARD = the owner's end art (golden FIRST LIGHT city + title) + a url/jam/credits overlay.
const ENDART = path.join(PRESS, 'endart.png');
const ENDCARD = path.join(SEGS, 'endcard.png');
const useEndArt = fs.existsSync(ENDART);
if (useEndArt) sh(`ffmpeg -y -loglevel error -i "${ENDART}" -i "${path.join(ASSETS, 'card_endinfo.png')}" -filter_complex "[0]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg];[bg][1]overlay" -frames:v 1 "${ENDCARD}"`);
// Winning treatment: COLD-OPEN on the dash → name the Turing ode → teach the cipher (READ THE KEY →
// DASH THE DECODED ORDER → CIPHER BROKEN) → stakes/bosses → depth (labeled) → THE CHOICE → FIRST LIGHT.
const SHOTS = [
  { id: 'title',      kind: 'still', src: KEYART, t: 2.2, zoom: 'out' },   // brief brand stamp (owner's art); the hook is the cold-open dash next
  { id: 'verb',       kind: 'clip',  src: 'combat',    ss: 2.0,  t: 4.0, cap: 'verb' },
  { id: 'dash',       kind: 'clip',  src: 'combat',    ss: 7.0,  t: 4.0, cap: 'dash' },
  { id: 'turing',     kind: 'clip',  src: 'cipher',    ss: 1.0,  t: 4.0, cap: 'turing' },     // seed the ode early
  { id: 'readkey',    kind: 'clip',  src: 'cipher',    ss: 6.0,  t: 5.0, cap: 'readkey' },
  { id: 'order',      kind: 'clip',  src: 'cipher',    ss: 13.0, t: 5.0, cap: 'order' },
  { id: 'broken',     kind: 'clip',  src: 'cipher',    ss: 23.0, t: 3.0, cap: 'broken' },     // CIPHER BROKEN ~25s
  { id: 'graze',      kind: 'clip',  src: 'flow',      ss: 4.0,  t: 5.0, cap: 'graze' },
  { id: 'enemies',    kind: 'clip',  src: 'combat',    ss: 11.0, t: 4.0, cap: 'enemies' },
  { id: 'bosses',     kind: 'clip',  src: 'bossfight', ss: 1.0,  t: 4.0, cap: 'bosses' },
  { id: 'imitation',  kind: 'clip',  src: 'mirror',    ss: 1.0,  t: 6.0, cap: 'imitation' },
  { id: 'sovereign',  kind: 'clip',  src: 'sovereign', ss: 1.0,  t: 5.0, cap: 'sovereign' },
  { id: 'build',      kind: 'panel', src: 'draft',     ss: 8.0,  t: 3.0, cap: 'build' },
  { id: 'solstice',   kind: 'panel', src: 'modes',     ss: 9.0,  t: 3.0, cap: 'solstice' },
  { id: 'memory',     kind: 'clip',  src: 'coherence', ss: 2.0,  t: 4.0, cap: 'memory' },     // a MOVING shot breaks up the panels
  { id: 'seed',       kind: 'panel', src: 'heat',      ss: 8.0,  t: 3.0, cap: 'seed' },
  { id: 'halting',    kind: 'panel', src: 'choice',    ss: 8.0,  t: 5.0, cap: 'halting' },    // the near-silence beat (music dips)
  { id: 'daybreak',   kind: 'clip',  src: 'daybreak',  ss: 1.0,  t: 4.0, cap: 'daybreak' },
  { id: 'firstlight', kind: 'still', src: path.join(PRESS, 'firstlight-winframe.png'), t: 4.0, cap: 'firstlight', zoom: 'in' },
  { id: 'endcard',    kind: 'still', src: useEndArt ? ENDCARD : path.join(ASSETS, 'card_end.png'), t: 6.0, zoom: 'in' },
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

// MUSIC ARC (one track, dynamically shaped — can't audition stem-layering, so this stays safe but
// delivers the dynamics): a smooth BUILD from the cold open, a hard near-silence DIP on THE CHOICE,
// and a SWELL as FIRST LIGHT floods gold. Timings derive from the shot offsets.
let _acc = 0, choiceStart = 0, firstlightStart = 0;
for (const s of SHOTS) { if (s.id === 'halting') choiceStart = _acc; if (s.id === 'firstlight') firstlightStart = _acc; _acc += s.t; }
const cm = (choiceStart + 2.5).toFixed(2);       // dip centered mid-CHOICE
const sm = (firstlightStart + 0.8).toFixed(2);   // swell as the gold floods
const volExpr =
  `(0.72+0.28*(1-exp(-t/12)))` +                 // build: 0.72 → ~1.0 over the open
  `*(1-0.85*exp(-(t-${cm})*(t-${cm})/9.7))` +    // CHOICE dip → ~0.15 (near-silence)
  `*(1+0.12*exp(-(t-${sm})*(t-${sm})/16))`;      // FIRST LIGHT swell
const bed = path.join(SEGS, 'bed.m4a');
sh(`ffmpeg -y -loglevel error -stream_loop -1 -i "${MUSIC}" -t ${TOTAL.toFixed(2)} -af "loudnorm=I=-15:TP=-1.5,volume=eval=frame:volume='${volExpr}',afade=in:st=0:d=0.8,afade=out:st=${(TOTAL - 3).toFixed(2)}:d=3,alimiter=limit=0.97" -c:a aac -b:a 192k "${bed}"`);
sh(`ffmpeg -y -loglevel error -i "${silent}" -i "${bed}" -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart -shortest "${OUT}"`);
sh(`ffmpeg -y -loglevel error -i "${path.join(PRESS, 'firstlight-winframe.png')}" -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}" -frames:v 1 "${POSTER}"`);

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\n[edit] ✅ ${OUT} (${mb} MB, ${TOTAL.toFixed(1)}s)  ·  keyart: ${KEYART.endsWith('keyart.png') ? 'YES' : 'fallback'}`);
