/**
 * Unit types. SOURCED: every row's cost, maintenance, movement, combat,
 * ranged stats and charges fetched one by one from the GS Civilopedia
 * (GENERAL/ADMIRAL excepted — support chassis this model prices at 0 by
 * design; great people arrive by points, never production).
 */

import { GAME_SPEED } from './constants';
import { TECHS, ERAS } from './techs';
import { CIVICS } from './civics';

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
export const FORMATION_CS: readonly number[] = [0, 10, 17];

/** the civic each tier waits on — index by the tier being FORMED. */
export const FORMATION_CIVIC: readonly string[] = ['', 'NATIONALISM', 'MOBILIZATION'];

export const FORMATION_MAX = 2;

/** CIV6 (Military Academy, Seaport): the building lets its city train a
 *  formation DIRECTLY — a Corps or Army from the Academy, a Fleet or Armada
 *  from the Seaport — once the formation's own civic is in. The order costs
 *  150% of the unit for the two-step and 225% for the three-step, and the
 *  enabling building takes 25% off that price. */
export const FORMATION_COST_MULT: readonly number[] = [1, 1.5, 2.25];
export const FORMATION_TRAIN_DISCOUNT = 0.75;
export const FORMATION_TRAIN_BUILDING = { land: 'MILITARY_ACADEMY', naval: 'SEAPORT' } as const;

export interface UnitDef {
  id: string;
  name: string;
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
  /** a building the TRAINING city must already hold (the Military Engineer's
   *  Armory). Per-CITY, so it is enforced in `trainableUnits`. */
  requiresBuilding?: string;
  /** a NAVAL unit lives on water natively (never `embarked`). No naval
   * units exist yet (N2 adds GALLEY/QUADRIREME) — the field is plumbed now so
   * passability/spawn/combat can branch on it. Default false. */
  naval?: boolean;
  /** CIV 6 unit class: LIGHT cavalry (Horseman) and HEAVY cavalry (Knight).
   * The pair real suzerain/policy text addresses as "light and heavy
   * cavalry"; nothing else in this roster is mounted. */
  cavalry?: boolean;
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
  /** the ESPIONAGE civilian. It never walks — it jumps between revealed
   *  cities and runs one mission at a time out of a district. */
  spy?: boolean;
  /** CIV6 (Spy): "Cannot be purchased with Gold." */
  noGold?: boolean;
  description: string;
}

