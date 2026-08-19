
import type { GameState, GreatPersonClass } from './types';
import { citiesOf, seatOf } from './seats';
import { GP_CLASSES, GP_CLASS_DISTRICT, GREAT_PEOPLE, GW_CLASS_KIND, GW_WONDER_SLOTS, GW_WORK_CLASSES, gpCost, placeGreatWorks } from '../data/greatPeople';
import { congressGppFactor } from './congress';
import { BUILDINGS } from '../data/buildings';
import { ERA_SCORE_GP } from '../data/seats';
import { addEraScore, goldenProphetPoints } from './eras';
import { getModifiers } from './effects';
import { spawnUnit } from './units';

export function greatPeopleEarned(state: GameState, cls: GreatPersonClass): number {
  return state.claimedGreatPeople.filter((id) => GREAT_PEOPLE[cls].some((p) => p.id === id)).length;
}

export function greatPersonPointsPerTurn(
  state: GameState,
  seat: number,
): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  const gppFlat = getModifiers(state, seat).gppFlat;
  out.PROPHET += goldenProphetPoints(state, seat);
  for (const city of citiesOf(state, seat)) {
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) =>
          d.type === district &&
          state.map.tiles[d.tileIndex].districtComplete &&
          !state.map.tiles[d.tileIndex].districtPillaged,
      );
      if (!inst) continue;
      out[cls] += 1 + (gppFlat[cls] ?? 0)
        + city.buildings.filter((b) => BUILDINGS[b]?.district === district).length;
    }
  }
  // CIV6 (Patronage resolution): the factor covers every source, the golden
  // prophet term included — so it applies after all of them.
  for (const cls of GP_CLASSES) out[cls] *= congressGppFactor(state, cls);
  return out;
}

function recruit(state: GameState, seat: number, cls: GreatPersonClass): void {
  const owner = seatOf(state, seat);
  const person = GREAT_PEOPLE[cls][greatPeopleEarned(state, cls)];
  if (!owner || !person) return; // class exhausted
  const cities = owner.cities;
  const fx = person.effect;

  if (fx.science) owner.research.techProgress += fx.science;
  if (GW_WORK_CLASSES.has(cls)) {
    const kind = GW_CLASS_KIND[cls]!;
    // Wonder-granted slots (Great Library +2 writing) resolve HERE because
    // completeness lives on the tile and data/greatPeople.ts is map-free.
    const wonderSlots = (c: { wonders?: { id: string; tileIndex: number }[] }) =>
      (c.wonders ?? []).reduce(
        (n, w) =>
          n + (state.map.tiles[w.tileIndex].builtWonderComplete ? (GW_WONDER_SLOTS[w.id]?.[kind] ?? 0) : 0),
        0,
      );
    const overflow = placeGreatWorks(cities, kind, wonderSlots);
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
    if (capital && capital.queue.length > 0) capital.queue[0].progress += fx.productionToCapital;
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
    let earned = greatPeopleEarned(state, cls);
    while (earned < GREAT_PEOPLE[cls].length && pts >= gpCost(earned)) {
      pts -= gpCost(earned);
      recruit(state, seat, cls);
      earned++;
    }
    owner.gpp[cls] = pts;
  }
}
