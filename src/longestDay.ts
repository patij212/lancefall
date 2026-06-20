// src/longestDay.ts — THE LONGEST DAY reward grant. Pure + save-side (no rng, no sim).
// Fired when the master cipher hits 100%; idempotent (only pushes ids not already owned).
import type { SaveData } from './save';
import { isLongestDay } from './intercepts';
import { SHIPS } from './ships';
import { shipSkinKey } from './shipSkins';

export function grantLongestDayRewards(save: SaveData): string[] {
  if (!isLongestDay(save)) return [];
  const granted: string[] = [];
  const add = (arr: string[], id: string, tag: string) => {
    if (!arr.includes(id)) { arr.push(id); granted.push(tag); }
  };
  add(save.achievements, 'longestday-read', 'ach:longestday-read');
  add(save.unlockedTrails, 'dawn', 'trail:dawn');
  add(save.unlockedThemes, 'decrypted', 'theme:decrypted');
  for (const ship of SHIPS) add(save.unlockedShipSkins, shipSkinKey(ship.id, 'lastkey'), `skin:${ship.id}:lastkey`);
  return granted;
}
