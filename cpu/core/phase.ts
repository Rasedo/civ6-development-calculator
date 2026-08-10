/**
 * Scripted seat civilizations: real cities, territory and units on the map,
 * with real production queues, research, maintenance, housing and border
 * culture underneath. They settle, grow, expand borders, race you for great
 * people, pantheons and beliefs, and can declare (or receive) war — at-war
 * units raid like barbarians, and cities can be conquered.
 */

import type { City, DistrictId, GameState, ImprovementId, SeatActionRecord, Seat, Tile, Unit } from './types';
import { advanceGreatPeople } from './greatPeople';
import { completeQueueItem } from './production';
import { isExplored, revealAround } from './fog';
import { tilesWithin, hexDistance, neighbors } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { nextRandom } from './rand';
import { seatAccumulators, seatGrowth, commitProduction } from './seatTurn';
import { spawnUnit, unitsAt, unitsHostile, unitDomain, encampmentIntact, layTradeRoad, stepUnit, unitFullMoves, ownerHasTech, tileFreeForUnit } from './units';
import { PILLAGE_HEAL_IMPROVEMENTS } from './combat';  // #70: the replay's pillage arm mirrors hostileUnitAct's
import { UNIT_HP } from '../data/units';
import { meleeAttack, hostileRangedStrike, damageRoll, terrainDefense, woundPenalty, supportCount, SUPPORT_CS, xpLevelBonus, awardDefenseXp, encampmentTrainXp, generalAuraCS, cityDefenseStrength } from './combat';
import { availableTechsIn, availableCivicsIn, computeUnlocksIn, type Unlocks } from './effects';
import { detectBoosts, effectiveResearchCostIn } from './boosts';
import { getModifiers } from './effects';
 // Seat specialist yields
import { routeYields, cityStateRouteYields, TRADE_ROUTE_RANGE, TRADE_ROUTE_DURATION, tradeCapacity } from './trade';
import { addEnvoys, hasMet, isSuzerain, issueQuest, questSatisfied, setMet } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN, INFLUENCE_PER_TURN, ENVOY_COST, GOV_INFLUENCE_TIER, QUEST_COOLDOWN, QUEST_ENVOYS } from '../data/cityStates';
import { computeAdoption } from './effects';
import { GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import type { RuleResult } from './rules';
import { TERRAINS } from '../../world/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { prodLayout } from './prodLayout';   // #70: ONE column layout, shared with the exporter
import { CIVICS } from '../data/civics';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { UNITS, CITY_HEAL_PER_TURN, WALLS_HP, ENCAMPMENT_HP, CITY_MAX_HP } from '../data/units';
import { generalAuraMP } from './aura'; // #70/S3 (B-8): the aura's +1 MP half
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, PANTHEON_FAITH_COST, RELIGION_NAMES, SPREAD_PRESSURE } from '../data/religion';
import { CITY_WORK_RADIUS, GOLD_PURCHASE_MULT, borderGrowthCost, EMBARKED_DEFENSE_CS } from '../data/constants';
import { PROJECTS } from '../data/projects';
import type { CityStats } from './city';
import { civEraIndex, computeCityStats, luxuryAmenities, pickBorderTile, acquireTile } from './city';
import { canPlaceDistrictIn, validImprovementsIn, wonderExists } from './rules';
import { hasRiver, hasFreshWater, isCoastalWater } from '../../world/query';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { disbandUnit, builderCost } from './units';
import { killUnit } from './combat';  // #51/S7.12
import { availableProjects, buyTile, buyWorshipBuilding, districtCostIn, districtDiscounted, foundCity, foundCityAt, goldAffordable, isEncampmentItem, purchaseReligiousUnit, purchaseSettler, queueProject, settlerCost } from './game';
import { districtAdjacency } from './yields';
import { SCAFFOLD_DISTRICTS } from '../data/districts';
import { IMPROVEMENT_IDS, DEDICATED_IMPROVEMENTS, unitActionIndex } from './unitActions';

/** The FOUND_CITY column, resolved by NAME from the shared enum. */
const A_FOUND_CITY = unitActionIndex(IMPROVEMENT_IDS).FOUND_CITY;
import { ALLY_MIN_PEACE, CIV_LEADERS, FORMAL_WAR_MIN_TURNS, MAX_CITIES_PER_SEAT, WAR_MIN_TURNS, PEACE_GOLD_COST, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, ERA_SCORE_CONQUER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, GOVERNOR_LOYALTY, WARMONGER_DOW, WARMONGER_CAPTURE, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION } from '../data/seats';
import { addEraScore, agePressureFactor, governorPicks, governorTitles, goldenBoostBonus } from './eras';
import { NO_SEAT, allCities, atWarWithAny, citiesOf, civHasStrategic, civsAtWar, emptySeat, indexOfSeat, isCiv, prophetsOf, seatOf, seatOfCityState, seatOfIndex, seatsAllied, setAllied, setTileOwner, setWar, setWarFormal, tileBelongsTo, tileCity, tileClaimed, tileOwnedByCiv, tileSeat, unitSeat, unitsOf } from './seats';
import { warWearinessBattle, warWearinessPeace, warWearinessTurn } from './weariness';

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

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------



/**
 * The counterparty the WIRE's war column names. The decision record carries a
 * single war axis and it is measured against this seat; nothing in the engine
 * gives that seat any other standing.
 */
const WAR_COLUMN_SEAT = 0;

/** How good a city site this tile is: fresh water, then the yields and hills
 *  in its work radius. Negative = not settleable. World generation only. */
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

/** Place `count` seat civs on distant good sites (seeded, deterministic). */
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
      ...emptySeat(seatOfIndex(i)), // #51/S6.12: one Seat constructor, every seat
      name: leader.name,
      color: leader.color,
      aggression: 0.3 + nextRandom(state) * 0.6,
      cities: [],
      nextCityId: 0,
      warTurns: 0,
      peaceTurns: 0,
      // The SEAT block — identical on the seat 0's seat 0.
      seat: i + 1,
      warmonger: 0,
      ww: {}, wwTurn: {}, // B-15 / #51/S7.8f: per-WAR points, keyed by opponent seat
      diplomaticFavor: 0,
      diplomaticPoints: 0,
      influencePoints: 0,
      envoysAvailable: 0,
      treasury: 0,
      scienceTotal: 0,
      cultureTotal: 0,
      faith: 0,
      tourism: 0,
      government: { current: null, policies: [] },
      research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
      gpp: {},
      gpEarned: [],
      buildersTrained: 0,
      bestMeleeCS: 0,
      tilesPurchased: 0,
      spaceProjects: [],
      religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    };
    foundCityAt(state, actor.seat, tile, actor);  // #96: one founding mutation, every seat
    // Push BEFORE the starting warrior
    // spawns so spawnUnit's bestMeleeCS chokepoint can find the seat —
    // "strongest melee ever FIELDED" includes the starting army (defense
    // 20 from turn 0; the GPU seeds civ_only_best_melee from the fixture pools).
    state.seats.push(actor); // #51/S1.3j: seats IS the storage — seats[r+1] is actor r
    spawnUnit(state, 'WARRIOR', tile.index, actor.seat);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------


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

