/**
 * THE GAME'S DRAW SITES, by the label its draw log gives each
 * (`Logs/RandCalls.csv`, `randLog.ts`; `tools/civ6lab/dll_readings.md` "H-1:
 * the draw log's labels"), against the engines' draw sites: the TS function
 * and its GPU twin that take the same draw. Counts are runs/h1_duelw1117
 * (t1-250, 21,322 draws) and runs/h1_duelw1118 (t1-278, 23,169).
 *
 * `owner`:
 *  - `rule`: an engine rule both engines draw where the game does;
 *  - `lacking`: an engine rule the engines do not draw (region names, quests,
 *    the dig sites' eras and artifacts, the barbarians' camp step as the DLL
 *    runs it);
 *  - `ai`: a choice of the game's AI — the driver's, not the engines';
 *  - `setup`: the game's set-up, before the first player's first start.
 * `step`: a draw of the turn's random-event step, the last the turn takes
 * before the first player's start (`replayEvents`).
 */

export type DrawOwner = 'rule' | 'lacking' | 'ai' | 'setup';

export interface DrawSite {
  owner: DrawOwner;
  /** the TS engine's site and its GPU twin */
  cpu?: string;
  gpu?: string;
  /** the DLL's drawing function, where read */
  dll?: string;
  step?: boolean;
  /** draws on 1117 / 1118 */
  n: [number, number];
}

/** A label as the log writes it, the player suffix ("..., Player: 1")
 *  dropped. */
export function siteLabel(label: string): string {
  return label.replace(/, Player: \d+$/, '');
}

