/**
 * City-states: independent one-city minors placed at game creation. Their
 * territory blocks settling and border growth; envoys (earned from
 * influence and quests) buy yield bonuses keyed to their type, with a
 * suzerain perk at 3+. Peaceful in this stage — conquest arrives with the
 * seat-civ war framework.
 */

import type { City, CityState, CityStateQuest, CityStateType, GameState, Tile, Yields } from './types';
import { NO_SEAT, citiesOf, cityStateOfSeat, civsAtWar, emptySeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, setWar, setWarTurnsWith, tileSeat, warTurnsWith, warsOf } from './seats';
import { emptyYields } from './types';
import { tilesWithin, hexDistance } from '../../world/hex';
import { isWater, isImpassable, hasFreshWater } from '../../world/query';
import { nextRandom } from './rand';
import type { RuleResult } from './rules';
import { WAR_MIN_TURNS } from '../data/seats';
import { TERRAINS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { CITY_STATE_TYPES, CITY_STATE_TYPE_YIELD, CITY_STATE_TYPE_BUILDINGS, CITY_STATE_NAMES, CITY_STATE_MAX_HP, CITY_STATE_CAPITAL_BONUS, CITY_STATE_DISTRICT_BONUS, CITY_STATE_SUZERAIN_LIVE, CITY_STATE_SUZERAIN_YIELD, SUZERAIN_ENVOYS, CITY_STATE_TYPE_DISTRICT } from '../data/cityStates';
import { warWearinessPeace } from './weariness';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

/** Minimum spacing between city-states (and, at placement, map fairness). */
const CITY_STATE_SPACING = 8;

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
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < CITY_STATE_SPACING)) continue;
    picked.push(t);
  }

  const usedNames = new Set<string>();
  picked.forEach((tile, i) => {
    const type = CITY_STATE_TYPES[Math.floor(nextRandom(state) * CITY_STATE_TYPES.length)];
    const names = CITY_STATE_NAMES[type];
    const name =
      names.find((n) => !usedNames.has(n)) ?? `${names[0]} ${i}`;
    usedNames.add(name);
    placeCityStateAt(state, i, name, type, tile.index);
  });
}

/**
 * FOUND one city-state at a known tile — the ONE constructor, shared by the
 * scored placement above and the world-file loader. Claims the centre plus
 * any unowned first-ring tile.
 */
