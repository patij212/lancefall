// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SaveData } from '../save';
import type { LeaderboardPanelDeps } from './leaderboard';

// the panel talks to the network only through ../api — mock it so we control enablement + timing.
const { fetchLeaderboard, leaderboardEnabled } = vi.hoisted(() => ({
  fetchLeaderboard: vi.fn(),
  leaderboardEnabled: vi.fn(() => true),
}));
vi.mock('../api', () => ({ fetchLeaderboard, leaderboardEnabled }));

import { buildLeaderboardPanel } from './leaderboard';

const save = (handle = '') => ({ handle }) as unknown as SaveData;
const tick = () => new Promise((r) => setTimeout(r, 0));
const entry = (name: string) => ({ name, score: 100, wave: 5, combo: 0, heat: 0, rank: 1 });

// mount the panel like the real app does — the load() guard checks `listWrap.isConnected`, so a
// detached panel never renders (which is the point: a closed panel drops its in-flight fetch).
const mount = (deps: LeaderboardPanelDeps) => {
  const p = buildLeaderboardPanel(deps);
  document.body.append(p.root);
  return p;
};

beforeEach(() => {
  fetchLeaderboard.mockReset();
  leaderboardEnabled.mockReturnValue(true);
});
afterEach(() => document.body.replaceChildren());

describe('buildLeaderboardPanel', () => {
  it('shows an offline note and no mode tabs when leaderboards are not configured', () => {
    leaderboardEnabled.mockReturnValue(false);
    const panel = mount({ onSetHandle: () => {}, onClose: () => {} });
    panel.open(save());
    expect(panel.root.querySelectorAll('.leader-modes')).toHaveLength(0);
    expect(panel.root.textContent).toContain('not configured');
  });

  it('seeds the handle field from the save', () => {
    fetchLeaderboard.mockResolvedValue([]);
    const panel = mount({ onSetHandle: () => {}, onClose: () => {} });
    panel.open(save('ACE'));
    expect((panel.root.querySelector('.leader-name input') as HTMLInputElement).value).toBe('ACE');
  });

  it('commits the handle on change', () => {
    fetchLeaderboard.mockResolvedValue([]);
    const onSetHandle = vi.fn();
    const panel = mount({ onSetHandle, onClose: () => {} });
    panel.open(save());
    const input = panel.root.querySelector('.leader-name input') as HTMLInputElement;
    input.value = 'NOVA';
    input.dispatchEvent(new Event('change'));
    expect(onSetHandle).toHaveBeenCalledWith('NOVA');
  });

  it('calls onClose when DONE is pressed', () => {
    fetchLeaderboard.mockResolvedValue([]);
    const onClose = vi.fn();
    const panel = mount({ onSetHandle: () => {}, onClose });
    panel.open(save());
    ([...panel.root.querySelectorAll('.btn-primary')].find((b) => b.textContent === 'DONE') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty-state message when a board has no scores', async () => {
    fetchLeaderboard.mockResolvedValue([]);
    const panel = mount({ onSetHandle: () => {}, onClose: () => {} });
    panel.open(save());
    await tick();
    expect(panel.root.querySelector('.leader-list')!.textContent).toContain('No scores yet');
  });

  it('drops a stale tab response so the latest tab always wins (the race guard)', async () => {
    // per-mode deferred promises so we control which response resolves when.
    const resolvers: Record<string, (v: unknown) => void> = {};
    fetchLeaderboard.mockImplementation((mode: string) => new Promise((res) => { resolvers[mode] = res; }));
    const panel = mount({ onSetHandle: () => {}, onClose: () => {} });
    panel.open(save());                       // load #1: endless (pending)
    const clickTab = (label: string) =>
      ([...panel.root.querySelectorAll('.leader-modes .btn-sm')].find((b) => b.textContent === label) as HTMLElement).click();
    clickTab('ARENA');                         // load #2: arena (pending)
    clickTab('ECHO OF THE FALL');              // load #3: daily — the LATEST

    resolvers['daily']([entry('DAILY1')]);     // resolve the latest first…
    await tick();
    expect(panel.root.querySelector('.leader-handle')!.textContent).toBe('DAILY1');

    resolvers['arena']([entry('ARENA1')]);     // …then the stale earlier response lands
    await tick();
    expect(panel.root.querySelector('.leader-handle')!.textContent).toBe('DAILY1'); // must NOT be overwritten
  });
});
