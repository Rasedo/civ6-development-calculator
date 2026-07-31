/**
 * City-states: independent one-city minors placed at game creation. Their
 * territory blocks settling and border growth; envoys (earned from
 * influence and quests) buy yield bonuses keyed to their type, with a
 * suzerain perk at 3+. Peaceful in this stage — conquest arrives with the
 * rival-civ war framework.
 */

import type { CityState, CityStateQuest, DistrictId, GameState, Tile, Yields } from './types';
import { playerSeat, tileSeat, NO_SEAT, setTileOwner, seatOfCityState, isCityStateSeat, cityStateOfSeat, rivalsOf, civOfRival, rivalOfCiv, isPlayerSeat, PLAYER_CIV, emptySeat } from './seats';
import { emptyYields } from './types';
import { tilesWithin, hexDistance } from './hex';
import { isWater, isImpassable, hasFreshWater } from './query';
import { nextRandom } from './rand';
import { isExplored } from './fog';
import type { RuleResult } from './rules';
import { PEACE_MIN_WAR_TURNS } from '../data/rivals';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import {
  CITY_STATE_TYPES,
  CS_TYPE_YIELD,
  CS_TYPE_BUILDINGS,
  CS_NAMES,
  CS_MAX_HP,
  ENVOY_COST,
  INFLUENCE_PER_TURN,
  CS_CAPITAL_BONUS,
  CS_DISTRICT_BONUS,
  CS_SUZERAIN_LIVE,
  CS_SUZERAIN_YIELD,
  SUZERAIN_ENVOYS,
  QUEST_COOLDOWN,
  QUEST_ENVOYS,
  GOV_INFLUENCE_TIER,
} from '../data/cityStates';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

/** Minimum spacing between city-states (and, at placement, map fairness). */
const CS_SPACING = 8;

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function siteQuality(state: GameState, tile: Tile): number {
  if (isWater(tile) || isImpassable(tile)) return -1;
  if (tile.wonder || tile.feature === 'OASIS') return -1;
  let q = hasFreshWater(state.map, tile) ? 8 : 0;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 2)) {
    if (isWater(t) || isImpassable(t)) continue;
    const terrain = TERRAINS[t.terrain]?.yields ?? {};
    const feature = t.feature ? FEATURES[t.feature]?.yields ?? {} : {};
    const res = t.resource ? RESOURCES[t.resource]?.yields ?? {} : {};
    for (const src of [terrain, feature, res]) {
      q += (src.food ?? 0) * 1.2 + (src.production ?? 0) + (src.gold ?? 0) * 0.5;
    }
    if (t.elevation === 'HILLS') q += 0.5;
  }
  return q;
}

