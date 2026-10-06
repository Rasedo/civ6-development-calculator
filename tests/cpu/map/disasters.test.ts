import { describe, it, expect } from 'vitest';
import { setTileOwner, freeSeatOf, FREE_SEAT, seatOf } from '../../../cpu/core/seats';
import { governorsOf } from '../../../cpu/core/governors';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { makeMap, makeState, settleAt, tileAtCoords, bareCtx, orderUnit } from '../helpers';
import { foundCity, endTurn, serialize, deserialize, TURN_LIMIT } from '../../../cpu/core/game';
import { disasterPhase, riverReach, nuclearAccident, sitePairWeight, floodRivers, floodRiver, erupt, drought, ageReactors, droughtCandidate, droughtStart, eventRows, liveEventPlots } from '../../../cpu/core/disasters';
import { ACCIDENT_ROWS, ACCIDENT_FALLOUT, RANDOM_EVENT_START_TURN, volcanoRow, ERUPTION_ROWS, droughtGround, DROUGHT_TURNS, FLOOD_WEIGHT, FLOOD_DAMAGE_ROWS, FLOOD_YIELD_ROWS, FLOOD_MITIGATED_YIELD_REDUCTION } from '../../../cpu/data/disasters';
import { CLIMATE_PHASES } from '../../../cpu/data/climate';
import { CIV_IDS } from '../../../cpu/data/seats';
import { EVENT_OCC_SCALE, STANDARD_MAP_AREA, FIRST_TIME_OCCURRENCE_BOOST, PERCENT_VOLCANOES_ACTIVE, VOLCANO_ROLL_TURNS, DROUGHT_SPACING, ERUPTION_PROD_P, ERUPTION_SCI_P, ERUPTION_CUL_P, ACCIDENT_LAND_P, ACCIDENT_CIV_KILL_P, ERUPTION_CIV_KILL_P } from '../../../cpu/data/disasters';
import { NO_SEAT } from '../../../cpu/core/types';
import { hexDistance } from '../../../world/hex';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { transferCity, freeCitiesPhase } from '../../../cpu/core/phase';
// The turn draws ONE random event over every eligible (row, site) pair, so a
// board's floods, eruptions and storms share the turn: a loop below WAITS for
// its event to land.
//
// STORMS PERSIST three turns each, and a DROUGHT pillages a Farm near its
// centre: a scene that reads "this tile got pillaged" as "a flood or an
// eruption reached it" can see a tornado or a drought first. `stormFree` runs
// one phase and says whether no storm was live during it — one already raging
// or one that formed — and no drought struck, so a scene about floods can put
// their scorch back and wait on. It clears the event log to read the phase's.
function stormFree(state: GameState, watched: Tile[]): boolean {
  const before = watched.map((t) => [t.pillaged, t.improvement, t.districtPillaged] as const);
  const live = () => (state.storms ?? []).length > 0;
  const raging = live();
  state.eventLog = [];
  disasterPhase(state);
  const stormed = raging || live() || state.eventLog.some((e) => e.startsWith('Drought'));
  if (stormed) {
    watched.forEach((t, i) => {
      t.pillaged = before[i][0];
      t.improvement = before[i][1];
      t.districtPillaged = before[i][2];
    });
  }
  return !stormed;
}
import { neighborTile, neighbors } from '../../../world/hex';
import type { GameState, Tile } from '../../../cpu/core/types';
import { disbandUnit, spawnUnit } from '../../../cpu/core/units';
import { nextRandom } from '../../../cpu/core/rand';
import { tileYields } from '../../../cpu/core/yields';
import { generateMap } from '../../../world/mapgen';