/** Distance between the closest seat 0-city / seat-city pair. */
export function seatProximity(state: GameState, actor: Seat): number {
  const seat = actor.seat;
  if (seatOf(state, seat)!.cities.length === 0 || actor.cities.length === 0) return Infinity;
  let best = Infinity;
  for (const c of seatOf(state, seat)!.cities) {
    best = Math.min(
      best,
      nearestDistance(state, c.centerIndex, actor.cities.map((civCity) => civCity.centerIndex)),
    );
  }
  return best;
}

// ---------------------------------------------------------------------------
// Seat 0 diplomacy actions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-pair war state on UNIFIED civ ids (0 = seat 0,
// r+1 = seat r). The (0, r+1) seat 0 pair reads/writes the EXISTING `atWar`
// one store: `setWar` writes both seats' `wars` lists
// (symmetric by construction). S1 ships these INERT (nothing reads them yet).
// ---------------------------------------------------------------------------






export function declareWar(state: GameState, seatIndex: number, seat: number): RuleResult {
  const actor = seatOf(state, seatOfIndex(seatIndex));
  if (!actor) return no('No such civilization.');
  if (civsAtWar(state, actor.seat, seat)) return no('Already at war.');
  setWar(state, actor.seat, seat, true);
  actor.warTurns = 0;
  // The seat 0 earns GRIEVANCES for declaring, exactly as a seat
  // does (WARMONGER_DOW at the civ↔civ DoW site).
  seatOf(state, seat)!.warmonger = (seatOf(state, seat)!.warmonger ?? 0) + WARMONGER_DOW;
  state.eventLog.push(`War declared on ${actor.name}!`);
  return ok;
}

export function sueForPeace(state: GameState, seatIndex: number, seat: number): RuleResult {
  const actor = seatOf(state, seatOfIndex(seatIndex));
  if (!actor) return no('No such civilization.');
  if (!civsAtWar(state, actor.seat, seat)) return no('Not at war.');
  if (actor.warTurns < WAR_MIN_TURNS) {  // #96: one min-war-turns constant, the actor's
    return no(`Too soon — they will not talk for another ${WAR_MIN_TURNS - actor.warTurns} turns.`);
  }
  const cost = PEACE_GOLD_COST(actor.warTurns);
  if (!state.sandbox) {
    if (!goldAffordable(seatOf(state, seat)!.treasury, cost)) return no(`Peace costs ${cost} gold right now.`);
    seatOf(state, seat)!.treasury -= cost;
  }
  makePeace(state, actor);
  return ok;
}

function makePeace(state: GameState, actor: Seat): void {
  setWar(state, actor.seat, WAR_COLUMN_SEAT, false);
  // A peace treaty sheds 2000 WWP from THAT war, on both sides.
  // Deliberately larger than any plausible accumulation — it is how the source
  // stops a settled war haunting a civ forever, since the residual of a war you
  // are no longer in has no decay rule of its own.
  warWearinessPeace(state, WAR_COLUMN_SEAT, actor.seat);
  actor.warTurns = 0;
  actor.peaceTurns = 0;
  // SOURCED: "making peace with a civ always forces peace with all
  // city-states they are suzerain of", and a city-state "automatically gets
  // peace when you stop being at war with their suzerain". A city-state is
  // dragged into its suzerain's wars and cannot leave one on its own terms, so
  // this is the ONLY way out of a suzerain-driven war — see
  // sueForPeaceWithCityState, which refuses while the suzerain is still hostile.
  // Placed in makePeace, not sueForPeace, so the AI peace path gets it too.
  for (const cityState of state.cityStates ?? []) {
    if (civsAtWar(state, cityState.seat, WAR_COLUMN_SEAT) && isSuzerain(cityState, actor.seat)) {
      setWar(state, cityState.seat, WAR_COLUMN_SEAT, false);
      cityState.cityStateWarTurns = 0;
      warWearinessPeace(state, WAR_COLUMN_SEAT, seatOfCityState(cityState.id)); // #51/S7.8f
      state.eventLog.push(`${cityState.name} makes peace alongside its suzerain.`);
    }
  }
  state.eventLog.push(`Peace with ${actor.name}.`);
}

/** Levy a militaristic city-state's troops (suzerain only, gold, cooldown). */
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

// ---------------------------------------------------------------------------
// Loyalty (only in motion while seat civs exist; capitals are immune)
// ---------------------------------------------------------------------------

/** Per-turn loyalty change for a seat 0 city under seat pressure.
 *  Every pop-pressure contribution scales by the SOURCE civ's age
 *  factor (Dark ×0.5 / Normal ×1 / Golden ×1.5) — factors are halves, so the
 *  sums stay exact in both engines' dtypes. The flip-WINNER pick
 *  (`flipCity`) deliberately stays on RAW pressure (both engines). */
/**
 * This turn's loyalty change for `city`: nearby population pressure, scaled by
 * each SOURCE seat's age factor, plus the amenity term.
 *
 * OWN pressure is the city's own seat; FOREIGN is every other civ. Each seat's
 * subtotal is scaled by its own age factor before summing, so the halves stay
 * exact.
 */
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
  // Loyalty only moves while somebody ELSE holds a city to exert pressure.
  if (!state.seats.some((s) => s.seat !== city.seat && s.cities.length > 0)) return false;
  if (city.isCapital) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  // S3: govBonus = GOVERNOR_LOYALTY when this city holds a governor
  // (the stateless per-turn pick endTurn computes before the city loop).
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyDelta(state, city, amenityTierName) + govBonus;
  city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
  return city.loyalty <= 0;
}

/** A city at 0 loyalty defects to the seat exerting the most pressure. */
/** A city at 0 loyalty defects to the SEAT exerting the most pressure on it —
 *  its own owner excluded, since a city does not defect to itself. */
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

