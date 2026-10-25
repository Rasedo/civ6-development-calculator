/**
 * THE ACTION REPLAY: the TS engine run FREE from the first record, fed only
 * the recorded players' decisions, and compared each turn with the record.
 *
 * The first record is imported (`importTurn`) and from then on the state is
 * the engine's own. For each record pair t -> t+1 the replay takes the
 * decisions an `ActionSource` reads off the records (`replayActions.ts`) and
 * runs the turn in the game's player order: the active player's actions,
 * then each other major's start and actions, the city-states' and Free
 * Cities' turns, the barbarians', the turn's close and change, the active
 * player's next start (the engine's pieces of `endTurn`, the city-states',
 * Free Cities' and barbarians' recorded decisions after them); then it
 * compares the engine's state with record t+1:
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
import type { ArmyRecord, BarbTribe, City, CityState, DistrictId, GameState, QueueItem, Seat, SeatActionRecord, Tile, Unit } from '../core/types';
import { hexDistance, neighbors } from '../../world/hex';
import { isWater } from '../../world/query';
import { NO_SEAT } from '../core/types';
import { advanceTurn, minorTurns, turnChange, turnClose, foundCity, foundCityAt, buyTile, settlerCost, projectCost, unitStepCost, unitsAcquired, buildingPurchaseCost,
  buyWorshipBuilding, purchaseBuildingWithFaith, purchaseCivilianWithFaith, purchaseReligiousUnit, purchaseUnitWithFaith,
  purchaseSettler, unitGoldPrice, availableProjects, goldAffordable, buildingFaithPrice, wonderChargeBoost, adoptBeliefs,
  serialize, deserialize, itemCost } from '../core/game';
import { completeQueueItem } from '../core/production';
import { applySeatUnitOrders, buySeatBuilding, declareWar, districtSiteCost, districtSiteLegal, foundPantheon, grantPantheonUnit, levyGoldCost, levyUnits, paveGround,
  placeSeatDistrict, putOffer, answerOffer, sueForPeace, transferCity, cityStrikeAt, holdCityStrikes, envoysAtStart, applySeatEnvoys,
  seatPhase, worldCongress } from '../core/phase';
import { addEnvoys, cityStateAt, declareWarOnCityState, minorCity, minorReplaceCitizens, placeCityStateAt, sueForPeaceWithCityState } from '../core/cityStates';
import { CP_ACCEPTED, CP_IN_PROGRESS } from '../core/aiContracts';
import { availableBuildings, canPlaceWonder, validImprovements, wallsMax } from '../core/rules';
import { builderHarvest, builderRemoveFeature, spawnUnit, trainableUnits, builderCost, traderCost, disbandUnit, drawAndPayGoody, grantedMoves, unitFullMoves, restUnit, upgradeUnit, unitsAt, unitDomain, fortifyBonus, crossesRiver, waterWalks, cityAtIndex, raiseBestTrained, recordAttacker, FORTIFY_MAX_TURNS } from '../core/units';
import { availableCivicsIn, availableTechsIn, computeUnlocks, goldPrice, governmentSlots, policyWireOf, seatGovernment, darkAgeEra,
  unlockedPolicyIds } from '../core/effects';
import { selectResearch, chopGrant, harvestGrant, applyLumpYield, holdResearchEra, researchCost } from '../core/economy';
import { computeCityStats } from '../core/city';
import { getModifiers } from '../core/effects';
import type { ResearchEntry } from '../core/aiResearch';
import type { CivicEntry } from '../core/aiCivics';
import { detectBoosts, grantBoost, markBoost } from '../core/boosts';
import { recordMoments } from '../core/moments';
import { applyGovernorActions, governorsOf } from '../core/governors';
import { GOVERNOR_PROMOTIONS, GOV_APPOINT, GOV_ASSIGN_CITY, GOV_ASSIGN_MINOR, GOV_PROMOTE, promotionBit } from '../data/governors';
import { BOOSTS } from '../data/boosts';
import { chargeUnitResource, upgradeGoldCost } from '../core/stockpile';
import { applyTrainingGrants, cityStrikeStrength, clearCampFor, flankSupportLive, hostilePillage, meleeAttack, rangedAttack, seizeCivilian, terrainDefense } from '../core/combat';
import { freeCitiesMilitary, traceFreeOps } from '../core/freeOps';
import { barbarianTactics, dangerPlane, refreshBarbarians, tacticsDrawing, knowledgeLook, traceKnowledge, traceTactics } from '../core/tactical';
import { barbSlots, barbSlotsDying, barbarianRules, barbarianTechs, barbScoutLook, foundTribe, plotsSeenNow, tribeDies, tribeKindAt } from '../core/barbarians';
import { DIFFICULTIES } from '../data/barbarians';
import { MINOR_UPGRADE_GOLD, LEVY_TURNS } from '../data/cityStates';
import { addCsTradeRoute, addIntlTradeRoute, addTradeRoute, minorRouteTo, routeDestCenter, routeOriginCenter } from '../core/trade';
import { questCampCleared, questRouteStarted, questUnitAdded } from '../core/quests';
import { commitDedications, goodyMoment, pantheonMoment, religionMoment, unitKillEvent } from '../core/eras';
import { initFog, revealAround, unitSeesThrough, unitSight } from '../core/fog';
import { holdFavor, seatFavor } from '../core/seatTurn';
import { displaceAirFrom } from '../core/air';
import { BARB_SEAT, cityStateOfSeat, civsAtWar, delegationWith, FREE_SEAT, isBarbSeat, isCityStateSeat, isCiv, MISSION_DELEGATION, MISSION_EMBASSY, prophetsOf, seatOf, setDelegationWith, setPeaceTurnWith, setTileOwner, setWar, tileSeat, unitsOf } from '../core/seats';
import { activateGreatPerson, gpActivateOk, gpClassOfUnit } from '../core/gpAbility';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { PROJECTS } from '../data/projects';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES } from '../data/policies';
import { BELIEF_CATALOGS, BELIEF_CLASS_FOLLOWER, BELIEF_SLOTS, PANTHEONS, PANTHEON_IDS, RELIGION_TYPES, gainPopulationPressure } from '../data/religion';
import { missionOf, missionPayable } from '../core/deals';
import { DEAL_MISSION } from '../data/seats';
import { UNITS, UNIT_HP } from '../data/units';
import { CAMP_DISPERSAL_GOLD, MP_SCALE, scaleByGameSpeed } from '../data/constants';
import { PROMOTE_HEAL, aiPromotionPick, attacksPerTurn, promoCount, takePromotion, unitPromoRows } from '../core/promotions';
import { fireFeature } from '../data/disasters';
import { nameRivers } from '../core/disasters';
import { holdMinorCatchUp, holdMinorOrders, holdMinorStart, minorCombatDesire, minorResearch, minorSetItem, minorBuildFacts, minorKnowledge, minorKnownUnits, minorItemInHand, minorItemKey, minorUnitPrice, minorUpgradeType, minorUpgradeUnit, minorUpgradeVisible, traceMinorLays, traceMinorPolicyScores, traceMinorPurchases } from '../core/minorBuild';
import { DEDICATED_IMPROVEMENTS, IMPROVEMENT_IDS, unitActionIndex } from '../core/unitActions';
import { loadCatalog, type Catalog, type DumpCity, type TurnRecord } from './record';
import { num, bool } from './record';
import { holdMinorClears, minorAiTurn, minorGreatPersonClass, minorMilitaryTurn, minorSecondHook, traceMinorAi } from '../core/minorCityAi';
import { UPGRADE_MOVE, cityStateMilitary, holdSecondHook, traceMinorOps, unupgradedDeleted, upgradeMayGo } from '../core/minorOps';
import { barbSpawnChange, traceBarbOps } from '../core/barbarianOps';
import { opsOf } from '../core/operations/manager';
import { opUnits } from '../core/operations/operation';
import { newCityAi } from '../core/aiCityTrees';
import { newEconomicMemory, purchaseSpend, savingsTurn, upgradePurchase, type EconomicMemory } from '../core/aiEconomic';
import { FX } from '../core/aiValue';
import { advanceHistory, aliasOrPrefixed, engineRowOf, importTurn, minorHead, newHistory, type History, type Imported } from './import';
import { AI_UNITS } from '../data/aiBuildTables';
import { loadCityBuildCentre, loadCityBuildTables, newCityBuildTally, tallyBuildings, type CityBuildTally } from './cityBuildLog';
import { buildingTable } from '../core/aiCityBuild';
import { replayEvents } from './eventReplay';
import { loadCombatLog, loadRandLog, randLogPath, type RandLog } from './randLog';
import { streamHold, type StreamHold } from './streamHold';
import { holdRng, rngHold } from '../core/rand';
import { seedMoments, stateChecks, transitionChecks, type CheckResult } from './checks';
import { engineId, gameHash, gameTypeOf } from '../data/aliases';
import { OperationsProbe, operationsMarkdown, type OperationsTally } from './operationsScore';
import { GREAT_PEOPLE, gpChargesOf } from '../data/greatPeople';
import { InferredActions, RecordedActions, activePlayer, type ActionSource, type Decision, type LogTally, type QueueSpec } from './replayActions';
import { newScores, scoreDecision, scoreTable, memoryTable, type DecisionScores } from './aiScore';
import { GameMemory, MemoryLogs, readGameMemory, readMemory, syncContracts, type ArmyLogged } from './aiMemory';
import { gameSpawnChanges, importCityAi, importOps, type GameSpawnChange } from './gameAiImport';
import { NO_SCORE } from '../core/aiPolicyValue';

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
  /** the pair's Fortify orders: unit -> the order's place in the log and the
   *  fortification record t+1 shows, null for a unit record t+1 no longer
   *  holds (`dugIn`) */
  fortified: Map<string, { ord: number; turns: number | null }>;
  /** the units that moved in the pair dug in: unit -> its first step's place
   *  in the log and the fortification it held before it (`dugIn`) */
  undug: Map<string, { ord: number; turns: number }>;
  /** each player's generator where its actions of the pair left it
   *  (`applyPhase`) */
  streams: Map<number, number>;
  /** the pair's decisions an `applyPhase` call has taken */
  applied: Set<Decision>;
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
  /** the units standing as the pair's engine turn opened, and the types of
   *  the units that turn made which a record route of the pair then spent
   *  (by seat): a Trader a city-state trained and sent out in its turn */
  standing?: ReadonlySet<Unit>;
  routeSpent: Map<number, string[]>;
  /** this pair's moved units' steps (`move`'s path), by `owner:id` */
  paths: Map<string, number[]>;
  /** the units (`owner:id`) whose logged steps of this pair `syncUnits`
   *  walked, each step's look taken */
  walked: Set<string>;
  /** this pair's logged steps by `owner:id`, each its place in the log and
   *  the plot entered (`UnitMoved`) */
  steps: Map<string, { ord: number; plot: number }[]>;
  /** the units a barbarian's battle of this pair struck or fought with,
   *  as they stood before its first blow (a barbarian where their turn found
   *  it, `barbStart`): the barbarians' AI takes its turn from there
   *  (`barbarianAi`) */
  barbBlows: Map<Unit, Unit>;
  /** the civilians the barbarians seized in this pair, each as it stood
   *  before (its owner, id and plot): their tactical turn's look sees it
   *  so, the seizure coming after (`barbarianAi`) */
  barbSeized: { u: Unit; was: Unit }[];
  /** the units a city-state's, a Free City's or a barbarian's battle of this
   *  pair struck or fought with, as they stood before its first blow: the
   *  minors' AI takes its turn from there (`minorAi`), its own operations
   *  fighting those battles in its pass; each with its record key, which a
   *  unit the pair killed has left the replay's map by */
  minorBlows: Map<Unit, { snap: Unit; key: string }>;
  /** this pair's city-state purchases the record holds, each answered once
   *  the minors' units' turn has run their city's second hook
   *  (`minorBuysAfter`) */
  minorBuys: { d: Extract<Decision, { kind: 'buyUnit' }>; rec: TurnRecord }[];
  /** this pair's city-state improvements the record holds, each answered
   *  once the minors' units' turn has run their city trees (`minorLaysAfter`) */
  minorImproves: Extract<Decision, { kind: 'improve' }>[];
  /** this pair's city-state clearings the record holds, each taken once the
   *  minors' units' turn has run their city's second hook and trees
   *  (`minorClearsAfter`) */
  minorClears: Extract<Decision, { kind: 'clear' }>[];
  /** the record's new units of those city-states the engine has not made,
   *  matched once the clearings' lumps have landed (`minorClearsAfter`) */
  minorClearUnits: { d: Extract<Decision, { kind: 'unitNew' }>; ds: readonly Decision[] }[];
  /** the city-states' units as each one's own engine turn left them, before
   *  the record's sync (`minorTurns`): their copy's turn opens so (a unit its
   *  city trained where it was made), a Builder record t+1 lost to its own
   *  last charge in it */
  minorUnits: Unit[];
  /** the ground as the city-states' turns found it (`minorTurns`): their
   *  city trees' orders in the copy's turn read it (`holdSecondHook`) */
  minorGround: GroundOf[];
  /** the replay's own tracer of the minors' purchases, restored after the
   *  copy's turn (`minorAi`) */
  buyTrace: Parameters<typeof traceMinorPurchases>[0];
  /** this pair's battles a later player's unit fought on a city-state's or
   *  the Free Cities' unit, the attacker as the battle left it standing: the
   *  defender's record of it (`recordAttacker`) is taken after the
   *  defender's own end look, as the game's turn order takes it */
  lateBlows: { seat: number; attacker: Unit }[];
  /** the record's units this pair's upgrade orders make, keyed as the
   *  record keys them, until the order is applied: each is the upgraded
   *  unit, so no unit the engine's turn made stands for one
   *  (`matchNewUnits`) */
  upgradeInto: Set<string>;
  /** the barbarian units' plots of this pair the record's steps entered,
   *  in their order, for their scouts' looks at the end of the barbarians'
   *  turn (`barbarianTurn`) */
  barbSteps: { u: Unit; plots: number[] }[];
  /** the plots the record's barbarian pillages of the pair wrecked, and what
   *  each held before (improvement, district) */
  barbPillaged: { plot: number; was: [boolean, boolean] }[];
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
   *  it */
  civicAi: Record<ResearchParty, ResearchAiTally>;
  civicBefore: Map<number, string | null>;
  aiCivicLog: Map<string, Map<string, { score: number; turns: number }>>;
  /** the same log's Policies rows: per `${turn}:${player}` each card's score */
  aiPolicyLog: Map<string, Map<string, number>>;
  /** the AI's decisions scored against the game's (`scoreDecision`), and the
   *  turn the pair's AI plays (record t's) */
  scores: DecisionScores;
  turn: number;
  /** the game's logs of the AI's memory (`aiMemory.ts`), and per minor or
   *  barbarian player whether its memory at the end of its turn before
   *  equalled them, which this pair's decisions read */
  memoryLogs: MemoryLogs;
  /** the game's own AI memory beside the recording, where it holds one
   *  (`<stem>.aimem.jsonl`): the memory compared against it instead */
  gameMemory?: GameMemory;
  /** per seat its knowledge base as its last tactical turn logged it */
  armyLogged: Map<number, ArmyLogged>;
  /** each unit's type as the city-states' and Free Cities' turns left the
   *  units (the moment of their end looks), by id */
  minorLookTypes: Map<number, string>;
  memoryClean: Map<number, boolean>;
  civicScores: Record<ResearchParty, ResearchScoreTally>;
  /** the game's city build value tables (`<dump>.logs/AI_CityBuild.csv`'s
   *  PLOT ANALYSIS LOG, the verbose recordings) and the city-states' tables
   *  of the engine's analysis against them, in all and per building */
  cityBuildLog: Map<string, number[]>;
  cityBuild: CityBuildTally;
  cityBuildPer: Map<string, CityBuildTally>;
  /** the operations measured (`OperationsProbe`), and the city-states'
   *  operation lines and candidate lines of the pair, by seat */
  operations: OperationsProbe;
  minorOps: Map<number, { lines: string[]; evals: string[] }>;
}

/** THE RESEARCH AI MEASURED: the choices the engine's research AI made (a
 *  city-state's or the Free Cities', in its turn), how many the record's
 *  research took, how many
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

/** the game's AI log of civics and policies beside the dump (empty maps
 *  without one): per `${turn}:${player}` every Civic row it scored, and every
 *  Policies row (the card's score, those above 0) */
function loadAiCivicLog(dumpPath: string): { civics: Map<string, Map<string, { score: number; turns: number }>>; policies: Map<string, Map<string, number>> } {
  const civics = new Map<string, Map<string, { score: number; turns: number }>>();
  const policies = new Map<string, Map<string, number>>();
  let text = '';
  try {
    text = readFileSync(dumpPath.replace(/\.jsonl$/, '.logs/AI_GovtPolicies.csv'), 'utf8');
  } catch {
    return { civics, policies };
  }
  for (const line of text.split('\n').slice(1)) {
    const p = line.split(',').map((x) => x.trim());
    const k = `${p[0]}:${p[1]}`;
    if (p[2] === 'Policies') {
      (policies.get(k) ?? (policies.set(k, new Map()), policies.get(k)!)).set(p[3], Number(p[4]));
      continue;
    }
    if (p[2] !== 'Civic') continue;
    const eid = engineId('civic', p[3], 'CIVIC_', CIVICS);
    if (!eid) continue;
    const rows = civics.get(k) ?? new Map();
    rows.set(eid, { score: Number(p[4]), turns: Number(p[5]) });
    civics.set(k, rows);
  }
  return { civics, policies };
}

/** a minor's policy scores of its civics AI's turn against the log's
 *  Policies rows of the turn: every row logged, and every score of ours above
 *  0 the log leaves out */
function policyScoreAgainstLog(ctx: Ctx, kind: ResearchParty, turn: number, player: number, scores: ReadonlyMap<string, number>): void {
  const logged = ctx.aiPolicyLog.get(`${turn}:${player}`);
  if (!logged) return;
  for (const [policy, g] of logged) {
    const ours = (scores.get(policy) ?? NO_SCORE) / 256;
    score(ctx, `policyScore.${kind}`, turn, player, `p${player} ${policy}`, Math.abs(ours - g) <= 0.051, r3(ours), g);
    if (TRACE.has('policyScores')) console.error(`t${turn} policy score ${kind} p${player} ${policy} log ${g} ours ${r3(ours)}`);
  }
  for (const [policy, v] of scores) {
    if (v > 0 && !logged.has(policy)) score(ctx, `policyScore.${kind}`, turn, player, `p${player} ${policy}`, false, r3(v / 256), 'unlogged');
    if (TRACE.has('policyScores') && v > 0 && !logged.has(policy)) console.error(`t${turn} policy score ${kind} p${player} ${policy} log unlogged ours ${r3(v / 256)}`);
  }
}

