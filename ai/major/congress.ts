/**
 * THE MAJORS' WORLD CONGRESS AS THE GAME'S AI VOTES IT (AI::CultureAi,
 * CultureAi.cpp; `tools/civ6lab/dll_readings.md` "C-97: the World Congress
 * AI").
 *
 * THE HINT (0x67dd40, DiplomaticSupport.cpp's handlers by the resolution's
 * AITargetChooser, registered by 0x67f160): the target an option names,
 * written into a context field — the player (+0x40), the luxury (+0x4c), the
 * yield (+0x64), the government (+0x28), the great person class (+0x6c), the
 * Great Work object (+0x30), the city-state bonus (+0x3c), the religion
 * (+0x48), the promotion class (+0x58), the district (+0x1c), the project
 * (+0x68); the feature handler writes its row's hash (+0x20), the
 * operation's (+0x54) and the power building's (+4) fields no chooser reads.
 * A resolution with no chooser (Arms Control) has no hint.
 *
 * THE EVALUATION (0x622140, the CultureAi job, per resolution of the
 * session): each option's value (0x7b3be0) — 0 where its handler finds no
 * hint, else its ResolutionEffects modifiers summed (0x7a4b20) in a context
 * of the player as the other player (+0x40) and the hint, from turn 0 to a
 * 30-turn horizon at the AI's discount rate; the outcome the owner's
 * Resolutions lists name (the player's +0x348: favoured A, disfavoured B)
 * with that option's value the desire; else the better option, A on a tie,
 * its value the desire.
 *
 * THE VOTES (0x628450, the session's handler): the owner's favor F; the
 * resolutions a list names first, then by desire, the highest first
 * (0x61dc50) — its cast order; each takes the votes it wants — the whole of
 * half its desire where F covers every resolution's half-desire votes, else
 * the votes F x desire / (the sum of the positive desires) buys — held to
 * the votes F's remainder buys and at least one, and F pays them
 * (`voteCost`, `votesFor`).
 *
 * THE TARGET (0x611140 .. 0x612e50): the hint of the outcome taken (the
 * handler run on a context whose player is none), the first field set in
 * 0x628450's order, where the resolution offers it the seat
 * (`congressTargets`); else target -1: the engine's "Random congress
 * resolution target" draw over them (`drawTargets`).
 */
import { AI_DISTRICTS, AI_GOVERNMENTS, AI_POLICIES, AI_PROJECTS, AI_PROMOTION_CLASSES, AI_RESOLUTIONS, AI_RESOLUTION_AGENDA_TRAITS,
  AI_RESOLUTION_LEADER_TRAITS, AI_RESOLUTION_LISTS, AI_RESOLUTION_LISTS_BY_STRATEGY, AI_RESOLUTION_LISTS_BY_TRAIT, AI_SLOT_TYPES, AI_STRATEGIES } from './tables';
import type { AiResolution } from './types';
import type { MajorView } from './view';
import { policyObsolete, policyScore } from './policies';
import { AI_RATE, FX } from '../../cpu/core/aiValue';
import { modifiersValue } from '../../cpu/core/aiModifiers';
import { voteCost, votesFor } from '../../cpu/core/congress';
import { congressEngineTarget } from '../../cpu/core/congressTargets';
import { AI_BUILDINGS } from '../../cpu/data/aiBuildTables';
import { CONGRESS_TARGET_TABLES } from '../../cpu/data/congressTargets';

/** the option values' horizon (0x622140: 0x1e) */
const CONGRESS_HORIZON = 30;
/** DIPLOMACY_ADJACENT_EMPIRE_RANGE / _CITIES_REQUIRED (GlobalParameters;
 *  the game's globals +0x264 / +0x260, read by 0x3ce840) */
const ADJACENT_RANGE = 10;
const ADJACENT_CITIES = 2;

/** one resolution's evaluation: the outcome (1 = A, 2 = B), its desire raw
 *  24.8, whether a list names it */
export interface ResolutionEval { type: string; outcome: 1 | 2; desire: number; listed: boolean; values: [number, number] }

/** a handler's context fields (the install's types; the player and the
 *  religion as seats); `ok` its result */
export interface CongressHint {
  ok: boolean;
  other?: number;
  district?: string;
  feature?: boolean;
  government?: string;
  gpClass?: string;
  gwObject?: string;
  minorBonus?: string;
  religion?: number;
  resource?: string;
  yieldType?: string;
  promotion?: string;
  project?: string;
  spyOperation?: boolean;
  building?: boolean;
}

