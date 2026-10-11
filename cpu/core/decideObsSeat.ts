import type { SeatEmitter } from './decideObs';
import type { GameState } from './types';
import { seatOf } from './seats';
import { cityStateById, envoysOf, hasMet } from './cityStates';
import { gpOffer } from './greatPeople';
import { GP_CLASSES } from '../data/greatPeople';
import { worldEraIndex } from './eras';
import { specialSessionDue } from './congress';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { siloTargets } from './combat';
import { beliefPicks, canFoundReligion, openBeliefs } from './game';
import { BELIEF_CATALOGS, BELIEF_SLOTS, PANTHEON_FAITH_COST, PANTHEON_IDS, RELIGION_TYPES } from '../data/religion';
import { governorPromotionOpen, governorsOf, governorTitlesAvailable } from './governors';
import { GOVERNORS, GOVERNOR_PROMOTIONS } from '../data/governors';

/**
 * THE SEAT SCALARS (the silo launch, envoys, congress, the Great Person pass,
 * the religion's beliefs).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */

/** The `nuke` group: the first device the seat holds whose silo reaches an
 *  offered target, and the lowest such tile; -1 each where there is none. */
function nukeGroup(state: GameState, seat: number): { device: number; tile: number } {
  for (let k = 0; k < NUCLEAR_DEVICES.length; k++) {
    const t = siloTargets(state, seat, k, 1);
    if (t.length) return { device: k, tile: t[0] };
  }
  return { device: -1, tile: -1 };
}

/** The `envoy` group: the bank, and per city-state roster index the envoys
 *  the seat holds there (the store, `envoysOf`), -1 where it has not met the
 *  city-state or the city-state is gone. */
function envoyGroup(state: GameState, seat: number): { avail: number; held: number[] } {
  const held: number[] = [];
  for (let i = 0; i < (state.cityStateMax ?? 0); i++) {
    const cs = cityStateById(state, i);
    held.push(cs && hasMet(cs, seat) ? envoysOf(cs, seat) : -1);
  }
  return { avail: seatOf(state, seat)?.envoysAvailable ?? 0, held };
}

/** The `congress` group: whether a Special Session sits at the close of the
 *  current turn (its ballot rides the record's `vote`). */
function congressGroup(state: GameState): Record<string, unknown> {
  return { special: specialSessionDue(state, state.turn, worldEraIndex(state)) };
}

/** The `gp` group, per Great Person class: the standing offer (`gpOffer`),
 *  who passed on it, its frozen price, and the seat's points floored. */
function gpGroup(state: GameState, seat: number): Record<string, number[]> {
  const sx = seatOf(state, seat);
  return {
    offer: GP_CLASSES.map((c) => gpOffer(state, c)),
    passed_by: GP_CLASSES.map((_c, i) => state.gpPassedBy?.[i] ?? -1),
    price: GP_CLASSES.map((_c, i) => state.gpPrice?.[i] ?? 0),
    points: GP_CLASSES.map((c) => Math.floor(sx?.gpp[c] ?? 0)),
  };
}

/** The `belief` group: whether the seat may found its religion now
 *  (`canFoundReligion`), how many beliefs an enhancement adopts now
 *  (`beliefPicks`), the class catalog row its religion holds per class (-1
 *  none), each class's open beliefs, whether it may found a pantheon now and
 *  the pantheons and religions still open. */
function beliefGroup(state: GameState, seat: number): Record<string, unknown> {
  const rel = seatOf(state, seat)?.religion;
  const open = (c: number) => {
    const ids = Object.keys(BELIEF_CATALOGS[c]);
    return openBeliefs(state, c).map((id) => ids.indexOf(id));
  };
  return {
    found: canFoundReligion(state, seat).ok,
    enhance: beliefPicks(state, seat),
    held: BELIEF_SLOTS.map((slot, c) => {
      const id = rel?.[slot];
      return id ? Object.keys(BELIEF_CATALOGS[c]).indexOf(id) : -1;
    }),
    follower: open(0),
    worship: open(1),
    founder: open(2),
    enhancer: open(3),
    pantheon_due: !!rel && rel.pantheon === null && (seatOf(state, seat)?.faith ?? 0) >= PANTHEON_FAITH_COST,
    pantheon: PANTHEON_IDS.flatMap((id, i) => (state.claimedPantheons.includes(id) ? [] : [i])),
    religion: RELIGION_TYPES.flatMap((t, i) => (state.seats.some((o) => o.religion.type === t) ? [] : [i])),
  };
}

/** The `governor` group, per governor roster index: whether it is
 *  appointed, its promotions' bits, the CENTRE tile of the seat's living city
 *  it holds (-1 none), the city-state roster index it is posted at (-1
 *  none), its neutralize turns left, whether the catalog sends it abroad;
 *  per promotion the governor it belongs to;
 *  the titles the seat may spend now, the promotions open now (ascending,
 *  `governorPromotionOpen` with a title in hand). */
function governorGroup(state: GameState, seat: number): Record<string, unknown> {
  const sx = seatOf(state, seat);
  const roster = sx ? governorsOf(sx) : [];
  const cities = sx?.cities ?? [];
  const titles = governorTitlesAvailable(state, seat);
  return {
    titles,
    appointed: GOVERNORS.map((_g, i) => (roster[i]?.appointed ? 1 : 0)),
    promotions: GOVERNORS.map((_g, i) => roster[i]?.promotions ?? 0),
    city: GOVERNORS.map((_g, i) => cities.find((c) => c.id === roster[i]?.cityId)?.centerIndex ?? -1),
    minor: GOVERNORS.map((_g, i) => roster[i]?.minorId ?? -1),
    out: GOVERNORS.map((_g, i) => roster[i]?.outTurns ?? 0),
    abroad: GOVERNORS.map((g) => (g.cityStates ? 1 : 0)),
    promo_gov: GOVERNOR_PROMOTIONS.map((p) => GOVERNORS.findIndex((g) => g.id === p.governor)),
    legal: GOVERNOR_PROMOTIONS.flatMap((p, k) => {
      const i = GOVERNORS.findIndex((g) => g.id === p.governor);
      return i >= 0 && governorPromotionOpen(state, seat, i, k) ? [k] : [];
    }),
  };
}

export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  nuke: nukeGroup,
  envoy: envoyGroup,
  congress: congressGroup,
  gp: gpGroup,
  belief: beliefGroup,
  governor: governorGroup,
};
