/** THE MINOR'S TURN — its city's yields, the research they buy and the item
 * they build, in its own module so the legality bodies it borrows (rules.ts,
 * game.ts, effects.ts, city.ts) stay upstream of cityStates.ts with no import
 * cycle.
 *
 * CIV6 (City-state): a city-state's city is an ordinary city — its Campus
 * yields Science, its Commercial Hub Gold — and the minor "develops
 * scientifically and culturally... it will apparently research certain techs
 * which will allow it to progress"; it "will build a district within their
 * territory that corresponds to their type" — a cultural minor a Theater
 * Square, a militaristic one an Encampment — a Harbor when it sits on the
 * coast, and walls. The city's own yields drive all of it: `computeCityStats`
 * over `minorCity` pays Science and Culture into the two research pots,
 * Production into the build pot, and banks Gold and Faith, which nothing
 * spends yet. The ladder itself is a MODEL choice (walls first, then the
 * type's district and its tier-1 building, the Harbor, the higher walls);
 * what each item needs — the minor's own researched unlock, a legal plot, an
 * intact perimeter below a higher wall — is the same rule a major pays.
 */
import type { CityState, DistrictId, GameState, Tile } from './types';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { CITY_STATE_TYPE_DISTRICT, CITY_STATE_TYPE_TIER1 } from '../data/cityStates';
import { ENCAMPMENT_HP } from '../data/units';
import { canPlaceDistrictIn, outerPool, wallsMax } from './rules';
import { seatGrowth } from './seatTurn';
import { cityBorderGrowth } from './phase';
import { districtCostIn, DISTRICT_SPECIALTY_COST } from './game';
import { computeCityStats } from './city';
import { minorCity } from './cityStates';
import { computeUnlocksIn, type Unlocks } from './effects';
import { tileSeat } from './seats';
import { tilesWithin } from '../../world/hex';

const MINOR_WALLS: readonly string[] = ['ANCIENT_WALLS', 'MEDIEVAL_WALLS', 'RENAISSANCE_WALLS'];

type MinorItem = { kind: 'walls'; id: string } | { kind: 'district'; district: DistrictId }
  | { kind: 'building'; id: string };

function minorLadder(cityState: CityState): MinorItem[] {
  return [
    { kind: 'walls', id: MINOR_WALLS[0] },
    { kind: 'district', district: CITY_STATE_TYPE_DISTRICT[cityState.type] },
    // the type district's TIER-1 building follows it — the ladder position
    // is the model's; the building's own gates are the rules a major pays
    { kind: 'building', id: CITY_STATE_TYPE_TIER1[cityState.type][0] },
    { kind: 'district', district: 'HARBOR' },
    { kind: 'walls', id: MINOR_WALLS[1] },
    { kind: 'walls', id: MINOR_WALLS[2] },
  ];
}

/** The first legal plot in TILE-INDEX order — the GPU pick is the argmax of
 *  the eligibility plane, which is this same tile. -1 = no plot (also how a
 *  district the minor already holds reads, through the city's own list). */
function minorDistrictSite(state: GameState, cityState: CityState, district: DistrictId, unlocks: Unlocks): number {
  const centre = state.map.tiles[cityState.centerIndex];
  const city = minorCity(cityState);
  const owns = (t: Tile) => tileSeat(t) === cityState.seat;
  const plots = tilesWithin(state.map, centre.col, centre.row, 3).slice().sort((a, b) => a.index - b.index);
  for (const t of plots) {
    if (canPlaceDistrictIn(state, city, district, t.index, { unlocks, ownsTile: owns }).ok) return t.index;
  }
  return -1;
}

/** One minor at a time — a district one minor lands may lend a neighbour's
 *  district adjacency across the border, so the next minor's yields read it. */
export function minorPhase(state: GameState): void {
  for (const cityState of state.cityStates) {
    minorAccrue(state, cityState);
    minorResearch(cityState);
    minorBuild(state, cityState);
  }
}

/**
 * The city's yields, once a turn, through the walk every major's city rides —
 * and then the two rules that walk feeds.
 *
 * CIV6 (City-state): the install has ONE city rule, so the minor's city GROWS
 * on its food box and CLAIMS ground on its culture box exactly as a major's
 * does (C-38). Both rules are the majors' own composers, and the boxes live
 * on the `CityState` record because `minorCity` builds a fresh `City` view
 * every call — so the results are written back.
 *
 * Its Gold and Faith still only bank: what the install lets a city-state
 * SPEND them on is DLL AI with no data behind it (question ledger).
 */
