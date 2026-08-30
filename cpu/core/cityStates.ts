
import type { City, CityState, CityStateQuest, CityStateType, GameState, Tile, Yields } from './types';
import { NO_SEAT, citiesOf, cityStateOfSeat, civsAtWar, emptySeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, setTreatyTurnsWith, setWar, setWarTurnsWith, tileSeat, treatyTurnsWith, warTurnsWith } from './seats';
import { cancelRoutes } from './trade';
import { grievanceCityStateWar } from './grievance';
import { congressSuzBonusBlocked } from './congress';
import { minorGovernorEffects } from './governors';
import { emptyYields } from './types';
import { tilesWithin, hexDistance } from '../../world/hex';
import { isWater, isImpassable, hasFreshWater } from '../../world/query';
import { nextRandom } from './rand';
import type { RuleResult } from './rules';
import { PEACE_TREATY_TURNS, WAR_MIN_TURNS } from '../data/seats';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { TERRAINS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { CITY_STATE_SUZERAIN_BONUS, REGIONAL_REACH_BONUS, type SuzEffect, CITY_STATE_TYPES, CITY_STATE_TYPE_YIELD, CITY_STATE_TYPE_BUILDINGS, CITY_STATE_NAMES, CITY_STATE_MAX_HP, CITY_STATE_CAPITAL_BONUS, CITY_STATE_DISTRICT_BONUS, CITY_STATE_SUZERAIN_LIVE, CITY_STATE_SUZERAIN_YIELD, CITY_STATE_SUZERAIN_PEACE_ONLY, SUZERAIN_ENVOYS, CITY_STATE_TYPE_DISTRICT } from '../data/cityStates';
import { REGIONAL_RANGE } from '../data/constants';
import { warWearinessPeace } from './weariness';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const CITY_STATE_SPACING = 8;


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

export function placeCityStateAt(
  state: GameState,
  id: number,
  name: string,
  type: CityStateType,
  centerIndex: number,
): CityState {
  const tile = state.map.tiles[centerIndex];
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(id)),
    id,
    name,
    type,
    centerIndex,
    population: 3,
    envoys: {},
    met: [],
    suzerain: -1,
  };
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (tileSeat(t) === NO_SEAT) setTileOwner(t, seatOfCityState(cityState.id));
  }
  setTileOwner(tile, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  // the ROSTER width, which capture must not shrink — the war head's minor
  // columns and the observation's minor block are both sized off it.
  state.cityStateMax = Math.max(state.cityStateMax ?? 0, id + 1);
  return cityState;
}


export function cityStateAt(state: GameState, tileIndex: number): CityState | undefined {
  const _s = tileSeat(state.map.tiles[tileIndex]);
  const cityStateId = isCityStateSeat(_s) ? cityStateOfSeat(_s) : -1;
  return cityStateId === -1 ? undefined : state.cityStates.find((cityState) => cityState.id === cityStateId);
}

export function metCityStates(state: GameState, seat: number): CityState[] {
  return state.cityStates.filter((cityState) => hasMet(cityState, seat));
}

/**
 * The city-state with this ID, or undefined once it has been captured.
 *
 * Every wire field that names a city-state names its ID, never its position
 * in `state.cityStates` — capture REMOVES the entry, so a position addresses
 * a different minor afterwards while the ID keeps meaning what it meant. The
 * GPU's `S` columns are id-indexed for the same reason.
 */
export function cityStateById(state: GameState, id: number): CityState | undefined {
  return (state.cityStates ?? []).find((cityState) => cityState.id === id);
}

export function envoysOf(cityState: CityState, seat: number): number {
  return cityState.envoys[seat] ?? 0;
}

/**
 * The envoys `seat` effectively holds here — the store plus whatever governor
 * it has posted at this minor. CIV6 (Amani, Messenger): "Can be assigned to a
 * City-state, where she acts as 2 Envoys"; (Puppeteer) "While established in a
 * city-state, doubles the number of Envoys you have there" — she is part of
 * the number she doubles.
 *
 * `envoysOf` stays the STORE. This is the count every question about who
 * LEADS and what a seat has EARNED here asks: the suzerain contest both ways,
 * the 1/3/6 bonus tiers and the driver's own next-envoy preview. What still
 * asks the store is what asks about the act of sending one — the emergency's
 * "must have met and sent an Envoy", the first-envoy double, and the
 * Congress's own envoy-count context.
 */
