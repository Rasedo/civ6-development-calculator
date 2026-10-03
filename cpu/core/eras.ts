import type { GameState } from './types';
import { civEraIndex } from './city';
import { onHomeContinent, seatOf, citiesOf, isBarbSeat, isCiv, civOf } from './seats';
import { getModifiers } from './effects';
import { seatWonderSum } from './wonders';
import { UNITS } from '../data/units';
import { DED_AUTOMATON, DED_DRACONES, DED_SKY, DED_STEAM, DED_TO_ARMS, SKY_EUREKAS } from '../data/seats';
import { ERAS, TECHS } from '../data/techs';
import { promoValue } from './promotions';
import { spawnUnit } from './units';
import { BUILDINGS, BUILDING_ERA_INDEX, buildingVariantFor } from '../data/buildings';
import { GW_HOLDERS } from '../data/greatWorks';
import { INDUSTRIAL_ERA_INDEX } from '../data/techs';
import { ROAD_TIER_ERA } from '../data/constants';
import { hexDistance, tilesWithin } from '../../world/hex';
import { naturalWonderAt } from '../../world/query';
import { isExplored } from './fog';
import { isFloodplains } from '../../world/features';
import { recordMoment, LARGEST_KEY, NEAR_WONDER_KEY, NEAR_FLOOD_KEY, NEAR_VOLCANO_KEY } from './moments';
import {
  MOMENT_LARGEST_MARGIN, MOMENT_NEAR_RANGE, MOMENT_GP_GAME_ERA, MOMENT_GP_PAST_ERA, MOMENT_GP_FAITH_HALF,
  MOMENT_GP_GOLD_HALF, MOMENT_GOODY, MOMENT_GOODY_MAX_ERA, MOMENT_CAMP, MOMENT_CAMP_NEAR, MOMENT_CAMP_MAX_ERA,
  MOMENT_CAMP_NEAR_RANGE, MOMENT_DIPLO_VP,
} from '../data/seats';
import {
  MOMENT_ON_DESERT, MOMENT_ON_SNOW, MOMENT_ON_TUNDRA, MOMENT_NEW_CONTINENT, MOMENT_NEAR_CIV_CITY, MOMENT_NEAR_CIV_RANGE,
  MOMENT_PANTHEON, MOMENT_PANTHEON_FIRST, MOMENT_RELIGION, MOMENT_RELIGION_FIRST, MOMENT_WONDER_GAME_ERA,
  MOMENT_WONDER_PAST_ERA, MOMENT_FOREIGN_CAPITAL, MOMENT_PLAYER_DEFEATED, MOMENT_TO_ORIGINAL_OWNER, ERA_SCORE_MOMENT_MIN, DEDICATION_ERAS, DED_EVENT_SCORE, ERA_MIN_TURNS, ERA_MAX_TURNS, ERA_COUNTDOWN, ageBars, AGE_PRESSURE, HEROIC_DEDICATIONS, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS, DED_MONUMENTALITY, GOLDEN_MOVE_BONUS } from '../data/seats';

/** CIV6 (Great People): the WORLD era — "the era of the Great Person and the
 *  World Era when the Great Person appears in the queue". The furthest any seat
 *  has reached, which is also what the World Congress gates on. */
export function worldEraIndex(state: GameState): number {
  let era = -1;
  for (const sx of state.seats) {
    const e = civEraIndex(sx.research.techs, sx.research.civics);
    if (e > era) era = e;
  }
  return era;
}

/** Pay era score for `count` moments each worth `per`. CIV6 (Taj Mahal):
 *  a moment worth ERA_SCORE_MOMENT_MIN or more pays its owner one more,
 *  so the per-moment value has to survive as far as this call. */
export function addEraScore(state: GameState, seat: number, per: number, count = 1): void {
  const s = seatOf(state, seat);
  if (!s || count <= 0) return;
  s.eraScore = (s.eraScore ?? 0) + per * count;
  if (per >= ERA_SCORE_MOMENT_MIN) {
    s.eraScore += seatWonderSum(state, seat, 'eraScorePerMoment') * count;
  }
}

