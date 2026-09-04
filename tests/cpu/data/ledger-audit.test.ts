import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE LEDGER MUST POINT AT LIVE AUDIT ITEMS.
 *
 * The owner's rule is that a gap deferred on an unimplemented mechanic is TWO
 * open items — the mechanic and the gap, with the gap naming its blocker — and
 * that "recorded" is a deferral, never a closure. A blocker that lives only as
 * free text in `roster_ledger.json` is invisible to every pass that reads the
 * AUDIT, which is how twenty rows quietly stopped being work (C-64..C-72).
 *
 * Nothing guarded that until this lane: the ledger had drifted to a row whose
 * cited item did not exist, and to a modifier with no row at all, and only a
 * hand census found either.
 */
const root = join(__dirname, '..', '..', '..');
const ledger = JSON.parse(readFileSync(join(root, 'docs', 'roster_ledger.json'), 'utf-8')) as
  Record<string, string>;
const audit = readFileSync(join(root, 'docs', 'AUDIT.md'), 'utf-8');

const ID = /\b[A-Z]-\d+r?\b/g;
const itemIds = new Set(
  [...audit.matchAll(/^- \*\*([A-Z]-\d+r?)\./gm)].map((m) => m[1]),
);
const closedIds = new Set(
  [...audit.matchAll(/^- \*\*([A-Z]-\d+r?)\.[^*]*?CLOSED/gm)].map((m) => m[1]),
);
const openRows = Object.entries(ledger).filter(([, v]) => v.startsWith('open'));

describe('the roster ledger and the audit agree', () => {
  it('has items to check at all', () => {
    expect(itemIds.size).toBeGreaterThan(20);
    expect(openRows.length).toBeGreaterThan(0);
  });

  it('gives every OPEN row an audit item to name its blocker', () => {
    const bare = openRows.filter(([, v]) => !v.match(ID)).map(([k]) => k);
    expect(bare).toEqual([]);
  });

  it('cites only items that exist', () => {
    const dangling: string[] = [];
    for (const [k, v] of openRows) {
      for (const id of v.match(ID) ?? []) if (!itemIds.has(id)) dangling.push(`${k} -> ${id}`);
    }
    expect(dangling).toEqual([]);
  });

  it('never leaves a row open against an item already CLOSED', () => {
    const stale: string[] = [];
    for (const [k, v] of openRows) {
      for (const id of v.match(ID) ?? []) if (closedIds.has(id)) stale.push(`${k} -> ${id}`);
    }
    expect(stale).toEqual([]);
  });

  it('says only `shipped` or `open:` — no third state to hide a deferral in', () => {
    const odd = Object.entries(ledger)
      .filter(([, v]) => v !== 'shipped' && !v.startsWith('open'))
      .map(([k, v]) => `${k}: ${v.slice(0, 40)}`);
    expect(odd).toEqual([]);
  });
});
