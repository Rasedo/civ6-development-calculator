/**
 * #51/S6.11 — WHAT A SEAT MAY DO.
 *
 * Every actor in the game is a seat (`core/seats.ts`): the player, the rivals,
 * the city-states, the barbarians. They differ, and this is the ONE table that
 * says how. Code that reads a seat asks the table; it never branches on the
 * seat id, which is what let "is this a barbarian?" get spelled four different
 * ways across combat.ts, units.ts and eras.ts.
 *
 * THE ADMISSIBILITY RULE (UNIFY_SEATS_PLAN §3): a capability bit is admissible
 * only where the EMPTY / ZERO DATA VALUE WOULD BE WRONG. A bit that merely
 * restates what a seat's data already says is a second source of truth for one
 * fact, and the two will drift.
 *
 * The plan proposed twelve bits. The rule admits TWO. The other ten are listed
 * below with the datum that makes each unnecessary — recorded rather than
 * carried, because a dead flag reads like a rule and is not one:
 *
 *   research      a seat with `research.techs = []` never unlocks anything.
 *   found         a seat with `settlers = 0` and no build queue never settles.
 *   produce       an empty queue produces nothing.
 *   expandBorders border growth is paid for out of culture; zero culture, no
 *                 growth. (A city-state's fixed ring is its FOUNDING ring.)
 *   greatPeople   zero `gpp` never crosses a threshold.
 *   trade         an empty `tradeRoutes` list routes nothing.
 *   diplomacy     zero favour and zero points win no diplomatic victory.
 *   envoys        `envoysAvailable = 0` assigns none. (Being a suzerain
 *                 TARGET is the minor's own `type` datum, not a capability of
 *                 the sender.)
 *   suzerainable  as above — it is data on the minor.
 *   victory       every victory check is a threshold on a stored total, and a
 *                 seat that accrues none never crosses one. Domination reads
 *                 `isCapital`, which a minor's one city does not set.
 *
 * `alwaysHostile` and `xp` survive because in both cases the empty value is a
 * LIE: an all-false war row reads as PEACE, and `xp = 0` accumulates.
 *
 * NOT STORED ON THE SEAT. The plan's target shape had `Seat { caps, ... }`.
 * The class is already a function of the absolute seat id (`seatClass`), so a
 * stored copy would be a second source of truth for a fact the id carries —
 * the exact hazard the admissibility rule exists to prevent, one level up.
 * The trigger that would flip this: a per-CIV trait that varies a capability
 * WITHIN a class (a civ whose barbarians promote). Nothing does today.
 */

/**
 * The three kinds of actor.
 *
 *   major    the player and the rivals — full civs
 *   minor    city-states
 *   hostile  barbarians
 */
export type SeatClass = 'major' | 'minor' | 'hostile';

export interface SeatCaps {
  /**
   * This seat's units accrue EXPERIENCE (AUDIT B-4) and promote with it.
   *
   * Zero would be wrong: a barbarian carrying `xp = 0` would ACCUMULATE from
   * its next attack and start fielding veterans. Civ 6 barbarians have no
   * promotions at all.
   */
  xp: boolean;
  /**
   * This seat is at war with every other seat, permanently, with no war state
   * declared or stored.
   *
   * Zero would be wrong: the war relation is one symmetric matrix (#51/S6.0)
   * and an all-false row means PEACE. Barbarians never declare and never make
   * peace, so their hostility cannot be expressed as war data.
   */
  alwaysHostile: boolean;
}

export const SEAT_CAPS: Record<SeatClass, SeatCaps> = {
  major: { xp: true, alwaysHostile: false },
  minor: { xp: true, alwaysHostile: false },
  hostile: { xp: false, alwaysHostile: true },
};

/**
 * MINOR `xp` IS UNREACHED, NOT UNVERIFIED-BY-CHOICE. Neither engine gives a
 * city-state units yet, so no unit carries a minor seat and this cell is never
 * read. It holds `true` because that is what the code did before the table
 * existed — `gainXp` refused barbarians and nobody else — so the table changes
 * no behaviour. When Round 6 gives minors units, this cell needs a Civ 6
 * source before it is trusted; it is called out here rather than left to be
 * discovered as a silent default.
 */
