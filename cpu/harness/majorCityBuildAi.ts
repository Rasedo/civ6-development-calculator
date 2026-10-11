/**
 * THE MAJORS' CITY PRODUCTION IN THE ACTION REPLAY (ai/major/cityBuild.ts):
 * at each production decision of an AI major whose city stands with nothing
 * in hand in the engine, on a turn AI_CityBuild.csv logs that city's
 * Default Specialization (the game's other items come from its contracts),
 * the port's pick on the engine's city against the log's and the record's
 * new head.
 */
import { cityPick } from '../../ai/major/cityBuild';
import type { MajorViewInputs } from '../core/majorView';
import type { City, GameState } from '../core/types';
import { loadCityBuildPicks, loadKnownUnits } from './cityBuildLog';

export interface CityBuildAiTally {
  /** the logged Default Specialization picks met at an empty engine city,
   *  ours as the log's, and the record's new head as the log's */
  logged: number;
  asLog: number;
  recordAsLog: number;
  misses: string[];
}

export class CityBuildProbe {
  private readonly logPicks: Map<string, { item: string; value: number } | null>;
  private readonly known: Map<string, Map<string, number>>;
  readonly tally: CityBuildAiTally = { logged: 0, asLog: 0, recordAsLog: 0, misses: [] };

  /** `seats`: the AI majors, seat -> player id */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly inputs: (turn: number) => MajorViewInputs) {
    this.logPicks = loadCityBuildPicks(dumpPath);
    this.known = loadKnownUnits(dumpPath);
  }

  /** the port's pick for `city` (`name` the record's, LOC_CITY_NAME_ less)
   *  against the log's and the record's new head `recordType` (an install
   *  type, null for none) */
  decide(state: GameState, turn: number, city: City, name: string, recordType: string | null): void {
    const pid = this.seats.get(city.seat);
    if (pid === undefined || city.queue.length) return;
    const key = `${turn}:${pid}:LOC_CITY_NAME_${name}`;
    if (!this.logPicks.has(key)) return;
    const want = this.logPicks.get(key)?.item ?? null;
    const kb = this.known.get(`${turn}:${pid}`);
    const pick = cityPick(state, city, (u) => kb?.get(u) ?? 0, this.inputs(turn));
    const t = this.tally;
    t.logged++;
    if ((pick?.type ?? null) === want) t.asLog++;
    if (recordType === want) t.recordAsLog++;
    else if (t.misses.length < 40 && (pick?.type ?? null) !== want) {
      t.misses.push(`t${turn} p${pid} ${name}: ours ${pick ? `${pick.type} ${(pick.value / 256).toFixed(2)}` : 'none'} log ${want ?? 'none'} record ${recordType ?? 'none'}`);
    }
    if ((pick?.type ?? null) !== want && recordType === want && t.misses.length < 40) {
      t.misses.push(`t${turn} p${pid} ${name}: ours ${pick ? `${pick.type} ${(pick.value / 256).toFixed(2)}` : 'none'} log ${want ?? 'none'}`);
    }
  }
}

/** the tally as the replay report's section */
export function cityBuildAiMarkdown(t: CityBuildAiTally): string[] {
  return ['', "## The majors' AI: city production (ai/major/cityBuild.ts)", '',
    `- The Default Specialization AI_CityBuild.csv logs, met at an empty engine city: ${t.logged}; ours as the log's ${t.asLog}, the record's new head as the log's ${t.recordAsLog}.`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`)];
}
