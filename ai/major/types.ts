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

export interface AiSlotType {
  type: string;
  /** AllowsAnyPolicy: the Wildcard */
  any: boolean;
}
