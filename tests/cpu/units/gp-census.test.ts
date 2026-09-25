import { describe, it, expect } from 'vitest';
import { MP_SCALE, scaleByGameSpeed } from '../../../cpu/data/constants';
import { createGame } from '../../../cpu/core/game';
import { settleAt, settleFirstCity } from '../helpers';
import { spawnUnit, unitFullMoves } from '../../../cpu/core/units';
import {
  GREAT_PEOPLE, GP_ABILITY, GP_CLASSES, GP_SITES, GP_SITE_CITY_CENTER,
  gpChargesOf, gpCityPermOf, gpNoMilitaryOf, gpPermOf, gpSiteArg, gpSiteOf, gpTilePermOf,
} from '../../../cpu/data/greatPeople';
import { activateGreatPerson, addSeatPerm, gpActivateOk } from '../../../cpu/core/gpAbility';
import { gpSiteKey, gpSiteTiles } from '../../../cpu/core/targetSites';
import { computeCityStats } from '../../../cpu/core/city';
import { regionalEffects } from '../../../cpu/core/yields';
import { accrueStockpiles, stockOf } from '../../../cpu/core/stockpile';
import { getModifiers, prodBoostPct } from '../../../cpu/core/effects';
import { cityTradeYields } from '../../../cpu/core/trade';
import { governorTitlesEarned } from '../../../cpu/core/governors';
import { completeQueueItem } from '../../../cpu/core/production';
import { greatWorkTourism, gwHasRoom, gwWorks, placeGreatWork } from '../../../cpu/core/greatWorks';
import { GWO_ARTIFACT, GWO_RELIC, GWO_TOURISM, GWO_WRITING } from '../../../cpu/data/greatWorks';
import { canFoundCity } from '../../../cpu/core/rules';
import { itemCost } from '../../../cpu/core/game';
import { hiddenResourcesFor, tileSeat } from '../../../cpu/core/seats';
import { centerBuildingIds } from '../../../cpu/core/prodLayout';
import { placeCityStateAt, setMet } from '../../../cpu/core/cityStates';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { neighbors, hexDistance } from '../../../world/hex';
import { isImpassable, isWater, naturalWonderAt } from '../../../world/query';
import { RESOURCES } from '../../../world/resources';
import type { City, GameState, Tile, Unit } from '../../../cpu/core/types';

// — THE GREAT PEOPLE CENSUS: every person's layered install rows (Base <-
// Expansion1 <- Expansion2 and the DLC packs, `tools/civ6lab/gp_census.py`)
// against `GP_ABILITY`. The GPU twin is tests/gpu/gp_census_test.py.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 909,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, opponents: 1,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

const found = (id: string): { cls: string; at: number } => {
  for (const c of GP_CLASSES) {
    const at = GREAT_PEOPLE[c].findIndex((p) => p.id === id);
    if (at >= 0) return { cls: c, at };
  }
  throw new Error(`${id} is not in the roster`);
};
const person = (id: string) => {
  const { cls, at } = found(id);
  return GREAT_PEOPLE[cls as keyof typeof GREAT_PEOPLE][at];
};
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const free = (state: GameState, i: number) => !state.units.some((x) => x.tileIndex === i);

/** the person `id`, stood ON `tile` (the spawn probe bumps a civilian off a
 *  district tile, and the site test reads the tile under its feet). */
function stand(state: GameState, id: string, tile: number, seat = 0): Unit {
  const { cls, at } = found(id);
  const u = spawnUnit(state, cls, tile, seat)!;
  Object.assign(u, { tileIndex: tile, gpAt: at, movesLeft: 2 * MP_SCALE });
  u.charges = gpChargesOf(GREAT_PEOPLE[cls as keyof typeof GREAT_PEOPLE][at]);
  return u;
}

/** an owned tile with nothing on it. */
function ownBare(state: GameState, seat = 0, city?: City): number {
  const c = city ?? state.seats[seat].cities[0];
  for (const t of state.map.tiles) {
    if (tileSeat(t) !== seat || t.ownerCity !== c.id || t.index === c.centerIndex) continue;
    if (t.district || t.builtWonder || t.resource || isWater(t) || isImpassable(t)) continue;
    if (!free(state, t.index)) continue;
    return t.index;
  }
  throw new Error('no bare owned tile');
}

/** a COMPLETE district of `type` on a bare owned tile of `city`. */
function district(state: GameState, type: string, city?: City): number {
  const c = city ?? state.seats[0].cities[0];
  const t = state.map.tiles[ownBare(state, c.seat, c)];
  t.district = type as never;
  t.districtComplete = true;
  c.districts.push({ type: type as never, tileIndex: t.index });
  return t.index;
}

/** the capital's Palace slot taken — it holds anything, so it would answer
 *  every room question first. */
function fillPalace(state: GameState, city: City): void {
  placeGreatWork(state, city, { obj: GWO_WRITING, maker: 0, era: -1, seat: city.seat });
}

