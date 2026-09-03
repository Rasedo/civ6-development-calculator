/** THE MINOR BUILDS — `cityStatePhase`'s production half, in its own module
 * so the legality bodies it borrows (rules.ts, game.ts, effects.ts) stay
 * upstream of cityStates.ts with no import cycle.
 *
 * CIV6 (City-state): a city-state "will build a district within their
 * territory that corresponds to their type" — a cultural minor a Theater
 * Square, a militaristic one an Encampment — a Harbor when it sits on the
 * coast, and walls. The PACE is unpublished, so it takes the `minorResearch`
 * stylization: POPULATION points a turn into a production pot, and the
 * ladder's first buildable item completes when the pot covers it, at most
 * one a turn. The ladder itself is a MODEL choice (walls first, then the
 * type's district, the Harbor, the higher walls); what each item needs — the
 * minor's own researched unlock, a legal plot, an intact perimeter below a
 * higher wall — is the same rule a major pays.
 */
import type { City, CityState, DistrictId, GameState, Tile } from './types';
import { BUILDINGS } from '../data/buildings';
import { CITY_STATE_TYPE_DISTRICT, CITY_STATE_TYPE_TIER1 } from '../data/cityStates';
import { ENCAMPMENT_HP } from '../data/units';
import { canPlaceDistrictIn, outerPool, wallsMax } from './rules';
import { districtCostIn } from './game';
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

/** `canPlaceDistrictIn` wants a City; the minor's one city answers with the
 *  same facts — its centre counts as the CITY_CENTER instance every real
 *  city's list opens with. */
function minorCityStub(cityState: CityState): City {
  return {
    centerIndex: cityState.centerIndex,
    population: cityState.population,
    seat: cityState.seat,
    districts: [{ type: 'CITY_CENTER' as DistrictId, tileIndex: cityState.centerIndex }, ...(cityState.districts ?? [])],
    buildings: cityState.buildings ?? [],
  } as unknown as City;
}

/** The first legal plot in TILE-INDEX order — the GPU pick is the argmax of
 *  the eligibility plane, which is this same tile. -1 = no plot (also how a
 *  district the minor already holds reads, through the stub's own list). */
function minorDistrictSite(state: GameState, cityState: CityState, district: DistrictId, unlocks: Unlocks): number {
  const centre = state.map.tiles[cityState.centerIndex];
  const stub = minorCityStub(cityState);
  const owns = (t: Tile) => tileSeat(t) === cityState.seat;
  const plots = tilesWithin(state.map, centre.col, centre.row, 3).slice().sort((a, b) => a.index - b.index);
  for (const t of plots) {
    if (canPlaceDistrictIn(state, stub, district, t.index, { unlocks, ownsTile: owns }).ok) return t.index;
  }
  return -1;
}

export function minorBuildPhase(state: GameState): void {
  for (const cityState of state.cityStates) minorBuild(state, cityState);
}

function minorBuild(state: GameState, cityState: CityState): void {
  cityState.prodProgress = (cityState.prodProgress ?? 0) + cityState.population;
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
      if (cityState.prodProgress < def.cost) return;
      cityState.prodProgress -= def.cost;
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
      if (cityState.prodProgress < def.cost) return;
      cityState.prodProgress -= def.cost;
      cityState.buildings = [...held, item.id];
      return;
    }
    const site = minorDistrictSite(state, cityState, item.district, unlocks);
    if (site < 0) continue;
    const cost = districtCostIn(cityState.research);
    if (cityState.prodProgress < cost) return;
    cityState.prodProgress -= cost;
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
