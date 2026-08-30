import { describe, it, expect } from 'vitest';
import type { GameState, Seat } from '../../../cpu/core/types';
import { seatOf, tileBelongsTo } from '../../../cpu/core/seats';
import { createGame, endTurn, availableProjects, projectCost, districtCost } from '../../../cpu/core/game';
import { canPlaceDistrict } from '../../../cpu/core/rules';
import { queueSeatProject } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { PROJECTS, SPACE_PROJECTS, SPACE_FLIGHT_LY, isSpaceProject } from '../../../cpu/data/projects';
import { cityPower, laserSpeed } from '../../../cpu/core/yields';
import { resolveSeatPower } from '../../../cpu/core/stockpile';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';

// space race / science victory. Gated on Information/Future techs, so no gate
// lane reaches it and these pokes are the only proof of the semantics. The GPU
// twin is tests/gpu/space_race_test.py.

function newGame(opponents = 0) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return { state, city: seatOf(state, 0)!.cities[0] };
}

function newGameWithSpaceport(opponents = 0) {
  const g = newGame(opponents);
  // Give the city a completed Spaceport — the district every space row runs in.
  const dtile = g.city.centerIndex + 1;
  g.city.districts.push({ type: 'SPACEPORT', tileIndex: dtile });
  g.state.map.tiles[dtile].districtComplete = true;
  return g;
}

const CHAIN = SPACE_PROJECTS.map((p) => p.id);
const GATING_TECHS = ['ROCKETRY', 'SATELLITES', 'NANOTECHNOLOGY', 'SMART_MATERIALS'];

const completeThroughQueue = (state: GameState, city: { queue: unknown[] }, id: string) => {
  // Drive completion through the real endTurn queue path (progress pre-filled).
  city.queue = [{ kind: 'project', project: id, progress: 100000, cost: 1 }];
  endTurn(state);
};