describe('disasters', () => {
  it('volcanoes exist on generated maps', () => {
    const map = generateMap({ width: 44, height: 26, seed: 42 });
    const volcanoes = map.tiles.filter((t) => t.volcano);
    expect(volcanoes.length).toBeGreaterThan(0);
    for (const v of volcanoes) expect(v.elevation).toBe('MOUNTAIN');
  });

  it('eruptions scorch and fertilize the slopes', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const volcano = tileAtCoords(state.map, 8, 8);
    volcano.elevation = 'MOUNTAIN';
    volcano.volcano = true;
    volcano.volcanoActive = true;
    const slope = tileAtCoords(state.map, 9, 8);
    slope.improvement = 'FARM';
    setTileOwner(slope, 0);

    let guard = 0;
    const erupted = () => state.eventLog.some((e) => e.includes('eruption'));
    // wait for the ERUPTION itself: a storm pillages the slope first now
    while (!erupted() && guard++ < 4000) disasterPhase(state);
    expect(erupted()).toBe(true);
    // pillaged on every row; a CATASTROPHIC or MEGACOLOSSAL one may take it away
    expect(slope.pillaged || slope.improvement === null).toBe(true);
    expect(slope.fertility).toBeGreaterThanOrEqual(1);
  });

  it('a flood pillages the district on the floodplain, not just the improvement', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const plain = tileAtCoords(state.map, 4, 4);
    plain.feature = 'FLOODPLAINS';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    setTileOwner(plain, 0);

    let guard = 0;
    while (!plain.districtPillaged && guard++ < 4000) disasterPhase(state);
    expect(plain.districtPillaged).toBe(true);
    expect(state.eventLog.some((e) => e.includes('Flood'))).toBe(true);
  });

  it('a flood leaves an UNFINISHED district and a city centre alone', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const site = tileAtCoords(state.map, 4, 4);
    site.feature = 'FLOODPLAINS';
    site.district = 'CAMPUS'; // queued, not complete
    const centre = tileAtCoords(state.map, 6, 6);
    centre.feature = 'FLOODPLAINS';
    centre.district = 'CITY_CENTER';
    centre.districtComplete = true;

    for (let i = 0; i < 4000; i++) disasterPhase(state);
    // both tiles were flooded many times over (the silt proves it landed)
    expect(site.fertility).toBeGreaterThan(0);
    expect(centre.fertility).toBeGreaterThan(0);
    expect(site.districtPillaged).toBeFalsy();
    expect(centre.districtPillaged).toBeFalsy();
  });

  it('fertility adds food; drought subtracts and expires', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    expect(tileYields(bareCtx(map), t).food).toBe(2);
    t.fertility = 2;
    expect(tileYields(bareCtx(map), t).food).toBe(4);
    t.droughtTurns = 3;
    expect(tileYields(bareCtx(map), t).food).toBe(3);

    // the clock ticks a turn — on a sea, where no drought can strike again
    const sea = makeMap(10, 10, 'COAST');
    const dry = tileAtCoords(sea, 5, 5);
    dry.droughtTurns = 3;
    const state = makeState(sea);
    state.disasters = true;
    disasterPhase(state);
    expect(dry.droughtTurns).toBe(2);
  });

  it('is reproducible and inert when toggled off', () => {
    const mk = () => {
      const state = makeState(makeMap(18, 18));
      state.disasters = true;
      tileAtCoords(state.map, 4, 4).feature = 'FLOODPLAINS';
      tileAtCoords(state.map, 4, 4).terrain = 'DESERT';
      foundCity(state, tileAtCoords(state.map, 9, 9).index, 0);
      return state;
    };
    const a = mk();
    const b = deserialize(serialize(mk()));
    for (let i = 0; i < 30; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));

    const calm = makeState(makeMap(18, 18));
    foundCity(calm, tileAtCoords(calm.map, 9, 9).index, 0);
    for (let i = 0; i < 30; i++) endTurn(calm);
    expect(calm.eventLog.length).toBe(0);
    expect(calm.map.tiles.every((t) => t.fertility === 0 && t.droughtTurns === 0)).toBe(true);
  });

  // The Flood page's two tables, poked one severity at a time. `disasterPhase`
  // draws the severity itself, so the assertions are about the BAND every
  // outcome must sit in, driven until each one has been seen.
  const floodBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    state.unitsMode = true;
    const plain = tileAtCoords(state.map, 4, 4);
    plain.feature = 'FLOODPLAINS';
    plain.terrain = 'DESERT';
    setTileOwner(plain, 0);
    return { state, plain };
  };

  it('a flood pillages the improvement every time and sometimes takes it away', () => {
    const { state, plain } = floodBoard();
    plain.improvement = 'FARM';
    let pillaged = 0;
    let destroyed = 0;
    for (let i = 0; i < 6000; i++) {
      const had = plain.improvement !== null;
      disasterPhase(state);
      if (had && plain.improvement === null) destroyed++;
      if (plain.pillaged) pillaged++;
      plain.improvement = 'FARM';
      plain.pillaged = false;
    }
    expect(pillaged).toBeGreaterThan(0);
    expect(destroyed).toBeGreaterThan(0);
    // destruction is the rarer half of the pillage column
    expect(destroyed).toBeLessThan(pillaged);
  });

  it('a flood damages a unit and a city centre, and can cost a citizen', () => {
    const { state, plain } = floodBoard();
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    setTileOwner(plain, 0);
    plain.ownerCity = city.id;
    city.population = 6;
    const seen = new Set<number>();
    let popLost = 0;
    let centreHit = 0;
    for (let i = 0; i < 6000; i++) {
      const u = spawnUnit(state, 'WARRIOR', plain.index, 0)!;
      const pop = city.population;
      const centre = state.map.tiles[city.centerIndex];
      centre.feature = 'FLOODPLAINS';
      // a storm's damage would stack on the flood's: read calm phases only
      const calm = stormFree(state, []);
      if (calm && city.population < pop) popLost++;
      if (calm && city.hp < 200) centreHit++;
      city.hp = 200;
      const alive = state.units.find((x) => x.id === u.id);
      if (alive) {
        if (calm && alive.hp < 100) seen.add(100 - alive.hp);
        disbandUnit(state, u.id);
      } else if (calm) {
        seen.add(100);
      }
      city.population = 6;
    }
    // every damage seen sits inside the two sourced bands (30-50, 50-70)
    expect(seen.size).toBeGreaterThan(0);
    for (const d of seen) {
      expect(d === 100 || (d >= 30 && d <= 50) || (d >= 50 && d <= 70)).toBe(true);
    }
    expect(popLost).toBeGreaterThan(0);
    expect(centreHit).toBeGreaterThan(0);
  });

  it('a flood silts FOOD and PRODUCTION on their own rolls', () => {
    const { state, plain } = floodBoard();
    for (let i = 0; i < 6000 && (plain.fertility === 0 || plain.fertilityProd === 0); i++) {
      disasterPhase(state);
    }
    expect(plain.fertility).toBeGreaterThan(0);
    expect(plain.fertilityProd).toBeGreaterThan(0);
    expect(tileYields(bareCtx(state.map), plain).production).toBeGreaterThanOrEqual(plain.fertilityProd);
  });

  // CIV6 (Dam): "a Dam or Great Bath along a River will mitigate floods
  // THERE" — the shield belongs to the RIVER, not to the seat, so it has to
  // stand on the water it protects.
  const shieldBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const plain = tileAtCoords(state.map, 4, 4);
    const up = neighborTile(state.map, plain, 0)!;
    plain.riverMask |= 1 << 0;
    up.riverMask |= 1 << 3;
    for (const t of [plain, up]) {
      t.feature = 'FLOODPLAINS';
      t.terrain = 'DESERT';
      setTileOwner(t, 0);
    }
    plain.improvement = 'FARM';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    return { state, plain, up };
  };

  it('a GREAT BATH on the river spares the damage and halves the silt', () => {
    const { state, plain, up } = shieldBoard();
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    up.builtWonder = 'GREAT_BATH';
    up.builtWonderComplete = true;
    city.wonders.push({ id: 'GREAT_BATH', tileIndex: up.index });
    for (let i = 0; i < 6000; i++) stormFree(state, [plain]);
    expect(plain.improvement).toBe('FARM');
    expect(plain.pillaged).toBeFalsy();
    expect(plain.districtPillaged).toBeFalsy();
    expect(plain.fertility).toBeGreaterThan(0); // the river still silts
  });

  it('a DAM on the river does the same, and a pillaged one does nothing', () => {
    const { state, plain, up } = shieldBoard();
    up.district = 'DAM';
    up.districtComplete = true;
    // a storm over the DAM itself would pillage it and open the river
    for (let i = 0; i < 6000; i++) stormFree(state, [plain, up]);
    expect(plain.improvement).toBe('FARM');
    expect(plain.districtPillaged).toBeFalsy();

    const b2 = shieldBoard();
    b2.up.district = 'DAM';
    b2.up.districtComplete = true;
    b2.up.districtPillaged = true;
    // one strike proves the pillaged DAM shields nothing
    let struck = 0;
    for (let i = 0; i < 6000 && struck === 0; i++) {
      disasterPhase(b2.state);
      if (b2.plain.pillaged || b2.plain.improvement === null) struck++;
      b2.plain.improvement = 'FARM';
      b2.plain.pillaged = false;
    }
    expect(struck).toBeGreaterThan(0);
  });

  it('a shield off the river protects nothing', () => {
    const { state, plain } = shieldBoard();
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const far = state.map.tiles[city.centerIndex];
    far.builtWonder = 'GREAT_BATH';
    far.builtWonderComplete = true;
    city.wonders.push({ id: 'GREAT_BATH', tileIndex: far.index });
    let struck = 0;
    for (let i = 0; i < 6000; i++) {
      disasterPhase(state);
      if (plain.pillaged || plain.improvement === null) struck++;
      plain.improvement = 'FARM';
      plain.pillaged = false;
    }
    expect(struck).toBeGreaterThan(0);
  });
});

describe('the flood reaches the whole river', () => {
  /** Two tiles carry a river EDGE between them when both masks hold that bit —
   *  the mapgen writes both flanks, so a river tile chain is symmetric. */
  function link(map: ReturnType<typeof makeMap>, a: Tile, dir: number): Tile {
    const b = neighborTile(map, a, dir)!;
    a.riverMask |= 1 << dir;
    b.riverMask |= 1 << ((dir + 3) % 6);
    return b;
  }

  it('walks the river and stops where the river does', () => {
    const state = makeState(makeMap(16, 16));
    const a = tileAtCoords(state.map, 4, 4);
    const b = link(state.map, a, 0);
    const c = link(state.map, b, 0);
    for (const t of [a, b, c]) t.feature = 'FLOODPLAINS';
    // a floodplain OFF the river, and a river tile that is not floodplain
    const off = tileAtCoords(state.map, 10, 10);
    off.feature = 'FLOODPLAINS';
    const dry = link(state.map, c, 1);

    const reach = riverReach(state.map, a).map((t) => t.index);
    expect(reach).toEqual([a, b, c].map((t) => t.index).sort((x, y) => x - y));
    expect(reach).not.toContain(off.index);
    expect(reach).not.toContain(dry.index);

    // ...and from the far end it is the same river
    expect(riverReach(state.map, c).map((t) => t.index)).toEqual(reach);
    // a floodplain with no river at all floods alone
    expect(riverReach(state.map, off).map((t) => t.index)).toEqual([off.index]);
  });

  it('a flood starts on its river\'s upstream-most floodplain: the one farthest from the mouth', () => {
    const board = (mouthEast: boolean | null) => {
      const state = makeState(makeMap(16, 16));
      const a = tileAtCoords(state.map, 3, 4);
      const b = link(state.map, a, 0);
      const c = link(state.map, b, 0);
      const d = link(state.map, c, 0);
      const e = link(state.map, d, 0);
      for (const t of [b, c, d]) t.feature = 'FLOODPLAINS';
      if (mouthEast !== null) (mouthEast ? neighborTile(state.map, e, 0)! : neighborTile(state.map, a, 3)!).terrain = 'COAST';
      return { state, b, d };
    };
    // the sea beside the east end: the west floodplain is upstream-most
    const east = board(true);
    expect(floodRivers(east.state.map).map((r) => r.start.index)).toEqual([east.b.index]);
    // the sea beside the west end: the east one
    const west = board(false);
    expect(floodRivers(west.state.map).map((r) => r.start.index)).toEqual([west.d.index]);
    // no water anywhere: the lowest-index floodplain
    const inland = board(null);
    expect(floodRivers(inland.state.map).map((r) => r.start.index)).toEqual([inland.b.index]);
    // the whole river floods from any start
    expect(riverReach(west.state.map, west.d).map((t) => t.index))
      .toEqual(riverReach(west.state.map, west.b).map((t) => t.index));
  });

  it('one flood takes every floodplain along its river together', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const a = tileAtCoords(state.map, 4, 4);
    const b = link(state.map, a, 0);
    const c = link(state.map, b, 0);
    const off = tileAtCoords(state.map, 10, 10);
    for (const t of [a, b, c, off]) {
      t.feature = 'FLOODPLAINS';
      t.terrain = 'DESERT';
      setTileOwner(t, 0);
    }
    const struck = (t: Tile) => t.pillaged || t.improvement === null;
    let rivers = 0;
    let alone = 0;
    for (let i = 0; i < 6000 && (rivers < 3 || alone < 1); i++) {
      for (const t of [a, b, c, off]) { t.improvement = 'FARM'; t.pillaged = false; }
      if (!stormFree(state, [a, b, c, off])) continue;
      if (struck(a) || struck(b) || struck(c)) {
        // one river, one flood: no tile of it is spared
        expect([struck(a), struck(b), struck(c)]).toEqual([true, true, true]);
        rivers += 1;
      } else if (struck(off)) {
        alone += 1; // the riverless floodplain floods by itself
      }
    }
    expect(rivers).toBeGreaterThanOrEqual(3);
    expect(alone).toBeGreaterThanOrEqual(1);
  });
});

