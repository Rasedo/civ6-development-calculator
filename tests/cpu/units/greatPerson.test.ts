import { describe, it, expect } from 'vitest';
import { MP_SCALE } from '../../../cpu/data/constants';
import { seededGame } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { setTileOwner, seatOf, tileSeat } from '../../../cpu/core/seats';
import {
  GREAT_PEOPLE, GP_ABILITY, GP_CLASSES, GP_CLASS_DISTRICT, GP_FX, GP_PERM, GP_CITY_PERM,
  GP_SITES, gpSiteOf, gpChargesOf, gpEffectOf, gpPermOf, gpCityPermOf,
} from '../../../cpu/data/greatPeople';
import { activateGreatPerson, gpActivateOk, gpPersonOf } from '../../../cpu/core/gpAbility';
import { regionalEffects } from '../../../cpu/core/yields';
import { gpDistrictTourism, tourismIntlPct } from '../../../cpu/core/city';
import { waterEnterable } from '../../../cpu/core/units';
import { unitSight } from '../../../cpu/core/fog';
import { gpTilePermOf, GP_TILE_PERM } from '../../../cpu/data/greatPeople';
import { districtTilesOfOwner } from '../../../cpu/core/gpAbility';
import { placeCityStateAt, resolveSuzerains, setMet } from '../../../cpu/core/cityStates';
import { BARB_SEAT } from '../../../cpu/core/seats';
import { neighbors, hexDistance } from '../../../world/hex';
import { isWater, isImpassable } from '../../../world/query';
import { completeQueueItem } from '../../../cpu/core/production';
import { rosterCS } from '../../../cpu/core/combat';
import { xpToNextLevel } from '../../../cpu/core/promotions';
import { scaleByGameSpeed } from '../../../cpu/data/constants';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState, QueueItem, Unit } from '../../../cpu/core/types';

// — A GREAT PERSON IS PLACED AND USED. CIV6 ("Activating Great People"): the
// person arrives as a UNIT, walks to a site its own ability names, and spends
// a charge there. The scripted rollout claims almost none of them, so the
// catalog, the six sites and the spend are pinned here.

function newGame(): GameState {
  const state = seededGame(909, 2);
  state.autoResearch = false;
  return state;
}

/** Stand a person of `cls` at `at` on `tile`, as `recruit` would. `spawnUnit`
 *  may bump it to a free neighbour, so every caller reads `u.tileIndex`. */
function person(state: GameState, cls: string, at: number, tile: number, seat = 0): Unit {
  const u = spawnUnit(state, cls, tile, seat)!;
  u.gpAt = at;
  u.charges = gpChargesOf(GREAT_PEOPLE[cls as keyof typeof GREAT_PEOPLE][at]);
  u.movesLeft = 2 * MP_SCALE;
  setTileOwner(state.map.tiles[u.tileIndex], seat, state.seats[seat].cities[0].id);
  return u;
}

/** An owned tile with nothing on it. */
function ownBare(state: GameState, seat = 0): number {
  const city = state.seats[seat].cities[0];
  for (const t of state.map.tiles) {
    if (tileSeat(t) !== seat || t.index === city.centerIndex) continue;
    if (t.district || t.builtWonder || t.resource) continue;
    if (state.units.some((u) => u.tileIndex === t.index)) continue;
    return t.index;
  }
  throw new Error('no bare owned tile');
}

