import { describe, it, expect } from 'vitest';
import { BARB_SEAT, isBarbSeat, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { disbandUnit, spawnUnit } from '../../../cpu/core/units';
import { barbarianTechs, barbSlots, barbSlotsDying, raiseCamp, tribeDies, tribeOf } from '../../../cpu/core/barbarians';
import { barbarianTactics, enemyAt, plotDistance, reachPlots, refreshBarbarians, stackedAt, tacticalTargets } from '../../../cpu/core/tactical';
import { DIRECTION_TYPES, neighborTile } from '../../../world/hex';
import { LCG_ADD, LCG_MUL } from '../../../cpu/core/rand';
import type { GameState, Unit } from '../../../cpu/core/types';

function land(): GameState {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  barbarianTechs(state);
  return state;
}

/** the barbarians' turn start for the units standing: their pool slots and
 *  their Movement */
function turnStart(state: GameState): Set<number> {
  barbSlots(state);
  refreshBarbarians(state);
  return new Set(state.units.filter((u) => isBarbSeat(u.seat)).map((u) => u.id));
}

// THE GAME'S UNIT AI (cpu/core/tactical.ts; tools/civ6lab/dll_readings.md
// "C-95: the unit pathfinder and the planning's reach", "C-95: the tactical
// pass"); tests/gpu/barb_tactics_test.py is the twin.
describe("the unit pathfinder's reach", () => {
  it('closes the plots of equal cost newest first, from the second link on', () => {
    const state = land();
    const c = tileAtCoords(state.map, 10, 10);
    const u = spawnUnit(state, 'WARRIOR', c.index, BARB_SEAT)!;
    refreshBarbarians(state);
    const reach = reachPlots(state, u, 2);
    const ring = DIRECTION_TYPES.map((d) => neighborTile(state.map, c, d)!.index);
    // the first link goes in alone; each later one of the same cost lies as
    // near the cheapest open node as the dearest and goes before its equals
    expect(reach.slice(0, 7).map((e) => e.tile)).toEqual([c.index, ...[...ring].reverse()]);
    expect(reach.slice(0, 7).every((e) => e.turns === 1)).toBe(true);
    expect(reach.some((e) => e.turns === 2)).toBe(true);
  });
});

describe("the barbarians' unit pool", () => {
  it('frees a gone unit\'s slot at the next turn, the slots freed together pushed in ascending order', () => {
    const state = land();
    const units: Unit[] = [];
    for (let i = 0; i < 4; i++) units.push(spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2 + 2 * i, 2).index, BARB_SEAT)!);
    barbSlots(state);
    expect(units.map((u) => u.slot)).toEqual([0, 1, 2, 3]);
    disbandUnit(state, units[1].id);
    disbandUnit(state, units[2].id);
    barbSlotsDying(state);
    expect(state.barbPool!.dying).toEqual([1, 2]);
    const a = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2, 6).index, BARB_SEAT)!;
    const b = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 6).index, BARB_SEAT)!;
    barbSlots(state);
    // the slot pushed last first
    expect([a.slot, b.slot]).toEqual([2, 1]);
    const c = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 6).index, BARB_SEAT)!;
    barbSlots(state);
    expect(c.slot).toBe(4);
  });
});

