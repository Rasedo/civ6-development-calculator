/**
 * TEAM RECRUITING (Operation.cpp 0x738050 -> 0x7383d0, the minimums
 * 0x73be10, the strength 0x73c7c0; the reading is tools/civ6lab/dll_readings.md
 * "C-97: the operations").
 *
 * The player's free units (in no operation, alive), in its unit order, are
 * offered to each team in turn; a team takes from them first its
 * requirements' minimums, then, where its minimums are met or the recruit
 * goes on an operation already in progress, the strength its target asks:
 * the enemy strength about the target and the team's strength advantage
 * times the smaller of the two players' best combat strengths. The units a
 * team takes leave the offer.
 */
import { NO_PLOT, addMember, hasAiType, unitStrength, type Operation, type OpTeam } from './operation';
import type { MajorUnitView, MajorView } from '../../../ai/major/view';

export interface RecruitLog {
  (line: string): void;
}

/** one requirement's maxima for a unit that would join (0x73be10: the
 *  requirements it carries other than the one recruiting: MaxNumber, and
 *  MaxPercentage of the members with `extra` more; a requirement it lacks
 *  whose MinPercentage is 1 bars it) */
function passesOthers(team: OpTeam, unitType: string, skip: number, extra: number): boolean {
  for (let j = 0; j < team.reqs.length; j++) {
    if (j === skip) continue;
    const r = team.reqs[j];
    if (hasAiType(unitType, r.aiType)) {
      if (r.max !== null && r.max >= 0 && team.counts[j] >= r.max) return false;
      if (r.maxPercentage >= 0 && team.counts[j] + extra > (team.members.length + extra) * r.maxPercentage) return false;
    } else if (r.minPercentage > 0 && r.minPercentage === 1) return false;
  }
  return true;
}

/** The minimums (0x73be10): each requirement short of its MinNumber (or of
 *  its MinPercentage of the members) takes, of the offered units carrying its
 *  AI type that break no other requirement's maximum, all where they do not
 *  exceed the shortfall, else the shortfall's count nearest the team's rally
 *  (the first of equals). Returns whether every minimum could be met and the
 *  units taken, in the order taken (a unit may be taken for two
 *  requirements; it joins once). */
export function recruitMinimums(view: MajorView, team: OpTeam, offer: readonly MajorUnitView[], log: RecruitLog | null, opName: string): { met: boolean; taken: MajorUnitView[] } {
  if (offer.length === 0) return { met: team.ready, taken: [] };
  let met = true;
  const out: MajorUnitView[] = [];
  const members = team.members.length;
  team.reqs.forEach((r, i) => {
    let need = r.min ?? 0;
    const have = team.counts[i];
    if (have >= need) {
      if (!((members + out.length) * r.minPercentage > have)) return;
      need = Math.trunc(members * r.minPercentage);
    }
    let deficit = need - have;
    const matches = offer.filter((u) => hasAiType(u.type, r.aiType) && passesOthers(team, u.type, i, deficit));
    if (matches.length < deficit) met = false;
    if (matches.length <= deficit) {
      out.push(...matches);
      return;
    }
    const rally = team.goals[0];
    const pool = [...matches];
    while (deficit-- > 0 && pool.length) {
      let best = -1;
      let bestD = -1;
      pool.forEach((u, k) => {
        const d = rally === NO_PLOT ? 0 : view.plotDistance(u.plot, rally);
        if (bestD < 0 || d < bestD) {
          best = k;
          bestD = d;
        }
      });
      out.push(pool[best]);
      pool.splice(best, 1);
    }
  });
  if (out.length === 0) log?.(`${opName}, No recruits to reach minimum, , , `);
  for (const u of out) log?.(`${opName}, Recruiting minimums, , , ${u.type}`);
  return { met, taken: out };
}

/** The strength (0x73c7c0): while the team's strength (its members' and the
 *  units taken so far) is below the enemy strength plus the desired, the
 *  offered unit that fits a requirement and breaks no maximum — of those
 *  the last whose type has a build entry, else the nearest the rally —
 *  joins. Returns whether the strength was reached and the units taken. */
