import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { modifiersFromResearch } from '../../../cpu/core/effects';
import { tileYields } from '../../../cpu/core/yields';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import type { GameState, Tile, YieldKey } from '../../../cpu/core/types';
import type { ImprovementId } from '../../../cpu/core/types';

// WHAT RESEARCH ADDS TO AN IMPROVEMENT'S OWN YIELDS. Every row is the
// Civilopedia's own "(requires X)" line, and the Mine's two were the only
// ones this engine carried.
const ROWS: readonly [ImprovementId, 'tech' | 'civic', string, YieldKey, number][] = [
  ['MINE', 'tech', 'APPRENTICESHIP', 'production', 1],
  ['MINE', 'tech', 'INDUSTRIALIZATION', 'production', 1],
  ['QUARRY', 'tech', 'BANKING', 'gold', 2],
  ['QUARRY', 'tech', 'ROCKETRY', 'production', 1],
  ['PLANTATION', 'tech', 'SCIENTIFIC_THEORY', 'food', 1],
  ['PLANTATION', 'civic', 'GLOBALIZATION', 'gold', 2],
  ['LUMBER_MILL', 'tech', 'STEEL', 'production', 1],
  ['PASTURE', 'tech', 'STIRRUPS', 'food', 1],
  ['PASTURE', 'tech', 'ROBOTICS', 'production', 1],
  ['FISHING_BOATS', 'tech', 'CARTOGRAPHY', 'gold', 2],
  ['FISHING_BOATS', 'tech', 'PLASTICS', 'food', 1],
  ['CAMP', 'tech', 'SYNTHETIC_MATERIALS', 'gold', 1],
  ['CAMP', 'civic', 'MERCANTILISM', 'production', 1],
  ['CAMP', 'civic', 'MERCANTILISM', 'food', 1],
];

function world() {
  const state = makeState(makeMap(16, 12));
  return state;
}

/** The tile's yields under seat 0's research alone. */
function readAt(state: GameState, t: Tile) {
  return tileYields({ map: state.map, mods: modifiersFromResearch(seatOf(state, 0)!.research) }, t);
}

describe('research raises an improvement own yields', () => {
  it.each(ROWS)('%s gains +%s %s at %s', (imp, kind, id, key, amount) => {
    const state = world();
    const t = tileAtCoords(state.map, 6, 6);
    t.feature = null;
    t.improvement = imp;
    const before = readAt(state, t)[key];
    if (kind === 'tech') grantTechs(state, id); else grantCivics(state, id);
    expect(readAt(state, t)[key]).toBe(before + amount);
  });

  it('...and a PILLAGED improvement is paid none of it', () => {
    const state = world();
    const t = tileAtCoords(state.map, 6, 6);
    t.feature = null;
    t.improvement = 'QUARRY';
    t.pillaged = true;
    const before = readAt(state, t).gold;
    grantTechs(state, 'BANKING');
    expect(readAt(state, t).gold).toBe(before);
  });

  it('...and the raise follows the improvement, not the plot', () => {
    const state = world();
    const t = tileAtCoords(state.map, 6, 6);
    t.feature = null;
    t.improvement = 'PASTURE';
    grantTechs(state, 'STIRRUPS');
    const paid = readAt(state, t).food;
    t.improvement = 'QUARRY';
    expect(readAt(state, t).food).toBe(paid - 1);
  });
});

describe('the Lumber Mill on a river', () => {
  it('pays its second Production only where a river runs', () => {
    expect(IMPROVEMENTS.LUMBER_MILL.riverYields).toEqual({ production: 1 });
    const state = world();
    const dry = tileAtCoords(state.map, 6, 6);
    const wet = tileAtCoords(state.map, 7, 6);
    for (const t of [dry, wet]) {
      t.feature = 'WOODS';
      t.improvement = 'LUMBER_MILL';
      t.riverMask = 0;
    }
    const base = readAt(state, dry).production;
    wet.riverMask = 1;
    expect(readAt(state, wet).production).toBe(base + 1);
    expect(readAt(state, dry).production).toBe(base);
    // ...and it stacks with Steel, which raises the row itself
    grantTechs(state, 'STEEL');
    expect(readAt(state, wet).production).toBe(base + 2);
  });

  it('and no other improvement carries a river column', () => {
    const withRiver = Object.values(IMPROVEMENTS).filter((d) => d.riverYields);
    // CIV6 (Ziggurat): "+1 Culture if next to River" rides the same column
    expect(withRiver.map((d) => d.id).sort()).toEqual(['LUMBER_MILL', 'ZIGGURAT']);
  });
});