/** The moments a city major `seat` founded at `centre` records
 *  (`MOMENT_ON_DESERT`'s rule), on the state the founding left — the city
 *  among the seat's own, its sight revealed. */
export function foundingMoments(state: GameState, seat: number, centre: number): void {
  if (!isCiv(seat)) return;
  const map = state.map;
  const tile = map.tiles[centre];
  for (const sx of state.seats) {
    if (sx.seat === seat) continue;
    const near = sx.cities.some((c) => {
      const t = map.tiles[c.centerIndex];
      return hexDistance(map, tile.col, tile.row, t.col, t.row) <= MOMENT_NEAR_CIV_RANGE
        && isExplored(state, seat, c.centerIndex);
    });
    if (near) {
      addEraScore(state, seat, MOMENT_NEAR_CIV_CITY);
      break;
    }
  }
  const cont = tile.continent ?? -1;
  const others = citiesOf(state, seat).filter((c) => c.centerIndex !== centre);
  if (cont >= 0 && others.length > 0 && others.every((c) => (map.tiles[c.centerIndex].continent ?? -1) !== cont)) {
    addEraScore(state, seat, MOMENT_NEW_CONTINENT);
  }
  const terrain = tile.terrain === 'DESERT' ? MOMENT_ON_DESERT : tile.terrain === 'SNOW' ? MOMENT_ON_SNOW
    : tile.terrain === 'TUNDRA' ? MOMENT_ON_TUNDRA : 0;
  if (terrain > 0) addEraScore(state, seat, terrain);
  for (const k of foundingKeys(state, seat, centre)) recordMoment(state, seat, k);
}

/** The once-a-game keys a city of major `seat` at `centre` holds, ascending:
 *  the largest civilization by MOMENT_LARGEST_MARGIN cities ("than its next
 *  biggest rival": a rival there must be); each natural wonder, a Floodplains
 *  plot (a river's that could flood: H-1 Duel 1108 paid Mediolanum's
 *  Floodplains at 1, not Aquileia's floodplain-less river plots) and a
 *  volcano within MOMENT_NEAR_RANGE. */
export function foundingKeys(state: GameState, seat: number, centre: number): number[] {
  const map = state.map;
  const tile = map.tiles[centre];
  const out = new Set<number>();
  const mine = citiesOf(state, seat).length;
  const rivals = state.seats.filter((sx) => sx.seat !== seat && isCiv(sx.seat));
  if (rivals.length > 0 && rivals.every((sx) => mine - MOMENT_LARGEST_MARGIN >= sx.cities.length)) out.add(LARGEST_KEY);
  for (const t of tilesWithin(map, tile.col, tile.row, MOMENT_NEAR_RANGE)) {
    const nw = naturalWonderAt(t);
    if (nw && NEAR_WONDER_KEY[nw] !== undefined) out.add(NEAR_WONDER_KEY[nw]);
    if (isFloodplains(t.feature)) out.add(NEAR_FLOOD_KEY);
    if (t.volcano) out.add(NEAR_VOLCANO_KEY);
  }
  return [...out].sort((a, b) => a - b);
}


/** The pantheon or religion `seat` just founded: the FIRST_IN_WORLD moment
 *  when no other major holds one, else the plain one. */
export function pantheonMoment(state: GameState, seat: number): void {
  const first = !state.seats.some((s) => s.seat !== seat && s.religion.pantheon);
  addEraScore(state, seat, first ? MOMENT_PANTHEON_FIRST : MOMENT_PANTHEON);
}
export function religionMoment(state: GameState, seat: number): void {
  const first = !state.seats.some((s) => s.seat !== seat && s.religion.founded);
  addEraScore(state, seat, first ? MOMENT_RELIGION_FIRST : MOMENT_RELIGION);
}

/** A world wonder of ERAS index `era` completed by `seat`: the GAME_ERA
 *  moment when that era is the game era or later, else PAST_ERA. */
export function wonderMoment(state: GameState, seat: number, era: number): void {
  addEraScore(state, seat, era >= (state.gameEra ?? 0) ? MOMENT_WONDER_GAME_ERA : MOMENT_WONDER_PAST_ERA);
}

