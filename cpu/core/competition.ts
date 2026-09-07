/**
 * SCORED COMPETITIONS — the World Congress's other Diplomatic Victory faucet.
 *
 * CIV6 (World Congress): they are "chances for civilizations to win esteem
 * through events and projects that benefit the world", and "If enacted,
 * players who vote in favor of the Scored Competition will compete to
 * contribute to the cause. The players that contribute the most will receive
 * lucrative rewards."
 *
 * CIV6 (Competition): one runs for exactly 30 turns, "after which it ends and
 * winners are chosen". "The civilization with the highest score wins the Gold
 * Tier rewards. Additionally, all civs whose scores fall within the top 25%
 * (including the Gold Tier winner) win the Silver Tier rewards, and all civs
 * whose scores fall within the next highest quarter (i.e. the top 26-50%) win
 * the Bronze Tier rewards."
 *
 * `gpu/core/sim_seats.py`'s `_competition_*` are the twins.
 */
import type { Competition, GameState, GreatPersonClass } from './types';
import { boostRandom } from './gpAbility';
import { ERAS } from '../data/techs';
import type { Era } from '../data/techs';
import {
  COMPETITIONS, COMPETITION_BRONZE_PCT, COMPETITION_CLIMATE,
  COMPETITION_DECOMMISSION_SCORE, COMPETITION_SILVER_PCT,
  COMPETITION_TURNS,
} from '../data/seats';
import { isCiv, seatOf } from './seats';
import { getModifiers } from './effects';

/** The competition running right now, if any. */
export function competitionOf(state: GameState): Competition | undefined {
  return state.competition;
}

/**
 * Enact one. The field is the seats that voted FOR it — "players who vote in
 * favor of the Scored Competition will compete" — and a seat with no city is
 * not in the world to compete.
 *
 * ONE at a time. Real Civ 6 bounds nothing here; both engines carry a single
 * slot, which is what makes the score table a fixed plane.
 */
export function startCompetition(state: GameState, kind: number, field: readonly number[]): void {
  if (kind < 0 || kind >= COMPETITIONS.length) return;
  const n = state.seats.length;
  const member = Array.from({ length: n }, () => 0);
  for (const s of field) {
    const sx = seatOf(state, s);
    if (sx && isCiv(s) && sx.cities.length > 0) member[s] = 1;
  }
  state.competition = { kind, left: COMPETITION_TURNS, score: Array.from({ length: n }, () => 0), member };
}

/** CIV6 (Climate Accords): "1 point per turn for each CO2 emission less than
 *  the highest polluter" — the world's highest, not the field's, and a seat
 *  that IS the highest polluter scores nothing. */
function scoreTurn(state: GameState, c: Competition): void {
  const def = COMPETITIONS[c.kind];
  if (!def) return;
  if (def.scored === 'co2') {
    let top = 0;
    for (const s of state.seats) if (isCiv(s.seat)) top = Math.max(top, s.co2Turn ?? 0);
    for (let i = 0; i < c.member.length; i++) {
      if (!c.member[i]) continue;
      const sx = seatOf(state, i);
      if (!sx) continue;
      c.score[i] += Math.max(0, top - (sx.co2Turn ?? 0));
    }
    return;
  }
  // CIV6 (World's Fair): "1 point per Great Person POINT of every class"
  // earned during the window — the eight `WORLDS_FAIR_SCORE_GPP_*` rows,
  // ScoreAmount 1 apiece. The Prophet is not among them.
  for (let i = 0; i < c.member.length; i++) {
    const sx = c.member[i] ? seatOf(state, i) : undefined;
    if (!sx) continue;
    let sum = 0;
    for (const cls of FAIR_CLASSES) sum += sx.gppTurn?.[cls] ?? 0;
    c.score[i] += sum;
  }
}

/** CIV6 (CLIMATE_ACCORDS_SCORE_DECOMMISSION_*): a decommission project
 *  completed during the window scores its seat `ScoreAmount` 100, beside the
 *  per-turn emission gap. A seat outside the field scores nothing. */
