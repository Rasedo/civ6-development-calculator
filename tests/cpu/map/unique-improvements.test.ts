/**
 * THE TWELVE UNIQUE IMPROVEMENTS. Every yield, every placement clause and
 * every adjacency row is the install's own Improvements table; the ids append
 * LAST to `IMPROVEMENT_IDS`, because a Builder's action code IS that list's
 * position.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs, grantCivics } from '../helpers';
import { IMPROVEMENTS, improvementDefenseCS, improvementIsCover } from '../../../cpu/data/improvements';
import { IMPROVEMENT_IDS } from '../../../cpu/core/unitActions';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { improvementAdjacency, tileYields } from '../../../cpu/core/yields';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { CIV_LEADERS } from '../../../world/roster';
import { neighbors } from '../../../world/hex';
import type { City, GameState } from '../../../cpu/core/types';
import type { ImprovementId, Tile } from '../../../world/types';

/** id -> [civ, the yields the row itself pays] straight off Improvements.xml. */
const ROWS: readonly (readonly [ImprovementId, string])[] = [
  ['CHATEAU', 'FRANCE'],
  ['CHEMAMULL', 'MAPUCHE'],
  ['GOLF_COURSE', 'SCOTLAND'],
  ['GREAT_WALL', 'CHINA'],
  ['ICE_HOCKEY_RINK', 'CANADA'],
  ['KURGAN', 'SCYTHIA'],
  ['MAORI_PA', 'MAORI'],
  ['MEKEWAP', 'CREE'],
  ['MISSION', 'SPAIN'],
  ['OPEN_AIR_MUSEUM', 'SWEDEN'],
  ['POLDER', 'NETHERLANDS'],
  ['STEPWELL', 'INDIA'],
] as const;

function scene(civ: string | null): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 24));
  if (civ) {
    const row = CIV_LEADERS.findIndex((r) => r.civ === civ);
    expect(row, `no roster row plays ${civ}`).toBeGreaterThanOrEqual(0);
    state.seats[0]!.civ = row;
  }
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  return { state, city };
}

describe('the unique improvement catalog', () => {
  it('names the right civilization on every row', () => {
    for (const [id, civ] of ROWS) {
      expect(IMPROVEMENTS[id], `${id} has no row`).toBeTruthy();
      expect(IMPROVEMENTS[id].uniqueTo, `${id} names the wrong civilization`).toBe(civ);
    }
  });

  it('appends every id LAST, so no earlier build column moved', () => {
    const tail = IMPROVEMENT_IDS.slice(-ROWS.length);
    expect(tail).toEqual(ROWS.map(([id]) => id));
    // and the three that shipped earlier keep the seats they already held
    expect(IMPROVEMENT_IDS.indexOf('SPHINX')).toBe(19);
    expect(IMPROVEMENT_IDS.indexOf('MOUNTAIN_TUNNEL')).toBe(22);
  });

  it('gives one civilization at most one unique improvement', () => {
    const civs = Object.values(IMPROVEMENTS).flatMap((d) => (d.uniqueTo ? [d.uniqueTo] : []));
    expect(new Set(civs).size).toBe(civs.length);
  });
});

describe('the defence column the Fort, the Great Wall and the Pa share', () => {
  it('reads one column instead of three FORT tests', () => {
    for (const id of ['FORT', 'GREAT_WALL', 'MAORI_PA'] as const) {
      expect(IMPROVEMENTS[id].defenseCS, `${id} defence`).toBe(4);
      expect(IMPROVEMENTS[id].grantsFortification, `${id} fortification`).toBe(2);
    }
    expect(improvementDefenseCS({ improvement: 'GREAT_WALL' })).toBe(4);
    expect(improvementDefenseCS({ improvement: 'GREAT_WALL', pillaged: true })).toBe(0);
    expect(improvementDefenseCS({ improvement: 'FARM' })).toBe(0);
    expect(improvementIsCover({ improvement: 'MAORI_PA' })).toBe(true);
    expect(improvementIsCover({ improvement: 'FARM' })).toBe(false);
    expect(improvementIsCover(undefined)).toBe(false);
  });
});