/** the first entry with the most (`max`) or the least of `score`, among
 *  those `keep` admits, scores compared strictly against `start` */
function firstBest<T>(items: readonly T[], score: (x: T) => number, max: boolean, start: number,
                      keep: (x: T) => boolean = () => true): T | null {
  let best = start;
  let at: T | null = null;
  for (const x of items) {
    if (!keep(x)) continue;
    const v = score(x);
    if (max ? v > best : v < best) {
      best = v;
      at = x;
    }
  }
  return at;
}

/** 0x3ce840: `a` holds ADJACENT_CITIES cities or more with a city of `b`
 *  within ADJACENT_RANGE plots */
function adjacentEmpire(view: MajorView, a: number, b: number): boolean {
  const cities = view.mapCities();
  const theirs = cities.filter((c) => c.owner === b);
  let n = 0;
  for (const c of cities) {
    if (c.owner === a && theirs.some((d) => view.plotDistance(c.plot, d.plot) <= ADJACENT_RANGE)) n++;
  }
  return n >= ADJACENT_CITIES;
}

const GP_CLASSES = CONGRESS_TARGET_TABLES.WC_RES_PATRONAGE.entries.map((e) => e.type);
const GW_OBJECTS = CONGRESS_TARGET_TABLES.WC_RES_HERITAGE_ORG.entries.map((e) => e.type);
const MINOR_BONUSES = CONGRESS_TARGET_TABLES.WC_RES_SOVEREIGNTY.entries.map((e) => e.type);
const LUXURIES = CONGRESS_TARGET_TABLES.WC_RES_LUXURY.entries.map((e) => e.type);
const UNIT_YIELDS = CONGRESS_TARGET_TABLES.WC_RES_MERCENARY_COMPANIES.entries.map((e) => e.type);

/**
 * THE HINT of `chooser` for `option` (0x67dd40's handler), on a context
 * whose player is `other0` (the seat in an option's value, none in the
 * vote's target).
 */
