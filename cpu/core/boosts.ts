import { dedicationEvent, goldenBoostBonus } from './eras';
import { seatOf, citiesOf, tileSeat, allianceLevelWith, isCiv, hiddenResourcesFor } from './seats';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE } from '../data/seats';
import type { GameState, ResearchState, Seat } from './types';
import { isExplored } from './fog';
import { BOOSTLESS, BOOSTS, type BoostDef } from '../data/boosts';
import { getModifiers, seatGovernment } from './effects';
import { DISTRICTS } from '../data/districts';
import { ERAS, TECHS, TECH_TABLE_ORDER } from '../data/techs';
import { CIVICS, CIVIC_TABLE_ORDER } from '../data/civics';
import { GOVERNMENTS } from '../data/policies';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { WONDER_ERA_INDEX } from '../data/builtWonders';
import { randRange } from './rand';
import { completeResearchNow } from './phase';
import { researchCost } from './economy';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { isCoastalLand, isMountain, naturalWonderAt } from '../../world/query';
import { neighbors } from '../../world/hex';

/**
 * THE BOOST AMOUNT (the DLL's 0x4cd900 techs / 0x3a3c00 civics, in its 24.8
 * fixed point): B = floor(Boost% x cost / 100) (0x161d60); the share
 * q = trunc(B·256 / cost) re-read as a percent, q·100 (the 1/256 truncation
 * makes 40% of 25 read 39.84%), plus the seat's `points` (the player's
 * m_iModifiedBoost: Dynastic Cycle's +10, a golden Free Inquiry's +10);
 * the amount is floor(cost x that percent / 100). Recorded current-item
 * boosts: 25 of 28 land exactly this beside the turn's yield, the other
 * three carry a second grant the same turn (runs/h1_duelw11*,
 * .claude boost_fit: Rome Astrology 25 -> 9, China Writing 40 -> 19).
 */
export function boostAmount(cost: number, pct: number, points: number): number {
  if (cost <= 0) return 0;
  const B = Math.floor((pct * cost) / 100);
  const q = Math.floor((B * 256) / cost);
  return Math.floor(Math.floor((cost * (q * 100 + points * 256)) / 100) / 256);
}

/** CIV6 (Dynastic Cycle, golden Free Inquiry / Pen, Brush and Voice): the
 *  PERCENTAGE POINTS this seat adds to a boost of the kind — the roster's
 *  `mods.boostPct` rows and the golden dedication's 10. */
export function boostPoints(state: GameState, seat: number, isCivic: boolean): number {
  let n = Math.round(goldenBoostBonus(state, seat, isCivic) * 100);
  for (const r of getModifiers(state, seat).boostPct) if (r.tech !== isCivic) n += r.points;
  return n;
}

/** the progress banked on research `id`: the current item's pool, else
 *  what the seat parked on it */
export function progressOn(rsr: ResearchState, id: string): number {
  if (rsr.tech === id) return rsr.techProgress;
  if (rsr.civic === id) return rsr.civicProgress;
  return (TECHS[id] ? rsr.techRetained[id] : rsr.civicRetained[id]) ?? 0;
}

/** the Science or Culture still owed on `id`, in whole points */
export function researchOwed(rsr: ResearchState, id: string, cost: number): number {
  return cost - Math.floor(progressOn(rsr, id));
}

/**
 * LAND A BOOST: research `id` is marked boosted and its `Boost` percent
 * (`boostAmount`) lands as progress on it — the current item's pool or the
 * progress the seat parked on it —, never past its cost; reaching the cost
 * completes the item there (`completeResearchNow`). A row with no
 * `Boosts` row takes nothing, as does one held or boosted already. Whether
 * the trigger pays a dedication is the caller's.
 */
