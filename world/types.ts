
/**
 * The six yields, and the ONLY place their order is written.
 *
 * Index here IS the GPU's yield axis: the exporter builds every yield row with
 * `YIELD_KEYS.map`, and the GPU reads those rows 6-wide by position. Reordering
 * this array silently permutes every yield table on the wire.
 */
export const YIELD_KEYS = ['food', 'production', 'gold', 'science', 'culture', 'faith'] as const;

export type YieldKey = (typeof YIELD_KEYS)[number];

export type Yields = Record<YieldKey, number>;

export function emptyYields(): Yields {
  return { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
}

export function addYields(target: Yields, src: Partial<Yields>, factor = 1): Yields {
  for (const k of YIELD_KEYS) {
    const v = src[k];
    if (v) target[k] += v * factor;
  }
  return target;
}

export type TerrainId =
  | 'GRASSLAND'
  | 'PLAINS'
  | 'DESERT'
  | 'TUNDRA'
  | 'SNOW'
  | 'COAST'
  | 'LAKE'
  | 'OCEAN';

export type Elevation = 'FLAT' | 'HILLS' | 'MOUNTAIN';

export type FeatureId =
  | 'WOODS'
  | 'RAINFOREST'
  | 'MARSH'
  | 'FLOODPLAINS'
  | 'OASIS'
  | 'REEF'
  | 'ICE'
  | 'GEOTHERMAL_FISSURE'
  | 'VOLCANIC_SOIL'
  | 'CRATER_LAKE'
  | 'DEAD_SEA'
  | 'GALAPAGOS'
  | 'GREAT_BARRIER_REEF'
  | 'PANTANAL'
  | 'ULURU'
  | 'TORRES_DEL_PAINE'
  | 'MOUNT_KILIMANJARO'
  | 'YOSEMITE'
  | 'CLIFFS_OF_DOVER'
  | 'MOUNT_EVEREST'
  | 'EYE_OF_THE_SAHARA'
  | 'BURNING_WOODS'
  | 'BURNT_WOODS'
  | 'BURNING_RAINFOREST'
  | 'BURNT_RAINFOREST'
  | 'EYJAFJALLAJOKULL'
  | 'VESUVIUS'
  | 'FLOODPLAINS_GRASSLAND'
  | 'FLOODPLAINS_PLAINS'
  | 'PAITITI'
  | 'GOBUSTAN'
  | 'BERMUDA_TRIANGLE'
  | 'PIOPIOTAHI'
  | 'TSINGY'
  | 'DEVILS_TOWER'
  | 'GIANTS_CAUSEWAY'
  | 'LAKE_RETBA'
  | 'PAMUKKALE'
  | 'DELICATE_ARCH'
  | 'UBSUNUR_HOLLOW'
  | 'HA_LONG_BAY'
  | 'WHITE_DESERT'
  | 'MATTERHORN';

export type ResourceCategory = 'bonus' | 'luxury' | 'strategic';

// The union is a SET; `IMPROVEMENT_IDS` (cpu/core/unitActions.ts) is the
// ordered roster whose position is the GPU's improvement index and the build
// column's number, so a new id appends THERE.
export type ImprovementId =
  | 'SPHINX'
  | 'ZIGGURAT'
  | 'BATEY'
  | 'COLOSSAL_HEADS'
  | 'MONASTERY'
  | 'FARM'
  | 'MINE'
  | 'QUARRY'
  | 'LUMBER_MILL'
  | 'PASTURE'
  | 'CAMP'
  | 'PLANTATION'
  | 'FISHING_BOATS'
  | 'OIL_WELL'
  | 'SEASIDE_RESORT'
  | 'FORT'
  | 'AIRSTRIP'
  | 'SOLAR_FARM'
  | 'WIND_FARM'
  | 'MISSILE_SILO'
  | 'GEOTHERMAL_PLANT'
  | 'OFFSHORE_WIND_FARM'
  | 'TERRACE_FARM'
  | 'MOUNTAIN_TUNNEL'
  | 'CHATEAU'
  | 'CHEMAMULL'
  | 'GOLF_COURSE'
  | 'GREAT_WALL'
  | 'ICE_HOCKEY_RINK'
  | 'KURGAN'
  | 'MAORI_PA'
  | 'MEKEWAP'
  | 'MISSION'
  | 'OPEN_AIR_MUSEUM'
  | 'POLDER'
  | 'STEPWELL'
  | 'FISHERY'
  | 'CITY_PARK'
  | 'MOUNTAIN_ROAD'
  | 'SKI_RESORT'
  | 'SEASTEAD'
  | 'OFFSHORE_OIL_RIG'
  | 'MAHAVIHARA'
  | 'ALCAZAR';

export type DistrictId =
  | 'CITY_CENTER'
  | 'CAMPUS'
  | 'HOLY_SITE'
  | 'THEATER_SQUARE'
  | 'COMMERCIAL_HUB'
  | 'HARBOR'
  | 'INDUSTRIAL_ZONE'
  | 'ENCAMPMENT'
  | 'AQUEDUCT'
  | 'ENTERTAINMENT_COMPLEX'
  | 'NEIGHBORHOOD'
  | 'SPACEPORT'
  | 'AERODROME'
  | 'DAM'
  | 'CANAL'
  | 'WATER_PARK'
  | 'PRESERVE'
  | 'GOVERNMENT_PLAZA'
  | 'DIPLOMATIC_QUARTER';

/** "no seat" — the whole ownership space's null, here because `Tile` carries it. */
export const NO_SEAT = -1;

/** Minimum hex distance between any two city CENTRES — a rule of the WORLD's
 *  geometry (placement legality), which is why it lives beside the map types. */
export const CITY_MIN_DIST = 4;

export interface Tile {
  ownerSeat: number;
  ownerCity: number;
  index: number;
  col: number;
  row: number;
  terrain: TerrainId;
  elevation: Elevation;
  feature: FeatureId | null;
  resource: string | null; // resource id from world/resources
  riverMask: number;
  improvement: string | null; // ImprovementId
  district: DistrictId | null;
  districtComplete: boolean;
  builtWonder: string | null;
  builtWonderComplete: boolean;
  /** CLIFFS as a six-bit EDGE mask, exactly like `riverMask` — bit
   *  d is set when the edge toward neighbor direction d carries a cliff. Real
   *  Civ 6 puts cliffs on the land/water boundary, where they block EMBARK and
   *  DISEMBARK across that edge. That is what makes a cliff-ringed city safe
   *  from naval invasion. They do NOT block land-to-land movement. */
  cliffMask: number;
  /** an ANTIQUITY SITE — a dig an Archaeologist can excavate into
   *  an Artifact. Real Civ 6 creates these from pre-Modern events (a razed
   *  barbarian outpost, a unit dying) and reveals them with Natural History. */
  antiquity?: boolean;
  /** the ERA index and the SEAT whose event stamped the dig on this
   *  tile. An Artifact carries its provenance out of the ground: a themed
   *  Archaeological Museum needs three artifacts of ONE era from three
   *  DIFFERENT civilizations. */
  antiquityEra?: number;
  antiquitySeat?: number;
  /** a SHIPWRECK — the WATER dig. Real Civ 6 puts these on passable
   *  water and reveals them with Cultural Heritage; an Archaeologist that
   *  works one removes it from the map and excavates an Artifact. */
  shipwreck?: boolean;
  shipwreckEra?: number;
  shipwreckSeat?: number;
  /** the NATIONAL PARK this tile belongs to, named by the LOWEST tile
   *  index in its four-tile cluster (its anchor); absent or -1 = no park.
   *  The anchor is what gives a park an identity two adjacent parks cannot
   *  blur: each pays its own amenities, and every tile pays TOURISM equal to
   *  its own current appeal. */
  park?: number;
  pillaged: boolean;
  districtPillaged?: boolean;
  /** the ENCAMPMENT garrison pool (max ENCAMPMENT_HP = 100), set
   *  when the district COMPLETES. While positive the tile blocks hostile
   *  entry and the district may strike; a melee attack on the tile depletes
   *  it, and at 0 the tile is enterable and the strike goes silent. Lives on
   *  the TILE (not the city) so every walker's legality check stays O(1) and
   *  the GPU can mirror it as one [B, T] plane. */
  encampHp?: number;
  /** the Encampment's OWN outer-defense pool, walls-tier sized and separate
   *  from the city's (`encampOuterPool` resolves the absent-=-FULL default). */
  encampOuterHp?: number;
  /** a ROAD lies on this tile. Laid by trade routes (real Civ 6:
   *  Traders lay road as they serve a land route). A step from one road tile
   *  to another ignores the terrain penalty, and from the Classical era on it
   *  also ignores the river crossing charge (Civ 6's Classical road brings
   *  bridges). Absent = no road. */
  road?: boolean;
  goodyHut: boolean;
  volcano: boolean;
  /** this volcano is ACTIVE and may erupt. Every volcano starts dormant; the
   *  map's one roll a turn wakes one or puts one to sleep (`volcanoRoll`);
   *  never read off the world file. */
  volcanoActive?: boolean;
  /** the rows of the turn's random-event draw (a bit per `eventRows` index)
   *  that have fired on the site keyed on this plot — a flooding river's
   *  start plot, a volcano, a wonder's lowest-index plot, a reactor city's
   *  centre. A site whose row has not yet fired carries the first-occurrence
   *  boost (`randomEvent`). */
  eventFired?: number;
  /** a CITIZEN is PINNED to this plot. `assignWorkedTiles` takes every
   *  locked plot the city can work before it ranks anything by score, so a
   *  lock is how a player overrides the automatic allocation for tiles the
   *  way a specialist pin overrides it for slots. The lock lives on the PLOT
   *  and dies when the plot changes hands (`setTileOwner`). */
  locked?: boolean;
  /** where a city holds more locked plots than citizens: the order its
   *  citizens take them, the lower rank first (unset ranks 0), a rank's
   *  plots in tile order. A recorded game's replay ranks the plots its
   *  record says each citizen of a turn worked. */
  lockRank?: number;
  /** how many times a river flood has reached this tile — the Great Bath's
   *  "+1 Faith for every time a tile belonging to this city has been
   *  Flooded" reads it. A flood counts once per episode (`floodRiver`). */
  floodCount?: number;
  /** CIV6 (Marina Raskova): a permanent "+1 air unit slots" on this
   *  district tile, written at the general's retirement. */
  airSlotBonus?: number;
  /** the permanent per-tile channels a Great Person left on this district
   *  (`GP_TILE_PERM` order): Tesla's and Paxton's regional reach and yield. */
  gpPerm?: number[];
  /** the COASTAL LOWLAND band, 1 (drowns first) to 3; absent = highland or
   *  inland, which the rising sea never reaches. Derived from the map at
   *  creation by `deriveLowlands`, never read off the world file. */
  lowland?: number;
  /** CIV6 (Continents): the plot's continent, Plot:GetContinentType() — the
   *  map's `continents` where it carries them, else the landmass counting
   *  from 0 in ascending tile index; -1 for the sea. Stamped at creation by
   *  `deriveContinents`. A seat's HOME continent is its ORIGINAL capital's.
   */
  continent?: number;
  /** CIV6 (AreaBuilder): the plot's area, a connected component of water,
   *  mountains or the other land, numbered from 0 by lowest plot. Derived at
   *  creation by `deriveAreas`. */
  area?: number;
  /** CIV6 (Mountain Tunnel): "a movement portal on a mountain range" — the
   *  connected component of MOUNTAIN tiles this one belongs to, -1 off a
   *  mountain. Static, like `continent`: mountains never move. */
  mountainRange?: number;
  /** the sea has been over this tile: it is pillaged and pays no improvement
   *  bonus, but is still workable and can be repaired behind a Flood
   *  Barrier. */
  flooded?: boolean;
  /** CIV6 (Coastal Lowlands): the sea has taken this tile FOREVER; it is a
   *  Coast now (`submergeTile`), and no Flood Barrier repairs it. */
  submerged?: boolean;
  /** CIV6 (Nuclear weapons): turns of radioactive fallout still on this tile.
   *  A blast writes the device's own count; a build charge clears it. */
  falloutTurns?: number;
  /** CIV6 (Railroad): the 0.25-Movement route a Military Engineer lays over
   *  the road, at the cost of 1 Iron and 1 Coal. */
  railroad?: boolean;
  fertility: number;
  /** the PRODUCTION half of flood silt — real Civ 6 fertilizes food and
   *  production on separate rolls, so the two accumulate apart. */
  fertilityProd: number;
  /** the SCIENCE and CULTURE silt an eruption leaves on a plot it paints
   *  (`RandomEvent_Yields` YIELD_SCIENCE, YIELD_CULTURE); absent = none. */
  fertilitySci?: number;
  fertilityCul?: number;
  droughtTurns: number;
  /** CIV6 (`RandomEvent_Yields`, the pack's fires): the turn the FIRE on this
   *  plot began — each plot a fire spreads to starts a fire of its own. The
   *  plot burns, is burnt at the fire's Turn 2 and regrows at its Turn 6,
   *  when the record goes. Absent = no fire. */
  fireStart?: number;
  /** the fire's place in the order the live fires began (`GameState.
   *  fireSerial` at its start): the order their turns run in. */
  fireSeq?: number;
  /** a storm's walk struck this plot, its record live or ended: the game
   *  keeps every storm's record and struck list (Game_Climate m_aStorms), and
   *  no drought starts where any of them reaches (0x28de40). Absent = never. */
  stormStruck?: boolean;
  /** CIV6 (IMPROVEMENT_METEOR_GOODY): a METEOR SITE a shower left here, taken
   *  by the first civilization unit to enter it. */
  meteor?: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  /** the map wraps in x: column 0 and column width - 1 are neighbours
   *  (`world/hex.ts` reads columns modulo the width) */
  wrapX: boolean;
  seed: number;
  tiles: Tile[];
  /** the game's river vector, in its own order (the map script's river IDs):
   *  per river its plot list as its edges were set, each edge adding its own
   *  plot then the plot across, each plot once, -1 for a partner off the map
   *  (`floodRivers` walks it); unset on a map whose generator kept none */
  rivers?: number[][];
  /** the game's volcano vector: the volcanoes' plots in the order the map
   *  script placed them (`volcanoOrder`); unset on a map whose generator
   *  kept none */
  volcanoes?: number[];
  /** the game's continents, per plot its Plot:GetContinentType() (the map
   *  script's StampContinents partition, -1 the sea); unset on a map whose
   *  generator kept none (`deriveContinents`) */
  continents?: number[];
}

export interface MapGenOptions {
  width: number;
  height: number;
  seed: number;
  landFraction?: number;
  layout?: 'continents' | 'pangaea' | 'islands';
  resourceMult?: number;
  resourceWeights?: [number, number, number];
  withResources?: boolean;
  withWonders?: boolean;
  withVillages?: boolean;
}
