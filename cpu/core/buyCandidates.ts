/**
 * THE PURCHASE AND ROUTE CANDIDATES — what a seat COULD buy or open right
 * now, as pure reads of the state. Every clause is the appliers' own validity
 * check (the gold block and the faith block of the seat phase,
 * `purchaseSeatDistrict`, `patronizeGreatPerson`, `levyUnits`), so the
 * candidate a decider is offered is one the applier will take.
 *
 * Cities are named by CENTRE tile, -1 where none; the field names are the
 * `buy` and `route` groups of `shared/decide.schema.json`.
 */
import type { City, DistrictId, GameState, Seat, Tile } from './types';
import { civsAtWar, seatOf, tileBelongsTo } from './seats';
import { GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, CITY_WORK_RADIUS } from '../data/constants';
import { PEACE_GOLD_COST, DED_MONUMENTALITY } from '../data/seats';
import { tradeCapacity, freeTrader, routeYields, routeYieldsInternational, cityStateRouteYields, routeInRange, routePostGold } from './trade';
import { isExplored } from './fog';
import {
  buildingFaithCost, faithBuyableClass, faithBuysLandUnits, goldAffordable, naturalistCost, rockBandCost,
  settlerCost, tilePurchaseCost, unitFaithCost, unitPurchaseCost, unitsAcquired, wallsGoldBlocked,
} from './game';
import { goldenDedication, monumentalityBuyMult } from './eras';
import { builderCost, goldBuyableUnits, purchaseSpotBlocked, trainableUnits } from './units';
import { hasMet, isSuzerain } from './cityStates';
import { pickBorderTile } from './city';
import { WORSHIP_BUILDINGS, MISSIONARY_CAP, APOSTLE_CAP, INQUISITOR_CAP, ENHANCER_BELIEFS } from '../data/religion';
import { availableBuildings, buildingCompletable, canPlaceDistrictIn, goldPurchasableBuildings } from './rules';
import { computeUnlocks, isCivicComplete, goldPrice, faithPrice, makeYieldCtx } from './effects';
import { congressUdtBlockedDistrict } from './congress';
import { districtSiteCost, levyGoldCost } from './phase';
import { patronageCost } from './greatPeople';
import { governorFlag } from './governors';
import { prodLayout } from './prodLayout';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { SCAFFOLD_DISTRICTS } from '../data/districts';
import { GP_CLASSES } from '../data/greatPeople';
import { LEVY_COOLDOWN } from '../data/cityStates';
import { tilesWithin } from '../../world/hex';

/** The route CANDIDATE this seat would take — over EVERY legal destination at
 * once: own cities in array order, then MET city-states, then every other
 * major's EXPLORED cities (from asc, to asc, cityState asc, seat asc). Best NEW
 * in-range pair by the route's TOTAL yields, strictly-greater beats, so ties
 * keep the first pair in that scan order. [origin CENTRE, dest code (CENTRE or
 * -(2 + city-state ID))], [-1,-1] = none. Gated on capacity AND a free Trader
 * — the unit the verb spends. */
