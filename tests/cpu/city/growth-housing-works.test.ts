import { describe, it, expect } from 'vitest';
import { housingGrowthFactor } from '../../../cpu/data/constants';
import { gwWorkCulture, GW_MAKER_CLASS } from '../../../cpu/core/greatWorks';
import { GREAT_PEOPLE } from '../../../cpu/data/greatPeople';
import { PROJECTS, projectConversionRate } from '../../../cpu/data/projects';

describe('the housing left above the population', () => {
  // runs/h1_duelw11*: housingGrowthMod 1 at 2+ left, 0.5 at 1, 0.25 from 0
  // to -4, 0 at -5 or less (Handan 1108 t147-173: housing 4, population 9)
  it('halves, quarters and halts growth at the GlobalParameters marks', () => {
    expect([3, 2, 1, 0, -4, -5, -8].map(housingGrowthFactor)).toEqual([1, 1, 0.5, 0.25, 0.25, 0, 0]);
  });
});

describe("a great work's own Culture", () => {
  it("pays its maker's raised figure, else its object type's", () => {
    const writing = GW_MAKER_CLASS.indexOf('WRITER');
    const potter = GREAT_PEOPLE.WRITER.findIndex((p) => p.id === 'GP_BEATRIX_POTTER');
    const homer = GREAT_PEOPLE.WRITER.findIndex((p) => p.id === 'GP_HOMER');
    expect(gwWorkCulture({ obj: writing, maker: potter })).toBe(4);
    expect(gwWorkCulture({ obj: writing, maker: homer })).toBe(2);
  });
});

describe("a district project's conversion rate", () => {
  // Aquileia 1108 t169-176: Commercial Hub Investment's 30% on 16 Production
  // reads 4.75 Gold — the rate in 1/256 fixed point, truncated
  it('is the percent over 100 truncated to 256ths', () => {
    expect(16 * projectConversionRate(PROJECTS.INVESTMENT)).toBe(4.75);
    expect(projectConversionRate(PROJECTS.RESEARCH_GRANTS)).toBe(38 / 256);
  });
});