export function congressHint(view: MajorView, seat: number, chooser: string | null, option: 1 | 2, other0: number | undefined): CongressHint {
  const majors = view.majors();
  const others = majors.filter((m) => m !== seat);
  const met = (m: number) => view.metTurn(seat, m) !== null;
  const h: CongressHint = { ok: false, other: other0 };
  switch (chooser) {
    // 0x682fb0: the alive majors met, the value 0x3ffaf0 sums of each (its
    // list unread: 0 here) — A the last not at war at or above the best, B
    // the last not allied at or below it; none: no player
    case 'TradingPartners': {
      h.other = undefined;
      for (const m of others) {
        if (!met(m)) continue;
        if (option === 1 ? view.atWar(seat, m) : view.allied(seat, m)) continue;
        h.other = m;
      }
      h.ok = h.other !== undefined;
      return h;
    }
    // 0x682220: A the player; B the met major with the most diplomatic
    // victory points (the first at a tie)
    case 'PlayerOrDiploLeader': {
      if (option === 1) return { ok: true, other: seat };
      const lead = firstBest(others.filter(met), (m) => view.diplomaticPoints(m), true, -1);
      return { ok: true, other: lead ?? other0 };
    }
    // 0x67c640: A the player; B the last major met whose empire is not
    // adjacent to the player's (0x3ce840)
    case 'BorderControlTarget': {
      if (option === 1) return { ok: true, other: seat };
      for (const m of others) if (met(m) && !adjacentEmpire(view, seat, m)) h.other = m;
      h.ok = true;
      return h;
    }
    // 0x67f040: A the alive major at war with the player or denounced by
    // it that it holds the most grievances against (above 0); B the player
    case 'GrievancesType': {
      if (option === 2) return { ok: true, other: seat };
      const m = firstBest(others, (x) => view.grievances(seat, x), true, 0, (x) => view.atWar(seat, x) || view.denouncing(seat, x));
      // the field keeps the context's player where none qualifies
      return { ok: (m ?? other0) !== undefined, other: m ?? other0 };
    }
    // 0x6810a0 (a city losing Loyalty: its loyalty a turn below 0; housing
    // to spare: Housing above its citizens + 1): A the player where none of
    // its cities loses Loyalty and more than half have housing to spare,
    // else the ally or declared friend with the most cities with housing
    // to spare less 3 x those losing Loyalty; B the player where one of its
    // cities loses Loyalty, else the ally or friend with the most such
    case 'MigrationTarget': {
      const losing = (m: number) => view.cities(m).filter((c) => view.cityLoyaltyPerTurn(m, c.id) < 0).length;
      const spare = (m: number) => view.cities(m).filter((c) => view.cityHousing(m, c.id) > view.cityCitizens(m, c.id) + 1).length;
      const friend = (m: number) => view.allied(seat, m) || view.declaredFriends(seat, m);
      if (option === 1) {
        if (losing(seat) < 1 && 2 * spare(seat) > view.cities(seat).length) return { ok: true, other: seat };
        const m = firstBest(others, (x) => spare(x) - 3 * losing(x), true, -10000, friend);
        return { ok: true, other: m ?? other0 };
      }
      if (losing(seat) > 0) return { ok: true, other: seat };
      const m = firstBest(others, losing, true, -10000, friend);
      return { ok: true, other: m ?? other0 };
    }
    // 0x681940: A the luxury the player holds the most copies of (above 0,
    // 0x4aa790); B among those it holds none of, the one the other alive
    // majors not allied hold the most of
    case 'MostCommonLuxury': {
      const r = option === 1
        ? firstBest(LUXURIES, (x) => view.resourceHeld(seat, x), true, 0)
        : firstBest(LUXURIES, (x) => others.filter((m) => !view.allied(seat, m)).reduce((a, m) => a + view.resourceHeld(m, x), 0), true, -1,
          (x) => view.resourceHeld(seat, x) === 0);
      return { ok: true, other: other0, resource: r ?? undefined };
    }
    // 0x683120: Production (the yield the player makes a turn), Gold and
    // Faith (its rates): A the least, B the most, the first at a tie
    case 'UnitBuildYield': {
      const y = firstBest(UNIT_YIELDS, (x) => view.playerYield(seat, x), option === 2, option === 2 ? -Infinity : Infinity);
      return { ok: y !== null, other: other0, yieldType: y ?? undefined };
    }
    // 0x67e3d0: A the player's government; B the government the other
    // majors not allied hold most (2 a major at war, 1 else), its own left
    // out, the first at a tie
    case 'Government': {
      const mine = view.government(seat);
      if (option === 1) return { ok: mine !== null, other: other0, government: mine ?? undefined };
      const count = (g: string) => others.filter((m) => !view.allied(seat, m) && view.government(m) === g && g !== mine)
        .reduce((a, m) => a + (view.atWar(seat, m) ? 2 : 1), 0);
      const g = firstBest(AI_GOVERNMENTS.map((x) => x.type), count, true, -1);
      return { ok: true, other: other0, government: g ?? undefined };
    }
    // 0x67e730: A the available class the player leads most by points over
    // another major (a class it leads every major in first); B where some
    // other major not allied holds more points and earns more a turn in a
    // class with a person offered, the class the nearest such major (at war
    // first) needs the fewest points to recruit in
    case 'GreatPersonPatronage': {
      const avail = GP_CLASSES.filter((c) => view.greatPersonClassAvailable(c));
      if (option === 1) {
        let best = 0, bestLead = false;
        let at: string | undefined;
        for (const c of avail) {
          const mine = view.greatPersonPoints(seat, c);
          let most = 0, lead = true;
          for (const m of others) {
            const d = mine - view.greatPersonPoints(m, c);
            most = Math.max(most, d);
            if (d < 0) lead = false;
          }
          if (most > best || (lead && !bestLead)) {
            best = most;
            bestLead = lead;
            at = c;
          }
        }
        return { ok: at !== undefined, other: other0, gpClass: at };
      }
      let war: string | undefined, peace: string | undefined;
      let warNeed = 0, peaceNeed = 0;
      for (const c of avail) {
        if (!view.greatPersonOffered(c)) continue;
        const rivals = others.filter((m) => !view.allied(seat, m));
        const ahead = rivals.some((m) => view.greatPersonPoints(m, c) > view.greatPersonPoints(seat, c));
        const faster = rivals.some((m) => view.greatPersonPointsPerTurn(m, c) > view.greatPersonPointsPerTurn(seat, c));
        if (!ahead || !faster) continue;
        for (const m of rivals) {
          const need = view.greatPersonPrice(c) - view.greatPersonPoints(m, c);
          if (view.atWar(seat, m)) {
            if (war === undefined || need < warNeed) { war = c; warNeed = need; }
          } else if (peace === undefined || need < peaceNeed) { peace = c; peaceNeed = need; }
        }
      }
      const c = war ?? peace;
      return { ok: c !== undefined, other: other0, gpClass: c };
    }
    // 0x67ed10: the player's Great Works by object type: A the most, B the
    // least, the first at a tie
    case 'GreatWorkObjects': {
      const n = view.greatWorksByObject(seat);
      const o = option === 1 ? firstBest(GW_OBJECTS, (_x) => n[GW_OBJECTS.indexOf(_x)] ?? 0, true, -1)
        : firstBest(GW_OBJECTS, (_x) => n[GW_OBJECTS.indexOf(_x)] ?? 0, false, 0x7fffffff);
      return { ok: o !== null, other: other0, gwObject: o ?? undefined };
    }
    // 0x6813a0: per city-state bonus type the city-states of it — the
    // player's suzerainties (A) or the others' (B); the type with the most
    // of those above 0, else the type with the most city-states
    case 'MinorCivBonus': {
      const all = new Map<string, number>(), some = new Map<string, number>();
      for (const cs of view.cityStateSeats()) {
        const t = view.cityStateBonus(cs);
        if (!t) continue;
        all.set(t, (all.get(t) ?? 0) + 1);
        const mine = view.suzerain(cs) === seat;
        if (option === 1 ? mine : !mine) some.set(t, (some.get(t) ?? 0) + 1);
      }
      const top = firstBest(MINOR_BONUSES, (x) => some.get(x) ?? 0, true, -1);
      const t = top !== null && (some.get(top) ?? 0) > 0 ? top : firstBest(MINOR_BONUSES, (x) => all.get(x) ?? 0, true, -1);
      return { ok: true, other: other0, minorBonus: t ?? undefined };
    }
    // 0x682c00: A the religion the player founded; B the other founder's
    // with the most cities following it
    case 'ReligiousTarget': {
      if (option === 1) {
        const r = view.religionFounded(seat);
        return { ok: r !== null, other: other0, religion: r !== null ? seat : undefined };
      }
      const m = firstBest(others.filter((x) => view.religionFounded(x) !== null), (x) => view.religionFollowers(x), true, 0);
      return { ok: m !== null, other: other0, religion: m ?? undefined };
    }
    // 0x6832f0: per promotion class the units of it the player knows — its
    // own, less those of the majors at war with it; A the most, B the least
    case 'UnitPromotionType': {
      const n = new Map<string, number>();
      const add = (units: readonly { type: string }[], k: number) => {
        for (const u of units) {
          const c = view.unitPromotionClass(u.type);
          if (c) n.set(c, (n.get(c) ?? 0) + k);
        }
      };
      add(view.units(seat), 1);
      for (const m of others) if (view.atWar(seat, m)) add(view.knownUnits(seat, m), -1);
      const c = option === 1 ? firstBest(AI_PROMOTION_CLASSES, (x) => n.get(x) ?? 0, true, -Infinity)
        : firstBest(AI_PROMOTION_CLASSES, (x) => n.get(x) ?? 0, false, Infinity);
      return { ok: c !== null, other: other0, promotion: c ?? undefined };
    }
    // 0x67cce0: per base district (no TraitType, not InternalOnly) its
    // buildings the player's cities may construct, 1 each for the City
    // Center's, 6 each else; A the most above 0, B the least
    case 'District': {
      const score = new Map<string, number>();
      for (const c of view.cities(seat)) {
        const can = view.cityBuildable(seat, c.id);
        for (const b of AI_BUILDINGS) {
          if (!b.district || !can.has(b.type)) continue;
          const d = AI_DISTRICTS.find((x) => x.type === b.district);
          score.set(b.district, (score.get(b.district) ?? 0) + (d?.cityCenter ? 1 : 6));
        }
      }
      const base = AI_DISTRICTS.filter((x) => x.base).map((x) => x.type);
      const d = option === 1 ? firstBest(AI_DISTRICTS.map((x) => x.type), (x) => score.get(x) ?? 0, true, 0)
        : firstBest(base, (x) => score.get(x) ?? 0, false, 0x7fffffff);
      return { ok: d !== null, other: other0, district: d ?? undefined };
    }
    // 0x67db60 writes its feature's hash; 0x682f80 the operation; 0x682440
    // the power building — fields no chooser reads
    case 'FeatureType': return { ok: true, other: other0, feature: true };
    case 'SpyOperationType': return { ok: true, other: other0, spyOperation: true };
    case 'PowerBuilding': return { ok: true, other: other0, building: true };
    // 0x6826d0, by the victory strategies the player follows (0x7004c0):
    // A, pursuing the technology victory, the costliest space race project
    // one of its cities may advance, else, pursuing conquest, the costliest
    // WMD one; B, not pursuing the technology victory, the costliest space
    // race project another major's city may advance, else, not pursuing
    // conquest, the costliest WMD one
    case 'Project': {
      const pursued = (victory: string) => AI_STRATEGIES.some((x) => x.victory === victory && view.strategies(seat).has(x.type));
      const tech = pursued('VICTORY_TECHNOLOGY');
      const conquest = pursued('VICTORY_CONQUEST');
      const costliest = (space: boolean, owners: readonly number[]) => {
        let best = 0;
        let at: string | undefined;
        for (const p of AI_PROJECTS) {
          if (!(space ? p.spaceRace : p.wmd) || p.cost <= best) continue;
          if (owners.some((m) => view.cities(m).some((c) => view.cityCanProject(m, c.id, p.type)))) {
            at = p.type;
            best = p.cost;
          }
        }
        return at;
      };
      const project = option === 1
        ? (tech ? costliest(true, [seat]) : conquest ? costliest(false, [seat]) : undefined)
        : (!tech ? costliest(true, others) : !conquest ? costliest(false, others) : undefined);
      return { ok: project !== undefined, other: other0, project };
    }
    default: return h;
  }
}

