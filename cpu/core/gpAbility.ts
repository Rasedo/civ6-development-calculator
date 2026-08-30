/**
 * A GREAT PERSON IS PLACED AND USED. CIV6 (Great People, "Activating Great
 * People"): every class arrives as a unit, walks to a site its ability may be
 * spent at, and spends a charge there. What one charge pays out is the
 * PERSON's own sourced row, `GP_ABILITY`.
 */

import type { City, GameState, GreatPersonClass, Unit } from './types';
import { dropQueuedBuilding } from './production';
import type { Tile } from '../../world/types';
import { neighbors } from '../../world/hex';
import { RESOURCES } from '../../world/resources';
import { cityAtTile, citiesOf, isCityStateSeat, seatOf, tileOwnedByCiv, tileSeat } from './seats';
import {
  GP_CITY_PERM, GP_CLASSES, GP_PERM, GREAT_PEOPLE, GW_CLASS_KIND, GW_WORK_CLASSES,
  gpChargesOf, gpEffectOf, gpSiteOf, gwCapacity, gwCount, placeGreatWorks,
  type GpEffect, type GreatPersonDef,
} from '../data/greatPeople';
import { gwExtraSlots } from './greatPeople';
import { SUZERAIN_ENVOYS } from '../data/cityStates';
import { resolveSuzerain } from './cityStates';
import { ERAS, TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { WONDER_ERA_INDEX } from '../data/builtWonders';
import { isSpaceProject } from '../data/projects';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE } from '../data/seats';
import { dedicationEvent } from './eras';
import { nextRandom } from './rand';
import { spawnUnit, disbandUnit } from './units';
import { grantStockpile } from './stockpile';
import { repairDrip, urbanDefensesFit } from './rules';
import { UNITS, URBAN_DEFENSES_TECH } from '../data/units';
import { xpToNextLevel } from './promotions';

/** the CLASS a Great Person chassis carries — the unit id IS the class name. */
export function gpClassOfUnit(unit: { type: string }): GreatPersonClass | undefined {
  return (GP_CLASSES as readonly string[]).includes(unit.type)
    ? (unit.type as GreatPersonClass)
    : undefined;
}

export function gpPersonOf(unit: { type: string; gpAt?: number }): GreatPersonDef | undefined {
  const cls = gpClassOfUnit(unit);
  return cls === undefined ? undefined : GREAT_PEOPLE[cls][unit.gpAt ?? -1];
}

/** the seat's city that owns this tile, falling back to its capital — the
 *  city an ability scoped to "this city" applies to. */
export function gpCityAt(state: GameState, seat: number, tile: Tile): City | undefined {
  const own = cityAtTile(state, tile);
  if (own && own.seat === seat) return own;
  return citiesOf(state, seat).find((c) => c.isCapital);
}

/** an open Great Work slot of `kind` in this city, wonders included. */
function gwOpen(state: GameState, city: City, kind: number): boolean {
  return gwCount(city, kind) < gwCapacity(city, kind, gwExtraSlots(state, kind)(city));
}

/** MAY this person's charge be spent on the tile the unit is standing on? */
export function gpActivateOk(state: GameState, unit: Unit): boolean {
  const person = gpPersonOf(unit);
  if (!person || (unit.charges ?? 0) <= 0) return false;
  const tile = state.map.tiles[unit.tileIndex];
  if (!tile) return false;
  const { site, district } = gpSiteOf(person);
  switch (site) {
    case 'anywhere':
      return true;
    case 'district': {
      if (!tileOwnedByCiv(tile, unit.seat)) return false;
      return tile.district === district && tile.districtComplete && !tile.districtPillaged;
    }
    case 'gwSlot': {
      const kind = GW_CLASS_KIND[person.class];
      if (kind === undefined || !tileOwnedByCiv(tile, unit.seat)) return false;
      const city = cityAtTile(state, tile);
      return !!city && city.seat === unit.seat && gwOpen(state, city, kind);
    }
    case 'cityState':
      return isCityStateSeat(tileSeat(tile));
    case 'luxury':
      return tileOwnedByCiv(tile, unit.seat)
        && !!tile.resource && RESOURCES[tile.resource]?.category === 'luxury';
    case 'adjacentOwn':
      return tileSeat(tile) < 0
        && neighbors(state.map, tile).some((n) => tileOwnedByCiv(n, unit.seat));
  }
}