export const DRAW_SITES: Readonly<Record<string, DrawSite>> = {
  // the turn's random-event step
  'Random Event Roll': { owner: 'rule', step: true, cpu: 'randomEvent (over 1 on the sea rise: seaRise)', gpu: '_random_event (_sea_rise)', dll: '0x335260', n: [249, 277] },
  'Active Volcano Roll': { owner: 'rule', step: true, cpu: 'volcanoRoll', gpu: '_volcano_roll', dll: '0x335040', n: [243, 277] },
  'Choose Active Volcano Roll': { owner: 'rule', step: true, cpu: 'volcanoRoll', gpu: '_volcano_roll', n: [2, 3] },
  'Choose Inactive Volcano Roll': { owner: 'rule', step: true, cpu: 'volcanoRoll', gpu: '_volcano_roll', n: [0, 1] },
  'Storm Direction': { owner: 'rule', step: true, cpu: 'stormWalk', gpu: '_storm_walk', n: [89, 248] },
  'Storm Direction Preview': { owner: 'rule', step: true, cpu: 'stormPreview', gpu: '_storm_preview', n: [21, 57] },
  'Pick Storm Start Plot': { owner: 'rule', step: true, cpu: 'stormStart', gpu: '_storm_birth', n: [7, 19] },
  'Pillage Improvement Chance': { owner: 'rule', step: true, cpu: 'floodRiver, erupt, stormPlot, fireStrike, droughtTile, nuclearAccident',
    gpu: '_flood_river, _erupt, _storm_plot, _fire_strike, _drought_tile, _nuclear_accident', dll: '0x286530', n: [2313, 4896] },
  'Boosted Yield Chance': { owner: 'rule', step: true, cpu: 'floodRiver, stormPlot, fireStrike', gpu: '_flood_river, _storm_plot, _fire_strike', n: [1143, 975] },
  'Fertility Gain Chance': { owner: 'rule', step: true, cpu: 'erupt', gpu: '_erupt', n: [90, 84] },
  'Random Event Unit Damage Roll': { owner: 'rule', step: true, cpu: 'unitDamageDraws, eventDamage', gpu: '_unit_damage_draws, _event_damage', dll: '0x3366a0', n: [28, 28] },
  'Pick One Off Start Plot': { owner: 'rule', step: true, cpu: 'fireEvent, meteor (pick)', gpu: '_random_event', n: [5, 9] },
  'Pick Drought Start Plot': { owner: 'rule', step: true, cpu: 'droughtStart', gpu: '_drought_start', dll: '0x287e80', n: [0, 4] },
  'Remove Fertility Chance': { owner: 'rule', step: true, cpu: 'removeFertility', gpu: '_remove_fertility', dll: '0xa19bd0', n: [0, 0] },
  // a player's start and actions
  'GetNextBuyablePlot picker': { owner: 'rule', cpu: 'drawBorderPlot', gpu: '_seat_border_draw', dll: '0x1ab1c0', n: [2187, 2766] },
  'Unit Combat Damage': { owner: 'rule', cpu: 'damageRoll', gpu: '_damage_roll', n: [607, 705] },
  'Random Promotion': { owner: 'rule', cpu: 'drawPromoOffer', gpu: '_promo_offer_draw', dll: '0x4f23a0', n: [60, 194] },
  'Generating a random new Great Person': { owner: 'rule', cpu: 'ensureGpOffer, recruit', gpu: '_pick_live, _gp_claim', dll: '0x2f94d0', n: [37, 40] },
  'World Congress Resolutions': { owner: 'rule', cpu: 'congressSession', gpu: '_congress_draw_slate', dll: '0x598270', n: [39, 43] },
  'Choosing random tech boost to grant based on era': { owner: 'rule', cpu: 'drawBoosts', gpu: '_draw_boosts', dll: '0x4ca470, 0x4caa50', n: [12, 16] },
  'Choosing random civic boost to grant based on era': { owner: 'rule', cpu: 'drawBoosts', gpu: '_draw_boosts', dll: '0x39c330, 0x39c930', n: [8, 7] },
  'Choosing random tech to grant based on era': { owner: 'rule', cpu: 'grantFreeResearch, freeTechs', gpu: '_grant_free_research', dll: '0x4caeb0', n: [4, 1] },
  'Choosing a Goody Hut Type': { owner: 'rule', cpu: 'drawGoodyReward', gpu: '_draw_goody_reward', n: [9, 11] },
  'Choosing a Sub Type': { owner: 'rule', cpu: 'drawGoodyReward', gpu: '_draw_goody_reward', dll: '0x42c980', n: [9, 11] },
  'Choosing a Relic': { owner: 'rule', cpu: 'createRelic', gpu: '_create_relic', dll: '0x296c00', n: [0, 0] },
  // the engines' rules not drawn where the game draws
  'Barbarian Ranged unit roll': { owner: 'lacking', cpu: 'barbarianPhase', gpu: '_barbarian_phase', dll: '0x1488a0', n: [40, 48] },
  'Barbarian camp region placement': { owner: 'lacking', cpu: 'barbarianPhase', gpu: '_barbarian_phase', dll: '0x14fcc0', n: [5, 6] },
  'Barbarian camp location': { owner: 'lacking', cpu: 'barbarianPhase', gpu: '_barbarian_phase', dll: '0x14fcc0', n: [5, 6] },
  'Barb Tribe Roll': { owner: 'lacking', cpu: 'barbarianPhase', gpu: '_barbarian_phase', dll: '0x152460', n: [5, 6] },
  'Choosing a City Name': { owner: 'rule', cpu: 'foundCityAt', gpu: '_found_city_at', dll: '0x327c30', n: [11, 10] },
  'Choosing a Citizen Name': { owner: 'rule', cpu: 'drawCitizenName (a Spy, an Archaeologist, a storm)', gpu: '_draw_citizen_name', dll: '0x486c20', n: [13, 34] },
  // a plot first revealed (0x534950, from the sight update 0x58aa90) names
  // its river (0xa29730 -> 0xa292a0) and its territory (0xa36ff0: desert,
  // sea, ocean, lake, mountain range, volcano)
  'Random River': { owner: 'lacking', dll: '0xa292a0', n: [9, 7] },
  'Random Sea': { owner: 'lacking', dll: '0xa36ff0', n: [2, 4] },
  'Random Desert': { owner: 'lacking', dll: '0xa36ff0', n: [3, 2] },
  'Random Volcano': { owner: 'lacking', dll: '0xa36ff0', n: [2, 2] },
  'Random Mountain Range': { owner: 'lacking', dll: '0xa36ff0', n: [1, 3] },
  'Random Ocean': { owner: 'lacking', dll: '0xa36ff0', n: [2, 1] },
  'Random Lake Range': { owner: 'lacking', dll: '0xa36400', n: [1, 0] },
  // a city-state's quest for a major (Game_Quests 0x939980, on an era's
  // change, a meeting, the refresh): one uniform pick over the quest types
  // valid for the pair, then the type's own picker
  'Selecting a random new quest': { owner: 'lacking', dll: '0x939980', n: [12, 11] },
  'Choosing random tech type for Trigger Tech Boost quest': { owner: 'lacking', dll: '0x84d870', n: [4, 2] },
  'Choosing random civic type for Trigger Civic Boost quest': { owner: 'lacking', n: [3, 2] },
  'Choosing random unit type for Train Unit quest': { owner: 'lacking', n: [3, 1] },
  'Choosing random district type for Zone District quest': { owner: 'lacking', n: [1, 1] },
  'Choosing random class type for Recruit Great Person Class quest': { owner: 'lacking', n: [0, 2] },
  'Random Era for Antiquity Site': { owner: 'lacking', dll: '0x280140', n: [3, 0] },
  'Choosing Artifact': { owner: 'lacking', n: [0, 3] },
  // the AI's
  'Random Direction': { owner: 'ai', n: [12754, 10982] },
  'City Build District Choice': { owner: 'ai', n: [105, 171] },
  'BT Research Choice': { owner: 'ai', dll: '0x763020', n: [108, 121] },
  'Random Civic Choice': { owner: 'ai', dll: '0x626600', n: [1, 0] },
  'Random congress resolution target': { owner: 'ai', dll: '0x611140', n: [18, 12] },
  'Choose random agenda': { owner: 'ai', n: [3, 3] },
  // a unit's name the AI's behaviour builds for its log (NameManager
  // 0x328760 through 0x327de0, called only from the behaviour tree: "HL:
  // Rock Band Move" 0x710f40 and the CITY_ASSAULT operation 0x722690): two
  // parts, the band names over 118 and 155
  'NameManager::GetUnitNamePart': { owner: 'ai', dll: '0x328760', n: [10, 24] },
  // the set-up
  'Random Diplomatic Value': { owner: 'setup', n: [896, 896] },
  'Unknown': { owner: 'setup', n: [96, 96] },
  'Choosing a random prerequisite for a tech to have': { owner: 'setup', n: [11, 9] },
  'Choosing how many prerequisites for a tech to have': { owner: 'setup', n: [8, 8] },
  'Choosing a random cost for a tech to have': { owner: 'setup', n: [6, 6] },
  'Choosing a random prerequisite for a civic to have': { owner: 'setup', n: [8, 7] },
  'Choosing how many prerequisites for a civic to have': { owner: 'setup', n: [6, 6] },
  'Choosing a random cost for a civic to have': { owner: 'setup', n: [5, 5] },
};

