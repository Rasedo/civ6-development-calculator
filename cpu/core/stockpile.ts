/**
 * GS STRATEGIC STOCKPILES. A strategic resource is no longer a boolean gate:
 * every improved source adds to an empire-wide stockpile each turn, the
 * stockpile has a ceiling, and everything that wants the resource — a unit
 * entering production, a project, a power plant — draws it down.
 *
 * The index space is `STRATEGIC_IDS`; a seat's `stockpile` is dense over it.
 */
import { STRATEGIC_IDS, STRATEGIC_PER_TURN, STOCKPILE_CAP_BASE, STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING, UNIT_RESOURCE_COST, FUEL_SHORT_CS, RAILROAD_COST, emptyStockpile } from '../data/constants';
import { UNITS, civUpgradeTarget } from '../data/units';
import { PROJECTS } from '../data/projects';
import { DED_AUTOMATON, DED_SKY, SKY_ALUMINUM_PER_TURN, AUTOMATON_URANIUM_PER_TURN, AUTOMATON_URANIUM_PER_MINE } from '../data/seats';
import { BUILDINGS } from '../data/buildings';
import { governorSum, governorTileSum } from './governors';
import { RESOURCES } from '../../world/resources';
import { citiesOf, civOf, seatOf, tileOwnedByCiv } from './seats';
import { getModifiers } from './effects';
import { goldenDedication } from './eras';
import { goldAffordable, unitPurchaseCost } from './game';
import { cityPower, pillagedDistrictTypes } from './yields';
import { CARBON_PER_RESOURCE, emitCarbon, plantCarbon, powerCells, unitCarbon } from './climate';
import type { City, GameState, Seat, Tile, Unit } from './types';

export function strategicSlot(resourceId: string | undefined): number {
  return resourceId ? STRATEGIC_IDS.indexOf(resourceId) : -1;
}

function bank(seat: Seat): number[] {
  return (seat.stockpile ??= emptyStockpile());
}

export function stockOf(state: GameState, seat: number, resourceId: string): number {
  const k = strategicSlot(resourceId);
  const s = seatOf(state, seat);
  return k < 0 || !s ? 0 : bank(s)[k];
}

/**
 * CIV6 (GS): "The maximum stockpile amount is initially 50 for each resource
 * but constructing Encampment buildings in your empire (Barracks, Armory,
 * etc.) will increase your maximum stockpile by 10 per building for all
 * resources." A building in a pillaged district is dark here for every other
 * purpose, so it does not raise the ceiling either.
 */
export function stockpileCap(state: GameState, seat: number): number {
  let n = 0;
  for (const city of citiesOf(state, seat)) {
    if (pillagedDistrictTypes(state.map, city.districts).has('ENCAMPMENT')) continue;
    for (const id of city.buildings) {
      if (BUILDINGS[id]?.district === 'ENCAMPMENT') n += 1;
    }
  }
  // CIV6 (EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP): the roster's per-building rows
  let extra = 0;
  for (const r of getModifiers(state, seat).stockpileCap) {
    for (const city of citiesOf(state, seat)) if (city.buildings.includes(r.building)) extra += r.amount;
  }
  return STOCKPILE_CAP_BASE + STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING * n + extra;
}

/**
 * One turn's income: every tile this seat owns that carries a strategic
 * resource under its matching, unpillaged improvement pays that resource's
 * published per-turn number. The stockpile is then clamped to the cap — a
 * seat over the ceiling (its Encampment just went dark) loses the excess.
 */
/**
 * What a golden dedication adds to ONE improved source's per-turn yield.
 * CIV6 (Sky and Stars, GS): "Aluminum mines accumulate +2 more resources per
 * turn"; (Automaton Warfare): "Uranium mines accumulate +1 more resource per
 * turn."
 */
export function goldenMineBonus(state: GameState, seat: number, resourceId: string): number {
  if (resourceId === 'ALUMINUM' && goldenDedication(state, seat, DED_SKY)) return SKY_ALUMINUM_PER_TURN;
  if (resourceId === 'URANIUM' && goldenDedication(state, seat, DED_AUTOMATON)) return AUTOMATON_URANIUM_PER_MINE;
  return 0;
}