describe('the three new adjacency sources', () => {
  function at(state: GameState, col: number, row: number): Tile {
    return tileAtCoords(state.map, col, row);
  }

  it('pays the Kurgan per adjacent PASTURE, and doubles it at Stirrups', () => {
    const s = scene('SCYTHIA');
    const t = at(s.state, 16, 16);
    t.improvement = 'KURGAN';
    at(s.state, 17, 16).improvement = 'PASTURE';
    const ctx = makeYieldCtx(s.state, 0);
    expect(improvementAdjacency(ctx, t, 'KURGAN').faith).toBe(1);
    grantTechs(s.state, 'STIRRUPS');
    expect(improvementAdjacency(makeYieldCtx(s.state, 0), t, 'KURGAN').faith).toBe(2);
  });

  it('pays the Great Wall per adjacent SEGMENT, in gold then culture', () => {
    const s = scene('CHINA');
    const t = at(s.state, 16, 16);
    t.improvement = 'GREAT_WALL';
    at(s.state, 17, 16).improvement = 'GREAT_WALL';
    let y = improvementAdjacency(makeYieldCtx(s.state, 0), t, 'GREAT_WALL');
    expect(y.gold).toBe(2);
    expect(y.culture).toBe(0);
    grantCivics(s.state, 'CASTLES');
    y = improvementAdjacency(makeYieldCtx(s.state, 0), t, 'GREAT_WALL');
    expect(y.culture).toBe(2);
  });

  it('pays the Ice Hockey Rink per adjacent cold TILE', () => {
    const s = scene('CANADA');
    const t = at(s.state, 16, 16);
    t.terrain = 'TUNDRA';
    t.improvement = 'ICE_HOCKEY_RINK';
    at(s.state, 17, 16).terrain = 'SNOW';
    at(s.state, 16, 17).terrain = 'TUNDRA';
    at(s.state, 15, 16).terrain = 'GRASSLAND';
    expect(improvementAdjacency(makeYieldCtx(s.state, 0), t, 'ICE_HOCKEY_RINK').culture).toBe(2);
  });

  it('pays the Mekewap gold per adjacent LUXURY, once Cartography is in', () => {
    const s = scene('CREE');
    const t = at(s.state, 16, 16);
    t.improvement = 'MEKEWAP';
    at(s.state, 17, 16).resource = 'SILK';
    expect(improvementAdjacency(makeYieldCtx(s.state, 0), t, 'MEKEWAP').gold).toBe(0);
    grantCivics(s.state, 'CARTOGRAPHY');
    expect(improvementAdjacency(makeYieldCtx(s.state, 0), t, 'MEKEWAP').gold).toBe(2);
  });
});

describe('the yield clauses that are not adjacency', () => {
  it('pays the Chemamull 75% of its tile appeal, floored', () => {
    const v = IMPROVEMENTS.CHEMAMULL;
    expect(v.minAppeal).toBe(4);
    expect(v.appealYield).toEqual({ yield: 'culture', pct: 75 });
  });

  it('gives the Stepwell its two research rungs', () => {
    expect(IMPROVEMENTS.STEPWELL.researchYields).toEqual([
      { civic: 'FEUDALISM', yields: { faith: 1 } },
      { civic: 'PROFESSIONAL_SPORTS', yields: { food: 1 } },
    ]);
  });

  it('pays a research rung only once its civic is in', () => {
    const s = scene('INDIA');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.improvement = 'STEPWELL';
    const before = tileYields(makeYieldCtx(s.state, 0), t).faith;
    grantCivics(s.state, 'FEUDALISM');
    expect(tileYields(makeYieldCtx(s.state, 0), t).faith).toBe(before + 1);
  });

  it('gives the Mission its off-continent half and its loyalty', () => {
    expect(IMPROVEMENTS.MISSION.offCapitalContinentYields).toEqual({ faith: 2, production: 1, food: 1 });
    expect(IMPROVEMENTS.MISSION.loyaltyAdjacentOffContinent).toBe(2);
    expect(IMPROVEMENTS.MISSION.researchYields).toEqual([
      { civic: 'CULTURAL_HERITAGE', yields: { science: 2 } },
    ]);
  });

  it('gives the Open-Air Museum its loyalty and its five terrain kinds', () => {
    expect(IMPROVEMENTS.OPEN_AIR_MUSEUM.loyalty).toBe(2);
    expect(IMPROVEMENTS.OPEN_AIR_MUSEUM.terrainKindYields).toEqual({
      terrains: ['SNOW', 'TUNDRA', 'DESERT', 'PLAINS', 'GRASSLAND'],
      yields: { culture: 2 },
    });
  });

  it('fires the Terrace Farm’s TECH rung, which no civic set could', () => {
    // the tech and civic sets are separate now: one bag for both is how this
    // rung silently never fired while the GPU twin paid it
    const s = scene('INCA');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.elevation = 'HILLS';
    t.improvement = 'TERRACE_FARM';
    tileAtCoords(s.state.map, 17, 16).improvement = 'TERRACE_FARM';
    grantCivics(s.state, 'FEUDALISM');
    const before = improvementAdjacency(makeYieldCtx(s.state, 0), t, 'TERRACE_FARM').food;
    grantTechs(s.state, 'REPLACEABLE_PARTS');
    const after = improvementAdjacency(makeYieldCtx(s.state, 0), t, 'TERRACE_FARM').food;
    expect(after).toBeGreaterThan(before);
  });
});

