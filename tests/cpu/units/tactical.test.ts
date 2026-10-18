import { describe, it, expect } from 'vitest';
import { BARB_SEAT, emptySeat, isBarbSeat, markCityCentre, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { disbandUnit, grantedMoves, spawnUnit } from '../../../cpu/core/units';
import { barbarianTechs, barbSlots, barbSlotsDying, raiseCamp, tribeDies, tribeOf } from '../../../cpu/core/barbarians';
import { cityStateMilitary } from '../../../cpu/core/minorOps';
import { barbarianTactics, dangerPlane, enemyAt, knowledgeLook, plotDistance, reachPlots, refreshBarbarians, stackedAt, tacticalTargets, traceTactics } from '../../../cpu/core/tactical';
import { DIRECTION_TYPES, neighborTile, tilesWithin } from '../../../world/hex';
import { LCG_ADD, LCG_MUL } from '../../../cpu/core/rand';
import type { CityState, GameState, Unit } from '../../../cpu/core/types';

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
    const list = tacticalTargets(state, BARB_SEAT, seen, null, []);
    expect(list.find((e) => e.unit === near)?.type).toBe('HIGH');
    expect(list.find((e) => e.unit === far)?.type).toBe('LOW');
    expect(list.find((e) => e.tile === camp.index)?.type).toBe('CAMP');
  });

  it("the knowledge base's units seen last turn enter the list after the walk, at their plots now", () => {
    const state = land();
    const near = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 10).index, 0)!;
    const far = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 14, 10).index, 0)!;
    const gone = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 16, 10).index, 0)!;
    const all = new Uint8Array(state.map.tiles.length).fill(1);
    knowledgeLook(state, state.barbSeat, BARB_SEAT, all, true);
    expect(state.barbSeat.armyKnown?.length).toBe(3);
    // the next turn: two moved within 2 of where they were seen, one past it
    state.turn += 1;
    near.tileIndex = tileAtCoords(state.map, 13, 11).index;
    far.tileIndex = tileAtCoords(state.map, 15, 10).index;
    gone.tileIndex = tileAtCoords(state.map, 19, 10).index;
    const seen = new Uint8Array(state.map.tiles.length);
    const list = tacticalTargets(state, BARB_SEAT, seen, null, state.barbSeat.armyKnown!);
    // in the units' table order: the Builder's record before the Warrior's
    expect(list.map((e) => [e.type, e.unit])).toEqual([['CIVILIAN', far], ['LOW', near]]);
    expect(list[1].tile).toBe(near.tileIndex);
    // a unit the player sees now is the walk's; one two turns old none
    seen[near.tileIndex] = 1;
    expect(tacticalTargets(state, BARB_SEAT, seen, null, state.barbSeat.armyKnown!).filter((e) => e.unit === near)).toHaveLength(1);
    state.turn += 1;
    expect(tacticalTargets(state, BARB_SEAT, new Uint8Array(state.map.tiles.length), null, state.barbSeat.armyKnown!)).toHaveLength(0);
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

/** a city-state at (col, row), its plots within 2 */
function addMinor(state: GameState, col: number, row: number): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length, name: `CS${state.cityStates.length}`, type: 'militaristic',
    centerIndex: center.index, population: 3, envoys: {}, met: [],
  };
  for (const t of tilesWithin(state.map, col, row, 2)) setTileOwner(t, cs.seat);
  markCityCentre(center);
  state.cityStates.push(cs);
  state.cityStateMax = Math.max(state.cityStateMax ?? 0, cs.id + 1);
  return cs;
}

/** a city-state's units' Movement at their turn's start */
function minorStart(state: GameState, cs: CityState): void {
  for (const u of state.units) {
    if (u.seat !== cs.seat) continue;
    u.movesLeft = grantedMoves(state, u);
    u.movesFull = u.movesLeft;
  }
}