/** the research and civics AIs' parties: the city-states, the Free Cities */
type ResearchParty = 'minor' | 'free';

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
    const same = Math.abs(sc - g.score) <= 0.051;
    if (same) t.score += 1;
    else if (!t.first) t.first = { turn, player, tech: civic, log: [g.score, g.turns], ours: [Math.round(sc * 10) / 10, e.turns] };
    score(ctx, `civicScore.${kind}`, turn, player, `p${player} ${civic}`, same, r3(sc), g.score);
    if (TRACE.has('civicScores')) console.error(`t${turn} civic score ${kind} p${player} ${civic} log ${g.score}@${g.turns} ours ${sc.toFixed(1)}@${e.turns}`);
  }
}

/** a civics AI choice tallied against the record's civic */
function tallyCivicAi(ctx: Ctx, kind: ResearchParty, turn: number, player: number, ours: string | null, record: string | null): void {
  const t = ctx.civicAi[kind];
  t.choices += 1;
  if (ours === record) t.record += 1;
  if (!t.first && ours !== record) t.first = { turn, player, ours, record, log: null };
  score(ctx, `civic.${kind}`, turn, player, `p${player}`, ours === record, ours, record);
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
    const same = Math.abs(sc - g.score) <= 0.051;
    if (same) t.score += 1;
    else if (!t.first) t.first = { turn, player, tech, log: [g.score, g.turns], ours: [Math.round(sc * 10) / 10, e.turns] };
    score(ctx, `researchScore.${kind}`, turn, player, `p${player} ${tech}`, same, r3(sc), g.score);
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
    score(ctx, `research.${kind}.log`, turn, player, `p${player}`, ours === logged.tech, ours, logged.tech);
  }
  if (!t.first && ours !== record) t.first = { turn, player, ours, record, log: logged?.tech ?? null };
  score(ctx, `research.${kind}`, turn, player, `p${player}`, ours === record, ours, record);
  if (TRACE.has('researchAi')) console.error(`t${turn} research ${kind} p${player} ours ${ours} record ${record} log ${logged?.tech ?? '-'} goal ${logged?.goal ?? '-'}`);
}

/** REPLAY_TRACE=<subsystem or decision kind>,... prints every mismatch of
 *  those subsystems and every non-applied decision of those kinds, by turn,
 *  to stderr */
const TRACE = new Set((process.env.REPLAY_TRACE ?? '').split(',').filter(Boolean));
let traceTurn = 0;
let unitsLog: Map<string, Record<string, number[]>> | undefined;
/** a decision of `player` scored, beside whether its memory was clean as
 *  the pair opened (`ctx.memoryClean`) */
function score(ctx: Ctx, kind: string, turn: number, player: number | undefined, subject: string, equal: boolean,
  ours: unknown, game: unknown): void {
  scoreDecision(ctx.scores, kind, turn, subject, equal, ours, game, player === undefined ? undefined : ctx.memoryClean.get(player));
}

/** a record unit key's owner (`owner:id`) */
const ownerOf = (key: string) => Number(key.split(':')[0]);

/** the minors' and the barbarians' decisions a count scores (`scoreDecision`):
 *  applied the game's, a fallback another */
const COUNT_SCORES: Record<string, string> = {
  'minorAi:improve': 'builder.improve', 'minorAi:unitNew': 'unit.trained', 'minorAi:unit': 'unit.trained', 'minorAi:buy': 'unit.bought',
  'minorAi:promote': 'unit.promote', 'barb:unitNew': 'barb.unit', 'barb:unit': 'barb.unit',
};

function count(ctx: Ctx, kind: string, out: Outcome, player?: number, why?: string): Outcome {
  if (out !== 'applied' && (TRACE.has(kind) || TRACE.has(kind.split(':')[0]))) console.error(`t${traceTurn} ${kind} ${out} p${player ?? '-'} ${why ?? ''}`);
  const scored = COUNT_SCORES[kind];
  if (scored && out !== 'refused') score(ctx, scored, ctx.turn, player, `p${player ?? '-'} ${kind}`, out === 'applied', why ?? '', undefined);
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

/** a barbarian's unit as the barbarians' turn found it, before its moves:
 *  on its plot in the pair's first record, else (raised in the pair) where a
 *  blow found it (runs/h1_dueldA1117 t22: the barbarians' Scout on 13:13
 *  steps to 14:12 and falls on its blow; their tactical turn's look saw it
 *  on 13:13, their record of it) */
function barbStart(ctx: Ctx, key: string, at: number): number {
  const r = ctx.prev.units.find((x) => `${x.owner}:${x.id}` === key);
  return r ? r.y * ctx.W + r.x : at;
}

/** the knowledge bases' records at each tactical turn's log moment */
const armyLog = (ctx: Ctx) => (seat: number, turn: number, records: readonly ArmyRecord[]) => {
  ctx.armyLogged.set(seat, { turn, records: records.map((r) => ({ ...r })) });
};

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
  // each counted as its tribe's raise counts it (0x144cc0 a scout, 0x144b20
  // / 0x144bf0 a melee or ranged unit; a siege or support unit uncounted)
  if (scout && (def.recon || !best.scouts.some((id) => state.units.some((x) => x.id === id)))) {
    best.scouts.push(u.id);
    best.scoutCount += 1;
  } else {
    best.units.push(u.id);
    (best.fresh ??= []).push(u.id);
    if (unitDomain(u.type) === 'military' && def.bombard === undefined) best.unitCount += 1;
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

/** the units record t+1 holds that its next turn's start made (its log's
 *  rows of that turn: a city's production at the active player's start),
 *  which no look of turn t sees (runs/h1_duely1121 t5: Rome's Scout made on
 *  35:14 at the start of turn 5, in no knowledge base at turn 4's end) */
function unbornUnits(ctx: Ctx, b: TurnRecord): Set<Unit> {
  const out = new Set<Unit>();
  for (const x of (b as { actions?: unknown[][] }).actions ?? []) {
    if (x[2] !== 'UnitAddedToMap' || x[1] !== b.turn) continue;
    const u = ctx.units.get(`${x[3]}:${x[4]}`);
    if (u) out.add(u);
  }
  return out;
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
    if (unitOf(ctx, key)) {
      count(ctx, 'barb:unitNew', 'applied', ctx.playerOfSeat.get(BARB_SEAT));
      continue;
    }
    const made = spawnRecorded(ctx, b, key);
    if (made) adoptByTribe(state, made);
    count(ctx, 'barb:unitNew', 'fallback', ctx.playerOfSeat.get(BARB_SEAT), `${key} ${made?.type ?? ''}: no tribe raised it`);
  }
  const mapped = new Set(ctx.units.values());
  for (const u of [...state.units]) {
    if (!isBarbSeat(u.seat) || before.has(u) || mapped.has(u)) continue;
    disbandUnit(state, u.id);
    // ...and no knowledge base's record of it (runs/h1_dueld1128 t105: the
    // engine's Man-at-Arms on the camp at 17:4, aging in the barbarians'
    // records alone)
    for (const h of [...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : []), state.barbSeat]) {
      if (h.armyKnown?.some((r) => r.id === u.id && r.owner === u.seat)) h.armyKnown = h.armyKnown.filter((r) => r.id !== u.id || r.owner !== u.seat);
    }
    count(ctx, 'barb:unit', 'fallback', ctx.playerOfSeat.get(BARB_SEAT), `${u.type}: the game raised none`);
  }
  for (const [key, u] of ctx.units) {
    if (isBarbSeat(u.seat) && !before.has(u) && state.units.includes(u)) u.slot = slotOfKey(key);
  }
  barbSlots(state);
  barbarianAi(ctx, b, closing, before, from);
  // each unit looks from each plot the record's steps of the turn entered,
  // after the AI's planning read the plots revealed as the turn opened, the
  // units walking one after another in the record's order — those yet to
  // walk where the pair's first record holds them, so a plot another sees is
  // the one it sees then (runs/h1_duelw1110 t6: tribe 0's Scout reports 8:9
  // from 10:8 before the other Scout at 10:7 walks to 8:7, which sees it); a
  // scout reports the cities it comes to see (`barbScoutLook`), its tree
  // ticking from the next turn
  const walks = ctx.barbSteps.splice(0).filter(({ u }) => state.units.includes(u));
  const ends = new Map(walks.map(({ u }) => [u, u.tileIndex] as const));
  for (const { u } of walks) u.tileIndex = from.get(u) ?? u.tileIndex;
  for (const { u, plots } of walks) {
    for (const p of plots) {
      u.tileIndex = p;
      revealAround(state, u.seat, p, unitSight(u, state), { seeThrough: unitSeesThrough(u) });
      barbScoutLook(state, u);
    }
    u.tileIndex = ends.get(u)!;
  }
  traceBarbOps(null);
  const barbPlayer = ctx.playerOfSeat.get(BARB_SEAT);
  if (barbPlayer !== undefined) ctx.operations.minorTurn(closing, barbPlayer, opLines, []);
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
  // the plots stand as the barbarians' turn opens: their pillages of the
  // turn, which the record's actions landed, not yet made
  for (const { plot, was } of ctx.barbPillaged.splice(0)) {
    copy.map.tiles[plot].pillaged = was[0];
    copy.map.tiles[plot].districtPillaged = was[1];
  }
  // the turn's captures are the record's, landed on the state with its
  // battles: they start their operations at the copy's turn end, and a
  // capture the copy's own moves take adds none (the record's battles are the
  // pair's); the state's list is spent there
  copy.barbCaptures = Object.assign([...(state.barbCaptures ?? [])], { push: () => 0 });
  delete state.barbCaptures;
  // the units the barbarians' battles of the pair struck (or lost) stand as
  // they were before the first blow, another player's where the blow found
  // it, a barbarian where their turn found it (`barbStart`)
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
  // a civilian they seized in the pair is its owner's still at their
  // tactical turn's ageing and look, on its plot, the seizure after
  // (runs/h1_dueldA1117 t33: China's Settler steps to 31:14 and the
  // barbarians' look records it there at age 0 before they take it; their
  // Settler is first on their end look's records)
  const seized: [Unit, Pick<Unit, 'id' | 'seat' | 'type' | 'tileIndex' | 'hp'>][] = [];
  const stood: Unit[] = [];
  for (const { u, was } of ctx.barbSeized) {
    const c = back.get(u);
    if (c && state.units.includes(u)) {
      seized.push([c, { id: c.id, seat: c.seat, type: c.type, tileIndex: c.tileIndex, hp: c.hp }]);
      Object.assign(c, { id: was.id, seat: was.seat, type: was.type, tileIndex: was.tileIndex, hp: was.hp });
    } else {
      const x = structuredClone(was);
      copy.units.push(x);
      stood.push(x);
    }
  }
  const taken = () => {
    for (const [c, f] of seized.splice(0)) Object.assign(c, f);
    if (stood.length) copy.units = copy.units.filter((x) => !stood.includes(x));
    stood.length = 0;
  };
  const logged = armyLog(ctx);
  traceKnowledge((seat, turn, records) => {
    logged(seat, turn, records);
    if (seat === BARB_SEAT) taken();
  });
  try {
    barbarianTactics(copy, acting);
  } finally {
    traceKnowledge(logged);
    taken();
    traceTactics(null);
    holdRng(held);
  }
  // the operations ran on the copy: the manager's state and the tribes'
  // (the recruit's asks, the spawn interval, the cities a raid's end and a
  // scout's report list, the scouts' trees)
  state.barbSeat.ops = copy.barbSeat.ops;
  state.barbSeat.opsNext = copy.barbSeat.opsNext;
  state.barbSeat.treeSlots = copy.barbSeat.treeSlots;
  state.barbSeat.treeFree = copy.barbSeat.treeFree;
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
  // ...and the knowledge base as the tactical turn's ageing and look left it
  // (its records name the units by id); its turn-end look runs once the
  // barbarians stand where the record holds them (after `syncUnits`), not
  // where the copy's moves took them (runs/h1_duelw1117 t16: the copy's
  // Warrior beside city-state 4's at 28:5, the game's not, its record the
  // log's age 2 at t17)
  state.barbSeat.armyKnown = ctx.armyLogged.get(BARB_SEAT)!.records.map((r) => ({ ...r }));
  state.barbSeat.armyAged = copy.barbSeat.armyAged;
  if (copy.barbSeat.campsKnown) state.barbSeat.campsKnown = copy.barbSeat.campsKnown;
  else delete state.barbSeat.campsKnown;
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
    if (game !== undefined) score(ctx, 'barb.move.family', turn, ownerOf(key), `${key} ${u.type}`, same, tacticalCategory(m.move), game);
    const want = at.get(key);
    const end = ended.get(u);
    if (want === undefined || end === undefined) continue;
    t.plotOf += 1;
    score(ctx, 'barb.move.plot', turn, ownerOf(key), `${key} ${u.type} (${game ?? m.move})`, end === want, end, want);
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
 * `freeCitiesMilitary`) on a copy of the state, in the game's player order,
 * after the majors' actions of the pair and before the barbarians' turn:
 * their units back where the pair's first record holds them, each in the
 * pool slot its ID names, with its Movement whole (one the turn bought, `bought`,
 * at none); the barbarians' units
 * where the first record holds them, those it lacks not yet raised; the
 * ground (owners, features, improvements, districts, roads) and every
 * player's research as record t+1 holds them. A
 * unit's "Random Direction" draw is the log's own where the turn's draws
 * pair one to one with its Wander and Garrison rows (every player's, in
 * order); a unit the game did not wander draws its own. Each unit's move is
 * set beside the game's tactical log and record t+1 (`tallyMinorTactics`):
 * the record's moves and battles stay the pair's.
 */
