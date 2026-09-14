/**
 * PROVENANCE ONLY — the dump without the fixtures, for the tagging loop:
 *
 *   npx vite-node cpu/export/provenance_dump.ts [out.json]
 *   python tools/civ6lab/xml_check.py check out.json
 *
 * `npm run export` writes the same file beside rules.json; this is the
 * two-second path a catalog edit re-checks by, and it writes wherever it is
 * told, so several taggers can run it at once.
 */
import { writeFileSync } from 'node:fs';

import { buildProvenance } from './provenance';

const out = process.argv[2] ?? 'seeder/worlds/provenance.json';
const prov = buildProvenance();
writeFileSync(out, JSON.stringify(prov));
const tagged = Object.values(prov.coverage).reduce((s, c) => s + c.tagged, 0);
console.log(`${out}: ${tagged}/${prov.constants.length} constants tagged`);
for (const [cat, c] of Object.entries(prov.coverage).sort((a, b) => b[1].total - a[1].total)) {
  if (c.total) console.log(`  ${cat.padEnd(22)} ${String(c.tagged).padStart(5)}/${c.total}`);
}
