// Generic object pool. Everything (bullets, enemies, particles, gems) is
// pre-allocated at boot so the hot loop never allocates and never triggers GC
// stutter. obtain() returns null when exhausted — callers degrade gracefully.

export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  private cursor = 0;
  activeCount = 0;

  constructor(factory: () => T, size: number) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
  }

  /** Find a free slot (round-robin scan). Returns null if all active. */
  obtain(): T | null {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const it = this.items[idx];
      if (!it.active) {
        it.active = true;
        this.cursor = (idx + 1) % n;
        this.activeCount++;
        return it;
      }
    }
    return null;
  }

  release(item: T): void {
    if (item.active) {
      item.active = false;
      this.activeCount--;
    }
  }

  forEachActive(cb: (t: T) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].active) cb(items[i]);
    }
  }

  clear(): void {
    for (const it of this.items) it.active = false;
    this.activeCount = 0;
    this.cursor = 0;
  }
}
