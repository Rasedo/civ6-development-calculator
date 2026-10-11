/**
 * THE GAME'S CITY BUILD VALUE TABLES: AI_CityBuild.csv's PLOT ANALYSIS LOG
 * (written with the AI's verbose logs, `game.py profile apply
 * --ai-verbose`): per city each turn, per plot it evaluates — the city
 * centre first — a line `turn,player,,x y, ...` and its value rows
 * `,,,DISTRICTS|IMPROVEMENTS|BUILDINGS|UNITS|PROJECTS, v, v, ...` in database
 * order (-9999 an item it does not value). Here the city centre's BUILDINGS
 * row, against `aiCityBuild.ts`. Read from the recording's log store
 * (`logStore.ts`), where the blocks are the AI_CityBuild_plot tables.
 */
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { FX_MIN } from '../core/aiValue';
import { hasLog, openLogStore } from './logStore';

/** a value row's item the store holds no value for was logged -9999.00 */
const UNVALUED = -9999;

/** the city centre's BUILDINGS values, by `${turn}:${player}:${city}` */
export function loadCityBuildTables(dumpPath: string): Map<string, number[]> {
  return new Map([...loadCityBuildCentre(dumpPath)].map(([k, t]) => [k, t.BUILDINGS ?? []]));
}

/** the city centre's value rows (DISTRICTS, IMPROVEMENTS, BUILDINGS, UNITS,
 *  PROJECTS), by `${turn}:${player}:${city}`: the first plot of the city's
 *  first block of the turn */
export function loadCityBuildCentre(dumpPath: string): Map<string, Record<string, number[]>> {
  const out = new Map<string, Record<string, number[]>>();
  const db = openLogStore(dumpPath);
  if (!db || !hasLog(db, 'AI_CityBuild_plot')) return out;
  const family = new Map(db.prepare('SELECT id, name FROM AI_CityBuild_family').all().map((f) => [Number(f.id), String(f.name)]));
  const centres = `WITH c AS (SELECT p.id, p.turn, p.player, p.city FROM AI_CityBuild_plot p
    JOIN (SELECT min(block) AS b FROM AI_CityBuild_plot GROUP BY turn, player, city) m ON p.block = m.b AND p.seq = 0)`;
  const byPlot = new Map<number, Record<string, number[]>>();
  for (const r of db.prepare(`${centres} SELECT c.id, c.turn, c.player, c.city, r.family, r.n FROM c
      JOIN AI_CityBuild_plot_row r ON r.plot = c.id ORDER BY c.id, r.family`).all()) {
    const key = `${r.turn}:${r.player}:${r.city}`;
    const rows = out.get(key) ?? (out.set(key, {}), out.get(key)!);
    rows[family.get(Number(r.family))!] = new Array<number>(Number(r.n)).fill(UNVALUED);
    byPlot.set(Number(r.id), rows);
  }
  for (const v of db.prepare(`${centres} SELECT v.plot, v.family, v.item, v.value FROM c
      JOIN AI_CityBuild_plot_value v ON v.plot = c.id`).all()) {
    byPlot.get(Number(v.plot))![family.get(Number(v.family))!][Number(v.item)] = Number(v.value);
  }
  db.close();
  return out;
}

/** One plot evaluation as the log prints it: the plot, OWNED, and its
 *  DISTRICTS and IMPROVEMENTS rows (the log's values, -9999 unvalued) */
export interface LoggedPlot {
  x: number;
  y: number;
  owned: boolean;
  districts: number[];
  improvements: number[];
}

/** every plot evaluation of the city's first block of the turn, in the
 *  order printed (the city centre first), by `${turn}:${player}:${city}` */
