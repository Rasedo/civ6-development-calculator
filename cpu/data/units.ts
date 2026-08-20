/**
 * Unit types. SOURCED: every row's cost, maintenance, movement, combat,
 * ranged stats and charges fetched one by one from the GS Civilopedia
 * (GENERAL/ADMIRAL excepted — support chassis this model prices at 0 by
 * design; great people arrive by points, never production).
 */

import { GAME_SPEED } from './constants';

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
  /** a NAVAL unit lives on water natively (never `embarked`). No naval
   * units exist yet (N2 adds GALLEY/QUADRIREME) — the field is plumbed now so
   * passability/spawn/combat can branch on it. Default false. */
  naval?: boolean;
  /** CIV 6 unit class: LIGHT cavalry (Horseman) and HEAVY cavalry (Knight).
   * The pair real suzerain/policy text addresses as "light and heavy
   * cavalry"; nothing else in this roster is mounted. */
  cavalry?: boolean;
  /** faith-purchase-only (MISSIONARY) — never offered by trainableUnits,
   * so it can't be queued or gold-purchased by either seat. */
  faithOnly?: boolean;
  /**
   * RELIGIOUS STRENGTH — the stat theological combat resolves on.
   * Only units that carry it can take part; only an APOSTLE may INITIATE
   * (real Civ 6: Apostles and Inquisitors attack, Missionaries only defend).
   * Magnitudes are stylized (the ORDER apostle > missionary is the sourced
   * part). Real Civ 6 also lets INQUISITORS attack and defend, and promotions
   * change these numbers; neither exists here, and both stay open.
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
    // higher religiousStrength and is the ONLY unit that may INITIATE
    // theological combat, because the roster holds no INQUISITOR — which real
    // Civ 6 does, and which stays open.
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
      description: 'Builds Forts (2 charges).',
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
  ].map((u) => [u.id, u]),
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
/** the ANCIENT_WALLS outer-defense pool — full HP a walled city
 * gets on top of its normal HP. Damage depletes it first (combat.ts); it
 * heals with the city (CITY_HEAL_PER_TURN, unbesieged). The GPU reads it as
 * the exported `wallsHp` rules field. */
export const WALLS_HP = 100;
