/**
 * THE GAME'S CITY BUILD VALUE TABLES: AI_CityBuild.csv's PLOT ANALYSIS LOG
 * (written with the AI's verbose logs, `game.py profile apply
 * --ai-verbose`): per city each turn, per plot it evaluates — the city
 * centre first — a line `turn,player,,x y, ...` and its value rows
 * `,,,DISTRICTS|IMPROVEMENTS|BUILDINGS|UNITS|PROJECTS, v, v, ...` in database
 * order (-9999 an item it does not value). Here the city centre's BUILDINGS
 * row, against `aiCityBuild.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { FX_MIN } from '../core/aiValue';

/** the city centre's BUILDINGS values, by `${turn}:${player}:${city}` */
export function loadCityBuildTables(dumpPath: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const path = dumpPath.replace(/\.jsonl$/, '.logs/AI_CityBuild.csv');
  if (!existsSync(path)) return out;
  const text = readFileSync(path, 'utf8');
  let key: string | null = null;
  let centre = false;
  let at = 0;
  while (at < text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    const line = text.slice(at, end);
    at = end + 1;
    if (line.startsWith(',,,')) {
      if (key && centre && line.startsWith(',,,BUILDINGS,')) {
        out.set(key, line.slice(13).split(',').map((x) => x.trim()).filter(Boolean).map(Number));
      }
      continue;
    }
    if (line.includes('PLOT ANALYSIS LOG')) {
      const p = line.split(',').map((x) => x.trim());
      key = `${p[0]}:${p[1]}:${p[2]}`;
      centre = false;
      continue;
    }
    if (key && /^\d+,\d+,,\d+ \d+,/.test(line)) {
      centre = !out.has(key) && !centre;
      continue;
    }
    key = null;
  }
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
  AI_BUILDINGS.forEach((row, k) => {
    const g = logged[k] ?? -9999;
    const o = ours[k] === FX_MIN ? -9999 : ours[k] / 256;
    const gv = g > NONE;
    const ov = o > NONE;
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
