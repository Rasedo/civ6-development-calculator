/**
 * NUCLEAR WEAPONS. Two devices, the ground they poison, and the hulls that
 * stop them. Every magnitude below is the Gathering Storm reading of
 * CIV6 (Nuclear weapons); the two BUILD projects and the two unlock projects
 * live with the rest of the project catalog.
 */

export interface NuclearDeviceDef {
  id: string;
  name: string;
  /** CIV6: "a blast radius of 1 (i.e., the target tile and all adjacent
   *  tiles)" — hexes out from the target the destruction reaches. */
  radius: number;
  /** CIV6: turns of fallout every tile in the blast is left with. */
  fallout: number;
  /** CIV6: "When deployed from a Missile Silo or a Nuclear Submarine, they
   *  have a Range of 12" / "of 15". A BOMBER instead carries the device and
   *  drops it, so its own operational range is the reach. */
  range: number;
  /** CIV6: "They cost 14 Gold per turn to maintain" / "16 Gold per turn". */
  upkeep: number;
  /** CIV6 (Gathering Storm): "10 Uranium to produce" / "20 Uranium". */
  uranium: number;
}

/** Catalog order is the WIRE order: a device is addressed by this index on
 *  both engines, and the two nuclear heads are one per row. */
export const NUCLEAR_DEVICES: readonly NuclearDeviceDef[] = [
  { id: 'NUCLEAR_DEVICE', name: 'Nuclear Device', radius: 1, fallout: 10, range: 12, upkeep: 14, uranium: 10 },
  { id: 'THERMONUCLEAR_DEVICE', name: 'Thermonuclear Device', radius: 2, fallout: 20, range: 15, upkeep: 16, uranium: 20 },
];

/** CIV6: "Any units (except Giant Death Robots) that end their turn in a
 *  contaminated tile take 50 damage each turn." */
export const FALLOUT_DAMAGE = 50;

/** CIV6 (Giant Death Robot): "The Giant Death Robot is the only unit that can
 *  survive a nuclear strike. A Nuclear Device or Thermonuclear Device does 50
 *  damage to it, but it is immune to damage from fallout." */
export const NUKE_ROBOT_DAMAGE = 50;

/** CIV6: "Destroyers, Battleships, Missile Cruisers, and Mobile SAMs can
 *  protect adjacent tiles from nuclear strikes." Read like the anti-air
 *  weapon's own cover — one hex out, and the tile it stands on. */
export const NUKE_COVER_RANGE = 1;
export const NUKE_INTERCEPTORS: readonly string[] = [
  'DESTROYER', 'BATTLESHIP', 'MISSILE_CRUISER', 'MOBILE_SAM',
];

/** CIV6: a finished device "can then be used by any unit or improvement
 *  capable of deploying it on the map. This includes bomber aircraft, Nuclear
 *  Submarines, and the Missile Silo." These are the UNIT half; the silo is an
 *  improvement, and launches for the seat rather than for anyone standing
 *  on it. */
export const NUKE_CARRIERS: readonly string[] = [
  'BOMBER', 'JET_BOMBER', 'NUCLEAR_SUBMARINE',
];

/** CIV6: cleaning fallout "takes 1 build charge". */
export const FALLOUT_CLEAN_CHARGES = 1;
