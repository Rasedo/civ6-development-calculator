/**
 * PROVENANCE.JSON — every catalog constant with its source tag (or none),
 * written beside rules.json by `npm run export` and read by
 * tools/civ6lab/xml_check.py.
 *
 * Two kinds of entry:
 *   * a ROW COLUMN — `<catalog>.<rowId>.<column>` for every scalar leaf of a
 *     row-shaped catalog (nested objects flattened with dots, arrays by
 *     index), with `src` from the row's inline `src[column]` or null;
 *   * a NAMED SCALAR — what `srcConst` registered, by its registered name.
 *
 * Columns that are prose or identity are not constants and are skipped
 * (`id`, `name`, `description`, `src`, anything ending in Name/Text/Note/
 * Description). Everything else is a constant this engine believes about the
 * game and is reported, tagged or not — an untagged leaf is an UNSOURCED row
 * in the checker's coverage table, never silence.
 *
 * `ROW_CATALOGS` is the list; a catalog that is not listed is not covered.
 * Add a catalog here when its rows are tagged (or before, to see its count).
 */
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { PROJECTS } from '../data/projects';
import { PROMOTIONS } from '../data/promotions';
import { BUILT_WONDERS } from '../data/builtWonders';
import { POLICIES, GOVERNMENTS } from '../data/policies';
import { GOVERNORS, GOVERNOR_PROMOTIONS } from '../data/governors';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS } from '../data/religion';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { GW_HOLDERS } from '../data/greatWorks';
import { STORM_EVENTS, STORM_UNIT_ROWS } from '../data/disasters';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { SPY_MISSIONS, SPY_ESCAPE_ROUTES } from '../data/espionage';
import { PROMISES } from '../data/promises';
import { CITY_STATE_SUZERAIN_BONUS, SUZ_EFFECTS } from '../data/cityStates';
import { CIV_LEVELS } from '../data/civLevels';
import { BOOSTS } from '../data/boosts';
import { CONGRESS_RESOLUTIONS, EMERGENCIES } from '../data/seats';
import { CLIMATE_PHASES } from '../data/climate';
import { SCORING_LINE_ITEMS } from '../data/scoring';
import {
  HARDRADA_PILLAGE, PLOT_YIELD_ROWS, PROD_MULT_ROWS, DISTRICT_ADJ_ROWS, INTL_ROUTE_YIELD_ROWS,
  DOMESTIC_ROUTE_YIELD_ROWS, ROUTE_CAPACITY_ROWS, COMBAT_CS_ROWS, POST_KILL_HEAL_ROWS,
  CAPTURE_ROWS, WAR_BUFF_ROWS, EMBARK_MOVE_ROWS, IGNORE_SHORES_ROWS, CENTER_ADJ_ROWS,
  GREAT_WORK_YIELD_ROWS, GPP_CLASS_ROWS, POWERED_YIELD_ROWS, STOCKPILE_RATE_ROWS,
  STOCKPILE_CAP_ROWS, UNIT_CHARGE_ROWS, TILE_COST_ROWS, FARM_TERRAIN_ROWS,
  ROUTE_IMPROVEMENT_ROWS, GRANT_UNIT_ROWS, SPY_CAPACITY_ROWS, CAPITAL_ROWS, HAPPY_YIELD_ROWS,
  HAPPY_GPP_ROWS, POLICY_SLOT_ROWS, POST_COMBAT_YIELD_ROWS, WORK_IMPASSABLE_ROWS,
  ROUTE_TERRAIN_ROWS, GOVERNOR_YIELD_ROWS, GOVERNOR_LOYALTY_ROWS, GARRISON_LOYALTY_ROWS,
  FORMATION_ROWS, TERRAIN_ADJ_YIELD_ROWS, GOVERNOR_TITLE_YIELD_ROWS, GPP_BUILDING_ROWS,
  GP_FAVOR_ROWS, START_TECH_ROWS, SEAT_BAN_ROWS, WORSHIP_ROWS, OCEAN_ACCESS_ROWS,
  DISTRICT_UNIT_ROWS, EXTRA_UNIT_COPY_ROWS, CONQUEST_POP_ROWS, NOT_FOUNDED_ROWS,
  EXTRA_DISTRICT_ROWS, CITY_TILES_ROWS, BOOST_PCT_ROWS, BUILDING_PREREQ_ROWS,
  DISTRICT_PREREQ_ROWS, WAR_WEARINESS_ROWS, PEACEFUL_FOUNDER_ROWS, YIELD_PER_SUZERAIN_ROWS,
  GOVERNOR_TITLE_GRANT_ROWS, GP_REFUND_ROWS, EVICT_PCT_ROWS, RELIGION_AMENITY_ROWS,
  ALL_FOLLOWER_BELIEFS_ROWS, CAMP_GOODY_ROWS, FEATURE_APPEAL_ROWS, ALLIANCE_SHARED_VIS_ROWS,
  ROUTE_PRESSURE_ROWS, FOREIGN_FOLLOWER_YIELD_ROWS, GP_GUARANTEE_ROWS,
  FAITH_PURCHASE_DISTRICT_ROWS, START_BOOST_ROWS, POST_COMBAT_LOYALTY_ROWS,
  LEVY_ROWS, DOMESTIC_ROUTE_LOYALTY_ROWS, INCOMING_ROUTE_YIELD_ROWS, WONDER_ERA_PROD_ROWS,
  WONDER_TOURISM_ROWS, RIVER_CROSS_PROD_ROWS, IMMEDIATE_POST_ROWS, DIPLO_VIS_ROWS, WAR_BAN_ROWS,
  TOURISM_FAVOR_ROWS, EMERGENCY_FAVOR_ROWS, GOLDEN_DEDICATION_ROWS, INTL_ROUTE_TERRAIN_ROWS,
  GOLDEN_ROUTE_CAPACITY_ROWS, PROGRESS_TRADE_ROWS, UNIT_POP_COST_ROWS, SLOT_CONVERT_ROWS,
  SLOT_FAVOR_ROWS, PLAZA_DISTRICT_PROD_ROWS, GREAT_WORK_LOYALTY_ROWS, SKIP_FREE_CITY_ROWS,
  ENVOY_SAME_RELIGION_ROWS, MAJORITY_FOUNDER_ROWS,
  GOVERNOR_XP_ROWS, CONQUEST_FORMATION_ROWS, PARK_APPEAL_ROWS, TRADE_GAIN_TILE_ROWS,
  SPY_PROMO_ROWS, CULTURE_BOMB_ROWS, WONDER_CHARGE_ROWS, WONDER_ERA_BOOST_ROWS,
} from '../data/civilizations';
// scalar-only modules: imported for their `srcConst` registrations, which
// only exist once the module has loaded
import '../data/sight';
import '../data/goodyHuts';
import { SRC_REGISTRY, type Src } from '../data/provenance';

