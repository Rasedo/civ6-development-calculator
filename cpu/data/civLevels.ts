/**
 * THE INSTALL'S `CivilizationLevels` TABLE, VERBATIM.
 *
 * SOURCED: `Base/Assets/Gameplay/Data/Civilizations.xml` (TRIBE, CITY_STATE,
 * FULL_CIV) layered with Expansion1's and Expansion2's own
 * `Data/Expansion1_Civilizations.xml`
 * (FREE_CITIES). Ten columns, one row per class of player, and it is the only
 * place the install says in DATA what a city-state, a barbarian tribe or the
 * Free Cities player may not do.
 *
 * It is a CAPABILITY table, not a behaviour: every column is a permission a
 * rule elsewhere must ask about. `canAnnexTilesWithCulture` is the one this
 * engine reads at a live fork — a city-state's culture box banks and never
 * claims ground, which is NOT what "a minor's city works like any other"
 * would suggest and is exactly why the table is worth carrying literally.
 * The rest are asserted against the engine's own shape in
 * `tests/cpu/minors/civ-levels.test.ts`, so a rule that grows a new reader
 * has a row to consult rather than a guess to make.
 */
export type CivLevelId = 'TRIBE' | 'CITY_STATE' | 'FULL_CIV' | 'FREE_CITIES';

export interface CivLevelDef {
  /** may found NEW cities with a Settler */
  readonly canFoundCities: boolean;
  /** a city's culture box claims a tile — FALSE for everyone but a full civ */
  readonly canAnnexTilesWithCulture: boolean;
  /** may buy a tile with gold */
  readonly canAnnexTilesWithGold: boolean;
  /** takes ground from influence SPENT ON IT (the envoy channel) */
  readonly canAnnexTilesWithReceivedInfluence: boolean;
  readonly canEarnGreatPeople: boolean;
  readonly canGiveInfluence: boolean;
  readonly canReceiveInfluence: boolean;
  readonly canBuildWonders: boolean;
  /** tiles a city of this class starts with */
  readonly startingTilesForCity: number;
  /** trains resource-gated units without paying the stockpile */
  readonly ignoresUnitStrategicResourceRequirements: boolean;
}

export const CIV_LEVELS: Readonly<Record<CivLevelId, CivLevelDef>> = {
  TRIBE: {
    canFoundCities: false,
    canAnnexTilesWithCulture: false,
    canAnnexTilesWithGold: false,
    canAnnexTilesWithReceivedInfluence: false,
    canEarnGreatPeople: false,
    canGiveInfluence: false,
    canReceiveInfluence: false,
    canBuildWonders: false,
    startingTilesForCity: 0,
    ignoresUnitStrategicResourceRequirements: true,
  },
  CITY_STATE: {
    canFoundCities: false,
    canAnnexTilesWithCulture: false,
    canAnnexTilesWithGold: false,
    canAnnexTilesWithReceivedInfluence: true,
    canEarnGreatPeople: false,
    canGiveInfluence: false,
    canReceiveInfluence: true,
    canBuildWonders: false,
    startingTilesForCity: 5,
    ignoresUnitStrategicResourceRequirements: true,
  },
  FULL_CIV: {
    canFoundCities: true,
    canAnnexTilesWithCulture: true,
    canAnnexTilesWithGold: true,
    canAnnexTilesWithReceivedInfluence: false,
    canEarnGreatPeople: true,
    canGiveInfluence: true,
    canReceiveInfluence: false,
    canBuildWonders: true,
    startingTilesForCity: 6,
    ignoresUnitStrategicResourceRequirements: false,
  },
  FREE_CITIES: {
    canFoundCities: false,
    canAnnexTilesWithCulture: false,
    canAnnexTilesWithGold: false,
    canAnnexTilesWithReceivedInfluence: false,
    canEarnGreatPeople: false,
    canGiveInfluence: false,
    canReceiveInfluence: false,
    canBuildWonders: false,
    startingTilesForCity: 0,
    ignoresUnitStrategicResourceRequirements: false,
  },
};

/** WIRE ORDER — append only. The GPU indexes its per-row capability vectors
 *  by this position, so a new class goes at the END. */
export const CIV_LEVEL_ORDER: readonly CivLevelId[] = [
  'TRIBE', 'CITY_STATE', 'FULL_CIV', 'FREE_CITIES',
];
