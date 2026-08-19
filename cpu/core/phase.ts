
import type { City, DistrictId, GameState, ImprovementId, SeatActionRecord, Seat, Tile, Unit } from './types';
import { advanceGreatPeople } from './greatPeople';
import { completeQueueItem } from './production';
import { isExplored, revealAround } from './fog';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { nextRandom } from './rand';
import { seatAccumulators, seatGrowth, commitProduction } from './seatTurn';
import { spawnUnit, unitsAt, unitsHostile, unitDomain, encampmentIntact, layTradeRoad, stepUnit, unitFullMoves, ownerHasTech, tileFreeForUnit } from './units';
import { PILLAGE_HEAL_IMPROVEMENTS } from './combat';  // the replay's pillage arm mirrors hostileUnitAct's
import { UNIT_HP } from '../data/units';
import { meleeAttack, rangedAttack, hostileRangedStrike, damageRoll, terrainDefense, woundPenalty, supportCount, SUPPORT_CS, xpLevelBonus, awardDefenseXp, encampmentTrainXp, generalAuraCS, cityDefenseStrength } from './combat';
import { availableTechsIn, availableCivicsIn, computeUnlocksIn, type Unlocks } from './effects';
import { detectBoosts, effectiveResearchCostIn } from './boosts';
import { selectResearch } from './economy';
import { getModifiers } from './effects';
import { routeYields, cityStateRouteYields, TRADE_ROUTE_RANGE, TRADE_ROUTE_DURATION, tradeCapacity } from './trade';
import { addEnvoys, hasMet, isSuzerain, issueQuest, questSatisfied, setMet } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN, INFLUENCE_PER_TURN, ENVOY_COST, GOV_INFLUENCE_TIER, QUEST_COOLDOWN, QUEST_ENVOYS } from '../data/cityStates';
import { computeAdoption } from './effects';
import { GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import type { RuleResult } from './rules';
import { TERRAINS } from '../../world/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { prodLayout } from './prodLayout';   // ONE column layout, shared with the exporter
import { CIVICS } from '../data/civics';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { UNITS, CITY_HEAL_PER_TURN, WALLS_HP, ENCAMPMENT_HP, CITY_MAX_HP } from '../data/units';
import { generalAuraMP } from './aura'; // the aura's +1 MP half
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, PANTHEON_FAITH_COST, RELIGION_NAMES } from '../data/religion';
import { CITY_WORK_RADIUS, GAME_SPEED, GOLD_PURCHASE_MULT, borderGrowthCost, EMBARKED_DEFENSE_CS } from '../data/constants';
import type { CityStats } from './city';
import { civEraIndex, computeCityStats, luxuryAmenities, pickBorderTile, acquireTile } from './city';
import { canPlaceDistrictIn, validImprovementsIn, wonderExists } from './rules';
import { hasRiver, hasFreshWater, isCoastalWater } from '../../world/query';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { disbandUnit, builderCost, builderRemoveFeature, trainableUnits } from './units';
import { killUnit } from './combat';
import { availableProjects, buyTile, buyWorshipBuilding, districtCostIn, districtDiscounted, foundCity, foundCityAt, goldAffordable, isEncampmentItem, purchaseCivilianWithFaith, purchaseReligiousUnit, purchaseSettler, queueProject, settlerCost } from './game';
import { DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import { IMPROVEMENT_IDS, DEDICATED_IMPROVEMENTS, unitActionIndex } from './unitActions';

const A_FOUND_CITY = unitActionIndex(IMPROVEMENT_IDS).FOUND_CITY;
import { ALLY_MIN_PEACE, CIV_LEADERS, FORMAL_WAR_MIN_TURNS, MAX_CITIES_PER_SEAT, WAR_MIN_TURNS, PEACE_TREATY_TURNS, PEACE_GOLD_COST, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, ERA_SCORE_CONQUER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, GOVERNOR_LOYALTY, WARMONGER_DOW, WARMONGER_CAPTURE, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION } from '../data/seats';
import { addEraScore, agePressureFactor, governorPicks, governorTitles, goldenBoostBonus } from './eras';
import { NO_SEAT, atWarWithAny, citiesOf, civHasStrategic, civsAtWar, emptySeat, isCiv, prophetsOf, seatOf, seatOfCityState, seatsAllied, setAllied, setTileOwner, setWar, setWarFormal, setTreatyTurnsWith, setWarTurnsWith, tileBelongsTo, tileCity, tileClaimed, tileOwnedByCiv, tileSeat, unitSeat, unitsOf, treatyTurnsWith, warTurnsWith, warsOf } from './seats';
import { warWearinessBattle, warWearinessPeace, warWearinessTurn } from './weariness';
import { snipeRing, spreadFromUnit } from './unitOrders';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const CIV_SPACING = 10;

/** The military units a scripted seat may gold-buy — the
 * same roster the production picker trains (WARRIOR/SLINGER ungated; the rest
 * on that seat's real techs), in UNITS-table order so strict `>` on combat
 * breaks ties to the lowest-index type (the GPU argmax mirror; HORSEMAN
 * precedes SWORDSMAN so the 36-combat tie keeps HORSEMAN). BUILDER/SCOUT are
 * excluded — never in the seat roster. requiresResource is gated in the buy
 * loop (data-driven off the catalog, verified there). */
export const BUY_UNITS: { id: string; tech?: string }[] = [
  { id: 'WARRIOR' },
  { id: 'SLINGER' },
  { id: 'ARCHER', tech: 'ARCHERY' },
  { id: 'SPEARMAN', tech: 'BRONZE_WORKING' },
  { id: 'HORSEMAN', tech: 'HORSEBACK_RIDING' },
  { id: 'SWORDSMAN', tech: 'IRON_WORKING' },
  { id: 'PIKEMAN', tech: 'MILITARY_TACTICS' },
  { id: 'CROSSBOWMAN', tech: 'MACHINERY' },
  { id: 'KNIGHT', tech: 'STIRRUPS' },
  { id: 'MUSKETMAN', tech: 'GUNPOWDER' },
];




/**
 * The seats a row's WAR HEAD addresses, in ascending seat order — every OTHER
 * major, so the head is one column per OPPONENT for every seat and column k
 * means the same kind of thing whoever asks. The GPU's `war_targets(row)`
 * twin.
 */
export function warTargets(state: GameState, seat: number): number[] {
  return state.seats.map((s) => s.seat).filter((s) => s !== seat);
}

function siteQuality(state: GameState, tile: Tile): number {
  if (isWater(tile) || isImpassable(tile)) return -1;
  if (tile.wonder || tile.feature === 'OASIS' || tile.district) return -1;
  if (tileClaimed(tile)) return -1;
  let q = hasFreshWater(state.map, tile) ? 8 : 0;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 2)) {
    if (isWater(t) || isImpassable(t) || tileClaimed(t)) continue;
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

export function nextCityName(actor: Seat): string {
  const leader = CIV_LEADERS.find((l) => l.name === actor.name);
  const names = leader?.cityNames ?? [actor.name];
  const n = actor.nextCityId;
  return n < names.length ? names[n] : `${names[0]} ${n + 1}`;
}

export function placeSeats(state: GameState, count?: number): void {
  const land = state.map.tiles.filter((t) => !isWater(t) && !isImpassable(t)).length;
  const target = Math.min(
    CIV_LEADERS.length,
    count ?? Math.max(1, Math.min(3, Math.round(land / 350))),
  );

  const scored = state.map.tiles
    .map((t) => ({ t, q: siteQuality(state, t) }))
    .filter((s) => s.q > 0)
    .sort((a, b) => b.q - a.q || a.t.index - b.t.index);

  const picked: Tile[] = [];
  for (const { t } of scored) {
    if (picked.length >= target) break;
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < CIV_SPACING)) continue;
    if (
      state.cityStates.some((cityState) => {
        const c = state.map.tiles[cityState.centerIndex];
        return hexDistance(c.col, c.row, t.col, t.row) < 8;
      })
    ) {
      continue;
    }
    picked.push(t);
  }

  picked.forEach((tile, i) => {
    const leader = CIV_LEADERS[i % CIV_LEADERS.length];
    const actor: Seat = {
      ...emptySeat(state.seats.length),
      name: leader.name,
      color: leader.color,
      aggression: 0.3 + nextRandom(state) * 0.6,
    };
    foundCityAt(state, actor.seat, tile, actor);  // one founding mutation, every seat
    // Push BEFORE the starting warrior spawns, so spawnUnit's bestMeleeCS
    // chokepoint can find the seat — "strongest melee ever FIELDED" includes
    // the starting army (defense 20 from turn 0; the GPU seeds
    // civ_best_melee from the fixture pools).
    state.seats.push(actor);
    spawnUnit(state, 'WARRIOR', tile.index, actor.seat);
  });
}



/**
 * Rough military strength: 8 per city plus the combat of every unit, rounded.
 *
 * ONE text for every seat. This is our own heuristic, not a Civ 6 rule, so the
 * only thing that matters is that a single number answers for everybody —
 * anything else makes identical empires score differently depending on which
 * seat asks, and the DoW comparison puts the two side by side against a 1.3x
 * bar.
 */
export function seatStrength(state: GameState, seat: number): number {
  let s = citiesOf(state, seat).length * 8;
  for (const u of unitsOf(state, seat)) s += UNITS[u.type]?.combat ?? 0;
  return Math.round(s);
}


function nearestDistance(state: GameState, a: number, bs: number[]): number {
  const at = state.map.tiles[a];
  let best = Infinity;
  for (const b of bs) {
    const bt = state.map.tiles[b];
    best = Math.min(best, hexDistance(at.col, at.row, bt.col, bt.row));
  }
  return best;
}

