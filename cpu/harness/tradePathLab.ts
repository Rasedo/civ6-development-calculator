/**
 * THE TRADER'S PATH AND ELIGIBILITY AGAINST THE GAME'S, PAIR BY PAIR: the
 * sweep `tools/civ6lab/c108_sweep.py` writes (per origin city and destination
 * city, CanStartRoute and GetTradeRoutePath's plots; per city the players
 * holding an active / inactive Trading Post) scored on the engine's state of
 * the same turn, imported from the full-state dump beside it
 * (`<sweep stem>.dump.jsonl` + `.cat.json`).
 *
 *    npx vite-node cpu/harness/tradePathLab.ts -- <sweep.jsonl> [--rows]
 *
 * The engine's posts are the sweep's constructed ones (active or inactive),
 * stamped on each holder's `tradingPosts` in place of the importer's
 * history. Per pair the engine answers the course `tradeCourse` lays from
 * the origin's walk (`tradeReach`) and its eligibility as its route rules
 * test it, capacity, Traders and running routes aside: the course exists,
 * and a city-state destination is met (`canAddCsTradeRoute`), and no World
 * Congress ban touches an international pair (`canAddIntlTradeRoute`).
 *
 * Prints the eligibility table (game x engine), the path agreement over the
 * pairs both admit (equal, first differing plot), the paths the game's cache
 * answers for pairs it refuses (counted, not scored), and every disagreeing
 * pair; --rows every pair.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { tradeCourse, tradeReach, type TradeReach } from '../core/tradePath';
import { hasMet } from '../core/cityStates';
import { congressIntlBanned } from '../core/congress';
import { isCityStateSeat, seatOf } from '../core/seats';
import type { GameState } from '../core/types';

interface PairRow {
  kind: 'c108pair'; o: string; op: number; oplot: number; d: string; dp: number; dplot: number;
  can: boolean | 'err'; met: boolean; war: boolean; path: number[]; portalIn: number[]; portalOut: number[];
}
interface PostRow { kind: 'c108post'; city: string; plot: number; active: number[]; inactive: number[] }

const args = process.argv.slice(2).filter((a) => a !== '--');
const sweepPath = args[0];
const rowsOut = args.includes('--rows');
const dumpPath = sweepPath.replace(/\.jsonl$/, '.dump.jsonl');
if (!existsSync(dumpPath)) throw new Error(`no dump beside the sweep: ${dumpPath}`);
const rows = readFileSync(sweepPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as PairRow | PostRow);
const pairs = rows.filter((r): r is PairRow => r.kind === 'c108pair');
const postRows = rows.filter((r): r is PostRow => r.kind === 'c108post');

const cat = loadCatalog(dumpPath);
const rec = JSON.parse(readFileSync(dumpPath, 'utf8').split('\n').find((l) => l.trim())!) as TurnRecord;
const history = newHistory();
advanceHistory(history, rec, cat);
const state: GameState = importTurn(rec, cat, history).state;
const W = rec.head.W;
const xy = (i: number): string => `${i % W}:${Math.floor(i / W)}`;

// engine holder of every living centre: the game player behind a seat is the
// holder of that player's cities
const holder = new Map<number, number>();
for (const s of state.seats) for (const c of s.cities) holder.set(c.centerIndex, s.seat);
for (const c of state.freeSeat?.cities ?? []) holder.set(c.centerIndex, state.freeSeat!.seat);
for (const cs of state.cityStates ?? []) holder.set(cs.centerIndex, cs.seat);
const seatOfPlayer = new Map<number, number>();
for (const r of pairs) {
  for (const [p, plot] of [[r.op, r.oplot], [r.dp, r.dplot]] as const) {
    const s = holder.get(plot);
    if (s !== undefined && !seatOfPlayer.has(p)) seatOfPlayer.set(p, s);
  }
}

// the sweep's constructed posts replace the importer's
for (const s of [...state.seats, ...(state.freeSeat ? [state.freeSeat] : []), ...(state.cityStates ?? [])]) s.tradingPosts = [];
let postCount = 0;
for (const r of postRows) {
  for (const p of [...r.active, ...r.inactive]) {
    const s = seatOfPlayer.get(p);
    const owner = s === undefined ? undefined : seatOf(state, s);
    if (!owner) continue;
    if (!(owner.tradingPosts ??= []).includes(r.plot)) owner.tradingPosts.push(r.plot);
    postCount++;
  }
}

const reaches = new Map<string, TradeReach>();
const table = { tt: 0, tf: 0, ft: 0, ff: 0, err: 0, unmapped: 0 };
let pathEq = 0;
let pathDiff = 0;
let pathNone = 0;
let cachedRefused = 0;
const disagree: string[] = [];
for (const r of pairs) {
  const seat = seatOfPlayer.get(r.op);
  const dseat = holder.get(r.dplot);
  if (seat === undefined || dseat === undefined || holder.get(r.oplot) !== seat) { table.unmapped++; continue; }
  const key = `${seat}:${r.oplot}`;
  let reach = reaches.get(key);
  if (!reach) { reach = tradeReach(state, seat, r.oplot); reaches.set(key, reach); }
  const course = tradeCourse(reach, r.dplot);
  let why = course ? '' : 'beyond range';
  if (course && isCityStateSeat(dseat) && !isCityStateSeat(seat)) {
    const cs = state.cityStates.find((c) => c.seat === dseat);
    if (cs && !hasMet(cs, seat)) why = 'city-state not met';
  }
  if (course && !why && dseat !== seat && !isCityStateSeat(dseat) && !isCityStateSeat(seat)
    && (congressIntlBanned(state, seat) || congressIntlBanned(state, dseat))) why = 'congress ban';
  const ours = why === '';
  const label = `${r.o}(${xy(r.oplot)}) -> ${r.d}(${xy(r.dplot)}) met ${r.met} war ${r.war}`;
  if (r.can === 'err') { table.err++; continue; }
  const game = r.can;
  if (game && ours) table.tt++;
  else if (game && !ours) { table.tf++; disagree.push(`can: game yes, ours no (${why}) ${label}, game path ${r.path.length}`); }
  else if (!game && ours) { table.ft++; disagree.push(`can: game no, ours yes ${label}, our course ${course!.length}`); }
  else table.ff++;
  const gp = r.path.length > 0 && r.path[0] !== r.oplot ? [r.oplot, ...r.path] : r.path;
  if (!game) { if (gp.length > 0) cachedRefused++; continue; }
  if (!course) {
    pathNone++;
    if (rowsOut) console.log(`path none ${label}`);
    continue;
  }
  let i = 0;
  while (i < gp.length && i < course.length && gp[i] === course[i]) i++;
  if (i === gp.length && i === course.length) {
    pathEq++;
    if (rowsOut) console.log(`path equal ${label} (${gp.length})`);
  } else {
    pathDiff++;
    disagree.push(`path: ${label} first differing plot #${i}: game ${i < gp.length ? xy(gp[i]) : 'end'} ours ${i < course.length ? xy(course[i]) : 'end'}`
      + ` (game ${gp.length}, ours ${course.length})\n    game ${gp.map(xy).join(' ')}\n    ours ${course.map(xy).join(' ')}`);
  }
}

console.log(`turn ${rec.turn}: ${pairs.length} pairs, ${postRows.length} cities, ${postCount} constructed posts stamped`);
console.log(`eligibility (game/ours): yes/yes ${table.tt}, yes/no ${table.tf}, no/yes ${table.ft}, no/no ${table.ff}`
  + `; CanStartRoute errors ${table.err}, pairs not mapped to an engine seat ${table.unmapped}`);
const both = table.tt + table.ff;
console.log(`eligibility agreement ${both} of ${both + table.tf + table.ft}`);
console.log(`paths over the pairs the game admits: equal ${pathEq}, differing ${pathDiff}, ours none ${pathNone}`
  + `; refused pairs the game's cache still paths ${cachedRefused} (not scored)`);
for (const d of disagree) console.log(d);