describe("a city-state's tactical pass", () => {
  it('wanders a unit on ONE "Random Direction" draw over its plots of this turn within 5 of its city', () => {
    const state = land();
    const cs = addMinor(state, 10, 10);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, cs.seat)!;
    minorStart(state, cs);
    const cands = reachPlots(state, u, 2).filter((e) => e.turns === 1 && !enemyAt(state, u, e.tile)
      && !stackedAt(state, u, e.tile) && plotDistance(state, cs.centerIndex, e.tile) <= 5).map((e) => e.tile);
    expect(cands.length).toBeGreaterThan(1);
    const s0 = state.rngState;
    cityStateMilitary(state, cs);
    const s1 = (Math.imul(LCG_MUL, s0) + LCG_ADD) >>> 0;
    expect(state.rngState).toBe(s1);
    expect(u.tileIndex).toBe(cands[((s1 >>> 16) * (cands.length & 0xffff)) >>> 16]);
  });

  it('a hurt unit heals where it stands, drawing nothing', () => {
    const state = land();
    const cs = addMinor(state, 10, 10);
    const at = tileAtCoords(state.map, 11, 10).index;
    const u = spawnUnit(state, 'WARRIOR', at, cs.seat)!;
    u.hp = 60;
    minorStart(state, cs);
    const s0 = state.rngState;
    cityStateMilitary(state, cs);
    expect(u.tileIndex).toBe(at);
    expect(state.rngState).toBe(s0);
  });

  it("its pool's slot 0 is the founding Settler's: the first unit made after it takes that slot", () => {
    const state = land();
    const cs = addMinor(state, 10, 10);
    const a = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, cs.seat)!;
    const b = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 10).index, cs.seat)!;
    minorStart(state, cs);
    cityStateMilitary(state, cs);
    expect([a.slot, b.slot]).toEqual([1, 2]);
    expect(cs.unitPool!.dying).toEqual([0]);
    const c = spawnUnit(state, 'SLINGER', tileAtCoords(state.map, 10, 11).index, cs.seat)!;
    minorStart(state, cs);
    cityStateMilitary(state, cs);
    expect(c.slot).toBe(0);
  });

  it('types HIGH a foe nearer its district than twice its Movement, LOW one farther', () => {
    const state = land();
    const cs = addMinor(state, 10, 10);
    const near = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 13, 10).index, BARB_SEAT)!;
    const far = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 14, 10).index, BARB_SEAT)!;
    const seen = new Uint8Array(state.map.tiles.length).fill(1);
    const list = tacticalTargets(state, cs.seat, seen, null, []);
    expect(list.find((e) => e.tile === cs.centerIndex)?.type).toBe('FRIENDLY_CITY');
    expect(list.find((e) => e.unit === near)?.type).toBe('HIGH');
    expect(list.find((e) => e.unit === far)?.type).toBe('LOW');
  });

  it('a unit with no plot near its city goes back beside it (Wander Back to City)', () => {
    const state = land();
    const cs = addMinor(state, 4, 4);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 14, 4).index, cs.seat)!;
    minorStart(state, cs);
    const s0 = state.rngState;
    cityStateMilitary(state, cs);
    expect(state.rngState).toBe(s0);
    expect(plotDistance(state, u.tileIndex, tileAtCoords(state.map, 14, 4).index)).toBeGreaterThan(0);
    expect(plotDistance(state, u.tileIndex, cs.centerIndex)).toBeLessThan(10);
  });
});

