/**
 * Unit types (stage 11a ships the civilian economy; the military roster,
 * combat stats and barbarians arrive with stage 11b). Costs eyeballed
 * base Civ 6.
 */

import { GAME_SPEED } from './constants';

export interface UnitDef {
  id: string;
  name: string;
  /** Letter drawn on the map badge. */
  code: string;
  cost: number;
  /** Gold upkeep per turn (empire-level). */
  maintenance: number;
  moves: number;
  /** Melee combat strength (0 = civilian). */
  combat: number;
  /** Ranged attack strength + range (attacks without retaliation). */
  ranged?: { strength: number; range: number };
  /** Builder charges (improvements/chops); undefined for non-builders. */
  charges?: number;
  requiresTech?: string;
  /** AUDIT B-9: strategic-resource ACCESS gate — a resource id (data/resources)
   * this unit needs to BUILD or PURCHASE. Access = an owned territory tile with
   * the resource AND its completed, unpillaged matching improvement
   * (civHasStrategic). No stockpile / per-unit count / maintenance draw. */
  requiresResource?: string;
  /** #45/B-6: a NAVAL unit lives on water natively (never `embarked`). No naval
   * units exist yet (N2 adds GALLEY/QUADRIREME) — the field is plumbed now so
   * passability/spawn/combat can branch on it. Default false. */
  naval?: boolean;
  /** B6-S2: faith-purchase-only (MISSIONARY) — never offered by trainableUnits,
   * so it can't be queued or gold-purchased by either seat. */
  faithOnly?: boolean;
  /** B7-G (B-8): spawn-ONLY chassis (GENERAL/ADMIRAL) — never trainable,
   * gold-purchasable, or faith-buyable; the only birth path is the
   * Great-General/Admiral claim (applyGreatPersonEffect + the rival mirror).
   * trainableUnits filters it out on every seat, exactly like faithOnly. */
  spawnOnly?: boolean;
  description: string;
}

const U = (def: UnitDef): UnitDef => ({ ...def, cost: Math.round(def.cost * GAME_SPEED) });

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  [
    U({
      id: 'BUILDER',
      name: 'Builder',
      code: 'B',
      cost: 50, // P4/D-10: real Civ 6 base (the +4-per-builder escalation stays unmodeled - AUDIT)
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
      combat: 36, // P4/D-9: real Civ 6 Horseman
      requiresTech: 'HORSEBACK_RIDING',
      requiresResource: 'HORSES', // AUDIT B-9: retroactive — its own description flagged this gap
      description: 'Fast shock cavalry (needs Horses access).',
    }),
    // AUDIT B-10: the medieval/renaissance melee & ranged roster. Costs are
    // pre-GAME_SPEED like the rest of UNITS; tech ids verified in data/techs.ts.
    // SWORDSMAN/KNIGHT gate on IRON access (B-9). No naval hulls / upgrades this
    // round (recorded residuals); MUSKETMAN's niter is unmodeled on maps.
    U({
      id: 'SWORDSMAN',
      name: 'Swordsman',
      code: 'D',
      cost: 90,
      maintenance: 2,
      moves: 2,
      combat: 36,
      requiresTech: 'IRON_WORKING',
      requiresResource: 'IRON',
      description: 'Classical heavy melee (needs Iron access).',
    }),
    U({
      id: 'PIKEMAN',
      name: 'Pikeman',
      code: 'K',
      cost: 100,
      maintenance: 2,
      moves: 2,
      combat: 41,
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
      combat: 15,
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
      combat: 48,
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
    // B6-S2: the missionary chassis (appended LAST — roster indices are the
    // GPU's unit type ids). Civilian, faith-purchase-only at its speed-scaled
    // cost (the worship-cost pattern); 3 spread charges (vanilla), +1 with
    // SCRIPTURE, 30% cheaper with HOLY_ORDER (rival buy path applies both).
    U({
      id: 'MISSIONARY',
      name: 'Missionary',
      code: 'I',
      cost: 100, // ×GAME_SPEED → 60 faith (faith-only; never a production cost)
      maintenance: 0,
      moves: 4,
      combat: 0,
      charges: 3,
      faithOnly: true,
      description: 'Spreads its religion to nearby cities (3 charges, faith purchase only).',
    }),
    // B7-G (B-8): the Great General / Great Admiral support chassis (appended
    // LAST — roster indices are the GPU's unit type ids; MISSIONARY stays put).
    // CIVILIAN (charges=1 → unitDomain 'civilian' AND GPU _p_charges>0 civilian,
    // so both engines exclude it from the military march/patrol loops, from
    // garrison/flank/support counts, and — via the BUILDER/MISSIONARY type
    // gates — from the charge-driven walkers). Combat 0 → B-31 capturable.
    // spawnOnly → never trained/purchased/faith-bought. 4 MP so the rival
    // general keeps pace with the war march. No maintenance. The aura
    // (+5 CS within 2, combat.ts) is pure geometry; the retire ability is the
    // roster's instant effect (kept). The +1 MP half of the real aura is
    // DESCOPED (movement coupling — recorded on B-8).
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
  ].map((u) => [u.id, u]),
);

export const UNIT_HP = 100;
export const CITY_MAX_HP = 200;
/** AUDIT A-20: flat per-turn city heal when unbesieged, war or not (real
 * Civ 6) — the rate `barbarianPhase` applies to player cities (combat.ts)
 * and `rivalPhase` to rival cities; the GPU reads it as the exported
 * `cityHealPerTurn` rules field. */
export const CITY_HEAL_PER_TURN = 20;
/** AUDIT B-1: the ANCIENT_WALLS outer-defense pool — full HP a walled city
 * gets on top of its normal HP. Damage depletes it first (combat.ts); it
 * heals with the city (CITY_HEAL_PER_TURN, unbesieged). The GPU reads it as
 * the exported `wallsHp` rules field. */
export const WALLS_HP = 100;