export function seatProximity(state: GameState, a: number, b: number): number {
  const ca = citiesOf(state, a);
  const cb = citiesOf(state, b);
  if (ca.length === 0 || cb.length === 0) return Infinity;
  let best = Infinity;
  for (const c of ca) {
    best = Math.min(best, nearestDistance(state, c.centerIndex, cb.map((o) => o.centerIndex)));
  }
  return best;
}


export function declareWar(state: GameState, actorSeat: number, seat: number): RuleResult {
  const actor = seatOf(state, actorSeat);
  if (!actor) return no('No such civilization.');
  if (civsAtWar(state, actor.seat, seat)) return no('Already at war.');
  const bound = treatyTurnsWith(state, actor.seat, seat);
  if (bound > 0) return no(`The peace treaty binds for another ${bound} turns.`);
  setWar(state, actor.seat, seat, true);
  setWarTurnsWith(state, actor.seat, seat, 0);
  seatOf(state, seat)!.warmonger = (seatOf(state, seat)!.warmonger ?? 0) + WARMONGER_DOW;
  state.eventLog.push(`War declared on ${actor.name}!`);
  return ok;
}

export function sueForPeace(state: GameState, actorSeat: number, seat: number): RuleResult {
  const actor = seatOf(state, actorSeat);
  if (!actor) return no('No such civilization.');
  if (!civsAtWar(state, actor.seat, seat)) return no('Not at war.');
  const waited = warTurnsWith(state, actor.seat, seat);
  if (waited < WAR_MIN_TURNS) {  // one min-war-turns constant, THIS war's
    return no(`Too soon — they will not talk for another ${WAR_MIN_TURNS - waited} turns.`);
  }
  const cost = PEACE_GOLD_COST(waited);
  if (!state.sandbox) {
    if (!goldAffordable(seatOf(state, seat)!.treasury, cost)) return no(`Peace costs ${cost} gold right now.`);
    seatOf(state, seat)!.treasury -= cost;
  }
  makePeace(state, actor, seat);
  return ok;
}

function makePeace(state: GameState, actor: Seat, foe: number): void {
  setWar(state, actor.seat, foe, false);
  setWarFormal(state, actor.seat, foe, false);
  warWearinessPeace(state, foe, actor.seat);
  setWarTurnsWith(state, actor.seat, foe, 0);
  setTreatyTurnsWith(state, actor.seat, foe, PEACE_TREATY_TURNS);
  actor.peaceTurns = 0;
  const foeSeat = seatOf(state, foe);
  if (foeSeat && 'peaceTurns' in foeSeat) (foeSeat as Seat).peaceTurns = 0;
  for (const cityState of state.cityStates ?? []) {
    for (const [patron, opponent] of [[actor.seat, foe], [foe, actor.seat]] as const) {
      if (civsAtWar(state, cityState.seat, opponent) && isSuzerain(cityState, patron)) {
        setWar(state, cityState.seat, opponent, false);
        setWarTurnsWith(state, cityState.seat, opponent, 0);
        setTreatyTurnsWith(state, cityState.seat, opponent, PEACE_TREATY_TURNS);
        warWearinessPeace(state, opponent, seatOfCityState(cityState.id));
        state.eventLog.push(`${cityState.name} makes peace alongside its suzerain.`);
      }
    }
  }
  state.eventLog.push(`Peace with ${actor.name}.`);
}

export function levyUnits(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!cityState) return no('No such city-state.');
  if (cityState.type !== 'militaristic') return no('Only militaristic city-states levy troops.');
  if (!isSuzerain(cityState, seat)) return no('You must be suzerain (3+ envoys).');
  const since = state.turn - (cityState.lastLevyTurn ?? -LEVY_COOLDOWN);
  if (since < LEVY_COOLDOWN) {
    return no(`Their troops are spent — ready in ${LEVY_COOLDOWN - since} turns.`);
  }
  if (!state.sandbox) {
    if (!goldAffordable(seatOf(state, seat)!.treasury, LEVY_GOLD_COST)) return no(`Levy costs ${LEVY_GOLD_COST} gold.`);
    seatOf(state, seat)!.treasury -= LEVY_GOLD_COST;
  }
  const type = state.turn > 60 ? 'SPEARMAN' : 'WARRIOR';
  for (let i = 0; i < LEVY_UNITS; i++) {
    spawnUnit(state, type, cityState.centerIndex, seat);
  }
  cityState.lastLevyTurn = state.turn;
  state.eventLog.push(`${cityState.name} levies ${LEVY_UNITS} ${type === 'SPEARMAN' ? 'spearmen' : 'warriors'} to your cause.`);
  return ok;
}


export function loyaltyDelta(state: GameState, city: City, amenityTierName: string): number {
  const here = state.map.tiles[city.centerIndex];
  const pressureFrom = (cities: City[]): number => {
    let sub = 0;
    for (const c of cities) {
      const t = state.map.tiles[c.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) sub += c.population * (LOYALTY_RANGE + 1 - d);
    }
    return sub;
  };
  let own = 0;
  let foreign = 0;
  for (const s of state.seats) {
    const sub = pressureFrom(s.cities) * agePressureFactor(state, s.seat);
    if (s.seat === city.seat) own += sub;
    else foreign += sub;
  }
  const pressure =
    own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
  return pressure + (LOYALTY_AMENITY[amenityTierName] ?? 0);
}

/**
 * Apply a turn of loyalty to `city` (called from endTurn with the stats it
 * already computed). Returns true when the city has hit 0 and must flip.
 */
export function applyLoyalty(state: GameState, city: City, amenityTierName: string, govBonus = 0): boolean {
  if (!state.seats.some((s) => s.seat !== city.seat && s.cities.length > 0)) return false;
  if (city.isCapital) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyDelta(state, city, amenityTierName) + govBonus;
  city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
  return city.loyalty <= 0;
}

export function flipCity(state: GameState, city: City): void {
  const here = state.map.tiles[city.centerIndex];
  let winner: Seat | null = null;
  let best = -1;
  for (const s of state.seats) {
    if (s.seat === city.seat) continue;
    let pressure = 0;
    for (const c of s.cities) {
      const t = state.map.tiles[c.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) pressure += c.population * (LOYALTY_RANGE + 1 - d);
    }
    if (pressure > best) {
      best = pressure;
      winner = s;
    }
  }
  if (!winner) return;
  transferCity(state, city.seat, winner, city, 'loyalty collapsed');
}

/**
 * PALACE RELOCATION. Real Civ 6 does not leave a civ
 * capital-less when its capital falls — the Palace is rebuilt in the surviving
 * city with the HIGHEST POPULATION (ties → acquisition order, which is this
 * array's own order, so a strict `>` keeps the earliest). Call this on the
 * LOSER's city list immediately after a city leaves it, by capture, loyalty
 * defection or raze; it is a no-op while a capital is still held.
 *
 * each seat's `capitalTile` is deliberately NOT touched: it is the STATIC domination
 * record, and real Civ 6 agrees — the ORIGINAL capital remains the
 * domination target while the relocated Palace carries the capital BONUSES
 * (recapturing the original yields an "Original Capital" plus a "New Capital").
 * Both engines therefore relocate the BUILDING and the isCapital FLAG only.
 */
export function relocatePalace(
  cities: { isCapital: boolean; population: number; buildings: string[] }[],
): void {
  if (cities.length === 0) return; // civ eliminated — nothing to crown
  if (cities.some((c) => c.isCapital)) return; // capital still held
  let best = cities[0];
  for (const c of cities) if (c.population > best.population) best = c;
  best.isCapital = true;
  if (!best.buildings.includes('PALACE')) best.buildings.push('PALACE');
}









/** Queue the district the record names, ON THE TILE THE RECORD NAMES.
 *
 * This engine does NOT choose the plot: WHERE a district goes is a decision,
 * it rides the wire, and this body only re-validates it. Two scans that had to
 * agree forever are one recorded number now. Returns false when the named tile
 * cannot take it. */
export function placeSeatDistrict(
  state: GameState,
  actor: Seat,
  civCity: City,
  id: DistrictId,
  unlocks: Unlocks,
  tileIndex: number,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return false;
  const owns = (t: Tile) => tileBelongsTo(t, civCity);
  if (tile.improvement) return false;
  if (!canPlaceDistrictIn(state, civCity, id, tileIndex, { unlocks, ownsTile: owns }).ok) return false;
  // CIV6: the Spaceport's cost is FLAT — no research scaling, no discount.
  const base = districtCostIn(actor.research);
  const cost = DISTRICTS[id]?.fixedCost
    ? Math.round(DISTRICTS[id].cost * GAME_SPEED)
    : districtDiscounted(state, actor.seat, id, { unlocks, cities: actor.cities })
      ? Math.floor(base * 0.6)
      : base;
  tile.district = id;
  tile.districtComplete = false;
  tile.improvement = null;
  // CIV6: a district paves every feature EXCEPT floodplains — the feature
  // stays under the district (GS floods damage districts built on them; the
  // Dam exists for exactly that), and the flood-target pick draws from it.
  tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
  // Placement removes a bonus resource (real Civ 6 rule; canPlaceDistrictIn
  // already refused luxury/strategic).
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
  civCity.districts.push({ type: id, tileIndex });
  commitProduction(state, civCity.seat, civCity, { kind: 'district', district: id, tileIndex, progress: 0, cost });
  return true;
}



/** queue ONE named wonder — the tryQueueWonder body for a single
 * def, shared by the scripted chain above and the driven replay. Re-validates
 * EVERYTHING (unlock, one-per-world, placement): one-per-world is CROSS-SEAT,
 * so a column legal at record time can have been claimed by any civ by apply
 * time — the replay refuses rather than double-building. The capital gate
 * stays OUT: it is the scripted picker's heuristic,
 * and real Civ 6 lets any city raise any unlocked wonder. */