describe('the flood\'s row walk', () => {
  /** draws spent by `f`, read off the stream's state */
  const draws = (state: GameState, f: () => void): number => {
    const before = state.rngState;
    f();
    const probe = { rngState: before } as GameState;
    let n = 0;
    while (probe.rngState !== state.rngState && n < 10000) {
      nextRandom(probe);
      n++;
    }
    return n;
  };
  /** a river of three Floodplains plots, one of each kind, unowned */
  const river = () => {
    const state = makeState(makeMap(16, 16));
    state.unitsMode = true;
    const a = tileAtCoords(state.map, 4, 4);
    const b = neighborTile(state.map, a, 0)!;
    const c = neighborTile(state.map, b, 0)!;
    a.riverMask |= 1 << 0;
    b.riverMask |= (1 << 3) | (1 << 0);
    c.riverMask |= 1 << 3;
    a.terrain = 'DESERT';
    a.feature = 'FLOODPLAINS';
    b.terrain = 'GRASSLAND';
    b.feature = 'FLOODPLAINS_GRASSLAND';
    c.terrain = 'PLAINS';
    c.feature = 'FLOODPLAINS_PLAINS';
    return { state, plots: [a, b, c] };
  };

  it('draws once per damage row per plot, then once per yield row per plot', () => {
    for (let sev = 0; sev < 3; sev++) {
      const { state, plots } = river();
      const n = draws(state, () => floodRiver(state, plots[0], sev));
      expect(n).toBe((FLOOD_DAMAGE_ROWS[sev].length + FLOOD_YIELD_ROWS[sev].length) * plots.length);
      for (const t of plots) expect(t.floodCount).toBe(1);
    }
  });

  it('a land unit on a plot takes one more draw per damage row that lands on it', () => {
    const { state, plots } = river();
    spawnUnit(state, 'WARRIOR', plots[1].index, 0);
    const n = draws(state, () => floodRiver(state, plots[0], 2));
    // UNIT_DAMAGE_LAND lands at 100 on the unit's plot
    expect(n).toBe((FLOOD_DAMAGE_ROWS[2].length + FLOOD_YIELD_ROWS[2].length) * plots.length + 1);
  });

  it('Egypt\'s plots spend no damage draw; a shielded river skips the damage pass whole', () => {
    const { state, plots } = river();
    state.seats[0].civ = CIV_IDS.indexOf('EGYPT' as never);
    for (const t of plots) setTileOwner(t, 0);
    expect(draws(state, () => floodRiver(state, plots[0], 1))).toBe(FLOOD_YIELD_ROWS[1].length * plots.length);

    const dam = river();
    dam.plots[2].district = 'DAM';
    dam.plots[2].districtComplete = true;
    dam.plots[0].improvement = 'FARM';
    setTileOwner(dam.plots[0], 0);
    expect(draws(dam.state, () => floodRiver(dam.state, dam.plots[0], 2))).toBe(FLOOD_YIELD_ROWS[2].length * 3);
    expect(dam.plots[0].pillaged).toBeFalsy();
  });

  it('no yield draw once the climate stops laying fertility down', () => {
    const { state, plots } = river();
    state.climateIdx = CLIMATE_PHASES.findIndex((p) => !p.fertility);
    expect(state.climateIdx).toBeGreaterThanOrEqual(0);
    expect(draws(state, () => floodRiver(state, plots[0], 1))).toBe(FLOOD_DAMAGE_ROWS[1].length * plots.length);
  });

  it('a yield row lands on its own Floodplains kind alone, at its Percentage, halved on a shielded river', () => {
    // MODERATE carries Food rows alone: no plot ever gains Production
    const rate = (shield: boolean) => {
      const gained = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        const { state, plots } = river();
        state.rngState = 7919 * (i + 1);
        if (shield) {
          plots[1].district = 'DAM';
          plots[1].districtComplete = true;
        }
        floodRiver(state, plots[0], 0);
        plots.forEach((t, k) => { gained[k] += t.fertility; });
        for (const t of plots) expect(t.fertilityProd).toBe(0);
        n++;
      }
      return gained.map((g) => g / n);
    };
    const pct = (f: string) => FLOOD_YIELD_ROWS[0].find((r) => r.feature === f)!.pct / 100;
    const kinds = ['FLOODPLAINS', 'FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS'];
    const open = rate(false);
    open.forEach((r, k) => expect(Math.abs(r - pct(kinds[k]))).toBeLessThan(0.03));
    const shut = rate(true);
    shut.forEach((r, k) => {
      const want = Math.floor(((100 - FLOOD_MITIGATED_YIELD_REDUCTION) * pct(kinds[k]) * 100) / 100) / 100;
      expect(Math.abs(r - want)).toBeLessThan(0.03);
    });
  }, 60000);
});

