// src/audioLab.ts — DEV-ONLY sound bench (served at /audiolab.html in `npm run dev`).
// Audition every SFX, drive the procedural soundtrack by COHERENCE / heat / combo
// tier, swap boss themes, and A/B the mix states — so the sound can be judged by ear
// without playing a whole run. Not part of the prod build (only index.html is bundled).

import { AudioEngine } from './audio';
import type { EnemyKind } from './types';

const audio = new AudioEngine();
const app = document.getElementById('app')!;
const gate = document.getElementById('gate')!;
const startBtn = document.getElementById('start')!;

// live music drivers
let coh = 0.0;
let tier = 0;
let heat = 0.3;
let chargeOn = false;
const pushCoherence = () => audio.setCoherence(coh, tier);

startBtn.addEventListener('click', () => {
  audio.ensure();
  audio.setVolumes(0.85, 0.9, 0.6);
  gate.remove();
});

// ── tiny DOM helpers ────────────────────────────────────────────────────────
function panel(title: string): HTMLElement {
  const p = document.createElement('div');
  p.className = 'panel';
  const h = document.createElement('h2');
  h.textContent = title;
  p.appendChild(h);
  return p;
}
function btn(parent: HTMLElement, label: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', on);
  parent.appendChild(b);
  return b;
}
function row(parent: HTMLElement): HTMLElement {
  const r = document.createElement('div');
  r.className = 'row';
  parent.appendChild(r);
  return r;
}
function slider(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  on: (v: number) => void,
): void {
  const l = document.createElement('label');
  const span = document.createElement('span');
  span.className = 'val';
  span.textContent = value.toFixed(2);
  l.textContent = `${label} `;
  l.appendChild(span);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    span.textContent = v.toFixed(2);
    on(v);
  });
  parent.appendChild(l);
  parent.appendChild(input);
}

const cols = document.createElement('div');
cols.className = 'cols';
app.appendChild(cols);

// ── SOUNDTRACK ────────────────────────────────────────────────────────────
{
  const p = panel('Soundtrack');
  const r = row(p);
  btn(r, '▶ Start music', () => audio.startDrone(), 'primary');
  btn(r, '■ Stop', () => audio.stopDrone(), 'warn');
  slider(p, 'COHERENCE (drone bloom + LANCE THEME hook)', 0, 1, 0.01, coh, (v) => {
    coh = v;
    pushCoherence();
  });
  slider(p, 'Combo tier (root transpose 0–6)', 0, 6, 1, tier, (v) => {
    tier = Math.round(v);
    pushCoherence();
  });
  slider(p, 'Heat (arp density + perc/break)', 0, 1, 0.01, heat, (v) => {
    heat = v;
    audio.setIntensity(v);
  });
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Tip: push COHERENCE past ~0.35 to hear THE LANCE THEME bloom in; raise heat past ~0.65 for hats/snare.';
  p.appendChild(hint);
  cols.appendChild(p);
}

// ── BOSS THEMES ─────────────────────────────────────────────────────────────
{
  const p = panel('Boss themes (lead motif swap)');
  const kinds: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
  const sel = document.createElement('select');
  for (const k of kinds) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k.toUpperCase();
    sel.appendChild(o);
  }
  p.appendChild(sel);
  const r = row(p);
  btn(r, 'Boss music ON', () => audio.bossMusic(true, sel.value as EnemyKind), 'primary');
  btn(r, 'Boss music OFF', () => audio.bossMusic(false));
  btn(r, 'Boss stinger (felled)', () => audio.bossStinger());
  btn(r, 'Boss warn', () => audio.bossWarn());
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Start the soundtrack first. Each boss replaces the arena hook with its own motif.';
  p.appendChild(hint);
  cols.appendChild(p);
}

// ── MIX STATES ────────────────────────────────────────────────────────────
{
  const p = panel('Mix states');
  const r = row(p);
  btn(r, 'COMBAT', () => audio.setMixState('combat'), 'primary');
  btn(r, 'MENU (muffled)', () => audio.setMixState('menu'));
  btn(r, 'OVERDRIVE swell', () => audio.setMixState('overdrive'));
  btn(r, 'DEATH (distant)', () => audio.setMixState('death'));
  cols.appendChild(p);
}

// ── KILL / COMBAT SFX ───────────────────────────────────────────────────────
{
  const p = panel('Kill / combat SFX');
  let comboN = 0;
  let pan = 0;
  slider(p, 'thunk combo (pitch climbs)', 0, 30, 1, comboN, (v) => (comboN = Math.round(v)));
  slider(p, 'pan (L ◀ ▶ R)', -1, 1, 0.05, pan, (v) => (pan = v));
  const r = row(p);
  btn(r, 'thunk (kill)', () => audio.thunk(comboN, pan));
  btn(r, 'auto-combo ▶', () => {
    let c = 0;
    const id = setInterval(() => {
      audio.thunk(c, Math.sin(c * 0.4));
      if (++c > 24) clearInterval(id);
    }, 110);
  });
  const r2 = row(p);
  btn(r2, 'explosion S', () => audio.explosion(0.8, pan));
  btn(r2, 'explosion L', () => audio.explosion(1.4, pan));
  btn(r2, 'graze', () => audio.graze());
  btn(r2, 'pickup', () => audio.pickup(6));
  btn(r2, 'combo break', () => audio.comboBreak());
  cols.appendChild(p);
}

// ── DASH / CHARGE ─────────────────────────────────────────────────────────
{
  const p = panel('Dash / charge');
  const r = row(p);
  btn(r, 'whoosh (dash)', () => audio.whoosh());
  btn(r, 'slow-mo snap', () => audio.slowmoSnap());
  btn(r, 'perfect-dash snare', () => audio.perfectDashSnare(audio.clock + 0.02));
  const r2 = row(p);
  btn(r2, 'start charge', () => {
    audio.startCharge();
    chargeOn = true;
  });
  slider(p, 'charge level', 0, 1, 0.01, 0, (v) => chargeOn && audio.setCharge(v));
  btn(row(p), 'end charge', () => {
    audio.endCharge();
    chargeOn = false;
  });
  cols.appendChild(p);
}

// ── HERO MOMENTS ────────────────────────────────────────────────────────────
{
  const p = panel('Hero moments');
  const r = row(p);
  btn(r, 'OVERDRIVE burst', () => audio.overdriveBurst());
  btn(r, 'COMBO ERUPTION', () => audio.comboErupt());
  btn(r, 'LAST BREATH', () => audio.lastBreath());
  btn(r, 'power-up', () => audio.powerup());
  btn(row(p), 'death', () => audio.death(), 'warn');
  cols.appendChild(p);
}

// ── MASTER VOLUMES ──────────────────────────────────────────────────────────
{
  const p = panel('Master volumes');
  let m = 0.85;
  let s = 0.9;
  let mu = 0.6;
  const apply = () => audio.setVolumes(m, s, mu);
  slider(p, 'master', 0, 1, 0.01, m, (v) => {
    m = v;
    apply();
  });
  slider(p, 'sfx', 0, 1, 0.01, s, (v) => {
    s = v;
    apply();
  });
  slider(p, 'music', 0, 1, 0.01, mu, (v) => {
    mu = v;
    apply();
  });
  cols.appendChild(p);
}