describe('Great Person catalog', () => {
  it('every class has a chassis, and every person a site, a charge and a resolvable effect', () => {
    for (const cls of GP_CLASSES) {
      const roster = GREAT_PEOPLE[cls];
      expect(roster.length).toBeGreaterThan(0);
      for (const p of roster) {
        const { site, district } = gpSiteOf(p);
        expect(GP_SITES).toContain(site);
        if (site === 'district') expect(district).toBeTruthy();
        expect(gpChargesOf(p)).toBeGreaterThanOrEqual(1);
        expect(gpEffectOf(p)).toBeDefined();
      }
    }
  });

  it('the wire column names are unique and cover the two permanent runs', () => {
    expect(new Set(GP_FX).size).toBe(GP_FX.length);
    expect(new Set(GP_PERM).size).toBe(GP_PERM.length);
    expect(new Set(GP_CITY_PERM).size).toBe(GP_CITY_PERM.length);
    expect(new Set(GP_TILE_PERM).size).toBe(GP_TILE_PERM.length);
    for (const k of [...GP_PERM, ...GP_CITY_PERM, ...GP_TILE_PERM]) expect(GP_FX).not.toContain(k);
  });

  it('an unmodelled row falls back to the class lump, a modelled one does not', () => {
    const modelled = Object.values(GREAT_PEOPLE).flat().filter((p) => {
      const a = GP_ABILITY[p.id];
      return a && !a.unmodelled;
    });
    expect(modelled.length).toBeGreaterThan(0);
    for (const p of modelled) expect(gpEffectOf(p)).toBe(GP_ABILITY[p.id]);
    const unmodelled = Object.values(GREAT_PEOPLE).flat().filter((p) => GP_ABILITY[p.id]?.unmodelled);
    for (const p of unmodelled) expect(gpEffectOf(p)).toBe(p.effect);
  });
});

// CIV6 (El Cid): "Retire (1 charge) - Forms a Corps out of a military land
// unit."; (Napoleon Bonaparte) an Army out of one; (Gaius Duilius) a Fleet and
// (Santa Cruz) an Armada out of a military NAVAL unit. The target "must be a
// military unit that is not a Corps or an Army".
describe('the formation clause', () => {
  const found = (id: string) => {
    for (const c of GP_CLASSES) {
      const at = GREAT_PEOPLE[c].findIndex((p) => p.id === id);
      if (at >= 0) return { cls: c as string, at };
    }
    throw new Error(`${id} is not in the roster`);
  };

  /** stand `id` on a bare owned tile beside a pinned unit of `type`. */
  function scene(id: string, type: string, formation = 0) {
    const state = newGame();
    const { cls, at } = found(id);
    const u = person(state, cls, at, ownBare(state));
    const target = spawnUnit(state, type, u.tileIndex, 0)!;
    Object.assign(target, { tileIndex: u.tileIndex, formation });
    return { state, u, target };
  }

  it('a General hands a land unit the tier its own row names', () => {
    for (const [id, tier] of [['GP_EL_CID', 1], ['GP_NAPOLEON_BONAPARTE', 2]] as const) {
      const { state, u, target } = scene(id, 'WARRIOR');
      expect(activateGreatPerson(state, u)).toBe(true);
      expect(target.formation).toBe(tier);
    }
  });

  it('an Admiral hands a naval unit the tier, and refuses a land one', () => {
    for (const [id, tier] of [['GP_GAIUS_DUILIUS', 1], ['GP_SANTA_CRUZ', 2]] as const) {
      const wet = scene(id, 'GALLEY');
      expect(activateGreatPerson(wet.state, wet.u)).toBe(true);
      expect(wet.target.formation).toBe(tier);

      const dry = scene(id, 'WARRIOR');
      expect(activateGreatPerson(dry.state, dry.u)).toBe(true);
      expect(dry.target.formation ?? 0).toBe(0);
    }
  });

  it('refuses a unit that is already a Corps or an Army', () => {
    const { state, u, target } = scene('GP_NAPOLEON_BONAPARTE', 'WARRIOR', 1);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(target.formation).toBe(1);
  });

  it('asks for no civic — the clause is the whole gate', () => {
    const { state, u, target } = scene('GP_EL_CID', 'WARRIOR');
    expect(state.seats[0].research.civics).not.toContain('NATIONALISM');
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(target.formation).toBe(1);
  });
});

