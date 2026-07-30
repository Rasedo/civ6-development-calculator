import { describe, it, expect } from 'vitest';
import { civOfRival, rivalsOf } from '../src/core/seats';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { spawnUnit } from '../src/core/units';
import { neighbors } from '../src/core/hex';
import type { GameState, RivalCiv } from '../src/core/types';

// B6-S2 rival MISSIONARY chassis (mirror of the GPU religion2_test pokes). The
// scripted 250t rollout barely reaches a rival that has founded a religion AND
// built a Shrine on a completed Holy Site, so these pin the buy/price/cap/spread
// semantics: rivalMissionaryActions + the A-5 faith-block missionary branch.

function newGame(rivals = 1): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, rivals,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  return state;
}

/** Configure rival 0 as a founder able to buy a missionary: religion founded,
 * a Shrine, and a COMPLETE unpillaged Holy Site. Pantheon/enhancer races and
 * any Temple (worship-buy faith sink) are neutralised so the missionary buy is
 * the sole faith lever. */
function makeBuyer(state: GameState) {
  const rv = (state.seats[(0) + 1] as RivalCiv);
  rv.religion.founded = true;
  rv.religion.pantheon = 'GOD_OF_THE_SEA'; // claimed — skips the 25-faith drain
  rv.religion.enhancer = null; // no enhancer claimed
  const rc = rv.cities[0];
  rc.buildings = rc.buildings.filter((b) => b !== 'TEMPLE'); // no worship buy
  if (!rc.buildings.includes('SHRINE')) rc.buildings.push('SHRINE');
  const hsTile = neighbors(state.map, state.map.tiles[rc.centerIndex])[0].index;
  rc.districts.push({ type: 'HOLY_SITE', tileIndex: hsTile } as never);
  state.map.tiles[hsTile].districtComplete = true;
  state.map.tiles[hsTile].districtPillaged = false;
  return { rv, rc, hsTile };
}

function rivalMissionaries(state: GameState, civId: number) {
  return state.units.filter((u) => u.seat === civOfRival(civId) && u.type === 'MISSIONARY');
}

/** Force every city (player + rivals) to follow g so a freshly-bought
 * missionary finds no target and keeps its full charge count. */
function followAll(state: GameState, g: number) {
  for (const c of [...state.cities, ...rivalsOf(state).flatMap((rv) => rv.cities)]) c.followedReligion = g;
}

