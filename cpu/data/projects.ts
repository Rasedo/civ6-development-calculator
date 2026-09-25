/**
 * District projects (base Civ 6 set). Repeatable production sinks: on
 * completion they grant a lump of their yield plus great-person points of the
 * matching class. Cost scales with research progress like districts (locked in
 * when queued).
 *
 * The district -> yield -> GP-class mapping is the install's
 * `Project_YieldConversions` and `Project_GreatPersonPoints`: Campus Research
 * Grants (science / Great Scientist), Holy Site Prayers (faith / Great
 * Prophet), Commercial Hub Investment (gold / Great Merchant), Harbor Shipping
 * (gold / Great Admiral), Encampment Training (gold / Great General) and
 * Industrial Zone Logistics (no yield — Gathering Storm deletes its row — /
 * Great Engineer).
 *
 * The THEATER SQUARE FESTIVAL pays all three of its real classes — Great
 * WRITER, ARTIST and MUSICIAN, each ~11% of the production invested (Standard
 * speed) — through `gpClasses`, which `gpClassesOf` reads and the exporter
 * writes as the `gs` column. `gpClass` stays the PRIMARY class so the index
 * order is stable. Every other project pays one class.
 */

import type { DistrictId, GreatPersonClass, YieldKey } from '../core/types';
import type { CivId, LeaderId } from '../../world/roster';
import { GAME_SPEED, scaleByGameSpeed } from './constants';
import { srcConst, xml, type SrcMap } from './provenance';

export interface ProjectDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). Stripped by the
   *  exporter; checked by tools/civ6lab/xml_check.py. */
  src?: SrcMap;
  name: string;
  district: DistrictId;
  yield: YieldKey | null;
  /** CIV6 (Project_YieldConversions.PercentOfProductionRate): the share of
   *  the Production invested that the project converts into `yield`, paid as
   *  one lump on completion (the Production invested equals the cost, so the
   *  totals agree). Present exactly where `yield` is. */
  yieldPct?: number;
  /** CIV6 (Projects_XP2.FullyPoweredWhileActive): the city counts as fully
   *  powered, with no fuel burned, while this project heads its queue. */
  fullyPowered?: boolean;
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
  /** ONE-TIME: the seat may complete it once, and `Seat.projectsDone`
   *  remembers that it did. Gated on `requiresTech` and `requiresProject`,
   *  and placed AFTER the base rows so a greedy lowest-index pick resolves to
   *  a base project first. */
  once?: boolean;
  /** Builds a NUCLEAR_DEVICES row into the seat's inventory: 1-based, so 0
   *  and absent both mean "not a weapon". Repeatable, and its Uranium is the
   *  generic `resource` charge. */
  wmd?: number;
  /** The ORBITAL laser: its bonus is unconditional, where the terrestrial
   *  one draws Power in the city that built it. */
  orbital?: boolean;
  /** A strategic resource this project charges once, when it is started. */
  resource?: string;
  resourceCost?: number;
  /** CIV6 (Recommission Nuclear Reactor): resets the city's reactor age to 0.
   *  Repeatable, and its cost "does not scale with further research". */
  recommission?: boolean;
  /** CIV6 (Expansion2_Projects.xml, Project_BuildingCosts): the project
   *  CONSUMES this building — the three DECOMMISSION rows remove the plant
   *  they name and all its effects. Offered only while the effect that
   *  unlocks them stands (`UnlocksFromEffect`), which is the Climate Accords
   *  competition. */
  consumesBuilding?: string;
  /** Marks a laser-station project: repeatable, `requiresTech`-gated, each
   *  completion adds +1 light-year/turn to this seat's Exoplanet craft. */
  laser?: boolean;
  /** Marks the REPAIR project: it runs in the City Center, which every city
   *  always has, and its price is the perimeter HP missing when it is queued
   *  ("Walls gain HP equal to the Production invested into the project"). */
  repair?: boolean;
  /** the install's `Projects.Cost` at Standard speed; the table mapper
   *  applies `scaleByGameSpeed`. Absent on the repair alone, whose price is
   *  the perimeter HP it restores. */
  cost?: number;
  /** Gating CIVIC — the research half a tech cannot express. */
  requiresCivic?: string;
  /** CIV6 (Expansion2_Projects.xml, `UnlocksFromEffect`): offered only while
   *  the NAMED scored competition is running — the effect that unlocks the
   *  three decommission rows for the Climate Accords, the athletes for the
   *  World Games and the astronauts for the Space Station. The value is the
   *  competition's catalog id. */
  competitionOnly?: string;
  /** CIV6 (Carbon Recapture): "awards 30 Diplomatic Favor and reduces the
   *  civilization's lifetime carbon emissions by 50 CO2 points", and "allows
   *  the lifetime carbon emissions of a civilization to go below 0". */
  carbonRecapture?: boolean;
  /** A civilization-UNIQUE project: offered only to a seat playing `civ`
   *  (or `leader`), the `rowIsFor` reading every roster row takes. CIV6
   *  (PROJECT_COTHON_CAPITAL_MOVE): "Phoenician unique project available to
   *  any city with a Cothon." */
  civ?: CivId;
  leader?: LeaderId;
  /** CIV6 (Founder of Carthage, EFFECT_ADJUST_PLAYER_CAPITAL): "When complete,
   *  the Phoenician Capital moves to this city" — the ORIGINAL capital,
   *  `moveCapital`. */
  movesCapital?: boolean;
  /** CIV6 (the install cost model COST_PROGRESSION_GAME_PROGRESS, Param1): this
   *  project's price climbs with the game's own progress — `cost + param x
   *  progress`, the param at Standard speed and scaled where it is read. The
   *  engine's one notion of that progress is `districtCostIn`'s max(tech,
   *  civic) share. Every district project carries one (Cost 25, Param1 1500). */
  costProgressGame?: number;
}

