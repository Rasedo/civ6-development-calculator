/**
 * THE AI'S PLOT VALUES (GameCore_XP2 AI/Value_Manager.cpp; `tools/civ6lab/
 * dll_readings.md` "C-96: the improvement value"): what an improvement is
 * worth on a plot (0x7a58f0) — the yields it pays from the turn its
 * technology lands to the horizon (0x7b1320), less the Builder's charge,
 * with the feature it clears (0x7a3010), the resource it harvests instead
 * (0x7a37d0) or works, and the improvement it replaces. The city's plot
 * analysis writes one per plot and improvement (AI_CityBuild.csv's
 * IMPROVEMENTS rows), the improvement pick and the trees read them.
 */
import { AI_FEATURES, AI_IMPROVEMENTS, AI_RESOURCES } from '../data/aiBuildTables';
import type { AiImprovementRow } from './aiResource';
import { AI_YIELD_DEFAULT } from '../data/aiTables';
import { AI_RATE, FX, FX_MIN, discounted, fmul, fxConst, presentValue, pseudoYieldValue, yieldValue, type AiValueView } from './aiValue';

/** the unit 0x7a3010 and 0x7a37d0 price a charge of (the type by its hash
 *  0x11d57532) */
const BUILDER = 'UNIT_BUILDER';
/** the charges a build unit carries before the player's extra ones
 *  (0x7a58f0, 0x7a3010, 0x7a37d0: +0x7b0[u] + 3) */
const BASE_CHARGES = 3;

/** What the plot values read of a plot and its player */
export interface PlotValueFacts {
  view: AiValueView;
  seat: number;
  /** the plot's improvement and whether it is pillaged */
  improvement: string | null;
  pillaged: boolean;
  /** the resource the player sees on the plot (0x4ab4b0), the feature */
  resource: string | null;
  feature: string | null;
  /** the turns the AI expects before the plot's river floods it (the XP2
   *  river manager 0xa2af70 over the rivers whose floodplains hold it) and
   *  before a volcano beside it erupts (the feature manager's +0x98), raw,
   *  null none */
  floodTurns: number | null;
  eruptionTurns: number | null;
  /** the plot's Appeal (the plot's +0x28) */
  appeal: number;
  /** a plot beside the plot holds a district whose Housing is above 0 (the
   *  feature removal's appeal term, 0x79e140) */
  besideHousingDistrict: boolean;
  /** the player's current cost of a unit (player units +0x3c0, 0x4f2b20) */
  unitCost(unit: string): number;
  /** the unit is the player's own version (player units +0x1c0[u] == u) or
   *  one it may build (0x4f2c90) */
  buildsUnit(unit: string): boolean;
  /** the player's charges a unit carries beyond its three (+0x7b0[u]) */
  extraCharges(unit: string): number;
  /** the game's progress the removal's escalation (0x5267a0 type 1) reads:
   *  the larger of the civics' and the techs' percent held (0x399810,
   *  0x4c9cf0; `gameProgressPct`) */
  progressPct: number;
  /** the game's cost escalation (GlobalParameters +0x37c) and the game
   *  speed's scaling of a lump (0x5254d0) */
  escalation: number;
  speedScaled(n: number): number;
  /** an improvement's adjacency yield of a YieldType at the plot (0x365ae0) */
  adjacency(improvement: string, yieldType: string): number;
  /** `housing` more in the plot's city from `t` to `h` (0x7a3d70), raw */
  housingValue(housing: number, t: number, h: number): number;
  /** the resource value (0x7a21e0) of `count` copies from `t` to `h`, raw */
  resourceValue(resource: string, count: number, t: number, h: number): number;
}

const IMPROVEMENT = new Map(AI_IMPROVEMENTS.map((r) => [r.type, r] as const));
const FEATURE = new Map(AI_FEATURES.map((r) => [r.type, r] as const));
const RESOURCE = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));

/** a yield at its Yields.DefaultValue, raw */
const atDefault = (amount: number, yieldType: string): number => fmul(amount * FX, fxConst(AI_YIELD_DEFAULT[yieldType] ?? 1));

/** PV(h) - PV(t) of `a` a turn */
const between = (a: number, t: number, h: number): number => presentValue(a, AI_RATE, h) - presentValue(a, AI_RATE, t);

/** 0x7a2e20: the improvement's build unit the player builds, the cheapest
 *  (a unit spending no charge costs nothing), null none */
export function buildUnit(f: PlotValueFacts, imp: AiImprovementRow): string | null {
  let best: string | null = null;
  let cost = 0;
  for (const [unit, consumes] of imp.buildUnits) {
    if (!f.buildsUnit(unit)) continue;
    const c = consumes ? f.unitCost(unit) : 0;
    if (best === null || c < cost) {
      best = unit;
      cost = c;
    }
  }
  return best;
}

/** a charge of the unit, at the Production's DefaultValue, discounted `t`
 *  turns */
function chargeCost(f: PlotValueFacts, unit: string, t: number): number {
  const charges = Math.max(f.extraCharges(unit) + BASE_CHARGES, 1);
  const per = Math.trunc(f.unitCost(unit) / charges) * FX;
  return discounted(yieldValue(null, null, per, 'YIELD_PRODUCTION'), AI_RATE, t);
}

/** 0x7a3010: clearing the feature — its removal yields escalated by the
 *  player's progress at the game's speed, discounted `t` turns, less a
 *  Builder's charge and the yields the feature pays (its Appeal x 0.5 Food
 *  more beside a district with Housing) from `t` to `h`; 0 for a feature
 *  that stays */