export function accrueStockpiles(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const bk = bank(s);
  const rate = getModifiers(state, seat).stockpileRate;
  for (const t of state.map.tiles) {
    if (!t.resource || t.pillaged) continue;
    const k = strategicSlot(t.resource);
    if (k < 0 || t.improvement !== RESOURCES[t.resource]?.improvement) continue;
    if (!tileOwnedByCiv(t, seat)) continue;
    // CIV6 (Defense Logistics): "Accumulating Strategic resources gain an
    // additional +1 per turn" — per accruing tile of the governed city.
    // CIV6 (EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION_SPECIFIC_RESOURCE /
    // EFFECT_ADJUST_EXTRA_ACCUMALATION_TERRAIN): the roster's rate rows — a
    // flat add for the named resource, a percentage on the named terrain
    let add = 0;
    let pct = 0;
    for (const r of rate) {
      if (r.resource !== undefined && r.resource === t.resource) add += r.amount ?? 0;
      if (r.terrain !== undefined && r.terrain === t.terrain) pct += r.pct ?? 0;
    }
    const per = STRATEGIC_PER_TURN[t.resource] + goldenMineBonus(state, seat, t.resource)
      + governorTileSum(state, t, (e) => e.stockpilePerTurn) + add;
    bk[k] += Math.floor((per * (100 + pct)) / 100);
  }
  // CIV6 (Automaton Warfare, Golden face): "Receive 3 Uranium per turn" — a
  // standing grant, owed whether or not the seat mines any.
  if (goldenDedication(state, seat, DED_AUTOMATON)) {
    const u = strategicSlot('URANIUM');
    if (u >= 0) bk[u] += AUTOMATON_URANIUM_PER_TURN;
  }
  const cap = stockpileCap(state, seat);
  for (let k = 0; k < bk.length; k++) if (bk[k] > cap) bk[k] = cap;
}

/** Put `n` of a strategic resource straight into the bank, under the same
 *  ceiling the per-turn accrual respects. */
export function grantStockpile(state: GameState, seat: number, resourceId: string, n: number): void {
  const k = strategicSlot(resourceId);
  const s = seatOf(state, seat);
  if (k < 0 || !s || n <= 0) return;
  const bk = bank(s);
  bk[k] = Math.min(stockpileCap(state, seat), bk[k] + n);
}

/** Can this seat pay `n` of `resourceId` right now? */
export function canPayStockpile(state: GameState, seat: number, resourceId: string | undefined, n: number): boolean {
  if (!resourceId) return true;
  const k = strategicSlot(resourceId);
  return k < 0 || stockOf(state, seat, resourceId) >= n;
}

/**
 * CIV6 (GS): a unit that asks for a strategic resource pays it "at the moment
 * you start production (or the moment you purchase it)". A city only takes a
 * new order while its queue is empty, so entering production happens once and
 * this is charged once.
 */
export function unitResourceCost(unitType: string): { id: string; n: number } | undefined {
  const def = UNITS[unitType];
  return def?.requiresResource
    ? { id: def.requiresResource, n: def.resourceCost ?? UNIT_RESOURCE_COST }
    : undefined;
}

/**
 * CIV6 (Resource, GS): a FUEL unit's up-front cost is small and then "each
 * turn, the unit will consume a certain amount of that resource as fuel".
 * One pass over the seat's living units, after the turn's income and before
 * the plants burn, because a unit's fuel and a plant's come out of one bank.
 * A bill the bank cannot meet takes what is there, leaves it at zero and marks
 * the slot short until the next pass — `fuelShortCS` is the penalty.
 */
