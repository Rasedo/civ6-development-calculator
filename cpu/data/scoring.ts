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
 *     centre excluded and a wonder's own district too — removing a wonder
 *     moves Empire by 1, not by the 1 + 2 a building and a district would
 *     (runs/b82s3_20260926T094221Z.jsonl, runs/b82s3b_20260926T095909Z.jsonl);
 *   - greatPeople: every Great Person the seat earned (the timeline's
 *     claimant);
 *   - religion: the beliefs of the religion the seat founded — Follower,
 *     Founder, Worship and Enhancer, never the pantheon (an enhanced religion
 *     read 4, a founded one 2);
 *   - converted: the FOREIGN cities whose majority follows the religion the
 *     seat founded, city-states included, however many followers each holds
 *     (`GetNumForeignCitiesFollowingReligion`; a city converted to it moved
 *     its founder's Religion by +2 and the old religion's founder's by -2,
 *     a city-state's included — runs/b82s3b_20260926T095909Z.jsonl);
 *   - wonders: the completed wonders in the seat's cities;
 *   - eraScore: the era score the seat has earned over the whole game —
 *     `GetPlayerCurrentScore`, which the Ages panel adds up from the previous
 *     eras' total and the current era's moments (EraProgressPanel.lua), and
 *     which the Score's era category matched on all six seats;
 *   - buildings: every building the seat's cities hold, the Palace included
 *     and pillaged ones too, and every completed wonder once more — one per
 *     building whatever its era (tools/civ6lab/score_pair.py,
 *     runs/score_pair_*: a building placed or removed moves Empire by 1; a
 *     wonder removed moves it by 1, runs/b82s3b_20260926T095909Z.jsonl).
 *
 * A TIE on the total goes to the lower seat whatever the line items: three
 * built ties all went to the lower seat (runs/b82s4_tie_*.jsonl), so
 * `TieBreakerPriority` orders nothing here.
 */
import { xml, type SrcMap } from './provenance';

export type ScoreCount =
  | 'eraScore' | 'civics' | 'cities' | 'districts' | 'population'
  | 'greatPeople' | 'religion' | 'converted' | 'techs' | 'wonders' | 'buildings';

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
  src: SrcMap;
}

const row = (
  id: string, category: string, count: ScoreCount, column: string,
  multiplier: number, categoryMultiplier: number,
): ScoringLineItem => {
  const where = `LineItemType=${id}`;
  return {
    id, category, count, multiplier, categoryMultiplier,
    src: {
      category: xml('ScoringLineItems', where, 'Category'),
      count: xml('ScoringLineItems', where, column, { expect: true }),
      multiplier: xml('ScoringLineItems', where, 'Multiplier', {
        note: 'counted flat whatever ScaleByCost says — runs/score_obs2_20260924.txt' }),
      categoryMultiplier: xml('ScoringCategories', `CategoryType=${category}`, 'Multiplier'),
    },
  };
};

export const SCORING_LINE_ITEMS: readonly ScoringLineItem[] = [
  row('LINE_ITEM_ERA_BUILDINGS', 'CATEGORY_EMPIRE', 'buildings', 'Buildings', 1, 1),
  row('LINE_ITEM_ERA_CONVERTED', 'CATEGORY_RELIGION', 'converted', 'Converted', 2, 1),
  row('LINE_ITEM_ERA_SCORE', 'CATEGORY_ERA_SCORE', 'eraScore', 'EraScore', 1, 1),
  row('LINE_ITEM_CIVICS', 'CATEGORY_CIVICS', 'civics', 'Civics', 3, 1),
  row('LINE_ITEM_CITIES', 'CATEGORY_EMPIRE', 'cities', 'Cities', 5, 1),
  row('LINE_ITEM_DISTRICTS', 'CATEGORY_EMPIRE', 'districts', 'Districts', 2, 1),
  row('LINE_ITEM_POPULATION', 'CATEGORY_EMPIRE', 'population', 'Population', 1, 1),
  row('LINE_ITEM_GREAT_PEOPLE', 'CATEGORY_GREAT_PEOPLE', 'greatPeople', 'GreatPeople', 5, 1),
  row('LINE_ITEM_RELIGION', 'CATEGORY_RELIGION', 'religion', 'Religion', 5, 1),
  row('LINE_ITEM_TECHS', 'CATEGORY_TECH', 'techs', 'Techs', 2, 1),
  row('LINE_ITEM_WONDERS', 'CATEGORY_WONDER', 'wonders', 'Wonders', 15, 1),
];