/** a city of `seat`, founded where the rules allow. */
function secondCity(state: GameState, seat: number): City {
  state.seats[seat].explored = state.map.tiles.map(() => 1); // a founding needs explored ground
  const t = state.map.tiles.find((x) => canFoundCity(state, x.index, seat).ok)!;
  expect(t).toBeDefined();
  return settleAt(state, t.index, seat);
}

describe('the census rows', () => {
  it('each person is spent where the install says (ActionRequiresCompletedDistrictType)', () => {
    const want: Record<string, string> = {
      GP_THELFLD: 'CITY_CENTER', GP_SIMON_BOLIVAR_UNIT: 'CITY_CENTER', GP_SUDIRMAN: 'CITY_CENTER',
      GP_BI_SHENG: 'CITY_CENTER', GP_MIMAR_SINAN: 'CITY_CENTER', GP_ADA_LOVELACE: 'CITY_CENTER',
      GP_ALVAR_AALTO: 'CITY_CENTER', GP_JANE_DREW: 'CITY_CENTER',
      GP_JOHN_ROEBLING: 'CITY_CENTER', GP_CHARLES_CORREA: 'CITY_CENTER',
      GP_TRUNG_TRAC: 'ENCAMPMENT', GP_ZHENG_HE: 'HARBOR', GP_TOGO_HEIHACHIRO: 'HARBOR',
      GP_HORATIO_NELSON: 'HARBOR', GP_MARINA_RASKOVA: 'AERODROME',
      GP_SERGEI_KOROLEV: 'SPACEPORT', GP_CARL_SAGAN: 'SPACEPORT', GP_STEPHANIE_KWOLEK: 'SPACEPORT',
      GP_WERNHER_VON_BRAUN: 'SPACEPORT',
    };
    for (const [id, d] of Object.entries(want)) {
      expect(gpSiteOf(person(id)), id).toEqual({ site: 'district', district: d });
    }
    expect(gpSiteArg('CITY_CENTER')).toBe(GP_SITE_CITY_CENTER);
    expect(gpSiteOf(person('GP_JEANNE_D_ARC')).site).toBe('relicSlot');
    expect(gpSiteOf(person('GP_FERDINAND_MAGELLAN')).site).toBe('luxury');
    // the Action* columns that name a site of their own
    const own: Record<string, string> = {
      GP_GALILEO_GALILEI: 'nearMountain', GP_CHARLES_DARWIN: 'nearNaturalWonder', GP_JANAKI_AMMAL: 'nearRainforest',
      GP_IMHOTEP: 'incompleteWonder', GP_ISIDORE_OF_MILETUS: 'incompleteWonder', GP_FILIPPO_BRUNELLESCHI: 'incompleteWonder',
      GP_GUSTAVE_EIFFEL: 'incompleteWonder', GP_SHAH_JAHAN: 'incompleteWonder',
      GP_JAMES_OF_ST_GEORGE: 'centreWithout', GP_MARY_LEAKEY: 'districtArtifact', GP_SUN_TZU: 'gwSlot',
    };
    for (const [id, s] of Object.entries(own)) expect(gpSiteOf(person(id)).site, id).toBe(s);
    expect(gpSiteOf(person('GP_JAMES_OF_ST_GEORGE'))).toEqual({ site: 'centreWithout', district: 'CITY_CENTER', building: 'MEDIEVAL_WALLS' });
    expect(gpSiteOf(person('GP_MARY_LEAKEY')).district).toBe('THEATER_SQUARE');
    // the new codes append: every older code keeps its wire index
    expect(GP_SITES.slice(0, 10)).toEqual(['district', 'anywhere', 'gwSlot', 'cityState', 'luxury', 'adjacentOwn',
      'suzerainCityState', 'adjacentBarbarian', 'enemyTerritory', 'relicSlot']);
  });

  it('exactly the plot-granting rows wait for a tile with no military unit', () => {
    const waits = GP_CLASSES.flatMap((c) => GREAT_PEOPLE[c].filter((p) => gpNoMilitaryOf(p)).map((p) => p.id)).sort();
    expect(waits).toEqual([
      'GP_AHMAD_SHAH_MASSOUD', 'GP_CHESTER_NIMITZ', 'GP_DANDARA', 'GP_DOUGLAS_MACARTHUR', 'GP_FRANCIS_DRAKE',
      'GP_FRANZ_VON_HIPPER', 'GP_GUSTAVUS_ADOLPHUS', 'GP_HANNO_THE_NAVIGATOR', 'GP_RANI_LAKSHMIBAI',
      'GP_SAMORI_TOURE', 'GP_THEMISTOCLES', 'GP_YI_SUN_SIN',
    ]);
  });
});

