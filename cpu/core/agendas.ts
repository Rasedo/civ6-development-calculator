/**
 * THE MAJORS' AGENDAS (Game_Initializer 0x31d3c0; the civic's 0x31f7f0 /
 * 0x427bf0; `tools/civ6lab/dll_readings.md` "C-97: the majors' opinion — the
 * agendas"). A major carries its leader's historical agendas
 * (HistoricalAgendas), one random agenda drawn at set-up
 * (RandomAgendasInEra, the Ancient era's tags) and one more when it first
 * holds a civic of RandomAgendasForCivic (Nationalism). The pool walks the
 * draw's tags in their order and, within a tag, the agendas in database
 * order — an agenda as many majors already hold as its GameLimit (none: the
 * majors' count) left out, one that RequiresReligion left out of a major with
 * none; one uniform draw over it ("Choose random agenda"); an agenda the
 * major holds, or one exclusive with one it holds, is drawn again over the
 * same pool. The draws are the caller's (`AgendaDraw`): the action replay
 * hands the game's own from its draw log.
 *
 * Their weight lists (AgendaTraits -> AiLists) join the major's yield weights
 * (`yieldWeights`).
 */
import { AI_AGENDAS, AI_EXCLUSIVE_AGENDAS, AI_HISTORICAL_AGENDAS, AI_RANDOM_AGENDAS, AI_RANDOM_AGENDAS_FOR_CIVIC,
  AI_RANDOM_AGENDAS_IN_ERA } from '../data/aiTables';
import { gameTypeOf } from '../data/aliases';
import { isCiv, leaderOf } from './seats';
import type { GameState, Seat } from './types';

/** one draw over `n` rows: an index */
export type AgendaDraw = (n: number) => number;

const exclusive = (a: string, b: string): boolean =>
  AI_EXCLUSIVE_AGENDAS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function pool(state: GameState, seat: Seat, tags: readonly string[]): string[] {
  const majors = state.seats.filter((s) => isCiv(s.seat));
  const holders = (a: string): number => majors.filter((s) => (s.agendas ?? []).includes(a)).length;
  const out: string[] = [];
  for (const tag of tags) {
    for (const a of AI_AGENDAS) {
      const row = AI_RANDOM_AGENDAS.find((r) => r.agenda === a);
      if (!row || row.tag !== tag) continue;
      if (holders(a) >= (row.gameLimit >= 0 ? row.gameLimit : majors.length)) continue;
      if (row.requiresReligion && !seat.religion.founded) continue;
      out.push(a);
    }
  }
  return out;
}

/** one random agenda for `seat` from the pool of `tags` */
function drawAgenda(state: GameState, seat: Seat, tags: readonly string[], draw: AgendaDraw): void {
  const p = pool(state, seat, tags);
  if (!p.length) return;
  const held = (seat.agendas ??= []);
  for (;;) {
    const pick = p[draw(p.length)];
    if (pick === undefined) return;
    if (held.includes(pick) || held.some((h) => exclusive(h, pick))) continue;
    held.push(pick);
    return;
  }
}

/** THE SET-UP: each major in seat order takes its historical agendas and its
 *  Ancient era's random ones */
export function setupAgendas(state: GameState, draw: AgendaDraw): void {
  const era = AI_RANDOM_AGENDAS_IN_ERA.find((e) => e.era === 'ERA_ANCIENT');
  for (const s of state.seats) {
    if (!isCiv(s.seat)) continue;
    const leader = leaderOf(state, s.seat);
    s.agendas = [...(leader ? AI_HISTORICAL_AGENDAS[`LEADER_${leader}`] ?? [] : [])];
    for (let k = 0; era && k < era.n; k++) drawAgenda(state, s, era.tags, draw);
  }
}

/** THE CIVIC'S AGENDAS: a major that holds a civic of RandomAgendasForCivic
 *  it did not hold (`before`) draws its agendas */
export function civicAgendas(state: GameState, seat: Seat, before: readonly string[], draw: AgendaDraw): void {
  for (const row of AI_RANDOM_AGENDAS_FOR_CIVIC) {
    const has = (civics: readonly string[]) => civics.some((c) => gameTypeOf('civic', c, 'CIVIC_') === row.civic);
    if (!has(seat.research.civics) || has(before)) continue;
    for (let k = 0; k < row.n; k++) drawAgenda(state, seat, row.tags, draw);
  }
}