/** the owner's Resolutions lists' word on a resolution: 1 favoured, -1
 *  disfavoured, 0 none (the lists of its leader's traits, its agendas'
 *  traits and the strategies it follows) */
export function resolutionPreference(view: MajorView, seat: number, agendas: readonly string[], type: string): number {
  const traits = [...(AI_RESOLUTION_LEADER_TRAITS[view.leaderType(seat) ?? ''] ?? []),
    ...agendas.flatMap((a) => AI_RESOLUTION_AGENDA_TRAITS[a] ?? [])];
  const lists = [...traits.flatMap((t) => AI_RESOLUTION_LISTS_BY_TRAIT[t] ?? []),
    ...[...view.strategies(seat)].flatMap((s) => AI_RESOLUTION_LISTS_BY_STRATEGY[s] ?? [])];
  let p = 0;
  for (const l of lists) for (const it of AI_RESOLUTION_LISTS[l] ?? []) if (it.resolution === type) p = it.favored ? 1 : -1;
  return p;
}

/** the policy AI's best card for a slot type (0x6a3870's loop): neither
 *  obsolete nor active, its civic held, of the slot (any for the
 *  Wildcard), the greatest score (0x623b90), null for none */
function bestPolicy(view: MajorView, seat: number, slot: string): number | null {
  const any = AI_SLOT_TYPES.find((x) => x.type === slot)?.any ?? false;
  const active = new Set(view.slots(seat).map((x) => x.policy).filter((x): x is string => !!x));
  const held = view.civicsHeld(seat);
  let best: number | null = null;
  for (const p of AI_POLICIES) {
    if (policyObsolete(view, seat, p) || active.has(p.type) || (p.civic && !held.has(p.civic))) continue;
    if (!any && p.slot !== slot) continue;
    const v = policyScore(view, seat, p);
    if (best === null || v > best) best = v;
  }
  return best;
}