const U = (def: UnitDef): UnitDef => ({ ...def, cost: Math.round(def.cost * GAME_SPEED) });

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
    }),
    U({
      id: 'HORSEMAN',
      name: 'Horseman',
      upgradesTo: 'COURSER',
      cost: 80,
      maintenance: 2,
      moves: 4,
      cavalry: true, // LIGHT cavalry
      combat: 36, // real Civ 6 Horseman
      requiresTech: 'HORSEBACK_RIDING',
      requiresResource: 'HORSES', // retroactive — its own description flagged this gap
      description: 'Fast shock cavalry (needs Horses access).',
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
    }),
    U({
      id: 'KNIGHT',
      name: 'Knight',
      upgradesTo: 'CUIRASSIER',
      cost: 220,
      maintenance: 4,
      moves: 4,
      cavalry: true, // HEAVY cavalry
      combat: 50,
      requiresTech: 'STIRRUPS',
      requiresResource: 'IRON',
      description: 'Heavy shock cavalry (needs Iron access).',
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
    }),
    // The missionary chassis (appended LAST — roster indices are the
    // GPU's unit type ids). Civilian, faith-purchase-only at its speed-scaled
    // cost (the worship-cost pattern); 3 spread charges (vanilla), +1 with
    // SCRIPTURE, 30% cheaper with HOLY_ORDER (seat buy path applies both).
    U({
      id: 'MISSIONARY',
      name: 'Missionary',
      cost: 75, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      religiousStrength: 100, // defends theological combat, never initiates
      description: 'Spreads its religion to nearby cities (3 charges, faith purchase only).',
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
      maintenance: 0,
      moves: 4,
      combat: 0, // civilian: never garrisons, flanks, supports or fights normal combat
      charges: 3,
      faithOnly: true,
      religiousStrength: 110,
      description: 'Spreads its religion and wins theological combat (3 charges, faith purchase only).',
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
    }),
    // The NATURALIST, sourced from the GS Civilopedia via the wiki — a MODERN
    // civilian behind the CONSERVATION civic, 4 moves, bought with FAITH ONLY
    // ("It can only be purchased with Faith in any city"), Cost 300 at GS
    // (600 faith) and progressive, consumed when it designates a National Park.
    // APPENDED LAST (roster order is the GPU's unit index).
    U({
      id: 'NATURALIST',
      name: 'Naturalist',
      cost: 300,
      maintenance: 0,
      moves: 4,
      combat: 0, // civilian
      charges: 0,
      naturalist: true,
      requiresCivic: 'CONSERVATION',
      description: 'Designates a National Park over four contiguous tiles (consumed).',
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
    }),
    // The support pair rides the CIVILIAN plane (`charges` present), which is
    // where this model already puts real Civ 6's other support chassis, the
    // Military Engineer: it stacks with the military unit it accompanies and
    // never fights. Neither carries a build job, so both sit at 0 charges.
    U({
      id: 'BATTERING_RAM',
      name: 'Battering Ram',
      upgradesTo: 'MEDIC',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'MASONRY',
      siegeSupport: 'RAM',
      siegeMaxWalls: 1,
      description: 'Adjacent melee and anti-cavalry attackers do full damage to Ancient Walls.',
    }),
    U({
      id: 'SIEGE_TOWER',
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
    }),
    // The INQUISITOR — appended LAST, because roster indices ARE the GPU's
    // unit type ids. CIV6: 100 Faith (progressive), a Temple, 70 Religious
    // Strength, 4 Movement, 3 charges of Remove Heresy, and it may only be
    // bought once an Apostle has Launched an Inquisition in this seat's own
    // territory. It is the ONE religious unit that "cannot enter another
    // civilization's territory without Open Borders".
    U({
      id: 'INQUISITOR',
      name: 'Inquisitor',
      cost: 75, // Units.xml Cost; faith-only, priced by `unitFaithCost`
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      religiousStrength: 70,
      description: 'Removes other religions from a city and fights theological combat (faith purchase only).',
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
      requiresTech: 'WHEEL',
      upgradesTo: 'KNIGHT',
      description: 'Ancient heavy cavalry.',
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
    }),
    U({
      id: 'COURSER',
      name: 'Courser',
      cost: 200,
      maintenance: 3,
      moves: 5,
      combat: 46,
      cavalry: true,
      requiresTech: 'CASTLES',
      requiresResource: 'HORSES',
      upgradesTo: 'CAVALRY',
      description: 'Medieval light cavalry (needs Horses).',
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
    }),
    U({
      id: 'PIKE_AND_SHOT',
      name: 'Pike and Shot',
      cost: 250,
      maintenance: 4,
      moves: 2,
      combat: 55,
      antiCavalry: true,
      requiresTech: 'METAL_CASTING',
      upgradesTo: 'AT_CREW',
      description: 'Renaissance anti-cavalry, and it asks for no strategic resource.',
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
    }),
    U({
      id: 'CAVALRY',
      name: 'Cavalry',
      cost: 330,
      maintenance: 5,
      moves: 5,
      combat: 62,
      cavalry: true,
      requiresTech: 'MILITARY_SCIENCE',
      requiresResource: 'HORSES',
      upgradesTo: 'HELICOPTER',
      description: 'Industrial light cavalry (needs Horses).',
    }),
    U({
      id: 'CUIRASSIER',
      name: 'Cuirassier',
      cost: 330,
      maintenance: 5,
      moves: 4,
      combat: 64,
      cavalry: true,
      requiresTech: 'BALLISTICS',
      requiresResource: 'IRON',
      upgradesTo: 'TANK',
      description: 'Industrial heavy cavalry (needs Iron).',
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
    }),
    U({
      id: 'MEDIC',
      name: 'Medic',
      cost: 370,
      maintenance: 5,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'SANITATION',
      upgradesTo: 'SUPPLY_CONVOY',
      description: 'Industrial support chassis.',
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
    }),
    U({
      id: 'TANK',
      name: 'Tank',
      cost: 480,
      maintenance: 6,
      moves: 4,
      combat: 85,
      cavalry: true,
      requiresTech: 'COMBUSTION',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      upgradesTo: 'MODERN_ARMOR',
      description: 'Modern heavy cavalry: 1 Oil to train and 1 per turn to run.',
    }),
    U({
      id: 'SUPPLY_CONVOY',
      name: 'Supply Convoy',
      cost: 450,
      maintenance: 2,
      moves: 4,
      combat: 0,
      charges: 0,
      requiresTech: 'COMBUSTION',
      description: 'Modern support chassis.',
    }),
    U({
      id: 'OBSERVATION_BALLOON',
      name: 'Observation Balloon',
      cost: 240,
      maintenance: 2,
      moves: 2,
      combat: 0,
      charges: 0,
      requiresTech: 'FLIGHT',
      upgradesTo: 'DRONE',
      description: 'Modern support chassis.',
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
    }),
    U({
      id: 'ANTI_AIR_GUN',
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
    }),
    U({
      id: 'DRONE',
      name: 'Drone',
      cost: 420,
      maintenance: 3,
      moves: 3,
      combat: 0,
      charges: 0,
      requiresTech: 'COMPUTERS',
      description: 'Atomic support chassis.',
    }),
    U({
      id: 'HELICOPTER',
      name: 'Helicopter',
      cost: 600,
      maintenance: 7,
      moves: 4,
      combat: 86,
      cavalry: true,
      requiresTech: 'SYNTHETIC_MATERIALS',
      requiresResource: 'ALUMINUM',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Atomic light cavalry: 1 Aluminum to train and 1 per turn to run.',
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
    }),
    U({
      id: 'MODERN_ARMOR',
      name: 'Modern Armor',
      cost: 680,
      maintenance: 8,
      moves: 4,
      combat: 95,
      cavalry: true,
      requiresTech: 'COMPOSITES',
      requiresResource: 'OIL',
      resourceCost: 1,
      resourceUpkeep: 1,
      description: 'Information heavy cavalry: 1 Oil to train and 1 per turn to run.',
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
    }),
    U({
      id: 'MOBILE_SAM',
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
    }),
    U({
      id: 'SPY',
      name: 'Spy',
      cost: 225,
      maintenance: 4,
      moves: 0,
      combat: 0,
      requiresCivic: 'DIPLOMATIC_SERVICE',
      spy: true,
      noGold: true,
      description: 'Runs secret missions in foreign cities and guards your own.',
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
    }),
    // APPENDED LAST — the roster's order IS the GPU's unit-type id space.
    // CIV6 (Rock Band): an Atomic-era CIVILIAN (charges = 1, combat 0) that
    // "must be purchased with Faith" at a progressive price and "must always
    // perform in foreign lands".
    U({
      id: 'ROCK_BAND',
      name: 'Rock Band',
      cost: 300,
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 1,
      faithOnly: true,
      requiresCivic: 'COLD_WAR',
      description: 'Performs a concert at a foreign venue for a tourism burst (faith purchase only).',
    }),
  ].map((u) => [u.id, u]),
);

