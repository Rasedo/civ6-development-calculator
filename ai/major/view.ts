/**
 * THE ENGINE AS THE MAJORS' AI READS IT: a read-only view of one game state,
 * in the game's own type names (POLICY_*, CIVIC_*, GOVERNMENT_*,
 * GREAT_PERSON_CLASS_*). The engine implements it (cpu/core/majorView.ts);
 * the AI never touches the engine's state, and what it decides leaves as the
 * per-seat action record the engine applies for any driver. What the value
 * layer reads (the cities, their yields, the government, the yield weights)
 * is the shared `AiValueView`.
 */
import type { AiValueView } from '../../cpu/core/aiValue';
import type { ContractCity } from '../../cpu/core/aiContracts';

export interface MajorSlotView {
  /** the slot's GovernmentSlotType */
  slot: string;
  /** the card slotted, null for an empty slot */
  policy: string | null;
}

/** a map plot as the AI reads it (Plot), in the game's type names */
export interface MajorPlotView {
  index: number;
  x: number;
  y: number;
  water: boolean;
  /** Plot +0x3a bit 3: a mountain, an impassable feature */
  impassable: boolean;
  /** FeatureType, null for none */
  feature: string | null;
  /** ResourceType, null for none */
  resource: string | null;
  /** the seat whose territory holds it, -1 for none */
  owner: number;
  /** a district stands on it, a city centre included */
  district: boolean;
  /** a city centre stands on it, any seat's */
  city: boolean;
  /** the plot's area (AreaBuilder), region (Map_Region, -1 off passable
   *  land) and continent (-1 for the sea) */
  area: number;
  region: number;
  continent: number;
  coastal: boolean;
  freshWater: boolean;
  /** a Lake plot */
  lake: boolean;
}

/** one plot of a unit's planning reach (UnitPlanning): the turn it is
 *  reached in, 1 for this turn, and the Movement left there */
export interface MajorReachView {
  plot: number;
  turns: number;
  moves: number;
}

export interface MajorUnitView {
  /** the engine's unit id */
  id: number;
  /** UnitType */
  type: string;
  plot: number;
  /** Units.FoundCity */
  founder: boolean;
  /** the unit's combat and ranged strengths (the install's), its damage
   *  (0 to 100) and its Movement left (24.8 fixed point, as the reach's) */
  combat: number;
  ranged: number;
  /** the ranged attack's Range, 0 for none */
  range: number;
  damage: number;
  movesLeft: number;
  /** its base Movement (0x56d9f0 with -1: Units.BaseMoves, embarked the
   *  embarked pool), whole */
  baseMoves: number;
  /** its bombard strength, 0 for none */
  bombard: number;
  /** its domain (Units +0x650): land, sea or air */
  domain: 'land' | 'sea' | 'air';
}

/** what a city of the seat produces: the UnitType in its queue's head (null
 *  for anything else) and the turns to finish it */
export interface MajorCityBuildView {
  /** the city's id */
  city: number;
  plot: number;
  unitType: string | null;
  turnsLeft: number;
}

/** a unit of a player at war with the seat, as its danger map reads it:
 *  its combat, ranged and bombard strengths and its attack range */
export interface MajorHostileUnitView {
  id: number;
  plot: number;
  melee: number;
  ranged: number;
  bombard: number;
  range: number;
  air: boolean;
}

/** a city's defence: its combat strength, its ranged strike's strength (0
 *  where it has none) and reach */
export interface MajorCityDefenceView {
  plot: number;
  strength: number;
  ranged: number;
  range: number;
}

/** a city on the map as the AI's knowledge records it (the knowledge
 *  base's entry 0x5ef9a0) */
export interface MajorCityView {
  plot: number;
  owner: number;
  /** the engine's city id (a city-state's one city -1) and whether it is its
   *  owner's capital */
  id: number;
  capital: boolean;
  /** its yields in YieldTypes order (the city's own totals) */
  yields: readonly number[];
  /** its majority religion (the founder's seat), -1 for none */
  religion: number;
  originalCapital: boolean;
  /** the seat that founded it */
  originalOwner: number;
}

