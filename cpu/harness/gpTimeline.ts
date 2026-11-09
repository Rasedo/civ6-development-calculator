/**
 * THE GREAT PEOPLE'S TIMELINE as the game logs it beside a dump
 * (`<dump>.logs/Game_GreatPeople.csv`: "Turn, Event, GP Individual, GP Class,
 * GP Era, GP Cost, Recipient Player, Timeline Index"): each class's standing
 * person and the price its draw froze (Game_GreatPeople 0x2f94d0 -> 0x2f1c50),
 * as a record's turn opens.
 */
import { readFileSync } from 'node:fs';
import type { GameState, GreatPersonClass } from '../core/types';
import { GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import { aliasOrPrefixed } from './import';

export interface GpStanding {
  /** the individual's GreatPersonIndividualType */
  individual: string;
  cost: number;
}

interface Row {
  turn: number;
  cls: GreatPersonClass;
  standing: GpStanding | null;
}

export interface GpTimeline {
  /** each class's standing person as record `turn` holds it (null: none
   *  stands): every row logged in a turn before it (a person added in turn t stands from
   *  record t + 1; runs/h1_duelp1128 Schrodinger added t183, granted t220,
   *  his points spent in record 221) */
  at(turn: number): Map<GreatPersonClass, GpStanding | null>;
}

/** the timeline beside `dumpPath`; null without the log */
export function loadGpTimeline(dumpPath: string): GpTimeline | null {
  let text: string;
  try {
    text = readFileSync(dumpPath.replace(/\.jsonl$/, '.logs/Game_GreatPeople.csv'), 'utf8');
  } catch {
    return null;
  }
  const rows: Row[] = [];
  for (const line of text.split('\n').slice(1)) {
    const p = line.split(',').map((x) => x.trim());
    if (p.length < 6) continue;
    const cls = p[3].replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
    if (!GP_CLASSES.includes(cls)) continue;
    if (p[1] === 'Added to Present Timeline') rows.push({ turn: Number(p[0]), cls, standing: { individual: p[2], cost: Number(p[5]) } });
    else if (p[1] === 'Granted to Player') rows.push({ turn: Number(p[0]), cls, standing: null });
  }
  return {
    at(turn: number) {
      const out = new Map<GreatPersonClass, GpStanding | null>();
      // turn 1's rows are the timeline's setup, before any record
      for (const r of rows) if (r.turn < turn || r.turn <= 1) out.set(r.cls, r.standing);
      return out;
    },
  };
}

/** each class's standing person and its frozen price as record `turn`
 *  holds them, off the game's timeline log; a class the log names no one for
 *  (exhausted) offers none (-2), one it never logged waits for the engine's
 *  draw */
export function standGreatPeople(state: GameState, timeline: GpTimeline | null, turn: number): void {
  const at = timeline?.at(turn);
  if (!at) return;
  state.gpOffer = GP_CLASSES.map(() => -1);
  state.gpPrice = GP_CLASSES.map(() => 0);
  GP_CLASSES.forEach((cls, i) => {
    const s = at.get(cls);
    if (s === undefined) return;
    if (s === null) return void (state.gpOffer![i] = -2);
    const id = aliasOrPrefixed(s.individual);
    const k = GREAT_PEOPLE[cls].findIndex((p) => p.id === id);
    if (k < 0) return;
    state.gpOffer![i] = k;
    state.gpPrice![i] = s.cost;
  });
}