describe('science victory', () => {
  it('space projects are catalog-complete, Spaceport-hosted, and end in a victory step', () => {
    expect(CHAIN.length).toBe(4);
    expect(CHAIN[CHAIN.length - 1]).toBe('EXOPLANET_EXPEDITION');
    expect(SPACE_PROJECTS[SPACE_PROJECTS.length - 1].victory).toBe(true);
    for (const p of SPACE_PROJECTS) expect(p.district).toBe('SPACEPORT');
  });

  it('carries the REAL fixed prices (GS x 0.6 game speed)', () => {
    const { state } = newGameWithSpaceport();
    // 900 / 1500 / 1800 / 2100, speed-scaled; the laser stations 600.
    expect(CHAIN.map((id) => projectCost(state, 0, id))).toEqual([540, 900, 1080, 1260]);
    expect(projectCost(state, 0, 'TERRESTRIAL_LASER_STATION')).toBe(360);
    expect(projectCost(state, 0, 'LAGRANGE_LASER_STATION')).toBe(360);
    // base projects keep the generic curve
    expect(projectCost(state, 0, 'RESEARCH_GRANTS')).toBe(projectCost(state, 0));
  });

  it('the SPACEPORT: flat 1080 whatever the research, and flat land only', () => {
    const { state, city } = newGame(); // no pre-built Spaceport — a city takes ONE
    expect(districtCost(state, 0, 'SPACEPORT')).toBe(1080);
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    expect(districtCost(state, 0, 'SPACEPORT')).toBe(1080); // never scales
    // sanitize one OWNED plot to known-good land, then flip ONLY the
    // elevation: the flat-land clause is the single term under test.
    const spare = state.map.tiles.find((t) => t.index !== city.centerIndex && tileBelongsTo(t, city))!;
    expect(spare).toBeDefined();
    Object.assign(spare, { terrain: 'GRASSLAND', elevation: 'FLAT', feature: null, resource: null, wonder: null, builtWonder: null, district: null });
    expect(canPlaceDistrict(state, city, 'SPACEPORT', spare.index).ok).toBe(true);
    spare.elevation = 'HILLS';
    expect(canPlaceDistrict(state, city, 'SPACEPORT', spare.index).ok).toBe(false);
  });

  it('gates each step on its tech AND the previous step (sequence); a laser needs the craft in flight, then repeats', () => {
    const { state, city } = newGameWithSpaceport();
    // No gating techs yet: no space project is available.
    expect(availableProjects(state, city).some((p) => isSpaceProject(p.id) || p.laser)).toBe(false);

    // All techs, but nothing completed: only step 1 (no requiresProject) is open.
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    let avail = availableProjects(state, city).filter((p) => isSpaceProject(p.id)).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_EARTH_SATELLITE']);

    // Complete step 1 by hand: step 2 opens, step 1 is now one-time-consumed.
    seatOf(state, 0)!.projectsDone = ['LAUNCH_EARTH_SATELLITE'];
    avail = availableProjects(state, city).filter((p) => isSpaceProject(p.id)).map((p) => p.id);
    expect(avail).toEqual(['LAUNCH_MOON_LANDING']);

    // Lasers: closed without Offworld Mission, and STILL closed with it while
    // the craft has not launched — both stations ask for the finished
    // Exoplanet Expedition. Once it is in the ledger they open and STAY open
    // however many are built (repeatable — never in the ledger themselves).
    expect(availableProjects(state, city).some((p) => p.laser)).toBe(false);
    seatOf(state, 0)!.research.techs.push('OFFWORLD_MISSION');
    expect(availableProjects(state, city).some((p) => p.laser)).toBe(false);
    seatOf(state, 0)!.projectsDone = [...CHAIN];
    // the Lagrange station charges 30 Aluminum, so only the terrestrial one is
    // open on an empty bank
    expect(availableProjects(state, city).filter((p) => p.laser).map((p) => p.id))
      .toEqual(['TERRESTRIAL_LASER_STATION']);
    seatOf(state, 0)!.stockpile = STRATEGIC_IDS.map(() => 99);
    expect(availableProjects(state, city).filter((p) => p.laser)).toHaveLength(2);
    city.laserStations = 3;
    seatOf(state, 0)!.orbitalLasers = 3;
    expect(availableProjects(state, city).filter((p) => p.laser)).toHaveLength(2);
  });

  it('the WIRE applier queues a space step at its fixed price — a recorded column must not be dropped', () => {
    const { state, city } = newGameWithSpaceport();
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    expect(queueSeatProject(state, city, 'LAUNCH_EARTH_SATELLITE')).toBe(true);
    expect(city.queue[0]).toMatchObject({ kind: 'project', project: 'LAUNCH_EARTH_SATELLITE', cost: 540 });
    // and the chain still gates it: step 2 is refused until step 1 is DONE.
    const later = newGameWithSpaceport();
    seatOf(later.state, 0)!.research.techs.push(...GATING_TECHS);
    expect(queueSeatProject(later.state, later.city, 'LAUNCH_MOON_LANDING')).toBe(false);
  });

  it('completing the chain LAUNCHES — the win is the ARRIVAL, 30 LY later', () => {
    // One live opponent, or a lone civ trivially satisfies another victory
    // condition the moment the game runs past the launch.
    const { state, city } = newGameWithSpaceport(1);
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    for (const id of CHAIN) {
      completeThroughQueue(state, city, id);
      expect(seatOf(state, 0)!.projectsDone).toContain(id);
    }
    // The launch endTurn already ticked the craft once: 1 of 30 LY flown.
    expect(SPACE_FLIGHT_LY).toBe(30);
    expect(seatOf(state, 0)!.spaceLy).toBe(1);
    expect(state.victoryType).toBe(0);
    expect(state.gameOver).toBe(false);
    for (let i = 0; i < 28; i++) endTurn(state);
    expect(seatOf(state, 0)!.spaceLy).toBe(29);
    expect(state.victoryType).toBe(0);
    endTurn(state);
    expect(state.victoryType).toBe(3);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('laser stations stack onto the craft speed — the terrestrial one only while its city is powered', () => {
    const { state, city } = newGameWithSpaceport();
    const s = seatOf(state, 0)!;
    s.research.techs.push('OFFWORLD_MISSION');
    s.projectsDone = [...CHAIN];
    completeThroughQueue(state, city, 'TERRESTRIAL_LASER_STATION');
    completeThroughQueue(state, city, 'LAGRANGE_LASER_STATION');
    expect(city.laserStations).toBe(1);
    expect(s.orbitalLasers).toBe(1);
    expect(s.projectsDone).toEqual(CHAIN); // lasers never enter the ledger

    // The city draws 5 Power for the terrestrial station and has no supply, so
    // only the orbital one speeds the craft.
    expect(cityPower(state, city).demand).toBe(5);
    expect(city.powered ?? false).toBe(false);
    expect(laserSpeed(state, 0)).toBe(1);
    s.spaceLy = 0;
    endTurn(state);
    expect(s.spaceLy).toBe(2); // 1 base + the orbital station

    // A Coal Power Plant on a complete Industrial Zone lights the city, and
    // the terrestrial station starts paying.
    const iz = city.centerIndex + 2;
    city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: iz });
    state.map.tiles[iz].districtComplete = true;
    city.buildings.push('COAL_POWER_PLANT');
    s.stockpile = STRATEGIC_IDS.map(() => 99); // the plant needs Coal to convert
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(true);
    expect(laserSpeed(state, 0)).toBe(2);
    s.spaceLy = 0;
    endTurn(state);
    expect(s.spaceLy).toBe(3);
  });

  it('Launch Earth Satellite reveals the whole map (fog worlds only)', () => {
    const { state, city } = newGameWithSpaceport();
    seatOf(state, 0)!.research.techs.push(...GATING_TECHS);
    state.fogOfWar = true;
    completeThroughQueue(state, city, 'LAUNCH_EARTH_SATELLITE');
    const ex = seatOf(state, 0)!.explored;
    expect(ex).toHaveLength(state.map.tiles.length);
    expect(ex.every((v) => v === 1)).toBe(true);
    // and with fog OFF the reveal is a no-op on both engines
    const off = newGameWithSpaceport();
    seatOf(off.state, 0)!.research.techs.push(...GATING_TECHS);
    off.state.fogOfWar = false;
    completeThroughQueue(off.state, off.city, 'LAUNCH_EARTH_SATELLITE');
    expect(seatOf(off.state, 0)!.explored.some((v) => v === 1)).toBe(false);
  });

  it('Moon Landing pays 10x science/turn as Culture, ONCE; Mars Colony pays nothing', () => {
    // Twin games from the same seed: one completes the step, one idles — the
    // difference is exactly the lump (the GPU poke measures the same way).
    const setup = () => {
      const g = newGameWithSpaceport();
      const s = seatOf(g.state, 0)!;
      s.research.techs.push(...GATING_TECHS);
      s.projectsDone = ['LAUNCH_EARTH_SATELLITE'];
      return g;
    };
    const base = setup();
    const twin = setup();
    const sciBefore = seatOf(base.state, 0)!.scienceTotal;
    twin.city.queue = [{ kind: 'project', project: 'LAUNCH_MOON_LANDING', progress: 100000, cost: 1 }];
    endTurn(base.state);
    endTurn(twin.state);
    const sciPerTurn = seatOf(base.state, 0)!.scienceTotal - sciBefore;
    const lump = seatOf(twin.state, 0)!.cultureTotal - seatOf(base.state, 0)!.cultureTotal;
    expect(lump).toBe(Math.round(10 * sciPerTurn));
    expect(lump).toBeGreaterThan(0);

    // Mars Colony: the twin's yields match the idle baseline exactly.
    const mBase = setup();
    const mTwin = setup();
    seatOf(mBase.state, 0)!.projectsDone.push('LAUNCH_MOON_LANDING');
    seatOf(mTwin.state, 0)!.projectsDone.push('LAUNCH_MOON_LANDING');
    mTwin.city.queue = [{ kind: 'project', project: 'LAUNCH_MARS_COLONY', progress: 100000, cost: 1 }];
    endTurn(mBase.state);
    endTurn(mTwin.state);
    const a = seatOf(mBase.state, 0)!;
    const b = seatOf(mTwin.state, 0)!;
    expect(b.cultureTotal).toBe(a.cultureTotal);
    expect(b.treasury).toBe(a.treasury);
    expect(b.faith).toBe(a.faith);
    expect(b.scienceTotal).toBe(a.scienceTotal);
    expect(b.spaceLy).toBe(-1); // Mars Colony launches nothing
  });

  it('a civ flying the race first wins the SAME way — only the victor differs', () => {
    const { state } = newGameWithSpaceport(1);
    const civ = state.seats[1] as Seat;
    const civCity = civ.cities[0];
    civCity.queue = [{ kind: 'project', project: 'EXOPLANET_EXPEDITION', progress: 100000, cost: 1 }];
    endTurn(state);
    expect(civ.spaceLy).toBe(1); // launched, first LY flown
    expect(state.victoryType).toBe(0);
    civ.spaceLy = SPACE_FLIGHT_LY - 1;
    endTurn(state);
    expect(state.victoryType).toBe(3);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it('a same-turn tie goes to the lowest seat, and an existing space victor is kept', () => {
    const { state } = newGameWithSpaceport(1);
    seatOf(state, 0)!.spaceLy = SPACE_FLIGHT_LY - 1;
    (state.seats[1] as Seat).spaceLy = SPACE_FLIGHT_LY - 1;
    endTurn(state);
    expect(state.victoryType).toBe(3);
    expect(state.victoryRow).toBe(0);

    const keep = newGameWithSpaceport(1);
    keep.state.victoryType = 3;
    keep.state.victoryRow = 1;
    seatOf(keep.state, 0)!.spaceLy = SPACE_FLIGHT_LY - 1;
    endTurn(keep.state);
    expect(keep.state.victoryRow).toBe(1);
  });

  it('EXOPLANET_EXPEDITION completes in the projects catalog only once', () => {
    // catalog hygiene: exactly one victory row, exactly two laser rows.
    const all = Object.values(PROJECTS);
    expect(all.filter((p) => p.victory)).toHaveLength(1);
    expect(all.filter((p) => p.laser)).toHaveLength(2);
  });
});