export function placeSeatWonder(state: GameState, actor: Seat, civCity: City, def: BuiltWonderDef): boolean {
  const civ = actor.seat;
  const center = state.map.tiles[civCity.centerIndex];
  {
    if (wonderExists(state, def.id)) return false;
    if (def.requiresTech && !actor.research.techs.includes(def.requiresTech)) return false;
    if (def.requiresCivic && !actor.research.civics.includes(def.requiresCivic)) return false;
    const p = def.placement;
    const cands = tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)
      .filter((t) => {
        if (!tileOwnedByCiv(t, civ) || !tileBelongsTo(t, civCity) || t.index === civCity.centerIndex) return false;
        if (t.district || t.builtWonder || t.wonder) return false;
        if (isImpassable(t)) return false;
        if (t.resource && RESOURCES[t.resource].category !== 'bonus') return false;
        if (p.onCoastalWater) {
          if (!isCoastalWater(state.map, t)) return false;
        } else {
          if (isWater(t)) return false;
          if (t.feature === 'FLOODPLAINS' && !p.allowFloodplains) return false;
          if (t.feature === 'OASIS') return false;
          if (p.terrains && !p.terrains.includes(t.terrain)) return false;
          if (p.flatOnly && t.elevation !== 'FLAT') return false;
          if (p.hillsOnly && t.elevation !== 'HILLS') return false;
        }
        if (p.requiresRiver && !hasRiver(t)) return false;
        const around = neighbors(state.map, t);
        if (p.adjacentDistrict && !around.some((n) => n.district === p.adjacentDistrict && n.districtComplete)) return false;
        if (p.adjacentResource && !around.some((n) => n.resource === p.adjacentResource)) return false;
        return true;
      })
      .sort((a, b) => a.index - b.index);
    const tile = cands[0];
    if (!tile) return false;
    tile.builtWonder = def.id;
    tile.builtWonderComplete = false;
    tile.improvement = null;
    tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
    if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
    civCity.wonders.push({ id: def.id, tileIndex: tile.index });
    commitProduction(state, civCity.seat, civCity, { kind: 'wonder', wonder: def.id, tileIndex: tile.index, progress: 0 });
    return true;
  }
}

export function queueSeatProject(state: GameState, civCity: City, projId: string): boolean {
  if (!availableProjects(state, civCity).some((p) => p.id === projId)) return false;
  return queueProject(state, civCity.id, projId, civCity.seat).ok;
}










/**
 * The WORLD CONGRESS session. Convenes at every CONGRESS_INTERVAL
 * turn once ANY civ has reached CONGRESS_MIN_ERA (Medieval), and runs one
 * resolution: every civ commits ALL its DIPLOMATIC FAVOR as votes, the largest
 * commitment wins and takes DVP_PER_RESOLUTION Diplomatic Victory Points, and
 * every commitment is spent. Ties go to the greater PERCENTAGE of favor spent
 * (always 100% while there is no chooser — see the constants' comment), then to
 * the lowest unified civ id.
 *
 * A civ with ZERO favor casts no vote and cannot win; if nobody has favor the
 * session still counts but awards nothing. Zero-draw and integer-only: the
 * outcome is a pure function of state, never a roll. Called from endTurn right
 * after eraBoundary, the same position the GPU mirrors.
 */
export function worldCongress(state: GameState): void {
  if (state.turn % CONGRESS_INTERVAL !== 0) return;
  if (!state.seats.some((sx) => civEraIndex(sx.research.techs, sx.research.civics) >= CONGRESS_MIN_ERA)) return;
  state.congressSessions = (state.congressSessions ?? 0) + 1;
  const votes = state.seats.map((sx) => sx.diplomaticFavor ?? 0);
  let win = -1;
  for (let c = 0; c < votes.length; c++) {
    if (votes[c] <= 0) continue; // no favor, no vote
    if (win < 0 || votes[c] > votes[win]) win = c; // ties keep the LOWER seat
  }
  for (const sx of state.seats) sx.diplomaticFavor = 0;
  if (win < 0) return; // nobody could vote
  const winner = state.seats[win];
  winner.diplomaticPoints = (winner.diplomaticPoints ?? 0) + DVP_PER_RESOLUTION;
}







