/**
 * GS STRATEGIC STOCKPILES. A strategic resource is no longer a boolean gate:
 * every improved source adds to an empire-wide stockpile each turn, the
 * stockpile has a ceiling, and everything that wants the resource — a unit
 * entering production, a project, a power plant — draws it down.
 *
 * The index space is `STRATEGIC_IDS`; a seat's `stockpile` is dense over it.
 */
import { STRATEGIC_IDS, STRATEGIC_PER_TURN, STOCKPILE_CAP_BASE, STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING, UNIT_RESOURCE_COST, emptyStockpile } from '../data/constants';
import { UNITS } from '../data/units';
import { PROJECTS } from '../data/projects';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../../world/resources';
import { citiesOf, seatOf, tileOwnedByCiv } from './seats';
import { cityPower, pillagedDistrictTypes } from './yields';
import type { GameState, Seat } from './types';

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
  return STOCKPILE_CAP_BASE + STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING * n;
}

/**
 * One turn's income: every tile this seat owns that carries a strategic
 * resource under its matching, unpillaged improvement pays that resource's
 * published per-turn number. The stockpile is then clamped to the cap — a
 * seat over the ceiling (its Encampment just went dark) loses the excess.
 */
export function accrueStockpiles(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const bk = bank(s);
  for (const t of state.map.tiles) {
    if (!t.resource || t.pillaged) continue;
    const k = strategicSlot(t.resource);
    if (k < 0 || t.improvement !== RESOURCES[t.resource]?.improvement) continue;
    if (!tileOwnedByCiv(t, seat)) continue;
    bk[k] += STRATEGIC_PER_TURN[t.resource];
  }
  const cap = stockpileCap(state, seat);
  for (let k = 0; k < bk.length; k++) if (bk[k] > cap) bk[k] = cap;
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
  const res = UNITS[unitType]?.requiresResource;
  return res ? { id: res, n: UNIT_RESOURCE_COST } : undefined;
}

export function canTrainWithStockpile(state: GameState, seat: number, unitType: string): boolean {
  const c = unitResourceCost(unitType);
  return !c || canPayStockpile(state, seat, c.id, c.n);
}

export function chargeUnitResource(state: GameState, seat: number, unitType: string): void {
  const c = unitResourceCost(unitType);
  if (c) spendStockpile(state, seat, c.id, c.n);
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
    if (city.powered) spendStockpile(state, seat, bestFuel, burn);
  }
}
