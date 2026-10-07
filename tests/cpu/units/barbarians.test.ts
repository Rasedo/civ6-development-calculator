import { describe, it, expect } from 'vitest';
import { BARB_SEAT, FREE_SEAT, isBarbSeat, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { deriveAreas } from '../../../world/query';
import { hostileUnitAct } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { barbarianOps, barbarianRules, barbarianTechs, barbUnitFor, raiseCamp, ringPlots, tribeKindAt } from '../../../cpu/core/barbarians';
import { BARB_TRIBES } from '../../../cpu/data/barbarians';
import type { GameState } from '../../../cpu/core/types';

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

// A raid that walks onto a FREE CITY's district (the parity case: a Free
// City's Campus held by a barbarian Crossbowman stood still on TS and marched
// on the GPU, whose ground test stopped short of FREE_SEAT).
describe('what a raider marches on', () => {
  it("a Free City's district is a raid target, walked onto; a second raider halts beside it", () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const campus = tileAtCoords(state.map, 8, 8);
    setTileOwner(campus, FREE_SEAT);
    campus.district = 'CAMPUS';
    campus.districtComplete = true;
    const start = tileAtCoords(state.map, 10, 8);
    const horse = spawnUnit(state, 'HORSEMAN', start.index, BARB_SEAT)!;
    hostileUnitAct(state, horse);
    expect(horse.tileIndex).toBe(campus.index);
    // the next raider finds the Campus held by its own kind: one step closer,
    // then nothing beats the tile it cannot enter
    const second = spawnUnit(state, 'HORSEMAN', start.index, BARB_SEAT)!;
    hostileUnitAct(state, second);
    expect(second.tileIndex).toBe(tileAtCoords(state.map, 9, 8).index);
    hostileUnitAct(state, second);
    expect(second.tileIndex).toBe(tileAtCoords(state.map, 9, 8).index);
  });
});

// THE RAIDS (tools/civ6lab/dll_readings.md "H-1: the raids"): a scout that
// sees a major's city walks it home; its tribe raids at its RaidingBoldness,
// the raid's force asked of the spawn clock one a turn, melee first, the units
// raised in a turn not yet the raid's; the force whole, the clock its own.
describe('a barbarian raid', () => {
  it("a scout home with a major's city starts the raid, which raises its force one a turn", () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    state.barbCampsBegun = true;
    setTileOwner(tileAtCoords(state.map, 8, 6), 0);
    const tribe = state.barbTribes![0];
    tribe.boldness = 10;
    barbarianOps(state);
    expect(tribe.op).toMatchObject({ assault: false, target: { seat: 0 }, recruited: false });
    expect(tribe.every).toBe(1);
    expect(tribe.queue).toEqual(['WARRIOR', 'WARRIOR', 'SLINGER']);
    const raised: string[] = [];
    for (let k = 0; k < 6 && !tribe.op!.recruited; k++) {
      const before = new Set(state.units.map((u) => u.id));
      barbarianRules(state, state.turn);
      raised.push(...state.units.filter((u) => !before.has(u.id) && isBarbSeat(u.seat)).map((u) => u.type));
      state.barbSeat.camps = [camp.index];
      barbarianOps(state);
    }
    // the unit raised in a turn joins the next: W, W, W, S, S
    expect(raised).toEqual(['WARRIOR', 'WARRIOR', 'WARRIOR', 'SLINGER', 'SLINGER']);
    expect(tribe.op!.recruited).toBe(true);
    expect(tribe.op!.units.length).toBe(3);
    expect(tribe.every).toBeUndefined();
  });

  it('a scout home hurt by a quarter or more holds its report while an enemy can strike it', () => {
    const state = land();
    barbarianTechs(state);
    const camp = tileAtCoords(state.map, 6, 6);
    raiseCamp(state, camp.index);
    state.barbCampsBegun = true;
    setTileOwner(tileAtCoords(state.map, 8, 6), 0);
    const tribe = state.barbTribes![0];
    tribe.boldness = 10;
    const scout = state.units.find((u) => u.id === tribe.scouts[0])!;
    scout.hp = 53;
    // a Warrior (2 moves, reach 1) three plots from the scout
    const at = state.map.tiles[scout.tileIndex];
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, at.col, at.row + 3).index, 0)!;
    barbarianOps(state);
    expect(tribe.op).toBeUndefined();
    expect(tribe.homing).toBeDefined();
    // the Warrior gone, the report lands
    state.units = state.units.filter((u) => u !== foe);
    barbarianOps(state);
    expect(tribe.op).toMatchObject({ assault: false, target: { seat: 0 } });
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
