/**
 * City-states: independent one-city minors placed at game creation. Their
 * territory blocks settling and border growth; envoys (earned from
 * influence and quests) buy yield bonuses keyed to their type, with a
 * suzerain perk at 3+. Peaceful in this stage — conquest arrives with the
 * rival-civ war framework.
 */

import type { CityState, CityStateQuest, DistrictId, GameState, Tile, Yields } from './types';
import { emptyYields } from './types';
import { tilesWithin, hexDistance } from './hex';
import { isWater, isImpassable, hasFreshWater } from './query';
import { nextRandom } from './rand';
import { isExplored } from './fog';
import type { RuleResult } from './rules';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import {
  CITY_STATE_TYPES,
  CS_TYPE_YIELD,
  CS_TYPE_DISTRICT,
  CS_NAMES,
  CS_MAX_HP,
  ENVOY_COST,
  INFLUENCE_PER_TURN,
  CS_CAPITAL_BONUS,
  CS_DISTRICT_BONUS,
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
      if (t.cityId === -1 && (t.csId ?? -1) === -1) t.csId = cs.id;
    }
    tile.csId = cs.id;
    state.cityStates.push(cs);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function cityStateAt(state: GameState, tileIndex: number): CityState | undefined {
  const csId = state.map.tiles[tileIndex].csId ?? -1;
  return csId === -1 ? undefined : state.cityStates.find((cs) => cs.id === csId);
}

export function metCityStates(state: GameState): CityState[] {
  return state.cityStates.filter((cs) => cs.met);
}

export function isSuzerain(cs: CityState): boolean {
  return cs.envoys >= SUZERAIN_ENVOYS;
}

/** Extra trade-route capacity from being suzerain of trade city-states. */
export function csTradeCapacityBonus(state: GameState): number {
  return state.cityStates.filter((cs) => cs.type === 'trade' && isSuzerain(cs)).length;
}

export interface CsBonuses {
  capital: Partial<Yields>;
  districtAdd: Partial<Record<DistrictId, Partial<Yields>>>;
}

/** Aggregate envoy bonuses across all city-states (folded into modifiers). */
export function csEnvoyBonuses(state: GameState): CsBonuses {
  const capital: Partial<Yields> = {};
  const districtAdd: CsBonuses['districtAdd'] = {};
  for (const cs of state.cityStates) {
    const key = CS_TYPE_YIELD[cs.type];
    if (cs.envoys >= 1) {
      capital[key] = (capital[key] ?? 0) + CS_CAPITAL_BONUS;
    }
    const district = CS_TYPE_DISTRICT[cs.type];
    let perDistrict = 0;
    if (cs.envoys >= 3) perDistrict += CS_DISTRICT_BONUS;
    if (cs.envoys >= 6) perDistrict += CS_DISTRICT_BONUS;
    if (perDistrict > 0) {
      const cur = (districtAdd[district] ??= {});
      cur[key] = (cur[key] ?? 0) + perDistrict;
    }
  }
  return { capital, districtAdd };
}

/** Per-turn yield gain of assigning one more envoy to `cs` (for advisors/RL). */
export function envoyBonusDelta(state: GameState, cs: CityState): Yields {
  const delta = emptyYields();
  const key = CS_TYPE_YIELD[cs.type];
  const next = cs.envoys + 1;
  if (next === 1) delta[key] += CS_CAPITAL_BONUS;
  if (next === 3 || next === 6) {
    const district = CS_TYPE_DISTRICT[cs.type];
    let count = 0;
    for (const c of state.cities) {
      count += c.districts.filter(
        (d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete,
      ).length;
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
  if (state.envoysAvailable <= 0) return no('No envoys available.');
  state.envoysAvailable -= 1;
  cs.envoys += 1;
  return ok;
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

function questSatisfied(state: GameState, cs: CityState, quest: CityStateQuest): boolean {
  switch (quest.kind) {
    case 'clearCamp':
      return quest.campIndex !== undefined && !state.barbCamps.includes(quest.campIndex);
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
  const camp = state.barbCamps.find((i) => {
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

  // Meeting: fog lifted near their center (or fog off entirely).
  for (const cs of state.cityStates) {
    if (!cs.met && isExplored(state, cs.centerIndex)) {
      cs.met = true;
      state.eventLog.push(`Met the city-state of ${cs.name} (${cs.type}).`);
    }
  }

  // Influence → envoys (only once someone can receive them).
  if (state.cityStates.some((cs) => cs.met)) {
    const tier = state.government.current ? GOV_INFLUENCE_TIER[state.government.current] ?? 0 : 0;
    state.influencePoints += INFLUENCE_PER_TURN + tier;
    while (state.influencePoints >= ENVOY_COST) {
      state.influencePoints -= ENVOY_COST;
      state.envoysAvailable += 1;
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
