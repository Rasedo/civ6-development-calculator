/** The install rows the majors' AI reads (tables.ts), as the game's database
 *  holds them: type names, not the engine's ids. */
import type { AiModifier } from '../../cpu/core/aiModifiers';

export interface AiPolicy {
  type: string;
  slot: string;
  civic: string | null;
  darkAge: boolean;
  goldenAge: boolean;
  /** Policies_XP1's game era bounds as indices into AI_ERAS, -1 for none */
  minEra: number;
  maxEra: number;
  /** Policy_GovernmentExclusives_XP2: the one government that may slot it */
  government: string | null;
  /** ObsoletePolicies: the card that obsoletes it, the great person class it
   *  needs available */
  obsolete: readonly { policy: string | null; gpClass: string | null }[];
  modifiers: readonly AiModifier[];
}

export interface AiGovernment {
  type: string;
  civic: string | null;
  slots: readonly { slot: string; n: number }[];
  favor: number;
  /** InfluencePointsThreshold: the Influence points a token costs in it, at
   *  Standard speed */
  influenceThreshold: number;
  modifiers: readonly AiModifier[];
}

/** an AiFavoredItems row of a PlotEvaluations list: Item is a
 *  PlotEvalConditions ConditionType */
export interface AiPlotEvalItem {
  condition: string;
  favored: boolean;
  value: number;
  /** the yield, resource, feature or resource class the row keys */
  stringVal: string | null;
}

export interface AiFeature {
  type: string;
  /** Features.Settlement: a city may stand on it */
  settlement: boolean;
  naturalWonder: boolean;
}

/** a StrategyConditions row: the condition function (the victory manager's
 *  registry), its ThresholdValue and StringValue and its kind */
export interface AiStrategyCondition {
  fn: string;
  threshold: number;
  string: string | null;
  disqualifier: boolean;
  exclusive: boolean;
  forbidden: boolean;
}

/** a Strategies row: its VictoryType (a victory strategy), the conditions
 *  it needs and its conditions in database order */
export interface AiStrategy {
  type: string;
  victory: string | null;
  needed: number;
  conditions: readonly AiStrategyCondition[];
}

/** a Strategies-system AiFavoredItems row a trait carries: Value added to
 *  the strategy's conditions needed, kept while the handicap lies in the
 *  bounds */
export interface AiStrategyBias {
  strategy: string;
  value: number;
  minDifficulty: string | null;
  maxDifficulty: string | null;
}

/** a Beliefs row: its BeliefClassType and its BeliefModifiers */
export interface AiBelief {
  type: string;
  class: string;
  modifiers: readonly AiModifier[];
}

/** a Religions row: Pantheon (the pantheon's own row) and
 *  RequiresCustomName (the custom religion) */
export interface AiReligion {
  type: string;
  pantheon: boolean;
  customName: boolean;
}

export interface AiSlotType {
  type: string;
  /** AllowsAnyPolicy: the Wildcard */
  any: boolean;
}
