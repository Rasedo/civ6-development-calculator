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
import { CITY_STATE_SUZERAIN_BONUS, SUZ_EFFECTS } from '../data/cityStates';
import { CIV_LEVELS } from '../data/civLevels';
import { BOOSTS } from '../data/boosts';
import { CONGRESS_RESOLUTIONS, EMERGENCIES } from '../data/seats';
import { CLIMATE_PHASES } from '../data/climate';
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
  cityStateSuzerain: CITY_STATE_SUZERAIN_BONUS,
  suzEffects: SUZ_EFFECTS,
  civLevels: CIV_LEVELS,
  boosts: BOOSTS,
  congressResolutions: CONGRESS_RESOLUTIONS,
  emergencies: EMERGENCIES,
  climatePhases: CLIMATE_PHASES,
};

/** Columns that are not game CONSTANTS. `id`/`name`/`description` and the
 *  Name/Text/Note/Description/Label suffixes are prose or identity; `civ` and
 *  `leader` are the roster's own keys; and `kind`, `mask` and `code` are ENGINE
 *  VOCABULARY — a discriminant this engine chose to sort its own rows by
 *  (`kind: 'district' | 'building'`), a bitmask layout, a scaffold index — with
 *  no cell in the install to read them from. */
const SKIP_COL = /^(id|name|description|src|civ|leader|kind|mask|code)$|(Name|Text|Note|Description|Label)$/;

export interface ProvenanceEntry {
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
