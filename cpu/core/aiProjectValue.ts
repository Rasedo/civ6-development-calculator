/**
 * THE AI'S PROJECT VALUE (GameCore_XP2 AI/Value_Manager.cpp 0x7b28c0;
 * `tools/civ6lab/dll_readings.md` "C-96: the project value") and the city
 * centre's PROJECTS table (0x5ce970's project loop, AI_CityBuild.csv's
 * PROJECTS rows): what completing a project in `t` turns is worth to `h` —
 * the projects it opens, its space-race standing, its Great Person points,
 * the outer defences it mends, paid once at `t`; then the loyalty a citizen
 * it brings, the building it creates less those it consumes, and its
 * completion modifiers.
 */
import { AI_PROJECTS } from '../data/aiBuildTables';
import type { AiProjectRow } from './aiCityBuild';
import { modifiersValue } from './aiModifiers';
import {
  AI_RATE, FX, FX_MIN, discounted, fmul, fxConst, presentValue, pseudoYieldValue, type AiValueView,
} from './aiValue';

/** What the project value reads of the player and the city */
export interface ProjectValueFacts {
  view: AiValueView;
  seat: number;
  cityId: number;
  capital: boolean;
  /** the player's completions of a project (m_aiNumProjectsAdvanced,
   *  0x4be7b0) */
  advanced(project: string): number;
  /** the city's turns to build a project (0x17b890) */
  buildTurns(project: string): number;
  /** the game's progress the progression 0x5267a0 escalates by: the
   *  integer percent of the further of the player's two trees
   *  (`gameProgressPct`) */
  progressPct: number;
  /** the player's space-race standing a SpaceRace project squares
   *  (0x7b8a30) */
  spaceRaceStanding: number;
  /** the city's damaged outer defences count (+0x1880, 0x197ff0), its
   *  population (+0x588) and its districts (0x1ae8f0) */
  defenceRepairs: number;
  population: number;
  districts: number;
  /** the city's loyalty falls (+0x2a78 below 0) */
  loyaltyFalling: boolean;
  /** the building value (0x7a7590) of a building from `t` to `h`, raw */
  buildingValue(building: string, t: number, h: number): number;
  /** the city holds a building */
  hasBuilding(building: string): boolean;
}

const PROJECT = new Map(AI_PROJECTS.map((r) => [r.type, r] as const));

/** PSEUDOYIELD_NUCLEAR_WEAPON's amounts a WMD project opens: 250.0 at the
 *  player's value (@0xd71c24), and 1000.0 at the player's less at none */
const NUCLEAR_OWN = 250;
const NUCLEAR_SPREAD = 1000;