type Row = Record<string, unknown>;
type Rows = Readonly<Record<string, unknown>> | readonly unknown[];

/** catalog name -> its rows. A Record is keyed by id; an array's rows carry
 *  `id` (or are numbered). */
const ROW_CATALOGS: Readonly<Record<string, Rows>> = {
  units: UNITS,
  buildings: BUILDINGS,
  districts: DISTRICTS,
  scaffoldDistricts: SCAFFOLD_DISTRICTS,
  improvements: IMPROVEMENTS,
  techs: TECHS,
  civics: CIVICS,
  projects: PROJECTS,
  promotions: PROMOTIONS,
  builtWonders: BUILT_WONDERS,
  policies: POLICIES,
  governments: GOVERNMENTS,
  governors: GOVERNORS,
  governorPromotions: GOVERNOR_PROMOTIONS,
  pantheons: PANTHEONS,
  followerBeliefs: FOLLOWER_BELIEFS,
  founderBeliefs: FOUNDER_BELIEFS,
  enhancerBeliefs: ENHANCER_BELIEFS,
  greatPeople: Object.values(GREAT_PEOPLE).flat(),
  greatWorkHolders: GW_HOLDERS,
  storms: STORM_EVENTS,
  stormUnitRows: STORM_UNIT_ROWS,
  nuclearDevices: NUCLEAR_DEVICES,
  spyMissions: SPY_MISSIONS,
  spyEscapeRoutes: SPY_ESCAPE_ROUTES,
  promises: PROMISES,
  cityStateSuzerain: CITY_STATE_SUZERAIN_BONUS,
  suzEffects: SUZ_EFFECTS,
  civLevels: CIV_LEVELS,
  boosts: BOOSTS,
  congressResolutions: CONGRESS_RESOLUTIONS,
  emergencies: EMERGENCIES,
  climatePhases: CLIMATE_PHASES,
  scoring: SCORING_LINE_ITEMS,
  // THE ROSTER'S CIVILIZATION AND LEADER MODIFIER ROWS (cpu/data/civilizations.ts)
  hardradaPillage: HARDRADA_PILLAGE,
  plotYield: PLOT_YIELD_ROWS,
  prodMult: PROD_MULT_ROWS,
  districtAdj: DISTRICT_ADJ_ROWS,
  intlRouteYield: INTL_ROUTE_YIELD_ROWS,
  domesticRouteYield: DOMESTIC_ROUTE_YIELD_ROWS,
  routeCapacity: ROUTE_CAPACITY_ROWS,
  combatCs: COMBAT_CS_ROWS,
  postKillHeal: POST_KILL_HEAL_ROWS,
  capture: CAPTURE_ROWS,
  warBuff: WAR_BUFF_ROWS,
  embarkMove: EMBARK_MOVE_ROWS,
  ignoreShores: IGNORE_SHORES_ROWS,
  centerAdj: CENTER_ADJ_ROWS,
  greatWorkYield: GREAT_WORK_YIELD_ROWS,
  gppClass: GPP_CLASS_ROWS,
  poweredYield: POWERED_YIELD_ROWS,
  stockpileRate: STOCKPILE_RATE_ROWS,
  stockpileCap: STOCKPILE_CAP_ROWS,
  unitCharge: UNIT_CHARGE_ROWS,
  tileCost: TILE_COST_ROWS,
  farmTerrain: FARM_TERRAIN_ROWS,
  routeImprovement: ROUTE_IMPROVEMENT_ROWS,
  grantUnit: GRANT_UNIT_ROWS,
  spyCapacity: SPY_CAPACITY_ROWS,
  capital: CAPITAL_ROWS,
  happyYield: HAPPY_YIELD_ROWS,
  happyGpp: HAPPY_GPP_ROWS,
  policySlot: POLICY_SLOT_ROWS,
  postCombatYield: POST_COMBAT_YIELD_ROWS,
  workImpassable: WORK_IMPASSABLE_ROWS,
  routeTerrain: ROUTE_TERRAIN_ROWS,
  governorYield: GOVERNOR_YIELD_ROWS,
  governorLoyalty: GOVERNOR_LOYALTY_ROWS,
  garrisonLoyalty: GARRISON_LOYALTY_ROWS,
  formation: FORMATION_ROWS,
  terrainAdjYield: TERRAIN_ADJ_YIELD_ROWS,
  governorTitleYield: GOVERNOR_TITLE_YIELD_ROWS,
  gppBuilding: GPP_BUILDING_ROWS,
  gpFavor: GP_FAVOR_ROWS,
  startTech: START_TECH_ROWS,
  seatBan: SEAT_BAN_ROWS,
  worship: WORSHIP_ROWS,
  oceanAccess: OCEAN_ACCESS_ROWS,
  districtUnit: DISTRICT_UNIT_ROWS,
  extraUnitCopy: EXTRA_UNIT_COPY_ROWS,
  conquestPop: CONQUEST_POP_ROWS,
  notFounded: NOT_FOUNDED_ROWS,
  extraDistrict: EXTRA_DISTRICT_ROWS,
  cityTiles: CITY_TILES_ROWS,
  boostPct: BOOST_PCT_ROWS,
  buildingPrereq: BUILDING_PREREQ_ROWS,
  districtPrereq: DISTRICT_PREREQ_ROWS,
  warWeariness: WAR_WEARINESS_ROWS,
  peacefulFounder: PEACEFUL_FOUNDER_ROWS,
  yieldPerSuzerain: YIELD_PER_SUZERAIN_ROWS,
  governorTitleGrant: GOVERNOR_TITLE_GRANT_ROWS,
  gpRefund: GP_REFUND_ROWS,
  evictPct: EVICT_PCT_ROWS,
  religionAmenity: RELIGION_AMENITY_ROWS,
  allFollowerBeliefs: ALL_FOLLOWER_BELIEFS_ROWS,
  campGoody: CAMP_GOODY_ROWS,
  featureAppeal: FEATURE_APPEAL_ROWS,
  allianceSharedVis: ALLIANCE_SHARED_VIS_ROWS,
  routePressure: ROUTE_PRESSURE_ROWS,
  foreignFollowerYield: FOREIGN_FOLLOWER_YIELD_ROWS,
  gpGuarantee: GP_GUARANTEE_ROWS,
  faithPurchaseDistrict: FAITH_PURCHASE_DISTRICT_ROWS,
  startBoost: START_BOOST_ROWS,
  postCombatLoyalty: POST_COMBAT_LOYALTY_ROWS,
  levy: LEVY_ROWS,
  domesticRouteLoyalty: DOMESTIC_ROUTE_LOYALTY_ROWS,
  incomingRouteYield: INCOMING_ROUTE_YIELD_ROWS,
  wonderEraProd: WONDER_ERA_PROD_ROWS,
  wonderTourism: WONDER_TOURISM_ROWS,
  riverCrossProd: RIVER_CROSS_PROD_ROWS,
  immediatePost: IMMEDIATE_POST_ROWS,
  diploVis: DIPLO_VIS_ROWS,
  warBan: WAR_BAN_ROWS,
  tourismFavor: TOURISM_FAVOR_ROWS,
  emergencyFavor: EMERGENCY_FAVOR_ROWS,
  goldenDedication: GOLDEN_DEDICATION_ROWS,
  intlRouteTerrain: INTL_ROUTE_TERRAIN_ROWS,
  goldenRouteCapacity: GOLDEN_ROUTE_CAPACITY_ROWS,
  progressTrade: PROGRESS_TRADE_ROWS,
  unitPopCost: UNIT_POP_COST_ROWS,
  slotConvert: SLOT_CONVERT_ROWS,
  slotFavor: SLOT_FAVOR_ROWS,
  plazaDistrictProd: PLAZA_DISTRICT_PROD_ROWS,
  greatWorkLoyalty: GREAT_WORK_LOYALTY_ROWS,
  skipFreeCity: SKIP_FREE_CITY_ROWS,
  envoySameReligion: ENVOY_SAME_RELIGION_ROWS,
  majorityFounder: MAJORITY_FOUNDER_ROWS,
  governorXp: GOVERNOR_XP_ROWS,
  conquestFormation: CONQUEST_FORMATION_ROWS,
  parkAppeal: PARK_APPEAL_ROWS,
  tradeGainTile: TRADE_GAIN_TILE_ROWS,
  spyPromo: SPY_PROMO_ROWS,
  cultureBomb: CULTURE_BOMB_ROWS,
  wonderCharge: WONDER_CHARGE_ROWS,
  wonderEraBoost: WONDER_ERA_BOOST_ROWS,
};

