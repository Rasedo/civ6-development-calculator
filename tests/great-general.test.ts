import { describe, it, expect } from 'vitest';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { spawnUnit, unitDomain, trainableUnits } from '../src/core/units';
import { isImpassable } from '../src/core/query';
import { generalAuraCS, GENERAL_AURA_CS, meleeAttack } from '../src/core/combat';
import { neighbors, hexDistance } from '../src/core/hex';
import { UNITS } from '../src/data/units';
import { gpCost } from '../src/data/greatPeople';
import type { GameState, Unit } from '../src/core/types';

// B7-G / AUDIT B-8 — Great General & Great Admiral (the TS twin of the GPU
// gpu/gp_aura_test.py pokes). The scripted 250t rollout never claims a GENERAL
// (no ENCAMPMENT flows its GPP), so these pin the catalog, the +5 aura, the
// spawn-at-claim and B-31 capture directly.

function newGame(opts: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, rivals: 1, ...opts,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  return state;
}

/** A free land tile at exactly `dist` from `ctr` (no unit, not a city center). */
function tileAt(state: GameState, ctr: number, dist: number, banned: number[] = []): number {
  const c = state.map.tiles[ctr];
  for (const t of state.map.tiles) {
    if (t.index === ctr || banned.includes(t.index)) continue;
    if (t.cityId !== -1) continue;
    if (hexDistance(c.col, c.row, t.col, t.row) !== dist) continue;
    if (state.units.some((u) => u.tileIndex === t.index)) continue;
    return t.index;
  }
  return -1;
}

describe('B7-G (B-8) Great General / Admiral catalog', () => {
  it('GENERAL & ADMIRAL are combat-0, single-charge, spawn-only civilians', () => {
    for (const id of ['GENERAL', 'ADMIRAL']) {
      const def = UNITS[id];
      expect(def).toBeDefined();
      expect(def.combat).toBe(0);
      expect(def.charges).toBe(1);
      expect(def.spawnOnly).toBe(true);
      expect(unitDomain(id)).toBe('civilian'); // charges defined -> civilian in both engines
    }
  });

  it('are never trainable or purchasable (trainableUnits filters them out)', () => {
    const state = newGame();
    const ids = trainableUnits(state, state.cities[0]).map((d) => d.id);
    expect(ids).not.toContain('GENERAL');
    expect(ids).not.toContain('ADMIRAL');
  });
});

