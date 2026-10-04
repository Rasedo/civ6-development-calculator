/**
 * THE GAME'S TYPE NAMES FOR THE ENGINE'S IDS, read off the catalogs' own
 * provenance: every row carries `src` tags pointing at the install rows it was
 * read from (`xml('Civics', 'CivicType=CIVIC_DRAMA_POETRY', ...)` on
 * `DRAMA_AND_POETRY`), so the row's own table's key names the game type the
 * engine id stands for. A game type several rows cite goes to the row that
 * cites it most. A row with no such tag is reached by its id with the game's
 * prefix (`BUILDING_` + id), which is how most ids are spelled.
 */
import type { Src } from '../data/provenance';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { GOVERNMENTS, POLICIES } from '../data/policies';
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, WORSHIP_BELIEFS } from '../data/religion';
import { GOVERNORS, GOVERNOR_PROMOTIONS } from '../data/governors';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { CONGRESS_RESOLUTIONS } from '../data/seats';
import { PROJECTS } from '../data/projects';

type Rows = Readonly<Record<string, { src?: Readonly<Record<string, Src>> }>>;

function walk(src: unknown, out: { xml: string; where: string; derived: boolean }[], derived = false): void {
  if (!src || typeof src !== 'object') return;
  const s = src as { xml?: string; where?: string; inputs?: unknown[] };
  if (typeof s.xml === 'string' && typeof s.where === 'string') out.push({ xml: s.xml, where: s.where, derived });
  if (Array.isArray(s.inputs)) for (const x of s.inputs) walk(x, out, true);
}

function aliasesOf(rows: Rows[], table: string, key: string): Map<string, string> {
  const best = new Map<string, { id: string; votes: number }>();
  const prefix = `${key}=`;
  for (const catalog of rows) {
    for (const [id, row] of Object.entries(catalog)) {
      const found: { xml: string; where: string; derived: boolean }[] = [];
      for (const s of Object.values(row.src ?? {})) walk(s, found);
      // a row that reads its own table directly names its type there; a
      // derived input on the same table is then a read of ANOTHER row (Triangular
      // Trade's obsolete civic is Ecommerce's PrereqCivic) and casts no vote
      const direct = found.some((f) => f.xml === table && !f.derived);
      const votes = new Map<string, number>();
      for (const f of found) {
        if (f.xml !== table || (direct && f.derived)) continue;
        const part = f.where.split('&').find((w) => w.startsWith(prefix));
        if (!part) continue;
        const type = part.slice(prefix.length);
        votes.set(type, (votes.get(type) ?? 0) + 1);
      }
      for (const [type, n] of votes) {
        const cur = best.get(type);
        if (!cur || n > cur.votes) best.set(type, { id, votes: n });
      }
    }
  }
  return new Map([...best].map(([type, v]) => [type, v.id]));
}

const byId = (rows: readonly { id: string; src?: Readonly<Record<string, Src>> }[]): Rows =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

let cache: Record<string, Map<string, string>> | null = null;

/** game type -> engine id, per kind */
export function aliases(): Record<string, Map<string, string>> {
  cache ??= {
    building: aliasesOf([BUILDINGS as Rows], 'Buildings', 'BuildingType'),
    wonder: aliasesOf([BUILT_WONDERS as Rows], 'Buildings', 'BuildingType'),
    tech: aliasesOf([TECHS as Rows], 'Technologies', 'TechnologyType'),
    civic: aliasesOf([CIVICS as Rows], 'Civics', 'CivicType'),
    unit: aliasesOf([UNITS as Rows], 'Units', 'UnitType'),
    district: aliasesOf([DISTRICTS as unknown as Rows], 'Districts', 'DistrictType'),
    improvement: aliasesOf([IMPROVEMENTS as unknown as Rows], 'Improvements', 'ImprovementType'),
    policy: aliasesOf([POLICIES as Rows], 'Policies', 'PolicyType'),
    government: aliasesOf([GOVERNMENTS as Rows], 'Governments', 'GovernmentType'),
    belief: aliasesOf([PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, WORSHIP_BELIEFS, ENHANCER_BELIEFS] as Rows[],
      'Beliefs', 'BeliefType'),
    governor: aliasesOf([byId(GOVERNORS)], 'Governors', 'GovernorType'),
    promotion: aliasesOf([byId(GOVERNOR_PROMOTIONS)], 'GovernorPromotions', 'GovernorPromotionType'),
    person: aliasesOf([byId(Object.values(GREAT_PEOPLE).flat())], 'GreatPersonIndividuals', 'GreatPersonIndividualType'),
    resolution: aliasesOf([byId(CONGRESS_RESOLUTIONS)], 'Resolutions', 'ResolutionType'),
    project: aliasesOf([PROJECTS as Rows], 'Projects', 'ProjectType'),
  };
  return cache;
}

/** The game's row hash of a type name (`DB.MakeHash`): the string's CRC-32
 *  without the final inversion, as a signed 32-bit integer. */
export function gameHash(s: string): number {
  let c = 0xffffffff;
  for (const b of Buffer.from(s, 'utf8')) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return c | 0;
}

/** The engine id for a game type of one kind: the catalog's own tag, or the
 *  type less its prefix when that is an id of `known`; null for neither. */
export function engineId(kind: string, gameType: string, prefix: string, known: object): string | null {
  const tagged = aliases()[kind]?.get(gameType);
  if (tagged !== undefined && tagged in known) return tagged;
  const bare = gameType.startsWith(prefix) ? gameType.slice(prefix.length) : gameType;
  return bare in known ? bare : null;
}
