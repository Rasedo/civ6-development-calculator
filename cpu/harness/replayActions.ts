/**
 * THE REPLAY'S DECISIONS: what the recorded players chose between two
 * consecutive records, as engine-neutral orders the replay's applier
 * (`replay.ts`) hands to the engine. Every order names the game's own ids
 * (player ids, catalog indices, plot indices, `${owner}:${id}` unit keys), so
 * a source reads the record and nothing of the engine.
 *
 * Two sources share the `ActionSource` interface:
 *   - `InferredActions` reads the difference of the two snapshots;
 *   - `RecordedActions` reads the record's own event log (`actions`) for the
 *     kinds of order it names outright, and takes the inference's for the
 *     rest.
 *
 * When an order lands: the records are read in the turn of one player (the
 * record's active player). Its actions of turn t come after record t and
 * before its own start of turn t+1, so its orders land BEFORE the engine's
 * turn (`phase: 'before'`). Every other player starts turn t after record t
 * and then acts, so its orders land AFTER the engine's turn (`'after'`), and
 * record t+1 shows them already taken. A government or card set lands inside
 * the engine's turn whichever player's it is (`replay.ts`, `stagePolicies`).
 */
import { hexDistance } from '../../world/hex';
import { UNITS } from '../data/units';
import { gameHash } from './aliases';
import { bool, num, plotAt, P, type Catalog, type DumpCity, type DumpPlayer, type DumpQueueEntry, type TurnRecord } from './record';

export type Phase = 'before' | 'after';

/** one queued item, as the game names it */
export interface QueueSpec {
  kind: 'building' | 'unit' | 'district' | 'project';
  /** the catalog index in the kind's list (`buildings` holds the wonders) */
  row: number;
  /** a district's or a wonder's plot, -1 otherwise */
  plot: number;
  formation?: number;
}

interface Base { phase: Phase }

export type Decision = Base & (
  | { kind: 'queue'; player: number; city: number; items: QueueSpec[] }
  | { kind: 'research'; player: number; tech: number }
  | { kind: 'civic'; player: number; civic: number }
  | { kind: 'policies'; player: number; government: number; policies: number[] }
  | { kind: 'found'; player: number; plot: number; unit?: string }
  | { kind: 'buyPlot'; player: number; city: number; plot: number }
  | { kind: 'buyBuilding'; player: number; city: number; building: number; currency: 'gold' | 'faith' }
  | { kind: 'buyUnit'; player: number; city: number; type: number; unit: string; currency: 'gold' | 'faith' }
  /** `unit`: the unit that laid it (the log's acting unit of its owner), where named */
  | { kind: 'improve'; player: number; plot: number; improvement: number; unit?: string }
  /** a feature or resource taken off a plot; `unit`: the unit the log names
   *  starting the removal or harvest there */
  | { kind: 'clear'; player: number; plot: number; what: 'feature' | 'resource'; unit?: string }
  /** a Builder's charge spent on the wonder its plot holds (`UnitChargesChanged`
   *  down, standing on a wonder under construction) */
  | { kind: 'wonderCharge'; player: number; unit: string; plot: number }
  /** a city-state's army levied: its units leave it and come back the
   *  major's on their plots (`UnitRemovedFromMap` then `UnitAddedToMap`),
   *  each record key old → new */
  | { kind: 'levy'; player: number; minor: number; units: [string, string][] }
  /** a levy's end: the city-state's units home, each the major's unit and
   *  the minor's id the game gives it */
  | { kind: 'levyEnd'; player: number; units: [string, string][] }
  /** a great person's activation (`UnitGreatPersonActivated`) on the plot
   *  the log's steps had it on, the catalog's individual it names; a
   *  Prophet's founding is `religion`'s */
  | { kind: 'gpActivate'; player: number; unit: string; plot: number; individual: number }
  | { kind: 'worked'; player: number; city: number; plots: number[];
      /** each plot's lock rank (`Tile.lockRank`), all 0 when absent */
      ranks?: number[] }
  | { kind: 'envoy'; player: number; minor: number; n: number }
  | { kind: 'pantheon'; player: number; belief: number }
  | { kind: 'religion'; player: number }
  | { kind: 'governors'; player: number }
  | { kind: 'war'; player: number; other: number; war: boolean }
  | { kind: 'routes'; player: number }
  /** `path`: the plots the log's `UnitMoved` steps entered, in order */
  | { kind: 'move'; player: number; unit: string; plot: number; path?: number[] }
  | { kind: 'unitNew'; player: number; unit: string; type: number; plot: number; why: 'trained' | 'other' }
  | { kind: 'unitGone'; player: number; unit: string; why: 'founded' | 'consumed' | 'lost' }
  | { kind: 'capture'; player: number; city: number }
  | { kind: 'congress' }
  | { kind: 'combat'; player: number; unit: string; hp: number }
  /** a hit the log names that no battle of the pair holds (a city's shot, a
   *  strike whose shooter the log does not name): the damage it dealt */
  | { kind: 'hit'; player: number; unit: string; dmg: number }
  /** a battle the log names, in the attacker's player's turn: melee
   *  (`UnitDamageChanged` on the defender, then on the attacker) or ranged
   *  (the defender's alone, struck by the actor's unit last activated): the
   *  two units, the plots they stood on as the log's steps had them, and the
   *  battle's place among its player's hits of the pair (its "Unit Combat
   *  Damage" draws, `battle`). A city's shot (`strike`: the city's centre and
   *  the plot it fired from, its centre or its Encampment) has no attacker
   *  unit; a unit's melee attack on a city (its centre or Encampment at
   *  `at`) has no defender unit. */
  | { kind: 'battle'; player: number; attacker: string; defender: string; from: number; at: number;
      ranged: boolean; seq: number; dmg: [number, number]; strike?: { city: number; origin: number };
      /** the hit's place in the log (its row's sequence number) */
      ord: number }
  /** a unit killed in combat (`UnitKilledInCombat`): the killer's player and
   *  type (-1 a city's shot or unknown), the victim's player and type */
  | { kind: 'kill'; player: number; killerType: number; victim: number; victimType: number; victimUnit: string }
  /** a promotion the player picked (`UnitPromoted`): the unit, the catalog's
   *  `unitPromotions` index, the experience the unit held at record t */
  | { kind: 'promote'; player: number; unit: string; promotion: number; xp: number }
  /** a unit upgraded (`UnitUpgraded`): the game removes the unit and adds its
   *  upgrade under a new id */
  | { kind: 'upgrade'; player: number; unit: string; into: string }
  | { kind: 'camp'; player: number; plot: number; unit: string }
  /** a unit's pillage (`UnitOperationStarted` UNITOPERATION_PILLAGE): the
   *  plot it wrecked, the log's next `ImprovementChanged` */
  | { kind: 'pillage'; player: number; unit: string; plot: number }
  | { kind: 'village'; player: number; plot: number; gold: number; faith: number; techBoosts: number[]; civicBoosts: number[];
      /** the city a citizen the village gave joined, -1 none */
      popCity: number;
      /** the unit that entered (`GoodyHutReward`'s unit), where the log names it */
      unit?: string }
);

export type DecisionKind = Decision['kind'];

export interface ActionSource {
  /** the orders taken between `a` (turn t) and `b` (turn t+1) */
  decisions(a: TurnRecord, b: TurnRecord, cat: Catalog): Decision[];
}

/** the player whose turn the record was read in */
export function activePlayer(rec: TurnRecord): number {
  return rec.players.find((p) => bool(p.turnActive))?.id ?? num(rec.head.localPlayer);
}

const centreOf = (c: DumpCity, W: number) => c.y * W + c.x;
const unitKey = (u: { owner: number; id: number }) => `${u.owner}:${u.id}`;

