/**
 * NUCLEAR WEAPONS. Two devices, the ground they poison, and the hulls that
 * stop them. Every magnitude below is the Gathering Storm reading of
 * CIV6 (Nuclear weapons); the two BUILD projects and the two unlock projects
 * live with the rest of the project catalog.
 */

import { srcConst, xml, type SrcMap } from './provenance';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

interface NuclearDeviceDef {
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
      pedia: 'the GS Civilopedia Nuclear weapons page (10 / 20 Uranium to produce); the install '
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
  pedia: 'the GS Nuclear weapons page ("Any units (except Giant Death Robots) that end their turn '
    + 'in a contaminated tile take 50 damage each turn"); no install table carries it',
});

/** CIV6 (Giant Death Robot): "The Giant Death Robot is the only unit that can
 *  survive a nuclear strike. A Nuclear Device or Thermonuclear Device does 50
 *  damage to it, but it is immune to damage from fallout." */
export const NUKE_ROBOT_DAMAGE = srcConst('nuclear.robotDamage', 50, {
  pedia: 'the GS Giant Death Robot page ("A Nuclear Device or Thermonuclear Device does 50 damage '
    + 'to it, but it is immune to damage from fallout")',
});

/** INTERCEPTION, measured live (lab 3 parts three, six and eight —
 *  tools/civ6lab/INTERCEPT_SUITE.md, 60 of 60 pre-registered rounds; the
 *  reports under tools/civ6lab/reports/). EVERY unit with AntiAirCombat > 0
 *  covers the six tiles adjacent to it and nothing beyond, land or naval
 *  (`ABILITY_ANTI_AIR_COVER` carries no radius of its own — the pedia's
 *  four-hull list was the UI's summary, not the rule). One anti-air attack is
 *  made on the warhead, one rng draw: the STRONGEST interceptor fires at
 *  AntiAirCombat − NUKE_AA_WOUND·(1 − hp/100) and every other adjacent one
 *  adds NUKE_AA_SUPPORT·hp/100; damage = the ordinary combat roll against the
 *  warhead's defence, and the strike is cancelled iff damage > NUKE_INTERCEPT_DAMAGE. */
export const NUKE_COVER_RANGE = srcConst('nuclear.coverRange', 1, {
  lab: 'C-34: one interceptor at exactly distance 1, 2 and 3 from the aim plot for all seven '
    + 'anti-air chassis — d = 1 covers, d = 2 and 3 never (lab 3 part eight, the coverage table)',
});
/** CIV6 (COMBAT_ANTI_AIR_SUPPORT_BONUS_MODIFIER): each further adjacent
 *  interceptor supports the firer by this much, scaled by its own health
 *  (a half-dead supporter reads +2 in the preview). */
export const NUKE_AA_SUPPORT = srcConst('nuclear.aaSupport', 5, gp('COMBAT_ANTI_AIR_SUPPORT_BONUS_MODIFIER'));
/** the anti-air attacker's health term, CONTINUOUS on the backend: 16
 *  healths previewed put the coefficient in [9.85, 10.15] (lab 3 part
 *  eight, hp_calib) — the install's wounded multiplier row. */
export const NUKE_AA_WOUND = srcConst('nuclear.aaWound', 10, {
  ...gp('COMBAT_WOUNDED_DAMAGE_MULTIPLIER'),
  note: 'measured c in [9.85, 10.15] over 16 bomber previews; the strength is never rounded',
});
/** the warhead's DEFENCE on the two ICBM channels — the install publishes no
 *  strength column on `WMDs`, the live game does: 75 for a Missile Silo
 *  (four scenes closing to (74.86, 75.07]) and 80 for a Nuclear Submarine
 *  (the bare-tile sweep, (79.95, 80.15] — its own Combat), each REDUCED by
 *  the aim plot's terrain + feature DefenseModifier. A BOMBER's warhead
 *  defends at the bomber's own Combat and takes no plot term. */
export const NUKE_SILO_DEFENSE = srcConst('nuclear.siloDefense', 75, {
  lab: 'C-34: lab 3 part eight, "RESOLVED: both are integers — 75 and 80"',
});
export const NUKE_SUB_DEFENSE = srcConst('nuclear.subDefense', 80, {
  lab: 'C-34: lab 3 part eight, "RESOLVED: both are integers — 75 and 80"',
});
/** the cancellation line: a measured 50 LANDED and 52 cancelled, so the
 *  integer damage is tested strictly above 50. */
export const NUKE_INTERCEPT_DAMAGE = srcConst('nuclear.interceptDamage', 50, {
  lab: 'C-34: lab 3 part three ("The threshold is strictly > 50: a row that did exactly 50 damage landed")',
});

/** CIV6: a finished device "can then be used by any unit or improvement
 *  capable of deploying it on the map. This includes bomber aircraft, Nuclear
 *  Submarines, and the Missile Silo." These are the UNIT half; the silo is an
 *  improvement, and launches for the seat rather than for anyone standing
 *  on it. */
export const NUKE_CARRIERS: readonly string[] = srcConst('nuclear.NUKE_CARRIERS',
  ['BOMBER', 'JET_BOMBER', 'NUCLEAR_SUBMARINE'], {
    pedia: 'the GS Nuclear weapons page ("bomber aircraft, Nuclear Submarines, and the Missile '
      + 'Silo") — the UNIT half of that list; the silo is an improvement',
  });

/** CIV6: cleaning fallout "takes 1 build charge". */
export const FALLOUT_CLEAN_CHARGES = srcConst('nuclear.cleanCharges', 1, {
  pedia: 'the GS Nuclear weapons page (cleaning fallout "takes 1 build charge")',
});