export function markBoost(state: GameState, seat: number, id: string): boolean {
  const s = seatOf(state, seat);
  const def = BOOSTS[id];
  if (!s || !def) return false;
  const rsr = s.research;
  if (rsr.boosted.includes(id) || rsr.techs.includes(id) || rsr.civics.includes(id)) return false;
  rsr.boosted.push(id);
  const civic = !TECHS[id];
  const cost = researchCost(state, id, civic, seat);
  const have = progressOn(rsr, id);
  const add = Math.min(cost - have, boostAmount(cost, def.pct, boostPoints(state, seat, civic)));
  if (add <= 0) return true;
  if (rsr.tech === id) rsr.techProgress += add;
  else if (rsr.civic === id) rsr.civicProgress += add;
  else if (civic) rsr.civicRetained[id] = have + add;
  else rsr.techRetained[id] = have + add;
  // the progress setter completes the item the moment it reaches the cost
  if (have + add >= cost) completeResearchNow(state, seat, id);
  return true;
}

/** a unit of `type` is a `want` (the install's Unit1Type): the type or the
 *  unique unit standing in its place */
function isUnitOf(type: string, want: string): boolean {
  return type === want || UNITS[type]?.replaces === want;
}

/** a land unit that fights: neither naval, nor air, nor a civilian */
function isLandCombat(type: string): boolean {
  const d = UNITS[type];
  return !!d && !d.naval && d.air === undefined && ((d.combat ?? 0) > 0 || d.ranged !== undefined);
}

/** the seat's completed districts, each city's registry walked */
function completeDistricts(state: GameState, seat: number): string[] {
  const out: string[] = [];
  for (const c of citiesOf(state, seat)) {
    for (const d of c.districts) if (state.map.tiles[d.tileIndex].districtComplete) out.push(d.type);
  }
  return out;
}

/** the seat's working improvements on its OWN plots (runs/h1_duelw1115:
 *  China holds one improvement through t17 and reads no Craftsmanship
 *  inspiration while the map holds three Farms by t7), a pillaged one not
 *  counted (runs/h1_duelw1118 China t13-t18: two Farms, one pillaged since
 *  t11, and a Mine read none), each with the resource under it as the seat
 *  sees it: one it cannot see yet is plain ground (`hiddenResourcesFor`;
 *  runs/h1_duelw1124 t9: China's Farm on Horses before Animal Husbandry lands
 *  no Irrigation) */
function ownImprovements(state: GameState, seat: number, keep: (imp: string, res: string | null) => boolean): number {
  const hidden = hiddenResourcesFor(state, seat);
  let n = 0;
  for (const t of state.map.tiles) {
    if (tileSeat(t) !== seat || !t.improvement || t.pillaged) continue;
    if (keep(t.improvement, t.resource && !hidden.has(t.resource) ? t.resource : null)) n++;
  }
  return n;
}

function ownUnits(state: GameState, seat: number, keep: (type: string, formation: number) => boolean): number {
  let n = 0;
  for (const u of state.units) if (u.seat === seat && keep(u.type, u.formation ?? 0)) n++;
  return n;
}

/**
 * THE STATE TRIGGERS: each BoostClass the seat's standing state answers,
 * read at the seat's turn (`detectBoosts`). An EVENT class (a kill, a camp
 * cleared, a declaration of war received, a park, an artifact) lands where
 * the event happens; a class neither engine models (`MEET_CIV`: no contact
 * between majors; `DISCOVER_CONTINENT`: no continent discovery tracked;
 * `HAVE_X_THEMED_BUILDINGS`, `DISTRICT_APPEAL_LEVEL_MINIMUM_X`,
 * `AIRBASE_FOREIGN_CONTINENT`) and the late game's
 * `NONE_LATE_GAME_CRITICAL_TECH` never trigger.
 */