export function placeCityStateAt(
  state: GameState,
  id: number,
  name: string,
  type: CityStateType,
  centerIndex: number,
): CityState {
  const tile = state.map.tiles[centerIndex];
  const cityState: CityState = {
    // A minor is a Seat — the civ-level fields at zero, which is
    // the RULE (it banks and researches nothing), not a placeholder.
    ...emptySeat(seatOfCityState(id)),
    id,
    name,
    type,
    centerIndex,
    population: 3,
    envoys: {},
    met: [],
  };
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (tileSeat(t) === NO_SEAT) setTileOwner(t, seatOfCityState(cityState.id));
  }
  setTileOwner(tile, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function cityStateAt(state: GameState, tileIndex: number): CityState | undefined {
  const _s = tileSeat(state.map.tiles[tileIndex]);
  const cityStateId = isCityStateSeat(_s) ? cityStateOfSeat(_s) : -1;
  return cityStateId === -1 ? undefined : state.cityStates.find((cityState) => cityState.id === cityStateId);
}

export function metCityStates(state: GameState, seat: number): CityState[] {
  return state.cityStates.filter((cityState) => hasMet(cityState, seat));
}

export function envoysOf(cityState: CityState, seat: number): number {
  return cityState.envoys[seat] ?? 0;
}

/** Has `seat` met this city-state? */
export function hasMet(cityState: CityState, seat: number): boolean {
  return cityState.met.includes(seat);
}

/** Record contact between `seat` and this city-state. Idempotent. */
export function setMet(cityState: CityState, seat: number): void {
  if (!cityState.met.includes(seat)) cityState.met.push(seat);
}

/** Bank `n` more envoys for `seat` here. The ONE writer. */
export function addEnvoys(cityState: CityState, seat: number, n = 1): void {
  cityState.envoys[seat] = (cityState.envoys[seat] ?? 0) + n;
}

/**
 * The suzerain CONTEST — most envoys, minimum 3, STRICTLY more than every
 * OTHER seat (real Civ 6: a tie leaves no suzerain).
 *
 * Whoever asks is "mine"; every other entry in the store is the field.
 */
export function isSuzerain(cityState: CityState, seat: number): boolean {
  const mine = envoysOf(cityState, seat);
  if (mine < SUZERAIN_ENVOYS) return false;
  return Object.entries(cityState.envoys).every(([k, e]) => Number(k) === seat || mine > (e ?? 0));
}

/** Extra trade-route capacity from being suzerain of trade city-states. */
export function cityStateTradeCapacityBonus(state: GameState, seat: number): number {
  return state.cityStates.filter((cityState) => cityState.type === 'trade' && isSuzerain(cityState, seat)).length;
}

export interface CsBonuses {
  capital: Partial<Yields>;
  // Re-keyed to BUILDINGS (real Civ 6: CS bonuses land on the district's
  // BUILDINGS, not the bare district). The 3-envoy tier keys to the type's
  // tier-1 building, the 6-envoy tier to the tier-2 building. Consumed via
  // mods.buildingYieldAdd (cityBuildingYields), inheriting its pillaged-dark
  // and regional-skip treatment for free.
  buildingAdd: Partial<Record<string, Partial<Yields>>>;
}

/** the tier-1 (3-envoy) and tier-2 (6-envoy) building ids per CS type. */
function cityStateTierBuildings(type: GameState['cityStates'][number]['type']): {
  tier1?: string;
  tier2?: string;
} {
  const list = CITY_STATE_TYPE_BUILDINGS[type];
  return { tier1: list[0], tier2: list[1] };
}

/**
 * The 1/3/6 envoy-count bonuses this seat draws from every city-state, folded
 * into its modifiers. `envoysOf` is the one place "my envoy count" comes from.
 */
export function cityStateEnvoyBonuses(state: GameState, seat: number): CsBonuses {
  const capital: Partial<Yields> = {};
  const buildingAdd: CsBonuses['buildingAdd'] = {};
  for (const cityState of state.cityStates) {
    const mine = envoysOf(cityState, seat);
    const key = CITY_STATE_TYPE_YIELD[cityState.type];
    if (mine >= 1) capital[key] = (capital[key] ?? 0) + CITY_STATE_CAPITAL_BONUS;
    const { tier1, tier2 } = cityStateTierBuildings(cityState.type);
    if (mine >= 3 && tier1) {
      const cur = (buildingAdd[tier1] ??= {});
      cur[key] = (cur[key] ?? 0) + CITY_STATE_DISTRICT_BONUS;
    }
    if (mine >= 6 && tier2) {
      const cur = (buildingAdd[tier2] ??= {});
      cur[key] = (cur[key] ?? 0) + CITY_STATE_DISTRICT_BONUS;
    }
  }
  return { capital, buildingAdd };
}

/**
 * The suzerain's per-CS unique bonus, as a flat capital-yield add for
 * whichever seat holds suzerainty. The two twins differed only in the
 * seat handed to `isSuzerain`.
 */
export function cityStateSuzerainCapitalBonus(state: GameState, seat: number): Partial<Yields> {
  const out: Partial<Yields> = {};
  for (const cityState of state.cityStates) {
    if (!isSuzerain(cityState, seat)) continue;
    const key = CITY_STATE_SUZERAIN_LIVE[cityState.name];
    if (!key) continue; // descoped row
    out[key] = (out[key] ?? 0) + CITY_STATE_SUZERAIN_YIELD;
  }
  return out;
}

/** Per-turn yield gain of assigning one more envoy to `cityState` (for advisors/RL). */
export function envoyBonusDelta(state: GameState, cityState: CityState, seat: number): Yields {
  const delta = emptyYields();
  const key = CITY_STATE_TYPE_YIELD[cityState.type];
  const next = envoysOf(cityState, seat) + 1;
  if (next === 1) delta[key] += CITY_STATE_CAPITAL_BONUS;
  // The 3/6 tiers now land on cities holding the type's tier-1/tier-2
  // BUILDING (not the bare district) — count matching held buildings.
  if (next === 3 || next === 6) {
    const { tier1, tier2 } = cityStateTierBuildings(cityState.type);
    const bld = next === 3 ? tier1 : tier2;
    let count = 0;
    if (bld) {
      for (const c of citiesOf(state, seat)) if (c.buildings.includes(bld)) count += 1;
    }
    delta[key] += CITY_STATE_DISTRICT_BONUS * count;
  }
  return delta;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function assignEnvoy(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!cityState) return no('No such city-state.');
  if (!hasMet(cityState, seat)) return no('That city-state has not been met yet.');
  const s = seatOf(state, seat);
  if (!s || s.envoysAvailable <= 0) return no('No envoys available.');
  s.envoysAvailable -= 1;
  addEnvoys(cityState, seat, 1);
  return ok;
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

/**
 * ONE "is this quest done?" rule for every seat. Camps are global; the
 * route and district tests read the SEAT's own lists, which `owner` supplies
 * (omitted = seat 0, what every seat-0 call site meant). Note the quest
 * ISSUERS are deliberately NOT merged: seat 0's draws RNG and that seat's
 * is zero-draw by design (B8), and choosing a quest is policy, not a rule.
 */
export function questSatisfied(
  state: GameState,
  cityState: CityState,
  quest: CityStateQuest,
  seat: number,
  owner?: { tradeRoutes?: { toCs?: number }[]; cities: (City | City)[] },
): boolean {
  switch (quest.kind) {
    case 'clearCamp':
      return quest.campIndex !== undefined && !state.barbSeat.camps.includes(quest.campIndex);
    case 'sendTradeRoute':
      return (owner?.tradeRoutes ?? seatOf(state, seat)?.tradeRoutes ?? []).some((r) => r.toCs === cityState.id);
    case 'buildDistrict':
      return (owner?.cities ?? seatOf(state, seat)!.cities).some((c) =>
        c.districts.some(
          (d) => d.type === quest.district && state.map.tiles[d.tileIndex].districtComplete,
        ),
      );
  }
}

/**
 * ONE quest issuer for every seat, and it draws NO RNG. An issuer that rolled
 * would have to roll identically on both engines; picking deterministically (a
 * district from a flat four-item list, then a pick among the
 * satisfiable options); that seat's is deterministic and keyed to the
 * city-state's OWN type, which is both the closer read of Civ 6 and the one
 * that costs the shared RNG stream nothing. Fixed order: clearCamp ->
 * buildDistrict -> sendTradeRoute. `owner` supplies the asking seat's routes
 * and cities (omitted = seat 0). Null = nothing applies, retry next turn with
 * the questIssuedTurn clock unchanged.
 */
export function issueQuest(
  state: GameState,
  cityState: CityState,
  seat: number,
  owner?: { tradeRoutes?: { toCs?: number }[]; cities: (City | City)[] },
): CityStateQuest | null {
  const center = state.map.tiles[cityState.centerIndex];
  const cities = owner?.cities ?? seatOf(state, seat)!.cities;
  const routes = owner?.tradeRoutes ?? seatOf(state, seat)?.tradeRoutes ?? [];
  // clearCamp — the NEAREST camp within range 6, ties to the LOWEST tile
  // index (the deterministic key hexDist*(nTiles+1)+tile).
  let campIndex: number | undefined;
  let campKey = Infinity;
  const span = state.map.tiles.length + 1;
  for (const i of state.barbSeat.camps) {
    const t = state.map.tiles[i];
    const d = hexDistance(t.col, t.row, center.col, center.row);
    if (d > 6) continue;
    const key = d * span + i;
    if (key < campKey) {
      campKey = key;
      campIndex = i;
    }
  }
  if (campIndex !== undefined) return { kind: 'clearCamp', campIndex };
  // buildDistrict — the CS type's own district, unless this seat already
  // holds one completed.
  const district = CITY_STATE_TYPE_DISTRICT[cityState.type];
  const alreadyBuilt = cities.some((c) =>
    c.districts.some((d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete),
  );
  if (!alreadyBuilt) return { kind: 'buildDistrict', district };
  // sendTradeRoute — unless this seat already routes to this CS.
  if (!routes.some((r) => r.toCs === cityState.id)) return { kind: 'sendTradeRoute' };
  return null;
}

/**
 * DECLARE WAR on a city-state. Real Civ 6 treats a city-state as a
 * separate seat: you must declare before you can attack it, and peace is the
 * default. This is the verb the CS-attack mask column was blocked on — without
 * it `attackTargets` could never legally offer a city-state centre, because
 * offering a PEACEFUL one is exactly what the autopilot invariant forbids.
 *
 * NOT MODELLED, recorded rather than approximated: the diplomatic consequences
 * (grievances/warmonger penalties with other civs, the suzerain's reaction) and
 * any peace-making path back. Declaring is one-way here.
 */
export function declareWarOnCityState(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = (state.cityStates ?? []).find((c) => c.id === cityStateId);
  if (!cityState) return { ok: false, reason: 'No such city-state.' };
  if (!hasMet(cityState, seat)) return { ok: false, reason: 'You have not met this city-state.' };
  if (civsAtWar(state, cityState.seat, seat)) return { ok: false, reason: 'Already at war.' };
  setWar(state, cityState.seat, seat, true);
  state.eventLog.push(`You have declared war on ${cityState.name}!`);
  return { ok: true };
}

/**
 * SUE FOR PEACE with a city-state. SOURCED: real Civ 6 unlocks the
 * offer once 10 turns have passed since the war began, and a city-state
 * "will always accept an offer of peace without preconditions" — so there is no
 * acceptance roll here, only the cooldown. Peace resets the counter, so a
 * re-declaration must wait out the floor again.
 *
 * This is the return path `declareWarOnCityState` deliberately lacked when #45
 * landed the war state; the AUDIT entry there recorded "any peace-making path
 * back" as not modelled, and this closes it.
 */
export function sueForPeaceWithCityState(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = (state.cityStates ?? []).find((c) => c.id === cityStateId);
  if (!cityState) return { ok: false, reason: 'No such city-state.' };
  if (!civsAtWar(state, cityState.seat, seat)) return { ok: false, reason: 'Not at war.' };
  // SOURCED: a city-state is dragged into its SUZERAIN's wars and
  // cannot make separate peace while that war runs — "city states automatically
  // get peace when you either stop being at war with their suzerain or them
  // switching". So refuse here; the way out is peace with the suzerain (which
  // makePeace then forces onto every city-state it is suzerain of) or the
  // suzerainty changing hands.
  const suz = state.seats.find((civSeat) => civsAtWar(state, civSeat.seat, seat) && isSuzerain(cityState, civSeat.seat));
  if (suz) {
    return { ok: false, reason: `${cityState.name} will not talk while you are at war with its suzerain, ${suz.name}.` };
  }
  const waited = warTurnsWith(state, cityState.seat, seat);
  if (waited < WAR_MIN_TURNS) {  // #51: ONE min-war-turns rule, every seat
    return { ok: false, reason: `Too soon — they will not talk for another ${WAR_MIN_TURNS - waited} turns.` };
  }
  setWar(state, cityState.seat, seat, false);
  setWarTurnsWith(state, cityState.seat, seat, 0);
  warWearinessPeace(state, seat, seatOfCityState(cityState.id)); // #51/S7.8f
  state.eventLog.push(`You have made peace with ${cityState.name}.`);
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

  // Tick each city-state's OWN LINE of the pair clock, exactly where
  // cityStatePhase does; a major's line ticks in its own seat block, so every
  // war's two ends each move once a turn. Peace unlocks at WAR_MIN_TURNS (one
  // constant, every seat).
  for (const cityState of state.cityStates) {
    for (const foe of warsOf(state, cityState.seat)) {
      setWarTurnsWith(state, cityState.seat, foe, warTurnsWith(state, cityState.seat, foe) + 1);
    }
  }

  // Seat diplomacy — meets, influence -> envoys, quests — happens in the
  // seatPhase loop, ONE body for every seat (seat 0 included). This phase
  // is the city-states' OWN turn only.

  // Cosmetic slow growth + siege recovery.
  if (state.turn % 12 === 0) {
    for (const cityState of state.cityStates) cityState.population = Math.min(10, cityState.population + 1);
  }
  for (const cityState of state.cityStates) {
    if (cityState.hp !== undefined && cityState.hp < CITY_STATE_MAX_HP) cityState.hp = Math.min(CITY_STATE_MAX_HP, cityState.hp + 10);
  }
}