/** A Great Person of ERAS index `era` recruited by `seat`: PATRONAGE_*_OVER_HALF
 *  when `patron` names the purse that paid more than half its points, else
 *  PAST_ERA when its era is before the game era, else GAME_ERA. */
export function greatPersonMoment(state: GameState, seat: number, era: number, patron: 'faith' | 'gold' | null): void {
  addEraScore(state, seat, patron === 'faith' ? MOMENT_GP_FAITH_HALF : patron === 'gold' ? MOMENT_GP_GOLD_HALF
    : era < (state.gameEra ?? 0) ? MOMENT_GP_PAST_ERA : MOMENT_GP_GAME_ERA);
}

/** A tribal village a major `seat` contacted, through the Ancient game era. */
export function goodyMoment(state: GameState, seat: number): void {
  if (isCiv(seat) && (state.gameEra ?? 0) <= MOMENT_GOODY_MAX_ERA) addEraScore(state, seat, MOMENT_GOODY);
}

/** A barbarian camp at `tileIndex` a unit of major `seat` destroyed, through
 *  the Medieval game era: NEAR_YOUR_CITY when one of the seat's cities stands
 *  within MOMENT_CAMP_NEAR_RANGE, else the plain row. */
export function campMoment(state: GameState, seat: number, tileIndex: number): void {
  if (!isCiv(seat) || (state.gameEra ?? 0) > MOMENT_CAMP_MAX_ERA) return;
  const map = state.map;
  const t = map.tiles[tileIndex];
  const near = citiesOf(state, seat).some((c) => {
    const ct = map.tiles[c.centerIndex];
    return hexDistance(map, t.col, t.row, ct.col, ct.row) <= MOMENT_CAMP_NEAR_RANGE;
  });
  addEraScore(state, seat, near ? MOMENT_CAMP_NEAR : MOMENT_CAMP);
}

/** The Diplomatic Victory resolution's points earned by major `seat`. */
export function diploVictoryMoment(state: GameState, seat: number): void {
  if (isCiv(seat)) addEraScore(state, seat, MOMENT_DIPLO_VP);
}

/** A city passing from `fromSeat` to major `toSeat`: TO_ORIGINAL_OWNER when
 *  `toSeat` founded it and its loyalty did not carry it; from a major,
 *  PLAYER_DEFEATED when it was that major's last city (`wasLast`), else
 *  FOREIGN_CAPITAL when it was that major's original capital. */
export function transferMoments(state: GameState, fromSeat: number, toSeat: number,
  city: { founderSeat?: number; origCapitalSeat?: number }, byLoyalty: boolean, wasLast: boolean): void {
  if (!isCiv(toSeat)) return;
  if (city.founderSeat === toSeat && !byLoyalty) addEraScore(state, toSeat, MOMENT_TO_ORIGINAL_OWNER);
  if (!isCiv(fromSeat)) return;
  if (wasLast) addEraScore(state, toSeat, MOMENT_PLAYER_DEFEATED);
  else if (city.origCapitalSeat === fromSeat) addEraScore(state, toSeat, MOMENT_FOREIGN_CAPITAL);
}

/** The GAME ERA (`ERA_MIN_TURNS`'s rule) — runs right AFTER `state.turn += 1`
 *  in endTurn, the GPU's `_game_era_turn` at its own turn increment. Starts
 *  the countdown when the era's minimum less the countdown has come and
 *  either its maximum less the countdown has too or at least half the major
 *  seats (eliminated ones counted) stand in a later era by their techs and
 *  civics; ticks a running one; begins the next era (`enterEra`) the turn it
 *  runs out. True on that turn. */
export function gameEraTurn(state: GameState): boolean {
  const eras = state.seats.map((sx) => civEraIndex(sx.research.techs, sx.research.civics));
  const next = eraCountdownStep(state.gameEra ?? 0, state.eraStartTurn ?? 1, state.eraCountdown ?? -1, state.turn, eras);
  if (next !== ERA_BEGINS) {
    state.eraCountdown = next;
    return false;
  }
  enterEra(state);
  return true;
}

/** what `eraCountdownStep` returns on the turn the next era begins */
export const ERA_BEGINS = -2;

