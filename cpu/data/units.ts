/**
 * Unit types. SOURCED: every row's cost, maintenance, movement, combat,
 * ranged stats and charges fetched one by one from the GS Civilopedia
 * (GENERAL/ADMIRAL excepted — support chassis this model prices at 0 by
 * design; great people arrive by points, never production).
 */

import { GAME_SPEED, scaleByGameSpeed } from './constants';
import { TECHS, ERAS } from './techs';
import { CIVICS } from './civics';
import type { CivId } from './seats';
import { srcConst, xml, type SrcMap } from './provenance';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

/**
 * FORMATIONS, indexed by tier: 0 a lone unit, 1 a Corps (a Fleet at sea), 2 an
 * Army (an Armada). CIV6 (Formations): after Nationalism "two military units
 * of the same type will be able to combine to create a Corps", and after
 * Mobilization "three units of the same type may be combined into an Army";
 * "the experience and promotions of the highest experience unit is preserved",
 * and "once a Corps or Army has been formed, the units may not be broken apart
 * into individual units again". The two magnitudes are the game's own
 * GlobalParameters COMBAT_CORPS_STRENGTH_MODIFIER and
 * COMBAT_ARMY_STRENGTH_MODIFIER; each raises Combat, Ranged and Bombard
 * Strength alike, embarked included.
 */
export const FORMATION_CS: readonly number[] = [
  srcConst('combat.formationCs.0', 0,
    { derived: 'a LONE unit takes no formation modifier — the install carries a strength modifier only for the Corps and the Army' }),
  srcConst('combat.formationCs.1', 10, gp('COMBAT_CORPS_STRENGTH_MODIFIER')),
  srcConst('combat.formationCs.2', 17, gp('COMBAT_ARMY_STRENGTH_MODIFIER')),
];

/** the civic each tier waits on — index by the tier being FORMED. */
export const FORMATION_CIVIC: readonly string[] = ['', 'NATIONALISM', 'MOBILIZATION'];

export const FORMATION_MAX = 2;

/** CIV6 (Military Academy, Seaport): the building lets its city train a
 *  formation DIRECTLY — a Corps or Army from the Academy, a Fleet or Armada
 *  from the Seaport — once the formation's own civic is in. The order costs
 *  UNIT_CORPS_COST_MODIFIER 1.5 of the unit for the two-step and
 *  UNIT_ARMY_COST_MODIFIER 2.0 for the three-step (GlobalParameters.xml — the
 *  civilopedia's "225%" is contradicted by the table), and the enabling
 *  building takes 25% off that price. */
export const FORMATION_COST_MULT: readonly number[] = [
  srcConst('combat.formationCostMult.0', 1,
    { derived: 'a LONE unit pays the chassis price — the install carries a cost modifier only for the Corps and the Army' }),
  srcConst('combat.formationCostMult.1', 1.5, gp('UNIT_CORPS_COST_MODIFIER')),
  srcConst('combat.formationCostMult.2', 2.0, gp('UNIT_ARMY_COST_MODIFIER')),
];
/** CIV6 (Formations, two agreeing secondary sources — the Gathering Storm
 *  strategic-resources guide and the Unit page): a Corps costs DOUBLE the
 *  chassis' strategic resource up front and an Army TRIPLE, maintenance
 *  unchanged. No install row carries it. Indexed by formation tier.
 *  A merge (`formUp`) pays nothing — only a DIRECT train charges. */
export const FORMATION_RESOURCE_MULT: readonly number[] = srcConst(
  'combat.formationResourceMult', [1, 2, 3] as const, {
    stylized: 'CIV6 (Formations), TWO AGREEING SECONDARY SOURCES and no install row: the Gathering Storm strategic-resources guide and the Unit page both say a Corps costs DOUBLE the chassis\' strategic resource up front and an Army TRIPLE, maintenance unchanged',
  });

export const FORMATION_TRAIN_DISCOUNT = srcConst('combat.formationTrainDiscount', 0.75, {
  derived: '1 - Amount/100 — the enabling building\'s own CORPS_ARMY discount of 25 percentage points (the Military Academy on land, the Seaport at sea; both rows carry 25)',
  inputs: [
    xml('ModifierArguments',
      'ModifierId=MILITARY_ACADEMY_TRAINED_CORPS_ARMY_DISCOUNT&Name=Amount', 'Value'),
    xml('ModifierArguments',
      'ModifierId=SEAPORT_TRAINED_CORPS_ARMY_DISCOUNT&Name=Amount', 'Value'),
  ],
});
/** the install names each building as a formation-train discount carrier through its own
 *  `BuildingModifiers` row (`MODIFIER_CITY_CORPS_ARMY_ADJUST_DISCOUNT`). */
export const FORMATION_TRAIN_BUILDING = {
  land: srcConst('militaryAcademyBidx', 'MILITARY_ACADEMY',
    xml('BuildingModifiers',
      'BuildingType=BUILDING_MILITARY_ACADEMY&ModifierId=MILITARY_ACADEMY_TRAINED_CORPS_ARMY_DISCOUNT',
      'BuildingType', { expect: 'BUILDING_MILITARY_ACADEMY' })),
  naval: srcConst('seaportBidx', 'SEAPORT',
    xml('BuildingModifiers',
      'BuildingType=BUILDING_SEAPORT&ModifierId=SEAPORT_TRAINED_CORPS_ARMY_DISCOUNT',
      'BuildingType', { expect: 'BUILDING_SEAPORT' })),
} as const;

export interface UnitDef {
  id: string;
  name: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts): the install row and
   *  column each number came from, `expect` where the install spells an id
   *  differently, `scale: GAME_SPEED` on a cost. Stripped by the exporter;
   *  checked by tools/civ6lab/xml_check.py. */
  src?: SrcMap;
  cost: number;
  maintenance: number;
  moves: number;
  combat: number;
  ranged?: { strength: number; range: number };
  charges?: number;
  requiresTech?: string;
  requiresCivic?: string;
  requiresResource?: string;
  /** GS: what ONE of this unit takes out of the seat's stockpile when its
   *  production starts. A PRODUCTION resource (Horses, Iron, Niter) charges
   *  `UNIT_RESOURCE_COST`; a FUEL one charges 1 and then bills `resourceUpkeep`
   *  every turn the unit lives. */
  resourceCost?: number;
  resourceUpkeep?: number;
  /** the chassis this one upgrades INTO. Real Civ 6 upgrades a unit in
   *  friendly territory, with movement left, for gold and for whatever
   *  strategic resource the NEW chassis asks. */
  upgradesTo?: string;
  /** the ANTI-AIR strength — the stat an air strike is answered with. */
  antiAir?: number;
  /** how far a parked anti-air WEAPON answers over. CIV6 (Anti-Air Gun):
   *  "Provides cover from air attacks up to 1 hex away from the weapon",
   *  Range 1. A hull carries no such range: its Anti-Air Strength is its own
   *  close-range defence and covers nothing but the hex it floats on. */
  antiAirRange?: number;
  /** the GIANT DEATH ROBOT: its own class in every rule that names one. */
  gdr?: boolean;
  /** CIV6 (Giant Death Robot): "Can only heal in friendly territory." */
  healFriendlyOnly?: boolean;
  /** CIV6 (Giant Death Robot): "Can move and fight in Ocean and Coast tiles as
   *  it would on land." Such a chassis never embarks — it keeps its own
   *  Movement and its own Combat Strength out there, and asks no seafaring
   *  tech for the water it crosses. */
  waterWalk?: boolean;
  /**
   * AIR: this chassis lives at a BASE and strikes from it. CIV6 (Air combat):
   * "all air attacks are ranged, and the attacking plane doesn't suffer damage
   * in return"; a FIGHTER's ranged damage is "effective against land units,
   * but not against cities and naval units" and a BOMBER's bombard damage is
   * "effective against cities and naval units but not against land units".
   * `ranged.range` is the OPERATIONAL range, measured from the base.
   */
  air?: 'FIGHTER' | 'BOMBER';
  /** air-unit slots this chassis provides as a base (the Aircraft Carrier). */
  airSlots?: number;
  /** CIV6 (Units.xml, COST_PROGRESSION_PREVIOUS_COPIES): each copy the seat
   *  has already acquired raises the next one's Cost by this flat
   *  `CostProgressionParam1`. Scaled by `GAME_SPEED` exactly as `cost` is.
   *  Absent = a flat price forever. */
  costStep?: number;
  /** a building the TRAINING city must already hold (the Military Engineer's
   *  Armory). Per-CITY, so it is enforced in `trainableUnits`. */
  requiresBuilding?: string;
  /** a NAVAL unit lives on water natively (never `embarked`);
   * passability/spawn/combat branch on it. Default false. */
  naval?: boolean;
  /** CIV 6 unit class: LIGHT cavalry (Horseman) and HEAVY cavalry (Knight).
   * The pair real suzerain/policy text addresses as "light and heavy
   * cavalry"; nothing else in this roster is mounted. */
  cavalry?: boolean;
  /** CIV6 (Units.xml PromotionClass): which cavalry tag this chassis carries.
   *  A ROSTER clause may name one and not the other — People of the Steppe
   *  copies CLASS_LIGHT_CAVALRY and nothing else. A `cavalry` chassis whose
   *  install class is RANGED (the two chariot archers) carries no tag. */
  cavalryTag?: 'light' | 'heavy';
  /** CIV 6 unit class: MELEE (Warrior, Swordsman, Musketman) — the first of
   * the two classes a Battering Ram or a Siege Tower helps. */
  melee?: boolean;
  /** CIV 6 unit class: ANTI-CAVALRY (Spearman, Pikeman). The second class a
   * Battering Ram or a Siege Tower helps — "both support units are effective
   * for melee and anti-cavalry class units only". */
  antiCavalry?: boolean;
  /**
   * BOMBARD STRENGTH — the stat a siege unit brings against a city or a
   * defensible district, at FULL damage: "only units with attacks that use
   * Bombard Strength ... may help breach city defenses", and siege units
   * "always do full damage to them". `ranged.strength` carries the same
   * number minus 17, which is what the unit brings against a land unit.
   */
  bombard?: number;
  /**
   * The siege SUPPORT chassis. A RAM adjacent to the target "negates the
   * penalty completely", so an adjacent melee or anti-cavalry attacker hits
   * the perimeter at full; a TOWER lets that attacker "bypass Walls and hit
   * the city directly". Neither helps a ranged or a cavalry attacker.
   */
  siegeSupport?: 'RAM' | 'TOWER';
  /** the highest walls tier this chassis still works against — Gathering
   * Storm's "upgraded walls also gain engineering qualities which negate the
   * effects of support units". */
  siegeMaxWalls?: number;
  /** faith-purchase-only (MISSIONARY) — never offered by trainableUnits,
   * so it can't be queued or gold-purchased by either seat. */
  faithOnly?: boolean;
  /**
   * RELIGIOUS STRENGTH — the stat theological combat resolves on.
   * Only units that carry it can take part, and CIV6 lets only the APOSTLE
   * and the INQUISITOR initiate: "Missionaries and Gurus may become the target
   * of such an attack, but they may not initiate it themselves."
   * CIV6 magnitudes, exact: Apostle 110, Missionary 100, Inquisitor 70.
   */
  religiousStrength?: number;
  /** spawn-ONLY chassis (GENERAL/ADMIRAL) — never trainable,
   * gold-purchasable, or faith-buyable; the only birth path is the
   * Great-General/Admiral claim (applyGreatPersonEffect + the mirror).
   * trainableUnits filters it out on every seat, exactly like faithOnly. */
  spawnOnly?: boolean;
  settler?: boolean;
  /** the route-servicing civilian (TRADER) — spent by the route verb, walks
   * the route, returned at completion. trainableUnits caps its count at the
   * seat's trade capacity (free traders + active routes), the real Civ 6
   * rule; its live price is traderCost(), progressive with game progress. */
  trader?: boolean;
  /** the NATIONAL PARK civilian (NATURALIST) — real Civ 6 sells it for
   * FAITH ONLY, in any city, so it never joins a production column. Consumed
   * when it designates a park. */
  naturalist?: boolean;
  /** CIV 6 unit class: BUILDER — the improvement civilian Ilkum, Public Works
   *  and Serfdom address by name. Charges alone do not name it: a Military
   *  Engineer, an Apostle and an Archaeologist all carry some. */
  builder?: boolean;
  /** CIV 6 unit class: RECON (Scout). The class Survey doubles experience
   *  for, and the only class in this roster with no combat role. */
  recon?: boolean;
  /** CIV6 unit ability STEALTH: "Remains hidden from units more than 1 hex
   *  away." The NAVAL RAIDER class carries it, and the class page adds the
   *  two exceptions: it stays hidden beside a City Center or an Encampment
   *  "as long as they don't attack and there's no unit in the district", and
   *  "if a stealth unit attacks, it will become visible for a turn". */
  stealth?: boolean;
  /** CIV6 unit ability REVEAL STEALTH: "Reveal stealth units on the map
   *  within sight range." Held by every raider plus the Scout and the
   *  Destroyer. */
  revealStealth?: boolean;
  /** CIV6: "Ignores enemy zone of control" — the mover is never halted. */
  ignoresZoc?: boolean;
  /** CIV6: the NAVAL RAIDER class — "Can perform Coastal Raids." */
  raider?: boolean;
  /** CIV6: "Does not exert zone of control" — the two submarines neither
   *  halt a passing enemy nor count toward a city's encirclement. */
  exertsNoZoc?: boolean;
  /** the chassis's own SIGHT, when it differs from `SIGHT_RANGE` (the
   *  Destroyer's "Has Sight of 3"). Reveal Stealth reaches this far. */
  sight?: number;
  /** CIV6 (Units.xml, `FormationClass="FORMATION_CLASS_SUPPORT"`): this
   *  chassis holds the SUPPORT stacking slot rather than the civilian one, so
   *  one tile carries a military unit, a civilian AND one of these — Civ 6's
   *  three-member formation. A STACKING fact only: everything else these rows
   *  do is what a civilian does, which `unitIsNoncombat` names. */
  support?: boolean;
  /** the ESPIONAGE civilian. It never walks — it jumps between revealed
   *  cities and runs one mission at a time out of a district. */
  spy?: boolean;
  /** CIV6 (Spy): "Cannot be purchased with Gold." */
  noGold?: boolean;
  /** CIV6 (Civilizations.xml): a UNIQUE UNIT — trainable by this
   *  civilization alone, standing in place of `replaces` where it names
   *  a chassis (`civUnitAllowed`, `civUpgradeTarget`). */
  uniqueTo?: CivId;
  /** ...and, for a LEADER unique (TRAIT_LEADER_UNIT_*), the leader alone:
   *  Victoria's Redcoat is not Eleanor's England's. */
  uniqueLeader?: string;
  replaces?: string;
  /** CIV6 (CLASS_HEAVY_CHARIOT / CLASS_LIGHT_CHARIOT): a chariot is
   *  cavalry for its promotion class and the production cards, but the
   *  install's ANTI_CAVALRY_OPPONENT_REQUIREMENTS and ABILITY_IGNORE_ZOC
   *  name only the light, heavy and ranged cavalry tags. */
  chariot?: boolean;
  /** CIV6 (EFFECT_ADJUST_UNIT_CLEAR_TERRAIN_START_MOVEMENT): extra Movement
   *  when the turn starts on flat Desert, Plains, Grassland or Tundra. */
  openTerrainMoves?: number;
  /** CIV6 (Berserker Movement): extra Movement when the turn starts in
   *  enemy territory. */
  enemyTerritoryMoves?: number;
  /** CIV6 (Longship Movement): extra Movement while in coastal waters. */
  coastMoves?: number;
  /** CIV6 (Berserker Rage): Combat Strength when attacking, and when
   *  defending against a melee attack. */
  attackCS?: number;
  defendMeleeCS?: number;
  /** CIV6 (Legion): "Can build a Roman Fort" — a Fort in every stat,
   *  laid with the chassis' own charge and no tech. */
  fortBuilder?: boolean;

  // ---- UNIQUE-UNIT ABILITIES (UnitAbilities.xml, one field per clause) ----
  /** CIV6 (Khevsureti, Highlander): Combat Strength on named ground. The
   *  install spells each as one ability with its own terrain list. */
  groundCS?: { amount: number; hills?: boolean; features?: readonly string[] };
  /** CIV6 (Khevsureti, Ngao Mbeba): "No Movement penalty in X terrain" — the
   *  named ground costs this chassis a plain move. */
  ignoresHillCost?: boolean;
  ignoresWoodsCost?: boolean;
  /** CIV6 (Ngao Mbeba, MODIFIER_PLAYER_UNIT_ADJUST_SEE_THROUGH_FEATURES): the
   *  chassis looks THROUGH features — Sentry's CanSee on a unit row. */
  seesThrough?: boolean;
  /** CIV6 (Hoplite): "+10 Combat Strength if there is at least one Hoplite
   *  adjacent" — the SAME chassis, this seat's own. */
  adjacentSameCS?: number;
  /** CIV6 (Varu, Toa): "Adjacent enemy units receive -5 Combat Strength" — a
   *  penalty this chassis lays on its neighbours, not a bonus it takes. */
  adjacentEnemyCS?: number;
  /** CIV6 (Ngao Mbeba): "+10 Combat Strength when defending against ranged
   *  units." */
  defendRangedCS?: number;
  /** CIV6 (Samurai): "This unit does not suffer combat penalties when
   *  damaged" — `woundPenalty` reads zero for it. */
  noWoundPenalty?: boolean;
  /** CIV6 (Carolean): "+3 Combat Strength per unused Movement." */
  unusedMoveCS?: number;
  /** CIV6 (Huszár): "+3 Combat Strength from each active Alliance." */
  allianceCS?: number;
  /** CIV6 (Cossack, Malón Raider): Combat Strength within `range` tiles of
   *  this seat's own territory. The Cossack's "in or adjacent to" is range 1;
   *  the Raider's "within 4 hexes of friendly territory" is range 4. */
  nearTerritoryCS?: { amount: number; range: number };
  /** CIV6 (Garde Impériale): "+10 Combat Strength when on the same continent
   *  as the Capital." */
  homeContinentCS?: number;
  /** CIV6 (Conquistador): "+10 Combat Strength when there is a religious unit
   *  within one hex." */
  nearReligiousCS?: number;
  /** CIV6 (Mountie): "+5 Combat Strength when fighting within 2 tiles of a
   *  National Park owned by you." */
  nearParkCS?: number;
  /** CIV6 (Mamluk): "This unit heals every turn, even after moving or
   *  combat." */
  healsAlways?: boolean;
  /** CIV6 (Cossack): "Can move after attacking." */
  moveAfterAttack?: boolean;
  /** CIV6 (Hwacha, ABILITY_NO_MOVE_AND_SHOOT): "Cannot move and attack in the
   *  same turn." */
  noMoveAndShoot?: boolean;
  /** CIV6 (Warak'aq, ABILITY_EXPERT_MARKSMAN): "+1 additional attack per turn
   *  if unit has not used all its movement." */
  extraAttack?: boolean;
  /** CIV6 (Impi): "+100% Flanking bonus" — a multiplier on the flanking term
   *  this chassis takes as the attacker. */
  flankMult?: number;
  /** CIV6 (Impi): "Earns experience 25% faster" — a multiplier on every
   *  experience award. */
  xpRate?: number;
  /** CIV6 (Okihtcitaw): "Starts with 1 free Promotion." */
  freePromotions?: number;
  /** CIV6 (Garde Impériale): "+10 Great General points for kills." */
  generalPointsOnKill?: number;
  /** CIV6 (Mandekalu Cavalry): on a kill, "Gain Gold equal to 100% that
   *  unit's base Combat Strength." */
  killGoldPct?: number;
  /** CIV6 (Rough Rider, EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD): Culture worth
   *  this percent of a defeated unit's strength — `killYieldHomeOnly` gates
   *  it on the killer standing on the capital's continent. */
  killCulturePct?: number;
  killYieldHomeOnly?: boolean;
  /** CIV6 (Redcoat): Combat Strength on a continent OTHER than the capital's. */
  foreignContinentCS?: number;
  /** CIV6 (Black Army): Combat Strength per adjacent LEVIED unit of this seat. */
  adjacentLeviedCS?: number;
  /** CIV6 (Redcoat, EFFECT_ADJUST_UNIT_IGNORE_SHORES): no embark or
   *  disembark penalty, the Amphibious promotion's shore half on a chassis. */
  ignoresShores?: boolean;
  /** CIV6 (Mountie, ParkCharges): this chassis founds National Parks, the
   *  Naturalist's own verb, off its own `charges` — the Legion's shape. */
  parkBuilder?: boolean;
  /** CIV6 (Keshig): "Can escort moving civilian and support units at their
   *  higher Movement speed" — the escorted member takes the ESCORT's moves. */
  escortSpeed?: boolean;
  /** CIV6 (Malón Raider): "Pillaging costs 1 Movement." */
  pillageCost?: number;
  /** CIV6 (Mandekalu Cavalry): "Protects nearby LAND Trade units from
   *  Plunder"; (Bireme): "Protects nearby Trade units from being Plundered on
   *  WATER Tiles." One clause, two grounds. */
  guardsTraders?: 'land' | 'water';
  /** CIV6 (P-51 Mustang): "+5 Combat Strength bonus vs. Fighters." */
  vsFighterCS?: number;
  /** CIV6 (U-Boat): "+10 Combat Strength in Ocean combat" — the deep water
   *  alone; a Coast or Lake tile is not Ocean. */
  oceanCS?: number;
  /** CIV6 (De Zeven Provincien): "+7 Combat Strength when attacking
   *  defensible districts." */
  districtAttackCS?: number;
  /** CIV6 (Barbary Corsair): "It costs no Movement to coastal raid" — the
   *  three-point reserve the raid asks for, and the spend, both waived. */
  raidFreeMoves?: boolean;
  /** CIV6 (Sea Dog): "Can capture defeated enemy naval vessels" — the
   *  capture permission `captureMask` otherwise carries per SEAT. */
  captureShips?: boolean;
  /** CIV6 (Conquistador): "If this unit captures a city or is adjacent to a
   *  city when it's captured, the city will automatically convert to the
   *  Conquistador player's majority Religion." */
  captureConverts?: boolean;
  description: string;
}