describe('the turn\'s one random event', () => {
  /** a sea holding two active volcanoes (their rings water, so no storm
   *  starts there), one river of two Grassland floodplains plus a lone one,
   *  and a city on a bare Grassland plot ringed by bare Grassland — its
   *  centre the one plot whose ring is all dry ground, the drought's start
   *  (and the ring owned, so no meteor falls) */
  const eventBoard = () => {
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const home = tileAtCoords(state.map, 14, 14);
    for (const t of [home, ...neighbors(state.map, home)]) t.terrain = 'GRASSLAND';
    const city = settleAt(state, home.index);
    for (const [c, r] of [[4, 4], [12, 12]]) {
      const v = tileAtCoords(state.map, c, r);
      v.terrain = 'GRASSLAND';
      v.elevation = 'MOUNTAIN';
      v.volcano = true;
      v.volcanoActive = true;
    }
    const a = tileAtCoords(state.map, 8, 4);
    const b = neighborTile(state.map, a, 0)!;
    a.riverMask |= 1 << 0;
    b.riverMask |= 1 << 3;
    const lone = tileAtCoords(state.map, 8, 12);
    for (const t of [a, b, lone]) {
      t.terrain = 'GRASSLAND';
      t.feature = 'FLOODPLAINS';
    }
    return { state, a, b, lone, city };
  };

  /** one phase with no storm left standing, so a drawn storm always lands
   *  and logs */
  const phase = (state: GameState) => {
    state.storms = [];
    for (const t of state.map.tiles) {
      if (t.volcano) t.volcanoActive = true;
    }
    state.eventLog = [];
    disasterPhase(state);
  };
  /** the draw's span, 10 x the game's turns */
  const SPAN = EVENT_OCC_SCALE * TURN_LIMIT;
  /** the board's area: an 18 x 18 map */
  const AREA = 18 * 18;

  it('a river is one flood site, a riverless floodplain another', () => {
    const { state, a, b, lone } = eventBoard();
    const rivers = floodRivers(state.map);
    expect(rivers.map((r) => r.start.index)).toEqual([a.index, lone.index].sort((x, y) => x - y));
    expect(rivers.find((r) => r.start === a)!.plots.map((t) => t.index).sort((x, y) => x - y))
      .toEqual([a.index, b.index].sort((x, y) => x - y));
  });

  it('each (row, site) pair fires at its integer weight over 10 x N; the rest of the turn is empty', () => {
    // per-site rows in tenths: 2 flood sites x 45, 2 volcanoes x 80; per-map
    // rows scaled by the map's area over Standard's, each counted whether or
    // not it finds a plot: of the storms only the Grassland's tornado pair
    // (150 and 30 tenths: 10 + 2) lands; the droughts find no plot (the only
    // dry ground lies beside the Coast), nor do the meteor and the fires
    // (every Grassland plot is owned or a floodplain; no Woods) — they leave
    // the turn empty
    expect([EVENT_OCC_SCALE, TURN_LIMIT]).toEqual([10, 250]);
    const { state } = eventBoard();
    const N = 8000;
    const seen = { flood: 0, eruption: 0, storm: 0, drought: 0, empty: 0 };
    for (let i = 0; i < N; i++) {
      phase(state);
      expect(state.eventLog.length).toBeLessThanOrEqual(1);
      const e = state.eventLog[0] ?? '';
      if (e.startsWith('Flood')) seen.flood++;
      else if (e.includes('eruption')) seen.eruption++;
      else if (e.startsWith('Storm')) seen.storm++;
      else if (e.startsWith('Drought')) seen.drought++;
      else if (e === '') seen.empty++;
    }
    const tornado = Math.floor(150 * AREA / STANDARD_MAP_AREA) + Math.floor(30 * AREA / STANDARD_MAP_AREA);
    expect(tornado).toBe(12);
    const want = { flood: 90 / SPAN, eruption: 160 / SPAN, storm: tornado / SPAN, drought: 0 };
    for (const [k, p] of Object.entries(want)) {
      expect(Math.abs(seen[k as keyof typeof seen] / N - p)).toBeLessThan(0.008);
    }
    const busy = Object.values(want).reduce((x, y) => x + y, 0);
    expect(Math.abs(seen.empty / N - (1 - busy))).toBeLessThan(0.02);
  });

  it('weights summing past 10 x N are the draw\'s span', () => {
    // sixty lone Desert floodplains, every one already flooded on all three
    // rows (no boost): 60 x 45 = 2700 past the 2500, and every per-map row
    // counted once — the floods take their share of the whole
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const flood = eventRows(0, AREA).flatMap((r, i) => (r.family === 'flood' ? [i] : []));
    for (const t of state.map.tiles.filter((u) => u.row % 2 === 0 && u.col % 2 === 0).slice(0, 60)) {
      t.terrain = 'DESERT';
      t.feature = 'FLOODPLAINS';
      t.eventFired = flood.reduce((m, i) => m | (1 << i), 0);
    }
    expect(floodRivers(state.map)).toHaveLength(60);
    const floodMass = 60 * FLOOD_WEIGHT.reduce((x, y) => x + y * 10, 0);
    const mapMass = eventRows(0, AREA).filter((r) => ['storm', 'drought', 'meteor', 'fire'].includes(r.family))
      .reduce((x, r) => x + r.weight, 0);
    expect(floodMass).toBeGreaterThan(SPAN);
    const N = 3000;
    let floods = 0;
    for (let i = 0; i < N; i++) {
      phase(state);
      expect(state.eventLog.length).toBeLessThanOrEqual(1);
      if (state.eventLog[0]?.startsWith('Flood')) floods++;
    }
    expect(Math.abs(floods / N - floodMass / (floodMass + mapMass))).toBeLessThan(0.015);
  });

  it('a (row, site) pair not yet fired this game carries the first-occurrence boost; the firing ends it', () => {
    // one lone Grassland floodplain in a sea: its three flood rows' tenths
    // 20 / 15 / 10, x (100 + 30) // 100 while the pair has not fired
    expect(FIRST_TIME_OCCURRENCE_BOOST).toBe(30);
    const rate = (fresh: boolean) => {
      const state = makeState(makeMap(18, 18, 'COAST'));
      state.disasters = true;
      state.turn = RANDOM_EVENT_START_TURN;
      const t = tileAtCoords(state.map, 9, 9);
      t.terrain = 'GRASSLAND';
      t.feature = 'FLOODPLAINS';
      const N = 20000;
      let floods = 0;
      for (let i = 0; i < N; i++) {
        if (fresh) t.eventFired = 0;
        phase(state);
        if (!state.eventLog.some((e) => e.startsWith('Flood'))) continue;
        floods += 1;
        // the fired row's bit, and only that one, when the plot was fresh
        if (fresh) expect([1 << 2, 1 << 3, 1 << 4]).toContain(t.eventFired);
      }
      return floods / N;
    };
    const boosted = FLOOD_WEIGHT.reduce((x, y) => x + Math.floor(y * 10 * (100 + FIRST_TIME_OCCURRENCE_BOOST) / 100), 0);
    expect(boosted).toBe(26 + 19 + 13);
    expect(Math.abs(rate(true) - boosted / SPAN)).toBeLessThan(0.0025);
    expect(Math.abs(rate(false) - 45 / SPAN)).toBeLessThan(0.0025);
  }, 60000);

  it('a flood pair is boosted first, then warmed', () => {
    const flood = eventRows(0, AREA).find((r) => r.family === 'flood' && r.sev === 0)!;
    expect(flood.weight).toBe(20);
    // 20 x 130 // 100 = 26, then 26 + floor(floor(20 x 26 x 0.2) / 100) = 27;
    // warming first would give (20 + 0) x 130 // 100 = 26
    expect(sitePairWeight(flood, 130, 0.2)).toBe(27);
    expect(sitePairWeight(flood, 100, 0.2)).toBe(20);
    expect(sitePairWeight(flood, 100, 0.25)).toBe(21);
    const eruption = eventRows(0, AREA).find((r) => r.family === 'eruption')!;
    expect(sitePairWeight(eruption, 130, 2)).toBe(Math.floor(eruption.weight * 130 / 100));
  });

  it('a river floods only once a major has revealed a plot of it', () => {
    const { state, a, b } = eventBoard();
    state.unitsMode = true;
    state.fogOfWar = true;
    const seat = state.seats[0];
    seat.explored = state.map.tiles.map(() => 0);
    seat.explored[tileAtCoords(state.map, 14, 14).index] = 1;
    const floodsAt = (n: number) => {
      let at = 0;
      for (let i = 0; i < n; i++) {
        phase(state);
        if (state.eventLog.some((e) => e.startsWith(`Flood at (${a.col}, ${a.row})`))) at += 1;
      }
      return at;
    };
    expect(floodsAt(2000)).toBe(0);
    // the river's other plot, not the one its flood starts on
    seat.explored[b.index] = 1;
    expect(floodsAt(2000)).toBeGreaterThan(0);
  });

  it('Kilimanjaro erupts on its own two rows, 65 of the draw\'s 2500 a turn, painting its ring', () => {
    // the board above plus one Mount Kilimanjaro ringed by bare Grassland
    const { state } = eventBoard();
    const k = tileAtCoords(state.map, 14, 4);
    k.terrain = 'GRASSLAND';
    k.elevation = 'MOUNTAIN';
    k.feature = 'MOUNT_KILIMANJARO';
    const ring = neighbors(state.map, k);
    const N = 6000;
    let kili = 0;
    let eruptions = 0;
    let plots = 0;
    let painted = 0;
    for (let i = 0; i < N; i++) {
      for (const t of state.map.tiles) {
        t.meteor = false;
        if (t.volcano) t.volcanoActive = true;
      }
      for (const t of ring) {
        t.terrain = 'GRASSLAND';
        t.elevation = 'FLAT';
        t.feature = null;
      }
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.includes('eruption'))) continue;
      eruptions++;
      if (!state.eventLog.some((e) => e.includes(`(${k.col}, ${k.row})`))) continue;
      kili++;
      plots += ring.length;
      painted += ring.filter((t) => t.feature === 'VOLCANIC_SOIL').length;
    }
    expect(Math.abs(kili / N - 65 / SPAN)).toBeLessThan(0.008);
    expect(Math.abs((eruptions - kili) / N - 160 / SPAN)).toBeLessThan(0.012);
    // every Yields row paints: GENTLE 1 - 0.5 x 0.75, CATASTROPHIC
    // 1 - 0.5 x 0.65 x 0.85, weighted 4 : 2.5
    const pk = (4 * (1 - 0.5 * 0.75) + 2.5 * (1 - 0.5 * 0.65 * 0.85)) / 6.5;
    expect(Math.abs(painted / plots - pk)).toBeLessThan(0.06);
    expect(k.feature).toBe('MOUNT_KILIMANJARO');
  });

  it('only an ACTIVE volcano erupts', () => {
    const { state } = eventBoard();
    const [v] = state.map.tiles.filter((t) => t.volcano);
    let at = 0;
    let other = 0;
    for (let i = 0; i < 3000; i++) {
      state.storms = [];
      for (const t of state.map.tiles) {
        if (t.volcano) t.volcanoActive = t !== v;
      }
      state.eventLog = [];
      disasterPhase(state);
      // a volcano that woke this phase may erupt in it
      if (v.volcanoActive) continue;
      if (state.eventLog.some((e) => e.includes(`eruption at (${v.col}, ${v.row})`))) at++;
      else if (state.eventLog.some((e) => e.includes('eruption'))) other++;
    }
    expect(at).toBe(0);
    expect(other).toBeGreaterThan(0);
  });

  it('every volcano starts dormant; ONE roll a turn wakes one below the active share, sleeps one above it', () => {
    expect([PERCENT_VOLCANOES_ACTIVE, VOLCANO_ROLL_TURNS]).toEqual([70, 500]);
    // many volcanoes: D = 500 // 2V is 0, read as 1 — the roll always lands
    const map = makeMap(40, 40);
    for (const t of map.tiles) {
      t.volcano = t.index % 3 !== 0;
      if (t.volcano) t.elevation = 'MOUNTAIN';
    }
    const state = makeState(map);
    // turn 1: no event draw, so the phase draws the roll and its pick alone
    state.turn = 1;
    const count = () => map.tiles.filter((t) => t.volcanoActive).length;
    expect(count()).toBe(0);
    for (let i = 1; i <= 5; i++) {
      disasterPhase(state);
      expect(count()).toBe(i);
    }
    expect(map.tiles.some((t) => !t.volcano && t.volcanoActive)).toBe(false);
    // every one active: the share is 100, one goes back to sleep a turn
    for (const t of map.tiles) if (t.volcano) t.volcanoActive = true;
    const all = count();
    disasterPhase(state);
    expect(count()).toBe(all - 1);
    // four volcanoes, all dormant: D = 500 // 8 = 62, (70 - 0) x 4 = 280
    // reaches 200, so D // 2 = 31 — one wake in 31 turns
    const small = makeMap(20, 20);
    const vs = [small.tiles[41], small.tiles[97], small.tiles[213], small.tiles[355]];
    for (const t of vs) { t.volcano = true; t.elevation = 'MOUNTAIN'; }
    const s2 = makeState(small);
    s2.turn = 1;
    const N = 6200;
    let woke = 0;
    for (let i = 0; i < N; i++) {
      for (const t of vs) t.volcanoActive = false;
      disasterPhase(s2);
      woke += vs.filter((t) => t.volcanoActive).length;
    }
    expect(Math.abs(woke / N - 1 / 31)).toBeLessThan(0.008);
  });

  it('a drought is seven plots for its Duration at the game speed (2 or 5 turns online)', () => {
    // an inland grassland: dry ground far from any Coast
    const state = makeState(makeMap(20, 20));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const lengths = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      for (const t of state.map.tiles) t.droughtTurns = 0;
      state.droughts = [];
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.startsWith('Drought'))) continue;
      const dry = state.map.tiles.filter((t) => t.droughtTurns > 0);
      // the footprint is the centre and its ring, water skipped
      expect(dry.length).toBeGreaterThan(0);
      expect(dry.length).toBeLessThanOrEqual(7);
      for (const t of dry) lengths.add(t.droughtTurns);
      // its record keeps the footprint, centre first, and the row's turns
      expect(state.droughts).toHaveLength(1);
      const rec = state.droughts[0];
      expect([...rec.plots].sort((x, y) => x - y)).toEqual(dry.map((t) => t.index));
      expect(rec.left).toBe(dry[0].droughtTurns);
    }
    expect([...lengths].sort((x, y) => x - y)).toEqual([...DROUGHT_TURNS]);
    expect([...DROUGHT_TURNS]).toEqual([2, 5]);
  });

  it('a drought starts anywhere on the map, each candidate weighing 1 + min(its distance to a live drought\'s last plot, 15)', () => {
    expect(DROUGHT_SPACING).toBe(15);
    // a 24 x 24 grassland, no city; a live drought whose footprint ends at
    // `ev`, and a storm far off — under an event, yet no spacing
    const state = makeState(makeMap(24, 24));
    const first = tileAtCoords(state.map, 2, 2);
    const ev = tileAtCoords(state.map, 3, 3);
    first.droughtTurns = 5;
    ev.droughtTurns = 5;
    state.droughts = [{ plots: [first.index, ev.index], left: 5 }];
    const storm = tileAtCoords(state.map, 20, 20);
    state.storms = [{ id: 1, event: 0, at: storm.index, left: 2, struck: [storm.index] }];
    const live = new Set(liveEventPlots(state).map((t) => t.index));
    // a plot a live storm struck is under an event; a drought's is not
    expect(live.has(storm.index)).toBe(true);
    expect(live.has(ev.index)).toBe(false);
    const none = new Set<number>();
    const cands = state.map.tiles.filter((t) => droughtCandidate(state.map, t, none, live));
    const w = (t: Tile) => 1 + Math.min(hexDistance(state.map, t.col, t.row, ev.col, ev.row), DROUGHT_SPACING);
    const total = cands.reduce((x, t) => x + w(t), 0);
    const near = (t: Tile) => hexDistance(state.map, t.col, t.row, ev.col, ev.row) <= 4;
    const pNear = cands.filter(near).reduce((x, t) => x + w(t), 0) / total;
    const N = 6000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      const t = droughtStart(state)!;
      expect(cands).toContain(t);
      if (near(t)) hits++;
    }
    expect(pNear).toBeGreaterThan(0.01);
    expect(Math.abs(hits / N - pNear)).toBeLessThan(0.01);
  }, 60000);

  it('no candidate, no drought and no draw', () => {
    // bare Grassland beside the Coast everywhere: no plot's ring is dry
    const state = makeState(makeMap(16, 16, 'COAST'));
    for (const t of state.map.tiles) if (t.row % 2 === 0) t.terrain = 'GRASSLAND';
    const s0 = state.rngState;
    expect(droughtStart(state)).toBeUndefined();
    expect(state.rngState).toBe(s0);
  });
});