/** One turn of the game era's countdown: the countdown after turn `turn`
 *  (-1 none running), or ERA_BEGINS when the next era begins on it. `eras`
 *  are the major seats' own eras (`civEraIndex`). */
export function eraCountdownStep(era: number, start: number, countdown: number, turn: number,
  eras: readonly number[]): number {
  if (era >= ERAS.length - 1) return -1;
  let c = countdown;
  if (c < 0 && turn >= start + ERA_MIN_TURNS - ERA_COUNTDOWN) {
    let ahead = 0;
    for (const e of eras) if (e > era) ahead++;
    if (turn >= start + ERA_MAX_TURNS - ERA_COUNTDOWN || 2 * ahead >= eras.length) c = ERA_COUNTDOWN;
  }
  if (c < 0) return -1;
  c -= 1;
  return c >= 0 ? c : ERA_BEGINS;
}

/** A new GAME ERA begins: its index and first turn, the road tier it brings,
 *  and each major seat's Age, dedications and next bars (`ageBars`). */
export function enterEra(state: GameState): void {
  const era = (state.gameEra ?? 0) + 1;
  state.gameEra = era;
  state.eraStartTurn = state.turn;
  state.eraCountdown = -1;
  // CIV6: "all roads in your territory will upgrade to the next level
  // automatically" on reaching the era that brings the tier.
  let tier = 0;
  for (let i = 0; i < ROAD_TIER_ERA.length; i++) if (era >= ROAD_TIER_ERA[i]) tier = i;
  state.roadTier = Math.max(state.roadTier ?? 0, tier);
  for (let c = 0; c < state.seats.length; c++) {
    const seat = seatOf(state, c);
    if (!seat) continue;
    const s = seat.eraScore ?? 0;
    const was = seat.age ?? 1; // era 0 is Normal for everyone
    const now = s < (seat.darkBar ?? 0) ? 0 : s >= (seat.goldenBar ?? 0) ? 2 : 1;
    // DEDICATIONS. Each civ commits to one dedication per era —
    // except the HEROIC AGE, real Civ 6's reward for climbing straight out of
    // a DARK age into a GOLDEN one, which grants THREE. That test is why the
    // PREVIOUS age has to be substrate: `now` alone cannot distinguish a
    // Heroic Age from an ordinary Golden one.
    seat.prevAge = was;
    seat.age = now;
    if (now === 0) seat.darkAges = (seat.darkAges ?? 0) + 1;
    else if (now === 2) seat.goldenAges = (seat.goldenAges ?? 0) + 1;
    seat.dedications = was === 0 && now === 2 ? HEROIC_DEDICATIONS : 1;
    // Commit to NAMED dedications. Real Civ 6 lets each civ pick from the
    // WINDOW its world era offers; there is no chooser on either seat and a
    // roll would break the zero-draw contract, so the pick is a STATELESS
    // ROUND-ROBIN over that window keyed on the era index — deterministic,
    // identical on both engines, and it exercises every offered dedication in
    // turn rather than pinning one forever. A HEROIC age takes the next
    // `ded[c]` entries of the same window (three).
    const window = DEDICATION_ERAS[Math.min(era, DEDICATION_ERAS.length - 1)];
    seat.dedicationPicks = window.length === 0
      ? []
      : Array.from({ length: seat.dedications }, (_, k) => window[(era + c + k) % window.length]);
    commitGoldenGrants(state, c, era);
    [seat.darkBar, seat.goldenBar] = ageBars(s, citiesOf(state, c).length,
      seat.goldenAges ?? 0, seat.darkAges ?? 0, era);
  }
}

/**
 * The DARK/NORMAL face of a civ's committed dedications — era score
 * paid off a specific EVENT. Real Civ 6's climb-out dedications pay in era
 * score, and each names its own trigger; a GOLDEN age pays a standing bonus
 * instead and so earns nothing here.
 *
 * `kind` is a catalog index (DED_MONUMENTALITY, ...). Every matching committed
 * dedication pays, so a HEROIC age holding the same dedication twice pays
 * twice. Zero-draw, integer-only; both engines call this at the same event
 * sites.
 */