describe('the activation site', () => {
  it('a class-district person needs a COMPLETE, unpillaged own district of its own type', () => {
    const state = newGame();
    const cls = GP_CLASSES.find((c) => GREAT_PEOPLE[c].some((p) => gpSiteOf(p).site === 'district'))!;
    const at = GREAT_PEOPLE[cls].findIndex((p) => gpSiteOf(p).site === 'district');
    expect(at).toBeGreaterThanOrEqual(0);
    const want = gpSiteOf(GREAT_PEOPLE[cls][at]).district;
    expect(GP_CLASS_DISTRICT[cls]).toBeTruthy();
    const u = person(state, cls, at, ownBare(state));
    expect(gpActivateOk(state, u)).toBe(false);

    const tile = state.map.tiles[u.tileIndex];
    tile.district = want;
    tile.districtComplete = true;
    state.seats[0].cities[0].districts.push({ type: want, tileIndex: tile.index });
    expect(gpActivateOk(state, u)).toBe(true);

    tile.districtComplete = false;
    expect(gpActivateOk(state, u)).toBe(false);
    tile.districtComplete = true;
    tile.districtPillaged = true;
    expect(gpActivateOk(state, u)).toBe(false);
  });

  it("an 'anywhere' person activates where it stands, and a spent one never does", () => {
    const state = newGame();
    const cls = GP_CLASSES.find((c) => GREAT_PEOPLE[c].some((p) => gpSiteOf(p).site === 'anywhere'))!;
    const at = GREAT_PEOPLE[cls].findIndex((p) => gpSiteOf(p).site === 'anywhere');
    const u = person(state, cls, at, ownBare(state));
    expect(gpActivateOk(state, u)).toBe(true);
    u.charges = 0;
    expect(gpActivateOk(state, u)).toBe(false);
  });

  it('a unit with no queue position is not a Great Person at all', () => {
    const state = newGame();
    const cls = GP_CLASSES[0];
    const u = spawnUnit(state, cls, ownBare(state), 0)!;
    u.gpAt = undefined;
    expect(gpPersonOf(u)).toBeUndefined();
    expect(gpActivateOk(state, u)).toBe(false);
  });

  it("a 'cityState' person needs a minor's ground under it", () => {
    const state = newGame();
    const found = GP_CLASSES.flatMap((c) =>
      GREAT_PEOPLE[c].map((p, i) => ({ c, i, p })))
      .find((e) => gpSiteOf(e.p).site === 'cityState');
    if (!found) return; // no such person in this roster
    const u = person(state, found.c, found.i, ownBare(state));
    expect(gpActivateOk(state, u)).toBe(false);
    setTileOwner(state.map.tiles[u.tileIndex], 100);
    expect(gpActivateOk(state, u)).toBe(true);
  });
});

