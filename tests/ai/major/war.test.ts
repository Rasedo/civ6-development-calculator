// The majors' war operations (ai/major/operations): the city's defense the
// city value reads, the knowledge base's army records' ageing, the march
// point and battle line of the team update, and Is At War.
import { describe, expect, it } from 'vitest';
import { cityDefense } from '../../../ai/major/operations/cityValue';
import { knownArmy, lookArmy, type ArmyRecords } from '../../../ai/major/operations/knowledge';
import { updateTeam, ASSAULT_NODES } from '../../../ai/major/operations/assault';
import { compileTree, newRun, BT_FAILURE, BT_SUCCESS } from '../../../cpu/core/behaviorTree';
import type { MajorKnownCityView, MajorPlotView, MajorUnitView, MajorView } from '../../../ai/major/view';
import type { OpTeam, Operation } from '../../../ai/major/operations/operation';
import type { OpsContext } from '../../../ai/major/operations/nodes';

const W = 12;
const H = 12;
const plots: MajorPlotView[] = Array.from({ length: W * H }, (_v, i) => ({
  index: i, x: i % W, y: Math.floor(i / W), water: false, impassable: false, feature: null, resource: null,
  owner: -1, district: false, city: false, area: 0, region: 0, continent: 0, coastal: false, freshWater: false, lake: false,
}));
const at = (x: number, y: number) => y * W + x;
/** the hex distance of offset rows (odd rows shifted right) */
function dist(a: number, b: number): number {
  const ax = plots[a].x - (plots[a].y - (plots[a].y & 1)) / 2;
  const bx = plots[b].x - (plots[b].y - (plots[b].y & 1)) / 2;
  const az = plots[a].y;
  const bz = plots[b].y;
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz), Math.abs(ax + az - bx - bz));
}

const unit = (id: number, plot: number, over: Partial<MajorUnitView> = {}): MajorUnitView => ({
  id, type: 'UNIT_WARRIOR', plot, founder: false, combat: 20, ranged: 0, range: 0, damage: 0, movesLeft: 512, baseMoves: 2, bombard: 0, ...over,
});

function view(over: Partial<MajorView>): MajorView {
  return { plots: () => plots, plotDistance: dist, players: () => [0, 1, 2], ...over } as unknown as MajorView;
}

describe('the city value\'s defense (0x5eb2c0)', () => {
  const city = (districts: MajorKnownCityView['districts']) => ({ districts }) as MajorKnownCityView;
  it('sums the districts, the walled ones at the strongest + 10', () => {
    expect(cityDefense(city([{ plot: 0, defense: 28, walls: 0, strike: 3 }]), true)).toBe(28);
    expect(cityDefense(city([{ plot: 0, defense: 28, walls: 28, strike: 3 }]), true)).toBe(38);
  });
  it('without its byte, the strongest of defense - 10 and walls', () => {
    expect(cityDefense(city([{ plot: 0, defense: 28, walls: 0, strike: 3 }]), false)).toBe(18);
    expect(cityDefense(city([{ plot: 0, defense: 28, walls: 28, strike: 3 }]), false)).toBe(28);
  });
});

describe('the knowledge base\'s army records', () => {
  it('records what the seat sees and drops a record past age 21', () => {
    const records: ArmyRecords = new Map();
    let seen = [unit(5, at(3, 3))];
    const v = view({ knownUnits: (_s: number, p: number) => (p === 1 ? seen : []) });
    lookArmy(records, v, 0, 1);
    seen = [];
    lookArmy(records, v, 0, 22);
    expect(knownArmy(records, 1).map((r) => r.id)).toEqual([5]);
    lookArmy(records, v, 0, 23);
    expect(knownArmy(records, 1)).toEqual([]);
  });
});

describe('the team update (0x738f20)', () => {
  const team = (members: number[], rally: number, target: number): OpTeam => ({
    def: {} as OpTeam['def'], reqs: [], members, counts: [], goals: [rally, target, -1, -1, -1, -1], engaged: false, ready: false, strength: 0,
  });
  const op = (enemy: number) => ({ enemy } as Operation);
  it('marches to the first plot from the target back to the rally the seat may enter', () => {
    const closed = new Set([at(8, 2), at(7, 2)]);
    const t = team([1], at(2, 2), at(8, 2));
    const v = view({
      units: () => [unit(1, at(2, 2))], atWar: () => false, borderClosed: (_s: number, p: number) => closed.has(p),
    });
    updateTeam(v, 0, op(1), t, []);
    expect(t.goals[5]).toBe(at(6, 2));
    expect(t.goals[3]).toBe(at(2, 2));
    expect(t.engaged).toBe(false);
  });
  it('marches to the target at war', () => {
    const t = team([1], at(2, 2), at(8, 2));
    const v = view({ units: () => [unit(1, at(2, 2))], atWar: () => true, borderClosed: () => true });
    updateTeam(v, 0, op(1), t, []);
    expect(t.goals[5]).toBe(at(8, 2));
  });
  it('draws the battle line halfway to the targets in reach', () => {
    const t = team([1], at(2, 2), at(8, 2));
    const v = view({ units: () => [unit(1, at(2, 2))], atWar: () => true, borderClosed: () => false });
    updateTeam(v, 0, op(1), t, [{ type: 'LOW', plot: at(6, 2), owner: 1, unitType: 'UNIT_WARRIOR', range: 0 }]);
    expect(t.engaged).toBe(true);
    expect(t.goals[4]).toBe(at(4, 2));
  });
});

describe('Is At War (0x7edde0)', () => {
  const nodes = compileTree('t', [{ id: 0, type: 'Is At War', shape: 2, jumpTo: -1,
    data: { 'Minimum Number': { defn: 0, value: '1' }, 'With Operation Target': { defn: 2, value: 'true' } } }]);
  const run = newRun('t', nodes);
  const ctx = (wars: number[], enemy: number) => ({
    seat: 0, op: { enemy } as Operation,
    view: () => view({ atWar: (_s: number, p: number) => wars.includes(p), majors: () => [0, 1], barbarianSeat: () => 63 }),
  }) as unknown as OpsContext;
  it('counts the operation\'s enemy alone', () => {
    expect(ASSAULT_NODES['Is At War'].update(nodes[0], run, ctx([2], 1))).toBe(BT_FAILURE);
    expect(ASSAULT_NODES['Is At War'].update(nodes[0], run, ctx([1, 2], 1))).toBe(BT_SUCCESS);
  });
});
