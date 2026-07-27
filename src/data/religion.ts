/**
 * Religion: pantheons, follower/founder beliefs and worship buildings
 * (base-game inspired, eyeballed values; spread/pressure isn't modeled —
 * once founded, all of your cities follow your religion, so "followers"
 * means your total population).
 */

import type { GreatPersonClass, ResourceCategory, Yields } from '../core/types';

export interface BeliefEffects {
  /** Extra yields per improvement instance. */
  improvementYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra yields on tiles with these features. */
  featureYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra yields for improvements sitting on a resource of this category. */
  improvementOnResource?: { category: ResourceCategory; yields: Partial<Yields> };
  /** Border expansion cost multiplier (0.85 = 15% cheaper). */
  borderCostMult?: number;
  /** Growth multiplier for all cities. */
  growthMult?: number;
  /** +GPP per city that has the class's district. */
  gppFlat?: Partial<Record<GreatPersonClass, number>>;
  /** Holy Site adjacency bonus also yields production (Work Ethic). */
  workEthic?: boolean;
  /** Extra yields on specific buildings. */
  buildingYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra housing on specific buildings. */
  buildingHousing?: Partial<Record<string, number>>;
  /** +1 amenity in cities with N+ specialty districts (Zen Meditation). */
  amenitiesIfSpecialty?: { min: number; amenities: number };
  /** Amenity/housing for cities whose center touches a river (River Goddess). */
  riverCity?: { amenities: number; housing: number };
  /** Faith per completed world wonder in the city (Divine Inspiration). */
  faithPerWonder?: number;
  /** Founder income per N followers (followers = your total population). */
  perFollowers?: { per: number; yields: Partial<Yields> };
  /** Founder income per city. */
  perCity?: Partial<Yields>;
  /** B6-S1: extra holy-center pressure range (Itinerant Preachers). */
  pressureRangeBonus?: number;
  /** B6-S1: extra yields on each trade route whose DESTINATION city follows
   * this religion (Messenger of the Gods). */
  tradeReligionYields?: Partial<Yields>;
  /** B6-S1: +CS in unit-vs-unit combat within JUST_WAR_RANGE tiles of a city
   * following this religion (Just War). Applies attacking and defending. */
  combatNearFollowing?: number;
  /** B6-S1: +CS DEFENDING (unit-vs-unit) on a tile owned by a city following
   * this religion (Defender of the Faith). */
  combatDefendFollowing?: number;
  /** B6-S1: +CS ATTACKING a unit standing on a tile owned by a city following
   * this religion (Crusade). */
  combatVsUnitInFollowing?: number;
  /** B6-S2: extra missionary spread charges (Scripture +1). */
  missionaryChargeBonus?: number;
  /** B6-S2: multiplier on the SPREAD_PRESSURE lump (Scripture ×1.5 → 15,
   * integer-exact after Math.round). */
  spreadPressureMult?: number;
  /** B6-S2: multiplier on the missionary faith price (Holy Order ×0.7 →
   * round(60·0.7) = 42). */
  missionaryCostMult?: number;
}

export interface BeliefDef {
  id: string;
  name: string;
  description: string;
  effects: BeliefEffects;
}

const B = (id: string, name: string, description: string, effects: BeliefEffects): BeliefDef =>
  ({ id, name, description, effects });