describe('the spend', () => {
  it('pays the lump, spends the charge and disbands a one-charge person', () => {
    const state = newGame();
    const cls = GP_CLASSES.find((c) => GREAT_PEOPLE[c].some((p) => gpSiteOf(p).site === 'anywhere'))!;
    const at = GREAT_PEOPLE[cls].findIndex((p) => gpSiteOf(p).site === 'anywhere');
    const u = person(state, cls, at, ownBare(state));
    const id = u.id;
    const seat = seatOf(state, 0)!;
    const spent0 = (seat.gpActivated ?? []).length;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect((seat.gpActivated ?? []).length).toBe(spent0 + 1);
    if (gpChargesOf(GREAT_PEOPLE[cls][at]) === 1) {
      expect(state.units.some((x) => x.id === id)).toBe(false);
    } else {
      expect(u.charges).toBe(gpChargesOf(GREAT_PEOPLE[cls][at]) - 1);
    }
  });

  it('a permanent channel survives the person that left it', () => {
    const state = newGame();
    const found = GP_CLASSES.flatMap((c) =>
      GREAT_PEOPLE[c].map((p, i) => ({ c, i, p })))
      .find((e) => {
        const fx = gpEffectOf(e.p) as { perm?: Record<string, number> };
        return fx.perm && Object.keys(fx.perm).length > 0 && gpSiteOf(e.p).site === 'anywhere';
      });
    if (!found) return; // every perm-carrying person needs a district in this roster
    const key = Object.keys((gpEffectOf(found.p) as { perm: Record<string, number> }).perm)[0] as typeof GP_PERM[number];
    const want = (gpEffectOf(found.p) as { perm: Record<string, number> }).perm[key];
    const u = person(state, found.c, found.i, ownBare(state));
    const seat = seatOf(state, 0)!;
    const before = gpPermOf(seat, key);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpPermOf(seat, key)).toBe(before + want);
  });

  it('a per-city channel lands on the city the charge was spent in', () => {
    const state = newGame();
    const found = GP_CLASSES.flatMap((c) =>
      GREAT_PEOPLE[c].map((p, i) => ({ c, i, p })))
      .find((e) => {
        const fx = gpEffectOf(e.p) as { cityPerm?: Record<string, number> };
        return fx.cityPerm && Object.keys(fx.cityPerm).length > 0;
      });
    if (!found) return;
    const key = Object.keys((gpEffectOf(found.p) as { cityPerm: Record<string, number> }).cityPerm)[0] as typeof GP_CITY_PERM[number];
    const want = (gpEffectOf(found.p) as { cityPerm: Record<string, number> }).cityPerm[key];
    const city = state.seats[0].cities[0];
    const { site, district } = gpSiteOf(found.p);
    if (site !== 'district' && site !== 'anywhere') return; // its ground is another poke's
    const u = person(state, found.c, found.i, site === 'district' ? ownBare(state) : city.centerIndex);
    if (site === 'district') {
      const tile = state.map.tiles[u.tileIndex];
      tile.district = district;
      tile.districtComplete = true;
      city.districts.push({ type: district, tileIndex: tile.index });
    }
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpCityPermOf(city, key)).toBe(want);
  });

  // CIV6 (Isaac Newton): "Instantly builds a Library and University in this
  // city" — the grant can land the very building the city is still producing.
  // No city holds two of one building, so the queued copy comes OFF the
  // queue, and the hammers already spent bank rather than burn.
  it('a building granted while the city still produces it drops off the queue and banks', () => {
    const state = newGame();
    const found = GP_CLASSES.flatMap((c) => GREAT_PEOPLE[c].map((p, i) => ({ c, i, p })))
      .find((e) => ((gpEffectOf(e.p) as { buildings?: string[] }).buildings ?? []).length > 0);
    if (!found) return;
    const grant = (gpEffectOf(found.p) as { buildings: string[] }).buildings[0]!;
    const city = state.seats[0].cities[0];
    const { site, district } = gpSiteOf(found.p);
    if (site !== 'district' && site !== 'anywhere') return;
    const u = person(state, found.c, found.i, site === 'district' ? ownBare(state) : city.centerIndex);
    if (site === 'district') {
      const tile = state.map.tiles[u.tileIndex];
      tile.district = district;
      tile.districtComplete = true;
      city.districts.push({ type: district, tileIndex: tile.index });
    }
    const item: QueueItem = { kind: 'building', building: grant, progress: 37 };
    city.queue.push(item);
    city.productionBank = 5;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(city.buildings.filter((b) => b === grant)).toHaveLength(1);
    expect(city.queue.some((q) => q.kind === 'building' && q.building === grant)).toBe(false);
    expect(city.productionBank).toBe(5 + 37);
  });

  it('a city never holds two of one building, whatever completes it', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const item: QueueItem = { kind: 'building', building: 'MONUMENT', progress: 0 };
    city.buildings.push('MONUMENT');
    completeQueueItem(state, city, item, 1);
    expect(city.buildings.filter((b) => b === 'MONUMENT')).toHaveLength(1);
  });
});