/** Columns that are not game CONSTANTS. `id`/`name`/`description` and the
 *  Name/Text/Note/Description/Label suffixes are prose or identity; `civ` and
 *  `leader` are the roster's own keys; and `kind`, `mask` and `code` are ENGINE
 *  VOCABULARY — a discriminant this engine chose to sort its own rows by
 *  (`kind: 'district' | 'building'`), a bitmask layout, a scaffold index — with
 *  no cell in the install to read them from. */
const SKIP_COL = /^(id|name|description|src|civ|leader|kind|mask|code)$|(Name|Text|Note|Description|Label)$/;

interface ProvenanceEntry {
  catalog: string;
  name: string;
  value: unknown;
  src: Src | null;
}

function isScalar(v: unknown): v is number | string | boolean {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

/** flatten one row into dotted leaves */
function leaves(v: unknown, path: string, out: [string, unknown][]): void {
  // an EMPTY array is the absence of a clause, not a constant — a tech with no
  // `effects`, a promotion with no `requires`. It has nothing to read from the
  // install, so it is not an unsourced constant either.
  if (Array.isArray(v) && v.length === 0) return;
  if (isScalar(v)) {
    out.push([path, v]);
  } else if (Array.isArray(v)) {
    if (v.every(isScalar)) out.push([path, v]);
    else v.forEach((x, i) => leaves(x, `${path}.${i}`, out));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Row)) {
      if (SKIP_COL.test(k)) continue;
      leaves(x, path ? `${path}.${k}` : k, out);
    }
  }
}