/** one eureka/inspiration draw over the eras `lo`..`hi`, in the catalog order
 *  both engines walk. The stream advances only when something was open. */
function boostRandom(
  state: GameState, seat: number, kind: 'tech' | 'civic', n: number, lo: number, hi: number,
): void {
  const owner = seatOf(state, seat);
  if (!owner) return;
  const rsr = owner.research;
  for (let i = 0; i < n; i++) {
    const rows = kind === 'tech' ? Object.values(TECHS) : Object.values(CIVICS);
    const held = kind === 'tech' ? rsr.techs : rsr.civics;
    const pool = rows.filter((d) => {
      const e = ERAS.indexOf(d.era);
      return e >= lo && e <= hi && !held.includes(d.id) && !rsr.boosted.includes(d.id);
    });
    if (pool.length === 0) return; // nothing open — the stream is not spent
    const pick = pool[Math.floor(nextRandom(state) * pool.length)];
    rsr.boosted.push(pick.id);
    dedicationEvent(state, seat, kind === 'tech' ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE, 1);
  }
}

/** N technologies COMPLETED outright, drawn over what is available — the
 *  `grantFreeResearch` draw, reached from an ability instead of a wonder. */
function freeTechs(state: GameState, seat: number, n: number): void {
  const owner = seatOf(state, seat);
  if (!owner) return;
  const rsr = owner.research;
  for (let i = 0; i < n; i++) {
    const open = Object.values(TECHS).filter(
      (d) => !rsr.techs.includes(d.id) && d.prereqs.every((p) => rsr.techs.includes(p)),
    );
    if (open.length === 0) return;
    const pick = open[Math.floor(nextRandom(state) * open.length)];
    if (pick.id === URBAN_DEFENSES_TECH) urbanDefensesFit(state, seat);
    rsr.techs.push(pick.id);
    delete rsr.techRetained[pick.id];
    if (rsr.tech === pick.id) rsr.tech = null;
  }
}

function permAdd(target: { gpPerm?: number[] }, width: number, key: string, keys: readonly string[], n: number): void {
  const k = keys.indexOf(key);
  if (k < 0) return;
  const v = (target.gpPerm ??= new Array<number>(width).fill(0));
  while (v.length < width) v.push(0);
  v[k] += n;
}

/** the tiles a `perAdjacent` clause counts around (and, when `here`, on) the
 *  activation tile. */
function perAdjacentCount(state: GameState, tile: Tile, fx: NonNullable<GpEffect['perAdjacent']>): number {
  const hit = (t: Tile): boolean =>
    fx.source === 'MOUNTAIN' ? t.elevation === 'MOUNTAIN'
      : fx.source === 'NATURAL_WONDER' ? t.wonder !== null
        : t.feature === 'RAINFOREST';
  let n = neighbors(state.map, tile).filter(hit).length;
  if (fx.here && hit(tile)) n += 1;
  return n;
}

/**
 * SPEND ONE CHARGE. The order below is the order both engines apply in, which
 * matters wherever a clause draws from the random stream.
 */