const P = (def: ProjectDef) => def;

export const PROJECTS: Record<string, ProjectDef> = Object.fromEntries(
  [
    P({
      id: 'RESEARCH_GRANTS',
      name: 'Campus Research Grants',
      district: 'CAMPUS',
      yield: 'science',
      yieldPct: 15,
      gpClass: 'SCIENTIST',
      description: 'Convert production into science and Great Scientist points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'PrereqDistrict', { expect: 'DISTRICT_CAMPUS' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_SCIENTIST' }),
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_CAMPUS', 'YieldType', { expect: 'YIELD_SCIENCE' }),
      },
    }),
    P({
      id: 'FESTIVAL',
      name: 'Theater Square Festival',
      district: 'THEATER_SQUARE',
      yield: 'culture',
      yieldPct: 15,
      gpClass: 'ARTIST',
      gpClasses: ['WRITER', 'ARTIST', 'MUSICIAN'],
      gppFraction: 0.11,
      description: 'Convert production into culture and Great Writer/Artist/Musician points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'PrereqDistrict', { expect: 'DISTRICT_THEATER' }),
        gpClass: { derived: 'the PRIMARY of the THREE Project_GreatPersonPoints classes the install gives this project; the catalog keeps one for wire-index stability and the full list in gpClasses', inputs: [xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'GreatPersonClassType')] },
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'YieldType', { expect: 'YIELD_CULTURE' }),
        gpClasses: { derived: 'the Project_GreatPersonPoints classes of this project, as engine class ids', inputs: [xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER', 'GreatPersonClassType')] },
        gppFraction: { derived: 'the Festival pays Points 5 per class where a single-class project pays 10, so half the generic PROJECT_GPP_FRACTION', inputs: [xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_THEATER&GreatPersonClassType=GREAT_PERSON_CLASS_WRITER', 'Points')] },
      },
    }),
    P({
      id: 'PRAYERS',
      name: 'Holy Site Prayers',
      district: 'HOLY_SITE',
      yield: 'faith',
      yieldPct: 15,
      gpClass: 'PROPHET',
      description: 'Convert production into faith and Great Prophet points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'PrereqDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_PROPHET' }),
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HOLY_SITE', 'YieldType', { expect: 'YIELD_FAITH' }),
      },
    }),
    P({
      id: 'INVESTMENT',
      name: 'Commercial Hub Investment',
      district: 'COMMERCIAL_HUB',
      yield: 'gold',
      yieldPct: 30,
      gpClass: 'MERCHANT',
      description: 'Convert production into gold and Great Merchant points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'PrereqDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_MERCHANT' }),
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB', 'YieldType', { expect: 'YIELD_GOLD' }),
      },
    }),
    P({
      id: 'SHIPPING',
      name: 'Harbor Shipping',
      district: 'HARBOR',
      yield: 'gold',
      yieldPct: 15,
      gpClass: 'ADMIRAL',
      description: 'Convert production into gold and Great Admiral points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'PrereqDistrict', { expect: 'DISTRICT_HARBOR' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_ADMIRAL' }),
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_HARBOR', 'YieldType', { expect: 'YIELD_GOLD' }),
      },
    }),
    P({
      id: 'TRAINING',
      name: 'Encampment Training',
      district: 'ENCAMPMENT',
      yield: 'gold',
      yieldPct: 15,
      gpClass: 'GENERAL',
      description: 'Convert production into gold and Great General points.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yield: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'YieldType', { expect: 'YIELD_GOLD' }),
        yieldPct: xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'PercentOfProductionRate'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'PrereqDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_ENCAMPMENT', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_GENERAL' }),
      },
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
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_REPAIR_OUTER_DEFENSES', 'PrereqDistrict')] },
        repair: xml('Projects', 'ProjectType=PROJECT_REPAIR_OUTER_DEFENSES', 'OuterDefenseRepair'),
      },
    }),

    // THE LASER STATIONS (before the space rows so those stay LAST, in chain
    // order). CIV6 (GS wiki, both pages): each "becomes available after
    // researching Offworld Mission and completing the Exoplanet Expedition
    // project, and requires a Spaceport district", costs 600 production, is
    // REPEATABLE, and speeds the craft by +1 light-year/turn.
    //
    // The two differ in what keeps the bonus alive. The TERRESTRIAL station
    // "increases the city's Power requirement by 5 each time it is completed,
    // and will cease to provide its bonus if the city is not powered" — so it
    // is counted on the CITY that built it. The LAGRANGE station pays a
    // one-time 30 Aluminum instead and "is guaranteed to provide its bonus" —
    // a one-time charge, so it never goes dark once paid.
    P({ id: 'TERRESTRIAL_LASER_STATION', name: 'Terrestrial Laser Station', district: 'SPACEPORT', yield: null, gpClass: null, laser: true, cost: 600, requiresTech: 'OFFWORLD_MISSION', requiresProject: 'EXOPLANET_EXPEDITION', description: 'Repeatable: +1 light-year/turn while this city is powered.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_TERRESTRIAL_LASER', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_TERRESTRIAL_LASER', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_TERRESTRIAL_LASER', 'PrereqTech', { expect: 'TECH_OFFWORLD_MISSION' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_TERRESTRIAL_LASER', 'PrereqProjectType', { expect: 'PROJECT_LAUNCH_EXOPLANET_EXPEDITION' }),
        laser: { derived: 'true for the two Offworld Mission laser stations the install chains off the Exoplanet Expedition', inputs: [xml('Projects', 'ProjectType=PROJECT_TERRESTRIAL_LASER', 'PrereqTech')] },
      },
    }),
    P({ id: 'LAGRANGE_LASER_STATION', name: 'Lagrange Laser Station', district: 'SPACEPORT', yield: null, gpClass: null, laser: true, orbital: true, resource: 'ALUMINUM', resourceCost: 30, cost: 600, requiresTech: 'OFFWORLD_MISSION', requiresProject: 'EXOPLANET_EXPEDITION', description: 'Repeatable: +1 light-year/turn for the Exoplanet craft.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_ORBITAL_LASER', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_ORBITAL_LASER', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_ORBITAL_LASER', 'PrereqTech', { expect: 'TECH_OFFWORLD_MISSION' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_ORBITAL_LASER', 'PrereqProjectType', { expect: 'PROJECT_LAUNCH_EXOPLANET_EXPEDITION' }),
        laser: { derived: 'true for the two Offworld Mission laser stations the install chains off the Exoplanet Expedition', inputs: [xml('Projects', 'ProjectType=PROJECT_ORBITAL_LASER', 'PrereqTech')] },
        orbital: { derived: 'true for the install row named ORBITAL_LASER, whose bonus needs no city Power', inputs: [xml('Projects', 'ProjectType=PROJECT_ORBITAL_LASER', 'ProjectType')] },
      },
    }),

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
    // CIV6 (Carbon Recapture): an Industrial Zone project, unlocked by the
    // Global Warming Mitigation civic; repeatable, and the only thing that
    // takes carbon back out of the air.
    // CIV6 (Recommission Nuclear Reactor): available after Nuclear Fission to
    // a city that holds a Nuclear Power Plant; completing it "resets the age of
    // the reactor to 0". 400 Production, and the cost "does not scale with
    // further research". The install's Projects row names NO PrereqDistrict, so
    // it takes the district-free spelling the other ungated projects use.
    P({ id: 'RECOMMISSION_REACTOR', name: 'Recommission Nuclear Reactor', district: 'CITY_CENTER', yield: null, gpClass: null, recommission: true, cost: 400, requiresTech: 'NUCLEAR_FISSION', description: 'Repeatable: resets this city reactor age to 0.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_RECOMMISSION_REACTOR', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_RECOMMISSION_REACTOR', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_RECOMMISSION_REACTOR', 'PrereqTech', { expect: 'TECH_NUCLEAR_FISSION' }),
        recommission: { derived: 'true for the install RECOMMISSION_REACTOR row', inputs: [xml('Projects', 'ProjectType=PROJECT_RECOMMISSION_REACTOR', 'ProjectType')] },
      },
    }),
    P({ id: 'CARBON_RECAPTURE', name: 'Carbon Recapture', district: 'INDUSTRIAL_ZONE', yield: null, gpClass: null, requiresCivic: 'GLOBAL_WARMING_MITIGATION', carbonRecapture: true, cost: 400, description: 'Repeatable: -50 lifetime CO2 and +30 Diplomatic Favor.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_CARBON_RECAPTURE', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        cost: xml('Projects', 'ProjectType=PROJECT_CARBON_RECAPTURE', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Projects', 'ProjectType=PROJECT_CARBON_RECAPTURE', 'PrereqCivic', { expect: 'CIVIC_GLOBAL_WARMING_MITIGATION' }),
        carbonRecapture: { derived: 'true for the install CARBON_RECAPTURE row', inputs: [xml('Projects', 'ProjectType=PROJECT_CARBON_RECAPTURE', 'ProjectType')] },
      },
    }),
    P({ id: 'LAUNCH_EARTH_SATELLITE', name: 'Launch Earth Satellite', district: 'SPACEPORT', yield: null, gpClass: null, once: true, cost: 900, requiresTech: 'ROCKETRY', description: 'Space race step 1 of 4 — reveals the entire map.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EARTH_SATELLITE', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EARTH_SATELLITE', 'Cost', { scale: GAME_SPEED }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_LAUNCH_EARTH_SATELLITE', 'MaxPlayerInstances')] },
        requiresTech: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EARTH_SATELLITE', 'PrereqTech', { expect: 'TECH_ROCKETRY' }),
      },
    }),
    P({ id: 'LAUNCH_MOON_LANDING', name: 'Launch Moon Landing', district: 'SPACEPORT', yield: null, gpClass: null, once: true, cost: 1500, requiresTech: 'SATELLITES', requiresProject: 'LAUNCH_EARTH_SATELLITE', description: 'Space race step 2 of 4 — one-time Culture of 10x science/turn.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MOON_LANDING', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MOON_LANDING', 'Cost', { scale: GAME_SPEED }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_LAUNCH_MOON_LANDING', 'MaxPlayerInstances')] },
        requiresTech: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MOON_LANDING', 'PrereqTech', { expect: 'TECH_SATELLITES' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_LAUNCH_MOON_LANDING', 'PrereqProjectType', { expect: 'PROJECT_LAUNCH_EARTH_SATELLITE' }),
      },
    }),
    P({ id: 'LAUNCH_MARS_COLONY', name: 'Launch Mars Colony', district: 'SPACEPORT', yield: null, gpClass: null, once: true, cost: 1800, requiresTech: 'NANOTECHNOLOGY', requiresProject: 'LAUNCH_MOON_LANDING', description: 'Space race step 3 of 4 — a human base on Mars.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MARS_BASE', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MARS_BASE', 'Cost', { scale: GAME_SPEED }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_LAUNCH_MARS_BASE', 'MaxPlayerInstances')] },
        requiresTech: xml('Projects', 'ProjectType=PROJECT_LAUNCH_MARS_BASE', 'PrereqTech', { expect: 'TECH_NANOTECHNOLOGY' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_LAUNCH_MARS_BASE', 'PrereqProjectType', { expect: 'PROJECT_LAUNCH_MOON_LANDING' }),
      },
    }),
    P({ id: 'EXOPLANET_EXPEDITION', name: 'Exoplanet Expedition', district: 'SPACEPORT', yield: null, gpClass: null, once: true, victory: true, cost: 2100, requiresTech: 'SMART_MATERIALS', requiresProject: 'LAUNCH_MARS_COLONY', description: 'Space race step 4 of 4 — launches the craft; winning is its arrival.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'Cost', { scale: GAME_SPEED }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'MaxPlayerInstances')] },
        requiresTech: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'PrereqTech', { expect: 'TECH_SMART_MATERIALS' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'PrereqProjectType', { expect: 'PROJECT_LAUNCH_MARS_BASE' }),
        victory: xml('Projects', 'ProjectType=PROJECT_LAUNCH_EXOPLANET_EXPEDITION', 'SpaceRace'),
      },
    }),

    // THE NUCLEAR CHAIN, all four in the City Center, which every city has.
    // CIV6 (Manhattan Project): 1000 Production, "becomes available after
    // researching Nuclear Fission"; "once completed, [it] allows the player to
    // undertake the Build Nuclear Device project". CIV6 (Operation Ivy): 1000
    // Production, "becomes available after researching Nuclear Fusion and
    // completing the Manhattan Project". The two BUILD projects are
    // REPEATABLE — "there is no limit on the number that a player can build,
    // as long as they have enough Gold to support them" — 800 and 1000
    // Production, and each charges its device's Uranium once, when it starts.
    P({ id: 'MANHATTAN_PROJECT', name: 'Manhattan Project', district: 'CITY_CENTER', yield: null, gpClass: null, once: true, cost: 1000, requiresTech: 'NUCLEAR_FISSION', description: 'Opens the Build Nuclear Device project.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_MANHATTAN_PROJECT', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_MANHATTAN_PROJECT', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_MANHATTAN_PROJECT', 'PrereqTech', { expect: 'TECH_NUCLEAR_FISSION' }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_MANHATTAN_PROJECT', 'MaxPlayerInstances')] },
      },
    }),
    P({ id: 'OPERATION_IVY', name: 'Operation Ivy', district: 'CITY_CENTER', yield: null, gpClass: null, once: true, cost: 1000, requiresTech: 'NUCLEAR_FUSION', requiresProject: 'MANHATTAN_PROJECT', description: 'Opens the Build Thermonuclear Device project.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_OPERATION_IVY', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_OPERATION_IVY', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_OPERATION_IVY', 'PrereqTech', { expect: 'TECH_NUCLEAR_FUSION' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_OPERATION_IVY', 'PrereqProjectType', { expect: 'PROJECT_MANHATTAN_PROJECT' }),
        once: { derived: 'true where the install row carries MaxPlayerInstances 1', inputs: [xml('Projects', 'ProjectType=PROJECT_OPERATION_IVY', 'MaxPlayerInstances')] },
      },
    }),
    P({ id: 'BUILD_NUCLEAR_DEVICE', name: 'Build Nuclear Device', district: 'CITY_CENTER', yield: null, gpClass: null, wmd: 1, cost: 800, requiresTech: 'NUCLEAR_FISSION', requiresProject: 'MANHATTAN_PROJECT', resource: 'URANIUM', resourceCost: 10, description: 'Repeatable: adds one Nuclear Device to this seat inventory.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'PrereqTech', { expect: 'TECH_NUCLEAR_FISSION' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'PrereqProjectType', { expect: 'PROJECT_MANHATTAN_PROJECT' }),
        wmd: { derived: 'the 1-based index of this device in NUCLEAR_DEVICES; the install marks the row only with WMD true', inputs: [xml('Projects', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'WMD')] },
        resource: xml('Projects', 'ProjectType=PROJECT_BUILD_NUCLEAR_DEVICE', 'PrereqResource', { expect: 'RESOURCE_URANIUM' }),
      },
    }),
    P({ id: 'BUILD_THERMONUCLEAR_DEVICE', name: 'Build Thermonuclear Device', district: 'CITY_CENTER', yield: null, gpClass: null, wmd: 2, cost: 1000, requiresTech: 'NUCLEAR_FUSION', requiresProject: 'OPERATION_IVY', resource: 'URANIUM', resourceCost: 20, description: 'Repeatable: adds one Thermonuclear Device to this seat inventory.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Projects', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'PrereqTech', { expect: 'TECH_NUCLEAR_FUSION' }),
        requiresProject: xml('ProjectPrereqs', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'PrereqProjectType', { expect: 'PROJECT_OPERATION_IVY' }),
        wmd: { derived: 'the 1-based index of this device in NUCLEAR_DEVICES; the install marks the row only with WMD true', inputs: [xml('Projects', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'WMD')] },
        resource: xml('Projects', 'ProjectType=PROJECT_BUILD_THERMONUCLEAR_DEVICE', 'PrereqResource', { expect: 'RESOURCE_URANIUM' }),
      },
    }),

    // CIV6 (Expansion2_Projects.xml): the three DECOMMISSION projects —
    // Cost 400 apiece, PrereqDistrict DISTRICT_INDUSTRIAL_ZONE,
    // `UnlocksFromEffect` (the Climate Accords competition opens them), and
    // each one's `Project_BuildingCosts` row names the plant it consumes.
    P({ id: 'DECOMMISSION_COAL_POWER_PLANT', name: 'Decommission Coal Power Plant', district: 'INDUSTRIAL_ZONE', yield: null, gpClass: null, cost: 400, consumesBuilding: 'COAL_POWER_PLANT', competitionOnly: 'CLIMATE_ACCORDS', description: 'Removes the Coal Power Plant and all its effects from this city.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_COAL_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        cost: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_COAL_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
        consumesBuilding: xml('Project_BuildingCosts', 'ProjectType=PROJECT_DECOMMISSION_COAL_POWER_PLANT', 'ConsumedBuildingType', { expect: 'BUILDING_COAL_POWER_PLANT' }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row; the install names the flag, not the competition', inputs: [xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_COAL_POWER_PLANT', 'ProjectType')] },
      },
    }),
    P({ id: 'DECOMMISSION_OIL_POWER_PLANT', name: 'Decommission Oil Power Plant', district: 'INDUSTRIAL_ZONE', yield: null, gpClass: null, cost: 400, consumesBuilding: 'OIL_POWER_PLANT', competitionOnly: 'CLIMATE_ACCORDS', description: 'Removes the Oil Power Plant and all its effects from this city.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_OIL_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        cost: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_OIL_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
        consumesBuilding: xml('Project_BuildingCosts', 'ProjectType=PROJECT_DECOMMISSION_OIL_POWER_PLANT', 'ConsumedBuildingType', { expect: 'BUILDING_FOSSIL_FUEL_POWER_PLANT' }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row; the install names the flag, not the competition', inputs: [xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_OIL_POWER_PLANT', 'ProjectType')] },
      },
    }),
    P({ id: 'DECOMMISSION_NUCLEAR_POWER_PLANT', name: 'Decommission Nuclear Power Plant', district: 'INDUSTRIAL_ZONE', yield: null, gpClass: null, cost: 400, consumesBuilding: 'NUCLEAR_POWER_PLANT', competitionOnly: 'CLIMATE_ACCORDS', description: 'Removes the Nuclear Power Plant and all its effects from this city.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        cost: xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT', 'Cost', { scale: GAME_SPEED }),
        consumesBuilding: xml('Project_BuildingCosts', 'ProjectType=PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT', 'ConsumedBuildingType', { expect: 'BUILDING_POWER_PLANT' }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row; the install names the flag, not the competition', inputs: [xml('Projects', 'ProjectType=PROJECT_DECOMMISSION_NUCLEAR_POWER_PLANT', 'ProjectType')] },
      },
    }),

    // CIV6 (Expansion2_Projects.xml, PROJECT_COTHON_CAPITAL_MOVE):
    // PrereqDistrict DISTRICT_COTHON, Cost 100,
    // COST_PROGRESSION_GAME_PROGRESS Param1 1500,
    // `MaxSimultaneousInstances=1`. APPENDED LAST — a project's catalog index
    // IS its action code, so an insert would shift every later one.
    P({ id: 'COTHON_CAPITAL_MOVE', name: 'Move the Capital', district: 'HARBOR', civ: 'PHOENICIA', yield: null, gpClass: null, cost: 100, costProgressGame: 1500, movesCapital: true, description: 'When complete, this seat capital moves to this city.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_COTHON_CAPITAL_MOVE', 'PrereqDistrict', { expect: 'DISTRICT_COTHON' }),
        cost: xml('Projects', 'ProjectType=PROJECT_COTHON_CAPITAL_MOVE', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_COTHON_CAPITAL_MOVE', 'CostProgressionParam1'),
        movesCapital: { derived: 'true for the install COTHON_CAPITAL_MOVE row, whose effect moves the capital', inputs: [xml('Projects', 'ProjectType=PROJECT_COTHON_CAPITAL_MOVE', 'ProjectType')] },
      },
    }),
    // CIV6 (Expansion2_Projects.xml): the two SCORED-COMPETITION projects,
    // both `UnlocksFromEffect` and both Cost 200 — offered only while their
    // competition runs, repeatable while it does. APPENDED LAST, because a
    // project's catalog index IS its action code.
    P({ id: 'TRAIN_ATHLETES', name: 'Training Athletes', district: 'CITY_CENTER', yield: null, gpClass: null, cost: 200, competitionOnly: 'WORLD_GAMES', description: 'Repeatable while the World Games run: scores 50 for this seat.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_TRAIN_ATHLETES', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_TRAIN_ATHLETES', 'Cost', { scale: GAME_SPEED }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row', inputs: [xml('Projects', 'ProjectType=PROJECT_TRAIN_ATHLETES', 'ProjectType')] },
      },
    }),
    P({ id: 'TRAIN_ASTRONAUTS', name: 'Training Astronauts', district: 'SPACEPORT', yield: null, gpClass: null, cost: 200, competitionOnly: 'SPACE_STATION', description: 'Repeatable while the Space Station competition runs: scores 30 for this seat.',
      src: {
        district: xml('Projects', 'ProjectType=PROJECT_TRAIN_ASTRONAUTS', 'PrereqDistrict', { expect: 'DISTRICT_SPACEPORT' }),
        cost: xml('Projects', 'ProjectType=PROJECT_TRAIN_ASTRONAUTS', 'Cost', { scale: GAME_SPEED }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row', inputs: [xml('Projects', 'ProjectType=PROJECT_TRAIN_ASTRONAUTS', 'ProjectType')] },
      },
    }),
    // CIV6 (PROJECT_SEND_AID): Cost 200, no PrereqDistrict; open while the
    // Aid Request runs, repeatable, scores 200 for the seat. APPENDED LAST.
    P({ id: 'SEND_AID', name: 'Send Aid', district: 'CITY_CENTER', yield: null, gpClass: null, cost: 200, competitionOnly: 'AID_REQUEST', description: 'Repeatable while an Aid Request runs: scores 200 for this seat.',
      src: {
        district: { derived: 'CITY_CENTER where the install row names NO PrereqDistrict - the engine runs a district-free project in the one district every city has', inputs: [xml('Projects', 'ProjectType=PROJECT_SEND_AID', 'PrereqDistrict')] },
        cost: xml('Projects', 'ProjectType=PROJECT_SEND_AID', 'Cost', { scale: GAME_SPEED }),
        competitionOnly: { derived: 'the scored competition whose UnlocksFromEffect opens the row', inputs: [xml('Projects', 'ProjectType=PROJECT_SEND_AID', 'ProjectType')] },
      },
    }),
    // CIV6 (PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE, Industrial Zone
    // Logistics): the Industrial Zone's district project — Cost 25 on the
    // GAME_PROGRESS curve like its five siblings, Great Engineer points, no
    // yield conversion (Expansion2_Projects.xml deletes the base row), and
    // "provides this city with full Power while active".
    // APPENDED LAST, because a project's catalog index IS its action code.
    P({
      id: 'LOGISTICS',
      name: 'Industrial Zone Logistics',
      district: 'INDUSTRIAL_ZONE',
      yield: null,
      fullyPowered: true,
      gpClass: 'ENGINEER',
      description: 'Full Power while active; Great Engineer points once finished.',
      cost: 25,
      costProgressGame: 1500,
      src: {
        yield: { derived: 'null: Expansion2_Projects.xml deletes the base game\'s YIELD_GOLD conversion row', inputs: [xml('Project_YieldConversions', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'YieldType')] },
        fullyPowered: xml('Projects_XP2', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'FullyPoweredWhileActive'),
        cost: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'Cost', { scale: GAME_SPEED }),
        costProgressGame: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'CostProgressionParam1'),
        district: xml('Projects', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'PrereqDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        gpClass: xml('Project_GreatPersonPoints', 'ProjectType=PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE', 'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_ENGINEER' }),
      },
    }),
  ].map((p) => [p.id, p.cost !== undefined ? { ...p, cost: scaleByGameSpeed(p.cost) } : p]),
);

