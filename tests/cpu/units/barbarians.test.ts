import { describe, it, expect } from 'vitest';
import { BARB_SEAT, isBarbSeat, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { deriveAreas } from '../../../world/query';
import { spawnUnit } from '../../../cpu/core/units';
import { barbarianScouts, barbarianRules, barbarianTechs, barbSlots, barbUnitFor, raiseCamp, ringPlots, tribeKindAt } from '../../../cpu/core/barbarians';
import { barbOp, barbOpStart } from '../../../cpu/core/barbarianOps';
import { addMember } from '../../../cpu/core/operations/operation';
import { barbarianTactics, plotDistance, refreshBarbarians } from '../../../cpu/core/tactical';
import { BARB_TRIBES } from '../../../cpu/data/barbarians';
import type { GameState, Unit } from '../../../cpu/core/types';

function land(): GameState {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  return state;
}

// THE BARBARIANS' TURN (cpu/core/barbarians.ts; tools/civ6lab/dll_readings.md
// "H-1: the barbarians' turn"), read off the game's DLL.
describe('the barbarians\' rules', () => {
  it('take the free techs, and a tech half the majors hold', () => {
    const state = land();
    barbarianTechs(state);
    expect(state.barbSeat.research.techs).toEqual(expect.arrayContaining(['SAILING', 'BRONZE_WORKING', 'SHIPBUILDING']));
    expect(state.barbSeat.research.techs).not.toContain('ARCHERY');
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2, 2).index, 0);
    state.seats[0].research.techs.push('ARCHERY');
    barbarianTechs(state);
    expect(state.barbSeat.research.techs).toContain('ARCHERY');
  });

  it('raise the best unit of a class their techs allow, the first of the highest Combat', () => {
    const state = land();
    expect(barbUnitFor(state, 'CLASS_ANTI_CAVALRY')).toBeNull();
    barbarianTechs(state);
    expect(barbUnitFor(state, 'CLASS_ANTI_CAVALRY')).toBe('SPEARMAN');
    expect(barbUnitFor(state, 'CLASS_RANGED')).toBe('SLINGER');
    state.barbSeat.research.techs.push('ARCHERY');
    expect(barbUnitFor(state, 'CLASS_RANGED')).toBe('ARCHER');
    expect(barbUnitFor(state, 'CLASS_LIGHT_CAVALRY')).toBe('BARBARIAN_HORSEMAN');
  });

  it('walk the rings from the plot, each corner along its next side', () => {
    const state = land();
    const c = tileAtCoords(state.map, 10, 10);
    const ring = ringPlots(state, c.index, 1);
    // the first corner is the plot below (axial +r): (10, 11) on an even row
    expect(ring[0]).toBe(c.index);
    expect(ring[1]).toBe(tileAtCoords(state.map, 10, 11).index);
    expect(new Set(ring).size).toBe(7);
    expect(ringPlots(state, c.index, 2).length).toBe(19);
  });

  it('give a camp the first tribe whose ground it meets', () => {
    const state = land();
    const camp = tileAtCoords(state.map, 6, 6);
    expect(tribeKindAt(state, camp.index).kind).toBe('MELEE');
    tileAtCoords(state.map, 8, 6).resource = 'HORSES';
    expect(tribeKindAt(state, camp.index).kind).toBe('CAVALRY');
  });

  it('give a naval tribe a camp on an area under 15 plots, mountains walling it', () => {
    const state = land();
    // mountains everywhere but a 9-plot pocket of land: its own area
    const camp = tileAtCoords(state.map, 6, 6);
    for (const t of state.map.tiles) {
      const d = Math.max(Math.abs(t.col - 6), Math.abs(t.row - 6));
      if (d >= 2) t.elevation = 'MOUNTAIN';
    }
    deriveAreas(state.map);
    const size = state.map.tiles.filter((t) => t.area === camp.area).length;
    expect(size).toBeLessThan(15);
    expect(tribeKindAt(state, camp.index).kind).toBe(BARB_TRIBES[0].kind);
    expect(BARB_TRIBES[0].coastal).toBe(true);
  });

  it('raise a new camp\'s defender on it and its scout beside it', () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    const barbs = state.units.filter((u) => isBarbSeat(u.seat));
    expect(barbs.map((u) => u.type)).toEqual(['SPEARMAN', 'SCOUT']);
    expect(barbs[0].tileIndex).toBe(camp.index);
    expect(barbs[1].tileIndex).toBe(ringPlots(state, camp.index, 1)[1]);
    expect(state.barbTribes?.[0]).toMatchObject({ plot: camp.index, alive: true, kind: 'MELEE', scouts: [barbs[1].id] });
  });

  it('a tribe raises one unit a TurnsToWarriorSpawn at the speed', () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    // a major with a unit holds the camp step at bay (no land unseen enough)
    state.barbCampsBegun = true;
    const every = BARB_TRIBES.find((d) => d.kind === 'MELEE')!.spawnEvery;
    expect(every).toBe(7);
    const count = () => state.units.filter((u) => isBarbSeat(u.seat)).length;
    for (let k = 1; k < every; k++) {
      barbarianRules(state, state.turn);
      state.barbSeat.camps = [camp.index];
    }
    const before = count();
    barbarianRules(state, state.turn);
    expect(count()).toBeGreaterThanOrEqual(before + 1);
  });
});

