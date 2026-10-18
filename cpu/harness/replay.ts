/**
 * THE ACTION REPLAY: the TS engine run FREE from the first record, fed only
 * the recorded players' decisions, and compared each turn with the record.
 *
 * The first record is imported (`importTurn`) and from then on the state is
 * the engine's own. For each record pair t -> t+1 the replay takes the
 * decisions an `ActionSource` reads off the records (`replayActions.ts`),
 * lands the active player's before the engine's turn and every other
 * player's after it (when each was taken), runs `endTurn`, and compares the
 * engine's state with record t+1:
 *
 *   - STATE: every city's size, boxes, plots, loyalty, buildings, districts,
 *     production and religious pressure; every seat's purse, research,
 *     civics, era score, government; every unit's roster and health; every
 *     plot's owner, improvement, feature and resource — against the importer's
 *     reading of record t+1, so both sides use the same ids;
 *   - READERS: the per-turn harness's own state checks (`stateChecks`) asked
 *     of the engine's state, each failure split by whether the per-turn
 *     harness passes the same check on the imported record (the engine left
 *     the record: `drift`) or fails it there too (`rule`).
 *
 * Only decisions are re-synced, never outcomes. Where a decision cannot be
 * carried out through the engine's own verbs (the engine refuses it, or no
 * verb takes it), the recorded outcome of THAT decision is imposed and
 * counted per kind (`fallbacks`), so a divergence can be told apart from a
 * decision the replay could not express. The generator is held on the
 * game's stream at every draw of its rules (`streamHold`): each seat's start
 * from its player's witness, the random-event step and each labelled draw
 * from the game's draw log where the recording kept it.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { BarbTribe, City, CityState, DistrictId, GameState, QueueItem, Seat, SeatActionRecord, Unit } from '../core/types';
import { hexDistance, neighbors } from '../../world/hex';
import { isWater } from '../../world/query';
import { NO_SEAT, type Governor } from '../core/types';
import { endTurn, foundCity, foundCityAt, buyTile, settlerCost, projectCost, unitStepCost, unitsAcquired, buildingPurchaseCost,
  buyWorshipBuilding, purchaseBuildingWithFaith, purchaseCivilianWithFaith, purchaseReligiousUnit, purchaseUnitWithFaith,
  purchaseSettler, unitGoldPrice, availableProjects, goldAffordable, buildingFaithPrice, wonderChargeBoost, adoptBeliefs,
  serialize, deserialize, itemCost } from '../core/game';
import { completeQueueItem } from '../core/production';
import { applySeatActionRecord, applySeatUnitOrders, buySeatBuilding, declareWar, districtSiteCost, districtSiteLegal, foundPantheon, grantPantheonUnit, levyGoldCost, levyUnits, paveGround,
  placeSeatDistrict, putOffer, answerOffer, denounce, sueForPeace, transferCity, cityStrikeAt, holdCityStrikes } from '../core/phase';
import { addEnvoys, cityStateAt, declareWarOnCityState, minorCity, placeCityStateAt, sueForPeaceWithCityState } from '../core/cityStates';
import { availableBuildings, canPlaceWonder, validImprovements, wallsMax } from '../core/rules';
import { builderHarvest, builderRemoveFeature, spawnUnit, trainableUnits, builderCost, traderCost, disbandUnit, drawAndPayGoody, grantedMoves, restUnit, upgradeUnit, unitsAt, unitDomain, fortifyBonus, crossesRiver, waterWalks, cityAtIndex, raiseBestTrained } from '../core/units';
import { availableCivicsIn, availableTechsIn, computeUnlocks, fitPolicies, goldPrice, governmentSlots, seatGovernment, darkAgeEra,
  unlockedPolicyIds } from '../core/effects';
import { selectResearch, chopGrant, harvestGrant, applyLumpYield, holdResearchEra, researchCost } from '../core/economy';
import { computeCityStats } from '../core/city';
import { getModifiers } from '../core/effects';
import { researchAiChoice, researchAnalysis, type ResearchEntry } from '../core/aiResearch';
import { civicAiChoice, civicAnalysis, type CivicEntry } from '../core/aiCivics';
import { detectBoosts, grantBoost, markBoost } from '../core/boosts';
import { recordMoments } from '../core/moments';
import { applyGovernorActions, governorsOf } from '../core/governors';
import { GOVERNOR_PROMOTIONS, GOV_APPOINT, GOV_ASSIGN_CITY, GOV_ASSIGN_MINOR, GOV_PROMOTE, promotionBit } from '../data/governors';
import { BOOSTS } from '../data/boosts';
import { chargeUnitResource, upgradeGoldCost } from '../core/stockpile';
import { applyTrainingGrants, cityStrikeStrength, clearCampFor, flankSupportLive, hostilePillage, meleeAttack, rangedAttack, seizeCivilian, terrainDefense } from '../core/combat';
import { barbarianTactics, dangerPlane, freeCityTactics, holdBarbarians, refreshBarbarians, tacticsDrawing, traceTactics } from '../core/tactical';
import { barbSlots, barbSlotsDying, barbarianRules, barbScoutLook, foundTribe, tribeDies, tribeKindAt } from '../core/barbarians';
import { DIFFICULTIES } from '../data/barbarians';
import { MINOR_UPGRADE_GOLD, LEVY_TURNS } from '../data/cityStates';
import { addCsTradeRoute, addIntlTradeRoute, addTradeRoute, minorRouteTo, routeDestCenter, routeOriginCenter } from '../core/trade';
import { questCampCleared, questRouteStarted, questUnitAdded } from '../core/quests';
import { commitDedications, goodyMoment, pantheonMoment, religionMoment, unitKillEvent } from '../core/eras';
import { initFog, revealAround, unitSeesThrough, unitSight } from '../core/fog';
import { BARB_SEAT, cityStateOfSeat, civsAtWar, delegationWith, FREE_SEAT, isBarbSeat, isCityStateSeat, isCiv, MISSION_DELEGATION, MISSION_EMBASSY, prophetsOf, seatOf, setDelegationWith, setPeaceTurnWith, setTileOwner, setWar, tileSeat, unitsOf } from '../core/seats';
import { activateGreatPerson, gpActivateOk, gpClassOfUnit } from '../core/gpAbility';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { PROJECTS } from '../data/projects';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST } from '../data/policies';
import { BELIEF_CATALOGS, BELIEF_CLASS_FOLLOWER, BELIEF_SLOTS, PANTHEONS, PANTHEON_IDS, RELIGION_INITIAL_BELIEFS, RELIGION_TYPES, beliefIdAt, gainPopulationPressure } from '../data/religion';
import { missionOf, missionPayable } from '../core/deals';
import { DEAL_MISSION, DELEGATION_COST, EMBASSY_COST } from '../data/seats';
import { UNITS, UNIT_HP } from '../data/units';
import { CAMP_DISPERSAL_GOLD, MP_SCALE, scaleByGameSpeed } from '../data/constants';
import { PROMOTE_HEAL, aiPromotionPick, attacksPerTurn, takePromotion, unitPromoRows } from '../core/promotions';
import { fireFeature } from '../data/disasters';
import { holdMinorCatchUp, holdMinorOrders, minorCombatDesire, minorResearch, minorSetItem, minorBuildFacts, minorKnowledge, minorKnownUnits, minorItemKey, minorUnitPrice, minorUpgradeUnit, holdLevies, releaseLevies } from '../core/minorBuild';
import { DEDICATED_IMPROVEMENTS, IMPROVEMENT_IDS, unitActionIndex } from '../core/unitActions';
import { loadCatalog, type Catalog, type DumpCity, type TurnRecord } from './record';
import { num, bool } from './record';
import { holdMinorClears, minorAiTurn, minorMilitaryTurn, traceMinorAi } from '../core/minorCityAi';
import { cityStateMilitary, traceMinorOps } from '../core/minorOps';
import { traceBarbOps } from '../core/barbarianOps';
import { opsOf } from '../core/operations/manager';
import { opUnits } from '../core/operations/operation';
import { newCityAi } from '../core/aiCityTrees';
import { newEconomicMemory, savingsTurn } from '../core/aiEconomic';
import { FX } from '../core/aiValue';
import { advanceHistory, aliasOrPrefixed, engineRowOf, importTurn, minorHead, newHistory, type History, type Imported } from './import';
import { loadCityBuildTables, newCityBuildTally, tallyBuildings, type CityBuildTally } from './cityBuildLog';
import { buildingTable } from '../core/aiCityBuild';
import { replayEvents } from './eventReplay';
import { loadCombatLog, loadRandLog, randLogPath, type RandLog } from './randLog';
import { streamHold, type StreamHold } from './streamHold';
import { holdRng, randRange, rngHold } from '../core/rand';
import { seedMoments, stateChecks, transitionChecks, type CheckResult } from './checks';
import { engineId, gameHash, gameTypeOf } from '../data/aliases';
import { MajorAiProbe, majorAiMarkdown, type MajorAiTally } from './majorAi';
import { ReligionProbe, religionAiMarkdown, type ReligionActions, type ReligionAiTally } from './religionAi';
import { GovernorProbe, applyGovernorTurn, governorAiMarkdown, type GovernorAiTally } from './governorAi';
import { CongressProbe, congressAiMarkdown, type CongressAiTally } from './congressAi';
import { GreatPeopleProbe, greatPeopleAiMarkdown, type GreatPeopleAiTally } from './greatPeopleAi';
import { CityBuildProbe, cityBuildAiMarkdown, type CityBuildAiTally } from './majorCityBuildAi';
import { majorItemType } from '../core/majorCityBuild';
import { holdCongressBallots } from '../core/congress';
import { enhanceRecord, foundingRecord, pantheonRecord } from '../../ai/major/religion';
import { DiplomacyProbe, diplomacyMarkdown, type DiplomacyTally } from './majorDiplomacy';
import { DiploSender, senderMarkdown, type SenderTally } from './diploSender';
import { answerAction } from '../../ai/major/diploState';
import { majorView, type MajorViewInputs } from '../core/majorView';
import type { PickedAction } from '../../ai/major/diploActions';
import { SettleProbe, settleMarkdown, type SettleTallies } from './settleAi';
import { StrategyProbe, recordMilitary, strategyMarkdown, type ContactTally, type StrategyTally } from './strategyAi';
import { OperationsProbe, operationsMarkdown, type OperationsTally } from './operationsAi';
import { GREAT_PEOPLE, gpChargesOf } from '../data/greatPeople';
import { InferredActions, RecordedActions, activePlayer, type ActionSource, type Decision, type LogTally, type QueueSpec } from './replayActions';

/** what became of one decision */
type Outcome = 'applied' | 'fallback' | 'refused';

/** a village's Gold or Faith below this is the turn's income moving, not a reward */
const VILLAGE_MIN = 8;

/** a human seat's camp dispersal past the engine's: the camp's DispersalGold
 *  (50) plus the human's change through the speed, less the engine's own.
 *  The change is LinearScaleFromDefaultHandicap −5 a level from Prince, which
 *  the lab's human seat reads as +5: 27 online on every clean clear
 *  (runs/h1_duelw1118 Rome t10 45 + 5 → 77, 1120 t36, 1121 t36, 1123 t61;
 *  an AI's 25, 1116 China t7) */
const HUMAN_CAMP_GOLD = scaleByGameSpeed(50 + 5) - CAMP_DISPERSAL_GOLD;

/** every major's handicap in the lab's games (tools/civ6lab/h1/h1_duel.json
 *  "difficulty": DIFFICULTY_WARLORD): the AI's too — its victory manager's
 *  Rapid Expansion falls to "Handicap at or below 2" at t1 in every duel
 *  (AI_Victories.csv "Forbidden", the AI seat's as the human's) */
const LAB_HANDICAP = DIFFICULTIES.indexOf('WARLORD');

/** the engine-side bookkeeping the replay carries across turns */
interface Ctx {
  state: GameState;
  /** the AI majors' religion port: their seats, the probe holding their
   *  scores, the strategies they follow this pair, the turns the port
   *  founded each one's pantheon */
  religionPort: { seats: ReadonlySet<number>; probe: ReligionProbe; inputs: MajorViewInputs; pantheonTurn: Map<number, number>;
    mustFound: Set<number> };
  /** the pair's Fortify orders: unit -> the order's place in the log and the
   *  fortification record t+1 shows (`dugIn`) */
  fortified: Map<string, { ord: number; turns: number }>;
  cat: Catalog;
  W: number;
  seatOfPlayer: Map<number, number>;
  playerOfSeat: Map<number, number>;
  /** record unit `${owner}:${id}` -> the engine unit */
  units: Map<string, Unit>;
  /** the production a city banked on an item it switched away from, by
   *  `${centre}|${itemKey}` (the game keeps it on the item) */
  retained: Map<string, number>;
  /** the city-states the first record holds no city for, by player id */
  pendingMinors: Map<number, CityState>;
  /** the importer's reading of record t+1, the ids every imposed outcome
   *  takes */
  next: Imported;
  /** the pair's first record */
  prev: TurnRecord;
  /** decision tallies, by `${kind}` and outcome */
  tally: Map<string, Record<Outcome, number>>;
  /** this pair's fallbacks, by player id */
  fellBack: Map<number, string[]>;
  /** this pair's imposed outcomes (every fallback), by kind */
  imposed: Map<string, number>;
  /** why the engine refused a decision, by kind and its rule's reason */
  reasons: Map<string, Map<string, number>>;
  /** the record's units (`owner:id`) the engine's own turn destroyed */
  engineKilled: Set<string>;
  /** this pair's moved units' steps (`move`'s path), by `owner:id` */
  paths: Map<string, number[]>;
  /** the units a barbarian's battle of this pair struck or fought with,
   *  as they stood before its first blow: the barbarians' AI takes its turn
   *  from there (`barbarianAi`) */
  barbBlows: Map<Unit, Unit>;
  /** the units a city-state's, a Free City's or a barbarian's battle of this
   *  pair struck or fought with, as they stood before its first blow: the
   *  minors' AI takes its turn from there (`minorAi`), its own operations
   *  fighting those battles in its pass */
  minorBlows: Map<Unit, Unit>;
  /** the barbarian units' plots of this pair the record's steps entered,
   *  in their order, for their scouts' looks at the end of the barbarians'
   *  turn (`barbarianTurn`) */
  barbSteps: { u: Unit; plots: number[] }[];
  /** the other players' envoys this pair staged for the engine's turn (`stageEnvoys`) */
  envoys: EnvoyDecision[];
  /** the record's units (`owner:id`) a battle of this pair the engine fought */
  battled: Set<string>;
  /** the record's new barbarian units of this pair, which the barbarians'
   *  rules close it with (`barbarianTurn`) */
  barbNew: string[];
  /** the game's tactical log: per turn, per barbarian unit ID, the first
   *  move it took, and the turn's Wander rows (`loadTactical`) */
  tactical?: Tactical;
  /** the barbarians' moves against the game's, by the game's move */
  barbTally: Record<string, BarbTally>;
  /** the city-states' and the Free Cities' moves against the game's, by the
   *  game's move, and their "Random Direction" draws (`minorAi`) */
  minorTally: Record<string, BarbTally>;
  minorDraws: MinorDrawTally;
  /** the players' envoys of this pair that land after its moves (`settleEnvoys`) */
  lateEnvoys: EnvoyDecision[];
  /** the game's draw log, where the recording kept it */
  log?: RandLog;
  /** the hold on the game's stream (`streamHold`) */
  stream: StreamHold;
  /** the research AI's choices against the record's and the game's AI log
   *  (`ResearchAiTally`), and each seat's research as the pair opened */
  researchAi: Record<ResearchParty, ResearchAiTally>;
  researchBefore: Map<number, string | null>;
  /** the game's AI log of research (`<dump>.logs/AI_Research.csv`): per
   *  `${turn}:${player}` the row researched and the goal */
  aiResearchLog: Map<string, AiResearchRows>;
  researchScores: Record<ResearchParty, ResearchScoreTally>;
  /** the civics AI's choices against the record's (`ResearchAiTally`, no
   *  log names the civic chosen), each seat's civic as the pair opened, the
   *  game's AI log of civics (`<dump>.logs/AI_GovtPolicies.csv`, per
   *  `${turn}:${player}` every Civic row it scored), its analysis against
   *  it, and each major's analysis of the pair before (what a completion's
   *  choice reads) */
  civicAi: Record<ResearchParty, ResearchAiTally>;
  civicBefore: Map<number, string | null>;
  aiCivicLog: Map<string, Map<string, { score: number; turns: number }>>;
  civicScores: Record<ResearchParty, ResearchScoreTally>;
  majorCivicEntries: Map<number, CivicEntry[]>;
  /** the game's city build value tables (`<dump>.logs/AI_CityBuild.csv`'s
   *  PLOT ANALYSIS LOG, the verbose recordings) and the city-states' tables
   *  of the engine's analysis against them, in all and per building */
  cityBuildLog: Map<string, number[]>;
  cityBuild: CityBuildTally;
  cityBuildPer: Map<string, CityBuildTally>;
  /** the majors' governor AI, whose turn an AI major's `governors` decision
   *  lands (`GovernorProbe`) */
  governorAi: GovernorProbe;
  /** the majors' city production AI, asked at each production decision of
   *  an AI major's empty city (`CityBuildProbe`) */
  cityBuildAi: CityBuildProbe;
  /** the operations measured (`OperationsProbe`), and the city-states'
   *  operation lines and candidate lines of the pair, by seat */
  operationsAi: OperationsProbe;
  minorOps: Map<number, { lines: string[]; evals: string[] }>;
}

/** THE RESEARCH AI MEASURED: the choices the engine's research AI made (a
 *  city-state's, in its turn) or would make (a major's, at each research
 *  decision of the record), how many the record's research took, how many
 *  the game's AI log names (its RESEARCHING row of the turn, where it logs
 *  the player), and the first that differs from the record */
export interface ResearchAiTally {
  choices: number;
  record: number;
  logged: number;
  log: number;
  random: number;
  first?: { turn: number; player: number; ours: string | null; record: string | null; log: string | null };
}

const newResearchTally = (): ResearchAiTally => ({ choices: 0, record: 0, logged: 0, log: 0, random: 0 });

/** the game's AI research log beside the dump, or an empty map */
function loadAiResearchLog(dumpPath: string): Map<string, AiResearchRows> {
  const out = new Map<string, AiResearchRows>();
  const path = dumpPath.replace(/\.jsonl$/, '.logs/AI_Research.csv');
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n').slice(1)) {
    const p = line.split(',').map((x) => x.trim());
    if (p[2] !== 'Tech') continue;
    const k = `${p[0]}:${p[1]}`;
    const row = out.get(k) ?? { tech: null, goal: null, rows: new Map() };
    const eid = engineId('tech', p[3], 'TECH_', TECHS);
    if (!eid) continue;
    row.rows.set(eid, { score: Number(p[4]), turns: Number(p[6]), owned: p[5] === 'OWNED' });
    if (p[5] === 'RESEARCHING') row.tech = eid;
    else if (p[5] === 'GOAL') row.goal = eid;
    out.set(k, row);
  }
  return out;
}

/** a turn's AI research log of one player: the row researched, the goal,
 *  and every row it scored */
interface AiResearchRows {
  tech: string | null;
  goal: string | null;
  rows: Map<string, { score: number; turns: number; owned: boolean }>;
}

/** THE RESEARCH AI'S ANALYSIS against the log: per party, the rows the log
 *  scored at the turn, those whose turns the engine's analysis gives, and
 *  those whose score it gives within the log's rounding */
export interface ResearchScoreTally {
  rows: number;
  turns: number;
  score: number;
  first?: { turn: number; player: number; tech: string; log: [number, number]; ours: [number, number] };
}

