/**
 * GS STRATEGIC STOCKPILES. A strategic resource is no longer a boolean gate:
 * every improved source adds to an empire-wide stockpile each turn, the
 * stockpile has a ceiling, and everything that wants the resource — a unit
 * entering production, a project, a power plant — draws it down.
 *
 * The index space is `STRATEGIC_IDS`; a seat's `stockpile` is dense over it.
 */
import { logStockWrite } from './difflog';
import { STRATEGIC_IDS, STRATEGIC_PER_TURN, STOCKPILE_CAP_BASE, STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING, UNIT_RESOURCE_COST, FUEL_SHORT_CS, RAILROAD_COST, emptyStockpile,
  PURCHASE_DIVISOR, UPGRADE_BASE_COST, UPGRADE_MINIMUM_COST, UPGRADE_MINIMUM_COST_LEVY, UPGRADE_NET_PRODUCTION_PERCENT_COST, scaleByGameSpeed } from '../data/constants';
import { UNITS, civUpgradeTarget, FORMATION_RESOURCE_MULT } from '../data/units';
import { PROJECTS } from '../data/projects';
import { DED_AUTOMATON, DED_SKY, SKY_ALUMINUM_PER_TURN, AUTOMATON_URANIUM_PER_TURN, AUTOMATON_URANIUM_PER_MINE } from '../data/seats';
import { BUILDINGS, POWER_PLANT_IDS, buildingVariantFor } from '../data/buildings';
import { GP_CITY_FREE_EXTRACTION, GP_FREE_EXTRACTION, gpCityPermOf, gpPermOf } from '../data/greatPeople';
import { governorSum, governorTileSum } from './governors';
import { extractsResource, resourceImprovement } from '../../world/resources';
import { citiesOf, civOf, leaderOf, seatOf, tileOwnedByCiv, tileSeat, hiddenResourcesFor } from './seats';
import { regionalReach, suzerainEffectCount, suzerainMinorSeats } from './cityStates';
import { HATTUSA_FREE_STRATEGIC } from '../data/cityStates';
import { hexDistance } from '../../world/hex';
import { getModifiers } from './effects';
import { goldenDedication } from './eras';
import { goldAffordable } from './game';
import { GOLD_EQUIVALENT_OTHER_YIELDS } from './trade';
import { cityHasLiveDistrict, cityImprovedResourceKinds, cityPower, darkBuildings } from './yields';
import { CARBON_PER_RESOURCE, emitCarbon, plantCarbon, powerCells, unitCarbon } from './climate';
import { ageReactors } from './disasters';
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
    const dark = darkBuildings(state.map, city);
    for (const id of city.buildings) {
      if (BUILDINGS[id]?.district === 'ENCAMPMENT' && !dark.has(id)) n += 1;
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
 * What a golden dedication adds to ONE improved source's per-turn yield.
 * CIV6 (Sky and Stars, GS): "Aluminum mines accumulate +2 more resources per
 * turn"; (Automaton Warfare): "Uranium mines accumulate +1 more resource per
 * turn."
 */
function goldenMineBonus(state: GameState, seat: number, resourceId: string): number {
  if (resourceId === 'ALUMINUM' && goldenDedication(state, seat, DED_SKY)) return SKY_ALUMINUM_PER_TURN;
  if (resourceId === 'URANIUM' && goldenDedication(state, seat, DED_AUTOMATON)) return AUTOMATON_URANIUM_PER_MINE;
  return 0;
}

/**
 * One turn's income: every tile this seat owns that hands it its strategic
 * resource (`extractsResource`: its matching, unpillaged improvement, or a
 * complete, unpillaged district) pays that resource's published per-turn
 * number. The income lands unclamped: the turn's fuel and plants burn from
 * it, and the cap holds only at the turn's end (`capStockpiles`).
 */
export function accrueStockpiles(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const bk = bank(s);
  const rate = getModifiers(state, seat).stockpileRate;
  const perSource = getModifiers(state, seat).stockpilePerSource;
  // CIV6 (Resources.PrereqTech): a strategic resource the seat cannot see
  // yet accrues nothing, whatever improvement stands on its tile
  const hidden = hiddenResourcesFor(state, seat);
  const suz = suzerainMinorSeats(state, seat);
  for (const t of state.map.tiles) {
    if (!t.resource || hidden.has(t.resource)) continue;
    const k = strategicSlot(t.resource);
    if (k < 0) continue;
    // CIV6 (LOC_CITY_STATES_SUZERAIN_DIPLOMATIC_BONUS): "Gain ownership of
    // all the city-state's resources" — an improved source on a suzerained
    // city-state's ground pays the suzerain the resource's own number, and
    // none of the seat's own rate rows, which read the seat's own tiles
    if (suz.has(tileSeat(t))) {
      if (!t.pillaged && t.improvement === resourceImprovement(t)) bk[k] += STRATEGIC_PER_TURN[t.resource];
      continue;
    }
    if (!tileOwnedByCiv(t, seat) || !extractsResource(t)) continue;
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
    // CIV6 (Equestrian Orders, EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER):
    // "All improved Horses and Iron resources yield 1 additional resource"
    add += perSource[t.resource] ?? 0;
    const per = STRATEGIC_PER_TURN[t.resource] + goldenMineBonus(state, seat, t.resource)
      + governorTileSum(state, t, (e) => e.stockpilePerTurn) + add;
    bk[k] += Math.floor((per * (100 + pct)) / 100);
  }
  // CIV6 (Grand Bazaar, GRANDBAZAAR_ACCUMULATION_STRATEGICS Amount 1):
  // "Accumulate 1 extra Strategic resource for every different type of
  // Strategic resource this city has improved." The modifier is named for
  // DIVERSITY, so the extra is paid once per DISTINCT kind the city has
  // improved, on that kind — which totals exactly the "1 extra for every
  // different type" the description promises.
  const bzCiv = civOf(state, seat);
  for (const city of citiesOf(state, seat)) {
    const dark = darkBuildings(state.map, city);
    let per = 0;
    for (const id of city.buildings) {
      if (dark.has(id)) continue;
      per += buildingVariantFor(bzCiv, id)?.strategicPerType ?? 0;
    }
    if (!per) continue;
    for (const r of cityImprovedResourceKinds(state, city, 'strategic')) {
      const k = strategicSlot(r);
      if (k >= 0) bk[k] += per;
    }
  }
  // CIV6 (Automaton Warfare, Golden face): "Receive 3 Uranium per turn" — a
  // standing grant, owed whether or not the seat mines any.
  if (goldenDedication(state, seat, DED_AUTOMATON)) {
    const u = strategicSlot('URANIUM');
    if (u >= 0) bk[u] += AUTOMATON_URANIUM_PER_TURN;
  }
  // CIV6 (MODIFIER_PLAYER_ADJUST_FREE_RESOURCE_EXTRACTION): a spent Great
  // Person's standing grant — the seat's own, then (Rockefeller) each held
  // city's
  for (const r of GP_FREE_EXTRACTION) {
    const k = strategicSlot(r.resource);
    if (k >= 0) bk[k] += gpPermOf(s, r.perm);
  }
  for (const r of GP_CITY_FREE_EXTRACTION) {
    const k = strategicSlot(r.resource);
    if (k < 0) continue;
    for (const city of citiesOf(state, seat)) bk[k] += gpCityPermOf(city, r.perm);
  }
  // CIV6 (Future Victory Science, MODIFIER_SINGLE_CITY_ADJUST_FREE_RESOURCE_EXTRACTION):
  // each city holding a live district of the row's type
  for (const r of getModifiers(state, seat).extractionWithDistrict) {
    const k = strategicSlot(r.resource);
    if (k < 0) continue;
    for (const city of citiesOf(state, seat)) if (cityHasLiveDistrict(state, city, r.district)) bk[k] += r.perTurn;
  }
  // CIV6 (Hattusa, MODIFIER_PLAYER_ADJUST_FREE_RESOURCE_IMPORT_EXTRACTION under
  // PLAYER_HAS_NO_IMPROVED_<R>): each strategic resource the suzerain sees and
  // improves on none of its own plots pays it a standing amount
  const hattusa = suzerainEffectCount(state, seat, 'freeStrategic');
  if (hattusa) {
    const improved = new Set<string>();
    for (const t of state.map.tiles) {
      if (t.resource && strategicSlot(t.resource) >= 0 && tileOwnedByCiv(t, seat) && extractsResource(t)) improved.add(t.resource);
    }
    STRATEGIC_IDS.forEach((id, k) => {
      if (!hidden.has(id) && !improved.has(id)) bk[k] += HATTUSA_FREE_STRATEGIC * hattusa;
    });
  }
  for (let k = 0; k < bk.length; k++) logStockWrite(state.turn, seat, k, 'ac', bk[k]);
}

/**
 * THE TURN END's cap (Player::Processor::DoTurnDeactivate 0x7eb60 ->
 * 0x4e4ad0 -> Player_Resources 0x4a8f10): each accumulated resource whose
 * stockpile, less what the player's queued units reserve, stands over the cap
 * is handed back to the cap. The engine charges a unit's resource when its
 * production starts, so the bank is already net of the reservations and the
 * test is the bank against the cap. Returns whether any slot was over — the
 * hand-back is a ChangeResourceAmount, which rebuilds the luxury allocation.
 */
export function capStockpiles(state: GameState, seat: number): boolean {
  const s = seatOf(state, seat);
  if (!s) return false;
  const bk = bank(s);
  const cap = stockpileCap(state, seat);
  let over = false;
  for (let k = 0; k < bk.length; k++) {
    if (bk[k] <= cap) continue;
    bk[k] = cap;
    over = true;
    logStockWrite(state.turn, seat, k, 'cp', bk[k]);
  }
  return over;
}

/** Put `n` of a strategic resource straight into the bank, under the same
 *  ceiling the per-turn accrual respects. */
export function grantStockpile(state: GameState, seat: number, resourceId: string, n: number, tag = 'gr'): void {
  const k = strategicSlot(resourceId);
  const s = seatOf(state, seat);
  if (k < 0 || !s || n <= 0) return;
  const bk = bank(s);
  bk[k] = Math.min(stockpileCap(state, seat), bk[k] + n);
  logStockWrite(state.turn, seat, k, tag, bk[k]);
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
export function unitResourceCost(unitType: string, formation = 0): { id: string; n: number } | undefined {
  const def = UNITS[unitType];
  return def?.requiresResource
    ? {
      id: def.requiresResource,
      n: (def.resourceCost ?? UNIT_RESOURCE_COST) * (FORMATION_RESOURCE_MULT[formation] ?? 1),
    }
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
    // a Meteor Site's grant burns nothing (`Unit.noResourceUpkeep`)
    if (u.seat !== seat || u.noResourceUpkeep) continue;
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
  for (let k = 0; k < bk.length; k++) logStockWrite(state.turn, seat, k, 'up', bk[k]);
}

/**
 * CIV6 (Resource, GS): "-20 Insufficient <resource>" on every strength read of
 * a unit whose seat could not meet its fuel bill at the last upkeep pass.
 */
export function fuelShortCS(state: GameState, u: Unit): number {
  const def = UNITS[u.type];
  const k = strategicSlot(def?.requiresResource);
  if (k < 0 || !def?.resourceUpkeep || u.noResourceUpkeep) return 0;
  return ((seatOf(state, u.seat)?.fuelShort ?? 0) >> k) & 1 ? FUEL_SHORT_CS : 0;
}

/**
 * CIV6 (Unit): a unit may upgrade when it stands "in friendly territory" with
 * "more than 0 Movement left", the seat can pay the gold, and — in GS — the
 * seat holds "the same [resources] you would normally need to produce the
 * next-level unit (unless the unit you're upgrading also requires the same
 * resource, in which case you don't need any)".
 *
 * The gold, as the DLL reckons it (Unit_Upgrade_Manager 0x5376d0, in 24.8
 * fixed point): UPGRADE_BASE_COST at the game's speed plus the two chassis'
 * production costs apart (never below none, at UPGRADE_NET_PRODUCTION_PERCENT_COST)
 * times GOLD_EQUIVALENT_OTHER_YIELDS; a Corps pays it twice, an Army three
 * times; CIV6 (Force Modernization, EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_
 * PERCENT) takes its percent off; never below UPGRADE_MINIMUM_COST at the
 * speed; a levied unit's percent off (The Raven King) and its own floor after;
 * then down to a multiple of PURCHASE_DIVISOR (runs/h1_duelw1117 China t25: a
 * Slinger's upgrade to an Archer, 5 + 2 x (30 - 17) = 31, paid 30).
 */
export function upgradeGoldCost(
  state: GameState,
  seat: number,
  unitType: string,
  levied = false,
  formation = 0,
): number {
  const next = civUpgradeTarget(civOf(state, seat), unitType, leaderOf(state, seat));
  if (!next) return 0;
  const net = Math.max(0, Math.trunc(((UNITS[next]?.cost ?? 0) - (UNITS[unitType]?.cost ?? 0)) * UPGRADE_NET_PRODUCTION_PERCENT_COST / 100));
  let c = (scaleByGameSpeed(UPGRADE_BASE_COST) + net * GOLD_EQUIVALENT_OTHER_YIELDS) * 256;
  if (formation === 1) c *= 2;
  else if (formation === 2) c *= 3;
  const off = (pct: number) => {
    const p = Math.min(100, pct);
    const fx = Math.trunc(p / 100) * 256 + Math.trunc(((p / 100) % 1) * 256);
    c -= Math.trunc((c * fx) / 256);
  };
  off(getModifiers(state, seat).upgradeGoldDiscountPct);
  if (c < UPGRADE_MINIMUM_COST * 256) c = scaleByGameSpeed(UPGRADE_MINIMUM_COST) * 256;
  if (levied) {
    let pct = 0;
    for (const r of getModifiers(state, seat).levy) pct = Math.max(pct, r.upgradeDiscountPct);
    off(pct);
    if (c < UPGRADE_MINIMUM_COST_LEVY * 256) c = scaleByGameSpeed(UPGRADE_MINIMUM_COST_LEVY) * 256;
  }
  const g = c >> 8;
  return g - (g % PURCHASE_DIVISOR);
}

/** can this seat's treasury cover the upgrade? */
export function canPayUpgradeGold(
  state: GameState,
  seat: number,
  unitType: string,
  levied = false,
  formation = 0,
): boolean {
  const s = seatOf(state, seat);
  return !!s && goldAffordable(s.treasury, upgradeGoldCost(state, seat, unitType, levied, formation));
}

/** what the UPGRADE draws out of the bank: the new chassis' own charge, or
 *  nothing at all when both rungs ask for the same resource. */
export function upgradeResourceCost(state: GameState, seat: number, unitType: string): { id: string; n: number } | undefined {
  const next = civUpgradeTarget(civOf(state, seat), unitType, leaderOf(state, seat));
  if (!next) return undefined;
  const c = unitResourceCost(next);
  if (!c || c.id === UNITS[unitType]?.requiresResource) return undefined;
  // CIV6 (Force Modernization, EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_RESOURCE_COST_DISCOUNT)
  const off = Math.min(100, getModifiers(state, seat).upgradeResourceDiscountPct);
  return off ? { id: c.id, n: Math.round(c.n * (100 - off) / 100) } : c;
}

export function canTrainWithStockpile(state: GameState, seat: number, unitType: string, formation = 0): boolean {
  const c = unitResourceCost(unitType, formation);
  return !c || canPayStockpile(state, seat, c.id, c.n);
}

export function chargeUnitResource(state: GameState, seat: number, unitType: string, city?: City, formation = 0): void {
  const c = unitResourceCost(unitType, formation);
  if (!c) return;
  // CIV6 (Black Marketeer): "Strategic resources for units are discounted 80%."
  const off = city ? governorSum(state, city, (e) => e.resourceDiscountPct) : 0;
  spendStockpile(state, seat, c.id, Math.round(c.n * (100 - Math.min(100, off)) / 100), 'uc');
}

/** The same charge for a PROJECT — the Lagrange station's one-time Aluminum. */
export function canRunProject(state: GameState, seat: number, projectId: string): boolean {
  const p = PROJECTS[projectId];
  return !p?.resource || canPayStockpile(state, seat, p.resource, p.resourceCost ?? 0);
}

export function chargeProjectResource(state: GameState, seat: number, projectId: string): void {
  const p = PROJECTS[projectId];
  if (p?.resource) spendStockpile(state, seat, p.resource, p.resourceCost ?? 0, 'pc');
}

/**
 * CIV6 (Railroad): "Does not cost a charge, but does cost 1 Iron and 1 Coal."
 * Lay one tile if the bank can pay for it — the Coal it burns discharges the
 * same per-resource carbon a plant's does, the page publishing no
 * railroad-specific rate and its halving being a UNIT-only clause.
 */
export function layRailroad(state: GameState, seat: number, tile: Tile): boolean {
  for (const [id, n] of RAILROAD_COST) if (stockOf(state, seat, id) < n) return false;
  for (const [id, n] of RAILROAD_COST) {
    spendStockpile(state, seat, id, n, 'rr');
    const k = strategicSlot(id);
    if (k >= 0) emitCarbon(state, seat, n * (CARBON_PER_RESOURCE[k] ?? 0));
  }
  tile.railroad = true;
  return true;
}

/** Draw `n` down. The caller has already asked `canPayStockpile`; this clamps
 *  at zero rather than going negative, because nothing here models debt. */
export function spendStockpile(state: GameState, seat: number, resourceId: string | undefined, n: number, tag = 'sp'): void {
  if (!resourceId || n <= 0) return;
  const k = strategicSlot(resourceId);
  const s = seatOf(state, seat);
  if (k < 0 || !s) return;
  const bk = bank(s);
  bk[k] = Math.max(0, bk[k] - n);
  logStockWrite(state.turn, seat, k, tag, bk[k]);
}

/**
 * THE TURN'S POWER, for one seat: which of its cities are lit, and what its
 * plants burn to light them (Player_Resources 0x4ae990 -> 0x4a7cc0).
 *
 * Each city asks for its load less its own renewables ("cities will consider
 * their own renewable power supplies first, before turning to a nearby Power
 * Plant"). The fuels the seat holds any of are walked largest stockpile first
 * ("the game engine will use the Power Plant which draws the resource of which
 * you have a larger stockpile"), each fuel's plants in catalog order, each
 * plant's standing copies in the seat's city order, and each copy serves its
 * own city, then every other city in its reach in city order. A city's burn is
 * whole units — what its remaining need asks, or the whole stockpile where
 * that is less — and the Power a unit gives beyond the need stands as the
 * plant's extra Power, answering the next city it serves first
 * (the DLL's xExtraPowerAvailable; runs/h1_duelw1120 China t190-214: Xi'an's 5 and
 * Chengdu's 3 burn two Coal a turn, not three). A city is lit only when its
 * whole need is met: "a city cannot supply Power to some buildings and not to
 * others".
 * CIV6 (Industrial Zone Logistics, `FullyPoweredWhileActive`): a city whose
 * queue a `fullyPowered` project heads meets its whole load, no fuel burned.
 */
export function resolveSeatPower(state: GameState, seat: number): void {
  const cities = citiesOf(state, seat);
  ageReactors(cities);
  const need = new Map<number, number>();
  for (const city of cities) {
    const p = cityPower(state, city);
    city.powered = false;
    if (p.demand <= 0) continue;
    const head = city.queue[0];
    if (p.supply >= p.demand || (head?.kind === 'project' && PROJECTS[head.project]?.fullyPowered)) {
      city.powered = true;
      continue;
    }
    need.set(city.id, p.demand - p.supply);
  }
  if (!need.size) return;
  const reach = regionalReach(state, seat);
  const fuels: string[] = [];
  for (const id of POWER_PLANT_IDS) {
    const f = BUILDINGS[id]?.fuel;
    if (f && !fuels.includes(f) && stockOf(state, seat, f) > 0) fuels.push(f);
  }
  // largest stockpile first; Array.prototype.sort is stable, catalog order on ties
  fuels.sort((x, y) => stockOf(state, seat, y) - stockOf(state, seat, x));
  for (const fuel of fuels) {
    for (const id of POWER_PLANT_IDS) {
      const def = BUILDINGS[id];
      if (def?.fuel !== fuel || !def.fuelRate) continue;
      for (const host of cities) {
        if (!host.buildings.includes(id)) continue;
        const inst = host.districts.find((d) => d.type === 'INDUSTRIAL_ZONE');
        if (!inst) continue;
        const at = state.map.tiles[inst.tileIndex];
        if (!at.districtComplete || at.districtPillaged) continue;
        // CIV6 (Industrialist, EFFECT_ADJUST_RESOURCE_POWER_PROVIDED_GOVERNOR):
        // the plant's own city's governor raises what each resource provides
        const rate = def.fuelRate + governorSum(state, host, (e) => e.plantPowerPerResource);
        let extra = 0;
        for (const city of [host, ...cities.filter((c) => c !== host)]) {
          let rem = need.get(city.id) ?? 0;
          if (rem <= 0) continue;
          const centre = state.map.tiles[city.centerIndex];
          if (hexDistance(state.map, at.col, at.row, centre.col, centre.row) > reach) continue;
          const use = Math.min(extra, rem);
          rem -= use;
          extra -= use;
          if (rem > 0) {
            const burn = Math.min(stockOf(state, seat, fuel), Math.ceil(rem / rate));
            if (burn > 0) {
              spendStockpile(state, seat, fuel, burn, 'fu');
              emitCarbon(state, seat, plantCarbon(fuel, rate, burn));
            }
            extra += burn * rate;
            const give = Math.min(extra, rem);
            rem -= give;
            extra -= give;
          }
          need.set(city.id, rem);
        }
      }
    }
  }
  for (const city of cities) if (need.has(city.id) && need.get(city.id)! <= 0) city.powered = true;
}
