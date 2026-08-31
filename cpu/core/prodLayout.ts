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
 *     [promoteLo, +Q-1)  move queue entry k+1 to the HEAD (k = 0 names the
 *                        second entry — the first is already the head, so
 *                        there is no column for it)
 * There is no PURCHASE block: gold and faith spending is the BUY WIRE (kinds
 * 0-7, one purchase per seat per turn), which every seat records and both
 * engines re-validate at the gold block's own phase position.
 */
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
  const promoteLo = projectLo + projects.length;
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
    promoteLo,
    width: promoteLo + PRODUCTION_QUEUE_MAX - 1,
  };
}