/** a plot three from the camp and two from its scout (the scout's alone of
 *  the barbarians' sight) made a major's farm: the scout's report */
function farmInSight(state: GameState, camp: number, scout: number, city?: number): void {
  const t = state.map.tiles.find((x) => plotDistance(state, x.index, camp) === 3 && plotDistance(state, x.index, scout) <= 2)!;
  setTileOwner(t, 0, city);
  t.improvement = 'FARM';
}

// THE RAIDS (tools/civ6lab/dll_readings.md "H-1: the raids"): a scout that
// sees a major's improvement walks home with its city; its tribe raids at its RaidingBoldness,
// the raid's force asked of the spawn clock one a turn, melee first, the units
// raised in a turn not yet the raid's; the force whole, the clock its own.
describe('a barbarian raid', () => {
  it("a scout home with a major's city starts the raid, which raises its force one a turn", () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    state.barbCampsBegun = true;
    const city = settleAt(state, tileAtCoords(state.map, 9, 6).index, 0);
    const tribe = state.barbTribes![0];
    tribe.boldness = 10;
    farmInSight(state, camp.index, state.units.find((u) => u.id === tribe.scouts[0])!.tileIndex, city.id);
    // the scout's look starts its tree; the tree's tick in the tactical pass
    // finds it home: the raid starts, its own tree ticking in the same walk
    // (its spawn change and the recruit's ask)
    barbarianScouts(state);
    expect(tribe.homing).toBeDefined();
    const pass = (acting: (u: Unit) => boolean) => {
      barbSlots(state);
      refreshBarbarians(state);
      barbarianTactics(state, new Set(state.units.filter((u) => isBarbSeat(u.seat) && acting(u)).map((u) => u.id)));
    };
    pass(() => true);
    expect(tribe.homing).toBeUndefined();
    expect(tribe.op).toMatchObject({ assault: false, target: { seat: 0 } });
    expect(tribe.every).toBe(1);
    expect(tribe.queue).toEqual(['WARRIOR', 'WARRIOR', 'SLINGER']);
    const team = () => barbOp(state, tribe.op!.id)?.teams[0].members ?? [];
    const raised: string[] = [];
    for (let k = 0; k < 6 && team().length === 0; k++) {
      const before = new Set(state.units.map((u) => u.id));
      const had = tribe.units.length;
      barbarianRules(state, state.turn);
      raised.push(...tribe.units.slice(had).map((id) => state.units.find((u) => u.id === id)!.type));
      state.barbSeat.camps = [camp.index];
      // the raid's tree ticks in the barbarians' tactical pass
      pass((u) => before.has(u.id));
    }
    // the unit raised in a turn joins the next: W, W, W, S, S
    expect(raised).toEqual(['WARRIOR', 'WARRIOR', 'WARRIOR', 'SLINGER', 'SLINGER']);
    expect(team().length).toBe(3);
    expect(tribe.every).toBeUndefined();
  });

  it('a scout home hurt by a quarter or more holds its report while an enemy can strike it', () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    state.barbCampsBegun = true;
    const tribe = state.barbTribes![0];
    tribe.boldness = 10;
    const scout = state.units.find((u) => u.id === tribe.scouts[0])!;
    farmInSight(state, camp.index, scout.tileIndex);
    scout.hp = 53;
    // a Warrior two plots from the scout: its turn's reach takes the scout in
    const at = state.map.tiles[scout.tileIndex];
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, at.col, at.row + 2).index, 0)!;
    barbarianScouts(state);
    const pass = () => {
      barbSlots(state);
      refreshBarbarians(state);
      barbarianTactics(state, new Set(state.units.filter((u) => isBarbSeat(u.seat)).map((u) => u.id)));
    };
    pass();
    expect(tribe.op).toBeUndefined();
    expect(tribe.homing).toBeDefined();
    // Protect Unit took the scout to a safe plot; the Warrior gone, it walks
    // home and the report lands
    state.units = state.units.filter((u) => u !== foe);
    for (let k = 0; k < 4 && !tribe.op; k++) pass();
    expect(tribe.op).toMatchObject({ assault: false, target: { seat: 0 } });
  });
});