/** a game queue entry as a `QueueSpec`, null for an entry naming nothing */
export function queueSpec(e: DumpQueueEntry | string, W: number): QueueSpec | null {
  if (typeof e !== 'object' || e === null) return null;
  const plot = e.Location && e.Location.x >= 0 ? e.Location.y * W + e.Location.x : -1;
  if (e.UnitType !== undefined) {
    const f = num(e.MilitaryFormationType);
    return { kind: 'unit', row: e.UnitType, plot: -1, ...(f > 0 ? { formation: f } : {}) };
  }
  if (e.BuildingType !== undefined) return { kind: 'building', row: e.BuildingType, plot };
  if (e.DistrictType !== undefined) return { kind: 'district', row: e.DistrictType, plot };
  if (e.ProjectType !== undefined) return { kind: 'project', row: e.ProjectType, plot: -1 };
  return null;
}

export const specKey = (s: QueueSpec) => `${s.kind}:${s.row}:${s.plot}:${s.formation ?? 0}`;

/** has the item a city's queue headed at `a` come out of the city by `b`:
 *  the building or wonder standing, the district complete, a unit of its type
 *  new beside the city, the project gone from the queue */
export function headCompleted(a: TurnRecord, b: TurnRecord, c0: DumpCity, c1: DumpCity | undefined): boolean {
  const head = queueSpec(c0.queue[0], a.head.W);
  if (!head || !c1) return false;
  const W = a.head.W;
  if (head.kind === 'building') return c1.buildings.some(([bi]) => bi === head.row) && !c0.buildings.some(([bi]) => bi === head.row);
  if (head.kind === 'district') {
    return c1.districts.some((d) => d[0] === head.row && d[3] === true) && !c0.districts.some((d) => d[0] === head.row && d[3] === true);
  }
  if (head.kind === 'unit') {
    const before = new Set(a.units.map(unitKey));
    const at = centreOf(c1, W);
    return b.units.some((u) => u.owner === c1.owner && u.type === head.row && !before.has(unitKey(u))
      && near(b, u.y * W + u.x, at, 3));
  }
  return !c1.queue.some((e) => {
    const s = queueSpec(e, W);
    return !!s && specKey(s) === specKey(head);
  });
}

function near(rec: TurnRecord, p: number, q: number, d: number): boolean {
  const W = rec.head.W;
  const shape = { width: W, height: rec.head.H, wrapX: bool(rec.head.wrapX) };
  return hexDistance(shape, p % W, Math.floor(p / W), q % W, Math.floor(q / W)) <= d;
}

/** the queue a player's step of turn t+1 builds from: a non-active player's
 *  is what record t+1 shows (it picked after its start of turn t); the active
 *  player's is what it left after its actions of turn t — record t+1's queue,
 *  behind the item its start of turn t+1 completed */
function stepQueue(a: TurnRecord, b: TurnRecord, c0: DumpCity | undefined, c1: DumpCity, active: boolean): QueueSpec[] {
  const W = b.head.W;
  const now = c1.queue.map((e) => queueSpec(e, W)).filter((s): s is QueueSpec => !!s);
  if (!active || !c0) return now;
  const head = queueSpec(c0.queue[0], W);
  if (head && headCompleted(a, b, c0, c1)) return [head, ...now.filter((s) => specKey(s) !== specKey(head))];
  return now;
}

/** the indices set in `b`'s bit string and not in `a`'s */
function newBits(a: string | undefined, b: string | undefined): number[] {
  return [...(b ?? '')].flatMap((ch, k) => (ch === '1' && (a ?? '')[k] !== '1' ? [k] : []));
}

/** the research a player's step of turn t+1 runs on (`stepQueue`'s rule) */
function stepPick(p0: DumpPlayer, p1: DumpPlayer, field: 'researching' | 'civic', bits: 'techs' | 'civics', active: boolean): number {
  const was = num(p0[field]);
  if (active && was >= 0 && String(p1[bits] ?? '')[was] === '1' && String(p0[bits] ?? '')[was] !== '1') return was;
  return num(p1[field]);
}

/**
 * THE INFERENCE: every order the difference of two records shows.
 */