export function activateGreatPerson(state: GameState, unit: Unit): boolean {
  const person = gpPersonOf(unit);
  const owner = seatOf(state, unit.seat);
  if (!person || !owner || !gpActivateOk(state, unit)) return false;
  const tile = state.map.tiles[unit.tileIndex];
  const city = gpCityAt(state, unit.seat, tile);
  const fx = gpEffectOf(person);
  const era = person.era;

  if (fx.science) owner.research.techProgress += fx.science;
  // CIV6 (Mary Leakey): "Gain 350 Science for every Artifact in this city."
  if (fx.artifactScience && city) {
    owner.research.techProgress += fx.artifactScience * (city.artifactEras?.length ?? 0);
  }
  // CIV6 (Marina Raskova): "District in this tile gains +1 air unit slots."
  if (fx.airSlotBonus) tile.airSlotBonus = (tile.airSlotBonus ?? 0) + fx.airSlotBonus;
  if (GW_WORK_CLASSES.has(person.class) && city) {
    const kind = GW_CLASS_KIND[person.class]!;
    const overflow = placeGreatWorks([city], kind, gwExtraSlots(state, kind), unit.gpAt ?? 0);
    if (fx.culture) owner.research.civicProgress += fx.culture * overflow;
  } else if (fx.culture) {
    owner.research.civicProgress += fx.culture;
  }
  if (fx.faith) owner.faith += fx.faith;
  if (fx.gold) owner.treasury += fx.gold;
  if (fx.productionToCapital) {
    const cap = owner.cities.find((c) => c.isCapital);
    if (cap && cap.queue.length > 0) {
      const before = cap.queue[0].progress;
      cap.queue[0].progress += fx.productionToCapital;
      repairDrip(state, cap, before);
    } else if (cap) cap.productionBank = (cap.productionBank ?? 0) + fx.productionToCapital;
  }

  // RESEARCH. Named eurekas first, then the era sweep, then the draws — techs
  // before civics, then the outright completions.
  if (fx.eurekaTechs?.length) {
    const rsr = owner.research;
    let fired = 0;
    for (const id of fx.eurekaTechs) {
      if (!TECHS[id] || rsr.techs.includes(id)) continue;
      // CIV6 (Zhang Heng): already boosted, so the technology itself lands.
      if (rsr.boosted.includes(id)) {
        if (id === URBAN_DEFENSES_TECH) urbanDefensesFit(state, unit.seat);
        rsr.techs.push(id);
        delete rsr.techRetained[id];
        if (rsr.tech === id) rsr.tech = null;
      } else {
        rsr.boosted.push(id);
        fired += 1;
      }
    }
    if (fired) dedicationEvent(state, unit.seat, DED_FREE_INQUIRY, fired);
  }
  if (fx.eurekaEra) {
    const rsr = owner.research;
    let fired = 0;
    for (const [id, def] of Object.entries(TECHS)) {
      if (ERAS.indexOf(def.era) !== era) continue;
      if (rsr.techs.includes(id) || rsr.boosted.includes(id)) continue;
      rsr.boosted.push(id);
      fired += 1;
    }
    if (fired) dedicationEvent(state, unit.seat, DED_FREE_INQUIRY, fired);
  }
  if (fx.eurekaRandom) {
    boostRandom(state, unit.seat, 'tech', fx.eurekaRandom, era + (fx.eurekaLo ?? 0), era + (fx.eurekaHi ?? 0));
  }
  if (fx.inspirationRandom) {
    boostRandom(state, unit.seat, 'civic', fx.inspirationRandom, era + (fx.eurekaLo ?? 0), era + (fx.eurekaHi ?? 0));
  }
  if (fx.freeTechRandom) freeTechs(state, unit.seat, fx.freeTechRandom);

  // THE CITY THE CHARGE LANDS IN.
  if (fx.buildings?.length && city) {
    // CIV6 (Isaac Newton): "Instantly builds a Library and University in this
    // city" — which can be the very building the city is producing.
    for (const b of fx.buildings) {
      if (!city.buildings.includes(b)) city.buildings.push(b);
      dropQueuedBuilding(city, b);
    }
  }
  if (fx.wonderProduction && city) {
    const q = city.queue[0];
    if (q?.kind === 'wonder') {
      const dbl = fx.wonderEraDouble !== undefined && (WONDER_ERA_INDEX[q.wonder] ?? 0) <= fx.wonderEraDouble;
      const before = q.progress;
      q.progress += fx.wonderProduction * (dbl ? 2 : 1);
      repairDrip(state, city, before);
    }
  }
  if (fx.spaceProduction && city) {
    const q = city.queue[0];
    if (q?.kind === 'project' && isSpaceProject(q.project)) q.progress += fx.spaceProduction;
  }
  if (fx.perAdjacent) {
    const n = perAdjacentCount(state, tile, fx.perAdjacent);
    const amount = n * fx.perAdjacent.amount;
    if (amount > 0) {
      if (fx.perAdjacent.yield === 'science') owner.research.techProgress += amount;
      else if (fx.perAdjacent.yield === 'culture') owner.research.civicProgress += amount;
      else if (fx.perAdjacent.yield === 'gold') owner.treasury += amount;
      else owner.faith += amount;
    }
  }
  if (fx.luxuryCopies) {
    const inv = (owner.gpLuxuries ??= []);
    for (let i = 0; i < fx.luxuryCopies; i++) inv.push(fx.luxuryAmenities ?? 1);
  }
  if (fx.greatWorkKind !== undefined && city) {
    placeGreatWorks([city], fx.greatWorkKind, gwExtraSlots(state, fx.greatWorkKind), 0);
  }
  // THE SEAT'S OWN LEDGERS.
  if (fx.envoys) owner.envoysAvailable = (owner.envoysAvailable ?? 0) + fx.envoys;
  // CIV6 (Matthew Perry): "Grants enough Envoys to become Suzerain at this
  // City-state, then removes all other players' Envoys" — the rivals' bar is
  // read BEFORE the removal, the clause's own order.
  if (fx.suzerainSeize) {
    const csSeat = tileSeat(state.map.tiles[unit.tileIndex]);
    const cs = (state.cityStates ?? []).find((c) => c.seat === csSeat);
    if (cs) {
      const rivalMax = Math.max(
        0, ...Object.entries(cs.envoys).filter(([s]) => Number(s) !== unit.seat).map(([, n]) => n));
      cs.envoys[unit.seat] = Math.max(cs.envoys[unit.seat] ?? 0, rivalMax + 1, SUZERAIN_ENVOYS);
      for (const s of Object.keys(cs.envoys)) {
        if (Number(s) !== unit.seat) cs.envoys[Number(s)] = 0;
      }
      resolveSuzerain(state, cs);
    }
  }
  if (fx.gppAll) for (const c of GP_CLASSES) owner.gpp[c] = (owner.gpp[c] ?? 0) + fx.gppAll;
  if (fx.strategic) grantStockpile(state, unit.seat, fx.strategic.resource, fx.strategic.amount);

  // THE UNIT ON THE TILE — a granted chassis, or a promotion for whoever is
  // already standing here.
  if (fx.unit && UNITS[fx.unit]) {
    const made = spawnUnit(state, fx.unit, unit.tileIndex, unit.seat);
    if (made && fx.unitPromotions) made.xp = xpToNextLevel(made);
  }
  // CIV6 (El Cid): "Forms a Corps out of a military land unit" — the tier is
  // handed over outright, no second unit and no civic.
  if (fx.formation) {
    const target = state.units.find(
      (u) => u.seat === unit.seat && u.tileIndex === unit.tileIndex
        && (UNITS[u.type]?.combat ?? 0) > 0
        && (UNITS[u.type]?.naval ?? false) === !!fx.formationNaval
        && (u.formation ?? 0) === 0,
    );
    if (target) target.formation = fx.formation;
  }
  if (fx.promotionLevels || fx.xpPct) {
    const target = state.units.find(
      (u) => u.seat === unit.seat && u.tileIndex === unit.tileIndex && (UNITS[u.type]?.combat ?? 0) > 0,
    );
    if (target) {
      if (fx.promotionLevels) target.xp = xpToNextLevel(target);
      if (fx.xpPct) target.xpPct = (target.xpPct ?? 0) + fx.xpPct;
    }
  }

  // PERMANENT CHANNELS.
  for (const [k, n] of Object.entries(fx.perm ?? {})) permAdd(owner, GP_PERM.length, k, GP_PERM, n);
  if (city) for (const [k, n] of Object.entries(fx.cityPerm ?? {})) permAdd(city, GP_CITY_PERM.length, k, GP_CITY_PERM, n);

  (owner.gpActivated ??= []).push(person.id);
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  state.eventLog.push(`${owner.name} activated ${person.name}.`);
  if ((unit.charges ?? 0) <= 0) disbandUnit(state, unit.id);
  return true;
}

export { gpChargesOf };
