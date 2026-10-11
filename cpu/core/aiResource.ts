/**
 * THE RESOURCE VALUE (GameCore_XP2 AI/Value_Manager.cpp 0x7a21e0;
 * `tools/civ6lab/dll_readings.md` "C-96: the resource value"): what `count`
 * more of a resource is worth to a player landing in `t` turns, to the
 * horizon `h`. The research value reads it per resource an unlocked
 * improvement works that the player's cities hold unimproved (0x5d45c0).
 *
 *  - A BONUS resource: 0.
 *  - A LUXURY: 0 where the player holds it already (0x4abfe0) and `count` is
 *    positive; else, for a full civilization or a city-state, the amenities
 *    one copy gives (0x527a50: Happiness, less LUXURY_HAPPINESS_LOSS_PER_ERA
 *    a chronology step from its PeakEra, at least LUXURY_HAPPINESS_MINIMUM —
 *    the greater at the player's era and the next) spread over its cities in
 *    the order 0x79ea80 sorts their amenity balances, each one Amenity more
 *    from `t` to `h` (0x79f7c0); at least PSEUDOYIELD_RESOURCE_LUXURY from
 *    `t` to `h` (0x7a2140); at most 200.0.
 *  - A STRATEGIC: the need — the most any unit of the military AI's
 *    production table asks of it (Units_XP2 ResourceCost + 10 x
 *    ResourceMaintenanceAmount); with no unit asking it 0; else the copies
 *    worth taking, `count` up to twice the need less what the player has
 *    (0x4a93c0), each worth 25.0 per era chronology step over the need (x2
 *    where it has none), discounted to `t`.
 *  - At most 800.0.
 */
import { FX, FX_MIN, discounted, fdiv, fmul, fxConst, AI_RATE } from './aiValue';
import { AI_IMPROVEMENTS, AI_RESOURCES, AI_UNITS } from '../data/aiBuildTables';
import { CIVICS } from '../data/civics';
import { UNITS } from '../data/units';
import { RESOURCES } from '../../world/resources';
import { TECHS } from '../data/techs';
import { engineId, gameTypeOf } from '../data/aliases';

export interface AiResourceRow {
  type: string;
  class: string | null;
  happiness: number;
  peakEra: string | null;
  /** the units whose StrategicResource it is, in the Units' order */
  units: readonly string[];
  /** Resource_Harvests and Resource_YieldChanges: [YieldType, amount] */
  harvests: readonly (readonly [string, number])[];
  yields: readonly (readonly [string, number])[];
}

export interface AiImprovementRow {
  type: string;
  tech: string | null;
  civic: string | null;
  trait: string | null;
  buildable: boolean;
  /** Improvement_ValidResources' resources, and those of them whose row
   *  keeps the plot's feature (MustRemoveFeature false) */
  resources: readonly string[];
  keepsFeature: readonly string[];
  /** Improvement_YieldChanges: [YieldType, amount] */
  yields: readonly (readonly [string, number])[];
  housing: number;
  tilesRequired: number;
  /** YieldFromAppeal and its percent */
  appealYield: string | null;
  appealPct: number;
  defenseModifier: number;
  grantFortification: number;
  /** Improvement_ValidFeatures' features */
  features: readonly string[];
  /** Improvement_ValidBuildUnits: [UnitType, ConsumesCharge] */
  buildUnits: readonly (readonly [string, boolean])[];
  /** each Improvement_Adjacencies row's YieldType */
  adjacency: readonly string[];
}

/** what the value reads of its player */
export interface ResourceFacts {
  /** a full civilization or a city-state (0x469db0 / 0x469de0) */
  amenityParty: boolean;
  /** the player's era's chronology index (Eras +0x1c) */
  eraChronology: number;
  /** the chronology of the era after it (the last era's own at the end) */
  nextEraChronology: number;
  /** an era's chronology index by type */
  chronologyOf(era: string): number | null;
  /** 0x4abfe0: the player holds the resource */
  held(res: string): boolean;
  /** 0x4a93c0(res, 1): the copies the player has */
  have(res: string): number;
  /** the player's cities' amenity balances in 0x79ea80's order, and one
   *  Amenity more in the i-th's value from `t` to `h` (0x79f7c0) */
  cities: number;
  amenityValue(i: number, t: number, h: number): number;
  /** PSEUDOYIELD_RESOURCE_LUXURY of 1.0 a turn from `t` to `h` (0x7a2140) */
  luxuryPseudo(t: number, h: number): number;
  /** the unit is in the military AI's production table (0x79d340) */
  inUnitTable(unit: string): boolean;
  /** Units_XP2 ResourceCost and ResourceMaintenanceAmount */
  unitResourceCost(unit: string): { cost: number; maintenance: number } | null;
}

/** LUXURY_HAPPINESS_LOSS_PER_ERA, LUXURY_HAPPINESS_MINIMUM (GlobalParameters) */
const LUXURY_LOSS_PER_ERA = 2;
const LUXURY_MINIMUM = 2;

/** 0x527a50: the amenities a copy of luxury `r` gives at era chronology `c` */
export function luxuryAmenities(r: AiResourceRow, c: number, f: Pick<ResourceFacts, 'chronologyOf'>): number {
  if (r.happiness <= 0) return 0;
  const peak = r.peakEra ? f.chronologyOf(r.peakEra) : null;
  if (peak === null) return r.happiness;
  return Math.max(LUXURY_MINIMUM, r.happiness - Math.abs(c - peak) * LUXURY_LOSS_PER_ERA);
}

