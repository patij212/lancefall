// src/audioProvenance.ts — PURE audio-licensing policy + provenance gate. No ctx/DOM/rng.
// Every shipped audio asset must carry a provenance record with an ALLOWED license; the
// build-time validator (tools/audio/validate-flagship.mjs) rejects a release otherwise.
// Policy (owner-approved): allow CC0 / CC-BY / Pixabay / royalty-free game licenses;
// reject NC, SA, GPL, AI-generated, and unlicensed. CC-BY requires a visible attribution.

export type AudioLicense =
  | 'CC0'
  | 'CC-BY'
  | 'pixabay'
  | 'royalty-free'
  | 'CC-BY-NC'
  | 'CC-BY-SA'
  | 'GPL'
  | 'ai-generated'
  | 'unknown';

export interface ProvenanceEntry {
  asset: string; // runtime asset path, e.g. "sfx/dash_fire_1.ogg"
  source: string; // where it came from, e.g. "Sonniss GDC 2023"
  url: string; // the source URL
  license: AudioLicense;
  author: string;
  /** Required iff the license requires attribution (CC-BY). The exact credit line. */
  attribution?: string;
}

const ALLOWED: ReadonlySet<AudioLicense> = new Set<AudioLicense>(['CC0', 'CC-BY', 'pixabay', 'royalty-free']);

/** True for licenses we may ship commercially. */
export function isLicenseAllowed(license: AudioLicense): boolean {
  return ALLOWED.has(license);
}

/** True for licenses that require a visible credit (CC-BY). */
export function requiresAttribution(license: AudioLicense): boolean {
  return license === 'CC-BY';
}

/** One error string per asset that is missing a field, carries a rejected license, or is
 *  CC-BY without an attribution line. Empty array ⇒ the ledger is release-ready. */
export function validateProvenance(entries: readonly ProvenanceEntry[]): string[] {
  const errors: string[] = [];
  for (const e of entries) {
    const id = e.asset || '(unnamed asset)';
    if (!e.asset || !e.source || !e.url || !e.license || !e.author) {
      errors.push(`${id}: incomplete provenance (asset, source, url, license, author all required)`);
      continue;
    }
    if (!isLicenseAllowed(e.license)) {
      errors.push(`${id}: rejected license "${e.license}" (allow CC0/CC-BY/pixabay/royalty-free only)`);
      continue;
    }
    if (requiresAttribution(e.license) && !e.attribution) {
      errors.push(`${id}: CC-BY requires an attribution line`);
    }
  }
  return errors;
}