export function recruitStrength(view: MajorView, team: OpTeam, offer: readonly MajorUnitView[], taken: readonly MajorUnitView[],
  enemyStrength: number, desired: number, log: RecruitLog | null, opName: string,
  units: ReadonlyMap<number, MajorUnitView>): { reached: boolean; taken: MajorUnitView[] } {
  const target = enemyStrength + desired;
  if (target <= 0 || offer.length === 0) return { reached: true, taken: [] };
  let current = 0;
  for (const id of team.members) {
    const u = units.get(id);
    if (u) current += unitStrength(u);
  }
  for (const u of taken) current += unitStrength(u);
  const extra = taken.length;
  const eligible = offer.filter((u) => {
    let matched = false;
    for (let j = 0; j < team.reqs.length; j++) {
      const r = team.reqs[j];
      if (hasAiType(u.type, r.aiType)) {
        if (r.max !== null && r.max >= 0 && team.counts[j] >= r.max) return false;
        if (r.maxPercentage >= 0 && team.counts[j] + 1 > (team.members.length + extra + 1) * r.maxPercentage) return false;
        matched = true;
      } else if (r.minPercentage > 0 && r.minPercentage === 1) return false;
    }
    return matched;
  });
  const out: MajorUnitView[] = [];
  const rally = team.goals[0];
  while (current < Math.trunc(target) && eligible.length) {
    let best = 0;
    let bestD = -1;
    eligible.forEach((u, k) => {
      const d = rally === NO_PLOT ? 0 : view.plotDistance(u.plot, rally);
      if (bestD < 0 || d < bestD) {
        best = k;
        bestD = d;
      }
    });
    const u = eligible[best];
    current += unitStrength(u);
    out.push(u);
    eligible.splice(best, 1);
  }
  const strLine = `Enemy Str: ${Math.trunc(enemyStrength)} / ${desired.toFixed(1)}`;
  if (out.length === 0) log?.(`${opName}, No recruits to match strength, , ${strLine}, `);
  for (const u of out) log?.(`${opName}, Recruiting strength, , ${strLine}, ${u.type}`);
  return { reached: current >= Math.trunc(target), taken: out };
}

/** The strength a team asks (0x723ab0): an advantage of -5 or less asks
 *  minus the enemy strength; any other, the advantage times the smaller of
 *  the two players' best combat strengths (the operation's own where it has
 *  no enemy) */
export function desiredStrength(view: MajorView, seat: number, enemy: number, advantage: number, enemyStrength: number): number {
  if (advantage <= -5) return -enemyStrength;
  const ours = view.bestCombatStrength(seat);
  const theirs = enemy >= 0 ? view.bestCombatStrength(enemy) : ours;
  return advantage * Math.min(ours, theirs);
}

/** One recruit (0x738050): each team takes from the offer, its minimums then
 *  its strength; the units taken join it and leave the offer. Returns every
 *  unit recruited. */
export function recruitOperation(view: MajorView, seat: number, op: Operation, offer: MajorUnitView[], inProgress: boolean, range: number,
  units: ReadonlyMap<number, MajorUnitView>, log: RecruitLog | null): MajorUnitView[] {
  const all: MajorUnitView[] = [];
  for (const team of op.teams) {
    let pool = offer;
    const goal = inProgress ? team.goals[1] : team.goals[0];
    if (range > 0 && goal !== NO_PLOT) pool = pool.filter((u) => view.plotDistance(u.plot, goal) <= range);
    const mins = recruitMinimums(view, team, pool, log, op.def.name);
    let taken = dedupe(mins.taken);
    if (mins.met || inProgress) {
      const adv = inProgress ? team.def.ongoingStrengthAdvantage : team.def.initialStrengthAdvantage;
      const desired = desiredStrength(view, seat, op.enemy, adv, op.enemyStrength);
      const rest = pool.filter((u) => !taken.includes(u));
      const str = recruitStrength(view, team, rest, taken, op.enemyStrength, desired, log, op.def.name, units);
      taken = dedupe([...taken, ...str.taken]);
    }
    for (const u of taken) {
      addMember(team, u);
      all.push(u);
      const k = offer.indexOf(u);
      if (k >= 0) offer.splice(k, 1);
    }
  }
  return all;
}

const dedupe = (us: readonly MajorUnitView[]): MajorUnitView[] => us.filter((u, i) => us.indexOf(u) === i);