describe('B6-S2 rival missionary chassis', () => {
  it('a founder with Shrine + complete Holy Site + 60 faith buys one missionary for 60 faith', () => {
    // BUY run.
    const buy = newGame();
    const { rv: rvB } = makeBuyer(buy);
    rvB.faith = 200;
    endTurn(buy);
    const missB = rivalMissionaries(buy, rvB.id);
    expect(missB.length).toBe(1);
    const faithBuy = rvB.faith ?? 0;

    // CONTROL run: identical, but the cap is pre-filled with inert missionaries
    // so no buy fires (Shrine income identical) — the faith delta isolates 60.
    const ctl = newGame();
    const { rv: rvC } = makeBuyer(ctl);
    rvC.faith = 200;
    for (let k = 0; k < 2; k++) {
      const u = spawnUnit(ctl, 'MISSIONARY', rvC.cities[0].centerIndex, civOfRival(rvC.id));
      if (u) u.charges = 0;
    }
    // #71 (APOSTLE_BUY_LIVE): the apostle rung only fires when NO missionary
    // was bought, which is exactly this control's situation — so pre-fill its
    // cap too, or the control spends 120 on an apostle and the delta no longer
    // isolates the missionary price.
    {
      const a = spawnUnit(ctl, 'APOSTLE', rvC.cities[0].centerIndex, civOfRival(rvC.id));
      if (a) a.charges = 0;
    }
    endTurn(ctl);
    expect(rivalMissionaries(ctl, rvC.id).length).toBe(2);
    expect((rvC.faith ?? 0) - faithBuy).toBeCloseTo(60, 5);
  });

  it('HOLY_ORDER prices the missionary at 42 faith', () => {
    const buy = newGame();
    const { rv: rvB } = makeBuyer(buy);
    rvB.religion.enhancer = 'HOLY_ORDER';
    rvB.faith = 200;
    endTurn(buy);
    expect(rivalMissionaries(buy, rvB.id).length).toBe(1);
    const faithBuy = rvB.faith ?? 0;

    const ctl = newGame();
    const { rv: rvC } = makeBuyer(ctl);
    rvC.religion.enhancer = 'HOLY_ORDER';
    rvC.faith = 200;
    for (let k = 0; k < 2; k++) {
      const u = spawnUnit(ctl, 'MISSIONARY', rvC.cities[0].centerIndex, civOfRival(rvC.id));
      if (u) u.charges = 0;
    }
    // #71 (APOSTLE_BUY_LIVE): the apostle rung only fires when NO missionary
    // was bought, which is exactly this control's situation — so pre-fill its
    // cap too, or the control spends 120 on an apostle and the delta no longer
    // isolates the missionary price.
    {
      const a = spawnUnit(ctl, 'APOSTLE', rvC.cities[0].centerIndex, civOfRival(rvC.id));
      if (a) a.charges = 0;
    }
    endTurn(ctl);
    expect(rivalMissionaries(ctl, rvC.id).length).toBe(2);
    expect((rvC.faith ?? 0) - faithBuy).toBeCloseTo(42, 5);
  });

  it('SCRIPTURE grants the bought missionary 4 charges', () => {
    const state = newGame();
    const { rv } = makeBuyer(state);
    rv.religion.enhancer = 'SCRIPTURE';
    rv.faith = 200;
    followAll(state, 1); // no spread target -> the missionary keeps its full charges
    endTurn(state);
    const miss = rivalMissionaries(state, rv.id);
    expect(miss.length).toBe(1);
    expect(miss[0].charges).toBe(4);
  });

  it('the missionary cap (2 live) blocks a third buy', () => {
    const state = newGame();
    const { rv } = makeBuyer(state);
    rv.faith = 500;
    for (let k = 0; k < 2; k++) {
      const u = spawnUnit(state, 'MISSIONARY', rv.cities[0].centerIndex, civOfRival(rv.id));
      if (u) u.charges = 0;
    }
    endTurn(state);
    expect(rivalMissionaries(state, rv.id).length).toBe(2);
  });

  it('a missionary within 1 of a differing city spreads +10 (15 SCRIPTURE), loses a charge, dies at 0', () => {
    // base lump 10, charges 2 -> survives at 1.
    {
      const state = newGame();
      const rv = (state.seats[(0) + 1] as RivalCiv);
      const target = state.cities[0];
      target.followedReligion = 0; // != g (1)
      target.religionPressure = [0, 0];
      const u = spawnUnit(state, 'MISSIONARY', target.centerIndex, civOfRival(rv.id))!;
      u.charges = 2;
      const uid = u.id;
      endTurn(state);
      expect((target.religionPressure ?? [])[1]).toBe(10);
      const still = state.units.find((x) => x.id === uid);
      expect(still?.charges).toBe(1);
    }
    // SCRIPTURE lump 15, charges 1 -> dies (disbanded) at 0.
    {
      const state = newGame();
      const rv = (state.seats[(0) + 1] as RivalCiv);
      rv.religion.enhancer = 'SCRIPTURE';
      const target = state.cities[0];
      target.followedReligion = 0;
      target.religionPressure = [0, 0];
      const u = spawnUnit(state, 'MISSIONARY', target.centerIndex, civOfRival(rv.id))!;
      u.charges = 1;
      const uid = u.id;
      endTurn(state);
      expect((target.religionPressure ?? [])[1]).toBe(15);
      expect(state.units.find((x) => x.id === uid)).toBeUndefined();
    }
  });
});
