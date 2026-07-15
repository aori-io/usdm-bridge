/**
 * Regenerate `src/internal/assets/venueIcons.ts` by inlining the venue brand PNGs
 * (`src/internal/assets/images/{aori,relay}.png`) as base64 data URIs, so the
 * widget package ships the icons without a runtime file dependency.
 *
 * Run from the widget package root:
 *   bun scripts/genVenueIcons.ts
 *
 * Add a new venue by dropping `<venue>.png` in the images dir and adding it to
 * the `VENUES` list below (plus a label).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VENUES = ['aori', 'relay'] as const;
const LABELS: Record<string, string> = { aori: 'Aori', relay: 'Relay' };

const assetsDir = join(import.meta.dir, '..', 'src', 'internal', 'assets');
const imagesDir = join(assetsDir, 'images');

const toDataUri = (name: string): string =>
  `data:image/png;base64,${readFileSync(join(imagesDir, `${name}.png`)).toString('base64')}`;

const iconEntries = VENUES.map((v) => `  ${v}: ${JSON.stringify(toDataUri(v))},`).join('\n');
const labelEntries = VENUES.map((v) => `  ${v}: ${JSON.stringify(LABELS[v] ?? v)},`).join('\n');

const out = `// Venue brand icons, inlined as base64 PNG data URIs so the widget package is
// self-contained (matches the token/chain icon convention in this folder).
// Source PNGs live in ./images/{aori,relay}.png; regenerate with scripts/genVenueIcons.ts.
export const venueIcons: Record<string, string> = {
${iconEntries}
};

/** Human-readable venue names for the aggregator UI. */
export const VENUE_LABELS: Record<string, string> = {
${labelEntries}
};

export const getVenueIcon = (venue: string): string | undefined => venueIcons[venue];

export const getVenueLabel = (venue: string): string =>
  VENUE_LABELS[venue] ?? venue.charAt(0).toUpperCase() + venue.slice(1);
`;

writeFileSync(join(assetsDir, 'venueIcons.ts'), out);
console.log(`Wrote ${join(assetsDir, 'venueIcons.ts')} (${VENUES.join(', ')})`);