export function routeCandidateRow(state: GameState, actor: Seat): number[] {
  const routes = actor.tradeRoutes ?? [];
  if (actor.cities.length < 1) return [-1, -1];
  if (routes.length >= tradeCapacity(state, actor.seat)) return [-1, -1];
  if (state.unitsMode && !freeTrader(state, actor.seat)) return [-1, -1];
  let best: { from: number; dest: number; ySum: number } | null = null;
  for (const from of actor.cities) {
    for (const to of actor.cities) {
      if (to.id === from.id) continue;
      if (routes.some((x) => x.from === from.id && x.to === to.id)) continue;
      if (!routeInRange(state, actor.seat, from.centerIndex, to.centerIndex)) continue;
      const y = routeYields(state, to);
      const ySum = y.food + y.production;
      if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: to.centerIndex, ySum };
    }
    for (const cityState of state.cityStates) {
      // THE DEST CODE NAMES THE CITY-STATE'S ID, never its position in the
      // array: `captureCityState` splices the array, and the applier decodes
      // the code with `cityStateById`.
      const ci = cityState.id;
      const gMet = hasMet(cityState, actor.seat);
      const gHas = routes.some((x) => x.from === from.id && x.toCs === cityState.id);
      const gRch = routeInRange(state, actor.seat, from.centerIndex, cityState.centerIndex);
      // EVERY city-state, gate by gate — a candidate one engine holds and the
      // other refuses is the whole question, and only the gates answer it.
      const dlG = (globalThis as { __diffLog?: string[] }).__diffLog;
      if (dlG) dlG.push(`rg:${actor.seat}:${state.turn}:${-(2 + ci)} f${from.centerIndex} met${gMet ? 1 : 0} has${gHas ? 1 : 0} reach${gRch ? 1 : 0} ctr${cityState.centerIndex}`);
      if (!gMet || gHas || !gRch) continue;
      const cy = cityStateRouteYields(cityState);
      const post = routePostGold(state, actor.seat, cityState.centerIndex);
      const ySum = cy.food + cy.production + cy.gold + cy.science + cy.culture + cy.faith + post;
      // the ROUTE decomposition: one line per city-state candidate past the
      // three gates, so a pair that disagrees names the term, not the answer
      const dlC = (globalThis as { __diffLog?: string[] }).__diffLog;
      if (dlC) dlC.push(`rc:${actor.seat}:${state.turn}:${-(2 + ci)} f${from.centerIndex} y${ySum - post} post${post} key${ySum}`);
      if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: -(2 + ci), ySum };
    }
    // An INTERNATIONAL destination competes on the same total-yield key as a
    // domestic or city-state one; it is not a fallback.
    for (const other of state.seats) {
      if (other.seat === actor.seat) continue;
      for (const pc of other.cities) {
        if (!isExplored(state, actor.seat, pc.centerIndex)) continue;
        if (routes.some((x) => x.from === from.id && x.toSeat === other.seat && x.toSeatCity === pc.id)) continue;
        if (!routeInRange(state, actor.seat, from.centerIndex, pc.centerIndex)) continue;
        const py = routeYieldsInternational(state, from, pc, actor.seat);
        const ySum = py.food + py.production + py.gold + py.science + py.culture + py.faith
          + routePostGold(state, actor.seat, pc.centerIndex);
        if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: pc.centerIndex, ySum };
      }
    }
  }
  return best ? [best.from, best.dest] : [-1, -1];
}

/** The `buy` group: every purchase candidate of one seat, keyed and ordered
 *  as the schema lists them. */
export interface BuyContext {
  bldg_city: number; bldg: number; can_building: boolean; bldg_price: number;
  settler_ok: boolean; unit_ok: boolean;
  tile_ok: boolean; tile: number; tile_city: number;
  monu_builder_ok: boolean; monu_settler_ok: boolean; spawn_city: number;
  worship_ok: boolean; worship_city: number;
  missionary_ok: boolean; missionary_city: number;
  apostle_ok: boolean; apostle_city: number;
  inquisitor_ok: boolean; inquisitor_city: number;
  monk_ok: boolean; monk_city: number;
  levy_ok: boolean; levy_cs: number;
  nat_ok: boolean; nat_city: number;
  band_ok: boolean; band_city: number;
  cls_ok: boolean; cls_city: number; cls_bldg: number;
  ucls_ok: boolean; ucls_city: number; ucls_unit: number;
  pat_f_ok: boolean; pat_f_cls: number;
  pat_g_ok: boolean; pat_g_cls: number;
  dist_g_ok: boolean; dist_g_tile: number; dist_g_row: number;
  dist_f_ok: boolean; dist_f_tile: number; dist_f_row: number;
}

/** a building's production-layout row */
function bIdx(id: string): number {
  return prodLayout().buildings.indexOf(id);
}

/** The cheapest building this seat may buy among `offers` (one list per
 *  city, in the seat's array order): the lowest price, then the lower layout
 *  row, then the earlier city. */
function cheapestBuilding(
  actor: Seat, offers: (city: City) => { id: string; cost: number }[],
): { city: City; id: string } | null {
  let best: { city: City; id: string; cost: number; b: number } | null = null;
  for (const city of actor.cities) {
    for (const def of offers(city)) {
      const b = bIdx(def.id);
      if (b < 0) continue;
      if (!best || def.cost < best.cost || (def.cost === best.cost && b < best.b)) {
        best = { city, id: def.id, cost: def.cost, b };
      }
    }
  }
  return best;
}

/** The GOLD building buy — the seat phase's kind-0 arm: the shared gold list
 *  with `buildingCompletable`, minus the rows gold never buys, affordable
 *  over the peace-gold reserve. Where nothing is buyable the fields name
 *  layout row 0 in the first city at that row's price, with `can` false —
 *  the GPU observation's value for an empty candidate set. */