// THE RAID'S TREE ("Raid City"; tools/civ6lab/dll_readings.md "C-95: the
// barbarians' raid"): the march to the target, the raid there until the
// tribe's score ends it, the way home, the city to the assault list; a raid
// whose units are all gone ends.
describe("a raid's tree", () => {
  function scene() {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 4, 10);
    raiseCamp(state, camp.index);
    const city = settleAt(state, tileAtCoords(state.map, 15, 10).index, 0);
    const tribe = state.barbTribes![0];
    const w = [tileAtCoords(state.map, 5, 10), tileAtCoords(state.map, 5, 11)].map((t) => spawnUnit(state, 'WARRIOR', t.index, BARB_SEAT)!);
    tribe.units.push(...w.map((u) => u.id));
    // the raid on the manager, its force taken: the root resumes at the march
    expect(barbOpStart(state, tribe, { seat: 0, plot: city.centerIndex }, false)).toBe(true);
    const op = barbOp(state, tribe.op!.id)!;
    for (const u of w) addMember(op.teams[0], { id: u.id, type: `UNIT_${u.type}` });
    op.mem[0].resume = 9;
    op.bb.Tribe = 0;
    const tick = () => {
      barbSlots(state);
      refreshBarbarians(state);
      barbarianTactics(state, new Set(state.units.filter((u) => isBarbSeat(u.seat)).map((u) => u.id)));
    };
    const to = (u: Unit, col: number, row: number) => { u.tileIndex = tileAtCoords(state.map, col, row).index; };
    return { state, camp, city, tribe, op, w, tick, to };
  }

  it('marches on the target, raids there, goes home and lists the city', () => {
    const { state, camp, city, tribe, op, w, tick, to } = scene();
    const dist = (u: Unit) => plotDistance(state, u.tileIndex, city.centerIndex);
    const before = w.map(dist);
    tick();
    expect(op.mem[0].resume).toBe(9);
    w.forEach((u, i) => expect(dist(u)).toBeLessThan(before[i]));
    // within the march's range of the target: the raid begins, its Turn
    // Limiter's first turn this one
    to(w[0], 13, 10);
    to(w[1], 13, 11);
    tick();
    expect(op.mem[0].resume).toBe(12);
    expect(op.mem[14].start).toBe(state.turn);
    // the score reached: home to the rally
    tribe.score = 10;
    tick();
    expect(op.mem[0].resume).toBe(22);
    // home: Notify Owner lists the city, the tree ends its operation
    to(w[0], 5, 10);
    to(w[1], 4, 11);
    tick();
    expect(barbOp(state, op.id)).toBeNull();
    expect(tribe.assaultTargets).toEqual([{ seat: 0, plot: city.centerIndex }]);
    expect(plotDistance(state, w[0].tileIndex, camp.index)).toBeLessThanOrEqual(1);
  });

  it('ends once no unit of it lives through its raid', () => {
    const { state, tribe, op, w, tick } = scene();
    op.mem[0].resume = 12;
    state.units = state.units.filter((u) => !w.includes(u));
    tick();
    expect(barbOp(state, op.id)).toBeNull();
    expect(tribe.assaultTargets).toBeUndefined();
  });
});

describe('the camp step', () => {
  it("counts the barbarians' own sight among the players' that bar a camp", () => {
    const step = (watched: boolean) => {
      const state = land();
      spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 0, 0).index, 0);
      barbarianTechs(state);
      state.barbCampsBegun = true;
      // a barbarian Warrior every third plot sees the whole map
      if (watched) for (const t of state.map.tiles) if (t.col % 3 === 0 && t.row % 3 === 0) spawnUnit(state, 'WARRIOR', t.index, BARB_SEAT);
      barbarianRules(state, state.turn);
      return state.barbSeat.camps.length;
    };
    expect(step(false)).toBe(1);
    expect(step(true)).toBe(0);
  });
});
