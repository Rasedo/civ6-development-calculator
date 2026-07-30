import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import { parseLiveSync, syncSummary } from '../src/core/livesync';
import { tileIndex } from '../src/core/hex';

function mapBlock(width = 10, height = 10): string[] {
  const lines = [`CIV6MAP_BEGIN|${width}|${height}`];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      lines.push(`CIV6MAP|${x}|${y}|TERRAIN_GRASS|-|-|-|0`);
    }
  }
  lines.push('CIV6MAP_END');
  return lines;
}

function syncBlock(turn: number, body: string[]): string[] {
  return [`CIV6SYNC_BEGIN|${turn}|0`, ...body, 'CIV6SYNC_END'];
}

describe('live sync parser', () => {
  it('mirrors cities, buildings, districts, improvements, ownership and research', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(42, [
        'CIV6SYNC_RESEARCH|TECH_POTTERY,TECH_WRITING,TECH_FUTURE_TECH|CIVIC_CODE_OF_LAWS',
        'CIV6SYNC_CITY|7|4|4|6|Kyoto',
        'CIV6SYNC_CITYBLD|7|BUILDING_PALACE,BUILDING_MONUMENT,BUILDING_LIBRARY,BUILDING_UNKNOWN_DLC',
        'CIV6SYNC_PLOT|5|4|-|DISTRICT_CAMPUS|-|0',
        'CIV6SYNC_PLOT|3|4|IMPROVEMENT_FARM|-|-|0',
        'CIV6SYNC_PLOT|6|4|-|-|-|0', // plain owned tile
        'CIV6SYNC_PLOT|4|6|-|-|BUILDING_PYRAMIDS|0',
      ]),
    ].join('\n');

    const { state, report } = parseLiveSync(text);
    expect(state.turn).toBe(42);
    expect(playerSeat(state).research.techs).toEqual(['POTTERY', 'WRITING']);
    expect(playerSeat(state).research.civics).toEqual(['CODE_OF_LAWS']);
    expect(report.skipped['tech']).toBe(1);
    expect(report.skipped['building']).toBe(1);

    expect(state.cities.length).toBe(1);
    const city = state.cities[0];
    expect(city.name).toBe('Kyoto');
    expect(city.population).toBe(6);
    expect(city.isCapital).toBe(true);
    expect(city.buildings).toEqual(['PALACE', 'MONUMENT', 'LIBRARY']);

    const map = state.map;
    const campus = map.tiles[tileIndex(map, 5, 4)];
    expect(campus.district).toBe('CAMPUS');
    expect(campus.districtComplete).toBe(true);
    expect(city.districts.some((d) => d.type === 'CAMPUS')).toBe(true);

    expect(map.tiles[tileIndex(map, 3, 4)].improvement).toBe('FARM');
    expect(map.tiles[tileIndex(map, 6, 4)].cityId).toBe(city.id); // nearest-city ownership
    const pyramids = map.tiles[tileIndex(map, 4, 6)];
    expect(pyramids.builtWonder).toBe('PYRAMIDS');
    expect(city.wonders.some((w) => w.id === 'PYRAMIDS')).toBe(true);

    expect(syncSummary(report)).toContain('turn 42');
  });

  it('applies later blocks as deltas over earlier ones', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(10, [
        'CIV6SYNC_CITY|7|4|4|2|Kyoto',
        'CIV6SYNC_CITYBLD|7|BUILDING_PALACE',
        'CIV6SYNC_PLOT|3|4|IMPROVEMENT_FARM|-|-|0',
      ]),
      ...syncBlock(11, [
        'CIV6SYNC_CITY|7|4|4|3|Kyoto',
        'CIV6SYNC_CITYBLD|7|BUILDING_PALACE,BUILDING_MONUMENT',
        'CIV6SYNC_PLOT|3|4|IMPROVEMENT_MINE|-|-|0', // farm replaced
      ]),
    ].join('\n');

    const { state } = parseLiveSync(text);
    expect(state.turn).toBe(11);
    expect(state.cities[0].population).toBe(3);
    expect(state.cities[0].buildings).toContain('MONUMENT');
    expect(state.map.tiles[tileIndex(state.map, 3, 4)].improvement).toBe('MINE');
  });

  it('ignores a half-written trailing block', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(5, ['CIV6SYNC_CITY|7|4|4|2|Kyoto']),
      'CIV6SYNC_BEGIN|6|0',
      'CIV6SYNC_CITY|7|4|4|9|Kyoto', // no END — must not apply
    ].join('\n');
    const { state } = parseLiveSync(text);
    expect(state.turn).toBe(5);
    expect(state.cities[0].population).toBe(2);
  });

  it('mirrors government, policy cards and beliefs', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(25, [
        'CIV6SYNC_RESEARCH|TECH_POTTERY|CIVIC_CODE_OF_LAWS,CIVIC_POLITICAL_PHILOSOPHY',
        'CIV6SYNC_GOV|GOVERNMENT_OLIGARCHY',
        'CIV6SYNC_POLICIES|POLICY_URBAN_PLANNING,POLICY_GOD_KING,POLICY_UNKNOWN_DLC',
        'CIV6SYNC_BELIEFS|BELIEF_FERTILITY_RITES,BELIEF_WORK_ETHIC,BELIEF_TITHE,BELIEF_MYSTERY_CULT',
        'CIV6SYNC_CITY|7|4|4|4|Kyoto',
      ]),
    ].join('\n');

    const { state, report } = parseLiveSync(text);
    expect(playerSeat(state).government.current).toBe('OLIGARCHY');
    expect(playerSeat(state).government.policies).toContain('URBAN_PLANNING');
    expect(playerSeat(state).government.policies).toContain('GOD_KING');
    expect(report.skipped['policy']).toBe(1); // the unknown DLC card
    expect(playerSeat(state).religion.pantheon).toBe('FERTILITY_RITES');
    expect(playerSeat(state).religion.follower).toBe('WORK_ETHIC');
    expect(playerSeat(state).religion.founder).toBe('TITHE');
    expect(playerSeat(state).religion.founded).toBe(true);
    expect(report.skipped['belief']).toBe(1);
  });

  it('mirrors current production, rescaled onto our costs', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(18, [
        'CIV6SYNC_CITY|7|4|4|4|Kyoto',
        'CIV6SYNC_CITY|8|8|8|2|Osaka',
        'CIV6SYNC_PLOT|5|4|-|DISTRICT_CAMPUS|-|0',
        'CIV6SYNC_QUEUE|7|DISTRICT_CAMPUS|27|54', // half done in the real game
        'CIV6SYNC_QUEUE|8|UNIT_SETTLER|20|80',
      ]),
    ].join('\n');

    const { state } = parseLiveSync(text);
    const kyoto = state.cities.find((c) => c.name === 'Kyoto')!;
    const osaka = state.cities.find((c) => c.name === 'Osaka')!;

    expect(kyoto.queue.length).toBe(1);
    const dq = kyoto.queue[0];
    expect(dq.kind).toBe('district');
    if (dq.kind === 'district') {
      expect(dq.district).toBe('CAMPUS');
      expect(dq.progress / (dq.cost ?? 1)).toBeCloseTo(0.5, 5); // ratio preserved
      expect(state.map.tiles[dq.tileIndex].districtComplete).toBe(false); // demoted
    }

    expect(osaka.queue.length).toBe(1);
    const sq = osaka.queue[0];
    expect(sq.kind).toBe('settler');
    if (sq.kind === 'settler') {
      expect(sq.progress / sq.cost).toBeCloseTo(0.25, 5);
    }
  });

  it('unknown queue items are skipped and reported', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(9, [
        'CIV6SYNC_CITY|7|4|4|2|Kyoto',
        'CIV6SYNC_QUEUE|7|UNIT_GIANT_DEATH_ROBOT|10|300',
      ]),
    ].join('\n');
    const { state, report } = parseLiveSync(text);
    expect(state.cities[0].queue.length).toBe(0);
    expect(report.skipped['queue']).toBe(1);
  });

  it('a synced worship building marks the religion choice', () => {
    const text = [
      ...mapBlock(),
      ...syncBlock(30, [
        'CIV6SYNC_CITY|7|4|4|5|Kyoto',
        'CIV6SYNC_CITYBLD|7|BUILDING_PALACE,BUILDING_SHRINE,BUILDING_TEMPLE,BUILDING_GURDWARA',
        'CIV6SYNC_PLOT|5|4|-|DISTRICT_HOLY_SITE|-|0',
      ]),
    ].join('\n');
    const { state } = parseLiveSync(text);
    expect(playerSeat(state).religion.founded).toBe(true);
    expect(playerSeat(state).religion.worship).toBe('GURDWARA');
  });
});
