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
const OUT = path.join(PRESS, process.env.VO ? 'lancefall-trailer-vo.mp4' : 'lancefall-trailer.mp4');
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
// v5 — code=light + Turing-forward (~1:54). Front-loads the premise (encrypted→grey), the verb (the
// KEY), then the cipher core + the grey→gold DECRYPT payoff; names the Turing trifecta (cryptanalysis,
// the imitation game, the halting problem, the deterministic algorithm); shows all six bosses + the
// full depth; and TEASES the ending (halting problem) → live FIRST LIGHT — the resolution is NOT spoiled.
const ppng = (n) => path.join(__dirname, 'panels', n + '.png');
const SHOTS = [
  // ACT 1 — the code=light premise + the verb (the hook, front-loaded)
  { id: 'title',      kind: 'still', src: KEYART, t: 2.5, zoom: 'in' },
  { id: 'fall',       kind: 'still', src: ppng('fall'),      t: 4.0, zoom: 'in', cap: 'fall' },      // PREMISE: enciphered into grey
  { id: 'verb',       kind: 'clip',  src: 'combat',    ss: 2.0,  t: 4.0,  cap: 'verb' },
  { id: 'dash',       kind: 'clip',  src: 'combat',    ss: 7.0,  t: 4.0,  cap: 'dash' },
  { id: 'graze',      kind: 'clip',  src: 'flow',      ss: 4.0,  t: 4.0,  cap: 'graze' },
  // ACT 2 — the cipher (the Turing core) → the grey→gold DECRYPT payoff
  { id: 'turing',     kind: 'clip',  src: 'cipher',    ss: 1.0,  t: 4.0,  cap: 'turing' },
  { id: 'readkey',    kind: 'clip',  src: 'cipher',    ss: 6.0,  t: 5.0,  cap: 'readkey' },
  { id: 'order',      kind: 'clip',  src: 'cipher',    ss: 13.0, t: 5.0,  cap: 'order' },
  { id: 'broken',     kind: 'clip',  src: 'cipher',    ss: 23.0, t: 3.0,  cap: 'broken' },
  { id: 'memory',     kind: 'clip',  src: 'coherence', ss: 2.0,  t: 4.0,  cap: 'memory' },           // the world decrypts grey→gold
  // ACT 3 — the threat + all six bosses
  { id: 'enemies',    kind: 'clip',  src: 'combat',    ss: 11.0, t: 4.0,  cap: 'enemies' },
  { id: 'sixbosses',  kind: 'clip',  src: 'warden',    ss: 2.0,  t: 4.0,  cap: 'sixbosses' },
  { id: 'beacon',     kind: 'clip',  src: 'bossfight', ss: 1.0,  t: 4.0,  cap: 'beacon' },
  { id: 'hollow',     kind: 'clip',  src: 'hollow',    ss: 2.0,  t: 4.0,  cap: 'hollow' },
  { id: 'imitation',  kind: 'clip',  src: 'mirror',    ss: 1.0,  t: 5.5,  cap: 'imitation' },        // the imitation game (AI)
  { id: 'sovereign',  kind: 'clip',  src: 'sovereign', ss: 1.0,  t: 5.0,  cap: 'sovereign' },
  { id: 'daybreak',   kind: 'clip',  src: 'daybreak',  ss: 1.0,  t: 4.0,  cap: 'daybreak' },
  // ACT 4 — roguelite depth (native panels) — incl. the IN-COCKPIT CODEBREAKER + the deterministic seed
  { id: 'codebreaker',kind: 'still', src: ppng('codebreaker'), t: 3.5, zoom: 'in', cap: 'codebreaker' },
  { id: 'ships',      kind: 'still', src: ppng('ships'),     t: 2.6, zoom: 'in', cap: 'ships' },
  { id: 'skins',      kind: 'still', src: ppng('skins'),     t: 2.6, zoom: 'in', cap: 'skins' },
  { id: 'build',      kind: 'still', src: ppng('archetype'), t: 2.6, zoom: 'in', cap: 'build' },
  { id: 'meta',       kind: 'still', src: ppng('upgrades'),  t: 2.6, zoom: 'in', cap: 'meta' },
  { id: 'bestiary',   kind: 'still', src: ppng('codex'),     t: 2.6, zoom: 'in', cap: 'bestiary' },
  { id: 'dossier',    kind: 'still', src: ppng('stats'),     t: 2.6, zoom: 'in', cap: 'dossier' },
  { id: 'boards',     kind: 'still', src: ppng('ranks'),     t: 2.6, zoom: 'in', cap: 'boards' },     // ONE ALGORITHM (determinism)
  { id: 'solstice',   kind: 'panel', src: 'modes',     ss: 9.0, t: 3.0, cap: 'solstice' },
  { id: 'avatars',    kind: 'still', src: ppng('avatar_gallery'), t: 3.5, zoom: 'in', cap: 'avatars' },
  // ACT 5 — the climax: TEASE the choice (no spoiler) → live FIRST LIGHT daybreak
  { id: 'halting',    kind: 'still', src: ppng('choice2'),   t: 5.0, zoom: 'in', cap: 'halting' },    // the near-silence beat (music dips)
  { id: 'firstlight', kind: 'clip',  src: 'firstlight', ss: 2.0, t: 5.0, cap: 'firstlight' },         // the LIVE grey→gold daybreak
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
      // SMOOTH Ken-Burns push-in. zoompan judders when the source is small (crop window snaps
      // between integer px) — so scale to a LARGE intermediate (5760w) and size the zoom range so
      // motion is ~1.3px/frame (sub-pixel-smooth). Always a gentle push-IN (zoom-out is the juddery
      // direction). Render the zoom at 30fps then interpolate to 60 (no benefit to 60 on a slow pan).
      const SS = 5760, SSH = 3240;
      const range = Math.min(0.12, Math.max(0.04, (1.3 * frames) / SS));
      const step = (range / frames).toFixed(7);
      const zmax = (1 + range).toFixed(4);
      inputs.push(`-i "${img}"`);
      base = `[0:v]scale=${SS}:${SSH}:force_original_aspect_ratio=increase,crop=${SS}:${SSH},zoompan=z='min(zoom+${step}\\,${zmax})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[b]`;
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
const starts = {};
for (const s of SHOTS) { starts[s.id] = _acc; if (s.id === 'halting') choiceStart = _acc; if (s.id === 'firstlight') firstlightStart = _acc; _acc += s.t; }
const cm = (choiceStart + 2.5).toFixed(2);       // dip centered mid-CHOICE
const sm = (firstlightStart + 0.8).toFixed(2);   // swell as the gold floods

// VO lines (REMOVABLE: set VO=1). Probe each WAV's duration so the music can DIP DETERMINISTICALLY
// during each line — far more reliable than sidechaincompress (which didn't duck in this ffmpeg build).
const VO_IDS = ['fall', 'verb', 'turing', 'readkey', 'memory', 'imitation', 'halting', 'firstlight'];
let voLines = [];
if (process.env.VO) {
  voLines = VO_IDS.map((id) => ({ id, file: path.join(__dirname, 'vo', `vo_${id}.wav`), at: starts[id] }))
    .filter((v) => v.at != null && fs.existsSync(v.file))
    .map((v) => { const d = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${v.file}"`).toString().trim()) || 3; return { ...v, dur: d }; });
}
// per-line music dip to ~26% across each line's window (gaussian), folded into the volume envelope.
const voDips = voLines.map((v) => { const mid = (v.at + 0.3 + v.dur / 2).toFixed(2); const sig = (v.dur / 2 + 0.35).toFixed(2); return `*(1-0.74*exp(-(t-${mid})*(t-${mid})/(2*${sig}*${sig})))`; }).join('');

const volExpr =
  `(0.72+0.28*(1-exp(-t/12)))` +                 // build: 0.72 → ~1.0 over the open
  `*(1-0.85*exp(-(t-${cm})*(t-${cm})/9.7))` +    // CHOICE dip → ~0.15 (near-silence)
  `*(1+0.12*exp(-(t-${sm})*(t-${sm})/16))` +     // FIRST LIGHT swell
  voDips;                                        // duck under each VO line (VO mode only)
const bed = path.join(SEGS, 'bed.m4a');
sh(`ffmpeg -y -loglevel error -stream_loop -1 -i "${MUSIC}" -t ${TOTAL.toFixed(2)} -af "loudnorm=I=-15:TP=-1.5,volume=eval=frame:volume='${volExpr}',afade=in:st=0:d=0.8,afade=out:st=${(TOTAL - 3).toFixed(2)}:d=3,alimiter=limit=0.97" -c:a aac -b:a 192k "${bed}"`);

let finalAudio = bed;
if (process.env.VO && voLines.length) {
  const ins = voLines.map((v) => `-i "${v.file}"`).join(' ');
  const ms = (at) => Math.round((at + 0.3) * 1000);
  // each line LOUD: 48kHz stereo, compressed + lifted, delayed to its beat. The music already dips
  // under it (voDips), so a plain amix puts the narration clearly on top — no sidechain needed.
  const delayed = voLines.map((v, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,acompressor=threshold=-24dB:ratio=4:makeup=12,alimiter=limit=0.95,adelay=${ms(v.at)}|${ms(v.at)}[v${i}]`);
  const voMix = `${voLines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voLines.length}:normalize=0[vo]`;
  const mix = `[0:a][vo]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.97[aout]`;
  const voOut = path.join(SEGS, 'bed_vo.m4a');
  sh(`ffmpeg -y -loglevel error -i "${bed}" ${ins} -filter_complex "${[...delayed, voMix, mix].join(';')}" -map "[aout]" -c:a aac -b:a 192k "${voOut}"`);
  finalAudio = voOut;
  console.log(`[edit] ✓ VO layer mixed (${voLines.length} lines, music ducked deterministically)`);
}
sh(`ffmpeg -y -loglevel error -i "${silent}" -i "${finalAudio}" -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart -shortest "${OUT}"`);
sh(`ffmpeg -y -loglevel error -i "${path.join(PRESS, 'firstlight-winframe.png')}" -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}" -frames:v 1 "${POSTER}"`);

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`\n[edit] ✅ ${OUT} (${mb} MB, ${TOTAL.toFixed(1)}s)  ·  keyart: ${KEYART.endsWith('keyart.png') ? 'YES' : 'fallback'}`);