describe('the nuclear accident', () => {
  /** a city on a sea island with a Nuclear Power Plant in its Industrial Zone */
  const reactorBoard = (age: number) => {
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const centre = tileAtCoords(state.map, 9, 9);
    const izTile = neighborTile(state.map, centre, 0)!;
    for (const t of [centre, izTile]) t.terrain = 'DESERT';
    const city = settleAt(state, centre.index);
    izTile.district = 'INDUSTRIAL_ZONE';
    izTile.districtComplete = true;
    setTileOwner(izTile, 0);
    izTile.ownerCity = city.id;
    city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: izTile.index });
    city.buildings.push('NUCLEAR_POWER_PLANT');
    city.reactorAge = age;
    city.population = 12;
    return { state, city, izTile };
  };

  it('its payloads are per-accident chances: the plant always, the chain\'s top, the zone, one citizen, fallout on the zone alone', () => {
    const N = 2000;
    for (let sev = 0; sev < 3; sev++) {
      const { state, city, izTile } = reactorBoard(40);
      city.buildings.push('WORKSHOP', 'FACTORY');
      let pillaged = 0;
      let factory = 0;
      let workshop = 0;
      let lost = 0;
      for (let i = 0; i < N; i++) {
        izTile.districtPillaged = false;
        izTile.falloutTurns = 0;
        city.pillagedBuildings = [];
        city.population = 12;
        nuclearAccident(state, 0, city, sev);
        expect(izTile.falloutTurns).toBe(ACCIDENT_FALLOUT[sev]);
        expect(city.population === 12 || city.population === 11).toBe(true);
        expect(city.pillagedBuildings).toContain('NUCLEAR_POWER_PLANT');
        if (izTile.districtPillaged) pillaged++;
        if (city.pillagedBuildings.includes('FACTORY')) factory++;
        if (city.pillagedBuildings.includes('WORKSHOP')) workshop++;
        if (city.population === 11) lost++;
      }
      expect(state.map.tiles.filter((t) => (t.falloutTurns ?? 0) > 0)).toEqual([izTile]);
      expect(city.buildings).toContain('NUCLEAR_POWER_PLANT');
      expect(Math.abs(pillaged / N - [0, 0.5, 1][sev])).toBeLessThan(0.04);
      // BUILDING_PILLAGED 20 / 100 / none takes the Factory, the district row
      // the Workshop with the rest
      expect(Math.abs(factory / N - [0.2, 1, 1][sev])).toBeLessThan(0.04);
      expect(Math.abs(workshop / N - [0, 0.5, 1][sev])).toBeLessThan(0.04);
      expect(Math.abs(lost / N - [0, 0, 0.8][sev])).toBeLessThan(0.04);
    }
  });

  it('strikes the units on the reactor\'s plot alone: land 0 / 50 / 100 in the 20-50 band, civilians 0 / 50 / 100', () => {
    const N = 1500;
    for (let sev = 0; sev < 3; sev++) {
      const { state, city, izTile } = reactorBoard(40);
      state.unitsMode = true;
      let struck = 0;
      let killed = 0;
      const band = new Set<number>();
      for (let i = 0; i < N; i++) {
        const w = spawnUnit(state, 'WARRIOR', izTile.index, 0)!;
        const b = spawnUnit(state, 'BUILDER', izTile.index, 0)!;
        const g = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
        expect([w.tileIndex, b.tileIndex, g.tileIndex]).toEqual([izTile.index, izTile.index, city.centerIndex]);
        nuclearAccident(state, 0, city, sev);
        const hp = state.units.find((x) => x.id === w.id)!.hp;
        if (hp < 100) {
          struck += 1;
          band.add(100 - hp);
        }
        if (!state.units.some((x) => x.id === b.id)) killed += 1;
        // the garrison off the reactor's plot is never touched
        expect(state.units.find((x) => x.id === g.id)!.hp).toBe(100);
        state.units = state.units.filter((x) => x.id !== w.id && x.id !== b.id && x.id !== g.id);
      }
      expect(Math.abs(struck / N - ACCIDENT_LAND_P[sev])).toBeLessThan(0.04);
      expect(Math.abs(killed / N - ACCIDENT_CIV_KILL_P[sev])).toBeLessThan(0.04);
      // 20 + rand(30): MaxHP exclusive
      for (const d of band) expect(d >= 20 && d < 50).toBe(true);
      if (sev > 0) expect(band.size).toBeGreaterThan(20);
      expect(city.buildings).toContain('NUCLEAR_POWER_PLANT');
      expect(city.pillagedBuildings).toContain('NUCLEAR_POWER_PLANT');
    }
    expect([...ACCIDENT_LAND_P, ...ACCIDENT_CIV_KILL_P]).toEqual([0, 0.5, 1, 0, 0.5, 1]);
  });

  it('Reinforced Materials keeps the zone and its chain, never the plant', () => {
    for (let sev = 0; sev < 3; sev++) {
      const { state, city, izTile } = reactorBoard(40);
      city.buildings.push('WORKSHOP', 'FACTORY');
      const g = governorsOf(seatOf(state, 0)!)[GOVERNOR_INDEX.LIANG];
      g.appointed = true;
      g.cityId = city.id;
      g.establishTurns = 0;
      g.promotions = promotionBitValue(GOVERNOR_PROMOTION_INDEX.REINFORCED_MATERIALS!);
      for (let i = 0; i < 200; i++) {
        city.pillagedBuildings = [];
        nuclearAccident(state, 0, city, sev);
        expect(city.pillagedBuildings).toEqual(['NUCLEAR_POWER_PLANT']);
        expect(izTile.districtPillaged).toBeFalsy();
      }
    }
  });

  it('draws once per damage row, and once more for a land unit struck', () => {
    expect(ACCIDENT_ROWS.map((r) => r.length)).toEqual([3, 8, 9]);
    /** the draws `fn` spends: each draw adds one fixed step to the state */
    const draws = (state: GameState, fn: () => void): number => {
      const probe = { rngState: state.rngState } as GameState;
      fn();
      for (let n = 0; n < 32; n++) {
        if (probe.rngState === state.rngState) return n;
        nextRandom(probe);
      }
      throw new Error('more than 32 draws');
    };
    for (let sev = 0; sev < 3; sev++) {
      const { state, city } = reactorBoard(40);
      for (let i = 0; i < 50; i++) expect(draws(state, () => nuclearAccident(state, 0, city, sev))).toBe([3, 8, 9][sev]);
    }
    // CATASTROPHIC strikes every land unit: one more draw, a civilian alone none
    const { state, city, izTile } = reactorBoard(40);
    state.unitsMode = true;
    const b = spawnUnit(state, 'BUILDER', izTile.index, 0)!;
    expect(draws(state, () => nuclearAccident(state, 0, city, 2))).toBe(9);
    expect(state.units.some((x) => x.id === b.id)).toBe(false);
    for (let i = 0; i < 50; i++) {
      const w = spawnUnit(state, 'WARRIOR', izTile.index, 0)!;
      expect(draws(state, () => nuclearAccident(state, 0, city, 2))).toBe(10);
      state.units = state.units.filter((x) => x.id !== w.id);
    }
    // MAJOR's land row at 50: 9 draws exactly when the warrior was struck
    let struck = 0;
    for (let i = 0; i < 200; i++) {
      const w = spawnUnit(state, 'WARRIOR', izTile.index, 0)!;
      const n = draws(state, () => nuclearAccident(state, 0, city, 1));
      const hit = state.units.find((x) => x.id === w.id)!.hp < 100;
      expect(n).toBe(hit ? 9 : 8);
      if (hit) struck++;
      state.units = state.units.filter((x) => x.id !== w.id);
    }
    expect(struck).toBeGreaterThan(60);
    expect(struck).toBeLessThan(140);
  });

  it('a reactor is a site only past each severity\'s MinTurnAtRisk', () => {
    const sevOf = (state: GameState) =>
      state.eventLog.filter((e) => e.startsWith('Nuclear accident')).map((e) => Number(e.slice(-2, -1)));
    for (const [age, want] of [[9, []], [10, [0]], [25, [0, 1]], [30, [0, 1, 2]]] as const) {
      const { state } = reactorBoard(age);
      const seen = new Set<number>();
      for (let i = 0; i < 4000; i++) {
        state.eventLog = [];
        disasterPhase(state);
        for (const s of sevOf(state)) seen.add(s);
      }
      expect([...seen].sort()).toEqual([...want]);
    }
  });
});

