/**
 * THE AI'S KNOWLEDGE OF THE MAP'S CITIES AND ITS YIELD ADVANTAGE
 * (GameCore_XP2 AI::Knowledge, `tools/civ6lab/dll_readings.md` "C-97: the
 * AI's knowledge of the map's cities"). Its log is AI_Knowledge.csv: each turn's
 * statistics ("START LOG", mean +/- deviation per yield) and its city entries.
 *
 * THE DEFAULTS (GlobalAI 0x6df230, once per game): per yield the mean and
 * the sample deviation, 24.8, of the plot yields of every non-barbarian
 * player's start plot and the six beside it, each plot read for that player;
 * and the players counted (GlobalAI +0x1d0), the least entries the knowledge
 * base needs before its own statistics stand in for these.
 *
 * THE KNOWLEDGE BASE (player +0x12b8): an entry per city the player knows —
 * its own and those it has seen — with the city's yields as last recorded,
 * truncated (0x5ef9a0), and its majority religion. The turn's update
 * (0x5ebb30): every entry ages; an entry whose plot the player sees with no
 * city of the entry's owner there is dropped; with two entries or more, the
 * mean per yield is the sum of each entry's yield x 256 / n truncated, the
 * variance the sum of each entry's squared distance / (n - 1) truncated, the
 * deviation its square root; else both read 0. The turn records its
 * entries first — the player's own cities and the cities it sees — then
 * updates (`strategyTurn`).
 *
 * THE YIELD ADVANTAGE of a city (0x5d83c0 with its flag clear): its yield x
 * (the greater of the city AI's stored yield, +0x1118, and the city's own;
 * the stored array unread, so the city's own) against the knowledge base's
 * mean and deviation where it holds the defaults' players or more entries,
 * else the defaults' mean x 6 and deviation x fx(2.449): (x - mean) /
 * deviation, x - mean where the deviation is 0.
 */
import { AI_YIELDS } from '../../cpu/core/aiWeights';
import type { MajorView } from './view';

const FX = 256;

/** fx(f): the integer part << 8 | the fraction's 256ths, truncated */
const fx = (f: number): number => (Math.trunc(f) << 8) | Math.trunc((f - Math.trunc(f)) * FX);
/** a 24.8 value as the float the DLL takes (the low byte / 256 + the rest) */
const toFloat = (v: number): number => (v & 0xff) / FX + (v >> 8);

export interface AiYieldDefaults {
  mean: readonly number[];
  sd: readonly number[];
  players: number;
}

/** a city the AI knows: its centre, owner, the yields last recorded
 *  (whole), its majority religion then, and the turns since */
export interface KnownCity {
  plot: number;
  owner: number;
  yields: number[];
  religion: number;
  age: number;
}

export interface KnowledgeBase {
  cities: KnownCity[];
  mean: number[];
  sd: number[];
}

export const newKnowledge = (): KnowledgeBase => ({ cities: [], mean: AI_YIELDS.map(() => 0), sd: AI_YIELDS.map(() => 0) });

/** a sample deviation from a 24.8 sum of squares over `n - 1` */
const deviation = (sumSq: number, n1: number): number => {
  const v = Math.sqrt(toFloat(sumSq) / n1);
  return fx(v);
};

/** THE DEFAULTS (0x6df230) over the players' start plots */
export function yieldDefaults(view: MajorView): AiYieldDefaults {
  const starts = view.startPlots();
  const plots: { plot: number; seat: number }[] = [];
  for (const s of starts) for (const p of view.plotsWithin(s.plot, 1)) plots.push({ plot: p, seat: s.seat });
  const n = plots.length;
  const mean = AI_YIELDS.map(() => 0);
  const sd = AI_YIELDS.map(() => 0);
  if (n === 0) return { mean, sd, players: starts.length };
  AI_YIELDS.forEach((y, k) => {
    let sum = 0;
    for (const p of plots) sum += Math.trunc(view.plotYield(p.seat, p.plot, y)) << 8;
    const m = Math.trunc((sum * FX) / (n * FX));
    let sq = 0;
    for (const p of plots) {
      const d = (Math.trunc(view.plotYield(p.seat, p.plot, y)) << 8) - m;
      sq += Math.trunc((d * d) / FX);
    }
    mean[k] = m;
    sd[k] = n > 1 ? deviation(sq, n - 1) : 0;
  });
  return { mean, sd, players: starts.length };
}

/** THE TURN'S UPDATE (0x5ebb30) before the entries are recorded: the ages,
 *  the entries gone, the statistics */
export function knowledgeTurn(view: MajorView, kb: KnowledgeBase, seat: number): void {
  for (const c of kb.cities) c.age += 1;
  const seen = view.plotsSeen(seat);
  const at = new Map(view.mapCities().map((c) => [c.plot, c] as const));
  kb.cities = kb.cities.filter((e) => !seen.has(e.plot) || at.get(e.plot)?.owner === e.owner);
  const n = kb.cities.length;
  kb.mean = AI_YIELDS.map(() => 0);
  kb.sd = AI_YIELDS.map(() => 0);
  if (n < 2) return;
  AI_YIELDS.forEach((_y, k) => {
    let m = 0;
    for (const e of kb.cities) m += Math.trunc(((e.yields[k] << 8) * FX) / (n * FX));
    let sq = 0;
    for (const e of kb.cities) {
      const d = (e.yields[k] << 8) - m;
      sq += Math.trunc((Math.trunc((d * d) / FX) * FX) / ((n - 1) * FX));
    }
    kb.mean[k] = m;
    kb.sd[k] = deviation(sq, 1);
  });
}

/** the entries recorded through the turn: the seat's own cities and the
 *  cities it sees, each refreshed in place or added at the end */
export function knowledgeRecord(view: MajorView, kb: KnowledgeBase, seat: number): void {
  const seen = view.plotsSeen(seat);
  for (const c of view.mapCities()) {
    if (c.owner !== seat && !seen.has(c.plot)) continue;
    const yields = c.yields.map((v) => Math.trunc(v));
    const e = kb.cities.find((x) => x.plot === c.plot && x.owner === c.owner);
    if (e) Object.assign(e, { yields, religion: c.religion, age: 0 });
    else kb.cities.push({ plot: c.plot, owner: c.owner, yields, religion: c.religion, age: 0 });
  }
}

/** THE YIELD ADVANTAGE (0x5d83c0, its flag clear) of the city at `plot`
 *  for the yield at index `k`, 24.8 */
export function yieldAdvantage(kb: KnowledgeBase, defaults: AiYieldDefaults, x: number, k: number): number {
  const own = kb.cities.length >= defaults.players;
  const mean = own ? kb.mean[k] : Math.trunc(defaults.mean[k] * 6);
  const sd = own ? kb.sd[k] : Math.trunc((defaults.sd[k] * fx(2.449)) / FX);
  const xf = Math.round(x * FX);
  return sd > 0 ? Math.trunc(((xf - mean) * FX) / sd) : xf - mean;
}

/** the knowledge base's statistics as AI_Knowledge.csv prints them */
export const knowledgeStats = (kb: KnowledgeBase): { mean: number[]; sd: number[] } =>
  ({ mean: kb.mean.map(toFloat), sd: kb.sd.map(toFloat) });
