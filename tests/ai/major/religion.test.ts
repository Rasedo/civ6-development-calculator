// The majors' religion AI's picks (ai/major/religion.ts) on given scores:
// the pantheon's first highest, a religion's Follower belief first, the
// favored religion before a draw.
import { describe, expect, it } from 'vitest';
import { BELIEF_TAKEN, pantheonPick, religionBeliefPick, religionChoice, type BeliefScores } from '../../../ai/major/religion';
import { AI_BELIEFS } from '../../../ai/major/tables';
import type { MajorView } from '../../../ai/major/view';

const scores = (over: Record<string, number>): BeliefScores =>
  new Map(AI_BELIEFS.map((b) => [b.type, (over[b.type] ?? 0) * 256] as const));

describe('the pantheon pick (0x74e2b0)', () => {
  it('takes the first strictly highest pantheon belief not taken', () => {
    const s = scores({ BELIEF_RELIGIOUS_SETTLEMENTS: 198, BELIEF_DESERT_FOLKLORE: 198, BELIEF_CATHEDRAL: 900 });
    // Desert Folklore runs before Religious Settlements in database order
    expect(pantheonPick(s)).toBe('BELIEF_DESERT_FOLKLORE');
  });
  it('leaves a taken belief and stands on the first one left when all score 0', () => {
    const s = new Map(scores({})) as Map<string, number>;
    s.set('BELIEF_DANCE_OF_THE_AURORA', BELIEF_TAKEN);
    expect(pantheonPick(s)).toBe('BELIEF_DESERT_FOLKLORE');
  });
});

describe('a belief for the religion (0x751430)', () => {
  it('takes a Follower belief before a better one of another class', () => {
    const s = scores({ BELIEF_FEED_THE_WORLD: 68, BELIEF_CHORAL_MUSIC: 75, BELIEF_CATHEDRAL: 483 });
    expect(religionBeliefPick(s, new Set())).toBe('BELIEF_CHORAL_MUSIC');
  });
  it('then the best of a class the religion has room for', () => {
    const s = scores({ BELIEF_CHORAL_MUSIC: 75, BELIEF_CATHEDRAL: 483, BELIEF_WAT: 337, BELIEF_MISSIONARY_ZEAL: 12 });
    expect(religionBeliefPick(s, new Set([1]))).toBe('BELIEF_CATHEDRAL');
    expect(religionBeliefPick(s, new Set([1, 2]))).toBe('BELIEF_MISSIONARY_ZEAL');
  });
});

describe('the religion founded (0x750fe0)', () => {
  const view = { leaderType: () => 'LEADER_QIN', civilizationType: () => 'CIVILIZATION_CHINA' } as unknown as MajorView;
  it('takes the leader\'s favored religion while no one holds it', () => {
    expect(religionChoice(view, 1, new Set(), () => 0)).toBe('RELIGION_TAOISM');
  });
  it('draws over the religions left once it is held', () => {
    let n = -1;
    const r = religionChoice(view, 1, new Set(['RELIGION_TAOISM']), (k) => {
      n = k;
      return 0;
    });
    expect(n).toBeGreaterThan(0);
    expect(r).not.toBe('RELIGION_TAOISM');
    expect(r).not.toBe('RELIGION_PANTHEON');
  });
});
