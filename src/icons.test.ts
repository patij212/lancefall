import { describe, it, expect } from 'vitest';
import { icon, ICON_KEYS } from './icons';

// Playtest (Nick): "all perks and events need icons." A cohesive cockpit set of inline-SVG
// glyphs, stroke-only + currentColor so the existing per-card --accent tints them (matching
// THE CHOICE's inline-SVG glyphs). Decoupled from ui.ts so it can land while ui.ts is busy;
// ui.ts later swaps perkGlyph() to icon(glyph) and shows icon(eventDef.id) on event cards.
const PERK_EVO = [
  'lance', 'cell', 'graze', 'burst', 'ghost', 'clock', 'pierce', 'siphon', 'window', 'nova', 'reflect', 'gem',
  'impaler', 'supernova', 'perpetual', 'wraith', 'inferno', 'juggernaut', 'aegis',
];
const EVENTS = ['shrine', 'gamble', 'treasure', 'eliteWave', 'cursedBargain'];

describe('icons — cockpit inline-SVG glyph set', () => {
  it('covers every perk, evolution, and event glyph key', () => {
    for (const k of [...PERK_EVO, ...EVENTS]) expect(ICON_KEYS).toContain(k);
    expect(ICON_KEYS.length).toBeGreaterThanOrEqual(PERK_EVO.length + EVENTS.length);
  });

  it('every icon is a 24×24 stroke-only SVG tinted by currentColor (no hardcoded colour)', () => {
    for (const k of ICON_KEYS) {
      const svg = icon(k);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('fill="none"');
      expect(svg).not.toContain('#'); // no hex → the card's --accent tints it
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    }
  });

  it('renders real geometry for each glyph (non-trivial path content)', () => {
    for (const k of ICON_KEYS) expect(icon(k).length).toBeGreaterThan(80);
  });

  it('falls back to a valid glyph for an unknown key (never crashes a card)', () => {
    expect(icon('totally-unknown' as never).startsWith('<svg')).toBe(true);
  });
});