export const PANTHEONS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('GOD_OF_THE_OPEN_SKY', 'God of the Open Sky', '+1 culture from each Pasture.', {
      improvementYields: { PASTURE: { culture: 1 } },
    }),
    B('GODDESS_OF_THE_HUNT', 'Goddess of the Hunt', '+1 food and +1 production from each Camp.', {
      improvementYields: { CAMP: { food: 1, production: 1 } },
    }),
    B('GOD_OF_THE_SEA', 'God of the Sea', '+1 production from each Fishing Boats.', {
      improvementYields: { FISHING_BOATS: { production: 1 } },
    }),
    B('STONE_CIRCLES', 'Stone Circles', '+2 faith from each Quarry.', {
      improvementYields: { QUARRY: { faith: 2 } },
    }),
    B('ORAL_TRADITION', 'Oral Tradition', '+1 culture from each Plantation.', {
      improvementYields: { PLANTATION: { culture: 1 } },
    }),
    B('LADY_OF_THE_REEDS', 'Lady of the Reeds and Marshes', '+2 production from Marsh, Oasis and Floodplains tiles.', {
      featureYields: { MARSH: { production: 2 }, OASIS: { production: 2 }, FLOODPLAINS: { production: 2 } },
    }),
    B('GOD_OF_CRAFTSMEN', 'God of Craftsmen', '+1 production from improved strategic resources.', {
      improvementOnResource: { category: 'strategic', yields: { production: 1 } },
    }),
    B('RELIGIOUS_SETTLEMENTS', 'Religious Settlements', 'Border expansion is 15% cheaper.', {
      borderCostMult: 0.85,
    }),
    B('FERTILITY_RITES', 'Fertility Rites', '+10% growth in all cities.', {
      growthMult: 1.1,
    }),
    B('DIVINE_SPARK', 'Divine Spark', '+1 great person point from Holy Sites (Prophet), Campuses (Scientist) and Theater Squares (Artist).', {
      gppFlat: { PROPHET: 1, SCIENTIST: 1, ARTIST: 1 },
    }),
    B('RIVER_GODDESS', 'River Goddess', '+1 amenity and +1 housing in cities whose center is on a river.', {
      riverCity: { amenities: 1, housing: 1 },
    }),
    // B-18/B-27: catalog expansion to the real GS pantheon roster (25 total).
    // Two land on the improvementOnResource channel; the rest need absent
    // systems (Holy-Site adjacency, tile appeal, combat, production-toward-X)
    // and land INERT (empty effects) — every degradation recorded in
    // gpu/ROUND_B2_LOG.md.
    B('GODDESS_OF_FESTIVALS', 'Goddess of Festivals', '+1 culture from improved luxury resources.', {
      // GS: +1 culture from Plantation/Vineyard luxuries. Degrade: any
      // improvement on a luxury resource (channel is improvement-agnostic).
      improvementOnResource: { category: 'luxury', yields: { culture: 1 } },
    }),
    B('RELIGIOUS_IDOLS', 'Religious Idols', '+2 faith from improved bonus resources.', {
      // GS: +2 faith from Mines/Quarries over bonus & luxury resources.
      // Degrade: bonus category only, improvement-agnostic.
      improvementOnResource: { category: 'bonus', yields: { faith: 2 } },
    }),
    B('CITY_PATRON_GODDESS', 'City Patron Goddess', '+25% production toward districts in cities without one.', {}),
    B('DANCE_OF_THE_AURORA', 'Dance of the Aurora', 'Holy Sites gain +1 faith from adjacent Tundra tiles.', {}),
    B('DESERT_FOLKLORE', 'Desert Folklore', 'Holy Sites gain +1 faith from adjacent Desert tiles.', {}),
    B('EARTH_GODDESS', 'Earth Goddess', '+1 faith from tiles with Charming or Breathtaking appeal.', {}),
    B('FIRE_GODDESS', 'Fire Goddess', 'Holy Sites gain +1 faith from adjacent Geothermal Fissures.', {}),
    B('GOD_OF_HEALING', 'God of Healing', 'Units heal +30 HP in or next to a Holy Site.', {}),
    B('GOD_OF_THE_FORGE', 'God of the Forge', '+25% production toward ancient and classical military units.', {}),
    B('GOD_OF_WAR', 'God of War', 'Bonus combat strength near friendly Holy Sites; faith from kills.', {}),
    B('GODDESS_OF_THE_HARVEST', 'Goddess of the Harvest', 'Harvesting resources or removing features yields faith.', {}),
    B('INITIATION_RITES', 'Initiation Rites', '+50 faith for each barbarian outpost cleared.', {}),
    B('MONUMENT_TO_THE_GODS', 'Monument to the Gods', '+15% production toward ancient and classical wonders.', {}),
    B('SACRED_PATH', 'Sacred Path', 'Holy Sites gain +1 culture and +1 faith from adjacent Rainforest tiles.', {}),
  ].map((b) => [b.id, b]),
);