export function dedicationEvent(state: GameState, civ: number, kind: number, events = 1): void {
  if (events <= 0) return;
  // CIV6 (Strength in Unity): "When making Dedications at the beginning of a
  // Golden Age or Heroic Age, receive the Normal Age bonus towards improving
  // Era Score IN ADDITION to the other bonus" — the one row that reaches past
  // this guard (`GOLDEN_DEDICATION_ROWS`)
  if ((seatOf(state, civ)?.age ?? 1) === 2 && !getModifiers(state, civ).goldenDedication) {
    return; // a GOLDEN age takes bonuses, not era score
  }
  const picks = seatOf(state, civ)?.dedicationPicks;
  if (!picks) return;
  let n = 0;
  for (const p of picks) if (p === kind) n++;
  if (n > 0) addEraScore(state, civ, DED_EVENT_SCORE[kind], events * n);
}

/**
 * Every dedication a COMPLETED BUILDING pays, at one site both engines call.
 * CIV6: Heartbeat of Steam "+2 Era Score for each Industrial or later building
 * constructed"; Free Inquiry "+1 Era Score ... when constructing a building
 * which provides Science"; Pen, Brush and Voice "+1 Era Score for
 * constructing a building with a Great Work Slot" — the slot the building
 * gives the seat that builds it, so a unique copy that declares none (the
 * Marae, no `Building_GreatWorks` row) pays nothing.
 */
export function buildingDedications(state: GameState, seat: number, buildingId: string): void {
  if ((BUILDING_ERA_INDEX[buildingId] ?? 0) >= INDUSTRIAL_ERA_INDEX) dedicationEvent(state, seat, DED_STEAM);
  // CIV6 (Sky and Stars): "+1 Era Score for each Aerodrome building
  // constructed."
  if (BUILDINGS[buildingId]?.district === 'AERODROME') dedicationEvent(state, seat, DED_SKY);
  if ((BUILDINGS[buildingId]?.yields?.science ?? 0) > 0) dedicationEvent(state, seat, DED_FREE_INQUIRY);
  if (GW_HOLDERS.some((h) => !h.wonder && h.id === buildingId)
    && !buildingVariantFor(civOf(state, seat), buildingId)?.noGreatWorks) {
    dedicationEvent(state, seat, DED_PEN_BRUSH_AND_VOICE);
  }
}

/** CIV6 (Hic Sunt Dracones, dark face): "+1 Era Score each time you kill a
 *  non-Barbarian naval unit in combat." The killer must be a MAJOR — a
 *  city-state or a camp that lands the blow holds no dedications. */
