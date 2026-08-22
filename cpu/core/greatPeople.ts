
import type { GameState, GreatPersonClass } from './types';
import { citiesOf, seatOf } from './seats';
import { GP_CLASSES, GP_CLASS_DISTRICT, GP_FIRST_OF_ERA, GREAT_PEOPLE, GW_CLASS_KIND, GW_WONDER_SLOTS, GW_WORK_CLASSES, gpCost, placeGreatWorks } from '../data/greatPeople';
import { congressGppFactor } from './congress';
import { BUILDINGS } from '../data/buildings';
import { ERA_SCORE_GP } from '../data/seats';
import { completedWonders, seatWonders } from './wonders';
import { addEraScore, goldenProphetPoints, worldEraIndex } from './eras';
import { getModifiers } from './effects';
import { spawnUnit } from './units';
import { repairDrip } from './rules';

export function greatPeopleEarned(state: GameState, cls: GreatPersonClass): number {
  return state.claimedGreatPeople.filter((id) => GREAT_PEOPLE[cls].some((p) => p.id === id)).length;
}

/**
 * The QUEUE POSITION this class offers next. CIV6: the replacement for a
 * claimed person "is chosen randomly from those available in the current era,
 * or the next if all those from the current era have been claimed", so the
 * queue never走 backwards and anyone the world era has passed is gone for the
 * rest of the game. Past the roster's end the class is exhausted.
 */
/** What the class's CURRENT offer costs — Infinity once the roster is spent. */
export function gpOfferCost(state: GameState, cls: GreatPersonClass): number {
  const p = GREAT_PEOPLE[cls][gpOffer(state, cls)];
  return p ? gpCost(cls, p.era, worldEraIndex(state)) : Infinity;
}

export function gpOffer(state: GameState, cls: GreatPersonClass): number {
  const i = GP_CLASSES.indexOf(cls);
  const taken = state.gpNext?.[i] ?? 0;
  return Math.max(taken, GP_FIRST_OF_ERA[cls][Math.max(0, Math.min(worldEraIndex(state), 8))]);
}

export function greatPersonPointsPerTurn(
  state: GameState,
  seat: number,
): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  const gppFlat = getModifiers(state, seat).gppFlat;
  out.PROPHET += goldenProphetPoints(state, seat);
  for (const city of citiesOf(state, seat)) {
    // CIV6 (Oracle): "Districts in this city provide +2 Great Person points
    // of their type" — the HOLDING city's districts only.
    const distGpp = completedWonders(state, city)
      .reduce((n, w) => n + (w.def.effects?.districtGpPoints ?? 0), 0);
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) =>
          d.type === district &&
          state.map.tiles[d.tileIndex].districtComplete &&
          !state.map.tiles[d.tileIndex].districtPillaged,
      );
      if (!inst) continue;
      out[cls] += 1 + (gppFlat[cls] ?? 0) + distGpp
        + city.buildings.filter((b) => BUILDINGS[b]?.district === district).length;
    }
  }
  // CIV6: a wonder's per-turn Great Person points are the owner's, paid
  // whether or not the holding city has the class's district.
  for (const w of seatWonders(state, seat)) {
    for (const [cls, pts] of Object.entries(w.def.effects?.gpPoints ?? {})) {
      out[cls as GreatPersonClass] += pts;
    }
  }
  // CIV6 (Patronage resolution): the factor covers every source, the golden
  // prophet term included — so it applies after all of them.
  for (const cls of GP_CLASSES) out[cls] *= congressGppFactor(state, cls);
  return out;
}

/** Great-work slots a city's WONDERS add, for one kind. It resolves here
 *  because completeness lives on the tile and data/greatPeople.ts is map-free. */
export function wonderGwSlots(state: GameState, kind: number) {
  return (c: { wonders?: { id: string; tileIndex: number }[] }): number =>
    (c.wonders ?? []).reduce(
      (n, w) =>
        n + (state.map.tiles[w.tileIndex].builtWonderComplete ? (GW_WONDER_SLOTS[w.id]?.[kind] ?? 0) : 0),
      0,
    );
}

function recruit(state: GameState, seat: number, cls: GreatPersonClass): void {
  const owner = seatOf(state, seat);
  const at = gpOffer(state, cls);
  const person = GREAT_PEOPLE[cls][at];
  if (!owner || !person) return; // class exhausted
  (state.gpNext ??= GP_CLASSES.map(() => 0))[GP_CLASSES.indexOf(cls)] = at + 1;
  const cities = owner.cities;
  const fx = person.effect;

  if (fx.science) owner.research.techProgress += fx.science;
  if (GW_WORK_CLASSES.has(cls)) {
    const kind = GW_CLASS_KIND[cls]!;
    const overflow = placeGreatWorks(cities, kind, wonderGwSlots(state, kind), at);
    if (fx.culture) owner.research.civicProgress += fx.culture * overflow;
  } else if (fx.culture) {
    owner.research.civicProgress += fx.culture;
  }
  if (fx.faith) owner.faith += fx.faith;
  if (fx.gold) owner.treasury += fx.gold;
  if (fx.productionToCapital) {
    const capital = cities.find((c) => c.isCapital);
    // Route the LUMP like completion overflow: into the queue head if there is
    // one, otherwise banked. Dropping it when the queue is empty is a leak.
    if (capital && capital.queue.length > 0) {
      const before = capital.queue[0].progress;
      capital.queue[0].progress += fx.productionToCapital;
      repairDrip(state, capital, before);
    }
    else if (capital) capital.productionBank = (capital.productionBank ?? 0) + fx.productionToCapital;
  }
  if (cls === 'GENERAL' || cls === 'ADMIRAL') {
    const capital = cities.find((c) => c.isCapital);
    if (capital) spawnUnit(state, cls, capital.centerIndex, seat);
  }

  state.claimedGreatPeople.push(person.id); // gone from the global pool...
  owner.gpEarned.push(person.id); // ...and recorded as this seat's recruit
  addEraScore(state, seat, ERA_SCORE_GP);
  state.eventLog.push(`${owner.name} claimed ${person.name}.`);
}

export function advanceGreatPeople(state: GameState, seat: number): void {
  const owner = seatOf(state, seat);
  if (!owner) return;
  const perTurn = greatPersonPointsPerTurn(state, seat);
  for (const cls of GP_CLASSES) {
    let pts = (owner.gpp[cls] ?? 0) + perTurn[cls];
    if (pts === 0) continue;
    for (;;) {
      const cost = gpOfferCost(state, cls); // Infinity once the roster is spent
      if (pts < cost) break;
      pts -= cost;
      recruit(state, seat, cls);
    }
    owner.gpp[cls] = pts;
  }
}
