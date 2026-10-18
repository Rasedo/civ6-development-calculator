/**
 * THE OPERATION CANDIDATES AND THEIR EVALUATION (AI/MilitaryAI: the
 * candidates 0x722d70, the "Op Evaluation" job 0x746920 over the target
 * walk 0x747230, the knowledge base's army strength 0x5eadb0; the reading is
 * tools/civ6lab/dll_readings.md "C-97: the operations").
 *
 * Each turn of an AI major the manager lists its candidates: one per running
 * operation (its own definition and enemy, its target as the fixed rally, its
 * teams' strength as the fixed strength of ours), then one per allowed
 * definition against no enemy. A candidate walks its definition's targets;
 * against each target each rally plot is weighed: the distance limits of the
 * definition (the same region, else the same area, else the world), the odds
 * (ours against the enemy strength about the target, the two best combat
 * strengths, the distance) above MinOddsOfSuccess, and the best value times
 * odds, the later of equals. A candidate with a target is valid; the manager
 * logs its value.
 */
import { NO_PLOT, type Operation } from './operation';
import type { AiOpDef, OpsSettle } from './types';
import { cityValue } from './cityValue';
import type { KnownUnit } from './knowledge';
import type { MajorKnownCityView, MajorView } from '../../../ai/major/view';

/** one candidate (the 0x70-byte entries at manager +0x328) */
export interface Candidate {
  def: AiOpDef;
  enemy: number;
  /** a running operation's: its target as the rally, its teams' strength,
   *  its id; NO_PLOT / null / -1 for a new one */
  presetRally: number;
  presetStrength: number | null;
  op: Operation | null;
  valid: boolean;
  /** the odds (float) and the target's value (24.8) of the chosen target */
  odds: number;
  value: number;
  target: number;
  rally: number;
}

/** a float as the game's 24.8 fixed point: the whole part << 8 and the
 *  fraction's 256ths in the low byte */
export function fixed(f: number): number {
  const w = Math.floor(f);
  return (w << 8) | (Math.trunc(Math.fround(Math.fround(f - w) * 256)) & 0xff);
}

/** a unit as the army strength reads it */
export type ArmyUnit = Pick<KnownUnit, 'plot' | 'combat' | 'ranged' | 'damage'>;

/** the strength of a player's units the seat knows within `radius` of a plot
 *  (0x5eadb0 over the knowledge base's army lists 0x5ef760): each unit its
 *  larger of combat and ranged strength, less its damage x
 *  COMBAT_WOUNDED_DAMAGE_MULTIPLIER (10) x -0.01 cut toward 0; a unit whose
 *  larger strength is below `minStrength` left out */
export function armyStrength(view: MajorView, units: readonly ArmyUnit[], plot: number, radius: number, minStrength = -Infinity): number {
  let s = 0;
  for (const u of units) {
    if (view.plotDistance(u.plot, plot) > radius || Math.max(u.combat, u.ranged) < minStrength) continue;
    s += Math.max(u.combat, u.ranged) + Math.trunc(Math.fround(u.damage * 10 * Math.fround(-0.01)));
  }
  return s;
}

/** the odds of a rally against a target (0x746920): with a = (ours - the
 *  enemy's) over the smaller of the two best combat strengths (1 against no
 *  enemy), min(0.9, (a + 1) x 0.5) x 0.97 ^ (max(0, theirs - ours) + the
 *  distance x 0.75 cut toward 0); against an enemy the two best combat
 *  strengths bound it: theirs above ours caps it at 1 - their lead x 0.75 /
 *  25, ours above theirs raises it to min(1, our lead x 0.75 / 25) */