export function chargeUnitUpkeep(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const bk = bank(s);
  const cells = powerCells(state, seat);
  let short = 0;
  for (const u of state.units) {
    if (u.seat !== seat) continue;
    const def = UNITS[u.type];
    const k = strategicSlot(def?.requiresResource);
    if (k < 0 || !def?.resourceUpkeep) continue;
    if (bk[k] < def.resourceUpkeep) short |= 1 << k;
    bk[k] = Math.max(0, bk[k] - def.resourceUpkeep);
    // CIV6 (Climate): a unit burning Coal, Oil or Uranium discharges carbon
    // too. `unitCarbon` is zero for every other slot.
    emitCarbon(state, seat, unitCarbon(k, def.resourceUpkeep, cells));
  }
  s.fuelShort = short;
}

/**
 * CIV6 (Resource, GS): "-20 Insufficient <resource>" on every strength read of
 * a unit whose seat could not meet its fuel bill at the last upkeep pass.
 */
export function fuelShortCS(state: GameState, u: Unit): number {
  const def = UNITS[u.type];
  const k = strategicSlot(def?.requiresResource);
  if (k < 0 || !def?.resourceUpkeep) return 0;
  return ((seatOf(state, u.seat)?.fuelShort ?? 0) >> k) & 1 ? FUEL_SHORT_CS : 0;
}

/**
 * CIV6 (Unit): a unit may upgrade when it stands "in friendly territory" with
 * "more than 0 Movement left", the seat can pay the gold, and — in GS — the
 * seat holds "the same [resources] you would normally need to produce the
 * next-level unit (unless the unit you're upgrading also requires the same
 * resource, in which case you don't need any)".
 *
 * MODEL: no source publishes the gold FORMULA, only that it "usually reflects
 * how much its strength will increase". This charges the difference between
 * the two chassis' own published purchase prices, floored at zero — built from
 * numbers the pages do give, with no free constant.
 */
export function upgradeGoldCost(
  state: GameState,
  seat: number,
  unitType: string,
  levied = false,
): number {
  const next = civUpgradeTarget(civOf(state, seat), unitType);
  if (!next) return 0;
  const raw = Math.max(0, unitPurchaseCost(state, next, seat) - unitPurchaseCost(state, unitType, seat));
  if (!levied) return raw;
  // CIV6 (The Raven King, EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_
  // PERCENT): levied units upgrade at a 75% discount. The row shipped and
  // nothing read it until now (C-66).
  let pct = 0;
  for (const r of getModifiers(state, seat).levy) pct = Math.max(pct, r.upgradeDiscountPct);
  return Math.round(raw * (1 - Math.min(100, pct) / 100));
}

/** can this seat's treasury cover the upgrade? */
export function canPayUpgradeGold(
  state: GameState,
  seat: number,
  unitType: string,
  levied = false,
): boolean {
  const s = seatOf(state, seat);
  return !!s && goldAffordable(s.treasury, upgradeGoldCost(state, seat, unitType, levied));
}

/** what the UPGRADE draws out of the bank: the new chassis' own charge, or
 *  nothing at all when both rungs ask for the same resource. */
export function upgradeResourceCost(state: GameState, seat: number, unitType: string): { id: string; n: number } | undefined {
  const next = civUpgradeTarget(civOf(state, seat), unitType);
  if (!next) return undefined;
  const c = unitResourceCost(next);
  return c && c.id !== UNITS[unitType]?.requiresResource ? c : undefined;
}

export function canTrainWithStockpile(state: GameState, seat: number, unitType: string): boolean {
  const c = unitResourceCost(unitType);
  return !c || canPayStockpile(state, seat, c.id, c.n);
}

export function chargeUnitResource(state: GameState, seat: number, unitType: string, city?: City): void {
  const c = unitResourceCost(unitType);
  if (!c) return;
  // CIV6 (Black Marketeer): "Strategic resources for units are discounted 80%."
  const off = city ? governorSum(state, city, (e) => e.resourceDiscountPct) : 0;
  spendStockpile(state, seat, c.id, Math.round(c.n * (100 - Math.min(100, off)) / 100));
}