export function loadCityBuildPlots(dumpPath: string): Map<string, LoggedPlot[]> {
  const out = new Map<string, LoggedPlot[]>();
  const db = openLogStore(dumpPath);
  if (!db || !hasLog(db, 'AI_CityBuild_plot')) return out;
  const family = new Map(db.prepare('SELECT id, name FROM AI_CityBuild_family').all().map((f) => [Number(f.id), String(f.name)]));
  const first = `WITH c AS (SELECT p.id, p.turn, p.player, p.city, p.x, p.y, p.seq, p.info FROM AI_CityBuild_plot p
    JOIN (SELECT min(block) AS b FROM AI_CityBuild_plot GROUP BY turn, player, city) m ON p.block = m.b)`;
  const byId = new Map<number, LoggedPlot>();
  for (const r of db.prepare(`${first} SELECT * FROM c ORDER BY id`).all()) {
    const key = `${r.turn}:${r.player}:${r.city}`;
    const p: LoggedPlot = { x: Number(r.x), y: Number(r.y), owned: String(r.info).startsWith('OWNED'), districts: [], improvements: [] };
    (out.get(key) ?? (out.set(key, []), out.get(key)!)).push(p);
    byId.set(Number(r.id), p);
  }
  for (const r of db.prepare(`${first} SELECT r.plot, r.family, r.n FROM c JOIN AI_CityBuild_plot_row r ON r.plot = c.id`).all()) {
    const p = byId.get(Number(r.plot))!;
    const f = family.get(Number(r.family));
    if (f === 'DISTRICTS') p.districts = new Array<number>(Number(r.n)).fill(UNVALUED);
    if (f === 'IMPROVEMENTS') p.improvements = new Array<number>(Number(r.n)).fill(UNVALUED);
  }
  for (const v of db.prepare(`${first} SELECT v.plot, v.family, v.item, v.value FROM c JOIN AI_CityBuild_plot_value v ON v.plot = c.id`).all()) {
    const p = byId.get(Number(v.plot))!;
    const f = family.get(Number(v.family));
    if (f === 'DISTRICTS') p.districts[Number(v.item)] = Number(v.value);
    if (f === 'IMPROVEMENTS') p.improvements[Number(v.item)] = Number(v.value);
  }
  db.close();
  return out;
}

/** A line of the city build log about a city's production: a contract's
 *  state line (0x5f4cd0), a contract queued (0x5f3710) or purchased
 *  (0x5f3c40), a Default Specialization pick or NO BUILDS */
export interface BuildLine {
  turn: number;
  player: number;
  city: string;
  kind: 'contract' | 'queued' | 'purchase' | 'pick' | 'none';
  /** the contract's id and state (a state line) */
  contract?: number;
  state?: string;
  /** the item (UNIT_ / BUILDING_ / DISTRICT_ / PROJECT_) */
  item: string;
  value?: number;
  /** the contract's tree (the tree's name) */
  tree?: string;
}

/** the city build log's production lines in log order */
export function loadBuildLines(dumpPath: string): BuildLine[] {
  const out: BuildLine[] = [];
  const db = openLogStore(dumpPath);
  if (!db || !hasLog(db, 'AI_CityBuild')) return out;
  for (const r of db.prepare(`SELECT turn, player, city, prod_adv, construct, order_source, rest FROM AI_CityBuild ORDER BY line`).all()) {
    const turn = Number(r.turn);
    const player = Number(r.player);
    const city = String(r.city);
    const pa = r.prod_adv === null ? '' : String(r.prod_adv);
    const rest = r.rest === null ? '' : String(r.rest);
    if (pa.startsWith('CONTRACT ')) {
      // CONTRACT n, STATE, unit, building, district, VALUE v, tree
      const cells = rest.split(',').map((x) => x.trim());
      const unit = String(r.order_source);
      const item = unit !== 'NO_UNIT' ? unit : cells[0] !== 'NO_BUILDING' ? cells[0] : cells[1];
      out.push({ turn, player, city, kind: 'contract', contract: Number(pa.slice(9)), state: String(r.construct), item,
        value: Number(cells[2].replace('VALUE ', '')), tree: cells.slice(3).join(',') });
      continue;
    }
    if (rest.trim().startsWith('CONTRACT ')) {
      out.push({ turn, player, city: city === 'PURCHASE' ? '' : city, kind: city === 'PURCHASE' ? 'purchase' : 'queued',
        contract: Number(rest.trim().slice(9)), item: String(r.construct), tree: String(r.order_source) });
      continue;
    }
    if (r.order_source === 'Default Specialization') {
      out.push({ turn, player, city, kind: 'pick', item: String(r.construct), value: Number(rest.split(',')[2].trim().replace('Value ', '')) });
      continue;
    }
    if (String(r.construct ?? '').startsWith('NO BUILDS AT ALL')) out.push({ turn, player, city, kind: 'none', item: '' });
  }
  db.close();
  return out;
}