export class InferredActions implements ActionSource {
  decisions(a: TurnRecord, b: TurnRecord, cat: Catalog): Decision[] {
    const out: Decision[] = [];
    const W = b.head.W;
    const act = activePlayer(a);
    const phaseOf = (pid: number): Phase => (pid === act ? 'before' : 'after');
    const before = new Map(a.cities.map((c) => [`${c.owner}:${c.id}`, c]));
    const byCentre0 = new Map(a.cities.map((c) => [centreOf(c, W), c]));
    const players0 = new Map(a.players.map((p) => [p.id, p]));
    const units0 = new Map(a.units.map((u) => [unitKey(u), u]));
    const units1 = new Map(b.units.map((u) => [unitKey(u), u]));
    const settlerIdx = cat.units.indexOf('UNIT_SETTLER');

    // cities founded and taken
    const founded = new Map<number, string | undefined>();
    for (const c1 of b.cities) {
      const at = centreOf(c1, W);
      const was = byCentre0.get(at);
      if (was && was.owner === c1.owner) continue;
      if (was) {
        out.push({ kind: 'capture', phase: phaseOf(c1.owner), player: c1.owner, city: at });
        continue;
      }
      // the founding Settler: the owner's, gone by t+1, nearest the plot
      let unit: string | undefined;
      let best = Infinity;
      for (const u of a.units) {
        if (u.owner !== c1.owner || u.type !== settlerIdx || units1.has(unitKey(u))) continue;
          const d = hexDistance({ width: W, height: b.head.H, wrapX: bool(b.head.wrapX) }, u.x, u.y, c1.x, c1.y);
        if (d < best) [best, unit] = [d, unitKey(u)];
      }
      if (unit) founded.set(at, unit);
      out.push({ kind: 'found', phase: phaseOf(c1.owner), player: c1.owner, plot: at, ...(unit ? { unit } : {}) });
    }

    // the seats: research, civics, government and cards, pantheon, religion,
    // governors, wars, envoys, routes
    for (const p1 of b.players) {
      const p0 = players0.get(p1.id);
      if (!p0) continue;
      const ph = phaseOf(p1.id);
      const active = p1.id === act;
      if (bool(p1.major)) {
        const tech = stepPick(p0, p1, 'researching', 'techs', active);
        if (tech >= 0) out.push({ kind: 'research', phase: ph, player: p1.id, tech });
        const civic = stepPick(p0, p1, 'civic', 'civics', active);
        if (civic >= 0) out.push({ kind: 'civic', phase: ph, player: p1.id, civic });
        const cards = (p: DumpPlayer) => (p.policies ?? []).map(num).filter((i) => i >= 0).sort((x, y) => x - y);
        if (num(p0.government) !== num(p1.government) || cards(p0).join() !== cards(p1).join()) {
          out.push({ kind: 'policies', phase: ph, player: p1.id, government: num(p1.government), policies: cards(p1) });
        }
        if (!(num(p0.pantheon) >= 0) && num(p1.pantheon) >= 0) {
          out.push({ kind: 'pantheon', phase: ph, player: p1.id, belief: num(p1.pantheon) });
        }
        if (JSON.stringify(p0.governors ?? []) !== JSON.stringify(p1.governors ?? [])) {
          out.push({ kind: 'governors', phase: ph, player: p1.id });
        }
      }
      const wars0 = new Set(p0.wars ?? []);
      const wars1 = new Set(p1.wars ?? []);
      for (const o of wars1) if (!wars0.has(o) && p1.id < o) out.push({ kind: 'war', phase: ph, player: p1.id, other: o, war: true });
      for (const o of wars0) if (!wars1.has(o) && p1.id < o) out.push({ kind: 'war', phase: ph, player: p1.id, other: o, war: false });
      if (bool(p1.minor)) {
        const got0 = new Map((p0.envoysReceived ?? []).map(([g, n]) => [g, n]));
        for (const [giver, n] of p1.envoysReceived ?? []) {
          const d = n - (got0.get(giver) ?? 0);
          if (d > 0) out.push({ kind: 'envoy', phase: phaseOf(giver), player: giver, minor: p1.id, n: d });
        }
      }
    }
    const rel = (r: TurnRecord) => new Map((Array.isArray(r.religions) ? r.religions : []).map((x) => [x.Founder, JSON.stringify(x.Beliefs)]));
    const rel0 = rel(a);
    for (const [founder, beliefs] of rel(b)) {
      if (rel0.get(founder) !== beliefs) out.push({ kind: 'religion', phase: phaseOf(founder), player: founder });
    }
    const routes = (r: TurnRecord) => {
      const m = new Map<number, string>();
      for (const c of r.cities) {
        const rows = Array.isArray(c.routes) ? c.routes : [];
        m.set(c.owner, (m.get(c.owner) ?? '') + rows.map((x) => `${x.OriginCityID}>${x.DestinationCityPlayer}:${x.DestinationCityID}`).join(','));
      }
      return m;
    };
    const r0 = routes(a);
    for (const [owner, s] of routes(b)) if ((r0.get(owner) ?? '') !== s) out.push({ kind: 'routes', phase: phaseOf(owner), player: owner });
    if (JSON.stringify(a.congress ?? null) !== JSON.stringify(b.congress ?? null)) out.push({ kind: 'congress', phase: 'after' });

    // what each purse paid out across the pair beyond the turn's income
    const spent = (pid: number, field: 'gold' | 'faith') => {
      const p0 = players0.get(pid);
      const p1 = b.players.find((q) => q.id === pid);
      if (!p0 || !p1) return 0;
      return num(p0[field]) + num(p0[field === 'gold' ? 'goldYield' : 'faithYield']) - num(p1[field]);
    };
    const goldFell = (pid: number) => spent(pid, 'gold') > 0.5;
    const faithFell = (pid: number) => spent(pid, 'faith') > 0.5;
    /** the currency a unit new beside a city was bought with: the purse that
     *  paid at least the price record t quotes there, null for none */
    const boughtWith = (owner: number, centre: number, type: number): 'gold' | 'faith' | null => {
      const c0 = byCentre0.get(centre);
      const row = c0?.buy.find((x) => x[0] === 'U' && x[1] === type);
      if (!row) return null;
      if (num(row[3]) > 0 && spent(owner, 'gold') >= num(row[3]) - 1) return 'gold';
      if (num(row[4]) > 0 && spent(owner, 'faith') >= num(row[4]) - 1) return 'faith';
      return null;
    };

    // the cities: queues, citizens, plots and buildings bought
    for (const c1 of b.cities) {
      const c0 = before.get(`${c1.owner}:${c1.id}`);
      const at = centreOf(c1, W);
      const ph = phaseOf(c1.owner);
      const active = c1.owner === act;
      const isMajor = b.players.find((p) => p.id === c1.owner)?.major === true;
      const queue = stepQueue(a, b, c0, c1, active);
      if (isMajor) out.push({ kind: 'queue', phase: ph, player: c1.owner, city: at, items: queue });
      // the citizens the step works: the plots both records work, then, where
      // the city's size moved, the plots record t+1 adds ahead of the ones it
      // leaves, else the other way round. A citizen the city's growth gave is
      // placed as it grows, before its border box banks (runs/h1_duelw1117
      // Rome t19: the new citizen on the Culture plot 894, the box read with
      // it; Xi'an t22: the Settler's citizen off 562, the regrown one on
      // 563); a citizen moved with the size standing moved after the turn's
      // yields (Rome t25: 894 to 806 with plot 850 claimed, the box and the
      // Production read 894; 1118 Rome t28: 627 to 495 as the Water Mill
      // completed, the growth read 627)
      const w0 = c0 ? c0.worked : c1.worked;
      const both = c1.worked.filter((q) => w0.includes(q));
      const added = c1.worked.filter((q) => !w0.includes(q));
      const left = w0.filter((q) => !c1.worked.includes(q));
      const groups = c0 && c0.pop !== c1.pop ? [both, added, left] : [both, left, added];
      out.push({ kind: 'worked', phase: 'before', player: c1.owner, city: at, plots: groups.flat(),
        ranks: groups.flatMap((g, i) => g.map(() => i)) });
      // and after the turn the city works what record t+1 shows
      out.push({ kind: 'worked', phase: 'after', player: c1.owner, city: at, plots: [...c1.worked] });
      if (!c0) continue;
      // plots bought: gained with gold spent, but the one the box paid for
      const had = new Set(c0.plots);
      const gained = c1.plots.filter((q) => !had.has(q));
      const boxPaid = num(c1.culture) < num(c0.culture) - 0.01;
      if (gained.length && goldFell(c1.owner)) {
        for (const q of gained) {
          if (boxPaid && q === num(c0.nextPlot)) continue;
          out.push({ kind: 'buyPlot', phase: ph, player: c1.owner, city: at, plot: q });
        }
      }
      // buildings new across the pair that no production step completed
      const heads = new Set([queueSpec(c0.queue[0], W), queue[0]].filter((s): s is QueueSpec => !!s && s.kind === 'building').map((s) => s.row));
      const had0 = new Set(c0.buildings.map(([bi]) => bi));
      for (const [bi] of c1.buildings) {
        if (had0.has(bi) || heads.has(bi) || cat.wonders.includes(cat.buildings[bi])) continue;
        const currency = faithFell(c1.owner) && !goldFell(c1.owner) ? 'faith' : 'gold';
        out.push({ kind: 'buyBuilding', phase: ph, player: c1.owner, city: at, building: bi, currency });
      }
    }

    // the units: new ones (trained, bought or granted), gone ones, moves
    const heads0 = new Map<number, Set<number>>();
    for (const c0 of a.cities) {
      const h = queueSpec(c0.queue[0], W);
      const c1 = b.cities.find((c) => c.owner === c0.owner && c.id === c0.id);
      const h1 = c1 ? queueSpec(c1.queue[0], W) : null;
      for (const s of [h, h1]) {
        if (s?.kind !== 'unit') continue;
        if (!heads0.has(c0.owner)) heads0.set(c0.owner, new Set());
        heads0.get(c0.owner)!.add(s.row);
      }
    }
    const cityCentres = (pid: number) => b.cities.filter((c) => c.owner === pid).map((c) => centreOf(c, W));
    for (const u of b.units) {
      const k = unitKey(u);
      const plot = u.y * W + u.x;
      const was = units0.get(k);
      if (was) {
        if (was.x !== u.x || was.y !== u.y) out.push({ kind: 'move', phase: phaseOf(u.owner), player: u.owner, unit: k, plot });
        // damage taken across the pair: a fight (or a disaster) no order of
        // the record names
        if (num(u.damage) > num(was.damage)) out.push({ kind: 'combat', phase: 'after', player: u.owner, unit: k, hp: 100 - num(u.damage) });
        continue;
      }
      // a new unit already wounded fought the turn it came (runs/h1_duelw1118
      // China's Scout, 31 damage in the record that first lists it)
      if (num(u.damage) > 0) out.push({ kind: 'combat', phase: 'after', player: u.owner, unit: k, hp: 100 - num(u.damage) });
      const near1 = cityCentres(u.owner).filter((cc) => near(b, plot, cc, 3));
      if (heads0.get(u.owner)?.has(u.type) && near1.length) {
        out.push({ kind: 'unitNew', phase: 'after', player: u.owner, unit: k, type: u.type, plot, why: 'trained' });
        continue;
      }
      const home = near1.find((cc) => cc === plot) ?? near1[0];
      const currency = home === undefined ? null : boughtWith(u.owner, home, u.type);
      if (home !== undefined && currency) {
        out.push({ kind: 'buyUnit', phase: phaseOf(u.owner), player: u.owner, city: home, type: u.type, unit: k, currency });
        continue;
      }
      out.push({ kind: 'unitNew', phase: 'after', player: u.owner, unit: k, type: u.type, plot, why: 'other' });
    }
    const foundedBy = new Set(founded.values());
    for (const u of a.units) {
      const k = unitKey(u);
      if (units1.has(k)) continue;
      const why = foundedBy.has(k) ? 'founded' : num(u.buildCharges) > 0 || num(u.spreadCharges) > 0 ? 'consumed' : 'lost';
      out.push({ kind: 'unitGone', phase: phaseOf(u.owner), player: u.owner, unit: k, why });
    }

    // the barbarian camps cleared: the unit standing on the plot, a major's or
    // a city-state's (runs/h1_duelw1124 t20: a city-state's unit cleared 624)
    const camp = cat.improvements.indexOf('IMPROVEMENT_BARBARIAN_CAMP');
    for (let i = 0; camp >= 0 && i < W * b.head.H; i++) {
      if (plotAt(a, i)[P.improvement] !== camp || plotAt(b, i)[P.improvement] === camp) continue;
      const by = b.units.find((u) => u.y * W + u.x === i && b.players.some((p) => p.id === u.owner && (bool(p.major) || bool(p.minor))));
      if (by) out.push({ kind: 'camp', phase: phaseOf(by.owner), player: by.owner, plot: i, unit: unitKey(by) });
    }

    // the tribal villages entered: the major whose unit stands nearest the
    // plot within its moves; what the village paid in Gold and Faith is the
    // purse's rise past the turn's income
    const hut = cat.improvements.indexOf('IMPROVEMENT_GOODY_HUT');
    /** the player's city nearest the plot that gained a citizen with its food
     *  box running on (not grown out of it), -1 none */
    const grewOutside = (pid: number, at: number): number => {
      let best = -1;
      let bd = Infinity;
      for (const c1 of b.cities) {
        const c0 = before.get(`${c1.owner}:${c1.id}`);
        if (c1.owner !== pid || !c0 || c1.pop !== c0.pop + 1 || num(c1.food) < num(c0.food)) continue;
        const d = hexDistance({ width: W, height: b.head.H, wrapX: bool(b.head.wrapX) }, at % W, Math.floor(at / W), c1.x, c1.y);
        if (d < bd) [bd, best] = [d, centreOf(c1, W)];
      }
      return best;
    };
    const shape = { width: W, height: b.head.H, wrapX: bool(b.head.wrapX) };
    const majors = new Set(b.players.filter((p) => bool(p.major)).map((p) => p.id));
    for (let i = 0; hut >= 0 && i < W * b.head.H; i++) {
      if (plotAt(a, i)[P.improvement] !== hut || plotAt(b, i)[P.improvement] === hut) continue;
      let by: number | undefined;
      let best = Infinity;
      for (const u of [...b.units, ...a.units.filter((x) => !units1.has(unitKey(x)))]) {
        if (!majors.has(u.owner)) continue;
        const dd = hexDistance(shape, i % W, Math.floor(i / W), u.x, u.y);
        if (dd < best && dd <= num(u.maxMoves)) [best, by] = [dd, u.owner];
      }
      if (by === undefined) continue;
      const p0 = players0.get(by)!;
      const p1 = b.players.find((q) => q.id === by)!;
      const rise = (now: number, was: number, inc: number) => Math.max(0, Math.round(now - was - inc));
      out.push({ kind: 'village', phase: phaseOf(by), player: by, plot: i, gold: rise(num(p1.gold), num(p0.gold), num(p0.goldYield)),
        faith: rise(num(p1.faith), num(p0.faith), num(p0.faithYield)),
        techBoosts: newBits(p0.techBoosts, p1.techBoosts), civicBoosts: newBits(p0.civicBoosts, p1.civicBoosts),
        popCity: grewOutside(by, i) });
    }

    // the plots: improvements laid, features and resources taken off
    const H = b.head.H;
    for (let i = 0; i < W * H; i++) {
      const p0 = plotAt(a, i);
      const p1 = plotAt(b, i);
      const owner = p1[P.owner] as number;
      if (owner < 0) continue;
      const imp1 = p1[P.improvement] as number;
      if (imp1 >= 0 && imp1 !== p0[P.improvement] && !/GOODY|BARBARIAN/.test(cat.improvements[imp1] ?? '')) {
        out.push({ kind: 'improve', phase: phaseOf(owner), player: owner, plot: i, improvement: imp1 });
      }
      if ((p1[P.district] as number) >= 0 || (p1[P.wonder] as number) >= 0) continue;
      if ((p0[P.feature] as number) >= 0 && (p1[P.feature] as number) < 0) {
        out.push({ kind: 'clear', phase: phaseOf(owner), player: owner, plot: i, what: 'feature' });
      }
      if ((p0[P.resource] as number) >= 0 && (p1[P.resource] as number) < 0
        && cat.features[p1[P.feature] as number] !== 'FEATURE_VOLCANIC_SOIL') {
        out.push({ kind: 'clear', phase: phaseOf(owner), player: owner, plot: i, what: 'resource' });
      }
    }
    return out;
  }
}


