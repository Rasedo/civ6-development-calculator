/** THE production column layout, defined ONCE.
 *
 * The wire records mask COLUMNS, and both engines must agree on what column 7
 * means, forever. One derivation, imported by everything that needs it — a
 * second copy would rot the file format silently.
 *
 * Layout, shared by `production_mask` and `seat_masks`:
 *     [0, NB)            queue that City Center building
 *     NB                 SETTLER
 *     NB + 1             IDLE (queue nothing)
 *     [NB+2, NB+2+NU)    train that roster unit
 *     [NB+2+NU, +nS)     place that scaffold district
 *     [wonderLo, +nW)    queue that world wonder (placement re-scanned)
 *     [projectLo, +nP)   run that district project — base rows and the four
 *                        space-race steps alike; a space row is legal only
 *                        with its tech and its predecessor step complete
 *     [formLo, +2*NU)    train that roster unit AS A FORMATION — the corps
 *                        block then the army block; a column is legal only
 *                        with the enabling building standing and the tier's
 *                        civic in
 *     [promoteLo, +Q-1)  move queue entry k+1 to the HEAD (k = 0 names the
 *                        second entry — the first is already the head, so
 *                        there is no column for it)
 * There is no PURCHASE block: gold and faith spending is the BUY WIRE (kinds
 * 0-7, one purchase per seat per turn), which every seat records and both
 * engines re-validate at the gold block's own phase position.
 */
import type { City, QueueItem } from './types';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { SCAFFOLD_DISTRICTS } from '../data/districts';
import { UNITS } from '../data/units';
import { BUILT_WONDERS } from '../data/builtWonders';
import { PROJECTS } from '../data/projects';
import { PRODUCTION_QUEUE_MAX } from '../data/seats';

export const BUILDING_DISTRICTS: Set<string> = new Set<string>([
  'CITY_CENTER',
  ...SCAFFOLD_DISTRICTS.map((d) => d.id),
]);

export function centerBuildingIds(): string[] {
  return Object.values(BUILDINGS)
    .filter((b) => BUILDING_DISTRICTS.has(b.district) && b.id !== 'PALACE' && !SCRIPTED_HELD_BUILDINGS.has(b.id))
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))
    .map((b) => b.id);
}

/** The unit rows, in table order — the order IS the tie-break in both engines'
 * best-of-roster scans, so it must never be re-sorted. */
export function rosterUnitIds(): string[] {
  return Object.values(UNITS).map((u) => u.id);
}

export function wonderIds(): string[] {
  return Object.values(BUILT_WONDERS).map((w) => w.id);
}

export function projectIds(): string[] {
  return Object.values(PROJECTS).map((p) => p.id);
}

export interface ProdLayout {
  NB: number;
  NU: number;
  buildings: string[];
  units: string[];
  wonders: string[];
  projects: string[];
  settlerCol: number;
  idleCol: number;
  unitLo: number;
  districtLo: number;
  wonderLo: number;
  projectLo: number;
  formLo: number;
  promoteLo: number;
  width: number;
}

export function prodLayout(): ProdLayout {
  const buildings = centerBuildingIds();
  const units = rosterUnitIds();
  const wonders = wonderIds();
  const projects = projectIds();
  const NB = buildings.length;
  const NU = units.length;
  const nS = SCAFFOLD_DISTRICTS.length;
  const wonderLo = NB + 2 + NU + nS;
  const projectLo = wonderLo + wonders.length;
  const formLo = projectLo + projects.length;
  const promoteLo = formLo + 2 * NU;
  return {
    NB,
    NU,
    buildings,
    units,
    wonders,
    projects,
    settlerCol: NB,
    idleCol: NB + 1,
    unitLo: NB + 2,
    districtLo: NB + 2 + NU,
    wonderLo,
    projectLo,
    formLo,
    promoteLo,
    width: promoteLo + PRODUCTION_QUEUE_MAX - 1,
  };
}

interface QColIdx {
  L: ProdLayout;
  b: Map<string, number>;
  u: Map<string, number>;
  d: Map<string, number>;
  w: Map<string, number>;
  p: Map<string, number>;
}
let QCOL: QColIdx | null = null;
function qcolIdx(): QColIdx {
  if (!QCOL) {
    const L = prodLayout();
    QCOL = {
      L,
      b: new Map(L.buildings.map((id, i) => [id, i])),
      u: new Map(L.units.map((id, i) => [id, i])),
      d: new Map(SCAFFOLD_DISTRICTS.map((sd, i) => [sd.id as string, i])),
      w: new Map(L.wonders.map((id, i) => [id, i])),
      p: new Map(L.projects.map((id, i) => [id, i])),
    };
  }
  return QCOL;
}

/** One queue item as a PRODUCTION COLUMN in this layout — the space the
 *  GPU's `city_current` stores and the key `City.itemBank` banks under.
 *  -1 = no column (an empty slot, or an id the layout does not carry). */
export function queueItemColumn(q: QueueItem | undefined): number {
  if (!q) return -1;
  const c = qcolIdx();
  switch (q.kind) {
    case 'building': {
      const i = c.b.get(q.building);
      return i === undefined ? -1 : i;
    }
    case 'settler':
      return c.L.settlerCol;
    case 'unit': {
      const i = c.u.get(q.unit);
      if (i === undefined) return -1;
      // a FORMATION entry sits in its own block — corps first, then army —
      // because that is the column that queued it and what the GPU stores
      return q.formation ? c.L.formLo + (q.formation - 1) * c.L.NU + i : c.L.unitLo + i;
    }
    case 'district': {
      const i = c.d.get(q.district);
      return i === undefined ? -1 : c.L.districtLo + i;
    }
    case 'wonder': {
      const i = c.w.get(q.wonder);
      return i === undefined ? -1 : c.L.wonderLo + i;
    }
    case 'project': {
      const i = c.p.get(q.project);
      return i === undefined ? -1 : c.L.projectLo + i;
    }
  }
}

/** CIV6: production is never lost — a CANCELLED item keeps its own hammers,
 *  held against the ITEM until it is queued again. Work lost to INVALIDATION
 *  (a flipped or razed site) banks to `City.productionBank` instead. */
export function bankItemProgress(city: City, item: QueueItem): void {
  if (item.progress <= 0) return;
  const col = queueItemColumn(item);
  if (col < 0) return;
  const bank = (city.itemBank ??= {});
  bank[col] = (bank[col] ?? 0) + item.progress;
}

/** The hammers waiting for this item, REMOVED from the ledger — every queue
 *  site adds them to the entry it is about to push. */
export function takeItemBank(city: City, item: QueueItem): number {
  const col = queueItemColumn(item);
  const v = city.itemBank?.[col];
  if (!v) return 0;
  delete city.itemBank![col];
  return v;
}
