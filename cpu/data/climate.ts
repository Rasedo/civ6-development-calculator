/**
 * THE CLIMATE ARC — Gathering Storm's CO2, its seven phases, and the sea.
 *
 * Every number below with a CIV6 note is the Climate (Civ6) page's own or the
 * install's. The MODEL note marks the place that page states qualitatively and
 * never quantifies: one modelling choice keyed to published numbers, not a
 * fresh ladder of invented constants.
 */

/**
 * CIV6 (Pollution formulae): "Each type of resource has an assigned number of
 * emitted carbon units per Power generated, which is 820, 490, and 48 for
 * Coal, Oil, and Uranium, respectively."
 *
 * Multiplied by a plant's Power-per-resource (`fuelRate`, 4/4/16) this gives
 * the page's own per-resource figures — 3280, 1960 and 768 raw units, which
 * it displays as ~3.28, ~1.96 and ~0.77 after dividing by 1000.
 */
const carbon = (res: string, n: number) => srcConst(`climate.carbonPerPower.${res}`, n, {
  pedia: 'the GS Climate page, Pollution formulae ("Each type of resource has an assigned number '
    + 'of emitted carbon units per Power generated, which is 820, 490, and 48 for Coal, Oil, and '
    + 'Uranium"); the install ships no readable CO2 table',
});
export const CARBON_PER_POWER: Record<string, number> = {
  COAL: carbon('COAL', 820), OIL: carbon('OIL', 490), URANIUM: carbon('URANIUM', 48),
};

/** CIV6: "Units that consume one of these types of resources also discharge
 *  carbon per turn, but their emissions are equal to only half of Power
 *  Plants per unit of resource." */
export const UNIT_CARBON_SHARE = srcConst('climate.unitShare', 0.5, {
  derived: 'CLIMATE_CO2_PERCENT_FROM_UNITS / 100 — the install writes the share as a percentage',
  inputs: [xml('GlobalParameters', 'Name=CLIMATE_CO2_PERCENT_FROM_UNITS', 'Value')],
});

/** CIV6: "for means of CO2 contributions each military unit only takes 0.5
 *  resource units" — the post-Antarctic-Update reduction, which the page is
 *  careful to say "does not affect the mechanics of resource production flow"
 *  and so applies to the EMISSION only, never to `chargeUnitUpkeep`'s spend. */
export const UNIT_CARBON_RESOURCE_SHARE = srcConst('climate.unitResourceShare', 0.5, {
  pedia: 'the GS Climate page ("for means of CO2 contributions each military unit only takes 0.5 '
    + 'resource units", the post-Antarctic-Update reduction)',
});

/** CIV6 (Advanced Power Cells): "As of the Antarctic Late Summer Update, it
 *  also halves the CO2 emitted by units." */
export const ADVANCED_POWER_CELLS_SHARE = srcConst('climate.cellsShare', 0.5, {
  pedia: 'the GS Advanced Power Cells page ("As of the Antarctic Late Summer Update, it also '
    + 'halves the CO2 emitted by units")',
});
export const ADVANCED_POWER_CELLS_TECH = srcConst('climate.ADVANCED_POWER_CELLS_TECH',
  'ADVANCED_POWER_CELLS',
  xml('Technologies', 'TechnologyType=TECH_ADVANCED_POWER_CELLS', 'TechnologyType',
    { expect: 'TECH_ADVANCED_POWER_CELLS' }));

/**
 * CIV6 (`Maps_XP2.CO2For1DegreeTempRise`): the CO2 that warms the world one
 * degree — MAPSIZE_DUEL 500,000. This world is 44x26, which IS Civ 6's Duel.
 */
export const CO2_PER_DEGREE = srcConst('climate.co2PerDegree', 500_000,
  xml('Maps_XP2', 'MapSizeType=MAPSIZE_DUEL', 'CO2For1DegreeTempRise'));

/**
 * CIV6: "In order for the global temperature to rise by 0.5° (1 Climate
 * Change Point), you will need a different amount of CO2 emissions depending
 * on map size" — half of `CO2_PER_DEGREE`, Duel 250,000.
 */
export const CO2_PER_POINT = srcConst('climate.co2PerPoint', CO2_PER_DEGREE / 2, {
  derived: 'Maps_XP2.CO2For1DegreeTempRise (MAPSIZE_DUEL) / 2 — the GS Climate page: one Climate '
    + 'Change Point is a rise of 0.5 degrees',
  inputs: [xml('Maps_XP2', 'MapSizeType=MAPSIZE_DUEL', 'CO2For1DegreeTempRise')],
});

/** CIV6 (Carbon Recapture): "will recover 50,000 units of CO2". The project
 *  page states the same figure as the displayed "-50 lifetime carbon
 *  emissions", and lets a civ's lifetime total go below zero. */