/** the game's AI log of civics beside the dump, or an empty map */
function loadAiCivicLog(dumpPath: string): Map<string, Map<string, { score: number; turns: number }>> {
  const out = new Map<string, Map<string, { score: number; turns: number }>>();
  let text = '';
  try {
    text = readFileSync(dumpPath.replace(/\.jsonl$/, '.logs/AI_GovtPolicies.csv'), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n').slice(1)) {
    const p = line.split(',').map((x) => x.trim());
    if (p[2] !== 'Civic') continue;
    const eid = engineId('civic', p[3], 'CIVIC_', CIVICS);
    if (!eid) continue;
    const k = `${p[0]}:${p[1]}`;
    const rows = out.get(k) ?? new Map();
    rows.set(eid, { score: Number(p[4]), turns: Number(p[5]) });
    out.set(k, rows);
  }
  return out;
}

/** the research and civics AIs' parties: the majors, the city-states, the
 *  Free Cities */
type ResearchParty = 'major' | 'minor' | 'free';

/** a civics AI analysis against the log's rows of the turn (the log lists
 *  every row with turns at least 0) */
function civicScoreAgainstLog(ctx: Ctx, kind: ResearchParty, turn: number, player: number, entries: readonly CivicEntry[]): void {
  const logged = ctx.aiCivicLog.get(`${turn}:${player}`);
  if (!logged) return;
  const t = ctx.civicScores[kind];
  const ours = new Map(entries.map((e) => [e.civic, e]));
  for (const [civic, g] of logged) {
    const e = ours.get(civic);
    if (!e) continue;
    t.rows += 1;
    const sc = e.score / 256;
    if (e.turns === g.turns) t.turns += 1;
    if (Math.abs(sc - g.score) <= 0.051) t.score += 1;
    else if (!t.first) t.first = { turn, player, tech: civic, log: [g.score, g.turns], ours: [Math.round(sc * 10) / 10, e.turns] };
    if (TRACE.has('civicScores')) console.error(`t${turn} civic score ${kind} p${player} ${civic} log ${g.score}@${g.turns} ours ${sc.toFixed(1)}@${e.turns}`);
  }
}

/** a civics AI choice tallied against the record's civic */
function tallyCivicAi(ctx: Ctx, kind: ResearchParty, turn: number, player: number, ours: string | null, record: string | null): void {
  const t = ctx.civicAi[kind];
  t.choices += 1;
  if (ours === record) t.record += 1;
  if (!t.first && ours !== record) t.first = { turn, player, ours, record, log: null };
  if (TRACE.has('civicAi')) console.error(`t${turn} civic ${kind} p${player} ours ${ours} record ${record}`);
}

/** a research AI analysis against the log's rows of the turn */
function scoreAgainstLog(ctx: Ctx, kind: ResearchParty, turn: number, player: number, entries: readonly ResearchEntry[]): void {
  const logged = ctx.aiResearchLog.get(`${turn}:${player}`);
  if (!logged) return;
  const t = ctx.researchScores[kind];
  const ours = new Map(entries.map((e) => [e.tech, e]));
  for (const [tech, g] of logged.rows) {
    if (g.owned) continue;
    const e = ours.get(tech);
    if (!e) continue;
    t.rows += 1;
    const sc = e.score / 256;
    if (e.turns === g.turns) t.turns += 1;
    if (Math.abs(sc - g.score) <= 0.051) t.score += 1;
    else if (!t.first) t.first = { turn, player, tech, log: [g.score, g.turns], ours: [Math.round(sc * 10) / 10, e.turns] };
    if (TRACE.has('researchScores')) console.error(`t${turn} research score ${kind} p${player} ${tech} log ${g.score}@${g.turns} ours ${sc.toFixed(1)}@${e.turns}`);
  }
}

/** the holders whose research runs in the engine's turn (`minorResearch`):
 *  the city-states, then the Free Cities */
function minorHolders(state: GameState): { s: Seat; party: ResearchParty }[] {
  return [...state.cityStates.map((s) => ({ s: s as Seat, party: 'minor' as const })),
    ...(state.freeSeat ? [{ s: state.freeSeat, party: 'free' as const }] : [])];
}

/** a research AI choice tallied against the record's research and the log's */
function tallyResearchAi(ctx: Ctx, kind: ResearchParty, turn: number, player: number, ours: string | null, record: string | null): void {
  const t = ctx.researchAi[kind];
  t.choices += 1;
  if (ours === record) t.record += 1;
  const logged = ctx.aiResearchLog.get(`${turn}:${player}`);
  if (logged) {
    t.logged += 1;
    if (ours === logged.tech) t.log += 1;
  }
  if (!t.first && ours !== record) t.first = { turn, player, ours, record, log: logged?.tech ?? null };
  if (TRACE.has('researchAi')) console.error(`t${turn} research ${kind} p${player} ours ${ours} record ${record} log ${logged?.tech ?? '-'} goal ${logged?.goal ?? '-'}`);
}

/** REPLAY_TRACE=<subsystem or decision kind>,... prints every mismatch of
 *  those subsystems and every non-applied decision of those kinds, by turn,
 *  to stderr */
const TRACE = new Set((process.env.REPLAY_TRACE ?? '').split(',').filter(Boolean));
let traceTurn = 0;

function count(ctx: Ctx, kind: string, out: Outcome, player?: number, why?: string): Outcome {
  if (out !== 'applied' && (TRACE.has(kind) || TRACE.has(kind.split(':')[0]))) console.error(`t${traceTurn} ${kind} ${out} p${player ?? '-'} ${why ?? ''}`);
  const t = ctx.tally.get(kind) ?? { applied: 0, fallback: 0, refused: 0 };
  t[out] += 1;
  ctx.tally.set(kind, t);
  if (out === 'fallback') ctx.imposed.set(kind, (ctx.imposed.get(kind) ?? 0) + 1);
  if (out !== 'applied' && player !== undefined) {
    if (!ctx.fellBack.has(player)) ctx.fellBack.set(player, []);
    ctx.fellBack.get(player)!.push(`${kind}:${out}`);
  }
  if (out !== 'applied' && why) {
    const m = ctx.reasons.get(kind) ?? new Map<string, number>();
    m.set(why, (m.get(why) ?? 0) + 1);
    ctx.reasons.set(kind, m);
  }
  return out;
}

const seatOfP = (ctx: Ctx, pid: number) => ctx.seatOfPlayer.get(pid) ?? NO_SEAT;

/** the engine city (a major's or a Free City's) standing on a plot */
function cityAt(state: GameState, plot: number): City | undefined {
  for (const s of state.seats) for (const c of s.cities) if (c.centerIndex === plot) return c;
  return state.freeSeat?.cities.find((c) => c.centerIndex === plot);
}

/** the engine unit a record unit is, where the replay knows it */
function unitOf(ctx: Ctx, key: string): Unit | undefined {
  const u = ctx.units.get(key);
  return u && ctx.state.units.includes(u) ? u : undefined;
}

/** a record unit as an engine unit at its recorded plot, outside the game
 *  (`spawnRecorded` places it) */
function recordedUnit(ctx: Ctx, rec: TurnRecord, key: string, id: number): Unit | undefined {
  const u = rec.units.find((x) => `${x.owner}:${x.id}` === key);
  if (!u) return undefined;
  const seat = seatOfP(ctx, u.owner);
  const type = engineRowOf(ctx.cat, 'unit', u.type);
  if (seat === NO_SEAT || !type) return undefined;
  const def = UNITS[type];
  return {
    id, type, seat, tileIndex: u.y * ctx.W + u.x,
    movesLeft: num(u.moves) * MP_SCALE, movesFull: num(u.maxMoves) * MP_SCALE, hp: UNIT_HP - num(u.damage),
    charges: def.charges !== undefined ? num(u.buildCharges) || num(u.spreadCharges) || def.charges : null,
    xp: num(u.xp), level: num(u.level),
    ...(num(u.formation) > 0 ? { formation: num(u.formation) } : {}),
    ...(bool(u.embarked) ? { embarked: true } : {}),
  };
}

/** a record unit as a new engine unit at its recorded plot */
function spawnRecorded(ctx: Ctx, rec: TurnRecord, key: string): Unit | undefined {
  const unit = recordedUnit(ctx, rec, key, ctx.state.nextUnitId);
  if (!unit) return undefined;
  ctx.state.nextUnitId += 1;
  ctx.state.units.push(unit);
  ctx.units.set(key, unit);
  // the unit added answers the engine's Train Unit quests
  questUnitAdded(ctx.state, unit.seat, unit.type);
  return unit;
}

/** a barbarian unit the record raised, to the nearest living camp's tribe
 *  where no tribe counts it yet: a scout to the scouts of one within three
 *  plots, any other unit to the units of one within a plot (raised there
 *  this turn) */
function adoptByTribe(state: GameState, u: Unit): void {
  const def = UNITS[u.type];
  const tribes = state.barbTribes ?? [];
  if (!def || tribes.some((tr) => tr.alive && (tr.defender === u.id || tr.scouts.includes(u.id) || tr.units.includes(u.id)))) return;
  const scout = !!def.recon || (!!def.naval && !def.ranged);
  const at = state.map.tiles[u.tileIndex];
  let best: BarbTribe | undefined;
  let bd = scout ? 4 : 2;
  for (const tr of tribes) {
    if (!tr.alive || (scout && !def.recon && tr.kind !== 'NAVAL')) continue;
    const ct = state.map.tiles[tr.plot];
    const d = hexDistance(state.map, at.col, at.row, ct.col, ct.row);
    if (d < bd) [bd, best] = [d, tr];
  }
  if (!best) return;
  // the unit standing on a camp that keeps no defender is its defender
  if (!scout && u.tileIndex === best.plot && best.defender === undefined) {
    best.defender = u.id;
    return;
  }
  // a galley is a naval tribe's scout where it lacks one, else its unit
  if (scout && (def.recon || !best.scouts.some((id) => state.units.some((x) => x.id === id)))) best.scouts.push(u.id);
  else {
    best.units.push(u.id);
    (best.fresh ??= []).push(u.id);
  }
}

/**
 * THE CAMPS THE OTHER PLAYERS' UNITS TOOK in the turn, before the barbarians
 * close it: a camp the record's log removes after a unit of another player
 * stepped onto its plot is gone, its tribe dead and rampaging against that
 * unit's player (`tribeDies`), and a major's take answers its Clear
 * Barbarian Camp quests (runs/h1_duelw1127 t50: China's Warrior takes the
 * naval camp at (33,22) and dies to its Quadrireme in the barbarians' turn,
 * whose units rampage that turn).
 */
function campsTaken(ctx: Ctx, b: TurnRecord, turn: number): void {
  const { state } = ctx;
  const W = ctx.W;
  const stepped = new Map<number, number>();
  for (const a of ((b as { actions?: unknown[][] }).actions ?? [])) {
    if (a[1] !== turn) continue;
    if (a[2] === 'UnitMoved') {
      const seat = seatOfP(ctx, a[3] as number);
      if (seat !== NO_SEAT && !isBarbSeat(seat)) stepped.set((a[6] as number) * W + (a[5] as number), seat);
      continue;
    }
    if (a[2] !== 'ImprovementRemovedFromMap') continue;
    const p = (a[4] as number) * W + (a[3] as number);
    const k = state.barbSeat.camps.indexOf(p);
    const seat = stepped.get(p);
    if (k < 0 || seat === undefined) continue;
    state.barbSeat.camps.splice(k, 1);
    if (isCiv(seat)) questCampCleared(state, seat, p);
    tribeDies(state, p, seat);
  }
}

/**
 * THE BARBARIANS CLOSE THE PAIR: after every player's actions of the turn
 * (the record's, landed), their unit pool takes the game's slots (each unit
 * the replay maps in its ID's low 16 bits, `barbSlots`) and their rules run
 * (`barbarianRules`: their techs, the camp step, each tribe's turn, on the
 * barbarian player's own stream); the units their tribes raise are the
 * record's new barbarian units where they match by type, nearest first. A
 * record unit no tribe raised is the record's, and a unit a tribe raised that
 * the game did not is unmade. Their units' AI then takes its turn from where
 * the pair's first record holds them (`barbarianTactics`), and each unit's
 * move is set beside the game's tactical log and record t+1 (`tallyTactics`):
 * a unit that ends where the record holds it took the game's move, one that
 * does not stands where the record holds it (`barb:move`, imposed). The AI
 * runs on a copy of the state, so a move it took that the game did not (a
 * blow, a pillage) leaves no trace: the record's battles and pillages are the
 * pair's. Then their scouts look from the plots the record's steps entered
 * (`barbScoutLook`), a tree a report starts ticking from the next turn.
 */
function barbarianTurn(ctx: Ctx, b: TurnRecord, closing: number): void {
  const { state } = ctx;
  const before = new Set(state.units.filter((u) => isBarbSeat(u.seat)));
  // their rules open their turn, before their units move: each stands where
  // the pair's first record holds it (runs/h1_duelw1127 t22: the camp step
  // reads the Scout's sight from (8,19), where it stood before its move to
  // (9,19), and (7,20) is no candidate)
  const was = new Map<string, number>(ctx.prev.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
  const moved = new Map<Unit, number>();
  for (const [key, u] of ctx.units) {
    const at = was.get(key);
    if (!isBarbSeat(u.seat) || at === undefined || at === u.tileIndex || !state.units.includes(u)) continue;
    moved.set(u, u.tileIndex);
    u.tileIndex = at;
  }
  const slotOfKey = (key: string) => Number(key.split(':')[1]) & 0xffff;
  const pool = (state.barbPool ??= { size: 0, free: [], dying: [] });
  for (const [key, u] of ctx.units) {
    if (!isBarbSeat(u.seat) || !state.units.includes(u)) continue;
    u.slot = slotOfKey(key);
    pool.size = Math.max(pool.size, u.slot + 1);
  }
  barbSlots(state);
  // the barbarians' operation lines of the turn: their tribes' starts, their
  // run in the tactical pass, a scout's report's start
  const opLines: string[] = [];
  traceBarbOps((l) => opLines.push(l));
  barbarianRules(state, closing);
  // where the pair's first record holds each unit its moves took off
  const from = new Map([...moved.keys()].map((u) => [u, u.tileIndex] as const));
  for (const [u, at] of moved) u.tileIndex = at;
  matchNewUnits(ctx, b);
  for (const key of ctx.barbNew) {
    if (unitOf(ctx, key)) continue;
    const made = spawnRecorded(ctx, b, key);
    if (made) adoptByTribe(state, made);
    count(ctx, 'barb:unitNew', 'fallback', ctx.playerOfSeat.get(BARB_SEAT));
  }
  const mapped = new Set(ctx.units.values());
  for (const u of [...state.units]) {
    if (!isBarbSeat(u.seat) || before.has(u) || mapped.has(u)) continue;
    disbandUnit(state, u.id);
    count(ctx, 'barb:unit', 'fallback', ctx.playerOfSeat.get(BARB_SEAT));
  }
  for (const [key, u] of ctx.units) {
    if (isBarbSeat(u.seat) && !before.has(u) && state.units.includes(u)) u.slot = slotOfKey(key);
  }
  barbSlots(state);
  barbarianAi(ctx, b, closing, before, from);
  // the scouts look from each plot the record's steps of the turn entered (a
  // scout reports the cities it comes to see, `barbScoutLook`), their trees
  // ticking from the next turn
  for (const { u, plots } of ctx.barbSteps.splice(0)) {
    if (!state.units.includes(u)) continue;
    const at = u.tileIndex;
    for (const p of plots) {
      u.tileIndex = p;
      barbScoutLook(state, u);
    }
    u.tileIndex = at;
  }
  traceBarbOps(null);
  const barbPlayer = ctx.playerOfSeat.get(BARB_SEAT);
  if (barbPlayer !== undefined) ctx.operationsAi.minorTurn(closing, barbPlayer, opLines, []);
  barbSlotsDying(state);
  // the barbarians' units look round where the record holds them (their
  // moves are the record's, set without a step)
  for (const u of state.units) {
    if (isBarbSeat(u.seat)) revealAround(state, u.seat, u.tileIndex, unitSight(u, state), { seeThrough: unitSeesThrough(u) });
  }
}

/** THE BARBARIANS' UNIT AI on a copy of the state, the units that stood
 *  before their camps raised this turn's back where the pair's first record
 *  holds them (`from`, else where they stand): its moves tallied
 *  (`tallyTactics`) */
function barbarianAi(ctx: Ctx, b: TurnRecord, closing: number, before: ReadonlySet<Unit>, from: ReadonlyMap<Unit, number>): void {
  const { state } = ctx;
  const copy = deserialize(serialize(state));
  const twin = new Map<Unit, Unit>();
  state.units.forEach((u, i) => twin.set(copy.units[i], u));
  // the turn's captures are the record's, landed on the state with its
  // battles: they start their operations at the copy's turn end, and a
  // capture the copy's own moves take adds none (the record's battles are the
  // pair's); the state's list is spent there
  copy.barbCaptures = Object.assign([...(state.barbCaptures ?? [])], { push: () => 0 });
  delete state.barbCaptures;
  // the units the barbarians' battles of the pair struck (or lost) stand as
  // they were before the first blow, where the blow found them
  const acting = new Set([...before].map((u) => u.id));
  const back = new Map([...twin].map(([c, u]) => [u, c] as const));
  for (const [u, snap] of ctx.barbBlows) {
    let c = back.get(u);
    if (!c) {
      c = structuredClone(snap);
      copy.units.push(c);
      twin.set(c, u);
      if (isBarbSeat(u.seat)) acting.add(c.id);
    }
    c.hp = snap.hp;
    c.tileIndex = snap.tileIndex;
  }
  for (const [c, u] of twin) {
    const at = from.get(u);
    if (at !== undefined) c.tileIndex = at;
  }
  refreshBarbarians(copy);
  // the AI's "Random Direction" draws are the game's: the barbarians take the
  // turn's last ones, one a Wander row of the game's tactical log in its
  // order; a unit the game wandered draws its own, one it did not runs free
  const log = ctx.log;
  const rd: number[] = [];
  if (log) log.draws.forEach((d, i) => { if (d.turn === closing && d.label === 'Random Direction') rd.push(i); });
  const ids = ctx.tactical?.wanders.get(closing) ?? [];
  const theirs = rd.slice(Math.max(0, rd.length - ids.length));
  const drawOf = new Map<number, number>();
  ids.slice(ids.length - theirs.length).forEach((id, k) => drawOf.set(id, theirs[k]));
  const idOf = new Map<Unit, number>();
  for (const [key, u] of ctx.units) if (isBarbSeat(u.seat)) idOf.set(u, Number(key.split(':')[1]));
  const held = rngHold();
  holdRng({
    point: (st, point) => (st === copy ? undefined : held?.point(st, point)),
    draw: (st, max, label) => {
      if (st !== copy) { held?.draw(st, max, label); return; }
      const c = tacticsDrawing();
      const u = c ? twin.get(c) : undefined;
      const j = u ? drawOf.get(idOf.get(u) ?? -1) : undefined;
      if (log && label === 'Random Direction' && j !== undefined) st.rngState = log.stateAt(j);
    },
  });
  const moves = new Map<Unit, { move: string; plot: number; attack: number; from: number }>();
  traceTactics((c, move, plot, attack) => {
    const u = twin.get(c);
    if (u) moves.set(u, { move, plot, attack, from: from.get(u) ?? u.tileIndex });
  });
  // the danger map the barbarians' turn opens on, beside the game's logged
  // "Current Danger" of each unit it moved to safety
  const plane = dangerPlane(copy, BARB_SEAT);
  const danger = new Map<Unit, number>();
  for (const [c, u] of twin) if (isBarbSeat(c.seat)) danger.set(u, plane[c.tileIndex]);
  try {
    barbarianTactics(copy, acting);
  } finally {
    traceTactics(null);
    holdRng(held);
  }
  // the operations ran on the copy: the manager's state and the tribes'
  // (the recruit's asks, the spawn interval, the cities a raid's end and a
  // scout's report list, the scouts' trees)
  state.barbSeat.ops = copy.barbSeat.ops;
  state.barbSeat.opsNext = copy.barbSeat.opsNext;
  (copy.barbTribes ?? []).forEach((c, i) => {
    const tr = state.barbTribes?.[i];
    if (!tr) return;
    tr.op = c.op;
    tr.queue = c.queue;
    tr.every = c.every;
    tr.assaultTargets = c.assaultTargets;
    tr.raidTargets = c.raidTargets;
    tr.homing = c.homing;
  });
  // ...and the knowledge base's looks: its records name the units by id
  state.barbSeat.armyKnown = copy.barbSeat.armyKnown;
  const ended = new Map<Unit, number>();
  for (const [c, u] of twin) if (copy.units.includes(c)) ended.set(u, c.tileIndex);
  tallyTactics(ctx, b, closing, moves, ended, danger);
}

/** the game's tactical log's category for a barbarian unit's move, the
 *  homeland's several Explore rows as one */
function tacticalCategory(cat: string): string {
  return cat.startsWith('HL: Explore') ? 'HL: Explore' : cat;
}

/**
 * THE BARBARIANS' MOVES against the game's: per unit the AI moved, its move
 * beside the first row the game's tactical log (`AI_Tactical.csv`, the
 * barbarian player's rows of the turn) holds for it — an operation's units
 * hold none — and the plot it ended on (`ended`) beside record t+1's: the
 * game's move taken (`barb:move` applied), or the record's imposed. Tallied
 * by the game's move, with the first turn the engine's differed; each row
 * that logs a unit's "Current Danger" beside the engine's danger map there
 * (`danger`, the tally's "(danger)": rows, those equal).
 */
function tallyTactics(ctx: Ctx, b: TurnRecord, turn: number, moves: ReadonlyMap<Unit, { move: string; plot: number; attack: number; from: number }>,
  ended: ReadonlyMap<Unit, number>, danger: ReadonlyMap<Unit, number>): void {
  const rowsOf = ctx.tactical?.first.get(turn);
  for (const [key, u] of ctx.units) {
    if (!isBarbSeat(u.seat)) continue;
    const m = /Current Danger: (-?\d+)/.exec(rowsOf?.get(Number(key.split(':')[1]))?.extra ?? '');
    const d = danger.get(u);
    if (!m || d === undefined) continue;
    const t = (ctx.barbTally['(danger)'] ??= { units: 0, move: 0, plot: 0, plotOf: 0 });
    t.units += 1;
    if (d === Number(m[1])) t.move += 1;
    else {
      t.firstMove ??= turn;
      if (TRACE.has('tactics')) console.error(`t${turn} ${key} ${u.type} danger ${d} | game ${m[1]}`);
    }
  }
  const keyOf = new Map<Unit, string>();
  for (const [key, u] of ctx.units) keyOf.set(u, key);
  const rows = ctx.tactical?.first.get(turn);
  const at = new Map(b.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
  for (const [u, m] of moves) {
    const key = keyOf.get(u);
    if (!key) continue;
    const id = Number(key.split(':')[1]);
    const row = rows?.get(id);
    const game = rows ? tacticalCategory(row?.move ?? 'Operation') : undefined;
    const t = (ctx.barbTally[game ?? m.move] ??= { units: 0, move: 0, plot: 0, plotOf: 0 });
    t.units += 1;
    const same = game === undefined || game === tacticalCategory(m.move);
    if (same) t.move += 1;
    if (!same && t.firstMove === undefined) t.firstMove = turn;
    const want = at.get(key);
    const end = ended.get(u);
    if (want === undefined || end === undefined) continue;
    t.plotOf += 1;
    if (end === want) {
      t.plot += 1;
      count(ctx, 'barb:move', 'applied');
    } else {
      if (t.firstPlot === undefined) t.firstPlot = turn;
      count(ctx, 'barb:move', 'fallback', ctx.playerOfSeat.get(BARB_SEAT), `${game ?? m.move}: the AI's ${end}, the game's ${want}`);
    }
    // REPLAY_TRACE=tactics: each barbarian's move beside the game's
    if (TRACE.has('tactics')) {
      const xy = (p: number) => (p < 0 ? '-' : `${p % ctx.W} ${Math.floor(p / ctx.W)}`);
      console.error(`t${turn} ${key} ${u.type} from ${xy(m.from)} ${m.move} Move ${xy(m.plot)} Attack ${xy(m.attack)} at ${xy(end)}`
        + ` | game ${game ?? '-'} ${row?.extra ?? ''} at ${xy(want)}`);
    }
  }
}

/** a city-state's or the Free Cities' seat */
const minorAiSeat = (seat: number) => isCityStateSeat(seat) || seat === FREE_SEAT;

/**
 * THE CITY-STATES' AND THE FREE CITIES' UNIT AI (`cityStateTactics`,
 * `freeCityTactics`) on a copy of the state, in the game's player order,
 * after the majors' actions of the pair and before the barbarians' turn:
 * their units back where the pair's first record holds them, each in the
 * pool slot its ID names, with its Movement whole; the barbarians' units
 * where the first record holds them, those it lacks not yet raised; the
 * ground (owners, features, improvements, districts, roads) and every
 * player's research as record t+1 holds them. A
 * unit's "Random Direction" draw is the log's own where the turn's draws
 * pair one to one with its Wander and Garrison rows (every player's, in
 * order); a unit the game did not wander draws its own. Each unit's move is
 * set beside the game's tactical log and record t+1 (`tallyMinorTactics`):
 * the record's moves and battles stay the pair's.
 */
function minorAi(ctx: Ctx, b: TurnRecord, turn: number, made: ReadonlySet<Unit>): void {
  const { state } = ctx;
  const copy = deserialize(serialize(state));
  const twin = new Map<Unit, Unit>();
  state.units.forEach((u, i) => twin.set(copy.units[i], u));
  const keyOf = new Map<Unit, string>();
  for (const [key, u] of ctx.units) keyOf.set(u, key);
  const was = new Map(ctx.prev.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
  // the units the minors' and the barbarians' battles of the pair struck (or
  // lost) stand as they were before the first blow: the game fought a
  // minor's in its own pass, the barbarians' after it (runs/h1_duelw1121 t9:
  // city-state 2's Warrior, whole at its turn's start, strikes the camp's
  // Spearman in its Attack Barb Camp operation)
  const back = new Map([...twin].map(([c, u]) => [u, c] as const));
  for (const [u, snap] of ctx.minorBlows) {
    let c = back.get(u);
    if (!c) {
      c = structuredClone(snap);
      copy.units.push(c);
      twin.set(c, u);
    }
    c.hp = snap.hp;
    c.fortifyTurns = snap.fortifyTurns;
  }
  const gone = new Set<Unit>();
  for (const [c, u] of twin) {
    if (!minorAiSeat(c.seat) && !isBarbSeat(c.seat)) continue;
    const key = keyOf.get(u);
    const at = key ? was.get(key) : undefined;
    // a unit the first record lacks was made after (a purchase at the
    // player's next start, a barbarian camp's raise) — but one its city
    // trained in the engine's turn stands where it was made: a city-state's
    // production runs before its tactical pass (runs/h1_duelw1121 t16:
    // Ayutthaya's new Warrior wanders)
    if (at === undefined && !(key && made.has(u))) {
      gone.add(c);
      continue;
    }
    if (at !== undefined) c.tileIndex = at;
    if (!minorAiSeat(c.seat) || !key) continue;
    c.slot = Number(key.split(':')[1]) & 0xffff;
    c.movesLeft = grantedMoves(copy, c);
    c.movesFull = c.movesLeft;
    c.attacksLeft = attacksPerTurn(c);
  }
  copy.units = copy.units.filter((c) => !gone.has(c));
  // a city-state's research in its actions is its start's, which record
  // t+1 holds (its embarking), and the majors' as their actions left it
  // (the open-borders civic that closes their ground)
  for (const s of [...copy.cityStates, ...copy.seats]) {
    const r = seatOf(ctx.next.state, s.seat)?.research;
    if (r) s.research = { ...s.research, techs: [...r.techs], civics: [...r.civics] };
  }
  // ...and the ground as record t+1 holds it: its owners, features,
  // improvements, districts and roads, which the planning's steps read
  copy.map.tiles.forEach((t, i) => {
    const r = ctx.next.state.map.tiles[i];
    t.ownerSeat = r.ownerSeat;
    t.ownerCity = r.ownerCity;
    t.feature = r.feature;
    t.improvement = r.improvement;
    t.pillaged = r.pillaged;
    t.district = r.district;
    t.districtComplete = r.districtComplete;
    t.districtPillaged = r.districtPillaged;
    t.road = r.road;
  });
  for (const s of [...copy.cityStates, ...(copy.freeSeat ? [copy.freeSeat] : [])]) {
    const slots = copy.units.filter((c) => c.seat === s.seat).map((c) => c.slot ?? -1);
    s.unitPool = { size: Math.max(s === copy.freeSeat ? 0 : 1, ...slots.map((x) => x + 1)), free: [], dying: [] };
  }
  const log = ctx.log;
  const rows = ctx.tactical?.drawRows.get(turn) ?? [];
  const rd: number[] = [];
  if (log) log.draws.forEach((d, i) => { if (d.turn === turn && d.label === 'Random Direction') rd.push(i); });
  const drawOf = new Map<string, number>();
  ctx.minorDraws.turns += 1;
  if (rd.length === rows.length) {
    ctx.minorDraws.paired += 1;
    rows.forEach((key, k) => { if (!drawOf.has(key)) drawOf.set(key, rd[k]); });
  }
  const held = rngHold();
  holdRng({
    point: (st, point) => (st === copy ? undefined : held?.point(st, point)),
    draw: (st, max, label) => {
      if (st !== copy) { held?.draw(st, max, label); return; }
      const c = tacticsDrawing();
      const u = c ? twin.get(c) : undefined;
      const key = u ? keyOf.get(u) : undefined;
      const j = key ? drawOf.get(key) : undefined;
      if (!log || label !== 'Random Direction' || j === undefined) return;
      st.rngState = log.stateAt(j);
      ctx.minorDraws.draws += 1;
      if (log.draws[j].range === max) ctx.minorDraws.sameRange += 1;
      else ctx.minorDraws.firstOff ??= turn;
      // REPLAY_TRACE=minorTactics: each draw beside the game's
      if (TRACE.has('minorTactics')) console.error(`t${turn} ${key} draw over ${max} | game ${log.draws[j].range} v ${log.draws[j].value}`);
    },
  });
  const moves = new Map<Unit, { move: string; plot: number }>();
  traceTactics((c, move, plot) => {
    const u = twin.get(c);
    if (u) moves.set(u, { move, plot });
  });
  const playerOf = (seat: number) => ctx.playerOfSeat.get(seat) ?? seat;
  // a city-state its first record holds no city of founds it in its
  // homeland pass, after its tactical moves, which find none (0x77bf50)
  const founded = new Set(ctx.prev.cities.map((c) => c.owner));
  try {
    for (const cs of [...copy.cityStates].sort((x, y) => playerOf(x.seat) - playerOf(y.seat))) {
      if (cs.centerIndex >= 0 && founded.has(playerOf(cs.seat))) cityStateMilitary(copy, cs);
    }
    freeCityTactics(copy);
  } finally {
    traceTactics(null);
    holdRng(held);
  }
  minorOpsAfter(ctx, b, turn, copy, twin, keyOf);
  const ended = new Map<Unit, number>();
  for (const [c, u] of twin) if (copy.units.includes(c) && minorAiSeat(c.seat)) ended.set(u, c.tileIndex);
  const opOf = new Map<Unit, string>();
  for (const c of copy.cityStates) {
    for (const op of c.ops ? opsOf(c.ops) : []) {
      for (const id of opUnits(op)) {
        const u = copy.units.find((x) => x.id === id);
        const real = u ? twin.get(u) : undefined;
        if (real) opOf.set(real, op.def);
      }
    }
  }
  tallyMinorTactics(ctx, b, turn, moves, ended, opOf);
}

/**
 * THE CITY-STATES' AND THE FREE CITIES' MOVES against the game's: per unit
 * the AI moved, its move beside the first row the game's tactical log holds
 * for it in the turn, and the plot it ended on beside record t+1's — the
 * game's move taken (`minorAi:move` applied), or the record's imposed.
 */
function tallyMinorTactics(ctx: Ctx, b: TurnRecord, turn: number, moves: ReadonlyMap<Unit, { move: string; plot: number }>,
  ended: ReadonlyMap<Unit, number>, opOf: ReadonlyMap<Unit, string>): void {
  const keyOf = new Map<Unit, string>();
  for (const [key, u] of ctx.units) keyOf.set(u, key);
  const rows = ctx.tactical?.others.get(turn);
  const at = new Map(b.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
  for (const [u, m] of moves) {
    const key = keyOf.get(u);
    if (!key) continue;
    const game = rows ? tacticalCategory(rows.get(key) ?? '(no row)') : undefined;
    // the Free Cities' moves apart
    const label = `${u.seat === FREE_SEAT ? 'Free Cities: ' : ''}${game ?? m.move}`;
    const t = (ctx.minorTally[label] ??= { units: 0, move: 0, plot: 0, plotOf: 0 });
    t.units += 1;
    const same = game === undefined || game === tacticalCategory(m.move);
    if (same) t.move += 1;
    if (!same && t.firstMove === undefined) t.firstMove = turn;
    const want = at.get(key);
    const end = ended.get(u);
    if (want === undefined || end === undefined) continue;
    t.plotOf += 1;
    if (end === want) {
      t.plot += 1;
      count(ctx, 'minorAi:move', 'applied');
    } else {
      if (t.firstPlot === undefined) t.firstPlot = turn;
      const op = opOf.get(u);
      count(ctx, 'minorAi:move', 'fallback', ctx.playerOfSeat.get(u.seat),
        `${game ?? m.move}: the AI's ${end}, the game's ${want} | ours ${op ? `${op} ` : ''}${tacticalCategory(m.move)}`);
    }
    // REPLAY_TRACE=minorTactics: each unit's move beside the game's
    if (TRACE.has('minorTactics')) console.error(`t${turn} ${key} ${u.type} ${m.move}->${m.plot} at ${end} | game ${game ?? '-'} at ${want}`);
  }
}

/** THE CITY-STATES' OPERATIONS after their units' turn on the copy: their
 *  AI's state (the operations, the city AI's contracts and trees, the item
 *  a submission cleared) the engine's again; their lines of the pair against
 *  the game's logs, their units' plots against record t+1 */
function minorOpsAfter(ctx: Ctx, b: TurnRecord, turn: number, copy: GameState, twin: ReadonlyMap<Unit, Unit>,
  keyOf: ReadonlyMap<Unit, string>): void {
  const { state } = ctx;
  for (const c of copy.cityStates) {
    const cs = state.cityStates.find((x) => x.id === c.id);
    if (!cs) continue;
    if (c.ops) cs.ops = c.ops;
    if (c.cityAi) cs.cityAi = c.cityAi;
    // its knowledge base's look after its units' turn (`minorPhase`'s last),
    // before the barbarians' turn: its units on the plots record t+1 holds
    // them on, the others where the turn found them with record t+1's
    // damage (the turn's engine pass looked before its moves)
    if (c.centerIndex >= 0) {
      const held: [Unit, number, number][] = [];
      for (const [x, u] of twin) {
        if (!copy.units.includes(x) || !state.units.includes(u)) continue;
        held.push([x, x.tileIndex, x.hp]);
        if (x.seat === c.seat) x.tileIndex = u.tileIndex;
        else x.hp = u.hp;
      }
      minorKnowledge(copy, c, false);
      for (const [x, at, hp] of held) {
        x.tileIndex = at;
        x.hp = hp;
      }
      if (c.armyKnown) cs.armyKnown = c.armyKnown;
      else delete cs.armyKnown;
      if (c.campsKnown) cs.campsKnown = c.campsKnown;
      else delete cs.campsKnown;
      if (c.revealed) cs.revealed = c.revealed;
    }
    if (!c.prodItem && cs.prodItem) minorSetItem(state, cs, null);
    const player = ctx.playerOfSeat.get(cs.seat);
    if (player === undefined) continue;
    const got = ctx.minorOps.get(cs.seat);
    ctx.operationsAi.minorTurn(turn, player, got?.lines ?? [], got?.evals ?? []);
    for (const op of c.ops ? opsOf(c.ops) : []) {
      for (const id of opUnits(op)) {
        const u = copy.units.find((x) => x.id === id);
        const key = u ? keyOf.get(twin.get(u)!) : undefined;
        if (u && key) ctx.operationsAi.minorEnd(b, op.def, player, turn, key, u.tileIndex, gameTypeOf('unit', u.type, 'UNIT_'));
      }
    }
  }
  ctx.minorOps.clear();
}

/** A battle's unit set on the plot the log's steps had it: another unit of
 *  its domain the replay left there stood elsewhere in the game, which never
 *  stacks two — it steps to where record t+1 holds it (runs/h1_duelw1127 t9:
 *  the barbarians' Slinger and Spearman strike city-state 4's Warrior at
 *  401, which its other Warrior had walked off; the replay held both there
 *  and the blows fell on the other) */
function unstack(ctx: Ctx, b: TurnRecord, u: Unit): void {
  const dom = unitDomain(u.type);
  for (const [key, x] of ctx.units) {
    if (x === u || x.tileIndex !== u.tileIndex || unitDomain(x.type) !== dom || !ctx.state.units.includes(x)) continue;
    const r = b.units.find((y) => `${y.owner}:${y.id}` === key);
    if (r && r.y * ctx.W + r.x !== u.tileIndex) x.tileIndex = r.y * ctx.W + r.x;
  }
}

/**
 * THE PLAYERS' ENVOYS of the pair (the ones not sent in a start,
 * `stageEnvoys`), once its moves have landed: a major meets a city-state in
 * the move that reveals it, the first major to meet one sending it its free
 * envoy (`meetCityState`). Each minor's count from the player is brought to
 * record t+1's — through the engine's own verb, its purse's tokens, where
 * the engine's meeting has not; what the purse cannot send is the record's.
 */
function settleEnvoys(ctx: Ctx, b: TurnRecord): void {
  const { state } = ctx;
  for (const d of ctx.lateEnvoys) {
    const seat = seatOfP(ctx, d.player);
    const s = seatOf(state, seat) as Seat | undefined;
    const ms = seatOfP(ctx, d.minor);
    const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
    if (!s || !cs || seat >= state.seats.length) { count(ctx, 'envoy', 'refused', d.player); continue; }
    const want = (b.players.find((p) => p.id === d.minor)?.envoysReceived ?? []).find(([g]) => g === d.player)?.[1] ?? 0;
    const short = want - (cs.envoys[seat] ?? 0);
    if (short <= 0) { count(ctx, 'envoy', 'applied'); continue; }
    const was = cs.envoys[seat] ?? 0;
    applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [], envoys: new Array(short).fill(cs.id) });
    const got = (cs.envoys[seat] ?? 0) - was;
    // the envoys the engine's purse could not send land as the engine
    // receives any (`addEnvoys`): the stored contest, and the ground the
    // minor annexes for them
    if (got < short) addEnvoys(state, cs, seat, short - got);
    count(ctx, 'envoy', got >= short ? 'applied' : 'fallback', d.player, got >= short ? undefined : `no token in the engine purse (influence ${r3(s.influencePoints ?? 0)}, ${s.envoysAvailable ?? 0} tokens, met ${cs.met.includes(seat)})`);
  }
}

/** a queued item as the engine holds it */
function queueItem(ctx: Ctx, seat: number, city: City, s: QueueSpec): QueueItem | null {
  const { cat, state } = ctx;
  if (s.kind === 'unit') {
    const id = engineRowOf(cat, 'unit', s.row);
    if (!id) return null;
    if (id === 'SETTLER') return { kind: 'settler', progress: 0, cost: settlerCost(state, seat) };
    const cost = id === 'BUILDER' ? builderCost(state, seat) : id === 'TRADER' ? traderCost(state, seat)
      : UNITS[id].costStep !== undefined ? unitStepCost(id, unitsAcquired(state, seat, id)) : undefined;
    return { kind: 'unit', unit: id, progress: 0, ...(cost !== undefined ? { cost } : {}), ...(s.formation ? { formation: s.formation } : {}) };
  }
  if (s.kind === 'building') {
    const name = cat.buildings[s.row];
    if (cat.wonders.includes(name)) {
      const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
      return id && s.plot >= 0 ? { kind: 'wonder', wonder: id, tileIndex: s.plot, progress: 0 } : null;
    }
    const id = engineRowOf(cat, 'building', s.row);
    return id ? { kind: 'building', building: id, progress: 0 } : null;
  }
  if (s.kind === 'district') {
    const id = engineRowOf(cat, 'district', s.row) as DistrictId | null;
    const actor = seatOf(state, seat);
    if (!id || s.plot < 0 || !actor) return null;
    return { kind: 'district', district: id, tileIndex: s.plot, progress: 0,
      cost: districtSiteCost(state, actor as Seat, id, computeUnlocks(state, seat)) };
  }
  const id = engineId('project', cat.projects[s.row] ?? '', 'PROJECT_', PROJECTS);
  return id ? { kind: 'project', project: id, progress: 0, cost: projectCost(state, seat, id, city) } : null;
}

const itemKey = (q: QueueItem) => `${q.kind}:${'building' in q ? q.building : 'unit' in q ? q.unit : 'district' in q ? q.district
  : 'wonder' in q ? q.wonder : 'project' in q ? q.project : 'settler'}:${'tileIndex' in q ? q.tileIndex : -1}`;

/** may the city take this item at its head now, by the engine's own
 *  availability; a district or wonder is placed on its plot when it may */
function placeHead(ctx: Ctx, actor: Seat, city: City, q: QueueItem): boolean {
  const { state } = ctx;
  const seat = actor.seat;
  switch (q.kind) {
    case 'building': return availableBuildings(state, city).some((b) => b.id === q.building);
    case 'settler': return city.population >= 2;
    case 'unit': return trainableUnits(state, seat, city).some((d) => d.id === q.unit);
    case 'project': return availableProjects(state, city).some((p) => p.id === q.project);
    case 'district': {
      const t = state.map.tiles[q.tileIndex];
      if (t.district === q.district && city.districts.some((d) => d.tileIndex === q.tileIndex)) return true;
      const unlocks = computeUnlocks(state, seat);
      const legal = districtSiteLegal(state, city, q.district, unlocks, q.tileIndex);
      const before = city.queue.length;
      if (legal && placeSeatDistrict(state, actor, city, q.district, unlocks, q.tileIndex)) {
        const placed = city.queue.splice(before)[0];
        if (placed && placed.kind === 'district') q.cost = placed.cost;
        return true;
      }
      t.district = q.district;
      t.districtComplete = false;
      paveGround(t);
      if (!city.districts.some((d) => d.tileIndex === q.tileIndex)) city.districts.push({ type: q.district, tileIndex: q.tileIndex });
      return false;
    }
    case 'wonder': {
      const t = state.map.tiles[q.tileIndex];
      if (t.builtWonder === q.wonder) return true;
      const ok = canPlaceWonder(state, city, q.wonder, q.tileIndex, seat).ok;
      t.builtWonder = q.wonder;
      t.builtWonderComplete = false;
      paveGround(t, BUILT_WONDERS[q.wonder]?.placement.onFeature);
      if (!city.wonders.some((w) => w.id === q.wonder)) city.wonders.push({ id: q.wonder, tileIndex: q.tileIndex });
      return ok;
    }
  }
}

function applyQueue(ctx: Ctx, d: Extract<Decision, { kind: 'queue' }>): void {
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(ctx.state, seat) as Seat | undefined;
  const city = cityAt(ctx.state, d.city);
  if (!actor || !city || city.seat !== seat) {
    count(ctx, 'queue', 'refused', d.player);
    return;
  }
  const items = d.items.map((s) => ({ s, q: queueItem(ctx, seat, city, s) })).filter((x): x is { s: QueueSpec; q: QueueItem } => !!x.q);
  // an AI major's empty city: its production AI's pick beside the record's
  ctx.cityBuildAi.decide(ctx.state, ctx.state.turn, city, recordCityName(ctx, seat, city.id), majorItemType(items[0]?.q));
  const head = city.queue[0];
  const keep = head && items[0] && itemKey(head) === itemKey(items[0].q);
  for (const q of city.queue.slice(keep ? 1 : 0)) if (q.progress > 0) ctx.retained.set(`${city.centerIndex}|${itemKey(q)}`, q.progress);
  const queue: QueueItem[] = keep ? [head] : [];
  items.forEach(({ q }, i) => {
    if (i === 0 && keep) return;
    const k = `${city.centerIndex}|${itemKey(q)}`;
    q.progress = ctx.retained.get(k) ?? 0;
    ctx.retained.delete(k);
    if (i === 0) {
      const ok = placeHead(ctx, actor, city, q);
      const why = ok ? undefined : q.kind === 'building' && city.buildings.includes(q.building) ? 'already standing in the engine city'
        : q.kind === 'district' || q.kind === 'wonder' ? 'the engine refuses the site' : `the engine does not offer ${itemKey(q)} in ${city.name} (pop ${city.population}, buildings ${city.buildings.join('|')}, districts ${city.districts.map((x) => x.type).join('|')})`;
      count(ctx, `queue:${q.kind}`, ok ? 'applied' : 'fallback', d.player, why);
      if (ok && q.kind === 'unit') chargeUnitResource(ctx.state, seat, q.unit, city, q.formation ?? 0);
    }
    queue.push(q);
  });
  if (keep) count(ctx, `queue:${head.kind}`, 'applied', d.player);
  city.queue = queue;
}

function applyResearch(ctx: Ctx, player: number, row: number, civic: boolean): void {
  const kind = civic ? 'civic' : 'research';
  const s = seatOf(ctx.state, seatOfP(ctx, player));
  const id = civic ? engineId('civic', ctx.cat.civics[row], 'CIVIC_', CIVICS) : engineId('tech', ctx.cat.techs[row], 'TECH_', TECHS);
  if (!s || !id) {
    count(ctx, kind, 'refused', player);
    return;
  }
  const r = s.research;
  if (!civic) {
    // the major's research AI asked at the record's decision: after the
    // research the pair opened on completed, the completion's choice, else
    // the turn's; a random pick is taken as none
    const was = ctx.researchBefore.get(s.seat) ?? null;
    const done = was && r.techs.includes(was) ? was : null;
    const c = researchAiChoice(ctx.state, s.seat, s.sciRate ?? 0, done, () => -1);
    tallyResearchAi(ctx, 'major', ctx.state.turn, player, c?.tech ?? r.tech, id);
  } else {
    // the major's civics AI asked at the record's decision: after the civic
    // the pair opened on completed, the completion's choice over its
    // analysis of the pair before, else the turn's; a random pick is taken
    // as none
    const was = ctx.civicBefore.get(s.seat) ?? null;
    const done = was && r.civics.includes(was) ? was : null;
    const c = civicAiChoice(ctx.state, s.seat, s.culRate ?? 0, done, ctx.majorCivicEntries.get(s.seat) ?? null, () => -1);
    tallyCivicAi(ctx, 'major', ctx.state.turn, player, c ?? r.civic, id);
  }
  if ((civic ? r.civics : r.techs).includes(id)) {
    count(ctx, kind, 'refused', player, 'already complete in the engine');
    return;
  }
  if ((civic ? r.civic : r.tech) === id) {
    count(ctx, kind, 'applied');
    return;
  }
  const open = (civic ? availableCivicsIn(r) : availableTechsIn(r)).some((x) => x.id === id);
  selectResearch(r, id, civic);
  const def = civic ? CIVICS[id] : TECHS[id];
  const missing = (def?.prereqs ?? []).filter((p) => !(civic ? r.civics : r.techs).includes(p));
  count(ctx, kind, open ? 'applied' : 'fallback', player, open ? undefined : `${id} lacks ${missing.join(',') || '(no prereq missing)'}`);
  if (!open && TRACE.has(kind)) console.error(`   ${kind} engine holds [${(civic ? r.civics : r.techs).join(',')}] at ${civic ? r.civic : r.tech} ${civic ? r.civicProgress : r.techProgress}`);
}

/** the techs and civics each major completed in turn `turn` before its
 *  activation (its turn start's), from record t+1's action log: engine ids by
 *  seat */
function turnStartCompletions(ctx: Ctx, b: TurnRecord, turn: number): Map<number, { techs: string[]; civics: string[] }> {
  const out = new Map<number, { techs: string[]; civics: string[] }>();
  const active = new Set<number>();
  for (const a of (b as { actions?: unknown[][] }).actions ?? []) {
    if (!Array.isArray(a) || a[1] !== turn) continue;
    const p = Number(a[3]);
    if (a[2] === 'PlayerTurnActivated') active.add(p);
    if ((a[2] !== 'ResearchCompleted' && a[2] !== 'CivicCompleted') || active.has(p)) continue;
    const seat = ctx.seatOfPlayer.get(p);
    if (seat === undefined || !isCiv(seat)) continue;
    const civic = a[2] === 'CivicCompleted';
    const id = civic ? engineId('civic', ctx.cat.civics[Number(a[4])], 'CIVIC_', CIVICS) : engineId('tech', ctx.cat.techs[Number(a[4])], 'TECH_', TECHS);
    if (!id) continue;
    if (!out.has(seat)) out.set(seat, { techs: [], civics: [] });
    (civic ? out.get(seat)!.civics : out.get(seat)!.techs).push(id);
  }
  return out;
}

/** a Delegation or Resident Embassy a major proposed — DiplomacyManager.csv's
 *  SET_DELEGATION / SET_EMBASSY ("Processing Action From AI to AI") — and
 *  the receiver's answer: accepted where DiplomacySummary.csv names the
 *  mission that turn (player ids) */
interface MissionEvent { kind: 'delegation' | 'embassy'; from: number; to: number; accepted: boolean }

/** the logs' mission proposals and answers by the turn they were made */
function readMissions(dumpPath: string): Map<number, MissionEvent[]> {
  const out = new Map<number, MissionEvent[]>();
  const base = dumpPath.replace(/\.jsonl$/, '.logs/');
  if (!existsSync(base + 'DiplomacyManager.csv') || !existsSync(base + 'DiplomacySummary.csv')) return out;
  const rows = (f: string) => readFileSync(base + f, 'utf8').split('\n').slice(1).map((l) => l.split(',').map((x) => x.trim()));
  const accepted = new Set<string>();
  for (const c of rows('DiplomacySummary.csv')) {
    if (c[3] === 'Delegation' || c[3] === 'Embassy') accepted.add(`${c[0]}:${c[1]}:${c[2]}:${c[3] === 'Delegation' ? 'delegation' : 'embassy'}`);
  }
  for (const c of rows('DiplomacyManager.csv')) {
    if (c[4] !== 'SET_DELEGATION' && c[4] !== 'SET_EMBASSY') continue;
    const t = Number(c[0]);
    const kind = c[4] === 'SET_DELEGATION' ? 'delegation' : 'embassy';
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push({ kind, from: Number(c[1]), to: Number(c[2]), accepted: accepted.has(`${t}:${c[1]}:${c[2]}:${kind}`) });
  }
  return out;
}

/** THE TURN'S MISSIONS of the record's human majors as the two majors'
 *  actions on the engine's table: the sender's offer of its MISSION
 *  (`putOffer`), then the receiver's answer — its acceptance (`answerOffer`)
 *  where the record's receiver accepted, none where it refused (the offer
 *  lapses). The receiver's own AI answers beside every proposal of the record
 *  (`DiplomacyProbe.answer`); an AI major's proposals are its port's own
 *  (`applySenderPicks`), not fed. What the engine's table cannot carry is
 *  laid as the record holds it. */
function applyMissions(ctx: Ctx, events: readonly MissionEvent[], probe: DiplomacyProbe,
                       inputs: MajorViewInputs, fed: (seat: number) => boolean): void {
  const { state } = ctx;
  for (const e of events) {
    const a = seatOfP(ctx, e.from);
    const b = seatOfP(ctx, e.to);
    const sender = seatOf(state, a) as Seat | undefined;
    const receiver = seatOf(state, b) as Seat | undefined;
    if (!sender || !receiver || !isCiv(a) || !isCiv(b)) {
      count(ctx, 'diplo:missionOffer', 'refused', e.from);
      continue;
    }
    const want = e.kind === 'embassy' ? MISSION_EMBASSY : MISSION_DELEGATION;
    probe.answer(state, b, a, want, e.accepted, inputs);
    if (!fed(a)) continue;
    const why = missionOf(state, a) !== want ? `the sender's mission is the other kind`
      : !missionPayable(state, a, b) ? `not payable: held ${delegationWith(state, a, b)} treasury ${Math.round(sender.treasury ?? 0)}` : undefined;
    const offered = !why && putOffer(state, sender, [b, [[DEAL_MISSION, 0, 0]], []]);
    count(ctx, 'diplo:missionOffer', offered ? 'applied' : 'fallback', e.from, offered ? undefined : `${e.kind} ${e.from}->${e.to} ${why ?? 'no table'}`);
    if (!e.accepted) {
      count(ctx, 'diplo:missionAnswer', 'applied');
      continue;
    }
    const ok = offered && answerOffer(state, receiver, a) && delegationWith(state, a, b) === want;
    if (!ok) setDelegationWith(state, a, b, want);
    count(ctx, 'diplo:missionAnswer', ok ? 'applied' : 'fallback', e.to, ok ? undefined : `${e.kind} ${e.from}->${e.to}`);
  }
}

/** THE AI MAJORS' PANTHEONS (ai/major/religion.ts `pantheonRecord`): at its
 *  AI turn an AI major that may found one founds the pantheon its scores
 *  pick, through the engine's verb (`foundPantheon`) */
function portPantheons(ctx: Ctx, rec: TurnRecord): void {
  const { state } = ctx;
  const rp = ctx.religionPort;
  const view = majorView(state, rp.inputs);
  for (const seat of rp.seats) {
    // m_mustFoundPantheon: raised at an AI turn the seat may found one, acted
    // on at its next
    const raised = rp.mustFound.has(seat);
    if (!view.pantheonOpen(seat)) {
      rp.mustFound.delete(seat);
      continue;
    }
    rp.mustFound.add(seat);
    if (!raised) continue;
    const pick = pantheonRecord(view, seat, rp.probe.scoresFor(state, seat));
    if (pick.pantheon === undefined || pick.pantheon === null) continue;
    const res = foundPantheon(state, seat, pick.pantheon);
    count(ctx, 'religionAi:pantheon', res.ok ? 'applied' : 'refused', ctx.playerOfSeat.get(seat), res.ok ? undefined : res.reason);
    if (!res.ok) continue;
    rp.pantheonTurn.set(seat, state.turn - 1);
    matchNewUnits(ctx, rec);
  }
}

/** THE AI MAJORS' OWN MISSIONS (`DiploSender`): each pick's offer goes on
 *  the engine's table as its sender's action; the receiver answers as the
 *  record's did where the record holds the same proposal, else by its own
 *  AI (`answerAction`); the sender records the answer. */
function applySenderPicks(ctx: Ctx, picks: readonly (PickedAction & { owner: number })[], record: readonly MissionEvent[],
                          sender: DiploSender, probe: DiplomacyProbe, inputs: MajorViewInputs): void {
  const { state } = ctx;
  const view = majorView(state, inputs);
  for (const p of picks) {
    const from = seatOf(state, p.owner) as Seat | undefined;
    const to = seatOf(state, p.target) as Seat | undefined;
    if (!from || !to) continue;
    const kind = p.action === 'DIPLOACTION_RESIDENT_EMBASSY' ? 'embassy' : 'delegation';
    const pf = ctx.playerOfSeat.get(p.owner);
    const pt = ctx.playerOfSeat.get(p.target);
    const rec = record.find((r) => r.from === pf && r.to === pt && r.kind === kind);
    const accepted = rec ? rec.accepted
      : answerAction(view, probe.stateOf(p.target, p.owner), p.target, p.owner, p.action, kind === 'embassy' ? EMBASSY_COST : DELEGATION_COST);
    const { offer } = sender.perform(state, p.owner, p);
    const offered = !!offer && putOffer(state, from, offer);
    count(ctx, 'diplo:portOffer', offered ? 'applied' : 'refused', pf);
    const landed = offered && accepted && answerOffer(state, to, p.owner);
    count(ctx, `diplo:portAnswer:${rec ? 'record' : 'port'}`, 'applied');
    sender.answered(p.owner, p.action, !!landed);
  }
}

/** THE AI MAJORS' TRANSITIONS' ACTIONS (ai/major/diploState): a friendship
 *  offered goes on the engine's table as the sender's offer, answered by an AI
 *  receiver's own answer (`answerFriendship`) — a human seat of the record
 *  struck none; a denouncement lands through the engine's verb. */
function applyTransitions(ctx: Ctx, probe: DiplomacyProbe, sender: DiploSender, inputs: MajorViewInputs): void {
  const { state } = ctx;
  for (const x of probe.sent) {
    if (!sender.isSender(x.owner)) continue;
    const pf = ctx.playerOfSeat.get(x.owner);
    if (x.kind === 'denounce') {
      count(ctx, 'diplo:portDenounce', denounce(state, x.owner, x.other) ? 'applied' : 'refused', pf);
      continue;
    }
    const from = seatOf(state, x.owner) as Seat | undefined;
    const to = seatOf(state, x.other) as Seat | undefined;
    if (!from || !to) continue;
    const { offer } = sender.offerFriendship(state, x.owner, x.other);
    const offered = !!offer && putOffer(state, from, offer);
    count(ctx, 'diplo:portFriendship', offered ? 'applied' : 'refused', pf);
    const accepted = sender.isSender(x.other) && probe.answerFriendship(state, x.other, x.owner, inputs);
    if (offered && accepted) answerOffer(state, to, x.owner);
  }
}

type PolicyDecision = Extract<Decision, { kind: 'policies' }>;

/** a government and card set as the engine names them */
function policyIds(ctx: Ctx, d: PolicyDecision): { gid: string | null; ids: string[] } {
  const gid = d.government >= 0 ? engineId('government', ctx.cat.governments[d.government], 'GOVERNMENT_', GOVERNMENTS) : null;
  const ids = d.policies.map((i) => engineId('policy', ctx.cat.policies[i], 'POLICY_', POLICIES)).filter((x): x is string => !!x);
  return { gid, ids };
}

/** THE PENDING POLICIES. A government or card set the next record shows was
 *  slotted at the start of turn between the two records, after the civics
 *  and before the faith (runs/h1_duelw1116 China t9: God King's Faith
 *  banked, its Gold not), whichever player's: each goes on the wire, which
 *  the engine's turn lands at that point (`applySeatPolicies`). */
function stagePolicies(ctx: Ctx, ds: Decision[]): PolicyDecision[] {
  const staged = ds.filter((d): d is PolicyDecision => d.kind === 'policies');
  const turn: Record<number, SeatActionRecord> = {};
  const recOf = (seat: number): SeatActionRecord => (turn[seat] ??= { production: [], tech: null, civic: null, units: [] });
  for (const d of staged) {
    const seat = seatOfP(ctx, d.player);
    if (seat === NO_SEAT || seat >= ctx.state.seats.length) continue;
    const { gid, ids } = policyIds(ctx, d);
    const gi = gid ? GOVERNMENT_LIST.findIndex((g) => g.id === gid) : -1;
    Object.assign(recOf(seat), { government: gi >= 0 ? gi : null,
      policies: ids.map((id) => POLICY_LIST.findIndex((p) => p.id === id)).filter((i) => i >= 0) });
  }
  for (const d of ctx.envoys) {
    const seat = seatOfP(ctx, d.player);
    const ms = seatOfP(ctx, d.minor);
    const r = recOf(seat);
    r.envoys = [...(r.envoys ?? []), ...new Array(d.n).fill(cityStateOfSeat(ms))];
  }
  ctx.state.seatActions = { [ctx.state.turn - 1]: turn };
  return staged;
}

type EnvoyDecision = Extract<Decision, { kind: 'envoy' }>;

/** the generator a player's start between record b's predecessor and record
 *  b began and completed from: the last of each record b witnesses */
type BattleDecision = Extract<Decision, { kind: 'battle' }>;

/** the generator a battle's damage draws begin from: the actions of its
 *  player's turn run from the state its start completed with (`wit`'s
 *  witness) to the next player's start, and each hit the turn dealt took one
 *  "Unit Combat Damage" draw in order — the battle's first is its `seq`-th
 *  (the action log's battles, `RecordedActions`) */
function battleDraw(ctx: Ctx, wit: TurnRecord, b: TurnRecord, d: BattleDecision): number | undefined {
  const log = ctx.log;
  const post = startSeeds(wit, d.player).post;
  const from = log && post !== undefined ? log.index(post) : undefined;
  if (!log || from === undefined) return undefined;
  const stops = new Set<number>();
  for (const w of [...(b.witness ?? []), ...(wit.witness ?? [])]) {
    if (w.point === 'pre' && w.player !== d.player && typeof w.seed === 'number') stops.add(w.seed >>> 0);
  }
  let k = 0;
  for (let i = from; i < log.draws.length; i++) {
    if (i > from && stops.has(log.stateAt(i))) return undefined;
    if (log.draws[i].label !== 'Unit Combat Damage') continue;
    if (k === d.seq) return log.stateAt(i);
    k += 1;
  }
  return undefined;
}

/** A CITY'S SHOT the log fired (`cityStrikeAt`): the city's centre, or its
 *  Encampment where the shot came from there, at the plot the log's steps
 *  had the unit on, on the game's own damage draw. The engine's own cities
 *  fire none in a replay (`holdCityStrikes`). */
function strike(ctx: Ctx, wit: TurnRecord, b: TurnRecord, d: BattleDecision, s: { city: number; origin: number }): void {
  const { state } = ctx;
  const def = unitOf(ctx, d.defender);
  const major = cityAtIndex(state, s.city);
  const minor = major ? undefined : cityStateAt(state, s.city);
  const city = major?.city ?? (minor && minor.centerIndex === s.city ? minorCity(minor) : undefined);
  if (!def || !city) { count(ctx, 'battle', 'refused', d.player, def ? 'a city the replay does not hold' : 'a unit the replay does not hold'); return; }
  const s0 = battleDraw(ctx, wit, b, d);
  if (s0 === undefined) { count(ctx, 'battle', 'refused', d.player, 'no damage draw in the log'); if (TRACE.has('battle')) console.error(`   ${d.attacker || 'city@' + d.from} vs ${d.defender || 'city@' + d.at} seq${d.seq}`); return; }
  if (def.tileIndex !== d.at) def.fortifyTurns = 0;
  dugIn(ctx, d, def);
  def.tileIndex = d.at;
  if (!UNITS[def.type]?.naval && !waterWalks(def.type)) def.embarked = isWater(state.map.tiles[def.tileIndex]) || undefined;
  state.rngState = s0;
  const hp0 = def.hp;
  if (TRACE.has('battleHp')) (globalThis as { __cbLog?: string[] }).__cbLog = [];
  ctx.stream.placed(true);
  const ok = cityStrikeAt(state, city, s.origin === s.city ? 'cstk' : 'estk', cityStrikeStrength(state, city), d.at);
  ctx.stream.placed(false);
  if (TRACE.has('battleHp')) console.error(`t${traceTurn} battle ${d.player}:city@${s.city} CITY 0->0 vs ${d.defender} ${def.type} ${hp0}->${def.hp} ranged seq${d.seq} game[${d.dmg}] ours[${hp0 - def.hp},0] ${ok ? "" : "nothing to strike"} city hp${city.hp} outer${city.outerHp} walls${wallsMax(state, city)} best${seatOf(state, city.seat)?.bestRangedCS} ${((globalThis as { __cbLog?: string[] }).__cbLog ?? []).join(' | ')}`);
  if (!ok) { count(ctx, 'battle', 'refused', d.player, 'nothing to strike'); return; }
  ctx.battled.add(d.defender);
  if (!state.units.includes(def)) ctx.engineKilled.add(d.defender);
  count(ctx, 'battle', 'applied');
}

/** the game's Fortify order (`UnitOperationStarted`'s operation hash) */
const OP_FORTIFY = gameHash('UNITOPERATION_FORTIFY');

/** each unit that took the Fortify order in the pair: the order's place in
 *  the log, and the fortification record t+1 shows for it */
function fortifiedIn(b: TurnRecord): Map<string, { ord: number; turns: number }> {
  const out = new Map<string, { ord: number; turns: number }>();
  const rows = (b as { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return out;
  const dug = new Map(b.units.map((r) => [`${r.owner}:${r.id}`, num(r.fortify)]));
  for (const x of rows as unknown[][]) {
    if (x[2] !== 'UnitOperationStarted' || x[5] !== OP_FORTIFY) continue;
    const k = `${x[3]}:${x[4]}`;
    const turns = dug.get(k);
    if (turns !== undefined && !out.has(k)) out.set(k, { ord: x[0] as number, turns });
  }
  return out;
}

/** A DEFENDER THAT TOOK THE FORTIFY ORDER before the blow (in the log's
 *  order) holds the fortification record t+1 shows for it, which may stand
 *  two turns dug in after one order (runs/h1_duelw1117 t17: Rome's Warrior
 *  327683, ordered at 31 HP, defended at +6 against a barbarian Warrior and
 *  read 2; 1124 t69: an Archer's shot on Rome's Warrior, CombatLog +3 on Snow
 *  at 66 HP); a blow before the order finds it as it stood (1121 t6: a camp's
 *  Spearman struck by a city-state before its own turn's order). */
function dugIn(ctx: Ctx, d: BattleDecision, def: Unit): void {
  const f = ctx.fortified.get(d.defender);
  if (f && d.ord > f.ord && f.turns > (def.fortifyTurns ?? 0)) def.fortifyTurns = f.turns;
}

/** A UNIT'S ATTACK ON A CITY the log names (`battle` with no defender: a
 *  melee attack by its own damage, a shot by the combat log): the engine's
 *  melee or ranged attack from where the log's steps had the unit, on the
 *  city's centre or Encampment, on the game's own draws. */
function assault(ctx: Ctx, wit: TurnRecord, b: TurnRecord, d: BattleDecision): void {
  const { state } = ctx;
  const atk = unitOf(ctx, d.attacker);
  if (!atk) { count(ctx, 'battle', 'refused', d.player, 'a unit the replay does not hold'); return; }
  const s0 = battleDraw(ctx, wit, b, d);
  if (s0 === undefined) { count(ctx, 'battle', 'refused', d.player, 'no damage draw in the log'); if (TRACE.has('battle')) console.error(`   ${d.attacker || 'city@' + d.from} vs ${d.defender || 'city@' + d.at} seq${d.seq}`); return; }
  if (atk.tileIndex !== d.from) atk.fortifyTurns = 0;
  atk.tileIndex = d.from;
  if (!UNITS[atk.type]?.naval && !waterWalks(atk.type)) atk.embarked = isWater(state.map.tiles[atk.tileIndex]) || undefined;
  atk.movesLeft = Math.max(atk.movesLeft, grantedMoves(state, atk));
  atk.attacksLeft = Math.max(1, atk.attacksLeft ?? 1);
  state.rngState = s0;
  const hp0 = atk.hp;
  if (TRACE.has('battleHp')) (globalThis as { __cbLog?: string[] }).__cbLog = [];
  ctx.stream.placed(true);
  const r = d.ranged ? rangedAttack(state, atk.id, d.at) : meleeAttack(state, atk.id, d.at, atk.seat);
  ctx.stream.placed(false);
  if (TRACE.has('battleHp')) console.error(`t${traceTurn} battle ${d.attacker} ${atk.type} ${hp0}->${atk.hp} vs city@${d.at} ${d.ranged ? 'ranged' : 'melee'} seq${d.seq} game[${d.dmg}] ours[-,${hp0 - atk.hp}] ${r.ok ? '' : r.reason} ${((globalThis as { __cbLog?: string[] }).__cbLog ?? []).join(' | ')}`);
  if (!r.ok) { count(ctx, 'battle', 'refused', d.player, r.reason); return; }
  ctx.battled.add(d.attacker);
  if (!state.units.includes(atk)) ctx.engineKilled.add(d.attacker);
  count(ctx, 'battle', 'applied');
}

/** the battle trace's position terms: the defender's plot, its fortification,
 *  each side's own military units beside the defender (no civic gate) and
 *  a river between the two */
function battleTerms(state: GameState, atk: Unit, def: Unit): string {
  const dt = state.map.tiles[def.tileIndex];
  const at = state.map.tiles[atk.tileIndex];
  let fa = 0;
  let sd = 0;
  for (const t of neighbors(state.map, dt)) {
    for (const u of unitsAt(state, t.index)) {
      if (u.id === atk.id || unitDomain(u.type) !== 'military') continue;
      if (u.seat === atk.seat && !crossesRiver(state.map, dt, t) && !u.embarked) fa += 1;
      if (u.seat === def.seat) sd += 1;
    }
  }
  return `terms terr${terrainDefense(dt)} fort${fortifyBonus(def)} ${dt.terrain}/${dt.feature ?? "-"}/${dt.elevation}/${dt.improvement ?? "-"}/${dt.district ?? "-"}/o${dt.ownerSeat} flank${fa}${flankSupportLive(state, atk.seat) ? '' : 'x'} supp${sd}${flankSupportLive(state, def.seat) ? '' : 'x'} river${crossesRiver(state.map, at, dt) ? 1 : 0} atile ${at.terrain}/${at.feature ?? "-"}/${at.elevation}/${at.improvement ?? "-"}/${at.district ?? "-"}/o${at.ownerSeat} afort${fortifyBonus(atk)}`;
}

function startSeeds(b: TurnRecord, player: number): { pre?: number; post?: number } {
  const out: { pre?: number; post?: number } = {};
  const at = { pre: -Infinity, post: -Infinity };
  for (const w of b.witness ?? []) {
    if (w.player !== player || typeof w.seed !== 'number' || (w.point !== 'pre' && w.point !== 'post') || w.turn < at[w.point]) continue;
    at[w.point] = w.turn;
    out[w.point] = w.seed >>> 0;
  }
  return out;
}

/** does the giver send its envoys in its start: its start draws more border
 *  picks than its cities (one each) — the minors' annexes — by the game's
 *  log; with no log, the start (the DLL's reading) */
function envoysInStart(log: RandLog | undefined, a: TurnRecord, b: TurnRecord, player: number): boolean {
  const { pre, post } = startSeeds(b, player);
  const draws = log && pre !== undefined && post !== undefined ? log.between(pre, post) : undefined;
  if (!draws) return true;
  const picks = draws.filter((x) => x.label === 'GetNextBuyablePlot picker').length;
  return picks > a.cities.filter((c) => c.owner === player).length;
}

/**
 * THE OTHER PLAYERS' ENVOYS. A player's AI sends its envoys in its start,
 * before its cities, or in its actions after it (`tools/civ6lab/
 * dll_readings.md` "H-1: the envoy annex"; the game's log places them,
 * `envoysInStart`), and the minor annexes a plot for each with a draw there.
 * The start's go on the wire, as many as the engine's purse holds tokens
 * for, which the engine's turn spends at that seat's start
 * (`applySeatActionRecord`; runs/h1_duelw1117 t28: China's two to Caguana
 * annex 526 and 612 before Xi'an's pick). An envoy no token pays for is a
 * quest's the engine's own turn completes (t24: China's Archer, the envoy
 * to Caguana annexing 702 in China's start) or the record's, which
 * `settleEnvoys` brings once the pair's moves have landed.
 */
function stageEnvoys(ctx: Ctx, ds: Decision[], a: TurnRecord, b: TurnRecord, log: RandLog | undefined): void {
  const { state } = ctx;
  ctx.envoys = [];
  const purse = new Map<number, number>();
  for (const d of ds) {
    if (d.kind !== 'envoy' || d.phase !== 'after' || !envoysInStart(log, a, b, d.player)) continue;
    const seat = seatOfP(ctx, d.player);
    const s = seatOf(state, seat) as Seat | undefined;
    const ms = seatOfP(ctx, d.minor);
    const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
    if (!s || !cs || seat >= state.seats.length || !cs.met.includes(seat)) continue;
    const left = purse.get(seat) ?? (s.envoysAvailable ?? 0);
    const n = Math.min(d.n, left);
    purse.set(seat, left - n);
    if (n > 0) ctx.envoys.push({ ...d, n });
  }
}

/** each staged set the engine refused is the record's */
function verifyPolicies(ctx: Ctx, staged: PolicyDecision[]): void {
  for (const d of staged) {
    const s = seatOf(ctx.state, seatOfP(ctx, d.player));
    if (!s) continue;
    const { gid, ids } = policyIds(ctx, d);
    // the cards as a set: the stored layout holds its empty slots as null
    const cards = (xs: readonly (string | null)[]) => xs.filter((x): x is string => !!x).sort().join();
    const govOk = !gid || s.government.chosen === gid;
    const same = govOk && cards(s.government.policies) === cards(ids);
    let why: string | undefined;
    if (!same) {
      const gov = seatGovernment(ctx.state, s.seat);
      const open = gov ? unlockedPolicyIds(s.research, darkAgeEra(ctx.state, s.seat), s.government.held, gov)
        : new Set<string>();
      why = !govOk ? `government ${gid} not adopted (in ${s.government.chosen})`
        : ids.some((id) => !open.has(id)) ? `a card not unlocked: ${ids.filter((id) => !open.has(id)).join(',')}`
          : !fitPolicies(governmentSlots(ctx.state, s.seat), ids) ? 'the set does not fit the slots'
            : 'the unlock unaffordable';
      if (gid) s.government.chosen = gid as typeof s.government.chosen;
      s.government.policies = fitPolicies(governmentSlots(ctx.state, s.seat), ids) ?? ids;
    }
    count(ctx, 'policies', same ? 'applied' : 'fallback', d.player, why);
  }
  ctx.state.seatActions = {};
}

function applyFound(ctx: Ctx, d: Extract<Decision, { kind: 'found' }>): void {
  const { state } = ctx;
  const minor = ctx.pendingMinors.get(d.player);
  const settler = d.unit ? unitOf(ctx, d.unit) : undefined;
  if (minor) {
    ctx.pendingMinors.delete(d.player);
    // a city-state's founding (`placeCityStateAt`, the engine's setup step)
    const placed = placeCityStateAt(state, minor.id, minor.name, minor.type, d.plot);
    Object.assign(placed, { envoys: minor.envoys, met: minor.met, suzerain: minor.suzerain, research: minor.research });
    state.cityStates.sort((a, b) => a.id - b.id);
    if (settler) disbandUnit(state, settler.id);
    // the game's minor took its first turn the turn the city was founded:
    // its research and civics AIs' turns before the city stood, at no
    // Science or Culture and no resources near a city (runs/h1_duelv1124 t1:
    // every minor's Pottery at 12 turns, 78.3, Writing its goal), its
    // military AI's Combat Desire, run before the founding on a player
    // that holds no city (its PSEUDOYIELD_UNIT_COMBAT weight, which the
    // first look's unit values read: runs/h1_duelw1117 Antananarivo's Default
    // Specialization a Slinger at 8.3), its savings and military AI's turn,
    // its knowledge base's look, which that military AI reads on its next
    // turn, and its city AI's first look,
    // which runs no events and picks the Default Specialization. A minor's founding lands after the
    // engine's turn (its player is never the active one), the clock already
    // on the record's next turn: that turn stamps the founding turn's, the
    // city's founding turn first among them (runs/h1_duelw1124 Bologna:
    // AI_CityBuild.csv's Default Specialization Monument at t1, the Builder
    // contract at t3 clearing none of it). The city's boosts land on the
    // founding turn too (runs/h1_duelv1117: a coastal minor's Sailing
    // BOOSTED at 7 turns in AI_Research.csv from t2)
    state.turn -= 1;
    placed.foundedTurn = state.turn;
    try {
      minorResearch(state, placed.research, placed.seat, 0, 0, () => undefined, () => undefined, []);
      placed.combatDesire = minorCombatDesire(state, placed, state.turn - 1).desire;
      const fresh = !placed.cityAi;
      minorMilitaryTurn(state, placed);
      minorKnowledge(state, placed, false);
      minorAiTurn(state, placed, fresh);
      detectBoosts(state, placed.seat);
    } finally {
      state.turn += 1;
    }
    count(ctx, 'found:minor', 'applied');
    return;
  }
  const seat = seatOfP(ctx, d.player);
  const owner = seatOf(state, seat) as Seat | undefined;
  if (!owner || seat === BARB_SEAT) return void count(ctx, 'found', 'refused', d.player);
  if (settler) settler.tileIndex = d.plot;
  const res = foundCity(state, d.plot, seat);
  if (res.ok) return void count(ctx, 'found', 'applied');
  if (settler && state.units.includes(settler)) disbandUnit(state, settler.id);
  foundCityAt(state, seat, state.map.tiles[d.plot], owner);
  count(ctx, 'found', 'fallback', d.player, res.reason);
}

function applyBuyBuilding(ctx: Ctx, d: Extract<Decision, { kind: 'buyBuilding' }>): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(state, seat) as Seat | undefined;
  const city = cityAt(state, d.city);
  const id = engineRowOf(ctx.cat, 'building', d.building);
  if (!actor || !city || !id) return void count(ctx, 'buyBuilding', 'refused', d.player);
  if (city.buildings.includes(id)) return void count(ctx, 'buyBuilding', 'refused', d.player);
  let ok = false;
  if (d.currency === 'gold') ok = buySeatBuilding(state, actor, city, id);
  else ok = (BUILDINGS[id]?.worship ? buyWorshipBuilding(state, city.id, seat) : purchaseBuildingWithFaith(state, city.id, id, seat)).ok;
  if (!ok) {
    if (d.currency === 'gold') actor.treasury -= goldPrice(state, seat, buildingPurchaseCost(state, seat, id));
    else actor.faith -= buildingFaithPrice(state, seat, id) ?? 0;
    city.buildings.push(id);
    city.queue = city.queue.filter((q) => !(q.kind === 'building' && q.building === id));
  }
  count(ctx, `buyBuilding:${d.currency}`, ok ? 'applied' : 'fallback', d.player);
}

function applyBuyUnit(ctx: Ctx, d: Extract<Decision, { kind: 'buyUnit' }>, rec: TurnRecord): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(state, seat) as Seat | undefined;
  const city = cityAt(state, d.city);
  const id = engineRowOf(ctx.cat, 'unit', d.type);
  // a city-state's purchase is its AI's, made in its turn (`minorAiTurn`):
  // the unit it bought stands for the record's (`matchNewUnits`); where it
  // bought none the record's is imposed at the record's price
  const minor = state.cityStates.find((c) => c.centerIndex === d.city && c.seat === seat);
  if (minor) {
    if (unitOf(ctx, d.unit)) return void count(ctx, 'minorAi:buy', 'applied', d.player);
    const price = id ? minorUnitPrice(state, minor, id, d.currency) : 0;
    if (d.currency === 'gold') minor.treasury -= price;
    else minor.faith -= price;
    spawnRecorded(ctx, rec, d.unit);
    return void count(ctx, 'minorAi:buy', 'fallback', d.player, `${id}: the engine bought none (threat ${minor.threat ?? -1}, gold ${minor.treasury})`);
  }
  const kind = `buyUnit:${d.currency}`;
  if (!actor || !city || !id || city.seat !== seat) {
    spawnRecorded(ctx, rec, d.unit);
    return void count(ctx, kind, 'fallback', d.player);
  }
  const before = new Set(state.units);
  let ok = false;
  if (d.currency === 'gold') {
    if (id === 'SETTLER') ok = purchaseSettler(state, city.id, seat).ok;
    else {
      const price = unitGoldPrice(state, id, seat, city);
      if (goldAffordable(actor.treasury ?? 0, price)) {
        const u = spawnUnit(state, id, city.centerIndex, seat);
        if (u) {
          actor.treasury -= price;
          applyTrainingGrants(state, city, u);
          chargeUnitResource(state, seat, id);
          ok = true;
        }
      }
    }
  } else if (id === 'MISSIONARY' || id === 'APOSTLE' || id === 'INQUISITOR' || id === 'GURU' || id === 'WARRIOR_MONK') {
    ok = purchaseReligiousUnit(state, city.id, id, seat).ok;
  } else if (id === 'BUILDER' || id === 'SETTLER') {
    ok = purchaseCivilianWithFaith(state, city.id, id, seat).ok;
  } else ok = purchaseUnitWithFaith(state, city.id, id, seat).ok;
  const made = state.units.find((u) => !before.has(u) && u.seat === seat && u.type === id);
  if (ok && made) ctx.units.set(d.unit, made);
  else spawnRecorded(ctx, rec, d.unit);
  count(ctx, kind, ok && made ? 'applied' : 'fallback', d.player,
    d.currency === 'gold' && id !== 'SETTLER' ? `${id} price ${unitGoldPrice(state, id, seat, city)} treasury ${Math.round(actor.treasury ?? 0)}` : id);
}

/** the seat order's pillage column */
const A_PILLAGE = unitActionIndex(IMPROVEMENT_IDS).PILLAGE;

/** the decisions of one phase, in a fixed order: cities first (a founding
 *  gives the queue its city), then the seats, the cities' orders, the plots,
 *  the units, a Trader's route once its unit stands (runs/h1_duelw1117 t44:
 *  Antananarivo's Trader trained and sent in one turn); the research and
 *  civic picks last, after the blows whose
 *  boosts may complete what was in hand (runs/h1_duelw1117 t23: China's
 *  Slinger kill completed Archery, then Horseback Riding was picked) */
const ORDER: Decision['kind'][] = ['found', 'capture', 'policies', 'pantheon', 'religion', 'governors', 'war',
  'envoy', 'levy', 'levyEnd', 'routes', 'congress', 'buyPlot', 'buyBuilding', 'wonderCharge', 'queue', 'worked', 'improve', 'clear', 'buyUnit', 'move', 'village', 'gpActivate', 'unitNew', 'pillage', 'battle', 'seize', 'unitGone', 'combat', 'hit', 'kill', 'promote', 'upgrade', 'camp', 'research', 'civic'];

function applyPhase(ctx: Ctx, ds: Decision[], phase: Decision['phase'], b: TurnRecord, wit: TurnRecord): void {
  const { state, next } = ctx;
  // a unit lost in the pair was lost to a blow of whoever struck it, which
  // may be a later player's: its loss lands with the other players' actions,
  // after their battles (runs/h1_duelw1121 t12: Rome's Warrior killed in the
  // barbarians' turn)
  const phaseOf = (d: Decision) => (d.kind === 'unitGone' && d.why === 'lost' ? 'after' : d.phase);
  // the players act in the game's turn order, each its own decisions in the
  // fixed order (a levied army fights its levier's battles before its minor
  // calls it home: runs/h1_duelw1117 t42); what record t+1 shows of a unit
  // lands after every player's (its loss, its health)
  const late = (d: Decision) => (d.kind === 'unitGone' && d.why !== 'founded') || d.kind === 'combat' || d.kind === 'hit';
  const rank = (d: Decision) => (late(d) ? 1 << 20 : 'player' in d ? d.player : -1);
  const mine = ds.filter((d) => phaseOf(d) === phase)
    .sort((x, y) => (rank(x) - rank(y)) || (ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind)));
  // EACH PLAYER'S ACTIONS draw on the stream its start completed with (its
  // `PlayerTurnStartComplete` witness in `wit`: record t for the active
  // player's, record t + 1 for the others'), each player's draws its own
  // run of it (runs/h1_duelw1117 t24: China's envoy annexes Caguana's 702 on
  // the first draw past its start; t26: Stonehenge's two free plots)
  const streams = new Map<number, number>();
  let drawing: number | undefined;
  for (const d of mine) {
    const p = 'player' in d ? d.player : undefined;
    if (p !== undefined && p !== drawing) {
      if (drawing !== undefined) streams.set(drawing, state.rngState);
      const post = streams.get(p) ?? startSeeds(wit, p).post;
      if (post !== undefined) state.rngState = post;
      drawing = p;
    }
    switch (d.kind) {
      case 'queue': applyQueue(ctx, d); break;
      case 'research': applyResearch(ctx, d.player, d.tech, false); break;
      case 'civic': applyResearch(ctx, d.player, d.civic, true); break;
      case 'policies': break;
      case 'found': applyFound(ctx, d); break;
      case 'buyBuilding': applyBuyBuilding(ctx, d); break;
      case 'buyUnit': applyBuyUnit(ctx, d, b); break;
      case 'buyPlot': {
        const seat = seatOfP(ctx, d.player);
        const city = cityAt(state, d.city);
        if (!city || city.seat !== seat) { count(ctx, 'buyPlot', 'refused', d.player); break; }
        if (state.map.tiles[d.plot].ownerSeat === seat) { count(ctx, 'buyPlot', 'refused', d.player); break; }
const res = buyTile(state, city.id, d.plot, seat);        if (!res.ok) setTileOwner(state.map.tiles[d.plot], seat, city.id);        count(ctx, 'buyPlot', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'worked': {
        // a city-state's citizens are its script's decision as a major's
        // are its player's
        const minor = state.cityStates.find((x) => x.centerIndex === d.city);
        const city = cityAt(state, d.city) ?? (minor ? minorCity(minor) : undefined);
        if (!city) break;
        for (const t of state.map.tiles) {
          if (t.ownerSeat !== city.seat || t.ownerCity !== city.id) continue;
          t.locked = false;
          t.lockRank = undefined;
        }
        d.plots.forEach((q, i) => {
          const t = state.map.tiles[q];
          if (q === city.centerIndex || t.district) return;
          t.locked = true;
          if (d.ranks?.[i]) t.lockRank = d.ranks[i];
        });
        const read = [...next.dumpOfCity].find(([, c]) => c.y * ctx.W + c.x === d.city)?.[0];
        if (read?.specialistPref) city.specialistPref = [...read.specialistPref];
        count(ctx, 'worked', 'applied');
        break;
      }
      case 'improve': {
        const seat = seatOfP(ctx, d.player);
        const t = state.map.tiles[d.plot];
        const want = next.state.map.tiles[d.plot].improvement;
        if (!want) { count(ctx, 'improve', 'refused', d.player); break; }
        const valid = seat >= 0 ? validImprovements(state, t, seat) : [];
        // the order is the player's, through the engine's verb with the unit
        // the log names: a major's Builder takes its improvement order (the
        // charge, the turn, the culture bomb, the last charge's end), a
        // minor's lays it as a minor's does
        const builder = d.unit ? unitOf(ctx, d.unit) : undefined;
        const actor = seatOf(state, seat) as Seat | undefined;
        // a city-state's improvement is its trees' Builder's, laid in its turn
        if (isCityStateSeat(seat)) {
          if (t.improvement === want) { count(ctx, 'minorAi:improve', 'applied', d.player); break; }
          t.improvement = want;
          t.pillaged = false;
          if (builder && (builder.charges ?? 0) > 0) {
            builder.charges = (builder.charges ?? 0) - 1;
            if (builder.charges <= 0) disbandUnit(state, builder.id);
          }
          count(ctx, 'minorAi:improve', 'fallback', d.player, `plot ${d.plot}: the engine laid none of ${want}`);
          break;
        }
        if (builder && actor && valid.includes(want as never) && (builder.charges ?? 0) > 0) {
          builder.tileIndex = d.plot;
          if (seat < state.seats.length) {
            const ii = IMPROVEMENT_IDS.indexOf(want);
            const code = ii < 0 ? -1 : ii < DEDICATED_IMPROVEMENTS ? 13 + ii : 18 + ii - DEDICATED_IMPROVEMENTS;
            const row = unitsOf(state, seat).map((u) => (u === builder ? code : -1));
            builder.movesLeft = Math.max(builder.movesLeft, grantedMoves(state, builder));
            if (code >= 0) applySeatUnitOrders(state, actor, [row]);
          }
          if (t.improvement === want) { count(ctx, 'improve', 'applied'); break; }
        }
        const ok = valid.includes(want as never);
        t.improvement = want;
        t.pillaged = false;
        count(ctx, 'improve', 'fallback', d.player, ok ? (builder ? 'the builder\'s order refused' : d.unit ? 'a builder the replay does not hold' : 'no builder the log names')
          : `${want} on ${t.terrain}/${t.elevation}/${t.feature}/${t.resource} seat ${seat}: the engine offers [${valid.join(',')}]`);
        break;
      }
      case 'levy': {
        // the order is the suzerain's, through the engine's verb; the game's
        // new ids name the same units from here on
        const seat = seatOfP(ctx, d.player);
        const ms = seatOfP(ctx, d.minor);
        const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
        const s = seatOf(state, seat) as Seat | undefined;
        if (!cs || !s) { count(ctx, 'levy', 'refused', d.player); break; }
        const price = levyGoldCost(state, seat, cs);
        const res = levyUnits(state, cs.id, seat);
        // the old id still names the unit through the pair: a battle it
        // fought before the levy is the log's under it (`unitGone`)
        for (const [from, to] of d.units) {
          const u = unitOf(ctx, from);
          if (!u) continue;
          ctx.units.set(to, u);
          if (!res.ok) {
            u.seat = seat;
            u.leviedFrom = cs.seat;
          }
        }
        if (!res.ok) {
          // the record's levy, on the verb's own term (`levyUnits`)
          s.treasury -= price;
          cs.levySeat = seat;
          cs.levyEnds = state.turn + LEVY_TURNS - 1;
        }
        count(ctx, 'levy', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'gpActivate': {
        // the order is the player's, through the engine's verb from the plot
        // the log's steps had the person on: the effects, the charge
        const u = unitOf(ctx, d.unit);
        if (!u) { count(ctx, 'gpActivate', 'refused', d.player, 'a unit the replay does not hold'); break; }
        u.tileIndex = d.plot;
        // the person the log names: a unit the replay spawned from the
        // record carries no identity of its own
        if (u.gpAt === undefined) {
          const id = aliasOrPrefixed(ctx.cat.greatPeople?.[d.individual] ?? '');
          const cls = gpClassOfUnit(u);
          const at = id && cls !== undefined ? GREAT_PEOPLE[cls].findIndex((p) => p.id === id) : -1;
          if (at >= 0 && cls !== undefined) {
            u.gpAt = at;
            u.charges = gpChargesOf(GREAT_PEOPLE[cls][at]);
          }
        }
        if (!activateGreatPerson(state, u)) {
          if (TRACE.has('gpActivate')) console.error(`   ${d.unit} ${u.type} gpAt${u.gpAt} charges${u.charges} at ${u.tileIndex}`);
          count(ctx, 'gpActivate', 'refused', d.player, 'the engine refused the activation');
          break;
        }
        matchNewUnits(ctx, b);
        count(ctx, 'gpActivate', 'applied');
        break;
      }
      case 'levyEnd': {
        // the engine's own levy clock sends the units home
        // (`minorLevyReturn`), held to the minor's own place in the turn
        // (`holdLevies`); the game's new ids name the same units, the old
        // ones still through the pair: a battle a unit fought before it came
        // home is the log's under its levied id (runs/h1_duelw1117 t42:
        // China's levied Warrior killed a barbarian, then went home with its
        // 23 damage)
        const seat = seatOfP(ctx, d.player);
        if (isCityStateSeat(seat)) releaseLevies(state, cityStateOfSeat(seat));
        for (const [from, to] of d.units) {
          const u = unitOf(ctx, from);
          if (!u) continue;
          ctx.units.set(to, u);
          if (u.seat === seat) { count(ctx, 'levyEnd', 'applied'); continue; }
          if (TRACE.has('levyEnd')) { const cs = state.cityStates.find((c) => c.seat === seat); console.error(`   levyEnd ${from} seat${u.seat} levied${u.leviedFrom} cs${seat} levySeat${cs?.levySeat} ends${cs?.levyEnds} turn${state.turn}`); }
          u.seat = seat;
          delete u.leviedFrom;
          count(ctx, 'levyEnd', 'fallback', d.player);
        }
        break;
      }
      case 'wonderCharge': {
        // the order is the player's, through the engine's verb, from where
        // the Builder stood
        const u = unitOf(ctx, d.unit);
        const actor = seatOf(state, seatOfP(ctx, d.player)) as Seat | undefined;
        if (!u || !actor) { count(ctx, 'wonderCharge', 'refused', d.player); break; }
        u.tileIndex = d.plot;
        const res = wonderChargeBoost(state, u, actor);
        count(ctx, 'wonderCharge', res.ok ? 'applied' : 'refused', d.player, res.reason);
        break;
      }
      case 'clear': {
        const seat = seatOfP(ctx, d.player);
        const t = state.map.tiles[d.plot];
        if (d.what === 'feature' ? !t.feature : !t.resource) { count(ctx, `clear:${d.what}`, 'refused', d.player); break; }
        // the order is the player's, through the engine's verb with the
        // builder the log names, from the plot: the lump, the charge
        const builder = d.unit ? unitOf(ctx, d.unit) : undefined;
        let why = d.unit ? 'a builder the replay does not hold' : undefined;
        if (builder) {
          builder.tileIndex = d.plot;
          const res = d.what === 'feature' ? builderRemoveFeature(state, builder.id, seat) : builderHarvest(state, builder.id);
          if (res.ok) { count(ctx, `clear:${d.what}`, 'applied'); break; }
          why = res.reason;
          // the record's charge, spent
          builder.charges = Math.max(0, (builder.charges ?? 1) - 1);
        }
        if (why) count(ctx, `clear:${d.what}`, 'fallback', d.player, why);
        const grants = d.what === 'feature' ? chopGrant(state, t, seat) : [harvestGrant(state, t, seat)].filter((g) => !!g);
        for (const g of grants) applyLumpYield(state, d.plot, g!, seat);
        if (d.what === 'feature') t.feature = null;
        else t.resource = null;
        if (!why) count(ctx, `clear:${d.what}`, 'applied');
        break;
      }
      case 'envoy': {
        // the start's envoys the purse held went to the engine's turn
        // (`stageEnvoys`); every count is brought to the record's once the
        // pair's moves have met what they met (`settleEnvoys`)
        ctx.lateEnvoys.push(d);
        break;
      }
      case 'pantheon': {
        const s = seatOf(state, seatOfP(ctx, d.player));
        const id = engineId('belief', ctx.cat.beliefs[d.belief], 'BELIEF_', PANTHEONS);
        if (!s || !id) { count(ctx, 'pantheon', 'refused', d.player); break; }
        const rp = ctx.religionPort;
        if (rp.seats.has(s.seat)) {
          // an AI major's pantheon is its port's (`portPantheons`), taken at
          // its own turn: the record's is the score
          const at = rp.pantheonTurn.get(s.seat);
          rp.probe.actions.pantheons++;
          if (at === state.turn - 1) rp.probe.actions.pantheonsTurnEqual++;
          if (s.religion.pantheon === id) rp.probe.actions.pantheonsBeliefEqual++;
          else if (rp.probe.actions.misses.length < 30) {
            rp.probe.actions.misses.push(`t${state.turn - 1} pantheon: ours ${s.religion.pantheon ?? '-'}${at !== undefined ? ` at t${at}` : ''} record ${id}`);
          }
          if (s.religion.pantheon !== null) { count(ctx, 'pantheon', 'applied'); break; }
        }
        const had = s.religion.pantheon;
        if (had === id) { count(ctx, 'pantheon', 'applied'); break; }
        // the player's pick as its action (`foundPantheon`, the record's
        // `pantheon` row), else laid as the record holds it
        const res = had ? { ok: false, reason: `a pantheon ${had} stands` } : foundPantheon(state, s.seat, PANTHEON_IDS.indexOf(id));
        if (res.ok) {
          matchNewUnits(ctx, b);
          count(ctx, 'pantheon', 'applied');
          break;
        }
        if (had) state.claimedPantheons = state.claimedPantheons.filter((x) => x !== had);
        if (!had) pantheonMoment(state, s.seat);
        s.religion.pantheon = id;
        if (!state.claimedPantheons.includes(id)) state.claimedPantheons.push(id);
        if (!had) {
          grantPantheonUnit(state, s.seat, id);
          matchNewUnits(ctx, b);
        }
        count(ctx, 'pantheon', 'fallback', d.player, res.reason);
        break;
      }
      case 'religion': {
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const r = seatOf(next.state, seat)?.religion;
        if (!s || !r) { count(ctx, 'religion', 'refused', d.player); break; }
        // the beliefs the record's religion holds that the engine's lacks, the
        // player's picks, through the engine's own verb (`adoptBeliefs`: the
        // Follower first at a founding), its holy city where the record's
        // Great Prophet founded it
        const picks: [number, number][] = [];
        BELIEF_SLOTS.forEach((slot, c) => {
          const id = r[slot];
          if (id && !s.religion[slot]) picks.push([c, Object.keys(BELIEF_CATALOGS[c]).indexOf(id)]);
        });
        picks.sort((x, y) => (x[0] === BELIEF_CLASS_FOLLOWER ? -1 : y[0] === BELIEF_CLASS_FOLLOWER ? 1 : x[0] - y[0]));
        const holyAt = typeof r.holyTile === 'number' ? r.holyTile : undefined;
        // a founding spends the seat's Great Prophet on the holy city's Holy
        // Site (`activateGreatPerson`), where the record's founded it
        if (!s.religion.founded && r.founded && prophetsOf(s as Seat) === 0) {
          const prophet = state.units.find((u) => u.seat === seat && u.type === 'PROPHET');
          const holy = holyAt !== undefined ? cityAt(state, holyAt) : undefined;
          // its Holy Site, else a wonder of its where a Prophet may found
          // (Stonehenge: runs/h1_duelw1117 China t34)
          const sites = holy ? [...holy.districts.filter((x) => x.type === 'HOLY_SITE').map((x) => x.tileIndex), ...holy.wonders.map((w) => w.tileIndex)] : [];
          const site = prophet ? sites.find((p) => { prophet.tileIndex = p; return gpActivateOk(state, prophet); }) : undefined;
          if (prophet && site !== undefined) {
            prophet.tileIndex = site;
            activateGreatPerson(state, prophet);
          }
        }
        // the founding's religion, the player's choice (the record's type)
        let religion = r.type ? RELIGION_TYPES.indexOf(r.type) : -1;
        let chosen: [number, number][] = picks;
        const rp = ctx.religionPort;
        if (rp.seats.has(seat) && (s.religion.founded || r.founded)) {
          // an AI major's choices are its port's (ai/major/religion.ts): the
          // founding's religion and beliefs, each belief added
          const view = majorView(state, rp.inputs);
          const scores = rp.probe.scoresFor(state, seat);
          const port: Pick<SeatActionRecord, 'religion' | 'beliefs'> = s.religion.founded ? enhanceRecord(view, seat, scores)
            : foundingRecord(view, seat, scores, RELIGION_INITIAL_BELIEFS, (n) => randRange(state, n, 'Random Religion Choice'));
          if (port.beliefs?.length) {
            const named = (xs: readonly (readonly [number, number])[]) => xs.map(([c, k]) => beliefIdAt(c, k)).sort().join(' ');
            rp.probe.choice('beliefs', named(port.beliefs), named(picks), state.turn - 1);
            chosen = port.beliefs.map(([c, k]) => [c, k] as [number, number]);
          }
          if (!s.religion.founded && port.religion !== undefined && port.religion !== null) {
            rp.probe.choice('religion', RELIGION_TYPES[port.religion], r.type ?? '-', state.turn - 1);
            religion = port.religion;
          }
        }
        const adopted = chosen.length && (s.religion.founded || r.founded) ? adoptBeliefs(state, seat, chosen, religion, holyAt) : { ok: false, reason: 'no belief to adopt' };
        if (adopted.ok) { count(ctx, 'religion', 'applied'); break; }
        const founding = !s.religion.founded && r.founded;
        // the founding's moment, as the engine's own founding pays it
        if (founding) religionMoment(state, seat);
        s.religion = { ...structuredClone(r), pantheon: s.religion.pantheon };
        // a founding's holy city takes the pressure and the following the
        // founding gave it, as record t+1 shows them
        const holy = founding && typeof r.holyTile === 'number' ? cityAt(state, r.holyTile) : undefined;
        const read = holy ? [...next.dumpOfCity.keys()].find((c) => c.centerIndex === holy.centerIndex) : undefined;
        if (holy && read) {
          holy.religionPressure = [...(read.religionPressure ?? [])];
          holy.followedReligion = read.followedReligion;
        }
        count(ctx, 'religion', 'fallback', d.player, `${adopted.reason} [${state.units.filter((u) => u.seat === seat).map((u) => `${u.type}:${u.gpAt ?? '-'}`).join(' ')}]`);
        break;
      }
      case 'governors': {
        // each appointment, promotion and assignment the record's player
        // made, as its record's column (`applyGovernorActions`): the clocks
        // are the engine's
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const g = seatOf(next.state, seat)?.governors;
        if (!s || !g) { count(ctx, 'governors', 'refused', d.player); break; }
        const roster = governorsOf(s);
        // an AI major's governors are its AI's: the port's turn through the
        // engine's verbs, the record's roster where it differs
        const port = ctx.governorAi.turnOf(seat);
        const was = roster.map((e) => ({ ...e }));
        if (port) applyGovernorTurn(state, seat, port);
        let changed = 0;
        let equal = 0;
        g.forEach((x, i) => {
          const from = x.cityId >= 0 ? next.state.seats[seat]?.cities.find((c) => c.id === x.cityId) : undefined;
          const to = from ? cityAt(state, from.centerIndex) : undefined;
          const cityId = to && to.seat === seat ? to.id : -1;
          const e = roster[i];
          const sameAs = (r: Governor) => x.appointed === r.appointed && x.promotions === r.promotions
            && cityId === r.cityId && x.minorId === r.minorId;
          const same = () => sameAs(e);
          if (sameAs(was[i]) && same()) return;
          changed++;
          if (!port) {
            const verbs: [number, number, number][] = [];
            if (x.appointed && !e.appointed) verbs.push([GOV_APPOINT, i, 0]);
            for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
              if (promotionBit(x.promotions, p) && !promotionBit(e.promotions, p)) verbs.push([GOV_PROMOTE, i, p]);
            }
            if ((cityId >= 0 || x.minorId >= 0) && (cityId !== e.cityId || x.minorId !== e.minorId)) {
              verbs.push(x.minorId >= 0 ? [GOV_ASSIGN_MINOR, i, x.minorId] : [GOV_ASSIGN_CITY, i, to!.centerIndex]);
            }
            applyGovernorActions(state, seat, verbs);
          }
          if (same()) {
            equal++;
            count(ctx, 'governors', 'applied');
            return;
          }
          // the record's roster, on the engine's clock where the posting
          // stands (a record reads an unestablished governor's full count)
          const kept = e.appointed && e.cityId === cityId && e.minorId === x.minorId && cityId + x.minorId > -2;
          roster[i] = { ...x, cityId, establishTurns: kept ? e.establishTurns : x.establishTurns };
          count(ctx, 'governors', 'fallback', d.player, port ? 'the port roster differs' : undefined);
        });
        if (port) ctx.governorAi.rosterCheck(state.turn, d.player, changed, equal, 'the port roster differs from record t+1');
        break;
      }
      case 'routes': {
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const theirs = seatOf(next.state, seat)?.tradeRoutes;
        if (!s || !theirs) { count(ctx, 'routes', 'refused', d.player); break; }
        // each route record t+1 runs that the engine does not is the
        // player's order, through the engine's own verb for its kind (a
        // Trader spent, the course laid); a route the engine refuses is the
        // record's. Routes that ended are the engine's to end.
        const nextOwner = seatOf(next.state, seat)!;
        const key = (o: number, dst: number) => `${o}>${dst}`;
        const have = new Set((s.tradeRoutes ?? []).map((r) => key(routeOriginCenter(state, s, r), routeDestCenter(state, s, r))));
        for (const r of theirs) {
          const o = routeOriginCenter(next.state, nextOwner, r);
          const dst = routeDestCenter(next.state, nextOwner, r);
          if (o < 0 || dst < 0 || have.has(key(o, dst))) continue;
          const from = cityAt(state, o);
          const minor = isCityStateSeat(seat) ? state.cityStates.find((c) => c.seat === seat && c.centerIndex === o) : undefined;
          let res: { ok: boolean; reason?: string } = { ok: false, reason: 'no engine city at the origin' };
          if (minor) {
            // a city-state's Trader goes where its AI sent it; a major's city
            // it names is the engine's at that centre
            const to = r.toSeatCity !== undefined ? cityAt(state, dst) : undefined;
            res = r.toCs !== undefined ? minorRouteTo(state, minor, { from: -1, to: -1, toCs: r.toCs })
              : to ? minorRouteTo(state, minor, { from: -1, to: -1, toSeat: to.seat, toSeatCity: to.id })
                : { ok: false, reason: 'no engine city at the destination' };
          } else if (from && from.seat === seat) {
            if (r.toCs !== undefined) res = addCsTradeRoute(state, from.id, r.toCs, seat);
            else if (r.toSeat !== undefined && r.toSeat !== seat) {
              const to = cityAt(state, dst);
              res = to ? addIntlTradeRoute(state, from.id, to.seat, to.id, seat) : { ok: false, reason: 'no engine city at the destination' };
            } else {
              const to = cityAt(state, dst);
              res = to ? addTradeRoute(state, from.id, to.id, seat) : { ok: false, reason: 'no engine city at the destination' };
            }
          }
          if (res.ok) { count(ctx, 'routes', 'applied'); continue; }
          const remap = (owner: number, id: number | undefined) => {
            if (id === undefined) return undefined;
            const c = seatOf(next.state, owner)?.cities.find((x) => x.id === id);
            return c ? cityAt(state, c.centerIndex)?.id : undefined;
          };
          (s.tradeRoutes ??= []).push({ ...structuredClone(r), from: remap(seat, r.from) ?? -1,
            ...(r.to !== undefined ? { to: remap(seat, r.to) } : {}),
            ...(r.toSeatCity !== undefined && r.toSeat !== undefined ? { toSeatCity: remap(r.toSeat, r.toSeatCity) } : {}) });
          // the route started answers the engine's Send Trade Route quests
          if (r.toCs !== undefined) questRouteStarted(state, seat, r.toCs);
          count(ctx, 'routes', 'fallback', d.player, res.reason);
        }
        break;
      }
      case 'war': {
        const a = seatOfP(ctx, d.player);
        const o = seatOfP(ctx, d.other);
        if (a === NO_SEAT || o === NO_SEAT || a === BARB_SEAT || o === BARB_SEAT) { count(ctx, 'war', 'refused', d.player); break; }
        if (civsAtWar(state, a, o) === d.war) { count(ctx, 'war', 'applied'); break; }
        if (isCityStateSeat(o) && a < state.seats.length) {
          if (d.war) declareWarOnCityState(state, cityStateOfSeat(o), a);
          else sueForPeaceWithCityState(state, cityStateOfSeat(o), a);
        } else if (a < state.seats.length && o < state.seats.length) {
          if (d.war) declareWar(state, a, o);
          else sueForPeace(state, a, o);
        }
        const ok = civsAtWar(state, a, o) === d.war;
        if (!ok) {
          setWar(state, a, o, d.war);
          if (!d.war && isCiv(a) && isCiv(o)) setPeaceTurnWith(state, a, o, state.turn);
        }
        count(ctx, d.war ? 'war:declare' : 'war:peace', ok ? 'applied' : 'fallback', d.player);
        break;
      }
      case 'capture': {
        const to = seatOf(state, seatOfP(ctx, d.player)) as Seat | undefined;
        const city = cityAt(state, d.city);
        if (!to || !city) { count(ctx, 'capture', 'refused', d.player); break; }
        if (city.seat !== to.seat) transferCity(state, city.seat, to, city, 'conquered');
        count(ctx, 'capture', 'fallback', d.player);
        break;
      }
      case 'congress': {
        state.congress = structuredClone(next.state.congress);
        count(ctx, 'congress', 'fallback');
        break;
      }
      case 'unitGone': {
        // a levied or returned unit leaves its old id alone
        const rekeyed = ds.some((x) => (x.kind === 'levy' || x.kind === 'levyEnd') && x.units.some(([f]) => f === d.unit));
        const u = rekeyed ? undefined : unitOf(ctx, d.unit);
        ctx.units.delete(d.unit);
        if (!u) { count(ctx, `unitGone:${d.why}`, 'applied'); break; }
        disbandUnit(state, u.id);
        if (TRACE.has('unitGone') && d.why !== 'founded') console.error(`   ${d.unit} ${u.type} hp${u.hp} at ${u.tileIndex} charges${u.charges ?? '-'}`);
        count(ctx, `unitGone:${d.why}`, d.why === 'founded' ? 'applied' : 'fallback', d.player);
        break;
      }
      case 'unitNew': {
        // a major's trained unit is its city's production, the engine's to
        // make, and where the engine's city did not complete it the record's
        // completion is imposed (`completeTrained`); a city-state's or a Free
        // City's is their scripts' decision, which the engine does not
        // replay; the barbarians' are their rules', which close the pair
        // (`barbarianTurn`)
        const major = seatOfP(ctx, d.player) >= 0 && seatOfP(ctx, d.player) < state.seats.length;
        if (isBarbSeat(seatOfP(ctx, d.player))) {
          ctx.barbNew.push(d.unit);
          break;
        }
        // a unit an engine verb of this phase made (a wonder a charge
        // completed grants its Great Person, a minor's harvest completes its
        // item) is the record's
        matchNewUnits(ctx, b);
        if (d.why === 'trained' && major) {
          if (unitOf(ctx, d.unit)) count(ctx, 'unitNew:trained', 'applied', d.player);
          else completeTrained(ctx, b, d);
          break;
        }
        if (unitOf(ctx, d.unit)) {
          if (!major) count(ctx, 'minorAi:unitNew', 'applied', d.player);
          break;
        }
        // a captive is the seizure's (`seize`)
        if (ds.some((x) => x.kind === 'seize' && x.into === d.unit)) break;
        spawnRecorded(ctx, b, d.unit);
        count(ctx, major ? 'unitNew:other' : 'minorAi:unitNew', 'fallback', d.player, `${d.unit} ${ctx.cat.units[d.type]} ${d.why}: the engine made none`);
        break;
      }
      case 'move': {
        if (d.path) ctx.paths.set(d.unit, d.path);
        // a unit the pair lost walked the log's steps before it fell, and saw
        // from each (runs/h1_duelw1124 t13: Rome's Scout steps beside the
        // Giant's Causeway, finds it, and dies to a barbarian later in the
        // turn); the units record t+1 holds walk at `syncUnits`
        const u = unitOf(ctx, d.unit);
        if (!u || !d.path?.length || b.units.some((r) => `${r.owner}:${r.id}` === d.unit)) break;
        u.fortifyTurns = 0;
        for (const p of d.path) revealAround(state, u.seat, p, unitSight(u, state), { seeThrough: unitSeesThrough(u) });
        u.tileIndex = d.path[d.path.length - 1];
        break;
      }
      case 'camp': {
        const u = unitOf(ctx, d.unit);
        if (!u || !state.barbSeat.camps.includes(d.plot)) { count(ctx, 'camp', 'refused', d.player); break; }
        clearCampFor(state, u, d.plot);
        // the lab's HUMAN seat holds the install's BARBARIAN_CAMP_GOLD_SCALING
        // (Leaders.xml, TRAIT_LEADER_MAJOR_CIV on PLAYER_IS_HUMAN): its
        // dispersal change before the speed, which no engine seat holds
        if (bool(b.players.find((p) => p.id === d.player)?.human)) {
          const s = seatOf(state, u.seat);
          if (s) s.treasury += HUMAN_CAMP_GOLD;
        }
        count(ctx, 'camp', 'applied');
        break;
      }
      case 'village': {
        // entering is the decision; the reward is the engine's own village
        // (`drawAndPayGoody`) on the game's draws ("Choosing a Goody Hut
        // Type", "Choosing a Sub Type"), paid to the unit the log names
        // (`GoodyHutReward`), standing on the plot
        const s = seatOf(state, seatOfP(ctx, d.player));
        const t = state.map.tiles[d.plot];
        if (!s || !t.goodyHut) { count(ctx, 'village', 'refused', d.player); break; }
        t.goodyHut = false;
        goodyMoment(state, s.seat);
        // a unit the log names that the engine never made (its production
        // or its battles went otherwise) still enters: the reward is drawn
        // for the record's unit, standing outside the engine's game
        const enterer = d.unit ? unitOf(ctx, d.unit) ?? recordedUnit(ctx, b, d.unit, -1) ?? recordedUnit(ctx, ctx.prev, d.unit, -1) : undefined;
        if (enterer) {
          // it walked onto the plot, and saw from every step and from it
          // (runs/h1_duelw1127 t6: Rome's Scout enters the village at (31,16)
          // and the coast two plots west lies revealed in record t7)
          if (enterer.tileIndex !== d.plot && d.unit && unitOf(ctx, d.unit) === enterer) {
            for (const p of [...(ctx.paths.get(d.unit) ?? []), d.plot]) {
              revealAround(state, enterer.seat, p, unitSight(enterer, state), { seeThrough: unitSeesThrough(enterer) });
            }
          }
          enterer.tileIndex = d.plot;
          drawAndPayGoody(state, enterer, t);
          matchNewUnits(ctx, b);
          count(ctx, 'village', 'applied');
          break;
        }
        // no unit the log names: the record's reward, its Gold, Faith and boosts
        if (d.gold >= VILLAGE_MIN) s.treasury += d.gold;
        if (d.faith >= VILLAGE_MIN) s.faith += d.faith;
        // the unit it gave arrives as the record's (`unitNew`); a Builder or a
        // Settler is a copy its price climbs on, as the engine's own village
        // counts it (`drawAndPayGoody`)
        for (const x of ds) {
          if (x.kind !== 'unitNew' || x.why !== 'other' || x.player !== d.player) continue;
          const type = engineRowOf(ctx.cat, 'unit', x.type);
          if (type === 'BUILDER') s.buildersTrained += 1;
          else if (type === 'SETTLER') s.settlersTrained = (s.settlersTrained ?? 0) + 1;
        }
        const grew = d.popCity >= 0 ? cityAt(state, d.popCity) : undefined;
        if (grew && grew.seat === s.seat) {
          gainPopulationPressure(grew, 1);
          grew.population += 1;
        }
        for (const [rows, names, prefix, known] of [[d.techBoosts, ctx.cat.techs, 'TECH_', TECHS], [d.civicBoosts, ctx.cat.civics, 'CIVIC_', CIVICS]] as const) {
          for (const k of rows) {
            const id = engineId(prefix === 'TECH_' ? 'tech' : 'civic', names[k], prefix, known);
            if (id) markBoost(state, s.seat, id);
          }
        }
        count(ctx, 'village', 'fallback', d.player, d.unit ? `${d.unit} not in record t+1` : 'no unit the log names');
        break;
      }
      case 'upgrade': {
        // the order is the player's, through the engine's verb; the game's
        // new id names the same unit from here on
        const u = unitOf(ctx, d.unit);
        if (!u) { count(ctx, 'upgrade', 'refused', d.player); break; }
        // the unit stood where the game added its upgrade, with moves to
        // spend (the order needs them); the record's steps before it are the
        // replay's, outside the engine's turn
        const r = b.units.find((x) => `${x.owner}:${x.id}` === d.into);
        if (r) u.tileIndex = r.y * ctx.W + r.x;
        if (u.movesLeft <= 0) u.movesLeft = grantedMoves(state, u);
        // a city-state's upgrade is its AI's, through the minor's own verb
        const minor = isCityStateSeat(u.seat) ? state.cityStates.find((c) => c.seat === u.seat) : undefined;
        const res = minor ? (minorUpgradeUnit(state, minor, u) ? { ok: true } : { ok: false, reason: `the minor may not upgrade ${u.type}->${UNITS[u.type]?.upgradesTo} (gold ${r3(minor.treasury)}, plot seat ${tileSeat(state.map.tiles[u.tileIndex])}, techs ${minor.research.techs.join('|')})` })
          : upgradeUnit(state, u, u.seat);
        ctx.units.delete(d.unit);
        ctx.units.set(d.into, u);
        if (!res.ok) {
          const t = r ? engineRowOf(ctx.cat, 'unit', r.type) : null;
          const s = seatOf(state, u.seat);
          if (s) s.treasury -= minor ? MINOR_UPGRADE_GOLD : upgradeGoldCost(state, u.seat, u.type, u.leviedFrom !== undefined, u.formation ?? 0);
          if (t) u.type = t;
          u.movesLeft = 0;
          // the upgrade the record made raises its seat's bests and answers
          // its Train Unit quests as the verb's does
          if (t) raiseBestTrained(state, u.seat, t, u.formation ?? 0);
          if (t) questUnitAdded(state, u.seat, t);
        }
        count(ctx, 'upgrade', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'promote': {
        // the pick is the player's; the experience that earned it is the
        // record's battles' (`combat`), so the unit holds the record's
        const u = unitOf(ctx, d.unit);
        const name = (ctx.cat.unitPromotions ?? [])[d.promotion]?.replace(/^PROMOTION_/, '');
        if (!u || !name) { count(ctx, 'promote', 'refused', d.player); break; }
        const k = unitPromoRows(u).findIndex((p) => p.id === name);
        u.xp = Math.max(u.xp ?? 0, d.xp);
        // a city-state's pick is its tactical AI's (`aiPromotionPick`, its
        // Promotion move run on the copy beside the record): scored here
        if (isCityStateSeat(u.seat)) {
          const ours = aiPromotionPick(u);
          count(ctx, 'minorAi:promote', ours === k ? 'applied' : 'fallback', d.player, `the AI's ${unitPromoRows(u)[ours]?.id ?? 'none'}, the game's ${name}`);
        }
        if (k >= 0 && takePromotion(u, k)) { count(ctx, 'promote', 'applied', d.player); break; }
        if (k >= 0) {
          u.promos = (u.promos ?? 0) | (1 << k);
          u.level = (u.level ?? 1) + 1;
          u.xp = 0;
          u.hp = Math.min(UNIT_HP, u.hp + PROMOTE_HEAL);
        }
        count(ctx, 'promote', 'fallback', d.player, k < 0 ? `no ${name} in the unit's class` : 'the engine offered no such pick');
        break;
      }
      case 'pillage': {
        // the order is the player's, through the engine's verb from the plot
        // the log's steps had the unit on: a major's its seat's own order
        // (the plunder, the moves), any other's the hostile walker's
        // (`hostilePillage`: a barbarian heals off a Farm)
        const u = unitOf(ctx, d.unit);
        const t = state.map.tiles[d.plot];
        if (!u) { count(ctx, 'pillage', 'refused', d.player, 'a unit the replay does not hold'); break; }
        const was = [!!t.pillaged, !!t.districtPillaged];
        u.tileIndex = d.plot;
        const actor = u.seat < state.seats.length ? seatOf(state, u.seat) as Seat | undefined : undefined;
        if (actor) {
          u.movesLeft = Math.max(u.movesLeft, grantedMoves(state, u));
          applySeatUnitOrders(state, actor, [unitsOf(state, u.seat).map((x) => (x === u ? A_PILLAGE : -1))]);
        } else hostilePillage(state, u);
        const done = (!!t.pillaged && !was[0]) || (!!t.districtPillaged && !was[1]);
        count(ctx, 'pillage', done ? 'applied' : 'refused', d.player, done ? undefined : 'the engine wrecked nothing');
        break;
      }
      case 'seize': {
        // the move is the player's, through the engine's own: its mover from
        // the plot the log's steps had it on, onto the civilian's plot, which
        // seizes it (`seizeCivilian`); the game's new id names the captive
        const vic = unitOf(ctx, d.victim);
        // a victor's advance took it already, in the battle the log names
        // (runs/h1_duelw1117 t54: China's Warrior killed the escort)
        if (vic && vic.seat === seatOfP(ctx, d.player)) {
          ctx.units.delete(d.victim);
          if (d.into) ctx.units.set(d.into, vic);
          count(ctx, 'seize', 'applied');
          break;
        }
        if (!vic) { count(ctx, 'seize', 'refused', d.player, 'a civilian the replay does not hold'); break; }
        const by = unitOf(ctx, d.unit);
        if (!by) {
          // the record's seizure, on the engine's own rule for the civilian,
          // where the engine's battles left no mover
          vic.tileIndex = d.plot;
          seizeCivilian(state, vic, { seat: seatOfP(ctx, d.player), id: -1 });
          ctx.units.delete(d.victim);
          if (d.into && state.units.includes(vic)) ctx.units.set(d.into, vic);
          count(ctx, 'seize', 'fallback', d.player, 'a mover the replay does not hold');
          break;
        }
        by.tileIndex = d.from;
        vic.tileIndex = d.plot;
        by.movesLeft = Math.max(by.movesLeft, grantedMoves(state, by));
        by.attacksLeft = Math.max(1, by.attacksLeft ?? 1);
        const r = meleeAttack(state, by.id, d.plot, by.seat);
        const took = d.into ? vic.seat === by.seat && state.units.includes(vic) : !state.units.includes(vic);
        if (!took) {
          // the record's seizure, on the engine's own rule for the civilian
          if (state.units.includes(vic) && vic.seat !== by.seat) seizeCivilian(state, vic, by);
          by.tileIndex = d.plot;
        }
        ctx.units.delete(d.victim);
        if (d.into && state.units.includes(vic)) ctx.units.set(d.into, vic);
        count(ctx, 'seize', took ? 'applied' : 'fallback', d.player, r.ok ? 'the civilian was not taken' : r.reason);
        break;
      }
      case 'kill': {
        // the battle is the record's (`combat`); the kill is the engine's
        // event, paid through its own verb: the killer's eurekas and
        // inspirations, its post-combat yields and dedications
        const seat = seatOfP(ctx, d.player);
        if (ctx.engineKilled.has(d.victimUnit)) { count(ctx, 'kill', 'applied'); break; }
        const unitId = (row: number) => (row >= 0 ? engineId('unit', ctx.cat.units[row], 'UNIT_', UNITS) : null);
        const vt = unitId(d.victimType);
        if (seat === NO_SEAT || !vt) { count(ctx, 'kill', 'refused', d.player); break; }
        const kt = unitId(d.killerType);
        unitKillEvent(state, seat, kt ? { type: kt } : undefined, { type: vt, seat: seatOfP(ctx, d.victim) });
        count(ctx, 'kill', 'applied', d.player);
        break;
      }
      case 'battle': {
        if (d.strike) { strike(ctx, wit, b, d, d.strike); break; }
        if (!d.defender) { assault(ctx, wit, b, d); break; }
        // the battle is the engine's: its melee or ranged combat resolves it
        // from where the log's steps had the two units, on the game's own
        // damage draws
        const atk = unitOf(ctx, d.attacker);
        const def = unitOf(ctx, d.defender);
        if (!atk || !def) { count(ctx, 'battle', 'refused', d.player, 'a unit the replay does not hold'); if (TRACE.has('battle')) console.error(`   ${d.attacker} ${!!atk} ${d.defender} ${!!def}`); break; }
        for (const blows of [isBarbSeat(atk.seat) && ctx.barbBlows, (isBarbSeat(atk.seat) || minorAiSeat(atk.seat)) && ctx.minorBlows]) {
          if (!blows) continue;
          for (const [u, at] of [[atk, d.from], [def, d.at]] as const) {
            if (blows.has(u)) continue;
            const snap = structuredClone(u);
            snap.tileIndex = at;
            blows.set(u, snap);
          }
        }
        const s0 = battleDraw(ctx, wit, b, d);
        if (s0 === undefined) { count(ctx, 'battle', 'refused', d.player, 'no damage draw in the log'); if (TRACE.has('battle')) console.error(`   ${d.attacker || 'city@' + d.from} vs ${d.defender || 'city@' + d.at} seq${d.seq}`); break; }
        // a unit the log's steps moved holds no fortification
        if (atk.tileIndex !== d.from) atk.fortifyTurns = 0;
        if (def.tileIndex !== d.at) def.fortifyTurns = 0;
        dugIn(ctx, d, def);
        atk.tileIndex = d.from;
        def.tileIndex = d.at;
        unstack(ctx, b, atk);
        unstack(ctx, b, def);
        // a land unit the log's steps left on water fights embarked
        for (const u of [atk, def]) {
          if (!UNITS[u.type]?.naval && !waterWalks(u.type)) u.embarked = isWater(state.map.tiles[u.tileIndex]) || undefined;
        }
        atk.movesLeft = Math.max(atk.movesLeft, grantedMoves(state, atk));
        atk.attacksLeft = Math.max(1, atk.attacksLeft ?? 1);
        state.rngState = s0;
        const hp0 = [atk.hp, def.hp];
        if (TRACE.has('battleHp')) (globalThis as { __cbLog?: string[] }).__cbLog = [battleTerms(state, atk, def)];
        // the battle draws where the log drew it, the hold standing aside
        ctx.stream.placed(true);
        const r = d.ranged ? rangedAttack(state, atk.id, d.at) : meleeAttack(state, atk.id, d.at, atk.seat);
        ctx.stream.placed(false);
        if (TRACE.has('battleHp')) console.error(`t${traceTurn} battle ${d.attacker} ${atk.type} ${hp0[0]}->${atk.hp} vs ${d.defender} ${def.type} ${hp0[1]}->${def.hp} ${d.ranged ? 'ranged' : 'melee'} seq${d.seq} game[${d.dmg}] ours[${hp0[1] - def.hp},${hp0[0] - atk.hp}] ${r.ok ? '' : r.reason} ${((globalThis as { __cbLog?: string[] }).__cbLog ?? []).join(' | ')}`);
        if (!r.ok) { count(ctx, 'battle', 'refused', d.player, r.reason); break; }
        ctx.battled.add(d.attacker);
        ctx.battled.add(d.defender);
        for (const k of [d.attacker, d.defender]) if (!state.units.includes(ctx.units.get(k)!)) ctx.engineKilled.add(k);
        count(ctx, 'battle', 'applied');
        break;
      }
      case 'combat': {
        const u = unitOf(ctx, d.unit);
        if (!u || ctx.battled.has(d.unit)) break;
        // the engine's own turn dealt it (a random event's damage): nothing to impose
        if (u.hp === d.hp) { count(ctx, 'combat', 'applied'); break; }
        if (TRACE.has('combat')) console.error(`   ${d.unit} ${u.type} hp${u.hp} -> ${d.hp} at ${u.tileIndex}`);
        u.hp = d.hp;
        count(ctx, 'combat', 'fallback', d.player);
        break;
      }
      case 'hit': {
        // a blow no battle holds, on a unit whose battles were the engine's:
        // the record's damage (a unit with no battle takes the record's
        // health whole, `combat`)
        const u = unitOf(ctx, d.unit);
        if (!u || !ctx.battled.has(d.unit) || !state.units.includes(u)) break;
        u.hp = Math.max(1, u.hp - d.dmg);
        count(ctx, 'hit', 'fallback', d.player);
        break;
      }
    }
  }
}

/** THE ACTIVE PLAYER'S BOOSTS land in its actions, before its next start
 *  (`detectBoosts`: a natural wonder its steps revealed — runs/h1_duelw1124
 *  t13, Rome's Scout completes Astrology at 23 of 25, exactly, before its
 *  start); an item a boost completed hands over to the one its queue holds
 *  next, which record t+1 shows in hand (its Mining, 3.5 after the start) —
 *  the player's pick, through the engine's own (`applyResearch`). */
function activeBoosts(ctx: Ctx, b: TurnRecord, player: number): void {
  const s = ctx.state.seats[seatOfP(ctx, player)];
  if (!s?.cities.length) return;
  const had = [s.research.tech, s.research.civic];
  detectBoosts(ctx.state, s.seat);
  const p1 = b.players.find((p) => p.id === player);
  if (had[0] && !s.research.tech && num(p1?.researching) >= 0) applyResearch(ctx, player, num(p1?.researching), false);
  if (had[1] && !s.research.civic && num(p1?.civic) >= 0) applyResearch(ctx, player, num(p1?.civic), true);
}

/** THE KILLS' BOOSTS. Combat is the record's (`combat` falls back), so the
 *  engine never sees the kill that lands a KILL_WITH, KILL_SPECIFIC_UNIT or
 *  NUM_BARBS_KILLED boost: each such boost record t+1 shows and the engine
 *  lacks is the record's, landed through the engine's own grant. */
const KILL_CLASSES = new Set(['KILL_WITH', 'KILL_SPECIFIC_UNIT', 'NUM_BARBS_KILLED']);
function killBoosts(ctx: Ctx, read: Imported): void {
  read.state.seats.forEach((rsx, seat) => {
    const es = ctx.state.seats[seat];
    if (!es) return;
    for (const id of rsx.research.boosted) {
      if (es.research.boosted.includes(id) || !KILL_CLASSES.has(BOOSTS[id]?.cls ?? '')) continue;
      grantBoost(ctx.state, seat, id);
      count(ctx, `boost:${BOOSTS[id].cls}`, 'fallback', ctx.playerOfSeat.get(seat));
    }
  });
}

/** the engine's units the turn made, matched to the record's new units of the
 *  same seat and type, nearest first */
function matchNewUnits(ctx: Ctx, b: TurnRecord): void {
  const mapped = new Set([...ctx.units.values()]);
  const free = ctx.state.units.filter((u) => !mapped.has(u));
  for (const r of b.units) {
    const key = `${r.owner}:${r.id}`;
    if (unitOf(ctx, key)) continue;
    const seat = seatOfP(ctx, r.owner);
    const type = engineRowOf(ctx.cat, 'unit', r.type);
    const at = r.y * ctx.W + r.x;
    let best: Unit | undefined;
    let bd = Infinity;
    for (const u of free) {
      if (u.seat !== seat || u.type !== type) continue;
      const t0 = ctx.state.map.tiles[u.tileIndex];
      const t1 = ctx.state.map.tiles[at];
      const dd = Math.abs(t0.col - t1.col) + Math.abs(t0.row - t1.row);
      if (dd < bd) [bd, best] = [dd, u];
    }
    if (best) {
      ctx.units.set(key, best);
      free.splice(free.indexOf(best), 1);
    }
  }
}

/** A MAJOR'S TRAINED UNIT the engine's production did not make (its city short
 *  of the cost, or on another item): the record's completion, imposed. The
 *  item comes out of the seat's nearest city within three plots of the unit
 *  that holds it (in its queue, or banked behind the record's next item) and
 *  completes there by the engine's own completion (`completeQueueItem`: the
 *  unit at the centre, its grants, a Builder's or Settler's price climb, a
 *  Settler's citizen), its unit the record's (`matchNewUnits`); with no such
 *  city, or no unit the completion placed, the record's unit stands as it
 *  is. Counted as `unitNew:trained`. */
function completeTrained(ctx: Ctx, b: TurnRecord, d: Extract<Decision, { kind: 'unitNew' }>): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const name = ctx.cat.units[d.type];
  const rec = b.units.find((x) => `${x.owner}:${x.id}` === d.unit);
  const at = state.map.tiles[d.plot];
  let city: City | undefined;
  let item: QueueItem | null = null;
  let bd = 4;
  for (const c of seatOf(state, seat)?.cities ?? []) {
    const ct = state.map.tiles[c.centerIndex];
    const dd = hexDistance(state.map, ct.col, ct.row, at.col, at.row);
    if (dd >= bd) continue;
    const q = queueItem(ctx, seat, c, { kind: 'unit', row: d.type, plot: -1, ...(num(rec?.formation) > 0 ? { formation: num(rec?.formation) } : {}) });
    if (!q) continue;
    const k = itemKey(q);
    if (!c.queue.some((x) => itemKey(x) === k) && !ctx.retained.has(`${c.centerIndex}|${k}`)) continue;
    [bd, city, item] = [dd, c, q];
  }
  if (!city || !item) {
    spawnRecorded(ctx, b, d.unit);
    return void count(ctx, 'unitNew:trained', 'fallback', d.player, `${d.unit} ${name}: no engine city near holds it`);
  }
  const k = itemKey(item);
  const held = city.queue.findIndex((x) => itemKey(x) === k);
  const progress = held >= 0 ? city.queue[held].progress : ctx.retained.get(`${city.centerIndex}|${k}`) ?? 0;
  if (held >= 0) city.queue.splice(held, 1);
  ctx.retained.delete(`${city.centerIndex}|${k}`);
  const cost = itemCost(item, state, city);
  completeQueueItem(state, city, item, cost);
  matchNewUnits(ctx, b);
  if (!unitOf(ctx, d.unit)) spawnRecorded(ctx, b, d.unit);
  count(ctx, 'unitNew:trained', 'fallback', d.player,
    `${d.unit} ${name}: ${recordCityName(ctx, seat, city.id)} ${held >= 0 ? 'held' : 'banked'} it at ${r3(progress)} of ${r3(cost)}`);
}

/** the record's name of an engine city (LOC_CITY_NAME_ dropped): the city
 *  of record t+1 on its centre; a city-state's its own */
function recordCityName(ctx: Ctx, seat: number, id: number): string {
  const minor = ctx.state.cityStates.find((m) => m.seat === seat);
  if (minor) return minor.name.toUpperCase().replace(/[ -]/g, '_');
  const c = seatOf(ctx.state, seat)?.cities.find((x) => x.id === id);
  const r = c ? cityAt(ctx.next.state, c.centerIndex) : undefined;
  return (r ? ctx.next.dumpOfCity.get(r)?.name ?? '?' : '?').replace(/^LOC_CITY_NAME_/, '');
}

/** THE FORTIFY ORDER is its player's decision: a unit digs in only while it
 *  holds the order, never by standing (runs/h1_duelw1117: 41 barbarian
 *  Scouts and 6 city-state Warriors stood a turn with every move unspent and
 *  stayed at 0; every unit that dug in spent its moves on the order). A unit
 *  record t+1 holds undug gave no order, so the engine's dig-in for standing
 *  does not land on it; a unit the pair killed, which record t+1 does not
 *  hold, digs in no further than record t had it (runs/h1_duelw1120 t13:
 *  Rome's Warrior 327683, undug at t13, struck twice by barbarians at +0). */
function fortifyOrders(ctx: Ctx, a: TurnRecord, b: TurnRecord): void {
  const held = new Set(b.units.map((r) => `${r.owner}:${r.id}`));
  for (const r of b.units) {
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u || num(r.fortify) > 0 || !(u.fortifyTurns ?? 0)) continue;
    u.fortifyTurns = 0;
    count(ctx, 'fortify', 'applied');
  }
  for (const r of a.units) {
    const u = held.has(`${r.owner}:${r.id}`) ? undefined : unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u || (u.fortifyTurns ?? 0) <= num(r.fortify)) continue;
    u.fortifyTurns = num(r.fortify);
    count(ctx, 'fortify', 'applied');
  }
}

/** every unit the replay knows stands where record t+1 shows it, with the
 *  moves it has left and its charges; the record's units the engine never
 *  made stay missing (a production difference); `only` a player's alone */
/** `fn` run with the state's turn at `turn` (a step of the turn the engine
 *  has closed) */
function inTurn(state: GameState, turn: number, fn: () => void): void {
  const now = state.turn;
  state.turn = turn;
  try {
    fn();
  } finally {
    state.turn = now;
  }
}

function syncUnits(ctx: Ctx, b: TurnRecord, only?: number): void {
  for (const r of b.units) {
    if (only !== undefined && r.owner !== only) continue;
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u) continue;
    const at = r.y * ctx.W + r.x;
    if (u.tileIndex !== at) {
      count(ctx, 'move', 'applied');
      // a unit that moved spent its moves and holds no fortification
      // (runs/h1_duelw1117 t3: the barbarian Scout that walked to (12,10)
      // took 38 from China's... city-state Warrior at +10, unfortified)
      u.fortifyTurns = 0;
      // the unit sees from every plot the log's steps entered, and from where
      // it stopped (a barbarian's steps kept for its scout's looks)
      const steps = [...(ctx.paths.get(`${r.owner}:${r.id}`) ?? []), at];
      for (const p of steps) revealAround(ctx.state, u.seat, p, unitSight(u, ctx.state), { seeThrough: unitSeesThrough(u) });
      if (isBarbSeat(u.seat)) ctx.barbSteps.push({ u, plots: steps });
    }
    u.tileIndex = at;
    u.movesLeft = num(r.moves) * MP_SCALE;
    u.embarked = bool(r.embarked) || undefined;
    if (UNITS[u.type]?.charges !== undefined) u.charges = num(r.buildCharges) || num(r.spreadCharges) || u.charges;
  }
}

/** THE DRAWS the engine does not take on the game's sites, re-synced to the
 *  record's results — the random events' soil — and the barbarians' camps
 *  against the record's: whether they held, before the record's stand */
function syncDraws(ctx: Ctx, b: TurnRecord, tribesBefore: number): boolean {
  const { state } = ctx;
  // the random events' soil: which plots a flood, an eruption, a fire or a
  // drought struck and what each laid (the importer's reading of the
  // records' events), in place of the engine's own events' draws
  let soil = 0;
  for (const t of state.map.tiles) {
    const r = ctx.next.state.map.tiles[t.index];
    if (t.fertility === r.fertility && t.fertilityProd === r.fertilityProd && (t.fertilitySci ?? 0) === (r.fertilitySci ?? 0)
      && (t.fertilityCul ?? 0) === (r.fertilityCul ?? 0) && t.droughtTurns === r.droughtTurns) continue;
    if (TRACE.has('soil')) console.error(`t${traceTurn} soil ${t.index} engine ${t.fertility}/${t.fertilityProd}/${t.droughtTurns} record ${r.fertility}/${r.fertilityProd}/${r.droughtTurns}`);
    t.fertility = r.fertility;
    t.fertilityProd = r.fertilityProd;
    t.fertilitySci = r.fertilitySci;
    t.fertilityCul = r.fertilityCul;
    t.droughtTurns = r.droughtTurns;
    soil++;
  }
  // a fire's ground: a feature burning or burnt on one side and not the other
  for (const t of state.map.tiles) {
    const r = ctx.next.state.map.tiles[t.index];
    if (t.feature === r.feature || (!fireFeature(t.feature) && !fireFeature(r.feature))) continue;
    t.feature = r.feature;
    soil++;
  }
  if (soil) count(ctx, 'draw:eventSoil', 'fallback');
  // the barbarians' camps: the engine's camp step against the record's
  // camps; where they differ the record's stand, each with its tribe (a
  // camp the engine raised that the game did not is unmade, its tribe with
  // it; a camp the game raised that the engine did not takes a tribe of the
  // engine's kind for its plot, named by the first name free)
  const camps = ctx.next.state.barbSeat.camps;
  const campsHeld = [...state.barbSeat.camps].sort().join() === [...camps].sort().join();
  if (TRACE.has('barb')) {
    console.error(`t${traceTurn} camps engine [${state.barbSeat.camps}] game [${camps}] tribes ${JSON.stringify(state.barbTribes ?? [])}`);
    const W = ctx.W;
    const mine = state.units.filter((u) => isBarbSeat(u.seat)).map((u) => `${u.id}:${u.type}@${u.tileIndex}`);
    const game = b.units.filter((u) => seatOfP(ctx, u.owner) === BARB_SEAT).map((u) => `${u.id}:${engineRowOf(ctx.cat, 'unit', u.type)}@${u.y * W + u.x}`);
    console.error(`   units engine ${mine.join(' ')}\n   units game   ${game.join(' ')}`);
  }
  if (!campsHeld) {
    const tribes = state.barbTribes ?? [];
    for (const c of [...state.barbSeat.camps]) {
      if (camps.includes(c)) continue;
      state.barbSeat.camps.splice(state.barbSeat.camps.indexOf(c), 1);
      // a camp a major's unit stands on in the record is that major's clear,
      // which answers its Clear Barbarian Camp quests
      const clearer = b.units.find((x) => x.y * ctx.W + x.x === c && isCiv(seatOfP(ctx, x.owner)));
      if (clearer) questCampCleared(state, seatOfP(ctx, clearer.owner), c);
      // the unit that took it, any player's: its tribe rampages against it
      const taker = b.units.find((x) => x.y * ctx.W + x.x === c && seatOfP(ctx, x.owner) !== NO_SEAT && !isBarbSeat(seatOfP(ctx, x.owner)));
      const k = tribes.findIndex((tr) => tr.plot === c && tr.alive);
      if (k >= tribesBefore) tribes.splice(k, 1);
      else if (k >= 0) {
        tribes[k].alive = false;
        if (taker) tribes[k].rampage = seatOfP(ctx, taker.owner);
      }
    }
    for (const c of camps) {
      if (state.barbSeat.camps.includes(c)) continue;
      const kind = tribeKindAt(state, c).kind;
      const taken = new Set(tribes.filter((tr) => tr.kind === kind).map((tr) => tr.name));
      let name = 0;
      while (taken.has(name)) name++;
      // the game's tribe took its turn the turn it rose
      foundTribe(state, c, name).spawnTurns = 1;
    }
    for (const u of state.units) if (isBarbSeat(u.seat)) adoptByTribe(state, u);
    count(ctx, 'draw:camps', 'fallback');
  }
  return campsHeld;
}

/** THE CITY-STATES' BUILDS: each city-state's item in hand after its turn
 *  (its AI's pick, `minorAiTurn`) against record t+1's queue head; nothing
 *  imposed */
function minorBuilds(ctx: Ctx, b: TurnRecord, tally: MinorBuildTally): void {
  for (const cs of ctx.state.cityStates) {
    const c = b.cities.find((x) => x.y * ctx.W + x.x === cs.centerIndex);
    const head = c ? minorHead(ctx.cat, c, ctx.W) : undefined;
    if (!head) continue;
    const record = minorItemKey(head);
    const ours = cs.prodItem ?? '';
    const kind = record ? record.slice(0, record.indexOf(':')) : 'none';
    // REPLAY_TRACE=minorRows: each city-state's item and inputs beside the
    // record's, one JSON line (the record counts the centre's building and district)
    if (TRACE.has('minorRows')) {
      const pid = ctx.playerOfSeat.get(cs.seat) ?? -1;
      const pl = b.players.find((q) => q.id === pid);
      const bits = (s: string | undefined) => [...(s ?? '')].filter((x) => x === '1').length;
      console.error('ROW ' + JSON.stringify({ t: b.turn, p: pid, name: cs.name, ours, record, val: cs.prodSetValue ?? null,
        prog: Math.round(cs.prodProgress ?? 0), rprog: Math.round(Number(c?.queueProgress?.[0] ?? 0)),
        pop: cs.population, rpop: c?.pop, bld: (cs.buildings ?? []).length, rbld: c?.buildings.length,
        dis: (cs.districts ?? []).length, rdis: c?.districts.length,
        tech: cs.research.techs.length, rtech: bits(pl?.techs), civ: cs.research.civics.length, rciv: bits(pl?.civics),
        units: ctx.state.units.filter((u) => u.seat === cs.seat).length, runits: b.units.filter((u) => u.owner === pid).length,
        threat: cs.threat ?? null, gold: Math.round(cs.treasury), desire: cs.combatDesire ?? 0,
        trade: (cs.tradeValue ?? 0) / 256, tradeCities: cs.tradeCities ?? [] }));
    }
    const k = (tally.byKind[kind] ??= { turns: 0, same: 0 });
    tally.turns += 1;
    k.turns += 1;
    if (ours === record) {
      tally.same += 1;
      k.same += 1;
    } else {
      tally.first ??= { turn: b.turn, player: ctx.playerOfSeat.get(cs.seat) ?? -1, ours, record };
      if (tally.samples.length < 60) tally.samples.push(`t${b.turn} p${ctx.playerOfSeat.get(cs.seat)} ${ours || "none"} / ${record || "none"} (progress ${Math.round(cs.prodProgress ?? 0)})`);
    }
  }
}

/** THE CITY-STATES' RESEARCH: each city-state's techs, civics, their
 *  yields, choices, progress and costs after its turn against record t+1's
 *  (`MinorResearchTally`); nothing imposed */
function scoreMinorResearch(ctx: Ctx, b: TurnRecord, tally: MinorResearchTally): void {
  const { state } = ctx;
  for (const cs of state.cityStates) {
    const rcs = ctx.next.state.cityStates.find((x) => x.centerIndex === cs.centerIndex);
    const pid = ctx.playerOfSeat.get(cs.seat) ?? -1;
    const pl = b.players.find((q) => q.id === pid);
    if (!rcs || !pl) continue;
    const y = computeCityStats(state, minorCity(cs)).total;
    const r = cs.research;
    const q = rcs.research;
    const cost = (id: string | null, civic: boolean) => (id ? researchCost(state, id, civic, cs.seat) : null);
    tally.rows.push([b.turn, pid, r.techs.length, q.techs.length, r.civics.length, q.civics.length,
      r3(y.science), r3(Number(pl.scienceYield ?? 0)), r3(y.culture), r3(Number(pl.cultureYield ?? 0)), cs.population, rcs.population,
      r.tech, q.tech, r3(r.techProgress), r3(Number(pl.researchProgress ?? q.techProgress)), cost(r.tech, false), pl.researchCost === undefined ? null : Number(pl.researchCost),
      r.boosted.length, q.boosted.length, r.civic, q.civic, r3(r.civicProgress), r3(Number(pl.civicProgress ?? q.civicProgress)),
      cost(r.civic, true), pl.civicCost === undefined ? null : Number(pl.civicCost),
      r.boosted.filter((x) => !q.boosted.includes(x)).join(' '), q.boosted.filter((x) => !r.boosted.includes(x)).join(' ')]);
  }
  // their food and growth, and our formula on the record's own state
  for (const cs of state.cityStates) {
    const rcs = ctx.next.state.cityStates.find((x) => x.centerIndex === cs.centerIndex);
    const pid = ctx.playerOfSeat.get(cs.seat) ?? -1;
    const c = b.cities.find((x) => x.y * ctx.W + x.x === cs.centerIndex);
    if (!rcs || !c) continue;
    const ours = computeCityStats(state, minorCity(cs));
    const theirs = computeCityStats(ctx.next.state, minorCity(rcs));
    if (TRACE.has('minorFood') && ours.amenities.have - ours.amenities.needed !== theirs.amenities.have - theirs.amenities.needed) {
      console.error(`AMEN t${b.turn} p${pid} ours ${JSON.stringify(ours.amenities)} record ${JSON.stringify(theirs.amenities)} wars ${JSON.stringify(cs.wars)} / ${JSON.stringify(rcs.wars)} hp ${cs.hp} / ${rcs.hp}`);
    }
    // REPLAY_TRACE=minorFood: each city-state's yield modifiers beside the record's
    if (TRACE.has('minorFood') && ours.breakdown.bonuses.food !== theirs.breakdown.bonuses.food) {
      console.error(`FOOD t${b.turn} p${pid} ours ${JSON.stringify(getModifiers(state, cs.seat).cityYields)} record ${JSON.stringify(getModifiers(ctx.next.state, rcs.seat).cityYields)} civics ${cs.research.civics.filter((x) => !rcs.research.civics.includes(x)).join(',')} / ${rcs.research.civics.filter((x) => !cs.research.civics.includes(x)).join(',')} techs ${cs.research.techs.filter((x) => !rcs.research.techs.includes(x)).join(',')} / ${rcs.research.techs.filter((x) => !cs.research.techs.includes(x)).join(',')} bld ${(cs.buildings ?? []).join(',')} / ${(rcs.buildings ?? []).join(',')}`);
    }
    const owned = (st: GameState, seat: number) => st.map.tiles.filter((t) => t.ownerSeat === seat).map((t) => t.index);
    const mine = owned(state, cs.seat);
    const impDiff = mine.filter((i) => (state.map.tiles[i].improvement ?? null) !== (ctx.next.state.map.tiles[i].improvement ?? null)).length;
    tally.food.push([b.turn, pid, r3(cs.foodBox ?? 0), r3(Number(c.food ?? 0)), r3(ours.foodSurplus), r3(Number(c.foodSurplus ?? 0)),
      r3(theirs.foodSurplus), cs.population, c.pop, [...ours.workedTiles].sort((x, y) => x - y).join(' '),
      [...(c.worked ?? [])].sort((x, y) => x - y).join(' '), mine.length, owned(ctx.next.state, rcs.seat).length, impDiff,
      r3(ours.housing), r3(Number(c.housing ?? 0)), r3(ours.amenities.have - ours.amenities.needed),
      r3(Number(c.amenities ?? 0) - Number(c.amenitiesNeeded ?? 0)),
      mine.filter((i) => (state.map.tiles[i].improvement ?? null) !== (ctx.next.state.map.tiles[i].improvement ?? null))
        .map((i) => `${i}:${state.map.tiles[i].improvement ?? '-'}/${ctx.next.state.map.tiles[i].improvement ?? '-'}`).join(' '),
      (['tiles', 'districts', 'buildings', 'citizens', 'bonuses', 'trade'] as const).map((k) => `${k} ${r3(ours.breakdown[k].food)}/${r3(theirs.breakdown[k].food)}`).join(' '),
      r3(ours.total.food), r3(theirs.total.food),
      [...ours.workedTiles].filter((i) => { const x = state.map.tiles[i]; const y = ctx.next.state.map.tiles[i];
        return x.feature !== y.feature || x.resource !== y.resource || x.terrain !== y.terrain || !!x.pillaged !== !!y.pillaged; })
        .map((i) => `${i}:${state.map.tiles[i].feature ?? '-'},${state.map.tiles[i].resource ?? '-'}/${ctx.next.state.map.tiles[i].feature ?? '-'},${ctx.next.state.map.tiles[i].resource ?? '-'}`).join(' ')]);
  }
  // the majors' counts beside them, whose holdings the catch-up reads
  for (const s of state.seats) {
    const pid = ctx.playerOfSeat.get(s.seat) ?? -1;
    const q = seatOf(ctx.next.state, s.seat)?.research;
    if (!q) continue;
    const pl = b.players.find((x) => x.id === pid);
    tally.majors.push([b.turn, pid, s.research.techs.length, q.techs.length, s.research.civics.length, q.civics.length,
      r3(s.sciRate ?? 0), r3(Number(pl?.scienceYield ?? 0)), r3(s.culRate ?? 0), r3(Number(pl?.cultureYield ?? 0)), s.cities.length,
      b.cities.filter((c) => c.owner === pid).length]);
  }
}

/** the plots whose improvement the engine's own city-state, Free City or
 *  barbarian scripts changed in the turn take the record's: their builders'
 *  and raiders' decisions */
function undoMinorPlots(ctx: Ctx, before: (string | null)[], charges: Map<Unit, number>): void {
  const { state, next } = ctx;
  // the Builder whose charge the undone order spent gets it back: one that
  // stood on the plot after it with fewer charges than it began the turn on,
  // a Builder its last charge disbanded back on the map
  const refund = (plot: number): void => {
    for (const [u, c] of charges) {
      if (u.tileIndex !== plot || (u.charges ?? 0) >= c) continue;
      u.charges = (u.charges ?? 0) + 1;
      if (!state.units.includes(u)) state.units.push(u);
      return;
    }
  };
  for (const t of state.map.tiles) {
    if ((t.improvement ?? null) === before[t.index]) continue;
    if (t.ownerSeat >= 0 && t.ownerSeat < state.seats.length) continue;
    // a change that lands where the game's own did is the game's
    if ((t.improvement ?? null) === (next.state.map.tiles[t.index].improvement ?? null)) continue;
    const was = t.improvement;
    t.improvement = next.state.map.tiles[t.index].improvement;
    count(ctx, 'minorAi:improve', 'fallback', ctx.playerOfSeat.get(t.ownerSeat), `plot ${t.index}: the engine laid ${was}, the game ${t.improvement}`);
    if (was) refund(t.index);
  }
}

/** THE DEDICATIONS are each player's pick at its age's start, which the
 *  engines' own round robin stands in for: each seat commits the ones record
 *  t+1 shows through the engine's verb (`commitDedications`; runs/
 *  h1_duelw1117 Rome's Dark Age from t31 holds none, where the round robin's
 *  paid +1 on a boost at t35); a set the verb refuses is the record's */
function syncDedications(ctx: Ctx): void {
  ctx.state.seats.forEach((s, seat) => {
    const want = seatOf(ctx.next.state, seat)?.dedicationPicks ?? [];
    if ((s.dedicationPicks ?? []).join() === want.join()) return;
    const res = commitDedications(ctx.state, seat, want);
    if (res.ok) return void count(ctx, 'dedications', 'applied');
    s.dedicationPicks = [...want];
    s.dedications = want.length;
    count(ctx, 'dedications', 'fallback', ctx.playerOfSeat.get(seat), res.reason);
  });
}

/** THE PILLAGES AND REPAIRS: a pillage is a unit's action (the barbarians'
 *  and the players' alike), which the record's units carry, and so is a
 *  Builder's repair: each improvement standing on both sides takes record
 *  t+1's pillaged state */
function syncPillage(ctx: Ctx): void {
  const { state, next } = ctx;
  for (const t of state.map.tiles) {
    const r = next.state.map.tiles[t.index];
    if (!t.improvement || t.improvement !== r.improvement || !!t.pillaged === !!r.pillaged) continue;
    t.pillaged = !!r.pillaged;
    count(ctx, r.pillaged ? 'pillage' : 'repair', 'fallback', ctx.playerOfSeat.get(t.ownerSeat));
  }
}

// ---------------------------------------------------------------- comparison

/** one subsystem's comparison on one turn */
export interface SubTally {
  n: number;
  fail: number;
  /** reader failures the per-turn harness passes on the imported record */
  drift?: number;
  worst?: { subject: string; game: unknown; ours: unknown; gap: number };
}

type Tallies = Record<string, SubTally>;

function note(t: Tallies, sub: string, ok: boolean, subject: string, game: unknown, ours: unknown, gap = ok ? 0 : 1): void {
  const x = t[sub] ?? (t[sub] = { n: 0, fail: 0 });
  x.n += 1;
  if (ok) return;
  if (TRACE.has(sub)) console.error(`t${traceTurn} ${sub} ${subject} game=${JSON.stringify(game)} ours=${JSON.stringify(ours)}`);
  x.fail += 1;
  if (!x.worst || gap > x.worst.gap) x.worst = { subject, game, ours, gap };
}

/** a value holds only where it IS the game's: within half the game's 1/256 step
 *  (its 24.8 fixed point), never a looser tolerance — sub-step drift
 *  compounds in a free-running replay */
const EXACT = 1 / 512;
const near = (a: number, b: number) => Math.abs(a - b) <= EXACT;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const setOf = (xs: readonly (string | null)[]) => xs.filter((x) => x !== null).sort().join(',');

/** the engine's state against the importer's reading of record t+1 */
export function compareState(state: GameState, read: Imported): Tallies {
  const t: Tallies = {};
  const rs = read.state;
  const plotsOf = (st: GameState, c: City) => st.map.tiles.filter((x) => x.ownerSeat === c.seat && x.ownerCity === c.id).map((x) => x.index);
  for (const [rc, dump] of read.dumpOfCity) {
    const name = `city ${dump.owner}:${dump.id} ${dump.name.replace('LOC_CITY_NAME_', '')}`;
    const ec = cityAt(state, rc.centerIndex);
    note(t, 'city.exists', !!ec && ec.seat === rc.seat, name, rc.seat, ec?.seat ?? null);
    if (!ec || ec.seat !== rc.seat) continue;
    note(t, 'city.pop', ec.population === rc.population, name, rc.population, ec.population, Math.abs(ec.population - rc.population));
    note(t, 'city.food', near(ec.foodBox, rc.foodBox), name, r3(rc.foodBox), r3(ec.foodBox), Math.abs(ec.foodBox - rc.foodBox));
    note(t, 'city.culture', near(ec.cultureBox, rc.cultureBox), name, r3(rc.cultureBox), r3(ec.cultureBox), Math.abs(ec.cultureBox - rc.cultureBox));
    const ep = plotsOf(state, ec);
    const rp = plotsOf(rs, rc);
    note(t, 'city.plots', ep.join() === rp.join(), name, rp.length, ep.length, Math.abs(ep.length - rp.length) + (ep.join() === rp.join() ? 0 : 0.5));
    note(t, 'city.loyalty', near(ec.loyalty ?? 100, rc.loyalty ?? 100), name, r3(rc.loyalty ?? 100), r3(ec.loyalty ?? 100),
      Math.abs((ec.loyalty ?? 100) - (rc.loyalty ?? 100)));
    note(t, 'city.buildings', setOf(ec.buildings) === setOf(rc.buildings), name,
      rc.buildings.filter((b) => !ec.buildings.includes(b)), ec.buildings.filter((b) => !rc.buildings.includes(b)));
    const ds = (st: GameState, c: City) => setOf(c.districts.map((d) => `${d.type}@${d.tileIndex}${st.map.tiles[d.tileIndex].districtComplete || d.type === 'CITY_CENTER' ? '' : '*'}`));
    note(t, 'city.districts', ds(state, ec) === ds(rs, rc), name, ds(rs, rc), ds(state, ec));
    const eh = ec.queue[0];
    const rh = rc.queue[0];
    if (rh || eh) {
      const same = !!eh && !!rh && itemKey(eh) === itemKey(rh);
      // the record's progress is the game's 24.8 value truncated to whole
      // points (every recorded `queueProgress` is whole; runs/h1_duelw1117
      // Xi'an t19 a Settler at 0.80078125 overflow + 10.80078125 reads 11)
      const ok = same && (!read.queueProgressRead || Math.floor(eh.progress + 1e-9) === rh.progress);
      note(t, 'city.production', ok, name, rh ? `${itemKey(rh)} ${r3(rh.progress)}` : null, eh ? `${itemKey(eh)} ${r3(eh.progress)}` : null,
        same ? Math.abs(eh.progress - rh.progress) : 1000);
    }
    const ep2 = ec.religionPressure ?? [];
    const rp2 = rc.religionPressure ?? [];
    const gap = Math.max(0, ...rp2.map((v, i) => Math.abs((ep2[i] ?? 0) - v)), ...ep2.map((v, i) => Math.abs((rp2[i] ?? 0) - v)));
    if (rp2.some((v) => v > 0) || ep2.some((v) => v > 0)) note(t, 'city.pressure', gap <= EXACT, name, rp2.map(r3), ep2.map(r3), gap);
  }
  for (const [rcs, dump] of read.dumpOfMinor) {
    const name = `minor ${dump.owner} ${dump.name.replace('LOC_CITY_NAME_', '')}`;
    const ecs = state.cityStates.find((c) => c.centerIndex === rcs.centerIndex);
    note(t, 'minor.exists', !!ecs, name, rcs.centerIndex, ecs?.centerIndex ?? null);
    if (!ecs) continue;
    note(t, 'minor.pop', ecs.population === rcs.population, name, rcs.population, ecs.population, Math.abs(ecs.population - rcs.population));
    note(t, 'minor.food', near(ecs.foodBox ?? 0, rcs.foodBox ?? 0), name, r3(rcs.foodBox ?? 0), r3(ecs.foodBox ?? 0),
      Math.abs((ecs.foodBox ?? 0) - (rcs.foodBox ?? 0)));
    note(t, 'minor.culture', near(ecs.cultureBox ?? 0, rcs.cultureBox ?? 0), name, r3(rcs.cultureBox ?? 0), r3(ecs.cultureBox ?? 0),
      Math.abs((ecs.cultureBox ?? 0) - (rcs.cultureBox ?? 0)));
  }
  rs.seats.forEach((rsx, seat) => {
    const es = state.seats[seat];
    const name = `seat ${read.playerOfSeat.get(seat)} ${rsx.name}`;
    note(t, 'seat.gold', near(es.treasury ?? 0, rsx.treasury ?? 0), name, r3(rsx.treasury ?? 0), r3(es.treasury ?? 0),
      Math.abs((es.treasury ?? 0) - (rsx.treasury ?? 0)));
    note(t, 'seat.faith', near(es.faith ?? 0, rsx.faith ?? 0), name, r3(rsx.faith ?? 0), r3(es.faith ?? 0), Math.abs((es.faith ?? 0) - (rsx.faith ?? 0)));
    note(t, 'seat.techs', setOf(es.research.techs) === setOf(rsx.research.techs), name,
      rsx.research.techs.filter((x) => !es.research.techs.includes(x)), es.research.techs.filter((x) => !rsx.research.techs.includes(x)));
    note(t, 'seat.civics', setOf(es.research.civics) === setOf(rsx.research.civics), name,
      rsx.research.civics.filter((x) => !es.research.civics.includes(x)), es.research.civics.filter((x) => !rsx.research.civics.includes(x)));
    note(t, 'seat.boosts', setOf(es.research.boosted) === setOf(rsx.research.boosted), name,
      rsx.research.boosted.filter((x) => !es.research.boosted.includes(x)), es.research.boosted.filter((x) => !rsx.research.boosted.includes(x)));
    if (rsx.research.tech) {
      const same = es.research.tech === rsx.research.tech;
      note(t, 'seat.science', same && near(es.research.techProgress, rsx.research.techProgress), name,
        `${rsx.research.tech} ${r3(rsx.research.techProgress)}`, `${es.research.tech} ${r3(es.research.techProgress)}`,
        same ? Math.abs(es.research.techProgress - rsx.research.techProgress) : 1000);
    }
    if (rsx.research.civic) {
      const same = es.research.civic === rsx.research.civic;
      note(t, 'seat.culture', same && near(es.research.civicProgress, rsx.research.civicProgress), name,
        `${rsx.research.civic} ${r3(rsx.research.civicProgress)}`, `${es.research.civic} ${r3(es.research.civicProgress)}`,
        same ? Math.abs(es.research.civicProgress - rsx.research.civicProgress) : 1000);
    }
    note(t, 'seat.eraScore', (es.eraScore ?? 0) === (rsx.eraScore ?? 0), name, rsx.eraScore ?? 0, es.eraScore ?? 0,
      Math.abs((es.eraScore ?? 0) - (rsx.eraScore ?? 0)));
    note(t, 'seat.favor', near(es.diplomaticFavor ?? 0, rsx.diplomaticFavor ?? 0), name, rsx.diplomaticFavor ?? 0, r3(es.diplomaticFavor ?? 0),
      Math.abs((es.diplomaticFavor ?? 0) - (rsx.diplomaticFavor ?? 0)));
    note(t, 'seat.government', es.government.chosen === rsx.government.chosen
      && setOf(es.government.policies) === setOf(rsx.government.policies), name,
    [rsx.government.chosen, ...rsx.government.policies], [es.government.chosen, ...es.government.policies]);
    // the plots it has revealed, where the record carries them
    if (rsx.explored.length && es.explored.length) {
      const missing = rsx.explored.flatMap((v, i) => (v && !es.explored[i] ? [i] : []));
      const extra = es.explored.flatMap((v, i) => (v && !rsx.explored[i] ? [i] : []));
      note(t, 'fog.revealed', missing.length + extra.length === 0, name, { n: missing.length, plots: missing.slice(0, 8) },
        { n: extra.length, plots: extra.slice(0, 8) },
        missing.length + extra.length);
    }
  });
  // units: each seat's roster, by type
  const roster = (st: GameState) => {
    const m = new Map<number, string[]>();
    for (const u of st.units) {
      if (!m.has(u.seat)) m.set(u.seat, []);
      m.get(u.seat)!.push(u.type);
    }
    return m;
  };
  const er = roster(state);
  for (const [seat, types] of roster(rs)) {
    const mine = er.get(seat) ?? [];
    const missing = types.filter((x, i) => types.indexOf(x) === i).flatMap((x) => {
      const d = types.filter((y) => y === x).length - mine.filter((y) => y === x).length;
      return d !== 0 ? [`${x}${d > 0 ? '-' : '+'}${Math.abs(d)}`] : [];
    });
    const extra = mine.filter((x) => !types.includes(x)).map((x) => `${x}+`);
    note(t, 'units.roster', missing.length + extra.length === 0, `seat ${seat}`, types.length, [mine.length, ...missing, ...extra],
      missing.length + extra.length);
  }
  // plots
  for (const rt of rs.map.tiles) {
    const et = state.map.tiles[rt.index];
    const name = `plot ${rt.index} (${rt.col},${rt.row})`;
    note(t, 'plots.owner', et.ownerSeat === rt.ownerSeat, name, rt.ownerSeat, et.ownerSeat);
    note(t, 'plots.improvement', (et.improvement ?? null) === (rt.improvement ?? null) && !!et.pillaged === !!rt.pillaged, name,
      rt.improvement, et.improvement);
    note(t, 'plots.feature', (et.feature ?? null) === (rt.feature ?? null), name, rt.feature, et.feature);
    note(t, 'plots.resource', (et.resource ?? null) === (rt.resource ?? null), name, rt.resource, et.resource);
  }
  return t;
}

/** each mapped unit's health against record t+1 */
function compareUnits(ctx: Ctx, b: TurnRecord, t: Tallies): void {
  for (const r of b.units) {
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u) continue;
    const hp = UNIT_HP - num(r.damage);
    note(t, 'units.health', u.hp === hp, `unit ${r.owner}:${r.id} ${u.type}`, hp, u.hp, Math.abs(u.hp - hp));
  }
}

/** the per-turn harness's state checks asked of the engine's state: the
 *  record t+1 importer's reading with the engine's state in its place */
function engineAsImported(state: GameState, read: Imported): Imported {
  const dumpOfCity = new Map<City, DumpCity>();
  const cityByKey = new Map<string, City>();
  for (const [rc, dump] of read.dumpOfCity) {
    const ec = cityAt(state, rc.centerIndex);
    if (!ec || ec.seat !== rc.seat) continue;
    dumpOfCity.set(ec, dump);
    cityByKey.set(`${dump.owner}:${dump.id}`, ec);
  }
  const congress = state.congress ?? [];
  return { ...read, state, dumpOfCity, cityByKey, routes: [], congressOf: () => congress };
}

function readerTallies(mine: CheckResult[], base: CheckResult[], t: Tallies): void {
  const baseOk = new Map(base.map((r) => [`${r.check}|${r.subject}`, r.skip ? null : r.ok]));
  for (const r of mine) {
    if (r.skip) continue;
    const sub = `read.${r.check}`;
    note(t, sub, r.ok, r.subject, r.game, r.ours, r.ok ? 0 : 1);
    if (!r.ok && baseOk.get(`${r.check}|${r.subject}`) === true) t[sub].drift = (t[sub].drift ?? 0) + 1;
  }
}

// ---------------------------------------------------------------- the driver

export interface ReplayTurn {
  turn: number;
  subsystems: Tallies;
  /** the decisions that fell back or were refused, by kind */
  fallbacks: Record<string, number>;
  /** the recorded outcomes the replay imposed on the pair (every fallback),
   *  by kind */
  imposed: Record<string, number>;
  /** the generator was re-seeded from the record's witness */
  reseeded: boolean;
}

const ALL_SUBSYSTEMS = '*';
const UNITS_SUBS = ['units.health', 'units.roster'];
const PLOT_SUBS = ['plots.improvement', 'plots.feature', 'plots.resource', 'read.plot.yields'];
/** THE SUBSYSTEMS AN IMPOSED OUTCOME TOUCHES, by kind (the part before the
 *  first `:`, else the whole kind): a kind not named reaches every one —
 *  a seat's purse, research, government, or a city's state flows into all */
const IMPOSES_ON: Record<string, readonly string[]> = {
  combat: UNITS_SUBS, hit: UNITS_SUBS, seize: UNITS_SUBS, levyEnd: UNITS_SUBS, gpActivate: UNITS_SUBS, kill: UNITS_SUBS, unitGone: UNITS_SUBS, unitNew: UNITS_SUBS, upgrade: UNITS_SUBS,
  promote: UNITS_SUBS, 'minorAi:unit': UNITS_SUBS, 'minorAi:unitNew': UNITS_SUBS, 'minorAi:buy': UNITS_SUBS, 'minorAi:move': UNITS_SUBS,
  'minorAi:improve': PLOT_SUBS, pillage: PLOT_SUBS, repair: PLOT_SUBS, improve: PLOT_SUBS, clear: PLOT_SUBS,
  'draw:eventSoil': ['plots.feature', 'read.plot.yields'],
  'draw:camps': ['plots.improvement', 'barb.camps'],
  'barb:unit': UNITS_SUBS, 'barb:unitNew': UNITS_SUBS, 'barb:move': UNITS_SUBS,
  'draw:floodRiver': [...UNITS_SUBS, 'plots.feature', 'read.plot.yields'],
  // a major's trained unit completed as the record completed it: the unit,
  // its city's item, a Settler's citizen, the unit's upkeep and price climb
  'unitNew:trained': [...UNITS_SUBS, 'city.production', 'city.pop', 'read.seat.maintUnits', 'read.buy.unitCost', 'read.buy.unitGold', 'read.buy.unitFaith'],
  // a village paid as the record paid it: its Gold, Faith, boosts, citizen,
  // the unit's price climb, its moment and the hut's plot
  village: ['seat.gold', 'seat.faith', 'seat.boosts', 'seat.science', 'seat.culture', 'seat.techs', 'seat.civics',
    'seat.eraScore', 'city.pop', 'city.food', 'city.pressure', 'plots.improvement', 'read.buy.unitCost', 'read.buy.unitGold'],
};

function imposesOn(kind: string, sub: string): boolean {
  const on = IMPOSES_ON[kind] ?? IMPOSES_ON[kind.split(':')[0]] ?? [ALL_SUBSYSTEMS];
  return on.includes(ALL_SUBSYSTEMS) || on.includes(sub);
}

export interface Divergence {
  turn: number;
  subject: string;
  game: unknown;
  ours: unknown;
  gap: number;
  /** the per-turn harness's step check on the same subject and pair, where
   *  one reads the subsystem: pass, fail or its skip reason */
  perTurn?: string;
  /** the fallbacks the subject's player took on this pair */
  fallbacks?: string[];
  /** the checks the per-turn harness fails on the subject on the records so
   *  far: a rule the imported record reads wrong as well */
  perTurnFails?: string[];
}

export interface ReplayReport {
  dump: string;
  source: string;
  turns: number[];
  /** per subsystem: turns held exactly from the first pair, turns matched in
   *  all, turns compared, and the first divergence; the first pair on which
   *  the replay imposed a recorded outcome touching it (`IMPOSES_ON`), and
   *  the turns held from the first pair before it — the engine's own */
  subsystems: Record<string, { held: number; matched: number; compared: number; first?: Divergence;
    imposedFrom?: number; clean: number }>;
  /** the pairs from the first on which every subsystem held with nothing
   *  imposed on it */
  cleanEvery: number;
  /** per decision kind: how many applied through the engine's verbs, fell
   *  back to the recorded outcome, or were refused */
  decisions: Record<string, Record<Outcome, number>>;
  /** the recorded events no reader takes, by event name */
  unread: Record<string, number>;
  /** per decision kind the event log settles: the log's decisions, the
   *  inference's, and how many of the log's the inference named alike */
  settled: Record<string, LogTally>;
  perTurn: ReplayTurn[];
  /** the barbarians' moves against the game's tactical log, by the game's
   *  move (`tallyTactics`) */
  barbTactics: Record<string, BarbTally>;
  /** the city-states' and the Free Cities' moves (`minorAi`) */
  minorTactics: Record<string, BarbTally>;
  minorDraws: MinorDrawTally;
  /** the city-states' items in hand after their turn against record t+1's
   *  queue heads (`minorBuilds`) */
  minorBuilds: MinorBuildTally;
  /** the city-states' research against the record's (`scoreMinorResearch`) */
  minorResearch: MinorResearchTally;
  /** where the replay stopped short of the last record, and why */
  stopped?: string;
  /** why the engine refused the decisions it refused, by kind and reason */
  refusals: Record<string, Record<string, number>>;
  /** the research AI's choices, majors' and city-states' (`ResearchAiTally`) */
  researchAi: Record<ResearchParty, ResearchAiTally>;
  /** the research AI's analysis against the game's AI log (`ResearchScoreTally`) */
  researchScores: Record<ResearchParty, ResearchScoreTally>;
  /** the civics AI's choices (`ResearchAiTally`) and its analysis against
   *  the game's AI log */
  civicAi: Record<ResearchParty, ResearchAiTally>;
  civicScores: Record<ResearchParty, ResearchScoreTally>;
  /** the city-states' city build value tables against the game's AI log
   *  (`CityBuildTally`), in all and per building */
  cityBuild?: CityBuildTally;
  cityBuildPer?: Record<string, CityBuildTally>;
  /** the majors' AI's government and card choices beside the record's */
  strategies?: { engine: StrategyTally; record: StrategyTally };
  contacts?: ContactTally;
  majorAi?: MajorAiTally;
  religionAi?: ReligionAiTally;
  governorAi?: GovernorAiTally;
  congressAi?: CongressAiTally;
  greatPeopleAi?: GreatPeopleAiTally;
  cityBuildAi?: CityBuildAiTally;
  /** the majors' opinion of each other beside the game's diplomacy log */
  diplomacy?: DiplomacyTally;
  /** the AI majors' own diplomatic sending */
  sender?: SenderTally;
  /** the AI majors' own religion choices against the record's */
  religionActions?: ReligionActions;
  settleAi?: SettleTallies;
  /** the majors' operations beside the game's operation log */
  operationsAi?: OperationsTally;
}

/** one game move's tally (`tallyTactics`): the unit-turns, those the AI
 *  moved by the same move, those whose end plot the record holds and those
 *  it matched, the first turn each differed */
export interface BarbTally {
  units: number;
  move: number;
  plotOf: number;
  plot: number;
  firstMove?: number;
  firstPlot?: number;
}

/** the city-states' builds: the minor-turns compared, those whose item in
 *  hand after its turn is record t+1's queue head, per the record's item kind
 *  (unit, building, district, project, none), the first turn one differed */
/** THE CITY-STATES' RESEARCH after each turn against record t+1's, one row
 *  per minor-turn: [turn, player, techs ours, record, civics ours, record,
 *  Science a turn ours, record, Culture ours, record, population ours,
 *  record, the research ours, record, its progress ours, record, its cost
 *  ours, record, boosts held ours, record, the civic ours, record, its
 *  progress ours, record, its cost ours, record, the boosts ours alone, the record's
 *  alone] */
export interface MinorResearchTally {
  rows: (number | string | null)[][];
  /** each city-state's food and growth after its turn against record t+1's:
   *  [turn, player, food box ours, record, surplus ours, record, our formula
   *  on the record's own state, population ours, record, worked plots ours,
   *  record, the plots it owns ours, record, the improved plots whose
   *  improvement differs, the housing ours, record, the amenities' balance
   *  ours, record, the differing improvements "plot:ours/record"] */
  food: (number | string)[][];
  /** each major's [turn, player, techs ours, record, civics ours, record,
   *  Science a turn ours, record, Culture ours, record, cities ours, record] */
  majors: number[][];
}

export interface MinorBuildTally {
  turns: number;
  same: number;
  byKind: Record<string, { turns: number; same: number }>;
  first?: { turn: number; player: number; ours: string; record: string };
  /** the first differing minor-turns, each "tTURN pPLAYER ours / record" */
  samples: string[];
}

/** the city-states' "Random Direction" draws: the turns whose draws pair
 *  one to one with the log's Wander and Garrison rows, the draws the AI
 *  took on the log's own, those over the log's range, the first turn one
 *  was not */
export interface MinorDrawTally {
  turns: number;
  paired: number;
  draws: number;
  sameRange: number;
  firstOff?: number;
}

/** the game's tactical log: per turn, per barbarian unit ID, its first
 *  row's move and the rest of that row; per turn, the barbarian units of its
 *  Wander rows in their order; per turn, per other player's unit
 *  (`player:ID`), its first row's
 *  move; per turn, the unit (`player:ID`) of each row whose move takes a
 *  "Random Direction" draw (Wander, Garrison), every player's, in order */
interface Tactical {
  first: Map<number, Map<number, { move: string; extra: string }>>;
  wanders: Map<number, number[]>;
  others: Map<number, Map<string, string>>;
  drawRows: Map<number, string[]>;
}

/** the game's tactical log beside a dump (`<dump>.logs/AI_Tactical.csv`) */
function loadTactical(dumpPath: string): Tactical | undefined {
  const path = dumpPath.replace(/\.jsonl$/, '.logs/AI_Tactical.csv');
  if (!existsSync(path)) return undefined;
  const out = new Map<number, Map<number, { move: string; extra: string }>>();
  const wanders = new Map<number, number[]>();
  const others = new Map<number, Map<string, string>>();
  const drawRows = new Map<number, string[]>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const f = line.split(', ');
    if (f.length < 6) continue;
    const m = /\((\d+)\)/.exec(f[5]);
    if (!m) continue;
    const turn = Number(f[0]);
    const id = Number(m[1]);
    const key = `${f[1]}:${id}`;
    if (f[2] === 'Wander' || f[2] === 'Garrison') drawRows.set(turn, [...(drawRows.get(turn) ?? []), key]);
    if (f[1] !== '63') {
      let o = others.get(turn);
      if (!o) others.set(turn, (o = new Map()));
      if (!o.has(key)) o.set(key, f[2]);
      continue;
    }
    if (f[2] === 'Wander') wanders.set(turn, [...(wanders.get(turn) ?? []), id]);
    let t = out.get(turn);
    if (!t) out.set(turn, (t = new Map()));
    if (!t.has(id)) t.set(id, { move: f[2], extra: f.slice(6).join(", ") });
  }
  return { first: out, wanders, others, drawRows };
}

/** the per-turn step check that reads each state subsystem */
const STEP_OF: Record<string, string> = {
  'city.pop': 'step.growth', 'city.food': 'step.growth', 'city.culture': 'step.border', 'city.plots': 'step.border',
  'city.loyalty': 'step.loyalty', 'city.pressure': 'step.pressure', 'seat.eraScore': 'step.eraScore',
};

function loadRecords(dumpPath: string, from: number, to: number): { cat: Catalog; recs: TurnRecord[] } {
  const cat = loadCatalog(dumpPath);
  const byTurn = new Map<number, TurnRecord>();
  for (const line of readFileSync(dumpPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as TurnRecord;
    if (rec.moved || rec.turn < from || rec.turn > to) continue;
    byTurn.set(rec.turn, rec);
  }
  return { cat, recs: [...byTurn.keys()].sort((a, b) => a - b).map((t) => byTurn.get(t)!) };
}

/** the seed the record's witness holds for the first major's start of turn */
function turnSeed(rec: TurnRecord): number | undefined {
  const first = Math.min(...rec.players.filter((p) => bool(p.major)).map((p) => p.id));
  const w = (rec.witness ?? []).find((x) => x.turn === rec.turn && x.player === first && x.point === 'pre');
  const s = num(w?.seed);
  return Number.isFinite(s) ? s >>> 0 : undefined;
}

export function runReplay(dumpPath: string, opts: { from?: number; to?: number; source?: ActionSource;
  /** called after each pair is compared, with the engine state and record t+1 */
  onPair?: (state: GameState, b: TurnRecord, decisions: Decision[]) => void } = {}): ReplayReport {
  const { cat, recs } = loadRecords(dumpPath, opts.from ?? -Infinity, opts.to ?? Infinity);
  const source = opts.source ?? (recs.some((r) => Array.isArray((r as { actions?: unknown }).actions)) ? new RecordedActions() : new InferredActions());
  const history: History = newHistory();
  // the game's own draw log, where the recording kept it
  const logPath = randLogPath(dumpPath);
  if (logPath) {
    history.randLog = loadRandLog(logPath, recs.flatMap((r) => (r.witness ?? []).flatMap((w) => (typeof w.seed === 'number' ? [w.seed] : []))));
  }
  history.replay = replayEvents(recs, cat, history.randLog);
  // the game's combat log, where the recording kept it: each record carries
  // the battles of the turns its event log covers (`RecordedActions`)
  const combat = loadCombatLog(dumpPath, recs.flatMap((r) => (r.witness ?? []).flatMap((w) => (typeof w.seed === 'number' ? [w.seed] : []))));
  if (combat) for (const r of recs) r.combatLog = combat.filter((x) => x.turn === r.turn - 1 || x.turn === r.turn);
  const report: ReplayReport = { dump: dumpPath, source: source.constructor.name, turns: [], subsystems: {}, cleanEvery: 0, decisions: {}, unread: {}, settled: {}, perTurn: [], refusals: {},
    researchAi: { major: newResearchTally(), minor: newResearchTally(), free: newResearchTally() },
    researchScores: { major: { rows: 0, turns: 0, score: 0 }, minor: { rows: 0, turns: 0, score: 0 }, free: { rows: 0, turns: 0, score: 0 } },
    civicAi: { major: newResearchTally(), minor: newResearchTally(), free: newResearchTally() },
    civicScores: { major: { rows: 0, turns: 0, score: 0 }, minor: { rows: 0, turns: 0, score: 0 }, free: { rows: 0, turns: 0, score: 0 } }, barbTactics: {},
    minorTactics: {}, minorDraws: { turns: 0, paired: 0, draws: 0, sameRange: 0 }, minorBuilds: { turns: 0, same: 0, byKind: {}, samples: [] }, minorResearch: { rows: [], majors: [], food: [] } };
  if (recs.length < 2) return report;
  advanceHistory(history, recs[0], cat);
  const first = importTurn(recs[0], cat, history);
  const stream = streamHold(first.state, recs, first.playerOfSeat, history);
  holdRng(stream);
  if (TRACE.has('minorAi')) traceMinorAi((l) => console.error(l));

  // a city-state's army moves and fights as the record's moves and battles
  // say (`syncUnits`, `battle`) and its Trader goes where the record's
  // routes run (`routes`); its units' tactical turn runs on a copy beside
  // the record (`minorAi`). What its city builds and buys and its trees'
  // Builders' work are its AI's own (`minorAiTurn`), set against the record
  // after its turn (`minorBuilds`, `buyUnit`, `improve`, `unitNew`)
  holdMinorOrders(true);
  holdCityStrikes(true);
  holdLevies(true);
  const state = first.state;
  // each seat starts on the plots the record says it revealed
  // (`TurnRecord.revealed`), else on what its own plots, cities and units
  // reveal (`initFog`); its moments read them
  const read = state.seats.map((s) => s.explored);
  initFog(state);
  state.seats.forEach((s, i) => { if (read[i]?.length) s.explored = read[i]; });
  for (const p of recs[0].players) {
    const seat = first.seatOfPlayer.get(p.id);
    if (seat !== undefined && state.seats[seat]) state.seats[seat].handicap = LAB_HANDICAP;
  }
  seedMoments(state, first, history);
  // the city-states' city AI ran on the game's turns before the import's:
  // its first look ran no events (none contracted), its savings took the
  // treasury; it stands as that turn left it
  if (state.turn > 1) {
    for (const cs of state.cityStates) {
      if (cs.centerIndex < 0) continue;
      cs.cityAi = newCityAi();
      cs.economy = newEconomicMemory();
      savingsTurn(cs.economy, Math.trunc(cs.treasury * FX), false);
    }
  }
  // their knowledge bases hold the look of the import's turn, which their
  // military AI reads on the next
  for (const cs of state.cityStates) if (cs.centerIndex >= 0) minorKnowledge(state, cs, false);
  // the AI majors: every major the record's first turn names no human
  const aiSeats = new Map<number, number>();
  const majorSeats = new Map<number, number>();
  for (const p of recs[0].players) {
    const seat = first.seatOfPlayer.get(p.id);
    if (seat === undefined || seat >= state.seats.length) continue;
    majorSeats.set(p.id, seat);
    if (!bool(p.human)) aiSeats.set(seat, p.id);
  }
  const diplomacy = new DiplomacyProbe(dumpPath, first.playerOfSeat, first.seatOfPlayer);
  diplomacy.setup(state, history.randLog, recs[0].players.map((p) => p.id).sort((x, y) => x - y));
  const strategies = new StrategyProbe(dumpPath, new Map([...majorSeats].map(([pid, seat]) => [seat, pid] as const)),
    (seat) => diplomacy.agendasOf(seat));
  // what the majors' AI reads of its own: the strategies its victory manager
  // follows, the agendas its diplomacy carries
  const aiInputs = (turn: number): MajorViewInputs => ({ strategies: strategies.followedBefore(turn),
    agendas: new Map([...majorSeats.values()].map((seat) => [seat, diplomacy.agendasOf(seat)] as const)) });
  const majorAi = new MajorAiProbe(dumpPath, aiSeats, aiInputs);
  const settleAi = new SettleProbe(dumpPath, aiSeats, aiInputs);
  const religionAi = new ReligionProbe(dumpPath, aiSeats, (seat) => strategies.knownCities(seat));
  const sender = new DiploSender(dumpPath, aiSeats, first.playerOfSeat);
  const congressAi = new CongressProbe(dumpPath, aiSeats, first.playerOfSeat);
  const greatPeopleAi = new GreatPeopleProbe(dumpPath, aiSeats, cat);
  diplomacy.attach(aiInputs, (seat) => strategies.knownCities(seat), sender);
  const missions = readMissions(dumpPath);
  // the operations of every AI party with a manager: the AI majors and the
  // city-states
  const opsSeats = new Map([...aiSeats, ...[...first.minorOfPlayer].map(([player, cs]) => [cs.seat, player] as [number, number])]);
  const operationsAi = new OperationsProbe(dumpPath, opsSeats, cat, first.seatOfPlayer, aiInputs);
  // the wars of the AI majors' diplomatic sending read their operations' AI
  if (operationsAi.active) sender.war = operationsAi.warHooks();
  const ctx: Ctx = {
    state, cat, W: recs[0].head.W, seatOfPlayer: first.seatOfPlayer, playerOfSeat: first.playerOfSeat,
    units: new Map(), retained: new Map(), pendingMinors: new Map(), next: first, tally: new Map(), fellBack: new Map(), imposed: new Map(), reasons: new Map(),
    engineKilled: new Set(), paths: new Map(), barbBlows: new Map(), minorBlows: new Map(), barbSteps: [], envoys: [], battled: new Set(), fortified: new Map(), barbNew: [], lateEnvoys: [], log: history.randLog, stream, prev: recs[0],
    researchAi: report.researchAi, researchScores: report.researchScores, researchBefore: new Map(), aiResearchLog: loadAiResearchLog(dumpPath),
    tactical: loadTactical(dumpPath), barbTally: report.barbTactics, minorTally: report.minorTactics, minorDraws: report.minorDraws,
    civicAi: report.civicAi, civicScores: report.civicScores, civicBefore: new Map(), aiCivicLog: loadAiCivicLog(dumpPath), majorCivicEntries: new Map(),
    cityBuildLog: loadCityBuildTables(dumpPath), cityBuild: newCityBuildTally(), cityBuildPer: new Map(),
    governorAi: new GovernorProbe(dumpPath, aiSeats, () => strategies.followedNow()),
    cityBuildAi: new CityBuildProbe(dumpPath, aiSeats, aiInputs),
    operationsAi, minorOps: new Map(),
    religionPort: { seats: new Set(aiSeats.keys()), probe: religionAi, inputs: {}, pantheonTurn: new Map(), mustFound: new Set() },
  };
  // the city-states' operation lines, gathered over the pair: their
  // military AI's turn in the engine's turn, their run in their units' turn
  // (`minorAi`)
  traceMinorOps((seat, line, candidate) => {
    let e = ctx.minorOps.get(seat);
    if (!e) ctx.minorOps.set(seat, (e = { lines: [], evals: [] }));
    (candidate ? e.evals : e.lines).push(line);
  });
  // a feature or resource a city-state's Builder would clear that record t+1
  // still holds stands: the game's Builder kept it (`minorAi:clear`)
  holdMinorClears((plot, clears) => {
    const r = ctx.next.state.map.tiles[plot];
    if (!(clears === 'feature' ? r.feature : r.resource)) return false;
    count(ctx, 'minorAi:clear', 'fallback', ctx.playerOfSeat.get(ctx.state.map.tiles[plot].ownerSeat),
      `plot ${plot}: the engine cleared its ${clears}, the game kept it`);
    return true;
  });
  // the record's units in the importer's order
  let k = 0;
  for (const u of recs[0].units) {
    if (!first.seatOfPlayer.has(u.owner) || !engineRowOf(cat, 'unit', u.type)) continue;
    ctx.units.set(`${u.owner}:${u.id}`, state.units[k++]);
  }
  for (const [pid, cs] of first.minorOfPlayer) {
    if (cs.centerIndex >= 0) continue;
    ctx.pendingMinors.set(pid, cs);
  }
  // per subsystem, the index of the first pair it diverged on: the pairs
  // before it held, those it had nothing to compare on included
  const brokeAt = new Map<string, number>();
  // every check the per-turn harness fails, by subject, on the records so far
  const baseFails = new Map<string, Set<string>>();
  let prev: TurnRecord | undefined;
  // record t as the importer reads it (the settle probe's second source)
  let recordState: GameState | null = null;
  for (let i = 0; i + 1 < recs.length; i++) {
    const a = recs[i];
    const b = recs[i + 1];
    if (b.turn !== a.turn + 1) {
      report.stopped = `no record of turn ${a.turn + 1}`;
      break;
    }
    if (state.turn !== a.turn) {
      report.stopped = `engine at turn ${state.turn}, record at ${a.turn}`;
      break;
    }
    const baseStep = transitionChecks(a, b, cat, history, prev);
    advanceHistory(history, b, cat);
    const recordA = ctx.next;
    const read = importTurn(b, cat, history);
    ctx.next = read;
    ctx.prev = a;
    ctx.fellBack = new Map();
    ctx.imposed = new Map();
    ctx.battled = new Set();
    ctx.fortified = fortifiedIn(b);
    ctx.paths = new Map();
    ctx.barbBlows = new Map();
    ctx.minorBlows = new Map();
    ctx.barbNew = [];
    ctx.lateEnvoys = [];
    traceTurn = b.turn;
    const holders = [...state.seats, ...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : [])];
    ctx.researchBefore = new Map(holders.map((s) => [s.seat, s.research.tech]));
    ctx.civicBefore = new Map(holders.map((s) => [s.seat, s.research.civic]));
    const ds = source.decisions(a, b, cat);
    // the AI majors' governor turns, on the state their AI turn t reads:
    // the active player's as the pair opens
    ctx.governorAi.clear();
    ctx.governorAi.aiTurn(state, a.turn, (p) => p === activePlayer(a), (s, id) => recordCityName(ctx, s, id));
    stream.actions(a.turn);
    applyPhase(ctx, ds, 'before', b, a);
    // the active player's units stand where its actions left them before its
    // next start (`endTurn`'s seat phase): its moves reveal, and meet, there
    syncUnits(ctx, b, activePlayer(a));
    activeBoosts(ctx, b, activePlayer(a));
    stageEnvoys(ctx, ds, a, b, history.randLog);
    const staged = stagePolicies(ctx, ds);
    // the AI majors' ballots of the session the engine's turn holds
    if (congressAi.active) congressAi.arm(a.turn, aiInputs(a.turn), (x) => diplomacy.agendasOf(x));
    majorAi.preTurn(state);
    strategies.preTurn(state, recordA.state, turnStartCompletions(ctx, b, a.turn), recordMilitary(a, cat, ctx.seatOfPlayer));
    diplomacy.preTurn(state, recordA.state, read.state);
    strategies.recordContacts(b, ctx.seatOfPlayer);
    settleAi.preTurn(state, recordState);
    operationsAi.preTurn(a, recordA.state, b, read.state);
    recordState = read.state;
    // the generator: held at each witnessed point (`streamHold`)
    const seed = turnSeed(b);
    const standing = new Set(state.units);
    const improvements = state.map.tiles.map((x) => x.improvement ?? null);
    const charges = new Map(state.units.filter((u) => minorAiSeat(u.seat) && (u.charges ?? 0) > 0).map((u) => [u, u.charges ?? 0]));
    // what each unit did in its player's actions of the turn, which the
    // turn's heal and fortification read: one that stood on its plot and
    // fought nobody rested, any other spent its moves. A record's moves do
    // not tell (runs/h1_duelw1118 China's Warrior reads 0 moves fortified,
    // healing +10 at t7 and t8; 1116 Auckland's reads 2). A major's units take
    // their moves at its seat phase and spend them in its own orders, which
    // the record's moves stand in for outside the turn: a unit that spent its
    // moves keeps none of the turn's rest heal (runs/h1_duelw1118 China's
    // Warrior moved at t5 and read 38 at t6, unhealed)
    // a unit struck in another player's turn spent nothing of its own: only
    // the blows it dealt count (runs/h1_duelw1118 t8: a city-state's Warrior
    // that stood its turn, then took a barbarian Spearman's attack, held the
    // turn's fortification against it)
    const struckOnly = new Set(ds.flatMap((d) => (d.kind === 'battle' ? [d.defender] : [])));
    const fought = new Set(ds.flatMap((d) => (d.kind === 'combat' && !struckOnly.has(d.unit) ? [d.unit] : d.kind === 'battle' ? [d.attacker] : [])));
    const was = new Map(a.units.map((u) => [`${u.owner}:${u.id}`, u.y * ctx.W + u.x]));
    // where the record carries its log, a unit walked when the log names its
    // steps — a unit pushed off its plot (`UnitTeleported`) spent nothing
    // (runs/h1_duelw1118 Rome's Warrior, displaced at t17, healed 8)
    const logged = Array.isArray((b as { actions?: unknown }).actions);
    const walked = new Set(ds.flatMap((d) => (d.kind === 'move' && d.path ? [d.unit] : [])));
    const spent = new Map<Unit, number>();
    const struckHp = new Map<Unit, number>();
    // a barbarian unit's rest: whether it stood the turn through and struck
    // no blow
    const barbRest = new Map<Unit, boolean>();
    const struck = new Set(ds.flatMap((d) => (d.kind === 'battle' ? [d.attacker] : [])));
    // a unit the pair killed rests or spends as its actions had it before
    // the blow (runs/h1_duelw1124 t20: Rome's Warrior attacked, then fell to
    // the barbarians at 1 HP, unhealed)
    const held = new Set(b.units.map((r) => `${r.owner}:${r.id}`));
    for (const r of [...b.units, ...a.units.filter((x) => !held.has(`${x.owner}:${x.id}`))]) {
      const key = `${r.owner}:${r.id}`;
      const u = unitOf(ctx, key);
      if (!u) continue;
      const stood = logged ? !walked.has(key) : was.get(key) === r.y * ctx.W + r.x;
      const rested = stood && !fought.has(key);
      // a city-state's or Free City's unit acts in the engine's turn, its own
      // AI's: it starts that turn on its moves (runs/h1_duelw1121 t8: Hunza's
      // Builder, its Farm laid at t7, walks to plot 275 on its moves), its
      // rest heal still the record's actions' (runs/h1_duelw1124 t10: city-
      // state 2's Warrior attacked the Spearman at 8:14 and fought it again
      // at t11 on 62 HP, unhealed)
      u.movesLeft = rested || minorAiSeat(u.seat) ? grantedMoves(state, u) : 0;
      if (!rested) spent.set(u, u.hp);
      else if (struckOnly.has(key)) struckHp.set(u, u.hp);
      if (isBarbSeat(u.seat)) barbRest.set(u, stood && !struck.has(key) && num(r.fortify) > 0);
    }
    // THE BARBARIANS' TURN closes the pair (`barbarianTurn`), after the
    // other players' actions; their units' moves and battles are the
    // record's (`syncUnits`, `battle`), so they sit the engine's turn out
    // (`holdBarbarians`): the engine's AI would fight battles the record
    // never fought (runs/h1_duelw1117 t11: a Warrior China's engine killed that
    // the game's lived to t12). The city-states' units stay: their script's
    // draws are on the turn's stream before the random events
    // (runs/h1_duelw1118 t7: without them a flood's draw took a citizen of
    // Rome the game's spared)
    // The turn's end strikes the map their turn left: a unit record t+1
    // holds stands its random events and climate where it holds it, and
    // leaves the engine's turn after them (runs/h1_duelw1121 t19: an
    // eruption's damage on a barbarian Spearman and Horse Archer).
    const barbs: Unit[] = [];
    const barbAt = new Map<Unit, number>();
    for (const r of b.units) {
      const u = unitOf(ctx, `${r.owner}:${r.id}`);
      if (u && isBarbSeat(u.seat)) barbAt.set(u, r.y * ctx.W + r.x);
    }
    const takeBarbs = (st: GameState, keep: boolean) => {
      barbs.push(...st.units.filter((u) => isBarbSeat(u.seat) && !(keep && barbAt.has(u))));
      st.units = st.units.filter((u) => !isBarbSeat(u.seat) || (keep && barbAt.has(u)));
    };
    const barbFrom = new Map<Unit, number>();
    holdBarbarians((st) => {
      takeBarbs(st, true);
      for (const [u, at] of barbAt) {
        barbFrom.set(u, u.tileIndex);
        u.tileIndex = at;
      }
    }, (st) => {
      // back where the replay's own steps take them from (`syncUnits`)
      for (const [u, at] of barbFrom) u.tileIndex = at;
      takeBarbs(st, false);
    }, (st, on) => {
      // the city-states' turn sees them where the pair's first record holds
      // them, before their own moves (the minors' look, threat and
      // operations): back in the state while that turn runs, out after it
      if (on) {
        st.units.push(...barbs);
        barbs.length = 0;
      } else takeBarbs(st, false);
    });
    const tribesBefore = state.barbTribes?.length ?? 0;
    // THE CATCH-UP'S COUNT: the majors' research as the record holds it at
    // the city-states' starts — the majors' research is their decisions and
    // their economy, not the city-states', so the count reads the game's.
    // THE ACTIVE PLAYER'S START runs first in the engine's turn, and in the
    // game after the city-states' starts the record's pair holds (record
    // t+1 is read in its turn): theirs counts its research as record t
    // holds it (runs/h1_duelw1121: Rome's Code of Laws at its start of t4,
    // every minor's done at its own start of t4); every other major's start
    // came before theirs, its research as record t+1 holds it
    const active = state.seats[seatOfP(ctx, activePlayer(a))];
    holdMinorCatchUp(new Map(state.seats.map((s) => {
      const r = seatOf(s === active ? recordA.state : read.state, s.seat)?.research ?? s.research;
      return [s.seat, { techs: [...r.techs], civics: [...r.civics] }] as const;
    })));
    // ...and the game era it opens comes after every other player's start and
    // actions of the pair: their research prices read the era before
    // (runs/h1_duelw1121: Horseback Riding at 72 for the minors through their
    // turn 30, Rome's Wheel at 32 in its start of t31)
    const eraWas = state.gameEra ?? 0;
    holdResearchEra(new Map([...state.seats.filter((s) => s !== active).map((s) => s.seat), ...state.cityStates.map((c) => c.seat), FREE_SEAT]
      .map((seat) => [seat, eraWas] as const)));
    stream.actions(null);
    try {
      endTurn(state);
    } catch (e) {
      report.stopped = `endTurn threw at turn ${a.turn}: ${(e as Error).message}`;
      break;
    }
    holdMinorCatchUp(null);
    stream.actions(a.turn);
    for (const [u, hp] of spent) if (u.hp > hp) u.hp = hp;
    // a rested unit struck in a later player's turn heals at its own next
    // turn's start, after the blow (runs/h1_duelw1118 t8: a city-state's
    // Warrior 23 damaged, fortified, took the barbarians' two attacks at 77
    // health and read +10 after them; runs/h1_duelw1124 t9: Rome's Warrior,
    // whole when a barbarian Warrior struck it for 24, read 86): its rest
    // heal is taken at the health the blows left
    for (const [u, hp] of struckHp) u.hp = Math.min(u.hp, hp);
    state.units.push(...barbs);
    verifyPolicies(ctx, staged);
    settleAi.postTurn(b);
    {
      // THE MAJORS' DIPLOMATIC SENDING: the record's human majors' missions
      // fed, the AI majors' their port's own
      const recMissions = missions.get(a.turn) ?? [];
      const strat = aiInputs(a.turn);
      applyMissions(ctx, recMissions, diplomacy, strat, (seat) => !sender.isSender(seat));
      applyTransitions(ctx, diplomacy, sender, strat);
      const picks = sender.turn(state, a.turn, strat, (o, x) => diplomacy.stateOf(o, x), (x) => diplomacy.agendasOf(x),
        (x) => strategies.knownCities(x), (o, x) => diplomacy.opinionOf(o, x));
      sender.compare(a.turn, picks, recMissions);
      applySenderPicks(ctx, picks, recMissions, sender, diplomacy, strat);
      sender.close(state, (o, x) => diplomacy.opinionOf(o, x));
      greatPeopleAi.turn(state, a, b, strat, sender.memory);
      ctx.religionPort.inputs = strat;
      portPantheons(ctx, b);
    }
    operationsAi.postTurn(b);
    majorAi.postTurn(state, (seat) => {
      const d = staged.find((x) => seatOfP(ctx, x.player) === seat);
      if (!d) return null;
      const { gid, ids } = policyIds(ctx, d);
      return { government: gid, policies: ids };
    });
    religionAi.postTurn(state);
    matchNewUnits(ctx, b);
    // a unit the engine's own city-state, Free City or barbarian scripts made
    // that the record's players did not: their decision, undone
    const mapped = new Set(ctx.units.values());
    for (const u of [...state.units]) {
      if (standing.has(u) || mapped.has(u) || u.seat < state.seats.length) continue;
      disbandUnit(state, u.id);
      const cs = state.cityStates.find((c) => c.seat === u.seat);
      const op = cs?.ops ? opsOf(cs.ops).find((o) => opUnits(o).includes(u.id))?.def : undefined;
      count(ctx, isBarbSeat(u.seat) ? 'barb:unit' : 'minorAi:unit', 'fallback', ctx.playerOfSeat.get(u.seat),
        `${u.type}${op ? ` for ${op}` : ''}`);
    }
    undoMinorPlots(ctx, improvements, charges);
    minorBuilds(ctx, b, report.minorBuilds);
    scoreMinorResearch(ctx, b, report.minorResearch);
    // REPLAY_TRACE=minorProd: each city-state's item, purse, units and research after the engine's turn
    if (TRACE.has('minorProd')) {
      for (const cs of state.cityStates) {
        const us = state.units.filter((u) => u.seat === cs.seat).map((u) => `${u.type}@${u.tileIndex}`);
        console.error(`t${traceTurn} minor ${cs.id} ${cs.name} item ${cs.prodItem ?? '-'} ${r3(cs.prodProgress ?? 0)} over ${r3(cs.prodOverflow ?? 0)} gold ${r3(cs.treasury)} routes ${(cs.tradeRoutes ?? []).length} [${us.join(' ')}] tech ${cs.research.techs.join(',')} cur ${cs.research.tech} ${r3(cs.research.techProgress)} ovf ${r3(cs.research.techOverflow ?? 0)} civic ${cs.research.civics.join(',')} ${r3(cs.research.civicProgress)} met [${cs.met}] envoys ${JSON.stringify(cs.envoys)}`);
      }
    }
    // the record's units the engine's own turn destroyed: a kill the log
    // names on one of them was the engine's to pay, and it paid it
    const live = new Set(state.units);
    ctx.engineKilled = new Set([...ctx.units].filter(([, u]) => !live.has(u)).map(([k]) => k));
    fortifyOrders(ctx, a, b);
    // ...the others' after their turn start, the engine's turn
    {
      // their turn starts' civics stand before their AI turns
      const starts = turnStartCompletions(ctx, b, a.turn);
      ctx.governorAi.aiTurn(state, a.turn, (p) => p !== activePlayer(a), (s, id) => recordCityName(ctx, s, id),
        (seat) => new Set([...(seatOf(state, seat)?.research.civics ?? []), ...(starts.get(seat)?.civics ?? [])]
          .filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))));
    }
    applyPhase(ctx, ds, 'after', b, b);
    // an AI major's governor turn where record t+1 holds its roster as it
    // was: the record's
    for (const p of ctx.governorAi.actedAlone(new Set(ds.filter((d) => d.kind === 'governors').map((d) => d.player)))) {
      count(ctx, 'governors:alone', 'fallback', p, 'the port acted, the record did not');
      ctx.governorAi.rosterCheck(a.turn, p, 1, 0, 'the port acted, the record did not');
    }
    // an army due home the record shows no return of comes home at its
    // minor's start all the same
    releaseLevies(state);
    for (const u of struckHp.keys()) {
      if (!state.units.includes(u) || u.hp >= UNIT_HP) continue;
      const rest = { ...u };
      restUnit(state, rest, true);
      u.hp = rest.hp;
    }
    // the other players' units stand where their turn t's moves left them:
    // their looks reveal and meet in turn t (runs/h1_duelv1127: China meets
    // Rome at t61, DiplomacySummary.csv, the record of t62 the first to show it)
    inTurn(state, a.turn, () => syncUnits(ctx, b));
    campsTaken(ctx, b, a.turn);
    // the units the minors' cities trained in the engine's turn (a purchase
    // the record shows is not one)
    const bought = new Set(ds.flatMap((d) => (d.kind === 'buyUnit' ? [d.unit] : [])));
    minorAi(ctx, b, a.turn, new Set([...ctx.units].filter(([k, u]) => minorAiSeat(u.seat) && !standing.has(u) && !bought.has(k)).map(([, u]) => u)));
    barbarianTurn(ctx, b, a.turn);
    // the units the barbarians raised stand where the record holds them
    inTurn(state, a.turn, () => syncUnits(ctx, b));
    settleEnvoys(ctx, b);
    // the barbarians' units sat the engine's turn out, so their rest — the
    // fortification a unit holding the Fortify order digs in (`fortifyOrders`)
    // — is the engine's own step, run here where their turn closes the log's.
    // Being attacked spends nothing (runs/h1_duelw1117 t4: the camp's
    // Spearman, struck at t4, still two turns dug in at t5, took 21 from a
    // city-state's Warrior at -4)
    for (const [u, stood] of barbRest) {
      if (state.units.includes(u)) restUnit(state, u, stood);
    }
    const campsHeld = syncDraws(ctx, b, tribesBefore);
    syncPillage(ctx);
    syncDedications(ctx);
    // the decisions landed after the engine's turn are the other players'
    // actions within their own turns: the boosts those earn land there
    // (`detectBoosts` at the seat block's end)
    for (const s of state.seats) if (s.cities.length) detectBoosts(state, s.seat);
    // ...and the once moments they hold (a natural wonder a unit's steps
    // revealed: runs/h1_duelw1117 Rome t12), which the engine's turn records
    // after every seat's actions
    recordMoments(state);
    killBoosts(ctx, read);
    holdResearchEra(null);
    // the research AI's analysis of the turn, past its Science, against the
    // game's AI log of the turn: a city-state's own (its turn's), a major's
    // made here
    for (const s of state.seats) {
      const pid = ctx.playerOfSeat.get(s.seat);
      if (pid !== undefined) scoreAgainstLog(ctx, 'major', a.turn, pid, researchAnalysis(state, s.seat, s.sciRate ?? 0));
    }
    for (const { s, party } of minorHolders(state)) {
      const pid = ctx.playerOfSeat.get(s.seat);
      if (pid !== undefined && s.research.aiEntries) scoreAgainstLog(ctx, party, a.turn, pid, s.research.aiEntries);
    }
    // the city build AI's tables of each city-state's turn, after its step,
    // against the game's (AI_CityBuild.csv, the verbose recordings)
    if (ctx.cityBuildLog.size) {
      for (const cs of state.cityStates) {
        const pid = ctx.playerOfSeat.get(cs.seat);
        const name = pid === undefined ? undefined : a.cities.find((c) => c.owner === pid)?.name;
        const logged = name === undefined ? undefined : ctx.cityBuildLog.get(`${a.turn}:${pid}:${name}`);
        if (logged) tallyBuildings(ctx.cityBuild, a.turn, pid!, logged, buildingTable(minorBuildFacts(state, cs, minorKnownUnits(cs))), ctx.cityBuildPer);
      }
    }
    // the city-states' research AI: each choice its turn made, against the
    // research record t+1 shows
    const recTech = (rec: TurnRecord, pid: number) => {
      const row = num(rec.players.find((p) => p.id === pid)?.researching);
      return row >= 0 ? engineId('tech', cat.techs[row], 'TECH_', TECHS) : null;
    };
    for (const { s, party } of minorHolders(state)) {
      const pid = ctx.playerOfSeat.get(s.seat);
      if (pid === undefined) continue;
      const ours = s.research.tech;
      const rec = recTech(b, pid);
      if (ours === ctx.researchBefore.get(s.seat) && rec === recTech(a, pid)) continue;
      tallyResearchAi(ctx, party, a.turn, pid, ours, rec);
      if (ours && !s.research.goal) ctx.researchAi[party].random += 1;
    }
    // the civics AI's analysis of the turn against the log of the turn: a
    // city-state's own (its turn's), a major's made here and kept for its
    // next completion; then the city-states' choices against the civic
    // record t+1 shows
    for (const s of state.seats) {
      const pid = ctx.playerOfSeat.get(s.seat);
      const ents = civicAnalysis(state, s.seat, s.culRate ?? 0);
      ctx.majorCivicEntries.set(s.seat, ents);
      if (pid !== undefined) civicScoreAgainstLog(ctx, 'major', a.turn, pid, ents);
    }
    for (const { s, party } of minorHolders(state)) {
      const pid = ctx.playerOfSeat.get(s.seat);
      if (pid !== undefined && s.research.civicAiEntries) civicScoreAgainstLog(ctx, party, a.turn, pid, s.research.civicAiEntries);
    }
    const recCivic = (rec: TurnRecord, pid: number) => {
      const row = num(rec.players.find((p) => p.id === pid)?.civic);
      return row >= 0 ? engineId('civic', cat.civics[row], 'CIVIC_', CIVICS) : null;
    };
    for (const { s, party } of minorHolders(state)) {
      const pid = ctx.playerOfSeat.get(s.seat);
      if (pid === undefined) continue;
      const ours = s.research.civic;
      const rec = recCivic(b, pid);
      if (ours === ctx.civicBefore.get(s.seat) && rec === recCivic(a, pid)) continue;
      tallyCivicAi(ctx, party, a.turn, pid, ours, rec);
    }
    const t = compareState(state, read);
    compareUnits(ctx, b, t);
    note(t, 'barb.camps', campsHeld, 'camps', ctx.next.state.barbSeat.camps.length, state.barbSeat.camps.length);
    const base = stateChecks(b, cat, read);
    for (const r of [...baseStep, ...base]) {
      if (r.ok || r.skip) continue;
      if (!baseFails.has(r.subject)) baseFails.set(r.subject, new Set());
      baseFails.get(r.subject)!.add(r.check);
    }
    let mine: CheckResult[] = [];
    try {
      mine = stateChecks(b, cat, engineAsImported(state, read));
    } catch (e) {
      note(t, 'read.threw', false, (e as Error).message, null, null);
    }
    readerTallies(mine, base, t);
    opts.onPair?.(state, b, ds);
    const fallbacks: Record<string, number> = {};
    for (const xs of ctx.fellBack.values()) for (const x of xs) fallbacks[x] = (fallbacks[x] ?? 0) + 1;
    report.perTurn.push({ turn: b.turn, subsystems: t, fallbacks, imposed: Object.fromEntries(ctx.imposed), reseeded: seed !== undefined });
    for (const [sub, x] of Object.entries(t)) {
      const s = report.subsystems[sub] ?? (report.subsystems[sub] = { held: 0, matched: 0, compared: 0, clean: 0 });
      s.compared += 1;
      const bad = sub.startsWith('read.') ? (x.drift ?? 0) > 0 : x.fail > 0;
      if (!bad) {
        s.matched += 1;
        continue;
      }
      if (brokeAt.has(sub)) continue;
      brokeAt.set(sub, report.perTurn.length - 1);
      const w = x.worst!;
      const step = STEP_OF[sub];
      const stepRow = step ? baseStep.find((r) => r.check === step && r.subject === w.subject) : undefined;
      const pid = Number(/^(?:city|seat|unit) (\d+)/.exec(w.subject)?.[1] ?? NaN);
      s.first = { turn: b.turn, subject: w.subject, game: w.game, ours: w.ours, gap: r3(w.gap),
        ...(stepRow ? { perTurn: stepRow.skip ? `skip: ${stepRow.skip}` : stepRow.ok ? 'pass' : 'fail' } : {}),
        ...(baseFails.get(w.subject)?.size ? { perTurnFails: [...baseFails.get(w.subject)!].sort() } : {}),
        ...(ctx.fellBack.get(pid)?.length ? { fallbacks: ctx.fellBack.get(pid) } : {}) };
    }
    prev = a;
  }
  for (const [sub, s] of Object.entries(report.subsystems)) {
    s.held = brokeAt.get(sub) ?? report.perTurn.length;
    const at = report.perTurn.findIndex((p) => Object.keys(p.imposed).some((k) => imposesOn(k, sub)));
    if (at >= 0) s.imposedFrom = report.perTurn[at].turn;
    s.clean = at >= 0 ? Math.min(s.held, at) : s.held;
  }
  report.cleanEvery = Math.min(report.perTurn.length, ...Object.values(report.subsystems).map((s) => s.clean));
  report.turns = report.perTurn.length ? [report.perTurn[0].turn, report.perTurn[report.perTurn.length - 1].turn] : [];
  report.decisions = Object.fromEntries([...ctx.tally].sort(([x], [y]) => x.localeCompare(y)));
  report.refusals = Object.fromEntries([...ctx.reasons].sort(([x], [y]) => x.localeCompare(y)).map(([k, m]) => [k, Object.fromEntries(m)]));
  if (source instanceof RecordedActions) {
    report.unread = Object.fromEntries([...source.unread].sort((x, y) => y[1] - x[1]));
    report.settled = Object.fromEntries(source.settled);
  }
  report.subsystems = Object.fromEntries(Object.entries(report.subsystems).sort(([x], [y]) => x.localeCompare(y)));
  holdRng(null);
  traceMinorAi(null);
  holdMinorClears(null);
  traceMinorOps(null);
  holdMinorCatchUp(null);
  holdResearchEra(null);
  holdMinorOrders(false);
  holdCityStrikes(false);
  holdLevies(false);
  holdBarbarians(null);
  holdCongressBallots(null);
  if (strategies.active) {
    report.strategies = strategies.tally;
    report.contacts = strategies.contacts(state);
  }
  if (majorAi.active) report.majorAi = majorAi.tally;
  if (religionAi.active) report.religionAi = religionAi.tally;
  if (ctx.governorAi.active) report.governorAi = ctx.governorAi.tally;
  if (congressAi.active) report.congressAi = congressAi.tally;
  report.greatPeopleAi = greatPeopleAi.tally;
  report.cityBuildAi = ctx.cityBuildAi.tally;
  report.religionActions = religionAi.actions;
  if (diplomacy.active) report.diplomacy = diplomacy.tally;
  report.sender = sender.tally;
  if (settleAi.active) report.settleAi = settleAi.tally;
  if (operationsAi.active) report.operationsAi = operationsAi.tally;
  if (ctx.cityBuildLog.size) {
    report.cityBuild = ctx.cityBuild;
    report.cityBuildPer = Object.fromEntries(ctx.cityBuildPer);
  }
  return report;
}

