// The majors' governor AI (ai/major/governors.ts) on a stub view and set
// scores: the choice's order and the generalized assignment's one pass.
import { describe, expect, it } from 'vitest';
import { governorAssignment, governorChoice, type GovernorAnalysis, type GovernorScores } from '../../../ai/major/governors';
import { AI_GOVERNORS } from '../../../ai/major/tables';
import type { MajorGovernorView, MajorView } from '../../../ai/major/view';

const FX = 256;
const SEAT = 1;

function view(roster: MajorGovernorView[], cities: number[], over: Partial<MajorView> = {}): MajorView {
  return {
    governors: () => roster,
    governorAvailable: () => true,
    governorTitles: () => 1,
    governorCanPromote: (_s: number, type: string, p: string) => !!roster.find((g) => g.type === type && g.appointed && !g.promotions.has(p)),
    cities: () => cities.map((id) => ({ id, capital: id === 0 })),
    cityStateSeats: () => [],
    cityStateHasCity: () => false,
    ...over,
  } as unknown as MajorView;
}

const gov = (type: string, appointed: boolean, city: number | null, promotions: string[] = []): MajorGovernorView =>
  ({ type, appointed, promotions: new Set(promotions), city: city === null ? null : { seat: SEAT, id: city } });

/** an analysis of the slot of no city and the cities 0..n-1, whole values */
function scores(values: Record<string, number[]>, promotions: Record<string, number> = {}): GovernorScores {
  const governors: GovernorAnalysis[] = AI_GOVERNORS.map((g) => {
    const v = values[g.type] ?? [];
    return { type: g.type, slots: v.map((_, k) => (k === 0 ? null : { seat: SEAT, id: k - 1 })), values: v.map((x) => x * FX) };
  });
  return { governors, promotions: new Map(Object.entries(promotions).map(([k, v]) => [k, v * FX])) };
}

describe('the choice (0x6ee100)', () => {
  it('takes the first strictly highest of the unappointed governors\' best slot and the open promotions', () => {
    const roster = AI_GOVERNORS.map((g) => gov(g.type, g.type === 'GOVERNOR_THE_EDUCATOR', g.type === 'GOVERNOR_THE_EDUCATOR' ? 0 : null,
      g.type === 'GOVERNOR_THE_EDUCATOR' ? ['GOVERNOR_PROMOTION_EDUCATOR_LIBRARIAN'] : []));
    const s = scores({ GOVERNOR_THE_DEFENDER: [10, 20], GOVERNOR_THE_AMBASSADOR: [10, 0], GOVERNOR_THE_CARDINAL: [10, 65] },
      { GOVERNOR_PROMOTION_EDUCATOR_CONNOISSEUR: 65, GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER: 65 });
    // the Cardinal comes before the Educator in the list: its 65 holds
    expect(governorChoice(view(roster, [0]), SEAT, s)).toEqual({ appoint: 'GOVERNOR_THE_CARDINAL' });
    const s2 = scores({ GOVERNOR_THE_CARDINAL: [10, 64] }, { GOVERNOR_PROMOTION_EDUCATOR_CONNOISSEUR: 65, GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER: 66 });
    expect(governorChoice(view(roster, [0]), SEAT, s2)).toEqual({ promote: 'GOVERNOR_THE_EDUCATOR', promotion: 'GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER' });
  });

  it('takes nothing without a title', () => {
    const roster = AI_GOVERNORS.map((g) => gov(g.type, false, null));
    expect(governorChoice(view(roster, [0], { governorTitles: () => 0 }), SEAT, scores({ GOVERNOR_THE_CARDINAL: [10, 65] }))).toBeNull();
  });
});

describe('the seats (0x6ed750 over the generalized assignment 0x8b5bf0)', () => {
  it('moves a governor whose gain outweighs the sitting one\'s value and reseats the one it displaced', () => {
    // runs/h1_duelw1117 t205: the Merchant sits in Handan (46), Xiurong is
    // worth 69 to it and 20 to the Resource Manager sitting there; Chengdu
    // 20 to the Resource Manager
    const cities = [0, 1, 2, 3]; // Handan 0, Xiurong 1, Chengdu 2, a fourth 3
    const roster = AI_GOVERNORS.map((g) => (g.type === 'GOVERNOR_THE_MERCHANT' ? gov(g.type, true, 0)
      : g.type === 'GOVERNOR_THE_RESOURCE_MANAGER' ? gov(g.type, true, 1) : gov(g.type, false, null)));
    const s = scores({ GOVERNOR_THE_MERCHANT: [10, 46, 69, 60, 23], GOVERNOR_THE_RESOURCE_MANAGER: [10, 0, 20, 20, 20] });
    const appointed = new Set(['GOVERNOR_THE_MERCHANT', 'GOVERNOR_THE_RESOURCE_MANAGER']);
    const { slots, at } = governorAssignment(view(roster, cities), SEAT, s, appointed);
    const where = (t: string) => slots[at[AI_GOVERNORS.findIndex((g) => g.type === t)]];
    expect(where('GOVERNOR_THE_MERCHANT')).toEqual({ seat: SEAT, id: 1 });
    expect(where('GOVERNOR_THE_RESOURCE_MANAGER')).toEqual({ seat: SEAT, id: 2 });
  });

  it('keeps a governor whose gain does not beat the sitting one\'s value', () => {
    const roster = AI_GOVERNORS.map((g) => (g.type === 'GOVERNOR_THE_MERCHANT' ? gov(g.type, true, 0)
      : g.type === 'GOVERNOR_THE_RESOURCE_MANAGER' ? gov(g.type, true, 1) : gov(g.type, false, null)));
    const s = scores({ GOVERNOR_THE_MERCHANT: [10, 65, 69, 60], GOVERNOR_THE_RESOURCE_MANAGER: [10, 0, 20, 20] });
    const appointed = new Set(['GOVERNOR_THE_MERCHANT', 'GOVERNOR_THE_RESOURCE_MANAGER']);
    const { slots, at } = governorAssignment(view(roster, [0, 1, 2]), SEAT, s, appointed);
    expect(slots[at[AI_GOVERNORS.findIndex((g) => g.type === 'GOVERNOR_THE_MERCHANT')]]).toEqual({ seat: SEAT, id: 0 });
    expect(slots[at[AI_GOVERNORS.findIndex((g) => g.type === 'GOVERNOR_THE_RESOURCE_MANAGER')]]).toEqual({ seat: SEAT, id: 1 });
  });
});