export function scoreDecommission(state: GameState, seat: number): void {
  const c = state.competition;
  if (!c || c.kind !== COMPETITION_CLIMATE || !c.member[seat]) return;
  c.score[seat] += COMPETITION_DECOMMISSION_SCORE;
}

/** CIV6 (Expansion2_Emergencies.xml): the eight classes the World's Fair
 *  scores — every Great Person class but the Prophet. */
const FAIR_CLASSES: readonly GreatPersonClass[] = [
  'GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN',
];

/** The podium, by RANK: gold is the single best, and the two lower tiers are
 *  the published quarters of the field. Ties break on the lower seat id, one
 *  total order both engines share. */
function payPodium(state: GameState, c: Competition): void {
  const def = COMPETITIONS[c.kind];
  if (!def) return;
  const field: number[] = [];
  for (let i = 0; i < c.member.length; i++) if (c.member[i]) field.push(i);
  if (field.length === 0) return;
  field.sort((a, b) => (c.score[b] - c.score[a]) || (a - b));
  const silver = Math.ceil(field.length * COMPETITION_SILVER_PCT / 100);
  const bronze = Math.ceil(field.length * COMPETITION_BRONZE_PCT / 100);
  for (let r = 0; r < field.length; r++) {
    const sx = seatOf(state, field[r]);
    if (!sx) continue;
    if (r === 0) sx.diplomaticPoints = (sx.diplomaticPoints ?? 0) + def.goldPoints;
    // CIV6 (WORLD_FAIR_FIRST_PLACE_GREAT_PERSON_POINTS): the winner also
    // takes Great Person points, spread over the classes it scored.
    if (r === 0 && def.goldGpp) {
      for (const cls of FAIR_CLASSES) sx.gpp[cls] = (sx.gpp[cls] ?? 0) + def.goldGpp;
    }
    // CIV6 (Faces of Peace): "+100% Diplomatic Favor from successfully
    // completing an ... Scored Competition" (`EMERGENCY_FAVOR_ROWS`)
    const pct = getModifiers(state, field[r]).emergencyFavorPct;
    const paid = (n: number) => Math.floor((n * (100 + pct)) / 100);
    if (r < silver) sx.diplomaticFavor = (sx.diplomaticFavor ?? 0) + paid(def.silverFavor);
    else if (r < bronze) sx.diplomaticFavor = (sx.diplomaticFavor ?? 0) + paid(def.bronzeFavor);
    // CIV6 (WORLD_FAIR_{TOP,BOTTOM}_TIER_CULTURE): random civic boosts of the
    // Industrial..Information eras, two to the top tier and one below it.
    const boosts = r < silver ? (def.silverBoosts ?? 0)
      : r < bronze ? (def.bronzeBoosts ?? 0) : 0;
    if (boosts > 0 && def.boostEras) {
      boostRandom(state, field[r], 'civic', boosts,
        ERAS.indexOf(def.boostEras[0] as Era), ERAS.indexOf(def.boostEras[1] as Era));
    }
  }
  state.eventLog.push(`${def.name}: ${seatOf(state, field[0])?.name ?? 'nobody'} takes the gold.`);
}

/**
 * The turn's competition: score the field, run the clock down, pay the podium
 * when it reaches zero. Runs beside the emergencies, after every seat has had
 * its turn — which is what makes this turn's emissions comparable.
 */
export function resolveCompetition(state: GameState): void {
  const c = state.competition;
  if (c) {
    scoreTurn(state, c);
    c.left -= 1;
    if (c.left <= 0) {
      payPodium(state, c);
      state.competition = undefined;
    }
  }
  // The per-turn emission is read HERE and nowhere else, so it is cleared here
  // too: every seat has emitted by now, and the next turn starts from zero.
  for (const s of state.seats) {
    if (s.co2Turn) s.co2Turn = 0;
    if (s.gppTurn) delete s.gppTurn;
  }
}