/** one recorded game event, as the recorder logs it: [seq, turn, the
 *  `Events` name, ...the handler's arguments] (`tools/civ6lab/h1/h1_actions.lua`) */
export type ActionRow = [number, number, string, ...unknown[]];

/** how far the log settles one kind of decision: the decisions it names, the
 *  ones the inference names, and the ones both name alike */
export interface LogTally {
  log: number;
  inferred: number;
  agree: number;
  /** the first pairs where the two differ: [turn, the log's, the inference's] */
  differ: [number, Decision | null, Decision | null][];
}

/** the game's `CityMadePurchase` purchase type: the hash of its kind's name */
const PURCHASE_UNIT = gameHash('UNIT');
/** a unit set to carry out an order (`UnitActivityChanged`); ACTIVITY_AWAKE
 *  marks one done with it (runs/h1_duelw1121 t25: a barbarian Horseman's
 *  move ended, then the Horse Archer set acting before it shot; over the
 *  CombatLogs of 1119-1128 the last unit set acting names the shooter 310
 *  times where the last activity of any kind does, once) */
const ACTIVITY_OPERATION = gameHash('ACTIVITY_OPERATION');
const OP_REMOVE_FEATURE = gameHash('UNITOPERATION_REMOVE_FEATURE');
const OP_HARVEST = gameHash('UNITOPERATION_HARVEST_RESOURCE');
const OP_FOUND_RELIGION = gameHash('UNITOPERATION_FOUND_RELIGION');
const PURCHASE_BUILDING = gameHash('BUILDING');
const PURCHASE_PLOT = gameHash('PLOT');
/** the game's `UnitOperationStarted` operation: the hash of its row's name */
const UNITOPERATION_PILLAGE = gameHash('UNITOPERATION_PILLAGE');
/** the game's `CityProductionChanged` / `CityProductionCompleted` kinds */
const PRODUCTION_KIND = ['unit', 'building', 'district', 'project'] as const;
/** the events a reader takes */
const READ_EVENTS = new Set(['CityAddedToMap', 'CityProductionCompleted', 'CityMadePurchase', 'ImprovementAddedToMap', 'PantheonFounded',
  'ResearchChanged', 'CivicChanged', 'CityProductionChanged', 'UnitAddedToMap', 'UnitKilledInCombat', 'UnitMoved', 'UnitPromoted', 'UnitRemovedFromMap', 'UnitUpgraded', 'UnitChargesChanged', 'GoodyHutReward']);

/** the decisions of the kinds the log settles, keyed for the comparison */
type Keyed = Map<string, Decision>;