describe('the sites', () => {
  it('a City Center person: the seat\'s own centre, and the loyalty lands on that city', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const off = stand(state, 'GP_SUDIRMAN', ownBare(state));
    expect(gpActivateOk(state, off)).toBe(false);
    const u = stand(state, 'GP_SUDIRMAN', city.centerIndex);
    expect(gpActivateOk(state, u)).toBe(true);
    // the walk list names the centre under its own argument
    const key = gpSiteKey(u)!;
    expect(key).toEqual([GP_SITES.indexOf('district'), GP_SITE_CITY_CENTER]);
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([city.centerIndex]);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpCityPermOf(city, 'loyalty')).toBe(6);
    const a = stand(state, 'GP_THELFLD', city.centerIndex);
    expect(activateGreatPerson(state, a)).toBe(true);
    expect(gpCityPermOf(city, 'loyalty')).toBe(8);
    expect(state.units.some((x) => x.type === 'KNIGHT')).toBe(false);
  });

  it('an admiral naming a Harbor is spent on one, not anywhere', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const bare = stand(state, 'GP_TOGO_HEIHACHIRO', ownBare(state));
    expect(gpActivateOk(state, bare)).toBe(false);
    const u = stand(state, 'GP_TOGO_HEIHACHIRO', district(state, 'HARBOR'));
    expect(gpActivateOk(state, u)).toBe(true);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpCityPermOf(city, 'loyalty')).toBe(6);
    const n = stand(state, 'GP_HORATIO_NELSON', ownBare(state));
    expect(gpActivateOk(state, n)).toBe(false);
  });

  it('Trung Trac waits for an Encampment', () => {
    const state = newGame();
    expect(gpActivateOk(state, stand(state, 'GP_TRUNG_TRAC', ownBare(state)))).toBe(false);
    expect(gpActivateOk(state, stand(state, 'GP_TRUNG_TRAC', district(state, 'ENCAMPMENT')))).toBe(true);
  });

  it('Magellan: any tile carrying a luxury, owned or not; one copy and 300 Gold (ScaleByGameSpeed)', () => {
    const state = newGame();
    const seat = state.seats[0];
    const lux = state.map.tiles.find((t) => tileSeat(t) < 0 && !isWater(t) && !isImpassable(t) && free(state, t.index))!;
    lux.resource = 'SILK' as never;
    const u = stand(state, 'GP_FERDINAND_MAGELLAN', lux.index);
    expect(gpActivateOk(state, u)).toBe(true);
    const gold0 = seat.treasury;
    const n0 = seat.gpLuxuries?.length ?? 0;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(seat.treasury).toBe(gold0 + scaleByGameSpeed(300));
    expect(seat.gpLuxuries?.length).toBe(n0 + 1);
    expect(gpCityPermOf(seat.cities[0], 'loyalty')).toBe(0);
  });

  it('Jeanne d\'Arc: waits for an open Relic slot anywhere, then a Relic lands in it', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    fillPalace(state, city);
    const u = stand(state, 'GP_JEANNE_D_ARC', ownBare(state));
    expect(gpActivateOk(state, u)).toBe(false);
    city.buildings.push('TEMPLE');
    expect(gwHasRoom(state, city, GWO_RELIC)).toBe(true);
    expect(gpActivateOk(state, u)).toBe(true);
    // the site is spent where it stands: nothing to walk toward
    const key = gpSiteKey(u)!;
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([]);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gwWorks(city).filter((w) => w.obj === GWO_RELIC).length).toBe(1);
    expect(gwHasRoom(state, city, GWO_RELIC)).toBe(false);
  });

  it('a unit-granting person waits for its plot to hold no military unit (ActionRequiresNoMilitaryUnit)', () => {
    const state = newGame();
    const tile = ownBare(state);
    const u = stand(state, 'GP_DOUGLAS_MACARTHUR', tile);
    expect(gpActivateOk(state, u)).toBe(true);
    const w = spawnUnit(state, 'WARRIOR', tile, 0)!;
    Object.assign(w, { tileIndex: tile });
    expect(gpActivateOk(state, u)).toBe(false);
    Object.assign(w, { tileIndex: ownBare(state) });
    expect(gpActivateOk(state, u)).toBe(true);
    const seat = state.seats[0];
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpPermOf(seat, 'oilPerTurn')).toBe(1);
  });
});