/** The seat 0-city → seat-city transfer (shared by loyalty flips and
 * 's reverse capture — a seat melee finishing a seat 0 city). */
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


// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

/** the tile this seat city's culture growth claims next —
 * the seat 0's pickBorderTile policy verbatim (radius 5, fully unowned
 * tiles, dist asc → resource priority desc → yield sum desc → index asc)
 * under that seat's OWN research modifiers (the seatCityYields ctx).
 * Water, impassables and natural wonders are all claimable, exactly like
 * borderCandidates. Adjacency is PER-CITY via the `Tile.ownerCity` registry,
 * so a city never claims across a sibling's frontier. */






/** Place ONE named district, so a caller can queue the district the record
 * names rather than "the first placeable one". Shared, so a wire pick and a
 * replay cannot place differently: that split is precisely how the GPU mask and
 * picker drifted apart in #86. Returns false when no owned tile can take it. */
export function placeSeatDistrict(
  state: GameState,
  actor: Seat,
  civCity: City,
  id: DistrictId,
  unlocks: Unlocks,
): boolean {
  const owns = (t: Tile) => tileBelongsTo(t, civCity);
  let best = -1;
  let bestAdj = -1;
  for (const t of state.map.tiles) {
    if (!owns(t) || t.improvement) continue;
    if (!canPlaceDistrictIn(state, civCity, id, t.index, { unlocks, ownsTile: owns }).ok) continue;
    const adj = Math.floor(districtAdjacency(state.map, t, id));
    if (adj > bestAdj) {
      bestAdj = adj;
      best = t.index;
    }
  }
  if (best < 0) return false;
  const tile = state.map.tiles[best];
  // The seat's own discount, priced BEFORE registering the
  // placement (symmetric with the seat 0's queueDistrict).
  const base = districtCostIn(actor.research);
  const cost = districtDiscounted(state, actor.seat, id, { unlocks, cities: actor.cities }) ? Math.floor(base * 0.6) : base;  // #96: one discount rule, every seat
  tile.district = id;
  tile.districtComplete = false;
  tile.improvement = null;
  // Placement removes a bonus resource, exactly like the
  // seat 0's queueDistrict (real Civ 6 rule; canPlaceDistrictIn already
  // refused luxury/strategic).
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
  civCity.districts.push({ type: id, tileIndex: best });
  commitProduction(state, civCity.seat, civCity, { kind: 'district', district: id, tileIndex: best, progress: 0, cost });
  return true;
}



/** queue ONE named wonder — the tryQueueWonder body for a single
 * def, shared by the scripted chain above and the driven replay. Re-validates
 * EVERYTHING (unlock, one-per-world, placement): one-per-world is CROSS-SEAT,
 * so a column legal at record time can have been claimed by any civ by apply
 * time — the replay refuses rather than double-building. The capital gate
 * stays OUT: it is the scripted picker's heuristic (the #82 settler lesson),
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
        // Per-city ownership, mirroring canPlaceWonder's `tileCity(tile) ===
        // city.id` — the wonder tile registers to THIS civCity (`Tile.ownerCity`), not
        // merely the civ. Same coherence fix as tryQueueDistrict.
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

/** Run ONE named district project — the queue for a single
 * id, shared by the scripted chain and the driven replay. BASE projects only:
 * the space-race rows ride their own chain (requiresTech/requiresProject and
 * the one-shot spaceProjects ledger), which no mask offers yet. Re-validates
 * the district on THIS city. */
/** Queue a non-space project, judged by the shared `availableProjects` gate. */
export function queueSeatProject(state: GameState, civCity: City, projId: string): boolean {
  const proj = PROJECTS[projId];
  if (!proj || proj.space || proj.victory) return false;
  if (!availableProjects(state, civCity).some((p) => p.id === projId)) return false;
  return queueProject(state, civCity.id, projId, civCity.seat).ok;
}










/**
 * The DIPLOMATIC FAVOR a civ earns this turn — its GOVERNMENT TIER
 * plus DIPLO_FAVOR_PER_SUZERAIN for every city-state it is Suzerain of. Both
 * seats share this shape; `gov` is the civ's adopted government id (null =
 * none, which pays nothing — Chiefdom is tier 0 anyway) and `suzerains` the
 * count from that seat's suzerain test. Zero-draw, integer-only.
 */
/** city-states the SEAT 0 is Suzerain of. */
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
  // every civ commits ALL its favor; the largest commitment wins
  const votes = state.seats.map((sx) => sx.diplomaticFavor ?? 0);
  let win = -1;
  for (let c = 0; c < votes.length; c++) {
    if (votes[c] <= 0) continue; // no favor, no vote
    if (win < 0 || votes[c] > votes[win]) win = c; // ties keep the LOWER seat
  }
  // the commitments are spent whether or not they won
  for (const sx of state.seats) sx.diplomaticFavor = 0;
  if (win < 0) return; // nobody could vote
  const winner = state.seats[win];
  winner.diplomaticPoints = (winner.diplomaticPoints ?? 0) + DVP_PER_RESOLUTION;
}







/** The civCity → civCity transfer (loyalty flips between opponents): pop ×0.75 floor 1,
 * fresh boxes, CITY_CENTER-only registry, half HP, territory re-tags —
 * the shared transferCity shape. */
/**
 * ONE transfer for every seat. There is no seat 0 transfer and no other seat
 * transfer — a city leaves one seat's city list and joins another's. The two
 * `from` is the losing
 * seat (null when a city-state or an unowned city changes hands is not
 * modelled — callers always have a seat). Returns false when the city was
 * RAZED instead of transferred.
 */
