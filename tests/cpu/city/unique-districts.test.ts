/**
 * THE TEN UNIQUE DISTRICTS. Every one is a `civVariants` entry on the row it
 * replaces — the same district in storage — carrying its own price, Housing,
 * Amenity, adjacency set, flat yields and grant. Every number is the
 * install's own Districts.xml / District_Adjacencies row.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs, grantCivics } from '../helpers';
import { getModifiers } from '../../../cpu/core/effects';
import { districtAdjacency, effectiveAdjacency } from '../../../cpu/core/yields';
import { projectCost } from '../../../cpu/core/game';
import { DISTRICTS } from '../../../cpu/data/districts';
import { bestTrainableNaval } from '../../../cpu/core/units';
import { PROJECTS } from '../../../cpu/data/projects';
import { DISTRICT_PREREQ_ROWS } from '../../../cpu/data/civilizations';
import type { City, DistrictId, GameState } from '../../../cpu/core/types';

/** replaces -> [civ, name, housing, amenities] straight off Districts.xml. */
const ROWS: readonly (readonly [DistrictId, string, string, number, number])[] = [
  ['AQUEDUCT', 'ROME', 'Bath', 2, 1],
  ['WATER_PARK', 'BRAZIL', 'Copacabana', 0, 2],
  ['THEATER_SQUARE', 'GREECE', 'Acropolis', 0, 0],
  ['INDUSTRIAL_ZONE', 'GERMANY', 'Hansa', 0, 0],
  ['CAMPUS', 'KOREA', 'Seowon', 0, 0],
  ['COMMERCIAL_HUB', 'MALI', 'Suguba', 0, 0],
  ['HOLY_SITE', 'RUSSIA', 'Lavra', 0, 0],
  ['ENCAMPMENT', 'ZULU', 'Ikanda', 1, 0],
  ['NEIGHBORHOOD', 'KONGO', "M'banza", 5, 0],
  ['HARBOR', 'ENGLAND', 'Royal Navy Dockyard', 0, 0],
  ['HARBOR', 'PHOENICIA', 'Cothon', 0, 0],
  ['ENTERTAINMENT_COMPLEX', 'BRAZIL', 'Street Carnival', 0, 2],
] as const;

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 24));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  return { state, city };
}

/** put a COMPLETE district of `type` at (col,row) and hand it to the city. */
function place(state: GameState, city: City, type: DistrictId, col: number, row: number): number {
  const t = tileAtCoords(state.map, col, row);
  t.district = type;
  t.districtComplete = true;
  city.districts.push({ type, tileIndex: t.index });
  return t.index;
}

describe('the unique district catalog', () => {
  it('names every unique district the install gives a seated civilization', () => {
    // twelve rows: `CivUniqueDistrictType` holds sixteen, and four name
    // civilizations this roster does not seat (Hippodrome/Byzantium,
    // Observatory/Maya, Oppidum/Gaul, Thanh/Vietnam).
    const all = Object.values(DISTRICTS).flatMap((d) => (d.civVariants ?? []).map((v) => v.name));
    expect(all.length).toBe(ROWS.length);
    expect(new Set(all).size).toBe(ROWS.length);
  });

  it('carries every row as a variant of the district it replaces', () => {
    for (const [base, civ, name, housing, amenities] of ROWS) {
      const v = DISTRICTS[base].civVariants?.find((x) => x.civ === civ);
      expect(v, `${name} has no variant on ${base}`).toBeTruthy();
      expect(v!.name).toBe(name);
      expect(v!.housing, `${name} housing`).toBe(housing);
      expect(v!.amenities, `${name} amenities`).toBe(amenities);
      // the install prices every unique district at HALF the row it replaces
      expect(v!.cost, `${name} cost`).toBe(DISTRICTS[base].cost / 2);
    }
  });

  it('gives one civilization at most one variant of a district', () => {
    for (const d of Object.values(DISTRICTS)) {
      const civs = (d.civVariants ?? []).map((v) => v.civ);
      expect(new Set(civs).size, `${d.id} names a civilization twice`).toBe(civs.length);
    }
  });
});