export const FOLLOWER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('WORK_ETHIC', 'Work Ethic', 'Holy Site adjacency bonus also provides production.', {
      workEthic: true,
    }),
    B('FEED_THE_WORLD', 'Feed the World', 'Shrines +1 food, Temples +2 food.', {
      buildingYields: { SHRINE: { food: 1 }, TEMPLE: { food: 2 } },
    }),
    B('CHORAL_MUSIC', 'Choral Music', 'Shrines +2 culture, Temples +4 culture.', {
      buildingYields: { SHRINE: { culture: 2 }, TEMPLE: { culture: 4 } },
    }),
    B('RELIGIOUS_COMMUNITY', 'Religious Community', '+1 housing from Shrines and Temples.', {
      buildingHousing: { SHRINE: 1, TEMPLE: 1 },
    }),
    B('ZEN_MEDITATION', 'Zen Meditation', '+1 amenity in cities with 2+ specialty districts.', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    B('DIVINE_INSPIRATION', 'Divine Inspiration', '+2 faith from each world wonder in the city.', {
      faithPerWonder: 2,
    }),
    // B-18/B-27: real GS follower beliefs whose effects need absent systems
    // (faith-purchase of non-worship buildings, relics/tourism, unique units)
    // — land INERT, recorded in gpu/ROUND_B2_LOG.md.
    B('JESUIT_EDUCATION', 'Jesuit Education', 'May purchase Campus and Theater Square buildings with faith.', {}),
    B('RELIQUARIES', 'Reliquaries', 'Triple faith and tourism from relics.', {}),
    B('WARRIOR_MONKS', 'Warrior Monks', 'May train Warrior Monks (a religious melee unit).', {}),
  ].map((b) => [b.id, b]),
);

export const FOUNDER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('TITHE', 'Tithe', '+1 gold for every 4 followers.', {
      perFollowers: { per: 4, yields: { gold: 1 } },
    }),
    B('WORLD_CHURCH', 'World Church', '+1 culture for every 5 followers.', {
      perFollowers: { per: 5, yields: { culture: 1 } },
    }),
    B('CROSS_CULTURAL_DIALOGUE', 'Cross-Cultural Dialogue', '+1 science for every 5 followers.', {
      perFollowers: { per: 5, yields: { science: 1 } },
    }),
    B('CHURCH_PROPERTY', 'Church Property', '+2 gold for each city following your religion.', {
      perCity: { gold: 2 },
    }),
    // B-18/B-27: real GS founder beliefs to 8 total. Two land on existing
    // channels (perCity, buildingYields); two need absent systems (city-state
    // envoy influence, allied bonuses) and land INERT. Recorded in the log.
    B('PILGRIMAGE', 'Pilgrimage', '+2 faith for each city following your religion.', {
      // GS: +2 faith per FOREIGN city following. Degrade: perCity applies to
      // all cities following (the engine has no foreign-follower split yet).
      perCity: { faith: 2 },
    }),
    B('STEWARDSHIP', 'Stewardship', '+1 science from Libraries/Universities and +1 gold from Markets/Banks.', {
      // GS: gated on a Governor + religion-following. Degrade: applies to the
      // founder civ's cities unconditionally via the buildingYields channel.
      buildingYields: {
        LIBRARY: { science: 1 }, UNIVERSITY: { science: 1 },
        MARKET: { gold: 1 }, BANK: { gold: 1 },
      },
    }),
    B('PAPAL_PRIMACY', 'Papal Primacy', '+25% influence points toward earning envoys.', {}),
    B('RELIGIOUS_UNITY', 'Religious Unity', 'Your alliances and city-state relations gain bonuses from shared religion.', {}),
  ].map((b) => [b.id, b]),
);