export function goldBuildingCandidate(state: GameState, actor: Seat): { city: number; bldg: number; can: boolean; price: number } {
  const best = cheapestBuilding(actor, (city) => goldPurchasableBuildings(state, city).filter((def) =>
    !def.worship && !def.noPurchase && !wallsGoldBlocked(state, actor.seat, def.id)
    && buildingCompletable(state, city, def.id)));
  if (!best) {
    const id0 = prodLayout().buildings[0];
    return {
      city: actor.cities[0]?.centerIndex ?? -1, bldg: 0, can: false,
      price: goldPrice(state, actor.seat, (BUILDINGS[id0]?.cost ?? 0) * GOLD_PURCHASE_MULT),
    };
  }
  const price = goldPrice(state, actor.seat, BUILDINGS[best.id].cost * GOLD_PURCHASE_MULT);
  const can = Math.round((actor.treasury ?? 0) * 1000) >= Math.round((price + PEACE_GOLD_COST(0)) * 1000);
  return { city: best.city.centerIndex, bldg: bIdx(best.id), can, price };
}

/** Valletta's (and the Songs of the Jeli's) FAITH class buy —
 *  `purchaseBuildingWithFaith`'s checks: a faith-buyable class row on the
 *  city's list, completable, the cheapest one affordable in faith. */
export function faithClassCandidate(state: GameState, actor: Seat): { ok: boolean; city: number; bldg: number } {
  const none = { ok: false, city: -1, bldg: -1 };
  const best = cheapestBuilding(actor, (city) => availableBuildings(state, city).filter((def) =>
    faithBuyableClass(state, actor.seat, def.id) && buildingCompletable(state, city, def.id)));
  if (!best) return none;
  const cost = faithPrice(state, actor.seat, buildingFaithCost(state, actor.seat, best.id));
  if (!goldAffordable(actor.faith ?? 0, cost)) return none;
  return { ok: true, city: best.city.centerIndex, bldg: bIdx(best.id) };
}

/** where a bought unit spawns: the capital, else the first city */
export function spawnCity(actor: Seat): City | undefined {
  return actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
}

/** the military units this seat fields — live, plus each city's queue head */
function armyCount(state: GameState, actor: Seat): number {
  let mil = 0;
  for (const u of state.units) {
    if (u.seat !== actor.seat) continue;
    if ((UNITS[u.type]?.combat ?? 0) > 0) mil += 1;
  }
  for (const city of actor.cities) {
    const q = city.queue[0];
    if (q?.kind === 'unit' && q.unit && (UNITS[q.unit]?.combat ?? 0) > 0) mil += 1;
  }
  return mil;
}

/** the seat's live units of one type */
function liveUnits(state: GameState, seat: number, type: string): number {
  let n = 0;
  for (const u of state.units) if (u.seat === seat && u.type === type) n += 1;
  return n;
}

/** a complete, unpillaged Holy Site in this city */
function holySiteOk(state: GameState, city: City): boolean {
  const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
  const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
  return !!ht?.districtComplete && !ht.districtPillaged;
}

/** The land combat unit faith buys (Theocracy, the Grand Master's Chapel) —
 *  `purchaseUnitWithFaith`'s checks at the spawn city: the strongest
 *  trainable land combat chassis the faith pays for, table order breaking
 *  the tie. */
export function faithLandUnitCandidate(state: GameState, actor: Seat): { ok: boolean; city: number; unit: number } {
  const none = { ok: false, city: -1, unit: -1 };
  const spawn = spawnCity(actor);
  if (!spawn || !faithBuysLandUnits(state, actor.seat)) return none;
  let pick: string | null = null;
  let pickCombat = -Infinity;
  for (const def of trainableUnits(state, actor.seat)) {
    if ((def.combat ?? 0) <= 0 || def.naval || def.air !== undefined || def.noGold) continue;
    if (purchaseSpotBlocked(state, spawn, actor.seat, def.id)) continue;
    const cost = faithPrice(state, actor.seat, unitFaithCost(def.id, 1, unitsAcquired(state, actor.seat, def.id)));
    if (!goldAffordable(actor.faith ?? 0, cost)) continue;
    if (def.combat > pickCombat) {
      pickCombat = def.combat;
      pick = def.id;
    }
  }
  if (!pick) return none;
  return { ok: true, city: spawn.centerIndex, unit: prodLayout().units.indexOf(pick) };
}

/** Patronage per purse — `patronizeGreatPerson`'s checks: a standing offer
 *  the seat did not pass on, affordable; the class with the fewest missing
 *  points, the lower class on a tie. */