function minorAccrue(state: GameState, cityState: CityState): void {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const y = stats.total;
  cityState.prodProgress = (cityState.prodProgress ?? 0) + y.production;
  cityState.treasury += y.gold;
  cityState.research.techProgress += y.science;
  cityState.research.civicProgress += y.culture;
  cityState.faith += y.faith;
  seatGrowth(city, stats.effectiveFoodSurplus, stats.growthNeeded);
  cityBorderGrowth(state, city, cityState.seat, y.culture);
  cityState.population = city.population;
  cityState.foodBox = city.foodBox;
  cityState.cultureBox = city.cultureBox;
  cityState.tilesAcquired = city.tilesAcquired;
}

/** The cheapest available row completes (table order on a price tie), at most
 *  one per pot per turn. Early Empire is the row `borderClosedTo` reads. */
function minorResearch(cityState: CityState): void {
  const r = cityState.research;
  const tech = cheapestAvailable(TECHS, r.techs);
  if (tech && r.techProgress >= TECHS[tech].cost) {
    r.techProgress -= TECHS[tech].cost;
    r.techs.push(tech);
  }
  const civic = cheapestAvailable(CIVICS, r.civics);
  if (civic && r.civicProgress >= CIVICS[civic].cost) {
    r.civicProgress -= CIVICS[civic].cost;
    r.civics.push(civic);
  }
}

function cheapestAvailable(
  catalog: Record<string, { cost: number; prereqs: string[] }>,
  have: string[],
): string | null {
  let best: string | null = null;
  for (const [id, def] of Object.entries(catalog)) {
    if (have.includes(id)) continue;
    if (!def.prereqs.every((p) => have.includes(p))) continue;
    if (!best || def.cost < catalog[best].cost) best = id;
  }
  return best;
}

/** The ladder's first buildable item completes when the pot covers it, at
 *  most one a turn. */
function minorBuild(state: GameState, cityState: CityState): void {
  const pot = cityState.prodProgress ?? 0;
  const unlocks = computeUnlocksIn(cityState.research, []); // a MINOR carries no roster row
  const held = cityState.buildings ?? [];
  for (const item of minorLadder(cityState)) {
    if (item.kind === 'walls') {
      const def = BUILDINGS[item.id];
      if (!def || held.includes(item.id)) continue;
      if (!unlocks.buildings.has(item.id)) continue;
      if (!(def.requiresAny ?? []).every((r) => held.includes(r))) continue;
      // CIV6: "While city defenses are damaged, you cannot build higher
      // levels of Walls."
      const shape = { buildings: held, seat: cityState.seat, outerHp: cityState.outerHp };
      if (outerPool(state, shape) !== wallsMax(state, shape)) continue;
      if (pot < def.cost) return;
      cityState.prodProgress = pot - def.cost;
      cityState.buildings = [...held, item.id];
      cityState.outerHp = wallsMax(state, { buildings: cityState.buildings, seat: cityState.seat });
      // the Encampment's own pool refits at the walls tier (`fitEncampOuter`)
      for (const d of cityState.districts ?? []) {
        const t = state.map.tiles[d.tileIndex];
        if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = cityState.outerHp;
      }
      return;
    }
    if (item.kind === 'building') {
      const def = BUILDINGS[item.id];
      if (!def || held.includes(item.id)) continue;
      if (!unlocks.buildings.has(item.id)) continue;
      // the building wants its own COMPLETE district standing
      if (!(cityState.districts ?? []).some(
        (d) => d.type === def.district && state.map.tiles[d.tileIndex]?.districtComplete)) continue;
      if (pot < def.cost) return;
      cityState.prodProgress = pot - def.cost;
      cityState.buildings = [...held, item.id];
      return;
    }
    const site = minorDistrictSite(state, cityState, item.district, unlocks);
    if (site < 0) continue;
    // the row's OWN base, not the specialty one: a minor builds real
    // districts too and the install prices an Aqueduct at 36
    const cost = districtCostIn(cityState.research,
      DISTRICTS[item.district]?.cost ?? DISTRICT_SPECIALTY_COST);
    if (pot < cost) return;
    cityState.prodProgress = pot - cost;
    const t = state.map.tiles[site];
    t.district = item.district;
    t.districtComplete = true;
    (cityState.districts ??= []).push({ type: item.district, tileIndex: site });
    if (item.district === 'ENCAMPMENT') {
      t.encampHp = ENCAMPMENT_HP;
      t.encampOuterHp = wallsMax(state, { buildings: cityState.buildings ?? [], seat: cityState.seat });
    }
    return;
  }
}
