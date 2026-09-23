import type { GameState } from './types';
import {
  allyTurnsWith, borderTurnsFrom, citiesOf, civsAtWar, delegationWith, denounceActive, friendTurnsWith, isCiv,
  treatyTurnsWith, warTurnsWith,
} from './seats';
import { grievanceWith, promiseWith } from './grievance';
import { dealOfferOf, spyHeldWith } from './deals';
import { seatProximity, seatStrength } from './phase';
import { gwCountKind } from './greatWorks';
import { isCivicComplete } from './effects';
import { CIVICS } from '../data/civics';
import { GW_KINDS } from '../data/greatWorks';
import { DEAL_ITEMS } from '../data/seats';
import { emptyStockpile } from '../data/constants';
import { PROMISES } from '../data/promises';

/**
 * THE DIPLOMATIC TABLE (`geo`), TS side: one per game, by the field names of
 * `shared/decide.schema.json`'s `geo` section and in the shape
 * `gpu/core/neutral.py` `geo_obs` emits. Per major seat (index = seat) its
 * standing; per ordered pair of majors [a][b] what stands between them, 0 on
 * the diagonal. Every seat's agreements and deal tables are decided from it
 * at once.
 */
export function geoObs(state: GameState): Record<string, unknown> {
  const seats = state.seats.filter((s) => isCiv(s.seat)).sort((a, b) => a.seat - b.seat);
  const ids = seats.map((s) => s.seat);
  const pair = (f: (a: number, b: number) => number): number[][] =>
    ids.map((a) => ids.map((b) => (a === b ? 0 : f(a, b))));
  const civicIds = Object.values(CIVICS).map((d) => d.id);
  const c = state.competition;
  return {
    alive: ids.map(() => 1),
    cities: ids.map((s) => citiesOf(state, s).length),
    strength: ids.map((s) => seatStrength(state, s)),
    treasury: seats.map((s) => Math.floor(s.treasury)),
    favor: seats.map((s) => Math.floor(s.diplomaticFavor ?? 0)),
    civics: ids.map((s) => civicIds.flatMap((id, i) => (isCivicComplete(state, id, s) ? [i] : []))),
    stockpile: seats.map((s) => [...(s.stockpile ?? emptyStockpile())]),
    great_works: ids.map((s) => Array.from({ length: GW_KINDS }, (_x, k) =>
      citiesOf(state, s).reduce((n, city) => n + gwCountKind(city, k), 0))),
    comp_kind: c?.kind ?? -1,
    comp_target: c?.target ?? -1,
    comp_member: ids.map((s) => (c?.member[s] ? 1 : 0)),
    war: pair((a, b) => (civsAtWar(state, a, b) ? 1 : 0)),
    war_turns: pair((a, b) => warTurnsWith(state, a, b)),
    denounce: pair((a, b) => (denounceActive(state, a, b) ? 1 : 0)),
    friend_turns: pair((a, b) => friendTurnsWith(state, a, b)),
    ally_turns: pair((a, b) => allyTurnsWith(state, a, b)),
    borders_turns: pair((a, b) => borderTurnsFrom(state, a, b)),
    delegation: pair((a, b) => delegationWith(state, a, b)),
    grievance: pair((a, b) => grievanceWith(state, a, b)),
    proximity: pair((a, b) => {
      const d = seatProximity(state, a, b);
      return Number.isFinite(d) ? d : 999;
    }),
    joint_open: pair((a, b) => (!civsAtWar(state, a, b) && allyTurnsWith(state, a, b) === 0
      && friendTurnsWith(state, a, b) === 0 && treatyTurnsWith(state, a, b) === 0 ? 1 : 0)),
    spies_held: pair((a, b) => spyHeldWith(state, a, b)),
    offer_left: pair((a, b) => dealOfferOf(state, a, b)?.left ?? 0),
    offer_ask: ids.map((a) => ids.map((b) => {
      const ask = a === b ? undefined : dealOfferOf(state, a, b)?.ask;
      const out: number[] = [];
      for (let s = 0; s < DEAL_ITEMS; s++) {
        const it = ask?.[s];
        out.push(it?.[0] ?? -1, it?.[1] ?? -1, it?.[2] ?? -1);
      }
      return out;
    })),
    promise: ids.map((a) => ids.map((b) => PROMISES.map((_p, k) => (a === b ? 0 : promiseWith(state, a, b, k))))),
    converted: pair((a, b) => citiesOf(state, a).filter((c) => c.followedReligion === b).length),
  };
}