export function transferCity(
  state: GameState,
  fromSeat: number,
  to: Seat,
  civCity: City,
  why: string,
  plunder = why === 'conquered',
): boolean {
  to.warmonger = (to.warmonger ?? 0) + WARMONGER_CAPTURE;
  // The losing seat's city list — one lookup, because every seat holds its own.
  const loser = seatOf(state, fromSeat);
  if (loser) {
    loser.cities = loser.cities.filter((c) => c.id !== civCity.id);
    relocatePalace(loser.cities);
    if (loser.tradeRoutes) loser.tradeRoutes = loser.tradeRoutes.filter((x) => x.from !== civCity.id && x.to !== civCity.id);
  }
  if (why === 'conquered' && to.cities.length >= MAX_CITIES_PER_SEAT) {
    for (const t of state.map.tiles) {
      if (tileBelongsTo(t, civCity)) setTileOwner(t, NO_SEAT);
    }
    const centre = state.map.tiles[civCity.centerIndex];
    centre.district = null;
    centre.districtComplete = false;
    state.eventLog.push(`${civCity.name} razed — ${to.name} cannot govern more cities.`);
    return false;
  }
  for (const t of state.map.tiles) {
    if (tileBelongsTo(t, civCity)) {
      setTileOwner(t, to.seat, to.nextCityId); // the civCity pushed below
    }
  }
  // Conquest keeps infrastructure: the city carries its districts, its
  // buildings MINUS PALACE, and its wonders. ANCIENT_WALLS is kept with
  // outerHp 0 (it heals back).
  //
  // The districts are DERIVED from the tiles that just re-owned (complete ones
  // only), never copied from the loser's `districts` array: a seat's array and
  // its tile registry can disagree, and the GPU twin derives from tile
  // ownership + district_complete. An INCOMPLETE district stays paved-but-dead,
  // because `availableBuildings` keys on a district merely being present and
  // would otherwise offer a building the GPU can never queue.
  const newId = to.nextCityId;
  const keptDistricts: { type: DistrictId; tileIndex: number }[] = [];
  for (const t of state.map.tiles) {
    if (tileBelongsTo(t, { seat: to.seat, id: newId }) && t.district !== null && t.districtComplete) {
      keptDistricts.push({ type: t.district, tileIndex: t.index });
    }
  }
  const keptBuildings = civCity.buildings.filter((b) => b !== 'PALACE');
  const flipped: City = {
    id: to.nextCityId++,
    name: civCity.name,
    seat: to.seat,
    centerIndex: civCity.centerIndex,
    population: Math.max(1, Math.floor(civCity.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: civCity.tilesAcquired,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: keptBuildings,
    districts: keptDistricts,
    wonders: civCity.wonders.filter((w) => tileBelongsTo(state.map.tiles[w.tileIndex], { seat: to.seat, id: newId })).map((w) => ({ ...w })),
    specialists: {},
    // GREAT WORKS AND RELICS RIDE WITH THE CITY. Real Civ 6: the
    // victor gains control of the Great Works held in a captured city's
    // buildings/districts/wonders — and `keptBuildings` above already carries
    // the Amphitheater/Museum/Temple slots that hold them. This literal
    // enumerates the new city's fields BY HAND, so every field on `City` has
    // to be listed here too. One that is missed is destroyed silently on every
    // flip — no error, just a value that vanishes.
    // Religion travels with the city here too (the GPU twin keeps it).
    religionPressure: civCity.religionPressure ? [...civCity.religionPressure] : undefined,
    followedReligion: civCity.followedReligion,
    greatWorksWriting: civCity.greatWorksWriting,
    greatWorksArt: civCity.greatWorksArt,
    greatWorksMusic: civCity.greatWorksMusic,
    relics: civCity.relics,
    artifacts: civCity.artifacts, // artifacts ride the flip too
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  };
  if (keptBuildings.includes('ANCIENT_WALLS')) flipped.outerHp = 0; // walls kept, outer pool 0
  to.cities.push(flipped);
  addEraScore(state, to.seat, ERA_SCORE_CONQUER);
  revealAround(state, to.seat, civCity.centerIndex, 3);
  // Real Civ 6 pays the captor gold for taking a city. One rate, every captor.
  if (plunder) to.treasury += 40;
  state.eventLog.push(`${civCity.name} defected to ${to.name}! (${why})`);
  if (loser && loser.cities.length === 0) {
    setWar(state, loser.seat, to.seat, false);
    warWearinessPeace(state, to.seat, loser.seat);
    state.eventLog.push(`${loser.name} has been eliminated.`);
  }
  return true;
}

/**
 * machine-check (env-gated by CIV6_RC_REGISTRY_CHECK; the TS twin of the
 * GPU engine's _check_rc_registry_invariant). Every district tile and wonder
 * tile an civCity lists must register BACK to that civCity — its `Tile.ownerCity` equals
 * `civCity.id` (a district sits on a tile owned by THAT city, the placement rule
 * tryQueueDistrict/tryQueueWonder now enforce) — and that tile must
 * be owned by this seat's civ. A tile registered to a SIBLING civCity (the seed
 * 9118 latent) throws. NO always-on cost: only called when the env flag is set.
 */
export function assertCityRegistryCoherent(state: GameState): void {
  for (const actor of state.seats) {
    const civ = actor.seat;
    for (const civCity of actor.cities) {
      const check = (kind: string, tileIndex: number, type: string) => {
        const t = state.map.tiles[tileIndex];
        if (!tileBelongsTo(t, civCity) || !tileOwnedByCiv(t, civ)) {
          throw new Error(
            `registry incoherence: seat=${actor.seat} civCity.id=${civCity.id} ${kind}=${type} ` +
              `tile=${tileIndex} ownerSeat=${tileSeat(t)} ownerCity=${tileCity(t)} turn=${state.turn}`,
          );
        }
      };
      for (const d of civCity.districts) check('district', d.tileIndex, d.type);
      for (const w of civCity.wonders ?? []) check('wonder', w.tileIndex, w.id);
    }
  }
}




/** apply ONE recorded turn for a driven seat. Touches no policy — if this
 * ever needed to consult the ladder, the file would not be a complete record of
 * the decisions and TS could not reproduce a GPU trajectory from it. Mirrors
 * `apply_seat_actions`: the idle gate, then the same cost/progress semantics. */
export function applySeatActionRecord(state: GameState, actor: Seat, rec: SeatActionRecord): void {
  const { NB, NU, buildings, units, wonders, projects, wonderLo, projectLo } = prodLayout();
  // the recorder ran at B=1 and `tolist()` keeps the batch dim: production
  // arrives as [[c0..]], tech/civic as [v]. Unwrap defensively — the same fix
  // apply_turn needed on the GPU side, and the second driven-parity red: every
  // comparison against a LIST is false, so nothing ever queued and the TS
  // queues flatlined while the economies agreed.
  // v2: production is [[centreTile, col], ...] — the city
  // axis keyed by CENTRE TILE, because slot order and founding order diverge
  // under compaction/capture. Each engine resolves the centre to ITS city.
  const prodPairs = rec.production;
  const techCol = Array.isArray(rec.tech) ? (rec.tech as unknown as number[])[0] : rec.tech;
  const civicCol = Array.isArray(rec.civic) ? (rec.civic as unknown as number[])[0] : rec.civic;
  // The RESEARCH picks re-validate against AVAILABILITY: real Civ 6 offers no
  // locked tech, the mask never names one, and an unchecked arm here would let
  // a stale record start a tech on ONE engine. A pick may SWITCH the seat off
  // an item mid-research — selectResearch parks the pool — and a re-stated
  // pick is its no-op.
  if (techCol !== null && techCol !== undefined && techCol >= 0) {
    const t = Object.keys(TECHS)[techCol];
    if (t && availableTechsIn(actor.research).some((d) => d.id === t)) selectResearch(actor.research, t);
  }
  if (civicCol !== null && civicCol !== undefined && civicCol >= 0) {
    const c = Object.keys(CIVICS)[civicCol];
    if (c && availableCivicsIn(actor.research).some((d) => d.id === c)) selectResearch(actor.research, c, true);
  }
  // the WAR verb: the recorded declare/peace applies HERE — before the
  // walkers, the exact position the GPU's pre-step war head uses, so a
  // declare turns THIS turn's walkers hostile on both engines. The engine
  // re-validates: peace pays the seat 0's exact gold schedule or refuses
  // (the scripted roll's own body, minus the roll — that lives in the
  // ladder now, rolled from the DRIVER's policy stream, so neither engine's
  // rule stream moves).
  // The ENVOY verb: the recorded picks land here, ALIVE + met + availability
  // re-validated. BANK ONLY — conversion is an eager RULE at the CS phase for
  // every seat, so a decide-time pick can never exceed the bank. A razed
  // city-state takes no envoy (real Civ 6, and the GPU mask's own term).
  for (const cityStateIdx of rec.envoys ?? []) {
    // a razed/captured city-state leaves the array entirely, so existence IS
    // the alive test — its city lives in the CityState's own flat fields,
    // never in the seat-idiom `cities` list, which stays empty for a minor.
    const cityState = state.cityStates[cityStateIdx];
    if (!cityState) continue;
    if (!hasMet(cityState, actor.seat)) continue;
    if ((actor.envoysAvailable ?? 0) <= 0) continue;
    actor.envoysAvailable = (actor.envoysAvailable ?? 0) - 1;
    addEnvoys(cityState, actor.seat, 1);
  }
  const warCol = rec.war;
  if (warCol !== null && warCol !== undefined && warCol >= 0) {
    const nOpp = state.seats.length - 1;  // the head is one column per OPPONENT
    const targets = warTargets(state, actor.seat);
    const foe = targets[warCol < nOpp ? warCol : warCol - nOpp];
    if (foe !== undefined && actor.seat !== foe) {
      if (warCol < nOpp && !civsAtWar(state, actor.seat, foe) && !seatsAllied(state, actor.seat, foe)
          && treatyTurnsWith(state, actor.seat, foe) === 0) {
        setWar(state, actor.seat, foe, true);
        setWarTurnsWith(state, actor.seat, foe, 0);
        actor.warmonger = (actor.warmonger ?? 0) + WARMONGER_DOW;
        const dt = actor.denounced[foe];
        const formal = dt !== undefined && state.turn - dt >= FORMAL_WAR_MIN_TURNS;
        setWarFormal(state, actor.seat, foe, formal);
        state.eventLog.push(`${actor.name} declares ${formal ? 'a formal' : 'a surprise'} war on ${seatOf(state, foe)?.name ?? 'you'}!`);
      } else if (warCol >= nOpp && civsAtWar(state, actor.seat, foe)) {
        const waited = warTurnsWith(state, actor.seat, foe);
        const cost = PEACE_GOLD_COST(waited);
        if (waited >= WAR_MIN_TURNS && goldAffordable(actor.treasury ?? 0, cost)) {
          actor.treasury = (actor.treasury ?? 0) - cost;
          makePeace(state, actor, foe);
        }
      }
    }
  }
  for (const [centre, aCol, aTile] of prodPairs) {
    const civCity = actor.cities.find((c) => c.centerIndex === centre);
    if (!civCity) continue;                          // centre not this engine's city (drifted state)
    const a = aCol;
    if (a < 0 || civCity.queue.length > 0) continue; // the idle gate, as the GPU applies it
    if (a < NB) {
      const id = buildings[a];
      const def = id ? BUILDINGS[id] : undefined;
      if (def) commitProduction(state, civCity.seat, civCity, { kind: 'building', building: id, progress: 0 });
    } else if (a === NB) {
      if (state.sandbox || civCity.population >= 2) {
        commitProduction(state, civCity.seat, civCity, { kind: 'settler', progress: 0, cost: settlerCost(state, actor.seat) });
      }
    } else if (a >= NB + 2 && a < NB + 2 + NU) {
      const id = units[a - NB - 2];
      // Re-validate TRAINABILITY at apply, not just at mask: the record is
      // replayed a phase after the mask that justified it, and the strategic
      // resource (a pastured HORSE, pillaged since) or slot rule may have
      // moved — the GPU applier refuses what trainableUnits refuses.
      if (id && UNITS[id] && trainableUnits(state, actor.seat, civCity).some((d) => d.id === id)) {
        // The BUILDER prices off the ONE escalator, exactly as
        // the scripted branch and the GPU's queue arm both do — omitting the
        // cost here fell back to the base price and locked r1c1's builder at 30
        // where the GPU locked 32 t61, the qCost family).
        if (id === 'BUILDER') commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0, cost: builderCost(state, actor.seat) });
        else commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0 });
      }
    }
    else if (a >= wonderLo && a < wonderLo + wonders.length) {
      const wd = BUILT_WONDERS[wonders[a - wonderLo]];
      if (wd) placeSeatWonder(state, actor, civCity, wd);
    } else if (a >= projectLo && a < projectLo + projects.length) {
      queueSeatProject(state, civCity, projects[a - projectLo]);
    } else if (a >= NB + 2 + NU) {
      // DISTRICT: the file names the TYPE **and the TILE**. Which plot a
      // district takes is a decision, not derived state, so it is recorded and
      // re-validated rather than re-derived by a scan each engine owns.
      const si = a - (NB + 2 + NU);
      const d = SCAFFOLD_DISTRICTS[si];
      if (d) placeSeatDistrict(state, actor, civCity, d.id, computeUnlocksIn(actor.research), aTile ?? -1);
    }
  }
}

/** replay this seat's recorded UNIT orders.
 *
 * `rec.units` is one entry per STEP, because a unit's order is a direction
 * SEQUENCE — the GPU driver re-observes between steps (the observation is 1-hop)
 * and records what it chose each time, so a faithful replay walks the same steps
 * in the same order.
 *
 * Row j addresses the seat's j-th unit in SPAWN order, which is what
 * `_seat_slot_map` ranks by on the GPU side. The seat's unit list filters `state.units`,
 * which preserves spawn order, so the two agree — but this is an ASSUMPTION the
 * gate has to hold, not a guarantee this function can enforce: if it ever breaks,
 * every seat's orders land on the wrong units and the failure looks like chaos
 * rather than an ordering bug.
 *
 * Columns are the shared unit-action enum: 0-5 step to that neighbour, 6-11
 * attack there, 12 hold. The builder verbs (CHOP/REPAIR/improvements/PILLAGE)
 * are NOT replayed here yet — the ladder's peace verb never emits them, so
 * recording one would mean the policy changed and this needs extending with it.
 */
