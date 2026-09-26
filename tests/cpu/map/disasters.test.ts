import { describe, it, expect } from 'vitest';
import { setTileOwner, freeSeatOf, FREE_SEAT } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, bareCtx, orderUnit } from '../helpers';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { disasterPhase, riverReach, FERTILITY_CAP, nuclearAccident, floodSites, erupt, drought, ageReactors } from '../../../cpu/core/disasters';
import { ACCIDENT_FALLOUT, RANDOM_EVENT_START_TURN, volcanoRow, ERUPTION_ROWS, droughtCandidate, DROUGHT_DURATION } from '../../../cpu/data/disasters';
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
  const live = () => state.map.tiles.some((t) => (t.stormTurns ?? 0) > 0);
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

    // fertility is capped
    slope.fertility = FERTILITY_CAP;
    const before = slope.fertility;
    for (let i = 0; i < 1500; i++) disasterPhase(state);
    expect(slope.fertility).toBe(before);
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

describe('the turn\'s one random event', () => {
  /** a sea holding two volcanoes (their rings water, so no storm starts
   *  there), one river of two Grassland floodplains plus a lone one, and one
   *  bare Grassland plot — the only featureless one, the drought's start */
  const eventBoard = () => {
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    tileAtCoords(state.map, 14, 14).terrain = 'GRASSLAND';
    for (const [c, r] of [[4, 4], [12, 12]]) {
      const v = tileAtCoords(state.map, c, r);
      v.terrain = 'GRASSLAND';
      v.elevation = 'MOUNTAIN';
      v.volcano = true;
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
    return { state, a, b, lone };
  };

  it('a river is one flood site, a riverless floodplain another', () => {
    const { state, a, lone } = eventBoard();
    expect(floodSites(state.map).map((t) => t.index)).toEqual([a.index, lone.index].sort((x, y) => x - y));
  });

  it('fires at most one event a turn, each row weighted once per site', () => {
    // sites: 2 flood sites x 4.5, 2 volcanoes x 8, and the Grassland's one
    // tornado pair (15 + 3), the bare plot's drought pair (23 + 5) and its
    // Meteor Shower (6 — nobody owns it): 9 + 16 + 18 + 28 + 6 = 77
    const { state } = eventBoard();
    const bare = tileAtCoords(state.map, 14, 14);
    const N = 6000;
    let floods = 0;
    let eruptions = 0;
    let droughts = 0;
    let meteors = 0;
    for (let i = 0; i < N; i++) {
      bare.meteor = false;
      state.eventLog = [];
      disasterPhase(state);
      expect(state.eventLog.length).toBeLessThanOrEqual(1);
      if (state.eventLog.some((e) => e.startsWith('Flood'))) floods++;
      if (state.eventLog.some((e) => e.includes('eruption'))) eruptions++;
      if (state.eventLog.some((e) => e.startsWith('Drought'))) droughts++;
      if (state.eventLog.some((e) => e.startsWith('Meteor'))) meteors++;
    }
    expect(Math.abs(floods / N - 9 / 77)).toBeLessThan(0.02);
    expect(Math.abs(eruptions / N - 16 / 77)).toBeLessThan(0.02);
    expect(Math.abs(droughts / N - 28 / 77)).toBeLessThan(0.02);
    expect(Math.abs(meteors / N - 6 / 77)).toBeLessThan(0.015);
  });

  it('Kilimanjaro erupts on its own two rows, 4 + 2.5, painting its ring at 50%', () => {
    // the board above plus one Mount Kilimanjaro ringed by bare Grassland (the
    // tornado, drought and meteor sites already stand): 77 + 6.5 = 83.5
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
      for (const t of state.map.tiles) t.meteor = false;
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
    expect(Math.abs(kili / N - 6.5 / 83.5)).toBeLessThan(0.015);
    expect(Math.abs((eruptions - kili) / N - 16 / 83.5)).toBeLessThan(0.02);
    expect(Math.abs(painted / plots - 0.5)).toBeLessThan(0.04);
    expect(k.feature).toBe('MOUNT_KILIMANJARO');
  });

  it('a drought is seven plots for 5 or 10 turns', () => {
    const { state } = eventBoard();
    const lengths = new Set<number>();
    for (let i = 0; i < 400; i++) {
      for (const t of state.map.tiles) t.droughtTurns = 0;
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.startsWith('Drought'))) continue;
      const dry = state.map.tiles.filter((t) => t.droughtTurns > 0);
      // the footprint is the centre and its ring, water skipped
      expect(dry.length).toBeGreaterThan(0);
      expect(dry.length).toBeLessThanOrEqual(7);
      for (const t of dry) lengths.add(t.droughtTurns);
    }
    expect([...lengths].sort((x, y) => x - y)).toEqual([5, 10]);
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

  it('its payloads are per-accident chances: the zone, one citizen, fallout on the zone alone', () => {
    const N = 2000;
    for (let sev = 0; sev < 3; sev++) {
      const { state, city, izTile } = reactorBoard(40);
      let pillaged = 0;
      let lost = 0;
      for (let i = 0; i < N; i++) {
        izTile.districtPillaged = false;
        izTile.falloutTurns = 0;
        city.population = 12;
        nuclearAccident(state, 0, city, sev);
        expect(izTile.falloutTurns).toBe(ACCIDENT_FALLOUT[sev]);
        expect(city.population === 12 || city.population === 11).toBe(true);
        if (izTile.districtPillaged) pillaged++;
        if (city.population === 11) lost++;
      }
      expect(state.map.tiles.filter((t) => (t.falloutTurns ?? 0) > 0)).toEqual([izTile]);
      expect(city.buildings).toContain('NUCLEAR_POWER_PLANT');
      expect(Math.abs(pillaged / N - [0, 0.5, 1][sev])).toBeLessThan(0.04);
      expect(Math.abs(lost / N - [0, 0, 0.8][sev])).toBeLessThan(0.04);
    }
  });

  it('a reactor is a site only past each severity\'s MinTurnAtRisk', () => {
    const sevOf = (state: GameState) =>
      state.eventLog.filter((e) => e.startsWith('Nuclear accident')).map((e) => Number(e.slice(-2, -1)));
    for (const [age, want] of [[9, []], [10, [0]], [25, [0, 1]], [30, [0, 1, 2]]] as const) {
      const { state } = reactorBoard(age);
      const seen = new Set<number>();
      for (let i = 0; i < 1500; i++) {
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

  it('starts only on featureless Plains or Grassland', () => {
    const t = { terrain: 'GRASSLAND', elevation: 'FLAT', feature: null as string | null, submerged: false };
    expect(droughtCandidate(t)).toBe(true);
    expect(droughtCandidate({ ...t, elevation: 'HILLS' })).toBe(true);
    for (const f of ['WOODS', 'RAINFOREST', 'MARSH', 'FLOODPLAINS', 'VOLCANIC_SOIL']) {
      expect(droughtCandidate({ ...t, feature: f })).toBe(false);
    }
    expect(droughtCandidate({ ...t, terrain: 'DESERT' })).toBe(false);
    expect(droughtCandidate({ ...t, elevation: 'MOUNTAIN' })).toBe(false);
    expect(droughtCandidate({ ...t, submerged: true })).toBe(false);
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
          expect(t.droughtTurns).toBe(DROUGHT_DURATION[sev]);
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
    for (let i = 0; i < 1500; i++) {
      state.eventLog = [];
      disasterPhase(state);
      for (const e of state.eventLog.filter((x) => x.startsWith('Nuclear accident'))) {
        seen.add(Number(e.slice(-2, -1)));
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });
});
