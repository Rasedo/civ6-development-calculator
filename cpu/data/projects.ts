/**
 * District projects (base Civ 6 set). Repeatable production sinks: on
 * completion they grant a lump of their yield plus great-person points of the
 * matching class. Cost scales with research progress like districts (locked in
 * when queued).
 *
 * SOURCING SWEEP. The district -> yield -> GP-class mapping was
 * checked against the Civilopedia project entries and is CORRECT as written for
 * Campus Research Grants (science / Great Scientist), Holy Site Prayers (faith /
 * Great Prophet), Commercial Hub Investment (gold / Great Merchant), Harbor
 * Shipping (gold / Great Admiral) and Encampment Training (no yield / Great
 * General).
 *
 * ONE SOURCED DEVIATION, recorded not fixed: the THEATER SQUARE FESTIVAL grants
 * Great WRITER, Great ARTIST **and** Great MUSICIAN points in real Civ 6 (each
 * ~11% of the production invested, Standard speed), converting 15% of the
 * city's production to Culture. This model awards the ARTIST class alone,
 * because `gpClass` is a single field. Fixing it means widening ProjectDef to a
 * class LIST and mirroring the multi-class award on the GPU — a behavioural
 * change to GP earn timing that needs its own gated round. The rate and the
 * class list are recorded here so that round does not have to re-derive them.
 */

import type { DistrictId, GreatPersonClass, YieldKey } from '../core/types';

export interface ProjectDef {
  id: string;
  name: string;
  district: DistrictId;
  yield: YieldKey | null;
  /** Great-person class receiving points on completion. Kept as the PRIMARY
   *  class (and the GPU export's single `g` column) for index stability; read
   *  `gpClassesOf(p)` for the full list. */
  gpClass: GreatPersonClass | null;
  /** the FULL class list. Real Civ 6 pays the Theater Square Festival's
   *  points to Great Writer, Great Artist AND Great Musician; every other
   *  district project pays a single class. Omitted = [gpClass]. */
  gpClasses?: GreatPersonClass[];
  gppFraction?: number;
  description: string;
  /** Gating tech that must be researched before this project is available. */
  requiresTech?: string;
  /** Previous space-race project that must be completed first (the chain). */
  requiresProject?: string;
  victory?: boolean;
  /** Marks a space-race project: filtered out of the GPU projects table (the
   *  GPU space-race SIMULATION is deferred), and placed
   *  AFTER the base projects so the seat greedy `.find` never selects it. */
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
      gpClasses: ['WRITER', 'ARTIST', 'MUSICIAN'],
      gppFraction: 0.11,
      description: 'Convert production into culture and Great Writer/Artist/Musician points.',
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

    // THE SPACE RACE, four steps, each needing the previous one COMPLETE.
    // SOURCED against the Gathering Storm Civilopedia entries (this repo models
    // GS — see cpu/data/boosts.ts): Launch Earth Satellite needs Rocketry;
    // Launch Moon Landing needs Satellites; Launch Mars Colony needs
    // Nanotechnology; Exoplanet Expedition needs Smart Materials, and winning
    // is its arrival. GS REPLACES the base game's three separate Mars
    // components (Reactor/Habitation/Hydroponics, which were parallel off the
    // Moon Landing, not a chain) with the single Mars Colony project.
    //
    // ONE DELIBERATE DEVIATION: real Civ 6 runs every one of these in a
    // SPACEPORT. This repo has no Spaceport district, so they run in a Campus.
    // That makes them cheaper and removes a district decision from the path.
    P({ id: 'LAUNCH_EARTH_SATELLITE', name: 'Launch Earth Satellite', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'ROCKETRY', description: 'Space race step 1 of 4.' }),
    P({ id: 'LAUNCH_MOON_LANDING', name: 'Launch Moon Landing', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'SATELLITES', requiresProject: 'LAUNCH_EARTH_SATELLITE', description: 'Space race step 2 of 4.' }),
    P({ id: 'LAUNCH_MARS_COLONY', name: 'Launch Mars Colony', district: 'CAMPUS', yield: null, gpClass: null, space: true, requiresTech: 'NANOTECHNOLOGY', requiresProject: 'LAUNCH_MOON_LANDING', description: 'Space race step 3 of 4 — a human base on Mars.' }),
    P({ id: 'EXOPLANET_EXPEDITION', name: 'Exoplanet Expedition', district: 'CAMPUS', yield: null, gpClass: null, space: true, victory: true, requiresTech: 'SMART_MATERIALS', requiresProject: 'LAUNCH_MARS_COLONY', description: 'Space race step 4 of 4 — completing it wins the Science Victory.' }),
  ].map((p) => [p.id, p]),
);

export const SPACE_PROJECTS: ProjectDef[] = Object.values(PROJECTS).filter((p) => p.space);

/** Yield granted on completion = production cost × this.
 *  SOURCED: real Civ 6 converts **15%** of the city's production output to
 *  the district's yield while the project runs — confirmed identically for
 *  Campus Research Grants (Science), Holy Site Prayers (Faith) and the Theater
 *  Square Festival (Culture), so the rate is uniform and needs no per-project
 *  table. We grant the equivalent lump on completion; total production invested
 *  equals the cost, so the totals agree. Was 0.75, which was five times real. */
export const PROJECT_YIELD_FRACTION = 0.15;
export const PROJECT_GPP_FRACTION = 0.22;

export function gpClassesOf(p: ProjectDef): GreatPersonClass[] {
  if (p.gpClasses) return p.gpClasses;
  return p.gpClass ? [p.gpClass] : [];
}
export function gppFractionOf(p: ProjectDef): number {
  return p.gppFraction ?? PROJECT_GPP_FRACTION;
}