/**
 * THE RECORDED ACTIONS: the decisions the record's own event log (`actions`)
 * names outright, in place of the inference's for those kinds; every other
 * kind comes from the inference (`InferredActions`). The log settles:
 *   - `found`: `CityAddedToMap` (owner, city, x, y);
 *   - where a new unit came from (`unitNew` / `buyUnit`): `UnitAddedToMap`
 *     with a `CityMadePurchase` of its type (bought), a `CityProductionCompleted`
 *     of its type (trained), or neither (granted);
 *   - `buyBuilding` and `buyPlot`: `CityMadePurchase` of a building or a plot;
 *   - `improve`: `ImprovementAddedToMap` (x, y, type, owner);
 *   - `pantheon`: `PantheonFounded` (player, belief);
 *   - `kill`: `UnitKilledInCombat` (victim player, victim id, killer player,
 *     killer id), the types off the records' units;
 *   - the active player's `research` and `civic` where the record holds no pick:
 *     its last `ResearchChanged` / `CivicChanged`; its queues' head: its last
 *     `CityProductionChanged` of the turn per city (a pick its start of turn
 *     then completed leaves no trace in the record).
 * The currency of a purchase is not in the event: it is the purse that paid
 * the record's price. Events no reader takes are counted in `unread`, and per
 * kind `settled` compares the log's decisions with the inference's.
 */
export class RecordedActions implements ActionSource {
  readonly unread = new Map<string, number>();
  readonly settled = new Map<string, LogTally>();
  constructor(private readonly inference: ActionSource = new InferredActions()) {}