export function oddsOf(ours: number, enemyStr: number, dist: number, bestOurs: number, bestTheirs: number | null): number {
  const f = Math.fround;
  const mine = Math.max(1, bestOurs);
  const theirs = bestTheirs === null ? 1 : Math.max(1, bestTheirs);
  const base = Math.min(f(0.9), f(f(f(f(ours - enemyStr) / Math.min(mine, theirs)) + 1) * 0.5));
  const e = Math.max(0, enemyStr - ours) - Math.trunc(f(dist * f(-0.75)));
  let odds = f(f(Math.pow(f(0.97), e)) * base);
  if (bestTheirs === null) return odds;
  if (theirs > mine) return Math.min(f(1 - f(f((theirs - mine) * 0.75) / 25)), odds);
  const lead = f(f((mine - theirs) * 0.75) / 25);
  const v = lead < 1 ? lead : 1;
  if (odds < v) odds = v;
  return odds;
}

/** one target of a definition's walk: its plot, value (24.8) and the enemy
 *  strength about it */
interface Target {
  plot: number;
  value: number;
  enemyStr: number;
}

/** the targets of a candidate's definition (0x747230), in the walk's order */
function targetsOf(view: MajorView, seat: number, c: Candidate, inputs: EvalInputs): Target[] {
  const { def } = c;
  switch (def.targetType) {
    // the best settle site but the running operation's target, its score's
    // whole part (0x6fe2b0) the value, above 0
    case 'TARGET_SETTLE_LOCATION': {
      const best = inputs.settle?.best(c.op ? c.op.target : -1) ?? null;
      const whole = best ? best.score >> 8 : 0;
      return best && whole > 0 ? [{ plot: best.plot, value: whole << 8, enemyStr: 0 }] : [];
    }
    // of the seat's coastal cities the most populous (the first of equals),
    // the first sea plot (not a Lake) of the ring walk within 4 of it; the
    // enemy strength the largest best combat strength of the majors
    case 'TARGET_NAVAL_SUPERIORITY': {
      let best = 0;
      let at = NO_PLOT;
      const plots = view.plots();
      for (const city of view.cityPlots(seat)) {
        const pop = view.cityPopulation(city);
        if (pop <= best || !plots[city].coastal) continue;
        const sea = view.plotsRing(city, 4).find((p) => plots[p].water && !plots[p].lake);
        if (sea === undefined) continue;
        best = pop;
        at = sea;
      }
      if (at === NO_PLOT) return [];
      const str = view.majors().reduce((m, p) => Math.max(m, view.bestCombatStrength(p)), 0);
      return [{ plot: at, value: 100 << 8, enemyStr: str }];
    }
    // each camp the seat knows, valued 50 a known camp; the enemy strength 6,
    // and for a seat not the barbarians' with no enemy named the barbarians'
    // units within 3 of it (0x7476f9..0x747745)
    case 'TARGET_BARBARIAN_CAMP': {
      const camps = inputs.camps;
      const barb = view.barbarianSeat();
      const army = seat !== barb && c.enemy < 0;
      return camps.map((p) => ({ plot: p, value: (camps.length * 50) << 8,
        enemyStr: Math.trunc(6 + (army ? armyStrength(view, inputs.army(barb), p, 3) : 0)) }));
    }
    // the seat's cities (TargetParameter 0), valued 0
    case 'TARGET_FRIENDLY_CITY':
      if (def.targetParameter > 0) return [];
      return view.cityPlots(seat).map((p) => ({ plot: p, value: 0, enemyStr: 0 }));
    case 'TARGET_ENEMY_COMBAT_DISTRICT':
    case 'TARGET_ENEMY_PASSIVE_DISTRICT':
      return enemyCities(view, seat, c, inputs);
    default:
      return [];
  }
}

/** the enemy's cities as targets (0x747230's district branch): each city of
 *  the enemy the seat knows — with TargetParameter 0 one whose districts'
 *  defenses and walls (0x5eb600) are no more than its districts, no walls
 *  standing — but the running operation's target and any running
 *  operation's (0x724dd0); valued by the city value (0x79fef0); the enemy's
 *  known units within 3 its strength where the seat's best combat strength
 *  passes the enemy's by more than 30, else none; above the definition's
 *  MaxTargetDefense (where it has one) left out */