describe('the random events wait for their first turn', () => {
  it('turn 1 draws nothing and fires nothing; the start turn draws', () => {
    // CIV6 (RANDOM_EVENT_START_TURN 2): a Grassland board, every turn a
    // tornado or drought site
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    expect(RANDOM_EVENT_START_TURN).toBe(2);
    state.turn = 1;
    const s0 = state.rngState;
    for (let i = 0; i < 50; i++) disasterPhase(state);
    expect(state.rngState).toBe(s0);
    expect(state.eventLog).toHaveLength(0);
    state.turn = RANDOM_EVENT_START_TURN;
    disasterPhase(state);
    expect(state.rngState).not.toBe(s0);
  });
});

describe('the eruption\'s damage rows', () => {
  /** a volcano on a Grassland board, its ring plots owned by a city whose
   *  centre stands on the ring's first plot */
  const ringBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.unitsMode = true;
    const v = tileAtCoords(state.map, 8, 8);
    v.elevation = 'MOUNTAIN';
    v.volcano = true;
    const ring = neighbors(state.map, v);
    const city = settleAt(state, ring[0].index);
    const reset = () => {
      for (const t of ring.slice(1)) {
        t.feature = null;
        t.improvement = 'FARM';
        t.pillaged = false;
        setTileOwner(t, 0);
        t.ownerCity = city.id;
      }
      city.hp = 200;
      city.population = 10;
    };
    return { state, v, ring, city, reset };
  };

  it('CATASTROPHIC destroys and pillages at 75, bands the land units and the centre, kills and costs citizens at 20', () => {
    const { state, v, ring, city, reset } = ringBoard();
    const N = 600;
    let farms = 0;
    let destroyed = 0;
    let civilians = 0;
    let killed = 0;
    let rolls = 0;
    let lost = 0;
    const bands = new Set<number>();
    const centre = new Set<number>();
    for (let i = 0; i < N; i++) {
      reset();
      const w = spawnUnit(state, 'WARRIOR', ring[1].index, 0)!;
      const b = spawnUnit(state, 'BUILDER', ring[2].index, 0)!;
      erupt(state, [v], volcanoRow(1));
      for (const t of ring.slice(1)) {
        farms += 1;
        if (t.improvement === null) destroyed += 1;
        else expect(t.pillaged).toBe(true);
      }
      const wu = state.units.find((x) => x.id === w.id);
      bands.add(wu ? 100 - wu.hp : 100);
      civilians += 1;
      if (!state.units.some((x) => x.id === b.id)) killed += 1;
      centre.add(200 - city.hp);
      // one POPULATION_LOSS roll per ring plot the city owns, its centre's too
      rolls += ring.length;
      lost += 10 - city.population;
      state.units = state.units.filter((x) => x.id !== w.id && x.id !== b.id);
    }
    expect(Math.abs(destroyed / farms - 0.75)).toBeLessThan(0.04);
    for (const d of bands) expect(d >= 40 && d <= 60).toBe(true);
    for (const d of centre) expect(d >= 40 && d <= 60).toBe(true);
    expect(bands.size).toBeGreaterThan(5);
    expect(Math.abs(killed / civilians - 0.2)).toBeLessThan(0.05);
    expect(Math.abs(lost / rolls - 0.2)).toBeLessThan(0.04);
  });

  it('GENTLE pillages the ring and takes nothing else', () => {
    const { state, v, ring, city, reset } = ringBoard();
    for (const row of [volcanoRow(0), ERUPTION_ROWS.indexOf('KILIMANJARO_GENTLE')]) {
      for (let i = 0; i < 100; i++) {
        reset();
        const w = spawnUnit(state, 'WARRIOR', ring[1].index, 0)!;
        const b = spawnUnit(state, 'BUILDER', ring[2].index, 0)!;
        erupt(state, [v], row);
        for (const t of ring.slice(1)) {
          expect(t.improvement).toBe('FARM');
          expect(t.pillaged).toBe(true);
        }
        expect(state.units.find((x) => x.id === w.id)?.hp).toBe(100);
        expect(state.units.some((x) => x.id === b.id)).toBe(true);
        expect(city.hp).toBe(200);
        expect(city.population).toBe(10);
        state.units = state.units.filter((x) => x.id !== w.id && x.id !== b.id);
      }
    }
  });

  it('Kilimanjaro\'s CATASTROPHIC row destroys at 80; no row touches a hull', () => {
    const { state, v, ring, reset } = ringBoard();
    const sea = ring[3];
    let farms = 0;
    let destroyed = 0;
    for (let i = 0; i < 500; i++) {
      reset();
      sea.terrain = 'COAST';
      sea.improvement = null;
      const g = spawnUnit(state, 'GALLEY', sea.index, 0)!;
      erupt(state, [v], ERUPTION_ROWS.indexOf('KILIMANJARO_CATASTROPHIC'));
      for (const t of ring.slice(1)) {
        if (t === sea) continue;
        farms += 1;
        if (t.improvement === null) destroyed += 1;
      }
      expect(state.units.find((x) => x.id === g.id)?.hp).toBe(100);
      state.units = state.units.filter((x) => x.id !== g.id);
    }
    expect(Math.abs(destroyed / farms - 0.8)).toBeLessThan(0.04);
  });
});

