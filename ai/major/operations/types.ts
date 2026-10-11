/** The operation tables' row shapes (ai/major/operations/tables.ts). */

/** an AiOperationDefs row */
export interface AiOpDef {
  name: string;
  targetType: string;
  targetParameter: number;
  /** WAR, ALLY or NONE */
  enemyType: string;
  operationType: string | null;
  /** AiOperationTypes.Value, the limits' index; -1 for an operation with no
   *  type (no limit) */
  operationTypeValue: number;
  tree: string | null;
  priority: number;
  maxTargetDistInRegion: number;
  maxTargetDistInArea: number;
  maxTargetDistInWorld: number;
  maxTargetStrength: number;
  maxTargetDefense: number;
  minOddsOfSuccess: number;
  selfStart: boolean;
  mustBeAtWar: boolean;
  mustHaveNukes: boolean;
  mustHaveUnits: number;
  allowTargetUpdate: boolean;
}

export interface AiOpList {
  base: string | null;
  ops: readonly { def: string; remove: boolean }[];
}

/** an AiLists row of the systems AiOperationTypes / PerWarOperationTypes and
 *  its items' summed values */
export interface AiOpLimitList {
  list: string;
  system: string;
  trait: string | null;
  agenda: string | null;
  strategies: readonly string[];
  items: Readonly<Record<string, number>>;
}

export interface AiOpTeam {
  team: string;
  minUnits: number;
  maxUnits: number;
  initialStrengthAdvantage: number;
  ongoingStrengthAdvantage: number;
  safeRallyPoint: boolean;
  condition: string | null;
}

export interface AiTeamReq {
  aiType: string;
  min: number | null;
  max: number | null;
  minPercentage: number;
  maxPercentage: number;
  reconsiderWhilePreparing: boolean;
  dependence: string | null;
}

export interface AiTreeNode {
  id: number;
  type: string;
  /** NodeDefinitions.ShapeId: 0 selector, 1 action, 2 decision, 3 decorator */
  shape: number;
  /** the node after this one's subtree, -1 for a leaf */
  jumpTo: number;
  /** TreeData by DataName: its default and its blackboard tag */
  data: Readonly<Record<string, { defn: number; value?: string; tag?: string }>>;
}

export interface AiTriggeredTree {
  trigger: string;
  tree: string;
  operation: string | null;
  event: string;
  priority: number;
}
