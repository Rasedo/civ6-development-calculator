/**
 * THE WAR KINDS — every `DIPLOACTION_DECLARE_*_WAR` row of the install
 * (Base `DiplomaticActions.xml`, updated by `Expansion1_DiplomaticActions.xml`,
 * layered Base <- Exp1 <- Exp2 and read last-wins), ONE table both engines
 * address by position: the code IS the row index, on the wire, in the record
 * and in every store.
 *
 * Each row carries what the install's columns say about it:
 *   - `civic`: `InitiatorPrereqCivic` (null where the row has none);
 *   - `denounceTurns`: `DenouncementTurnsRequired` — the age a standing
 *     denouncement must have reached (-1 where the row has no such column: a
 *     Surprise war asks for nothing). CIV6 (Formal War): "a player that
 *     Denounced you or that you have Denounced at least 5 turns ago" — the
 *     denouncement may stand in EITHER direction;
 *   - `condition`: the casus belli's own requirement column
 *     (`RequiresConvertedCity`, `RequiresOccupiedFriendlyCity`,
 *     `RequiresOccupiedCity`, `RequiresWarOnAlliedCityState`,
 *     `RequiresLeadXEras` 2, `RequiresAdjacentEmpires`,
 *     `RequiresGoldenAgeCommemorationType` COMMEMORATION_MILITARY,
 *     `RequiresBrokenPromise`, `RequiresDifferentLateGovernment`);
 *   - `pct`: `WarmongerPercent` / `CaptureWarmongerPercent` /
 *     `RazeWarmongerPercent` — the three columns the grievance ledger scales
 *     its declaration and city bases by.
 *
 * JOINT WAR and THIRD PARTY WAR are AGREEMENTS (`Agreement="true"`), not
 * kinds, and are not rows here.
 */
/** CIV6 (Formal War, DenouncementTurnsRequired): "Denounced ... at least 5
 *  turns ago" — the age the Formal kind's denouncement must have reached. */
export const FORMAL_WAR_MIN_TURNS = 5;

export type WarKindId =
  | 'surprise' | 'formal' | 'holy' | 'liberation' | 'reconquest' | 'protectorate'
  | 'colonial' | 'territorial' | 'golden' | 'retribution' | 'ideological';

/** The requirement column a kind reads, beyond its civic and denouncement. */
export type WarCondition =
  | 'none'
  /** CIV6 (Holy War): "a power that has religiously converted one of your cities" */
  | 'convertedCity'
  /** CIV6 (Liberation War): "a power that has captured a city from one of your friends or allies" */
  | 'occupiedFriendlyCity'
  /** CIV6 (Reconquest War): "a power that has captured one of your cities" */
  | 'occupiedCity'
  /** CIV6 (Protectorate War): "a power that has attacked one of your allied city-states" */
  | 'warOnMyCityState'
  /** CIV6 (Colonial War): "a power that is two technology eras behind you" */
  | 'leadTwoEras'
  /** CIV6 (Territorial War): "a power that borders your empire. Must have 2
   *  of your cities within 10 tiles of 2 opponents' cities." */
  | 'adjacentEmpires'
  /** CIV6 (Golden Age War): "while you are in a Golden Age with a 'To Arms!' Dedication" */
  | 'toArms'
  /** CIV6 (War of Retribution): "a player who has broken a promise to you
   *  within the past 30 turns" — neither engine holds a promise, so no seat
   *  ever meets it (docs/AUDIT.md C-76). */
  | 'brokenPromise'
  /** CIV6 (Ideological War): "a player who is in a different Tier 3 government" */
  | 'differentLateGovernment';

/** the wire's index space for a condition — both engines address one by position */
export const WAR_CONDITIONS: readonly WarCondition[] = [
  'none', 'convertedCity', 'occupiedFriendlyCity', 'occupiedCity', 'warOnMyCityState',
  'leadTwoEras', 'adjacentEmpires', 'toArms', 'brokenPromise', 'differentLateGovernment',
];

