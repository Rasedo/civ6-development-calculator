import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { rivalPhase, rivalUnits } from '../src/core/rivals';
import { cityStatePhase, rivalIsSuzerain } from '../src/core/cityStates';
import { spawnUnit } from '../src/core/units';
import { nextRandom } from '../src/core/rand';
import { hexDistance, tilesWithin } from '../src/core/hex';
import {
  LEVY_UNITS,
  LEVY_GOLD_COST,
  LEVY_COOLDOWN,
  QUEST_ENVOYS,
  QUEST_COOLDOWN,
  CS_TYPE_DISTRICT,
} from '../src/data/cityStates';
import type { CityState, CityStateType, GameState, RivalCiv, RivalCity } from '../src/core/types';

// A rival with ONE city; opts out of the belief/settle draws by default so a
// levy/quest scenario perturbs no other RNG.
function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    gpEarned: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id;
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (t.cityId === -1 && (t.csId ?? -1) === -1) {
      t.rivalId = rival.id;
      t.rivalCityId = city.id;
    }
  }
  rival.cities.push(city);
  state.rivals.push(rival);
  return rival;
}

function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> & { type?: CityStateType } = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cs: CityState = {
    id: state.cityStates.length,
    name: `CS${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 3,
    envoys: 0,
    met: false,
    quest: null,
    questIssuedTurn: 0,
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) t.csId = cs.id;
  state.cityStates.push(cs);
  return cs;
}

/** Give the rival WARRIORs up to its H1 quota (2× cities) so the A-5r gold
 *  unit-buy (warrior ×mult < levy cost) can't drain the treasury pre-levy. */
function meetQuota(state: GameState, rival: RivalCiv): void {
  const quota = rival.cities.length * 2;
  const used = new Set(state.units.map((u) => u.tileIndex));
  const spots: number[] = [];
  for (const t of state.map.tiles) {
    if (spots.length >= quota) break;
    if (used.has(t.index)) continue;
    if ((t.csId ?? -1) !== -1 || t.rivalId !== undefined || t.cityId !== -1) continue;
    spots.push(t.index);
  }
  for (let i = rivalUnits(state, rival.id).length; i < quota; i++) {
    spawnUnit(state, 'WARRIOR', spots[i], 'rival', rival.id);
  }
}

function levyUnitsNear(state: GameState, rival: RivalCiv, cs: CityState): number {
  const ct = state.map.tiles[cs.centerIndex];
  return rivalUnits(state, rival.id).filter((u) => {
    const t = state.map.tiles[u.tileIndex];
    return u.type === 'WARRIOR' && hexDistance(t.col, t.row, ct.col, ct.row) <= 1;
  }).length;
}

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): rival levy', () => {
  function scenario(): { state: GameState; rival: RivalCiv; cs: CityState } {
    const state = makeState(makeMap(24, 24));
    state.turn = 20; // > QUEST_COOLDOWN, ≤ 60 → WARRIOR ladder rung
    const rival = addRival(state, 10, 10);
    const cs = addCs(state, 16, 10, { type: 'militaristic' });
    cs.rivalMet = [];
    cs.rivalMet[rival.id] = true;
    cs.rivalEnvoys = [];
    cs.rivalEnvoys[rival.id] = 5; // strict suzerain (player 0, no other rival)
    return { state, rival, cs };
  }

  it('an at-war suzerain of a militaristic CS levies LEVY_UNITS at its center', () => {
    const { state, rival, cs } = scenario();
    expect(rivalIsSuzerain(cs, rival.id)).toBe(true);
    rival.atWar = true;
    // #71 FLAG 4 (RIVAL_TILE_BUY_LIVE): the tile-purchase rung sits in the gold
    // ladder BEFORE the levy, so an exactly-LEVY_GOLD_COST treasury is drained
    // by a tile and the levy never fires. This case is about the levy FIRING;
    // the affordability edge is covered by the "cannot afford" case below.
    rival.treasury = LEVY_GOLD_COST + 500;
    meetQuota(state, rival);
    rivalPhase(state);
    expect(cs.lastLevyTurn).toBe(state.turn);
    expect(levyUnitsNear(state, rival, cs)).toBe(LEVY_UNITS);
  });

  it('does not levy at peace', () => {
    const { state, rival, cs } = scenario();
    rival.atWar = false;
    rival.treasury = LEVY_GOLD_COST;
    meetQuota(state, rival);
    rivalPhase(state);
    expect(cs.lastLevyTurn).toBeUndefined();
  });

  it('does not levy without suzerainty (2 envoys)', () => {
    const { state, rival, cs } = scenario();
    cs.rivalEnvoys![rival.id] = 2;
    rival.atWar = true;
    rival.treasury = LEVY_GOLD_COST;
    meetQuota(state, rival);
    rivalPhase(state);
    expect(cs.lastLevyTurn).toBeUndefined();
  });

  it('respects the gold cost (one below → no levy)', () => {
    const { state, rival, cs } = scenario();
    rival.atWar = true;
    rival.treasury = LEVY_GOLD_COST - 1;
    meetQuota(state, rival);
    rivalPhase(state);
    expect(cs.lastLevyTurn).toBeUndefined();
  });

  it('shares one per-CS cooldown across seats (a recent levy blocks)', () => {
    const { state, rival, cs } = scenario();
    rival.atWar = true;
    rival.treasury = LEVY_GOLD_COST;
    meetQuota(state, rival);
    cs.lastLevyTurn = state.turn - (LEVY_COOLDOWN - 1); // still cooling down
    const before = levyUnitsNear(state, rival, cs);
    rivalPhase(state);
    expect(cs.lastLevyTurn).toBe(state.turn - (LEVY_COOLDOWN - 1)); // unchanged
    expect(levyUnitsNear(state, rival, cs)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): rival quests (deterministic, zero-draw)', () => {
  function scenario(csType: CityStateType = 'scientific'): { state: GameState; rival: RivalCiv; cs: CityState } {
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const rival = addRival(state, 10, 10);
    const cs = addCs(state, 16, 10, { type: csType });
    cs.rivalMet = [];
    cs.rivalMet[rival.id] = true;
    cs.rivalEnvoys = [];
    cs.rivalEnvoys[rival.id] = 3;
    return { state, rival, cs };
  }

  it('issues buildDistrict when no camp is near and the district is unbuilt (zero-draw)', () => {
    const { state, rival, cs } = scenario('scientific');
    const rng0 = state.rngState;
    rivalPhase(state);
    expect(cs.rivalQuest?.[rival.id]?.kind).toBe('buildDistrict');
    expect(cs.rivalQuest?.[rival.id]?.district).toBe(CS_TYPE_DISTRICT['scientific']);
    expect(state.rngState).toBe(rng0); // NO nextRandom consumed by the rival-quest path
  });

  it('prefers clearCamp when a camp is within range (nearest, ties lowest tile)', () => {
    const { state, rival, cs } = scenario('scientific');
    const ct = state.map.tiles[cs.centerIndex];
    const near = tilesWithin(state.map, ct.col, ct.row, 2).filter((t) => t.index !== cs.centerIndex);
    const far = near[near.length - 1].index;
    const close = near[0].index;
    state.barbCamps = [far, close]; // out of array order — nearest must still win
    const rng0 = state.rngState;
    rivalPhase(state);
    const q = cs.rivalQuest?.[rival.id];
    expect(q?.kind).toBe('clearCamp');
    // nearest to the CS center
    const dc = hexDistance(state.map.tiles[close].col, state.map.tiles[close].row, ct.col, ct.row);
    const df = hexDistance(state.map.tiles[far].col, state.map.tiles[far].row, ct.col, ct.row);
    expect(q?.campIndex).toBe(dc <= df ? close : far);
    expect(state.rngState).toBe(rng0);
  });

  it('resolves a satisfied quest with +QUEST_ENVOYS to the rival, zero-draw', () => {
    const { state, rival, cs } = scenario('scientific');
    // pre-seed a clearCamp quest whose camp is already gone → satisfied
    cs.rivalQuest = [];
    cs.rivalQuest[rival.id] = { kind: 'clearCamp', campIndex: 999 };
    cs.rivalQuestIssuedTurn = [];
    cs.rivalQuestIssuedTurn[rival.id] = state.turn;
    state.barbCamps = []; // camp 999 gone
    const env0 = cs.rivalEnvoys![rival.id];
    const rng0 = state.rngState;
    rivalPhase(state);
    expect(cs.rivalQuest?.[rival.id]).toBeNull();
    expect(cs.rivalEnvoys![rival.id]).toBe(env0 + QUEST_ENVOYS);
    expect(state.rngState).toBe(rng0);
  });

  it('does not issue a quest for an UNMET city-state', () => {
    const { state, rival, cs } = scenario('scientific');
    cs.rivalMet![rival.id] = false;
    rivalPhase(state);
    expect(cs.rivalQuest?.[rival.id] ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('A-12 (B8-L): PLAYER quest draw-count neutrality', () => {
  it('the rival-quest path consumes ZERO rng, so the shared PRNG (and the player path) is untouched', () => {
    // A rival that would issue AND resolve a quest, at peace (no combat/war
    // draws), belief-opted-out: rivalPhase must leave rngState untouched by
    // the quest machinery — the explicit before/after neutrality proof.
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const rival = addRival(state, 10, 10);
    const cs = addCs(state, 16, 10, { type: 'scientific' });
    cs.rivalMet = [];
    cs.rivalMet[rival.id] = true;
    cs.rivalEnvoys = [];
    cs.rivalEnvoys[rival.id] = 3;
    // a satisfied quest to resolve + an issue on the same phase (second CS)
    cs.rivalQuest = [];
    cs.rivalQuest[rival.id] = { kind: 'clearCamp', campIndex: 999 };
    cs.rivalQuestIssuedTurn = [];
    cs.rivalQuestIssuedTurn[rival.id] = state.turn;
    const cs2 = addCs(state, 10, 16, { type: 'cultural' });
    cs2.rivalMet = [];
    cs2.rivalMet[rival.id] = true;
    cs2.rivalEnvoys = [];
    cs2.rivalEnvoys[rival.id] = 3;
    state.barbCamps = [];
    const rng0 = state.rngState;
    rivalPhase(state);
    // both a resolve and an issue happened, drawing nothing
    expect(cs.rivalQuest?.[rival.id]).toBeNull();
    expect(cs2.rivalQuest?.[rival.id]?.kind).toBe('buildDistrict');
    expect(state.rngState).toBe(rng0);
  });

  it('cityStatePhase still issues a player quest drawing exactly 2 (unchanged path)', () => {
    // The player quest path is byte-identical: an issue draws the district
    // pick + the option pick = 2 nextRandom advances, nothing more.
    const state = makeState(makeMap(24, 24));
    state.turn = 20;
    const cs = addCs(state, 16, 10, { type: 'scientific', met: true });
    cs.questIssuedTurn = state.turn - QUEST_COOLDOWN; // due to issue
    state.barbCamps = [];
    // capture the exact rng sequence a bare 2-draw issue would consume
    const probe = makeState(makeMap(24, 24));
    probe.rngState = state.rngState;
    // advance the probe by two draws using the same PRNG
    nextRandom(probe);
    nextRandom(probe);
    const after2 = probe.rngState;
    cityStatePhase(state);
    expect(cs.quest).not.toBeNull(); // a quest issued (2 draws)
    expect(state.rngState).toBe(after2); // exactly 2 draws — path unchanged
  });
});