/**
 * B-18: Enhancer beliefs — the fifth belief slot, added when a founded
 * religion is ENHANCED (real Civ 6: spend a second Great Prophet / an
 * Apostle). Every real GS enhancer boosts a system this engine does not model
 * (religious pressure range, missionary/apostle spread & cost, theological or
 * territorial religious combat, faith-generating trade routes), so they land
 * INERT (empty effects). The slot, catalog and player choose-path exist; the
 * effects and rival enhancer claiming are deferred follow-ups (see
 * gpu/ROUND_B2_LOG.md).
 */
export const ENHANCER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('ITINERANT_PREACHERS', 'Itinerant Preachers', 'Religious pressure spreads two tiles further.', {
      pressureRangeBonus: 2, // B6-S1
    }),
    B('SCRIPTURE', 'Scripture', 'Missionaries and Apostles gain +1 spread charge and stronger pressure.', {
      missionaryChargeBonus: 1, // B6-S2
      spreadPressureMult: 1.5, // B6-S2: lump 10 → 15
    }),
    B('JUST_WAR', 'Just War', '+10 combat strength near cities following your religion.', {
      combatNearFollowing: 10, // B6-S1: within JUST_WAR_RANGE, unit-vs-unit
    }),
    B('DEFENDER_OF_THE_FAITH', 'Defender of the Faith', '+5 combat strength when defending in friendly-religion territory.', {
      combatDefendFollowing: 5, // B6-S1
    }),
    B('CRUSADE', 'Crusade', '+10 combat strength against units in cities following your religion.', {
      combatVsUnitInFollowing: 10, // B6-S1
    }),
    B('HOLY_ORDER', 'Holy Order', 'Missionaries and Apostles are 30% cheaper to purchase.', {
      missionaryCostMult: 0.7, // B6-S2: 60 → 42 faith
    }),
    B('MESSENGER_OF_THE_GODS', 'Messenger of the Gods', '+2 gold and +2 faith from trade routes to cities of your religion.', {
      tradeReligionYields: { gold: 2, faith: 2 }, // B6-S1
    }),
  ].map((b) => [b.id, b]),
);

/** Worship buildings: exactly one is unlocked by founding (player's pick). */
export const WORSHIP_BUILDINGS = ['CATHEDRAL', 'GURDWARA', 'MEETING_HOUSE', 'PAGODA', 'STUPA'];

export const RELIGION_NAMES = [
  'Buddhism', 'Catholicism', 'Confucianism', 'Hinduism', 'Islam', 'Judaism',
  'Orthodoxy', 'Protestantism', 'Shinto', 'Sikhism', 'Taoism', 'Zoroastrianism',
];

export const PANTHEON_FAITH_COST = 25;

/** B-18: a founded religion's holy city spreads pressure to every city within
 * this many tiles each turn (real Civ 6's base holy-city pressure radius).
 * B6-S1: Itinerant Preachers adds its pressureRangeBonus to THIS religion's
 * radius (per-religion range in spreadReligiousPressure). */
export const RELIGION_PRESSURE_RANGE = 10;
/** B6-S1: Just War's "near" radius — unit-vs-unit combat within this many
 * tiles (hex distance from the BATTLE tile = the defender's tile) of a city
 * following the participant's religion. */
export const JUST_WAR_RANGE = 3;
/** B-18: integer pressure added per in-range turn (integer keeps the flip
 * comparison exact — no float association across the batch). */
export const RELIGION_PRESSURE_PER_TURN = 1;
/** B6-S2: the lump a missionary SPREAD adds to the target city's accumulator
 * for its owner religion — a decade of ambient (+1/turn), so a spread flips
 * decisively but ambient can re-erode. Real Civ 6 spreads ~200 vs ~30/turn
 * ambient; same ratio class. SCRIPTURE multiplies ×1.5 → 15 (integer). */
export const SPREAD_PRESSURE = 10;
/** B6-S2: max LIVE missionaries per civ (the rival buy gate). */
export const MISSIONARY_CAP = 2;
/** B-18 (#71): live APOSTLE cap per civ — apostles are the expensive combat
 * arm, so one at a time keeps the faith ladder from starving worship buys. */
