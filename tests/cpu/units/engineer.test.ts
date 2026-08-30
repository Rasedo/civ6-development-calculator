import { describe, expect, it } from 'vitest';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { canBuildRoad, canBuildRailroad, engineerTileOk, validImprovementsIn } from '../../../cpu/core/rules';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { seatOf } from '../../../cpu/core/seats';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { STRATEGIC_IDS, RAILROAD_COST, RAILROAD_TECH } from '../../../cpu/data/constants';
import { CARBON_PER_RESOURCE } from '../../../cpu/core/climate';
import { airSlotsAt } from '../../../cpu/core/air';
import { tileAppeal } from '../../../cpu/core/appeal';
import { ENGINEER_FINISH_DISTRICTS, ENGINEER_FINISH_FRACTION, engineerFinish, engineerFinishCity } from '../../../cpu/core/game';
import { NO_SEAT } from '../../../world/types';
import type { GameMap, GameState, Tile } from '../../../cpu/core/types';

/**
 * THE MILITARY ENGINEER'S BUILD LIST. CIV6: "Can construct Roads, Forts,
 * Airstrips, and Missile Silos (uses 1 charge)" plus "Can spend a charge to
 * complete 20% of an engineering type of district (Aqueduct, Bath, Canal, Dam)
 * and Flood Barrier building." Both improvements go "in your own or neutral
 * territory", which no other build reaches.
 */
const tile = (over: Partial<Tile> = {}): Tile =>
  ({
    index: 0,
    col: 0,
    row: 0,
    terrain: 'PLAINS',
    elevation: 'FLAT',
    feature: null,
    resource: null,
    improvement: null,
    district: null,
    wonder: null,
    builtWonder: null,
    riverMask: 0,
    ownerSeat: NO_SEAT,
    ownerCity: -1,
    ...over,
  }) as Tile;

const opts = { unlocks: null, ownsTile: () => true };

describe('the military engineer', () => {
  it('is offered its own two rows and nothing the Builder builds', () => {
    const got = validImprovementsIn(tile(), { ...opts, builder: 'MILITARY_ENGINEER' });
    expect(got).toContain('FORT');
    expect(got).toContain('AIRSTRIP');
    expect(got).not.toContain('FARM');
    expect(validImprovementsIn(tile(), { ...opts, builder: 'BUILDER' })).not.toContain('AIRSTRIP');
  });

  it('builds in NEUTRAL territory, where the Builder may not', () => {
    const t = tile();
    const nobody = { unlocks: null, ownsTile: () => false };
    expect(engineerTileOk(t, nobody.ownsTile)).toBe(true);
    expect(validImprovementsIn(t, { ...nobody, builder: 'MILITARY_ENGINEER' })).toContain('AIRSTRIP');
    expect(validImprovementsIn(t, { ...nobody, builder: 'BUILDER' })).toEqual([]);
    // a RIVAL's ground is neither its own nor neutral
    expect(engineerTileOk(tile({ ownerSeat: 3 } as Partial<Tile>), () => false)).toBe(false);
  });

  it('refuses a Fort on a featured tile and an Airstrip on hills', () => {
    const eng = { ...opts, builder: 'MILITARY_ENGINEER' };
    expect(validImprovementsIn(tile({ feature: 'WOODS' }), eng)).not.toContain('FORT');
    expect(validImprovementsIn(tile({ feature: 'WOODS' }), eng)).toContain('AIRSTRIP');
    expect(validImprovementsIn(tile({ elevation: 'HILLS' }), eng)).toContain('FORT');
    expect(validImprovementsIn(tile({ elevation: 'HILLS' }), eng)).not.toContain('AIRSTRIP');
  });

  it('lays a road once, and never on water or on a road already there', () => {
    expect(canBuildRoad(tile(), () => true)).toBe(true);
    expect(canBuildRoad(tile({ road: true } as Partial<Tile>), () => true)).toBe(false);
    expect(canBuildRoad(tile({ terrain: 'OCEAN' }), () => true)).toBe(false);
    // the RAILROAD asks the same ground and its own tier's absence
    expect(canBuildRailroad(tile(), () => true)).toBe(true);
    expect(canBuildRailroad(tile({ railroad: true } as Partial<Tile>), () => true)).toBe(false);
    expect(canBuildRailroad(tile({ road: true } as Partial<Tile>), () => true)).toBe(true);
    expect(canBuildRailroad(tile({ terrain: 'OCEAN' }), () => true)).toBe(false);
  });
});

