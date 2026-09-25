import { describe, it, expect } from 'vitest';
import { GAME_SPEED, MP_SCALE, scaleByGameSpeed } from '../../../cpu/data/constants';
import { projectCost, TURN_LIMIT } from '../../../cpu/core/game';
import { UNITS } from '../../../cpu/data/units';
import { PROJECTS } from '../../../cpu/data/projects';
import { WONDER_ERA_INDEX } from '../../../cpu/data/builtWonders';
import { GREAT_PEOPLE, GP_CLASSES, GP_ABILITY, gpChargesOf } from '../../../cpu/data/greatPeople';
import { activateGreatPerson } from '../../../cpu/core/gpAbility';
import { spawnUnit } from '../../../cpu/core/units';
import { setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { seededGame } from '../helpers';
import type { GameState } from '../../../cpu/core/types';

// THE ONLINE SPEED. CIV6 (GameSpeeds.xml, GAMESPEED_ONLINE): CostMultiplier
// 50, and 250 turns across the online GameSpeed_Turns rows. Every figure the
// install scales by the speed goes through one composer, `scaleByGameSpeed`,
// which truncates as the lab read every odd cost (runs/purchase_*.jsonl). The
// GPU twin is tests/gpu/game_speed_test.py.

describe('the online game speed', () => {
  it('is the install\'s CostMultiplier 50, and the game is 250 turns long', () => {
    expect(GAME_SPEED).toBe(50 / 100);
    expect(TURN_LIMIT).toBe(35 + 30 + 20 + 20 + 30 + 25 + 60 + 30);
  });

  it('truncates an odd cost, as the lab read it', () => {
    // xmlCost -> the city's production cost, lab 2 scene G
    for (const [xmlCost, lab] of [[35, 17], [75, 37], [225, 112], [65, 32], [81, 40], [27, 13], [80, 40]] as const) {
      expect(scaleByGameSpeed(xmlCost)).toBe(lab);
    }
    expect(UNITS.SLINGER.cost).toBe(17);
    expect(UNITS.SPY.cost).toBe(112);
    expect(UNITS.MISSIONARY.cost).toBe(37);
    expect(UNITS.GALLEY.cost).toBe(32);
  });

  it('prices a district project off its own row: Cost 25 + 1500 x progress', () => {
    const state = seededGame(4242, 1);
    for (const id of ['RESEARCH_GRANTS', 'FESTIVAL', 'PRAYERS', 'INVESTMENT', 'SHIPPING', 'TRAINING']) {
      expect(PROJECTS[id].cost, id).toBe(scaleByGameSpeed(25));
      expect(PROJECTS[id].costProgressGame, id).toBe(1500);
      // no research: the row's own Cost
      expect(projectCost(state, 0, id)).toBe(scaleByGameSpeed(25));
    }
    // every other row carries its own Cost too; the repair alone is priced
    // by the HP it restores
    for (const p of Object.values(PROJECTS)) {
      if (p.repair) expect(p.cost, p.id).toBeUndefined();
      else expect(p.cost, p.id).toBeGreaterThan(0);
    }
    expect(PROJECTS.CARBON_RECAPTURE.cost).toBe(scaleByGameSpeed(400));
  });
});

describe('a Great Person grant the install types ScaleByGameSpeed', () => {
  function newGame(): GameState {
    const state = seededGame(909, 2);
    state.autoResearch = false;
    return state;
  }
  const found = (id: string) => {
    for (const c of GP_CLASSES) {
      const at = GREAT_PEOPLE[c].findIndex((p) => p.id === id);
      if (at >= 0) return { cls: c as string, at };
    }
    throw new Error(`${id} is not in the roster`);
  };
  /** the capital raising `wonder` on a bare owned plot, and the engineer
   *  `id` standing on that plot (`ActionRequiresIncompleteWonder`) */
  function engineerOnWonder(state: GameState, id: string, wonder: string) {
    const city = state.seats[0].cities[0];
    const t = state.map.tiles.find((x) => tileSeat(x) === 0 && x.index !== city.centerIndex
      && !x.district && !x.builtWonder && !x.resource && !state.units.some((u) => u.tileIndex === x.index))!;
    setTileOwner(t, 0, city.id);
    t.builtWonder = wonder as never;
    t.builtWonderComplete = false;
    city.queue = [{ kind: 'wonder', wonder, tileIndex: t.index, progress: 0 }];
    const { cls, at } = found(id);
    const u = spawnUnit(state, cls, t.index, 0)!;
    Object.assign(u, { tileIndex: t.index, gpAt: at, movesLeft: 2 * MP_SCALE });
    u.charges = gpChargesOf(GREAT_PEOPLE[cls as keyof typeof GREAT_PEOPLE][at]);
    return { city, u };
  }

  it('pays the scaled amount where the catalog holds it', () => {
    // GREATPERSON_GOLD_LARGE 500, GREATPERSON_FAITH 100, the LOTSO rows 1000
    expect(GP_ABILITY.GP_JOHN_JACOB_ASTOR.gold).toBe(scaleByGameSpeed(500));
    expect(GP_ABILITY.GP_MARCUS_LICINIUS_CRASSUS.gold).toBe(scaleByGameSpeed(60));
    expect(GP_ABILITY.GP_HILDEGARD_OF_BINGEN.faith).toBe(scaleByGameSpeed(100));
    expect(GP_ABILITY.GP_MARGARET_MEAD.science).toBe(scaleByGameSpeed(1000));
    expect(GP_ABILITY.GP_GALILEO_GALILEI.perAdjacent?.amount).toBe(scaleByGameSpeed(250));
    expect(GP_ABILITY.GP_CARL_SAGAN.spaceProduction).toBe(scaleByGameSpeed(3000));
  });

  it('scales Imhotep\'s grant whole: 350 into an Ancient wonder, 175 into a later one', () => {
    for (const [wonder, standard] of [['PYRAMIDS', 350], ['FORBIDDEN_CITY', 175]] as const) {
      const state = newGame();
      const { city, u } = engineerOnWonder(state, 'GP_IMHOTEP', wonder);
      expect(WONDER_ERA_INDEX[wonder] <= 1).toBe(standard === 350);
      expect(activateGreatPerson(state, u)).toBe(true);
      expect(city.queue[0].progress).toBe(scaleByGameSpeed(standard));
    }
  });
});