function minorAi(ctx: Ctx, b: TurnRecord, turn: number, made: ReadonlySet<Unit>, bought: ReadonlySet<Unit>,
  revealedWas: ReadonlyMap<number, number[] | undefined>): void {
  const { state } = ctx;
  const copy = deserialize(serialize(state));
  for (const cs of copy.cityStates) {
    const r = revealedWas.get(cs.seat);
    if (r) cs.revealed = [...r];
  }
  const twin = new Map<Unit, Unit>();
  state.units.forEach((u, i) => twin.set(copy.units[i], u));
  const keyOf = new Map<Unit, string>();
  for (const [key, u] of ctx.units) keyOf.set(u, key);
  const was = new Map(ctx.prev.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
  const hpWas = new Map(ctx.prev.units.map((r) => [`${r.owner}:${r.id}` as string, UNIT_HP - num(r.damage)]));
  const fortWas = new Map(ctx.prev.units.flatMap((r) => (typeof r.fortify === 'number' ? [[`${r.owner}:${r.id}` as string, r.fortify] as const] : [])));
  const xpWas = new Map(ctx.prev.units.flatMap((r) => (typeof r.xp === 'number' ? [[`${r.owner}:${r.id}` as string, r.xp] as const] : [])));
  // the units the minors' and the barbarians' battles of the pair struck (or
  // lost) stand as they were before the first blow: the game fought a
  // minor's in its own pass, the barbarians' after it (runs/h1_duelw1121 t9:
  // city-state 2's Warrior, whole at its turn's start, strikes the camp's
  // Spearman in its Attack Barb Camp operation)
  const back = new Map([...twin].map(([c, u]) => [u, c] as const));
  // — a unit the pair killed with its record key, in its place among its
  // player's units, which stand in the order they were made (runs/h1_duelw1121
  // t13: Hunza's Warrior at 11:4 stands its turn and is City Defense's first
  // recruit before the barbarian Quadrireme's strike kills it)
  for (const [u, { snap, key }] of ctx.minorBlows) {
    if (!keyOf.has(u)) keyOf.set(u, key);
    let c = back.get(u);
    if (!c) {
      c = structuredClone(snap);
      const seat = c.seat;
      const id = c.id;
      const mine = copy.units.flatMap((x, i) => (x.seat === seat ? [i] : []));
      const before = mine.filter((i) => copy.units[i].id < id);
      copy.units.splice(before.length ? before[before.length - 1] + 1 : mine.length ? mine[0] : copy.units.length, 0, c);
      twin.set(c, u);
    }
    c.hp = snap.hp;
    c.fortifyTurns = snap.fortifyTurns;
  }
  const gone = new Set<Unit>();
  const mine: Unit[] = [];
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
    // its health the first record's: the game heals its units at the turn's
    // end, after their pass (runs/h1_duelw1117 t10: city-state 3's Warrior
    // 131073, 8 damage at the turn's start, takes Heal)
    const r0 = hpWas.get(key);
    if (r0 !== undefined && !ctx.minorBlows.has(u)) c.hp = r0;
    // ...and its experience the first record's, the promotion due its
    // Promotion move reads (runs/h1_duelw1117 t23: city-state 3's Warrior
    // 196610, 8 experience at the turn's start, attacks with no promotion due)
    const x0 = xpWas.get(key);
    if (x0 !== undefined) c.xp = x0;
    // ...and its fortification, which the planning's blow back on it reads
    // (runs/h1_duelw1117 t9: city-state 2's Warrior 131073, fortified 2 on
    // 14:10, attacks the camp's Warrior with 30 taken and 26 back against 60
    // health)
    const f0 = fortWas.get(key);
    if (f0 !== undefined) c.fortifyTurns = f0;
    c.slot = Number(key.split(':')[1]) & 0xffff;
    c.attacksLeft = attacksPerTurn(c);
    mine.push(c);
  }
  copy.units = copy.units.filter((c) => !gone.has(c));
  // — a city-state's units as its own engine turn left them: a unit its city
  // trained where it was made, a Builder's charges before the turn's orders
  // (record t+1's spent them); a Builder record t+1 lost (its last charge
  // spent in the turn, runs/h1_dueldA1117 Valletta's at 365, t9's Farm)
  // stands where the turn found it for its city trees' order; one its
  // Economic AI's contract purchase made in the turn at Movement 0, as a
  // unit bought stands its turn out (runs/h1_duely1124 t27: Granada's Builder
  // bought for its Farm tree's contract, the tree gone that turn, the Farm on
  // 525 laid at t30)
  const spentBuilders = new Set<Unit>();
  const boughtNow = new Set([...bought].map((u) => `${u.seat}:${u.id}`));
  for (const s of ctx.minorUnits) {
    const there = copy.units.find((x) => x.seat === s.seat && x.id === s.id);
    if (there) {
      there.tileIndex = s.tileIndex;
      there.charges = s.charges;
      continue;
    }
    if ((s.charges ?? 0) <= 0) continue;
    const c = structuredClone(s);
    spentBuilders.add(c);
    const mineAt = copy.units.flatMap((x, i) => (x.seat === c.seat ? [i] : []));
    const before = mineAt.filter((i) => copy.units[i].id < c.id);
    copy.units.splice(before.length ? before[before.length - 1] + 1 : mineAt.length ? mineAt[0] : copy.units.length, 0, c);
    c.movesFull = unitFullMoves(copy, c);
    c.movesLeft = boughtNow.has(`${c.seat}:${c.id}`) ? 0 : c.movesFull;
  }
  // a city-state's research in its actions is its start's, which record
  // t+1 holds (its embarking), and the majors' as their actions left it
  // (the open-borders civic that closes their ground)
  for (const s of [...copy.cityStates, ...copy.seats]) {
    const r = seatOf(ctx.next.state, s.seat)?.research;
    if (r) s.research = { ...s.research, techs: [...r.techs], civics: [...r.civics] };
  }
  // each unit's Movement whole, its pool composed on that research where the
  // first record stands it, not the engine's turn-start pool (runs/h1_duelw1121
  // t113: city-state 2's embarked Musketmen plan on 3 Movement with the
  // Square Rigging record t+1 holds, record t+1's maxMoves 3)
  for (const c of mine) {
    c.movesFull = unitFullMoves(copy, c);
    c.movesLeft = c.movesFull;
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
  // the copy's purchases (its cities' second hooks), each the record's or
  // undone (`minorBuysAfter`)
  const buys: CopyBuy[] = [];
  traceMinorPurchases((cs, u, price) => buys.push({
    cs, u, price, savings: cs.economy ? [...cs.economy.savings] : undefined, threatened: (cs.threat ?? -1) > -1,
  }));
  // ...and its city trees' Builders' layings
  const lays: { u: Unit; plot: number; imp: string }[] = [];
  traceMinorLays((u, plot, imp) => lays.push({ u, plot, imp }));
  // its city trees order on the ground the city's turn found (the engine's,
  // the record's of the pair answered after, `minorLaysAfter`), the copy's
  // ground record t+1's again after
  holdSecondHook((st, _cs, run) => {
    if (st !== copy) return run();
    // ...in the pair's turn (the copy's clock stands on the next)
    const now = copy.turn;
    copy.turn = turn;
    const end = copy.map.tiles.map(groundOf);
    copy.map.tiles.forEach((t, i) => Object.assign(t, ctx.minorGround[i] ?? end[i]));
    try {
      run();
    } finally {
      copy.map.tiles.forEach((t, i) => Object.assign(t, end[i]));
      copy.turn = now;
    }
  });
  try {
    for (const cs of [...copy.cityStates].sort((x, y) => playerOf(x.seat) - playerOf(y.seat))) {
      // a city founded in the pair ran its second hook at its founding
      if (cs.centerIndex >= 0 && founded.has(playerOf(cs.seat))) cityStateMilitary(copy, cs);
    }
    freeCitiesMilitary(copy);
  } finally {
    traceTactics(null);
    holdRng(held);
    traceMinorPurchases(ctx.buyTrace);
    traceMinorLays(null);
    holdSecondHook(null);
  }
  minorBuysAfter(ctx, copy, buys, twin, keyOf);
  minorLaysAfter(ctx, lays);
  // the spent Builders gone again before the end look
  copy.units = copy.units.filter((c) => !spentBuilders.has(c));
  minorOpsAfter(ctx, b, turn, copy, twin, keyOf);
  minorClearsAfter(ctx, b);
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
    // a unit the "Upgrade Units" trees hold logs no tactical row (its turn
    // the tree's: runs/h1_duelw1117 city-state 2's Warrior 131073 t43-44)
    const game = rows ? tacticalCategory(rows.get(key) ?? (m.move === UPGRADE_MOVE ? UPGRADE_MOVE : '(no row)')) : undefined;
    // the Free Cities' moves apart
    const label = `${u.seat === FREE_SEAT ? 'Free Cities: ' : ''}${game ?? m.move}`;
    const t = (ctx.minorTally[label] ??= { units: 0, move: 0, plot: 0, plotOf: 0 });
    t.units += 1;
    const same = game === undefined || game === tacticalCategory(m.move);
    if (same) t.move += 1;
    if (!same && t.firstMove === undefined) t.firstMove = turn;
    const party = u.seat === FREE_SEAT ? 'freeCities' : 'cityState';
    if (game !== undefined) score(ctx, `${party}.move.family`, turn, ownerOf(key), `${key} ${u.type}`, same, tacticalCategory(m.move), game);
    const want = at.get(key);
    const end = ended.get(u);
    if (want === undefined || end === undefined) continue;
    t.plotOf += 1;
    score(ctx, `${party}.move.plot`, turn, ownerOf(key), `${key} ${u.type} (${game ?? m.move})`, end === want, end, want);
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

/** THE CITY-STATES' PURCHASES after their units' turn on the copy, each
 *  against the record's of the pair (`ctx.minorBuys`) by its city-state and
 *  unit: one the record holds stands as the record's unit, paid from the
 *  treasury, the copy's unit its twin; one it does not leaves the copy (the
 *  savings it spent kept, its Gold not); a record's purchase the copy made
 *  none of is imposed at its price, paid from what the treasury holds — the
 *  game buys only what it can pay for, so where the engine holds less the
 *  shortfall is the engine's own drift, never a debt */
function minorBuysAfter(ctx: Ctx, copy: GameState, buys: readonly CopyBuy[], twin: Map<Unit, Unit>, keyOf: Map<Unit, string>): void {
  const { state } = ctx;
  const open = [...ctx.minorBuys];
  ctx.minorBuys = [];
  for (const { cs: c, u, price, savings, threatened } of buys) {
    const cs = state.cityStates.find((x) => x.id === c.id);
    const k = open.findIndex(({ d }) => seatOfP(ctx, d.player) === c.seat && engineRowOf(ctx.cat, 'unit', d.type) === u.type);
    if (!cs || k < 0) {
      copy.units.splice(copy.units.indexOf(u), 1);
      // a purchase the game never made leaves no record in any knowledge base
      for (const h of [...copy.cityStates, ...(copy.freeSeat ? [copy.freeSeat] : []), copy.barbSeat]) {
        if (h.armyKnown?.some((r) => r.id === u.id && r.owner === u.seat)) h.armyKnown = h.armyKnown.filter((r) => r.id !== u.id || r.owner !== u.seat);
      }
      // ...and its savings back, the spend it took from each slot and from the
      // balance returned (the copy's economy the engine's again after)
      const eco = c.economy;
      if (eco && savings) {
        const spent: EconomicMemory = { savings: [...savings], balance: 0 };
        purchaseSpend(spent, price * FX, threatened);
        for (let i = 0; i < eco.savings.length; i++) eco.savings[i] += savings[i] - spent.savings[i];
        eco.balance += price * FX;
      }
      count(ctx, 'minorAi:unit', 'fallback', ctx.playerOfSeat.get(c.seat), `${u.type} bought`);
      if (TRACE.has('minorUnits')) console.error(`t${copy.turn} minorAi:unit p${ctx.playerOfSeat.get(c.seat)} ${u.type} bought`);
      continue;
    }
    const [{ d, rec }] = open.splice(k, 1);
    cs.treasury -= price;
    if (u.type === 'BUILDER') cs.buildersTrained += 1;
    // a record unit the turn's new units already stand for (`matchNewUnits`)
    const real = unitOf(ctx, d.unit) ?? spawnRecorded(ctx, rec, d.unit);
    if (real) {
      twin.set(u, real);
      keyOf.set(real, d.unit);
    }
    count(ctx, 'minorAi:buy', 'applied', d.player);
  }
  for (const { d, rec } of open) {
    if (unitOf(ctx, d.unit)) {
      count(ctx, 'minorAi:buy', 'applied', d.player);
      continue;
    }
    const seat = seatOfP(ctx, d.player);
    const minor = state.cityStates.find((c) => c.centerIndex === d.city && c.seat === seat)!;
    const id = engineRowOf(ctx.cat, 'unit', d.type);
    const price = id ? minorUnitPrice(state, minor, id, d.currency) : 0;
    if (d.currency === 'gold') {
      minor.treasury -= Math.min(price, Math.max(0, minor.treasury));
      // ...through its economic AI's purchase (TryPurchaseUnits' spend), so
      // the turn after shares only the treasury's own change over the
      // savings, as the game's do (runs/h1_duelu1117 Caguana: its Builder of
      // t62 the game's alone, its savings unspent, every second turn a
      // purchase t70-t101 the game never made); on the copy's economy, the
      // engine's again after
      const eco = copy.cityStates.find((x) => x.id === minor.id)?.economy;
      if (eco) purchaseSpend(eco, price * FX, (minor.threat ?? -1) > -1);
    } else minor.faith -= Math.min(price, Math.max(0, minor.faith));
    const real = spawnRecorded(ctx, rec, d.unit);
    // the record's unit stands in the copy for the end look
    if (real) {
      const x = structuredClone(real);
      copy.units.push(x);
      twin.set(x, real);
      keyOf.set(real, d.unit);
    }
    count(ctx, 'minorAi:buy', 'fallback', d.player, `${id}: the engine bought none (threat ${minor.threat ?? -1}, gold ${minor.treasury})`);
  }
}

/** a purchase the copy's units' turn made: the city-state, the unit, its
 *  price and the savings before it, on the threat it bought under */
interface CopyBuy { cs: CityState; u: Unit; price: number; savings?: number[]; threatened: boolean }

/** a plot's ground as the copy of the units' turn sets it from record t+1 */
type GroundOf = Pick<Tile, 'ownerSeat' | 'ownerCity' | 'feature' | 'resource' | 'improvement' | 'pillaged' | 'district' | 'districtComplete'
  | 'districtPillaged' | 'road'>;
const groundOf = (t: Tile): GroundOf => ({ ownerSeat: t.ownerSeat, ownerCity: t.ownerCity, feature: t.feature, resource: t.resource,
  improvement: t.improvement, pillaged: t.pillaged, district: t.district, districtComplete: t.districtComplete,
  districtPillaged: t.districtPillaged, road: t.road });

/** THE CITY-STATES' LAYINGS after their units' turn on the copy, each
 *  against the record's improvements of the pair (`ctx.minorImproves`) by
 *  its plot: one the record holds stands; one it does not leaves the plot as
 *  it was; a record's improvement no laying made is imposed. The Builders'
 *  charges are record t+1's already (`syncUnits`). */
function minorLaysAfter(ctx: Ctx, lays: readonly { u: Unit; plot: number; imp: string }[]): void {
  const { state, next } = ctx;
  const open = [...ctx.minorImproves];
  ctx.minorImproves = [];
  for (const { u, plot, imp } of lays) {
    const t = state.map.tiles[plot];
    const k = open.findIndex((d) => d.plot === plot && next.state.map.tiles[plot].improvement === imp);
    if (k < 0) {
      count(ctx, 'minorAi:improve', 'fallback', ctx.playerOfSeat.get(u.seat), `plot ${plot}: the engine laid ${imp}, the game ${next.state.map.tiles[plot].improvement}`);
      continue;
    }
    const [d] = open.splice(k, 1);
    if (t.improvement !== imp) {
      t.improvement = imp;
      t.pillaged = false;
      replaceOwnerCitizens(state, t);
    }
    count(ctx, 'minorAi:improve', 'applied', d.player);
  }
  for (const d of open) {
    const t = state.map.tiles[d.plot];
    const want = next.state.map.tiles[d.plot].improvement;
    if (t.improvement === want) { count(ctx, 'minorAi:improve', 'applied', d.player); continue; }
    t.improvement = want;
    t.pillaged = false;
    replaceOwnerCitizens(state, t);
    count(ctx, 'minorAi:improve', 'fallback', d.player, `plot ${d.plot}: the engine laid none of ${want}`);
  }
}

/** THE CITY-STATES' CLEARINGS after their units' turn on the copy: the
 *  record's, each through `applyClear`, its lump landing on the item the
 *  city's second hook left in hand (runs/h1_duely1124 Granada t21: the
 *  Warrior at 18 of 20 in hand through the hook, its Builder's Rainforest
 *  lump completing it, City_BuildQueue.csv's second t21 line, the queue
 *  empty in record t22) */
function minorClearsAfter(ctx: Ctx, b: TurnRecord): void {
  const open = ctx.minorClears;
  const units = ctx.minorClearUnits;
  ctx.minorClears = [];
  ctx.minorClearUnits = [];
  for (const d of open) applyClear(ctx, d);
  // the record's new units of those city-states: a lump's completion
  // among them
  for (const { d, ds } of units) applyUnitNew(ctx, b, d, ds, false);
}

/** THE CITY-STATES' OPERATIONS after their units' turn on the copy: their
 *  AI's state (the operations, the city AI's contracts and trees, the item
 *  a submission cleared) the engine's again; their lines of the pair against
 *  the game's logs, their units' plots against record t+1 */
function minorOpsAfter(ctx: Ctx, b: TurnRecord, turn: number, copy: GameState, twin: ReadonlyMap<Unit, Unit>,
  keyOf: ReadonlyMap<Unit, string>): void {
  const { state } = ctx;
  const startAt = new Map(ctx.prev.units.map((r) => [`${r.owner}:${r.id}` as string, r.y * ctx.W + r.x] as const));
  // their units' AI type as their operations' recruits left it
  for (const [x, u] of twin) {
    if (!minorAiSeat(x.seat) || !copy.units.includes(x) || !state.units.includes(u)) continue;
    if (x.aiDefender) u.aiDefender = true;
    else delete u.aiDefender;
  }
  for (const c of copy.cityStates) {
    const cs = state.cityStates.find((x) => x.id === c.id);
    if (!cs) continue;
    if (c.ops) cs.ops = c.ops;
    if (c.cityAi) cs.cityAi = c.cityAi;
    // its "Upgrade Units" trees as its units' turn left them, and the savings
    // their upgrades spent
    if (c.upgrading) cs.upgrading = c.upgrading;
    else delete cs.upgrading;
    if (c.upgradeTrigger) cs.upgradeTrigger = true;
    else delete cs.upgradeTrigger;
    if (c.economy) cs.economy = c.economy;
    // its knowledge base's look after its units' turn (`minorPhase`'s last),
    // in the pair's turn and before the barbarians' turn: its units on the
    // plots record t+1 holds them on, the others where the turn found them
    // with record t+1's damage (the turn's engine pass looked before its
    // moves) — a city-state or the Free Cities before it where record t+1
    // holds them, one after it where the first record does, its turn yet to
    // come (runs/h1_dueld1121 t99: Ayutthaya's record of Antioch's
    // Man-at-Arms 1048577 at 42:16, its plot as Antioch's turn opens). What it sees is seen in the pair's turn, so the next turn's
    // operations evaluation reads it aged one (runs/h1_duelv1128 city-state
    // 4: the camp's Spearman, seen after its t13 moves and not again before
    // t18, is past the age its t17 Attack Barb Camp odds read)
    if (c.centerIndex >= 0) {
      const held: [Unit, number, number][] = [];
      for (const [x, u] of twin) {
        if (!copy.units.includes(x)) continue;
        if (!state.units.includes(u)) {
          // its unit record t+1 lost stands where the log's steps of the
          // turn left it, else where its turn found it: its last plot the
          // look sees it on (runs/h1_dueld1117 t8: Valletta's Warrior walks
          // to 13:12 and falls after the look, its record the game's 13:12 at
          // age 1; h1_dueld1124 t21: Cardiff's Warrior strikes from 8:14 without
          // a step and falls in the barbarians' turn, its record 8:14)
          if (x.seat !== c.seat) continue;
          const key = keyOf.get(u) ?? '';
          const steps = ctx.paths.get(key);
          const at = steps?.length ? steps[steps.length - 1] : startAt.get(key);
          if (at !== undefined) {
            held.push([x, x.tileIndex, x.hp]);
            x.tileIndex = at;
          }
          continue;
        }
        held.push([x, x.tileIndex, x.hp]);
        if (x.seat === c.seat) x.tileIndex = u.tileIndex;
        else {
          x.hp = u.hp;
          if (minorAiSeat(x.seat)) {
            const first = startAt.get(keyOf.get(u) ?? '');
            x.tileIndex = ctx.playerOfSeat.get(x.seat)! < ctx.playerOfSeat.get(c.seat)! ? u.tileIndex : first ?? u.tileIndex;
          }
        }
      }
      // its revealed plots those the record's steps revealed, not the
      // pass's own moves on the copy
      c.revealed = cs.revealed ? [...cs.revealed] : undefined;
      const now = copy.turn;
      copy.turn = turn;
      // ...seeing no unit the next turn's start made
      const unborn = unbornUnits(ctx, b);
      const all = copy.units;
      copy.units = all.filter((x) => !unborn.has(twin.get(x)!));
      minorKnowledge(copy, c, false);
      copy.units = all;
      copy.turn = now;
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
    // the item its second hook set (or a submission cleared)
    if ((c.prodItem ?? '') !== (cs.prodItem ?? '') || c.prodSite !== cs.prodSite) minorSetItem(state, cs, minorItemInHand(c));
    if (c.prodSetValue !== undefined) cs.prodSetValue = c.prodSetValue;
    else delete cs.prodSetValue;
    const player = ctx.playerOfSeat.get(cs.seat);
    if (player === undefined) continue;
    const got = ctx.minorOps.get(cs.seat);
    ctx.operations.minorTurn(turn, player, got?.lines ?? [], got?.evals ?? []);
    for (const op of c.ops ? opsOf(c.ops) : []) {
      for (const id of opUnits(op)) {
        const u = copy.units.find((x) => x.id === id);
        const key = u ? keyOf.get(twin.get(u)!) : undefined;
        if (u && key) ctx.operations.minorEnd(b, op.def, player, turn, key, u.tileIndex, gameTypeOf('unit', u.type, 'UNIT_'));
      }
    }
  }
  // the Free Cities' operations the engine's again, their lines against the
  // game's, their units' plots against record t+1
  const free = copy.freeSeat;
  if (free && state.freeSeat) {
    if (free.ops) state.freeSeat.ops = free.ops;
    if (free.cityAi) state.freeSeat.cityAi = free.cityAi;
    const player = ctx.playerOfSeat.get(FREE_SEAT);
    if (player !== undefined) {
      ctx.operations.minorTurn(turn, player, ctx.minorOps.get(FREE_SEAT)?.lines ?? [], []);
      for (const op of free.ops ? opsOf(free.ops) : []) {
        for (const id of opUnits(op)) {
          const u = copy.units.find((x) => x.id === id && x.seat === FREE_SEAT);
          const key = u ? keyOf.get(twin.get(u)!) : undefined;
          if (u && key) ctx.operations.minorEnd(b, op.def, player, turn, key, u.tileIndex, gameTypeOf('unit', u.type, 'UNIT_'));
        }
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
    applySeatEnvoys(state, s, { production: [], tech: null, civic: null, units: [], envoys: new Array(short).fill(cs.id) });
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

/** THE TURN'S MISSIONS of the record's majors as the two majors' actions on
 *  the engine's table: the sender's offer of its MISSION (`putOffer`), then
 *  the receiver's answer — its acceptance (`answerOffer`) where the record's
 *  receiver accepted, none where it refused (the offer lapses). What the
 *  engine's table cannot carry is laid as the record holds it. */
function applyMissions(ctx: Ctx, events: readonly MissionEvent[]): void {
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

type PolicyDecision = Extract<Decision, { kind: 'policies' }>;

/** a government and slot layout as the engine names them: per slot (the
 *  game's slot order, the engine's `governmentSlots`) its card, null empty */
function policyIds(ctx: Ctx, d: PolicyDecision): { gid: string | null; ids: string[]; layout: (string | null)[] } {
  const gid = d.government >= 0 ? engineId('government', ctx.cat.governments[d.government], 'GOVERNMENT_', GOVERNMENTS) : null;
  const layout = d.policies.map((i) => (i >= 0 ? engineId('policy', ctx.cat.policies[i], 'POLICY_', POLICIES) ?? null : null));
  return { gid, ids: layout.filter((x): x is string => !!x), layout };
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
    const { gid, layout } = policyIds(ctx, d);
    const gi = gid ? GOVERNMENT_LIST.findIndex((g) => g.id === gid) : -1;
    // the layout on the slots of the government the record's set is laid in
    const slots = governmentSlots(ctx.state, seat, gid ?? seatGovernment(ctx.state, seat));
    Object.assign(recOf(seat), { government: gi >= 0 ? gi : null, policies: policyWireOf(slots, layout) });
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
 *  the log, and the fortification record t+1 shows for it — null where
 *  record t+1 no longer holds the unit */
function fortifiedIn(b: TurnRecord): Map<string, { ord: number; turns: number | null }> {
  const out = new Map<string, { ord: number; turns: number | null }>();
  const rows = (b as { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return out;
  const dug = new Map(b.units.map((r) => [`${r.owner}:${r.id}`, num(r.fortify)]));
  for (const x of rows as unknown[][]) {
    if (x[2] !== 'UnitOperationStarted' || x[5] !== OP_FORTIFY) continue;
    const k = `${x[3]}:${x[4]}`;
    if (!out.has(k)) out.set(k, { ord: x[0] as number, turns: dug.get(k) ?? null });
  }
  return out;
}

/** each unit's logged steps of the pair (`UnitMoved`), in the log's order */
function loggedSteps(b: TurnRecord, W: number): Map<string, { ord: number; plot: number }[]> {
  const out = new Map<string, { ord: number; plot: number }[]>();
  const rows = (b as { actions?: unknown }).actions;
  if (!Array.isArray(rows)) return out;
  for (const x of rows as unknown[][]) {
    if (x[2] !== 'UnitMoved') continue;
    const k = `${x[3]}:${x[4]}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ ord: x[0] as number, plot: (x[6] as number) * W + (x[5] as number) });
  }
  return out;
}

/** THE OTHER UNITS AS THE LOG HAD THEM at a blow (its place `ord`): each one
 *  the pair's log steps stands on its last plot entered before the blow, or
 *  where it stood before its first step; the restore puts them back
 *  (runs/h1_duelw1127 t26: a barbarian Warrior steps beside Rome's Warrior
 *  before its fellow strikes it, and flanks it, the CombatLog's +2). */
function standAtBlow(ctx: Ctx, ord: number, fighters: readonly Unit[]): () => void {
  const moved: [Unit, number][] = [];
  for (const [k, steps] of ctx.steps) {
    const u = unitOf(ctx, k);
    if (!u || fighters.includes(u) || !ctx.state.units.includes(u)) continue;
    const before = steps.filter((s) => s.ord < ord);
    const r = ctx.prev.units.find((x) => `${x.owner}:${x.id}` === k);
    const at = before.length ? before[before.length - 1].plot : r ? r.y * ctx.W + r.x : u.tileIndex;
    if (at === u.tileIndex) continue;
    moved.push([u, u.tileIndex]);
    u.tileIndex = at;
  }
  return () => { for (const [u, at] of moved) u.tileIndex = at; };
}

/** A DEFENDER THAT TOOK THE FORTIFY ORDER before the blow (in the log's
 *  order) holds the fortification record t+1 shows for it, which may stand
 *  two turns dug in after one order (runs/h1_duelw1117 t17: Rome's Warrior
 *  327683, ordered at 31 HP, defended at +6 against a barbarian Warrior and
 *  read 2; 1124 t69: an Archer's shot on Rome's Warrior, CombatLog +3 on Snow
 *  at 66 HP); a blow before the order finds it as it stood (1121 t6: a camp's
 *  Spearman struck by a city-state before its own turn's order). A unit the
 *  pair killed holds the order's own tick, one turn more than it stood at,
 *  from its first blow after the order (the operation's tick 0x95ebb0;
 *  runs/h1_duelw1127 t16: city-state 3's Warrior, moved the turn before,
 *  orders Fortify at 51 HP on Floodplains and takes a barbarian Slinger's
 *  23 at the CombatLog's DefenderStrMod −4, then dies to a Warrior). */
function dugIn(ctx: Ctx, d: BattleDecision, def: Unit): void {
  const f = ctx.fortified.get(d.defender);
  if (f && d.ord > f.ord && f.turns === null) f.turns = Math.min(FORTIFY_MAX_TURNS, (def.fortifyTurns ?? 0) + 1);
  if (f && d.ord > f.ord && f.turns !== null && f.turns > (def.fortifyTurns ?? 0)) def.fortifyTurns = f.turns;
  const m = ctx.undug.get(d.defender);
  if (m && d.ord < m.ord && m.turns > (def.fortifyTurns ?? 0)) def.fortifyTurns = m.turns;
}

/** A UNIT'S ATTACK ON A CITY the log names (`battle` with no defender: a
 *  melee attack by its own damage, a shot by the combat log): the engine's
 *  melee or ranged attack from where the log's steps had the unit, on the
 *  city's centre or Encampment, on the game's own draws. */
function assault(ctx: Ctx, wit: TurnRecord, b: TurnRecord, d: BattleDecision): void {
  const { state } = ctx;
  const atk = unitOf(ctx, d.attacker);
  if (!atk) { count(ctx, 'battle', 'refused', d.player, 'a unit the replay does not hold'); return; }
  // a barbarian's or a minor's assault stands, as its unit battles do, as it
  // was before the blow where the blow found it, for its player's turn on the
  // copy (runs/h1_duelw1117 t13: the barbarian Warrior that died on Rome's
  // city at 14:8, seen at age 0 by its knowledge base's look before)
  const snap = () => Object.assign(structuredClone(atk), { tileIndex: d.from });
  if (isBarbSeat(atk.seat) && !ctx.barbBlows.has(atk)) ctx.barbBlows.set(atk, Object.assign(snap(), { tileIndex: barbStart(ctx, d.attacker, d.from) }));
  if (minorAiSeat(atk.seat) && !ctx.minorBlows.has(atk)) ctx.minorBlows.set(atk, { snap: snap(), key: d.attacker });
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
  // an InfluenceGiven row between the player before's deactivation and its
  // own activation is its start's (runs/h1_duelw1121 t41: China's envoy to
  // Hunza, its Mysticism token, the minor annexing no plot for it)
  const rows = ((b as { actions?: unknown }).actions ?? []) as unknown[][];
  const on = rows.findIndex((r) => r[2] === 'PlayerTurnActivated' && r[3] === player && r[1] === a.turn);
  if (on > 0) {
    let k = on - 1;
    while (k >= 0 && rows[k][2] !== 'PlayerTurnDeactivated') k--;
    if (rows.slice(k + 1, on).some((r) => r[2] === 'InfluenceGiven')) return true;
  }
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
  // the civics each start completes (`turnStartCompletions`)
  const starts = turnStartCompletions(ctx, b, a.turn);
  for (const d of ds) {
    if (d.kind !== 'envoy' || d.phase !== 'after' || !envoysInStart(log, a, b, d.player)) continue;
    const seat = seatOfP(ctx, d.player);
    const s = seatOf(state, seat) as Seat | undefined;
    const ms = seatOfP(ctx, d.minor);
    const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
    if (!s || !cs || seat >= state.seats.length || !cs.met.includes(seat)) continue;
    // the tokens its start's Influence fills, and those the civics its start
    // completes award, land before the start sends (runs/h1_duelw1121 t37:
    // China's token filled and its envoy sent to Hunza in its start; t41:
    // Mysticism's token sent there, before its Favor)
    const awarded = (starts.get(seat)?.civics ?? []).filter((c) => !s.research.civics.includes(c))
      .reduce((m, c) => m + (CIVICS[c]?.effects ?? []).reduce((k, e) => k + (e.kind === 'award' ? e.envoys ?? 0 : 0), 0), 0);
    const left = purse.get(seat) ?? envoysAtStart(state, seat) + awarded;
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
    const { gid, ids, layout } = policyIds(ctx, d);
    // the layout slot by slot
    const govOk = !gid || s.government.chosen === gid;
    const same = govOk && s.government.policies.length === layout.length && layout.every((c, i) => (s.government.policies[i] ?? null) === c);
    let why: string | undefined;
    if (!same) {
      const gov = seatGovernment(ctx.state, s.seat);
      const open = gov ? unlockedPolicyIds(s.research, darkAgeEra(ctx.state, s.seat), s.government.held, gov)
        : new Set<string>();
      why = !govOk ? `government ${gid} not adopted (in ${s.government.chosen})`
        : ids.some((id) => !open.has(id)) ? `a card not unlocked: ${ids.filter((id) => !open.has(id)).join(',')}`
          : layout.length !== governmentSlots(ctx.state, s.seat).length ? 'the layout is not the slots\' count'
            : 'a card off its slot, or the unlock unaffordable';
      if (gid) s.government.chosen = gid as typeof s.government.chosen;
      s.government.policies = layout;
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
    // — its Settler last seen at the minor's look of the turn before, the
    // game founding it in its start of the record's turn (runs/h1_dueld1121
    // aimem: each city-state's SETTLER at age 1 on t2's log)
    const placed = placeCityStateAt(state, minor.id, minor.name, minor.type, d.plot, state.turn - 1);
    // its purse as the record's player held it before its city (runs/h1_duelw1124
    // t1: every city-state's 5 Gold at no yield)
    Object.assign(placed, { envoys: minor.envoys, met: minor.met, suzerain: minor.suzerain, research: minor.research,
      treasury: minor.treasury, faith: minor.faith });
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
      minorSecondHook(state, placed, fresh);
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

/** A FEATURE OR RESOURCE TAKEN OFF (the record's clearing): the order is the
 *  player's, through the engine's verb with the builder the log names, from
 *  the plot: the lump, the charge */
function applyClear(ctx: Ctx, d: Extract<Decision, { kind: 'clear' }>): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const t = state.map.tiles[d.plot];
  if (d.what === 'feature' ? !t.feature : !t.resource) return void count(ctx, `clear:${d.what}`, 'refused', d.player);
  const builder = d.unit ? unitOf(ctx, d.unit) : undefined;
  let why = d.unit ? 'a builder the replay does not hold' : undefined;
  if (builder) {
    builder.tileIndex = d.plot;
    const res = d.what === 'feature' ? builderRemoveFeature(state, builder.id, seat) : builderHarvest(state, builder.id);
    if (res.ok) return void count(ctx, `clear:${d.what}`, 'applied');
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
}

/** A NEW UNIT OF THE RECORD, a major's, a city-state's or a Free City's.
 *  `mayWait`: a city-state's the engine has not made waits for its
 *  clearings' lumps (`minorClearsAfter`) */
function applyUnitNew(ctx: Ctx, b: TurnRecord, d: Extract<Decision, { kind: 'unitNew' }>, ds: readonly Decision[], mayWait: boolean): void {
  const seat = seatOfP(ctx, d.player);
  const major = seat >= 0 && seat < ctx.state.seats.length;
  // a unit an engine verb of this phase made (a wonder a charge completed
  // grants its Great Person, a minor's harvest completes its item) is the
  // record's
  matchNewUnits(ctx, b);
  if (d.why === 'trained' && major) {
    if (unitOf(ctx, d.unit)) count(ctx, 'unitNew:trained', 'applied', d.player);
    else completeTrained(ctx, b, d);
    return;
  }
  if (unitOf(ctx, d.unit)) {
    if (!major) count(ctx, 'minorAi:unitNew', 'applied', d.player);
    return;
  }
  if (mayWait && isCityStateSeat(seat) && ctx.minorClears.some((c) => c.player === d.player)) {
    ctx.minorClearUnits.push({ d, ds });
    return;
  }
  // a captive is the seizure's (`seize`)
  if (ds.some((x) => x.kind === 'seize' && x.into === d.unit)) return;
  spawnRecorded(ctx, b, d.unit);
  // a Trader the engine's city-state made and the record's route then sent
  // out (the engine's route spends its Trader; the record's stands on the
  // map): the record's, made by the engine (runs/h1_duelu1117 t44:
  // Antananarivo's Trader 393218, trained and routed to Caguana in its turn)
  const sent = ctx.routeSpent.get(seat) ?? [];
  const k = sent.indexOf(engineRowOf(ctx.cat, 'unit', d.type) ?? '');
  if (!major && k >= 0) {
    sent.splice(k, 1);
    count(ctx, 'minorAi:unitNew', 'applied', d.player);
    return;
  }
  count(ctx, major ? 'unitNew:other' : 'minorAi:unitNew', 'fallback', d.player, `${d.unit} ${ctx.cat.units[d.type]} ${d.why}: the engine made none`);
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
  // a city-state's purchase is its AI's, made in its units' turn (its city's
  // second hook, `minorSecondHook`): answered once that turn has run
  // (`minorBuysAfter`)
  const minor = state.cityStates.find((c) => c.centerIndex === d.city && c.seat === seat);
  if (minor) {
    ctx.minorBuys.push({ d, rec });
    return;
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

function applyPhase(ctx: Ctx, ds: Decision[], phase: Decision['phase'], b: TurnRecord, wit: TurnRecord,
  players?: ReadonlySet<number>): void {
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
  // a kill lands after the battle it ended, which a later player may have
  // fought (runs/h1_duelw1127 t30: a barbarian Warrior attacks China's and
  // dies on the counter, the kill China's: counted once, after the blow)
  const fightOf = new Map<string, number>();
  for (const d of ds) {
    if (d.kind !== 'battle' || phaseOf(d) !== phase) continue;
    for (const u of [d.attacker, d.defender]) if (u) fightOf.set(u, Math.max(fightOf.get(u) ?? -1, d.player));
  }
  const rank = (d: Decision) => (late(d) ? 1 << 20 : d.kind === 'kill' ? Math.max(d.player, fightOf.get(d.victimUnit) ?? -1)
    : 'player' in d ? d.player : -1);
  // a charge on a wonder the pair placed lands once the queue holds it; a
  // Settler walks its steps, looking from each, before it founds (runs/h1_duelw1124
  // t2: Rome's Settler steps (34,20) -> (34,19) and its look of three shows
  // (37,19) before the city stands)
  const founders = new Set(ds.flatMap((d) => (d.kind === 'found' && d.unit ? [d.unit] : [])));
  const order = (d: Decision) => (d.kind === 'wonderCharge' && d.placed ? ORDER.indexOf('queue') + 0.5
    : d.kind === 'move' && founders.has(d.unit) ? ORDER.indexOf('found') - 0.5 : ORDER.indexOf(d.kind));
  // `players`: the actions of those players' turns alone (their rank); else
  // every decision of the phase no earlier call took
  const taken = (d: Decision) => ctx.applied.has(d);
  const mine = ds.filter((d) => phaseOf(d) === phase && !taken(d) && (!players || players.has(rank(d))))
    .sort((x, y) => (rank(x) - rank(y)) || (order(x) - order(y)));
  for (const d of mine) ctx.applied.add(d);
  // EACH PLAYER'S ACTIONS draw on the stream its start completed with (its
  // `PlayerTurnStartComplete` witness in `wit`: record t for the active
  // player's, record t + 1 for the others'), each player's draws its own
  // run of it (runs/h1_duelw1117 t24: China's envoy annexes Caguana's 702 on
  // the first draw past its start; t26: Stonehenge's two free plots)
  const streams = ctx.streams;
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
        // a city-state's citizens are the engine's citizen manager's
        // (cpu/core/citizens.ts), never imposed
        const city = cityAt(state, d.city);
        if (!city) break;
        for (const t of state.map.tiles) {
          if (t.ownerSeat !== city.seat || t.ownerCity !== city.id) continue;
          t.locked = false;
          t.lockRank = undefined;
          t.lockPop = undefined;
        }
        d.plots.forEach((q, i) => {
          const t = state.map.tiles[q];
          if (q === city.centerIndex || t.district) return;
          t.locked = true;
          if (d.ranks?.[i]) t.lockRank = d.ranks[i];
          if (d.upTo?.[i]) t.lockPop = d.upTo[i];
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
        // a city-state's improvement is its trees' Builder's, laid in its
        // units' turn (its city's second hook's pass): answered once that
        // turn has run (`minorLaysAfter`)
        if (isCityStateSeat(seat)) {
          ctx.minorImproves.push(d);
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
        for (const [from, to, plot] of d.units) {
          const u = unitOf(ctx, from);
          if (!u) continue;
          ctx.units.set(to, u);
          if (!res.ok) {
            u.seat = seat;
            u.leviedFrom = cs.seat;
          }
          // a unit made anew where its major may not stand is added where
          // the game jumps it, which the engine does not lay
          // (runs/h1_duelw1117 t74: city-state 3's Heavy Chariot from its
          // centre to (41,13))
          if (u.tileIndex !== plot) {
            u.tileIndex = plot;
            count(ctx, 'levy:jump', 'fallback', d.player, 'the engine jumps no re-made unit');
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
        // the engine's own levy clock sent the units home at the minor's
        // start (`minorLevyReturn`); the game's new ids name the same units,
        // the old ones still through the pair: a battle a unit fought before
        // it came home is the log's under its levied id (runs/h1_duelw1117
        // t42: China's levied Warrior killed a barbarian, then went home with
        // its 23 damage)
        const seat = seatOfP(ctx, d.player);
        for (const [from, to] of d.units) {
          const u = unitOf(ctx, from);
          if (!u) continue;
          ctx.units.set(to, u);
          count(ctx, 'levyEnd', u.seat === seat ? 'applied' : 'refused', d.player,
            `the engine's levy clock kept ${u.type} levied (ends ${state.cityStates.find((c) => c.seat === seat)?.levyEnds ?? '-'})`);
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
        if (d.what === 'improvement') {
          // the Builder's removal (no charge): the improvement gone, not
          // pillaged, its based aircraft scattered
          if (!t.improvement || tileSeat(t) !== seat) { count(ctx, 'clear:improvement', 'refused', d.player); break; }
          t.improvement = null;
          t.pillaged = false;
          displaceAirFrom(state, t.index);
          count(ctx, 'clear:improvement', 'applied');
          break;
        }
        // a city-state's clearing is its trees' Builder's, ordered in its
        // units' turn after its city's second hook: answered once that turn
        // has run (`minorClearsAfter`)
        if (isCityStateSeat(seat)) {
          ctx.minorClears.push(d);
          break;
        }
        applyClear(ctx, d);
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
        const religion = r.type ? RELIGION_TYPES.indexOf(r.type) : -1;
        const adopted = picks.length && (s.religion.founded || r.founded) ? adoptBeliefs(state, seat, picks, religion, holyAt) : { ok: false, reason: 'no belief to adopt' };
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
        g.forEach((x, i) => {
          const from = x.cityId >= 0 ? next.state.seats[seat]?.cities.find((c) => c.id === x.cityId) : undefined;
          const to = from ? cityAt(state, from.centerIndex) : undefined;
          const cityId = to && to.seat === seat ? to.id : -1;
          const e = roster[i];
          const same = () => x.appointed === e.appointed && x.promotions === e.promotions && cityId === e.cityId && x.minorId === e.minorId;
          if (same()) return;
          const verbs: [number, number, number][] = [];
          if (x.appointed && !e.appointed) verbs.push([GOV_APPOINT, i, 0]);
          for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
            if (promotionBit(x.promotions, p) && !promotionBit(e.promotions, p)) verbs.push([GOV_PROMOTE, i, p]);
          }
          if ((cityId >= 0 || x.minorId >= 0) && (cityId !== e.cityId || x.minorId !== e.minorId)) {
            verbs.push(x.minorId >= 0 ? [GOV_ASSIGN_MINOR, i, x.minorId] : [GOV_ASSIGN_CITY, i, to!.centerIndex]);
          }
          applyGovernorActions(state, seat, verbs);
          if (same()) {
            count(ctx, 'governors', 'applied');
            return;
          }
          // the record's roster, on the engine's clock where the posting
          // stands (a record reads an unestablished governor's full count)
          const kept = e.appointed && e.cityId === cityId && e.minorId === x.minorId && cityId + x.minorId > -2;
          roster[i] = { ...x, cityId, establishTurns: kept ? e.establishTurns : x.establishTurns };
          count(ctx, 'governors', 'fallback', d.player);
        });
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
            const traders = state.units.filter((u) => u.seat === seat && u.type === 'TRADER');
            res = r.toCs !== undefined ? minorRouteTo(state, minor, { from: -1, to: -1, toCs: r.toCs })
              : to ? minorRouteTo(state, minor, { from: -1, to: -1, toSeat: to.seat, toSeatCity: to.id })
                : { ok: false, reason: 'no engine city at the destination' };
            // the Trader the route spent, where the engine's turn made it
            const spent = traders.find((u) => !state.units.includes(u));
            if (spent && ctx.standing && !ctx.standing.has(spent)) {
              ctx.routeSpent.set(seat, [...(ctx.routeSpent.get(seat) ?? []), spent.type]);
            }
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
        // a civilian a seizure of the turn takes is the seizure's: it lands
        // it under its captor (runs/h1_duelw1105 t39: China's Builder 851968,
        // gone from China's record before the barbarians' turn seizes it)
        if (ds.some((x) => x.kind === 'seize' && x.victim === d.unit)) { count(ctx, `unitGone:${d.why}`, 'applied'); break; }
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
        if (isBarbSeat(seatOfP(ctx, d.player))) {
          ctx.barbNew.push(d.unit);
          break;
        }
        applyUnitNew(ctx, b, d, ds, true);
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
        // a camp the engine's battle cleared already (its victor advanced
        // onto it: runs/h1_duelw1121 t35, Rome's Warrior at (33,7)) paid the
        // engine's dispersal there
        const cleared = !!u && u.tileIndex === d.plot && !state.barbSeat.camps.includes(d.plot);
        if (!u || (!cleared && !state.barbSeat.camps.includes(d.plot))) { count(ctx, 'camp', 'refused', d.player); break; }
        if (!cleared) clearCampFor(state, u, d.plot);
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
        ctx.upgradeInto.delete(d.into);
        const r = b.units.find((x) => `${x.owner}:${x.id}` === d.into);
        // a unit the engine's turn made and the player upgraded within it,
        // which no record holds before: the engine's own, of the chassis that
        // upgrades to the record's (runs/h1_dueld1128 t41: Hong Kong's Warrior
        // 851968, trained and upgraded to the Swordsman 917509 in its turn)
        const into = r ? engineRowOf(ctx.cat, 'unit', r.type) : null;
        const mapped = new Set(ctx.units.values());
        // a city-state's upgrade climbs its line as far as its research
        // reaches (`minorUpgradeType`: a Warrior to a Man-at-Arms)
        const minorOf = (x: Unit) => (isCityStateSeat(x.seat) ? state.cityStates.find((c) => c.seat === x.seat) : undefined);
        const upTo = (x: Unit) => { const m = minorOf(x); return m ? minorUpgradeType(m, x.type) : UNITS[x.type]?.upgradesTo; };
        const made = unitOf(ctx, d.unit) ? undefined
          : state.units.find((x) => x.seat === seatOfP(ctx, d.player) && !mapped.has(x) && !!into && upTo(x) === into);
        if (made) {
          ctx.units.set(d.unit, made);
          // the unit trained the game's, upgraded in the same turn
          if (isCityStateSeat(made.seat)) count(ctx, 'minorAi:unitNew', 'applied', d.player);
        }
        const u = unitOf(ctx, d.unit);
        if (!u) {
          // a unit trained and upgraded within the turn, which no record
          // holds before its upgrade, stands as record t+1 holds it
          // (runs/h1_duelw1117 t160: Antananarivo's Scout 1900550, built and
          // upgraded to the Ranger 1966081 in its turn)
          const into = !unitOf(ctx, d.into) && b.units.some((x) => `${x.owner}:${x.id}` === d.into) ? spawnRecorded(ctx, b, d.into) : undefined;
          const major = seatOfP(ctx, d.player) >= 0 && seatOfP(ctx, d.player) < state.seats.length;
          if (into) count(ctx, major ? 'unitNew:other' : 'minorAi:unitNew', 'fallback', d.player, `${d.into} ${into.type} upgraded from ${d.unit} within the turn: the engine made none`);
          else count(ctx, 'upgrade', 'refused', d.player);
          break;
        }
        // the unit stood where the game added its upgrade, with moves to
        // spend (the order needs them); the record's steps before it are the
        // replay's, outside the engine's turn
        if (r) u.tileIndex = r.y * ctx.W + r.x;
        if (u.movesLeft <= 0) u.movesLeft = grantedMoves(state, u);
        // a city-state's upgrade is its AI's, through the minor's own verb
        const minor = isCityStateSeat(u.seat) ? state.cityStates.find((c) => c.seat === u.seat) : undefined;
        // bought through its economic AI (0x68c940), as its trees buy it
        if (minor?.economy) upgradePurchase(minor.economy, MINOR_UPGRADE_GOLD * FX);
        const res = minor ? (minorUpgradeUnit(state, minor, u) ? { ok: true } : { ok: false, reason: `the minor may not upgrade ${u.type}->${minorUpgradeType(minor, u.type)} (gold ${r3(minor.treasury)}, plot seat ${tileSeat(state.map.tiles[u.tileIndex])}, techs ${minor.research.techs.join('|')})` })
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
        // a formation's carried promotion: the absorbed veteran's, held at
        // its level, no pick and no heal
        if (d.formed && k >= 0) {
          u.promos = (u.promos ?? 0) | (1 << k);
          u.level = Math.max(u.level ?? 1, promoCount(u) + 1);
          count(ctx, 'promote', 'applied', d.player);
          break;
        }
        // a city-state's pick is its tactical AI's (`aiPromotionPick`, its
        // Promotion move run on the copy beside the record): scored here
        if (isCityStateSeat(u.seat)) {
          const ours = aiPromotionPick(u);
          count(ctx, 'minorAi:promote', ours === k ? 'applied' : 'fallback', d.player, `the AI's ${unitPromoRows(u)[ours]?.id ?? 'none'}, the game's ${name}`);
        }
        if (k >= 0 && takePromotion(u, k)) { count(ctx, 'promote', 'applied', d.player); break; }
        if (k >= 0) {
          // the experience is kept through the promotion, as the engine's
          u.promos = (u.promos ?? 0) | (1 << k);
          u.level = (u.level ?? 1) + 1;
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
        if (done && isBarbSeat(u.seat)) ctx.barbPillaged.push({ plot: d.plot, was: [was[0], was[1]] });
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
        if (isBarbSeat(seatOfP(ctx, d.player))) ctx.barbSeized.push({ u: vic, was: { ...vic, tileIndex: d.plot } });
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
        const minorBattle = isBarbSeat(atk.seat) || minorAiSeat(atk.seat);
        for (const [u, at, key] of [[atk, d.from, d.attacker], [def, d.at, d.defender]] as const) {
          const snap = () => Object.assign(structuredClone(u), { tileIndex: at });
          if (isBarbSeat(atk.seat) && !ctx.barbBlows.has(u)) {
            ctx.barbBlows.set(u, isBarbSeat(u.seat) ? Object.assign(snap(), { tileIndex: barbStart(ctx, key, at) }) : snap());
          }
          if (minorBattle && !ctx.minorBlows.has(u)) ctx.minorBlows.set(u, { snap: snap(), key });
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
        // a barbarian strikes in its own turn, after its start took the
        // techs and civics the majors hold (`barbarianTechs`; 1127 t26:
        // China's Military Tradition at its start, the barbarians' Warrior
        // flanking at theirs)
        if (isBarbSeat(atk.seat)) barbarianTechs(state);
        const restore = standAtBlow(ctx, d.ord, [atk, def]);
        state.rngState = s0;
        const hp0 = [atk.hp, def.hp];
        if (TRACE.has('battleHp')) (globalThis as { __cbLog?: string[] }).__cbLog = [battleTerms(state, atk, def)];
        // the battle draws where the log drew it, the hold standing aside
        ctx.stream.placed(true);
        const r = d.ranged ? rangedAttack(state, atk.id, d.at) : meleeAttack(state, atk.id, d.at, atk.seat);
        ctx.stream.placed(false);
        const stood = state.units.includes(atk) ? { ...atk } : undefined;
        restore();
        if (TRACE.has('battleHp')) console.error(`t${traceTurn} battle ${d.attacker} ${atk.type} ${hp0[0]}->${atk.hp} vs ${d.defender} ${def.type} ${hp0[1]}->${def.hp} ${d.ranged ? 'ranged' : 'melee'} seq${d.seq} game[${d.dmg}] ours[${hp0[1] - def.hp},${hp0[0] - atk.hp}] ${r.ok ? '' : r.reason} ${((globalThis as { __cbLog?: string[] }).__cbLog ?? []).join(' | ')}`);
        if (!r.ok) { count(ctx, 'battle', 'refused', d.player, r.reason); break; }
        ctx.battled.add(d.attacker);
        ctx.battled.add(d.defender);
        for (const k of [d.attacker, d.defender]) if (!state.units.includes(ctx.units.get(k)!)) ctx.engineKilled.add(k);
        if (stood && minorAiSeat(def.seat) && ctx.playerOfSeat.get(atk.seat)! > ctx.playerOfSeat.get(def.seat)!) {
          ctx.lateBlows.push({ seat: def.seat, attacker: stood });
        }
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
  if (drawing !== undefined) streams.set(drawing, state.rngState);
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
 *  same seat and type, nearest first; a record unit a pending upgrade order
 *  makes is the upgraded unit's, never another's (runs/h1_duelw1127 t94:
 *  Mexico City's Archer upgraded to a Crossbowman, which the Crossbowman the
 *  engine's City Defense bought must not stand for) */
function matchNewUnits(ctx: Ctx, b: TurnRecord): void {
  const mapped = new Set([...ctx.units.values()]);
  const free = ctx.state.units.filter((u) => !mapped.has(u));
  for (const r of b.units) {
    const key = `${r.owner}:${r.id}`;
    if (unitOf(ctx, key) || ctx.upgradeInto.has(key)) continue;
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
 *  Rome's Warrior 327683, undug at t13, struck twice by barbarians at +0).
 *  A unit that moved in the pair lost its fortification at its first step:
 *  a blow before that step in the log still finds it dug in (`undug`,
 *  `dugIn`; runs/h1_duelw1117 t76: barbarian Warrior 3211267, two turns dug
 *  in at 38:14, took Xi'an's shot and a Heavy Chariot's blow at +9 and +6
 *  before its own turn's move to 37:14). */
function fortifyOrders(ctx: Ctx, a: TurnRecord, b: TurnRecord): void {
  const held = new Set(b.units.map((r) => `${r.owner}:${r.id}`));
  const stepped = new Map<string, number>();
  const rows = (b as { actions?: unknown }).actions;
  if (Array.isArray(rows)) {
    for (const x of rows as unknown[][]) {
      const k = `${x[3]}:${x[4]}`;
      if (x[2] === 'UnitMoved' && !stepped.has(k)) stepped.set(k, x[0] as number);
    }
  }
  ctx.undug = new Map();
  for (const r of b.units) {
    const key = `${r.owner}:${r.id}`;
    const u = unitOf(ctx, key);
    if (!u || num(r.fortify) > 0 || !(u.fortifyTurns ?? 0)) continue;
    const ord = stepped.get(key);
    if (ord !== undefined) ctx.undug.set(key, { ord, turns: u.fortifyTurns ?? 0 });
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

/** what a unit's turn-end heal reads of its plot: its owner and whether it
 *  is a city's centre */
function healPlot(state: GameState, u: Unit): string {
  const t = state.map.tiles[u.tileIndex];
  return `${tileSeat(t)}:${t.district === 'CITY_CENTER' ? 1 : 0}`;
}

/** the record's key of an engine unit, '' for none */
function unitKeyOf(ctx: Ctx, u: Unit): string {
  for (const [k, x] of ctx.units) if (x === u) return k;
  return '';
}

/** every unit of the record (of player `only`) on its record plot with the
 *  record's moves; `keepMoves`: a unit the record holds where the engine
 *  left it keeps the engine's moves, which its rest reads */
function syncUnits(ctx: Ctx, b: TurnRecord, only?: number, keepMoves = false): void {
  for (const r of b.units) {
    if (only !== undefined && r.owner !== only) continue;
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u) continue;
    const at = r.y * ctx.W + r.x;
    const key = `${r.owner}:${r.id}`;
    const moved = u.tileIndex !== at;
    if (moved) {
      count(ctx, 'move', 'applied');
      // a unit that moved spent its moves and holds no fortification
      // (runs/h1_duelw1117 t3: the barbarian Scout that walked to (12,10)
      // took 38 from China's... city-state Warrior at +10, unfortified)
      u.fortifyTurns = 0;
    }
    // the unit sees from every plot the log's steps entered, and from where
    // it stopped — a unit a battle of the pair already stood at its plot
    // walked them all the same (runs/h1_duelw1127 t10: China's Scout steps
    // to (14,3), where a barbarian strikes it); a barbarian's looks wait for
    // its player's turn, whose planning reads the plots revealed before its
    // moves (its steps kept)
    if (moved || (ctx.paths.get(key)?.length && !ctx.walked.has(key))) {
      ctx.walked.add(key);
      const steps = [...(ctx.paths.get(key) ?? []), at];
      if (!isBarbSeat(u.seat)) for (const p of steps) revealAround(ctx.state, u.seat, p, unitSight(u, ctx.state), { seeThrough: unitSeesThrough(u) });
      if (isBarbSeat(u.seat)) ctx.barbSteps.push({ u, plots: steps });
    }
    u.tileIndex = at;
    if (!keepMoves || moved) u.movesLeft = num(r.moves) * MP_SCALE;
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
    // a city the pair's actions founded (after the engine's turn): its pick
    // scored from its next turn
    if (!ctx.prev.cities.some((x) => x.y * ctx.W + x.x === cs.centerIndex)) continue;
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
    score(ctx, 'cityState.build', b.turn - 1, ctx.playerOfSeat.get(cs.seat), `p${ctx.playerOfSeat.get(cs.seat)} ${cs.name}`, ours === record, ours || 'none', record || 'none');
    if (ours === record) {
      tally.same += 1;
      k.same += 1;
    } else {
      tally.first ??= { turn: b.turn, player: ctx.playerOfSeat.get(cs.seat) ?? -1, ours, record };
      if (tally.samples.length < 60) tally.samples.push(`t${b.turn} p${ctx.playerOfSeat.get(cs.seat)} ${ours || "none"} / ${record || "none"} (progress ${Math.round(cs.prodProgress ?? 0)})`);
    }
  }
}

/** THE FREE CITIES' BUILDS: each Free City's queue head after its turn (its
 *  city AI's pick) against record t+1's as the importer reads it; nothing
 *  imposed */
function freeBuilds(ctx: Ctx, b: TurnRecord): void {
  for (const c of ctx.state.freeSeat?.cities ?? []) {
    const r = ctx.next.state.freeSeat?.cities.find((x) => x.centerIndex === c.centerIndex);
    if (!r) continue;
    const ours = c.queue[0] ? itemKey(c.queue[0]) : 'none';
    const game = r.queue[0] ? itemKey(r.queue[0]) : 'none';
    score(ctx, 'freeCities.build', b.turn - 1, ctx.playerOfSeat.get(FREE_SEAT), recordCityName(ctx, FREE_SEAT, c.id), ours === game, ours, game);
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
function undoMinorPlots(ctx: Ctx, before: (string | null)[], charges: Map<Unit, number>, events: ReadonlySet<number>): void {
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
    // one the turn's change made is its event's, not a Builder's
    // (runs/h1_duelu1124 t82: Cardiff's three Farms on 539, 582 and 627 gone
    // in the engine's turn change, standing in record t+1)
    if (events.has(t.index)) count(ctx, 'draw:eventImprove', 'fallback', ctx.playerOfSeat.get(t.ownerSeat), `plot ${t.index}: the engine's event left ${was}, the game ${t.improvement}`);
    else count(ctx, 'minorAi:improve', 'fallback', ctx.playerOfSeat.get(t.ownerSeat), `plot ${t.index}: the engine laid ${was}, the game ${t.improvement}`);
    if (was) refund(t.index);
    replaceOwnerCitizens(state, t);
  }
}

/** an improvement the replay lays or undoes in a city-state's plot
 *  re-places that city-state's citizens, as its own laying does
 *  (`minorBuilderLays`) */
function replaceOwnerCitizens(state: GameState, t: Tile): void {
  const owner = state.cityStates.find((c) => c.seat === t.ownerSeat);
  if (owner) minorReplaceCitizens(state, owner);
}

/** THE DEDICATIONS are each player's pick at its age's start, which the
 *  engines' own round robin stands in for: each seat commits the ones record
 *  t+1 shows through the engine's verb (`commitDedications`; runs/
 *  h1_duelw1117 Rome's Dark Age from t31 holds none, where the round robin's
 *  paid +1 on a boost at t35); a set the verb refuses is the record's.
 *  `seats`: the players whose turn opens, picking before their actions where
 *  the age already offers a set the record shows (runs/h1_duelw1124 t31: China takes Free
 *  Inquiry, then its turn's Eureka pays +1); the pair's end takes every seat */
function syncDedications(ctx: Ctx, seats?: ReadonlySet<number>): void {
  ctx.state.seats.forEach((s, seat) => {
    if (seats && !seats.has(seat)) return;
    const want = seatOf(ctx.next.state, seat)?.dedicationPicks ?? [];
    if ((s.dedicationPicks ?? []).join() === want.join() || (seats && !want.length)) return;
    const res = commitDedications(ctx.state, seat, want);
    if (res.ok) return void count(ctx, 'dedications', 'applied');
    if (seats) return;
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
  'draw:eventImprove': PLOT_SUBS,
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
  /** the research AI's choices, the city-states' and the Free Cities' (`ResearchAiTally`) */
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
  /** the minors' and the barbarians' operations beside the game's operation log */
  operations?: OperationsTally;
  /** the AI's decisions one by one against the game's, by decision kind
   *  (`aiScore.ts`) */
  scores: DecisionScores;
  /** the AI's memory against the game's logs, per memory kind: the
   *  player-turns compared, those equal (`aiMemory.ts`) */
  memory: DecisionScores;
  /** the pairs started from the record's world, the AI's memory carried
   *  (`aiScore`) */
  perTurnWorld?: boolean;
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
    // a unit's Pillage rows that a later move of its turn follows name a
    // target it did not take (0x77a810 logs each target it weighs): its move
    // is the later row's
    const cur = t.get(id);
    if (!cur || (/^Pillage /.test(cur.move) && !/^Pillage /.test(f[2]) && f[2] !== 'HL: End Turn')) {
      t.set(id, { move: f[2], extra: f.slice(6).join(", ") });
    }
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

/**
 * THE AI'S MEMORY: what the AI keeps across turns that no record holds,
 * carried from our own turn into the next pair's world (`perTurnWorld`).
 * Per seat (the majors', the city-states', the Free Cities', the
 * barbarians'): the unit pool, the knowledge base (army records and their
 * ageing, the camps), the Combat Desire, the city AI (events' slots, trees,
 * contracts, reservations), the operation manager and its next id, the
 * strength its turn start stored. Per research: the research AI's goal, its
 * analyses, its turns left, the civics AI's government values and best cards,
 * the minors' catch-up counts. Per city-state: its city AI's item value, its
 * Food focus, trade list and value, UNITS table, resource counts, economic
 * memory (savings), threat, enemy at the gates, growth forecast, revealed
 * plots, standing army's lack, "Upgrade Units" trees. Per Free City: its threat, enemy at the gates
 * and raid. Per unit: its id, its pool slot, its DEFENDER type. The
 * barbarians' tribes (their clocks, raids, scouts' trees), unit pool, camp
 * step's start and scout throttle. The non-majors' explored plots.
 */
const SEAT_MEMORY = ['unitPool', 'armyKnown', 'armyAged', 'combatDesire', 'campsKnown', 'cityAi', 'ops', 'opsNext', 'treeSlots', 'treeFree', 'unitStrength'] as const;
const RESEARCH_MEMORY = ['goal', 'aiEntries', 'civicAiEntries', 'civicGovValues', 'civicPolicyBest', 'aiLeft', 'aiLeftSeen',
  'techCatchUp', 'civicCatchUp'] as const;
const MINOR_MEMORY = ['prodSetValue', 'favoredFood', 'tradeCities', 'tradeRejected', 'tradeValue', 'unitValues', 'resourceCounts',
  'economy', 'threat', 'threatNear', 'aiGrowth', 'revealed', 'standingArmyShort', 'explored', 'upgrading', 'upgradeTrigger'] as const;
const CITY_MEMORY = ['aiThreat', 'aiThreatNear', 'freeRaid'] as const;
const UNIT_MEMORY = ['slot', 'aiDefender'] as const;
const GAME_MEMORY = ['barbTribes', 'barbPool', 'barbCampsBegun', 'barbSpotNext'] as const;
/** THE RULES' STORES NO RECORD SHOWS, carried the same way: the research
 *  and culture overflow a completion left for the next turn's yield
 *  (runs/h1_duelw1121 Hunza t7: Pottery's 1.5 over, Astrology 7 turns as
 *  logged), the barbarian kills a boost counts, the wars' clocks; a
 *  city-state's production overflow, its powered project and repair waits,
 *  its fuel shortfall, its strategic stockpile and the queue front's
 *  reservation on it (the importer reads a minor's none), the trade routes the record's routes laid (the
 *  importer reads a city-state's none), the turn its city was founded */
const GAME_STORES = ['warTurns'] as const;
const SEAT_STORES = ['barbKills'] as const;
const RESEARCH_STORES = ['techOverflow', 'civicOverflow'] as const;
const MINOR_STORES = ['prodOverflow', 'fullyPowered', 'repairWait', 'fuelShort', 'tradeRoutes', 'foundedTurn', 'stockpile', 'prodReserved'] as const;

/** the named fields of `from` onto `to`, a field `from` lacks dropped */
function carryFields(from: object, to: object, keys: readonly string[]): void {
  const f = from as Record<string, unknown>;
  const t = to as Record<string, unknown>;
  for (const k of keys) {
    if (f[k] === undefined) delete t[k];
    else t[k] = f[k];
  }
}

/** each seat starts on the plots the record says it revealed
 *  (`TurnRecord.revealed`), else on what its own plots, cities and units
 *  reveal (`initFog`); the players' handicaps; the moments the history
 *  holds */
function importedWorld(state: GameState, imp: Imported, rec: TurnRecord, history: History): void {
  const read = state.seats.map((s) => s.explored);
  initFog(state);
  state.seats.forEach((s, i) => { if (read[i]?.length) s.explored = read[i]; });
  for (const p of rec.players) {
    const seat = imp.seatOfPlayer.get(p.id);
    if (seat !== undefined && state.seats[seat]) state.seats[seat].handicap = LAB_HANDICAP;
  }
  seedMoments(state, imp, history);
}

/** a contract the game's city queued in the turn `turn` the record's item
 *  stands for (AI_CityBuild.csv's queue line: its item and tree): the
 *  city-state's own contract of that item and tree, accepted and not
 *  queued, is queued as the game's was — IN PROGRESS, bound to the city, in
 *  hand at its value, its
 *  completion connected (runs/h1_duelw1117 Antananarivo t15: contract 44's
 *  Builder queued, COMPLETED at t19) */
function bindQueuedContracts(ctx: Ctx, cs: CityState, imp: Imported, turn: number): void {
  const ai = cs.cityAi;
  const pid = imp.playerOfSeat.get(cs.seat);
  if (!ai || pid === undefined) return;
  for (const q of ctx.memoryLogs.queued.get(`${turn}:${pid}`) ?? []) {
    const c = ai.contracts.find((x) => !x.queued && x.progress === CP_ACCEPTED
      && `${x.unit ?? x.building ?? x.district ?? ''}|${x.treeName}` === q);
    if (!c) continue;
    c.progress = CP_IN_PROGRESS;
    c.queued = true;
    c.city = minorCity(cs).id;
    ai.inHand[c.city] = c.id;
    cs.prodSetValue = c.value;
  }
}

/**
 * THE PAIR'S WORLD IS THE RECORD'S (`--aiscore`): record t as the importer
 * read it (`imp`, the import the pair before compared with) replaces the
 * engine's state, and the AI's memory (`SEAT_MEMORY` ...) comes over from
 * the engine's own last turn. A unit the record and the engine both hold
 * keeps the engine's id (the memory names units by id) and its memory; the
 * others take fresh ids. The rules' stores no record shows (`SEAT_STORES`,
 * `RESEARCH_STORES`, `MINOR_STORES`) come over too. A Free City both hold keeps the engine's city id,
 * its plots and its grants with it. The replay's own carry-overs of the
 * world (the production banked on items switched away from) start empty.
 */
/**
 * The game's knowledge bases at the end look of `turn` (`GameMemory`) onto
 * the pair's world: per minor, Free Cities and barbarian seat its army
 * records — each the unit the record holds under that game id (its engine
 * id), else a fresh id; its owner's seat, its engine type, its plot, seen
 * at `turn` less its age (the records aged at `turn`), its damage the
 * record's second int (+0x4: runs/h1_duely1127 t2, the barbarian Scout 46 and
 * city-state 4's Warrior 26 as record t3 holds them) —, its camps in the game's order and
 * its contracts' progress, value and times (`syncContracts`).
 */
function importGameKnowledge(ctx: Ctx, world: GameState, imp: Imported, turn: number): GameSpawnChange[] {
  const spawns: GameSpawnChange[] = [];
  let fresh = -1;
  for (const s of [...world.cityStates, ...(world.freeSeat ? [world.freeSeat] : []), world.barbSeat]) {
    const pid = imp.playerOfSeat.get(s.seat);
    const read = pid === undefined ? undefined : ctx.gameMemory!.at('endlook', turn, pid);
    if (!read) continue;
    const recs: ArmyRecord[] = [];
    for (const [owner, per] of Object.entries(read.army ?? {})) {
      const seat = imp.seatOfPlayer.get(Number(owner));
      if (seat === undefined) continue;
      for (const [t, rows] of Object.entries(per)) {
        const type = engineRowOf(ctx.cat, 'unit', Number(t));
        if (!type) continue;
        for (const r of rows) {
          const u = ctx.units.get(`${owner}:${r[0]}`);
          recs.push({ id: u ? u.id : fresh--, owner: seat, type, seen: turn - r[3], plot: r[5] * ctx.W + r[4], damage: r[1] });
        }
      }
    }
    if (recs.length) s.armyKnown = recs;
    else delete s.armyKnown;
    s.armyAged = turn;
    const camps = (read.camps ?? []).map((c) => c[1] * ctx.W + c[0]);
    if (camps.length) s.campsKnown = camps;
    else delete s.campsKnown;
    // the operations (`importOps`: a city-state's whole, the barbarians' and
    // the Free Cities' those both hold); a city-state's city AI whole — its
    // city trees, every tree's contracts and the holders (`importCityAi`);
    // another seat's contracts take the game's progress, value and times
    // (`syncContracts`)
    const w = { names: ctx.cat, W: ctx.W, unitOf: (gameId: number) => ctx.units.get(`${pid}:${gameId}`)?.id, turnShift: s === world.barbSeat ? 1 : 0 };
    const cityState = world.cityStates.includes(s as CityState);
    const nodes = Object.values(read.trees ?? {}).some((t) => t.nodes?.[0]?.[4]);
    const ops = nodes && s.ops ? importOps(s.ops, read, w, turn, cityState).ids : new Map<number, number>();
    if (cityState && nodes) importCityAi(s as CityState, read, w, ops);
    else syncContracts(ctx.gameMemory!, ctx.cat, s, pid!, turn, ctx.W);
    if (s === world.barbSeat) spawns.push(...gameSpawnChanges(read, ops));
  }
  return spawns;
}

function perTurnWorld(ctx: Ctx, a: TurnRecord, imp: Imported, history: History, fromLog: boolean, fromAimem: boolean): void {
  const { state } = ctx;
  const world = deserialize(serialize(imp.state));
  const live = new Set(state.units);
  const was = new Map(ctx.units);
  ctx.units = new Map();
  const kept = new Set<Unit>();
  let k = 0;
  for (const r of a.units) {
    if (!imp.seatOfPlayer.has(r.owner) || !engineRowOf(ctx.cat, 'unit', r.type)) continue;
    const u = world.units[k++];
    const key = `${r.owner}:${r.id}`;
    const old = was.get(key);
    // the record's unit keeps its id where the engine's battle killed it and
    // the game's did not: the knowledge bases' records of it are its own
    // (runs/h1_dueldA1117 t50: China's Scout 983049 falls on our blow, 58
    // damage to the game's 53, and stands on in record t+1)
    if (old && old.seat === u.seat) {
      u.id = old.id;
      if (live.has(old)) carryFields(old, u, UNIT_MEMORY);
      kept.add(u);
    }
    ctx.units.set(key, u);
  }
  let nextId = state.nextUnitId;
  for (const u of world.units) if (!kept.has(u)) u.id = nextId++;
  world.nextUnitId = nextId;
  const seatPair = (from: Seat, to: Seat, minor: boolean) => {
    carryFields(from, to, [...SEAT_MEMORY, ...SEAT_STORES]);
    carryFields(from.research, to.research, [...RESEARCH_MEMORY, ...RESEARCH_STORES]);
    if (minor) carryFields(from, to, [...MINOR_MEMORY, ...MINOR_STORES]);
    for (const c of to.cities ?? []) {
      const o = from.cities?.find((x) => x.centerIndex === c.centerIndex);
      if (o) carryFields(o, c, CITY_MEMORY);
    }
  };
  world.seats.forEach((s, i) => { if (state.seats[i]) seatPair(state.seats[i], s, false); });
  for (const cs of world.cityStates) {
    const o = state.cityStates.find((x) => x.id === cs.id);
    if (o) seatPair(o, cs, true);
    bindQueuedContracts(ctx, cs, imp, a.turn - 1);
  }
  seatPair(state.barbSeat, world.barbSeat, true);
  if (world.freeSeat && state.freeSeat) {
    const free = world.freeSeat;
    const idOf = new Map<number, number>();
    let nextCity = Math.max(state.freeSeat.nextCityId, free.nextCityId);
    for (const c of free.cities) idOf.set(c.id, state.freeSeat.cities.find((x) => x.centerIndex === c.centerIndex)?.id ?? nextCity++);
    for (const c of free.cities) c.id = idOf.get(c.id)!;
    free.nextCityId = nextCity;
    for (const t of world.map.tiles) if (t.ownerSeat === FREE_SEAT && idOf.has(t.ownerCity)) t.ownerCity = idOf.get(t.ownerCity)!;
    for (const u of world.units) if (u.freeCity !== undefined && idOf.has(u.freeCity)) u.freeCity = idOf.get(u.freeCity)!;
    seatPair(state.freeSeat, free, true);
  }
  // the memory the game's logs hold whole taken from them instead: the
  // knowledge bases' camps as the turn before ended (`--memory log`)
  if (fromLog) {
    for (const s of [...world.cityStates, ...(world.freeSeat ? [world.freeSeat] : []), world.barbSeat]) {
      const pid = imp.playerOfSeat.get(s.seat);
      const camps = pid === undefined ? undefined : ctx.memoryLogs.camps.get(`${a.turn - 1}:${pid}`);
      const plots = (camps ?? []).map((xy) => { const [x, y] = xy.split(':').map(Number); return y * ctx.W + x; });
      if (plots.length) s.campsKnown = plots;
      else delete s.campsKnown;
    }
  }
  // the game's own memory instead (`--memory aimem`): each minor's and the
  // barbarians' knowledge base — the army records and the camps — as its
  // end look of the turn before left them (`<stem>.aimem.jsonl`)
  const spawns = fromAimem && ctx.gameMemory ? importGameKnowledge(ctx, world, imp, a.turn - 1) : [];
  carryFields(state, world, [...GAME_MEMORY, ...GAME_STORES]);
  // ...and the spawn changes its raids' trees executed, on the tribe each
  // raid runs for (`gameSpawnChanges`)
  for (const sp of spawns) {
    const k = (world.barbTribes ?? []).findIndex((tr) => tr.op?.id === sp.op);
    if (k >= 0) barbSpawnChange(world, k, sp.rate, sp.raiding);
  }
  for (const key of Object.keys(state)) if (!(key in world)) delete (state as unknown as Record<string, unknown>)[key];
  Object.assign(state, world);
  importedWorld(state, imp, a, history);
  ctx.retained = new Map();
}

export function runReplay(dumpPath: string, opts: { from?: number; to?: number; source?: ActionSource;
  /** each pair from the record's world, the AI's memory carried
   *  (`perTurnWorld`): the AI scored turn by turn */
  aiScore?: boolean;
  /** with `aiScore`, the memory the game's logs hold whole (the knowledge
   *  bases' camps) taken from them each pair instead of carried */
  memoryFromLog?: boolean;
  /** with `aiScore`, the game's own knowledge bases (army records, camps) and contracts
   *  taken each pair from `<stem>.aimem.jsonl` instead of carried */
  memoryFromAimem?: boolean;
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
    researchAi: { minor: newResearchTally(), free: newResearchTally() },
    researchScores: { minor: { rows: 0, turns: 0, score: 0 }, free: { rows: 0, turns: 0, score: 0 } },
    civicAi: { minor: newResearchTally(), free: newResearchTally() },
    civicScores: { minor: { rows: 0, turns: 0, score: 0 }, free: { rows: 0, turns: 0, score: 0 } }, barbTactics: {},
    minorTactics: {}, minorDraws: { turns: 0, paired: 0, draws: 0, sameRange: 0 }, minorBuilds: { turns: 0, same: 0, byKind: {}, samples: [] }, minorResearch: { rows: [], majors: [], food: [] },
    scores: newScores(), memory: newScores(), ...(opts.aiScore ? { perTurnWorld: true } : {}) };
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
  // the city-states' own purchases of the pair, each with its price
  // each purchase with the economic AI's savings as it bought (its spend
  // follows the purchase, on the city's threat)
  const minorBought = new Map<Unit, { cityState: CityState; price: number; savings?: number[]; threatened: boolean }>();
  const buyTrace: Ctx['buyTrace'] = (cityState, u, price) => minorBought.set(u, {
    cityState, price, savings: cityState.economy ? [...cityState.economy.savings] : undefined, threatened: (cityState.threat ?? -1) > -1,
  });
  traceMinorPurchases(buyTrace);
  const state = first.state;
  importedWorld(state, first, recs[0], history);
  // the city-states' city AI ran on the game's turns before the import's:
  // its first look ran no events (none contracted), its savings took the
  // treasury; it stands as that turn left it
  if (state.turn > 1) {
    for (const cs of state.cityStates) {
      if (cs.centerIndex < 0) continue;
      cs.cityAi = newCityAi();
      cs.economy = newEconomicMemory();
      savingsTurn(cs.economy, Math.trunc(cs.treasury * FX), minorGreatPersonClass(state));
    }
  }
  // their knowledge bases hold the look of the import's turn, which their
  // military AI reads on the next
  for (const cs of state.cityStates) if (cs.centerIndex >= 0) minorKnowledge(state, cs, false);
  // the majors: every major seat the record's first turn names
  const majorSeats = new Map<number, number>();
  for (const p of recs[0].players) {
    const seat = first.seatOfPlayer.get(p.id);
    if (seat === undefined || seat >= state.seats.length) continue;
    majorSeats.set(p.id, seat);
  }
  const missions = readMissions(dumpPath);
  // the operations of every AI party with a manager: the city-states and
  // the Free Cities
  const opsSeats = new Map([...first.minorOfPlayer].map(([player, cs]) => [cs.seat, player] as [number, number]));
  const freePlayer = first.playerOfSeat.get(FREE_SEAT);
  if (freePlayer !== undefined) opsSeats.set(FREE_SEAT, freePlayer);
  const operations = new OperationsProbe(dumpPath, opsSeats, first.seatOfPlayer);
  const govtLog = loadAiCivicLog(dumpPath);
  const ctx: Ctx = {
    state, cat, W: recs[0].head.W, seatOfPlayer: first.seatOfPlayer, playerOfSeat: first.playerOfSeat,
    units: new Map(), retained: new Map(), pendingMinors: new Map(), next: first, tally: new Map(), fellBack: new Map(), imposed: new Map(), reasons: new Map(),
    engineKilled: new Set(), routeSpent: new Map(), paths: new Map(), walked: new Set(), steps: new Map(), barbBlows: new Map(), barbSeized: [], minorBlows: new Map(), minorBuys: [], minorImproves: [], minorClears: [], minorClearUnits: [], minorUnits: [], minorGround: [], buyTrace, lateBlows: [], upgradeInto: new Set(), barbSteps: [], barbPillaged: [], envoys: [], battled: new Set(), fortified: new Map(), undug: new Map(), streams: new Map(), applied: new Set(), barbNew: [], lateEnvoys: [], log: history.randLog, stream, prev: recs[0],
    researchAi: report.researchAi, researchScores: report.researchScores, researchBefore: new Map(), aiResearchLog: loadAiResearchLog(dumpPath),
    tactical: loadTactical(dumpPath), barbTally: report.barbTactics, minorTally: report.minorTactics, minorDraws: report.minorDraws,
    civicAi: report.civicAi, civicScores: report.civicScores, civicBefore: new Map(), aiCivicLog: govtLog.civics, aiPolicyLog: govtLog.policies,
    scores: report.scores, turn: recs[0].turn, memoryLogs: new MemoryLogs(dumpPath), gameMemory: GameMemory.of(dumpPath), armyLogged: new Map(), minorLookTypes: new Map(),
    // a game from its first turn opens on no memory, the game's as well
    memoryClean: new Map([...first.playerOfSeat].filter(([seat]) => minorAiSeat(seat) || isBarbSeat(seat)).map(([, p]) => [p, recs[0].turn <= 1] as const)),
    cityBuildLog: loadCityBuildTables(dumpPath), cityBuild: newCityBuildTally(), cityBuildPer: new Map(),
    operations, minorOps: new Map(),
  };
  // the city-states' operation lines, gathered over the pair: their
  // military AI's turn in the engine's turn, their run in their units' turn
  // (`minorAi`)
  traceMinorOps((seat, line, candidate) => {
    let e = ctx.minorOps.get(seat);
    if (!e) ctx.minorOps.set(seat, (e = { lines: [], evals: [] }));
    (candidate ? e.evals : e.lines).push(line);
  });
  // each knowledge base as its tactical turn's ageing and look leave it, the
  // moment the game writes its ARMY lines
  traceKnowledge(armyLog(ctx));
  // the operations each AI party started, against the log's
  operations.onStarts = (turn, player, log, ours) => {
    const seat = ctx.seatOfPlayer.get(player) ?? NO_SEAT;
    const party = isCityStateSeat(seat) ? 'cityState' : seat === FREE_SEAT ? 'freeCities' : 'barbarians';
    const same = log.length === ours.length && log.every((l, k) => l === ours[k]);
    score(ctx, `op.start.${party}`, turn, player, `p${player}`, same, ours.join('; ') || 'none', log.join('; ') || 'none');
  };
  // the minors' policy scores of their civics AI's turn, against the log's
  traceMinorPolicyScores((seat, scores) => {
    const player = ctx.playerOfSeat.get(seat);
    if (player !== undefined) policyScoreAgainstLog(ctx, seat === FREE_SEAT ? 'free' : 'minor', ctx.turn, player, scores);
  });
  // ...and the Free Cities': their raid's start in the pair's actions, its
  // run in their units' turn
  traceFreeOps((line) => {
    let e = ctx.minorOps.get(FREE_SEAT);
    if (!e) ctx.minorOps.set(FREE_SEAT, (e = { lines: [], evals: [] }));
    e.lines.push(line);
  });
  // a feature or resource a city-state's Builder would clear that record
  // t+1 still holds stands: the game's Builder kept it (`minorAi:clear`);
  // one it cleared goes unpaid in the copy's turn, the record's clearing's
  // lump landing after it (`minorClearsAfter`)
  holdMinorClears((plot, clears) => {
    const r = ctx.next.state.map.tiles[plot];
    if (!(clears === 'feature' ? r.feature : r.resource)) return 'unpaid';
    count(ctx, 'minorAi:clear', 'fallback', ctx.playerOfSeat.get(ctx.state.map.tiles[plot].ownerSeat),
      `plot ${plot}: the engine cleared its ${clears}, the game kept it`);
    return 'kept';
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
  for (let i = 0; i + 1 < recs.length; i++) {
    const a = recs[i];
    const b = recs[i + 1];
    if (b.turn !== a.turn + 1) {
      report.stopped = `no record of turn ${a.turn + 1}`;
      break;
    }
    if (opts.aiScore && i > 0) perTurnWorld(ctx, a, ctx.next, history, opts.memoryFromLog ?? false, opts.memoryFromAimem ?? false);
    if (state.turn !== a.turn) {
      report.stopped = `engine at turn ${state.turn}, record at ${a.turn}`;
      break;
    }
    ctx.turn = a.turn;
    // the city-states' revealed plots as the turn opens, which their units'
    // planning reads (runs/h1_duely1117 t2: Valletta's Warrior on 13:8
    // closes 11:10, which the other Warrior's step to 12:9 reveals later in
    // the turn, as a plot never revealed, AI_Planning.csv)
    const revealedWas = new Map(state.cityStates.map((cs) => [cs.seat, cs.revealed?.slice()] as const));
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
    ctx.walked = new Set();
    ctx.steps = loggedSteps(b, ctx.W);
    ctx.barbBlows = new Map();
    ctx.barbSeized = [];
    ctx.minorBlows = new Map();
    ctx.minorBuys = [];
    ctx.minorImproves = [];
    ctx.lateBlows = [];
    ctx.barbNew = [];
    ctx.lateEnvoys = [];
    ctx.undug = new Map();
    ctx.streams = new Map();
    ctx.applied = new Set();
    minorBought.clear();
    traceTurn = b.turn;
    const holders = [...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : [])];
    ctx.researchBefore = new Map(holders.map((s) => [s.seat, s.research.tech]));
    ctx.civicBefore = new Map(holders.map((s) => [s.seat, s.research.civic]));
    const ds = source.decisions(a, b, cat);
    ctx.upgradeInto = new Set(ds.flatMap((d) => (d.kind === 'upgrade' ? [d.into] : [])));
    stream.actions(a.turn);
    syncDedications(ctx, new Set([seatOfP(ctx, activePlayer(a))]));
    applyPhase(ctx, ds, 'before', b, a);
    // the active player's units stand where its actions left them before its
    // next start (the engine's turn below): its moves reveal, and meet, there
    syncUnits(ctx, b, activePlayer(a));
    activeBoosts(ctx, b, activePlayer(a));
    stageEnvoys(ctx, ds, a, b, history.randLog);
    const staged = stagePolicies(ctx, ds);
    // the generator: held at each witnessed point (`streamHold`)
    const seed = turnSeed(b);
    const standing = new Set(state.units);
    ctx.standing = standing;
    ctx.routeSpent = new Map();
    // each city-state's routes as its turn opens: one its turn ends hands its
    // Trader back (`spawnUnit` at the route's origin), which the record holds
    // as the Trader it always was
    const routesBefore = new Map(state.cityStates.map((c) => [c.seat, [...(c.tradeRoutes ?? [])]] as const));
    const improvements = state.map.tiles.map((x) => x.improvement ?? null);
    // the plots whose improvement the turn's change (its random events, its
    // climate) took or laid: no Builder's
    const eventPlots = new Set<number>();
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
    // the majors that start and act after the active player within the
    // pair, before the city-states (their actions land inside the engine's
    // turn, `otherMajorsTurn`), and the blows struck outside their turns
    const activeP = activePlayer(a);
    const otherMajors = new Set([...majorSeats.keys()].filter((p) => p !== activeP));
    const struckLate = new Set(ds.flatMap((d) => (d.kind === 'battle' && !otherMajors.has(d.player) ? [d.defender] : [])));
    const fought =new Set(ds.flatMap((d) => (d.kind === 'combat' && !struckOnly.has(d.unit) ? [d.unit] : d.kind === 'battle' ? [d.attacker] : [])));
    const was = new Map(a.units.map((u) => [`${u.owner}:${u.id}`, u.y * ctx.W + u.x]));
    // where the record carries its log, a unit walked when the log names its
    // steps — a unit pushed off its plot (`UnitTeleported`) spent nothing
    // (runs/h1_duelw1118 Rome's Warrior, displaced at t17, healed 8)
    const logged = Array.isArray((b as { actions?: unknown }).actions);
    const walked = new Set(ds.flatMap((d) => (d.kind === 'move' && d.path ? [d.unit] : [])));
    // an upgrade spends the unit's turn: neither it nor what it became rests
    // (runs/h1_duelw1127 t34: China's Slinger at 47 HP upgrades to an Archer
    // and reads no heal, 53 + 31 damage at record t+1)
    const upgraded = new Set(ds.flatMap((d) => (d.kind === 'upgrade' ? [d.unit, d.into] : [])));
    const spent = new Map<Unit, { hp: number; fortify: number }>();
    const struckHp = new Map<Unit, number>();
    // whether each unit takes its moves into the turn's heal (`rested`, or a
    // minor's own)
    const movesKept = new Map<Unit, boolean>();
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
      const rested = stood && !fought.has(key) && !upgraded.has(key);
      // a city-state's or Free City's unit acts in the engine's turn, its own
      // AI's: it starts that turn on its moves (runs/h1_duelw1121 t8: Hunza's
      // Builder, its Farm laid at t7, walks to plot 275 on its moves), its
      // rest heal still the record's actions' (runs/h1_duelw1124 t10: city-
      // state 2's Warrior attacked the Spearman at 8:14 and fought it again
      // at t11 on 62 HP, unhealed)
      movesKept.set(u, rested || minorAiSeat(u.seat));
      u.movesLeft = movesKept.get(u) ? grantedMoves(state, u) : 0;
      if (!rested) spent.set(u, { hp: u.hp, fortify: u.fortifyTurns ?? 0 });
      else if (struckLate.has(key)) struckHp.set(u, u.hp);
      if (isBarbSeat(u.seat)) barbRest.set(u, stood && !struck.has(key) && num(r.fortify) > 0);
    }
    // THE BARBARIANS' TURN closes the pair (`barbarianTurn`), after the
    // other players' actions; their units' moves and battles are the
    // record's (`syncUnits`, `battle`), so they sit the engine's turn out:
    // the engine's AI would fight battles the record never fought
    // (runs/h1_duelw1117 t11: a Warrior China's engine killed that the
    // game's lived to t12). Through the other majors' and the city-states'
    // turns they stand where the pair's first record holds them (the minors'
    // look, threat and operations), out of the turn's close and heal. The
    // turn's change strikes the map their turn left: a unit record t+1 holds
    // stands its random events and climate where it holds it, and leaves the
    // engine's turn after them (runs/h1_duelw1121 t19: an eruption's damage
    // on a barbarian Spearman and Horse Archer).
    const barbs: Unit[] = [];
    const barbAt = new Map<Unit, number>();
    for (const r of b.units) {
      const u = unitOf(ctx, `${r.owner}:${r.id}`);
      if (u && isBarbSeat(u.seat)) barbAt.set(u, r.y * ctx.W + r.x);
    }
    const takeBarbs = () => {
      barbs.push(...state.units.filter((u) => isBarbSeat(u.seat)));
      state.units = state.units.filter((u) => !isBarbSeat(u.seat));
    };
    const tribesBefore = state.barbTribes?.length ?? 0;
    // THE CATCH-UP'S COUNT: the majors' research as the record holds it at
    // the city-states' starts — the majors' research is their decisions and
    // their economy, not the city-states', so the count reads the game's.
    // THE ACTIVE PLAYER'S START closes the engine's turn, after the
    // city-states' starts the record's pair holds (record t+1 is read in its
    // turn): theirs counts its research as record t holds it
    // (runs/h1_duelw1121: Rome's Code of Laws at its start of t4, every
    // minor's done at its own start of t4); every other major's start came
    // before theirs, its research as record t+1 holds it. What the active
    // player's actions of the turn completed (a boost) it holds at their
    // starts too: the engine's completions record t+1 confirms
    // (runs/h1_duelv1128 t20: Rome's Bronze Working boosted complete in its
    // turn, Bologna's done at its own start of t20)
    const active = state.seats[seatOfP(ctx, activeP)];
    holdMinorCatchUp(new Map(state.seats.map((s) => {
      const r = seatOf(s === active ? recordA.state : read.state, s.seat)?.research ?? s.research;
      if (s !== active) return [s.seat, { techs: [...r.techs], civics: [...r.civics] }] as const;
      const b = seatOf(read.state, s.seat)?.research;
      const done = (have: readonly string[], ours: readonly string[], next: readonly string[] | undefined) =>
        [...have, ...ours.filter((x) => !have.includes(x) && (next ?? []).includes(x))];
      return [s.seat, { techs: done(r.techs, s.research.techs, b?.techs), civics: done(r.civics, s.research.civics, b?.civics) }] as const;
    })));
    // ...and the game era it opens comes after every other player's start and
    // actions of the pair: their research prices read the era before
    // (runs/h1_duelw1121: Horseback Riding at 72 for the minors through their
    // turn 30, Rome's Wheel at 32 in its start of t31)
    const eraWas = state.gameEra ?? 0;
    holdResearchEra(new Map([...state.seats.filter((s) => s !== active).map((s) => s.seat), ...state.cityStates.map((c) => c.seat), FREE_SEAT]
      .map((seat) => [seat, eraWas] as const)));
    stream.actions(null);
    // the other majors' Favor is banked at the turn's change (`seatFavor`,
    // below), not at their start
    const others = state.seats.filter((s) => s !== active && isCiv(s.seat)).map((s) => s.seat);
    holdFavor((seat) => others.includes(seat));
    // THE OTHER MAJORS' ACTIONS, in their own turn after their start and
    // before the city-states' (record t+1 holds them taken)
    const otherMajorsTurn = () => {
      // the units their starts made, under the record's ids, and the units
      // the turn has lost so far
      matchNewUnits(ctx, b);
      syncDedications(ctx, new Set(others));
      const live = new Set(state.units);
      ctx.engineKilled = new Set([...ctx.units].filter(([, u]) => !live.has(u)).map(([k]) => k));
      // their missions of the turn, the record's
      applyMissions(ctx, missions.get(a.turn) ?? []);
      applyPhase(ctx, ds, 'after', b, b, otherMajors);
      // their units stand where their actions left them: their looks reveal
      // and meet in their turn (runs/h1_duelv1127: China meets Rome at t61,
      // DiplomacySummary.csv, the record of t62 the first to show it; 1117
      // t20: China's Scout gone from 41:12 by city-state 3's look)
      for (const p of otherMajors) syncUnits(ctx, b, p);
      // ...and the rivers their sight names there, which the city-states'
      // turns after read (runs/h1_duely1127 t28: the fourth river logged from
      // t29, Muscat's floodplain Farm on 747 laid in its turn of t28)
      nameRivers(state);
      // ...taking into the turn's heal the moves their actions spent
      for (const [u, kept] of movesKept) if (others.includes(u.seat)) u.movesLeft = kept ? grantedMoves(state, u) : 0;
      for (const seat of others) detectBoosts(state, seat);
    };
    // each unit's health before the engine's turn heals it, beside the plot
    // the heal reads (`healedOn`)
    const hpPre = new Map(state.units.map((u) => [u, u.hp]));
    // THE ENGINE'S TURN in the order the pair holds it: the other majors'
    // starts and actions of turn t, the city-states' and Free Cities' turns,
    // the barbarians' (sat out), the World Congress, the turn's close and
    // heal; the counter's change (the random events, the climate, the era);
    // the active player's start of t+1
    try {
      ctx.streams = new Map();
      seatPhase(state, { seats: new Set(others), deals: true });
      stream.actions(a.turn);
      otherMajorsTurn();
      // a levied unit the game makes anew on a plot its minor may not stand
      // on is added where the game jumps it, which the engine does not lay
      // (runs/h1_duelw1117 t42: China's levied Warrior on China's (33,12)
      // added to city-state 3 on (32,14), out of sight of China's Builder)
      for (const d of ds) {
        if (d.kind !== 'levyEnd') continue;
        for (const [from, , plot] of d.units) {
          const u = unitOf(ctx, from);
          if (!u || u.tileIndex === plot) continue;
          u.tileIndex = plot;
          count(ctx, 'levyEnd:jump', 'fallback', d.player, 'the engine jumps no re-made unit');
        }
      }
      // each city-state's turn opens with the city-states before it standing
      // where their turn left them, as the record holds them: the game runs
      // them one at a time (runs/h1_dueld1121 t40: Ayutthaya's Galley out of
      // Antioch's sight before Antioch's look, its record the game's age 1)
      // ...and without the units an earlier city-state's battles killed, the
      // record's battles landing after the minors' turns (runs/h1_dueld1127
      // t39: the barbarians' Slinger Hattusa killed on 7:10, out of Mexico's
      // look). Their moves stay the engine's where the record holds them on
      // the engine's plot: the turn's rest reads them, and a Fortify order
      // ends the game's Movement without spending the heal (runs/h1_duelw1117
      // t7: city-state 2's two Warriors fortify under Protect Units, record
      // t8 both healed 10 at Movement 0)
      const killedBy = new Map(ds.flatMap((d) => (d.kind === 'kill' && isCityStateSeat(seatOfP(ctx, d.player)) ? [[d.victimUnit, d.player] as const] : [])));
      // ...and without another player's units the log takes off the map before
      // its turn opens that record t+1 lost — a removal the log follows
      // with an addition on the unit's plot is a unit made anew (a free
      // upgrade, a levy), no loss (runs/h1_dueld1124 t212: China's seven units
      // removed in China's turn, none in Granada's records)
      const acts = (b as { actions?: unknown[][] }).actions ?? [];
      const heldAfter = new Set(b.units.map((x) => `${x.owner}:${x.id}`));
      const lastPlot = new Map<string, number>(ctx.prev.units.map((r) => [`${r.owner}:${r.id}`, r.y * ctx.W + r.x]));
      const opens = new Map<number, number>();
      const removed: { ord: number; key: string; owner: number }[] = [];
      for (let j = 0; j < acts.length; j++) {
        const x = acts[j];
        const key = `${x[3]}:${x[4]}`;
        if (x[2] === 'PlayerTurnActivated' && !opens.has(x[3] as number)) opens.set(x[3] as number, x[0] as number);
        if (x[2] === 'UnitMoved' || x[2] === 'UnitTeleported') lastPlot.set(key, (x[6] as number) * ctx.W + (x[5] as number));
        if (x[2] !== 'UnitRemovedFromMap' || heldAfter.has(key)) continue;
        const at = lastPlot.get(key);
        const remade = acts.slice(j + 1).some((y) => y[2] === 'UnitAddedToMap' && (y[6] as number) * ctx.W + (y[5] as number) === at);
        if (!remade) removed.push({ ord: x[0] as number, key, owner: x[3] as number });
      }
      const fallen: [Unit, number][] = [];
      let before: number | undefined;
      ctx.minorUnits = [];
      const ended = (player: number): void => {
        const seat = ctx.seatOfPlayer.get(player);
        ctx.minorUnits.push(...state.units.filter((u) => u.seat === seat).map((u) => structuredClone(u)));
        syncUnits(ctx, b, player, true);
        // ...its upgrades made in its turn, which no later look sees undone
        // (runs/h1_dueld1128 t41: Hong Kong's Warrior upgraded to a
        // Swordsman before Granada's turn, none of its records a Warrior)
        const ups = ds.filter((d) => d.kind === 'upgrade' && d.player === player);
        if (ups.length) {
          const rng = state.rngState;
          applyPhase(ctx, ups, 'after', b, b, new Set([player]));
          state.rngState = rng;
        }
      };
      holdMinorStart((_st, cs) => {
        if (before !== undefined) ended(before);
        before = ctx.playerOfSeat.get(cs.seat)!;
        for (const [key, killer] of killedBy) {
          const u = killer < before ? ctx.units.get(key) : undefined;
          const i = u ? state.units.indexOf(u) : -1;
          if (i < 0) continue;
          fallen.push([u!, i]);
          state.units.splice(i, 1);
        }
        const open = opens.get(before);
        for (const r of open === undefined ? [] : removed) {
          if (r.ord >= open! || r.owner === before) continue;
          const u = ctx.units.get(r.key);
          // a levied unit goes home on the engine's own levy clock, not lost
          if (u?.leviedFrom !== undefined) continue;
          const i = u ? state.units.indexOf(u) : -1;
          if (i < 0) continue;
          fallen.push([u!, i]);
          state.units.splice(i, 1);
        }
      });
      try {
        minorTurns(state);
        // ...and the last city-state's, its units where its turn left them and
        // its upgrades made in that turn, before the barbarians' turn and the
        // units its turn made and the record lacks are undone: a unit it
        // trained and upgraded in that turn is the record's (runs/h1_duelu1117
        // t160: Antananarivo, the last city-state, its Scout trained and
        // upgraded to the Skirmisher 2097158 as Industrialization lands)
        if (before !== undefined) ended(before);
        ctx.minorGround = state.map.tiles.map(groundOf);
      } finally {
        holdMinorStart(null);
        for (const [u, i] of fallen.reverse()) state.units.splice(Math.min(i, state.units.length), 0, u);
      }
      ctx.minorLookTypes = new Map(state.units.map((u) => [u.id, gameTypeOf('unit', u.type, 'UNIT_')]));
      takeBarbs();
      worldCongress(state);
      turnClose(state);
      const changing = barbs.filter((u) => barbAt.has(u));
      barbs.splice(0, barbs.length, ...barbs.filter((u) => !barbAt.has(u)));
      const barbFrom = new Map(changing.map((u) => [u, u.tileIndex] as const));
      for (const u of changing) u.tileIndex = barbAt.get(u)!;
      state.units.push(...changing);
      const preChange = state.map.tiles.map((x) => x.improvement ?? null);
      turnChange(state);
      for (const t of state.map.tiles) if ((t.improvement ?? null) !== preChange[t.index]) eventPlots.add(t.index);
      // back where the replay's own steps take them from (`syncUnits`)
      for (const [u, at] of barbFrom) u.tileIndex = at;
      takeBarbs();
      // the other majors' per-turn Favor, at the turn's change after the
      // Congress (runs/h1_duelw1128 t101: China votes on 56, then banks +3)
      for (const seat of others) seatFavor(state, seat);
      seatPhase(state, { seats: new Set([active.seat]), deals: false });
      advanceTurn(state);
    } catch (e) {
      report.stopped = `the engine's turn threw at turn ${a.turn}: ${(e as Error).message}`;
      break;
    } finally {
      holdFavor(null);
    }
    holdMinorCatchUp(null);
    stream.actions(a.turn);
    // ...nor any of its fortification: the turn's dig-in is a standing
    // unit's (runs/h1_duelw1128 t17: Rome's Warrior, two turns dug in,
    // attacked, stepped onto 41:16 and took a barbarian Warrior's blow there
    // unfortified)
    for (const [u, was] of spent) {
      if (u.hp > was.hp) u.hp = was.hp;
      if ((u.fortifyTurns ?? 0) > was.fortify) u.fortifyTurns = was.fortify;
    }
    // a rested unit struck in a later player's turn heals at its own next
    // turn's start, after the blow (runs/h1_duelw1118 t8: a city-state's
    // Warrior 23 damaged, fortified, took the barbarians' two attacks at 77
    // health and read +10 after them; runs/h1_duelw1124 t9: Rome's Warrior,
    // whole when a barbarian Warrior struck it for 24, read 86): its rest
    // heal is taken at the health the blows left
    for (const [u, hp] of struckHp) u.hp = Math.min(u.hp, hp);
    const healedOn = new Map(state.units.map((u) => [u, healPlot(state, u)]));
    state.units.push(...barbs);
    verifyPolicies(ctx, staged);
    matchNewUnits(ctx, b);
    // a unit the engine's own city-state, Free City or barbarian scripts made
    // that the record's players did not: their decision, undone — a
    // city-state's purchase with its Gold back (runs/h1_duelw1117 t24:
    // Antananarivo's Archer, bought for 120 of its 121.5 Gold under City
    // Defense's threat, which the game never bought; kept spent, the purse
    // ran 124 short to the bankruptcy that disbanded its Bombard at t149)
    const mapped = new Set(ctx.units.values());
    // the Traders the city-states' ended routes handed back: the record's
    // own, each on the map through its route, none a unit their cities made
    const returned = new Map(state.cityStates.map((c) => {
      const now = new Set(c.tradeRoutes ?? []);
      return [c.seat, (routesBefore.get(c.seat) ?? []).filter((r) => !now.has(r)).length] as const;
    }));
    // the units each player's log adds in the pair that record t+1 lost: a
    // unit made and gone within its turn
    const madeGone = new Map<number, number>();
    const heldKeys = new Set(b.units.map((x) => `${x.owner}:${x.id}`));
    for (const x of (b as { actions?: unknown[][] }).actions ?? []) {
      if (x[2] !== 'UnitAddedToMap' || heldKeys.has(`${x[3]}:${x[4]}`)) continue;
      const seat = seatOfP(ctx, x[3] as number);
      madeGone.set(seat, (madeGone.get(seat) ?? 0) + 1);
    }
    const forget = (u: Unit): void => {
      for (const h of [...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : []), state.barbSeat]) {
        if (h.armyKnown?.some((r) => r.id === u.id && r.owner === u.seat)) h.armyKnown = h.armyKnown.filter((r) => r.id !== u.id || r.owner !== u.seat);
      }
    };
    for (const u of [...state.units]) {
      if (standing.has(u) || mapped.has(u) || u.seat < state.seats.length) continue;
      disbandUnit(state, u.id);
      const cs = state.cityStates.find((c) => c.seat === u.seat);
      const paid = minorBought.get(u);
      if (!paid && u.type === 'TRADER' && (returned.get(u.seat) ?? 0) > 0) {
        // ...and none the game's knowledge bases record: the engine's own
        // Trader made at the route's end (runs/h1_dueld1128 Hong Kong's
        // Trader on 10:7, t119-t137 and t164-t179 in the engine's records
        // alone)
        returned.set(u.seat, returned.get(u.seat)! - 1);
        forget(u);
        continue;
      }
      // a purchase the game never made leaves no record in any knowledge
      // base: its own minor's would count it gone in its army two turns on
      // (runs/h1_duelw1127 t17: city-state 4's Warrior bought at t16,
      // undone, its record at its centre starting Attack Barb Camp the game
      // never started). A unit trained may be the game's, gone in its turn
      // where the log adds one of its player's the record t+1 lost
      // (runs/h1_duelw1128 t42: city-state 2's Warrior, its record aging on
      // in the game's); one the log never adds leaves none (runs/h1_dueld1117
      // t77: Caguana's Trader, trained, undone, its record aging on 43:12 to
      // t97 in the engine's alone)
      const gone = madeGone.get(u.seat) ?? 0;
      if (!paid && gone > 0) madeGone.set(u.seat, gone - 1);
      if (paid || gone === 0) forget(u);
      if (paid) {
        paid.cityState.treasury += paid.price;
        if (u.type === 'BUILDER') paid.cityState.buildersTrained -= 1;
        // ...and its savings back: the spend the purchase took from each
        // slot and from the balance returned, so the turns after share the
        // treasury's change as the game's unspent savings do (else the refund
        // reads as income shared over every slot: runs/h1_duelu1117 Caguana's
        // Builder bought at t70 and undone)
        const eco = paid.cityState.economy;
        if (eco && paid.savings) {
          const spent: EconomicMemory = { savings: [...paid.savings], balance: 0 };
          purchaseSpend(spent, paid.price * FX, paid.threatened);
          for (let i = 0; i < eco.savings.length; i++) eco.savings[i] += paid.savings[i] - spent.savings[i];
          eco.balance += paid.price * FX;
        }
      }
      const op = cs?.ops ? opsOf(cs.ops).find((o) => opUnits(o).includes(u.id))?.def : undefined;
      // a unit its city made that its own "Upgrade Units" tree, running this
      // turn, deletes in the same turn (its upgrade unaffordable and asking
      // no strategic resource), as the game's did: no unit record t+1 holds
      // (runs/h1_duelu1128 Bologna at 0 Gold t241-t246, a tree each turn a
      // technology lands, its Default Specialization's Scouts gone)
      if (!paid && cs && !op && (cs.upgradeTrigger || (cs.upgrading?.length ?? 0) > 0) && minorUpgradeVisible(cs, u)
        && !upgradeMayGo(state, cs, u) && unupgradedDeleted(state, cs, u)) continue;
      count(ctx, isBarbSeat(u.seat) ? 'barb:unit' : 'minorAi:unit', 'fallback', ctx.playerOfSeat.get(u.seat),
        `${u.type}${paid ? ' bought' : ''}${op ? ` for ${op}` : ''}`);
      if (TRACE.has('minorUnits')) console.error(`t${b.turn - 1} minorAi:unit p${ctx.playerOfSeat.get(u.seat)} ${u.type}${paid ? ' bought' : ' trained'}${op ? ` for ${op}` : ''}`);
    }
    undoMinorPlots(ctx, improvements, charges, eventPlots);
    freeBuilds(ctx, b);
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
    // the city-states', Free Cities' and barbarians' decisions, and what
    // record t+1 shows of every unit (its loss, its health)
    applyPhase(ctx, ds, 'after', b, b);
    for (const u of struckHp.keys()) {
      if (!state.units.includes(u) || u.hp >= UNIT_HP) continue;
      const rest = { ...u };
      restUnit(state, rest, true);
      u.hp = rest.hp;
    }
    // the game heals every unit at the turn's end, after every player's
    // actions: a rested unit of another major whose plot the decisions
    // landed after the engine's turn changed (a plot bought under it) heals
    // on the plot as they left it
    for (const [u, was] of healedOn) {
      const hp = hpPre.get(u);
      if (hp === undefined || spent.has(u) || struckHp.has(u) || ctx.battled.has(unitKeyOf(ctx, u)) || !isCiv(u.seat)
        || !state.units.includes(u) || u.seat === seatOfP(ctx, activePlayer(a)) || healPlot(state, u) === was) continue;
      const rest = { ...u, hp };
      restUnit(state, rest, true);
      u.hp = rest.hp;
    }
    // the city-states', Free Cities' and barbarians' units stand where their
    // turn t's moves left them: their looks reveal and meet in turn t
    inTurn(state, a.turn, () => syncUnits(ctx, b));
    campsTaken(ctx, b, a.turn);
    // the units the minors' cities made in the engine's turn: trained, or
    // bought by a contract purchase of the economic AI's turn, before the
    // units' turn (runs/h1_duely1124 Granada t72: contract 190's Heavy
    // Chariot on the centre, the threatened purchase's Horseman refused
    // there, its Quadrireme bought) — a purchase the record shows that the
    // engine's turn did not make is the units' turn's
    const bought = new Set(ds.flatMap((d) => (d.kind === 'buyUnit' ? [d.unit] : [])));
    minorAi(ctx, b, a.turn, new Set([...ctx.units].filter(([k, u]) => minorAiSeat(u.seat) && !standing.has(u)
      && (!bought.has(k) || minorBought.has(u))).map(([, u]) => u)), new Set(minorBought.keys()), revealedWas);
    // the items the city-states' second hooks set, against record t+1's
    minorBuilds(ctx, b, report.minorBuilds);
    // a later player's blow on a city-state's or the Free Cities' unit came
    // after the defender's end look: its record of the attacker is the blow's
    // (runs/h1_dueld1121 t22: Hunza's end look sees the barbarians'
    // Quadrireme on 8:3, which then strikes its Warrior from 9:1; Hunza's
    // t23 record of it 9:1)
    for (const { seat, attacker } of ctx.lateBlows) recordAttacker(state, attacker, seat);
    barbarianTurn(ctx, b, a.turn);
    // the units the barbarians raised stand where the record holds them
    inTurn(state, a.turn, () => syncUnits(ctx, b));
    // the barbarians' knowledge base looks at their turn's end from there,
    // before the next turn's start made its units
    const unborn = unbornUnits(ctx, b);
    const all = state.units;
    state.units = all.filter((u) => !unborn.has(u));
    knowledgeLook(state, state.barbSeat, BARB_SEAT, plotsSeenNow(state, new Set([BARB_SEAT])), false);
    state.units = all;
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
    // a Fortify order ticks the operation at once, its turn's rest again
    // (the operation's tick 0x95ebb0): the unit stands dug in as record t+1
    // reads it (runs/h1_duelw1127 t35: a barbarian Scout, moved the turn
    // before, orders Fortify and reads 2, struck at +1 by Rome's Warrior
    // next turn); the engines' rest has no order to tick
    for (const [k, f] of ctx.fortified) {
      const u = unitOf(ctx, k);
      if (u && f.turns !== null && state.units.includes(u) && f.turns > (u.fortifyTurns ?? 0)) u.fortifyTurns = f.turns;
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
    // the research AI's analysis of each minor's turn, past its Science,
    // against the game's AI log of the turn
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
        // REPLAY_TRACE=minorUnits: the units table its update kept against the log's
        const lu = TRACE.has('minorUnits') && name !== undefined ? (unitsLog ??= loadCityBuildCentre(dumpPath)).get(`${a.turn}:${pid}:${name}`)?.UNITS : undefined;
        if (lu && cs.unitValues) {
          const off = AI_UNITS.map((u, k) => [u.type.slice(5), lu[k], cs.unitValues![k] / 256] as const)
            .filter(([, g, o]) => (g > -9000 || o > -9000) && Math.abs(g - o) > 0.0051).map(([u, g, o]) => `${u} ${g}/${o.toFixed(2)}`);
          if (off.length) console.error(`t${a.turn} minorUnits p${pid} ${off.join(' ')}`);
        }
      }
    }
    // THE AI'S MEMORY at its turn's end against the game's logs of the turn:
    // per kind agreed or not, and per player whether all agreed, which the
    // next pair's decisions read
    {
      const clean = new Map<number, boolean>();
      for (const s of [...state.cityStates, ...(state.freeSeat ? [state.freeSeat] : []), state.barbSeat]) {
        const pid = ctx.playerOfSeat.get(s.seat);
        if (pid === undefined) continue;
        const logged = ctx.armyLogged.get(s.seat);
        const playerOf = (seat: number) => ctx.playerOfSeat.get(seat) ?? seat;
        // a minor's members as its end look saw them, before the barbarians'
        // turn; the barbarians' as their own turn left them
        const unitType = (id: number) => {
          if (!isBarbSeat(s.seat)) return ctx.minorLookTypes.get(id);
          const u = state.units.find((x) => x.id === id);
          return u ? gameTypeOf('unit', u.type, 'UNIT_') : undefined;
        };
        const reads = ctx.gameMemory
          ? readGameMemory(ctx.gameMemory, cat, s, pid, a.turn, ctx.W, playerOf, logged, unitType)
          : readMemory(ctx.memoryLogs, s, pid, a.turn, ctx.W, playerOf, logged);
        for (const m of reads) {
          scoreDecision(report.memory, m.kind, a.turn, `p${pid}`, m.equal, m.ours, m.game);
          // REPLAY_TRACE=memory: each kind that differs
          if (!m.equal && TRACE.has('memory')) console.error(`t${a.turn} memory p${pid} ${m.kind} ours ${m.ours} | log ${m.game}`);        }
        clean.set(pid, reads.every((m) => m.equal));
      }
      ctx.memoryClean = clean;
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
    // the civics AI's analysis of each minor's turn against the log of the
    // turn; then the city-states' choices against the civic record t+1 shows
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
  traceKnowledge(null);
  traceFreeOps(null);
  holdMinorCatchUp(null);
  holdResearchEra(null);
  holdMinorOrders(false);
  holdCityStrikes(false);
  traceMinorPurchases(null);
  traceMinorPolicyScores(null);
  if (operations.active) report.operations = operations.tally;
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
  out.push('', '## The research AI', '', 'A city-state\'s or the Free Cities\' choices its turn made (or the record changed);',
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
  out.push('', '## The civics AI', '', 'A city-state\'s or the Free Cities\' choices its turn made (or the record changed), against the record\'s civic:', '',
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
  out.push('', '## The AI\'s decisions against the game\'s', '', ...scoreTable(r.scores));
  out.push('', '## The AI\'s memory against the game\'s logs', '', ...memoryTable(r.memory));
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
  if (r.operations) out.push(...operationsMarkdown(r.operations));
  return out.join('\n') + '\n';
}
