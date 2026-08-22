/**
 * Unit types. SOURCED: every row's cost, maintenance, movement, combat,
 * ranged stats and charges fetched one by one from the GS Civilopedia
 * (GENERAL/ADMIRAL excepted — support chassis this model prices at 0 by
 * design; great people arrive by points, never production).
 */

import { GAME_SPEED } from './constants';
import { TECHS, ERAS } from './techs';
import { CIVICS } from './civics';

export interface UnitDef {
  id: string;
  name: string;
  code: string;
  cost: number;
  maintenance: number;
  moves: number;
  combat: number;
  ranged?: { strength: number; range: number };
  charges?: number;
  requiresTech?: string;
  requiresCivic?: string;
  requiresResource?: string;
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
  description: string;
}

const U = (def: UnitDef): UnitDef => ({ ...def, cost: Math.round(def.cost * GAME_SPEED) });

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  [
    U({
      id: 'BUILDER',
      name: 'Builder',
      code: 'B',
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
      code: 'S',
      cost: 30,
      maintenance: 0,
      moves: 3,
      combat: 10,
      recon: true,
      description: 'Fast, fragile explorer.',
    }),
    U({
      id: 'WARRIOR',
      name: 'Warrior',
      code: 'W',
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
      code: 'G',
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
      code: 'A',
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
      code: 'P',
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
      code: 'H',
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
      code: 'D',
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
      code: 'K',
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
      code: 'C',
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
      code: 'N',
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
      code: 'M',
      cost: 240,
      maintenance: 4,
      moves: 2,
      combat: 55,
      melee: true,
      requiresTech: 'GUNPOWDER',
      description: 'Renaissance gunpowder infantry.',
    }),
    U({
      id: 'GALLEY',
      name: 'Galley',
      code: 'Y',
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
      code: 'Q',
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
      code: 'I',
      cost: 150, // ×GAME_SPEED → 90 faith (faith-only; never a production cost)
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
      code: 'L',
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
      code: 'V',
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
      code: 'A',
      cost: 400, // ×GAME_SPEED → 240 faith (faith-only; never a production cost)
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
      code: 'ME',
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
      code: 'Ar',
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
      code: 'T',
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
      code: 'Td',
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
    // ("It can only be purchased with Faith in any city"), 600 faith at GS
    // prices and progressive, consumed when it designates a National Park.
    // APPENDED LAST (roster order is the GPU's unit index).
    U({
      id: 'NATURALIST',
      name: 'Naturalist',
      code: 'Nt',
      cost: 600,
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
      code: 'Cp',
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
      code: 'Bd',
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
      code: 'Rm',
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
      code: 'St',
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
      code: 'Q',
      cost: 100, // ×GAME_SPEED faith (faith-only; never a production cost)
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      religiousStrength: 70,
      description: 'Removes other religions from a city and fights theological combat (faith purchase only).',
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
    case 'ranged': return !!def.ranged && !def.naval && def.bombard === undefined;
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