function stateTrigger(state: GameState, seat: number, b: BoostDef): boolean {
  const n = b.n ?? 1;
  const s = seatOf(state, seat) as Seat | undefined;
  if (!s) return false;
  switch (b.cls) {
    case 'NUM_IMPROVED_TILES':
      return ownImprovements(state, seat, () => true) >= n;
    case 'HAVE_X_IMPROVEMENTS':
      return ownImprovements(state, seat, (imp, res) => imp === b.improvement && (!b.requiresResource || res !== null)) >= n;
    case 'IMPROVE_SPECIFIC_RESOURCE':
      return ownImprovements(state, seat, (imp, res) => imp === b.improvement && res === b.resource) >= 1;
    case 'HAVE_UNIT_AND_IMPROVEMENT':
      return ownImprovements(state, seat, (imp, res) => imp === b.improvement && res === b.resource) >= 1
        && ownUnits(state, seat, (t) => isUnitOf(t, b.unit!)) >= 1;
    case 'HAVE_X_UNIQUE_SPECIALTY_DISTRICTS':
      return new Set(completeDistricts(state, seat).filter((d) => DISTRICTS[d as keyof typeof DISTRICTS].countsTowardLimit)).size >= n;
    case 'HAVE_X_DISTRICTS':
      return completeDistricts(state, seat).filter((d) => d === b.district).length >= n;
    case 'EMPIRE_POPULATION':
      return citiesOf(state, seat).reduce((t, c) => t + c.population, 0) >= n;
    case 'CITY_POPULATION':
      return citiesOf(state, seat).some((c) => c.population >= n);
    case 'CREATE_PANTHEON':
      return !!s.religion.pantheon;
    case 'FOUND_RELIGION':
      return s.religion.founded;
    case 'RESEARCH_TECH':
      return s.research.techs.includes(b.tech!);
    case 'CULTURVATE_CIVIC':
      return s.research.civics.includes(b.civic!);
    case 'MEET_X_CITY_STATES':
      return (state.cityStates ?? []).filter((cs) => cs.met.includes(seat)).length >= n;
    case 'HAVE_X_WONDERS':
      return citiesOf(state, seat).reduce((t, c) => t + c.wonders.filter((w) => state.map.tiles[w.tileIndex].builtWonderComplete).length, 0) >= n;
    case 'HAVE_WONDER_PAST_X_ERA':
      // a wonder of the era numbered `n` from the Ancient's 1 or later
      return citiesOf(state, seat).some((c) => c.wonders.some((w) => state.map.tiles[w.tileIndex].builtWonderComplete
        && (WONDER_ERA_INDEX[w.id] ?? 0) + 1 >= n));
    case 'HAVE_X_BUILDINGS':
    case 'CONSTRUCT_BUILDING':
      return citiesOf(state, seat).reduce((t, c) => t + c.buildings.filter((x) => x === b.building).length, 0) >= n;
    case 'HAVE_BUILDING_MOUNTAIN':
      // the building in a city whose district holding it borders a Mountain
      return citiesOf(state, seat).some((c) => {
        if (!c.buildings.includes(b.building!)) return false;
        return c.districts.some((d) => d.type === BUILDINGS[b.building!].district
          && neighbors(state.map, state.map.tiles[d.tileIndex]).some(isMountain));
      });
    case 'MAINTAIN_X_TRADE_ROUTES':
      return (s.tradeRoutes?.length ?? 0) >= n;
    case 'SETTLE_COAST':
      return citiesOf(state, seat).some((c) => isCoastalLand(state.map, state.map.tiles[c.centerIndex]));
    case 'FIND_NATURAL_WONDER':
      // a natural wonder plot the seat has revealed (runs/h1_duelw1115 Rome's
      // inspiration at t4, owning no plot beside one)
      return state.map.tiles.some((t) => naturalWonderAt(t) !== null && isExplored(state, seat, t.index));
    case 'OWN_X_UNITS_OF_TYPE':
      return ownUnits(state, seat, (t) => isUnitOf(t, b.unit!)) >= n;
    case 'HAVE_X_LAND_UNITS':
      // land combat units, a Scout among them (runs/h1_duelw11*: Rome at 7
      // Warriors and a Scout, China at 7 Warriors and an Archer beside its
      // Builder, Trader, Settler and Great Scientist)
      return ownUnits(state, seat, (t) => isLandCombat(t)) >= n;
    case 'HAVE_X_CORPS':
      return ownUnits(state, seat, (_t, f) => f === 1) >= n;
    case 'HAVE_X_ARMIES':
      return ownUnits(state, seat, (_t, f) => f === 2) >= n;
    case 'TRAIN_UNIT': {
      const cls = Object.keys(GREAT_PEOPLE).find((k) => b.unit === `GREAT_${k}`);
      if (cls) {
        const ids = new Set(GREAT_PEOPLE[cls as keyof typeof GREAT_PEOPLE].map((p) => p.id));
        return (s.gpEarned ?? []).some((id) => ids.has(id));
      }
      return ownUnits(state, seat, (t) => isUnitOf(t, b.unit!)) >= 1;
    }
    case 'HAVE_X_GREAT_PEOPLE':
      return (s.gpEarned ?? []).length >= n;
    case 'HAVE_AN_ALLIANCE':
      return state.seats.some((o) => o.seat !== seat && allianceLevelWith(state, seat, o.seat) >= 1);
    case 'HAVE_ALLIANCE_LEVEL_X':
      return state.seats.some((o) => o.seat !== seat && allianceLevelWith(state, seat, o.seat) >= n);
    case 'HAVE_X_CITIES_FOLLOWING_YOUR_RELIGION': {
      if (!s.religion.founded) return false;
      let k = 0;
      for (const o of state.seats) for (const c of o.cities) if (c.followedReligion === seat) k++;
      for (const cs of state.cityStates ?? []) for (const c of cs.cities) if (c.followedReligion === seat) k++;
      for (const c of state.freeSeat?.cities ?? []) if (c.followedReligion === seat) k++;
      return k >= n;
    }
    case 'HAVE_GOVERNMENT_TIER': {
      const g = seatGovernment(state, seat);
      return !!g && (GOVERNMENTS[g]?.tier ?? 0) >= b.govTier!;
    }
    default:
      return false;
  }
}