describe('the grants', () => {
  it('a hull granted inland goes to the nearest water (Drake\'s Privateer)', () => {
    const state = newGame();
    state.seats[0].civ = civRow('ROME');
    // an owned land tile with no water within 1
    const inland = state.map.tiles.find((t) => tileSeat(t) === 0 && !isWater(t) && !isImpassable(t) && !t.district
      && free(state, t.index) && neighbors(state.map, t).every((n) => !isWater(n)))!;
    expect(inland).toBeDefined();
    const u = stand(state, 'GP_FRANCIS_DRAKE', inland.index);
    expect(activateGreatPerson(state, u)).toBe(true);
    const p = state.units.find((x) => x.seat === 0 && x.type === 'PRIVATEER')!;
    expect(p).toBeDefined();
    expect(isWater(state.map.tiles[p.tileIndex])).toBe(true);
    // ...the NEAREST such water, the lower index on a tie
    const d = (i: number) => hexDistance(inland.col, inland.row, state.map.tiles[i].col, state.map.tiles[i].row);
    const best = state.map.tiles.filter((t) => isWater(t) && !isImpassable(t) && t.terrain !== 'OCEAN')
      .reduce((m, t) => Math.min(m, d(t.index)), Infinity);
    expect(d(p.tileIndex)).toBe(best);
  });

  it('Hanno: the strongest naval melee chassis unlocked, with +2 Movement for life', () => {
    const state = newGame();
    state.seats[0].civ = civRow('ROME');
    const techs = state.seats[0].research.techs;
    const coast = state.map.tiles.find((t) => t.terrain === 'COAST' && !isImpassable(t) && free(state, t.index))!;
    const none = stand(state, 'GP_HANNO_THE_NAVIGATOR', ownBare(state));
    expect(activateGreatPerson(state, none)).toBe(true); // nothing unlocked: the charge is spent for nothing
    expect(state.units.some((x) => x.seat === 0 && x.type === 'GALLEY')).toBe(false);
    techs.push('SAILING', 'CARTOGRAPHY');
    const u = stand(state, 'GP_HANNO_THE_NAVIGATOR', coast.index);
    expect(activateGreatPerson(state, u)).toBe(true);
    const c = state.units.find((x) => x.seat === 0 && x.type === 'CARAVEL')!;
    expect(c).toBeDefined();
    expect(c.mpBonus).toBe(2);
    expect(c.movesLeft).toBe(unitFullMoves(state, c));
    expect(c.movesLeft).toBe(unitFullMoves(state, { ...c, mpBonus: 0 }) + 2 * MP_SCALE);
  });

  it('Marco Polo and Zheng He: a Trader in the city, one more route, the foreign-route Gold', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const hub = district(state, 'COMMERCIAL_HUB');
    const traders = () => state.units.filter((x) => x.seat === 0 && x.type === 'TRADER');
    const t0 = traders().length;
    expect(activateGreatPerson(state, stand(state, 'GP_MARCO_POLO', hub))).toBe(true);
    expect(traders().length).toBe(t0 + 1);
    expect(hexDistance(
      state.map.tiles[traders()[t0].tileIndex].col, state.map.tiles[traders()[t0].tileIndex].row,
      state.map.tiles[city.centerIndex].col, state.map.tiles[city.centerIndex].row)).toBeLessThanOrEqual(1);
    expect(gpPermOf(state.seats[0], 'tradeCapacity')).toBe(1);
    expect(gpCityPermOf(city, 'foreignRouteGold')).toBe(2);
    expect(activateGreatPerson(state, stand(state, 'GP_ZHENG_HE', district(state, 'HARBOR')))).toBe(true);
    expect(traders().length).toBe(t0 + 2);
    expect(gpPermOf(state.seats[0], 'tradeCapacity')).toBe(2);
    expect(gpCityPermOf(city, 'foreignRouteGold')).toBe(4);
    expect(state.seats[0].envoysAvailable ?? 0).toBe(0);
  });
});