/** Place `count` city-states on good, mutually distant sites (seeded). */
export function placeCityStates(state: GameState, count?: number): void {
  const land = state.map.tiles.filter((t) => !isWater(t) && !isImpassable(t)).length;
  const target = count ?? Math.max(2, Math.min(6, Math.round(land / 200)));

  const scored = state.map.tiles
    .map((t) => ({ t, q: siteQuality(state, t) }))
    .filter((s) => s.q > 0)
    .sort((a, b) => b.q - a.q || a.t.index - b.t.index);

  const picked: Tile[] = [];
  for (const { t } of scored) {
    if (picked.length >= target) break;
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < CS_SPACING)) continue;
    picked.push(t);
  }

  const usedNames = new Set<string>();
  picked.forEach((tile, i) => {
    const type = CITY_STATE_TYPES[Math.floor(nextRandom(state) * CITY_STATE_TYPES.length)];
    const names = CS_NAMES[type];
    const name =
      names.find((n) => !usedNames.has(n)) ?? `${names[0]} ${i}`;
    usedNames.add(name);
    const cs: CityState = {
      // #51/S6.12: a minor is a Seat — the civ-level fields at zero, which is
      // the RULE (it banks and researches nothing), not a placeholder.
      ...emptySeat(seatOfCityState(i)),
      id: i,
      name,
      type,
      centerIndex: tile.index,
      population: 3,
      envoys: 0,
      met: false,
      quest: null,
      questIssuedTurn: 0,
    };
    for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
      if (tileSeat(t) === NO_SEAT) setTileOwner(t, seatOfCityState(cs.id));
    }
    setTileOwner(tile, seatOfCityState(cs.id));
    state.cityStates.push(cs);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function cityStateAt(state: GameState, tileIndex: number): CityState | undefined {
  const _s = tileSeat(state.map.tiles[tileIndex]);
  const csId = isCityStateSeat(_s) ? cityStateOfSeat(_s) : -1;
  return csId === -1 ? undefined : state.cityStates.find((cs) => cs.id === csId);
}

export function metCityStates(state: GameState): CityState[] {
  return state.cityStates.filter((cs) => cs.met);
}

export function envoysOf(cs: CityState, seat: number): number {
  return isPlayerSeat(seat) ? cs.envoys : cs.rivalEnvoys?.[rivalOfCiv(seat)] ?? 0;
}

/**
 * A-12: the suzerain CONTEST — most envoys, minimum 3, STRICTLY more than every
 * OTHER seat (real Civ 6: a tie leaves no suzerain).
 *
 * #51/S2.3: `isSuzerain(cs)` and `isSuzerain(cs, civOfRival(rivalId))` were the same
 * rule with the "mine" slot swapped — the player's read `cs.envoys` and
 * compared against the rival list; the rival's read the list and compared
 * against `cs.envoys` plus the other rivals. ONE rule now, zero divergence
 * flags: whoever is asking is "mine", everyone else is the field.
 */
export function isSuzerain(cs: CityState, seat: number = PLAYER_CIV): boolean {
  const mine = envoysOf(cs, seat);
  if (mine < SUZERAIN_ENVOYS) return false;
  if (!isPlayerSeat(seat) && cs.envoys >= mine) return false; // the player is a contender too
  return (cs.rivalEnvoys ?? []).every((e, i) => civOfRival(i) === seat || mine > (e ?? 0));
}

/** Extra trade-route capacity from being suzerain of trade city-states. */
export function csTradeCapacityBonus(state: GameState, seat: number = PLAYER_CIV): number {
  return state.cityStates.filter((cs) => cs.type === 'trade' && isSuzerain(cs, seat)).length;
}

export interface CsBonuses {
  capital: Partial<Yields>;
  // B-21: re-keyed to BUILDINGS (real Civ 6: CS bonuses land on the district's
  // BUILDINGS, not the bare district). The 3-envoy tier keys to the type's
  // tier-1 building, the 6-envoy tier to the tier-2 building. Consumed via
  // mods.buildingYieldAdd (cityBuildingYields), inheriting its pillaged-dark
  // and regional-skip treatment for free.
  buildingAdd: Partial<Record<string, Partial<Yields>>>;
}

/** B-21: the tier-1 (3-envoy) and tier-2 (6-envoy) building ids per CS type. */
function csTierBuildings(type: GameState['cityStates'][number]['type']): {
  tier1?: string;
  tier2?: string;
} {
  const list = CS_TYPE_BUILDINGS[type];
  return { tier1: list[0], tier2: list[1] };
}

/** Aggregate envoy bonuses across all city-states (folded into modifiers). */
/**
 * The 1/3/6 envoy-count bonuses for ANY seat. #51/S2.3: `csEnvoyBonuses` and
 * `csRivalEnvoyBonuses` were the same three thresholds differing only in where
 * "my envoy count" came from — `cs.envoys` vs `cs.rivalEnvoys[id]`. `envoysOf`
 * is that slot; zero flags.
 */
export function csEnvoyBonuses(state: GameState, seat: number = PLAYER_CIV): CsBonuses {
  const capital: Partial<Yields> = {};
  const buildingAdd: CsBonuses['buildingAdd'] = {};
  for (const cs of state.cityStates) {
    const mine = envoysOf(cs, seat);
    const key = CS_TYPE_YIELD[cs.type];
    if (mine >= 1) capital[key] = (capital[key] ?? 0) + CS_CAPITAL_BONUS;
    const { tier1, tier2 } = csTierBuildings(cs.type);
    if (mine >= 3 && tier1) {
      const cur = (buildingAdd[tier1] ??= {});
      cur[key] = (cur[key] ?? 0) + CS_DISTRICT_BONUS;
    }
    if (mine >= 6 && tier2) {
      const cur = (buildingAdd[tier2] ??= {});
      cur[key] = (cur[key] ?? 0) + CS_DISTRICT_BONUS;
    }
  }
  return { capital, buildingAdd };
}

/**
 * B-21: the suzerain's per-CS unique bonus, as a flat capital-yield add for
 * whichever seat holds suzerainty. #51/S2.3: the two twins differed only in the
 * seat handed to `isSuzerain`.
 */
export function csSuzerainCapitalBonus(state: GameState, seat: number = PLAYER_CIV): Partial<Yields> {
  const out: Partial<Yields> = {};
  for (const cs of state.cityStates) {
    if (!isSuzerain(cs, seat)) continue;
    const key = CS_SUZERAIN_LIVE[cs.name];
    if (!key) continue; // descoped row
    out[key] = (out[key] ?? 0) + CS_SUZERAIN_YIELD;
  }
  return out;
}

/** Per-turn yield gain of assigning one more envoy to `cs` (for advisors/RL). */
export function envoyBonusDelta(state: GameState, cs: CityState): Yields {
  const delta = emptyYields();
  const key = CS_TYPE_YIELD[cs.type];
  const next = cs.envoys + 1;
  if (next === 1) delta[key] += CS_CAPITAL_BONUS;
  // B-21: the 3/6 tiers now land on cities holding the type's tier-1/tier-2
  // BUILDING (not the bare district) — count matching held buildings.
  if (next === 3 || next === 6) {
    const { tier1, tier2 } = csTierBuildings(cs.type);
    const bld = next === 3 ? tier1 : tier2;
    let count = 0;
    if (bld) {
      for (const c of state.cities) if (c.buildings.includes(bld)) count += 1;
    }
    delta[key] += CS_DISTRICT_BONUS * count;
  }
  return delta;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function assignEnvoy(state: GameState, csId: number): RuleResult {
  const cs = state.cityStates.find((c) => c.id === csId);
  if (!cs) return no('No such city-state.');
  if (!cs.met) return no('You have not met this city-state yet.');
  if (playerSeat(state).envoysAvailable <= 0) return no('No envoys available.');
  playerSeat(state).envoysAvailable -= 1;
  cs.envoys += 1;
  return ok;
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

function questSatisfied(state: GameState, cs: CityState, quest: CityStateQuest): boolean {
  switch (quest.kind) {
    case 'clearCamp':
      return quest.campIndex !== undefined && !state.barbSeat.camps.includes(quest.campIndex);
    case 'sendTradeRoute':
      return state.tradeRoutes.some((r) => r.toCs === cs.id);
    case 'buildDistrict':
      return state.cities.some((c) =>
        c.districts.some(
          (d) => d.type === quest.district && state.map.tiles[d.tileIndex].districtComplete,
        ),
      );
  }
}

function issueQuest(state: GameState, cs: CityState): CityStateQuest | null {
  const center = state.map.tiles[cs.centerIndex];
  const options: CityStateQuest[] = [];
  const camp = state.barbSeat.camps.find((i) => {
    const t = state.map.tiles[i];
    return hexDistance(t.col, t.row, center.col, center.row) <= 6;
  });
  if (camp !== undefined) options.push({ kind: 'clearCamp', campIndex: camp });
  if (!state.tradeRoutes.some((r) => r.toCs === cs.id)) options.push({ kind: 'sendTradeRoute' });
  const askable: DistrictId[] = ['CAMPUS', 'HOLY_SITE', 'COMMERCIAL_HUB', 'THEATER_SQUARE'];
  const district = askable[Math.floor(nextRandom(state) * askable.length)];
  const already = state.cities.some((c) =>
    c.districts.some((d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete),
  );
  if (!already) options.push({ kind: 'buildDistrict', district });
  if (options.length === 0) return null;
  return options[Math.floor(nextRandom(state) * options.length)];
}

/**
 * A-18 (#79): DECLARE WAR on a city-state. Real Civ 6 treats a city-state as a
 * separate player: you must declare before you can attack it, and peace is the
 * default. This is the verb the CS-attack mask column was blocked on — without
 * it `attackTargets` could never legally offer a city-state centre, because
 * offering a PEACEFUL one is exactly what the autopilot invariant forbids.
 *
 * NOT MODELLED, recorded rather than approximated: the diplomatic consequences
 * (grievances/warmonger penalties with other civs, the suzerain's reaction) and
 * any peace-making path back. Declaring is one-way here.
 */
export function declareWarOnCityState(state: GameState, csId: number): RuleResult {
  const cs = (state.cityStates ?? []).find((c) => c.id === csId);
  if (!cs) return { ok: false, reason: 'No such city-state.' };
  if (!cs.met) return { ok: false, reason: 'You have not met this city-state.' };
  if (cs.atWar) return { ok: false, reason: 'Already at war.' };
  cs.atWar = true;
  state.eventLog.push(`You have declared war on ${cs.name}!`);
  return { ok: true };
}

/**
 * #50 (#79): SUE FOR PEACE with a city-state. SOURCED: real Civ 6 unlocks the
 * offer once 10 turns have passed since the war began, and a city-state
 * "will always accept an offer of peace without preconditions" — so there is no
 * acceptance roll here, only the cooldown. Peace resets the counter, so a
 * re-declaration must wait out the floor again.
 *
 * This is the return path `declareWarOnCityState` deliberately lacked when #45
 * landed the war state; the AUDIT entry there recorded "any peace-making path
 * back" as not modelled, and this closes it.
 */
export function sueForPeaceWithCityState(state: GameState, csId: number): RuleResult {
  const cs = (state.cityStates ?? []).find((c) => c.id === csId);
  if (!cs) return { ok: false, reason: 'No such city-state.' };
  if (!cs.atWar) return { ok: false, reason: 'Not at war.' };
  // #50 (#79) SOURCED: a city-state is dragged into its SUZERAIN's wars and
  // cannot make separate peace while that war runs — "city states automatically
  // get peace when you either stop being at war with their suzerain or them
  // switching". So refuse here; the way out is peace with the suzerain (which
  // makePeace then forces onto every city-state it is suzerain of) or the
  // suzerainty changing hands.
  const suz = (rivalsOf(state) ?? []).find((rv) => rv.atWar && isSuzerain(cs, civOfRival(rv.id)));
  if (suz) {
    return { ok: false, reason: `${cs.name} will not talk while you are at war with its suzerain, ${suz.name}.` };
  }
  const waited = cs.csWarTurns ?? 0;
  if (waited < PEACE_MIN_WAR_TURNS) {
    return { ok: false, reason: `Too soon — they will not talk for another ${PEACE_MIN_WAR_TURNS - waited} turns.` };
  }
  cs.atWar = false;
  cs.csWarTurns = 0;
  state.eventLog.push(`You have made peace with ${cs.name}.`);
  return { ok: true };
}

export function questLabel(quest: CityStateQuest): string {
  switch (quest.kind) {
    case 'clearCamp':
      return 'Clear the barbarian camp near us';
    case 'sendTradeRoute':
      return 'Send us a trade route';
    case 'buildDistrict':
      return `Build a ${quest.district?.replace(/_/g, ' ').toLowerCase()}`;
  }
}

export function cityStatePhase(state: GameState): void {
  if (state.cityStates.length === 0) return;

  // #50 (#79): tick the player<->city-state war clock — the RivalCiv.warTurns
  // twin. Peace unlocks at PEACE_MIN_WAR_TURNS.
  for (const cs of state.cityStates) {
    if (cs.atWar) cs.csWarTurns = (cs.csWarTurns ?? 0) + 1;
  }

  // Meeting: fog lifted near their center (or fog off entirely).
  for (const cs of state.cityStates) {
    if (!cs.met && isExplored(state, cs.centerIndex)) {
      cs.met = true;
      state.eventLog.push(`Met the city-state of ${cs.name} (${cs.type}).`);
    }
  }

  // Influence → envoys (only once someone can receive them).
  if (state.cityStates.some((cs) => cs.met)) {
    const govNow = playerSeat(state).government.current;
    const tier = govNow ? GOV_INFLUENCE_TIER[govNow] ?? 0 : 0;
    playerSeat(state).influencePoints += INFLUENCE_PER_TURN + tier;
    while (playerSeat(state).influencePoints >= ENVOY_COST) {
      playerSeat(state).influencePoints -= ENVOY_COST;
      playerSeat(state).envoysAvailable += 1;
      state.eventLog.push('Earned an envoy.');
    }
  }

  // Quests: resolve finished ones, issue new ones on a cooldown.
  for (const cs of state.cityStates) {
    if (!cs.met) continue;
    if (cs.quest) {
      if (questSatisfied(state, cs, cs.quest)) {
        cs.quest = null;
        cs.questIssuedTurn = state.turn;
        cs.envoys += QUEST_ENVOYS;
        state.eventLog.push(`${cs.name} quest complete: +${QUEST_ENVOYS} envoy.`);
      }
    } else if (state.turn - cs.questIssuedTurn >= QUEST_COOLDOWN) {
      const quest = issueQuest(state, cs);
      if (quest) {
        cs.quest = quest;
        cs.questIssuedTurn = state.turn;
        state.eventLog.push(`${cs.name} asks: ${questLabel(quest)}.`);
      }
    }
  }

  // Cosmetic slow growth + siege recovery.
  if (state.turn % 12 === 0) {
    for (const cs of state.cityStates) cs.population = Math.min(10, cs.population + 1);
  }
  for (const cs of state.cityStates) {
    if (cs.hp !== undefined && cs.hp < CS_MAX_HP) cs.hp = Math.min(CS_MAX_HP, cs.hp + 10);
  }
}