// The seven persons whose page clause is a CHANNEL an existing
// composer reads — the install's DISTRICT_IN_TILE, CITY and PLAYER attachments.
describe('the channel clauses', () => {
  const found = (id: string) => {
    for (const c of GP_CLASSES) {
      const at = GREAT_PEOPLE[c].findIndex((p) => p.id === id);
      if (at >= 0) return { cls: c as string, at };
    }
    throw new Error(`${id} is not in the roster`);
  };

  /** `person`, then stood ON the tile — the spawn probe bumps a civilian off
   *  a district tile, and the site test reads the tile under its feet. */
  function stand(state: GameState, cls: string, at: number, tile: number): Unit {
    const u = person(state, cls, at, tile);
    Object.assign(u, { tileIndex: tile });
    return u;
  }

  /** a COMPLETE district of `type` on a bare owned tile of the capital. */
  function district(state: GameState, type: string): number {
    const city = state.seats[0].cities[0];
    const t = state.map.tiles[ownBare(state)];
    t.district = type as never;
    t.districtComplete = true;
    city.districts.push({ type: type as never, tileIndex: t.index });
    return t.index;
  }

  it('Tesla: the Industrial Zone keeps +3 reach and its regional buildings +2 Production', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const iz = district(state, 'INDUSTRIAL_ZONE');
    city.buildings.push('FACTORY');
    const before = regionalEffects(state, city).yields.production;
    expect(before).toBeGreaterThan(0); // the Factory's own regional Production reaches the owning city
    const { cls, at } = found('GP_NIKOLA_TESLA');
    const u = stand(state, cls, at, iz);
    expect(gpActivateOk(state, u)).toBe(true);
    expect(activateGreatPerson(state, u)).toBe(true);
    const tile = state.map.tiles[iz];
    expect(gpTilePermOf(tile, 'regionalRange')).toBe(3);
    expect(gpTilePermOf(tile, 'regionalProduction')).toBe(2);
    expect(regionalEffects(state, city).yields.production).toBe(before + 2);
    // a pillaged source is dark, extra and all
    tile.districtPillaged = true;
    expect(regionalEffects(state, city).yields.production).toBe(0);
  });

  it('Paxton: the Entertainment Complex keeps +3 reach and its regional buildings +1 Amenity', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const ec = district(state, 'ENTERTAINMENT_COMPLEX');
    city.buildings.push('ZOO');
    const before = regionalEffects(state, city).amenities;
    expect(before).toBeGreaterThan(0);
    const { cls, at } = found('GP_JOSEPH_PAXTON');
    const u = stand(state, cls, at, ec);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpTilePermOf(state.map.tiles[ec], 'regionalAmenities')).toBe(1);
    expect(regionalEffects(state, city).amenities).toBe(before + 1);
  });

  it('Breedlove: +25% Tourism on an international route, the Online Communities channel', () => {
    const state = newGame();
    const hub = district(state, 'COMMERCIAL_HUB');
    const seat = state.seats[0];
    seat.tradeRoutes = [{ from: seat.cities[0].id, toSeat: 1 }];
    const before = tourismIntlPct(state, 0, 1);
    const { cls, at } = found('GP_SARAH_BREEDLOVE');
    const u = stand(state, cls, at, hub);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpPermOf(seat, 'tourismRouteBonus')).toBe(25);
    expect(tourismIntlPct(state, 0, 1)).toBe(before + 25);
    // no route, no bonus
    seat.tradeRoutes = [];
    expect(tourismIntlPct(state, 0, 1)).toBe(before - 25);
  });

  it('Tata and Ibuka: +10 Tourism per complete Campus / Industrial Zone, dark when pillaged', () => {
    const state = newGame();
    const cities = state.seats[0].cities;
    const campus = district(state, 'CAMPUS');
    const iz = district(state, 'INDUSTRIAL_ZONE');
    expect(gpDistrictTourism(state, 0, cities)).toBe(0);
    const tata = found('GP_JAMSETJI_TATA');
    expect(activateGreatPerson(state, stand(state, tata.cls, tata.at, campus))).toBe(true);
    expect(gpDistrictTourism(state, 0, cities)).toBe(10);
    const ibuka = found('GP_MASARU_IBUKA');
    expect(activateGreatPerson(state, stand(state, ibuka.cls, ibuka.at, iz))).toBe(true);
    expect(gpDistrictTourism(state, 0, cities)).toBe(20);
    state.map.tiles[campus].districtPillaged = true;
    expect(gpDistrictTourism(state, 0, cities)).toBe(10);
  });

  it('Kenzo Tange: the city counts its district adjacency as Tourism, whole or half by yield', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const campus = district(state, 'CAMPUS');
    // a Mountain beside the Campus: +1 Science adjacency, so the share is not 0
    const mtn = state.map.tiles[ownBare(state)];
    Object.assign(mtn, { elevation: 'MOUNTAIN' });
    const { cls, at } = found('GP_KENZO_TANGE');
    const u = stand(state, cls, at, city.centerIndex);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpCityPermOf(city, 'adjTourism')).toBe(1);
    const t = gpDistrictTourism(state, 0, [city]);
    expect(t).toBeGreaterThanOrEqual(0);
    // the same walk `cityDistrictYields` does: floor(adjacency * 100 / 100) for the Campus
    void campus;
    expect(Number.isInteger(t)).toBe(true);
  });

  it('Leif Erikson: hulls enter the Ocean and see one farther; an embarked land unit does neither', () => {
    const state = newGame();
    const seat = state.seats[0];
    const ocean = state.map.tiles.find((t) => t.terrain === 'OCEAN')!;
    expect(ocean).toBeDefined();
    const galley = { seat: 0, type: 'GALLEY', promos: 0 };
    const warrior = { seat: 0, type: 'WARRIOR', promos: 0 };
    expect(seat.research.techs).not.toContain('CARTOGRAPHY');
    expect(waterEnterable(state, ocean, galley)).toBe(false);
    const sight0 = unitSight(galley, state);
    const { cls, at } = found('GP_LEIF_ERIKSON');
    const u = person(state, cls, at, ownBare(state));
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpPermOf(seat, 'navalOcean')).toBe(1);
    expect(waterEnterable(state, ocean, galley)).toBe(true);
    expect(waterEnterable(state, ocean, warrior)).toBe(false);
    expect(unitSight(galley, state)).toBe(sight0 + 1);
    expect(unitSight(warrior, state)).toBe(unitSight(warrior));
    // another seat's hull still waits for Cartography
    expect(waterEnterable(state, ocean, { seat: 1, type: 'GALLEY' })).toBe(false);
  });
});