/** a governor of the seat's roster (Player_Governors), in the game's type
 *  names: its promotions held (the BaseAbility one with the appointment) and
 *  the city it sits in, a city-state's as its seat with id -1, null for none */
export interface MajorGovernorView {
  type: string;
  appointed: boolean;
  promotions: ReadonlySet<string>;
  city: { seat: number; id: number } | null;
}

/** an entry of the seat's tactical target list (the knowledge base's +0x368
 *  list, 0x783980), in the list's order: its TargetType (cpu/core/tactical's
 *  names), plot, player (-1 for none), its unit's UnitType (null for a target
 *  that is no unit) and the reach its blows have (+0x18: a unit's attack
 *  Range, a district's strike range) */
export interface MajorAttackTargetView {
  type: string;
  plot: number;
  owner: number;
  unitType: string | null;
  range: number;
}

/** one unit's part in an attack assignment (0x776140), in the order the
 *  assignment runs: the plot it stands on, the plot it moves to and the plot
 *  it strikes this turn (-1 none) */
export interface MajorAttackView {
  unit: number;
  from: number;
  move: number;
  attack: number;
}

/** a defensible district of a known city as the knowledge base records it
 *  (the 0x20-byte entries at +0x48, 0x5efaf0: a district with a garrison
 *  pool): its defense strength (+0x14), that strength again where its walls
 *  stand (+0x18, 0 without walls) and its strike strength (+0x1c), whole */
export interface MajorKnownDistrictView {
  plot: number;
  defense: number;
  walls: number;
  strike: number;
}

/** a city the seat's knowledge base holds (the 0xe0-byte entries of
 *  m_knownCities, 0x5ef9a0 / 0x5efaf0) */
export interface MajorKnownCityView {
  plot: number;
  owner: number;
  /** the engine's city id (a city-state's one city -1) */
  id: number;
  /** its citizens (+0x1c) */
  population: number;
  /** its owner's original capital (+0x14), its owner's capital (+0x15) */
  originalCapital: boolean;
  capital: boolean;
  /** its yields in YieldTypes order, whole (+0x30) */
  yields: readonly number[];
  /** the world wonders it holds (0x5eb680) */
  wonders: number;
  districts: readonly MajorKnownDistrictView[];
  /** the resources it holds, by ResourceType, with their counts (+0xc0) */
  resources: readonly { resource: string; count: number }[];
  /** the great works it holds (+0xa8) */
  greatWorks: number;
}

