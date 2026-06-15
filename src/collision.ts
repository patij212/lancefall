// Collision math for the dash-spear and bullets.
// - segment vs circle  → the dash trail (a swept capsule) hitting enemies
// - circle vs circle    → bullet vs player hitbox
// - a uniform spatial hash for broad-phase so a dash only tests nearby enemies.

/** Squared distance from point (px,py) to segment a→b. */
export function pointSegDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 > 1e-9 ? (apx * abx + apy * aby) / abLen2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

/** True if circle (cx,cy,r) intersects the capsule of segment a→b with radius capR. */
export function segCircleHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
  capR = 0,
): boolean {
  const rr = r + capR;
  return pointSegDist2(cx, cy, ax, ay, bx, by) <= rr * rr;
}

export function circleHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** A shielded enemy blocks a spear whose APPROACH (the direction from the enemy
 *  toward where the dash came from) falls within ±arcHalf of where its shield faces.
 *  Flank it — approach from the side/back, outside the cone — to land. Pure angle
 *  test; arcHalf is passed in (TUNE.SHIELD.arcHalf) and must match the rendered arc. */
export function shieldBlocks(shieldAngle: number, approachAngle: number, arcHalf: number): boolean {
  let d = approachAngle - shieldAngle;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-π, π]
  return Math.abs(d) <= arcHalf;
}

export interface HasPos {
  x: number;
  y: number;
  active: boolean;
}

/** Uniform spatial hash for broad-phase. Rebuilt each sim tick. */
export class SpatialHash<T extends HasPos> {
  private cell: number;
  private map = new Map<number, T[]>();

  constructor(cellSize: number) {
    this.cell = cellSize;
  }

  private key(cx: number, cy: number): number {
    // pack two 16-bit signed cell coords into one number
    return ((cx + 32768) << 16) | (cy + 32768);
  }

  clear(): void {
    this.map.clear();
  }

  rebuild(items: Iterable<T>): void {
    this.map.clear();
    for (const it of items) {
      if (!it.active) continue;
      this.insert(it);
    }
  }

  insert(it: T): void {
    const cx = Math.floor(it.x / this.cell);
    const cy = Math.floor(it.y / this.cell);
    const k = this.key(cx, cy);
    let bucket = this.map.get(k);
    if (!bucket) {
      bucket = [];
      this.map.set(k, bucket);
    }
    bucket.push(it);
  }

  /** Collect items in cells overlapping the AABB [minX,minY]-[maxX,maxY]. */
  queryAABB(minX: number, minY: number, maxX: number, maxY: number, out: T[]): T[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor(minX / c);
    const y0 = Math.floor(minY / c);
    const x1 = Math.floor(maxX / c);
    const y1 = Math.floor(maxY / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.map.get(this.key(cx, cy));
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
        }
      }
    }
    return out;
  }
}