export function patronageCandidate(state: GameState, actor: Seat, gold: boolean): { ok: boolean; cls: number } {
  const purse = gold ? (actor.treasury ?? 0) : (actor.faith ?? 0);
  let best = -1;
  let bestD = Infinity;
  GP_CLASSES.forEach((cls, i) => {
    if ((state.gpOffer?.[i] ?? -1) < 0 || (state.gpPassedBy?.[i] ?? -1) === actor.seat) return;
    const cost = patronageCost(state, actor.seat, cls, gold);
    if (!Number.isFinite(cost) || !goldAffordable(purse, cost)) return;
    const d = Math.max(0, (state.gpPrice?.[i] ?? 0) - (actor.gpp[cls] ?? 0));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { ok: best >= 0, cls: best };
}

/** The district a seat may BUY outright — `purchaseSeatDistrict`'s checks
 *  (the governor promotion of the city holding the site, a legal site with
 *  no improvement on it, the purse): the first scaffold row the seat has
 *  unlocked and can afford, in the first city whose governor carries the
 *  promotion and that has a legal site, on its lowest site tile. */
export function districtBuyCandidate(state: GameState, actor: Seat, viaFaith: boolean): { ok: boolean; tile: number; row: number } {
  const none = { ok: false, tile: -1, row: -1 };
  const gated = actor.cities.filter((c) => (viaFaith
    ? governorFlag(state, c, (e) => e.districtFaithBuy)
    : governorFlag(state, c, (e) => e.districtGoldBuy)));
  if (!gated.length) return none;
  const unlocks = computeUnlocks(state, actor.seat);
  const purse = viaFaith ? (actor.faith ?? 0) : (actor.treasury ?? 0);
  for (let si = 0; si < SCAFFOLD_DISTRICTS.length; si++) {
    const id: DistrictId = SCAFFOLD_DISTRICTS[si].id;
    if (!unlocks.districts.has(id)) continue;
    const cost = districtSiteCost(state, actor, id, unlocks);
    const price = viaFaith
      ? faithPrice(state, actor.seat, Math.round(cost * FAITH_PURCHASE_MULT))
      : goldPrice(state, actor.seat, Math.round(cost * GOLD_PURCHASE_MULT));
    if (!goldAffordable(purse, price)) continue;
    for (const city of gated) {
      const ctr = state.map.tiles[city.centerIndex];
      const owns = (t: Tile) => tileBelongsTo(t, city);
      const sites = tilesWithin(state.map, ctr.col, ctr.row, CITY_WORK_RADIUS)
        .filter((t) => !t.improvement && canPlaceDistrictIn(state, city, id, t.index, { unlocks, ownsTile: owns }).ok)
        .map((t) => t.index);
      if (sites.length) return { ok: true, tile: Math.min(...sites), row: si };
    }
  }
  return none;
}

/** Every purchase candidate of `seat` — the `buy` group. */
export function buyContext(state: GameState, seat: number): BuyContext {
  const actor = seatOf(state, seat);
  const cities = actor?.cities ?? [];
  const bc = actor ? goldBuildingCandidate(state, actor) : { city: -1, bldg: 0, can: false, price: 0 };
  const out: BuyContext = {
    bldg_city: bc.city, bldg: bc.bldg, can_building: bc.can, bldg_price: bc.price,
    settler_ok: false, unit_ok: false, tile_ok: false, tile: -1, tile_city: -1,
    monu_builder_ok: false, monu_settler_ok: false, spawn_city: -1,
    worship_ok: false, worship_city: -1, missionary_ok: false, missionary_city: -1,
    apostle_ok: false, apostle_city: -1, inquisitor_ok: false, inquisitor_city: -1,
    monk_ok: false, monk_city: -1, levy_ok: false, levy_cs: -1,
    nat_ok: false, nat_city: -1, band_ok: false, band_city: -1,
    cls_ok: false, cls_city: -1, cls_bldg: -1, ucls_ok: false, ucls_city: -1, ucls_unit: -1,
    pat_f_ok: false, pat_f_cls: -1, pat_g_ok: false, pat_g_cls: -1,
    dist_g_ok: false, dist_g_tile: -1, dist_g_row: -1, dist_f_ok: false, dist_f_tile: -1, dist_f_row: -1,
  };
  if (!actor || cities.length === 0) return out;
  const treasury = actor.treasury ?? 0;
  const faith = actor.faith ?? 0;
  const spawn = spawnCity(actor)!;
  out.spawn_city = spawn.centerIndex;

  // kind 1, the gold settler — `purchaseSettler` at the spawn city
  out.settler_ok = spawn.population >= 2
    && !purchaseSpotBlocked(state, spawn, seat, 'SETTLER')
    && goldAffordable(treasury, goldPrice(state, seat, settlerCost(state, seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, seat)));
  // kind 2, the gold military unit — under two per city, `unitPurchaseCost`
  // being the price the applier charges
  out.unit_ok = armyCount(state, actor) < cities.length * 2
    && goldBuyableUnits(state, seat).some((def) => !purchaseSpotBlocked(state, spawn, seat, def.id)
      && goldAffordable(treasury, goldPrice(state, seat, unitPurchaseCost(state, def.id, seat, spawn))));
  // kind 3, the tile — the FIRST city with a border pick names it, and an
  // unaffordable pick ends the search. The seat's whole yield context, as the
  // applier's own pick reads it.
  const ctx = makeYieldCtx(state, seat);
  for (const city of cities) {
    const next = pickBorderTile(state, city, ctx);
    if (next === null) continue;
    if (goldAffordable(treasury, tilePurchaseCost(state, city, next))) {
      out.tile_ok = true;
      out.tile = next;
      out.tile_city = city.centerIndex;
    }
    break;
  }
  // kinds 8 and 9, the Monumentality faith civilians at the spawn city
  if (goldenDedication(state, seat, DED_MONUMENTALITY)) {
    out.monu_builder_ok = liveUnits(state, seat, 'BUILDER') < 1
      && goldAffordable(faith, faithPrice(state, seat, builderCost(state, seat) * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, seat)));
    out.monu_settler_ok = spawn.population >= 2
      && goldAffordable(faith, faithPrice(state, seat, settlerCost(state, seat) * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, seat)));
  }
  // kinds 4, 5, 6, 11 — the founded religion's worship building and units.
  // A Shrine sells the Missionary; the Apostle and the Inquisitor need a
  // Temple on top; every unit tier sells only in a city with a majority
  // religion.
  if (actor.religion.founded) {
    const wid = WORSHIP_BUILDINGS[seat % WORSHIP_BUILDINGS.length];
    const wCity = cities.find((c) => !c.buildings.includes(wid) && c.buildings.includes('TEMPLE') && holySiteOk(state, c));
    if (wCity && congressUdtBlockedDistrict(state) !== 'HOLY_SITE'
      && goldAffordable(faith, faithPrice(state, seat, buildingFaithCost(state, seat, wid)))) {
      out.worship_ok = true;
      out.worship_city = wCity.centerIndex;
    }
    const follows = (c: City) => (c.followedReligion ?? -1) >= 0;
    const shrineCity = cities.find((c) => c.buildings.includes('SHRINE') && holySiteOk(state, c) && follows(c));
    const templeCity = cities.find((c) => c.buildings.includes('SHRINE') && c.buildings.includes('TEMPLE')
      && holySiteOk(state, c) && follows(c));
    const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
    const price = (t: string, mult = 1) => faithPrice(state, seat, unitFaithCost(t, mult, unitsAcquired(state, seat, t)));
    if (shrineCity && liveUnits(state, seat, 'MISSIONARY') < MISSIONARY_CAP
      && goldAffordable(faith, price('MISSIONARY', eb?.missionaryCostMult ?? 1))) {
      out.missionary_ok = true;
      out.missionary_city = shrineCity.centerIndex;
    }
    if (templeCity && liveUnits(state, seat, 'APOSTLE') < APOSTLE_CAP && goldAffordable(faith, price('APOSTLE'))) {
      out.apostle_ok = true;
      out.apostle_city = templeCity.centerIndex;
    }
    if (templeCity && actor.religion.inquisition && liveUnits(state, seat, 'INQUISITOR') < INQUISITOR_CAP
      && goldAffordable(faith, price('INQUISITOR'))) {
      out.inquisitor_ok = true;
      out.inquisitor_city = templeCity.centerIndex;
    }
  }
  // kind 14, the Warrior Monk — the CITY's majority religion carries the
  // belief, whichever seat founded it; a Temple and a working Holy Site
  if (UNITS.WARRIOR_MONK) {
    const monkCity = cities.find((c) => {
      const rel = c.followedReligion ?? -1;
      return rel >= 0 && seatOf(state, rel)?.religion.follower === 'WARRIOR_MONKS'
        && c.buildings.includes('TEMPLE') && holySiteOk(state, c);
    });
    if (monkCity && goldAffordable(faith, faithPrice(state, seat, unitFaithCost('WARRIOR_MONK', 1, unitsAcquired(state, seat, 'WARRIOR_MONK'))))) {
      out.monk_ok = true;
      out.monk_city = monkCity.centerIndex;
    }
  }
  // kind 7, the levy — `levyUnits`' checks over the city-states by id, and
  // the seat at war with another major
  const atWar = state.seats.some((o) => o.seat !== seat && civsAtWar(state, seat, o.seat));
  if (atWar && goldAffordable(treasury, levyGoldCost(state, seat))) {
    const byId = [...state.cityStates].sort((a, b) => a.id - b.id);
    const cs = byId.find((c) => c.type === 'militaristic' && isSuzerain(state, c, seat)
      && state.turn - (c.lastLevyTurn ?? -LEVY_COOLDOWN) >= LEVY_COOLDOWN);
    if (cs) {
      out.levy_ok = true;
      out.levy_cs = cs.id;
    }
  }
  // kind 10, the Naturalist — behind its civic, one live at a time
  const nat = UNITS.NATURALIST;
  if (nat && liveUnits(state, seat, 'NATURALIST') < 1
    && (!nat.requiresCivic || isCivicComplete(state, nat.requiresCivic, seat))
    && goldAffordable(faith, faithPrice(state, seat, naturalistCost(state, seat)))) {
    out.nat_ok = true;
    out.nat_city = spawn.centerIndex;
  }
  // kind 16, the Rock Band — behind its civic, at its progressive price
  const band = UNITS.ROCK_BAND;
  if (band && (!band.requiresCivic || isCivicComplete(state, band.requiresCivic, seat))
    && goldAffordable(faith, faithPrice(state, seat, rockBandCost(state, seat)))) {
    out.band_ok = true;
    out.band_city = spawn.centerIndex;
  }
  const cls = faithClassCandidate(state, actor);
  out.cls_ok = cls.ok; out.cls_city = cls.city; out.cls_bldg = cls.bldg;
  const ucls = faithLandUnitCandidate(state, actor);
  out.ucls_ok = ucls.ok; out.ucls_city = ucls.city; out.ucls_unit = ucls.unit;
  const pf = patronageCandidate(state, actor, false);
  out.pat_f_ok = pf.ok; out.pat_f_cls = pf.cls;
  const pg = patronageCandidate(state, actor, true);
  out.pat_g_ok = pg.ok; out.pat_g_cls = pg.cls;
  const dg = districtBuyCandidate(state, actor, false);
  out.dist_g_ok = dg.ok; out.dist_g_tile = dg.tile; out.dist_g_row = dg.row;
  const df = districtBuyCandidate(state, actor, true);
  out.dist_f_ok = df.ok; out.dist_f_tile = df.tile; out.dist_f_row = df.row;
  return out;
}