/** an option's value (0x7b3be0): 0 where its handler finds no hint, else its
 *  modifiers summed to the horizon in the hint's context */
export function optionValue(view: MajorView, seat: number, r: AiResolution, option: 1 | 2): number {
  const hint = congressHint(view, seat, r.chooser, option, seat);
  if (!hint.ok) return 0;
  return modifiersValue({
    view, seat, start: 0, horizon: CONGRESS_HORIZON, rate: AI_RATE, other: hint.other, resource: hint.resource,
    yieldType: hint.yieldType, government: hint.government, gpClass: hint.gpClass, project: hint.project,
    bestPolicy: (slot) => bestPolicy(view, seat, slot),
  }, r.effects[option - 1] ?? []);
}

/** THE EVALUATION (0x622140) of the session's resolutions */
export function evaluateResolutions(view: MajorView, seat: number, agendas: readonly string[],
                                    types: readonly string[]): ResolutionEval[] {
  return types.map((type) => {
    const r = AI_RESOLUTIONS.find((x) => x.type === type);
    const v1 = r ? optionValue(view, seat, r, 1) : 0;
    const v2 = r ? optionValue(view, seat, r, 2) : 0;
    const pref = resolutionPreference(view, seat, agendas, type);
    if (pref > 0) return { type, outcome: 1, desire: v1, listed: true, values: [v1, v2] };
    if (pref < 0) return { type, outcome: 2, desire: v2, listed: true, values: [v1, v2] };
    return v1 < v2 ? { type, outcome: 2, desire: v2, listed: false, values: [v1, v2] }
      : { type, outcome: 1, desire: v1, listed: false, values: [v1, v2] };
  });
}

