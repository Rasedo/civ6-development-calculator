/**
 * GREAT WORKS HELD PER HOLDER. CIV6 (`Building_GreatWorks`): a building or
 * wonder declares slots of one type, a slot type takes a set of object types,
 * and a work sits in ONE holder's slot. These pin the table both engines read
 * (`cpu/data/greatWorks.ts`) against the catalogs it names.
 */
import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';
import {
  GW_HOLDERS, GW_LAYOUT, GW_LAYOUT_W, GWS_ACCEPTS, GWS_COUNT, GWO_COUNT, GWS_PALACE, GWS_ART, GWS_CATHEDRAL,
  GWO_RELIGIOUS, GWO_SCULPTURE, GWO_WRITING, GWO_RELIC, GWO_ARTIFACT, GWO_MUSIC, slotAccepts, gwKindOf,
  holderSlots, EXTRA_SLOT_ROWS, GW_THEME_ART, GW_THEME_ARTIFACT,
} from '../../../cpu/data/greatWorks';

describe('the great-work holder table', () => {
  it('names only buildings and wonders the engine builds', () => {
    for (const h of GW_HOLDERS) {
      if (h.wonder) expect(BUILT_WONDERS[h.id], h.id).toBeDefined();
      else expect(BUILDINGS[h.id], h.id).toBeDefined();
    }
  });

  it('lays out every slot once, holders in table order, the Palace widened by its widest extra row', () => {
    const base = GW_HOLDERS.reduce((n, h) => n + h.slots.reduce((m, s) => m + s.count, 0), 0);
    const extra = EXTRA_SLOT_ROWS.reduce((n, r) => Math.max(n, r.amount), 0);
    expect(GW_LAYOUT_W).toBe(base + extra);
    expect(GW_LAYOUT_W).toBe(37);
    let last = -1;
    for (const s of GW_LAYOUT) { expect(s.holder).toBeGreaterThanOrEqual(last); last = s.holder; }
    const palace = GW_HOLDERS.findIndex((h) => h.id === 'PALACE');
    expect(holderSlots(palace).length).toBe(1 + 4);
    expect(GW_LAYOUT.filter((s) => s.extraRank >= 0).map((s) => s.extraRank)).toEqual([0, 1, 2, 3]);
  });

  it('accepts what GreatWork_ValidSubTypes says: a Palace slot anything, a Cathedral slot religious art only', () => {
    expect(GWS_ACCEPTS.length).toBe(GWS_COUNT);
    for (let o = 0; o < GWO_COUNT; o++) expect(slotAccepts(GWS_PALACE, o)).toBe(true);
    expect(slotAccepts(GWS_CATHEDRAL, GWO_RELIGIOUS)).toBe(true);
    expect(slotAccepts(GWS_CATHEDRAL, GWO_SCULPTURE)).toBe(false);
    expect(slotAccepts(GWS_ART, GWO_SCULPTURE)).toBe(true);
    expect(slotAccepts(GWS_ART, GWO_WRITING)).toBe(false);
    expect([GWO_WRITING, GWO_SCULPTURE, GWO_MUSIC, GWO_RELIC, GWO_ARTIFACT].map(gwKindOf)).toEqual([0, 1, 2, -1, -1]);
  });

  it('gives the two museums their theming rules and nobody else one', () => {
    const themed = GW_HOLDERS.filter((h) => h.theme !== 0).map((h) => [h.id, h.theme]);
    expect(themed).toEqual([['MUSEUM', GW_THEME_ART], ['ARCHAEOLOGICAL_MUSEUM', GW_THEME_ARTIFACT]]);
  });
});