/** 0x7a21e0 */
export function resourceValue(f: ResourceFacts, r: AiResourceRow, count: number, t: number, h: number, rate = AI_RATE): number {
  let v = 0;
  if (r.class === 'RESOURCECLASS_BONUS') v = 0;
  else if (r.class === 'RESOURCECLASS_LUXURY') {
    const floor = f.luxuryPseudo(t, h);
    if (f.held(r.type) && count > 0) v = 0;
    else {
      let e = 0;
      if (f.amenityParty) {
        const a = Math.max(luxuryAmenities(r, f.eraChronology, f), luxuryAmenities(r, f.nextEraChronology, f));
        const [from, to] = count < 0 ? [Math.max(0, f.cities - a), f.cities] : [0, Math.min(f.cities, a)];
        for (let i = from; i < to; i++) e += f.amenityValue(i, t, h);
      }
      v = Math.max(e, floor);
    }
    v = Math.min(v, 200 * FX);
  } else if (r.class === 'RESOURCECLASS_STRATEGIC') {
    let need = 0;
    let used = false;
    for (const u of r.units) {
      if (!f.inUnitTable(u)) continue;
      used = true;
      const c = f.unitResourceCost(u);
      if (c) need = Math.max(need, c.cost + 10 * c.maintenance);
    }
    const have = f.have(r.type);
    const late = t !== h && h !== 0;
    let n = count;
    let take = used;
    if (have < 2 * need && !late && n <= 0) {
      v = FX_MIN;
      take = false;
    } else if (n > 0) n = Math.max(0, Math.min(n, 2 * need - have));
    if (take) {
      let w = f.eraChronology * fxConst(25);
      if (need > 0) w = fdiv(w, need * FX);
      if (have === 0) w = fmul(w, 2 * FX);
      if (have > need && n + have < need) w = fmul(w, fxConst(1.5));
      v = fmul(discounted(w, rate, t), n * FX);
    }
  }
  return Math.min(v, 800 * FX);
}

/** per technology the resources its improvements work (the research value's
 *  walk, 0x7b3e50: the row's improvements in table order, each its
 *  Improvement_ValidResources), the improvements a minor may build only —
 *  Buildable, no civilization's trait (0x35f100) */
export const TECH_IMPROVEMENT_RESOURCES: ReadonlyMap<string, readonly AiResourceRow[]> = (() => {
  const byType = new Map(AI_RESOURCES.map((r) => [r.type, r]));
  const out = new Map<string, AiResourceRow[]>();
  for (const i of AI_IMPROVEMENTS) {
    const tech = i.tech ? engineId('tech', i.tech, 'TECH_', TECHS) : null;
    if (!tech || !i.buildable || i.trait) continue;
    const list = out.get(tech) ?? (out.set(tech, []), out.get(tech)!);
    for (const res of i.resources) if (byType.has(res)) list.push(byType.get(res)!);
  }
  return out;
})();

/** the engine resources a technology's improvement walk reaches, with their
 *  repeats (the GPU's table, `TECH_IMPROVEMENT_RESOURCES` by engine id) */
export function aiTechResources(tech: string): string[] {
  return (TECH_IMPROVEMENT_RESOURCES.get(tech) ?? []).map((r) => engineId('resource', r.type, 'RESOURCE_', RESOURCES)).filter((x): x is string => !!x);
}

/** a resource's row as the GPU reads it: its class (0 none or bonus, 1
 *  luxury, 2 strategic), Happiness, and per unit asking it the need it
 *  sets, whether it is a city-state's version (no trait, not MajorCivOnly,
 *  no FoundCity, CanTrain), its obsolete technologies and civics and the
 *  engine units of it (engine ids) */
export function AI_RESOURCE_EXPORT(engineRes: string): { cls: number; happy: number; units: { need: number; ver: number; obsTechs: string[]; obsCivics: string[]; engine: string[] }[] } {
  const type = engineGameType('resource', engineRes, 'RESOURCE_', RESOURCES);
  const r = AI_RESOURCES.find((x) => x.type === type);
  if (!r) return { cls: 0, happy: 0, units: [] };
  const cls = r.class === 'RESOURCECLASS_LUXURY' ? 1 : r.class === 'RESOURCECLASS_STRATEGIC' ? 2 : 0;
  const units = r.units.map((u) => {
    const row = AI_UNITS.find((x) => x.type === u)!;
    return {
      need: row.resourceCost + 10 * row.maintenanceResourceAmount,
      ver: !row.trait && !row.majorOnly && !row.foundCity && row.canTrain ? 1 : 0,
      obsTechs: row.obsolete.map((o) => engineId('tech', o, 'TECH_', TECHS)).filter((x): x is string => !!x),
      obsCivics: row.obsolete.map((o) => engineId('civic', o, 'CIVIC_', CIVICS)).filter((x): x is string => !!x),
      engine: Object.keys(UNITS).filter((id) => engineGameType('unit', id, 'UNIT_', UNITS) === u),
    };
  });
  return { cls, happy: r.happiness, units };
}

/** the game type of an engine row: its own where that names it, else the
 *  type its catalog tag names (`installType`) */
function engineGameType(kind: string, id: string, prefix: string, known: object): string {
  return engineId(kind, prefix + id, prefix, known) === id ? prefix + id : gameTypeOf(kind, id, prefix);
}