/** The same charge for a PROJECT — the Lagrange station's one-time Aluminum. */
export function canRunProject(state: GameState, seat: number, projectId: string): boolean {
  const p = PROJECTS[projectId];
  return !p?.resource || canPayStockpile(state, seat, p.resource, p.resourceCost ?? 0);
}

export function chargeProjectResource(state: GameState, seat: number, projectId: string): void {
  const p = PROJECTS[projectId];
  if (p?.resource) spendStockpile(state, seat, p.resource, p.resourceCost ?? 0);
}

/** Draw `n` down. The caller has already asked `canPayStockpile`; this clamps
 *  at zero rather than going negative, because nothing here models debt. */
/**
 * CIV6 (Railroad): "Does not cost a charge, but does cost 1 Iron and 1 Coal."
 * Lay one tile if the bank can pay for it — the Coal it burns discharges the
 * same per-resource carbon a plant's does, the page publishing no
 * railroad-specific rate and its halving being a UNIT-only clause.
 */
export function layRailroad(state: GameState, seat: number, tile: Tile): boolean {
  for (const [id, n] of RAILROAD_COST) if (stockOf(state, seat, id) < n) return false;
  for (const [id, n] of RAILROAD_COST) {
    spendStockpile(state, seat, id, n);
    const k = strategicSlot(id);
    if (k >= 0) emitCarbon(state, seat, n * (CARBON_PER_RESOURCE[k] ?? 0));
  }
  tile.railroad = true;
  return true;
}

export function spendStockpile(state: GameState, seat: number, resourceId: string | undefined, n: number): void {
  if (!resourceId || n <= 0) return;
  const k = strategicSlot(resourceId);
  const s = seatOf(state, seat);
  if (k < 0 || !s) return;
  const bk = bank(s);
  bk[k] = Math.max(0, bk[k] - n);
}

/**
 * THE TURN'S POWER, for one seat: which of its cities are lit, and what its
 * plants burn to light them.
 *
 * CIV6: "Each turn a Power Plant will attempt to provide required Power to all
 * cities within range, converting stockpiles of the relevant resource into
 * Power", and "cities will consider their own renewable power supplies first,
 * before turning to a nearby Power Plant" — so a plant is asked only for the
 * shortfall. Where two kinds of plant reach one city, "the game engine will use
 * the Power Plant which draws the resource of which you have a larger
 * stockpile". What the source does NOT publish is the order in which one
 * stockpile is shared out among several cities that need it; this walks the
 * seat's cities in slot order, and a city the fuel no longer covers stays dark.
 */
export function resolveSeatPower(state: GameState, seat: number): void {
  for (const city of citiesOf(state, seat)) {
    // CIV6 (Nuclear accident): the reactor ages one turn for every turn since
    // it was built or last recommissioned. A city with no plant has no
    // reactor, and a plant lost with the building takes its clock with it.
    if (city.buildings.includes('NUCLEAR_POWER_PLANT')) {
      city.reactorAge = (city.reactorAge ?? 0) + 1;
    } else if (city.reactorAge !== undefined) {
      city.reactorAge = undefined;
    }
    const p = cityPower(state, city);
    if (p.demand <= 0) {
      city.powered = false;
      continue;
    }
    if (p.supply >= p.demand) {
      city.powered = true;
      continue;
    }
    let bestFuel: string | undefined;
    let bestRate = 0;
    let bestStock = -1;
    for (const id of p.plants) {
      const def = BUILDINGS[id];
      if (!def?.fuel || !def.fuelRate) continue;
      const have = stockOf(state, seat, def.fuel);
      if (have > bestStock) {
        bestStock = have;
        bestFuel = def.fuel;
        bestRate = def.fuelRate;
      }
    }
    const burn = bestFuel ? Math.ceil((p.demand - p.supply) / bestRate) : 0;
    city.powered = bestFuel !== undefined && bestStock >= burn;
    if (city.powered) {
      spendStockpile(state, seat, bestFuel, burn);
      emitCarbon(state, seat, plantCarbon(bestFuel!, bestRate, burn));
    }
  }
}