describe("a variant's own adjacency REPLACES the base row's", () => {
  it('pays the Seowon a flat four and takes one back per neighbour', () => {
    const { state, city } = scene();
    // FAR from the city centre — a centre is a complete district too, and the
    // Seowon takes one back for every neighbour that is one
    const at = tileAtCoords(state.map, 16, 16);
    const own = DISTRICTS.CAMPUS.civVariants!.find((v) => v.civ === 'KOREA')!.adjacency!;
    expect(districtAdjacency(state.map, at, 'CAMPUS', [], own)).toBe(4);
    place(state, city, 'HOLY_SITE', 17, 16);
    expect(districtAdjacency(state.map, at, 'CAMPUS', [], own)).toBe(3);
    place(state, city, 'THEATER_SQUARE', 16, 17);
    expect(districtAdjacency(state.map, at, 'CAMPUS', [], own)).toBe(2);
  });

  it('reads a mountain for the Campus and nothing for the Seowon', () => {
    const { state } = scene();
    const at = tileAtCoords(state.map, 16, 16);
    tileAtCoords(state.map, 17, 16).elevation = 'MOUNTAIN';
    const own = DISTRICTS.CAMPUS.civVariants!.find((v) => v.civ === 'KOREA')!.adjacency!;
    expect(districtAdjacency(state.map, at, 'CAMPUS')).toBeGreaterThan(0);
    expect(districtAdjacency(state.map, at, 'CAMPUS', [], own)).toBe(4); // the flat four alone
  });

  it('pays the Hansa for a Commercial Hub and for a resource', () => {
    const { state, city } = scene();
    const at = tileAtCoords(state.map, 16, 16);
    const own = DISTRICTS.INDUSTRIAL_ZONE.civVariants!.find((v) => v.civ === 'GERMANY')!.adjacency!;
    expect(districtAdjacency(state.map, at, 'INDUSTRIAL_ZONE', [], own)).toBe(0);
    place(state, city, 'COMMERCIAL_HUB', 17, 16);
    // +2 the hub, +0.5 the district it also is — floored to 2
    expect(districtAdjacency(state.map, at, 'INDUSTRIAL_ZONE', [], own)).toBe(2);
    tileAtCoords(state.map, 16, 17).resource = 'IRON';
    expect(districtAdjacency(state.map, at, 'INDUSTRIAL_ZONE', [], own)).toBe(3);
  });

  it('pays the Suguba for a Holy Site beside it', () => {
    const { state, city } = scene();
    const at = tileAtCoords(state.map, 16, 16);
    const own = DISTRICTS.COMMERCIAL_HUB.civVariants!.find((v) => v.civ === 'MALI')!.adjacency!;
    place(state, city, 'HOLY_SITE', 17, 16);
    // +2 the Holy Site, +0.5 the district it also is — floored to 2
    expect(districtAdjacency(state.map, at, 'COMMERCIAL_HUB', [], own)).toBe(2);
  });

  it('takes the variant list through effectiveAdjacency for its own seat', () => {
    const { state, city } = scene();
    const at = tileAtCoords(state.map, 16, 16);
    place(state, city, 'HOLY_SITE', 17, 16);
    const mods = getModifiers(state, 0);
    // seat 0 plays no civilization in this scene, so it reads the BASE row
    expect(effectiveAdjacency({ map: state.map, mods }, at, 'CAMPUS'))
      .toBe(districtAdjacency(state.map, at, 'CAMPUS'));
  });
});

describe("the M'banza and the Dockyard", () => {
  it('pays the M’banza its own Food and Gold', () => {
    const v = DISTRICTS.NEIGHBORHOOD.civVariants!.find((x) => x.civ === 'KONGO')!;
    expect(v.flatYield).toEqual({ food: 2, gold: 4 });
    expect(v.grantsUnit).toBe('APOSTLE');
  });

  it('unlocks the M’banza at Guilds, where the Neighborhood waits', () => {
    const row = DISTRICT_PREREQ_ROWS.find((r) => r.district === 'NEIGHBORHOOD');
    expect(row, 'no unlock override for the Neighborhood').toBeTruthy();
    expect(row!.civ).toBe('KONGO');
    expect(row!.civic).toBe('GUILDS');
    expect(row!.tech).toBeUndefined();
  });

  it('grants the Dockyard a hull and nothing else', () => {
    const rn = DISTRICTS.HARBOR.civVariants!.find((x) => x.civ === 'ENGLAND')!;
    const co = DISTRICTS.HARBOR.civVariants!.find((x) => x.civ === 'PHOENICIA')!;
    expect(rn.grantsNavalUnit).toBe(true);
    expect(co.grantsNavalUnit).toBeUndefined();
    expect(rn.grantsUnit).toBeUndefined();
  });

  it('finds that hull only when the CITY comes with the question', () => {
    // `trainableUnits` refuses every naval chassis without a city — right for
    // the gold rung, whose unit spawns at the capital and can name no Harbor,
    // and wrong for a grant made BY a coastal district. Asked without the
    // city the Dockyard granted nothing at all, while the GPU granted a
    // Caravel (seed 9235 t232: `nv hull34` against `nv hull-1`).
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    const city = settleAt(state, tileAtCoords(state.map, 4, 4).index);
    grantTechs(state, 'SAILING');
    // a COMPLETED Harbor is the other half of `cityNavalCapable`, so the
    // scene needs no coastline of its own
    const ht = tileAtCoords(state.map, 5, 4);
    ht.district = 'HARBOR';
    ht.districtComplete = true;
    city.districts.push({ type: 'HARBOR', tileIndex: ht.index });

    expect(bestTrainableNaval(state, 0, city)).toBeTruthy();
    expect(bestTrainableNaval(state, 0)).toBeNull();
  });
});

describe("the Cothon's project", () => {
  it('is the Phoenician capital move, priced off the game’s own progress', () => {
    const p = PROJECTS.COTHON_CAPITAL_MOVE;
    expect(p, 'the project has no row').toBeTruthy();
    expect(p.civ).toBe('PHOENICIA');
    expect(p.movesCapital).toBe(true);
    expect(p.district).toBe('HARBOR'); // the Cothon IS the Harbor for that seat
    expect(p.costProgressGame).toBeGreaterThan(0);
  });

  it('costs more the further the game has run', () => {
    const { state } = scene();
    const early = projectCost(state, 0, 'COTHON_CAPITAL_MOVE');
    grantTechs(state, 'BRONZE_WORKING', 'WRITING', 'MASONRY', 'ARCHERY', 'SAILING');
    grantCivics(state, 'CRAFTSMANSHIP', 'FOREIGN_TRADE');
    const later = projectCost(state, 0, 'COTHON_CAPITAL_MOVE');
    expect(later).toBeGreaterThan(early);
    expect(early).toBe(PROJECTS.COTHON_CAPITAL_MOVE.cost);
  });

  it('sits past every row that existed when it landed, so no action code moved', () => {
    // The pin is the POSITION, not the last slot: the catalog is append-only,
    // so later rows land behind this one and the count grows.
    const ids = Object.keys(PROJECTS);
    expect(ids.indexOf('COTHON_CAPITAL_MOVE')).toBe(ids.indexOf('DECOMMISSION_NUCLEAR_POWER_PLANT') + 1);
  });
});