describe('the eruption on owned and unowned ground', () => {
  /** an active volcano on a Grassland board, no city near */
  const openBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.unitsMode = true;
    const v = tileAtCoords(state.map, 8, 8);
    v.elevation = 'MOUNTAIN';
    v.volcano = true;
    v.volcanoActive = true;
    return { state, v, ring: neighbors(state.map, v) };
  };

  it('damages improvements on OWNED plots only, units on any; takes every bonus resource on the ring whoever owns it', () => {
    // the owner gate belongs to the damage TYPE (the applier 0x336a50):
    // IMPROVEMENT_* refuse an unowned plot, UNIT_DAMAGE_LAND and
    // UNIT_KILLED_CIVILIAN do not
    const { state, v, ring } = openBoard();
    const [ownedFarm, openFarm, ownedWheat, openWheat, iron, openUnit] = ring;
    let civKilled = 0;
    for (let i = 0; i < 300; i++) {
      for (const t of ring) {
        t.feature = null;
        t.improvement = null;
        t.pillaged = false;
        t.resource = null;
        setTileOwner(t, NO_SEAT);
      }
      for (const t of [ownedFarm, ownedWheat, iron]) setTileOwner(t, 0);
      for (const t of [ownedFarm, openFarm]) t.improvement = 'FARM';
      ownedWheat.resource = 'WHEAT';
      openWheat.resource = 'STONE';
      iron.resource = 'IRON';
      const w = spawnUnit(state, 'WARRIOR', openUnit.index, 0)!;
      const b = spawnUnit(state, 'BUILDER', openUnit.index, 0)!;
      erupt(state, [v], volcanoRow(2));
      expect(openFarm.improvement).toBe('FARM');
      expect(openFarm.pillaged).toBe(false);
      expect(ownedFarm.improvement === null || ownedFarm.pillaged).toBe(true);
      expect(ownedWheat.resource).toBeNull();
      expect(openWheat.resource).toBeNull();
      expect(iron.resource).toBe('IRON');
      expect(state.units.find((x) => x.id === w.id)?.hp ?? 0).toBeLessThan(100);
      if (!state.units.some((x) => x.id === b.id)) civKilled += 1;
      state.units = state.units.filter((x) => x.id !== w.id && x.id !== b.id);
    }
    expect(ERUPTION_CIV_KILL_P[volcanoRow(2)]).toBeGreaterThan(0);
    expect(civKilled).toBeGreaterThan(0);
  });

  it('draws once per land unit on the plot: a second unit moves the stream by one', () => {
    // GameCore_XP2_Release.dll 0x3366a0: ONE "Random Event Unit Damage Roll"
    // per unit of the row's domain on the plot
    const run = (units: string[]) => {
      const { state, v, ring } = openBoard();
      for (const t of ring) setTileOwner(t, 0);
      state.rngState = 7;
      for (const u of units) spawnUnit(state, u, ring[0].index, 0);
      erupt(state, [v], volcanoRow(2));
      return state.rngState;
    };
    const none = run([]);
    const probe = { rngState: none } as GameState;
    nextRandom(probe);
    expect(run(['WARRIOR'])).toBe(probe.rngState);
    nextRandom(probe);
    expect(run(['WARRIOR', 'BATTERING_RAM'])).toBe(probe.rngState);
    // a civilian draws no damage
    expect(run(['BUILDER'])).toBe(none);
  });

  it('each Yields row paints and adds +1 of its own yield at its chance; an unpainted plot gains none', () => {
    const { state, v, ring } = openBoard();
    const row = ERUPTION_ROWS.indexOf('VESUVIUS_MEGACOLOSSAL');
    expect([ERUPTION_PROD_P[row], ERUPTION_SCI_P[row], ERUPTION_CUL_P[row]]).toEqual([0.25, 0.25, 0.5]);
    let painted = 0;
    const got = { fertilityProd: 0, fertilitySci: 0, fertilityCul: 0 };
    for (let i = 0; i < 1000; i++) {
      for (const t of ring) {
        t.feature = null;
        t.fertilityProd = 0;
        t.fertilitySci = 0;
        t.fertilityCul = 0;
      }
      erupt(state, [v], row);
      for (const t of ring) {
        if (t.feature !== 'VOLCANIC_SOIL') {
          expect([t.fertilityProd, t.fertilitySci, t.fertilityCul]).toEqual([0, 0, 0]);
          continue;
        }
        painted += 1;
        for (const k of Object.keys(got) as (keyof typeof got)[]) got[k] += t[k] ?? 0;
      }
    }
    // per plot: each row lands at its own chance, whatever the others did
    const plotsSeen = 1000 * ring.length;
    expect(Math.abs(got.fertilityProd / plotsSeen - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(got.fertilitySci / plotsSeen - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(got.fertilityCul / plotsSeen - 0.5)).toBeLessThan(0.04);
    // a plot is painted when any of its four rows lands
    expect(Math.abs(painted / plotsSeen - (1 - 0.75 * 0.75 * 0.75 * 0.5))).toBeLessThan(0.03);
    // the silt pays through the plot's yields
    const t = ring[0];
    t.fertilitySci = 2;
    t.fertilityCul = 1;
    const y = tileYields(bareCtx(state.map), t);
    t.fertilitySci = 0;
    t.fertilityCul = 0;
    const y0 = tileYields(bareCtx(state.map), t);
    expect([y.science - y0.science, y.culture - y0.culture]).toEqual([2, 1]);
  });

  it('a GENTLE eruption paints no Science', () => {
    const { state, v, ring } = openBoard();
    for (let i = 0; i < 300; i++) {
      for (const t of ring) t.feature = null;
      erupt(state, [v], volcanoRow(0));
    }
    expect(ring.some((t) => (t.fertilityProd ?? 0) > 0)).toBe(true);
    expect(ring.every((t) => (t.fertilitySci ?? 0) === 0 && (t.fertilityCul ?? 0) === 0)).toBe(true);
  });
});

describe('the drought\'s rules', () => {
  /** a Grassland board: the drought's centre and its ring, farmed and owned
   *  by a city standing two plots off */
  const dryBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.unitsMode = true;
    const c = tileAtCoords(state.map, 8, 8);
    const plots = [c, ...neighbors(state.map, c)];
    const city = settleAt(state, tileAtCoords(state.map, 8, 11).index);
    for (const t of plots) {
      t.improvement = 'FARM';
      setTileOwner(t, 0);
      t.ownerCity = city.id;
    }
    return { state, c, plots, city };
  };

  it('dry ground is featureless Plains or Grassland; a district counts as featureless', () => {
    const t = { terrain: 'GRASSLAND', elevation: 'FLAT', feature: null as string | null, submerged: false };
    expect(droughtGround(t, false)).toBe(true);
    expect(droughtGround({ ...t, elevation: 'HILLS' }, false)).toBe(true);
    for (const f of ['WOODS', 'RAINFOREST', 'MARSH', 'FLOODPLAINS', 'VOLCANIC_SOIL']) {
      expect(droughtGround({ ...t, feature: f }, false)).toBe(false);
      expect(droughtGround({ ...t, feature: f }, true)).toBe(true);
    }
    expect(droughtGround({ ...t, terrain: 'DESERT' }, false)).toBe(false);
    expect(droughtGround({ ...t, elevation: 'MOUNTAIN' }, false)).toBe(false);
    expect(droughtGround({ ...t, submerged: true }, false)).toBe(false);
  });

  it('starts on a plot whose six neighbours are all dry ground, never on the map\'s edge', () => {
    const state = makeState(makeMap(12, 12));
    const map = state.map;
    const none = new Set<number>();
    const c = tileAtCoords(map, 5, 5);
    const ring = neighbors(map, c);
    expect(droughtCandidate(map, c, none, none)).toBe(true);
    expect(droughtCandidate(map, tileAtCoords(map, 0, 5), none, none)).toBe(false);
    ring[2].feature = 'WOODS';
    expect(droughtCandidate(map, c, none, none)).toBe(false);
    // a district's plot counts as featureless, whatever lies under it
    ring[2].feature = 'FLOODPLAINS';
    ring[2].district = 'CAMPUS';
    expect(droughtCandidate(map, c, none, none)).toBe(true);
    // and so does a live city centre's
    ring[2].district = null;
    expect(droughtCandidate(map, c, new Set([ring[2].index]), none)).toBe(true);
    ring[2].feature = null;
    ring[4].terrain = 'DESERT';
    expect(droughtCandidate(map, c, none, none)).toBe(false);
    ring[4].terrain = 'PLAINS';
    ring[4].elevation = 'HILLS';
    expect(droughtCandidate(map, c, none, none)).toBe(true);
    // a river on any of the seven plots, a live event on one, a Coast beside one
    ring[1].riverMask = 1;
    expect(droughtCandidate(map, c, none, none)).toBe(false);
    ring[1].riverMask = 0;
    expect(droughtCandidate(map, c, none, new Set([ring[3].index]))).toBe(false);
    const beyond = neighbors(map, ring[0]).find((t) => t !== c && !ring.includes(t))!;
    beyond.terrain = 'COAST';
    expect(droughtCandidate(map, c, none, none)).toBe(false);
    beyond.terrain = 'LAKE';
    expect(droughtCandidate(map, c, none, none)).toBe(true);
    c.feature = 'MARSH';
    expect(droughtCandidate(map, c, none, none)).toBe(false);
  });

  it('pillages its listed improvements, and EXTREME takes 30 of them away; a Mine stands', () => {
    const { state, c, plots } = dryBoard();
    const mine = plots[1];
    for (const sev of [0, 1]) {
      let farms = 0;
      let gone = 0;
      for (let i = 0; i < 300; i++) {
        for (const t of plots) {
          t.improvement = t === mine ? 'MINE' : 'FARM';
          t.pillaged = false;
          t.droughtTurns = 0;
        }
        drought(state, c, sev, false);
        for (const t of plots) {
          expect(t.droughtTurns).toBe(DROUGHT_TURNS[sev]);
          if (t === mine) {
            expect(t.improvement).toBe('MINE');
            expect(t.pillaged).toBe(false);
            continue;
          }
          farms += 1;
          if (t.improvement === null) gone += 1;
          else expect(t.pillaged).toBe(true);
        }
      }
      expect(Math.abs(gone / farms - [0, 0.3][sev])).toBeLessThan(0.04);
    }
  });

  it('bars building and repairing its improvements until it ends', () => {
    const { state, c } = dryBoard();
    const opts = { unlocks: null, ownsTile: () => true, map: state.map };
    c.improvement = null;
    expect(validImprovementsIn(c, opts)).toContain('FARM');
    c.droughtTurns = 3;
    expect(validImprovementsIn(c, opts)).not.toContain('FARM');
    c.improvement = 'FARM';
    c.pillaged = true;
    const b = spawnUnit(state, 'BUILDER', c.index, 0)!;
    orderUnit(state, b, 'REPAIR');
    expect(c.pillaged).toBe(true);
    c.droughtTurns = 0;
    orderUnit(state, b, 'REPAIR');
    expect(c.pillaged).toBe(false);
  });

  it('a city with an Aqueduct, a Dam or a Stepwell keeps its food; a pillaged one does not', () => {
    const { state, c, city } = dryBoard();
    c.improvement = null;
    c.pillaged = false;
    const food = () => tileYields(bareCtx(state.map), c).food;
    const wet = food();
    c.droughtTurns = 3;
    expect(food()).toBe(wet - 1);
    // the Aqueduct beside the centre, complete
    const aq = neighbors(state.map, state.map.tiles[city.centerIndex])[0];
    aq.improvement = null;
    aq.district = 'AQUEDUCT';
    aq.districtComplete = true;
    setTileOwner(aq, 0);
    aq.ownerCity = city.id;
    expect(food()).toBe(wet);
    aq.districtPillaged = true;
    expect(food()).toBe(wet - 1);
    aq.district = null;
    aq.districtComplete = false;
    aq.districtPillaged = false;
    // the Stepwell on any plot the city owns
    aq.improvement = 'STEPWELL';
    expect(food()).toBe(wet);
    // another city's Stepwell is no shield
    aq.ownerCity = city.id + 1;
    expect(food()).toBe(wet - 1);
  });
});

