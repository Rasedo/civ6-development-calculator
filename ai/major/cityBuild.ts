/**
 * THE MAJORS' CITY PRODUCTION (the shared city build AI, `cpu/core/aiCityBuild.ts`,
 * on a major's city: `cpu/core/majorCityBuild.ts`): per city whose queue
 * stands empty, the Default Specialization pick (0x5d4d70) over the city
 * centre's buildings, units and projects tables, emitted as the seat's
 * production column (`SeatActionRecord.production`: [centre, column]).
 */
import { buildingTable, buildingValue, defaultSpecialization, unitTable, type Pick } from '../../cpu/core/aiCityBuild';
import { projectTable } from '../../cpu/core/aiProjectValue';
import { majorBuildFacts, majorItemColumn, majorPickFacts } from '../../cpu/core/majorCityBuild';
import type { MajorViewInputs } from '../../cpu/core/majorView';
import { citiesOf } from '../../cpu/core/seats';
import type { City, GameState } from '../../cpu/core/types';
import { AI_BUILDINGS } from '../../cpu/data/aiBuildTables';
import { AI_VALUE_HORIZON } from '../../cpu/data/aiValue';
import { CIVICS } from '../../cpu/data/civics';
import { TECHS } from '../../cpu/data/techs';
import { gameProgressPct } from '../../cpu/data/constants';
import { engineId } from '../../cpu/data/aliases';
import { FX_MIN } from '../../cpu/core/aiValue';
import type { CityBuildFacts } from '../../cpu/core/aiCityBuild';

/** the city centre's projects table on a major's facts (`projectTable`) */
export function majorProjectTable(state: GameState, city: City, facts: CityBuildFacts): number[] {
  const r = state.seats[city.seat].research;
  return projectTable({
    view: facts.view, seat: city.seat, cityId: city.id, capital: facts.capital, advanced: () => 0,
    buildTurns: (x) => facts.buildTurns(x), progressPct: gameProgressPct(r.techs.length, r.civics.length),
    spaceRaceStanding: 0, defenceRepairs: 0, population: facts.population, districts: facts.districtCount,
    loyaltyFalling: false,
    buildingValue: (x, t) => {
      const row = AI_BUILDINGS.find((y) => y.type === x);
      return row ? buildingValue(facts, row, t) : 0;
    },
    hasBuilding: (x) => facts.hasBuilding(x),
    hasCivic: (c) => r.civics.includes(engineId('civic', c, 'CIVIC_', CIVICS) ?? ''),
    hasTech: (t) => r.techs.includes(engineId('tech', t, 'TECH_', TECHS) ?? ''),
    hasDistrict: (d) => facts.hasDistrict(d),
    unlockedByEffect: () => false, producingElsewhere: () => 0, favoured: () => false, horizon: AI_VALUE_HORIZON,
  });
}

/** THE DEFAULT SPECIALIZATION PICK of a major's city (0x5d4d70), null for
 *  none; `known` the knowledge base's unit counts */
export function cityPick(state: GameState, city: City, known: (unit: string) => number, inputs?: MajorViewInputs): Pick | null {
  const facts = majorBuildFacts(state, city, known, inputs);
  const units = unitTable(facts).map((x) => x ?? FX_MIN);
  return defaultSpecialization({ buildings: buildingTable(facts), units, projects: majorProjectTable(state, city, facts) },
    majorPickFacts(state, city, facts));
}

/** THE SEAT'S PRODUCTION: per city with nothing in hand, its pick as the
 *  production column ([centre, column]) */
export function seatProduction(state: GameState, seat: number, known: (unit: string) => number,
                               inputs?: MajorViewInputs): [number, number][] {
  const out: [number, number][] = [];
  for (const city of citiesOf(state, seat)) {
    if (city.queue.length) continue;
    const pick = cityPick(state, city, known, inputs);
    if (!pick) continue;
    const col = majorItemColumn(state, city, pick.type);
    if (col >= 0) out.push([city.centerIndex, col]);
  }
  return out;
}