// tools/civ6lab/dll_readings.md "C-95: the danger map and Move to Safety"
describe('the danger map and Move to Safety', () => {
  it("lays a foe's strength over its one-turn reach on its full Movement, a ranged foe's over its range of it", () => {
    const state = land();
    const eye = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 11).index, BARB_SEAT)!;
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 10).index, 0)!;
    foe.movesLeft = 0;
    const d = dangerPlane(state, BARB_SEAT);
    const reach = new Set(reachPlots(state, { ...foe, movesLeft: grantedMoves(state, foe) }, 1).map((e) => e.tile));
    expect(reach.size).toBeGreaterThan(7);
    for (const t of state.map.tiles) {
      if (plotDistance(state, t.index, eye.tileIndex) > 2 && plotDistance(state, t.index, foe.tileIndex) > 2) continue;
      expect(d[t.index]).toBe(reach.has(t.index) ? 20 : 0);
    }
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 10, 12).index, 0)!;
    const d2 = dangerPlane(state, BARB_SEAT);
    // the Archer's own plot: its reach, the Warrior's too (25 + 20)
    expect(d2[archer.tileIndex]).toBe(reach.has(archer.tileIndex) ? 45 : 25);
    expect(d2[tileAtCoords(state.map, 10, 16).index]).toBe(25);
    expect(d2[tileAtCoords(state.map, 10, 17).index]).toBe(0);
  });

  it('a hurt barbarian with half its health or less and no blow that kills goes to a plot of no danger', () => {
    const state = land();
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 10).index, BARB_SEAT)!;
    spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, 9, 10).index, 0)!;
    u.hp = 40;
    turnStart(state);
    const d = dangerPlane(state, BARB_SEAT);
    expect(d[u.tileIndex]).toBeGreaterThan(0);
    barbarianTactics(state, new Set([u.id]));
    expect(d[u.tileIndex]).toBe(0);
  });

  it('a whole barbarian holds its ground however great the danger', () => {
    const state = land();
    const at = tileAtCoords(state.map, 8, 10).index;
    const u = spawnUnit(state, 'WARRIOR', at, BARB_SEAT)!;
    for (const d of DIRECTION_TYPES.slice(0, 2)) spawnUnit(state, 'SWORDSMAN', neighborTile(state.map, state.map.tiles[at], d)!.index, 0);
    turnStart(state);
    expect(dangerPlane(state, BARB_SEAT)[at]).toBeGreaterThan(40);
    const seen: string[] = [];
    traceTactics((x, move) => { if (x === u) seen.push(move); });
    try {
      barbarianTactics(state, new Set([u.id]));
    } finally {
      traceTactics(null);
    }
    expect(seen).not.toContain('Move to safety');
    expect(seen).not.toContain('HL: Move To Safety');
  });

  it("a city-state's whole unit flees where the danger tops its strength by more than 20", () => {
    const state = land();
    const cs = addMinor(state, 4, 4);
    const at = tileAtCoords(state.map, 8, 10).index;
    const u = spawnUnit(state, 'WARRIOR', at, cs.seat)!;
    for (const d of DIRECTION_TYPES.slice(0, 2)) spawnUnit(state, 'SWORDSMAN', neighborTile(state.map, state.map.tiles[at], d)!.index, BARB_SEAT);
    minorStart(state, cs);
    const d = dangerPlane(state, cs.seat);
    expect(d[at]).toBeGreaterThan(40);
    cityStateMilitary(state, cs);
    expect(u.tileIndex).not.toBe(at);
    expect(d[u.tileIndex]).toBeLessThan(d[at]);
  });
});

// tools/civ6lab/dll_readings.md "C-95: Explore Land and the barbarians' revealed plots"
describe("the barbarians' revealed plots and Explore Land", () => {
  it("a new camp's units' looks reveal round it; the planning enters a plot never revealed and steps on from none", () => {
    const state = land();
    state.fogOfWar = true;
    const camp = tileAtCoords(state.map, 10, 10);
    raiseCamp(state, camp.index);
    const ex = state.barbSeat.explored;
    for (const t of tilesWithin(state.map, 10, 10, 2)) expect(ex[t.index]).toBe(1);
    const u = state.units.find((x) => x.id === state.barbTribes![0].defender)!;
    turnStart(state);
    // the barbarians have revealed the camp's plot and the six beside it alone
    ex.fill(0);
    for (const t of tilesWithin(state.map, 10, 10, 1)) ex[t.index] = 1;
    const reach = reachPlots(state, u, 2);
    const dist = (p: number) => plotDistance(state, camp.index, p);
    expect(reach.some((e) => dist(e.tile) === 2)).toBe(true);
    expect(reach.every((e) => dist(e.tile) <= 2)).toBe(true);
  });

  it("an explorer goes to the plot of its reach whose sight takes in the most it never revealed", () => {
    const state = land();
    state.fogOfWar = true;
    const camp = tileAtCoords(state.map, 4, 10);
    raiseCamp(state, camp.index);
    const scout = state.units.find((x) => state.barbTribes![0].scouts.includes(x.id))!;
    const ex = state.barbSeat.explored;
    const unrevealedSeen = (p: number) => {
      const t = state.map.tiles[p];
      return tilesWithin(state.map, t.col, t.row, 2).filter((q) => ex[q.index] !== 1).length;
    };
    const acting = turnStart(state);
    const from = scout.tileIndex;
    const best = Math.max(...reachPlots(state, scout, 1).filter((e) => e.tile !== from).map((e) => unrevealedSeen(e.tile)));
    expect(best).toBeGreaterThan(0);
    const before = new Map(state.map.tiles.map((t) => [t.index, unrevealedSeen(t.index)] as const));
    const moves: string[] = [];
    traceTactics((x, move) => { if (x === scout) moves.push(move); });
    try {
      barbarianTactics(state, acting);
    } finally {
      traceTactics(null);
    }
    expect(moves[0]).toBe('HL: Explore');
    expect(scout.tileIndex).not.toBe(from);
    expect(before.get(scout.tileIndex)! > 0 || ex[scout.tileIndex] === 1).toBe(true);
  });
});