describe('the railroad', () => {
  /** an engineer of seat 0 standing on its own ground, with `stock` of each
   *  strategic resource in the bank. */
  function scene(stock: number) {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    const seat = seatOf(state, 0)!;
    seat.stockpile = STRATEGIC_IDS.map(() => stock);
    seat.co2 = 0;
    const at = tileAtCoords(state.map, 5, 5);
    at.ownerSeat = 0;
    const u = spawnUnit(state, 'MILITARY_ENGINEER', at.index, 0)!;
    u.tileIndex = at.index;
    return { state, seat, at, u };
  }

  const A_RAIL = unitActionIndex(IMPROVEMENT_IDS).BUILD_RAILROAD;
  const lay = (state: ReturnType<typeof scene>['state'], seat: ReturnType<typeof scene>['seat'],
               u: ReturnType<typeof scene>['u']) => {
    const mine = state.units.filter((x) => x.seat === 0);
    applySeatUnitOrders(state, seat, [mine.map((x) => (x === u ? A_RAIL : -1))]);
  };

  it('spends 1 Iron and 1 Coal, no charge, and discharges their carbon', () => {
    const { state, seat, at, u } = scene(4);
    // CIV6: "Can only be constructed by Military Engineers. Does not cost a
    // charge, but does cost 1 Iron and 1 Coal." Steam Power first.
    lay(state, seat, u);
    expect(at.railroad).toBeUndefined();
    seat.research.techs.push(RAILROAD_TECH);
    const charges = u.charges;
    lay(state, seat, u);
    expect(at.railroad).toBe(true);
    expect(u.charges).toBe(charges); // no charge, so the engineer survives it
    expect(u.movesLeft).toBe(0);
    let carbon = 0;
    for (const [id, n] of RAILROAD_COST) {
      const k = STRATEGIC_IDS.indexOf(id);
      expect(seat.stockpile![k]).toBe(4 - n);
      carbon += n * CARBON_PER_RESOURCE[k];
    }
    expect(seat.co2).toBe(carbon);
  });

  it('refuses when the bank cannot pay, and never lays a second one', () => {
    const { state, seat, at, u } = scene(0);
    seat.research.techs.push(RAILROAD_TECH);
    lay(state, seat, u);
    expect(at.railroad).toBeUndefined();
    expect(seat.co2).toBe(0);
    // pay for one, then find the tile already carries it
    seat.stockpile = STRATEGIC_IDS.map(() => 4);
    u.movesLeft = 4;
    lay(state, seat, u);
    expect(at.railroad).toBe(true);
    const bank = [...seat.stockpile!];
    u.movesLeft = 4;
    lay(state, seat, u);
    expect(seat.stockpile).toEqual(bank);
  });
});

describe('the airstrip', () => {
  const state = (imp: string | null, owner: number, pillaged = false): GameState => {
    const t = tile({ index: 0, improvement: imp, ownerSeat: owner, pillaged } as Partial<Tile>);
    return { map: { tiles: [t], width: 1, height: 1 } as unknown as GameMap, units: [], seats: [] } as unknown as GameState;
  };

  it('bases 3 aircraft for its owner, and nothing for anyone else', () => {
    expect(IMPROVEMENTS.AIRSTRIP.airSlots).toBe(3);
    expect(airSlotsAt(state('AIRSTRIP', 1), 1, 0)).toBe(3);
    expect(airSlotsAt(state('AIRSTRIP', 1), 2, 0)).toBe(0);
    expect(airSlotsAt(state('AIRSTRIP', 1, true), 1, 0)).toBe(0);
  });

  it('takes a point of appeal off every neighbour, off the same column a mine does', () => {
    const map: GameMap = {
      width: 2, height: 1,
      tiles: [
        tile({ index: 0, col: 0, row: 0 }),
        tile({ index: 1, col: 1, row: 0 }),
      ],
    } as unknown as GameMap;
    const bare = tileAppeal(map, map.tiles[0]);
    map.tiles[1].improvement = 'AIRSTRIP';
    const withAir = tileAppeal(map, map.tiles[0]);
    expect(withAir).toBe(bare - 1);
    map.tiles[1].improvement = 'MINE';
    expect(tileAppeal(map, map.tiles[0])).toBe(withAir);
    expect(IMPROVEMENTS.AIRSTRIP.appealAdjacent).toBe(-1);
  });
});

describe('the 20% charge', () => {
  const withQueue = (kind: 'district' | 'building', at: number) => {
    const city = {
      id: 1, seat: 1, name: 'A', centerIndex: 9, districts: [], buildings: [],
      queue: kind === 'district'
        ? [{ kind, district: ENGINEER_FINISH_DISTRICTS[0], tileIndex: at, progress: 0, cost: 200 }]
        : [{ kind, building: 'FLOOD_BARRIER', progress: 0 }],
    };
    // `seatOf` addresses by ARRAY POSITION for a major, so seat 1 is index 1
    return { seats: [{ seat: 0, cities: [] }, { seat: 1, cities: [city] }], map: { tiles: [] }, units: [] } as unknown as GameState;
  };

  it('finds the city being dug at, and only at its own site', () => {
    const st = withQueue('district', 4);
    expect(engineerFinishCity(st, 1, 4)).toBeDefined();
    expect(engineerFinishCity(st, 1, 5)).toBeUndefined();
    expect(engineerFinishCity(st, 2, 4)).toBeUndefined();
  });

  it('adds exactly 20% of the item cost', () => {
    const st = withQueue('district', 4);
    expect(engineerFinish(st, 1, 4)).toBe(true);
    expect(ENGINEER_FINISH_FRACTION).toBe(0.2);
    expect(st.seats[1].cities[0].queue[0].progress).toBe(40);
  });

  it('spends a Flood Barrier charge at the city CENTRE, not on a district site', () => {
    const st = withQueue('building', 0);
    expect(engineerFinishCity(st, 1, 9)).toBeDefined();
    expect(engineerFinishCity(st, 1, 4)).toBeUndefined();
  });
});