  decisions(a: TurnRecord, b: TurnRecord, cat: Catalog): Decision[] {
    const rows = (b as TurnRecord & { actions?: unknown }).actions;
    let inferred = this.inference.decisions(a, b, cat);
    if (!Array.isArray(rows)) return inferred;
    const W = b.head.W;
    const act = activePlayer(a);
    const phaseOf = (pid: number): Phase => (pid === act ? 'before' : 'after');
    const ev = (rows as unknown[]).filter((r): r is ActionRow => Array.isArray(r) && typeof r[2] === 'string');
    const n = (r: ActionRow, k: number) => (typeof r[3 + k] === 'number' ? r[3 + k] as number : NaN);
    const cityPlot = (owner: number, id: number) => {
      const c = b.cities.find((x) => x.owner === owner && x.id === id) ?? a.cities.find((x) => x.owner === owner && x.id === id);
      return c ? centreOf(c, W) : -1;
    };
    const players0 = new Map(a.players.map((p) => [p.id, p]));
    const spent = (pid: number, field: 'gold' | 'faith') => {
      const p0 = players0.get(pid);
      const p1 = b.players.find((q) => q.id === pid);
      if (!p0 || !p1) return 0;
      return num(p0[field]) + num(p0[field === 'gold' ? 'goldYield' : 'faithYield']) - num(p1[field]);
    };
    /** the purse that paid at least the price record t quotes for the row */
    const currencyOf = (owner: number, centre: number, kind: 'U' | 'B', idx: number): 'gold' | 'faith' => {
      const row = a.cities.find((c) => centreOf(c, W) === centre)?.buy.find((x) => x[0] === kind && x[1] === idx);
      if (row && num(row[4]) > 0 && spent(owner, 'faith') >= num(row[4]) - 1 && !(num(row[3]) > 0 && spent(owner, 'gold') >= num(row[3]) - 1)) return 'faith';
      return 'gold';
    };

    const log = new Map<string, Keyed>();
    const out0: Decision[] = [];
    const paths = new Map<string, number[]>();
    let removed: string | null = null;
    const put = (kind: string, key: string, d: Decision) => {
      if (!log.has(kind)) log.set(kind, new Map());
      log.get(kind)!.set(key, d);
    };
    const units1 = new Map(b.units.map((u) => [unitKey(u), u]));
    const completed = new Set<string>();
    // each player's unit the log last set acting: the one an improvement laid
    // next is its work
    const acting = new Map<number, string>();
    // where each unit stands as the log's steps move it, and the unit each
    // feature removal or harvest the log names was made by: its owner's
    // unit starting the operation on the plot
    const stand = new Map(a.units.map((u) => [unitKey(u), u.y * W + u.x]));
    const clearer = new Map<string, string>();
    // each unit's last operation the log started
    const lastOp = new Map<string, number>();
    for (const r of ev) {
      const name = r[2];
      if (name === 'UnitActivityChanged') acting.set(n(r, 0), `${n(r, 0)}:${n(r, 1)}`);
      if (name === 'UnitMoved' || name === 'UnitTeleported') stand.set(`${n(r, 0)}:${n(r, 1)}`, n(r, 3) * W + n(r, 2));
      if (name === 'UnitGreatPersonActivated') {
        const k = `${n(r, 0)}:${n(r, 1)}`;
        const at = stand.get(k);
        if (at !== undefined && lastOp.get(k) !== OP_FOUND_RELIGION) {
          out0.push({ kind: 'gpActivate', phase: phaseOf(n(r, 0)), player: n(r, 0), unit: k, plot: at, individual: n(r, 3) });
        }
      }
      if (name === 'UnitOperationStarted') lastOp.set(`${n(r, 0)}:${n(r, 1)}`, n(r, 2));
      if (name === 'UnitOperationStarted' && (n(r, 2) === OP_REMOVE_FEATURE || n(r, 2) === OP_HARVEST)) {
        const k = `${n(r, 0)}:${n(r, 1)}`;
        const at = stand.get(k);
        if (at !== undefined) clearer.set(`${n(r, 0)}:${at}:${n(r, 2) === OP_REMOVE_FEATURE ? 'feature' : 'resource'}`, k);
      }
      if (name === 'CityAddedToMap') {
        const plot = n(r, 3) * W + n(r, 2);
        const inf = inferred.find((d) => d.kind === 'found' && d.plot === plot) as Extract<Decision, { kind: 'found' }> | undefined;
        put('found', `${n(r, 0)}:${plot}`, { kind: 'found', phase: phaseOf(n(r, 0)), player: n(r, 0), plot, ...(inf?.unit ? { unit: inf.unit } : {}) });
      } else if (name === 'CityProductionCompleted') {
        if (n(r, 2) === 0) completed.add(`${n(r, 0)}:${n(r, 3)}`);
      } else if (name === 'CityMadePurchase') {
        const owner = n(r, 0);
        const centre = cityPlot(owner, n(r, 1));
        const plot = n(r, 3) * W + n(r, 2);
        const type = n(r, 4);
        const obj = n(r, 5);
        if (type === PURCHASE_BUILDING) {
          put('buyBuilding', `${owner}:${centre}:${obj}`, { kind: 'buyBuilding', phase: phaseOf(owner), player: owner, city: centre, building: obj,
            currency: currencyOf(owner, centre, 'B', obj) });
        } else if (type === PURCHASE_PLOT) put('buyPlot', `${owner}:${centre}:${plot}`, { kind: 'buyPlot', phase: phaseOf(owner), player: owner, city: centre, plot });
      } else if (name === 'ImprovementAddedToMap') {
        const imp = n(r, 2);
        const owner = n(r, 3);
        const plot = n(r, 1) * W + n(r, 0);
        // the record t+1 plot must still carry it: one laid and gone again
        // across the pair leaves nothing to land
        if (/GOODY|BARBARIAN/.test(cat.improvements[imp] ?? '') || owner < 0 || plotAt(b, plot)[P.improvement] !== imp) continue;
        const by = acting.get(owner);
        put('improve', `${plot}:${imp}`, { kind: 'improve', phase: phaseOf(owner), player: owner, plot, improvement: imp, ...(by ? { unit: by } : {}) });
      } else if (name === 'UnitRemovedFromMap') {
        removed = `${n(r, 0)}:${n(r, 1)}`;
      } else if (name === 'UnitUpgraded') {
        // the unit the game removed just before it added the upgrade
        if (removed && removed.startsWith(`${n(r, 0)}:`)) {
          out0.push({ kind: 'upgrade', phase: phaseOf(n(r, 0)), player: n(r, 0), unit: removed, into: `${n(r, 0)}:${n(r, 1)}` });
        }
      } else if (name === 'UnitPromoted') {
        const u0 = a.units.find((x) => x.owner === n(r, 0) && x.id === n(r, 1));
        out0.push({ kind: 'promote', phase: phaseOf(n(r, 0)), player: n(r, 0), unit: `${n(r, 0)}:${n(r, 1)}`, promotion: n(r, 2),
          xp: u0 ? num(u0.xp) : 0 });
      } else if (name === 'UnitChargesChanged' && n(r, 2) < n(r, 3)) {
        // a charge spent where the Builder stands on a wonder under
        // construction is a charge toward the wonder
        const u = units1.get(`${n(r, 0)}:${n(r, 1)}`) ?? a.units.find((x) => x.owner === n(r, 0) && x.id === n(r, 1));
        const plot = u ? u.y * W + u.x : -1;
        if (u && cat.units[u.type] === 'UNIT_BUILDER' && plot >= 0 && (plotAt(a, plot)[P.wonder] as number) >= 0 && !plotAt(a, plot)[P.wonderComplete]) {
          out0.push({ kind: 'wonderCharge', phase: phaseOf(n(r, 0)), player: n(r, 0), unit: `${n(r, 0)}:${n(r, 1)}`, plot });
        }
      } else if (name === 'UnitMoved') {
        const k = `${n(r, 0)}:${n(r, 1)}`;
        paths.set(k, [...(paths.get(k) ?? []), n(r, 3) * W + n(r, 2)]);
      } else if (name === 'UnitKilledInCombat') {
        const typeOf = (owner: number, id: number) => {
          const u = a.units.find((x) => x.owner === owner && x.id === id) ?? b.units.find((x) => x.owner === owner && x.id === id);
          return u ? num(u.type) : -1;
        };
        // after the engine's turn, which may have fought the same battle
        out0.push({ kind: 'kill', phase: 'after', player: n(r, 2), killerType: typeOf(n(r, 2), n(r, 3)),
          victim: n(r, 0), victimType: typeOf(n(r, 0), n(r, 1)), victimUnit: `${n(r, 0)}:${n(r, 1)}` });
      } else if (name === 'PantheonFounded') {
        put('pantheon', `${n(r, 0)}:${n(r, 1)}`, { kind: 'pantheon', phase: phaseOf(n(r, 0)), player: n(r, 0), belief: n(r, 1) });
      } else if ((name === 'ResearchChanged' || name === 'CivicChanged') && n(r, 0) === act && n(r, 1) >= 0) {
        const kind = name === 'ResearchChanged' ? 'research' : 'civic';
        const map = log.get(kind) ?? new Map();
        map.clear();
        log.set(kind, map);
        put(kind, `${act}:${n(r, 1)}`, kind === 'research' ? { kind, phase: 'before', player: act, tech: n(r, 1) } : { kind, phase: 'before', player: act, civic: n(r, 1) });
      } else if (name === 'CityProductionChanged' && n(r, 0) === act && r[1] === a.turn) {
        const pk = PRODUCTION_KIND[n(r, 2)];
        const centre = cityPlot(act, n(r, 1));
        if (!pk || centre < 0) continue;
        put('queueHead', `${centre}`, { kind: 'queue', phase: 'before', player: act, city: centre, items: [{ kind: pk, row: n(r, 3), plot: -1 }] });
      }
    }
    // a levy: a city-state's unit removed and a major's added on its plot in
    // the next event
    const minors = new Set(b.players.filter((p) => bool(p.minor)).map((p) => p.id));
    const majorIds = new Set(b.players.filter((p) => bool(p.major)).map((p) => p.id));
    const levies = new Map<string, Extract<Decision, { kind: 'levy' }>>();
    ev.forEach((r, i) => {
      const nx = ev[i + 1];
      if (r[2] !== 'UnitRemovedFromMap' || !nx || nx[2] !== 'UnitAddedToMap' || !minors.has(n(r, 0)) || !majorIds.has(n(nx, 0))) return;
      const u0 = a.units.find((x) => x.owner === n(r, 0) && x.id === n(r, 1));
      if (!u0 || u0.x !== n(nx, 2) || u0.y !== n(nx, 3)) return;
      const key = `${n(nx, 0)}:${n(r, 0)}`;
      const d = levies.get(key) ?? { kind: 'levy', phase: phaseOf(n(nx, 0)), player: n(nx, 0), minor: n(r, 0), units: [] };
      d.units.push([`${n(r, 0)}:${n(r, 1)}`, `${n(nx, 0)}:${n(nx, 1)}`]);
      levies.set(key, d);
    });
    out0.push(...levies.values());
    // a levy's end: a major's unit removed and its city-state's added on the
    // same plot in the next event, the same chassis, at the minor's turn
    // (runs/h1_duelw1117 t43: China's levied Warriors home to Antananarivo;
    // 1121 t57)
    const homes = new Map<number, Extract<Decision, { kind: 'levyEnd' }>>();
    const typeOf = (key: string) => (units1.get(key) ?? a.units.find((x) => unitKey(x) === key))?.type;
    ev.forEach((r, i) => {
      const nx = ev[i + 1];
      if (r[2] !== 'UnitRemovedFromMap' || !nx || nx[2] !== 'UnitAddedToMap' || !majorIds.has(n(r, 0)) || !minors.has(n(nx, 0))) return;
      const from = `${n(r, 0)}:${n(r, 1)}`;
      const to = `${n(nx, 0)}:${n(nx, 1)}`;
      if (typeOf(from) === undefined || typeOf(from) !== typeOf(to)) return;
      const d = homes.get(n(nx, 0)) ?? { kind: 'levyEnd', phase: phaseOf(n(nx, 0)), player: n(nx, 0), units: [] };
      d.units.push([from, to]);
      homes.set(n(nx, 0), d);
    });
    out0.push(...homes.values());
    // a pillage: the unit's UNITOPERATION_PILLAGE, on the plot the log's next
    // `ImprovementChanged` (x, y, ...) or `DistrictPillaged` (owner, district,
    // city, x, y, ...) names
    ev.forEach((r, i) => {
      if (r[2] !== 'UnitOperationStarted' || n(r, 2) !== UNITOPERATION_PILLAGE) return;
      const at = ev.slice(i + 1, i + 4).find((x) => x[2] === 'ImprovementChanged' || x[2] === 'DistrictPillaged');
      if (!at) return;
      const [x, y] = at[2] === 'DistrictPillaged' ? [n(at, 3), n(at, 4)] : [n(at, 0), n(at, 1)];
      if (!(x >= 0 && x < W && y >= 0 && y < b.head.H)) return;
      out0.push({ kind: 'pillage', phase: phaseOf(n(r, 0)), player: n(r, 0), unit: `${n(r, 0)}:${n(r, 1)}`, plot: y * W + x });
    });
    // the melee battles: the defender's damage, then the attacker's, in the
    // attacker's player's turn; every unit where the log's steps had it
    {
      const pos = new Map(a.units.map((u) => [unitKey(u), u.y * W + u.x]));
      let actor = act;
      // the damage the actor's turn dealt so far: one "Unit Combat Damage"
      // draw per hit
      let hits = 0;
      // the actor's unit the log last set acting: a ranged hit's shooter
      let acting: string | undefined;
      // the actor's units in the order the log set them acting, the last last
      let activated: string[] = [];
      const hit = (r: ActionRow | undefined) => !!r && r[2] === 'UnitDamageChanged' && n(r, 2) > n(r, 3);
      const chassisOf = (key: string) => {
        const u = units1.get(key) ?? a.units.find((x) => unitKey(x) === key);
        return u ? UNITS[(cat.units[num(u.type)] ?? '').replace(/^UNIT_/, '')] : undefined;
      };
      // a unit whose only attack is melee: Combat, no Ranged, no Bombard
      const meleeChassis = (key: string) => {
        const def = chassisOf(key);
        return !!def && def.combat > 0 && !def.ranged && def.bombard === undefined;
      };
      const shape = { width: W, height: b.head.H, wrapX: bool(b.head.wrapX) };
      const dist = (p: number, q: number) => hexDistance(shape, p % W, Math.floor(p / W), q % W, Math.floor(q / W));
      // could the unit have dealt this blow from `from` to `at`: a melee
      // chassis beside it, a shooter within its range (a promotion's +1
      // included)
      const reaches = (key: string, from: number, at: number) => {
        const def = chassisOf(key);
        if (!def) return false;
        const d = dist(from, at);
        if (def.ranged) return d >= 1 && d <= def.ranged.range + 1;
        return d === 1 && def.combat > 0 && def.bombard === undefined;
      };
      // the city of `pid` whose centre, else whose Encampment, stands within
      // 2 of `at`, the nearest: the shooter of a blow no unit of its dealt
      const strikerOf = (pid: number, at: number): { city: number; origin: number } | undefined => {
        let best: { city: number; origin: number } | undefined;
        let bd = 3;
        for (const c of b.cities.length ? b.cities : a.cities) {
          if (c.owner !== pid) continue;
          const p = centreOf(c, W);
          const d = dist(p, at);
          if (d >= 1 && d < bd) { bd = d; best = { city: p, origin: p }; }
        }
        if (best) return best;
        for (let p = 0; p < W * b.head.H; p++) {
          const row = plotAt(b, p);
          if (row[P.owner] !== pid || cat.districts[row[P.district] as number] !== 'DISTRICT_ENCAMPMENT') continue;
          const d = dist(p, at);
          const city = (b.cities.length ? b.cities : a.cities).find((c) => c.owner === pid && c.id === row[P.ownerCity]);
          if (d >= 1 && d < bd && city) { bd = d; best = { city: centreOf(city, W), origin: p }; }
        }
        return best;
      };
      // the city a melee attack of `pid`'s from `from` struck: another
      // player's centre beside it, else another player's Encampment
      const assaulted = (pid: number, from: number): number | undefined => {
        for (const c of b.cities.length ? b.cities : a.cities) {
          if (c.owner !== pid && dist(centreOf(c, W), from) === 1) return centreOf(c, W);
        }
        for (let p = 0; p < W * b.head.H; p++) {
          const row = plotAt(b, p);
          if (row[P.owner] !== pid && (row[P.owner] as number) >= 0 && cat.districts[row[P.district] as number] === 'DISTRICT_ENCAMPMENT' && dist(p, from) === 1) return p;
        }
        return undefined;
      };
      ev.forEach((r, i) => {
        if (r[2] === 'PlayerTurnActivated' && n(r, 0) !== actor) {
          actor = n(r, 0);
          hits = 0;
          acting = undefined;
          activated = [];
        } else if (r[2] === 'UnitMoved' || r[2] === 'UnitTeleported') pos.set(`${n(r, 0)}:${n(r, 1)}`, n(r, 3) * W + n(r, 2));
        else if (r[2] === 'UnitActivityChanged' && n(r, 0) === actor) {
          const k = `${n(r, 0)}:${n(r, 1)}`;
          if (n(r, 2) === ACTIVITY_OPERATION) acting = k;
          activated = [...activated.filter((x) => x !== k), k];
        }
        if (!hit(r)) return;
        const k = hits;
        hits += 1;
        if (n(r, 0) === actor) {
          // the actor's own unit struck with no foe's hit before it: a blow
          // it took on its own attack on a city, which no battle holds
          const pv = ev.slice(Math.max(0, i - 3), i).reverse().find((x) => x[2] === 'UnitDamageChanged');
          if (!pv || !hit(pv) || n(pv, 0) === actor) {
            // the attack drew the attacker's damage, then the city's hit
            // points' and its walls' (GameCore_XP2_Release.dll 0x206080:
            // 0x519370, then 0x519440 twice) — three draws, one event; the
            // city is the other player's centre, else Encampment, beside the
            // attacker (runs/h1_duelw1117 t14: a barbarian Warrior at 27 HP
            // on Valletta)
            const unit = `${n(r, 0)}:${n(r, 1)}`;
            const from = pos.get(unit);
            const city = from === undefined ? undefined : assaulted(actor, from);
            if (from !== undefined && city !== undefined) {
              out0.push({ kind: 'battle', phase: phaseOf(actor), player: actor, attacker: unit, defender: '', from, at: city, ranged: false, seq: k, ord: r[0] as number,
                dmg: [0, n(r, 2) - n(r, 3)] });
            } else out0.push({ kind: 'hit', phase: phaseOf(actor), player: actor, unit, dmg: n(r, 2) - n(r, 3) });
            hits += 2;
          }
          return;
        }
        const nx = ev.slice(i + 1, i + 4).find((x) => x[2] === 'UnitDamageChanged');
        const countered = !!nx && hit(nx) && n(nx, 0) === actor;
        const defender = `${n(r, 0)}:${n(r, 1)}`;
        let attacker = countered ? `${n(nx, 0)}:${n(nx, 1)}` : acting;
        let from = attacker === undefined ? undefined : pos.get(attacker);
        const at = pos.get(defender);
        if (!countered && at !== undefined && (attacker === undefined || from === undefined || !reaches(attacker, from, at))) {
          // a blow the last acting unit could not have dealt is its city's
          // shot (cities log no activity), else the last acting unit's of
          // the actor that reaches (runs/h1_duelw1124 t23: a barbarian
          // Slinger's shot behind a Scout's activity)
          const striker = strikerOf(actor, at);
          if (striker) {
            out0.push({ kind: 'battle', phase: phaseOf(actor), player: actor, attacker: '', defender, from: striker.origin, at, ranged: true, seq: k, ord: r[0] as number,
              dmg: [n(r, 2) - n(r, 3), 0], strike: striker });
            return;
          }
          // and with none that reaches, a blow no unit of the actor's dealt
          // (runs/h1_duelw1121 t147: four blows behind a Battering Ram's
          // activity)
          const shooter = [...activated].reverse().find((x) => pos.has(x) && reaches(x, pos.get(x)!, at));
          attacker = shooter;
          from = shooter === undefined ? undefined : pos.get(shooter);
        }
        // a blow with no blow back from a melee chassis is its melee attack on
        // an embarked unit, whose counter the game never draws
        // (GameCore_XP2_Release.dll 0x206960; runs/h1_duelw1127 t90: a
        // barbarian Galley on Rome's embarked Warrior)
        const melee = countered || (attacker !== undefined && meleeChassis(attacker));
        if (attacker === undefined || from === undefined || at === undefined) {
          out0.push({ kind: 'hit', phase: phaseOf(actor), player: n(r, 0), unit: defender, dmg: n(r, 2) - n(r, 3) });
          return;
        }
        out0.push({ kind: 'battle', phase: phaseOf(actor), player: actor, attacker, defender, from, at, ranged: !melee, seq: k, ord: r[0] as number,
          dmg: [n(r, 2) - n(r, 3), countered ? n(nx!, 2) - n(nx!, 3) : 0] });
      });
    }
    // the unit each village rewarded: `GoodyHutReward` (player, unit, type,
    // sub type), in the log's order, to its player's villages in plot order
    for (const r of ev) {
      if (r[2] !== 'GoodyHutReward') continue;
      const v = inferred.find((d): d is Extract<Decision, { kind: 'village' }> => d.kind === 'village' && d.player === n(r, 0) && !d.unit);
      if (v) v.unit = `${n(r, 0)}:${n(r, 1)}`;
    }
    const upgradedInto = new Set(out0.flatMap((d) => (d.kind === 'upgrade' ? [d.into] : [])));
    ev.forEach((r, i) => {
      if (r[2] !== 'UnitAddedToMap') return;
      const k = `${n(r, 0)}:${n(r, 1)}`;
      if (upgradedInto.has(k)) return;
      const u = units1.get(k);
      if (!u || a.units.some((x) => unitKey(x) === k)) return;
      const plot = u.y * W + u.x;
      // the purchase that added it is its owner's `CityMadePurchase` of its
      // type just after the add (the add, its teleport, the purchase); a unit
      // added with no purchase behind it was trained or granted
      // (runs/h1_duelw1124 t17-18: Rome's bought Warrior, then its trained one)
      const buy = ev.slice(i + 1, i + 4).find((x) => x[2] === 'CityMadePurchase' && n(x, 0) === u.owner
        && n(x, 4) === PURCHASE_UNIT && n(x, 5) === u.type);
      const at = buy ? cityPlot(n(buy, 0), n(buy, 1)) : undefined;
      if (at !== undefined && at >= 0) {
        put('unitOrigin', k, { kind: 'buyUnit', phase: phaseOf(u.owner), player: u.owner, city: at, type: u.type, unit: k, currency: currencyOf(u.owner, at, 'U', u.type) });
      } else {
        put('unitOrigin', k, { kind: 'unitNew', phase: 'after', player: u.owner, unit: k, type: u.type, plot,
          why: completed.has(`${u.owner}:${u.type}`) ? 'trained' : 'other' });
      }
    });
    for (const r of ev) if (!READ_EVENTS.has(r[2])) this.unread.set(r[2], (this.unread.get(r[2]) ?? 0) + 1);

    // the inference's decisions of each settled kind, keyed alike
    const keyOf = (d: Decision): [string, string] | null => {
      switch (d.kind) {
        case 'found': return ['found', `${d.player}:${d.plot}`];
        case 'buyBuilding': return ['buyBuilding', `${d.player}:${d.city}:${d.building}`];
        case 'buyPlot': return ['buyPlot', `${d.player}:${d.city}:${d.plot}`];
        case 'improve': return ['improve', `${d.plot}:${d.improvement}`];
        case 'pantheon': return ['pantheon', `${d.player}:${d.belief}`];
        case 'research': return d.player === act ? ['research', `${d.player}:${d.tech}`] : null;
        case 'civic': return d.player === act ? ['civic', `${d.player}:${d.civic}`] : null;
        case 'buyUnit': case 'unitNew': return ['unitOrigin', d.unit];
        case 'queue': return d.player === act && log.get('queueHead')?.has(`${d.city}`) ? ['queueHead', `${d.city}`] : null;
        default: return null;
      }
    };
    const same = (x: Decision, y: Decision) => {
      if (x.kind === 'queue' && y.kind === 'queue') return !!x.items[0] && !!y.items[0] && x.items[0].kind === y.items[0].kind && x.items[0].row === y.items[0].row;
      return JSON.stringify({ ...x, phase: 0, unit: 0 }) === JSON.stringify({ ...y, phase: 0, unit: 0 });
    };
    // an upgrade is neither the old unit's loss nor the new one's arrival
    const upgraded = new Set(out0.flatMap((d) => (d.kind === 'upgrade' ? [d.unit, d.into] : [])));
    const inferredAll = inferred;
    inferred = inferredAll.filter((d) => !((d.kind === 'unitGone' || d.kind === 'unitNew') && upgraded.has(d.unit)));
    const out: Decision[] = [...out0];
    // the steps each moved unit took, on the inference's move
    for (const d of inferred) if (d.kind === 'move' && paths.has(d.unit)) d.path = paths.get(d.unit);
    for (const d of inferred) {
      const by = d.kind === 'clear' ? clearer.get(`${d.player}:${d.plot}:${d.what}`) : undefined;
      if (d.kind === 'clear' && by) d.unit = by;
    }
    // ...and the steps a unit the pair lost took before it fell
    const moved = new Set(inferred.flatMap((d) => (d.kind === 'move' ? [d.unit] : [])));
    for (const [k, path] of paths) {
      const u0 = a.units.find((x) => unitKey(x) === k);
      if (!u0 || moved.has(k) || units1.has(k) || !path.length) continue;
      out.push({ kind: 'move', phase: phaseOf(u0.owner), player: u0.owner, unit: k, plot: path[path.length - 1], path });
    }
    const settledKinds = new Set(['found', 'buyBuilding', 'buyPlot', 'improve', 'pantheon', 'unitOrigin', 'research', 'civic', 'queueHead']);
    const inferredBy = new Map<string, Keyed>();
    for (const d of inferred) {
      const k = keyOf(d);
      if (!k) {
        out.push(d);
        continue;
      }
      if (!inferredBy.has(k[0])) inferredBy.set(k[0], new Map());
      inferredBy.get(k[0])!.set(k[1], d);
    }
    for (const kind of settledKinds) {
      const mine = log.get(kind) ?? new Map<string, Decision>();
      const theirs = inferredBy.get(kind) ?? new Map<string, Decision>();
      const t = this.settled.get(kind) ?? { log: 0, inferred: 0, agree: 0, differ: [] };
      t.log += mine.size;
      t.inferred += theirs.size;
      for (const [k, d] of mine) {
        if (theirs.has(k) && same(d, theirs.get(k)!)) t.agree += 1;
        else if (t.differ.length < 8) t.differ.push([b.turn, d, theirs.get(k) ?? null]);
      }
      for (const [k, d] of theirs) if (!mine.has(k) && t.differ.length < 8 && kind !== 'research' && kind !== 'civic') t.differ.push([b.turn, null, d]);
      this.settled.set(kind, t);
      if (kind === 'queueHead') {
        // the head the log names, behind it the queue the inference reads
        for (const [k, d] of theirs) {
          const head = mine.get(k);
          if (!head || d.kind !== 'queue' || head.kind !== 'queue') {
            out.push(d);
            continue;
          }
          const h = d.items.find((s) => s.kind === head.items[0].kind && s.row === head.items[0].row) ?? head.items[0];
          out.push({ ...d, items: [h, ...d.items.filter((s) => s !== h)] });
        }
        continue;
      }
      if (kind === 'buyBuilding' || kind === 'buyPlot' || kind === 'pantheon') {
        // a purchase or a pantheon the log does not name was not taken
        out.push(...mine.values());
      } else if (kind === 'research' || kind === 'civic') {
        // the record shows the pick the turn's changes settled on; the log's
        // last one stands where the record holds none (its picks churn
        // through transient rows: runs/h1_duelw1117 Rome t6-7, 2 then 5 then 2)
        // where the record shows that pick COMPLETED across the pair; a log
        // pick the record shows neither held nor complete did not take
        // (runs/h1_duelw1118: Rome names Military Tradition each turn and
        // holds no civic and no progress through t100)
        const bits = kind === 'research' ? 'techs' : 'civics';
        const p0 = players0.get(act);
        const p1 = b.players.find((p) => p.id === act);
        const done = (d: Decision) => {
          const k = d.kind === 'research' ? d.tech : d.kind === 'civic' ? d.civic : -1;
          return k >= 0 && String(p1?.[bits] ?? '')[k] === '1' && String(p0?.[bits] ?? '')[k] !== '1';
        };
        out.push(...(theirs.size ? theirs.values() : [...mine.values()].filter(done)));
      } else {
        // what the log names, and what the records show that it does not
        out.push(...mine.values(), ...[...theirs].filter(([k]) => !mine.has(k)).map(([, d]) => d));
      }
    }
    return out;
  }
}
