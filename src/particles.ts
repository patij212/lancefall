// Object-pooled particle system + floating combo text. Zero allocation in the
// hot path. Rendered additively (globalCompositeOperation='lighter') for cheap
// gorgeous bloom.

import { Pool } from './pool';
import { TUNE } from './tune';
import type { Particle, FloatingText } from './types';
import type { Rng } from './rng';

function makeParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    color: '#ffffff',
    drag: 0.9,
    gravity: 0,
    kind: 'spark',
    ringR: 0,
    ringMax: 0,
  };
}

function makeText(): FloatingText {
  return { active: false, text: '', x: 0, y: 0, y0: 0, vy: 0, life: 0, maxLife: 1, scale: 1, color: '#fff' };
}

export class Particles {
  pool: Pool<Particle>;
  texts: FloatingText[];
  private rng: Rng;
  /** scales emitted counts (accessibility / perf setting): 0.4 / 0.7 / 1.0 */
  density = 1;

  constructor(rng: Rng, size = 2600, textSize = 64) {
    this.pool = new Pool(makeParticle, size);
    this.texts = new Array(textSize);
    for (let i = 0; i < textSize; i++) this.texts[i] = makeText();
    this.rng = rng;
  }

  reset(): void {
    this.pool.clear();
    for (const t of this.texts) t.active = false;
  }

  private spark(x: number, y: number): Particle | null {
    const p = this.pool.obtain();
    if (!p) return null;
    p.x = x;
    p.y = y;
    p.kind = 'spark';
    p.gravity = 0;
    p.drag = TUNE.particles.sparkDrag;
    return p;
  }

  /** Enemy death burst: radial sparks + a few white-hot flashes. */
  burst(x: number, y: number, count: number, color: string): void {
    const n = Math.max(4, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const p = this.spark(x, y);
      if (!p) break;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(TUNE.particles.sparkSpeedMin, TUNE.particles.sparkSpeedMax);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.size = this.rng.range(2, 5);
      p.maxLife = p.life = this.rng.range(TUNE.particles.sparkLifeMin, TUNE.particles.sparkLifeMax);
      p.color = color;
    }
    // white-hot core flashes
    for (let i = 0; i < 3; i++) {
      const p = this.spark(x, y);
      if (!p) break;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(40, 160);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.size = 6;
      p.maxLife = p.life = 0.12;
      p.color = '#ffffff';
    }
  }

  /** A dash-trail node (no velocity, fades fast). */
  trail(x: number, y: number, size: number, color: string): void {
    const p = this.pool.obtain();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.kind = 'trail';
    p.size = size;
    p.maxLife = p.life = TUNE.particles.trailLife;
    p.color = color;
    p.drag = 1;
    p.gravity = 0;
  }

  /** Directional speed-lines behind a dash. */
  streaks(x: number, y: number, dirX: number, dirY: number, color: string): void {
    const n = Math.round(8 * this.density);
    for (let i = 0; i < n; i++) {
      const p = this.spark(x, y);
      if (!p) break;
      const jitter = this.rng.range(-0.25, 0.25);
      const c = Math.cos(jitter);
      const s = Math.sin(jitter);
      const rx = dirX * c - dirY * s;
      const ry = dirX * s + dirY * c;
      const sp = this.rng.range(200, 480);
      p.vx = -rx * sp;
      p.vy = -ry * sp;
      p.kind = 'streak';
      p.size = this.rng.range(2, 4);
      p.maxLife = p.life = 0.15;
      p.color = color;
      p.drag = 0.85;
    }
  }

  graze(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const p = this.spark(x, y);
      if (!p) break;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(40, 140);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.size = 1.5;
      p.maxLife = p.life = 0.2;
      p.color = '#ffffff';
    }
    this.ring(x, y, 36, '#ffffff', 0.3);
  }

  /** Expanding stroked shockwave ring. */
  ring(x: number, y: number, maxR: number, color: string, life: number): void {
    const p = this.pool.obtain();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.kind = 'ring';
    p.size = 0;
    p.ringR = 0;
    p.ringMax = maxR;
    p.maxLife = p.life = life;
    p.color = color;
  }

  /** Landing dust puff. */
  dust(x: number, y: number, color: string): void {
    for (let i = 0; i < Math.round(6 * this.density); i++) {
      const p = this.spark(x, y);
      if (!p) break;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(20, 90);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.size = this.rng.range(2, 4);
      p.maxLife = p.life = this.rng.range(0.2, 0.4);
      p.color = color;
    }
  }

  floatText(x: number, y: number, text: string, color: string, scale = 1): void {
    for (const t of this.texts) {
      if (!t.active) {
        t.active = true;
        t.x = x;
        t.y = y;
        t.y0 = y;
        t.vy = -60;
        t.text = text;
        t.color = color;
        t.scale = scale;
        t.maxLife = t.life = 0.7;
        return;
      }
    }
  }

  update(dt: number): void {
    this.pool.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        return;
      }
      if (p.kind === 'ring') {
        const k = 1 - p.life / p.maxLife;
        p.ringR = p.ringMax * (1 - (1 - k) * (1 - k)); // easeOut
        return;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.drag !== 1) {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d;
        p.vy *= d;
      }
    });

    for (const t of this.texts) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy += 40 * dt; // gentle gravity so it arcs
    }
  }
}
