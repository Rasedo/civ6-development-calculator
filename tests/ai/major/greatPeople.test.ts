import { describe, it, expect } from 'vitest';
import { faithPatronage, goldPatronage } from '../../../ai/major/greatPeople';
import { newDiploActionMemory, senderOf } from '../../../ai/major/diploActions';
import type { MajorView } from '../../../ai/major/view';

const FX = 256;

function view(prices: Record<string, number>, faith = 0): MajorView {
  return {
    greatPersonPatronage: (_s: number, cls: string) => prices[cls] ?? -1,
    faith: () => faith,
    greatPersonUsable: () => true,
  } as unknown as MajorView;
}

describe('the Gold patronage (0x6898b0)', () => {
  it('takes the cheapest the savings cover, the GREAT_PEOPLE slot over half its price', () => {
    const mem = newDiploActionMemory();
    const s = senderOf(mem, 0);
    s.savings = [100 * FX, 0, 0, 160 * FX];
    s.balance = 500 * FX;
    const v = view({ GREAT_PERSON_CLASS_ENGINEER: 300, GREAT_PERSON_CLASS_MERCHANT: 250 });
    expect(goldPatronage(v, mem, 0)).toBe('GREAT_PERSON_CLASS_MERCHANT');
    // the price over slot 3 comes from the SLUSH_FUND, the balance lowered
    expect(s.savings).toEqual([10 * FX, 0, 0, 0]);
    expect(s.balance).toBe(250 * FX);
  });

  it('declines where the slot holds half the price or less, or both slots no more than it', () => {
    const mem = newDiploActionMemory();
    const s = senderOf(mem, 0);
    s.savings = [400 * FX, 0, 0, 125 * FX];
    expect(goldPatronage(view({ GREAT_PERSON_CLASS_MERCHANT: 250 }), mem, 0)).toBeNull();
    s.savings = [100 * FX, 0, 0, 150 * FX];
    expect(goldPatronage(view({ GREAT_PERSON_CLASS_MERCHANT: 250 }), mem, 0)).toBeNull();
    expect(s.savings).toEqual([100 * FX, 0, 0, 150 * FX]);
  });
});

describe('the Faith patronage (0x751590)', () => {
  it('takes the cheapest its Faith exceeds', () => {
    const v = view({ GREAT_PERSON_CLASS_PROPHET: 400, GREAT_PERSON_CLASS_WRITER: 300 }, 300);
    expect(faithPatronage(v, 0)).toBeNull();
    expect(faithPatronage(view({ GREAT_PERSON_CLASS_PROPHET: 400, GREAT_PERSON_CLASS_WRITER: 300 }, 301), 0))
      .toBe('GREAT_PERSON_CLASS_WRITER');
  });
});