export const CARBON_RECAPTURE_UNITS = srcConst('climate.recaptureUnits', 50_000, {
  pedia: 'the GS Carbon Recapture project page ("will recover 50,000 units of CO2")',
});
/** CIV6 (Carbon Recapture): "awards 30 Diplomatic Favor". */
export const CARBON_RECAPTURE_FAVOR = srcConst('climate.recaptureFavor', 30, {
  pedia: 'the GS Carbon Recapture project page ("awards 30 Diplomatic Favor")',
});

import { srcConst, xml, type SrcMap } from './provenance';
import { scaleByGameSpeed } from './constants';

interface ClimatePhase {
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  /** Climate Change points at which this phase begins. */
  points: number;
  /** metres of sea-level rise, the page's own column. */
  seaLevel: number;
  /** the Coastal Lowland band newly FLOODED here; 0 = none this phase. */
  flood: number;
  /** the band newly SUBMERGED here; 0 = none this phase. */
  submerge: number;
  /** the fraction of the map's original Ice that has melted. */
  iceMelt: number;
  /** the phase's sea-level rise stops a flood's fertility rows
   *  (RandomEvents.HaltsFloodFertility of its RANDOM_EVENT_SEA_LEVEL_RISE
   *  row; Game_Climate 0x291a20 sets it, 0xa2f200 reads it) */
  haltsFlood: boolean;
  /** ... a storm's (HaltsStormFertility; 0x286f80 reads it) */
  haltsStorm: boolean;
  /** the percent of each event fertility a halted storm or a drought takes
   *  back off a struck plot (FertilityRemovalChance; 0xa1c0c0) */
  fertilityRemoval: number;
}

/** CIV6 (Phases of Climate Change), read row by row off the page's table.
 *  Index 0 is Phase I. Phase 0 — no climate change yet — is the absence of a
 *  row, which `climatePhase` returns as -1. */

/**
 * PROVENANCE (cpu/data/provenance.ts). The page's columns are the Gathering
 * Storm Climate page's "Phases of Climate Change" table, read row by row;
 * the fertility columns are the install's RANDOM_EVENT_SEA_LEVEL_RISE row of
 * the phase (Phase I its RISE1).
 */
const CLIMATE_PHASE_SRC: SrcMap = Object.fromEntries(
  ['points', 'seaLevel', 'flood', 'submerge', 'iceMelt'].map((k) => [k, {
    pedia: 'the GS Climate page "Phases of Climate Change" table',
  }]),
);
const riseRow = (p: number) => `RandomEventType=RANDOM_EVENT_SEA_LEVEL_RISE${p + 1}`;

const RAW_CLIMATE_PHASES: readonly ClimatePhase[] = [
  { points: 2, seaLevel: 0.5, flood: 0, submerge: 0, iceMelt: 0.10, haltsFlood: false, haltsStorm: false, fertilityRemoval: 0 },
  { points: 3, seaLevel: 1.0, flood: 1, submerge: 0, iceMelt: 0.20, haltsFlood: false, haltsStorm: false, fertilityRemoval: 0 },
  { points: 4, seaLevel: 1.5, flood: 2, submerge: 0, iceMelt: 0.30, haltsFlood: false, haltsStorm: false, fertilityRemoval: 0 },
  { points: 5, seaLevel: 2.0, flood: 0, submerge: 1, iceMelt: 0.40, haltsFlood: true, haltsStorm: true, fertilityRemoval: 0 },
  { points: 6, seaLevel: 2.5, flood: 3, submerge: 0, iceMelt: 0.55, haltsFlood: true, haltsStorm: true, fertilityRemoval: 15 },
  { points: 7, seaLevel: 3.0, flood: 0, submerge: 2, iceMelt: 0.70, haltsFlood: true, haltsStorm: true, fertilityRemoval: 30 },
  { points: 8, seaLevel: 3.5, flood: 0, submerge: 3, iceMelt: 0.85, haltsFlood: true, haltsStorm: true, fertilityRemoval: 45 },
];
export const CLIMATE_PHASES: readonly ClimatePhase[] = RAW_CLIMATE_PHASES.map((p, i) => ({
  ...p,
  src: {
    ...CLIMATE_PHASE_SRC,
    haltsFlood: xml('RandomEvents', riseRow(i), 'HaltsFloodFertility'),
    haltsStorm: xml('RandomEvents', riseRow(i), 'HaltsStormFertility'),
    fertilityRemoval: xml('RandomEvents', riseRow(i), 'FertilityRemovalChance'),
  },
}));