/** A boost an EVENT lands at once (Military Tradition's camp clear,
 *  BOOST_TRIGGER_CLEAR_CAMP): its dedication's era score with it, as
 *  `detectBoosts` lands one. */
export function grantBoost(state: GameState, seat: number, id: string): void {
  if (markBoost(state, seat, id)) dedicationEvent(state, seat, TECHS[id] ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE);
}

/** every row of an event class whose arguments `hit` accepts, granted */
function grantEvent(state: GameState, seat: number, cls: string, hit: (b: BoostDef) => boolean): void {
  for (const [id, b] of Object.entries(BOOSTS)) if (b.cls === cls && hit(b)) grantBoost(state, seat, id);
}

/** CIV6 (BOOST_TRIGGER_KILL_WITH / _KILL_SPECIFIC_UNIT / _NUM_BARBS_KILLED):
 *  a major's unit of `killerType` (none for a city's shot) destroyed a unit
 *  of `victimType`; a barbarian victim counts toward the seat's barbarian
 *  kills. */
export function boostOnKill(state: GameState, seat: number, killerType: string | undefined, victimType: string, barbVictim: boolean): void {
  const s = seatOf(state, seat) as Seat | undefined;
  if (!s || !isCiv(seat)) return;
  if (barbVictim) s.barbKills = (s.barbKills ?? 0) + 1;
  if (killerType) grantEvent(state, seat, 'KILL_WITH', (b) => isUnitOf(killerType, b.unit!));
  grantEvent(state, seat, 'KILL_SPECIFIC_UNIT', (b) => isUnitOf(victimType, b.unit!));
  grantEvent(state, seat, 'NUM_BARBS_KILLED', (b) => (s.barbKills ?? 0) >= (b.n ?? 1));
}

/** CIV6 (BOOST_TRIGGER_RECEIVE_DOW / _DOW_CASUS_BELLI): `declarer` declared
 *  war on `target`, through a casus belli or not */