describe('the standing channels', () => {
  it('Themistocles and Nimitz: production toward one promotion class', () => {
    const state = newGame();
    const seat = state.seats[0];
    const mods = getModifiers(state, 0);
    const pct = (unit: string) => prodBoostPct(mods, { kind: 'unit', unit, progress: 0 } as never, seat.gpPerm);
    const q0 = pct('QUADRIREME');
    const g0 = pct('GALLEY');
    const s0 = pct('SUBMARINE');
    addSeatPerm(seat, GP_ABILITY.GP_THEMISTOCLES.perm!);
    expect(pct('QUADRIREME')).toBeCloseTo(q0 + 0.2, 12);
    expect(pct('GALLEY')).toBe(g0);
    addSeatPerm(seat, GP_ABILITY.GP_CHESTER_NIMITZ.perm!);
    expect(pct('SUBMARINE')).toBeCloseTo(s0 + 0.2, 12);
    expect(pct('GALLEY')).toBe(g0);
    expect(gpPermOf(seat, 'militaryProdPct')).toBe(0);
    expect(GP_ABILITY.GP_CHESTER_NIMITZ.unit).toBe('SUBMARINE');
  });

  it('free extraction: Coal and Oil every turn, the city-borne Oil to whoever holds the city', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    accrueStockpiles(state, 0);
    const coal0 = stockOf(state, 0, 'COAL');
    const oil0 = stockOf(state, 0, 'OIL');
    addSeatPerm(seat, GP_ABILITY.GP_YI_SUN_SIN.perm!);
    addSeatPerm(seat, GP_ABILITY.GP_FRANZ_VON_HIPPER.perm!);
    addSeatPerm(seat, GP_ABILITY.GP_DOUGLAS_MACARTHUR.perm!);
    accrueStockpiles(state, 0);
    expect(stockOf(state, 0, 'COAL')).toBe(coal0 + 2);
    expect(stockOf(state, 0, 'OIL')).toBe(oil0 + 1);
    const hub = district(state, 'COMMERCIAL_HUB');
    expect(activateGreatPerson(state, stand(state, 'GP_JOHN_ROCKEFELLER', hub))).toBe(true);
    expect(gpCityPermOf(city, 'oilPerTurn')).toBe(3);
    accrueStockpiles(state, 0);
    expect(stockOf(state, 0, 'OIL')).toBe(oil0 + 1 + 1 + 3);
  });

  it('a building\'s own yield: Hypatia\'s Library, Newton\'s University, Einstein\'s Lab; Watt\'s Factory rides its reach', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    district(state, 'CAMPUS');
    city.buildings.push('LIBRARY', 'UNIVERSITY', 'RESEARCH_LAB');
    const sci0 = computeCityStats(state, city).breakdown.buildings.science;
    addSeatPerm(seat, GP_ABILITY.GP_HYPATIA.perm!);
    addSeatPerm(seat, GP_ABILITY.GP_ISAAC_NEWTON.perm!);
    addSeatPerm(seat, GP_ABILITY.GP_ALBERT_EINSTEIN.perm!);
    expect(computeCityStats(state, city).breakdown.buildings.science).toBe(sci0 + 1 + 2 + 4);
    // a dark building pays none of it
    city.pillagedBuildings = ['LIBRARY'];
    expect(computeCityStats(state, city).breakdown.buildings.science).toBeLessThanOrEqual(sci0 + 2 + 4);
    city.pillagedBuildings = [];
    district(state, 'INDUSTRIAL_ZONE');
    city.buildings.push('FACTORY');
    const p0 = regionalEffects(state, city).yields.production;
    addSeatPerm(seat, GP_ABILITY.GP_JAMES_WATT.perm!);
    expect(regionalEffects(state, city).yields.production).toBe(p0 + 2);
    // the Factory is regional: its add is not paid a second time at home
    const b0 = computeCityStats(state, city).breakdown.buildings.production;
    addSeatPerm(seat, { factoryProduction: 2 });
    expect(computeCityStats(state, city).breakdown.buildings.production).toBe(b0 + 2);
  });

  it('Hildegard: the Holy Site she was spent on mirrors its Faith adjacency as Science', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const hs = district(state, 'HOLY_SITE');
    // a Mountain beside the Holy Site: a Faith adjacency that is not 0
    const mtn = state.map.tiles[ownBare(state)];
    Object.assign(mtn, { elevation: 'MOUNTAIN' });
    const nb = neighbors(state.map, state.map.tiles[hs]).find((n) => n.index !== city.centerIndex && !n.district)!;
    Object.assign(nb, { elevation: 'MOUNTAIN' });
    const before = computeCityStats(state, city).breakdown.districts;
    expect(before.faith).toBeGreaterThan(0);
    expect(activateGreatPerson(state, stand(state, 'GP_HILDEGARD_OF_BINGEN', hs))).toBe(true);
    expect(gpTilePermOf(state.map.tiles[hs], 'faithAdjScience')).toBe(1);
    const after = computeCityStats(state, city).breakdown.districts;
    expect(after.science).toBe(before.science + before.faith);
    state.map.tiles[hs].districtPillaged = true;
    expect(computeCityStats(state, city).breakdown.districts.science).toBe(before.science);
  });

  it('Ibn Khaldun: +2% at Happy and +4% at Ecstatic on every non-Food yield', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    const raise = (n: number) => { city.gpPerm = city.gpPerm ?? []; city.gpPerm[1] = n; };
    let n = 0;
    while (computeCityStats(state, city).amenities.tier.name !== 'Happy' && n < 20) raise(++n);
    const base = computeCityStats(state, city).total;
    addSeatPerm(seat, GP_ABILITY.GP_IBN_KHALDUN.perm!);
    const happy = computeCityStats(state, city).total;
    expect(happy.science).toBeCloseTo(base.science * 1.02, 9);
    expect(happy.food).toBe(base.food);
    while (computeCityStats(state, city).amenities.tier.name !== 'Ecstatic' && n < 20) raise(++n);
    addSeatPerm(seat, { happyYieldPct: -2, ecstaticYieldPct: -4 });
    const e0 = computeCityStats(state, city).total;
    addSeatPerm(seat, { happyYieldPct: 2, ecstaticYieldPct: 4 });
    expect(computeCityStats(state, city).total.culture).toBeCloseTo(e0.culture * 1.04, 9);
  });

  it('Irene and Adam Smith: a Governor Title each, Smith\'s 500 Gold (ScaleByGameSpeed); Piero de\' Bardi\'s Gold and Envoy', () => {
    const state = newGame();
    const seat = state.seats[0];
    const t0 = governorTitlesEarned(state, 0);
    const hub = district(state, 'COMMERCIAL_HUB');
    expect(activateGreatPerson(state, stand(state, 'GP_IRENE_OF_ATHENS', hub))).toBe(true);
    expect(governorTitlesEarned(state, 0)).toBe(t0 + 1);
    const g0 = seat.treasury;
    expect(activateGreatPerson(state, stand(state, 'GP_ADAM_SMITH', hub))).toBe(true);
    expect(governorTitlesEarned(state, 0)).toBe(t0 + 2);
    expect(seat.treasury).toBe(g0 + scaleByGameSpeed(500));
    expect(gpPermOf(seat, 'policySlotEconomic')).toBe(0);
    const g1 = seat.treasury;
    const e1 = seat.envoysAvailable ?? 0;
    expect(activateGreatPerson(state, stand(state, 'GP_PIERO_DE_BARDI', hub))).toBe(true);
    expect(seat.treasury).toBe(g1 + scaleByGameSpeed(200));
    expect(seat.envoysAvailable).toBe(e1 + 1);
  });

  it('Giovanni de\' Medici: a Market and a Bank, and the Bank holds two works of anything', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const hub = district(state, 'COMMERCIAL_HUB');
    fillPalace(state, city);
    expect(gwHasRoom(state, city, GWO_WRITING)).toBe(false);
    expect(activateGreatPerson(state, stand(state, 'GP_GIOVANNI_DE_MEDICI', hub))).toBe(true);
    expect(city.buildings).toContain('MARKET');
    expect(city.buildings).toContain('BANK');
    expect(gpCityPermOf(city, 'bankGwSlots')).toBe(2);
    expect(gwHasRoom(state, city, GWO_WRITING)).toBe(true);
  });

  it('Mimar Sinan: every Industrial Zone completed after him claims the tiles around it', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    expect(activateGreatPerson(state, stand(state, 'GP_MIMAR_SINAN', city.centerIndex))).toBe(true);
    expect(gpPermOf(state.seats[0], 'izCultureBomb')).toBe(1);
    // an owned tile on the border, beside unclaimed ground within reach
    const cap = state.map.tiles[city.centerIndex];
    const edge = state.map.tiles.find((t) => tileSeat(t) === 0 && t.ownerCity === city.id && !t.district
      && !isWater(t) && !isImpassable(t) && hexDistance(t.col, t.row, cap.col, cap.row) <= 2
      && neighbors(state.map, t).some((n) => tileSeat(n) < 0))!;
    expect(edge).toBeDefined();
    const wild = neighbors(state.map, edge).filter((n) => tileSeat(n) < 0);
    edge.district = 'INDUSTRIAL_ZONE' as never;
    city.districts.push({ type: 'INDUSTRIAL_ZONE' as never, tileIndex: edge.index });
    completeQueueItem(state, city, { kind: 'district', district: 'INDUSTRIAL_ZONE', tileIndex: edge.index, progress: 0 } as never, 0);
    for (const n of wild) expect(tileSeat(n)).toBe(0);
  });
});