export function transferCity(
  state: GameState,
  fromSeat: number,
  to: Seat,
  civCity: City,
  why: string,
  plunder = why === 'conquered',
): boolean {
  // Taking a city earns GRIEVANCES — every seat, not just seat-on-seat.
  to.warmonger = (to.warmonger ?? 0) + WARMONGER_CAPTURE;
  // The losing seat's city list — one lookup, because every seat holds its own.
  const loser = seatOf(state, fromSeat);
  if (loser) {
    loser.cities = loser.cities.filter((c) => c.id !== civCity.id);
    relocatePalace(loser.cities);
    // Routes die with their endpoint (the receiver starts route-less).
    // Foreign routes INTO this city self-heal at the loop's dead-destination
    // filter — city ids are per-seat, so no other list can name this one.
    if (loser.tradeRoutes) loser.tradeRoutes = loser.tradeRoutes.filter((x) => x.from !== civCity.id && x.to !== civCity.id);
  }
  // CONQUEST razes at the winner's city cap — the city simply
  // ceases (tiles freed, centre unpaved, no plunder). Loyalty flips stay
  // uncapped. This arm lived only on the seat 0 path; a seat taking a seat
  // city past its cap silently exceeded it.
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
  // Exactly the flipping city's tiles re-tag, found by registry scan: a
  // work-radius sweep would leak the outer ring and steal sibling frontage.
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
    artifacts: civCity.artifacts, // B-20 (#79): artifacts ride the flip too
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  };
  if (keptBuildings.includes('ANCIENT_WALLS')) flipped.outerHp = 0; // B-30: walls kept, outer pool 0
  to.cities.push(flipped);
  addEraScore(state, to.seat, ERA_SCORE_CONQUER);
  revealAround(state, to.seat, civCity.centerIndex, 3);
  // Real Civ 6 pays the captor gold for taking a city. One rate, every captor.
  if (plunder) to.treasury += 40;
  state.eventLog.push(`${civCity.name} defected to ${to.name}! (${why})`);
  // Losing the last city ends that war — elimination settles like any peace.
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
            `A-24 registry incoherence: actor=${indexOfSeat(actor.seat)} civCity.id=${civCity.id} ${kind}=${type} ` +
              `tile=${tileIndex} ownerSeat=${tileSeat(t)} ownerCity=${tileCity(t)} turn=${state.turn}`,
          );
        }
      };
      for (const d of civCity.districts) check('district', d.tileIndex, d.type);
      for (const w of civCity.wonders ?? []) check('wonder', w.tileIndex, w.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Seat city-state quests — deterministic, zero-draw
// ---------------------------------------------------------------------------

/** Has this seat satisfied its `cityState` quest? The seat-seat twin of
 *  questSatisfied (cityStates.ts), now the shared seat-generic rule. */


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
  // v2 (#70 signature A): production is [[centreTile, col], ...] — the city
  // axis keyed by CENTRE TILE, because slot order and founding order diverge
  // under compaction/capture. Each engine resolves the centre to ITS city.
  const prodPairs = rec.production;
  const techCol = Array.isArray(rec.tech) ? (rec.tech as unknown as number[])[0] : rec.tech;
  const civicCol = Array.isArray(rec.civic) ? (rec.civic as unknown as number[])[0] : rec.civic;
  if (techCol !== null && techCol !== undefined && techCol >= 0 && !actor.research.tech) {
    const t = Object.keys(TECHS)[techCol];
    if (t) actor.research.tech = t;
  }
  if (civicCol !== null && civicCol !== undefined && civicCol >= 0 && !actor.research.civic) {
    const c = Object.keys(CIVICS)[civicCol];
    if (c) actor.research.civic = c;
  }
  // the WAR verb: the recorded declare/peace applies HERE — before the
  // walkers, the exact position the GPU's pre-step war head uses, so a
  // declare turns THIS turn's walkers hostile on both engines. The engine
  // re-validates: peace pays the seat 0's exact gold schedule or refuses
  // (the scripted roll's own body, minus the roll — that lives in the
  // ladder now, rolled from the DRIVER's policy stream, so neither engine's
  // rule stream moves).
  // The ENVOY verb: the recorded picks land here, met + availability
  // re-validated. BANK ONLY — conversion is an eager RULE at the CS phase for
  // every seat, so a decide-time pick can never exceed the bank.
  for (const cityStateIdx of rec.envoys ?? []) {
    const cityState = state.cityStates[cityStateIdx];
    if (!cityState || !hasMet(cityState, actor.seat)) continue;
    if ((actor.envoysAvailable ?? 0) <= 0) continue;
    actor.envoysAvailable = (actor.envoysAvailable ?? 0) - 1;
    addEnvoys(cityState, actor.seat, 1);
  }
  const warCol = rec.war;
  // Self-guard: the war column's target IS seat 0 (the single-axis residual
  // WAR_COLUMN_SEAT documents), so seat 0's own record can never mean it —
  // seat 0 declares on civs through the geoWar arm like every seat.
  if (warCol !== null && warCol !== undefined && warCol >= 0 && actor.seat !== WAR_COLUMN_SEAT) {
    const Rw = state.seats.length - 1;
    if (warCol === 0 && !civsAtWar(state, actor.seat, WAR_COLUMN_SEAT)) {
      setWar(state, actor.seat, WAR_COLUMN_SEAT, true);
      actor.warTurns = 0;
      state.eventLog.push(`${actor.name} declares war on you!`);
    } else if (warCol === Rw && civsAtWar(state, actor.seat, WAR_COLUMN_SEAT) && actor.warTurns >= WAR_MIN_TURNS) {
      const cost = PEACE_GOLD_COST(actor.warTurns);
      if (goldAffordable(actor.treasury ?? 0, cost)) {
        actor.treasury = (actor.treasury ?? 0) - cost;
        makePeace(state, actor);
      }
    }
  }
  for (const [centre, aCol] of prodPairs) {
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
      // The BUILDER prices off the ONE escalator, exactly as
      // the scripted branch and the GPU's queue arm both do — omitting the
      // cost here fell back to the base price and locked r1c1's builder at 30
      // where the GPU locked 32 t61, the qCost family).
      if (id === 'BUILDER') commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0, cost: builderCost(state, actor.seat) });
      else if (id && UNITS[id]) commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0 });
    }
    else if (a >= wonderLo && a < wonderLo + wonders.length) {
      // WONDER: the file names WHICH wonder; the engine re-runs the whole
      // placement scan and the one-per-world check (cross-seat — another civ
      // may have claimed it since recording; the replay refuses, never
      // double-builds).
      const wd = BUILT_WONDERS[wonders[a - wonderLo]];
      if (wd) placeSeatWonder(state, actor, civCity, wd);
    } else if (a >= projectLo && a < projectLo + projects.length) {
      // PROJECT: base rows only; queueSeatProject re-validates.
      queueSeatProject(state, civCity, projects[a - projectLo]);
    } else if (a >= NB + 2 + NU) {
      // DISTRICT: the file names the TYPE, the engine still runs the placement
      // scan — a tile index in the record would be derived state, and the whole
      // point of the schema is that it carries DECISIONS only.
      const si = a - (NB + 2 + NU);
      const d = SCAFFOLD_DISTRICTS[si];
      if (d) placeSeatDistrict(state, actor, civCity, d.id, computeUnlocksIn(actor.research));
    }
  }
  // unit orders are NOT applied here. This function runs at the PICK position;
  // the unit walkers run LATER in the phase, and a replay that acts units
  // early reorders combat against production within the turn. The unit half
  // executes in the war/peace section below, exactly where the walkers would.
}

