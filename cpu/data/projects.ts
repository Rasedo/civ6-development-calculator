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
 * The THEATER SQUARE FESTIVAL pays all three of its real classes — Great
 * WRITER, ARTIST and MUSICIAN, each ~11% of the production invested (Standard
 * speed) — through `gpClasses`, which `gpClassesOf` reads and the exporter
 * writes as the `gs` column. `gpClass` stays the PRIMARY class so the index
 * order is stable. Every other project pays one class.
 */

import type { DistrictId, GreatPersonClass, YieldKey } from '../core/types';
import { GAME_SPEED } from './constants';

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
  /** Marks a space-race project: one-time, gated on `requiresTech` and
   *  `requiresProject`, and placed AFTER the base rows so a greedy
   *  lowest-index pick resolves to a base project first. */
  space?: boolean;
  /** Marks a laser-station project: repeatable, `requiresTech`-gated, each
   *  completion adds +1 light-year/turn to this seat's Exoplanet craft. */
  laser?: boolean;
  /** Marks the REPAIR project: it runs in the City Center, which every city
   *  always has, and its price is the perimeter HP missing when it is queued
   *  ("Walls gain HP equal to the Production invested into the project"). */
  repair?: boolean;
  /** FIXED production cost (real Civ 6 value; the table mapper applies the
   *  game-speed coefficient). Absent = the generic district-project price. */
  cost?: number;
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

    // REPAIR OUTER DEFENSES, the last of the BASE rows — the laser and space
    // rows stay behind it, in chain order. CIV6: it runs in the City Center,
    // the one district every city has and the only project row not keyed to a
    // specialty district; it "becomes available after building Walls", needs
    // damage and three quiet turns, and "fully restores the HP of the city's
    // (and Encampment's) Outer Defenses". Its price is the HP missing when it
    // is queued, because "Walls gain HP equal to the Production invested into
    // the project".
    P({
      id: 'REPAIR_DEFENSES',
      name: 'Repair Outer Defenses',
      district: 'CITY_CENTER',
      yield: null,
      gpClass: null,
      repair: true,
      description: 'Restores the Walls of this city and its Encampment.',
    }),

    // THE LASER STATIONS (before the space rows so those stay LAST, in chain
    // order). CIV6 (GS, Arioch + wiki): both unlock with Offworld Mission,
    // cost 600 production each, are REPEATABLE across cities, and each
    // completion speeds the Exoplanet craft by +1 light-year/turn. Deviations,
    // recorded in docs/AUDIT.md: the Terrestrial station's powered-city
    // condition (no power system here) and the Lagrange station's 30 Aluminum
    // (no strategic-resource stockpiles) are unmodelled, so the two rows are
    // effectively twins.
    P({ id: 'TERRESTRIAL_LASER_STATION', name: 'Terrestrial Laser Station', district: 'SPACEPORT', yield: null, gpClass: null, laser: true, cost: 600, requiresTech: 'OFFWORLD_MISSION', description: 'Repeatable: +1 light-year/turn for the Exoplanet craft.' }),
    P({ id: 'LAGRANGE_LASER_STATION', name: 'Lagrange Laser Station', district: 'SPACEPORT', yield: null, gpClass: null, laser: true, cost: 600, requiresTech: 'OFFWORLD_MISSION', description: 'Repeatable: +1 light-year/turn for the Exoplanet craft.' }),

    // THE SPACE RACE, four steps, each needing the previous one COMPLETE, all
    // run in a SPACEPORT. SOURCED against the Gathering Storm Civilopedia
    // entries (this repo models GS — see cpu/data/boosts.ts): Launch Earth
    // Satellite needs Rocketry and reveals the whole map; Launch Moon Landing
    // needs Satellites and pays a one-time Culture lump of 10x the seat's
    // science/turn; Launch Mars Colony needs Nanotechnology and has NO yield
    // effect (it exists to open the expedition); Exoplanet Expedition needs
    // Smart Materials and LAUNCHES a craft — the win fires when it ARRIVES
    // (see SPACE_FLIGHT_LY). GS REPLACES the base game's three separate Mars
    // components (Reactor/Habitation/Hydroponics, which were parallel off the
    // Moon Landing, not a chain) with the single Mars Colony project.
    //
    // COSTS (GS, Standard speed): 900 / 1500 / 1800 / 2100 — 900, 1500 and
    // 2100 quoted directly (wiki GS data module, Arioch); 1800 is the GS data
    // value consistent with that ladder, the one figure without a direct quote.
    P({ id: 'LAUNCH_EARTH_SATELLITE', name: 'Launch Earth Satellite', district: 'SPACEPORT', yield: null, gpClass: null, space: true, cost: 900, requiresTech: 'ROCKETRY', description: 'Space race step 1 of 4 — reveals the entire map.' }),
    P({ id: 'LAUNCH_MOON_LANDING', name: 'Launch Moon Landing', district: 'SPACEPORT', yield: null, gpClass: null, space: true, cost: 1500, requiresTech: 'SATELLITES', requiresProject: 'LAUNCH_EARTH_SATELLITE', description: 'Space race step 2 of 4 — one-time Culture of 10x science/turn.' }),
    P({ id: 'LAUNCH_MARS_COLONY', name: 'Launch Mars Colony', district: 'SPACEPORT', yield: null, gpClass: null, space: true, cost: 1800, requiresTech: 'NANOTECHNOLOGY', requiresProject: 'LAUNCH_MOON_LANDING', description: 'Space race step 3 of 4 — a human base on Mars.' }),
    P({ id: 'EXOPLANET_EXPEDITION', name: 'Exoplanet Expedition', district: 'SPACEPORT', yield: null, gpClass: null, space: true, victory: true, cost: 2100, requiresTech: 'SMART_MATERIALS', requiresProject: 'LAUNCH_MARS_COLONY', description: 'Space race step 4 of 4 — launches the craft; winning is its arrival.' }),
  ].map((p) => [p.id, p.cost !== undefined ? { ...p, cost: Math.round(p.cost * GAME_SPEED) } : p]),
);

/** CIV6 (GS): the Exoplanet craft's journey — 50 light-years on Standard
 *  speed at a base 1 LY/turn, +1 LY/turn per completed laser station; the
 *  distance takes the game-speed coefficient like every other magnitude. */
export const SPACE_FLIGHT_LY = Math.round(50 * GAME_SPEED);

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

/** The projects in WIRE order — what the Public Works Program target names. */
export const PROJECT_LIST: readonly ProjectDef[] = Object.values(PROJECTS);
