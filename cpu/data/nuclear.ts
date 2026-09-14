/**
 * NUCLEAR WEAPONS. Two devices, the ground they poison, and the hulls that
 * stop them. Every magnitude below is the Gathering Storm reading of
 * CIV6 (Nuclear weapons); the two BUILD projects and the two unlock projects
 * live with the rest of the project catalog.
 */

import { srcConst, xml, type SrcMap } from './provenance';

export interface NuclearDeviceDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
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

/** PROVENANCE (cpu/data/provenance.ts). Four columns are the install's `WMDs`
 *  row; the URANIUM charge is the BUILD PROJECT's `PrereqResource` amount,
 *  which the install writes nowhere as a number — the Civilopedia's 10/20. */
const wmdSrc = (id: string): SrcMap => {
  const where = `WeaponType=WMD_${id}`;
  return {
    radius: xml('WMDs', where, 'BlastRadius'),
    fallout: xml('WMDs', where, 'FalloutDuration'),
    range: xml('WMDs', where, 'ICBMStrikeRange'),
    upkeep: xml('WMDs', where, 'Maintenance'),
    uranium: {
      lab: 'the GS Civilopedia Nuclear weapons page (10 / 20 Uranium to produce); the install '
        + 'names the resource on the build project but never an amount',
    },
  };
};

const RAW_NUCLEAR_DEVICES: readonly NuclearDeviceDef[] = [
  { id: 'NUCLEAR_DEVICE', name: 'Nuclear Device', radius: 1, fallout: 10, range: 12, upkeep: 14, uranium: 10 },
  { id: 'THERMONUCLEAR_DEVICE', name: 'Thermonuclear Device', radius: 2, fallout: 20, range: 15, upkeep: 16, uranium: 20 },
];
export const NUCLEAR_DEVICES: readonly NuclearDeviceDef[] =
  RAW_NUCLEAR_DEVICES.map((d) => ({ ...d, src: wmdSrc(d.id) }));

/** CIV6: "Any units (except Giant Death Robots) that end their turn in a
 *  contaminated tile take 50 damage each turn." */
export const FALLOUT_DAMAGE = srcConst('nuclear.falloutDamage', 50, {
  lab: 'the GS Nuclear weapons page ("Any units (except Giant Death Robots) that end their turn '
    + 'in a contaminated tile take 50 damage each turn"); no install table carries it',
});

/** CIV6 (Giant Death Robot): "The Giant Death Robot is the only unit that can
 *  survive a nuclear strike. A Nuclear Device or Thermonuclear Device does 50
 *  damage to it, but it is immune to damage from fallout." */
export const NUKE_ROBOT_DAMAGE = srcConst('nuclear.robotDamage', 50, {
  lab: 'the GS Giant Death Robot page ("A Nuclear Device or Thermonuclear Device does 50 damage '
    + 'to it, but it is immune to damage from fallout")',
});

/** CIV6: "Destroyers, Battleships, Missile Cruisers, and Mobile SAMs can
 *  protect adjacent tiles from nuclear strikes." Read like the anti-air
 *  weapon's own cover — one hex out, and the tile it stands on. */
export const NUKE_COVER_RANGE = srcConst('nuclear.coverRange', 1, {
  lab: 'the GS Nuclear weapons page ("Destroyers, Battleships, Missile Cruisers, and Mobile SAMs '
    + 'can protect adjacent tiles"), read like the Anti-Air Gun\'s own Range 1 cover',
});
export const NUKE_INTERCEPTORS: readonly string[] = srcConst('nuclear.NUKE_INTERCEPTORS',
  ['DESTROYER', 'BATTLESHIP', 'MISSILE_CRUISER', 'MOBILE_SAM'], {
    lab: 'the GS Nuclear weapons page names exactly these four as the hulls that cover adjacent '
      + 'tiles; the install carries the cover as a DLL rule',
  });

/** CIV6: a finished device "can then be used by any unit or improvement
 *  capable of deploying it on the map. This includes bomber aircraft, Nuclear
 *  Submarines, and the Missile Silo." These are the UNIT half; the silo is an
 *  improvement, and launches for the seat rather than for anyone standing
 *  on it. */
export const NUKE_CARRIERS: readonly string[] = srcConst('nuclear.NUKE_CARRIERS',
  ['BOMBER', 'JET_BOMBER', 'NUCLEAR_SUBMARINE'], {
    lab: 'the GS Nuclear weapons page ("bomber aircraft, Nuclear Submarines, and the Missile '
      + 'Silo") — the UNIT half of that list; the silo is an improvement',
  });

/** CIV6: cleaning fallout "takes 1 build charge". */
export const FALLOUT_CLEAN_CHARGES = srcConst('nuclear.cleanCharges', 1, {
  lab: 'the GS Nuclear weapons page (cleaning fallout "takes 1 build charge")',
});