export const APOSTLE_CAP = 1;
/**
 * B-18 (#71): the APOSTLE BUY master switch, landed INERT (the B-24/S1
 * pattern — substrate first, flip second). The apostle unit, its religious
 * strength, the theological-combat resolver and both engines' mirrors are all
 * IN; only the scripted rival's PURCHASE is gated off, so no apostle ever
 * exists in the gate and the whole mechanic is provably zero-impact.
 *
 * HUNT LOG (2026-07-27, #71 flag sweep — flipped, hunted, REVERTED):
 * The recorded "bought on different turns" description is WRONG. With the buy
 * live the two engines are IDENTICAL through trace turn 78 — the apostle is
 * bought on the SAME turn (73), fights on the same turns, and DIES on the same
 * turn (75) in both. The split appears at trace turn 79 (seed 9066, rUnits0
 * TS=3 GPU=4) and is a downstream RELIGIOUS-UNIT LIFECYCLE drift, not a buy
 * timing one: from t80 the GPU's missionary count oscillates 2<->1 (spend last
 * charge, die, re-buy) while TS holds steady at 2.
 * ELIMINATED, with evidence:
 *  - the buy conditions (cost 120 flat, cap 1, the one-religious-unit-per-turn
 *    `boughtRelig` guard, the first-eligible-city pick) all mirror exactly;
 *    apostleIdx/apostleCap/apostleCost are exported correctly;
 *  - the GPU's theological-combat PRE-PASS vs TS's per-unit interleave: I
 *    rewrote the GPU to interleave exactly as TS does and the divergence was
 *    BYTE-IDENTICAL, so the pre-pass is genuinely order-equivalent. Reverted.
 * FOUND BUT DORMANT (fix it when the player grows religious units, #50):
 *  - `_theological_combat`'s defender scan only searches the RIVAL pool
 *    (`self.v_civ != r`), while TS's `theologicalCombat` scans `unitsAt` and
 *    explicitly handles a PLAYER defender (`ug = u.owner === 'player' ? 0`).
 *    Dormant only because the scripted player never owns a religious unit.
 * SECOND HUNT (2026-07-27, with rival FAITH now traced):
 * FAITH IS EXACT. Adding `rFaith` to the trace was the missing instrument —
 * with it, flipping this flag no longer diverges on faith at all, which
 * ELIMINATES the entire purchase family: the apostle is bought on the same
 * turn, for the same price, leaving the same faith, in both engines.
 * The first divergence is now seed 9183 turn 93 on `rGScore1` (1.8) and
 * `rQProg1` (0.9) — rival empire score and QUEUE PROGRESS. Those are yield
 * consequences, so the remaining suspect is narrow: the religious SPREAD's
 * effect on a city (which city gets converted, or the pressure lump), which
 * feeds follower beliefs -> yields -> production and score.
 * ALSO ELIMINATED this round: theological combat is NOT involved in seed
 * 9066 (its first fight there is turn 201, long after the split), and the
 * earlier "TS never fights" reading was an artefact of running the exporter
 * at an 84-turn horizon — the survival heuristics make that a DIFFERENT game.
 * Always reproduce at the real 250-turn horizon.
 * THIRD HUNT (2026-07-27, with `rFollowedSum` now traced too):
 * LOCALISED TO ONE CITY. The new per-rival followed-religion checksum makes
 * the divergence explicit: seed 9183 t93 `rFollowedSum1` TS=14 GPU=13, and it
 * OSCILLATES (t95 TS=13 GPU=14). So exactly ONE of rival 1's cities settles
 * on a different religion, and the two engines swap which one they pick from
 * turn to turn. That is a RELIGION-PRESSURE difference on a single city, not
 * a rule difference: both engines resolve identically (TS `pres[g] > bestP`
 * from bestP=0 iterating g ascending; GPU `argmax` + a `sum > 0` guard — the
 * same lowest-id-on-tie semantics, and equivalent for non-negative pressure,
 * which it always is since theologicalCombat clamps at 0).
 * So the remaining suspect is the pressure ARRAY: some city is receiving a
 * different spread lump, or receiving it on a different turn, once an apostle
 * is in the pool.
 * FOURTH HUNT (2026-07-27) — DOWN TO ONE UNIT'S POSITION.
 * The pressure diff is exact and tiny: seed 9183, rival 1's city rc4
 * (centre 453), religion 2. TS reaches pressure 54, the GPU 44 — a gap of
 * EXACTLY ONE spread lump (SPREAD_PRESSURE = 10). Every other rival-1 city
 * matches element-wise, so precisely one spread is missing on the GPU.
 * RETRACTED (hunt #6): I previously blamed the WALK, on a "TS at 408 / GPU at
 * 406" comparison. That was MIS-ALIGNED — the TS log point is mid-turn (inside
 * rivalMissionaryActions) while the GPU snapshot was end-of-turn. Logging BOTH
 * walks directly, step by step, they MATCH exactly across t88-t92: same tiles
 * (362->406), same per-step costs, same MP, same stop decisions. The walk is
 * NOT the divergence.
 * rc4 is a knife-edge city (religion 1 vs 2 pressure 53 vs 54), which is why a
 * single lump flips it and why the checksum then OSCILLATES.
 * BOTH #71 MOVEMENT CHANGES ARE CLEARED as the cause:
 *  - B-17 (the Encampment block): there is NO live Encampment anywhere on the
 *    map at that point (`encamp_hp > 0` count is 0), so the block cannot fire.
 *  - B-23 (the road discount): bisected directly. With the road-to-road
 *    movement discount disabled in BOTH engines (roads still laid), the
 *    divergence persists and merely moves EARLIER, to t84. Roads are not it.
 * HUNT #7 — THE SPREAD APPLICATION, and this one is clean. Logging the SAME
 * EVENT on both sides (the moment the lump is added to a city's pressure
 * array) removes the alignment problem entirely. Seed 9183, t84-t93:
 *   t84/t86/t87/t88/t89-g1/t92-g1/t93-g1  -> IDENTICAL, event for event,
 *                                            including the resulting arrays.
 *   t89 g2, t90 g2 (x2), t92 g2           -> TS applies FOUR spreads that the
 *                                            GPU does not apply at all.
 * The t92 g2 one is the decisive lump: TS `u#52 MISSIONARY -> city4@453
 * lump10 pres=0,52,53`, which is exactly the +10 rc4 is missing on the GPU.
 * So RIVAL 1's religious units stop spreading on the GPU from t89 while TS
 * keeps spreading. Faith is exact, so the units EXIST and were bought
 * identically — the divergence is in each unit's target choice or its
 * distance test, for rival 1 specifically.
 * CAVEAT ON MY OWN PROBE: the GPU log covered only the RIVAL-city branch
 * (`rc_pressure`), not the PLAYER-city branch (`city_pressure`). Two of the
 * four missing spreads target a city at centre 534, which may well BE a
 * player city — so the first thing the next session should do is log BOTH
 * branches before concluding those two are missing.
 * HUNT #8 — PINNED TO ONE WALK, ONE TURN. Printing each religious unit's
 * tile / chosen target / distance on both engines:
 *   t91  TS #52 @362 -> city4@453 d4   |  GPU u21 civ1 @362 -> 453 d4
 *        IDENTICAL: same tile, same target, same distance, 3 charges each.
 *   t92  TS #52 @408 -> city4@453 d1 -> SPREADS (the missing lump)
 *        GPU u21     @406 -> 453 d3 -> does NOT spread
 * So during turn 91's WALK, from the SAME start tile 362 toward the SAME
 * target, TS advances to 408 (d4->d1, ~3 tiles) and the GPU only to 406
 * (d4->d3, 1 tile). Everything before that walk is bit-identical.
 * NEIGHBOUR ORDER IS *NOT* IT (checked statically, no run needed):
 * `neighbor_table` (engine.py) lists even rows [(1,0),(0,-1),(-1,-1),(-1,0),
 * (-1,1),(0,1)] and odd rows [(1,0),(1,-1),(0,-1),(-1,0),(0,1),(1,1)] — both
 * are E, NE, NW, W, SW, SE, the SAME order as TS's AXIAL_DIRS. The two
 * tie-break identically. (engine.py's warning about `self.neigh` order refers
 * to the riverMask bit order, which is a different table.)
 * REMAINING SUSPECTS for the 362->408 vs 362->406 walk, now that ordering,
 * the target, the distance and the start tile are all identical:
 *  - the STEP-LEGALITY predicate: TS calls `tileFreeForUnit` (terrain +
 *    stacking + the B-17 block) where the GPU uses `passable & ~_blocked_for`.
 *    A neighbour one accepts and the other rejects would reroute the unit.
 *  - the "always take one step at full MP" rule: TS compares against
 *    `UNITS[type].moves` (base, aura EXCLUDED) while the GPU compares against
 *    `_p_moves + v_aura_mp` (aura INCLUDED). Inert while no rival general
 *    exists (measured: 0 rival generals in-gate) but a REAL latent to fix.
 * OLD PRIME SUSPECT (refuted): the walk's neighbour TIE-BREAK. Both engines step to the
 * neighbour with the lowest distance to the target, ties by direction order —
 * TS iterates `neighbors(map, at)`, the GPU `self.neigh` + `arange6`. If those
 * two orders differ, equidistant neighbours are chosen differently and the
 * routes diverge; from 406 the next step costs 4 with 3 MP left, so the GPU
 * stalls while TS's route stays cheap. Note engine.py already warns that
 * `self.neigh` order is "NOT the riverMask direction order neighbors() uses".
 * HUNT #10 — THE CANDIDATE LIST AT 362, and it names the mechanism.
 * From 362 (d4 to 453) there are exactly TWO strictly-closer neighbours, and
 * they are EQUIDISTANT: direction 0 = tile 363 (d3, tmove 3 -> cost 2) and
 * direction 5 = tile 406 (d3, tmove 0 -> cost 1). Direction order must pick
 * 363. The GPU picked 406, so 363 was REJECTED by its step-legality check —
 * and indeed rival 0's own missionary walked ONTO 363 at t90 and was still
 * standing there at t91 (GPU log: `t90 r0 u11 407->363`).
 * So rival 1's route depends on WHETHER RIVAL 0'S UNIT HAS VACATED 363 at the
 * moment rival 1's phase runs. Both engines process rivals in id order, so the
 * suspect is now precise: a one-step difference in WHEN rival 0's missionary
 * leaves 363 (or in whether the occupied tile blocks a foreign civilian at
 * all) reroutes rival 1 and costs it the two tiles.
 * Note the costs make this bite hard: via 363 the route is cost 2 but leads
 * onward cheaply to 408; via 406 the next step costs 4 against 3 MP left, so
 * the unit stalls. That is exactly the 408-vs-406 split.
 * HUNT #11 — the BLOCKING RULE is identical, so it is the TIMING.
 * Read both: TS `tileFreeForUnit` rejects a foreign rival's unit outright
 * (`unitSide(u) !== side || (side === 'rival' && u.civId !== unit.civId)`),
 * and the GPU's `_blocked_for("rciv")` includes `rvc` unconditionally, which
 * covers foreign rival civilians too. Same rule, both directions.
 * Therefore the split is WHEN tile 363 is occupied. Both engines process
 * rivals in id order, and rival 0's missionary sits on 363 from t90 and
 * leaves at t92 in BOTH. So rival 1's route depends on the exact interleaving
 * of rival 0's walk with rival 1's spread pass — the one remaining surface.
 * HUNT #12 — the +1 MP aura theory is DEAD, and it kills the premise.
 * A missionary is combat 0, and BOTH engines exclude civilians from the
 * general's movement aura: TS `inGeneralAura` returns false when
 * `combat <= 0`, and the GPU's `_refresh_aura_mp_rival` masks on
 * `_p_combat[v_type] > 0`. So the unit has exactly 4 MP in both.
 * With 4 MP the route 362 -> 363 (2) -> 407 (1) -> 408 (2) costs 5 and the
 * walker must stop at 407. TS therefore CANNOT have moved that unit from 362
 * to 408 in one turn — which means the premise is wrong, not the engines:
 * the two SPR log lines I read as "#52 @362 at t91" and "#52 @408 at t92"
 * cannot both be that unit's turn-boundary position. START HERE: re-derive
 * that unit's true position at the top of t91 and t92 with ONE log point,
 * before trusting any of the 362/406/408 geometry above.
 * ARITHMETIC WORTH CHECKING FIRST: from 362 with 4 MP, going via 363 costs
 * 2 then 1 (to 407) then 2 (to 408) = 5, which the "always one step at full
 * MP" rule should still cut short at 407 — yet TS reports the unit AT 408.
 * So either TS's unit had more MP than 4, or it started that turn nearer than
 * 362. Resolve THAT before assuming an interleaving bug: it may be that the
 * TS unit's turn-91 start position is not what the mid-turn log implies.
 * OLD NEXT STEP: log, for BOTH engines on the same event, rival 0's unit position
 * at the moment rival 1's spread phase reads tile 363 — i.e. print the
 * occupancy of 363 at the top of each civ's spread pass, t90-t92. If the
 * occupancy differs, the bug is upstream in rival 0's walk timing; if it
 * matches, the bug is in the foreign-civilian blocking rule
 * (`tileFreeForUnit` vs `_blocked_for("rciv")`).
 * OLD NEXT STEP: print the candidate list at tile 362 on both sides — each
 * neighbour, its distance to 453 and its move cost — and compare the ORDER.
 * This is a single probe on one tile and should end the hunt.
 */
