/**
 * THE FULL CIVILIZATIONS' SIGHT AGAINST THE GAME'S: per record, the land no
 * major nor the Free Cities sees (`plotsSeenNow`, the camp step's 0x50b2d0
 * on FULL_CIV) on the world of record t+1 against Barbarians.csv's "No
 * Visibility" of turn t (the barbarians' turn, after every full civ's).
 *
 *    npx vite-node cpu/harness/sightLab.ts -- <dump.jsonl> [--from T] [--to T] [--rows] [--map T]
 *
 * Prints the turns compared, the turns equal, the mean and the extremes of
 * ours less the game's; --rows every turn; --map T the map of turn T (a
 * unit u, land seen as its owner's digit or o, unseen land #, water seen ,
 * and unseen ~).
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { plotsSeenNow } from '../core/barbarians';
import { FREE_SEAT } from '../core/seats';
import { isWater } from '../../world/query';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const opt = (k: string) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : undefined);
const from = opt('--from') ?? 0;
const to = opt('--to') ?? 1e9;
const rowsOut = args.includes('--rows');
const log = dump.replace(/\.jsonl$/, '.logs/Barbarians.csv');
if (!existsSync(log)) throw new Error(`no ${log}`);
const game = new Map<number, number>();
for (const line of readFileSync(log, 'utf8').split('\n')) {
  const c = line.split(',').map((x) => x.trim());
  if (c.length === 7 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[5])) game.set(Number(c[0]), Number(c[5]));
}
const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const history = newHistory();
let n = 0;
let eq = 0;
let sum = 0;
let lo = Infinity;
let hi = -Infinity;
for (let i = 0; i + 1 < recs.length; i++) {
  const b = recs[i + 1];
  if (i === 0) advanceHistory(history, recs[0], cat);
  advanceHistory(history, b, cat);
  const turn = recs[i].turn;
  if (turn < from || turn > to || !game.has(turn)) continue;
  const imp = importTurn(b, cat, history);
  const st = imp.state;
  const seers = new Set<number>(st.seats.map((s) => s.seat));
  if (st.freeSeat) seers.add(FREE_SEAT);
  const seen = plotsSeenNow(st, seers);
  let dark = 0;
  for (const t of st.map.tiles) if (!isWater(t) && !seen[t.index]) dark++;
  const d = dark - game.get(turn)!;
  n++;
  if (d === 0) eq++;
  sum += d;
  lo = Math.min(lo, d);
  hi = Math.max(hi, d);
  if (opt('--map') === turn) {
    const W = b.head.W;
    for (let y = 0; y < b.head.H; y++) {
      let line = y % 2 ? ' ' : '';
      for (let x = 0; x < W; x++) {
        const t = st.map.tiles[y * W + x];
        const u = st.units.find((v) => v.tileIndex === t.index && seers.has(v.seat));
        line += (isWater(t) ? (seen[t.index] ? ',' : '~') : u ? 'u' : seen[t.index] ? (t.ownerSeat >= 0 && t.ownerSeat < 10 ? String(t.ownerSeat) : 'o') : '#') + ' ';
      }
      console.log(line);
    }
  }
  if (rowsOut) console.log(`t${turn} ours ${dark} game ${game.get(turn)} ${d >= 0 ? '+' : ''}${d}`);
}
console.log(`turns ${n}, equal ${eq}, ours less the game's: mean ${(sum / Math.max(1, n)).toFixed(2)}, ${lo}..${hi}`);