/** the replay report as Markdown: per subsystem the turns held, the first
 *  divergence and its per-turn step, then the decisions by kind */
export function replayMarkdown(r: ReplayReport): string {
  const out = [`# Action replay: ${r.dump}`, '', `Source: ${r.source}. Pairs replayed: ${r.perTurn.length}, turns ${r.turns.join('-')}.`
    + (r.stopped ? ` Stopped: ${r.stopped}.` : ''), '',
  `Pairs from the first on which every subsystem held with nothing imposed on it: ${r.cleanEvery}.`, '',
  '| subsystem | held from start | held, nothing imposed | first imposed | turns matched / compared | first divergence | subject | game | engine | per-turn step | per-turn fails on the subject |',
  '|---|---:|---:|---:|---:|---:|---|---|---|---|---|'];
  const cut = (v: unknown) => JSON.stringify(v)?.slice(0, 80) ?? '';
  for (const [sub, s] of Object.entries(r.subsystems)) {
    const f = s.first;
    out.push(`| ${sub} | ${s.held} | ${s.clean} | ${s.imposedFrom ?? '-'} | ${s.matched} / ${s.compared} | ${f ? f.turn : '-'} | ${f ? f.subject : ''} | `
      + `${f ? cut(f.game) : ''} | ${f ? cut(f.ours) : ''} | ${f?.perTurn ?? ''} | ${(f?.perTurnFails ?? []).join(', ')} |`);
  }
  out.push('', 'Reader subsystems (`read.*`) count a turn as diverged only where the per-turn harness passes the same check on the',
    'imported record; the state subsystems count every mismatch. "Held, nothing imposed" stops at the first pair on which the',
    'replay imposed a recorded outcome touching the subsystem (a fallback; `IMPOSES_ON` names what each kind touches, every',
    'subsystem where it names none).', '', '## Imposed outcomes per pair', '',
    '| pair | imposed (kind × count) |', '|---:|---|');
  for (const p of r.perTurn) {
    const ks = Object.entries(p.imposed);
    if (ks.length) out.push(`| ${p.turn} | ${ks.map(([k, n]) => `${k} ×${n}`).join(', ')} |`);
  }
  out.push('', '## The research AI', '', 'A city-state\'s choices its turn made (or the record changed), a major\'s at each research decision of the record;',
    'the record\'s and the game\'s AI log\'s (its RESEARCHING row of the turn) research against the engine\'s.', '',
    '| party | choices | as the record | logged | as the log | random picks | first differing (turn player ours / record / log) |',
    '|---|---:|---:|---:|---:|---:|---|');
  for (const [k, x] of Object.entries(r.researchAi ?? {})) {
    const f = x.first;
    out.push(`| ${k} | ${x.choices} | ${x.record} | ${x.logged} | ${x.log} | ${x.random} | ${f ? `t${f.turn} p${f.player} ${f.ours} / ${f.record} / ${f.log}` : '-'} |`);
  }
  out.push('', 'The analysis as each pair opens against the log\'s rows of the turn (unowned rows the log scored):', '',
    '| party | rows | turns as the log | score within 0.05 | first differing (turn player tech log [score, turns] / ours) |', '|---|---:|---:|---:|---|');
  for (const [k, x] of Object.entries(r.researchScores ?? {})) {
    const f = x.first;
    out.push(`| ${k} | ${x.rows} | ${x.turns} | ${x.score} | ${f ? `t${f.turn} p${f.player} ${f.tech} ${JSON.stringify(f.log)} / ${JSON.stringify(f.ours)}` : '-'} |`);
  }
  if (Object.keys(r.barbTactics).length) {
    out.push('', '## The barbarians\' moves', '', 'Per move of the game\'s tactical log (`AI_Tactical.csv`, an operation\'s units "Operation"):',
      'the unit-turns the engine\'s AI moved from the pair\'s first record, those it moved by the same move, the end plots',
      'record t+1 holds and those it matched (`barb:move`), and the first turn each differed.', '',
      '| game move | unit-turns | same move | first other | end plots | matched | first off |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const [k, t] of Object.entries(r.barbTactics).sort(([, x], [, y]) => y.units - x.units)) {
      out.push(`| ${k} | ${t.units} | ${t.move} | ${t.firstMove ?? '-'} | ${t.plotOf} | ${t.plot} | ${t.firstPlot ?? '-'} |`);
    }
  }
  if (r.cityBuild) {
    const c = r.cityBuild;
    out.push('', '## The city build AI\'s tables', '', 'Each city-state\'s city-centre BUILDINGS table of its turn against the game\'s PLOT ANALYSIS LOG',
      '(AI_CityBuild.csv): the items the log values, those both value, within 0.005, the log only, ours only.', '',
      '| building | log | both | exact | log only | ours only | first miss (turn player log / ours) |', '|---|---:|---:|---:|---:|---:|---|');
    const row = (k: string, x: CityBuildTally) => `| ${k} | ${x.log} | ${x.both} | ${x.exact} | ${x.onlyLog} | ${x.onlyOurs} | ${x.first ? `t${x.first.turn} p${x.first.player} ${x.first.log} / ${x.first.ours}` : '-'} |`;
    out.push(row('all', c));
    for (const [k, x] of Object.entries(r.cityBuildPer ?? {}).sort(([, a], [, b]) => b.log - a.log).slice(0, 40)) out.push(row(k, x));
  }
  {
    const mb = r.minorBuilds;
    out.push('', '## The city-states\' builds', '', 'Each city-state\'s item in hand after its turn (its AI\'s pick) against record t+1\'s queue head, by the',
      'record\'s item; nothing imposed.', '', '| record item | minor-turns | same |', '|---|---:|---:|');
    for (const [k, x] of Object.entries(mb.byKind).sort()) out.push(`| ${k} | ${x.turns} | ${x.same} |`);
    out.push(`| all | ${mb.turns} | ${mb.same} |`, '', `First differing: ${mb.first ? `t${mb.first.turn} p${mb.first.player} ours ${mb.first.ours || 'none'} / record ${mb.first.record || 'none'}` : '-'}.`);
    out.push('', 'The first differing (ours / record):', '', ...mb.samples.map((x) => `- ${x}`));
  }
  if (Object.keys(r.minorTactics ?? {}).length) {
    const d = r.minorDraws;
    out.push('', '## The city-states\' moves', '', 'Per move of the game\'s tactical log (a unit with no row of the turn "(no row)"): the',
      'unit-turns the engine\'s AI moved from the pair\'s first record, those it moved by the same move, the end plots record',
      't+1 holds and those it matched (`minorAi:move`), and the first turn each differed.', '',
      '| game move | unit-turns | same move | first other | end plots | matched | first off |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const [k, t] of Object.entries(r.minorTactics).sort(([, x], [, y]) => y.units - x.units)) {
      out.push(`| ${k} | ${t.units} | ${t.move} | ${t.firstMove ?? '-'} | ${t.plotOf} | ${t.plot} | ${t.firstPlot ?? '-'} |`);
    }
    out.push('', `"Random Direction": ${d.paired} of ${d.turns} turns pair the log's draws with its rows; ${d.draws} draws taken on the log's own, `
      + `${d.sameRange} over the log's range (first other t${d.firstOff ?? '-'}).`);
  }
  out.push('', '## The civics AI', '', 'A city-state\'s choices its turn made (or the record changed), a major\'s at each civic decision of the record, against the record\'s civic:', '',
    '| party | choices | as the record | first differing (turn player ours / record) |', '|---|---:|---:|---|');
  for (const [k, x] of Object.entries(r.civicAi ?? {})) {
    const f = x.first;
    out.push(`| ${k} | ${x.choices} | ${x.record} | ${f ? `t${f.turn} p${f.player} ${f.ours} / ${f.record}` : '-'} |`);
  }
  out.push('', 'The analysis as each pair opens against the log\'s Civic rows of the turn (AI_GovtPolicies.csv):', '',
    '| party | rows | turns as the log | score within 0.05 | first differing (turn player civic log [score, turns] / ours) |', '|---|---:|---:|---:|---|');
  for (const [k, x] of Object.entries(r.civicScores ?? {})) {
    const f = x.first;
    out.push(`| ${k} | ${x.rows} | ${x.turns} | ${x.score} | ${f ? `t${f.turn} p${f.player} ${f.tech} ${JSON.stringify(f.log)} / ${JSON.stringify(f.ours)}` : '-'} |`);
  }
  out.push('', '## Decisions', '',
    '| kind | applied | imposed (fell back to the record) | refused |', '|---|---:|---:|---:|');
  for (const [k, d] of Object.entries(r.decisions)) out.push(`| ${k} | ${d.applied} | ${d.fallback} | ${d.refused} |`);
  if (Object.keys(r.settled).length) {
    out.push('', '## What the event log settles', '', 'Per decision kind the log names outright: the decisions it names, the ones the',
      'inference from the snapshots names, and how many of the log\'s the inference named alike.', '',
      '| kind | log | inferred | alike |', '|---|---:|---:|---:|');
    for (const [k, t] of Object.entries(r.settled)) out.push(`| ${k} | ${t.log} | ${t.inferred} | ${t.agree} |`);
    out.push('', '## Recorded events no reader takes', '');
    for (const [k, n] of Object.entries(r.unread)) out.push(`- ${k}: ${n}`);
  }
  if (r.strategies) out.push(...strategyMarkdown(r.strategies, r.contacts));
  if (r.majorAi) out.push(...majorAiMarkdown(r.majorAi));
  if (r.religionAi) out.push(...religionAiMarkdown(r.religionAi, r.religionActions));
  if (r.governorAi) out.push(...governorAiMarkdown(r.governorAi));
  if (r.congressAi) out.push(...congressAiMarkdown(r.congressAi));
  if (r.greatPeopleAi) out.push(...greatPeopleAiMarkdown(r.greatPeopleAi));
  if (r.cityBuildAi) out.push(...cityBuildAiMarkdown(r.cityBuildAi));
  if (r.diplomacy) out.push(...diplomacyMarkdown(r.diplomacy));
  if (r.sender) out.push(...senderMarkdown(r.sender));
  if (r.settleAi) out.push(...settleMarkdown(r.settleAi));
  if (r.operationsAi) out.push(...operationsMarkdown(r.operationsAi));
  return out.join('\n') + '\n';
}