describe('the placement columns', () => {
  const opts = (s: { state: GameState }, extra: Record<string, unknown> = {}) => ({
    unlocks: null,
    ownsTile: () => true,
    map: s.state.map,
    builder: 'BUILDER',
    civ: CIV_LEADERS[s.state.seats[0]!.civ as number]?.civ ?? null,
    ...extra,
  });

  it('refuses the Chateau a tile with no bonus or luxury beside it', () => {
    const s = scene('FRANCE');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.terrain = 'GRASSLAND';
    t.elevation = 'FLAT';
    expect(validImprovementsIn(t, opts(s))).not.toContain('CHATEAU');
    tileAtCoords(s.state.map, 17, 16).resource = 'WHEAT';
    expect(validImprovementsIn(t, opts(s))).toContain('CHATEAU');
  });

  it('offers the Golf Course once per city and no more', () => {
    const s = scene('SCOTLAND');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.terrain = 'GRASSLAND';
    t.elevation = 'FLAT';
    expect(validImprovementsIn(t, opts(s))).toContain('GOLF_COURSE');
    const held = new Set<ImprovementId>(['GOLF_COURSE']);
    expect(validImprovementsIn(t, opts(s, { oneHeld: held }))).not.toContain('GOLF_COURSE');
  });

  it('refuses the Golf Course desert outright', () => {
    const s = scene('SCOTLAND');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.terrain = 'DESERT';
    t.elevation = 'FLAT';
    expect(validImprovementsIn(t, opts(s))).not.toContain('GOLF_COURSE');
  });

  it('lays the Pa by the TOA alone, on a hill, inside or outside the borders', () => {
    const s = scene('MAORI');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.terrain = 'GRASSLAND';
    t.elevation = 'HILLS';
    expect(IMPROVEMENTS.MAORI_PA.builtBy).toBe('TOA');
    expect(validImprovementsIn(t, opts(s))).not.toContain('MAORI_PA');
    const byToa = { ...opts(s), builder: 'TOA' };
    expect(validImprovementsIn(t, byToa)).toEqual(['MAORI_PA']);
    // outside the borders, still the Toa's
    expect(validImprovementsIn(t, { ...byToa, ownsTile: () => false })).toEqual(['MAORI_PA']);
    // and never on the flat
    t.elevation = 'FLAT';
    expect(validImprovementsIn(t, byToa)).toEqual([]);
  });

  it('asks the Polder for three land neighbours', () => {
    const s = scene('NETHERLANDS');
    const t = tileAtCoords(s.state.map, 16, 16);
    t.terrain = 'COAST';
    // the hex's OWN neighbour list, never guessed coordinates: an offset
    // hex's six neighbours depend on its row parity
    const nb = neighbors(s.state.map, t);
    for (const n of nb) n.terrain = 'COAST';
    for (const n of nb.slice(0, 3)) n.terrain = 'GRASSLAND';
    expect(validImprovementsIn(t, opts(s))).toContain('POLDER');
    nb[0]!.terrain = 'COAST';
    expect(validImprovementsIn(t, opts(s))).not.toContain('POLDER');
  });

  it('gives the Polder its dearer step and the Great Wall its storm shelter', () => {
    expect(IMPROVEMENTS.POLDER.movementCost).toBe(3);
    expect(IMPROVEMENTS.GREAT_WALL.disasterResistant).toBe(true);
  });
});