export const APOSTLE_BUY_LIVE = false; // #71: STILL INERT — see the hunt log below

/**
 * B-18 (#71): THEOLOGICAL COMBAT. Sourced shape — only an Apostle may
 * initiate against an adjacent religious unit of a DIFFERENT religion; both
 * sides take damage scaled by the RELIGIOUS-STRENGTH DIFFERENCE; a unit at 0
 * HP dies; and the loser's religion loses pressure in nearby cities while the
 * winner's gains. DELIBERATELY ZERO-DRAW: damage is the strength difference
 * scaled by THEO_DAMAGE, with no RNG multiplier. Real Civ 6 rolls, but a new
 * draw here would have to be mirrored draw-for-draw in both engines on a
 * conditional path — the exact surface the A-12 rival quests dissolved by
 * making the mechanic deterministic. Recorded simplification.
 */
/** #71 DEBT-2: the city-attack religion-adder switch, landed INERT. The term is
 * written and mirrored at all six sites (TS: rival attackers only, matching the
 * GPU, which never sets the player's holy city); only the switch is off,
 * because turning it on shifted rival combat outcomes and the engines split on
 * downstream unit counts. Flip when its hunt lands. */
export const CITY_RELIGION_ADDER_LIVE = true; // #71: LIVE — hunted 2026-07-27