export function boostOnWarDeclared(state: GameState, declarer: number, target: number, casusBelli: boolean): void {
  if (isCiv(target)) grantEvent(state, target, 'RECEIVE_DOW', () => true);
  if (casusBelli && isCiv(declarer)) grantEvent(state, declarer, 'DOW_CASUS_BELLI', () => true);
}

/** CIV6 (BOOST_TRIGGER_CLEAR_CAMP / _CREATED_NATIONAL_PARK /
 *  _ARTIFACT_EXTRACTED): the event's boosts, each with its dedication */
export function boostOnEvent(state: GameState, seat: number, cls: 'CLEAR_CAMP' | 'CREATED_NATIONAL_PARK' | 'ARTIFACT_EXTRACTED'): void {
  if (isCiv(seat)) grantEvent(state, seat, cls, () => true);
}

export function isBoosted(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.boosted.includes(id);
}

export function detectBoosts(state: GameState, seat: number): string[] {
  const research = seatOf(state, seat)?.research;
  if (!research) return [];
  // every trigger read off the state as it stands, then each one landed — an
  // item a landing completes moves no trigger read in the same pass
  const due = Object.entries(BOOSTS).filter(([id, def]) => !research.boosted.includes(id)
    && !research.techs.includes(id) && !research.civics.includes(id) && stateTrigger(state, seat, def)).map(([id]) => id);
  const newly: string[] = [];
  for (const id of due) {
    if (!markBoost(state, seat, id)) continue;
    dedicationEvent(state, seat, TECHS[id] ? DED_FREE_INQUIRY : DED_PEN_BRUSH_AND_VOICE);
    newly.push(id);
  }
  return newly;
}

/**
 * THE RANDOM BOOST PICKERS' POOL (the DLL's 0x4caa50 for techs, 0x39c930
 * for civics: "Choosing random tech / civic boost to grant based on era,
 * Player: n"): the rows of the eras `lo`..`hi` that carry a `Boosts` row
 * (`BOOSTLESS`), neither held nor boosted — era by era, each era's rows in
 * the install table's order (`TECH_TABLE_ORDER` / `CIVIC_TABLE_ORDER`) —,
 * each weight 1.
 */
export function boostPool(rsr: ResearchState, kind: 'tech' | 'civic', lo: number, hi: number): string[] {
  const rows = kind === 'tech' ? TECH_TABLE_ORDER.map((id) => TECHS[id]) : CIVIC_TABLE_ORDER.map((id) => CIVICS[id]);
  const held = kind === 'tech' ? rsr.techs : rsr.civics;
  const out: string[] = [];
  for (let e = Math.max(0, lo); e <= hi && e < ERAS.length; e++) {
    for (const d of rows) {
      if (ERAS.indexOf(d.era) === e && !BOOSTLESS.has(d.id) && !held.includes(d.id) && !rsr.boosted.includes(d.id)) out.push(d.id);
    }
  }
  return out;
}

/** The goody hut's and the era-less grants' era (the DLL's 0x4ca470 /
 *  0x39c330, "Choosing random tech / civic boost to grant based on era"): the
 *  earliest era holding a row `boostPool` would offer; -1 with none. */
export function earliestBoostEra(rsr: ResearchState, kind: 'tech' | 'civic'): number {
  for (let e = 0; e < ERAS.length; e++) if (boostPool(rsr, kind, e, e).length > 0) return e;
  return -1;
}

/** `n` draws over `pool`, each removing its pick, the picks landed on
 *  `seat` (`markBoost`); the count drawn (none from an empty pool). */
export function drawBoosts(state: GameState, seat: number, kind: 'tech' | 'civic', pool: string[], n: number): number {
  let k = 0;
  for (; k < n && pool.length > 0; k++) markBoost(state, seat, pool.splice(randRange(state, pool.length, kind === 'tech' ? 'Choosing random tech boost to grant based on era' : 'Choosing random civic boost to grant based on era'), 1)[0]);
  return k;
}