/** 0x7b28c0: the project landing in `t` turns, valued to `h` */
export function projectValue(f: ProjectValueFacts, project: string, t: number, h: number): number {
  if (t >= h) return FX_MIN;
  const row = PROJECT.get(project);
  if (!row) return FX_MIN;
  if (row.maxPlayerInstances >= 0 && row.maxPlayerInstances <= f.advanced(project)) return FX_MIN;
  let v = 0;
  // the projects it opens, each at least 200.0 at its own landing; a WMD
  // one's nuclear weapon
  for (const next of row.unlocks) {
    v += Math.max(projectValue(f, next, t + f.buildTurns(next), h), 200 * FX);
    if (PROJECT.get(next)?.wmd) {
      v += pseudoYieldValue(f.view, f.seat, NUCLEAR_OWN * FX, 'PSEUDOYIELD_NUCLEAR_WEAPON');
      v += pseudoYieldValue(f.view, f.seat, NUCLEAR_SPREAD * FX, 'PSEUDOYIELD_NUCLEAR_WEAPON')
        - pseudoYieldValue(null, null, NUCLEAR_SPREAD * FX, 'PSEUDOYIELD_NUCLEAR_WEAPON');
    }
  }
  if (row.spaceRace) {
    v += pseudoYieldValue(f.view, f.seat, f.spaceRaceStanding * f.spaceRaceStanding * FX, 'PSEUDOYIELD_SPACE_RACE');
    for (const p of AI_PROJECTS) {
      if (p.spaceRace && f.advanced(p.type) > 0) v += pseudoYieldValue(f.view, f.seat, FX, 'PSEUDOYIELD_SPACE_RACE');
    }
  }
  // its Great Person points escalated by the game's progress, x4
  for (const [pseudo, points, param] of row.gpp) {
    if (!pseudo) continue;
    const esc = points + Math.trunc((Math.trunc((points * param) / 100) - points) * f.progressPct / 100);
    v += 4 * pseudoYieldValue(f.view, f.seat, esc * FX, pseudo);
  }
  if (row.outerDefenseRepair && f.defenceRepairs > 0) v += 10 * f.defenceRepairs * f.population * f.districts * FX;
  let value = discounted(v, AI_RATE, t);
  // the loyalty a citizen it brings while the city's loyalty falls
  if (row.identityPerCitizen !== 0 && f.loyaltyFalling) {
    const a = Math.trunc(Math.fround(f.population * row.identityPerCitizen) * FX);
    value += presentValue(a, AI_RATE, h) - presentValue(a, AI_RATE, t);
  }
  // the building it creates, less each it consumes the city holds; none of
  // those held, FX(-9999)
  if (row.createBuilding) value += f.buildingValue(row.createBuilding, t, h);
  let held = false;
  for (const b of row.consumes) {
    if (!f.hasBuilding(b)) continue;
    value -= f.buildingValue(b, t, h);
    held = true;
  }
  if (row.consumes.length > 0 && !held) return FX_MIN;
  value += modifiersValue({ view: f.view, seat: f.seat, start: t, horizon: h, rate: AI_RATE, owner: { cityId: f.cityId, capital: f.capital } }, row.modifiers);
  return value;
}

/** What the PROJECTS table reads beyond the project value's facts */
export interface ProjectTableFacts extends ProjectValueFacts {
  hasCivic(civic: string): boolean;
  hasTech(tech: string): boolean;
  /** the city holds a district of the type (0x1aea60) */
  hasDistrict(district: string): boolean;
  /** an effect unlocked the project for the player (0x468260) */
  unlockedByEffect(project: string): boolean;
  /** the player's other cities producing the project (0x179650) */
  producingElsewhere(project: string): number;
  /** the player's lists favour the project (player +0x1290 +0x6e8) */
  favoured(project: string): boolean;
  /** the horizon (valueHorizons[1]) */
  horizon: number;
}

/** 0x5ce970's gates: the player's completions and the other cities' builds
 *  below MaxPlayerInstances, an effect's unlock where the row asks one, its
 *  civic and tech held, its district in the city, its building held, the
 *  projects it needs completed */
function analysed(f: ProjectTableFacts, p: AiProjectRow): boolean {
  if (p.maxPlayerInstances >= 0 && f.advanced(p.type) >= p.maxPlayerInstances) return false;
  if (p.unlocksFromEffect && !f.unlockedByEffect(p.type)) return false;
  if (p.maxPlayerInstances >= 0 && f.producingElsewhere(p.type) >= p.maxPlayerInstances) return false;
  if (p.civic && !f.hasCivic(p.civic)) return false;
  if (p.tech && !f.hasTech(p.tech)) return false;
  if (p.district && !f.hasDistrict(p.district)) return false;
  if (p.requiredBuilding && !f.hasBuilding(p.requiredBuilding)) return false;
  return p.prereqs.every((q) => f.advanced(q) > 0);
}

/** THE PROJECTS TABLE of the city centre: a raw value per Projects row in
 *  database order — FX(-9999) where the analysis does not value it, else
 *  the value at its build turns, x1.5 a favoured one */
export function projectTable(f: ProjectTableFacts): number[] {
  return AI_PROJECTS.map((p) => {
    if (!analysed(f, p)) return FX_MIN;
    const v = projectValue(f, p.type, f.buildTurns(p.type), f.horizon);
    return f.favoured(p.type) ? fmul(v, fxConst(1.5)) : v;
  });
}
