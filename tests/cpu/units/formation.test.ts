/**
 * CORPS, ARMIES, FLEETS AND ARMADAS.
 *
 * CIV6 (Formations): after Nationalism "two military units of the same type
 * will be able to combine to create a Corps", and after Mobilization "three
 * units of the same type may be combined into an Army"; at sea the pair is a
 * Fleet and the trio an Armada. The magnitudes are the game's own
 * GlobalParameters — COMBAT_CORPS_STRENGTH_MODIFIER 10 and
 * COMBAT_ARMY_STRENGTH_MODIFIER 17 — and each raises Combat, Ranged and
 * Bombard Strength alike. "The experience and promotions of the highest
 * experience unit is preserved", and a formation never comes apart again.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState } from '../helpers';
import { spawnUnit, formationCS } from '../../../cpu/core/units';
import { formUp } from '../../../cpu/core/game';
import { unitKillEvent } from '../../../cpu/core/eras';
import { DED_TO_ARMS, DED_DRACONES } from '../../../cpu/data/seats';
import { FORMATION_CS } from '../../../cpu/data/units';
import { neighbors } from '../../../world/hex';
import { isWater, isImpassable } from '../../../world/query';
import type { GameState, Unit } from '../../../cpu/core/types';

const SEAT = 0;

/** two adjacent tiles a land unit can actually stand on. */
function twoAdjacent(state: GameState): [number, number] {
  const ok = (i: number) => {
    const tl = state.map.tiles[i];
    return !!tl && !isWater(tl) && !isImpassable(tl);
  };
  for (let t = 0; t < state.map.tiles.length; t++) {
    if (!ok(t)) continue;
    for (const nb of neighbors(state.map, state.map.tiles[t])) {
      if (nb && ok(nb.index)) return [t, nb.index];
    }
  }
  throw new Error('no adjacent land pair');
}

function put(state: GameState, tile: number, type: string, over: Partial<Unit> = {}): Unit {
  // `spawnUnit` places NEAR the index it is given; these lanes need the exact
  // tile, so the unit is pinned to it after.
  const u = spawnUnit(state, type, tile, SEAT)!;
  expect(u).toBeTruthy();
  Object.assign(u, { tileIndex: tile, movesLeft: 2, ...over });
  return u;
}

function withCivics(state: GameState, ...ids: string[]): void {
  const s = state.seats[SEAT];
  for (const id of ids) if (!s.research.civics.includes(id)) s.research.civics.push(id);
}

describe('formations', () => {
  it('pays 10 for a Corps and 17 for an Army, and nothing for a lone unit', () => {
    expect([...FORMATION_CS]).toEqual([0, 10, 17]);
    expect(formationCS({ formation: 0 } as Unit)).toBe(0);
    expect(formationCS({ formation: 1 } as Unit)).toBe(10);
    expect(formationCS({ formation: 2 } as Unit)).toBe(17);
    // an undefined field is a lone unit, read through the one helper
    expect(formationCS({} as Unit)).toBe(0);
  });

  it('refuses a Corps until Nationalism, then forms one and spends the actor', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const actor = put(state, a, 'WARRIOR', { level: 3, xp: 7, promos: 0b101, hp: 64 });
    const host = put(state, b, 'WARRIOR', { level: 1, xp: 0, promos: 0 });

    expect(formUp(state, actor, b).ok).toBe(false);
    withCivics(state, 'NATIONALISM');
    expect(formUp(state, actor, b).ok).toBe(true);

    expect(state.units.find((u) => u.id === actor.id)).toBeUndefined();
    expect(host.formation).toBe(1);
    // "the experience and promotions of the highest experience unit is preserved"
    expect(host.level).toBe(3);
    expect(host.xp).toBe(7);
    expect(host.promos).toBe(0b101);
    expect(host.hp).toBe(64);
    expect(host.movesLeft).toBe(0);
  });

  it('keeps the HOST record when the host is the veteran', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const actor = put(state, a, 'WARRIOR', { level: 1, xp: 2, promos: 0 });
    const host = put(state, b, 'WARRIOR', { level: 4, xp: 3, promos: 0b11 });
    withCivics(state, 'NATIONALISM');
    expect(formUp(state, actor, b).ok).toBe(true);
    expect(host.level).toBe(4);
    expect(host.promos).toBe(0b11);
  });

  it('needs Mobilization for the Army, and nothing larger exists', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const actor = put(state, a, 'WARRIOR');
    const host = put(state, b, 'WARRIOR', { formation: 1 });
    withCivics(state, 'NATIONALISM');
    expect(formUp(state, actor, b).ok).toBe(false);

    withCivics(state, 'MOBILIZATION');
    expect(formUp(state, actor, b).ok).toBe(true);
    expect(host.formation).toBe(2);

    // an Army absorbs nothing further, and two Corps are four units
    const third = put(state, a, 'WARRIOR');
    expect(formUp(state, third, b).ok).toBe(false);
    host.formation = 1;
    third.formation = 1;
    expect(formUp(state, third, b).ok).toBe(false);
  });

  it('refuses another chassis, another seat, an empty tile and a spent unit', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    withCivics(state, 'NATIONALISM');
    const actor = put(state, a, 'WARRIOR');

    expect(formUp(state, actor, b).ok).toBe(false); // nobody there
    const host = put(state, b, 'SLINGER');
    expect(formUp(state, actor, b).ok).toBe(false); // another chassis
    host.type = 'WARRIOR';
    host.seat = SEAT + 1;
    expect(formUp(state, actor, b).ok).toBe(false); // another seat
    host.seat = SEAT;
    actor.movesLeft = 0;
    expect(formUp(state, actor, b).ok).toBe(false); // no movement left
    actor.movesLeft = 2;
    expect(formUp(state, actor, b).ok).toBe(true);
  });

  // CIV6 (To Arms!): "+1 Era Score each time you kill a non-Barbarian Corps in
  // combat and +2 Era Score each time you kill a non-Barbarian Army in combat."
  it('pays To Arms! 1 for a Corps and 2 for an Army, and nothing for a single', () => {
    const state = makeState(makeMap(8, 8));
    const seat = state.seats[SEAT];
    seat.age = 0;                       // a GOLDEN age takes bonuses, not score
    seat.dedicationPicks = [DED_TO_ARMS];
    const victim = { type: 'WARRIOR', seat: SEAT + 1, formation: 0 };

    const before = seat.eraScore ?? 0;
    unitKillEvent(state, SEAT, undefined, victim);
    expect(seat.eraScore ?? 0).toBe(before);  // a lone unit is not a formation

    victim.formation = 1;
    unitKillEvent(state, SEAT, undefined, victim);
    expect(seat.eraScore ?? 0).toBe(before + 1);

    victim.formation = 2;
    unitKillEvent(state, SEAT, undefined, victim);
    expect(seat.eraScore ?? 0).toBe(before + 3);
  });

  it('pays To Arms! to nobody who did not commit to it', () => {
    const state = makeState(makeMap(8, 8));
    const seat = state.seats[SEAT];
    seat.age = 0;
    seat.dedicationPicks = [DED_DRACONES];
    const before = seat.eraScore ?? 0;
    unitKillEvent(state, SEAT, undefined, { type: 'WARRIOR', seat: SEAT + 1, formation: 2 });
    expect(seat.eraScore ?? 0).toBe(before);
  });

  it('is a military verb: a civilian forms nothing', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    withCivics(state, 'NATIONALISM');
    const actor = put(state, a, 'BUILDER');
    put(state, b, 'BUILDER');
    expect(formUp(state, actor, b).ok).toBe(false);
  });
});