describe('the route clauses', () => {
  it('Zhang Qian\'s city: +2 Gold to a foreign route in, and +2 Gold received from it', () => {
    const state = newGame();
    const mine = state.seats[0].cities[0];
    const theirs = secondCity(state, 1);
    state.seats[1].tradeRoutes = [{ from: theirs.id, toSeat: 0, toSeatCity: mine.id }];
    const hub = district(state, 'COMMERCIAL_HUB');
    const in0 = cityTradeYields(state, mine, 0).gold;
    const out0 = cityTradeYields(state, theirs, 0).gold;
    expect(activateGreatPerson(state, stand(state, 'GP_ZHANG_QIAN', hub))).toBe(true);
    expect(cityTradeYields(state, mine, 0).gold).toBe(in0 + 2);
    expect(cityTradeYields(state, theirs, 0).gold).toBe(out0 + 2);
  });

  it('Raja Todar Mal: +0.5 Gold per specialty district at a domestic destination; Rockefeller +2 per strategic kind improved there', () => {
    const state = newGame();
    const seat = state.seats[0];
    const a = seat.cities[0];
    const b = secondCity(state, 0);
    district(state, 'CAMPUS', b);
    seat.tradeRoutes = [{ from: a.id, to: b.id }];
    const g0 = cityTradeYields(state, a, 0).gold;
    addSeatPerm(seat, GP_ABILITY.GP_RAJA_TODAR_MAL.perm!);
    expect(cityTradeYields(state, a, 0).gold).toBe(g0 + 0.5);
    addSeatPerm(seat, GP_ABILITY.GP_JOHN_ROCKEFELLER.perm!);
    expect(cityTradeYields(state, a, 0).gold).toBe(g0 + 0.5);
    const iron = state.map.tiles[ownBare(state, 0, b)];
    Object.assign(iron, { resource: 'IRON', improvement: 'MINE' });
    seat.research.techs.push('BRONZE_WORKING');
    expect(cityTradeYields(state, a, 0).gold).toBe(g0 + 0.5 + 2);
  });

  it('Ibn Fadlan: +2 Faith on every route to a city-state; Melitta Bentz the route Tourism', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    const cap = state.map.tiles[city.centerIndex];
    const spot = state.map.tiles.find((t) => tileSeat(t) < 0 && !isWater(t) && !isImpassable(t)
      && free(state, t.index) && hexDistance(t.col, t.row, cap.col, cap.row) >= 6)!;
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', spot.index);
    setMet(cs, 0);
    seat.tradeRoutes = [{ from: city.id, toCs: cs.id }];
    const f0 = cityTradeYields(state, city, 0).faith;
    const hub = district(state, 'COMMERCIAL_HUB');
    expect(activateGreatPerson(state, stand(state, 'GP_IBN_FADLAN', hub))).toBe(true);
    expect(cityTradeYields(state, city, 0).faith).toBe(f0 + 2);
    expect(activateGreatPerson(state, stand(state, 'GP_MELITTA_BENTZ', hub))).toBe(true);
    expect(gpPermOf(seat, 'tourismRouteBonus')).toBe(25);
    expect(gpPermOf(seat, 'tradeCapacity')).toBe(2);
  });
});