/** The BUY tripwire row, read off `buyContext` in the shape the gate's
 *  `_buy_row` reads the GPU's: [centre, bIdx, settlerOk, unitOk, tileOk,
 *  tile, tileCentre, worshipCentre, religKind, religCentre, levyIdx,
 *  monuKind, monuCentre, natKind, natCentre]; the religious unit is the
 *  missionary, else the apostle, else the inquisitor, and the Monumentality
 *  civilian the settler, else the builder. */
export function buyCandidateRow(state: GameState, actor: Seat): number[] {
  const b = buyContext(state, actor.seat);
  const [rk, rc] = b.missionary_ok ? [5, b.missionary_city]
    : b.apostle_ok ? [6, b.apostle_city]
      : b.inquisitor_ok ? [11, b.inquisitor_city] : [-1, -1];
  const mk = b.monu_settler_ok ? 9 : b.monu_builder_ok ? 8 : -1;
  return [
    b.can_building ? b.bldg_city : -1, b.can_building ? b.bldg : -1,
    b.settler_ok ? 1 : 0, b.unit_ok ? 1 : 0, b.tile_ok ? 1 : 0,
    b.tile_ok ? b.tile : -1, b.tile_ok ? b.tile_city : -1,
    b.worship_ok ? b.worship_city : -1, rk, rc,
    b.levy_ok ? b.levy_cs : -1, mk, mk >= 0 ? b.spawn_city : -1,
    b.nat_ok ? 10 : -1, b.nat_ok ? b.nat_city : -1,
  ];
}
