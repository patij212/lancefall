// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { reconcile } from './dom';

function ids(c: HTMLElement): string[] {
  return Array.from(c.children).map((n) => n.textContent ?? '');
}

describe('reconcile', () => {
  const create = (_s: string) => {
    const d = document.createElement('div');
    d.dataset.created = '1';
    return d;
  };
  const update = (n: HTMLElement, s: string) => { n.textContent = s; };

  it('creates nodes in item order', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });

  it('preserves node identity across calls (no recreate)', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b'], (s) => s, create, update);
    const firstA = c.children[0];
    reconcile(c, ['a', 'b'], (s) => s, create, update);
    expect(c.children[0]).toBe(firstA); // same DOM node, updated in place
  });

  it('reorders by moving existing nodes, not recreating them', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    const nodeB = c.children[1];
    reconcile(c, ['c', 'b', 'a'], (s) => s, create, update);
    expect(ids(c)).toEqual(['c', 'b', 'a']);
    expect(c.children[1]).toBe(nodeB); // b kept its node
  });

  it('inserts a new item at the correct slot', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'c'], (s) => s, create, update);
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'b', 'c']);
  });

  it('removes nodes whose key is gone', () => {
    const c = document.createElement('div');
    reconcile(c, ['a', 'b', 'c'], (s) => s, create, update);
    reconcile(c, ['a', 'c'], (s) => s, create, update);
    expect(ids(c)).toEqual(['a', 'c']);
  });

  it('passes the correct item and index to updateFn', () => {
    const c = document.createElement('div');
    const seen: Array<[string, number]> = [];
    reconcile(c, ['x', 'y'], (s) => s, create, (_n, s, i) => seen.push([s, i]));
    expect(seen).toEqual([['x', 0], ['y', 1]]);
  });

  it('throws on duplicate keys', () => {
    const c = document.createElement('div');
    expect(() => reconcile(c, ['a', 'a'], (s) => s, create, update)).toThrow(/duplicate key/);
  });
});
