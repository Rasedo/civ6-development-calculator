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
  // --- B-25 space race (science victory) ------------------------------------
  /** Gating tech that must be researched before this project is available. */
  requiresTech?: string;
  /** Previous space-race project that must be completed first (the chain). */
  requiresProject?: string;
  /** Completing this project wins the science victory. */
  victory?: boolean;
  /** Marks a space-race project: filtered out of the GPU projects table (the
   *  GPU space-race SIMULATION is deferred — see ROUND_B2_LOG), and placed
   *  AFTER the base projects so the rival greedy `.find` never selects it. */
  space?: boolean;
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

    // ========================================================================
    // B-25 space race — the sequential science-victory chain. Gated on
    // Information/Future-era techs (structurally unreachable in the 100-turn
    // scripted parity gate — proven inert) and on each other (the sequence).
    // DEGRADE: no Spaceport district exists, so the science district (CAMPUS)
    // is the Spaceport proxy; these grant no yield/GPP (pure victory steps).
    // They sit LAST so the rival greedy `.find` (first-complete-district
    // project) always resolves to a base project — rivals never run the race
    // under the scripted policy. Completing EXOPLANET_EXPEDITION wins.
    // ========================================================================
    P({ id: 'LAUNCH_EARTH_SATELLITE', name: 'Launch Earth Satellite', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'ROCKETRY', description: 'Space race step 1 of 6. (Spaceport degraded to Campus.)' }),
    P({ id: 'LAUNCH_MOON_LANDING', name: 'Launch Moon Landing', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'SATELLITES', requiresProject: 'LAUNCH_EARTH_SATELLITE', description: 'Space race step 2 of 6.' }),
    P({ id: 'MARS_REACTOR', name: 'Launch Mars Reactor', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'NANOTECHNOLOGY', requiresProject: 'LAUNCH_MOON_LANDING', description: 'Space race step 3 of 6 (Mars component).' }),
    P({ id: 'MARS_HABITATION', name: 'Launch Mars Habitation', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'NUCLEAR_FUSION', requiresProject: 'MARS_REACTOR', description: 'Space race step 4 of 6 (Mars component).' }),
    P({ id: 'MARS_HYDROPONICS', name: 'Launch Mars Hydroponics', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'ROBOTICS', requiresProject: 'MARS_HABITATION', description: 'Space race step 5 of 6 (Mars component).' }),
    P({ id: 'EXOPLANET_EXPEDITION', name: 'Exoplanet Expedition', district: 'CAMPUS', yield: null, gpClass: null, space: true, victory: true, requiresTech: 'OFFWORLD_MISSION', requiresProject: 'MARS_HYDROPONICS', description: 'Space race step 6 of 6 — completing it wins the Science Victory.' }),
  ].map((p) => [p.id, p]),
);

/** Space-race projects in chain order (B-25). */
export const SPACE_PROJECTS: ProjectDef[] = Object.values(PROJECTS).filter((p) => p.space);

/** Yield granted on completion = production cost × this. */
export const PROJECT_YIELD_FRACTION = 0.75;
/** Great-person points granted on completion = production cost × this. */
export const PROJECT_GPP_FRACTION = 0.3;