export interface MajorView extends AiValueView {
  /** the map's plots by index */
  plots(): readonly MajorPlotView[];
  /** the same plots in the game's ring walk order (0x69010): the plot, then
   *  each ring from its six corners, each corner walked along its side */
  plotsRing(plot: number, radius: number): readonly number[];
  plotDistance(a: number, b: number): number;
  /** the seat has revealed the plot */
  revealed(seat: number, plot: number): boolean;
  /** a plot's yield of a YieldType as the seat sees it */
  plotYield(seat: number, plot: number, yieldType: string): number;
  /** the seat sees the ResourceType (its PrereqTech) */
  resourceVisible(seat: number, resource: string): boolean;
  /** the plots of the seat's city centres */
  cityPlots(seat: number): readonly number[];
  /** the continent of the seat's original capital, -1 before it has one */
  homeContinent(seat: number): number;
  /** the citizens' Loyalty pressure on a plot from the seat's side (the own
   *  against the foreign term), whole points */
  pressureAt(seat: number, plot: number): number;
  /** the strategies (StrategyType) the seat's AI follows (the value layer's
   *  `followedStrategies`) */
  strategies(seat: number): ReadonlySet<string>;
  leaderType(seat: number): string | null;
  civilizationType(seat: number): string | null;
  units(seat: number): readonly MajorUnitView[];
  /** a unit's planning reach within `turns` on the Movement it has left, in
   *  the pathfinder's order */
  unitReach(unitId: number, turns: number): readonly MajorReachView[];
  /** the plots of a unit's path to `plot`, its own left out, empty for none */
  unitPath(unitId: number, plot: number): readonly number[];
  /** the direction (DirectionTypes) from a plot to its neighbour, -1 for none */
  stepDirection(from: number, to: number): number;
  /** the action record's unit column of a verb (MOVE_0..5, FOUND_CITY), -1
   *  for one the engine does not carry */
  unitActionColumn(name: string): number;
  /** the units of the players at war with the seat (the barbarians always)
   *  that the seat sees now and that carry a combat strength */
  hostileUnits(seat: number): readonly MajorHostileUnitView[];
  /** the cities of the players at war with the seat whose centres it sees now */
  hostileCities(seat: number): readonly MajorCityDefenceView[];
  /** the seat's own cities */
  cityDefences(seat: number): readonly MajorCityDefenceView[];
  readonly turn: number;
  /** the game era, an index into AI_ERAS */
  readonly gameEra: number;
  /** the CivicTypes the seat holds */
  civicsHeld(seat: number): ReadonlySet<string>;
  /** the CivicTypes the seat's civic AI lists with a score above 0 (its
   *  research list); a policy of such a civic is scored before its civic is
   *  held */
  civicList(seat: number): ReadonlySet<string>;
  /** every government the seat has been in */
  governmentsHeld(seat: number): ReadonlySet<string>;
  /** the governments the seat's civics unlock */
  governmentsUnlocked(seat: number): ReadonlySet<string>;
  /** the seat's slots in order, with what each holds */
  slots(seat: number): readonly MajorSlotView[];
  /** the slots as a change to `government` rebuilds them (the old cards laid
   *  back into the new slots) */
  slotsUnder(seat: number, government: string): readonly MajorSlotView[];
  /** the cards the seat may slot under `government` (CanSlot's validity: the
   *  civic, a Dark Age card's window, a legacy card, the World Congress's
   *  ban, a government's exclusive card) */
  policiesSlottableUnder(seat: number, government: string | null): ReadonlySet<string>;
  darkAge(seat: number): boolean;
  goldenAge(seat: number): boolean;
  /** a great person of the class is still to be earned in the game */
  greatPersonClassAvailable(cls: string): boolean;
  /** the action record's column for a PolicyType / GovernmentType, -1 for
   *  one the engine does not carry */
  policyColumn(type: string): number;
  governmentColumn(type: string): number;
  /** the action record's pantheon row for a pantheon BeliefType, -1 for one
   *  the engine does not carry */
  pantheonColumn(type: string): number;
  /** the action record's [class, catalog row] for a religion's BeliefType,
   *  null for one the engine does not carry */
  beliefColumn(type: string): readonly [number, number] | null;
  /** the action record's religion row for a ReligionType, -1 for one the
   *  engine does not carry */
  religionColumn(type: string): number;
  /** the ReligionTypes some seat has founded */
  religionsFounded(): ReadonlySet<string>;
  /** the seat may found a pantheon now: none yet, the price in its Faith, a
   *  pantheon belief left */
  pantheonOpen(seat: number): boolean;
  /** the seat may found its religion now (`canFoundReligion`) */
  religionOpen(seat: number): boolean;
  /** the beliefs an enhancement of the seat's religion adopts now */
  beliefPicks(seat: number): number;

  // THE DIPLOMATIC VIEW (ai/major/diplomacy.ts). Seats are the engine's: a
  // major's seat, a city-state's seat, the Free Cities' and the barbarians'.
  /** every player in the game in seat order: the majors, the city-states,
   *  the Free Cities (where the game holds them) and the barbarians */
  players(): readonly number[];
  /** the seat's LeaderType, null for a seat with no leader */
  leader(seat: number): string | null;
  /** the turn `seat` met `other`, null while they have not met */
  metTurn(seat: number, other: number): number | null;
  /** turns the pair has been at peace since their last war (or since they
   *  met when they never fought) */
  peaceTurns(seat: number, other: number): number;
  /** a Diplomatic Delegation / a Resident Embassy `sender` holds with `receiver` */
  hasDelegation(sender: number, receiver: number): boolean;
  hasEmbassy(sender: number, receiver: number): boolean;
  /** open borders `grantor` grants `guest` */
  hasOpenBorders(grantor: number, guest: number): boolean;
  /** the seat's citizens */
  population(seat: number): number;
  /** the world wonders the seat has built */
  wondersBuilt(seat: number): number;
  /** the great people the seat has earned */
  greatPeopleEarned(seat: number): number;
  /** the plots the seat owns */
  plotsOwned(seat: number): number;
  /** the religion most of the seat's cities follow, null for none */
  majorityReligion(seat: number): number | null;
  /** every belief a pantheon or a religion holds (BeliefTypes) */
  beliefsHeld(): ReadonlySet<string>;
  /** the beliefs of the religion the seat founded (BeliefTypes), none
   *  before it founds one */
  religionBeliefs(seat: number): readonly string[];
  /** the trade routes running between the two seats' cities, either way */
  tradeRoutesBetween(a: number, b: number): number;
  /** the city-states' seats */
  cityStateSeats(): readonly number[];
  /** the seat's military units of a DomainType */
  militaryUnits(seat: number, domain: string): number;