/** The CIV 6 unit CLASSES the policy cards address, in the bit order the
 *  exported `cls` mask packs them in. `ranged` is the CLASS — a Quadrireme is
 *  naval and a Catapult is siege, and neither is reached by a card that says
 *  "ranged units", however loudly their ranged strength reads. */
export const UNIT_CLASSES = ['melee', 'ranged', 'antiCavalry', 'cavalry', 'naval', 'recon', 'settler', 'builder'] as const;
export type UnitClass = (typeof UNIT_CLASSES)[number];

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
 * Civ 6) — the rate `barbarianPhase` applies to seat-0 cities (combat.ts)
 * and `seatPhase` to foreign cities; the GPU reads it as the exported
 * `cityHealPerTurn` rules field. */
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
/** CIV6 (Expansion2_Units.xml, COST_PROGRESSION_PREVIOUS_COPIES): each copy
 *  already bought raises the next one's Cost by a flat 50 — the Rock Band's
 *  and the Naturalist's, both at Cost 300. The FAITH price is that Cost at
 *  `FAITH_PURCHASE_MULT`, so a seat pays 600, then 700, then 800 at Standard
 *  speed; the step rides `GAME_SPEED` exactly as the base does. */
export const ROCK_BAND_COST_STEP = Math.round(50 * GAME_SPEED);
export const NATURALIST_COST_STEP = Math.round(50 * GAME_SPEED);

/**
 * THE GIANT DEATH ROBOT'S FUTURE-ERA UPGRADES. CIV6: the chassis "gains
 * additional abilities and upgrades via Future Era technology research" — so
 * an upgrade is the SEAT's tech, empire-wide, and no per-unit state stands
 * behind it. Catalog order is the wire order.
 */
export interface GdrUpgradeDef {
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