describe("the barbarians' tactical pass", () => {
  it("a camp's defender off its camp walks home", () => {
    const state = land();
    const camp = tileAtCoords(state.map, 10, 10);
    raiseCamp(state, camp.index);
    const tr = state.barbTribes![0];
    const def = state.units.find((u) => u.id === tr.defender)!;
    def.tileIndex = tileAtCoords(state.map, 12, 10).index;
    const acting = turnStart(state);
    barbarianTactics(state, acting);
    expect(def.tileIndex).toBe(camp.index);
  });

  it('a raider in reach of an improvement it sees walks onto it and pillages it', () => {
    const state = land();
    const camp = tileAtCoords(state.map, 4, 4);
    raiseCamp(state, camp.index);
    const tr = state.barbTribes![0];
    const start = tileAtCoords(state.map, 12, 12);
    const raider = spawnUnit(state, 'WARRIOR', start.index, BARB_SEAT)!;
    tr.units.push(raider.id);
    const farm = neighborTile(state.map, start, DIRECTION_TYPES[0])!;
    farm.improvement = 'FARM';
    setTileOwner(farm, 0);
    const acting = new Set([raider.id]);
    turnStart(state);
    barbarianTactics(state, acting);
    expect(raider.tileIndex).toBe(farm.index);
    expect(farm.pillaged).toBe(true);
  });

  it("a tribe whose camp a player's unit took rampages: its unit strikes that player's unit it reaches", () => {
    const state = land();
    const camp = tileAtCoords(state.map, 10, 10);
    raiseCamp(state, camp.index);
    const tr = state.barbTribes![0];
    const start = tileAtCoords(state.map, 4, 4);
    const u = spawnUnit(state, 'WARRIOR', start.index, BARB_SEAT)!;
    tr.units.push(u.id);
    // the camp taken by seat 0's unit
    state.barbSeat.camps.splice(state.barbSeat.camps.indexOf(camp.index), 1);
    tribeDies(state, camp.index, 0);
    expect(tr.rampage).toBe(0);
    const near = tileAtCoords(state.map, 5, 4);
    const foe = spawnUnit(state, 'WARRIOR', near.index, 0)!;
    const hp = foe.hp;
    turnStart(state);
    barbarianTactics(state, new Set([u.id]));
    expect(plotDistance(state, u.tileIndex, near.index) <= 1).toBe(true);
    expect(!state.units.includes(foe) || foe.hp < hp).toBe(true);
  });

  it('a fighter whose reach takes a civilian at war goes and takes it (Attack Civilians)', () => {
    const state = land();
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index, BARB_SEAT)!;
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 6, 4).index, 0)!;
    turnStart(state);
    barbarianTactics(state, new Set([u.id]));
    expect(u.tileIndex).toBe(tileAtCoords(state.map, 6, 4).index);
    expect(!state.units.includes(builder) || builder.seat === BARB_SEAT).toBe(true);
  });

  it('a fighter left with a LOW target in its reach chases it to its side (Chase Target)', () => {
    const state = land();
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index, BARB_SEAT)!;
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 4).index, 0)!;
    turnStart(state);
    barbarianTactics(state, new Set([u.id]));
    expect(plotDistance(state, u.tileIndex, foe.tileIndex)).toBe(1);
  });

  it('the target list types a fighter near a barbarian camp HIGH, one far LOW', () => {
    const state = land();
    const camp = tileAtCoords(state.map, 10, 10);
    raiseCamp(state, camp.index);
    const near = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 10).index, 0)!;
    const far = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 17, 10).index, 0)!;
    const seen = new Uint8Array(state.map.tiles.length).fill(1);
    const list = tacticalTargets(state, BARB_SEAT, seen, null);
    expect(list.find((e) => e.unit === near)?.type).toBe('HIGH');
    expect(list.find((e) => e.unit === far)?.type).toBe('LOW');
    expect(list.find((e) => e.tile === camp.index)?.type).toBe('CAMP');
  });

  it('a unit near its standing camp wanders on ONE "Random Direction" draw over its plots of this turn', () => {
    const state = land();
    const camp = tileAtCoords(state.map, 10, 10);
    raiseCamp(state, camp.index);
    const tr = state.barbTribes![0];
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 11).index, BARB_SEAT)!;
    tr.units.push(u.id);
    expect(tribeOf(state, u.id)).toBe(tr);
    turnStart(state);
    const cands = reachPlots(state, u, 2).filter((e) => e.turns === 1 && !enemyAt(state, u, e.tile)
      && !stackedAt(state, u, e.tile) && plotDistance(state, camp.index, e.tile) <= 5).map((e) => e.tile);
    expect(cands.length).toBeGreaterThan(1);
    const s0 = state.rngState;
    barbarianTactics(state, new Set([u.id]));
    const s1 = (Math.imul(LCG_MUL, s0) + LCG_ADD) >>> 0;
    expect(state.rngState).toBe(s1);
    expect(u.tileIndex).toBe(cands[((s1 >>> 16) * (cands.length & 0xffff)) >>> 16]);
  });
});