describe('B7-G (B-8) aura', () => {
  it('+5 to own LAND military within 2 of an own GENERAL; 0 at range 3 / wrong civ / naval', () => {
    const state = newGame();
    const cap = state.cities[0].centerIndex;
    const gen = spawnUnit(state, 'GENERAL', cap, 'player')!;
    const gt = gen.tileIndex;
    const t2 = tileAt(state, gt, 2, [gt]);
    const t3 = tileAt(state, gt, 3, [gt, t2]);
    expect(t2).toBeGreaterThanOrEqual(0);
    expect(t3).toBeGreaterThanOrEqual(0);
    const war = spawnUnit(state, 'WARRIOR', t2, 'player')!;
    expect(generalAuraCS(state, war, war.tileIndex)).toBe(GENERAL_AURA_CS);
    // range 3 → 0
    war.tileIndex = t3;
    expect(generalAuraCS(state, war, war.tileIndex)).toBe(0);
    // a rival unit near the PLAYER general → 0
    const rw: Unit = { ...war, owner: 'rival', civId: state.rivals[0].id, tileIndex: t2 };
    expect(generalAuraCS(state, rw, rw.tileIndex)).toBe(0);
    // a naval unit near a GENERAL (not an ADMIRAL) → 0
    const galley = spawnUnit(state, 'GALLEY', cap, 'player');
    if (galley) {
      galley.tileIndex = t2;
      expect(generalAuraCS(state, galley, galley.tileIndex)).toBe(0);
    }
  });

  it('ADMIRAL +5 to own NAVAL/embarked within 2; not to land units', () => {
    const state = newGame();
    const cap = state.cities[0].centerIndex;
    const adm = spawnUnit(state, 'ADMIRAL', cap, 'player')!;
    const t2 = tileAt(state, adm.tileIndex, 2, [adm.tileIndex]);
    const war = spawnUnit(state, 'WARRIOR', t2, 'player')!;
    // a LAND unit gets nothing from an admiral
    expect(generalAuraCS(state, war, war.tileIndex)).toBe(0);
    // an EMBARKED land unit reads the ADMIRAL aura
    war.embarked = true;
    expect(generalAuraCS(state, war, war.tileIndex)).toBe(GENERAL_AURA_CS);
  });

  it('an attacker beside its own GENERAL deals strictly more damage (same RNG)', () => {
    const build = (withGen: boolean) => {
      const state = newGame();
      state.rivals[0].atWar = true;
      const cap = state.cities[0].centerIndex;
      const at = tileAt(state, cap, 3);
      const nb = neighbors(state.map, state.map.tiles[at]).find(
        (n) => n.cityId === -1 && !isImpassable(n),
      )!;
      const atk = spawnUnit(state, 'WARRIOR', at, 'player')!;
      atk.tileIndex = at;
      atk.movesLeft = UNITS.WARRIOR.moves;
      const def = spawnUnit(state, 'WARRIOR', nb.index, 'rival', state.rivals[0].id)!;
      def.tileIndex = nb.index;
      if (withGen) {
        const gt = tileAt(state, at, 1, [at, nb.index]);
        const g = spawnUnit(state, 'GENERAL', gt, 'player')!;
        g.tileIndex = gt;
      }
      const hp0 = def.hp;
      const res = meleeAttack(state, atk.id, nb.index);
      expect(res.ok).toBe(true);
      const survivor = state.units.find((u) => u.id === def.id);
      return hp0 - (survivor?.hp ?? 0); // damage dealt (killed → full)
    };
    const noGen = build(false);
    const withGen = build(true);
    expect(noGen).toBeGreaterThan(0);
    expect(withGen).toBeGreaterThan(noGen);
  });
});

describe('B7-G (B-8) spawn-at-claim & capture', () => {
  it('a player GENERAL claim spawns a general civilian at the capital', () => {
    const state = newGame();
    // fund exactly one GENERAL; advanceGreatPeople (in endTurn) claims + spawns.
    state.greatPeople.points.GENERAL = gpCost(0);
    const before = state.units.filter((u) => u.owner === 'player' && u.type === 'GENERAL').length;
    endTurn(state);
    const after = state.units.filter((u) => u.owner === 'player' && u.type === 'GENERAL');
    expect(after.length).toBe(before + 1);
    // spawned at/adjacent to the capital, a civilian with 1 charge
    const cap = state.map.tiles[state.cities[0].centerIndex];
    const g = after[after.length - 1];
    const gt = state.map.tiles[g.tileIndex];
    expect(hexDistance(cap.col, cap.row, gt.col, gt.row)).toBeLessThanOrEqual(1);
    expect(g.charges).toBe(1);
  });

  it('B-31: an at-war rival melee on a lone player GENERAL captures it', () => {
    const state = newGame();
    state.rivals[0].atWar = true;
    const cap = state.cities[0].centerIndex;
    const gtile = tileAt(state, cap, 4);
    const gen = spawnUnit(state, 'GENERAL', gtile, 'player')!;
    gen.tileIndex = gtile;
    const nb = neighbors(state.map, state.map.tiles[gtile]).find(
      (n) => n.cityId === -1 && !state.units.some((u) => u.tileIndex === n.index),
    )!;
    const atk = spawnUnit(state, 'WARRIOR', nb.index, 'rival', state.rivals[0].id)!;
    meleeAttack(state, atk.id, gtile);
    const captured = state.units.find((u) => u.id === gen.id)!;
    expect(captured.owner).toBe('rival');
    expect(captured.civId).toBe(state.rivals[0].id);
    // POOL-END: the captured unit sits at the tail of state.units.
    expect(state.units[state.units.length - 1].id).toBe(gen.id);
  });
});