export function featureRemovalValue(f: PlotValueFacts, feature: string, t: number, h: number): number {
  const row = FEATURE.get(feature);
  if (!row || !row.removable) return 0;
  let lost = 0;
  for (const [y, a] of row.yields) lost += atDefault(a, y);
  if (row.appeal !== 0 && f.besideHousingDistrict) {
    lost += fmul(fxConst(row.appeal * 0.5), fxConst(AI_YIELD_DEFAULT.YIELD_FOOD ?? 1));
  }
  let gain = 0;
  for (const [y, a] of row.removes) {
    const esc = a + Math.trunc((Math.trunc((a * f.escalation) / 100) - a) * f.progressPct / 100);
    gain += discounted(atDefault(f.speedScaled(esc), y), AI_RATE, t);
  }
  return gain - chargeCost(f, BUILDER, t) - between(lost, t, h);
}

/** 0x7a37d0: harvesting the resource — its harvest yields discounted `t`
 *  turns, less a Builder's charge and the yields the resource pays from `t`
 *  to `h`; 0 for a resource with no harvest */
export function harvestValue(f: PlotValueFacts, resource: string, t: number, h: number): number {
  const row = RESOURCE.get(resource);
  if (!row || row.harvests.length === 0) return 0;
  let gain = 0;
  for (const [y, a] of row.harvests) gain += discounted(atDefault(a, y), AI_RATE, t);
  let lost = 0;
  for (const [y, a] of row.yields) lost += atDefault(a, y);
  return gain - chargeCost(f, BUILDER, t) - between(lost, t, h);
}

/** 0x7b1320: the improvement's yields on the plot from `t` to `h` — a turn's
 *  PSEUDOYIELD_IMPROVEMENT, its Improvement_YieldChanges, its adjacency
 *  (0x365ae0 per row, the rows summed: each adjacency yield's whole
 *  adjacency once) and its
 *  YieldFromAppeal at the plot's Appeal, each at the player's value; its Housing over its TilesRequired at the city's housing
 *  value; a flood or an eruption the AI expects before the horizon ends it
 *  there */
export function improvementYieldsValue(f: PlotValueFacts, imp: AiImprovementRow, t: number, h: number): number {
  if (t >= h) return FX_MIN;
  // a flood or an eruption the AI expects sooner ends the horizon there
  for (const hazard of [f.floodTurns, f.eruptionTurns]) {
    if (hazard === null || hazard >= h * FX) continue;
    h = hazard >> 8;
    if (h <= t) return 0;
  }
  let v = pseudoYieldValue(f.view, f.seat, FX, 'PSEUDOYIELD_IMPROVEMENT');
  for (const [y, a] of imp.yields) v += yieldValue(f.view, f.seat, a * FX, y);
  for (const y of new Set(imp.adjacency)) v += yieldValue(f.view, f.seat, f.adjacency(imp.type, y) * FX, y);
  if (imp.appealYield) v += yieldValue(f.view, f.seat, fmul(f.appeal * FX, fxConst(imp.appealPct * 0.01)), imp.appealYield);
  // the defence: min(max(n, 1), DefenseModifier) + min(n, GrantFortification),
  // n a count over the game's players (0x3dfae0, partly read) — LAB: n 0
  // (runs/h1_duelv1124 Granada's Alcazar, DefenseModifier 4: every row one
  // 1.0 a turn, 20.11 at T 0, above the value without it)
  const n = 0;
  v += (Math.min(Math.max(n, 1), imp.defenseModifier) + Math.min(n, imp.grantFortification)) * FX;
  if (imp.buildUnits.some(([, consumes]) => !consumes)) v *= 3;
  let value = between(v, t, h);
  if (imp.housing > 0) {
    const hv = f.housingValue(imp.housing, t, h);
    value += Math.trunc((hv * FX) / (Math.max(imp.tilesRequired, 1) * FX));
    // the Housing again at its whole value — LAB: its source in 0x7a58f0 /
    // 0x7b1320 unread (runs/h1_duelv1117 Caguana's Farms: the log's each the
    // value without it plus the housing value's whole part, 18.00 at t6,
    // 88.00 at t45)
    value += Math.trunc(hv / FX) * FX;
  }
  return value;
}

/** 0x7a58f0: the improvement on the plot landing in `t` turns, to the
 *  horizon `h` */
export function improvementValue(f: PlotValueFacts, improvement: string, t: number, h: number): number {
  if (t >= h) return FX_MIN;
  const imp = IMPROVEMENT.get(improvement);
  if (!imp) return FX_MIN;
  const unit = buildUnit(f, imp);
  if (unit === null) return FX_MIN;
  // the plot's own improvement: none to add, or its repair
  if (f.improvement === improvement) {
    if (!f.pillaged) return 0;
    return (f.resource ? f.resourceValue(f.resource, 1, t, h) : 0) + improvementYieldsValue(f, imp, t, h);
  }
  let value = 0;
  if (f.improvement && !f.pillaged) {
    const old = IMPROVEMENT.get(f.improvement);
    value -= (f.resource ? f.resourceValue(f.resource, -1, t, h) : 0) + (old ? improvementYieldsValue(f, old, t, h) : 0);
  }
  let resource = f.resource;
  let clears = true;
  if (resource) {
    if (imp.resources.includes(resource)) {
      clears = !imp.keepsFeature.includes(resource);
    } else {
      if ((RESOURCE.get(resource)?.harvests.length ?? 0) === 0) return 0;
      value += harvestValue(f, resource, t, h);
      resource = null;
    }
  }
  if (f.feature && clears && !imp.features.includes(f.feature)) {
    if (!FEATURE.get(f.feature)?.removable) return 0;
    value += featureRemovalValue(f, f.feature, t, h);
  }
  value -= chargeCost(f, unit, t);
  value += improvementYieldsValue(f, imp, t, h);
  if (resource) value += f.resourceValue(resource, 1, t, h);
  return value;
}