const U = (def: UnitDef): UnitDef => ({
  ...def,
  cost: scaleByGameSpeed(def.cost),
  ...(def.costStep === undefined ? {} : { costStep: scaleByGameSpeed(def.costStep) }),
});

/** CIV6 (Units.xml, COST_PROGRESSION_PREVIOUS_COPIES): what each earlier copy
 *  adds to the next Settler's and the next Builder's Cost, at Standard speed.
 *  Their own price columns charge them (`settlerCost`, `builderCost`), never
 *  the generic `costStep`, which counts acquisitions rather than the
 *  settlers fielded or the builders trained. */
export const SETTLER_COST_STEP = srcConst('units.settlerCostStep', 30,
  xml('Units', 'UnitType=UNIT_SETTLER', 'CostProgressionParam1'));
export const BUILDER_COST_STEP = srcConst('units.builderCostStep', 4,
  xml('Units', 'UnitType=UNIT_BUILDER', 'CostProgressionParam1'));

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  [
    U({
      id: 'BUILDER',
      name: 'Builder',
      cost: 50, // CIV6 4*(x+1)+46 at x=0; `builderCost` charges the curve
      maintenance: 0,
      moves: 2,
      combat: 0,
      charges: 3,
      builder: true,
      description: 'Builds improvements, removes features and repairs pillaging (3 charges).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_BUILDER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BUILDER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BUILDER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BUILDER', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_BUILDER', 'BuildCharges'),
        builder: xml('TypeTags', 'Type=UNIT_BUILDER&Tag=CLASS_BUILDER', 'Tag', { expect: 'CLASS_BUILDER' }),
      },
    }),
    U({
      id: 'SCOUT',
      name: 'Scout',
      upgradesTo: 'SKIRMISHER',
      cost: 30,
      maintenance: 0,
      moves: 3,
      combat: 10,
      recon: true,
      revealStealth: true,
      description: 'Fast, fragile explorer.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SCOUT', 'UpgradeUnit', { expect: 'UNIT_SKIRMISHER' }),
        cost: xml('Units', 'UnitType=UNIT_SCOUT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SCOUT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SCOUT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SCOUT', 'Combat'),
        recon: xml('Units', 'UnitType=UNIT_SCOUT', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_SCOUT&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
      },
    }),
    U({
      id: 'WARRIOR',
      name: 'Warrior',
      upgradesTo: 'SWORDSMAN',
      cost: 40,
      maintenance: 0,
      moves: 2,
      combat: 20,
      melee: true,
      description: 'Basic melee defender.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_WARRIOR', 'UpgradeUnit', { expect: 'UNIT_SWORDSMAN' }),
        cost: xml('Units', 'UnitType=UNIT_WARRIOR', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_WARRIOR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_WARRIOR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_WARRIOR', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_WARRIOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
      },
    }),
    U({
      id: 'SLINGER',
      name: 'Slinger',
      upgradesTo: 'ARCHER',
      cost: 35,
      maintenance: 0,
      moves: 2,
      combat: 5,
      ranged: { strength: 15, range: 1 },
      description: 'Early ranged unit (no retaliation taken).',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SLINGER', 'UpgradeUnit', { expect: 'UNIT_ARCHER' }),
        cost: xml('Units', 'UnitType=UNIT_SLINGER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SLINGER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SLINGER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SLINGER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SLINGER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SLINGER', 'Range'),
      },
    }),
    U({
      id: 'ARCHER',
      name: 'Archer',
      upgradesTo: 'CROSSBOWMAN',
      cost: 60,
      maintenance: 1,
      moves: 2,
      combat: 15,
      ranged: { strength: 25, range: 2 },
      requiresTech: 'ARCHERY',
      description: 'Ranged attacker, range 2.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ARCHER', 'UpgradeUnit', { expect: 'UNIT_CROSSBOWMAN' }),
        cost: xml('Units', 'UnitType=UNIT_ARCHER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ARCHER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ARCHER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ARCHER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_ARCHER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_ARCHER', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_ARCHER', 'PrereqTech', { expect: 'TECH_ARCHERY' }),
      },
    }),
    U({
      id: 'SPEARMAN',
      name: 'Spearman',
      upgradesTo: 'PIKEMAN',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 25,
      antiCavalry: true,
      requiresTech: 'BRONZE_WORKING',
      description: 'Solid melee line unit.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SPEARMAN', 'UpgradeUnit', { expect: 'UNIT_PIKEMAN' }),
        cost: xml('Units', 'UnitType=UNIT_SPEARMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SPEARMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SPEARMAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SPEARMAN', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_SPEARMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SPEARMAN', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
      },
    }),
    U({
      id: 'HORSEMAN',
      name: 'Horseman',
      upgradesTo: 'COURSER',
      cost: 80,
      maintenance: 2,
      moves: 4,
      cavalry: true, // LIGHT cavalry
      cavalryTag: 'light',
      combat: 36, // real Civ 6 Horseman
      requiresTech: 'HORSEBACK_RIDING',
      requiresResource: 'HORSES', // retroactive — its own description flagged this gap
      description: 'Fast shock cavalry (needs Horses access).',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_HORSEMAN', 'UpgradeUnit', { expect: 'UNIT_COURSER' }),
        cost: xml('Units', 'UnitType=UNIT_HORSEMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_HORSEMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_HORSEMAN', 'BaseMoves'),
        cavalry: xml('Units', 'UnitType=UNIT_HORSEMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_HORSEMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        combat: xml('Units', 'UnitType=UNIT_HORSEMAN', 'Combat'),
        requiresTech: xml('Units', 'UnitType=UNIT_HORSEMAN', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_HORSEMAN', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
      },
    }),
    U({
      id: 'SWORDSMAN',
      name: 'Swordsman',
      upgradesTo: 'MAN_AT_ARMS',
      cost: 90,
      maintenance: 2,
      moves: 2,
      combat: 35,
      melee: true,
      requiresTech: 'IRON_WORKING',
      requiresResource: 'IRON',
      description: 'Classical heavy melee (needs Iron access).',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SWORDSMAN', 'UpgradeUnit', { expect: 'UNIT_MAN_AT_ARMS' }),
        cost: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'PrereqTech', { expect: 'TECH_IRON_WORKING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_SWORDSMAN', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
      },
    }),
    U({
      id: 'PIKEMAN',
      name: 'Pikeman',
      upgradesTo: 'PIKE_AND_SHOT',
      cost: 180,
      maintenance: 2,
      moves: 2,
      combat: 45,
      antiCavalry: true,
      requiresTech: 'MILITARY_TACTICS',
      description: 'Medieval anti-cavalry line unit.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_PIKEMAN', 'UpgradeUnit', { expect: 'UNIT_PIKE_AND_SHOT' }),
        cost: xml('Units', 'UnitType=UNIT_PIKEMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_PIKEMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_PIKEMAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_PIKEMAN', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_PIKEMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_PIKEMAN', 'PrereqTech', { expect: 'TECH_MILITARY_TACTICS' }),
      },
    }),
    U({
      id: 'CROSSBOWMAN',
      name: 'Crossbowman',
      upgradesTo: 'FIELD_CANNON',
      cost: 180,
      maintenance: 3,
      moves: 2,
      combat: 30,
      ranged: { strength: 40, range: 2 },
      requiresTech: 'MACHINERY',
      description: 'Medieval ranged attacker, range 2.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CROSSBOWMAN', 'UpgradeUnit', { expect: 'UNIT_FIELD_CANNON' }),
        cost: xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_CROSSBOWMAN', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
      },
    }),
    U({
      id: 'KNIGHT',
      name: 'Knight',
      upgradesTo: 'CUIRASSIER',
      cost: 220,
      maintenance: 4,
      moves: 4,
      cavalry: true, // HEAVY cavalry
      cavalryTag: 'heavy',
      combat: 50,
      requiresTech: 'STIRRUPS',
      requiresResource: 'IRON',
      description: 'Heavy shock cavalry (needs Iron access).',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_KNIGHT', 'UpgradeUnit', { expect: 'UNIT_CUIRASSIER' }),
        cost: xml('Units', 'UnitType=UNIT_KNIGHT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_KNIGHT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_KNIGHT', 'BaseMoves'),
        cavalry: xml('Units', 'UnitType=UNIT_KNIGHT', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_KNIGHT', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        combat: xml('Units', 'UnitType=UNIT_KNIGHT', 'Combat'),
        requiresTech: xml('Units', 'UnitType=UNIT_KNIGHT', 'PrereqTech', { expect: 'TECH_STIRRUPS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_KNIGHT', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
      },
    }),
    U({
      id: 'MUSKETMAN',
      name: 'Musketman',
      upgradesTo: 'LINE_INFANTRY',
      cost: 240,
      maintenance: 4,
      moves: 2,
      combat: 55,
      melee: true,
      requiresTech: 'GUNPOWDER',
      requiresResource: 'NITER',
      description: 'Renaissance gunpowder infantry.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MUSKETMAN', 'UpgradeUnit', { expect: 'UNIT_LINE_INFANTRY' }),
        cost: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MUSKETMAN', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
      },
    }),
    U({
      id: 'GALLEY',
      name: 'Galley',
      upgradesTo: 'CARAVEL',
      cost: 65,
      maintenance: 1,
      moves: 3,
      combat: 30,
      requiresTech: 'SAILING',
      naval: true,
      description: 'Classical naval melee unit — captures coastal cities from the sea.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_GALLEY', 'UpgradeUnit', { expect: 'UNIT_CARAVEL' }),
        cost: xml('Units', 'UnitType=UNIT_GALLEY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_GALLEY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GALLEY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GALLEY', 'Combat'),
        requiresTech: xml('Units', 'UnitType=UNIT_GALLEY', 'PrereqTech', { expect: 'TECH_SAILING' }),
        naval: xml('Units', 'UnitType=UNIT_GALLEY', 'Domain', { expect: 'DOMAIN_SEA' }),
      },
    }),
    U({
      id: 'QUADRIREME',
      name: 'Quadrireme',
      upgradesTo: 'FRIGATE',
      cost: 120,
      maintenance: 2,
      moves: 3,
      combat: 20,
      ranged: { strength: 25, range: 1 },
      requiresTech: 'SHIPBUILDING',
      naval: true,
      description: 'Classical naval ranged unit — bombards from adjacent water.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_QUADRIREME', 'UpgradeUnit', { expect: 'UNIT_FRIGATE' }),
        cost: xml('Units', 'UnitType=UNIT_QUADRIREME', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_QUADRIREME', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_QUADRIREME', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_QUADRIREME', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_QUADRIREME', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_QUADRIREME', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_QUADRIREME', 'PrereqTech', { expect: 'TECH_SHIPBUILDING' }),
        naval: xml('Units', 'UnitType=UNIT_QUADRIREME', 'Domain', { expect: 'DOMAIN_SEA' }),
      },
    }),
    // The missionary chassis (appended LAST — roster indices are the
    // GPU's unit type ids). Civilian, faith-purchase-only at its speed-scaled
    // cost (the worship-cost pattern); 3 spread charges (vanilla), +1 with
    // SCRIPTURE, 30% cheaper with HOLY_ORDER (seat buy path applies both).
    U({
      id: 'MISSIONARY',
      name: 'Missionary',
      cost: 75, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      costStep: 6,  // Units.xml CostProgressionParam1
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      religiousStrength: 100, // defends theological combat, never initiates
      description: 'Spreads its religion to nearby cities (3 charges, faith purchase only).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MISSIONARY', 'Cost', { scale: GAME_SPEED }),
        costStep: xml('Units', 'UnitType=UNIT_MISSIONARY', 'CostProgressionParam1', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MISSIONARY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MISSIONARY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MISSIONARY', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_MISSIONARY', 'SpreadCharges'),
        faithOnly: xml('Units', 'UnitType=UNIT_MISSIONARY', 'PurchaseYield', { expect: 'YIELD_FAITH' }),
        religiousStrength: xml('Units', 'UnitType=UNIT_MISSIONARY', 'ReligiousStrength'),
      },
    }),
    // The Great General / Great Admiral support chassis (appended
    // LAST — roster indices are the GPU's unit type ids; MISSIONARY stays put).
    // CIVILIAN (charges=1 → unitDomain 'civilian' AND GPU _p_charges>0 civilian,
    // so both engines exclude it from the military march/patrol loops, from
    // garrison/flank/support counts, and — via the BUILDER/MISSIONARY type
    // gates — from the charge-driven walkers). Combat 0 means capturable.
    // spawnOnly → never trained/purchased/faith-bought. 4 MP so the seat
    // general keeps pace with the war march. No maintenance. The aura
    // (+5 CS within 2, combat.ts) is pure geometry; the retire ability is the
    // roster's instant effect (kept). OPEN: the real aura also grants +1 MP,
    // which this one does not — it would couple the aura to movement.
    U({
      id: 'GENERAL',
      name: 'Great General',
      cost: 0,
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 1,
      spawnOnly: true,
      description: 'Great General — +5 CS to own land military within 2 tiles (spawned on claim).',
      src: {
        cost: { stylized: 'great people arrive by points, never production — this model prices the chassis at 0 (units.ts header)' },
        maintenance: xml('Units', 'UnitType=UNIT_GREAT_GENERAL', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GREAT_GENERAL', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GREAT_GENERAL', 'Combat'),
        charges: { stylized: 'a placeholder the great-person recruit overwrites with that PERSON\'s charge count' },
        spawnOnly: xml('Units', 'UnitType=UNIT_GREAT_GENERAL', 'CanTrain', { expect: false }),
      },
    }),
    U({
      id: 'ADMIRAL',
      name: 'Great Admiral',
      cost: 0,
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 1,
      spawnOnly: true,
      description: 'Great Admiral — +5 CS to own naval/embarked units within 2 tiles (spawned on claim).',
      src: {
        cost: { stylized: 'great people arrive by points, never production — this model prices the chassis at 0 (units.ts header)' },
        maintenance: xml('Units', 'UnitType=UNIT_GREAT_ADMIRAL', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GREAT_ADMIRAL', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GREAT_ADMIRAL', 'Combat'),
        charges: { stylized: 'a placeholder the great-person recruit overwrites with that PERSON\'s charge count' },
        spawnOnly: xml('Units', 'UnitType=UNIT_GREAT_ADMIRAL', 'CanTrain', { expect: false }),
      },
    }),
    // The APOSTLE — appended LAST, because roster indices ARE the
    // GPU's unit type ids and inserting anywhere else would renumber them.
    // Faith-purchase only like the Missionary, spreads like it, but carries a
    // higher religiousStrength, takes a promotion at purchase, and may
    // INITIATE theological combat.
    U({
      id: 'APOSTLE',
      name: 'Apostle',
      cost: 200, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      costStep: 15,  // Units.xml CostProgressionParam1
      maintenance: 0,
      moves: 4,
      combat: 0, // civilian: never garrisons, flanks, supports or fights normal combat
      charges: 3,
      faithOnly: true,
      religiousStrength: 110,
      description: 'Spreads its religion and wins theological combat (3 charges, faith purchase only).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_APOSTLE', 'Cost', { scale: GAME_SPEED }),
        costStep: xml('Units', 'UnitType=UNIT_APOSTLE', 'CostProgressionParam1', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_APOSTLE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_APOSTLE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_APOSTLE', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_APOSTLE', 'SpreadCharges'),
        faithOnly: xml('Units', 'UnitType=UNIT_APOSTLE', 'PurchaseYield', { expect: 'YIELD_FAITH' }),
        religiousStrength: xml('Units', 'UnitType=UNIT_APOSTLE', 'ReligiousStrength'),
      },
    }),
    // The MILITARY ENGINEER, sourced from the Gathering Storm
    // Civilopedia — 170 Production, 2 Gold, 2 Movement, 2 build charges, prerequisite
    // tech Military Engineering. APPENDED LAST on purpose: roster order is the
    // GPU's unit index, so inserting anywhere else renumbers every downstream
    // unit in both engines AND in every exported fixture.
    // Its Civ 6 build list is Fort / Airstrip / Missile Silo / Mountain Tunnel /
    // Reinforced Barricade / Modernized Trap, plus spending a charge to finish
    // 20% of a Canal, Dam, Aqueduct or Flood Barrier. Only the FORT exists
    // here; every other entry on that list is an open gap.
    U({
      id: 'MILITARY_ENGINEER',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Military Engineer',
      cost: 170,
      maintenance: 2,
      moves: 2,
      combat: 0, // civilian: never garrisons, flanks, supports or fights
      charges: 2,
      requiresTech: 'MILITARY_ENGINEERING',
      // CIV6: "It can only be built in a city that has an Encampment with an
      // Armory." The building carries its district, so the Armory is the test.
      requiresBuilding: 'ARMORY',
      description: 'Builds Forts (2 charges). Needs an Armory.',
      src: {
        support: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'BuildCharges'),
        requiresTech: xml('Units', 'UnitType=UNIT_MILITARY_ENGINEER', 'PrereqTech', { expect: 'TECH_MILITARY_ENGINEERING' }),
        requiresBuilding: xml('Unit_BuildingPrereqs', 'Unit=UNIT_MILITARY_ENGINEER&PrereqBuilding=BUILDING_ARMORY', 'PrereqBuilding', { expect: 'BUILDING_ARMORY' }),
      },
    }),
    // The ARCHAEOLOGIST, sourced from the Civ 6 wiki — 3 charges,
    // unlocked by the NATURAL HISTORY civic, and trainable only in a city whose
    // ARCHAEOLOGICAL MUSEUM still has a free artifact slot (that slot rule is
    // enforced in trainableUnits, not here, because it is per-CITY). APPENDED
    // LAST for the same index-stability reason as the Military Engineer above.
    U({
      id: 'ARCHAEOLOGIST',
      name: 'Archaeologist',
      cost: 400,
      maintenance: 0,
      moves: 4,
      combat: 0, // civilian
      charges: 3,
      requiresCivic: 'NATURAL_HISTORY',
      description: 'Excavates Antiquity Sites into Artifacts (3 charges).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ARCHAEOLOGIST', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ARCHAEOLOGIST', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ARCHAEOLOGIST', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ARCHAEOLOGIST', 'Combat'),
        requiresCivic: xml('Units', 'UnitType=UNIT_ARCHAEOLOGIST', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
      },
    }),
    // The SETTLER — a real unit, like Civ 6's: it walks the map and FOUNDS.
    // APPENDED LAST (roster order is the GPU's unit index). CIVILIAN via
    // charges (0 build charges: every charge-driven walker gates on
    // charges > 0, so it takes no builder jobs). The roster cost is the BASE
    // 80 (speed-scaled); the live price always comes from settlerCost() —
    // 80 + 30 per settler this seat has fielded or queued — through the
    // dedicated settler column, never the generic unit columns.
    U({
      id: 'SETTLER',
      name: 'Settler',
      cost: 80,
      maintenance: 0,
      moves: 2,
      combat: 0, // civilian: captured/killed rather than fighting
      charges: 0,
      settler: true,
      description: 'Founds a new city (consumed on founding).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SETTLER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SETTLER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SETTLER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SETTLER', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_SETTLER', 'BuildCharges'),
        settler: xml('Units', 'UnitType=UNIT_SETTLER', 'FoundCity', { expect: true }),
      },
    }),
    // The TRADER, sourced from the Civ 6 wiki — 40 Production (progressive:
    // COST_PROGRESSION_GAME_PROGRESS Param1 400, so the live price is
    // traderCost()'s base x (1 + 4 x game progress)), 0 maintenance,
    // unlocked by FOREIGN_TRADE. APPENDED LAST (roster order is the GPU's
    // unit index). A free Trader sits at a city centre until a route verb
    // spends it; "Switch City" is instant in real Civ 6, so any own city may
    // be the origin. trainableUnits blocks training at capacity ("when the
    // number of Traders equals the Trading Capacity you cannot build more").
    U({
      id: 'TRADER',
      name: 'Trader',
      cost: 40,
      maintenance: 0,
      moves: 2,
      combat: 0, // civilian: captured/killed rather than fighting
      charges: 0,
      trader: true,
      requiresCivic: 'FOREIGN_TRADE',
      description: 'Establishes a trade route (spent on the route, returned when it completes).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_TRADER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_TRADER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_TRADER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_TRADER', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_TRADER', 'BuildCharges'),
        trader: xml('Units', 'UnitType=UNIT_TRADER', 'MakeTradeRoute', { expect: true }),
        requiresCivic: xml('Units', 'UnitType=UNIT_TRADER', 'PrereqCivic', { expect: 'CIVIC_FOREIGN_TRADE' }),
      },
    }),
    // The NATURALIST — a MODERN civilian behind the CONSERVATION civic, 4
    // moves, bought with FAITH ONLY ("It can only be purchased with Faith in
    // any city"), Units.xml Cost 300 and progressive, and Units.xml
    // ParkCharges 1: the one charge a National Park designation spends, so the
    // unit is consumed by its single park.
    // APPENDED LAST (roster order is the GPU's unit index).
    U({
      id: 'NATURALIST',
      name: 'Naturalist',
      cost: 300,
      costStep: 50,  // Units.xml CostProgressionParam1
      maintenance: 0,
      moves: 4,
      combat: 0, // civilian
      charges: 1,  // Units.xml ParkCharges
      naturalist: true,
      requiresCivic: 'CONSERVATION',
      description: 'Designates a National Park over four contiguous tiles (consumed).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_NATURALIST', 'Cost', { scale: GAME_SPEED }),
        costStep: xml('Units', 'UnitType=UNIT_NATURALIST', 'CostProgressionParam1', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_NATURALIST', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_NATURALIST', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_NATURALIST', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_NATURALIST', 'ParkCharges'),
        naturalist: xml('Units', 'UnitType=UNIT_NATURALIST', 'ParkCharges', { expect: 1, note: 'the install marks the park civilian by carrying ParkCharges' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_NATURALIST', 'PrereqCivic', { expect: 'CIVIC_CONSERVATION' }),
      },
    }),
    // THE SIEGE CLASS and the two Ancient support chassis, APPENDED LAST
    // (roster order is the GPU's unit index). Every column is the GS
    // Civilopedia row. The siege pair carries BOMBARD strength, which is what
    // hits a perimeter at full damage; their `ranged.strength` is that number
    // minus the 17 real Civ 6 takes off "against land units".
    U({
      id: 'CATAPULT',
      name: 'Catapult',
      upgradesTo: 'TREBUCHET',
      cost: 120,
      maintenance: 2,
      moves: 2,
      combat: 25,
      ranged: { strength: 18, range: 2 },
      bombard: 35,
      requiresTech: 'ENGINEERING',
      description: 'Classical siege engine: full damage to city and district defenses.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CATAPULT', 'UpgradeUnit', { expect: 'UNIT_TREBUCHET' }),
        cost: xml('Units', 'UnitType=UNIT_CATAPULT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CATAPULT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CATAPULT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CATAPULT', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_CATAPULT', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_CATAPULT', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_CATAPULT', 'Bombard'),
        requiresTech: xml('Units', 'UnitType=UNIT_CATAPULT', 'PrereqTech', { expect: 'TECH_ENGINEERING' }),
      },
    }),
    U({
      id: 'BOMBARD',
      name: 'Bombard',
      upgradesTo: 'ARTILLERY',
      cost: 280,
      maintenance: 4,
      moves: 2,
      combat: 45,
      ranged: { strength: 38, range: 2 },
      bombard: 55,
      requiresTech: 'METAL_CASTING',
      requiresResource: 'NITER',
      description: 'Renaissance siege engine: full damage to city and district defenses.',
      src: {
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BOMBARD', 'UpgradeUnit', { expect: 'UNIT_ARTILLERY' }),
        cost: xml('Units', 'UnitType=UNIT_BOMBARD', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BOMBARD', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BOMBARD', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BOMBARD', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_BOMBARD', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_BOMBARD', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_BOMBARD', 'Bombard'),
        requiresTech: xml('Units', 'UnitType=UNIT_BOMBARD', 'PrereqTech', { expect: 'TECH_METAL_CASTING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_BOMBARD', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
      },
    }),
    // The support pair rides the CIVILIAN plane (`charges` present), which is
    // where this model already puts real Civ 6's other support chassis, the
    // Military Engineer: it stacks with the military unit it accompanies and
    // never fights. Neither carries a build job, so both sit at 0 charges.
    U({
      id: 'BATTERING_RAM',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Battering Ram',
      upgradesTo: 'SIEGE_TOWER',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'MASONRY',
      siegeSupport: 'RAM',
      siegeMaxWalls: 1,
      description: 'Adjacent melee and anti-cavalry attackers do full damage to Ancient Walls.',
      src: {
        support: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BATTERING_RAM', 'UpgradeUnit', { expect: 'UNIT_SIEGE_TOWER' }),
        cost: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'BuildCharges'),
        requiresTech: xml('Units', 'UnitType=UNIT_BATTERING_RAM', 'PrereqTech', { expect: 'TECH_MASONRY' }),
        siegeSupport: xml('UnitAbilityModifiers', 'UnitAbilityType=ABILITY_ENABLE_WALL_ATTACK_PROMOTION_CLASS&ModifierId=ENABLE_WALL_ATTACK_MELEE', 'ModifierId', { expect: 'ENABLE_WALL_ATTACK_MELEE' }),
      },
    }),
    U({
      id: 'SIEGE_TOWER',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Siege Tower',
      upgradesTo: 'MEDIC',
      cost: 100,
      maintenance: 2,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'MACHINERY',
      siegeSupport: 'TOWER',
      siegeMaxWalls: 2,
      description: 'Adjacent melee and anti-cavalry attackers ignore Walls up to Medieval.',
      src: {
        support: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SIEGE_TOWER', 'UpgradeUnit', { expect: 'UNIT_MEDIC' }),
        cost: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'BuildCharges'),
        requiresTech: xml('Units', 'UnitType=UNIT_SIEGE_TOWER', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
        siegeSupport: xml('UnitAbilityModifiers', 'UnitAbilityType=ABILITY_BYPASS_WALLS_PROMOTION_CLASS&ModifierId=BYPASS_WALLS_MELEE', 'ModifierId', { expect: 'BYPASS_WALLS_MELEE' }),
      },
    }),
    // The INQUISITOR — appended LAST, because roster indices ARE the GPU's
    // unit type ids. CIV6: 100 Faith (progressive), a Temple, Units.xml
    // ReligiousStrength 75, 4 Movement, 3 charges of Remove Heresy, and it may
    // only be bought once an Apostle has Launched an Inquisition in this seat's own
    // territory. It is the ONE religious unit that "cannot enter another
    // civilization's territory without Open Borders".
    U({
      id: 'INQUISITOR',
      name: 'Inquisitor',
      cost: 75, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      costStep: 6,  // Units.xml CostProgressionParam1
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      religiousStrength: 75,
      description: 'Removes other religions from a city and fights theological combat (faith purchase only).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_INQUISITOR', 'Cost', { scale: GAME_SPEED }),
        costStep: xml('Units', 'UnitType=UNIT_INQUISITOR', 'CostProgressionParam1', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_INQUISITOR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_INQUISITOR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_INQUISITOR', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_INQUISITOR', 'SpreadCharges'),
        faithOnly: xml('Units', 'UnitType=UNIT_INQUISITOR', 'PurchaseYield', { expect: 'YIELD_FAITH' }),
        religiousStrength: xml('Units', 'UnitType=UNIT_INQUISITOR', 'ReligiousStrength'),
      },
    }),
    // ---------------------------------------------------------------------
    // THE REST OF THE LADDER. Every rung from the Medieval fillers to the
    // Information era, appended in unlock order.
    U({
      id: 'HEAVY_CHARIOT',
      name: 'Heavy Chariot',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 28,
      cavalry: true,
      cavalryTag: 'heavy',
      chariot: true,
      // CIV6 (Heavy Chariot): "+1 Movement if starting in Desert, Plains,
      // Grassland, or Tundra."
      openTerrainMoves: 1,
      requiresTech: 'WHEEL',
      upgradesTo: 'KNIGHT',
      description: 'Ancient heavy cavalry.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        chariot: xml('TypeTags', 'Type=UNIT_HEAVY_CHARIOT&Tag=CLASS_HEAVY_CHARIOT', 'Tag', { expect: 'CLASS_HEAVY_CHARIOT' }),
        openTerrainMoves: xml('ModifierArguments', 'ModifierId=HEAVYCHARIOT_FASTER_CLEAR_TERRAIN&Name=Amount', 'Value'),
        requiresTech: xml('Units', 'UnitType=UNIT_HEAVY_CHARIOT', 'PrereqTech', { expect: 'TECH_THE_WHEEL' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_HEAVY_CHARIOT', 'UpgradeUnit', { expect: 'UNIT_KNIGHT' }),
      },
    }),
    U({
      id: 'MAN_AT_ARMS',
      name: 'Man-At-Arms',
      cost: 160,
      maintenance: 3,
      moves: 2,
      combat: 45,
      melee: true,
      requiresTech: 'APPRENTICESHIP',
      requiresResource: 'IRON',
      upgradesTo: 'MUSKETMAN',
      description: 'Medieval melee line (needs Iron).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MAN_AT_ARMS', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MAN_AT_ARMS', 'UpgradeUnit', { expect: 'UNIT_MUSKETMAN' }),
      },
    }),
    U({
      id: 'SKIRMISHER',
      name: 'Skirmisher',
      cost: 150,
      maintenance: 2,
      moves: 3,
      combat: 20,
      ranged: { strength: 30, range: 1 },
      recon: true,
      requiresTech: 'MACHINERY',
      upgradesTo: 'RANGER',
      description: 'Medieval ranged recon.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SKIRMISHER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SKIRMISHER', 'Range'),
        recon: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SKIRMISHER', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SKIRMISHER', 'UpgradeUnit', { expect: 'UNIT_RANGER' }),
      },
    }),
    U({
      id: 'COURSER',
      name: 'Courser',
      cost: 200,
      maintenance: 3,
      moves: 5,
      combat: 46,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'CASTLES',
      requiresResource: 'HORSES',
      upgradesTo: 'CAVALRY',
      description: 'Medieval light cavalry (needs Horses).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_COURSER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_COURSER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_COURSER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_COURSER', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_COURSER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_COURSER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_COURSER', 'PrereqTech', { expect: 'TECH_CASTLES' }),
        requiresResource: xml('Units', 'UnitType=UNIT_COURSER', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_COURSER', 'UpgradeUnit', { expect: 'UNIT_CAVALRY' }),
      },
    }),
    U({
      id: 'TREBUCHET',
      name: 'Trebuchet',
      cost: 200,
      maintenance: 3,
      moves: 2,
      combat: 35,
      ranged: { strength: 28, range: 2 },
      bombard: 45,
      requiresTech: 'MILITARY_ENGINEERING',
      upgradesTo: 'BOMBARD',
      description: 'Medieval siege engine: full damage to city and district defenses.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_TREBUCHET', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_TREBUCHET', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_TREBUCHET', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_TREBUCHET', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_TREBUCHET', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_TREBUCHET', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_TREBUCHET', 'Bombard'),
        requiresTech: xml('Units', 'UnitType=UNIT_TREBUCHET', 'PrereqTech', { expect: 'TECH_MILITARY_ENGINEERING' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_TREBUCHET', 'UpgradeUnit', { expect: 'UNIT_BOMBARD' }),
      },
    }),
    U({
      id: 'PIKE_AND_SHOT',
      name: 'Pike and Shot',
      cost: 250,
      maintenance: 3,  // Units.xml Maintenance (Expansion1_Expansion2.xml)
      moves: 2,
      combat: 55,
      antiCavalry: true,
      requiresTech: 'METAL_CASTING',
      upgradesTo: 'AT_CREW',
      description: 'Renaissance anti-cavalry, and it asks for no strategic resource.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_PIKE_AND_SHOT', 'PrereqTech', { expect: 'TECH_METAL_CASTING' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_PIKE_AND_SHOT', 'UpgradeUnit', { expect: 'UNIT_AT_CREW' }),
      },
    }),
    U({
      id: 'CARAVEL',
      name: 'Caravel',
      cost: 240,
      maintenance: 4,
      moves: 4,
      combat: 55,
      naval: true,
      requiresTech: 'CARTOGRAPHY',
      upgradesTo: 'IRONCLAD',
      description: 'Renaissance naval melee.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CARAVEL', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CARAVEL', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CARAVEL', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CARAVEL', 'Combat'),
        naval: xml('Units', 'UnitType=UNIT_CARAVEL', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_CARAVEL', 'PrereqTech', { expect: 'TECH_CARTOGRAPHY' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CARAVEL', 'UpgradeUnit', { expect: 'UNIT_IRONCLAD' }),
      },
    }),
    U({
      id: 'FRIGATE',
      name: 'Frigate',
      cost: 280,
      maintenance: 5,
      moves: 4,
      combat: 45,
      ranged: { strength: 55, range: 2 },
      naval: true,
      requiresTech: 'SQUARE_RIGGING',
      requiresResource: 'NITER',
      upgradesTo: 'BATTLESHIP',
      description: 'Renaissance naval ranged (needs Niter).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_FRIGATE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_FRIGATE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_FRIGATE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_FRIGATE', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_FRIGATE', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_FRIGATE', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_FRIGATE', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_FRIGATE', 'PrereqTech', { expect: 'TECH_SQUARE_RIGGING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_FRIGATE', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_FRIGATE', 'UpgradeUnit', { expect: 'UNIT_BATTLESHIP' }),
      },
    }),
    U({
      id: 'PRIVATEER',
      raider: true,
      name: 'Privateer',
      cost: 280,
      maintenance: 4,
      moves: 4,
      combat: 40,
      ranged: { strength: 50, range: 2 },
      naval: true,
      requiresCivic: 'MERCANTILISM',
      upgradesTo: 'SUBMARINE',
      stealth: true,
      revealStealth: true,
      ignoresZoc: true,
      description: 'Renaissance naval raider.',
      src: {
        raider: xml('Units', 'UnitType=UNIT_PRIVATEER', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        cost: xml('Units', 'UnitType=UNIT_PRIVATEER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_PRIVATEER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_PRIVATEER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_PRIVATEER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_PRIVATEER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_PRIVATEER', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_PRIVATEER', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_PRIVATEER', 'PrereqCivic', { expect: 'CIVIC_MERCANTILISM' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_PRIVATEER', 'UpgradeUnit', { expect: 'UNIT_SUBMARINE' }),
        stealth: xml('TypeTags', 'Type=UNIT_PRIVATEER&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_PRIVATEER&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        ignoresZoc: xml('TypeTags', 'Type=UNIT_PRIVATEER&Tag=CLASS_NAVAL_RAIDER', 'Tag', { expect: 'CLASS_NAVAL_RAIDER' }),
      },
    }),
    U({
      id: 'LINE_INFANTRY',
      name: 'Line Infantry',
      cost: 360,
      maintenance: 5,
      moves: 2,
      combat: 65,
      melee: true,
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'NITER',
      upgradesTo: 'INFANTRY',
      description: 'Industrial melee line (needs Niter).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_LINE_INFANTRY', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_LINE_INFANTRY', 'UpgradeUnit', { expect: 'UNIT_INFANTRY' }),
      },
    }),
    U({
      id: 'CAVALRY',
      name: 'Cavalry',
      cost: 330,
      maintenance: 5,
      moves: 5,
      combat: 62,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'HORSES',
      upgradesTo: 'HELICOPTER',
      description: 'Industrial light cavalry (needs Horses).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CAVALRY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CAVALRY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CAVALRY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CAVALRY', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_CAVALRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_CAVALRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_CAVALRY', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_CAVALRY', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CAVALRY', 'UpgradeUnit', { expect: 'UNIT_HELICOPTER' }),
      },
    }),
    U({
      id: 'CUIRASSIER',
      name: 'Cuirassier',
      cost: 330,
      maintenance: 5,
      moves: 4,
      combat: 64,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'BALLISTICS',
      requiresResource: 'IRON',
      upgradesTo: 'TANK',
      description: 'Industrial heavy cavalry (needs Iron).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'PrereqTech', { expect: 'TECH_BALLISTICS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_CUIRASSIER', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CUIRASSIER', 'UpgradeUnit', { expect: 'UNIT_TANK' }),
      },
    }),
    U({
      id: 'FIELD_CANNON',
      name: 'Field Cannon',
      cost: 330,
      maintenance: 5,
      moves: 2,
      combat: 50,
      ranged: { strength: 60, range: 2 },
      requiresTech: 'BALLISTICS',
      upgradesTo: 'MACHINE_GUN',
      description: 'Industrial ranged, and it asks for no strategic resource.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_FIELD_CANNON', 'PrereqTech', { expect: 'TECH_BALLISTICS' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_FIELD_CANNON', 'UpgradeUnit', { expect: 'UNIT_MACHINE_GUN' }),
      },
    }),
    U({
      id: 'RANGER',
      name: 'Ranger',
      cost: 380,
      maintenance: 5,
      moves: 3,
      combat: 45,
      ranged: { strength: 60, range: 1 },
      recon: true,
      requiresTech: 'RIFLING',
      upgradesTo: 'SPEC_OPS',
      description: 'Industrial ranged recon.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_RANGER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_RANGER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_RANGER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_RANGER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_RANGER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_RANGER', 'Range'),
        recon: xml('Units', 'UnitType=UNIT_RANGER', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        requiresTech: xml('Units', 'UnitType=UNIT_RANGER', 'PrereqTech', { expect: 'TECH_RIFLING' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_RANGER', 'UpgradeUnit', { expect: 'UNIT_SPEC_OPS' }),
      },
    }),
    U({
      id: 'MEDIC',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Medic',
      cost: 370,
      maintenance: 5,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'SANITATION',
      upgradesTo: 'SUPPLY_CONVOY',
      description: 'Industrial support chassis.',
      src: {
        support: xml('Units', 'UnitType=UNIT_MEDIC', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_MEDIC', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MEDIC', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MEDIC', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MEDIC', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_MEDIC', 'BuildCharges'),
        requiresTech: xml('Units', 'UnitType=UNIT_MEDIC', 'PrereqTech', { expect: 'TECH_SANITATION' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MEDIC', 'UpgradeUnit', { expect: 'UNIT_SUPPLY_CONVOY' }),
      },
    }),
    U({
      id: 'IRONCLAD',
      name: 'Ironclad',
      cost: 380,
      maintenance: 5,
      moves: 5,
      combat: 70,
      naval: true,
      requiresTech: 'STEAM_POWER',
      requiresResource: 'COAL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'DESTROYER',
      description: 'Industrial naval melee: 1 Coal to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_IRONCLAD', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_IRONCLAD', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_IRONCLAD', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_IRONCLAD', 'Combat'),
        naval: xml('Units', 'UnitType=UNIT_IRONCLAD', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_IRONCLAD', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }),
        requiresResource: xml('Units', 'UnitType=UNIT_IRONCLAD', 'StrategicResource', { expect: 'RESOURCE_COAL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_IRONCLAD', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_IRONCLAD', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_IRONCLAD', 'UpgradeUnit', { expect: 'UNIT_DESTROYER' }),
      },
    }),
    U({
      id: 'INFANTRY',
      name: 'Infantry',
      cost: 430,
      maintenance: 6,
      moves: 2,
      combat: 75,
      melee: true,
      requiresTech: 'REPLACEABLE_PARTS',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'MECHANIZED_INFANTRY',
      description: 'Modern melee line: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_INFANTRY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_INFANTRY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_INFANTRY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_INFANTRY', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_INFANTRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_INFANTRY', 'PrereqTech', { expect: 'TECH_REPLACEABLE_PARTS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_INFANTRY', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_INFANTRY', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_INFANTRY', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_INFANTRY', 'UpgradeUnit', { expect: 'UNIT_MECHANIZED_INFANTRY' }),
      },
    }),
    U({
      id: 'ARTILLERY',
      name: 'Artillery',
      cost: 430,
      maintenance: 6,
      moves: 2,
      combat: 60,
      ranged: { strength: 63, range: 2 },
      bombard: 80,
      requiresTech: 'STEEL',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'ROCKET_ARTILLERY',
      description: 'Modern siege engine: full damage to city and district defenses.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ARTILLERY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ARTILLERY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ARTILLERY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ARTILLERY', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_ARTILLERY', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_ARTILLERY', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_ARTILLERY', 'Bombard'),
        requiresTech: xml('Units', 'UnitType=UNIT_ARTILLERY', 'PrereqTech', { expect: 'TECH_STEEL' }),
        requiresResource: xml('Units', 'UnitType=UNIT_ARTILLERY', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_ARTILLERY', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_ARTILLERY', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ARTILLERY', 'UpgradeUnit', { expect: 'UNIT_ROCKET_ARTILLERY' }),
      },
    }),
    U({
      id: 'AT_CREW',
      name: 'AT Crew',
      cost: 400,
      maintenance: 4,
      moves: 2,
      combat: 75,
      antiCavalry: true,
      requiresTech: 'CHEMISTRY',
      upgradesTo: 'MODERN_AT',
      description: 'Modern anti-cavalry.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_AT_CREW', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_AT_CREW', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_AT_CREW', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_AT_CREW', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_AT_CREW', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_AT_CREW', 'PrereqTech', { expect: 'TECH_CHEMISTRY' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_AT_CREW', 'UpgradeUnit', { expect: 'UNIT_MODERN_AT' }),
      },
    }),
    U({
      id: 'TANK',
      name: 'Tank',
      cost: 480,
      maintenance: 6,
      moves: 4,
      combat: 85,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'COMBUSTION',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'MODERN_ARMOR',
      description: 'Modern heavy cavalry: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_TANK', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_TANK', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_TANK', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_TANK', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_TANK', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_TANK', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_TANK', 'PrereqTech', { expect: 'TECH_COMBUSTION' }),
        requiresResource: xml('Units', 'UnitType=UNIT_TANK', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_TANK', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_TANK', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_TANK', 'UpgradeUnit', { expect: 'UNIT_MODERN_ARMOR' }),
      },
    }),
    U({
      id: 'SUPPLY_CONVOY',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Supply Convoy',
      cost: 450,
      maintenance: 2,
      moves: 4,
      combat: 0,
      charges: 0,
      requiresTech: 'COMBUSTION',
      description: 'Modern support chassis.',
      src: {
        support: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'BuildCharges'),
        requiresTech: xml('Units', 'UnitType=UNIT_SUPPLY_CONVOY', 'PrereqTech', { expect: 'TECH_COMBUSTION' }),
      },
    }),
    U({
      id: 'OBSERVATION_BALLOON',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Observation Balloon',
      cost: 240,
      maintenance: 2,
      moves: 2,
      combat: 0,
      charges: 0,
      // CIV6 (Units.xml): BaseSightRange 3 — a support chassis whose whole
      // point is that it SEES, which is why the escort drag has to lift its
      // fog and not only its carrier's.
      sight: 3,
      requiresTech: 'FLIGHT',
      upgradesTo: 'DRONE',
      description: 'Modern support chassis.',
      src: {
        support: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'BuildCharges'),
        sight: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'BaseSightRange'),
        requiresTech: xml('Units', 'UnitType=UNIT_OBSERVATION_BALLOON', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_OBSERVATION_BALLOON', 'UpgradeUnit', { expect: 'UNIT_DRONE' }),
      },
    }),
    U({
      id: 'BATTLESHIP',
      name: 'Battleship',
      cost: 430,
      maintenance: 6,
      moves: 5,
      combat: 60,
      ranged: { strength: 70, range: 3 },
      antiAir: 90,
      naval: true,
      requiresTech: 'REFINING',
      requiresResource: 'COAL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'MISSILE_CRUISER',
      description: 'Modern naval ranged: 1 Coal to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_BATTLESHIP', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_BATTLESHIP', 'Range'),
        antiAir: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'AntiAirCombat'),
        naval: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'PrereqTech', { expect: 'TECH_REFINING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_BATTLESHIP', 'StrategicResource', { expect: 'RESOURCE_COAL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_BATTLESHIP', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_BATTLESHIP', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BATTLESHIP', 'UpgradeUnit', { expect: 'UNIT_MISSILE_CRUISER' }),
      },
    }),
    U({
      id: 'SUBMARINE',
      raider: true,
      name: 'Submarine',
      cost: 480,
      maintenance: 6,
      moves: 3,
      combat: 65,
      ranged: { strength: 75, range: 2 },
      naval: true,
      requiresTech: 'ELECTRICITY',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'NUCLEAR_SUBMARINE',
      stealth: true,
      revealStealth: true,
      ignoresZoc: true,
      exertsNoZoc: true,
      description: 'Modern naval raider: 1 Oil to train and 1 per turn to run.',
      src: {
        raider: xml('Units', 'UnitType=UNIT_SUBMARINE', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        cost: xml('Units', 'UnitType=UNIT_SUBMARINE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SUBMARINE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SUBMARINE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SUBMARINE', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SUBMARINE', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SUBMARINE', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_SUBMARINE', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SUBMARINE', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }),
        requiresResource: xml('Units', 'UnitType=UNIT_SUBMARINE', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_SUBMARINE', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_SUBMARINE', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SUBMARINE', 'UpgradeUnit', { expect: 'UNIT_NUCLEAR_SUBMARINE' }),
        stealth: xml('TypeTags', 'Type=UNIT_SUBMARINE&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_SUBMARINE&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        ignoresZoc: xml('TypeTags', 'Type=UNIT_SUBMARINE&Tag=CLASS_NAVAL_RAIDER', 'Tag', { expect: 'CLASS_NAVAL_RAIDER' }),
        exertsNoZoc: xml('Units', 'UnitType=UNIT_SUBMARINE', 'ZoneOfControl', { expect: false }),
      },
    }),
    U({
      id: 'MACHINE_GUN',
      name: 'Machine Gun',
      cost: 540,
      maintenance: 6,
      moves: 2,
      combat: 70,
      ranged: { strength: 85, range: 2 },
      requiresTech: 'ADVANCED_BALLISTICS',
      description: 'Atomic ranged, and it asks for no strategic resource.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_MACHINE_GUN', 'PrereqTech', { expect: 'TECH_ADVANCED_BALLISTICS' }),
      },
    }),
    U({
      id: 'ANTI_AIR_GUN',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Anti-Air Gun',
      cost: 455,
      maintenance: 2,
      moves: 2,
      combat: 0,
      charges: 0,
      antiAir: 90,
      antiAirRange: 1,
      requiresTech: 'ADVANCED_BALLISTICS',
      upgradesTo: 'MOBILE_SAM',
      description: 'Atomic support chassis that answers air strikes.',
      src: {
        support: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'BuildCharges'),
        antiAir: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'AntiAirCombat'),
        antiAirRange: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_ANTIAIR_GUN', 'PrereqTech', { expect: 'TECH_ADVANCED_BALLISTICS' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ANTIAIR_GUN', 'UpgradeUnit', { expect: 'UNIT_MOBILE_SAM' }),
      },
    }),
    U({
      id: 'SPEC_OPS',
      name: 'Spec Ops',
      cost: 520,
      maintenance: 7,
      moves: 3,
      combat: 60,
      ranged: { strength: 65, range: 2 },
      recon: true,
      requiresTech: 'PLASTICS',
      description: 'Atomic ranged recon.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SPEC_OPS', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SPEC_OPS', 'Range'),
        recon: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SPEC_OPS', 'PrereqTech', { expect: 'TECH_PLASTICS' }),
      },
    }),
    U({
      id: 'DRONE',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Drone',
      cost: 420,
      maintenance: 3,
      moves: 3,
      combat: 0,
      charges: 0,
      // CIV6 (Units.xml): BaseSightRange 5, the longest sight of any land
      // chassis in the game.
      sight: 5,
      requiresTech: 'COMPUTERS',
      description: 'Atomic support chassis.',
      src: {
        support: xml('Units', 'UnitType=UNIT_DRONE', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_DRONE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_DRONE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_DRONE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_DRONE', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_DRONE', 'BuildCharges'),
        sight: xml('Units', 'UnitType=UNIT_DRONE', 'BaseSightRange'),
        requiresTech: xml('Units', 'UnitType=UNIT_DRONE', 'PrereqTech', { expect: 'TECH_COMPUTERS' }),
      },
    }),
    U({
      id: 'HELICOPTER',
      name: 'Helicopter',
      cost: 600,
      maintenance: 7,
      moves: 4,
      combat: 86,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'SYNTHETIC_MATERIALS',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Atomic light cavalry: 1 Aluminum to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_HELICOPTER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_HELICOPTER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_HELICOPTER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_HELICOPTER', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_HELICOPTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_HELICOPTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_HELICOPTER', 'PrereqTech', { expect: 'TECH_SYNTHETIC_MATERIALS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_HELICOPTER', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_HELICOPTER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_HELICOPTER', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'DESTROYER',
      name: 'Destroyer',
      cost: 540,
      maintenance: 7,
      moves: 4,
      combat: 85,
      antiAir: 90,
      naval: true,
      requiresTech: 'COMBINED_ARMS',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      revealStealth: true,
      sight: 3,
      description: 'Atomic naval melee: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_DESTROYER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_DESTROYER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_DESTROYER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_DESTROYER', 'Combat'),
        antiAir: xml('Units', 'UnitType=UNIT_DESTROYER', 'AntiAirCombat'),
        naval: xml('Units', 'UnitType=UNIT_DESTROYER', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_DESTROYER', 'PrereqTech', { expect: 'TECH_COMBINED_ARMS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_DESTROYER', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_DESTROYER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_DESTROYER', 'ResourceMaintenanceAmount'),
        revealStealth: xml('TypeTags', 'Type=UNIT_DESTROYER&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        sight: xml('Units', 'UnitType=UNIT_DESTROYER', 'BaseSightRange'),
      },
    }),
    U({
      id: 'MODERN_AT',
      name: 'Modern AT',
      cost: 580,
      maintenance: 8,
      moves: 3,
      combat: 85,
      antiCavalry: true,
      requiresTech: 'COMPOSITES',
      description: 'Information anti-cavalry.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MODERN_AT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MODERN_AT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MODERN_AT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MODERN_AT', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_MODERN_AT', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MODERN_AT', 'PrereqTech', { expect: 'TECH_COMPOSITES' }),
      },
    }),
    U({
      id: 'MODERN_ARMOR',
      name: 'Modern Armor',
      cost: 680,
      maintenance: 8,
      moves: 4,
      combat: 95,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'COMPOSITES',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information heavy cavalry: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'PrereqTech', { expect: 'TECH_COMPOSITES' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MODERN_ARMOR', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_MODERN_ARMOR', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_MODERN_ARMOR', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'MECHANIZED_INFANTRY',
      name: 'Mechanized Infantry',
      cost: 650,
      maintenance: 8,
      moves: 3,
      combat: 85,
      melee: true,
      requiresTech: 'SATELLITES',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information melee line: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'PrereqTech', { expect: 'TECH_SATELLITES' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_MECHANIZED_INFANTRY', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'ROCKET_ARTILLERY',
      name: 'Rocket Artillery',
      cost: 680,
      maintenance: 8,
      moves: 3,
      combat: 70,
      ranged: { strength: 83, range: 3 },
      bombard: 100,
      requiresTech: 'GUIDANCE_SYSTEMS',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information siege engine: full damage to city and district defenses.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'Bombard'),
        requiresTech: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'PrereqTech', { expect: 'TECH_GUIDANCE_SYSTEMS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_ROCKET_ARTILLERY', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_ROCKET_ARTILLERY', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_ROCKET_ARTILLERY', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'MOBILE_SAM',
      support: true,   // FORMATION_CLASS_SUPPORT
      name: 'Mobile SAM',
      cost: 590,
      maintenance: 4,
      moves: 3,
      combat: 0,
      charges: 0,
      antiAir: 100,
      antiAirRange: 1,
      requiresTech: 'GUIDANCE_SYSTEMS',
      description: 'Information support chassis that answers air strikes.',
      src: {
        support: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'FormationClass', { expect: 'FORMATION_CLASS_SUPPORT' }),
        cost: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'Combat'),
        charges: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'BuildCharges'),
        antiAir: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'AntiAirCombat'),
        antiAirRange: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_MOBILE_SAM', 'PrereqTech', { expect: 'TECH_GUIDANCE_SYSTEMS' }),
      },
    }),
    U({
      id: 'MISSILE_CRUISER',
      name: 'Missile Cruiser',
      cost: 680,
      maintenance: 8,
      moves: 5,
      combat: 75,
      ranged: { strength: 90, range: 3 },
      antiAir: 110,
      naval: true,
      requiresTech: 'LASERS',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information naval ranged: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'Range'),
        antiAir: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'AntiAirCombat'),
        naval: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'PrereqTech', { expect: 'TECH_LASERS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MISSILE_CRUISER', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_MISSILE_CRUISER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_MISSILE_CRUISER', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'NUCLEAR_SUBMARINE',
      raider: true,
      name: 'Nuclear Submarine',
      cost: 680,
      maintenance: 8,
      moves: 4,
      combat: 80,
      ranged: { strength: 85, range: 2 },
      naval: true,
      requiresTech: 'TELECOMMUNICATIONS',
      stealth: true,
      revealStealth: true,
      ignoresZoc: true,
      exertsNoZoc: true,
      description: 'Information naval raider, and in GS it asks for no strategic resource.',
      src: {
        raider: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        cost: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'PrereqTech', { expect: 'TECH_TELECOMMUNICATIONS' }),
        stealth: xml('TypeTags', 'Type=UNIT_NUCLEAR_SUBMARINE&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_NUCLEAR_SUBMARINE&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        ignoresZoc: xml('TypeTags', 'Type=UNIT_NUCLEAR_SUBMARINE&Tag=CLASS_NAVAL_RAIDER', 'Tag', { expect: 'CLASS_NAVAL_RAIDER' }),
        exertsNoZoc: xml('Units', 'UnitType=UNIT_NUCLEAR_SUBMARINE', 'ZoneOfControl', { expect: false }),
      },
    }),
    U({
      id: 'GIANT_DEATH_ROBOT',
      name: 'Giant Death Robot',
      cost: 1500,
      maintenance: 15,
      moves: 5,
      combat: 130,
      ranged: { strength: 120, range: 3 },
      antiAir: 90,
      gdr: true,
      waterWalk: true,
      // CIV6: "Can only heal in friendly territory", "Cannot earn experience
      // or Promotions", "Cannot form Corps or Armies by any means", and
      // "-17 Ranged Strength against District defenses and naval units" —
      // the district half of which is the penalty every land ranged unit
      // already pays, so `gdr` carries the NAVAL half.
      healFriendlyOnly: true,
      requiresTech: 'ROBOTICS',
      requiresResource: 'URANIUM',
      resourceCost: 1,
      resourceUpkeep: 3,
      description: 'The strongest chassis in the game: 1 Uranium to train and 3 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'Range'),
        antiAir: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'AntiAirCombat'),
        gdr: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_GIANT_DEATH_ROBOT' }),
        waterWalk: xml('ModifierArguments', 'ModifierId=GDR_FIGHT_WHILE_EMBARKED&Name=CanFight', 'Value'),
        requiresTech: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'PrereqTech', { expect: 'TECH_ROBOTICS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'StrategicResource', { expect: 'RESOURCE_URANIUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_GIANT_DEATH_ROBOT', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'AIRCRAFT_CARRIER',
      name: 'Aircraft Carrier',
      cost: 540,
      maintenance: 7,
      moves: 3,
      combat: 65,
      naval: true,
      airSlots: 2,
      requiresTech: 'COMBINED_ARMS',
      description: 'Atomic naval hull that bases 2 air units, and in GS it asks for no strategic resource.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'Combat'),
        naval: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'Domain', { expect: 'DOMAIN_SEA' }),
        airSlots: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'AirSlots'),
        requiresTech: xml('Units', 'UnitType=UNIT_AIRCRAFT_CARRIER', 'PrereqTech', { expect: 'TECH_COMBINED_ARMS' }),
      },
    }),
    U({
      id: 'BIPLANE',
      name: 'Biplane',
      cost: 430,
      maintenance: 6,
      moves: 6,
      combat: 80,
      ranged: { strength: 75, range: 4 },
      air: 'FIGHTER',
      requiresTech: 'FLIGHT',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'FIGHTER',
      description: 'The first air fighter: 1 Oil to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_BIPLANE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BIPLANE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BIPLANE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BIPLANE', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_BIPLANE', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_BIPLANE', 'Range'),
        air: xml('Units', 'UnitType=UNIT_BIPLANE', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
        requiresTech: xml('Units', 'UnitType=UNIT_BIPLANE', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
        requiresResource: xml('Units', 'UnitType=UNIT_BIPLANE', 'StrategicResource', { expect: 'RESOURCE_OIL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_BIPLANE', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_BIPLANE', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BIPLANE', 'UpgradeUnit', { expect: 'UNIT_FIGHTER' }),
      },
    }),
    U({
      id: 'FIGHTER',
      name: 'Fighter',
      cost: 520,
      maintenance: 7,
      moves: 8,
      combat: 100,
      ranged: { strength: 100, range: 5 },
      air: 'FIGHTER',
      requiresTech: 'ADVANCED_FLIGHT',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'JET_FIGHTER',
      description: 'Atomic air fighter: 1 Aluminum to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_FIGHTER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_FIGHTER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_FIGHTER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_FIGHTER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_FIGHTER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_FIGHTER', 'Range'),
        air: xml('Units', 'UnitType=UNIT_FIGHTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
        requiresTech: xml('Units', 'UnitType=UNIT_FIGHTER', 'PrereqTech', { expect: 'TECH_ADVANCED_FLIGHT' }),
        requiresResource: xml('Units', 'UnitType=UNIT_FIGHTER', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_FIGHTER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_FIGHTER', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_FIGHTER', 'UpgradeUnit', { expect: 'UNIT_JET_FIGHTER' }),
      },
    }),
    U({
      id: 'BOMBER',
      name: 'Bomber',
      cost: 560,
      maintenance: 7,
      moves: 10,
      combat: 85,
      ranged: { strength: 93, range: 10 },
      bombard: 110,
      air: 'BOMBER',
      requiresTech: 'ADVANCED_FLIGHT',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'JET_BOMBER',
      description: 'Atomic air bomber: 1 Aluminum to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_BOMBER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BOMBER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BOMBER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BOMBER', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_BOMBER', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_BOMBER', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_BOMBER', 'Bombard'),
        air: xml('Units', 'UnitType=UNIT_BOMBER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
        requiresTech: xml('Units', 'UnitType=UNIT_BOMBER', 'PrereqTech', { expect: 'TECH_ADVANCED_FLIGHT' }),
        requiresResource: xml('Units', 'UnitType=UNIT_BOMBER', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_BOMBER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_BOMBER', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BOMBER', 'UpgradeUnit', { expect: 'UNIT_JET_BOMBER' }),
      },
    }),
    U({
      id: 'JET_FIGHTER',
      name: 'Jet Fighter',
      cost: 650,
      maintenance: 8,
      moves: 10,
      combat: 110,
      ranged: { strength: 110, range: 6 },
      air: 'FIGHTER',
      requiresTech: 'LASERS',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information air fighter: 1 Aluminum to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'Range'),
        air: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
        requiresTech: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'PrereqTech', { expect: 'TECH_LASERS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_JET_FIGHTER', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_JET_FIGHTER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_JET_FIGHTER', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'JET_BOMBER',
      name: 'Jet Bomber',
      cost: 700,
      maintenance: 8,
      moves: 15,
      combat: 90,
      ranged: { strength: 103, range: 15 },
      bombard: 120,
      air: 'BOMBER',
      requiresTech: 'STEALTH_TECHNOLOGY',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information air bomber: 1 Aluminum to train and 1 per turn to run.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Combat'),
        'ranged.strength': { derived: 'Bombard - RANGED_CITY_PENALTY (17), what a siege chassis brings against a land unit', inputs: [xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Bombard')] },
        'ranged.range': xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Range'),
        bombard: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'Bombard'),
        air: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
        requiresTech: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'PrereqTech', { expect: 'TECH_STEALTH_TECHNOLOGY' }),
        requiresResource: xml('Units', 'UnitType=UNIT_JET_BOMBER', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_JET_BOMBER', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_JET_BOMBER', 'ResourceMaintenanceAmount'),
      },
    }),
    U({
      id: 'SPY',
      name: 'Spy',
      cost: 225,
      maintenance: 4,
      // the install's BaseMoves is 1, but this engine's spy never WALKS: it
      // jumps city-to-city over a travel timer, so a movement pool would only
      // hand the applier a unit to step (memory `zero-mp-chassis`).
      moves: 0,
      combat: 0,
      requiresCivic: 'DIPLOMATIC_SERVICE',
      spy: true,
      noGold: true,
      description: 'Runs secret missions in foreign cities and guards your own.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SPY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SPY', 'Maintenance'),
        moves: { stylized: 'the spy JUMPS between cities on a travel timer, it never steps — a movement pool (install BaseMoves 1) would be spent by nothing' },
        combat: xml('Units', 'UnitType=UNIT_SPY', 'Combat'),
        requiresCivic: xml('CivicModifiers', 'CivicType=CIVIC_DIPLOMATIC_SERVICE&ModifierId=CIVIC_GRANT_SPY', 'ModifierId', { expect: 'CIVIC_GRANT_SPY', note: 'the install has no PrereqCivic on the Spy: the civic GRANTS the first spy' }),
        spy: xml('Units', 'UnitType=UNIT_SPY', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
      },
    }),
    // The seven remaining GREAT PERSON chassis, appended LAST beside the
    // General and Admiral that already had one — roster indices ARE the GPU's
    // unit type ids. Every class is a unit that walks to the place its ability
    // may be spent; the id is the class's own name, which is what maps a
    // chassis back to `GREAT_PEOPLE`. `charges` is a placeholder the recruit
    // overwrites with that PERSON's count, and 4 MP is the General's pool.
    ...(['SCIENTIST', 'ENGINEER', 'MERCHANT', 'PROPHET', 'ARTIST', 'WRITER', 'MUSICIAN'] as const).map((c) =>
      U({
        id: c,
        name: `Great ${c[0]}${c.slice(1).toLowerCase()}`,
        cost: 0,
        maintenance: 0,
        moves: 4,
        combat: 0,
        charges: 1,
        spawnOnly: true,
        description: `Great ${c[0]}${c.slice(1).toLowerCase()} — walks to a legal site and spends a charge there.`,
        src: {
          cost: { stylized: 'great people arrive by points, never production — this model prices the chassis at 0 (units.ts header)' },
          maintenance: xml('Units', `UnitType=UNIT_GREAT_${c}`, 'Maintenance'),
          moves: xml('Units', `UnitType=UNIT_GREAT_${c}`, 'BaseMoves'),
          combat: xml('Units', `UnitType=UNIT_GREAT_${c}`, 'Combat'),
          charges: { stylized: 'a placeholder the great-person recruit overwrites with that PERSON\'s charge count' },
          spawnOnly: xml('Units', `UnitType=UNIT_GREAT_${c}`, 'CanTrain', { expect: false }),
        },
      })),
    // The WARRIOR MONK, appended LAST (roster order is the GPU's unit type
    // id). SOURCED: 200 Faith, 40 Combat Strength, 3 Movement, 2 Gold
    // maintenance, and "It can only be purchased with Faith in a city that has
    // a majority religion with the Warrior Monks Follower Belief and a Holy
    // Site with a Temple". A MILITARY unit with its own promotion table — it
    // is neither melee nor anti-cavalry, so no support chassis helps it.
    U({
      id: 'WARRIOR_MONK',
      name: 'Warrior Monk',
      cost: 100, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      maintenance: 2,
      moves: 3,
      combat: 40,
      faithOnly: true,
      description: 'Faith-bought combat unit with its own promotion tree.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_WARRIOR_MONK', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_WARRIOR_MONK', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_WARRIOR_MONK', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_WARRIOR_MONK', 'Combat'),
        faithOnly: xml('Units', 'UnitType=UNIT_WARRIOR_MONK', 'PurchaseYield', { expect: 'YIELD_FAITH' }),
      },
    }),
    // APPENDED LAST — the roster's order IS the GPU's unit-type id space.
    // CIV6 (Rock Band): an Atomic-era CIVILIAN (charges = 1, combat 0) that
    // "must be purchased with Faith" at a progressive price and "must always
    // perform in foreign lands".
    U({
      id: 'ROCK_BAND',
      name: 'Rock Band',
      cost: 300,
      costStep: 50,  // Units.xml CostProgressionParam1
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 1,
      faithOnly: true,
      requiresCivic: 'COLD_WAR',
      description: 'Performs a concert at a foreign venue for a tourism burst (faith purchase only).',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'Cost', { scale: GAME_SPEED }),
        costStep: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'CostProgressionParam1', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'Combat'),
        faithOnly: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'PurchaseYield', { expect: 'YIELD_FAITH' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_ROCK_BAND', 'PrereqCivic', { expect: 'CIVIC_COLD_WAR' }),
      },
    }),
    // CIV6 (Civilizations.xml): the roster's UNIQUE UNITS — each a chassis
    // of its own that `civUnitAllowed` hands to one civilization.
    U({
      id: 'LEGION',
      name: 'Legion',
      cost: 110,
      maintenance: 2,
      moves: 2,
      combat: 40,
      melee: true,
      charges: 1,
      fortBuilder: true,
      requiresTech: 'IRON_WORKING',
      requiresResource: 'IRON',
      upgradesTo: 'MAN_AT_ARMS',
      uniqueTo: 'ROME',
      replaces: 'SWORDSMAN',
      description: 'Roman Classical melee unit; can build a Roman Fort.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        charges: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'BuildCharges'),
        fortBuilder: xml('TypeTags', 'Type=UNIT_ROMAN_LEGION&Tag=CLASS_LEGION', 'Tag', { expect: 'CLASS_LEGION' }),
        requiresTech: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'PrereqTech', { expect: 'TECH_IRON_WORKING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_ROMAN_LEGION', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ROMAN_LEGION', 'UpgradeUnit', { expect: 'UNIT_MAN_AT_ARMS' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_ROMAN_LEGION', 'CivilizationType', { expect: 'CIVILIZATION_ROME' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_ROMAN_LEGION', 'ReplacesUnitType', { expect: 'UNIT_SWORDSMAN' }),
      },
    }),
    U({
      id: 'MARYANNU_CHARIOT_ARCHER',
      name: 'Maryannu Chariot Archer',
      cost: 90,
      maintenance: 1,
      moves: 2,
      combat: 25,
      ranged: { strength: 35, range: 2 },
      // CIV6: CLASS_LIGHT_CHARIOT + CLASS_RANGED_CAVALRY — the ranged-cavalry
      // tag keeps it an anti-cavalry target and lets it ignore ZOC.
      cavalry: true,
      // CIV6 (Maryannu Chariot Archer): "+2 Movement if starting in Desert,
      // Plains, Grassland, or Tundra."
      openTerrainMoves: 2,
      requiresTech: 'WHEEL',
      upgradesTo: 'CROSSBOWMAN',
      uniqueTo: 'EGYPT',
      description: 'Egyptian ranged cavalry.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'Range'),
        cavalry: xml('TypeTags', 'Type=UNIT_EGYPTIAN_CHARIOT_ARCHER&Tag=CLASS_RANGED_CAVALRY', 'Tag', { expect: 'CLASS_RANGED_CAVALRY' }),
        openTerrainMoves: xml('ModifierArguments', 'ModifierId=LIGHTCHARIOT_FASTER_CLEAR_TERRAIN&Name=Amount', 'Value'),
        requiresTech: xml('Units', 'UnitType=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'PrereqTech', { expect: 'TECH_THE_WHEEL' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_EGYPTIAN_CHARIOT_ARCHER', 'UpgradeUnit', { expect: 'UNIT_CROSSBOWMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_EGYPTIAN_CHARIOT_ARCHER', 'CivilizationType', { expect: 'CIVILIZATION_EGYPT' }),
      },
    }),
    U({
      id: 'BERSERKER',
      name: 'Berserker',
      cost: 160,
      maintenance: 3,
      moves: 2,
      combat: 48,
      melee: true,
      // CIV6 (Berserker Rage): "+10 Combat Strength when attacking, -5 when
      // defending against melee attacks."
      attackCS: 10,
      defendMeleeCS: -5,
      // CIV6 (Berserker Movement): "+2 Movement if this unit starts in
      // enemy territory."
      enemyTerritoryMoves: 2,
      requiresTech: 'MILITARY_TACTICS',
      requiresResource: 'IRON',
      upgradesTo: 'MUSKETMAN',
      uniqueTo: 'NORWAY',
      replaces: 'MAN_AT_ARMS',
      description: 'Norwegian Medieval melee unit.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        attackCS: xml('ModifierArguments', 'ModifierId=UNIT_STRONG_WHEN_ATTACKING&Name=Amount', 'Value'),
        defendMeleeCS: xml('ModifierArguments', 'ModifierId=UNIT_WEAK_WHEN_DEFENDING&Name=Amount', 'Value'),
        enemyTerritoryMoves: xml('ModifierArguments', 'ModifierId=BERSERKER_FASTER_ENEMY_TERRITORY&Name=Amount', 'Value'),
        requiresTech: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'PrereqTech', { expect: 'TECH_MILITARY_TACTICS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_NORWEGIAN_BERSERKER', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_NORWEGIAN_BERSERKER', 'UpgradeUnit', { expect: 'UNIT_MUSKETMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_NORWEGIAN_BERSERKER', 'CivilizationType', { expect: 'CIVILIZATION_NORWAY' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_NORWEGIAN_BERSERKER', 'ReplacesUnitType', { expect: 'UNIT_MAN_AT_ARMS' }),
      },
    }),
    U({
      id: 'LONGSHIP',
      name: 'Longship',
      cost: 65,
      maintenance: 1,
      moves: 3,
      combat: 35,
      naval: true,
      // CIV6 (Longship Movement): "+1 Movement while in coastal waters."
      coastMoves: 1,
      ignoresZoc: true, // CIV6: ABILITY_IGNORE_ZOC carries CLASS_LONGSHIP
      requiresTech: 'SAILING',
      upgradesTo: 'CARAVEL',
      uniqueTo: 'NORWAY',
      uniqueLeader: 'HARDRADA',
      replaces: 'GALLEY',
      description: 'Norwegian naval melee unit.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'Combat'),
        naval: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'Domain', { expect: 'DOMAIN_SEA' }),
        coastMoves: xml('ModifierArguments', 'ModifierId=LONGSHIP_FASTER_COAST&Name=Amount', 'Value'),
        ignoresZoc: xml('TypeTags', 'Type=UNIT_NORWEGIAN_LONGSHIP&Tag=CLASS_LONGSHIP', 'Tag', { expect: 'CLASS_LONGSHIP' }),
        requiresTech: xml('Units', 'UnitType=UNIT_NORWEGIAN_LONGSHIP', 'PrereqTech', { expect: 'TECH_SAILING' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_NORWEGIAN_LONGSHIP', 'UpgradeUnit', { expect: 'UNIT_CARAVEL' }),
        uniqueTo: xml('CivilizationLeaders', 'LeaderType=LEADER_HARDRADA', 'CivilizationType', { expect: 'CIVILIZATION_NORWAY', note: 'a LEADER unique (TRAIT_LEADER_UNIT_NORWEGIAN_LONGSHIP); the civilization is the leader’s' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_NORWEGIAN_LONGSHIP', 'ReplacesUnitType', { expect: 'UNIT_GALLEY' }),
      },
    }),
    U({
      id: 'ROUGH_RIDER',
      name: 'Rough Rider',
      cost: 385,
      maintenance: 2,
      moves: 5,
      combat: 67,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'BALLISTICS',
      // CIV6 (ABILITY_ROUGH_RIDER): +10 Combat Strength on Hills, and Culture
      // worth 50% of a defeated unit's strength "when on the capital's continent".
      groundCS: { amount: 10, hills: true },
      killCulturePct: 50,
      killYieldHomeOnly: true,
      upgradesTo: 'TANK',
      uniqueTo: 'AMERICA',
      uniqueLeader: 'T_ROOSEVELT',
      replaces: 'CUIRASSIER',
      description: "Teddy Roosevelt's heavy cavalry — no Iron asked.",
      src: {
        cost: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_AMERICAN_ROUGH_RIDER', 'PrereqTech', { expect: 'TECH_BALLISTICS' }),
        'groundCS.amount': xml('ModifierArguments', 'ModifierId=ROUGH_RIDER_BONUS_ON_HILLS&Name=Amount', 'Value'),
        killCulturePct: xml('ModifierArguments', 'ModifierId=ROUGH_RIDER_POST_COMBAT_CULTURE&Name=PercentDefeatedStrength', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_AMERICAN_ROUGH_RIDER', 'UpgradeUnit', { expect: 'UNIT_TANK' }),
        uniqueTo: xml('CivilizationLeaders', 'LeaderType=LEADER_T_ROOSEVELT_ROUGHRIDER', 'CivilizationType', { expect: 'CIVILIZATION_AMERICA', note: 'a LEADER unique (TRAIT_LEADER_UNIT_AMERICAN_ROUGH_RIDER); the engine’s T_ROOSEVELT is the install’s ROUGHRIDER persona' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_AMERICAN_ROUGH_RIDER', 'ReplacesUnitType', { expect: 'UNIT_CUIRASSIER' }),
      },
    }),
    U({
      id: 'REDCOAT',
      name: 'Redcoat',
      cost: 360,
      maintenance: 5,
      moves: 2,
      combat: 70,
      melee: true,
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'NITER',
      // CIV6 (ABILITY_REDCOAT): "+10 Combat Strength when fighting on a
      // continent other than the capital's", and no disembarking penalty.
      foreignContinentCS: 10,
      ignoresShores: true,
      upgradesTo: 'INFANTRY',
      uniqueTo: 'ENGLAND',
      uniqueLeader: 'VICTORIA',
      replaces: 'LINE_INFANTRY',
      description: "Victoria's line infantry, at home on foreign shores.",
      src: {
        cost: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_ENGLISH_REDCOAT', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        foreignContinentCS: xml('ModifierArguments', 'ModifierId=REDCOAT_FOREIGN_COMBAT&Name=Amount', 'Value'),
        ignoresShores: xml('ModifierArguments', 'ModifierId=REDCOAT_DISEMBARK&Name=Ignore', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ENGLISH_REDCOAT', 'UpgradeUnit', { expect: 'UNIT_INFANTRY' }),
        uniqueTo: xml('CivilizationLeaders', 'LeaderType=LEADER_VICTORIA', 'CivilizationType', { expect: 'CIVILIZATION_ENGLAND', note: 'a LEADER unique (TRAIT_LEADER_UNIT_ENGLISH_REDCOAT); Eleanor’s England trains none' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_ENGLISH_REDCOAT', 'ReplacesUnitType', { expect: 'UNIT_LINE_INFANTRY' }),
      },
    }),
    U({
      id: 'BLACK_ARMY',
      name: 'Black Army',
      cost: 205,
      maintenance: 3,
      moves: 5,
      combat: 49,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'CASTLES',
      requiresResource: 'HORSES',
      // CIV6 (ABILITY_BLACK_ARMY): "+3 Combat Strength for each adjacent levied unit."
      adjacentLeviedCS: 3,
      upgradesTo: 'CAVALRY',
      uniqueTo: 'HUNGARY',
      uniqueLeader: 'MATTHIAS_CORVINUS',
      replaces: 'COURSER',
      description: "Matthias Corvinus's light cavalry, strongest beside the levy.",
      src: {
        cost: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'PrereqTech', { expect: 'TECH_CASTLES' }),
        requiresResource: xml('Units', 'UnitType=UNIT_HUNGARY_BLACK_ARMY', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        adjacentLeviedCS: xml('ModifierArguments', 'ModifierId=BLACK_ARMY_ADJACENT_LEVY&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_HUNGARY_BLACK_ARMY', 'UpgradeUnit', { expect: 'UNIT_CAVALRY' }),
        uniqueTo: xml('CivilizationLeaders', 'LeaderType=LEADER_MATTHIAS_CORVINUS', 'CivilizationType', { expect: 'CIVILIZATION_HUNGARY', note: 'a LEADER unique (TRAIT_LEADER_UNIT_MATTHIAS_BLACK_ARMY)' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_HUNGARY_BLACK_ARMY', 'ReplacesUnitType', { expect: 'UNIT_COURSER' }),
      },
    }),
    U({
      id: 'WAR_CART',
      name: 'War-Cart',
      cost: 55,
      maintenance: 0,
      moves: 3,
      combat: 30,
      cavalry: true, // PROMOTION_CLASS_HEAVY_CAVALRY
      cavalryTag: 'heavy',
      chariot: true, // CLASS_HEAVY_CHARIOT — but CLASS_WAR_CART ignores ZOC
      ignoresZoc: true,
      // CIV6 (War-Cart): "+1 Movement if starting in Desert, Plains,
      // Grassland, or Tundra."
      openTerrainMoves: 1,
      upgradesTo: 'KNIGHT',
      uniqueTo: 'SUMERIA',
      description: 'Sumerian Ancient heavy cavalry, available from the start.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_SUMERIAN_WAR_CART', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        chariot: xml('TypeTags', 'Type=UNIT_SUMERIAN_WAR_CART&Tag=CLASS_HEAVY_CHARIOT', 'Tag', { expect: 'CLASS_HEAVY_CHARIOT' }),
        ignoresZoc: xml('TypeTags', 'Type=UNIT_SUMERIAN_WAR_CART&Tag=CLASS_WAR_CART', 'Tag', { expect: 'CLASS_WAR_CART' }),
        openTerrainMoves: xml('ModifierArguments', 'ModifierId=HEAVYCHARIOT_FASTER_CLEAR_TERRAIN&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SUMERIAN_WAR_CART', 'UpgradeUnit', { expect: 'UNIT_KNIGHT' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_SUMERIAN_WAR_CART', 'CivilizationType', { expect: 'CIVILIZATION_SUMERIA' }),
      },
    }),

    // ================= THE UNIQUE LAND UNITS =================
    // Every stat below is the install's own row (Units.xml, layered
    // Base <- Expansion1 <- Expansion2), and every ability is one
    // UnitAbilities.xml clause. A REPLACEMENT keeps the upgrade target of the
    // chassis it stands in for — that is what replacing it means for the
    // ladder; a chassis that replaces nothing takes the install's own
    // UnitUpgrades row.
    U({
      id: 'MAMLUK',
      name: 'Mamluk',
      cost: 220,       // Units.xml Cost (raw, pre-GAME_SPEED)
      maintenance: 4,  // Units.xml Maintenance
      moves: 4,
      combat: 50,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'STIRRUPS',
      requiresResource: 'IRON',
      // CIV6 (ABILITY_MAMLUK): "This unit heals every turn, even after moving
      // or combat."
      healsAlways: true,
      upgradesTo: 'CUIRASSIER',
      uniqueTo: 'ARABIA',
      replaces: 'KNIGHT',
      description: 'Arabian Medieval heavy cavalry that heals every turn.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'PrereqTech', { expect: 'TECH_STIRRUPS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_ARABIAN_MAMLUK', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        healsAlways: xml('UnitAbilityModifiers', 'UnitAbilityType=ABILITY_MAMLUK&ModifierId=MAMLUK_HEAL_EVERY_MOVE', 'ModifierId', { expect: 'MAMLUK_HEAL_EVERY_MOVE' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ARABIAN_MAMLUK', 'UpgradeUnit', { expect: 'UNIT_CUIRASSIER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_ARABIAN_MAMLUK', 'CivilizationType', { expect: 'CIVILIZATION_ARABIA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_ARABIAN_MAMLUK', 'ReplacesUnitType', { expect: 'UNIT_KNIGHT' }),
      },
    }),
    U({
      id: 'MOUNTIE',
      name: 'Mountie',
      cost: 290,
      maintenance: 3,
      moves: 5,
      combat: 62,
      cavalry: true,
      cavalryTag: 'light',
      sight: 4,
      requiresCivic: 'CONSERVATION',
      // CIV6 (ABILITY_MOUNTIE): "Can create a National Park" (ParkCharges 2)
      // and "+5 Combat Strength when fighting within 2 tiles of a National
      // Park owned by you."
      charges: 2,
      parkBuilder: true,
      nearParkCS: 5,
      uniqueTo: 'CANADA',
      description: 'Canadian light cavalry that founds National Parks.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        sight: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'BaseSightRange'),
        requiresCivic: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'PrereqCivic', { expect: 'CIVIC_CONSERVATION' }),
        charges: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'ParkCharges'),
        parkBuilder: xml('Units', 'UnitType=UNIT_CANADA_MOUNTIE', 'ParkCharges', { expect: 2, note: 'the install marks the park builder by carrying ParkCharges' }),
        nearParkCS: xml('ModifierArguments', 'ModifierId=OWNER_PARK_COMBAT_BONUS&Name=Amount', 'Value'),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_CANADA_MOUNTIE', 'CivilizationType', { expect: 'CIVILIZATION_CANADA' }),
      },
    }),
    U({
      id: 'CROUCHING_TIGER',
      name: 'Crouching Tiger',
      cost: 140,
      maintenance: 3,
      moves: 2,
      combat: 30,
      ranged: { strength: 50, range: 1 },
      requiresTech: 'MACHINERY',
      // the install gives it no ResourceCost — the Crossbowman's Niter is
      // what it is built INSTEAD of, and it replaces nothing.
      upgradesTo: 'FIELD_CANNON',
      uniqueTo: 'CHINA',
      description: 'Chinese Medieval ranged unit, short-ranged and cheap.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_CHINESE_CROUCHING_TIGER', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CHINESE_CROUCHING_TIGER', 'UpgradeUnit', { expect: 'UNIT_FIELD_CANNON' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_CHINESE_CROUCHING_TIGER', 'CivilizationType', { expect: 'CIVILIZATION_CHINA' }),
      },
    }),
    U({
      id: 'OKIHTCITAW',
      name: 'Okihtcitaw',
      cost: 40,
      maintenance: 0,
      moves: 3,
      combat: 20,
      recon: true,
      // CIV6 (ABILITY_CREE_OKIHTCITAW): "Starts with 1 free Promotion."
      freePromotions: 1,
      upgradesTo: 'SKIRMISHER',
      uniqueTo: 'CREE',
      replaces: 'SCOUT',
      description: 'Cree recon unit that starts promoted.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_CREE_OKIHTCITAW', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_CREE_OKIHTCITAW', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_CREE_OKIHTCITAW', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_CREE_OKIHTCITAW', 'Combat'),
        recon: xml('Units', 'UnitType=UNIT_CREE_OKIHTCITAW', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        freePromotions: xml('ModifierArguments', 'ModifierId=OKIHTCITAW_FREE_PROMOTION&Name=Amount', 'Value', { expect: -1, note: 'the install spells one free promotion as GRANT_EXPERIENCE Amount -1' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_CREE_OKIHTCITAW', 'UpgradeUnit', { expect: 'UNIT_SKIRMISHER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_CREE_OKIHTCITAW', 'CivilizationType', { expect: 'CIVILIZATION_CREE' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_CREE_OKIHTCITAW', 'ReplacesUnitType', { expect: 'UNIT_SCOUT' }),
      },
    }),
    U({
      id: 'GARDE_IMPERIALE',
      name: 'Garde Impériale',
      cost: 360,
      maintenance: 5,
      moves: 2,
      combat: 70,
      melee: true,
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'NITER',
      // CIV6 (ABILITY_GARDE): "+10 Combat Strength when on the same continent
      // as the Capital" and "+10 Great General points for kills."
      homeContinentCS: 10,
      generalPointsOnKill: 10,
      upgradesTo: 'INFANTRY',
      uniqueTo: 'FRANCE',
      replaces: 'LINE_INFANTRY',
      description: 'French Industrial melee unit, strongest at home.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        homeContinentCS: xml('ModifierArguments', 'ModifierId=GARDE_CONTINENT_COMBAT&Name=Amount', 'Value'),
        generalPointsOnKill: xml('ModifierArguments', 'ModifierId=GARDE_GREAT_GENERAL_POINTS&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_FRENCH_GARDE_IMPERIALE', 'UpgradeUnit', { expect: 'UNIT_INFANTRY' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_FRENCH_GARDE_IMPERIALE', 'CivilizationType', { expect: 'CIVILIZATION_FRANCE' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_FRENCH_GARDE_IMPERIALE', 'ReplacesUnitType', { expect: 'UNIT_LINE_INFANTRY' }),
      },
    }),
    U({
      id: 'KHEVSURETI',
      name: 'Khevsureti',
      cost: 160,
      maintenance: 3,
      moves: 2,
      combat: 48,
      melee: true,
      requiresTech: 'MILITARY_TACTICS',
      requiresResource: 'IRON',
      // CIV6 (ABILITY_GEORGIAN_KHEVSURETI): "+7 Combat Strength bonus when
      // fighting in Hill terrain" and "No Movement penalty in Hill terrain."
      groundCS: { amount: 7, hills: true },
      ignoresHillCost: true,
      upgradesTo: 'MUSKETMAN',
      uniqueTo: 'GEORGIA',
      replaces: 'MAN_AT_ARMS',
      description: 'Georgian Medieval melee unit, at home in the hills.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'PrereqTech', { expect: 'TECH_MILITARY_TACTICS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_GEORGIAN_KHEVSURETI', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        'groundCS.amount': xml('ModifierArguments', 'ModifierId=KHEVSURETI_HILLS_BUFF&Name=Amount', 'Value'),
        'groundCS.hills': xml('Modifiers', 'ModifierId=KHEVSURETI_HILLS_BUFF', 'SubjectRequirementSetId', { expect: 'KHEVSURETI_HILLS_BUFF_REQUIREMENTS', note: 'the ground the bonus asks for lives in the requirement set' }),
        ignoresHillCost: xml('ModifierArguments', 'ModifierId=KHEVSURETI_IGNORE_HILLS&Name=Ignore', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_GEORGIAN_KHEVSURETI', 'UpgradeUnit', { expect: 'UNIT_MUSKETMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_GEORGIAN_KHEVSURETI', 'CivilizationType', { expect: 'CIVILIZATION_GEORGIA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_GEORGIAN_KHEVSURETI', 'ReplacesUnitType', { expect: 'UNIT_MAN_AT_ARMS' }),
      },
    }),
    U({
      id: 'HOPLITE',
      name: 'Hoplite',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 28,
      antiCavalry: true,
      requiresTech: 'BRONZE_WORKING',
      // CIV6 (ABILITY_HOPLITE): "+10 Combat Strength if there is at least one
      // Hoplite adjacent."
      adjacentSameCS: 10,
      upgradesTo: 'PIKEMAN',
      uniqueTo: 'GREECE',
      replaces: 'SPEARMAN',
      description: 'Greek Ancient anti-cavalry unit, stronger in a line.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_GREEK_HOPLITE', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
        adjacentSameCS: xml('ModifierArguments', 'ModifierId=HOPLITE_NEIGHBOR_COMBAT_MODIFIER&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_GREEK_HOPLITE', 'UpgradeUnit', { expect: 'UNIT_PIKEMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_GREEK_HOPLITE', 'CivilizationType', { expect: 'CIVILIZATION_GREECE' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_GREEK_HOPLITE', 'ReplacesUnitType', { expect: 'UNIT_SPEARMAN' }),
      },
    }),
    U({
      id: 'HUSZAR',
      name: 'Huszár',
      cost: 335,
      maintenance: 5,
      moves: 5,
      combat: 65,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'HORSES',
      // CIV6 (ABILITY_HUSZAR): "+3 Combat Strength from each active Alliance."
      allianceCS: 3,
      upgradesTo: 'HELICOPTER',
      uniqueTo: 'HUNGARY',
      replaces: 'CAVALRY',
      description: 'Hungarian light cavalry, stronger with every ally.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_HUNGARY_HUSZAR', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        allianceCS: xml('ModifierArguments', 'ModifierId=HUSZAR_ALLIES_COMBAT_BONUS&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_HUNGARY_HUSZAR', 'UpgradeUnit', { expect: 'UNIT_HELICOPTER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_HUNGARY_HUSZAR', 'CivilizationType', { expect: 'CIVILIZATION_HUNGARY' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_HUNGARY_HUSZAR', 'ReplacesUnitType', { expect: 'UNIT_CAVALRY' }),
      },
    }),
    U({
      id: 'WARAKAQ',
      name: "Warak'aq",
      cost: 165,
      maintenance: 2,
      moves: 3,
      combat: 20,
      ranged: { strength: 40, range: 1 },
      recon: true,
      requiresTech: 'MACHINERY',
      // CIV6 (ABILITY_EXPERT_MARKSMAN): "+1 additional attack per turn if
      // unit has not used all its movement."
      extraAttack: true,
      upgradesTo: 'RANGER',
      uniqueTo: 'INCA',
      replaces: 'SKIRMISHER',
      description: 'Incan recon skirmisher that can strike twice.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'Range'),
        recon: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        requiresTech: xml('Units', 'UnitType=UNIT_INCA_WARAKAQ', 'PrereqTech', { expect: 'TECH_MACHINERY' }),
        extraAttack: xml('ModifierArguments', 'ModifierId=EXPERT_MARKSMAN_ADDITIONAL_ATTACK&Name=Amount', 'Value', { expect: 1 }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_INCA_WARAKAQ', 'UpgradeUnit', { expect: 'UNIT_RANGER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_INCA_WARAKAQ', 'CivilizationType', { expect: 'CIVILIZATION_INCA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_INCA_WARAKAQ', 'ReplacesUnitType', { expect: 'UNIT_SKIRMISHER' }),
      },
    }),
    U({
      id: 'VARU',
      name: 'Varu',
      cost: 120,
      maintenance: 2,  // Units.xml Maintenance
      moves: 2,
      combat: 40,
      cavalry: true,
      cavalryTag: 'heavy',
      sight: 3,
      requiresTech: 'HORSEBACK_RIDING',
      // CIV6 (ABILITY_VARU): "-5 Combat Strength to adjacent enemy units."
      adjacentEnemyCS: -5,
      upgradesTo: 'CUIRASSIER',
      uniqueTo: 'INDIA',
      description: 'Indian war elephant; enemies beside it fight weaker.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        sight: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'BaseSightRange'),
        requiresTech: xml('Units', 'UnitType=UNIT_INDIAN_VARU', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' }),
        adjacentEnemyCS: xml('ModifierArguments', 'ModifierId=VARU_NEGATIVE_COMBAT_MODIFIER&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_INDIAN_VARU', 'UpgradeUnit', { expect: 'UNIT_CUIRASSIER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_INDIAN_VARU', 'CivilizationType', { expect: 'CIVILIZATION_INDIA' }),
      },
    }),
    U({
      id: 'SAMURAI',
      name: 'Samurai',
      cost: 160,
      maintenance: 3,
      moves: 2,
      combat: 48,
      melee: true,
      requiresCivic: 'FEUDALISM',
      requiresResource: 'IRON',
      // CIV6 (ABILITY_SAMURAI): "This unit does not suffer combat penalties
      // when damaged."
      noWoundPenalty: true,
      upgradesTo: 'MUSKETMAN',
      uniqueTo: 'JAPAN',
      replaces: 'MAN_AT_ARMS',
      description: 'Japanese Medieval melee unit that fights on undiminished.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'PrereqCivic', { expect: 'CIVIC_FEUDALISM' }),
        requiresResource: xml('Units', 'UnitType=UNIT_JAPANESE_SAMURAI', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        noWoundPenalty: xml('ModifierArguments', 'ModifierId=SAMURAI_NO_REDUCTION_DAMAGE&Name=NoReduction', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_JAPANESE_SAMURAI', 'UpgradeUnit', { expect: 'UNIT_MUSKETMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_JAPANESE_SAMURAI', 'CivilizationType', { expect: 'CIVILIZATION_JAPAN' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_JAPANESE_SAMURAI', 'ReplacesUnitType', { expect: 'UNIT_MAN_AT_ARMS' }),
      },
    }),
    U({
      id: 'NGAO_MBEBA',
      name: 'Ngao Mbeba',
      cost: 110,
      maintenance: 2,
      moves: 2,
      combat: 38,
      melee: true,
      requiresTech: 'IRON_WORKING',
      requiresResource: 'IRON',
      // CIV6 (ABILITY_NAGAO): "+10 Combat Strength when defending against
      // ranged units", "Can move through Woods and Rainforest without
      // Movement penalty" and NAGAO_FOREST_SIGHT — it sees through features.
      defendRangedCS: 10,
      ignoresWoodsCost: true,
      seesThrough: true,
      upgradesTo: 'MAN_AT_ARMS',
      uniqueTo: 'KONGO',
      replaces: 'SWORDSMAN',
      description: 'Kongolese shield bearer, hard to shoot and quick in the trees.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'PrereqTech', { expect: 'TECH_IRON_WORKING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_KONGO_SHIELD_BEARER', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        defendRangedCS: xml('ModifierArguments', 'ModifierId=NAGAO_RANGED_DEFENSE&Name=Amount', 'Value'),
        ignoresWoodsCost: xml('ModifierArguments', 'ModifierId=NAGAO_FOREST_MOVEMENT&Name=Ignore', 'Value'),
        seesThrough: xml('ModifierArguments', 'ModifierId=NAGAO_FOREST_SIGHT&Name=CanSee', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_KONGO_SHIELD_BEARER', 'UpgradeUnit', { expect: 'UNIT_MAN_AT_ARMS' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_KONGO_SHIELD_BEARER', 'CivilizationType', { expect: 'CIVILIZATION_KONGO' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_KONGO_SHIELD_BEARER', 'ReplacesUnitType', { expect: 'UNIT_SWORDSMAN' }),
      },
    }),
    U({
      id: 'HWACHA',
      name: 'Hwacha',
      cost: 250,
      maintenance: 3,
      moves: 2,
      combat: 45,
      ranged: { strength: 60, range: 2 },
      requiresTech: 'GUNPOWDER',
      // CIV6 (ABILITY_NO_MOVE_AND_SHOOT, CLASS_FIELD_SETUP): "Cannot move and
      // attack in the same turn."
      noMoveAndShoot: true,
      upgradesTo: 'MACHINE_GUN',
      uniqueTo: 'KOREA',
      replaces: 'FIELD_CANNON',
      description: 'Korean rocket artillery that must set up before firing.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'Range'),
        requiresTech: xml('Units', 'UnitType=UNIT_KOREAN_HWACHA', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
        noMoveAndShoot: xml('ModifierArguments', 'ModifierId=NOMOVEANDSHOOT_MOVE_AND_ATTACK&Name=CanAttack', 'Value', { expect: false, note: 'the install spells it as CanAttack false' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_KOREAN_HWACHA', 'UpgradeUnit', { expect: 'UNIT_MACHINE_GUN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_KOREAN_HWACHA', 'CivilizationType', { expect: 'CIVILIZATION_KOREA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_KOREAN_HWACHA', 'ReplacesUnitType', { expect: 'UNIT_FIELD_CANNON' }),
      },
    }),
    U({
      id: 'MANDEKALU_CAVALRY',
      name: 'Mandekalu Cavalry',
      cost: 220,
      maintenance: 4,
      moves: 4,
      combat: 55,
      cavalry: true,
      cavalryTag: 'heavy',
      requiresTech: 'STIRRUPS',
      requiresResource: 'IRON',
      // CIV6 (ABILITY_MANDEKALU): "Protects nearby land Trade units from
      // Plunder" and "Gain Gold equal to 100% that unit's base Combat
      // Strength" on a kill.
      guardsTraders: 'land',
      killGoldPct: 100,
      upgradesTo: 'CUIRASSIER',
      uniqueTo: 'MALI',
      replaces: 'KNIGHT',
      description: 'Malian heavy cavalry that guards caravans and takes plunder.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'PrereqTech', { expect: 'TECH_STIRRUPS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'StrategicResource', { expect: 'RESOURCE_IRON' }),
        guardsTraders: xml('ModifierArguments', 'ModifierId=MANDEKALU_GRANT_TRADER_IMMUNITY&Name=AbilityType', 'Value', { expect: 'ABILITY_TRADER_PROTECTED_BY_MANDEKALU' }),
        killGoldPct: xml('ModifierArguments', 'ModifierId=MANDEKALU_POST_COMBAT_GOLD&Name=PercentDefeatedStrength', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MALI_MANDEKALU_CAVALRY', 'UpgradeUnit', { expect: 'UNIT_CUIRASSIER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_MALI_MANDEKALU_CAVALRY', 'CivilizationType', { expect: 'CIVILIZATION_MALI' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_MALI_MANDEKALU_CAVALRY', 'ReplacesUnitType', { expect: 'UNIT_KNIGHT' }),
      },
    }),
    U({
      id: 'TOA',
      name: 'Toa',
      cost: 120,
      maintenance: 0,  // Units.xml Maintenance (schema default 0 — the row carries none)
      moves: 2,
      combat: 38,
      melee: true,
      requiresTech: 'CONSTRUCTION',
      // no `requiresResource`: the install's UNIT_MAORI_TOA row carries NO
      // StrategicResource, so the unique is exempt from the Swordsman's iron.
      // CIV6 (ABILITY_TOA): "Adjacent enemy units receive -5 Combat Strength."
      // (Its Pā improvement waits on the unique-infrastructure roster.)
      adjacentEnemyCS: -5,
      upgradesTo: 'MAN_AT_ARMS',
      uniqueTo: 'MAORI',
      replaces: 'SWORDSMAN',
      description: 'Māori melee unit; enemies beside it fight weaker.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MAORI_TOA', 'PrereqTech', { expect: 'TECH_CONSTRUCTION' }),
        adjacentEnemyCS: xml('ModifierArguments', 'ModifierId=TOA_NEGATIVE_COMBAT_MODIFIER&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MAORI_TOA', 'UpgradeUnit', { expect: 'UNIT_MAN_AT_ARMS' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_MAORI_TOA', 'CivilizationType', { expect: 'CIVILIZATION_MAORI' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_MAORI_TOA', 'ReplacesUnitType', { expect: 'UNIT_SWORDSMAN' }),
      },
    }),
    U({
      id: 'MALON_RAIDER',
      name: 'Malón Raider',
      cost: 230,
      maintenance: 4,
      moves: 4,
      combat: 55,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'GUNPOWDER',
      // CIV6 (ABILITY_MAPUCHE_MALON_RAIDER): "+5 Combat Strength bonus within
      // 4 hexes of friendly territory" and "Pillaging costs 1 Movement."
      nearTerritoryCS: { amount: 5, range: 4 },
      pillageCost: 1,
      upgradesTo: 'CAVALRY',
      uniqueTo: 'MAPUCHE',
      description: 'Mapuche raider that pillages at a walk.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MAPUCHE_MALON_RAIDER', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
        'nearTerritoryCS.amount': xml('ModifierArguments', 'ModifierId=MALON_RAIDER_TERRITORY_COMBAT_BONUS&Name=Amount', 'Value'),
        'nearTerritoryCS.range': xml('Modifiers', 'ModifierId=MALON_RAIDER_TERRITORY_COMBAT_BONUS', 'SubjectRequirementSetId', { expect: 'MALON_RAIDER_FRIENDLY_TERRITORY_REQUIREMENTS', note: 'the four-hex reach lives in the requirement set' }),
        pillageCost: xml('GlobalParameters', 'Name=PILLAGE_ADVANCED_MOVEMENT_COST', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MAPUCHE_MALON_RAIDER', 'UpgradeUnit', { expect: 'UNIT_CAVALRY' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_MAPUCHE_MALON_RAIDER', 'CivilizationType', { expect: 'CIVILIZATION_MAPUCHE' }),
      },
    }),
    U({
      id: 'KESHIG',
      name: 'Keshig',
      cost: 160,
      maintenance: 3,
      moves: 4,
      combat: 35,
      ranged: { strength: 45, range: 2 },
      cavalry: true, // CLASS_RANGED_CAVALRY — no light/heavy tag
      requiresTech: 'STIRRUPS',
      requiresResource: 'HORSES',
      // CIV6 (ABILITY_MONGOLIAN_KESHIG): "Can escort moving civilian and
      // support units at their higher Movement speed."
      escortSpeed: true,
      upgradesTo: 'FIELD_CANNON',
      uniqueTo: 'MONGOLIA',
      description: 'Mongolian ranged cavalry that carries civilians along.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'Range'),
        cavalry: xml('TypeTags', 'Type=UNIT_MONGOLIAN_KESHIG&Tag=CLASS_RANGED_CAVALRY', 'Tag', { expect: 'CLASS_RANGED_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'PrereqTech', { expect: 'TECH_STIRRUPS' }),
        requiresResource: xml('Units', 'UnitType=UNIT_MONGOLIAN_KESHIG', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        escortSpeed: xml('ModifierArguments', 'ModifierId=ESCORT_MOBILITY_SHARED_MOVEMENT&Name=EscortMobility', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_MONGOLIAN_KESHIG', 'UpgradeUnit', { expect: 'UNIT_FIELD_CANNON' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_MONGOLIAN_KESHIG', 'CivilizationType', { expect: 'CIVILIZATION_MONGOLIA' }),
      },
    }),
    U({
      id: 'COSSACK',
      name: 'Cossack',
      cost: 340,
      maintenance: 5,
      moves: 5,
      combat: 67,
      cavalry: true,
      cavalryTag: 'light',
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'HORSES',
      // CIV6 (ABILITY_COSSACK): "Can move after attacking" and "+5 Combat
      // Strength in or adjacent to your territory."
      moveAfterAttack: true,
      nearTerritoryCS: { amount: 5, range: 1 },
      upgradesTo: 'HELICOPTER',
      uniqueTo: 'RUSSIA',
      replaces: 'CAVALRY',
      description: 'Russian light cavalry, deadliest on its own ground.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'Combat'),
        cavalry: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        cavalryTag: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'PrereqTech', { expect: 'TECH_MILITARY_SCIENCE' }),
        requiresResource: xml('Units', 'UnitType=UNIT_RUSSIAN_COSSACK', 'StrategicResource', { expect: 'RESOURCE_HORSES' }),
        moveAfterAttack: xml('ModifierArguments', 'ModifierId=COSSACK_MOVE_AND_ATTACK&Name=CanMove', 'Value'),
        'nearTerritoryCS.amount': xml('ModifierArguments', 'ModifierId=COSSACK_LOCAL_COMBAT&Name=Amount', 'Value'),
        'nearTerritoryCS.range': xml('Modifiers', 'ModifierId=COSSACK_LOCAL_COMBAT', 'SubjectRequirementSetId', { expect: 'COSSACK_PLOT_IS_OWNER_OR_ADJACENT_REQUIREMENTS', note: '"in or adjacent to" is the requirement set, i.e. range 1' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_RUSSIAN_COSSACK', 'UpgradeUnit', { expect: 'UNIT_HELICOPTER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_RUSSIAN_COSSACK', 'CivilizationType', { expect: 'CIVILIZATION_RUSSIA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_RUSSIAN_COSSACK', 'ReplacesUnitType', { expect: 'UNIT_CAVALRY' }),
      },
    }),
    U({
      id: 'HIGHLANDER',
      name: 'Highlander',
      cost: 380,
      maintenance: 5,
      moves: 3,
      combat: 50,
      ranged: { strength: 65, range: 1 },
      recon: true,
      requiresTech: 'RIFLING',
      // CIV6 (ABILITY_SCOTTISH_HIGHLANDER): "+5 Combat Strength bonus in
      // Hills and Forest."
      // the install's FEATURE_FOREST is this engine's WOODS
      groundCS: { amount: 5, hills: true, features: ['WOODS'] },
      upgradesTo: 'SPEC_OPS',
      uniqueTo: 'SCOTLAND',
      replaces: 'RANGER',
      description: 'Scottish ranger, at home in hill and wood.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'Range'),
        recon: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SCOTTISH_HIGHLANDER', 'PrereqTech', { expect: 'TECH_RIFLING' }),
        'groundCS.amount': xml('ModifierArguments', 'ModifierId=HIGHLANDER_COMBAT_BONUS_FOREST_AND_HILLS&Name=Amount', 'Value'),
        'groundCS.hills': xml('Modifiers', 'ModifierId=HIGHLANDER_COMBAT_BONUS_FOREST_AND_HILLS', 'SubjectRequirementSetId', { expect: 'HIGHLANDER_COMBAT_BONUS_TERRAIN_REQUIREMENTS', note: 'hills and FEATURE_FOREST both live in the requirement set' }),
        'groundCS.features': xml('Modifiers', 'ModifierId=HIGHLANDER_COMBAT_BONUS_FOREST_AND_HILLS', 'SubjectRequirementSetId', { expect: 'HIGHLANDER_COMBAT_BONUS_TERRAIN_REQUIREMENTS', note: 'the engine\'s WOODS is the install\'s FEATURE_FOREST' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SCOTTISH_HIGHLANDER', 'UpgradeUnit', { expect: 'UNIT_SPEC_OPS' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_SCOTTISH_HIGHLANDER', 'CivilizationType', { expect: 'CIVILIZATION_SCOTLAND' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_SCOTTISH_HIGHLANDER', 'ReplacesUnitType', { expect: 'UNIT_RANGER' }),
      },
    }),
    U({
      id: 'CONQUISTADOR',
      name: 'Conquistador',
      cost: 250,
      maintenance: 4,
      moves: 2,
      combat: 58,
      melee: true,
      requiresTech: 'GUNPOWDER',
      requiresResource: 'NITER',
      // CIV6 (ABILITY_CONQUISTADOR): "+10 Combat Strength when there is a
      // religious unit within one hex" and a captured city converts to this
      // seat's majority religion.
      nearReligiousCS: 10,
      captureConverts: true,
      upgradesTo: 'LINE_INFANTRY',
      uniqueTo: 'SPAIN',
      replaces: 'MUSKETMAN',
      description: 'Spanish Renaissance melee unit that converts what it takes.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
        requiresResource: xml('Units', 'UnitType=UNIT_SPANISH_CONQUISTADOR', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        nearReligiousCS: xml('ModifierArguments', 'ModifierId=CONQUISTADOR_SPECIFIC_UNIT_COMBAT&Name=Amount', 'Value'),
        captureConverts: xml('ModifierArguments', 'ModifierId=CONQUISTADOR_CITY_RELIGION_COMBAT&Name=Enable', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SPANISH_CONQUISTADOR', 'UpgradeUnit', { expect: 'UNIT_LINE_INFANTRY' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_SPANISH_CONQUISTADOR', 'CivilizationType', { expect: 'CIVILIZATION_SPAIN' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_SPANISH_CONQUISTADOR', 'ReplacesUnitType', { expect: 'UNIT_MUSKETMAN' }),
      },
    }),
    U({
      id: 'CAROLEAN',
      name: 'Carolean',
      cost: 250,
      maintenance: 3,
      moves: 3,
      combat: 55,
      antiCavalry: true,
      requiresTech: 'METAL_CASTING',
      // CIV6 (ABILITY_CAROLEAN): "+3 Combat Strength per unused Movement."
      unusedMoveCS: 3,
      upgradesTo: 'AT_CREW',
      uniqueTo: 'SWEDEN',
      replaces: 'PIKE_AND_SHOT',
      description: 'Swedish anti-cavalry unit that fights best standing still.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SWEDEN_CAROLEAN', 'PrereqTech', { expect: 'TECH_METAL_CASTING' }),
        unusedMoveCS: xml('ModifierArguments', 'ModifierId=CAROLEAN_UNUSED_MOVEMENT_COMBAT&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SWEDEN_CAROLEAN', 'UpgradeUnit', { expect: 'UNIT_AT_CREW' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_SWEDEN_CAROLEAN', 'CivilizationType', { expect: 'CIVILIZATION_SWEDEN' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_SWEDEN_CAROLEAN', 'ReplacesUnitType', { expect: 'UNIT_PIKE_AND_SHOT' }),
      },
    }),
    U({
      id: 'IMPI',
      name: 'Impi',
      cost: 125,
      maintenance: 1,
      moves: 2,
      combat: 45,
      antiCavalry: true,
      requiresTech: 'MILITARY_TACTICS',
      // CIV6 (ABILITY_ZULU_IMPI): "+100% Flanking bonus" and "Earns experience
      // 25% faster."
      flankMult: 2,
      xpRate: 1.25,
      upgradesTo: 'PIKE_AND_SHOT',
      uniqueTo: 'ZULU',
      replaces: 'PIKEMAN',
      description: 'Zulu anti-cavalry unit that flanks twice as hard.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'Combat'),
        antiCavalry: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_ZULU_IMPI', 'PrereqTech', { expect: 'TECH_MILITARY_TACTICS' }),
        flankMult: xml('ModifierArguments', 'ModifierId=IMPI_INCREASED_FLANKING_BONUS&Name=Percent', 'Value', { expect: 100, note: 'the install gives +100%; the engine holds the multiplier' }),
        xpRate: xml('ModifierArguments', 'ModifierId=IMPI_FASTER_COMBAT_XP&Name=Amount', 'Value', { expect: 25, note: 'the install gives +25%; the engine holds the multiplier' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ZULU_IMPI', 'UpgradeUnit', { expect: 'UNIT_PIKE_AND_SHOT' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_ZULU_IMPI', 'CivilizationType', { expect: 'CIVILIZATION_ZULU' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_ZULU_IMPI', 'ReplacesUnitType', { expect: 'UNIT_PIKEMAN' }),
      },
    }),

    // ========== THE UNIQUE NAVAL AND AIR UNITS, AND THE TWO LATE LAND ROWS ==========
    U({
      id: 'P51_MUSTANG',
      name: 'P-51 Mustang',
      cost: 520,
      maintenance: 7,
      moves: 10,
      combat: 105,
      ranged: { strength: 105, range: 5 },
      air: 'FIGHTER',
      sight: 4,
      requiresTech: 'ADVANCED_FLIGHT',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      // CIV6 (ABILITY_MUSTANG): "+5 Combat Strength bonus vs. Fighters" and
      // "+50% experience from combat."
      vsFighterCS: 5,
      xpRate: 1.5,
      upgradesTo: 'JET_FIGHTER',
      uniqueTo: 'AMERICA',
      replaces: 'FIGHTER',
      description: 'American fighter, deadlier against its own kind.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'Range'),
        air: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
        sight: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'BaseSightRange'),
        requiresTech: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'PrereqTech', { expect: 'TECH_ADVANCED_FLIGHT' }),
        requiresResource: xml('Units', 'UnitType=UNIT_AMERICAN_P51', 'StrategicResource', { expect: 'RESOURCE_ALUMINUM' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_AMERICAN_P51', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_AMERICAN_P51', 'ResourceMaintenanceAmount'),
        vsFighterCS: xml('ModifierArguments', 'ModifierId=ANTI_FIGHTER_AIRCRAFT_COMBAT_BONUS&Name=Amount', 'Value'),
        xpRate: xml('ModifierArguments', 'ModifierId=MUSTANG_MORE_EXPERIENCE&Name=Amount', 'Value', { expect: 50, note: 'the install gives +50%; the engine holds the multiplier' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_AMERICAN_P51', 'UpgradeUnit', { expect: 'UNIT_JET_FIGHTER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_AMERICAN_P51', 'CivilizationType', { expect: 'CIVILIZATION_AMERICA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_AMERICAN_P51', 'ReplacesUnitType', { expect: 'UNIT_FIGHTER' }),
      },
    }),
    U({
      id: 'MINAS_GERAES',
      name: 'Minas Geraes',
      cost: 430,
      maintenance: 6,
      moves: 5,
      combat: 70,
      ranged: { strength: 80, range: 3 },
      antiAir: 95,  // Units.xml AntiAirCombat
      naval: true,
      // the install gives it no ability row: it is the Battleship arriving a
      // whole era early, off a CIVIC, and stronger.
      requiresCivic: 'NATIONALISM',
      requiresResource: 'COAL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'MISSILE_CRUISER',
      uniqueTo: 'BRAZIL',
      replaces: 'BATTLESHIP',
      description: 'Brazilian battleship, early and strong.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'Range'),
        antiAir: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'AntiAirCombat'),
        naval: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'PrereqCivic', { expect: 'CIVIC_NATIONALISM' }),
        requiresResource: xml('Units', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'StrategicResource', { expect: 'RESOURCE_COAL' }),
        resourceCost: xml('Units_XP2', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'ResourceCost'),
        resourceUpkeep: xml('Units_XP2', 'UnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'ResourceMaintenanceAmount'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_BRAZILIAN_MINAS_GERAES', 'UpgradeUnit', { expect: 'UNIT_MISSILE_CRUISER' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_BRAZILIAN_MINAS_GERAES', 'CivilizationType', { expect: 'CIVILIZATION_BRAZIL' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_BRAZILIAN_MINAS_GERAES', 'ReplacesUnitType', { expect: 'UNIT_BATTLESHIP' }),
      },
    }),
    U({
      id: 'SEA_DOG',
      name: 'Sea Dog',
      cost: 280,
      maintenance: 4,
      moves: 4,
      combat: 40,
      ranged: { strength: 55, range: 2 },
      naval: true,
      raider: true,
      stealth: true,
      revealStealth: true,
      requiresCivic: 'MERCANTILISM',
      // CIV6 (ABILITY_PRIZE_SHIPS, CLASS_CAPTURE_SHIPS): "Can capture defeated
      // enemy naval vessels."
      captureShips: true,
      upgradesTo: 'SUBMARINE',
      uniqueTo: 'ENGLAND',
      replaces: 'PRIVATEER',
      description: 'English raider that takes its prizes home.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'Domain', { expect: 'DOMAIN_SEA' }),
        raider: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        stealth: xml('TypeTags', 'Type=UNIT_ENGLISH_SEADOG&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_ENGLISH_SEADOG&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_ENGLISH_SEADOG', 'PrereqCivic', { expect: 'CIVIC_MERCANTILISM' }),
        captureShips: xml('ModifierArguments', 'ModifierId=CAPTURE_PRIZE_SHIPS&Name=CanCapture', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_ENGLISH_SEADOG', 'UpgradeUnit', { expect: 'UNIT_SUBMARINE' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_ENGLISH_SEADOG', 'CivilizationType', { expect: 'CIVILIZATION_ENGLAND' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_ENGLISH_SEADOG', 'ReplacesUnitType', { expect: 'UNIT_PRIVATEER' }),
      },
    }),
    U({
      id: 'U_BOAT',
      name: 'U-Boat',
      cost: 430,
      maintenance: 6,
      moves: 3,
      combat: 65,
      ranged: { strength: 75, range: 2 },
      naval: true,
      raider: true,
      stealth: true,
      revealStealth: true,
      sight: 3,
      requiresTech: 'ELECTRICITY',
      // no strategic bill: the install's UNIT_GERMAN_UBOAT row carries no
      // StrategicResource and Units_XP2 has no row for it, so the unique is
      // exempt from the Submarine's oil (cost and upkeep alike).
      // CIV6 (ABILITY_UBOAT): "+10 Combat Strength in Ocean combat."
      oceanCS: 10,
      upgradesTo: 'NUCLEAR_SUBMARINE',
      uniqueTo: 'GERMANY',
      replaces: 'SUBMARINE',
      description: 'German submarine, cheaper and deadly in deep water.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'Domain', { expect: 'DOMAIN_SEA' }),
        raider: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        stealth: xml('TypeTags', 'Type=UNIT_GERMAN_UBOAT&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_GERMAN_UBOAT&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        sight: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'BaseSightRange'),
        requiresTech: xml('Units', 'UnitType=UNIT_GERMAN_UBOAT', 'PrereqTech', { expect: 'TECH_ELECTRICITY' }),
        oceanCS: xml('ModifierArguments', 'ModifierId=UBOAT_OCEAN_COMBAT&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_GERMAN_UBOAT', 'UpgradeUnit', { expect: 'UNIT_NUCLEAR_SUBMARINE' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_GERMAN_UBOAT', 'CivilizationType', { expect: 'CIVILIZATION_GERMANY' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_GERMAN_UBOAT', 'ReplacesUnitType', { expect: 'UNIT_SUBMARINE' }),
      },
    }),
    U({
      id: 'DE_ZEVEN_PROVINCIEN',
      name: 'De Zeven Provinciën',
      cost: 280,
      maintenance: 5,
      moves: 4,
      combat: 50,
      ranged: { strength: 60, range: 2 },
      naval: true,
      requiresTech: 'SQUARE_RIGGING',
      requiresResource: 'NITER',
      // CIV6 (ABILITY_DUTCH_ZEVEN_PROVINCIEN): "+7 Combat Strength when
      // attacking defensible districts."
      districtAttackCS: 7,
      upgradesTo: 'BATTLESHIP',
      uniqueTo: 'NETHERLANDS',
      replaces: 'FRIGATE',
      description: 'Dutch frigate that batters a defended shore.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'PrereqTech', { expect: 'TECH_SQUARE_RIGGING' }),
        requiresResource: xml('Units', 'UnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        districtAttackCS: xml('ModifierArguments', 'ModifierId=ZEVEN_PROVINCIEN_BONUS_VS_DEF_DISTRICTS&Name=Amount', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_DE_ZEVEN_PROVINCIEN', 'UpgradeUnit', { expect: 'UNIT_BATTLESHIP' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_DUTCH_ZEVEN_PROVINCIEN', 'CivilizationType', { expect: 'CIVILIZATION_NETHERLANDS' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_DE_ZEVEN_PROVINCIEN', 'ReplacesUnitType', { expect: 'UNIT_FRIGATE' }),
      },
    }),
    U({
      id: 'BARBARY_CORSAIR',
      name: 'Barbary Corsair',
      cost: 240,
      maintenance: 3,
      moves: 4,
      combat: 40,
      ranged: { strength: 50, range: 2 },
      naval: true,
      raider: true,
      stealth: true,
      revealStealth: true,
      requiresCivic: 'MEDIEVAL_FAIRES',
      // CIV6 (ABILITY_CORSAIR): "It costs no Movement to coastal raid."
      raidFreeMoves: true,
      upgradesTo: 'SUBMARINE',
      uniqueTo: 'OTTOMAN',
      replaces: 'PRIVATEER',
      description: 'Ottoman raider that raids for free.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'Range'),
        naval: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'Domain', { expect: 'DOMAIN_SEA' }),
        raider: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
        stealth: xml('TypeTags', 'Type=UNIT_OTTOMAN_BARBARY_CORSAIR&Tag=CLASS_STEALTH', 'Tag', { expect: 'CLASS_STEALTH' }),
        revealStealth: xml('TypeTags', 'Type=UNIT_OTTOMAN_BARBARY_CORSAIR&Tag=CLASS_REVEAL_STEALTH', 'Tag', { expect: 'CLASS_REVEAL_STEALTH' }),
        requiresCivic: xml('Units', 'UnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'PrereqCivic', { expect: 'CIVIC_MEDIEVAL_FAIRES' }),
        raidFreeMoves: xml('ModifierArguments', 'ModifierId=CORSAIR_LESS_MOVEMENT_RAID&Name=UseAdvancedCoastalRaid', 'Value'),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_OTTOMAN_BARBARY_CORSAIR', 'UpgradeUnit', { expect: 'UNIT_SUBMARINE' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_OTTOMAN_BARBARY_CORSAIR', 'CivilizationType', { expect: 'CIVILIZATION_OTTOMAN' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_OTTOMAN_BARBARY_CORSAIR', 'ReplacesUnitType', { expect: 'UNIT_PRIVATEER' }),
      },
    }),
    U({
      id: 'BIREME',
      name: 'Bireme',
      cost: 65,
      maintenance: 1,
      moves: 4,
      combat: 35,
      naval: true,
      requiresTech: 'SAILING',
      // CIV6 (ABILITY_BIREME_PROTECT_TRADER): "Protects nearby Trade units
      // from being Plundered on Water Tiles."
      guardsTraders: 'water',
      upgradesTo: 'CARAVEL',
      uniqueTo: 'PHOENICIA',
      replaces: 'GALLEY',
      description: 'Phoenician galley that escorts its own shipping.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'Combat'),
        naval: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'Domain', { expect: 'DOMAIN_SEA' }),
        requiresTech: xml('Units', 'UnitType=UNIT_PHOENICIA_BIREME', 'PrereqTech', { expect: 'TECH_SAILING' }),
        guardsTraders: xml('ModifierArguments', 'ModifierId=BIREME_GRANT_TRADER_IMMUNITY&Name=AbilityType', 'Value', { expect: 'ABILITY_TRADER_PROTECTED_BY_BIREME' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_PHOENICIA_BIREME', 'UpgradeUnit', { expect: 'UNIT_CARAVEL' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_PHOENICIA_BIREME', 'CivilizationType', { expect: 'CIVILIZATION_PHOENICIA' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_PHOENICIA_BIREME', 'ReplacesUnitType', { expect: 'UNIT_GALLEY' }),
      },
    }),
    U({
      id: 'JANISSARY',
      name: 'Janissary',
      cost: 120,
      maintenance: 4,
      moves: 2,
      combat: 60,
      melee: true,
      requiresTech: 'GUNPOWDER',
      requiresResource: 'NITER',
      // CIV6 (ABILITY_CORBACI): "Starts with a free promotion."
      freePromotions: 1,
      upgradesTo: 'LINE_INFANTRY',
      uniqueTo: 'OTTOMAN',
      replaces: 'MUSKETMAN',
      description: 'Ottoman musketman, cheap, strong and born promoted.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'Combat'),
        melee: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'PrereqTech', { expect: 'TECH_GUNPOWDER' }),
        requiresResource: xml('Units', 'UnitType=UNIT_SULEIMAN_JANISSARY', 'StrategicResource', { expect: 'RESOURCE_NITER' }),
        freePromotions: xml('ModifierArguments', 'ModifierId=CORBACI_FREE_PROMOTION&Name=Amount', 'Value', { expect: -1, note: 'the install spells one free promotion as GRANT_EXPERIENCE Amount -1' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SULEIMAN_JANISSARY', 'UpgradeUnit', { expect: 'UNIT_LINE_INFANTRY' }),
        uniqueTo: xml('CivilizationLeaders', 'LeaderType=LEADER_SULEIMAN', 'CivilizationType', { expect: 'CIVILIZATION_OTTOMAN', note: 'a LEADER unique (TRAIT_LEADER_UNIT_SULEIMAN_JANISSARY); the civilization is the leader’s' }),
        replaces: xml('UnitReplaces', 'CivUniqueUnitType=UNIT_SULEIMAN_JANISSARY', 'ReplacesUnitType', { expect: 'UNIT_MUSKETMAN' }),
      },
    }),
    U({
      id: 'SAKA_HORSE_ARCHER',
      name: 'Saka Horse Archer',
      cost: 100,
      maintenance: 2,
      moves: 4,
      combat: 20,
      ranged: { strength: 25, range: 1 },
      cavalry: true, // CLASS_RANGED_CAVALRY — no light/heavy tag
      requiresTech: 'HORSEBACK_RIDING',
      // the install gives it no ability row: it is a ranged cavalry chassis a
      // whole era before anybody else's.
      upgradesTo: 'CROSSBOWMAN',
      uniqueTo: 'SCYTHIA',
      description: 'Scythian ranged cavalry, available at Horseback Riding.',
      src: {
        cost: xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'Cost', { scale: GAME_SPEED }),
        maintenance: xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'Maintenance'),
        moves: xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'BaseMoves'),
        combat: xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'Combat'),
        'ranged.strength': xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'RangedCombat'),
        'ranged.range': xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'Range'),
        cavalry: xml('TypeTags', 'Type=UNIT_SCYTHIAN_HORSE_ARCHER&Tag=CLASS_RANGED_CAVALRY', 'Tag', { expect: 'CLASS_RANGED_CAVALRY' }),
        requiresTech: xml('Units', 'UnitType=UNIT_SCYTHIAN_HORSE_ARCHER', 'PrereqTech', { expect: 'TECH_HORSEBACK_RIDING' }),
        upgradesTo: xml('UnitUpgrades', 'Unit=UNIT_SCYTHIAN_HORSE_ARCHER', 'UpgradeUnit', { expect: 'UNIT_CROSSBOWMAN' }),
        uniqueTo: xml('CivilizationTraits', 'TraitType=TRAIT_CIVILIZATION_UNIT_SCYTHIAN_HORSE_ARCHER', 'CivilizationType', { expect: 'CIVILIZATION_SCYTHIA' }),
      },
    }),
  ].map((u) => [u.id, u]),
);

/** The CIV 6 unit CLASSES the policy cards address, in the bit order the
 *  exported `cls` mask packs them in. `ranged` is the CLASS — a Quadrireme is
 *  naval and a Catapult is siege, and neither is reached by a card that says
 *  "ranged units", however loudly their ranged strength reads. */
export const UNIT_CLASSES = ['melee', 'ranged', 'antiCavalry', 'cavalry', 'naval', 'recon', 'settler', 'builder'] as const;
export type UnitClass = (typeof UNIT_CLASSES)[number];

/** CIV6 (EFFECT_ADJUST_UNIT_CLEAR_TERRAIN_START_MOVEMENT): the open terrains
 *  a chariot's start-of-turn Movement reads. */
export const OPEN_TERRAINS: readonly string[] = ['DESERT', 'PLAINS', 'GRASSLAND', 'TUNDRA'];

/** may this civilization train the chassis? A unique unit trains for its
 *  civilization alone, and the chassis it replaces is gone there. */
export function civUnitAllowed(civ: string | null, id: string, leader: string | null = null): boolean {
  const d = UNITS[id];
  if (!d) return false;
  if (d.uniqueTo) return d.uniqueTo === civ && (!d.uniqueLeader || d.uniqueLeader === leader);
  return !civReplacement(civ, id, leader);
}

/** the civilization's unique standing in for a base chassis, if any */
export function civReplacement(civ: string | null, id: string, leader: string | null = null): string | undefined {
  if (!civ) return undefined;
  for (const u of Object.values(UNITS)) {
    if (u.uniqueTo === civ && u.replaces === id && (!u.uniqueLeader || u.uniqueLeader === leader)) return u.id;
  }
  return undefined;
}

/** what the chassis upgrades INTO for this civilization: the catalog's
 *  successor, or the civilization's unique standing in for it. */
export function civUpgradeTarget(civ: string | null, id: string, leader: string | null = null): string | undefined {
  const next = UNITS[id]?.upgradesTo;
  if (!next) return undefined;
  return civReplacement(civ, next, leader) ?? next;
}

/** CIV6 (PROMOTION_CLASS_LIGHT_CAVALRY): the ONE reader of `cavalryTag` for
 *  the light half — a chassis with no tag is never light. */
export function isLightCavalry(def: UnitDef): boolean {
  return def.cavalryTag === 'light';
}

export function unitHasClass(def: UnitDef, cls: UnitClass): boolean {
  switch (cls) {
    case 'melee': return !!def.melee;
    case 'ranged': return !!def.ranged && !def.naval && !def.recon && def.bombard === undefined;
    case 'antiCavalry': return !!def.antiCavalry;
    case 'cavalry': return !!def.cavalry;
    case 'naval': return !!def.naval;
    case 'recon': return !!def.recon;
    case 'settler': return !!def.settler;
    case 'builder': return !!def.builder;
  }
}

/** the catalog POSITION of each chassis — the index every per-type plane is
 *  keyed by on both engines, since the exporter writes the unit rows in this
 *  same order. */
export const UNIT_INDEX: Record<string, number> = Object.fromEntries(
  Object.keys(UNITS).map((id, i) => [id, i]),
);

/** the ERA a unit first becomes available — the era index of the tech or civic
 *  that unlocks it (0 = trainable from the start). The production cards'
 *  "Ancient and Classical era ... units" clause reads this. */
export const UNIT_ERA_INDEX: Record<string, number> = Object.fromEntries(
  Object.values(UNITS).map((u) => {
    const t = u.requiresTech ? TECHS[u.requiresTech] : undefined;
    const c = u.requiresCivic ? CIVICS[u.requiresCivic] : undefined;
    const era = t ? ERAS.indexOf(t.era) : c ? ERAS.indexOf(c.era) : 0;
    return [u.id, Math.max(0, era)];
  }),
);

export const UNIT_HP = 100;
export const CITY_MAX_HP = 200;
/** flat per-turn city heal when unbesieged, war or not (real
 * Civ 6) — the rate `seatPhase` applies to every seat's cities and
 * encampments and `freeCitiesPhase` to the Free Cities; the GPU reads it as
 * the exported `cityHealPerTurn` rules field. */
export const CITY_HEAL_PER_TURN = 20;
/**
 * The ENCAMPMENT garrison pool. Real Civ 6: the Encampment fights
 * INDEPENDENTLY of its city — it strikes on its own and must be beaten down
 * before enemy units may enter its tile, and its garrison carries 100 HP
 * (its wall defenses match the city center's, which this model folds into the
 * city's own outer pool rather than duplicating). At 0 the tile becomes
 * enterable and the district goes silent, exactly as an occupied Encampment
 * does in the real game. The GPU reads it as the exported `encampHp` rules
 * field.
 */
export const ENCAMPMENT_HP = 100;
/**
 * The outer-defense perimeter by WALLS TIER, 0 = no defenses. CIV6: "Ancient
 * Walls have 50 HP, and each upgrade adds +50 HP, for a maximum of 150 for
 * these so-called old-world defenses. In Gathering Storm the values are
 * respectively +100 and +300", and Urban Defenses carry 400. The GPU reads the
 * table as the exported `wallsTierHp` rules field.
 */
export const WALLS_TIER_HP = [0, 100, 200, 300, 400];
/**
 * CIV6: each pre-modern tier is "+3 Combat Strength" and they stack (total +9
 * at Renaissance Walls); "Unlike other types of Walls, Urban Defenses doesn't
 * increase the Combat Strength of defensible districts."
 */
export const WALLS_TIER_CS = [0, 3, 6, 9, 9];
/** CIV6: Urban Defenses "is unlocked with Steel" and needs no production —
 * unlocking it "builds modern fortifications around the City Centers of all
 * current and future cities and their Encampment districts". */
export const URBAN_DEFENSES_TECH = 'STEEL';
export const WALLS_TIER_URBAN = 4;
/** CIV6 (Repair Outer Defenses): a city may run the project only if it "and/or
 * its Encampment district have damaged Walls and have not been attacked in the
 * last three turns". */
export const REPAIR_QUIET_TURNS = 3;
/** the ANCIENT tier's pool, which is what a fresh set of Walls is worth. */
export const WALLS_HP = WALLS_TIER_HP[1];
/**
 * CIV6: the perimeter "is much tougher, practically impervious to most
 * conventional attacks" — "-85% for melee attacks... and -50% for ranged ones",
 * and "only units with attacks that use Bombard Strength" hit it at full.
 */
export const WALL_DAMAGE_MELEE = 0.15;
export const WALL_DAMAGE_RANGED = 0.5;
/**
 * CIV6: how much of a hit reaches the centre depends on how breached the
 * perimeter is. Intact, "no attack can harm the city itself (it will do 1
 * damage only)"; around 80% the city "will then suffer not more than 5-10
 * damage per attack"; above 50% attacks "get through... but their force is
 * still reduced"; below 20-30% "the city starts taking real hits (that is,
 * full damage)". A share of `(1 - frac) / (1 - WALL_BREACH_FRACTION)` clamped
 * to [0, 1] hits every one of those four readings.
 */
export const WALL_BREACH_FRACTION = 0.25;
/** CIV6: "Ranged attacks receive a -17 penalty when attacking city and
 * district defenses". Naval ranged pay it against the perimeter only — they
 * "do not suffer the -17 RS penalty against cities (but still suffer against
 * Walls, just like other ranged units)". */
export const RANGED_CITY_PENALTY = 17;

/**
 * THE ROCK BAND's concert, sourced whole from the Rock Band page.
 *
 * CIV6: "Tourism = Venue Tourism Value * (1 + (Tourism Bomb Value / 100) +
 * (Album Sales / 100))", the venue value depending on where it plays and the
 * bomb on the tier it rolls.
 */
export const ROCK_BAND_VENUES: Readonly<Record<string, number>> = {
  BROADCAST_CENTER: 750, STADIUM: 750,
  UNIVERSITY: 500, SHIPYARD: 500,
  AMPHITHEATER: 250, ARENA: 250,
};
/** a World Wonder is the top venue at 1000. */
export const ROCK_BAND_WONDER_VENUE = 1000;
/**
 * The six performance tiers, BEST first (6 stars down to 1). CIV6's own
 * table: album sales 200/150/100/50/0/0, tourism bomb 200/0/150/-25/100/-25,
 * a promotion on the two best, and the unit dies on the two worst.
 */
export const ROCK_BAND_TIERS: readonly { album: number; bomb: number; promote: boolean; dies: boolean }[] = [
  { album: 200, bomb: 200, promote: true, dies: false },
  { album: 150, bomb: 0, promote: true, dies: false },
  { album: 100, bomb: 150, promote: false, dies: false },
  { album: 50, bomb: -25, promote: false, dies: false },
  { album: 0, bomb: 100, promote: false, dies: true },
  { album: 0, bomb: -25, promote: false, dies: true },
];
/**
 * Tier odds per BAND LEVEL (1..4), in PER MILLE, best tier first — the
 * published percentages x10. Level 2's published row sums to 99.9%, so its
 * modal rung carries the rounding.
 */
export const ROCK_BAND_TIER_ODDS: readonly (readonly number[])[] = [
  [20, 82, 184, 265, 265, 184],
  [49, 121, 223, 263, 223, 121],
  [94, 170, 245, 245, 170, 76],
  [163, 214, 251, 214, 116, 42],
];
export const ROCK_BAND_MAX_LEVEL = 4;

/**
 * THE GIANT DEATH ROBOT'S FUTURE-ERA UPGRADES. CIV6: the chassis "gains
 * additional abilities and upgrades via Future Era technology research" — so
 * an upgrade is the SEAT's tech, empire-wide, and no per-unit state stands
 * behind it. Catalog order is the wire order.
 */
interface GdrUpgradeDef {
  id: string;
  name: string;
  tech: string;
}
export const GDR_UPGRADES: readonly GdrUpgradeDef[] = [
  // CIV6: "Drone Air Defense: Anti-Air Defense Strength increased to 130."
  { id: 'DRONE_AIR_DEFENSE', name: 'Drone Air Defense', tech: 'ADVANCED_AI' },
  // CIV6: "Particle Beam Siege Cannon: Ranged attacks against Cities and
  // Encampments are 100% effective and gain +30 Ranged Strength. (Applies to
  // both melee and ranged attacks and when defending.)"
  { id: 'PARTICLE_BEAM', name: 'Particle Beam Siege Cannon', tech: 'ADVANCED_POWER_CELLS' },
  // CIV6: "Enhanced Mobility: +3 Moves. Can perform a Jump action to cross
  // over mountain terrain." The jump is not a head of its own here: a
  // mountain step simply becomes legal to this chassis, which is what the
  // action does over one hex.
  { id: 'ENHANCED_MOBILITY', name: 'Enhanced Mobility', tech: 'CYBERNETICS' },
  // CIV6: "Reinforced Armor Plating: +10 Combat Strength when defending
  // against land and naval units."
  { id: 'REINFORCED_ARMOR', name: 'Reinforced Armor Plating', tech: 'SMART_MATERIALS' },
];
export const GDR_DRONE_AA = 130;
export const GDR_PARTICLE_BEAM_CS = 30;
export const GDR_ENHANCED_MOVES = 3;
export const GDR_ARMOR_PLATING_CS = 10;
/** CIV6: the chassis's own "-17 Ranged Strength against ... naval units". The
 *  district half of the same clause is `RANGED_CITY_PENALTY`, which every land
 *  ranged unit already pays. */
export const GDR_NAVAL_PENALTY = 17;

/** the catalog's order — how both engines name a chassis on the wire and in
 *  the decomposition log. It lives HERE rather than in a core module because
 *  two of that log's emitters sit on opposite sides of an import edge. */
export const UNIT_TYPE_IDX = Object.keys(UNITS);