export interface WarKindDef {
  id: WarKindId;
  civic: string | null;
  denounceTurns: number;
  condition: WarCondition;
  /** [declaration, capture, raze] percent of the grievance bases */
  pct: readonly [number, number, number];
}

export const WAR_KINDS: readonly WarKindDef[] = [
  { id: 'surprise', civic: null, denounceTurns: -1, condition: 'none', pct: [150, 150, 450] },
  { id: 'formal', civic: null, denounceTurns: FORMAL_WAR_MIN_TURNS, condition: 'none', pct: [100, 100, 300] },
  { id: 'holy', civic: 'DIPLOMATIC_SERVICE', denounceTurns: 5, condition: 'convertedCity', pct: [50, 50, 50] },
  { id: 'liberation', civic: 'DIPLOMATIC_SERVICE', denounceTurns: 5, condition: 'occupiedFriendlyCity', pct: [0, 100, 600] },
  // Expansion1_DiplomaticActions.xml moves the next two from Diplomatic
  // Service to Defensive Tactics
  { id: 'reconquest', civic: 'DEFENSIVE_TACTICS', denounceTurns: 5, condition: 'occupiedCity', pct: [0, 0, 0] },
  { id: 'protectorate', civic: 'DEFENSIVE_TACTICS', denounceTurns: 0, condition: 'warOnMyCityState', pct: [0, 100, 300] },
  { id: 'colonial', civic: 'NATIONALISM', denounceTurns: 5, condition: 'leadTwoEras', pct: [50, 50, 300] },
  { id: 'territorial', civic: 'MOBILIZATION', denounceTurns: 5, condition: 'adjacentEmpires', pct: [75, 75, 150] },
  { id: 'golden', civic: null, denounceTurns: 0, condition: 'toArms', pct: [25, 25, 300] },
  { id: 'retribution', civic: 'EARLY_EMPIRE', denounceTurns: 5, condition: 'brokenPromise', pct: [50, 50, 200] },
  { id: 'ideological', civic: 'IDEOLOGY', denounceTurns: 5, condition: 'differentLateGovernment', pct: [50, 50, 150] },
];

export const WAR_KIND_SURPRISE = 0;
export const WAR_KIND_FORMAL = 1;
export const WAR_KIND_HOLY = 2;
export const WAR_KIND_LIBERATION = 3;
export const WAR_KIND_RECONQUEST = 4;
export const WAR_KIND_PROTECTORATE = 5;
export const WAR_KIND_COLONIAL = 6;
export const WAR_KIND_TERRITORIAL = 7;
export const WAR_KIND_GOLDEN = 8;
export const WAR_KIND_RETRIBUTION = 9;
export const WAR_KIND_IDEOLOGICAL = 10;

export function warKindCode(id: WarKindId): number {
  return WAR_KINDS.findIndex((k) => k.id === id);
}

/** The per-kind percent columns by id — a view of the table for readers
 *  that name a kind rather than address one. */
export const WAR_GRIEVANCE_PCT: Readonly<Record<WarKindId, readonly [number, number, number]>> =
  Object.fromEntries(WAR_KINDS.map((k) => [k.id, k.pct])) as Record<WarKindId, readonly [number, number, number]>;

/** CIV6 (Territorial War): "2 of your cities within 10 tiles of 2 opponents'
 *  cities" — the pair count and the reach. */
export const TERRITORIAL_WAR_CITIES = 2;
export const TERRITORIAL_WAR_RANGE = 10;
/** CIV6 (Colonial War, RequiresLeadXEras): "two technology eras behind you". */
export const COLONIAL_WAR_ERA_LEAD = 2;
/** CIV6 (Ideological War): "a different Tier 3 government" — the install's
 *  `Tier3` and the Gathering Storm `Tier4` rows are both LATE governments. */
export const LATE_GOVERNMENT_TIER = 3;

/** CIV6 (TRAIT_TERRITORIAL_WAR_*, TRAIT_LIBERATION_WAR_*): every declared-war
 *  modifier of the roster carries `TurnsActive` 10 — the buff lives while the
 *  war the seat declared is under this many turns old. */
export const WAR_BUFF_TURNS = 10;