/** replay this seat's recorded UNIT orders.
 *
 * `rec.units` is one entry per STEP, because #90 made a unit's order a direction
 * SEQUENCE — the GPU driver re-observes between steps (the observation is 1-hop)
 * and records what it chose each time, so a faithful replay walks the same steps
 * in the same order.
 *
 * Row j addresses the seat's j-th unit in SPAWN order, which is what
 * `seat_slot_map` ranks by on the GPU side. the seat's unit list filters `state.units`,
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
export function applySeatUnitOrders(state: GameState, actor: Seat, steps: number[][], seat: number): void {
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
        // FOUND where the settler stands (#71). foundCity re-validates
        // legality and consumes the unit; a refusal soft-fails like every
        // other re-validated verb.
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
          if (tileFreeForUnit(state, to.index, seat, unit, allowEmb)) stepUnit(state, unit, to);
        }
      } else if (a >= 6 && a < 12) {
        // ATTACK — safe to replay now BECAUSE the walkers stand down for
        // driven seats (no double-resolution). The SAME combat calls the
        // walkers make; both re-validate their target.
        const nb = neighbors(state.map, here);
        const to = nb[a - 6];
        if (to) {
          if (UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, to.index);
          else meleeAttack(state, unit.id, to.index, seat);
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
        // BUILDER verbs — the seat walker's OWN bodies (builderActions),
        // re-validated: REPAIR/CHOP-equivalents clear flags without a charge;
        // a BUILD writes the improvement, spends a charge and disbands at 0.
        // validImprovementsIn under the CIV SEAT's unlocks is the legality body
        // (builderImprove's seat 0-facing validImprovements would gate on the
        // wrong civ's techs).
        if ((unit.charges ?? 0) <= 0 && a !== 17) return;
        if (a === 16) {
          // CHOP: remove the feature underfoot (the walker's own remove body)
          if (here.feature && here.feature !== 'FLOODPLAINS' && tileBelongsTo(here, actor.cities.find((c) => tileBelongsTo(here, c)) ?? actor.cities[0])) {
            here.feature = null;
            unit.movesLeft = 0;
          }
        } else if (a === 17) {
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
        // SPREAD — the walker's own body at the replay surface: lump into
        // the target city's pressure accumulator for g, charge -1, disband
        // at 0. HERE = column 38; directions 39-44.
        if ((unit.type === 'MISSIONARY' || unit.type === 'APOSTLE') && (unit.charges ?? 0) > 0 && actor.religion.founded) {
          const g = actor.seat;
          const to38 = a === 38 ? here : neighbors(state.map, here)[a - 39];
          if (to38) {
            const tcity = allCities(state).find((c) => c.centerIndex === to38.index);
            if (tcity) {
              const nRel = state.seats.length - 1 + 1;
              const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
              const lump = Math.round(SPREAD_PRESSURE * (eb?.spreadPressureMult ?? 1));
              let pres = tcity.religionPressure;
              if (!pres || pres.length !== nRel) {
                pres = new Array(nRel).fill(0);
                tcity.religionPressure = pres;
              }
              pres[g] += lump;
              unit.movesLeft = 0;
              unit.charges = (unit.charges ?? 1) - 1;
              if (unit.charges <= 0) disbandUnit(state, unit.id);
            }
          }
        }
      } else if (a >= 26 && a < 38) {
        // SNIPE — the ring-2 tile in TILE-INDEX order (the shared #92 layout:
        // column order IS index order, so both engines enumerate identically).
        const nb1 = neighbors(state.map, here).filter((t): t is Tile => !!t);
        const d1 = new Set(nb1.map((t) => t.index));
        const ring = [...new Set(nb1.flatMap((t) => neighbors(state.map, t)).filter((t): t is Tile => !!t).map((t) => t.index))]
          .filter((i) => i !== here.index && !d1.has(i))
          .sort((x, y) => x - y);
        const rt = ring[a - 26];
        if (rt !== undefined && UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, rt);
      }
    });
  }
}

export function seatPhase(state: GameState, seat: number): void {
  // No early-out on a civ-less roster: seat 0's OWN turn (economy, upkeep,
  // diplomacy, quests) runs through the loop below like every seat's.

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

  // #107: the GEOPOLITICS verbs — wire DECISIONS at their own positions:
  // denounce + alliance, then the civ↔civ declarations, BEFORE the seat
  // loop (a declared war is live for both civs' war-acts this turn; a
  // fresh grudge blocks a same-turn alliance and starts the formal
  // clock); peace lands after the loop. Targets are CIV indices (seat =
  // index + 1). Each arm re-validates its RULES on the named pair; the
  // choosing thresholds (proximity, strength edges, war-weariness pacing)
  // are the driver's policy and never re-checked here.
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.denounce ?? []) {
      const target = seatOf(state, tj + 1);
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
      const target = seatOf(state, tj + 1);
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
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    const tj = recG?.geoWar;
    if (tj === undefined || tj === null || tj < 0) continue;
    const target = seatOf(state, tj + 1);
    if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
    if (civsAtWar(state, actor.seat, target.seat) || seatsAllied(state, actor.seat, target.seat)) continue;
    setWar(state, actor.seat, target.seat, true);
    actor.warmonger = (actor.warmonger ?? 0) + WARMONGER_DOW; // declaring earns grievances
    // FORMAL iff the aggressor's grudge on this target is old enough; a
    // same-turn stamp is 0 old — a surprise.
    const dt = actor.denounced[target.seat];
    const formal = dt !== undefined && state.turn - dt >= FORMAL_WAR_MIN_TURNS;
    setWarFormal(state, actor.seat, target.seat, formal);
    state.eventLog.push(`${actor.name} declares ${formal ? 'a formal' : 'a surprise'} war on ${target.name}!`);
  }

  // EVERY seat takes its turn through this one body, in seat order. There is
  // no seat 0 loop and no seat loop.
  for (const actor of state.seats) {
    // ONE record lookup for the whole seat's turn.
    const recU = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (actor.cities.length === 0) continue; // eliminated

    // War weariness settles at this seat's block top, before
    // seatAmenityTiers uses it — the same call the seat 0's endTurn makes, in
    // the same relative position. The pairwise war state is fixed for this turn
    // by the phase-top DoW pass, so the "at war with somebody" test inside is
    // stable through this block (peace resolves after the loop).
    warWearinessTurn(state, actor.seat);

    // Eurekas/inspirations fire from the CIV SEAT's seat too — the
    // mirror of the seat 0's endTurn-top detectBoosts (same conditions,
    // this civ's cities/research/territory; the discounts apply in the
    // research loops below).
    detectBoosts(state, actor.seat);

    // City-state diplomacy — meet, influence→envoy accrual (flat rate +
    // the adopted government's tier), quests. ONE body for every seat.
    // T1 PERF: this seat's units are invariant from here through the
    // composition count below — no unit spawns/disbands occur in the CS-meet
    // block or the pre-turn count loop (the buy/war/peace loops that DO mutate
    // the list come later), so one filtered list is shared across the
    // uses (unitCount, melee/ranged tally).
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
          const q = issueQuest(state, cityState, actor.seat, { tradeRoutes: actor.tradeRoutes, cities: actor.cities });  // #96: one issuer, every seat
          if (q) {
            rq[actor.seat] = q;
            rqi[actor.seat] = state.turn;
          }
        }
      }
    }

    // Per-city REAL production queues (settler + units at real
    // costs) replace the pooled prodstock/milstock, their pace/split
    // constants and the random home-city draw. Each city queues ONE item —
    // the capital prefers the settler (one in flight per civ), everyone
    // else trains units up to the cap — funds it with its OWN production,
    // and resolves it on completion at that city. Unit TYPE gates on the
    // seat's REAL techs; buildings arrive with B4. Picks
    // happen for the PRE-TURN city set, in founding order, before any
    // same-turn completion can found a new city.
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
    // THE FILE IS THE INTERFACE. A seat with a recorded action for this turn
    // does NOT decide — it applies what the ladder already chose. This is the
    // branch that makes the transcription below deletable: while both exist the
    // file path is verified against it, and once verified the ladder path is the
    // only one left.
    // state.turn is 1-BASED at seatPhase time (createGame starts at 1;
    // endTurn increments after the phases), while the recorder keys 0-based
    // drive-loop turns. Reading [state.turn] skipped record t0 — the only
    // turn that queued anything, since picks are one-shot and every later
    // turn records -1 while the queue is busy. Driven-parity layer 3.
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
        // The BUILDING buy: the wire's centre-keyed intent [0, centreTile,
        // buildingIdx], re-validated here. The index is the SHIPPED catalog
        // order.
        const bv = rec.buy;
        if (bv && bv[0] === 0) {
          const civCity = actor.cities.find((c) => c.centerIndex === bv[1]);
          // the SHIPPED catalog order (prodLayout, the one derivation) — NOT
          // Object.values(BUILDINGS): the exporter filters rows, so raw
          // enumeration is offset (9040 t178: idx 5 resolved ANCIENT_WALLS
          // where the wire meant LIBRARY; both buys refused silently).
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
                if (def.id === 'ANCIENT_WALLS') civCity.outerHp = WALLS_HP; // AUDIT B-1
                bought = true;
              }
            }
          }
        }
      }
      // Kind 1, the SETTLER buy — a UNIT purchase now (#71): the settler
      // spawns at the capital (else the first city), which pays the pop; the
      // afford/pop gates and the no-spot refund all live in purchaseSettler.
      // WHERE it founds is a later unit ORDER, not part of the purchase.
      const wantSettler = rec?.buy?.[0] === 1;
      if (wantSettler && !bought && actor.cities.length > 0) {
        const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
        bought = purchaseSettler(state, spawnCity.id, actor.seat).ok;
      }
      // MILITARY UNIT — when nothing else was bought and the
      // civ's live+queued military is under the #56 H1 quota (2× cities,
      // seat-side), buy the STRONGEST affordable trainable military unit
      // (highest combat, ties to table order) at cost × mult. It spawns via
      // the shared seat machinery at the capital (else the first city), and
      // pays only where it LANDED (no free spot = refund).
      // Kind 2, the MILITARY UNIT buy — the quota and candidate scan below
      // re-validate the intent.
      const wantUnit = rec?.buy?.[0] === 2;
      if (wantUnit && !bought && meleeCount + rangedCount < actor.cities.length * 2) {
        let pickId: string | null = null;
        let pickCombat = -Infinity;
        for (const cand of BUY_UNITS) {
          if (cand.tech && !actor.research.techs.includes(cand.tech)) continue;
          const def = UNITS[cand.id];
          if (!def) continue;
          // Strategic-resource access gates the gold buy too (HORSEMAN
          // needs HORSES) — data-driven off requiresResource, mirroring the ladder.
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
            // A purchased military unit inherits the spawn
            // city's Encampment training XP (best military-building tier).
            if ((UNITS[pickId]?.combat ?? 0) > 0) {
              const xp = encampmentTrainXp(spawnCity.buildings);
              if (xp > 0) u.xp = xp;
            }
          }
        }
      }
      // #104 kind 3, the TILE buy: [3, tileIndex, centreTile] — the CENTRE-
      // keyed city (the v2 convention: ids are engine-local, centres are the
      // shared vocabulary) buys the named tile at the seat's own live price.
      // buyTile is the ONE legality body (adjacency to that city's territory,
      // unowned, afford, the escalator and tilePurchaseMult all live inside
      // it), so this arm is pure re-validated dispatch, exactly like kind 0.
      const bv3 = rec?.buy;
      if (bv3 && bv3[0] === 3 && !bought) {
        const rc3 = actor.cities.find((c) => c.centerIndex === bv3[2]);
        if (rc3) bought = buyTile(state, rc3.id, bv3[1], actor.seat).ok;
      }
    }

    // #104 kinds 4-6, the FAITH purchases — faith is its own currency, so
    // these ride BESIDE the gold buy, in the scripted ladder's own order
    // (worship saturates first, then ONE religious unit — missionary before
    // apostle). Each entry names its city by centre; the legality bodies
    // (buyWorshipBuilding / purchaseReligiousUnit) re-validate everything,
    // and the one-religious-unit rule is enforced HERE regardless of what
    // the wire asks. The envoy split is the precedent: CONVERSION is
    // automatic in Civ 6 and stayed a rule; a purchase is a choice.
    {
      let boughtRelig = false;
      for (const [fk, centre] of rec?.buyFaith ?? []) {
        const civCityF = actor.cities.find((c) => c.centerIndex === centre);
        if (!civCityF) continue;
        if (fk === 4) buyWorshipBuilding(state, civCityF.id, actor.seat);
        else if ((fk === 5 || fk === 6) && !boughtRelig) {
          boughtRelig = purchaseReligiousUnit(state, civCityF.id, fk === 5 ? 'MISSIONARY' : 'APOSTLE', actor.seat).ok;
        }
      }
    }

    // #104 kind 7, the CITY-STATE LEVY — gold, but a diplomacy action, not
    // the one-gold-purchase slot (levyUnits pays its own way). The wire
    // names the CS by index; levyUnits is the ONE legality body
    // (militaristic, suzerain, cooldown, afford — at-war is the DRIVER's
    // policy gate, not a rule, so a mid-turn peace does not refuse here).
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
        // international: considered AFTER domestic + CS (only when no
        // domestic/CS candidate exists) — a route to ANY OTHER major seat's
        // city whose centre this seat has EXPLORED (fog is the meeting rule
        // here, as for city-states), gold-heavy and picked by NEAREST-city
        // preference (min hex distance; ties keep the first in from-asc,
        // target-seat-asc, city-asc order).
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
          // The seat route's Trader lays road along its land path.
          // Destination centre: an own city, a met city-state, or a seat 0 city.
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
      // duration: after the pick, drop routes whose expiresTurn has
      // arrived — the freed capacity re-picks NEXT turn (zero draws). Also
      // drop international routes whose destination city no longer exists.
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
    // The luxury map and modifiers FREEZE at the loop top: loyalty, growth
    // and yields all read this turn's snapshot, and defections resolve after
    // the loop. Exactly the discipline endTurn uses.
    const luxMap = luxuryAmenities(state, actor.seat);
    const seatMods = getModifiers(state, actor.seat);
    const cityStats = new Map<number, CityStats>();
    for (const civCity of actor.cities) cityStats.set(civCity.id, computeCityStats(state, civCity, luxMap, seatMods));
    // S3: this seat's governor seats for THIS turn — same stateless
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
      // Seat city loyalty at the loop top (the seat 0's
      // applyLoyalty position) — own = THIS civ's cities, foreign = the
      // seat 0's + every other seat's; capitals are immune; live pops
      // (earlier cities in this loop already grew — the seat 0's mix).
      if (applyLoyalty(state, civCity, tier.name, rGovIds.has(civCity.id) ? GOVERNOR_LOYALTY : 0)) {
        civCityDefectors.push(civCity);
      }
      const y = stats.total;
      // `total.gold` is already NET of district+building upkeep — computeCityStats
      // subtracts it — so this must not charge it a second time.
      goldSum += y.gold;
      faithSum += y.faith; // P5/S5 (C-17): the faith yield gains its consumer
      const production = y.production;
      // Seat science/culture streams. The citizens' term
      // is already inside `y` — and now inside the amenity tier with it, which
      // is where the seat 0's has always been.
      sciSum += y.science;
      const culC = y.culture;
      culSum += culC;

      // ONE growth rule for every seat: the surplus arrives pre-folded (the
      // housing, amenity, belief and wonder factors all live in
      // computeCityStats) and seatGrowth banks, grows or starves.
      seatGrowth(civCity, stats.effectiveFoodSurplus, stats.growthNeeded);
      // Queue progress + completion (settler founds via the site scan; a
      // unit spawns at THIS city — no home-city RNG draw anymore).
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
            ? q.cost ?? UNITS[q.unit]?.cost ?? 54 // P4/D-10: builders lock at queue
            : q.kind === 'building'
              ? BUILDINGS[q.building]?.cost ?? 54
              : q.kind === 'wonder'
                ? BUILT_WONDERS[q.wonder]?.cost ?? 54 // A-4: catalog cost (already speed-scaled)
                : q.cost ?? 54; // settler / district / project carry their own cost
        if (q.progress >= cost) {
          civCity.queue.shift();
          completeQueueItem(state, civCity, q, cost);
          // A completion's OVERFLOW carries to the next item, for every seat.
          // this is the largest single production leak in the model.
          // `City = City`, so the bank field the seat 0 has
          // used since V-H1 is already here — nothing new to store.
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
      // Cultural border growth: this city's culture (the culSum term,
      // pre-growth pop) fills its own box and consumes against the escalating
      // curve.
      civCity.cultureBox += culC;
      // Religious Settlements — the belief border-cost multiplier,
      // the seat 0's Math.round(base * borderCostMult) form (city.ts:507).
      const civCityBorderCost = () =>
        Math.round(borderGrowthCost(civCity.tilesAcquired) * getModifiers(state, actor.seat).borderCostMult);
      while (civCity.cultureBox >= civCityBorderCost()) {
        const next = pickBorderTile(state, civCity, { map: state.map, mods: getModifiers(state, actor.seat) });
        if (next === null) {
          // Nowhere to grow: cap the box at the current threshold.
          civCity.cultureBox = Math.min(civCity.cultureBox, civCityBorderCost());
          break;
        }
        civCity.cultureBox -= civCityBorderCost();
        // The same claim the seat 0 uses. `acquireTile` now gates its
        // fog reveal on the seat, so this stopped needing a hand-copy.
        acquireTile(state, civCity, next);
      }
      // The mirror of the seat 0 city strike (combat.ts) —
      // a foreign city WITH ANCIENT_WALLS fires once per turn at the nearest
      // unit hostile to THIS civ (barbarians always; the seat 0's at-war
      // units, civilians included), lowest tile index breaking ties. One
      // roll at the foreign city's defense strength vs the target's defense
      // (cityDefenseStrength; single roll, no retaliation, never captures).
      // civCity order, immediately before the heal — a kill shifts the shared RNG.
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
            (u) => unitsHostile(state, u, { seat: actor.seat }), // #51/S7.1 (#59)
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          // support (the pcstk mirror; attacker is the city — no flanking).
          // An embarked target defends at the flat EMBARKED_DEFENSE_CS.
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender); // B-4 defender veterancy (embarked → flat, no xp)
          // The general/admiral aura shields against city fire,
          // outside the embarked ternary (the combat.ts pcstk mirror).
          const defCSa = defCS + generalAuraCS(state, defender, bestTile);
          const atkCS = cityDefenseStrength(state, civCity);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'rcstk', bestTile);
          awardDefenseXp(defender); // B-4: +2 to a surviving military defender (attacker is the city)
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true }); // #51/S7.8f, the pcstk twin
          if (defender.hp <= 0) killUnit(state, defender, seat);  // #51/S7.12: a dig, like the seat 0's strike
        }
      }
      // The mirror of the ADDITIONAL Encampment strike
      // (the pestk twin). A seat city with a COMPLETE unpillaged ENCAMPMENT
      // fires the same once-per-turn ranged strike right AFTER its walls strike
      // (walls first, then Encampment — per civCity, before the heal), k="restk".
      // A LIVE garrison is now required — an Encampment reduced to
      // 0 HP is occupied and fires nothing (the pestk twin's rule).
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
            (u) => unitsHostile(state, u, { seat: actor.seat }), // #51/S7.1 (#59)
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender);
          const defCSa = defCS + generalAuraCS(state, defender, bestTile); // #70/S2 (B-8), the rcstk mirror
          const atkCS = cityDefenseStrength(state, civCity);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'restk', bestTile);
          awardDefenseXp(defender);
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true }); // #51/S7.8f, the pestk twin
          if (defender.hp <= 0) killUnit(state, defender, seat);  // #51/S7.12: a dig, like the seat 0's strike
        }
      }
      // A siege pins the HP: any adjacent unit hostile to THIS civ counts,
      // CIVILIANS included, per `unitsHostile` — the same predicate the rest
      // of the heal gate uses.
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
        // The Encampment garrison repairs on the same gate/rate —
        // the seat 0's barbarianPhase mirror.
        for (const d of civCity.districts) {
          if (d.type !== 'ENCAMPMENT') continue;
          const dt = state.map.tiles[d.tileIndex];
          if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
          dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
        }
      }
    }

    // Loyalty collapses resolve after the city loop (they
    // mutate the list) — to the max-pressure civ; the SEAT 0 can win one.
    for (const civCity of civCityDefectors) flipCity(state, civCity);

    // REAL research — cheapest-first auto-pick at RAW cost (no
    // eurekas for opponents until B6; ties keep the tech-table order via the
    // stable sort, mirroring the seat 0's autoPickResearch), progress
    // banks and drains exactly like advanceResearch.
    const rsr = actor.research;
    // Cheapest-first by EFFECTIVE cost, like the seat 0's auto-pick
    // (boosts discount the pick key; stable sort keeps table-order ties).
    // The golden FREE_INQUIRY / PEN_BRUSH_AND_VOICE extra
    // 10% belongs to THIS seat, not to civ 0. It is in the pick KEY as well
    // as the completion test because the discount changes which item is
    // cheapest — that is exactly what #79's hunt found on the seat 0 side.
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
    // Boosted techs complete at the discounted cost, like the seat 0's
    // advanceResearch (effectiveResearchCostIn — same rounding).
    while (rsr.tech && rsr.techProgress >= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech)) {
      rsr.techProgress -= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech);
      rsr.techs.push(rsr.tech);
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
    // Net gold — city upkeep already netted per city; unit
    // upkeep and the bankruptcy rule are the same for every seat
    // (milli-rounded test; disband the priciest-upkeep unit, tie → lowest
    // id; no refund).
    actor.treasury = (actor.treasury ?? 0) + goldSum;
    actor.faith = (actor.faith ?? 0) + faithSum; // P5/S5 (C-17)
    // Tourism, diplomatic favor and grievance decay — the shared
    // per-seat accumulators, at the position they have always held.
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
      rsr.civicProgress -= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic);  // A-3
      rsr.civics.push(rsr.civic);
      rsr.civic = null;
      pickNext();
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);

    // Builder actions (build best-Δ improvement or walk to a job).
    // driven-parity layer 5: the GPU stands the BUILDER POLICY down for
    // controlled seats ("controlled opponents' builders answer to the units
    // head", `active & ~controlled`); this call was ungated, TS builders kept

    // Races: great people, then pantheons and beliefs.
    advanceGreatPeople(state, actor.seat);

    // The BELIEF RACES — eager rules for EVERY seat row, seat 0 included
    // (#73). Identities are POLICY draws from the open pools; every gate and
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
        // Freeze the holy tile (the LIVE capital's center at founding, else
        // the first live city) — the source of this religion's pressure.
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

    // The Great General marches with the war effort (spawned above
    // in advanceGreatPeople — a fresh one walks this turn on its full MP). Runs
    // BEFORE the war loop so the aura reflects the general's advanced position.

    // War and peace. The two counters are the RULE; the units are the WIRE.
    // A seat's unit orders are replayed here, at the position the turn gives
    // them, so a recorded trajectory reproduces exactly.
    const anyWar = atWarWithAny(state, actor.seat);
    if (anyWar) {
      if (civsAtWar(state, actor.seat, seat)) actor.warTurns += 1;
    } else {
      actor.peaceTurns += 1;
    }
    // Seat 0's units ride the TRIPLES schema and are applied by the driver
    // pre-endTurn (the GPU steps them at the top of step() the same way);
    // reading triples as per-unit rows here would dispatch garbage. The one
    // unit-wire fork left — unify the schema to route it too (#108).
    if (recU && actor.seat !== 0) applySeatUnitOrders(state, actor, recU.units, seat);
  }

  // #107: the civ↔civ PEACE arm — after every seat acted, the pair named
  // on the LOWER civ index's record. The rule is only "at war"; the
  // war-weariness threshold that CHOOSES to sue is the driver's, read
  // from the pre-turn observation like the seat-0 sue verb.
  for (const actor of state.seats) {
    if (!isCiv(actor.seat)) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.geoPeace ?? []) {
      const target = seatOf(state, tj + 1);
      if (!target || !isCiv(target.seat)) continue;
      if (!civsAtWar(state, actor.seat, target.seat)) continue;
      setWar(state, actor.seat, target.seat, false);
      warWearinessPeace(state, actor.seat, target.seat);
      setWarFormal(state, actor.seat, target.seat, false); // the ended war's kind clears (the grudge stays)
      state.eventLog.push(`${actor.name} and ${target.name} make peace.`);
    }
  }

  // Env-gated registry coherence check at the phase tail (after every
  // founding/placement/capture this turn). Off by default → zero cost + no
  // trajectory change; the GPU forced-compaction gate exercises the twin.
  // globalThis avoids a @types/node dependency (the src tsconfig has none).
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_RC_REGISTRY_CHECK) {
    assertCityRegistryCoherent(state);
  }
}