  // THE VICTORY MANAGER'S CONDITIONS (ai/major/strategies.ts)
  /** every city on the map, any seat's */
  mapCities(): readonly MajorCityView[];
  /** the plots the seat sees now */
  plotsSeen(seat: number): ReadonlySet<number>;
  /** the start plot of every player that has one (the majors' first
   *  settlers', the city-states' centres) */
  startPlots(): readonly { plot: number; seat: number }[];
  /** the seat's handicap, a Difficulties index */
  handicap(seat: number): number;
  techCount(seat: number): number;
  /** the technologies the seat holds, install types */
  techsHeld(seat: number): ReadonlySet<string>;
  /** PlayerStats' m_iMilitaryStrength (0x4bb1e0) */
  militaryStrength(seat: number): number;
  /** the seat's gold in its treasury */
  treasury(seat: number): number;
  /** the mission `owner` may send `other` now, as the game's CanDoAction
   *  reads it (the civic, none held, the price in the treasury, a state
   *  that lists it): DIPLOACTION_DIPLOMATIC_DELEGATION or
   *  DIPLOACTION_RESIDENT_EMBASSY, null for none */
  missionOpen(owner: number, other: number): string | null;
  /** the game's CanDoAction of a DiplomaticActionType from `owner` to
   *  `other` as the engine carries it (the missions, Open Borders, the
   *  friendship, the alliance, the denouncement), null for an action it does
   *  not carry */
  actionOpen(owner: number, other: number, action: string): boolean | null;
  /** the game's CanDeclareWarOn from `owner` on `other`: a surprise war, or a
   *  formal one with `formal`; on a city-state its own war */
  warOpen(owner: number, other: number, formal: boolean): boolean;
  /** the pair's standing declared friendship (the alliance: `allied`) */
  declaredFriends(a: number, b: number): boolean;
  /** the seat's diplomatic favor */
  favor(seat: number): number;
  /** the target the engine's own congress line names for the seat on a
   *  resolution (the engine's CONGRESS_RESOLUTIONS index) */
  congressTarget(seat: number, resolution: number): number;
  /** the targets an engine resolution offers the seat now, the engine's
   *  indices in the game's order (`congressTargets`); the Diplomatic
   *  Victory resolution's by its install type */
  congressTargets(seat: number, resolution: number): readonly number[];
  congressTargetsOf(seat: number, type: string): readonly number[];
  /** a city-state's MinorCivBonusType and its suzerain (-1 none) */
  cityStateBonus(cs: number): string | null;
  suzerain(cs: number): number;
  /** the seat's Great Works per GreatWorkObjectType row, over its cities */
  greatWorksByObject(seat: number): readonly number[];
  /** a city's Housing */
  cityHousing(seat: number, cityId: number): number;
  /** the Great Person points the seat holds toward a class
   *  (GREAT_PERSON_CLASS_*), and the price of the person offered */
  greatPersonPoints(seat: number, cls: string): number;
  greatPersonPrice(cls: string): number;
  /** the cities, any seat's, following the religion the seat founded */
  religionFollowers(seat: number): number;
  /** the BuildingTypes a city may construct now (`availableBuildings`) */
  cityBuildable(seat: number, cityId: number): ReadonlySet<string>;
  /** a unit type's PromotionClassType, null for none */
  unitPromotionClass(unitType: string): string | null;
  score(seat: number): number;
  /** the great people of a class (GREAT_PERSON_CLASS_*) the seat has earned */
  greatPeopleOfClass(seat: number, cls: string): number;
  /** a great person of the class stands offered now */
  greatPersonOffered(cls: string): boolean;
  /** the price of patronizing the standing person of class `cls` with Gold
   *  or Faith where the player may (0x2f26c0: a person stands, the player
   *  may earn the class and has not passed on its person, its purse holds
   *  the price), else -1 */
  greatPersonPatronage(seat: number, cls: string, currency: 'gold' | 'faith'): number;
  /** the player's Faith */
  faith(seat: number): number;
  /** whether class `cls`'s standing person could act on some plot the
   *  player has revealed (0x561070, the activation's test per plot) */
  greatPersonUsable(seat: number, cls: string): boolean;
  /** the great works the seat's civilization made, wherever they hang */
  greatWorksMade(seat: number): number;
  /** the seat's domestic tourists (+0x10b0) and the tourists it draws from
   *  the majors it has met (0x39bee0) */
  domesticTourists(seat: number): number;
  visitingTourists(seat: number): number;
  /** the world wonders the seat's cities hold that carry a Science yield */
  scienceWonders(seat: number): number;
  /** the space race projects the seat has completed */
  spaceProjects(seat: number): number;
  // THE OPERATIONS' VIEW (ai/major/operations/)
  /** what each of the seat's cities produces */
  cityBuilds(seat: number): readonly MajorCityBuildView[];
  /** the seat's cities as the contracts read them (aiContracts.ts): the
   *  item each produces, what it may train, its turns to build an item; the
   *  CityBuildAI's threat flag (+0x1b8), its production turn (+0x2600) and its
   *  values (+0xa48, the analysis) unread for a major and none */
  contractCities(seat: number): readonly ContractCity[];
  /** the seat's best combat strength (PlayerStats +0xf0, 0x4d9320: the
   *  strongest melee strength it has trained, m_iMaxMeleeStrengthTrained) */
  bestCombatStrength(seat: number): number;
  /** the player's units the seat sees now (its own: all of them) */
  knownUnits(seat: number, player: number): readonly MajorUnitView[];
  /** the barbarians' seat */
  barbarianSeat(): number;
  /** the units on the plot of the players not at war with the seat, its own
   *  left out */
  plotForeignUnits(seat: number, plot: number): number;
  /** the citizens of the city whose centre is the plot, 0 for none */
  cityPopulation(plot: number): number;