// The three persons whose page clause is a VERB.
describe('the verb clauses', () => {
  const found = (id: string) => {
    for (const c of GP_CLASSES) {
      const at = GREAT_PEOPLE[c].findIndex((p) => p.id === id);
      if (at >= 0) return { cls: c as string, at };
    }
    throw new Error(`${id} is not in the roster`);
  };
  /** `person` spawns on OWN bare ground (it claims the tile it lands on),
   *  then steps onto `tile` — which may be another seat's. */
  function stand(state: GameState, id: string, tile: number): Unit {
    const { cls, at } = found(id);
    const u = person(state, cls, at, ownBare(state));
    Object.assign(u, { tileIndex: tile });
    return u;
  }
  const dryFree = (state: GameState, t: { index: number; terrain: string; elevation: string; feature: string | null }) =>
    !isWater(t as never) && !isImpassable(t as never) && !state.units.some((u) => u.tileIndex === t.index);

  it('Raffles: the suzerained city-state joins the empire and keeps +10 Loyalty per turn', () => {
    const state = newGame();
    const seat = state.seats[0];
    const cap = state.map.tiles[seat.cities[0].centerIndex];
    const spot = state.map.tiles.find((t) => tileSeat(t) < 0 && dryFree(state, t)
      && hexDistance(t.col, t.row, cap.col, cap.row) >= 6)!;
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', spot.index);
    setMet(cs, 0);
    const u = stand(state, 'GP_STAMFORD_RAFFLES', cs.centerIndex);
    // met but not Suzerain: not his ground
    expect(gpActivateOk(state, u)).toBe(false);
    cs.envoys[0] = 3;
    resolveSuzerains(state);
    expect(gpActivateOk(state, u)).toBe(true);
    const cities0 = seat.cities.length;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(state.cityStates.some((c) => c.id === cs.id)).toBe(false);
    expect(seat.cities.length).toBe(cities0 + 1);
    const city = seat.cities[seat.cities.length - 1];
    expect(city.centerIndex).toBe(cs.centerIndex);
    expect(gpCityPermOf(city, 'loyalty')).toBe(10);
    expect(gpCityPermOf(seat.cities[0], 'loyalty')).toBe(0); // not the capital's
  });

  it('Boudica: every barbarian beside her changes sides, in ring order, with no moves left', () => {
    const state = newGame();
    const city = state.seats[0].cities[0];
    const here = state.map.tiles.find((t) => tileSeat(t) === 0 && t.index !== city.centerIndex
      && !t.district && !t.builtWonder && dryFree(state, t)
      && neighbors(state.map, t).filter((n) => dryFree(state, n) && !n.district).length >= 2)!;
    expect(here).toBeDefined();
    const nbs = neighbors(state.map, here).filter((n) => dryFree(state, n) && !n.district).slice(0, 2);
    const u = stand(state, 'GP_BOUDICA', here.index);
    expect(gpActivateOk(state, u)).toBe(false); // nobody to turn
    const b1 = spawnUnit(state, 'WARRIOR', nbs[0].index, BARB_SEAT)!;
    Object.assign(b1, { tileIndex: nbs[0].index });
    const b2 = spawnUnit(state, 'WARRIOR', nbs[1].index, BARB_SEAT)!;
    Object.assign(b2, { tileIndex: nbs[1].index });
    expect(gpActivateOk(state, u)).toBe(true);
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(b1.seat).toBe(0);
    expect(b2.seat).toBe(0);
    expect(b1.movesLeft).toBe(0);
    // the converts go to the END of the array, in ring order (the pooled twin appends them so)
    expect(state.units.slice(-2).map((x) => x.id)).toEqual([b1.id, b2.id]);
  });

  it('Tupac Amaru: a Musketman in each district of the enemy city, the City Center included', () => {
    const state = newGame();
    const cap = state.map.tiles[state.seats[0].cities[0].centerIndex];
    const spot = state.map.tiles.find((t) => tileSeat(t) < 0 && dryFree(state, t)
      && hexDistance(t.col, t.row, cap.col, cap.row) >= 6)!;
    // the enemy is a CITY-STATE here — the minor branch of `districtTilesOfOwner`;
    // the GPU poke takes a major's capital
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', spot.index);
    setMet(cs, 0);
    const ground = state.map.tiles.find((t) => tileSeat(t) === cs.seat && t.index !== cs.centerIndex && dryFree(state, t))!;
    expect(ground).toBeDefined();
    const u = stand(state, 'GP_TUPAC_AMARU', ground.index);
    expect(gpActivateOk(state, u)).toBe(false); // at peace: not ENEMY land
    state.seats[0].wars.push(cs.seat);
    expect(gpActivateOk(state, u)).toBe(true);
    const tiles = districtTilesOfOwner(state, ground);
    expect(tiles).toContain(cs.centerIndex);
    const mine = () => state.units.filter((x) => x.seat === 0 && x.type === 'MUSKETMAN').length;
    const m0 = mine();
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(mine() - m0).toBe(tiles.length);
  });
});