function rowId(row: unknown, key: string): string {
  const r = row as Row;
  const id = r.id ?? r.civ ?? r.leader ?? r.type ?? r.kind;
  return typeof id === 'string' ? id : key;
}

export function buildProvenance(): { constants: ProvenanceEntry[]; coverage: Record<string, { tagged: number; total: number }> } {
  const constants: ProvenanceEntry[] = [];
  const coverage: Record<string, { tagged: number; total: number }> = {};
  for (const [catalog, rows] of Object.entries(ROW_CATALOGS)) {
    const cov = { tagged: 0, total: 0 };
    coverage[catalog] = cov;
    const entries: [string, unknown][] = Array.isArray(rows)
      ? rows.map((r, i) => [String(i), r] as [string, unknown])
      : Object.entries(rows as Record<string, unknown>);
    for (const [key, row] of entries) {
      if (!row || typeof row !== 'object') continue;
      const id = rowId(row, key);
      const srcMap = ((row as Row).src ?? {}) as Readonly<Record<string, Src>>;
      const out: [string, unknown][] = [];
      leaves(row, '', out);
      for (const [col, value] of out) {
        const src = srcMap[col] ?? null;
        constants.push({ catalog, name: `${catalog}.${id}.${col}`, value, src });
        cov.total++;
        if (src) cov.tagged++;
      }
    }
  }
  const cov = { tagged: 0, total: 0 };
  coverage.const = cov;
  for (const rec of SRC_REGISTRY) {
    constants.push({ catalog: 'const', name: rec.name, value: rec.value, src: rec.src });
    cov.total++;
    cov.tagged++;
  }
  return { constants, coverage };
}