/**
 * CIV6 (Deforestation Level): "a percentage of number of features cleared
 * (Marshes, Woods, Rainforests) versus the total number of removable features
 * on the entire map", and the CO2 emission modifier each band applies.
 *
 * Descending cuts: the first row whose cut the level clears is the band, which
 * is the same shape the appeal bands read by.
 */
const defBand = (i: number, b: readonly [number, number]): readonly [number, number] =>
  srcConst(`climate.deforestation.${i}`, b, {
    pedia: 'the GS Deforestation Level page\'s band table — [cut, CO2 emission modifier], '
      + 'descending cuts',
  }) as readonly [number, number];
export const DEFORESTATION_BANDS: ReadonlyArray<readonly [number, number]> = [
  defBand(0, [0.50, 0.50]),
  defBand(1, [0.40, 0.30]),
  defBand(2, [0.25, 0.10]),
  defBand(3, [0.10, 0.00]),
  defBand(4, [0.00, -0.20]),
] as const;

/**
 * A COASTAL LOWLAND's band, 1 (drowns first) to 3 (drowns last).
 *
 * MODEL. Real Civ 6 stamps the band on the map at generation as metres above
 * sea level, and publishes neither the generator's rule nor the elevations.
 * The runtime map carries `elevation` only as FLAT / HILLS / MOUNTAIN, so the
 * band here is the hex distance to the nearest water: the shoreline is band 1,
 * the ring behind it band 2, then band 3, and FLAT land only — which is what
 * reproduces the published behaviour that the lowest, most seaward tiles go
 * under first and hills never do.
 */
export const LOWLAND_MAX_BAND = srcConst('climate.lowlandMaxBand', 3, {
  stylized: 'real Civ 6 stamps a coastal lowland\'s band at map generation as metres above sea '
    + 'level and publishes neither the generator\'s rule nor the elevations; this engine reads '
    + 'the band as hex distance to the nearest water, three deep',
});

/** The phase index for a point total: -1 below Phase I, else 0..6. CIV6: "It
 *  is not possible to revert climate change to an earlier phase", which is the
 *  caller's monotone clamp, not this function's. */
export function climatePhase(points: number): number {
  let p = -1;
  for (let i = 0; i < CLIMATE_PHASES.length; i++) if (points >= CLIMATE_PHASES[i].points) p = i;
  return p;
}

/** The CO2 modifier for a deforestation level in 0..1. */
export function deforestationModifier(level: number): number {
  for (const [cut, mod] of DEFORESTATION_BANDS) if (level >= cut) return mod;
  return 0;
}

/** CIV6 (Flood Barrier): "The formula is (80 x coastal lowland tiles) + (80 x
 *  coastal lowland tiles x flood level)" — so the price of a barrier climbs
 *  with the sea it holds back. The 80 is the row's own Cost (Buildings_XP2
 *  CostMultiplierPerTile 1, CostMultiplierPerSeaLevel 1), so it takes the
 *  speed as every production cost does: 40 a tile online, the step every
 *  recorded quote climbs by (runs/h1_duelw1104..1108: 40, 80, 120, 160, 200). */
export const FLOOD_BARRIER_PER_TILE = scaleByGameSpeed(srcConst('climate.barrierPerTile', 80,
  xml('Buildings', 'BuildingType=BUILDING_FLOOD_BARRIER', 'Cost')));

/**
 * CIV6 (Diplomatic Favor, Losing Favor): "When you're producing too much CO2
 * ... You will receive a Diplomatic Favor penalty of -1/turn for every 3
 * pollution points higher than average. This penalty caps at 20."
 *
 * "Pollution points" are the DISPLAYED figure, which the Climate page defines
 * as the raw units "after taking away the last 3 digits (divided by 1000 and
 * rounded down to the closest integer)".
 */
export const POLLUTION_DISPLAY_DIVISOR = srcConst('climate.pollutionDivisor', 1000, {
  pedia: 'the GS Climate page — the displayed pollution figure is the raw units "after taking away '
    + 'the last 3 digits (divided by 1000 and rounded down)"',
});
export const FAVOR_PER_POLLUTION_OVER = srcConst('climate.favorPerOver', 3,
  xml('GlobalParameters', 'Name=FAVOR_CO2_DIVISOR', 'Value'));
export const FAVOR_POLLUTION_CAP = srcConst('climate.favorCap', 20, {
  derived: 'the magnitude of FAVOR_CO2_MINIMUM (-20) — this engine stores the cap on the penalty, '
    + 'the install the signed floor',
  inputs: [xml('GlobalParameters', 'Name=FAVOR_CO2_MINIMUM', 'Value')],
});

/** The displayed pollution figure for a raw carbon total. */
export function pollutionPoints(raw: number): number {
  return Math.floor(raw / POLLUTION_DISPLAY_DIVISOR);
}
