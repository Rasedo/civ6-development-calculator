/**
 * Core rule constants and formulas (base Civ 6). The WATER-HOUSING block is
 * sourced against the wiki, all five values confirmed; the rest of this file
 * has NOT been swept (AUDIT B-D).
 */

import { srcConst, xml, type Src } from './provenance';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

/** Minimum distance between city centers.
 * Real Civ 6 blocks settling within 3 tiles of any center. */

export const CITY_WORK_RADIUS = srcConst('seats.workRadius', 3,
  { ...gp('CITY_MIN_RANGE'), note: 'the settle-distance floor; this engine reads the same 3 as the work radius' });

export const BORDER_MAX_RADIUS = srcConst('constants.BORDER_MAX_RADIUS', 5,
  gp('PLOT_INFLUENCE_MAX_ACQUIRE_DISTANCE'));

export const CULTURE_COST_FIRST_PLOT = srcConst('constants.cultureCostFirstPlot', 10,
  gp('CULTURE_COST_FIRST_PLOT'));
export const CULTURE_COST_LATER_PLOT_MULTIPLIER = srcConst('constants.cultureCostLaterPlotMultiplier', 6,
  gp('CULTURE_COST_LATER_PLOT_MULTIPLIER'));
export const CULTURE_COST_LATER_PLOT_EXPONENT = srcConst('constants.cultureCostLaterPlotExponent', 1.3,
  gp('CULTURE_COST_LATER_PLOT_EXPONENT'));

/** Culture needed for a city's next border expansion, `n` the plots the city
 * has taken WITH CULTURE so far, counted from 0 (a purchase is not counted):
 * (CULTURE_COST_FIRST_PLOT + (MULTIPLIER · n)^EXPONENT) at the online speed,
 * floored after the speed's scaling — 5, 10, 17, 26, 36, 46 … 120, the game's
 * `GetCultureCost` on n 0–5, 7, 8, 10, 11 in runs/h1_duelw1103 / 1104. The GPU
 * twin is `_border_cost`. */
export function borderGrowthCost(n: number): number {
  return scaleByGameSpeed(CULTURE_COST_FIRST_PLOT
    + Math.pow(CULTURE_COST_LATER_PLOT_MULTIPLIER * n, CULTURE_COST_LATER_PLOT_EXPONENT));
}

/**
 * THE ONLINE SPEED. CIV6 (GameSpeeds.xml, GAMESPEED_ONLINE): `CostMultiplier`
 * 50 — every production and research cost is half its Standard-speed row.
 * Lab 2 scene G read `Cost × 0.5` on all 302 priced rows of one city
 * (runs/purchase_20260920T181359Z.jsonl). No expansion or DLC pack writes a
 * GameSpeeds row. The game's length is the online `GameSpeed_Turns` rows'
 * sum, `TURN_LIMIT`.
 */
export const GAME_SPEED = srcConst('scenario.gameSpeed', 0.5,
  xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CostMultiplier',
    { scale: 0.01, note: 'the install writes a percent; this engine holds the fraction' }));

/**
 * A Standard-speed figure at the online speed: `× CostMultiplier / 100`,
 * TRUNCATED. The one composer for every figure the install scales by the
 * speed — a production or research cost, a cost progression's step, and a
 * modifier amount the install types `ScaleByGameSpeed` or flags `Scale` (a
 * Great Person's grant, a tribal village's Gold). Truncated as the lab read
 * every odd cost: a Slinger (Cost 35) costs 17, a Spy (225) 112, a Canal (81)
 * 40 — 21 units and 17 districts in runs/purchase_20260920T181359Z.jsonl.
 * The amounts take the same multiplier: `ScaleByGameSpeed` names the speed,
 * and the speed's one published multiplier is `CostMultiplier` (the
 * `GameSpeed_Scalings` HALF / SLIGHT rows are named by no row a Gathering
 * Storm game loads). The GPU twin is `Rules.scale_by_game_speed`.
 */
export function scaleByGameSpeed(n: number): number {
  return Math.floor(n * GAME_SPEED);
}

/** GAMESPEED_ONLINE's `CostMultiplier` as the install writes it, a percent —
 *  the integer form `progressCost` computes in. */