  // THE GOVERNOR AI'S VIEW (ai/major/governors.ts)
  /** the seat's governors, one per GovernorType the engine carries */
  governors(seat: number): readonly MajorGovernorView[];
  /** the governor is open to the seat (0x4316f0: no TraitType, or one its
   *  civilization or leader holds) */
  governorAvailable(seat: number, type: string): boolean;
  /** the Governor Titles the seat holds unspent */
  governorTitles(seat: number): number;
  /** the seat may promote the governor with the GovernorPromotionType now
   *  (0x431400: appointed, a title, not held, its prerequisites) */
  governorCanPromote(seat: number, type: string, promotion: string): boolean;
  /** an own city's Loyalty a turn (0x19d200), fixed point */
  cityLoyaltyPerTurn(seat: number, cityId: number): number;
  /** the city-state holds its city */
  cityStateHasCity(cityState: number): boolean;
  // THE WAR OPERATIONS' VIEW
  /** the cities the seat's knowledge base holds: every city whose centre the
   *  seat has revealed, its own included */
  knownCities(seat: number): readonly MajorKnownCityView[];
  /** the seat's own citizens' Loyalty pressure on a plot less every other
   *  player's (0x19d470 with its byte set: 0x1a1ae0's raw own - foreign),
   *  in pressure units */
  pressureLead(seat: number, plot: number): number;
  /** the plot's owner keeps the seat's units out (its borders enforced, no
   *  open borders, no alliance, no war between them) */
  borderClosed(seat: number, plot: number): boolean;
  /** the seat has denounced the player (Player_Diplomacy 0x3da8e0) */
  denounced(seat: number, player: number): boolean;
  /** the city centre's hit points on the plot: its most and its damage,
   *  null where no city stands there */
  cityHitPoints(plot: number): { max: number; damage: number } | null;
  /** the hit points a unit's blow would take from the city on the plot as
   *  its planning predicts it (0x791470's district branch), 0 where its
   *  planning holds no plot to strike the city from within two turns */
  cityBlow(unitId: number, plot: number): number;
  /** the seat's tactical target list */
  attackTargets(seat: number): readonly MajorAttackTargetView[];
  /** the attack assignment (0x776140) of the seat's units over the targets
   *  of its tactical target list `keep` picks (by index): `even` drops a
   *  plot where the blow and the blow back take more of the unit than they
   *  deal, `survive` one where they would kill it (neither against a HIGH
   *  target) */
  attackAssignment(seat: number, units: readonly number[], keep: (index: number) => boolean, even: boolean, survive: boolean): readonly MajorAttackView[];
  /** the unit action column that strikes the plot from where the unit stands
   *  (ATTACK_d beside it, SNIPE_k / SNIPE3_k at range), -1 for none */
  strikeColumn(unitId: number, plot: number): number;
  // THE WAR DESIRES' VIEW (ai/major/operations/warValue.ts)
  /** the unit a civilian of the install type becomes captured
   *  (UnitCaptures BecomesUnitType), null for none */
  capturedAs(unitType: string): string | null;
  /** the military AI's yardstick B: max(1, the strongest melee trained,
   *  max(the strongest ranged trained, COMBAT_MINIMUM_CITY_STRIKE_STRENGTH)) */
  militaryYardstick(seat: number): number;
  /** the seat's weapons of mass destruction held */
  wmdCount(seat: number): number;
  /** the city-state's suzerain, -1 none */
  suzerainOf(cityState: number): number;
  /** the most envoys any player holds in the city-state
   *  (GetMostTokensReceived 0x44c4b0) */
  mostEnvoys(cityState: number): number;
  // THE ASSAULT EXECUTIONS' VIEW
  /** the unit planning's spot for a plot (0x791300 -> 0x78fa10): the first
   *  plot of its reach (in the planning's order) exactly `range` from the
   *  plot, within `turns`, with Movement left there where `needMoves` asks,
   *  that no other unit of its kind holds (its own plot aside); -1 none */
  planSpot(unitId: number, plot: number, turns: number, needMoves: boolean, range: number): number;
  /** the unit planning's spots against the target on the plot (its entry,
   *  +0x48): each spot and its turns, in the planning's order */
  attackSpots(unitId: number, plot: number): readonly { plot: number; turns: number }[];
  /** the units on the plot (Plot +0x4c) */
  plotUnitCount(plot: number): number;
  /** the plot beside one in the game's direction (0 NORTHEAST .. 5
   *  NORTHWEST), -1 off the map */
  adjacentPlot(plot: number, dir: number): number;
  /** a river runs on the plot's edge in the game's direction */
  riverEdge(plot: number, dir: number): boolean;
  /** the city centre on the plot is encircled (its heal stopped) */
  encircled(plot: number): boolean;
  /** the unit planning's reach of a plot (0x793300): its turns and its
   *  Movement left there; null out of reach */
  reachOf(unitId: number, plot: number): { turns: number; moves: number } | null;
  /** the unit exerts a zone of control (0x56d6c0: not embarked, +0x1410) */
  exertsZoc(unitId: number): boolean;
  /** the improvements Improvements marks CanBuildOutsideTerritory with a
   *  DefenseModifier (+0x108 bit 0x40, +0x34 above 0), install types */
  defensiveImprovements(): readonly string[];
  /** the air unit's strike on the plot (AIR_STRIKE_k, or AIR_PILLAGE_k on
   *  an improvement) as its action column, -1 out of its reach */
  airStrikeColumn(unitId: number, plot: number, improvement: boolean): number;
  /** the plots the air unit may rebase to, each with its action column */
  rebaseOptions(unitId: number): readonly { plot: number; column: number }[];
  /** the unit's build charges left (+0xed0) */
  buildCharges(unitId: number): number;
  /** the unit is of the improvement's ValidBuildUnits and the seat may build
   *  it (0x35ede0: its unlock) */
  unitBuildsImprovement(seat: number, unitId: number, improvement: string): boolean;
}