export const THEO_DAMAGE = 2;
/** Flat damage both sides take before the strength difference is applied. */
export const THEO_BASE_DAMAGE = 30;
/** Cities within this range of the fallen unit feel the pressure swing. */
export const THEO_PRESSURE_RANGE = 6;
/** Pressure the winner's religion gains (and the loser's sheds) in cities
 * within SPREAD/PRESSURE range when a religious unit dies in theological
 * combat. */
export const THEO_PRESSURE_SWING = 15;

/**
 * B-18 pressure→yields coupling master switch (Round B3, slice U). When false
 * (INERT), a city's FOLLOWER-belief yields key on the OWNER civ's religion —
 * byte-identical to the pre-coupling per-civ application. When true (LIVE),
 * they key on the CITY's `followedReligion`, so a player city following a rival
 * religion draws that religion's follower belief and a city following none gets
 * no follower-belief yields. PANTHEON + FOUNDER + ENHANCER beliefs stay per-civ
 * either way. Mirrored to the GPU via rules.followerCoupling. The restructure
 * (follower belief moved out of getModifiers/getRivalModifiers into the per-city
 * withFollowerBelief lookup) lands inert first; this flag flips the behavior in
 * its own commit alongside a fixture regen.
 */
export const B18_FOLLOWER_COUPLING_LIVE = true;