export const COST_MULTIPLIER_PCT = srcConst('scenario.costMultiplierPct', 50,
  xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CostMultiplier'));

/** THE GAME'S PROGRESS, the denominators: every Technologies and every Civics
 *  row a Gathering Storm game loads, whether or not this engine carries it —
 *  77 and 61 (the harness's price fits, runs/h1_duelw1103 / 1104). */
export const PROGRESS_TECH_COUNT = srcConst('scenario.progressTechCount', 77, {
  derived: 'the count of Technologies rows Base <- Expansion1 <- Expansion2 load, TECH_POTTERY through TECH_FUTURE_TECH',
  inputs: [xml('Technologies', 'TechnologyType=TECH_POTTERY', 'Cost'), xml('Technologies', 'TechnologyType=TECH_FUTURE_TECH', 'Cost')],
});
export const PROGRESS_CIVIC_COUNT = srcConst('scenario.progressCivicCount', 61, {
  derived: 'the count of Civics rows Base <- Expansion1 <- Expansion2 load, CIVIC_CODE_OF_LAWS through CIVIC_FUTURE_CIVIC',
  inputs: [xml('Civics', 'CivicType=CIVIC_CODE_OF_LAWS', 'Cost'), xml('Civics', 'CivicType=CIVIC_FUTURE_CIVIC', 'Cost')],
});

/** THE GAME'S PROGRESS as the prices read it: the integer percent of the
 *  further of the two trees, max(floor(100·techs/77), floor(100·civics/61)). */
export function gameProgressPct(techs: number, civics: number): number {
  return Math.max(Math.floor((100 * techs) / PROGRESS_TECH_COUNT), Math.floor((100 * civics) / PROGRESS_CIVIC_COUNT));
}

/** A progress-priced cost at the online speed: floor(base × CostMultiplier ×
 *  (1 + k × pct/100)), `base` the install's Standard-speed Cost and `k` the
 *  climb over the whole game — COST_PROGRESSION_GAME_PROGRESS's Param1 read as
 *  Param1/100 − 1 (the Trader's 400 → 3, 30 of 30 in runs/h1_duelw1103; a
 *  GAME_PROGRESS district's 1000 → 9), the specialty districts' 9, the
 *  plot's 4. Integer throughout, so both engines land on the same number. */
export function progressCost(base: number, k: number, pct: number): number {
  return Math.floor((base * COST_MULTIPLIER_PCT * (100 + k * pct)) / 10000);
}

/** A PLOT's price at the online speed, before the seat's own rows: ½·(base +
 *  step·(d − 2))·(1 + k·P), d the ring (2 at the least), floored to a
 *  multiple of PURCHASE_DIVISOR. Integer throughout (`_plot_price`). */
export function plotPrice(ring: number, pct: number): number {
  const n = (PLOT_BUY_BASE_COST + PLOT_BUY_RING_STEP * (Math.max(2, ring) - 2)) * COST_MULTIPLIER_PCT
    * (100 + PLOT_BUY_K * pct);
  return Math.floor(n / (10000 * PURCHASE_DIVISOR)) * PURCHASE_DIVISOR;
}

export const PLOT_BUY_BASE_COST = srcConst('scenario.plotBuyBase', 50, gp('PLOT_BUY_BASE_COST'));
/** the plot price's step per ring past the second, and its climb over the
 *  game — the harness's fit (runs/h1_duelw1103: 32,432 of 32,734 prices) */
export const PLOT_BUY_RING_STEP = srcConst('scenario.plotBuyRingStep', 25, {
  lab: 'runs/h1_duelw1103_20260927T190654Z.jsonl and runs/h1_duelw1104_20260927T192639Z.jsonl',
  note: 'plotBuy rows: 32,432 of 32,734 in 1103 on floor-to-5(1/2 (50 + 25(d - 2))(1 + 4P))',
});
export const PLOT_BUY_K = srcConst('scenario.plotBuyK', 4, {
  lab: 'runs/h1_duelw1103_20260927T190654Z.jsonl and runs/h1_duelw1104_20260927T192639Z.jsonl',
  note: 'the same fit as PLOT_BUY_RING_STEP',
});

/** COST_PROGRESSION_GAME_PROGRESS's `CostProgressionParam1` as the climb `k`
 *  of `progressCost`. */
export function gameProgressK(param: number): number {
  return param / 100 - 1;
}

/** a `GameSpeed_Durations` ONLINE_HALF row: the online count of `standard` */
const onlineRow = (standard: number) => xml('GameSpeed_Durations',
  `GameSpeedScalingType=ONLINE_HALF&NumberOfTurnsOnStandard=${standard}`, 'NumberOfTurnsScaled');

/**
 * THE ONLINE SPEED'S DURATIONS. CIV6 (GameSpeeds.xml, GameSpeed_Durations):
 * the ONLINE_HALF rows map a Standard-speed turn count to the online one —
 * 5 → 5, 10 → 8, 15 → 10, 29 → 19, 30 → 20, 60 → 40. Online the Nuclear
 * emergency ran 40 turns, a denouncement, a friendship and an alliance 20
 * and the peace minimum 8 (runs/bds4_durations_lab4_t161.jsonl).
 */
const ONLINE_DURATIONS: ReadonlyMap<number, number> = new Map(
  ([[5, 5], [10, 8], [15, 10], [29, 19], [30, 20], [60, 40]] as const).map(([standard, online]) =>
    [standard, srcConst(`scenario.onlineTurns${standard}`, online, onlineRow(standard))]));

/** A Standard-speed duration at the online speed, through its
 *  `GameSpeed_Durations` ONLINE_HALF row — the one composer every turn count
 *  the install writes at Standard speed goes through where it is read. A count
 *  the table has no row for has no online reading, and asking for one throws. */
export function speedTurns(standard: number): number {
  const online = ONLINE_DURATIONS.get(standard);
  if (online === undefined) throw new Error(`speedTurns: GameSpeed_Durations has no ONLINE_HALF row for ${standard}`);
  return online;
}

/** the provenance of a duration read through `speedTurns`: its Standard
 *  source and the ONLINE_HALF row that scales it */
export function speedTurnsSrc(standard: Src, n: number): Src {
  return { derived: `the Standard ${n} turns through GameSpeed_Durations ONLINE_HALF (speedTurns)`,
    inputs: [standard, onlineRow(n)] };
}

/** THE PURCHASE PRICE, measured live (lab 2 scene G — all 302 priced rows of
 *  one city fitted, then a real 445-gold transaction; runs/purchase_*.jsonl):
 *  `price = floor(mult × C / PURCHASE_DIVISOR) × PURCHASE_DIVISOR`, mult 4 for
 *  gold and 2 for faith, C the CITY's speed-scaled production cost. FLOOR,
 *  never nearest (a Slinger at cost 17 buys for 65 gold and 30 faith), and
 *  progress already invested never lowers it. The install's
 *  GOLD_PURCHASE_MULTIPLIER 2 is the gold-to-faith RATIO, not the multiplier
 *  on the cost; the faith rate is the same 2 for every chassis, land combat
 *  units included. `goldPrice` / `faithPrice` apply the floor last. */
export const GOLD_PURCHASE_MULT = srcConst('scenario.goldPurchaseMult', 4, {
  lab: 'runs/purchase_20260920T181359Z.jsonl',
  note: 'the install publishes GOLD_PURCHASE_MULTIPLIER 2 — the gold price is twice the faith price, and the faith price is 2 × the cost',
});
export const FAITH_PURCHASE_MULT = srcConst('scenario.faithPurchaseMult', 2, {
  lab: 'runs/purchase_20260920T181359Z.jsonl',
  note: 'no install row carries the faith rate; measured 2 × the scaled cost on every priced chassis and building',
});
export const PURCHASE_DIVISOR = srcConst('scenario.purchaseDivisor', 5, gp('PURCHASE_DIVISOR'));

/** THE POLICY UNLOCK. CIV6 (the Governments pedia): "Any time a new
 *  government or policy is unlocked from the Civics Tree, you will have the
 *  opportunity to reselect policies or change your government for free.
 *  Otherwise, there will be a cost to make these changes." The UI reads the
 *  cost from `GetCostToUnlockPolicies` (0 in the free window) and pays it in
 *  Gold (`GOVERNMENT_UNLOCK_WITH_FAITH` false) through one `UNLOCK_POLICIES`
 *  operation that opens both the cards and the government for the turn. The
 *  online speed's row names the cost's three figures; `policyUnlockCost`
 *  escalates each by the game's progress (`policyEscalated`) and takes the
 *  maximum less the step per turn past the window, never below the minimum,
 *  rounded DOWN to a multiple of PURCHASE_DIVISOR
 *  (`PlayerCulture::GetCostToUnlockPolicies`, GameCore_XP2 0x398e70). */
export const CIVIC_UNLOCK_MAX_COST = srcConst('scenario.civicUnlockMaxCost', 50,
  xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CivicUnlockMaxCost'));
export const CIVIC_UNLOCK_PER_TURN_DROP = srcConst('scenario.civicUnlockPerTurnDrop', 5,
  xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CivicUnlockPerTurnDrop'));
export const CIVIC_UNLOCK_MIN_COST = srcConst('scenario.civicUnlockMinCost', 10,
  xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CivicUnlockMinCost'));
/** The escalation's end point, a percent of the unescalated figure at the
 *  game's full progress: E(x) = x + (x·ESC/100 − x)·p/100 in integers, p
 *  the game's progress (`gameProgressPct`), GameCore_XP2 0x5267a0 type 1;
 *  `tools/civ6lab/dll_policy.py` fits 853 of 853 lab price reads. */
export const GAME_COST_ESCALATION = srcConst('scenario.gameCostEscalation', 1000, {
  ...gp('GAME_COST_ESCALATION'),
  note: 'the policy-unlock price escalates its three figures by it (dll_policy.py on runs/bds4_probe_20260926T135815Z.jsonl and runs/bds3_ladder_*: 853 of 853)',
});

/** ANARCHY. CIV6 (the Governments pedia): "If you switch to a previously
 *  adopted government, you will enter a state of Anarchy". Measured: a return
 *  to any government the seat held before, requested at turn T, left it in no
 *  government at T+1 and T+2 and in the new one at T+3, where a new
 *  government is in at T+1 (`GetAnarchyTurns` 3 for every held government, 0
 *  for the rest; repeats cost no more) — two turns more than a change to a new
 *  one, and none for it. */
export const ANARCHY_TURNS = srcConst('scenario.anarchyTurns', 2, {
  lab: 'runs/bds3_anarchy_20260926T102305Z.jsonl and runs/bds3_anarchy_xsec_lab4_t150.jsonl',
});

export const FOOD_PER_CITIZEN = srcConst('foodPerCitizen', 2,
  gp('CITY_FOOD_CONSUMPTION_PER_POPULATION'));

/**
 * THE MOVEMENT UNIT. CIV6 publishes a route's movement cost in QUARTERS of a
 * point — 1.0 for the Ancient and Classical Road, 0.75 for the Industrial,
 * 0.5 for the Modern and 0.25 for the Railroad — so a quarter point is what
 * this engine counts in. Every catalog figure below stays in WHOLE points and
 * is multiplied where it enters, which is `unitFullMoves` and nowhere else.
 */
export const MP_SCALE = srcConst('mpScale', 4, {
  stylized: 'the QUARTER point — the unit this engine counts movement in, so the install\'s '
    + '1.0 / 0.75 / 0.5 / 0.25 route costs are whole numbers here',
});

/**
 * THE ROAD LADDER. CIV6: "Roads are upgraded by researching technologies, or
 * more specifically, by reaching specific eras. Upon doing so, all roads in
 * your territory will upgrade to the next level automatically." Each tier's
 * own Civilopedia page gives its Movement Cost and whether it bridges:
 *   Ancient 1.0 no bridges | Classical 1.0 bridges
 *   Industrial 0.75 bridges | Modern 0.5 bridges
 * The tier is the WORLD's era count here, latched where the era boundary
 * already fires in lockstep on both engines — "your territory" is a per-seat
 * reading this model does not carry.
 */
export const ROAD_TIER_MP: readonly number[] = srcConst('roadTierMp', [4, 4, 3, 2], {
  derived: 'Routes.MovementCost x MP_SCALE for ROUTE_ANCIENT_ROAD, ROUTE_MEDIEVAL_ROAD, '
    + 'ROUTE_INDUSTRIAL_ROAD, ROUTE_MODERN_ROAD in that order (1, 1, 0.75, 0.50)',
  inputs: [
    xml('Routes', 'RouteType=ROUTE_ANCIENT_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_MEDIEVAL_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_INDUSTRIAL_ROAD', 'MovementCost'),
    xml('Routes', 'RouteType=ROUTE_MODERN_ROAD', 'MovementCost'),
  ],
});
export const ROAD_TIER_BRIDGES: readonly boolean[] = [false, true, true, true];
/** the world-era index at which each road tier arrives, ascending. */
export const ROAD_TIER_ERA: readonly number[] = srcConst('roadTierEra', [0, 1, 4, 5], {
  derived: 'the ChronologyIndex of each road tier\'s Routes.PrereqEra, zero-based (the Ancient '
    + 'road carries none): ERA_CLASSICAL 1, ERA_INDUSTRIAL 4, ERA_MODERN 5',
  inputs: [
    xml('Routes', 'RouteType=ROUTE_MEDIEVAL_ROAD', 'PrereqEra'),
    xml('Routes', 'RouteType=ROUTE_INDUSTRIAL_ROAD', 'PrereqEra'),
    xml('Routes', 'RouteType=ROUTE_MODERN_ROAD', 'PrereqEra'),
  ],
});

/** CIV6 (Railroad): "Movement Cost 0.25", and it "Creates Bridges over
 *  Rivers" like every tier above the Ancient road. */
export const RAILROAD_MP = srcConst('railroadMp', 1,
  xml('Routes', 'RouteType=ROUTE_RAILROAD', 'MovementCost', { scale: MP_SCALE }));

/** what EMBARKING or DISEMBARKING costs on top of the step, unless a Harbor
 *  or a coastal City Center makes the dock free. Two whole points. */
export const EMBARK_TRANSITION_MP = srcConst('embarkTransitionMp', 2 * MP_SCALE, {
  derived: 'MOVEMENT_EMBARK_COST x MP_SCALE — the install writes the dock in whole points, this '
    + 'engine in quarters',
  inputs: [gp('MOVEMENT_EMBARK_COST')],
});

/** CIV6 (Railroad): the tech that unlocks it, and the resources one tile
 *  costs — "does not cost a charge, but does cost 1 Iron and 1 Coal". */
export const RAILROAD_TECH = srcConst('constants.RAILROAD_TECH', 'STEAM_POWER',
  xml('Routes_XP2', 'RouteType=ROUTE_RAILROAD', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }));
export const RAILROAD_COST: readonly (readonly [string, number])[] = [['IRON', 1], ['COAL', 1]];

/**
 * EMBARK: the movement points a land unit has while EMBARKED (on water).
 * CIV6 (Movement): "Embarked units have 2 Movement in the Classical Era;
 * the following techs each add more: Square Rigging (+1), Steam Power (+2) and
 * Combustion (+1)." Water tiles enter at cost 1.
 */
export const EMBARK_MOVES = srcConst('combat.embarkMoves', 2, gp('MOVEMENT_WHILE_EMBARKED_BASE'));
export const EMBARK_MOVE_TECHS: readonly (readonly [string, number])[] = [
  ['SQUARE_RIGGING', 1], ['STEAM_POWER', 2], ['COMBUSTION', 1],
];

/**
 * CIV6 (Movement): "all units moving at sea (including embarked land units)
 * receive +1 Movement after researching Mathematics. Note that this detail
 * doesn't appear anywhere in the Civilopedia information on naval units, so
 * you shouldn't be surprised to see 5 Movement on a Frigate when its
 * Civilopedia entry says it has only 4." So it rides on the chassis stat
 * rather than being folded into it, and reaches HULLS as well as passengers.
 */
export const SEA_MOVE_TECH = srcConst('constants.SEA_MOVE_TECH', 'MATHEMATICS',
  xml('Technologies', 'TechnologyType=TECH_MATHEMATICS', 'TechnologyType',
    { expect: 'TECH_MATHEMATICS' }));
export const SEA_MOVE_TECH_BONUS = srcConst('constants.SEA_MOVE_TECH_BONUS', 1, {
  pedia: 'the GS Civilopedia Movement page ("+1 Movement after researching Mathematics" to every '
    + 'unit at sea); the install carries it as a modifier, not as a readable column',
});

/**
 * CIV6 (Combat, "Attacking embarked units"): an embarked unit defends at a
 * Combat Strength "normalized for all unit classes", which "is used when
 * embarked units are defending, depends on the owner's current technological
 * era (not the World Era), and is updated upon discovery of the first
 * technology or civic of that era". Indexed by `ERAS`. The published list
 * starts at Classical — embarking needs a Classical technology, so the Ancient
 * row repeats the first stated tier rather than inventing one. NO terrain,
 * fortify, support or class terms ride on top: the class is what the
 * normalization removes.
 */
export const EMBARKED_DEFENSE_CS_BY_ERA: readonly number[] =
  srcConst('combat.embarkedDefenseCsByEra', [15, 15, 15, 30, 35, 50, 55, 55, 55], {
    derived: 'Eras.EmbarkedUnitStrength in ChronologyIndex order, with the ANCIENT row repeating '
      + 'the Classical tier (the install writes 10 there; embarking needs a Classical technology, '
      + 'so this engine never reads an Ancient embark)',
    inputs: [xml('Eras', 'EraType=ERA_CLASSICAL', 'EmbarkedUnitStrength')],
  });

/** A CITY CENTRE'S STANDING STRENGTH, the terms beside its base and walls
 *  (`centreStrength` / `_centre_strength`). The combat preview's DEFENSES
 *  lines, read term by term over 1,774 centres (tools/civ6lab/runs/
 *  citydef_20260926T061603Z.jsonl). The Palace's +3 stands in the city that
 *  holds the Palace — the capital, and a city-state's one city. */
export const PALACE_CITY_CS = srcConst('combat.palaceCityCs', 3,
  xml('ModifierArguments', 'ModifierId=PALACE_ADJUST_GARRISON_STRENGTH&Name=Amount', 'Value',
    { note: 'MODIFIER_PLAYER_CITIES_ADJUST_INNER_DEFENSE on BUILDING_PALACE; the lab read it in the capital alone' }));
/** THE HOLDER'S BASE a centre stands on: max(the start era's melee strength,
 *  the strongest melee the holder has trained or bought) - 10 (`holderStrength`). The
 *  engines start at Ancient, so the start value is the ERA_ANCIENT row's —
 *  the major's and the minor's each their own column. The Civilopedia: "the
 *  strongest melee unit built by your civilization, minus 10". */
export const CITY_START_MELEE_MAJOR = srcConst('combat.cityStartMeleeMajor', 20,
  xml('StartEras', 'EraType=ERA_ANCIENT', 'StartingMeleeStrengthMajor',
    { note: 'runs/city_defense_preview_c38s2_era*: a major\'s base is max(this, the melee its first city is granted) - 10 at every start era' }));
export const CITY_START_MELEE_MINOR = srcConst('combat.cityStartMeleeMinor', 25,
  xml('StartEras', 'EraType=ERA_ANCIENT', 'StartingMeleeStrengthMinor',
    { note: 'runs/city_defense_preview_c38s2_era*: a minor\'s base is this - 10 at every start era (25 -> 15 Ancient ... 70 -> 60 Atomic)' }));
export const CITY_BASE_MELEE_CUT = srcConst('combat.cityBaseMeleeCut', 10, {
  lab: 'runs/city_defense_preview_c38s2_era1_20260926T081728Z.jsonl through runs/city_defense_preview_c38s2_era8_20260926T082547Z.jsonl (112 minor and 48 major start centres, one start era each) and runs/garrison_scale_20260926T081246Z.jsonl (base 55 under a Line Infantry 65)',
  note: 'the Civilopedia\'s "strongest melee unit built by your civilization, minus 10"',
});

/** THE GARRISON TERM: a military unit of the holder on the centre adds what
 *  its Combat, less one point per this many hit points of damage, stands
 *  above the holder's base — max(0, Combat - damage / 10 - base), nothing
 *  when it is no stronger (`garrisonCS`). The Civilopedia: "the strongest
 *  melee unit built by your civilization, minus 10, or ... the Combat
 *  Strength of a garrisoned military unit". */
export const GARRISON_HP_PER_CS = srcConst('combat.garrisonHpPerCs', 10, {
  lab: 'runs/garrison_scale_20260926T081246Z.jsonl and runs/h1_duelw1103_20260927T190654Z.jsonl',
  note: 'base 55: an Infantry (75) adds 20, 19, 17.5, 15, 12.5, 11 at damage 0, 10, 25, 50, 75, 90; a Warrior (20) and a Musketman (55) add 0 at every damage; in the harness Duel 1103, Rome t22-26 a wounded Warrior, a Galley 30 on 20, a Caravel 66, a Battleship 73',
});
/** a city-state's centre, per envoy it holds from every major together */
export const ENVOY_CITY_CS = srcConst('combat.envoyCityCs', 1, gp('COMBAT_STRENGTH_FROM_ENVOYS'));

/** CIV6 (GlobalParameters.xml): COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE 20 —
 *  the one number the install publishes beside the cavalry capture's
 *  permission. The curve through it is this model's (STYLIZED, owner
 *  ruling): an even fight is a coin flip, certain at +base, nothing at
 *  -base — see `captureRoll`. */
export const CAPTURE_BASE_STRENGTH_DIFF = srcConst('combat.captureBaseDiff', 20,
  gp('COMBAT_BASE_CAPTURE_STRENGTH_DIFFERENCE'));
/** the hit points a captured unit arrives with — STYLIZED, no source */
export const CAPTURED_UNIT_HP = srcConst('combat.capturedHp', 25,
  { stylized: 'the hit points a captured unit arrives with; the install publishes none' });

/** Each citizen contributes these yields directly (Civ 6). */
export const CITIZEN_SCIENCE = srcConst('citizenScience', 0.5, {
  derived: 'SCIENCE_PERCENTAGE_YIELD_PER_POP / 100 — the install writes the share as a percentage',
  inputs: [gp('SCIENCE_PERCENTAGE_YIELD_PER_POP')],
});
export const CITIZEN_CULTURE = srcConst('citizenCulture', 0.3, {
  derived: 'CULTURE_PERCENTAGE_YIELD_PER_POP / 100 — the install writes the share as a percentage',
  inputs: [gp('CULTURE_PERCENTAGE_YIELD_PER_POP')],
});

export const CITY_CENTER_MIN_FOOD = srcConst('centerMinFood', 2,
  gp('YIELD_FOOD_CITY_TERRAIN_REPLACE'));
/** CIV6 (GlobalParameters, PILLAGE_BUILDING_REPAIR_PERCENT 25): a pillaged
 *  building is repaired from its city's queue for this share of its price. */
export const PILLAGE_BUILDING_REPAIR_PERCENT = srcConst('pillageBuildingRepairPct', 25,
  gp('PILLAGE_BUILDING_REPAIR_PERCENT'));
export const CITY_CENTER_MIN_PRODUCTION = 1;

export const CITY_GROWTH_THRESHOLD = srcConst('constants.cityGrowthThreshold', 15, gp('CITY_GROWTH_THRESHOLD'));
export const CITY_GROWTH_MULTIPLIER = srcConst('constants.cityGrowthMultiplier', 8, gp('CITY_GROWTH_MULTIPLIER'));
export const CITY_GROWTH_EXPONENT = srcConst('constants.cityGrowthExponent', 1.5, gp('CITY_GROWTH_EXPONENT'));

/** Food needed to grow from `pop` to `pop`+1: (THRESHOLD + MULTIPLIER·(p−1) +
 * (p−1)^EXPONENT) at the online speed, floored after the speed's scaling —
 * 7, 12, 16, 22, 27, 33, 38 … 57, the game's `GetGrowthThreshold` on
 * population 1–7 and 10 in runs/h1_duelw1103 / 1104. The GPU twin is
 * `_growth_needed`. */
export function growthFoodNeeded(pop: number): number {
  return scaleByGameSpeed(CITY_GROWTH_THRESHOLD + CITY_GROWTH_MULTIPLIER * (pop - 1)
    + Math.pow(pop - 1, CITY_GROWTH_EXPONENT));
}

export function housingGrowthFactor(remaining: number): number {
  if (remaining >= 2) return 1;
  if (remaining >= 1) return 0.5;
  return 0.25;
}

/** CIV6 (CITY_POP_PER_AMENITY 2): a city needs one Amenity per this many
 *  citizens, rounded up — the need `GetAmenitiesNeeded` reads in the live
 *  game (1 at pop 1, 2 at 4, 3 at 5 and 6, 4 at 7, 5 at 9, 6 at 12, 7 at 13),
 *  and the tier is the named supply less exactly that. */
export const CITY_POP_PER_AMENITY = srcConst('amenityPopPer', 2, gp('CITY_POP_PER_AMENITY'));

export function amenitiesNeeded(pop: number): number {
  return Math.ceil(pop / CITY_POP_PER_AMENITY);
}

export interface AmenityTier {
  name: string;
  growthFactor: number;
  yieldFactor: number;
}

/** Tier from amenity balance (have - needed). CIV6 (`Happinesses`, all seven
 * rows, as `Expansion2_Buildings.xml`'s updates leave them):
 * `MinimumAmenityScore` is `min`, `GrowthModifier` and `NonFoodYieldModifier`
 * are the two factors as 1 + pct/100 — Ecstatic 5+, Happy 3..4, Content
 * 0..2, Displeased −1..−2, Unhappy −3..−4, Unrest −5..−6, Revolt −7 and
 * below. The rows' `RebellionPoints` are not modelled. */
export const AMENITY_TIERS: readonly (AmenityTier & { min: number })[] = [
  { min: 5, name: 'Ecstatic', growthFactor: 1.2, yieldFactor: 1.2 },
  { min: 3, name: 'Happy', growthFactor: 1.1, yieldFactor: 1.1 },
  { min: 0, name: 'Content', growthFactor: 1, yieldFactor: 1 },
  { min: -2, name: 'Displeased', growthFactor: 0.85, yieldFactor: 0.9 },
  { min: -4, name: 'Unhappy', growthFactor: 0.7, yieldFactor: 0.8 },
  { min: -6, name: 'Unrest', growthFactor: 0, yieldFactor: 0.7 },
  { min: -999, name: 'Revolt', growthFactor: 0, yieldFactor: 0.6 },
];

export function amenityTier(balance: number): AmenityTier {
  return AMENITY_TIERS.find((t) => balance >= t.min) ?? AMENITY_TIERS[AMENITY_TIERS.length - 1];
}

/** The tier's WIRE index — the row order both engines address a tier by. */
export function amenityTierIndex(name: string): number {
  return AMENITY_TIERS.findIndex((t) => t.name === name);
}

/**
 * Housing from city-site water access.
 *
 * SOURCING SWEEP: VERIFIED CORRECT against the Civilization
 * wiki's Housing / Aqueduct pages — real Civ 6 gives 5 Housing for fresh water
 * (river/lake/oasis), 3 for coastal and 2 for no water, and the Aqueduct raises
 * a non-fresh city to a TOTAL of 6 (so +4 landlocked, +3 coastal) while adding
 * a flat +2 to a city that already has fresh water. All five values below
 * already matched; no change was needed. Recorded so the next sweep does not
 * re-derive it.
 */
const housingWiki = (what: string) => ({
  pedia: `the GS Housing / Aqueduct pages (${what}); the install carries city-site housing as a `
    + 'DLL rule, not as a readable column',
});
export const HOUSING_FRESH_WATER = srcConst<number>('housing.fresh', 5,
  housingWiki('5 for fresh water'));
export const HOUSING_COASTAL = srcConst<number>('housing.coastal', 3, housingWiki('3 for coastal'));
export const HOUSING_NO_WATER = srcConst<number>('housing.none', 2, housingWiki('2 for no water'));
export const AQUEDUCT_FRESH_BONUS = srcConst('housing.aqFreshBonus', 2,
  gp('CITY_POPULATION_AQUEDUCT_BOOST'));
export const AQUEDUCT_NO_FRESH_TOTAL = srcConst('housing.aqNoFreshTotal', 6,
  gp('CITY_POPULATION_AQUEDUCT_MIN'));

export const LUXURY_AMENITY_CITIES = 4;

export const REGIONAL_RANGE = 6;

/**
 * CIV6 (GS): "each source produces a certain number of the resource per turn,
 * which is then added to your stockpile" — the number is the improved tile's
 * own GS yield, per resource page. An unimproved or pillaged source produces
 * nothing, which is the same predicate `civHasStrategic` already asks.
 */
const perTurn = (res: string, n: number) => srcConst(`strategic.rate.${res}`, n, {
  pedia: `the GS ${res.charAt(0)}${res.slice(1).toLowerCase()} resource page — the improved tile's `
    + 'own per-turn stockpile yield; the install writes it as an improvement modifier, '
    + 'not as a Resources column',
});
export const STRATEGIC_PER_TURN: Record<string, number> = {
  HORSES: perTurn('HORSES', 2),
  IRON: perTurn('IRON', 2),
  NITER: perTurn('NITER', 2),
  COAL: perTurn('COAL', 3),
  OIL: perTurn('OIL', 3),
  ALUMINUM: perTurn('ALUMINUM', 2),
  URANIUM: perTurn('URANIUM', 3),
};

/** The stockpile index space: one slot per strategic resource, in the order
 *  above. Both engines address a stockpile by slot, and the wire ships the
 *  slot -> resource-table mapping so a tile's `rid` can find it. */
export const STRATEGIC_IDS: string[] = Object.keys(STRATEGIC_PER_TURN);

/** A fresh, empty bank — the one place the stockpile's shape is written. */
export function emptyStockpile(): number[] {
  return STRATEGIC_IDS.map(() => 0);
}

/** How far a Trader's road-laying walk may reach in one leg. It lives here,
 *  in a LEAF module: `TRADE_WALK_EXPIRY_RAIL` is computed from it at module
 *  load, and a cycle between trade.ts and units.ts would leave that NaN. */
export const TRADE_ROAD_MAX_STEPS = 32;

/** CIV6 (GS): "The maximum stockpile amount is initially 50 for each resource
 *  but constructing Encampment buildings in your empire (Barracks, Armory,
 *  etc.) will increase your maximum stockpile by 10 per building for all
 *  resources." */
export const STOCKPILE_CAP_BASE = srcConst('strategic.capBase', 50, {
  pedia: 'the GS Resources page ("The maximum stockpile amount is initially 50 for each resource"); '
    + 'the install carries the cap as a DLL rule',
});
export const STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING =
  srcConst('strategic.capPerEncampmentBuilding', 10, {
    pedia: 'the GS Resources page ("increase your maximum stockpile by 10 per building")',
  });

/** CIV6 (GS): every unit in this roster that asks for a strategic resource
 *  asks for 20 of it, paid "at the moment you start production (or the moment
 *  you purchase it)" — Horseman, Swordsman, Knight, Musketman and Bombard each
 *  say so on their own page. */
export const UNIT_RESOURCE_COST = srcConst('constants.UNIT_RESOURCE_COST', 20, {
  pedia: 'the GS unit pages (Horseman, Swordsman, Knight, Musketman, Bombard each ask 20 of their '
    + 'strategic resource at the moment production starts)',
});

/** CIV6 (Resource, GS): a unit whose seat could not meet its fuel bill this
 *  turn fights at "-20 Insufficient <resource>" (the combat preview's line) —
 *  GlobalParameters COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL, a flat 20. */
export const FUEL_SHORT_CS = srcConst('strategic.fuelShortCs', 20,
  gp('COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL'));

export function maxSpecialtyDistricts(pop: number): number {
  return Math.floor((pop - 1) / 3) + 1;
}

export const CITY_NAMES = [
  'Aurelia', 'Brightwater', 'Cedarholm', 'Dunmore', 'Eastgate', 'Fairhaven',
  'Goldcrest', 'Highbury', 'Ironvale', 'Jadeport', 'Kingsmere', 'Larkspur',
  'Mistral', 'Northwind', 'Oakenshield', 'Pinecrest', 'Quarrytown', 'Ravenrock',
  'Silverbrook', 'Thornfield', 'Umberlight', 'Vantage', 'Westmarch', 'Yarrow',
  'Zephyria', 'Ashford', 'Briarwood', 'Coldspring', 'Dawnstar', 'Elmsworth',
  'Foxglove', 'Greyharbor', 'Hollowbrook', 'Ivorygate', 'Juniper', 'Kestrel',
];

/** CIV6 (GameCore_XP2_Release.dll 0x519090, tools/civ6lab/dll_readings.md
 *  "C-34"; `dll_damage.py` 12 of 12 drawn interceptions and 12 of 12
 *  previews): one hit deals
 *  `trunc((COMBAT_BASE_DAMAGE + rand(COMBAT_MAX_EXTRA_DAMAGE)) × expf(x / 256) + 0.5)`
 *  in single precision, clamped to [COMBAT_MINIMUM_DAMAGE, COMBAT_MAX_HIT_POINTS],
 *  where D = floor(256 × (S_att − S_def)) and x = (k × D) >> 8 with
 *  k = trunc(256 × COMBAT_POWER_SCALING) = 10 — a factor e^(10/256) = 1.03984
 *  per strength point. COMBAT_DAMAGE_MULTIPLIER_MINIMUM 0.25 does NOT floor
 *  this multiplier (a Warrior previews 1 against a GDR). */
export const COMBAT_BASE_DAMAGE = srcConst('combat.baseDamage', 24, gp('COMBAT_BASE_DAMAGE'));
export const COMBAT_MAX_EXTRA_DAMAGE = srcConst('combat.maxExtraDamage', 12, gp('COMBAT_MAX_EXTRA_DAMAGE'));
export const COMBAT_POWER_SCALING = srcConst('combat.powerScaling', 0.04, gp('COMBAT_POWER_SCALING'));
export const COMBAT_MINIMUM_DAMAGE = srcConst('combat.minimumDamage', 1, gp('COMBAT_MINIMUM_DAMAGE'));
export const COMBAT_MAX_HIT_POINTS = srcConst('combat.maxHitPoints', 100, gp('COMBAT_MAX_HIT_POINTS'));
/** the DLL's COMBAT_POWER_SCALING in 1/256ths, truncated (0x519370): 10 */
export const COMBAT_POWER_SCALING_256 = Math.trunc(COMBAT_POWER_SCALING * 256);
/** the reach of the exported factor table, in 1/256ths of the exponent: a
 *  strength difference of ±200 */
export const DAMAGE_EXPONENT_REACH = 2000;

/** the damage law's exponent x, in 1/256ths, for a strength difference. The
 *  difference is rounded to 1/1000 first, so both engines floor one integer
 *  whatever float noise their sums carry; then D = floor(256·Δ) and
 *  x = (k·D) >> 8, both floors as the DLL's shifts are. */
export function damageExponent(strengthDiff: number): number {
  const milli = Math.round(strengthDiff * 1000);
  const d256 = Math.floor((milli * 256) / 1000);
  return Math.floor((COMBAT_POWER_SCALING_256 * d256) / 256);
}

/** e^(x / 256) as the DLL's single-precision `expf` returns it. */
export function damageFactor(x: number): number {
  return Math.fround(Math.exp(x / 256));
}

/** one hit's damage from the draw `roll` (0..11) and the exponent `x`: the
 *  product and the half added in single precision, truncated, clamped. The
 *  exponent is held to the exported table's reach, past which every draw
 *  already clamps to the same damage. */
export function damageOf(roll: number, x: number): number {
  const xc = Math.max(-DAMAGE_EXPONENT_REACH, Math.min(DAMAGE_EXPONENT_REACH, x));
  const v = Math.trunc(Math.fround(Math.fround((COMBAT_BASE_DAMAGE + roll) * damageFactor(xc)) + 0.5));
  return Math.min(COMBAT_MAX_HIT_POINTS, Math.max(COMBAT_MINIMUM_DAMAGE, v));
}
