import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy } from './enemies';
import { angleDiff } from './vec';

const DT = 1 / 60;

// Spawn a shielded enemy, then jump the player ~90° around it. With a laggy shield the
// arc can't snap to the new bearing in one frame — that gap is what a strafing player
// exploits to land a dash. With the OLD instant-snap code the gap closes immediately and
// the first assertion fails.
describe('shield tracking lag', () => {
  it('does not snap the shield to the player in a single frame', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 1000; w.player.y = 360; // shield seeds facing "down" toward here
    const e = w.spawnEnemy('darter', 1000, 200, 1, 1, true)!;
    expect(e.shielded).toBe(true);
    w.player.x = 1160; w.player.y = 200; // jump ~90° around the enemy
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    updateEnemy(e, w, DT);
    // turned toward the player but still far from facing it (no instant snap)
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeGreaterThan(1.0);
  });

  it('converges to face a held-still player given enough time', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 1000; w.player.y = 360;
    const e = w.spawnEnemy('darter', 1000, 200, 1, 1, true)!;
    w.player.x = 1160; w.player.y = 200;
    for (let i = 0; i < 300; i++) {
      updateEnemy(e, w, DT);
      e.x = 1000; e.y = 200; e.vx = 0; e.vy = 0; // pin the enemy so the target bearing is constant
    }
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeLessThan(0.05);
  });

  it('seeds the shield facing the player at spawn (no phantom gap)', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 600; w.player.y = 600;
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, true)!;
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeLessThan(0.01);
  });
});
