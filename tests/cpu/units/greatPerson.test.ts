import { describe, it, expect } from 'vitest';
import { MP_SCALE } from '../../../cpu/data/constants';
import { createGame } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { setTileOwner, seatOf, tileSeat } from '../../../cpu/core/seats';
import {
  GREAT_PEOPLE, GP_ABILITY, GP_CLASSES, GP_CLASS_DISTRICT, GP_FX, GP_PERM, GP_CITY_PERM,
  GP_SITES, gpSiteOf, gpChargesOf, gpEffectOf, gpPermOf, gpCityPermOf,
} from '../../../cpu/data/greatPeople';
import { activateGreatPerson, gpActivateOk, gpPersonOf } from '../../../cpu/core/gpAbility';
import { completeQueueItem } from '../../../cpu/core/production';
import type { GameState, QueueItem, Unit } from '../../../cpu/core/types';

// — A GREAT PERSON IS PLACED AND USED. CIV6 ("Activating Great People"): the
// person arrives as a UNIT, walks to a site its own ability names, and spends
// a charge there. The scripted rollout claims almost none of them, so the
// catalog, the six sites and the spend are pinned here.

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
    for (const k of [...GP_PERM, ...GP_CITY_PERM]) expect(GP_FX).not.toContain(k);
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
