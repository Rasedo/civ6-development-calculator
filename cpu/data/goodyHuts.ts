/**
 * TRIBAL VILLAGES — the install's own reward table (C-47).
 *
 * Source: `GoodyHuts` and `GoodyHutSubTypes` (Base + Expansion2), with each
 * row's payload read off the modifier its `ModifierID` names. Nothing here is
 * inferred: the seven kinds all carry Weight 100, every subtype carries its
 * own weight within its kind, and the gates (`MinOneCity`, `Turn`) and
 * amounts are transcribed. The engine's older six-arm stub was unsourced and
 * is gone rather than preserved.
 *
 * A weight of 0 means the subtype is OFF in this ruleset (GRANT_UPGRADE and
 * GRANT_SETTLER), not that it is free — it is excluded from the draw.
 *
 * `scale` marks the rows the install flags `Scale: true`, which take the
 * game-speed scale every other yield figure here already takes.
 *
 * The GPU twin reads these through the wire's `goodyHuts` block.
 */
export type GoodyKind =
  | 'CULTURE' | 'GOLD' | 'FAITH' | 'MILITARY' | 'SCIENCE' | 'SURVIVORS' | 'DIPLOMACY';

/** every kind the install publishes, each at Weight 100 — so the kind draw is
 *  uniform over those with an eligible subtype */
export const GOODY_KINDS: readonly GoodyKind[] =
  ['CULTURE', 'GOLD', 'FAITH', 'MILITARY', 'SCIENCE', 'SURVIVORS', 'DIPLOMACY'];

export const GOODY_KIND_WEIGHT = 100;

/** what a subtype pays — one channel per row, named for the effect it came from */
export type GoodyPayload =
  | { kind: 'relic'; amount: number }
  | { kind: 'civicBoost'; amount: number }
  | { kind: 'techBoost'; amount: number }
  | { kind: 'tech'; amount: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'faith'; amount: number }
  | { kind: 'unitByClass'; promoClass: string }
  | { kind: 'unitInCity'; unit: string }
  | { kind: 'experience'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'population'; amount: number }
  | { kind: 'governorTitle'; amount: number }
  | { kind: 'envoy'; amount: number }
  | { kind: 'favor'; amount: number }
  | { kind: 'strategic'; amount: number };

/** the payload channel index space BOTH engines address a reward by — the
 *  wire ships a subtype's channel as an index into this list */
export const GOODY_PAYLOAD_KINDS: readonly GoodyPayload['kind'][] = [
  'relic', 'civicBoost', 'techBoost', 'tech', 'gold', 'faith', 'unitByClass',
  'unitInCity', 'experience', 'heal', 'population', 'governorTitle', 'envoy',
  'favor', 'strategic',
];

export interface GoodySubType {
  id: string;
  hut: GoodyKind;
  /** the install's own weight WITHIN its kind; 0 is off in this ruleset */
  weight: number;
  /** the row pays nothing before this turn */
  turn?: number;
  /** the row needs the claimer to hold at least one city */
  minOneCity?: boolean;
  /** the install's `Scale: true` — take the game-speed scale */
  scale?: boolean;
  payload: GoodyPayload;
}

export const GOODY_SUBTYPES: readonly GoodySubType[] = [
  // ----- CULTURE
  { id: 'ONE_RELIC', hut: 'CULTURE', weight: 15, minOneCity: true,
    payload: { kind: 'relic', amount: 1 } },
  { id: 'TWO_CIVIC_BOOSTS', hut: 'CULTURE', weight: 30, turn: 30,
    payload: { kind: 'civicBoost', amount: 2 } },
  { id: 'ONE_CIVIC_BOOST', hut: 'CULTURE', weight: 55,
    payload: { kind: 'civicBoost', amount: 1 } },
  // ----- GOLD
  { id: 'LARGE_GOLD', hut: 'GOLD', weight: 15, turn: 40, minOneCity: true, scale: true,
    payload: { kind: 'gold', amount: 120 } },
  { id: 'MEDIUM_GOLD', hut: 'GOLD', weight: 30, turn: 20, minOneCity: true, scale: true,
    payload: { kind: 'gold', amount: 75 } },
  { id: 'SMALL_GOLD', hut: 'GOLD', weight: 55, minOneCity: true, scale: true,
    payload: { kind: 'gold', amount: 40 } },
  // ----- FAITH
  { id: 'LARGE_FAITH', hut: 'FAITH', weight: 15, turn: 60, minOneCity: true, scale: true,
    payload: { kind: 'faith', amount: 100 } },
  { id: 'MEDIUM_FAITH', hut: 'FAITH', weight: 30, turn: 40, minOneCity: true, scale: true,
    payload: { kind: 'faith', amount: 60 } },
  { id: 'SMALL_FAITH', hut: 'FAITH', weight: 55, turn: 20, minOneCity: true, scale: true,
    payload: { kind: 'faith', amount: 20 } },
  // ----- MILITARY
  { id: 'GRANT_SCOUT', hut: 'MILITARY', weight: 35, minOneCity: true,
    payload: { kind: 'unitByClass', promoClass: 'RECON' } },
  // OFF in this ruleset (Weight 0), and kept so the table matches the install
  { id: 'GRANT_UPGRADE', hut: 'MILITARY', weight: 0,
    payload: { kind: 'experience', amount: 0 } },
  { id: 'GRANT_EXPERIENCE', hut: 'MILITARY', weight: 20,
    payload: { kind: 'experience', amount: 20 } },
  { id: 'HEAL', hut: 'MILITARY', weight: 25,
    payload: { kind: 'heal', amount: 100 } },
  { id: 'RESOURCES', hut: 'MILITARY', weight: 20,
    payload: { kind: 'strategic', amount: 20 } },
  // ----- SCIENCE
  { id: 'ONE_TECH', hut: 'SCIENCE', weight: 15, turn: 50, minOneCity: true,
    payload: { kind: 'tech', amount: 1 } },
  { id: 'TWO_TECH_BOOSTS', hut: 'SCIENCE', weight: 30, turn: 30,
    payload: { kind: 'techBoost', amount: 2 } },
  { id: 'ONE_TECH_BOOST', hut: 'SCIENCE', weight: 55,
    payload: { kind: 'techBoost', amount: 1 } },
  // ----- SURVIVORS
  { id: 'ADD_POP', hut: 'SURVIVORS', weight: 40, minOneCity: true,
    payload: { kind: 'population', amount: 1 } },
  { id: 'GRANT_BUILDER', hut: 'SURVIVORS', weight: 35, minOneCity: true,
    payload: { kind: 'unitInCity', unit: 'BUILDER' } },
  { id: 'GRANT_TRADER', hut: 'SURVIVORS', weight: 25, turn: 15, minOneCity: true,
    payload: { kind: 'unitInCity', unit: 'TRADER' } },
  // OFF in this ruleset (Weight 0)
  { id: 'GRANT_SETTLER', hut: 'SURVIVORS', weight: 0, minOneCity: true,
    payload: { kind: 'unitInCity', unit: 'SETTLER' } },
  // ----- DIPLOMACY
  { id: 'GOVERNOR_TITLE', hut: 'DIPLOMACY', weight: 15, turn: 30,
    payload: { kind: 'governorTitle', amount: 1 } },
  { id: 'ENVOY', hut: 'DIPLOMACY', weight: 40,
    payload: { kind: 'envoy', amount: 1 } },
  { id: 'FAVOR', hut: 'DIPLOMACY', weight: 45, turn: 30,
    payload: { kind: 'favor', amount: 20 } },
];
