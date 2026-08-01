/** #70 THE FILE IS THE INTERFACE — the production column layout, defined ONCE.
 *
 * The action file records mask COLUMNS, and both engines must agree on what
 * column 7 means, forever. The exporter used to derive the building order
 * inline in `scripts/export-gpu.ts` and nothing else could see it; the moment a
 * second derivation existed the file format would rot silently, which is the
 * same disease as #85 (the rival mask five units behind the picker) one level
 * up. So the derivation lives here and both sides import it.
 *
 * Layout, shared by `production_mask` and `rival_masks`:
 *     [0, NB)            queue that City Center building
 *     NB                 SETTLER
 *     NB + 1             IDLE (queue nothing)
 *     [NB+2, NB+2+NU)    train that roster unit
 *     NB+2+NU ..         place that scaffold district
 */
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { SCAFFOLD_DISTRICTS } from '../data/districts';
import { UNITS } from '../data/units';

/** Districts whose buildings sit in the production table. */
export const BUILDING_DISTRICTS: Set<string> = new Set<string>([
  'CITY_CENTER',
  ...SCAFFOLD_DISTRICTS.map((d) => d.id),
]);

/** The building rows, in table order. PALACE stays out — both engines model it
 * as a capital term, not a row. Worship buildings JOIN the table (rivals
 * faith-buy them; the pickers mask them via the `worship` flag). */
export function centerBuildingIds(): string[] {
  return Object.values(BUILDINGS)
    .filter((b) => BUILDING_DISTRICTS.has(b.district) && b.id !== 'PALACE' && !SCRIPTED_HELD_BUILDINGS.has(b.id))
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))
    .map((b) => b.id);
}

/** The unit rows, in table order — the order IS the tie-break in both engines'
 * best-of-roster scans (AUDIT B-10), so it must never be re-sorted. */
export function rosterUnitIds(): string[] {
  return Object.values(UNITS).map((u) => u.id);
}

export interface ProdLayout {
  NB: number;
  NU: number;
  buildings: string[];
  units: string[];
  settlerCol: number;
  idleCol: number;
  unitLo: number;
  districtLo: number;
}

export function prodLayout(): ProdLayout {
  const buildings = centerBuildingIds();
  const units = rosterUnitIds();
  const NB = buildings.length;
  const NU = units.length;
  return {
    NB,
    NU,
    buildings,
    units,
    settlerCol: NB,
    idleCol: NB + 1,
    unitLo: NB + 2,
    districtLo: NB + 2 + NU,
  };
}