function enemyCities(view: MajorView, seat: number, c: Candidate, inputs: EvalInputs): Target[] {
  const { def } = c;
  const cities = inputs.known();
  const outclassed = view.bestCombatStrength(c.enemy) + 30 < view.bestCombatStrength(seat);
  const out: Target[] = [];
  for (const k of cities) {
    if (k.owner !== c.enemy) continue;
    if (def.targetParameter === 0) {
      const marks = k.districts.reduce((n, d) => n + (d.defense > 0 ? 1 : 0) + (d.walls > 0 ? 1 : 0), 0);
      if (marks > k.districts.length) continue;
    }
    if (c.op && c.op.target === k.plot) continue;
    if (inputs.taken.has(k.plot)) continue;
    const enemyStr = outclassed ? armyStrength(view, inputs.army(c.enemy), k.plot, 3, 0) : 0;
    if (def.maxTargetDefense >= 0 && enemyStr > def.maxTargetDefense) continue;
    out.push({ plot: k.plot, value: cityValue(view, seat, k, cities, inputs.army), enemyStr });
  }
  return out;
}

/** a target's distance limit from a rally (0x746920): MaxTargetDistInRegion
 *  in the same region, InArea in the same area, else InWorld; -1 none */
function distLimit(view: MajorView, def: AiOpDef, rally: number, target: number): number {
  const plots = view.plots();
  if (plots[rally].area !== plots[target].area) return def.maxTargetDistInWorld;
  return plots[rally].region === plots[target].region ? def.maxTargetDistInRegion : def.maxTargetDistInArea;
}

/** the 24.8 product (0x16e7d0) */
const mul = (a: number, b: number): number => Math.trunc((a * b) / 256);

/** what an evaluation reads beside the view: the seat's settling AI, the
 *  targets the running operations hold (0x724dd0) and the cities the
 *  knowledge base held when the evaluation ran */
export interface EvalInputs {
  settle: OpsSettle | null;
  taken: ReadonlySet<number>;
  /** the camps the knowledge base holds */
  camps: readonly number[];
  known(): readonly MajorKnownCityView[];
  /** a player's army as the knowledge base holds it (the seat's own: its
   *  units) */
  army: (player: number) => readonly ArmyUnit[];
}

/** evaluate a candidate (0x746920): its target, rally, odds and value */
export function evaluate(view: MajorView, seat: number, c: Candidate, rallies: readonly number[], inputs: EvalInputs): void {
  const { def } = c;
  c.valid = false;
  c.target = NO_PLOT;
  c.rally = NO_PLOT;
  c.odds = -1;
  c.value = 0;
  if (def.mustBeAtWar && (c.enemy < 0 || !view.atWar(seat, c.enemy))) return;
  if (def.mustHaveNukes) return;
  const bestOurs = view.bestCombatStrength(seat);
  const bestTheirs = c.enemy >= 0 ? view.bestCombatStrength(c.enemy) : null;
  for (const t of targetsOf(view, seat, c, inputs)) {
    if (c.enemy >= 0 && t.value <= 0) continue;
    const from = c.presetRally !== NO_PLOT ? [c.presetRally] : rallies;
    for (const rally of from) {
      const d = view.plotDistance(rally, t.plot);
      if (d === 0 && def.targetType !== 'TARGET_FRIENDLY_CITY') continue;
      const limit = distLimit(view, def, rally, t.plot);
      if (limit >= 0 && d > limit) continue;
      const ours = c.presetStrength ?? armyStrength(view, inputs.army(seat), rally, 10);
      const odds = oddsOf(ours, t.enemyStr, d, bestOurs, bestTheirs);
      if (def.minOddsOfSuccess > 0 && !(odds > def.minOddsOfSuccess)) continue;
      if (c.target !== NO_PLOT && mul(fixed(odds), t.value) < mul(c.value, fixed(c.odds))) continue;
      c.target = t.plot;
      c.rally = rally;
      c.odds = odds;
      c.value = t.value;
      c.valid = true;
    }
  }
}