export function envoysWith(state: GameState, cityState: CityState, seat: number, raw: number): number {
  let n = raw;
  let dbl = false;
  for (const e of minorGovernorEffects(state, seat, cityState.id)) {
    n += e.envoysAtMinor ?? 0;
    dbl = dbl || e.envoyDoubleAtMinor === true;
  }
  return dbl ? n * 2 : n;
}

export function envoysHere(state: GameState, cityState: CityState, seat: number): number {
  return envoysWith(state, cityState, seat, envoysOf(cityState, seat));
}

/** Everyone the contest has to weigh: every seat in the world, since a posted
 *  governor counts here without an envoy in the ledger, plus every ledger
 *  entry, since that is the store the contest was always over. */
function contenders(state: GameState, cityState: CityState): number[] {
  const out = new Set<number>(Object.keys(cityState.envoys).map(Number));
  for (const sx of state.seats) out.add(sx.seat);
  return [...out].sort((a, b) => a - b);
}

/** Every distinct LUXURY resource in this minor's territory. CIV6 (Affluence):
 *  "While established in a city-state, provides a copy of its Luxury resources
 *  to you." A minor improves nothing here, so the copy is the ground's own
 *  resource — asking for the improvement would make the promotion a permanent
 *  no-op. */
export function minorLuxuries(state: GameState, cityState: CityState): string[] {
  const out = new Set<string>();
  const owner = seatOfCityState(cityState.id);
  for (const t of state.map.tiles) {
    if (!t.resource || tileSeat(t) !== owner) continue;
    if (RESOURCES[t.resource]?.category === 'luxury') out.add(t.resource);
  }
  return [...out].sort();
}

export function hasMet(cityState: CityState, seat: number): boolean {
  return cityState.met.includes(seat);
}

export function setMet(cityState: CityState, seat: number): void {
  if (!cityState.met.includes(seat)) cityState.met.push(seat);
}

export function addEnvoys(state: GameState, cityState: CityState, seat: number, n = 1): void {
  cityState.envoys[seat] = (cityState.envoys[seat] ?? 0) + n;
  resolveSuzerain(state, cityState);
}

/** The stored contest answer, -1 while nobody holds it. */
export function suzerainOf(cityState: CityState): number {
  return cityState.suzerain ?? -1;
}

/**
 * Refresh the STORED suzerain from the envoy record — every envoy write ends
 * here, so a rule that reweights envoys BY the suzerain (Containment) reads a
 * fixed point instead of re-running the contest mid-mutation. `isSuzerain`
 * stays the live contest; the two agree at every write boundary.
 */
export function resolveSuzerain(state: GameState, cityState: CityState): void {
  let best = -1;
  let bestN = 0;
  let tied = false;
  for (const seat of contenders(state, cityState)) {
    const n = envoysHere(state, cityState, seat);
    if (n > bestN) {
      bestN = n;
      best = seat;
      tied = false;
    } else if (n === bestN && n > 0) {
      tied = true;
    }
  }
  cityState.suzerain = bestN >= SUZERAIN_ENVOYS && !tied ? best : -1;
}

/**
 * The suzerain CONTEST — most envoys, minimum 3, STRICTLY more than every
 * OTHER seat (real Civ 6: a tie leaves no suzerain).
 *
 * Whoever asks is "mine"; every other entry in the store is the field.
 */
export function isSuzerain(state: GameState, cityState: CityState, seat: number): boolean {
  const mine = envoysHere(state, cityState, seat);
  if (mine < SUZERAIN_ENVOYS) return false;
  return contenders(state, cityState).every((c) => c === seat || mine > envoysHere(state, cityState, c));
}

/**
 * Does `seat` hold a suzerain whose perk is the RULE `effect`? The perks that
 * are rules rather than flat capital yields carry a `suz` code in
 * CITY_STATE_SUZERAIN_BONUS; every rule site asks this one question.
 */
export function suzerainEffect(state: GameState, seat: number, effect: SuzEffect): boolean {
  for (const cityState of state.cityStates ?? []) {
    if (!isSuzerain(state, cityState, seat) || suzerainBonusBlocked(state, cityState)) continue;
    if (CITY_STATE_SUZERAIN_BONUS[cityState.name]?.suz === effect) return true;
  }
  return false;
}