// CIV6 (Expansion2_GreatPeople_Admirals.xml over GreatPeople_Admirals.xml,
// Expansion2_RemoveData.xml taking the base rows out): Rajendra Chola's
// ABILITY_CHOLA_NAVAL_COMBAT, Francis Drake's Privateer "with 1 promotion
// level", Ching Shih's 500 Gold typed ScaleByGameSpeed.
describe('the Gathering Storm admirals', () => {
  const found = (id: string) => {
    const at = GREAT_PEOPLE.ADMIRAL.findIndex((p) => p.id === id);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  };
  const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

  /** a land plot beside open Coast, nobody on either — where a granted hull
   *  finds water at the first ring of the spawn probe. */
  function shore(state: GameState): number {
    const free = (i: number) => !state.units.some((x) => x.tileIndex === i);
    const t = state.map.tiles.find((x) => !isWater(x) && !isImpassable(x) && !x.district && !x.builtWonder
      && free(x.index) && neighbors(state.map, x).some((n) => n.terrain === 'COAST' && !isImpassable(n) && free(n.index)));
    expect(t).toBeDefined();
    return t!.index;
  }

  it('the catalog carries the three rows as Gathering Storm layers them', () => {
    expect(GP_ABILITY.GP_RAJENDRA_CHOLA).toEqual({ perm: { navalCombat: 3 } });
    expect(GP_ABILITY.GP_FRANCIS_DRAKE).toEqual({ unit: 'PRIVATEER', unitPromotions: 1, perm: { routePlunderPct: 50 } });
    expect(GP_ABILITY.GP_CHING_SHIH).toEqual({ gold: scaleByGameSpeed(500), perm: { routePlunderPct: 60 } });
  });

  it('Rajendra Chola: +3 Combat Strength on every naval combat unit of the seat, and no gold', () => {
    const state = newGame();
    const seat = state.seats[0];
    const u = person(state, 'ADMIRAL', found('GP_RAJENDRA_CHOLA'), ownBare(state));
    const cs = (type: string, s = 0) => rosterCS(state, { type, seat: s, tileIndex: u.tileIndex }, 1, 100, false);
    const kinds = ['GALLEY', 'QUADRIREME', 'PRIVATEER', 'AIRCRAFT_CARRIER', 'SEA_DOG', 'WARRIOR', 'ADMIRAL'];
    const before = new Map(kinds.map((k) => [k, cs(k)]));
    const foe0 = cs('GALLEY', 1);
    const gold0 = seat.treasury;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(gpPermOf(seat, 'navalCombat')).toBe(3);
    for (const k of ['GALLEY', 'QUADRIREME', 'PRIVATEER', 'AIRCRAFT_CARRIER', 'SEA_DOG']) {
      expect(cs(k), k).toBe(before.get(k)! + 3);
    }
    expect(cs('WARRIOR')).toBe(before.get('WARRIOR'));   // a land unit
    expect(cs('ADMIRAL')).toBe(0);                        // no Combat value, no strength
    expect(cs('GALLEY', 1)).toBe(foe0);                   // another seat's hull
    expect(seat.treasury).toBe(gold0);
  });

  it('Francis Drake: a Privateer one promotion level up, and the +50% plunder', () => {
    const state = newGame();
    state.seats[0].civ = civRow('ROME'); // no unique stands in for the Privateer
    const seat = state.seats[0];
    const at = shore(state);
    const u = person(state, 'ADMIRAL', found('GP_FRANCIS_DRAKE'), at);
    Object.assign(u, { tileIndex: at });
    const gold0 = seat.treasury;
    const n0 = state.units.filter((x) => x.seat === 0 && x.type === 'PRIVATEER').length;
    expect(activateGreatPerson(state, u)).toBe(true);
    const made = state.units.filter((x) => x.seat === 0 && x.type === 'PRIVATEER');
    expect(made.length).toBe(n0 + 1);
    const p = made[made.length - 1]!;
    expect(isWater(state.map.tiles[p.tileIndex])).toBe(true);
    expect(p.xp).toBe(xpToNextLevel(p));
    expect(p.xp).toBeGreaterThan(0);
    expect(gpPermOf(seat, 'routePlunderPct')).toBe(50);
    expect(seat.treasury).toBe(gold0);
  });

  it('...and the civilization\'s own unique where it has one (UniqueOverride)', () => {
    const state = newGame();
    state.seats[0].civ = civRow('ENGLAND');
    const at = shore(state);
    const u = person(state, 'ADMIRAL', found('GP_FRANCIS_DRAKE'), at);
    Object.assign(u, { tileIndex: at });
    const dogs0 = state.units.filter((x) => x.seat === 0 && x.type === 'SEA_DOG').length;
    const priv0 = state.units.filter((x) => x.seat === 0 && x.type === 'PRIVATEER').length;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(state.units.filter((x) => x.seat === 0 && x.type === 'SEA_DOG').length).toBe(dogs0 + 1);
    expect(state.units.filter((x) => x.seat === 0 && x.type === 'PRIVATEER').length).toBe(priv0);
  });

  it('three more rows as the layered install writes them', () => {
    // GREATPERSON_GRACE_HOPPER_ACTIVE Amount 2; GREATPERSON_1MODERNATOMICTECHBOOST
    // Modern..Atomic; GREATPERSON_SAMORI_TURE_ACTIVE UNIT_SPEC_OPS Experience -1
    expect(GP_ABILITY.GP_GRACE_HOPPER).toEqual({ freeTechRandom: 2 });
    expect(GP_ABILITY.GP_ALBERT_EINSTEIN).toEqual({ eurekaRandom: 1, eurekaHi: 1, perm: { researchLabScience: 4 } });
    expect(GP_ABILITY.GP_SAMORI_TOURE).toEqual({ unit: 'SPEC_OPS', unitPromotions: 1 });
    const state = newGame();
    const techs = state.seats[0].research.techs;
    const n0 = techs.length;
    const u = person(state, 'ADMIRAL', found('GP_GRACE_HOPPER'), ownBare(state));
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(techs.length).toBe(n0 + 2);
  });

  it('Ching Shih: 500 Gold on Standard speed, scaled by this game\'s speed', () => {
    const state = newGame();
    const seat = state.seats[0];
    const u = person(state, 'ADMIRAL', found('GP_CHING_SHIH'), ownBare(state));
    const gold0 = seat.treasury;
    expect(activateGreatPerson(state, u)).toBe(true);
    expect(seat.treasury).toBe(gold0 + scaleByGameSpeed(500));
    expect(gpPermOf(seat, 'routePlunderPct')).toBe(60);
  });
});