describe('a Free City\'s district buildings', () => {
  it('an eruption pillages them as it pillages a major\'s', () => {
    const state = makeState(makeMap(18, 18));
    const v = tileAtCoords(state.map, 8, 8);
    v.elevation = 'MOUNTAIN';
    v.volcano = true;
    const ring = neighbors(state.map, v);
    const city = settleAt(state, ring[0].index);
    const site = ring[1];
    site.district = 'HOLY_SITE';
    site.districtComplete = true;
    setTileOwner(site, 0);
    site.ownerCity = city.id;
    city.districts.push({ type: 'HOLY_SITE', tileIndex: site.index });
    city.buildings.push('SHRINE');
    transferCity(state, 0, freeSeatOf(state), city, 'revolted');
    const free = state.freeSeat!.cities[0];
    erupt(state, [v], volcanoRow(0));
    expect(free.pillagedBuildings).toEqual(['SHRINE']);
  });
});

describe('a Free City\'s reactor', () => {
  it('keeps its clock through the flip, ages on, and is an accident site', () => {
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const centre = tileAtCoords(state.map, 9, 9);
    const izTile = neighborTile(state.map, centre, 0)!;
    for (const t of [centre, izTile]) t.terrain = 'DESERT';
    const city = settleAt(state, centre.index);
    izTile.district = 'INDUSTRIAL_ZONE';
    izTile.districtComplete = true;
    setTileOwner(izTile, 0);
    izTile.ownerCity = city.id;
    city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: izTile.index });
    city.buildings.push('NUCLEAR_POWER_PLANT');
    city.reactorAge = 25;
    transferCity(state, 0, freeSeatOf(state), city, 'revolted');
    const free = state.freeSeat!.cities[0];
    expect(free.seat).toBe(FREE_SEAT);
    expect(free.reactorAge).toBe(25);
    freeCitiesPhase(state);
    expect(free.reactorAge).toBe(26);
    ageReactors([free]);
    expect(free.reactorAge).toBe(27);
    // past MAJOR's 20, before CATASTROPHIC's 30: rows MINOR and MAJOR fire
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      state.eventLog = [];
      disasterPhase(state);
      for (const e of state.eventLog.filter((x) => x.startsWith('Nuclear accident'))) {
        seen.add(Number(e.slice(-2, -1)));
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });
});