/** SOVEREIGNTY outcome B: a minor of the named TYPE provides no unique
 *  suzerain bonus to anyone. */
export function suzerainBonusBlocked(state: GameState, cityState: CityState): boolean {
  return congressSuzBonusBlocked(state, CITY_STATE_TYPES.indexOf(cityState.type));
}

/** CIV 6, Mexico City's suzerain: "Regional effects from your Industrial Zone,
 *  Entertainment Complex and Water Park districts reach 3 tiles farther." */
export function regionalReach(state: GameState, seat: number): number {
  return REGIONAL_RANGE + (suzerainEffect(state, seat, 'regionalReach') ? REGIONAL_REACH_BONUS : 0);
}

export function cityStateTradeCapacityBonus(state: GameState, seat: number): number {
  return state.cityStates.filter((cityState) => cityState.type === 'trade' && isSuzerain(state, cityState, seat)).length;
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

function cityStateTierBuildings(type: GameState['cityStates'][number]['type']): {
  tier1?: string;
  tier2?: string;
} {
  const list = CITY_STATE_TYPE_BUILDINGS[type];
  return { tier1: list[0], tier2: list[1] };
}

export function cityStateEnvoyBonuses(state: GameState, seat: number): CsBonuses {
  const capital: Partial<Yields> = {};
  const buildingAdd: CsBonuses['buildingAdd'] = {};
  for (const cityState of state.cityStates) {
    const mine = envoysHere(state, cityState, seat);
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

export function cityStateSuzerainCapitalBonus(state: GameState, seat: number): Partial<Yields> {
  const out: Partial<Yields> = {};
  const atWar = state.seats.some((s) => s.seat !== seat && civsAtWar(state, seat, s.seat));
  for (const cityState of state.cityStates) {
    if (!isSuzerain(state, cityState, seat) || suzerainBonusBlocked(state, cityState)) continue;
    if (atWar && CITY_STATE_SUZERAIN_PEACE_ONLY.includes(cityState.name)) continue;
    const key = CITY_STATE_SUZERAIN_LIVE[cityState.name];
    if (!key) continue; // descoped row
    out[key] = (out[key] ?? 0) + CITY_STATE_SUZERAIN_YIELD;
  }
  return out;
}

export function envoyBonusDelta(state: GameState, cityState: CityState, seat: number): Yields {
  const delta = emptyYields();
  const key = CITY_STATE_TYPE_YIELD[cityState.type];
  const now = envoysHere(state, cityState, seat);
  const next = envoysWith(state, cityState, seat, envoysOf(cityState, seat) + 1);
  if (now < 1 && next >= 1) delta[key] += CITY_STATE_CAPITAL_BONUS;
  // a doubled posting can cross BOTH building tiers on one envoy
  const { tier1, tier2 } = cityStateTierBuildings(cityState.type);
  for (const [bar, bld] of [[3, tier1], [6, tier2]] as const) {
    if (now >= bar || next < bar || !bld) continue;
    let count = 0;
    for (const c of citiesOf(state, seat)) if (c.buildings.includes(bld)) count += 1;
    delta[key] += CITY_STATE_DISTRICT_BONUS * count;
  }
  return delta;
}


export function assignEnvoy(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!cityState) return no('No such city-state.');
  if (!hasMet(cityState, seat)) return no('That city-state has not been met yet.');
  const s = seatOf(state, seat);
  if (!s || s.envoysAvailable <= 0) return no('No envoys available.');
  s.envoysAvailable -= 1;
  addEnvoys(state, cityState, seat, 1);
  return ok;
}


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
  const district = CITY_STATE_TYPE_DISTRICT[cityState.type];
  const alreadyBuilt = cities.some((c) =>
    c.districts.some((d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete),
  );
  if (!alreadyBuilt) return { kind: 'buildDistrict', district };
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
 * CIV6 pays the minor's patrons for it: "War declared on a city-state a civ
 * is the Suzerain over: 100", and "War declared on a city-state friend or
 * ally: 50 (to every civ that has at least 1 Envoy in that city-state, but is
 * not its Suzerain)". `sueForPeaceWithCityState` below is the inverse verb.
 */
export function declareWarOnCityState(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = (state.cityStates ?? []).find((c) => c.id === cityStateId);
  if (!cityState) return { ok: false, reason: 'No such city-state.' };
  if (!hasMet(cityState, seat)) return { ok: false, reason: 'You have not met this city-state.' };
  if (civsAtWar(state, cityState.seat, seat)) return { ok: false, reason: 'Already at war.' };
  const bound = treatyTurnsWith(state, cityState.seat, seat);
  if (bound > 0) return { ok: false, reason: `The peace treaty binds for another ${bound} turns.` };
  setWar(state, cityState.seat, seat, true);
  // CIV6: war cancels the routes with the new enemy; the Traders return.
  cancelRoutes(state, seat, (r) => r.toCs === cityStateId);
  grievanceCityStateWar(
    state, seat,
    state.seats.find((s) => isSuzerain(state, cityState, s.seat))?.seat ?? -1,
    state.seats.filter((s) => (cityState.envoys[s.seat] ?? 0) > 0).map((s) => s.seat),
  );
  state.eventLog.push(`You have declared war on ${cityState.name}!`);
  return { ok: true };
}

/**
 * SUE FOR PEACE with a city-state. SOURCED: real Civ 6 unlocks the
 * offer once 10 turns have passed since the war began, and a city-state
 * "will always accept an offer of peace without preconditions" — so there is no
 * acceptance roll here, only the cooldown. The treaty it stamps binds a
 * re-declaration for PEACE_TREATY_TURNS.
 */
export function sueForPeaceWithCityState(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = (state.cityStates ?? []).find((c) => c.id === cityStateId);
  if (!cityState) return { ok: false, reason: 'No such city-state.' };
  if (!civsAtWar(state, cityState.seat, seat)) return { ok: false, reason: 'Not at war.' };
  const suz = state.seats.find((civSeat) => civsAtWar(state, civSeat.seat, seat) && isSuzerain(state, cityState, civSeat.seat));
  if (suz) {
    return { ok: false, reason: `${cityState.name} will not talk while you are at war with its suzerain, ${suz.name}.` };
  }
  const waited = warTurnsWith(state, cityState.seat, seat);
  if (waited < WAR_MIN_TURNS) {  // ONE min-war-turns rule, every seat
    return { ok: false, reason: `Too soon — they will not talk for another ${WAR_MIN_TURNS - waited} turns.` };
  }
  setWar(state, cityState.seat, seat, false);
  setWarTurnsWith(state, cityState.seat, seat, 0);
  setTreatyTurnsWith(state, cityState.seat, seat, PEACE_TREATY_TURNS);
  warWearinessPeace(state, seat, seatOfCityState(cityState.id));
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

  if (state.turn % 12 === 0) {
    for (const cityState of state.cityStates) cityState.population = Math.min(10, cityState.population + 1);
  }
  for (const cityState of state.cityStates) {
    if (cityState.hp !== undefined && cityState.hp < CITY_STATE_MAX_HP) cityState.hp = Math.min(CITY_STATE_MAX_HP, cityState.hp + 10);
  }
  for (const cityState of state.cityStates) minorResearch(cityState);
}

/**
 * CIV6 (City-state): a minor "develops scientifically and culturally... it
 * will apparently research certain techs which will allow it to progress" —
 * the record is real, the pace unpublished. Model: POPULATION points a turn
 * into each pot; the cheapest available row completes (table order on a
 * price tie), at most one per pot per turn. Early Empire is the row
 * `borderClosedTo` reads.
 */
function minorResearch(cityState: CityState): void {
  const r = cityState.research;
  r.techProgress += cityState.population;
  r.civicProgress += cityState.population;
  const tech = cheapestAvailable(TECHS, r.techs);
  if (tech && r.techProgress >= TECHS[tech].cost) {
    r.techProgress -= TECHS[tech].cost;
    r.techs.push(tech);
  }
  const civic = cheapestAvailable(CIVICS, r.civics);
  if (civic && r.civicProgress >= CIVICS[civic].cost) {
    r.civicProgress -= CIVICS[civic].cost;
    r.civics.push(civic);
  }
}

function cheapestAvailable(
  catalog: Record<string, { cost: number; prereqs: string[] }>,
  have: string[],
): string | null {
  let best: string | null = null;
  for (const [id, def] of Object.entries(catalog)) {
    if (have.includes(id)) continue;
    if (!def.prereqs.every((p) => have.includes(p))) continue;
    if (!best || def.cost < catalog[best].cost) best = id;
  }
  return best;
}