describe('the Action columns\' own sites', () => {
  /** a plot nobody owns, free, bare, with no Mountain, wonder or Rainforest on or around it */
  function wildPlot(state: GameState): Tile {
    const t = state.map.tiles.find((x) => tileSeat(x) < 0 && !isWater(x) && !isImpassable(x) && free(state, x.index)
      && x.feature === null && neighbors(state.map, x).length === 6
      && neighbors(state.map, x).every((n) => n.elevation !== 'MOUNTAIN' && naturalWonderAt(n) === null && n.feature !== 'RAINFOREST'))!;
    expect(t).toBeDefined();
    return t;
  }

  it('Galileo beside a Mountain, Darwin on or beside a natural wonder, Janaki on or beside a Rainforest — anyone\'s plot', () => {
    const state = newGame();
    const wild = wildPlot(state);
    const nb = neighbors(state.map, wild)[0];
    const g = stand(state, 'GP_GALILEO_GALILEI', wild.index);
    expect(gpActivateOk(state, g)).toBe(false);
    Object.assign(nb, { elevation: 'MOUNTAIN' });
    expect(gpActivateOk(state, g)).toBe(true);
    const key = gpSiteKey(g)!;
    expect(key[0]).toBe(GP_SITES.indexOf('nearMountain'));
    expect(gpSiteTiles(state, 0, key[0], key[1])).toContain(wild.index);
    expect(gpSiteTiles(state, 0, key[0], key[1])).not.toContain(nb.index);
    const sci0 = state.seats[0].research.techProgress;
    expect(activateGreatPerson(state, g)).toBe(true);
    expect(state.seats[0].research.techProgress).toBe(sci0 + scaleByGameSpeed(250));
    Object.assign(nb, { elevation: 'FLAT' });

    const d = stand(state, 'GP_CHARLES_DARWIN', wild.index);
    expect(gpActivateOk(state, d)).toBe(false);
    nb.feature = 'MOUNT_EVEREST';
    expect(gpActivateOk(state, d)).toBe(true);
    nb.feature = null;

    const j = stand(state, 'GP_JANAKI_AMMAL', wild.index);
    expect(gpActivateOk(state, j)).toBe(false);
    nb.feature = 'RAINFOREST';
    expect(gpActivateOk(state, j)).toBe(true);
    nb.feature = null;
    wild.feature = 'RAINFOREST';
    expect(gpActivateOk(state, j)).toBe(true);
  });

  it('the wonder engineers: spent on the plot a wonder is being raised on, and paid into that wonder', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    const plot = state.map.tiles[ownBare(state)];
    plot.builtWonder = 'FORBIDDEN_CITY' as never;
    plot.builtWonderComplete = false;
    city.queue = [{ kind: 'wonder', wonder: 'FORBIDDEN_CITY', tileIndex: plot.index, progress: 0 }];
    const iz = district(state, 'INDUSTRIAL_ZONE');
    expect(gpActivateOk(state, stand(state, 'GP_ISIDORE_OF_MILETUS', iz))).toBe(false);
    expect(gpActivateOk(state, stand(state, 'GP_ISIDORE_OF_MILETUS', city.centerIndex))).toBe(false);
    const u = stand(state, 'GP_ISIDORE_OF_MILETUS', plot.index);
    expect(gpActivateOk(state, u)).toBe(true);
    const key = gpSiteKey(u)!;
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([plot.index]);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(city.queue[0].progress).toBe(scaleByGameSpeed(215));
    // Shah Jahan on the same plot: half the purse buys production, twice that in gold
    seat.treasury = 300;
    const q = city.queue[0];
    const before = q.progress;
    const need = itemCost(q, state, city) - before;
    expect(activateGreatPerson(state, stand(state, 'GP_SHAH_JAHAN', plot.index))).toBe(true);
    const bought = Math.min(need, 150);
    expect(q.progress).toBe(before + bought);
    expect(seat.treasury).toBe(300 - 2 * bought);
    // a finished wonder is no site
    plot.builtWonderComplete = true;
    expect(gpActivateOk(state, u)).toBe(false);
  });

  it('James of St. George: a City Center whose city has no Castle yet', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const u = stand(state, 'GP_JAMES_OF_ST_GEORGE', city.centerIndex);
    expect(gpActivateOk(state, u)).toBe(true);
    const key = gpSiteKey(u)!;
    expect(key).toEqual([GP_SITES.indexOf('centreWithout'), centerBuildingIds().indexOf('MEDIEVAL_WALLS')]);
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([city.centerIndex]);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(city.buildings).toContain('ANCIENT_WALLS');
    expect(city.buildings).toContain('MEDIEVAL_WALLS');
    expect(u.charges).toBe(2);
    expect(gpActivateOk(state, u)).toBe(false);
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([]);
  });

  it('Mary Leakey: a Theater Square whose city holds an Artifact; then every Artifact pays triple Tourism', () => {
    const state = newGame();
    const seat = state.seats[0];
    const city = seat.cities[0];
    const ts = district(state, 'THEATER_SQUARE');
    const u = stand(state, 'GP_MARY_LEAKEY', ts);
    expect(gpActivateOk(state, u)).toBe(false);
    expect(placeGreatWork(state, city, { obj: GWO_ARTIFACT, maker: -1, era: 1, seat: 0 })).toBeGreaterThanOrEqual(0);
    expect(gpActivateOk(state, u)).toBe(true);
    const key = gpSiteKey(u)!;
    expect(gpSiteTiles(state, 0, key[0], key[1])).toEqual([ts]);
    const t0 = greatWorkTourism(state, city, false);
    const sci0 = seat.research.techProgress;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(seat.research.techProgress).toBe(sci0 + scaleByGameSpeed(350));
    expect(gpPermOf(seat, 'artifactTourismPct')).toBe(200);
    expect(greatWorkTourism(state, city, false)).toBe(t0 + 2 * GWO_TOURISM[GWO_ARTIFACT]!);
  });

  it('James Young: Oil is seen before Refining', () => {
    const state = newGame();
    expect(state.seats[0].research.techs).not.toContain(RESOURCES.OIL.revealTech);
    expect(hiddenResourcesFor(state, 0).has('OIL')).toBe(true);
    expect(activateGreatPerson(state, stand(state, 'GP_JAMES_YOUNG', district(state, 'CAMPUS')))).toBe(true);
    expect(hiddenResourcesFor(state, 0).has('OIL')).toBe(false);
    expect(hiddenResourcesFor(state, 0).has('COAL')).toBe(!state.seats[0].research.techs.includes('INDUSTRIALIZATION'));
    expect(hiddenResourcesFor(state, 1).has('OIL')).toBe(true);
  });

  it('Sun Tzu: no retire; his Work of Writing is made in the seat\'s city he stands in, while it has room', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const wild = wildPlot(state);
    expect(gpActivateOk(state, stand(state, 'GP_SUN_TZU', wild.index))).toBe(false);
    const u = stand(state, 'GP_SUN_TZU', ownBare(state));
    expect(gwHasRoom(state, city, GWO_WRITING)).toBe(true);
    expect(gpActivateOk(state, u)).toBe(true);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gwWorks(city).filter((w) => w.obj === GWO_WRITING).length).toBe(1);
    expect(state.units.some((x) => x.id === u.id)).toBe(false);
    expect(gwHasRoom(state, city, GWO_WRITING)).toBe(false);
    expect(gpActivateOk(state, stand(state, 'GP_SUN_TZU', city.centerIndex))).toBe(false);
  });

  it('Eisenhower: +5% toward military units only', () => {
    const state = newGame();
    const seat = state.seats[0];
    const mods = getModifiers(state, 0);
    const pct = (q: object) => prodBoostPct(mods, q as never, seat.gpPerm);
    const warrior = { kind: 'unit', unit: 'WARRIOR', progress: 0 };
    const builder = { kind: 'unit', unit: 'BUILDER', progress: 0 };
    const settler = { kind: 'settler', progress: 0, cost: 0 };
    const [w0, b0, s0] = [pct(warrior), pct(builder), pct(settler)];
    addSeatPerm(seat, GP_ABILITY.GP_DWIGHT_EISENHOWER.perm!);
    expect(gpPermOf(seat, 'militaryProdPct')).toBe(5);
    expect(pct(warrior)).toBeCloseTo(w0 + 0.05, 12);
    expect(pct(builder)).toBe(b0);
    expect(pct(settler)).toBe(s0);
  });
});