export function applySeatUnitOrders(state: GameState, actor: Seat, steps: number[][]): void {
  if (!steps || steps.length === 0) return;
  for (const step of steps) {
    const row = Array.isArray(step[0]) ? (step[0] as unknown as number[]) : step;
    const units = unitsOf(state, actor.seat);
    units.forEach((unit, j) => {
      const a = row[j] ?? -1;
      if (a < 0 || a === 12) return;            // no instruction, or HOLD
      if (!state.units.includes(unit) || unit.movesLeft <= 0) return;  // died or spent
      const here = state.map.tiles[unit.tileIndex];
      if (a === A_FOUND_CITY) {
        if (unit.type !== 'SETTLER') return;
        const res = foundCity(state, unit.tileIndex, actor.seat);
        if (res.ok && res.city) state.eventLog.push(`${actor.name} founded ${res.city.name}.`);
        return;
      }
      if (a < 6) {
        const nb = neighbors(state.map, here);
        const to = nb[a];
        // t43: the WALKERS' OWN candidate gate, at the REPLAY surface —
        // refusal parity with the GPU's _apply_seat_unit_actions. stepUnit
        // re-validates cost/cliffs but neither STACKING nor the EMBARK tech
        // (TS walkers never OFFER an illegal step, so stepUnit never needed
        // to refuse one). Two live divergences came through that hole at
        // t43 embarked a Shipbuilding-less warrior toward 556
        // (into a trade-route raid ring, -1F -1P/turn), and t46 stacked two
        // r0 warriors on 552 (the GPU's _blocked_for refused; the drifted
        // attacker then missed r1c3 and the whole t48 war family split).
        // `tileFreeForUnit` is the war-march's own body: stacking, the
        // encampment wall, naval/land domain, canEmbark, ocean-behind-
        // CARTOGRAPHY. allowEmbark carries the march's call-site arms: at
        // war with ANYONE, and SHIPBUILDING for every land unit — the GPU
        // gate's exact term (canEmbark alone would let a SAILING civilian
        // embark that the GPU refuses; Shipbuilding requires Sailing, so
        // the conjunction equals the GPU's single test).
        if (to) {
          const anyWarU = atWarWithAny(state, actor.seat);
          const allowEmb = anyWarU && ownerHasTech(state, unit, 'SHIPBUILDING');
          if (tileFreeForUnit(state, to.index, actor.seat, unit, allowEmb)) stepUnit(state, unit, to);
        }
      } else if (a >= 6 && a < 12) {
        // ATTACK — safe to replay now BECAUSE the walkers stand down for
        // driven seats (no double-resolution). The SAME combat calls the
        // walkers make; both re-validate their target.
        const nb = neighbors(state.map, here);
        const to = nb[a - 6];
        if (to) {
          // The ORDERED ranged attack is `rangedAttack`, not the autonomous
          // strike, dispatched by unit TYPE alone (the GPU applier's arm).
          // `hostileRangedStrike` carries the major-vs-major scope-out and
          // belongs to the SNIPE column and the hostile phases.
          //
          // The ACTING seat, not the phase's ambient 0: both bodies thread it
          // to `killUnit` -> `markAntiquitySite`, whose ERA gate reads that
          // seat's own research. A civ's unit dying used to leave (or not
          // leave) a dig according to SEAT 0's era.
          if (UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, to.index, actor.seat);
          else meleeAttack(state, unit.id, to.index, actor.seat);
        }
      } else if (a === 25) {
        // PILLAGE underfoot — hostileUnitAct's own block, faithfully: an
        // improvement first (food improvements heal +25), else the
        // complete non-centre district. Enemy-ownership re-validated.
        // MILITARY ONLY: the walker's pillage lives inside hostileUnitAct,
        // which only military units ever run — the replay arm must carry
        // that implicit gate explicitly (the GPU apply's _p_combat > 0
        // twin). Without it a mid-turn death shifted a recorded PILLAGE
        // row onto a MISSIONARY, which pillaged a mine here and silently
        // no-opped on the GPU (9029 rng 2026006086 t239, esc +3600).
        if (!((UNITS[unit.type]?.combat ?? 0) > 0)) return;
        const hereOwned = isCiv(tileSeat(here))
          && civsAtWar(state, unitSeat(unit), tileSeat(here));
        if (here.improvement && !here.pillaged && hereOwned) {
          here.pillaged = true;
          if (PILLAGE_HEAL_IMPROVEMENTS.has(here.improvement)) {
            unit.hp = Math.min(UNIT_HP, unit.hp + 25);
          }
          unit.movesLeft = 0;
        } else if (
          hereOwned && here.district && here.district !== 'CITY_CENTER' &&
          here.districtComplete && !here.districtPillaged
        ) {
          here.districtPillaged = true;
          unit.movesLeft = 0;
        }
      } else if ((a >= 13 && a < 18) || (a >= 18 && a < 18 + IMPROVEMENT_IDS.length - DEDICATED_IMPROVEMENTS)) {
        if ((unit.charges ?? 0) <= 0 && a !== 17) return;
        if (a === 16) {
          // CHOP: `builderRemoveFeature`, the ONE remove body — removability,
          // the resource dependency, the feature-removal TECH, the LUMBER_MILL
          // that goes with the woods, the charge, and the YIELD LUMP into the
          // owning city. The inline arm that used to stand here cleared the
          // feature and paid NOTHING, so every seat driving this column banked
          // a chop the GPU paid out (its own `_A_CHOP` arm grants
          // `20 + 2.5*(techs+civics)`). Latent rather than live: the driver's
          // builder ladder offers 13-15/18-24 and REPAIR, never column 16.
          builderRemoveFeature(state, unit.id, actor.seat);
        } else if (a === 17) {
          if (unit.type !== 'BUILDER') return; // the GPU repair arm's builder gate
          if (here.pillaged && tileOwnedByCiv(here, actor.seat)) {
            here.pillaged = false;
            unit.movesLeft = 0;
          } else if (here.districtPillaged && tileOwnedByCiv(here, actor.seat)) {
            here.districtPillaged = false;
            unit.movesLeft = 0;
          }
        } else {
          const ii = a < 18 ? a - 13 : DEDICATED_IMPROVEMENTS + (a - 18);
          const imp = IMPROVEMENT_IDS[ii] as ImprovementId;
          const un = computeUnlocksIn(actor.research);
          if (!here.improvement && tileOwnedByCiv(here, actor.seat)
              && validImprovementsIn(here, { unlocks: un, builder: unit.type, ownsTile: (t: Tile) => tileOwnedByCiv(t, actor.seat) }).includes(imp)) {
            here.improvement = imp;
            unit.charges = (unit.charges ?? 0) - 1;
            unit.movesLeft = 0;
            if (unit.charges <= 0) disbandUnit(state, unit.id);
          }
        }
      } else if (a >= 38 && a < 45) {
        const to38 = a === 38 ? here : neighbors(state.map, here)[a - 39];
        if (to38) spreadFromUnit(state, unit, actor, to38);
      } else if (a >= 26 && a < 38) {
        const rt = snipeRing(state, here)[a - 26];
        if (rt !== undefined && UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, rt);
      }
    });
  }
}

