/**
 * District projects (base Civ 6 set, eyeballed numbers). Repeatable
 * production sinks: on completion they grant a lump of their yield plus
 * great-person points of the matching class. Cost scales with research
 * progress like districts (locked in when queued).
 */

import type { DistrictId, GreatPersonClass, YieldKey } from '../core/types';

export interface ProjectDef {
  id: string;
  name: string;
  /** Requires a completed district of this type in the city. */
  district: DistrictId;
  /** Yield granted on completion (fraction of production cost). */
  yield: YieldKey | null;
  /** Great-person class receiving points on completion. */
  gpClass: GreatPersonClass | null;
  description: string;
}

const P = (def: ProjectDef) => def;

export const PROJECTS: Record<string, ProjectDef> = Object.fromEntries(
  [
    P({
      id: 'RESEARCH_GRANTS',
      name: 'Campus Research Grants',
      district: 'CAMPUS',
      yield: 'science',
      gpClass: 'SCIENTIST',
      description: 'Convert production into science and Great Scientist points.',
    }),
    P({
      id: 'FESTIVAL',
      name: 'Theater Square Festival',
      district: 'THEATER_SQUARE',
      yield: 'culture',
      gpClass: 'ARTIST',
      description: 'Convert production into culture and Great Artist points.',
    }),
    P({
      id: 'PRAYERS',
      name: 'Holy Site Prayers',
      district: 'HOLY_SITE',
      yield: 'faith',
      gpClass: 'PROPHET',
      description: 'Convert production into faith and Great Prophet points.',
    }),
    P({
      id: 'INVESTMENT',
      name: 'Commercial Hub Investment',
      district: 'COMMERCIAL_HUB',
      yield: 'gold',
      gpClass: 'MERCHANT',
      description: 'Convert production into gold and Great Merchant points.',
    }),
    P({
      id: 'SHIPPING',
      name: 'Harbor Shipping',
      district: 'HARBOR',
      yield: 'gold',
      gpClass: 'ADMIRAL',
      description: 'Convert production into gold and Great Admiral points.',
    }),
    P({
      id: 'TRAINING',
      name: 'Encampment Training',
      district: 'ENCAMPMENT',
      yield: null,
      gpClass: 'GENERAL',
      description: 'Convert production into Great General points.',
    }),
  ].map((p) => [p.id, p]),
);

/** Yield granted on completion = production cost × this. */
export const PROJECT_YIELD_FRACTION = 0.75;
/** Great-person points granted on completion = production cost × this. */
export const PROJECT_GPP_FRACTION = 0.3;