export function unitKillEvent(
  state: GameState,
  killerSeat: number,
  killer: { type: string; promos?: number; tileIndex?: number } | undefined,
  victim: { type: string; seat: number; formation?: number },
): void {
  if (!isCiv(killerSeat)) return;
  // CIV6 (EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD): "Combat victories provide
  // Culture/Faith equal to 50% of the Combat Strength of the defeated unit" —
  // a BARBARIAN victim pays too, so this stands above the era-score gate
  // CIV6 (Mandekalu Cavalry): on a kill, "Gain Gold equal to 100% that unit's
  // base Combat Strength." (Garde Impériale): "+10 Great General points for
  // kills." Both are the KILLER chassis's own clause, paid on any victim.
  if (killer) {
    const kd = UNITS[killer.type];
    const ks = seatOf(state, killerSeat);
    if (ks && kd) {
      if (kd.killGoldPct) {
        ks.treasury += Math.floor(((UNITS[victim.type]?.combat ?? 0) * kd.killGoldPct) / 100);
      }
      if (kd.generalPointsOnKill) {
        ks.gpp.GENERAL = (ks.gpp.GENERAL ?? 0) + kd.generalPointsOnKill;
      }
      // CIV6 (Rough Rider): Culture worth 50% of the defeated unit's strength,
      // "when on the capital's continent" — the killer's own tile decides.
      if (kd.killCulturePct && (!kd.killYieldHomeOnly
        || (killer.tileIndex !== undefined && onHomeContinent(state, killerSeat, killer.tileIndex)))) {
        ks.research.civicProgress += Math.floor(((UNITS[victim.type]?.combat ?? 0) * kd.killCulturePct) / 100);
      }
    }
  }
  // CIV6 (Boarding): "Obtain Gold from naval victories" — gold worth
  // NAVAL_KILL_GOLD% of the DEFEATED unit's strength, and only when that
  // unit was a naval one (the install's own BOARDING_REQUIREMENTS, opponent
  // DOMAIN_SEA). The killer's own promotion, so it reads the unit rather
  // than the seat's modifiers.
  if (killer && UNITS[victim.type]?.naval) {
    const pct = promoValue(killer, 'NAVAL_KILL_GOLD');
    if (pct > 0) {
      const s = seatOf(state, killerSeat);
      if (s) s.treasury += Math.floor(((UNITS[victim.type]?.combat ?? 0) * pct) / 100);
    }
  }
  const rows = getModifiers(state, killerSeat).postCombatYields;
  if (rows.length) {
    const s = seatOf(state, killerSeat);
    const cs = UNITS[victim.type]?.combat ?? 0;
    if (s && cs > 0) {
      for (const r of rows) {
        const lump = Math.floor((cs * r.pctOfDefeated) / 100);
        if (lump <= 0) continue;
        if (r.yield === 'faith') s.faith += lump;
        else if (r.yield === 'culture') s.research.civicProgress += lump;
        else if (r.yield === 'science') s.research.techProgress += lump;
        else if (r.yield === 'gold') s.treasury += lump;
      }
    }
  }
  if (isBarbSeat(victim.seat)) return;
  // CIV6 (To Arms!): "+1 Era Score each time you kill a non-Barbarian Corps in
  // combat and +2 Era Score each time you kill a non-Barbarian Army in
  // combat." A Fleet and an Armada are the same two tiers at sea.
  const form = victim.formation ?? 0;
  if (form > 0) dedicationEvent(state, killerSeat, DED_TO_ARMS, form >= 2 ? 2 : 1);
  // CIV6 (Hic Sunt Dracones, dark face): "+1 Era Score each time you kill a
  // non-Barbarian Naval unit in combat."
  if (UNITS[victim.type]?.naval) dedicationEvent(state, killerSeat, DED_DRACONES);
  // CIV6 (Automaton Warfare): "+1 Era Score each time you kill a non-Barbarian
  // unit with a Giant Death Robot."
  if (killer && UNITS[killer.type]?.gdr) dedicationEvent(state, killerSeat, DED_AUTOMATON);
}

/**
 * The GOLDEN dedications that pay ONCE, at the moment the face is committed:
 * Sky and Stars' era-keyed Eurekas and Automaton Warfare's free Giant Death
 * Robot. Everything else a golden face does is a standing read.
 */
function commitGoldenGrants(state: GameState, seat: number, era: number): void {
  if (!goldenDedication(state, seat, DED_SKY) && !goldenDedication(state, seat, DED_AUTOMATON)) return;
  const owner = seatOf(state, seat);
  if (!owner) return;
  if (goldenDedication(state, seat, DED_SKY)) {
    for (const id of SKY_EUREKAS[era] ?? []) {
      if (!TECHS[id]) continue;
      if (owner.research.techs.includes(id) || owner.research.boosted.includes(id)) continue;
      owner.research.boosted.push(id);
    }
  }
  if (goldenDedication(state, seat, DED_AUTOMATON)) {
    const capital = owner.cities.find((c) => c.isCapital);
    const chassis = Object.keys(UNITS).find((u) => UNITS[u].gdr);
    if (capital && chassis) spawnUnit(state, chassis, capital.centerIndex, seat);
  }
}

/**
 * The GOLDEN-AGE face of a dedication — the standing bonus that
 * replaces the Dark/Normal era-score payout. SOURCED from the Civ 6 dedication
 * catalog:
 *   MONUMENTALITY        +2 Movement for all BUILDERS; Builders and Settlers
 *                        may be faith-purchased and are 30% cheaper to
 *                        purchase with Faith and Gold.
 *   FREE_INQUIRY         Eurekas provide an ADDITIONAL 10% of technology cost,
 *                        and Commercial Hub/Harbor GOLD adjacency also pays
 *                        Science.
 *   PEN_BRUSH_AND_VOICE  Inspirations provide an ADDITIONAL 10% of civic cost,
 *                        and each city gains +1 Culture per SPECIALTY district.
 *   EXODUS               +2 Movement for MISSIONARIES/APOSTLES/INQUISITORS, +4 Great
 *                        Prophet points per turn, and newly trained ones get
 *                        +2 Charges.
 */