/** CIV6 (GS): the Exoplanet craft's journey — `SCIENCE_VICTORY_POINTS_REQUIRED`
 *  50 light-years at a base 1 LY/turn, +1 LY/turn per completed laser station.
 *  The pedia: "The threshold for victory varies depending on game speed"; the
 *  install publishes no rule for how, and this engine reads it as a cost
 *  (`scaleByGameSpeed`). */
export const SPACE_FLIGHT_LY = srcConst('scenario.spaceLyTarget', scaleByGameSpeed(50),
  xml('GlobalParameters', 'Name=SCIENCE_VICTORY_POINTS_REQUIRED', 'Value', {
    scale: GAME_SPEED,
    note: 'the speed scaling is this engine\'s reading of the pedia\'s "varies depending on game speed"',
  }));

export const SPACE_PROJECTS: ProjectDef[] = Object.values(PROJECTS)
  .filter((p) => p.once && p.district === 'SPACEPORT');
const SPACE_IDS = new Set(SPACE_PROJECTS.map((p) => p.id));
/** the SPACE-RACE chain specifically — what a Great Engineer's space
 *  production and the space-production percentage act on. A one-time project
 *  elsewhere (the nuclear unlocks) is not one of these. */
export function isSpaceProject(id: string): boolean {
  return SPACE_IDS.has(id);
}

/** CIV6 (GS): a Terrestrial Laser Station "increases the city's Power
 *  requirement by 5 each time it is completed". */
export const LASER_POWER_LOAD = 5;

/** The yield lump a district project pays on completion: its cost at the
 *  row's `yieldPct`. */
export function projectYieldLump(p: ProjectDef, cost: number): number {
  return Math.round(cost * ((p.yieldPct ?? 0) / 100));
}
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