/** the Default Specialization lines (0x5d4d70): `${turn}:${player}:${city}`
 *  -> the item and its value, or null for "NO BUILDS AT ALL" */
export function loadCityBuildPicks(dumpPath: string): Map<string, { item: string; value: number } | null> {
  const out = new Map<string, { item: string; value: number } | null>();
  const db = openLogStore(dumpPath);
  if (!db || !hasLog(db, 'AI_CityBuild')) return out;
  for (const r of db.prepare(`SELECT turn, player, city, construct, order_source, rest FROM AI_CityBuild
      WHERE order_source = 'Default Specialization' OR construct LIKE 'NO BUILDS AT ALL%' ORDER BY line`).all()) {
    const key = `${r.turn}:${r.player}:${r.city}`;
    out.set(key, r.order_source === 'Default Specialization'
      ? { item: String(r.construct), value: Number(String(r.rest).split(',')[2].trim().replace('Value ', '')) } : null);
  }
  db.close();
  return out;
}

/** a logged value at or below this is the log's FX(-9999) plus terms added
 *  to it (a building's free unit the AI cannot train adds its -9999) */
const NONE = -9000;

/** One family's tables against the log's: the items valued by the log, by
 *  both, within 0.005, by the log only, by us only, and the first miss */
export interface CityBuildTally {
  log: number;
  both: number;
  exact: number;
  onlyLog: number;
  onlyOurs: number;
  first?: { turn: number; player: number; item: string; log: number; ours: number };
}

export const newCityBuildTally = (): CityBuildTally => ({ log: 0, both: 0, exact: 0, onlyLog: 0, onlyOurs: 0 });

/** our BUILDINGS table (raw, database order) against the log's row */
export function tallyBuildings(t: CityBuildTally, turn: number, player: number, logged: readonly number[], ours: readonly number[],
  per?: Map<string, CityBuildTally>): void {
  tallyRow(AI_BUILDINGS.map((b) => b.type), t, turn, player, logged, ours, per);
}

/** the knowledge base's unit counts (AI_Knowledge.csv's ARMY lines: per
 *  player it knows, `UNIT_X count age`), summed over the players, by
 *  `${turn}:${player}` */
export function loadKnownUnits(dumpPath: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const db = openLogStore(dumpPath);
  if (!db || !hasLog(db, 'AI_Knowledge')) return out;
  for (const r of db.prepare(`SELECT turn, player, other, rest FROM AI_Knowledge WHERE knowledgetype = 'ARMY' ORDER BY line`).all()) {
    const k = `${r.turn}:${r.player}`;
    const m = out.get(k) ?? (out.set(k, new Map()), out.get(k)!);
    const cells = [String(r.other ?? ''), ...(r.rest === null ? [] : String(r.rest).split(','))];
    for (const cell of cells) {
      const [u, n] = cell.trim().split(' ');
      if (u?.startsWith('UNIT_')) m.set(u, (m.get(u) ?? 0) + Number(n));
    }
  }
  db.close();
  return out;
}

/** a family's table (raw, database order; null an item the port does not
 *  value, left out) against the log's row */
export function tallyRow(names: readonly string[], t: CityBuildTally, turn: number, player: number, logged: readonly number[],
  ours: readonly (number | null)[], per?: Map<string, CityBuildTally>): void {
  names.forEach((type, k) => {
    if (ours[k] === null) return;
    const g = logged[k] ?? -9999;
    const o = ours[k] === FX_MIN ? -9999 : ours[k]! / 256;
    const gv = g > NONE;
    const ov = o > NONE;
    const row = { type };
    for (const x of per ? [t, per.get(row.type) ?? (per.set(row.type, newCityBuildTally()), per.get(row.type)!)] : [t]) {
      if (gv) x.log += 1;
      if (gv && ov) {
        x.both += 1;
        if (Math.abs(g - o) < 0.0051) x.exact += 1;
        else if (!x.first) x.first = { turn, player, item: row.type, log: g, ours: Math.round(o * 1000) / 1000 };
      } else if (gv) x.onlyLog += 1;
      else if (ov) x.onlyOurs += 1;
    }
  });
}