export function goldenDedication(state: GameState, civ: number, kind: number): boolean {
  if (civ < 0) return false; // BARBARIANS hold no dedications
  if (((seatOf(state, civ)?.age ?? 1)) !== 2) return false;
  const picks = seatOf(state, civ)?.dedicationPicks;
  return !!picks && picks.includes(kind);
}

/**
 * The MOVEMENT half of the golden dedications, keyed on the unit's OWN
 * seat, so every seat in a Golden age gets it the same way.
 *
 * SOURCE (Civilopedia, Gathering Storm):
 *   MONUMENTALITY — "If chosen at the start of a Golden Age, +2 Movement for
 *     all Builders."
 *   EXODUS OF THE EVANGELISTS — "If chosen at the start of a Golden Age, +2
 *     Movement for all Missionaries, Apostles, and Inquisitors."
 *     (`Expansion1_Moments.xml`: COMMEMORATION_RELIGIOUS_GA_MOVEMENT takes
 *     UNIT_IS_GOLDEN_AGE_RELIGIOUS, whose UNIT_IS_RELIGIOUS is the Missionary,
 *     the Apostle and the Inquisitor.)
 *
 * Model movement points twice and the off-script gate diverges on the `rng`
 * DRAW COUNT, not on a yield. Both engines hold ONE resident MP pool (`unit_mp` against its `unit_mp_full` ceiling), with
 * one reset rule and one step contract, so the bonus has exactly one place to
 * live on each side.
 */
export function goldenMoveBonus(state: GameState, unit: { type: string; seat: number; embarked?: boolean }): number {
  const civ = isBarbSeat(unit.seat) ? -1 : unit.seat; // barbarians hold no dedications
  if (unit.type === 'BUILDER') {
    return goldenDedication(state, civ, DED_MONUMENTALITY) ? GOLDEN_MOVE_BONUS : 0;
  }
  if (unit.type === 'MISSIONARY' || unit.type === 'APOSTLE' || unit.type === 'INQUISITOR') {
    return goldenDedication(state, civ, DED_EXODUS) ? GOLDEN_MOVE_BONUS : 0;
  }
  /* CIV6 (Hic Sunt Dracones, Golden face): "+2 Movement for naval and
     embarked units." */
  if (UNITS[unit.type]?.naval || unit.embarked) {
    return goldenDedication(state, civ, DED_DRACONES) ? GOLDEN_MOVE_BONUS : 0;
  }
  return 0;
}

export function goldenProphetPoints(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_EXODUS) ? 4 : 0;
}

/** CIV6 (GS Civilopedia, Monumentality, Golden face): "Builders and Settlers
 *  are 30% cheaper to purchase with Faith and Gold." A PURCHASE price rule
 *  only — production-queue costs are untouched. Callers multiply LAST
 *  (`base * GOLD_PURCHASE_MULT * this`) so both engines share one
 *  association. */
export function monumentalityBuyMult(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_MONUMENTALITY) ? 0.7 : 1;
}

export function goldenBoostBonus(state: GameState, civ: number, civic: boolean): number {
  return goldenDedication(state, civ, civic ? DED_PEN_BRUSH_AND_VOICE : DED_FREE_INQUIRY) ? 0.1 : 0;
}

export function goldenCulturePerDistrict(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_PEN_BRUSH_AND_VOICE) ? 1 : 0;
}

/** The per-citizen loyalty pressure a seat's AGE adds (`AGE_PRESSURE`): a
 *  Heroic age carries the Golden code. Only a major has an age; the Free
 *  Cities player's citizens take none. */
export function agePressure(state: GameState, seat: number): number {
  return isCiv(seat) ? AGE_PRESSURE[(seatOf(state, seat)?.age ?? 1)] : 0;
}
