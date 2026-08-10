/**
 * LAYER B — the COMPILED PLANES the GPU consumes, built from a LOADED world.
 *
 * A pure function of Layer A plus the rule catalogs, computed engine-side so
 * the ~60 tile predicates have exactly one implementation, in the language
 * that is the oracle. Never authoritative: regenerate at will, compare via
 * the srcStamp/worldHash pair.
 *
 * FORMAT 2 (#71): there are NO pre-founded major cities and NO planned
 * sites — every civ starts as its file units (settler + warrior), carried in
 * `civs[]` (one array; civ 0 is not special). load_fixture refuses any other
 * format.
 */
import type { GameState } from '../core/types';
import { YIELD_KEYS } from '../core/types';
import type { WorldFile } from '../../world/file';
import { cityStateOfSeat, isCityStateSeat, tileCity, tileSeat } from '../core/seats';
import { makeYieldCtx } from '../core/effects';
import { tileYields, districtAdjacency } from '../core/yields';
import { terrainDefense } from '../core/combat';
import { moveCostInto, unitPassable } from '../core/units';
import { hasFreshWater, hasRiver, isCoastalLand, isCoastalWater, isImpassable, isMountain, isWater } from '../../world/query';
import { neighbors } from '../../world/hex';
import { UNITS } from '../data/units';
import { TERRAINS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { CITY_STATE_TYPES, CITY_STATE_SUZERAIN_LIVE } from '../data/cityStates';
import { HOUSING_COASTAL, HOUSING_FRESH_WATER, HOUSING_NO_WATER } from '../data/constants';
import { IMPROVEMENT_IDS } from '../core/unitActions';
import { LUXURY_IDS, RESOURCE_IDS, BUILT_WONDER_LIST, featIdx, wonderStaticOk, staticAdjRaw, featureAdjContribution, chopKeyCode, chopUnlockTech } from './catalog';

/** Layer B for one loaded world. `srcStamp` is stamped by the CLI. */
export function buildFixture(state: GameState, world: WorldFile): object {
  const map = state.map;
  const ctx = makeYieldCtx(state);

  const cityStateAtStart = state.cityStates.map((cityState) => ({
    id: cityState.id,
    type: CITY_STATE_TYPES.indexOf(cityState.type),
    center: cityState.centerIndex,
    pop: 3,
    // The suzerain unique-perk yield column for THIS named CS (-1 =
    // descoped row), name-keyed off CITY_STATE_SUZERAIN_LIVE.
    suzKey: CITY_STATE_SUZERAIN_LIVE[cityState.name] ? YIELD_KEYS.indexOf(CITY_STATE_SUZERAIN_LIVE[cityState.name]) : -1,
  }));

  const unitRosterIdx = new Map(Object.values(UNITS).map((u, i) => [u.id, i]));

  // The static camp/settle planes assume no goody hut can (dis)appear
  // mid-game — enforce the withVillages contract rather than trusting it.
  if (map.tiles.some((t) => t.goodyHut)) {
    throw new Error('GPU export requires a hut-free world (withVillages: false)');
  }

  const tiles = map.tiles.map((t) => {
    // C1-B1: the static plane ships UNPAVED yields — what the tile would
    // yield without its district — because paving is a runtime mask in every
    // GPU consumer, and civ-seat centers need their real (district-nulled)
    // yields live (tileYieldsForCenter). Only t=0 district tiles (capitals)
    // differ from the old export.
    const y = tileYields(ctx, t.district ? { ...t, district: null } : t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      workable: !isImpassable(t) && !t.district ? 1 : 0,
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
      // near a natural wonder (for the ASTROLOGY-style eureka)
      wnear: t.wonder !== null || neighbors(map, t).some((n) => n.wonder !== null) ? 1 : 0,
      // coastal land (A-3: civ-seat coastalCity eurekas — seat 0's uses
      // the per-city flag set at founding/capture)
      cl: isCoastalLand(map, t) ? 1 : 0,
      // feature id (A-7: belief featureYields — Lady of the Reeds tiles);
      // live via feat_stripped (chops/paves null features)
      fid: t.feature ? featIdx.get(t.feature) ?? -1 : -1,
      // A-13 off-script gate catch (rng 2026006108 t81): foundCity strips
      // ONLY a REMOVABLE feature (game.ts:209 / phase.ts:144) — an OASIS/
      // FLOODPLAINS center keeps its feature LIVE, and belief featureYields
      // (Lady of the Reeds) apply to it. The GPU founding paths gate their
      // feat_stripped/tdef writes on this bit.
      frm: t.feature && FEATURES[t.feature].removable ? 1 : 0,
      // A-4: resource id (Stonehenge's live stone adjacency, strip-aware),
      // desert flag (Petra) and the static per-wonder placement bitmask
      // (LIVE terms — ownership, occupancy, radius, non-bonus resource,
      // adjacent completed district / un-stripped resource, world
      // uniqueness — are the engine's job)
      rid: t.resource ? RESOURCE_IDS.indexOf(t.resource) : -1,
      des: t.terrain === 'DESERT' ? 1 : 0,
      wok: BUILT_WONDER_LIST.reduce((m2, w, i) => m2 | (wonderStaticOk(w, t, map) ? 1 << i : 0), 0),
      // land units may stand here (mirrors unitPassable land plane)
      pass: unitPassable(t) ? 1 : 0,
      // #45/B-6: WATER passability plane — a water tile that is not impassable
      // (mirrors unitPassable for a naval unit / an embarked land unit, terrain
      // layer only). Tech gating (embark-capability, OCEAN needing CARTOGRAPHY)
      // is composed in the engine at the war-march gather site.
      wpass: isWater(t) && !isImpassable(t) ? 1 : 0,
      // #45/B-6: OCEAN tile — needs CARTOGRAPHY to enter (COAST/LAKE ungated).
      ocean: t.terrain === 'OCEAN' ? 1 : 0,
      work: isImpassable(t) ? 0 : 1, // C1-B1: citizen-workable (water IS workable; ice/mountains are not)
      // Luxury amenity source (mirrors luxuryAmenities): the luxury's catalog
      // index + the improvement index that activates it. -9 = its improvement
      // is outside the GPU roster (PEARLS/WHALES -> FISHING_BOATS), so it can
      // never activate in the GPU — currently true in TS too (no scripted
      // builder path builds FISHING_BOATS), but #50's RL improvement verbs
      // would make it a LIVE asymmetry: revisit with A-18 (AUDIT note).
      lux: t.resource && RESOURCES[t.resource].category === 'luxury' ? LUXURY_IDS.indexOf(t.resource) : -1,
      luxreq: (() => {
        if (!t.resource || RESOURCES[t.resource].category !== 'luxury') return -9;
        const ri = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement ?? '');
        return ri >= 0 ? ri : -9;
      })(),
      // defender bonus (mirrors terrainDefense: hills / woods / rainforest +3;
      // B-28: marsh / floodplains −2). READ-only for defense in the engine.
      tdef: terrainDefense(t),
      // B-28: movement-slow encoding, DECOUPLED from tdef so marsh's defense
      // (−2) can differ from its slow-to-enter cost. enter cost = 1 + tmove//3
      // (= moveCostInto − 1): hills +3, slow feature (woods/rainforest/marsh)
      // +3; floodplains is NOT slow. tmove//3 is byte-identical to the OLD
      // tdef//3 for every tile, so movement trajectories are unchanged.
      // B-23 (#71): moveCostInto now takes the tile being LEFT. Passing the
      // same tile is the no-road terrain schedule, which is what tmove encodes
      // (the road discount is applied at step time, not baked into the plane).
      tmove: (moveCostInto(t, t) - 1) * 3,
      rd: t.road ? 1 : 0, // B-23 (#71): the ROAD plane (false at t0)
      // statically camp-eligible (dynamic exclusions — ownership, distance
      // to cities/camps — are the engine's job; mirrors campCandidates)
      camp: !isWater(t) && !isImpassable(t) && !t.wonder && !t.district && !t.builtWonder && !t.goodyHut ? 1 : 0,
      // city-state territory (static — placed at game creation)
      // #51/S1.3i: derived from the ONE seat field; the fixture keys are unchanged
      cityState: isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1,
      // (#96 tail: the `civSeat`/`rci` civ-territory keys are DELETED — format-2
      // worlds have no civ cities at t0, so both were provably all -1; the
      // engine starts its tile_seat civ half and tile_city registry empty.)
      // C1-B4b-2: Water Mill gates on a river at CIV-SEAT centers too
      riv: hasRiver(t) ? 1 : 0,
      // C1-B5b-iii: water housing IF a center stood here (fresh 5 /
      // coastal 3 / dry 2) — civ-seat housing reads it at their centers.
      wh: hasFreshWater(map, t) ? HOUSING_FRESH_WATER : isCoastalLand(map, t) ? HOUSING_COASTAL : HOUSING_NO_WATER,
      // V-H1 chop planes: ftr = the chop grant key when this tile's feature
      // is removable AND carries a chopYield AND no resource depends on it
      // (0 none, 1 food, 2 production); ftu = the tech whose effect unlocks
      // that feature's removal (-1 = never removable).
      ftr: chopKeyCode(t),
      ftu: chopUnlockTech(t),
      wt: isWater(t) ? 1 : 0,
      // Harbor placement surface (static part of canPlaceDistrict for a coastal
      // district): coastal/lake water adjacent to land, no wonder, no non-bonus
      // resource. Ownership/radius/district/improvement stay the engine's job.
      cw:
        isCoastalWater(map, t) && !t.wonder && !t.builtWonder &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      fw: hasFreshWater(map, t) ? 1 : 0,
      nw: t.wonder ? 1 : 0,
      // statically settleable for civ-seat expansion (mirrors siteQuality's -1s;
      // ownership and dynamic districts are the engine's job). GEO-H (#55):
      // `st` must NOT bake `!t.district` — the district is a LIVE property
      // (siteQuality reads tile.district each call), and the engine already
      // gates on `self.district < 0` at the candidate site. Baking the t0
      // district froze a tile that later loses its district (a razed city's
      // freed center) as permanently unsettleable in the GPU while TS re-opens
      // it live — the seed 9235/9144 founding-site divergence (G-6). Keep `st`
      // purely static: water / impassable / natural wonder / OASIS.
      st: !isWater(t) && !isImpassable(t) && !t.wonder && t.feature !== 'OASIS' ? 1 : 0,
      // district-usable land (static part of canPlaceDistrict for a non-coastal
      // land district): not water/impassable/wonder/builtWonder/oasis/floodplains,
      // no non-bonus resource, no district at t=0. Ownership, radius, the pop cap
      // and dynamically-built districts stay the engine's job.
      du:
        !isWater(t) && !isImpassable(t) && !t.wonder && !t.builtWonder &&
        t.feature !== 'OASIS' && t.feature !== 'FLOODPLAINS' && !t.district &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      // raw static district adjacency per placeable district (D2a). The engine
      // adds live dynamic sources (adjacent district/center/mine) then floors;
      // self-checked here at t=0 where dynamic=0 so floor(static)=districtAdjacency.
      dadj: PLACEABLE_DISTRICTS.map((id) => {
        const raw = staticAdjRaw(map, t, id);
        // Validate only where no dynamic source is live (no adjacent completed
        // district — at export the sole one is the just-founded city center;
        // no mines/harbors/wonders exist yet). There districtAdjacency ==
        // floor(static). Center-/district-adjacent tiles get validated by the
        // D2b parity gate once the engine adds dynamic sources before flooring.
        const adjDynamic = neighbors(map, t).some((n) => n.district !== null && n.districtComplete);
        if (!adjDynamic && Math.floor(raw) !== districtAdjacency(map, t, id)) {
          throw new Error(`dadj mismatch @${t.index} ${id}: floor(${raw}) != ${districtAdjacency(map, t, id)}`);
        }
        return raw;
      }),
      // per placeable district: the adjacency this tile's removable feature lends
      // to a neighbour, dropped when a city founds here (foundCity clears it).
      fadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id)),
      // P4: the NON-removable feature's lent adjacency (today: the GS REEF's
      // Campus bonus). queueDistrict nulls ANY feature when it paves the tile
      // (P2), so the engine must withdraw this too — foundCity does NOT
      // (it only clears removable features).
      nfadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id, false)),
      // The removable feature's OWN yields (C1-B3 gate catch): SEAT-0 founding
      // strips the feature, so a later loyalty-flip must read this center
      // stripped — civ-seat founding does NOT strip, and the t=0 capitals were
      // exported already-stripped.
      fy: t.feature && FEATURES[t.feature].removable ? YIELD_KEYS.map((k) => FEATURES[t.feature!].yields?.[k] ?? 0) : [0, 0, 0, 0, 0, 0],
      // Aqueduct water source (requiresWaterSourceOrMountain): on a river, or
      // adjacent to a lake / oasis / mountain. Static — the adjacent-center part
      // is dynamic (the engine checks it against the city's live center).
      aqsrc:
        hasRiver(t) ||
        neighbors(map, t).some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n))
          ? 1
          : 0,
      // this tile's static contributions to a nearby site's quality, one
      // per source (terrain, feature, resource) plus the hills flag —
      // siteQuality adds them as FOUR SEPARATE += steps, and candidate
      // qualities compare with strict >, so the engine must reproduce the
      // exact same floating-point add sequence (pre-summing shifts results
      // by an ulp and flips ties: 36.5 vs 36.49999999999999)
      sq: (['terrain', 'feature', 'resource'] as const).map((kind) => {
        const src =
          kind === 'terrain'
            ? TERRAINS[t.terrain]?.yields ?? {}
            : kind === 'feature'
              ? (t.feature ? FEATURES[t.feature]?.yields ?? {} : {})
              : (t.resource ? RESOURCES[t.resource]?.yields ?? {} : {});
        const s = src as { food?: number; production?: number; gold?: number };
        return (s.food ?? 0) * 1.2 + (s.production ?? 0) + (s.gold ?? 0) * 0.5;
      }),
      hl: t.elevation === 'HILLS' ? 1 : 0,
      // A-9 (#71): tile APPEAL contributions. `tileAppeal` (core/appeal.ts)
      // sums what each NEIGHBOUR contributes, so ship the per-tile
      // contribution and let the GPU gather it over `neigh`. `ap` is the
      // STATIC part (natural wonder +2, mountain +1, coast/lake +1) PLUS this
      // tile's t0 feature term; `apf` isolates that removable-feature term so
      // a chopped tile can subtract exactly it via feat_stripped. The rest is
      // DYNAMIC and recomputed GPU-side (completed built wonder +1,
      // MINE/QUARRY/OIL_WELL -1, INDUSTRIAL_ZONE/ENCAMPMENT -1).
      ap: (() => {
        let a = 0;
        if (t.wonder) a += 2;
        if (isMountain(t) && !t.wonder) a += 1;
        if (t.terrain === 'COAST' || t.terrain === 'LAKE') a += 1;
        if (t.feature === 'WOODS') a += 1;
        if (t.feature === 'RAINFOREST' || t.feature === 'MARSH') a -= 1;
        // #78: sourced additions — an adjacent OASIS is +1 and an adjacent
        // FLOODPLAINS is -1. Both are FEATURES, so both also belong in `apf`
        // below so a chop subtracts exactly the right amount.
        if (t.feature === 'OASIS') a += 1;
        if (t.feature === 'FLOODPLAINS') a -= 1;
        return a;
      })(),
      apf:
        t.feature === 'WOODS' || t.feature === 'OASIS'
          ? 1
          : t.feature === 'RAINFOREST' || t.feature === 'MARSH' || t.feature === 'FLOODPLAINS'
            ? -1
            : 0,
      // #78: the ON-TILE appeal term — "+1 if the tile is on a River or Lake".
      // NOT a neighbour contribution, so it cannot ride `ap`.
      aps: (t.riverMask ?? 0) !== 0 || t.terrain === 'LAKE' ? 1 : 0,
      // #78: appeal OVERRIDE. A natural-wonder tile is a fixed 5 and a mountain
      // tile a fixed 4, neither affected by neighbours; -999 means "no
      // override, compute normally". Only blanket auras (Eiffel Tower, Golden
      // Gate Bridge, Alvar Aalto, Charles Correa) would modify these, and none
      // are modelled.
      apo: t.wonder ? 5 : isMountain(t) ? 4 : -999,
      // AUDIT A-8: river-edge crossing bits for the civ-seat MP walkers. The
      // GPU's neigh columns enumerate AXIAL_DIRS order (E NE NW W SW SE) —
      // the same order riverMask bits use — so bit d = crossing toward
      // neighbor column d, both engines.
      rm: t.riverMask ?? 0,
      cm: t.cliffMask ?? 0, // B-26 (#79): CLIFF edge mask — blocks embark/disembark
      // AUDIT A-13: the resource's own-improvement roster index — resource
      // tiles accept exactly this improvement (validImprovements' resource
      // branch). -1 = no resource; -9 = out of roster (FISHING_BOATS on sea
      // resources: water tiles a land builder can never reach, both engines).
      rq: (() => {
        if (!t.resource) return -1;
        const i = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement);
        return i >= 0 ? i : -9;
      })(),
      // FARM validity (phase 6a), STATIC part of validImprovements — split
      // by gate. fa_f: flat grass/plains (no feature) or floodplains,
      // ungated. fa_h: hill grass/plains (no feature), needs the hillFarms
      // civic. Both require no resource (resource tiles only accept the
      // resource's own improvement), no district/natural-wonder, passable,
      // land. Ownership, the already-improved check and dynamically-founded
      // city centers stay the engine's job.
      fa_f:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? // resource tiles accept only the resource's improvement, ungated,
            // with no terrain/water check (validImprovements' resource branch);
            // rice/wheat are farmed, so those tiles are FARM-buildable
            RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) &&
            ((t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT') ||
              t.feature === 'FLOODPLAINS'))
          ? 1
          : 0,
      // hill farms are civic-gated and only for NON-resource tiles (resource
      // tiles are ungated in fa_f regardless of elevation).
      fa_h:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) &&
        t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1
          : 0,
      // MINE validity (STATIC part; tech-gated by MINING in the engine).
      // Non-resource: hills, no feature. A resource tile accepts only the
      // resource's own improvement, so it is MINE-buildable iff that resource
      // is mined (iron, etc.) — ungated by terrain, like fa_f's rice/wheat.
      mi:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS' && t.feature === null)
          ? 1
          : 0,
      // LUMBER_MILL validity (tech-gated by CONSTRUCTION). Woods, non-resource
      // (a resource on woods takes the resource's improvement instead).
      lu:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) && t.feature === 'WOODS'
          ? 1
          : 0,
      // post-CHOP variants (feature treated as removed): _strip_feature_at
      // switches farm/mine to these so a chopped WOODS/RAINFOREST tile becomes
      // farm/mine-able (TS validImprovementsIn gates on the LIVE feature).
      // B-27 (#71): SEASIDE_RESORT's STATIC half — flat G/P/D adjacent to a
      // COAST tile, on an unpaved passable tile. The two DYNAMIC halves stay
      // at runtime: the live feature test (a chop makes a tile eligible) and
      // the Breathtaking appeal test (neighbours change it).
      sr_c:
        !t.district && !t.wonder && !t.builtWonder && !isImpassable(t) && !isWater(t) &&
        !t.resource && t.elevation === 'FLAT' &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS' || t.terrain === 'DESERT') &&
        neighbors(map, t).some((n) => n.terrain === 'COAST')
          ? 1 : 0,
      // the tile carries NO feature right now (t0). A chop clears it, which the
      // engine tracks with feat_stripped — exactly the fa_f_c pattern.
      sr_nf: t.feature === null ? 1 : 0,
      fa_f_c:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT')
          ? 1 : 0,
      fa_h_c:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1 : 0,
      mi_c:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS')
          ? 1 : 0,
      // disaster statics: floodplain, drought-candidate (flat grass/plains),
      // desert, fertilizable (land, not mountain)
      fp: t.feature === 'FLOODPLAINS' ? 1 : 0,
      dc: (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT' ? 1 : 0,
      de: t.terrain === 'DESERT' ? 1 : 0,
      fz: !isWater(t) && t.elevation !== 'MOUNTAIN' ? 1 : 0,
    };
  });
  const volcanoes = map.tiles.filter((t) => t.volcano).map((t) => t.index);
  const landTiles = map.tiles.filter((t) => !isWater(t)).length;
  const maxCamps = Math.max(1, Math.floor(landTiles / 120));

  // No seat owns territory at t0 (city-state rings are the `cityState` plane).
  const ownerInit = map.tiles.map((t) => (tileSeat(t) === 0 ? tileCity(t) : -1));

  return {
    format: 2, // #71: settler starts
    seed: world.gen.seed,
    width: map.width,
    height: map.height,
    unitsMode: 1,
    fogOfWar: 1, // fog is LIVE in units mode — both engines derive t0 explored from the start units
    disasters: 1,
    volcanoes,
    maxCamps,
    rngInit: world.rngInit >>> 0,
    cityStateMax: world.gen.params.cityStateMax,
    civMax: world.gen.params.civMax,
    cityStates: cityStateAtStart,
    // ONE civ array, seat order, civ 0 not special: aggression + the t0
    // units (settler first, warrior second — file order is the contract).
    civs: state.seats.map((s) => ({
      seat: s.seat,
      aggression: s.aggression,
      treasury: 0,
      cities: s.cities.map((civCity) => ({ id: civCity.id, center: civCity.centerIndex, pop: civCity.population })),
      units: state.units
        .filter((u) => u.seat === s.seat)
        .map((u) => ({ type: unitRosterIdx.get(u.type) ?? 0, tile: u.tileIndex })),
    })),
    tiles,
    ownerInit,
    eraScoreInit: state.seats.map((s) => s.eraScore ?? 0),
    worldHash: world.worldHash,
  };
}
