/**
 * CIV 6'S SCORE — the install's `ScoringLineItems` and the `ScoringCategories`
 * they sit in (Base/Assets/Gameplay/Data/Scoring.xml, which
 * DLC/Expansion2/Data/Expansion1_Scoring.xml updates and extends). A seat's
 * Score is the sum over these rows of `count × Multiplier × the category's
 * Multiplier`; past the turn limit the highest Score wins (`scoreLeader`).
 *
 * WHAT EACH ROW COUNTS. The row's boolean column names it (`Civics`, `Cities`,
 * `Districts`, …), and the live game measured how (tools/civ6lab/score_read.lua
 * and score_fit.py, runs/score_obs2_20260924.txt, six majors in the Modern
 * era): every count is FLAT. `ScaleByCost` is true on the civic, tech and
 * wonder rows, yet 32 civics of eras 0–4 score 96 and 40 techs score 80, so
 * each item counts its Multiplier whatever its cost.
 *   - civics / techs: every civic and tech the seat holds;
 *   - cities / population: the seat's cities and their citizens;
 *   - districts: the completed districts of the seat's cities, the city
 *     centre excluded and each completed WONDER's district included — the
 *     reader counted `GetDistricts():Members()` that are complete, and a
 *     wonder stands on its own complete DISTRICT_WONDER;
 *   - greatPeople: every Great Person the seat earned (the timeline's
 *     claimant);
 *   - religion: the beliefs of the religion the seat founded — Follower,
 *     Founder, Worship and Enhancer, never the pantheon (an enhanced religion
 *     read 4, a founded one 2);
 *   - wonders: the completed wonders in the seat's cities;
 *   - eraScore: the era score the seat has earned over the whole game —
 *     `GetPlayerCurrentScore`, which the Ages panel adds up from the previous
 *     eras' total and the current era's moments (EraProgressPanel.lua), and
 *     which the Score's era category matched on all six seats.
 *
 * TWO GS rows are not scored here: Empire's LINE_ITEM_ERA_BUILDINGS
 * (Multiplier 1, TieBreakerPriority 1030) and Religion's
 * LINE_ITEM_ERA_CONVERTED (Multiplier 2, TieBreakerPriority 1020). The live
 * game leaves a residue in each category the measured counts do not explain,
 * and no reading of what they count fits every seat.
 *
 * ROW ORDER IS THE TIE ORDER: `TieBreakerPriority` descending. The install
 * never says which way the column runs; Base's eight rows carry 100 down to 30
 * in the file's own row order, so the larger number reads as the higher
 * priority, and the GS rows (1010 and up) come before them all.
 */
import { xml, type SrcMap } from './provenance';

export type ScoreCount =
  | 'eraScore' | 'civics' | 'cities' | 'districts' | 'population'
  | 'greatPeople' | 'religion' | 'techs' | 'wonders';

export interface ScoringLineItem {
  /** the install's LineItemType */
  id: string;
  /** the install's Category */
  category: string;
  /** what the row counts — the boolean column the row sets */
  count: ScoreCount;
  /** Multiplier: the score per counted item */
  multiplier: number;
  /** the category's own Multiplier */
  categoryMultiplier: number;
  /** TieBreakerPriority */
  tieBreak: number;
  src: SrcMap;
}

const row = (
  id: string, category: string, count: ScoreCount, column: string,
  multiplier: number, categoryMultiplier: number, tieBreak: number,
): ScoringLineItem => {
  const where = `LineItemType=${id}`;
  return {
    id, category, count, multiplier, categoryMultiplier, tieBreak,
    src: {
      category: xml('ScoringLineItems', where, 'Category'),
      count: xml('ScoringLineItems', where, column, { expect: true }),
      multiplier: xml('ScoringLineItems', where, 'Multiplier', {
        note: 'counted flat whatever ScaleByCost says — runs/score_obs2_20260924.txt' }),
      categoryMultiplier: xml('ScoringCategories', `CategoryType=${category}`, 'Multiplier'),
      tieBreak: xml('ScoringLineItems', where, 'TieBreakerPriority'),
    },
  };
};

export const SCORING_LINE_ITEMS: readonly ScoringLineItem[] = [
  row('LINE_ITEM_ERA_SCORE', 'CATEGORY_ERA_SCORE', 'eraScore', 'EraScore', 1, 1, 1010),
  row('LINE_ITEM_CIVICS', 'CATEGORY_CIVICS', 'civics', 'Civics', 3, 1, 100),
  row('LINE_ITEM_CITIES', 'CATEGORY_EMPIRE', 'cities', 'Cities', 5, 1, 90),
  row('LINE_ITEM_DISTRICTS', 'CATEGORY_EMPIRE', 'districts', 'Districts', 2, 1, 80),
  row('LINE_ITEM_POPULATION', 'CATEGORY_EMPIRE', 'population', 'Population', 1, 1, 70),
  row('LINE_ITEM_GREAT_PEOPLE', 'CATEGORY_GREAT_PEOPLE', 'greatPeople', 'GreatPeople', 5, 1, 60),
  row('LINE_ITEM_RELIGION', 'CATEGORY_RELIGION', 'religion', 'Religion', 5, 1, 50),
  row('LINE_ITEM_TECHS', 'CATEGORY_TECH', 'techs', 'Techs', 2, 1, 40),
  row('LINE_ITEM_WONDERS', 'CATEGORY_WONDER', 'wonders', 'Wonders', 15, 1, 30),
];