export function seatPhase(state: GameState): void {

  // Seat units get their movement in this phase (like barbarians).
  // An EMBARKED land unit moves on the flat EMBARK_MOVES pool (not its
  // land moves) — mirrors refreshUnits and the GPU war-march's full_mp. Naval
  // units keep their own moves.
  // This reset — NOT refreshUnits — is where a foreign unit's
  // movement budget for the turn is actually established, so it is where the
  // general/admiral aura's +1 MP must be applied, and `movesFull` must be
  // rewritten to match. Two bugs live here if it is not:
  //   (1) the seat half of the aura would be silently wiped (the GPU seat
  //       walkers grant it, so the engines would diverge by 1 MP);
  //   (2) leaving `movesFull` at refreshUnits' `full + aura` while movesLeft
  //       resets to plain `full` makes NEXT turn's "spent no MP" gate fail for
  //       a seat that never moved — no heal, and fortify wrongly reset.
  // Seat generals war-walk LATER in this phase, so freezing the bonus here
  // (before any of them moves) is also what keeps the GPU snapshot turn-exact.
  for (const u of state.units) {
    if (!isCiv(u.seat)) continue;
    const fullR = unitFullMoves(state, u);
    u.movesLeft = fullR + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
  }

  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.denounce ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      if (actor.denounced[target.seat] !== undefined) continue; // the grudge is permanent
      if (civsAtWar(state, actor.seat, target.seat)) continue;
      actor.denounced[target.seat] = state.turn;
      setAllied(state, actor.seat, target.seat, false); // a denouncement breaks the alliance
      state.eventLog.push(`${actor.name} denounces ${target.name}.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.ally ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      if (state.turn < ALLY_MIN_PEACE) continue; // the alliance era has not opened
      if (civsAtWar(state, actor.seat, target.seat) || seatsAllied(state, actor.seat, target.seat)) continue;
      if (actor.denounced[target.seat] !== undefined || target.denounced[actor.seat] !== undefined) continue;
      if ((actor.warmonger ?? 0) > 0 || (target.warmonger ?? 0) > 0) continue; // grievances block
      setAllied(state, actor.seat, target.seat, true);
      state.eventLog.push(`${actor.name} and ${target.name} form an alliance.`);
    }
  }
  for (const actor of state.seats) {
    const recU = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (actor.cities.length === 0) {
      // No city means no economy — but the UNITS still walk. A settler start
      // owns nothing but units, so skipping the whole block here locks the
      // seat out of the FOUND verb, the one verb that would give it a city.
      // CIV6: a civ is eliminated when it holds neither a city nor a settler.
      if (recU) applySeatUnitOrders(state, actor, recU.units);
      continue;
    }

    warWearinessTurn(state, actor.seat);

    detectBoosts(state, actor.seat);

    const seatUnitList = unitsOf(state, actor.seat);
    {
      // Meet by EXPLORATION — a city-state is met the moment its centre is
      // out of this seat's fog. Fog off (or not yet accrued) = instant, so
      // in a fogless world every seat knows every city-state; with fogOfWar
      // live, meeting is earned by scouting, the real Civ 6 rule. This
      // replaced the proximity surrogate when every seat got a fog plane.
      for (const cityState of state.cityStates) {
        if (hasMet(cityState, actor.seat)) continue;
        if (isExplored(state, actor.seat, cityState.centerIndex)) {
          setMet(cityState, actor.seat);
          state.eventLog.push(`${actor.name} met the city-state of ${cityState.name}.`);
        }
      }
      if (state.cityStates.some((cityState) => hasMet(cityState, actor.seat))) {
        const gov = GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(actor.research).government : null;
        const tier = gov ? GOV_INFLUENCE_TIER[gov] ?? 0 : 0;
        actor.influencePoints = (actor.influencePoints ?? 0) + INFLUENCE_PER_TURN + tier;
        // CONVERSION IS A RULE, for every seat. Real Civ 6 grants the
        // envoy the moment the meter fills, assigned or not. WHERE it is spent
        // is the decision, and that arrives on the wire.
        while (actor.influencePoints >= ENVOY_COST) {
          actor.influencePoints -= ENVOY_COST;
          actor.envoysAvailable = (actor.envoysAvailable ?? 0) + 1;
        }
      }

      // City-state quests — each MET CS keeps ONE quest per seat
      // (cityState.seatQuest[actor.seat], SEAT-keyed: row 0 is seat 0, the
      // GPU base geometry); a satisfied one resolves here (+QUEST_ENVOYS to
      // THIS seat's envoys — the accrual channel), else a new one issues on
      // cooldown expiry. The kind is DETERMINISTIC: the FIRST SATISFIABLE
      // option in the fixed order [clearCamp, buildDistrict, sendTradeRoute]
      // against this seat's state — NO nextRandom. questIssuedTurn clock
      // defaults to 0 → first issue at turn≥cooldown.
      for (const cityState of state.cityStates) {
        if (!hasMet(cityState, actor.seat)) continue;
        const rq = (cityState.seatQuest ??= []);
        const rqi = (cityState.seatQuestIssuedTurn ??= []);
        const cur = rq[actor.seat] ?? null;
        if (cur) {
          if (questSatisfied(state, cityState, cur, actor.seat, { tradeRoutes: actor.tradeRoutes, cities: actor.cities })) {
            rq[actor.seat] = null;
            rqi[actor.seat] = state.turn;
            addEnvoys(cityState, actor.seat, QUEST_ENVOYS);
            state.eventLog.push(`${cityState.name} quest complete for ${actor.name}: +${QUEST_ENVOYS} envoy.`);
          }
        } else if (state.turn - (rqi[actor.seat] ?? 0) >= QUEST_COOLDOWN) {
          const q = issueQuest(state, cityState, actor.seat, { tradeRoutes: actor.tradeRoutes, cities: actor.cities });  // one issuer, every seat
          if (q) {
            rq[actor.seat] = q;
            rqi[actor.seat] = state.turn;
          }
        }
      }
    }

    let unitCount = seatUnitList.length;
    // Army composition (military only — builders don't count),
    // live + queued, updated through this pick loop so same-turn picks see
    // each other — the ranged share targets 1 ranged per 2 melee.
    let meleeCount = 0;
    let rangedCount = 0;
    for (const u of seatUnitList) {
      const d = UNITS[u.type];
      if (!d || d.combat <= 0) continue;
      if (d.ranged) rangedCount += 1;
      else meleeCount += 1;
    }
    for (const civCity of actor.cities) {
      const q = civCity.queue[0];
      if (q?.kind === 'unit') {
        unitCount += 1;
        const d = q.unit ? UNITS[q.unit] : undefined;
        if (d && d.combat > 0) {
          if (d.ranged) rangedCount += 1;
          else meleeCount += 1;
        }
      }
    }
    const seatUnlocks = computeUnlocksIn(actor.research);
    const rec = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (rec) applySeatActionRecord(state, actor, rec);
    // The record replaces the PICKS and nothing else. Bookkeeping — yields,
    // growth, research accrual, treasury — is RULES and runs for every seat,
    // record or no record.
    // GOLD PURCHASE — ONE per seat per turn, and the WIRE names it. The
    // record's `buy` column carries [kind, centreTile, index]: kind 0 a
    // building, 1 a settler, 2 a military unit. Nothing here picks; each arm
    // re-validates the named intent against its own predicates at this
    // position and refuses silently if it no longer holds, which is what the
    // GPU's `_consume_driven_buy` does with the same column.
    //
    // Priority BUILDING > SETTLER > UNIT still governs, because a record may
    // only name one and `bought` short-circuits the rest.
    {
      let bought = false;
      if (rec) {
        const bv = rec.buy;
        if (bv && bv[0] === 0) {
          const civCity = actor.cities.find((c) => c.centerIndex === bv[1]);
          const bid = prodLayout().buildings[bv[2]];
          const def = bid ? BUILDINGS[bid] : undefined;
          if (civCity && def && !def.worship && !SCRIPTED_HELD_BUILDINGS.has(def.id)) {
            const have = new Set(civCity.buildings);
            const done = new Set(
              civCity.districts.filter((d) => state.map.tiles[d.tileIndex].districtComplete).map((d) => d.type),
            );
            const center = state.map.tiles[civCity.centerIndex];
            const okBuy =
              !have.has(def.id) && done.has(def.district) && seatUnlocks.buildings.has(def.id) &&
              (!def.requiresAny || def.requiresAny.some((x) => have.has(x))) &&
              !def.exclusiveWith?.some((x) => have.has(x)) &&
              !(def.special === 'WATER_MILL' && !hasRiver(center)) &&
              !(civCity.queue[0]?.kind === 'building' && civCity.queue[0].building === def.id);
            if (okBuy) {
              const price = def.cost * GOLD_PURCHASE_MULT;
              const reserve = PEACE_GOLD_COST(0);
              if (Math.round((actor.treasury ?? 0) * 1000) >= Math.round((price + reserve) * 1000)) {
                actor.treasury = (actor.treasury ?? 0) - price;
                civCity.buildings.push(def.id);
                if (def.id === 'ANCIENT_WALLS') civCity.outerHp = WALLS_HP;
                bought = true;
              }
            }
          }
        }
      }
      const wantSettler = rec?.buy?.[0] === 1;
      if (wantSettler && !bought && actor.cities.length > 0) {
        const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
        bought = purchaseSettler(state, spawnCity.id, actor.seat).ok;
      }
      const wantUnit = rec?.buy?.[0] === 2;
      if (wantUnit && !bought && meleeCount + rangedCount < actor.cities.length * 2) {
        let pickId: string | null = null;
        let pickCombat = -Infinity;
        for (const cand of BUY_UNITS) {
          if (cand.tech && !actor.research.techs.includes(cand.tech)) continue;
          const def = UNITS[cand.id];
          if (!def) continue;
          if (def.requiresResource && !civHasStrategic(state, actor.seat, def.requiresResource)) continue;
          if (!goldAffordable(actor.treasury ?? 0, def.cost * GOLD_PURCHASE_MULT)) continue;
          if (def.combat > pickCombat) {
            pickCombat = def.combat;
            pickId = cand.id;
          }
        }
        if (pickId) {
          const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
          const price = UNITS[pickId].cost * GOLD_PURCHASE_MULT;
          const u = spawnUnit(state, pickId, spawnCity.centerIndex, actor.seat);
          if (u) {
            actor.treasury = (actor.treasury ?? 0) - price;
            bought = true;
            if ((UNITS[pickId]?.combat ?? 0) > 0) {
              const xp = encampmentTrainXp(spawnCity.buildings);
              if (xp > 0) u.xp = xp;
            }
          }
        }
      }
      const bv3 = rec?.buy;
      if (bv3 && bv3[0] === 3 && !bought) {
        const rc3 = actor.cities.find((c) => c.centerIndex === bv3[2]);
        if (rc3) bought = buyTile(state, rc3.id, bv3[1], actor.seat).ok;
      }
    }

    // kinds 4-6, the FAITH purchases — faith is its own currency, so
    // these ride BESIDE the gold buy, in the scripted ladder's own order
    // (worship saturates first, then ONE religious unit — missionary before
    // apostle). Each entry names its city by centre; the legality bodies
    // (buyWorshipBuilding / purchaseReligiousUnit) re-validate everything,
    // and the one-religious-unit rule is enforced HERE regardless of what
    // the wire asks. The envoy split is the precedent: CONVERSION is
    // automatic in Civ 6 and stayed a rule; a purchase is a choice.
    {
      let boughtRelig = false;
      let boughtCivilian = false;
      for (const [fk, centre] of rec?.buyFaith ?? []) {
        const civCityF = actor.cities.find((c) => c.centerIndex === centre);
        if (!civCityF) continue;
        if (fk === 4) buyWorshipBuilding(state, civCityF.id, actor.seat);
        else if ((fk === 5 || fk === 6) && !boughtRelig) {
          boughtRelig = purchaseReligiousUnit(state, civCityF.id, fk === 5 ? 'MISSIONARY' : 'APOSTLE', actor.seat).ok;
        } else if ((fk === 8 || fk === 9) && !boughtCivilian) {
          // kinds 8/9 — the Monumentality faith-civilian (8 builder, 9 settler)
          boughtCivilian = purchaseCivilianWithFaith(state, civCityF.id, fk === 8 ? 'BUILDER' : 'SETTLER', actor.seat).ok;
        }
      }
    }

    {
      const lvi = rec?.levy;
      if (lvi !== undefined && lvi !== null && lvi >= 0) {
        const cityStateL = state.cityStates[lvi];
        if (cityStateL) levyUnits(state, cityStateL.id, actor.seat);
      }
    }

    // Trade — ONE new route per civ per turn while
    // capacity allows (trader-training pacing). Scan origins × destinations
    // in city-array order — own cities first, then MET city-states (from
    // asc, to asc, cityState asc — the deterministic GPU-mirrorable flat order);
    // the best NEW in-range pair by the route's TOTAL yields (a CS route is
    // 3 gold + 1 specialty = 4 flat), strictly-greater beats so ties keep the
    // first-found.
    {
      const routes = (actor.tradeRoutes ??= []);
      if (routes.length < tradeCapacity(state, actor.seat) && actor.cities.length >= 1) {
        let best: { from: number; to?: number; toCs?: number; toSeat?: number; toSeatCity?: number; ySum: number } | null = null;
        for (const from of actor.cities) {
          const ft = state.map.tiles[from.centerIndex];
          for (const to of actor.cities) {
            if (to.id === from.id) continue;
            if (routes.some((x) => x.from === from.id && x.to === to.id)) continue;
            const tt = state.map.tiles[to.centerIndex];
            if (hexDistance(ft.col, ft.row, tt.col, tt.row) > TRADE_ROUTE_RANGE) continue;
            const y = routeYields(state, to);
            const ySum = y.food + y.production;
            if (!best || ySum > best.ySum) best = { from: from.id, to: to.id, ySum };
          }
          for (const cityState of state.cityStates) {
            if (!hasMet(cityState, actor.seat)) continue;
            if (routes.some((x) => x.from === from.id && x.toCs === cityState.id)) continue;
            const ct = state.map.tiles[cityState.centerIndex];
            if (hexDistance(ft.col, ft.row, ct.col, ct.row) > TRADE_ROUTE_RANGE) continue;
            const cy = cityStateRouteYields(cityState);
            const ySum = cy.food + cy.production + cy.gold + cy.science + cy.culture + cy.faith;
            if (!best || ySum > best.ySum) best = { from: from.id, toCs: cityState.id, ySum };
          }
        }
        if (!best) {
          let bestIntl: { from: number; toSeat: number; toSeatCity: number; d: number } | null = null;
          for (const from of actor.cities) {
            const ft = state.map.tiles[from.centerIndex];
            for (const other of state.seats) {
              if (other.seat === actor.seat) continue;
              for (const pc of other.cities) {
                if (!isExplored(state, actor.seat, pc.centerIndex)) continue;
                if (routes.some((x) => x.from === from.id && x.toSeat === other.seat && x.toSeatCity === pc.id)) continue;
                const pt = state.map.tiles[pc.centerIndex];
                const d = hexDistance(ft.col, ft.row, pt.col, pt.row);
                if (d > TRADE_ROUTE_RANGE) continue;
                if (!bestIntl || d < bestIntl.d) bestIntl = { from: from.id, toSeat: other.seat, toSeatCity: pc.id, d };
              }
            }
          }
          if (bestIntl) best = { from: bestIntl.from, toSeat: bestIntl.toSeat, toSeatCity: bestIntl.toSeatCity, ySum: 0 };
        }
        if (best) {
          const route: { from: number; to?: number; toCs?: number; toSeat?: number; toSeatCity?: number; expiresTurn: number } =
            { from: best.from, expiresTurn: state.turn + TRADE_ROUTE_DURATION };
          if (best.toCs !== undefined) route.toCs = best.toCs;
          else if (best.toSeatCity !== undefined) { route.toSeat = best.toSeat; route.toSeatCity = best.toSeatCity; }
          else route.to = best.to!;
          routes.push(route);
          const fromRc = actor.cities.find((c) => c.id === route.from);
          const destIdx =
            route.toCs !== undefined
              ? state.cityStates.find((c) => c.id === route.toCs)?.centerIndex ?? -1
              : route.toSeatCity !== undefined
              ? seatOf(state, route.toSeat ?? NO_SEAT)?.cities.find((c) => c.id === route.toSeatCity)?.centerIndex ?? -1
              : actor.cities.find((c) => c.id === route.to)?.centerIndex ?? -1;
          if (fromRc && destIdx >= 0) layTradeRoad(state, fromRc.centerIndex, destIdx);
        }
      }
      actor.tradeRoutes = routes.filter(
        (x) =>
          (x.expiresTurn === undefined || x.expiresTurn > state.turn) &&
          (x.toSeatCity === undefined || (seatOf(state, x.toSeat ?? NO_SEAT)?.cities ?? []).some((c) => c.id === x.toSeatCity)),
      );
    }

    // Cities: real tile yields drive growth and the production queues.
    // Iterate a SNAPSHOT — a settler completing mid-loop founds a city,
    // and the newborn must not act this turn (the GPU gates on the
    // pre-turn alive mask the same way).
    let sciSum = 0;
    let culSum = 0;
    let goldSum = 0;
    let faithSum = 0;
    const luxMap = luxuryAmenities(state, actor.seat);
    const seatMods = getModifiers(state, actor.seat);
    const cityStats = new Map<number, CityStats>();
    for (const civCity of actor.cities) cityStats.set(civCity.id, computeCityStats(state, civCity, luxMap, seatMods));
    // The seat's science/turn off the SAME loop-top snapshot, folded in city
    // order — the Moon Landing lump reads it, and the GPU folds the identical
    // walk columns in slot order, so the f64 association agrees.
    let sciPerTurnSeat = 0;
    for (const civCity of actor.cities) sciPerTurnSeat += cityStats.get(civCity.id)!.total.science;
    // this seat's governor seats for THIS turn — same stateless
    // greedy as the seat 0 (quantized milli loyalty snapshot at the loop top,
    // ties by array position == the GPU's civCity slot order).
    const rGovPicks = governorPicks(
      actor.cities.map((civCity) => Math.round((civCity.loyalty ?? LOYALTY_MAX) * 1000)),
      governorTitles(actor.research.civics.length),
    );
    const rGovIds = new Set([...rGovPicks].map((i) => actor.cities[i].id));
    const civCityDefectors: City[] = [];
    for (const civCity of [...actor.cities]) {
      const stats = cityStats.get(civCity.id) ?? computeCityStats(state, civCity, luxMap, seatMods);
      const tier = stats.amenities.tier;
      if (applyLoyalty(state, civCity, tier.name, rGovIds.has(civCity.id) ? GOVERNOR_LOYALTY : 0)) {
        civCityDefectors.push(civCity);
      }
      const y = stats.total;
      // `total.gold` is already NET of district+building upkeep — computeCityStats
      // subtracts it — so this must not charge it a second time.
      goldSum += y.gold;
      faithSum += y.faith; // the faith yield gains its consumer
      const production = y.production;
      sciSum += y.science;
      const culC = y.culture;
      culSum += culC;

      seatGrowth(civCity, stats.effectiveFoodSurplus, stats.growthNeeded);
      const q = civCity.queue[0];
      if (q && (q.kind === 'settler' || q.kind === 'unit' || q.kind === 'district' || q.kind === 'building' || q.kind === 'project' || q.kind === 'wonder')) {
        // The seat's GOVERNMENT/POLICY encampmentProdMult, which
        // `game.ts` has always applied to the seat 0's queue head and the
        // seat's add never did. A seat that adopts the government owns
        // its effects; the multiplier keys on the ITEM, not on the seat.
        const _em = isEncampmentItem(q) ? seatMods.encampmentProdMult : 1;
        q.progress += production * _em;
        // Pay in the bank, exactly where the seat 0's endTurn does
        // (game.ts, right after the production add). Without this the field
        // written below would be write-only.
        if (civCity.productionBank) {
          q.progress += civCity.productionBank;
          civCity.productionBank = 0;
        }
        const cost =
          q.kind === 'unit'
            ? q.cost ?? UNITS[q.unit]?.cost ?? 54 // builders lock at queue
            : q.kind === 'building'
              ? BUILDINGS[q.building]?.cost ?? 54
              : q.kind === 'wonder'
                ? BUILT_WONDERS[q.wonder]?.cost ?? 54 // catalog cost (already speed-scaled)
                : q.cost ?? 54; // settler / district / project carry their own cost
        if (q.progress >= cost) {
          civCity.queue.shift();
          completeQueueItem(state, civCity, q, cost, sciPerTurnSeat);
          // A completion's OVERFLOW carries to the next item, for every seat.
          // this is the largest single production leak in the model.
          // Every seat's city is the same record, so the bank field is
          // already here — nothing new to store.
          //
          // IT ALWAYS BANKS — it does NOT carry into `civCity.queue[0]` even when a
          // next item is waiting. Real Civ 6 (and this file's own queue) would
          // carry it immediately, and that is the more faithful shape, but the
          // GPU's seat city is a SINGLE SLOT with no queue at all. Carrying
          // here let TS complete a second item in the same turn while the GPU
          // banked and paid next turn, which diverged parity at t105
          // on `rng` itself — the completion spawns a unit, so the DRAW COUNT
          // moved, in a slice whose whole premise is that production touches no
          // draw site.
          //
          // Porting a queue to the GPU is explicitly out of this slice's scope
          // (§7-4b). So the engines agree on the weaker rule and the LOSS is
          // declared here rather than hidden: banked overflow is paid on the
          // NEXT turn, one turn later than Civ 6 would pay it.
          civCity.productionBank = (civCity.productionBank ?? 0) + (q.progress - cost);
        }
      }
      civCity.cultureBox += culC;
      const civCityBorderCost = () =>
        Math.round(borderGrowthCost(civCity.tilesAcquired) * getModifiers(state, actor.seat).borderCostMult);
      while (civCity.cultureBox >= civCityBorderCost()) {
        const next = pickBorderTile(state, civCity, { map: state.map, mods: getModifiers(state, actor.seat) });
        if (next === null) {
          civCity.cultureBox = Math.min(civCity.cultureBox, civCityBorderCost());
          break;
        }
        civCity.cultureBox -= civCityBorderCost();
        acquireTile(state, civCity, next);
      }
      const civCityCenter = state.map.tiles[civCity.centerIndex];
      if (civCity.buildings.includes('ANCIENT_WALLS')) {
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(civCityCenter.col, civCityCenter.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          // ANY unit hostile to this civ. A city's strike picks its
          // target by distance and combat strength, never by which enemy the
          // unit belongs to.
          if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { seat: actor.seat }))) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = unitsAt(state, bestTile).filter(
            (u) => unitsHostile(state, u, { seat: actor.seat }),
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender); // defender veterancy (embarked → flat, no xp)
          const defCSa = defCS + generalAuraCS(state, defender, bestTile);
          const atkCS = cityDefenseStrength(state, civCity);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'cstk', bestTile);
          awardDefenseXp(defender); // +2 to a surviving military defender (attacker is the city)
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true });
          // The STRIKER is the city, so the dig's era gate is its owner's —
          // the GPU passes `striker_row` at the same site.
          if (defender.hp <= 0) killUnit(state, defender, civCity.seat);
        }
      }
      if (civCity.districts.some((dd) => encampmentIntact(state.map.tiles[dd.tileIndex]))) {
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(civCityCenter.col, civCityCenter.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          // ANY unit hostile to this civ. A city's strike picks its
          // target by distance and combat strength, never by which enemy the
          // unit belongs to.
          if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { seat: actor.seat }))) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = unitsAt(state, bestTile).filter(
            (u) => unitsHostile(state, u, { seat: actor.seat }),
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender);
          const defCSa = defCS + generalAuraCS(state, defender, bestTile); // the cstk mirror
          const atkCS = cityDefenseStrength(state, civCity);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'estk', bestTile);
          awardDefenseXp(defender);
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true });
          // The STRIKER is the city, so the dig's era gate is its owner's —
          // the GPU passes `striker_row` at the same site.
          if (defender.hp <= 0) killUnit(state, defender, civCity.seat);
        }
      }
      const besieged = neighbors(state.map, civCityCenter).some((n) =>
        unitsAt(state, n.index).some((u) => unitsHostile(state, u, { seat: actor.seat })),
      );
      // Unbesieged cities heal at a flat rate, war or not (real Civ 6). The
      // outer wall pool heals on the same gate and rate (cap WALLS_HP),
      // full-HP or not.
      if (!besieged) {
        civCity.hp = Math.min(CITY_MAX_HP, civCity.hp + CITY_HEAL_PER_TURN);
        if (civCity.buildings.includes('ANCIENT_WALLS')) {
          civCity.outerHp = Math.min(WALLS_HP, (civCity.outerHp ?? WALLS_HP) + CITY_HEAL_PER_TURN);
        }
        for (const d of civCity.districts) {
          if (d.type !== 'ENCAMPMENT') continue;
          const dt = state.map.tiles[d.tileIndex];
          if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
          dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
        }
      }
    }

    for (const civCity of civCityDefectors) flipCity(state, civCity);

    const rsr = actor.research;
    const gTech = goldenBoostBonus(state, actor.seat, false);
    const gCivic = goldenBoostBonus(state, actor.seat, true);
    const pickNext = () => {
      // The RESEARCH PICK arrives on the wire (applySeatActionRecord). A seat
      // with no pick banks progress with no current tech — the same wait the
      // GPU's `cur_tech == -1` already models.
    };
    pickNext();
    rsr.techProgress += sciSum;
    // LIFETIME science — the cultureTotal pattern, beside the stream add.
    // Every seat accrues (the GPU twin is seat_science_total rows 0..R);
    // lump grants (applyLumpGrant, goody maps) add to the same field.
    actor.scienceTotal = (actor.scienceTotal ?? 0) + sciSum;
    while (rsr.tech && rsr.techProgress >= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech)) {
      rsr.techProgress -= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech);
      rsr.techs.push(rsr.tech);
      delete rsr.techRetained[rsr.tech];
      rsr.tech = null;
      pickNext();
    }
    if (!rsr.tech && availableTechsIn(rsr).length === 0) rsr.techProgress = Math.min(rsr.techProgress, 0);
    rsr.civicProgress += culSum;
    // LIFETIME culture — the same per-turn sum, banked separately
    // because civicProgress is SPENT by every completed civic. Real Civ 6
    // scores DOMESTIC TOURISTS off lifetime culture, so this is the substrate
    // the Culture victory reads. Zero-draw; the GPU mirrors at this position.
    actor.cultureTotal = (actor.cultureTotal ?? 0) + culSum;
    actor.treasury = (actor.treasury ?? 0) + goldSum;
    actor.faith = (actor.faith ?? 0) + faithSum;
    seatAccumulators(state, actor.seat);
    actor.treasury -= state.units.reduce(
      (s, u) => s + (u.seat === actor.seat ? UNITS[u.type]?.maintenance ?? 0 : 0),
      0,
    );
    if (Math.round(actor.treasury * 1000) < 0) {
      let victim: Unit | undefined;
      for (const u of state.units) {
        if (u.seat !== actor.seat) continue;
        const m = UNITS[u.type]?.maintenance ?? 0;
        if (m <= 0) continue;
        const vm = victim ? UNITS[victim.type]?.maintenance ?? 0 : 0;
        if (!victim || m > vm || (m === vm && u.id < victim.id)) victim = u;
      }
      if (victim) disbandUnit(state, victim.id);
    }
    while (rsr.civic && rsr.civicProgress >= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic)) {
      rsr.civicProgress -= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic);
      rsr.civics.push(rsr.civic);
      delete rsr.civicRetained[rsr.civic];
      rsr.civic = null;
      pickNext();
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);

    // Builder actions (build best-Δ improvement or walk to a job).
    // driven-parity layer 5: the GPU stands the BUILDER POLICY down for
    // controlled seats ("controlled opponents' builders answer to the units
    // head", `active & ~controlled`); this call was ungated, TS builders kept

    advanceGreatPeople(state, actor.seat);

    // The BELIEF RACES — eager rules for EVERY seat row. Identities are
    // POLICY draws from the open pools; every gate and
    // draw mirrors the GPU's row-generic _seat_belief_claims (the
    // popen/ropen/eopen shapes), so the streams stay aligned. The open pools
    // are purely the claimed lists — every claim path (this block AND the
    // seat-0 UI verbs) pushes what it takes.
    // Pantheon: costs PANTHEON_FAITH_COST from this seat's own faith.
    if (actor.religion.pantheon === null && (actor.faith ?? 0) >= PANTHEON_FAITH_COST) {
      const open = Object.keys(PANTHEONS).filter((id) => !state.claimedPantheons.includes(id));
      if (open.length > 0) {
        actor.faith = (actor.faith ?? 0) - PANTHEON_FAITH_COST;
        const pick = open[Math.floor(nextRandom(state) * open.length)];
        state.claimedPantheons.push(pick);
        addEraScore(state, actor.seat, ERA_SCORE_PANTHEON);
        actor.religion.pantheon = pick; // the id IS the claim; effects apply via getModifiers
        state.eventLog.push(`${actor.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
      }
    }
    // Religion: the canFoundReligion gates — a pantheon, a completed Holy
    // Site, an earned Prophet. Follower drawn FIRST, founder second (the
    // GPU's rf_/ro_ order).
    if (
      !actor.religion.founded &&
      actor.religion.pantheon !== null &&
      prophetsOf(actor) > 0 &&
      actor.cities.some((c) =>
        c.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
      )
    ) {
      const followers = Object.keys(FOLLOWER_BELIEFS).filter((id) => !state.claimedBeliefs.includes(id));
      const founders = Object.keys(FOUNDER_BELIEFS).filter((id) => !state.claimedBeliefs.includes(id));
      if (followers.length > 0 && founders.length > 0) {
        const fPick = followers[Math.floor(nextRandom(state) * followers.length)];
        const oPick = founders[Math.floor(nextRandom(state) * founders.length)];
        state.claimedBeliefs.push(fPick);
        state.claimedBeliefs.push(oPick);
        actor.religion.founded = true;
        addEraScore(state, actor.seat, ERA_SCORE_RELIGION);
        actor.religion.follower = fPick;
        actor.religion.founder = oPick;
        actor.religion.holyTile = (actor.cities.find((c) => c.isCapital) ?? actor.cities[0])?.centerIndex ?? null;
        const name = RELIGION_NAMES[actor.seat % RELIGION_NAMES.length];
        state.eventLog.push(`${actor.name} founded ${name} — two beliefs left the pool.`);
      }
    }
    // Enhancer: a SECOND earned Prophet claims an enhancer belief, denying
    // it from the shared pool (the follower/founder mirror). The draw sits
    // AFTER the founder draw — the GPU's _next_random(eopen) position.
    if (actor.religion.founded && actor.religion.enhancer == null && prophetsOf(actor) >= 2) {
      const enhancers = Object.keys(ENHANCER_BELIEFS).filter((id) => !(state.claimedEnhancers ?? []).includes(id));
      if (enhancers.length > 0) {
        const ePick = enhancers[Math.floor(nextRandom(state) * enhancers.length)];
        (state.claimedEnhancers ??= []).push(ePick);
        actor.religion.enhancer = ePick; // identity kept — effects apply
        state.eventLog.push(`${actor.name} enhanced its religion (${ENHANCER_BELIEFS[ePick].name} is taken).`);
      }
    }


    const anyWar = atWarWithAny(state, actor.seat);
    for (const foe of warsOf(state, actor.seat)) {
      // ONE tick per pair per turn, at the pair's LOWER seat's tail — a major
      // always outranks its city-state foes (their seat ids sit at 100+).
      if (actor.seat < foe) setWarTurnsWith(state, actor.seat, foe, warTurnsWith(state, actor.seat, foe) + 1);
    }
    // ONE treaty countdown per pair per turn, at the pair's LOWER seat's tail —
    // the war clock's discipline, over the pairs that are NOT at war.
    for (const other of [...state.seats.map((x) => x.seat), ...(state.cityStates ?? []).map((c) => c.seat)]) {
      if (actor.seat >= other) continue;
      const bound = treatyTurnsWith(state, actor.seat, other);
      if (bound > 0) setTreatyTurnsWith(state, actor.seat, other, bound - 1);
    }
    if (!anyWar) actor.peaceTurns += 1;
    if (recU) applySeatUnitOrders(state, actor, recU.units);
  }

  // Env-gated registry coherence check at the phase tail (after every
  // founding/placement/capture this turn). Off by default → zero cost + no
  // trajectory change; the GPU forced-compaction gate exercises the twin.
  // globalThis avoids a @types/node dependency (the src tsconfig has none).
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_RC_REGISTRY_CHECK) {
    assertCityRegistryCoherent(state);
  }
}