/** the cast order (0x61dc50): the listed first, then by desire, the highest
 *  first */
export function castOrder(evals: readonly ResolutionEval[]): ResolutionEval[] {
  return [...evals].sort((a, b) => (a.listed !== b.listed ? (a.listed ? -1 : 1) : b.desire - a.desire));
}

/** THE VOTES (0x628450): each resolution's votes, by type, from the owner's
 *  favor `favor` (whole) */
export function allocateVotes(evals: readonly ResolutionEval[], favor: number): Map<string, number> {
  const order = castOrder(evals);
  const half = (d: number): number => Math.trunc((d >> 8) / 2);
  const totalCost = Math.max(1, order.reduce((s, e) => s + voteCost(half(e.desire)), 0));
  const sumPos = Math.max(FX, order.reduce((s, e) => s + Math.max(e.desire, 0), 0));
  const over = totalCost > favor;
  // the favor per point of desire, x 100, 24.8 (0x16e940)
  const ratio = Math.trunc((favor * 100 * FX * FX) / sumPos);
  const out = new Map<string, number>();
  let left = favor;
  for (const e of order) {
    const cap = Math.max(votesFor(Math.max(left, 0)), 0);
    const want = over ? votesFor(Math.trunc((ratio * e.desire) / (100 * FX)) >> 8) : (Math.trunc((e.desire * FX) / (2 * FX)) >> 8);
    const n = Math.max(1, Math.min(want, cap));
    out.set(e.type, n);
    left -= voteCost(n);
  }
  return out;
}

/** the target of a hint (0x628450's field order), the engine's index of the
 *  resolution's TargetKind, -1 for none */
function hintTarget(kind: string | null, h: CongressHint): number {
  const as = (type: string | undefined) => (type && kind ? congressEngineTarget(kind, type) : -1);
  if (h.district) return as(h.district);
  if (h.feature) return -1;
  if (h.government) return as(h.government);
  if (h.gpClass) return as(h.gpClass);
  if (h.gwObject) return as(h.gwObject);
  if (h.minorBonus) return as(h.minorBonus);
  if (h.other !== undefined) return h.other;
  if (h.project) return as(h.project);
  if (h.religion !== undefined) return h.religion;
  if (h.resource) return as(h.resource);
  if (h.yieldType) return as(h.yieldType);
  if (h.promotion) return as(h.promotion);
  return -1;
}

/** THE OWNER'S BALLOT for the session's resolutions (`slate`: the slot, the
 *  engine's resolution index — -1 for the Diplomatic Victory one — and the
 *  install type): [the outcome (0 = A, 1 = B), the target (-1: the engine's
 *  draw), the extra votes, the cast order] per slot, as the record's `vote`
 *  carries it */
export function congressBallot(view: MajorView, seat: number, agendas: readonly string[],
                               slate: readonly { slot: number; index: number; type: string }[]): {
  vote: ([number, number, number, number] | null)[]; evals: ResolutionEval[]; votes: Map<string, number>; targets: number[] } {
  const evals = evaluateResolutions(view, seat, agendas, slate.map((s) => s.type));
  const votes = allocateVotes(evals, Math.floor(view.favor(seat)));
  const order = castOrder(evals);
  const vote: ([number, number, number, number] | null)[] = [];
  const targets: number[] = [];
  slate.forEach((s, k) => {
    const e = evals[k];
    const r = AI_RESOLUTIONS.find((x) => x.type === s.type);
    const hint = congressHint(view, seat, r?.chooser ?? null, e.outcome, undefined);
    const t = hintTarget(r?.targetKind ?? null, hint);
    const valid = s.index >= 0 ? view.congressTargets(seat, s.index) : view.congressTargetsOf(seat, s.type);
    const target = t >= 0 && valid.includes(t) ? t : -1;
    targets.push(target);
    vote[s.slot] = [e.outcome - 1, target, (votes.get(s.type) ?? 1) - 1, order.indexOf(e)];
  });
  for (let i = 0; i < vote.length; i++) vote[i] ??= null;
  return { vote, evals, votes, targets };
}