/** The engines' draw sites the game has no site for: the driver's stand-ins
 *  for the AI's choices the game takes without a draw of its own, or by
 *  another rule. Each draws under an `Engine:` label (`DrawLabel`), which the
 *  action replay never holds (`streamHold`). */
export const ENGINE_ONLY_SITES: readonly { cpu: string; gpu: string; why: string }[] = [
  { cpu: 'walkUnit, drawStep', gpu: '_walk_units', why: "a city-state's and a Free City's units' walk: the AI's moves (the game's \"Random Direction\" is its own)" },
  { cpu: 'minorPlan, minorPurchases, minorBuyMilitary, minorBuyNaval, minorBuilders', gpu: '_minor_plan, _minor_buy_land, _minor_buy_naval, _minor_builders', why: "a city-state's builds and buys: the AI's" },
  { cpu: 'seatPhase (the pantheon race)', gpu: '_seat_pantheon_race', why: 'the pantheon: the AI picks its belief with no draw of the game\'s' },
];

/** the replay's draws whose range it does not read: a storm's name (the
 *  pool of names left), the volcano roll's choice (the sleeping or waking
 *  named volcanoes, its branch the record does not show) */
const RANGE_UNREAD: Readonly<Record<string, readonly string[]>> = {
  'Choosing a Citizen Name': ['Choosing a Citizen Name'],
  'Choose Active Volcano Roll': ['Choose Active Volcano Roll', 'Choose Inactive Volcano Roll'],
};

/** Does a replayed draw stand for the logged one: the same label, and the
 *  same range where the replay reads it. */
export function sameDraw(ours: { label: string; range: number }, logged: { label: string; range: number } | undefined): boolean {
  if (!logged) return false;
  const loose = RANGE_UNREAD[ours.label];
  if (loose) return loose.includes(logged.label);
  return siteLabel(ours.label) === siteLabel(logged.label) && ours.range === logged.range;
}

/** Is the label a draw of the turn's random-event step? */
export function stepLabel(label: string): boolean {
  return !!DRAW_SITES[siteLabel(label)]?.step;
}

/** The turn's random-event step in the log's draws of the gap it lies in
 *  (the barbarians' completed start to the first player's), [from, to): the
 *  run of step draws holding the gap's last "Random Event Roll" — the
 *  storms' walks, the fires' turns and the volcano roll before it, the
 *  event's own draws after it, a storm's name among them. The quests' and
 *  the era's draws may follow it. Undefined with no roll in the gap. */
export function loggedStep(gap: readonly { label: string }[]): [number, number] | undefined {
  let r = gap.length - 1;
  while (r >= 0 && gap[r].label !== 'Random Event Roll') r--;
  if (r < 0) return undefined;
  let from = r;
  while (from > 0 && stepLabel(gap[from - 1].label)) from--;
  let to = r + 1;
  while (to < gap.length && (stepLabel(gap[to].label) || gap[to].label === 'Choosing a Citizen Name')) to++;
  return [from, to];
}
