/**
 * LAYER B — the COMPILED PLANES the GPU consumes, built from a LOADED world.
 *
 * A pure function of Layer A plus the rule catalogs, computed engine-side so
 * the ~60 tile predicates have exactly one implementation, in the language
 * that is the oracle. Never authoritative: regenerate at will, compare via
 * the srcStamp/worldHash pair.
 *
 * FORMAT 2: there are NO pre-founded major cities and NO planned
 * sites — every civ starts as its file units (settler + warrior), carried in
 * `civs[]` (one array; civ 0 is not special). load_fixture refuses any other
 * format.
 */
import type { GameState } from '../core/types';
import { YIELD_KEYS } from '../core/types';
import type { WorldFile } from '../../world/file';
import { tileCity, tileSeat } from '../core/seats';
import { baseYieldCtx } from '../core/effects';
import { tileYields, districtAdjacency } from '../core/yields';
import { terrainDefense } from '../core/combat';
import { terrainMp, unitPassable } from '../core/units';
import { hasFreshWater, hasRiver, isCoastalLand, isCoastalWater, isImpassable, isMountain, isWater, naturalWonderAt } from '../../world/query';
import { neighbors } from '../../world/hex';
import { UNITS } from '../data/units';
import { TERRAINS } from '../../world/terrains';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { CITY_STATE_TYPES, CITY_STATE_SUZERAIN_LIVE, CITY_STATE_SUZERAIN_BONUS, CITY_STATE_SUZERAIN_PEACE_ONLY, SUZ_EFFECTS } from '../data/cityStates';
import { HOUSING_COASTAL, HOUSING_FRESH_WATER, HOUSING_NO_WATER, MP_SCALE } from '../data/constants';
import { IMPROVEMENT_IDS } from '../core/unitActions';
import { IMPROVEMENTS } from '../data/improvements';
import { LUXURY_IDS, RESOURCE_IDS, TERRAIN_IDS, BUILT_WONDER_LIST, featIdx, wonderStaticOk, staticAdjRaw, featureAdjContribution, chopKeyCode, chopUnlockTech } from './catalog';

export function buildFixture(state: GameState, world: WorldFile): object {
  const map = state.map;
  // NOBODY's modifiers: the fixture's tile plane is what a tile yields before
  // any seat's research, and the GPU applies each row's own on top.
  const ctx = baseYieldCtx(state);

  const suzCodeOf = (name: string): number => {
    const rule = CITY_STATE_SUZERAIN_BONUS[name]?.suz;
    return rule ? SUZ_EFFECTS.indexOf(rule) : -1;
  };
  const cityStateAtStart = state.cityStates.map((cityState) => ({
    id: cityState.id,
    type: CITY_STATE_TYPES.indexOf(cityState.type),
    center: cityState.centerIndex,
    pop: 3,
    suzKey: CITY_STATE_SUZERAIN_LIVE[cityState.name] ? YIELD_KEYS.indexOf(CITY_STATE_SUZERAIN_LIVE[cityState.name]) : -1,
    suzPeace: CITY_STATE_SUZERAIN_PEACE_ONLY.includes(cityState.name) ? 1 : 0,
    suzCode: suzCodeOf(cityState.name),
    // the IMPROVEMENT this minor's suzerain may build, by roster index. The
    // catalog names the minor and the seeder draws which minors a map holds,
    // so the pairing can only be resolved here, per game.
    suzImp: IMPROVEMENT_IDS.indexOf(
      Object.values(IMPROVEMENTS).find((i) => i.suzerainOf === cityState.name)?.id ?? '',
    ),
  }));

  const unitRosterIdx = new Map(Object.values(UNITS).map((u, i) => [u.id, i]));

  // Every flag below that reads `t.resource` is baked ONCE here, but TS
  // recomputes it live — and a HARVEST is the only mutation that takes a
  // resource off a tile that stays workable (a district pave hides the loss
  // behind a zero-yield district). So each resource tile also ships `nr`:
  // the keys whose value would DIFFER if the tile carried no resource, which
  // is exactly what the twin copies in when the resource is harvested (C-52).
  const tileRec = (t: (typeof map.tiles)[number]) => {
    // the static plane ships UNPAVED yields — what the tile would
    // yield without its district — because paving is a runtime mask in every
    // GPU consumer, and civ-seat centers need their real (district-nulled)
    // yields live (tileYieldsForCenter). Only t=0 district tiles (capitals)
    // differ from the old export.
    const y = tileYields(ctx, t.district ? { ...t, district: null } : t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
      // what a Great Person's per-adjacent clause counts: the MOUNTAIN is
      // static, the natural wonder rides `nw` and RAINFOREST `fid` +
      // feat_stripped.
      mtn: t.elevation === 'MOUNTAIN' ? 1 : 0,
      cl: isCoastalLand(map, t) ? 1 : 0,
      fid: t.feature ? featIdx.get(t.feature) ?? -1 : -1,
      // off-script gate catch (rng 2026006108 t81): foundCity strips
      // ONLY a REMOVABLE feature (game.ts:209 / phase.ts:144) — an OASIS/
      // FLOODPLAINS center keeps its feature LIVE, and belief featureYields
      // (Lady of the Reeds) apply to it. The GPU founding paths gate their
      // feat_stripped/tdef writes on this bit.
      frm: t.feature && FEATURES[t.feature].removable ? 1 : 0,
      rid: t.resource ? RESOURCE_IDS.indexOf(t.resource) : -1,
      des: t.terrain === 'DESERT' ? 1 : 0,
      terr: TERRAIN_IDS.indexOf(t.terrain),
      wok: BUILT_WONDER_LIST.reduce((m2, w, i) => m2 | (wonderStaticOk(w, t, map) ? 1 << i : 0), 0),
      pass: unitPassable(t) ? 1 : 0,
      wpass: isWater(t) && !isImpassable(t) ? 1 : 0,
      ocean: t.terrain === 'OCEAN' ? 1 : 0,
      work: isImpassable(t) ? 0 : 1, // citizen-workable (water IS workable; ice/mountains are not)
      // Luxury amenity source (mirrors luxuryAmenities): the luxury's catalog
      // index + the improvement index that activates it. -9 = its improvement
      // is outside the GPU roster (PEARLS/WHALES -> FISHING_BOATS), so it can
      // never activate in the GPU — currently true in TS too (no scripted
      // builder path builds FISHING_BOATS), but the RL improvement verbs
      // would make it a LIVE asymmetry: revisit when those verbs land.
      lux: t.resource && RESOURCES[t.resource].category === 'luxury' ? LUXURY_IDS.indexOf(t.resource) : -1,
      luxreq: (() => {
        if (!t.resource || RESOURCES[t.resource].category !== 'luxury') return -9;
        const ri = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement ?? '');
        return ri >= 0 ? ri : -9;
      })(),
      tdef: terrainDefense(t),
      // the terrain PENALTY over a plain step, in MP_SCALE units
      tmove: terrainMp(t) - MP_SCALE,
      rd: t.road ? 1 : 0, // the ROAD plane (false at t0)
      rr: t.railroad ? 1 : 0, // the RAILROAD plane (false at t0)
      // the HUT clause is deliberately NOT baked in: a village is claimed
      // mid-game, so it ships as its own mutable plane and both engines AND
      // it in live (the baked-derivation trap C-52 exists for).
      camp: !isWater(t) && !isImpassable(t) && !naturalWonderAt(t) && !t.district && !t.builtWonder ? 1 : 0,
      goody: t.goodyHut ? 1 : 0,
      riv: hasRiver(t) ? 1 : 0,
      wh: hasFreshWater(map, t) ? HOUSING_FRESH_WATER : isCoastalLand(map, t) ? HOUSING_COASTAL : HOUSING_NO_WATER,
      // Chop planes: ftr = the chop grant key when this tile's feature
      // is removable AND carries a chopYield AND no resource depends on it
      // (0 none, 1 food, 2 production); ftu = the tech whose effect unlocks
      // that feature's removal (-1 = never removable).
      ftr: chopKeyCode(t),
      ftu: chopUnlockTech(t),
      wt: isWater(t) ? 1 : 0,
      cw:
        isCoastalWater(map, t) && !naturalWonderAt(t) && !t.builtWonder &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      fw: hasFreshWater(map, t) ? 1 : 0,
      // statically settleable for civ-seat expansion (mirrors siteQuality's -1s;
      // ownership and dynamic districts are the engine's job). GEO-H:
      // `st` must NOT bake `!t.district` — the district is a LIVE property
      // (siteQuality reads tile.district each call), and the engine already
      // gates on `self.district < 0` at the candidate site. Baking the t0
      // district froze a tile that later loses its district (a razed city's
      // freed center) as permanently unsettleable in the GPU while TS re-opens
      // it live — the seed 9235/9144 founding-site divergence. Keep `st`
      // purely static: water / impassable / natural wonder / OASIS.
      st: !isWater(t) && !isImpassable(t) && !naturalWonderAt(t) && t.feature !== 'OASIS' ? 1 : 0,
      // canPlaceDistrictIn's STATIC half. GS allows districts on floodplains,
      // so only the Oasis is refused by feature; the removable-feature TECH
      // gate is dynamic and lives on `ftu` (the engine reads it per seat).
      du:
        !isWater(t) && !isImpassable(t) && !naturalWonderAt(t) && !t.builtWonder &&
        t.feature !== 'OASIS' && !t.district &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      dadj: PLACEABLE_DISTRICTS.map((id) => {
        const raw = staticAdjRaw(map, t, id);
        const adjDynamic = neighbors(map, t).some((n) => n.district !== null && n.districtComplete);
        if (!adjDynamic && Math.floor(raw) !== districtAdjacency(map, t, id)) {
          throw new Error(`dadj mismatch @${t.index} ${id}: floor(${raw}) != ${districtAdjacency(map, t, id)}`);
        }
        return raw;
      }),
      fadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id)),
      // the NON-removable feature's lent adjacency (today: the GS REEF's
      // Campus bonus). queueDistrict nulls ANY feature when it paves the tile,
      // so the engine must withdraw this too — foundCity does NOT
      // (it only clears removable features).
      nfadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id, false)),
      // The removable feature's OWN yields. `foundCityAt` strips a removable
      // feature on EVERY seat, so a later loyalty-flip must read that centre
      // stripped; the t0 capitals were exported already-stripped.
      fy: t.feature && FEATURES[t.feature].removable ? YIELD_KEYS.map((k) => FEATURES[t.feature!].yields?.[k] ?? 0) : [0, 0, 0, 0, 0, 0],
      aqsrc:
        hasRiver(t) ||
        neighbors(map, t).some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n))
          ? 1
          : 0,
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
      // the COASTAL LOWLAND band, 1..3, 0 = none. `deriveLowlands` already
      // ran on this state, so the fixture ships the band TS computed rather
      // than asking the GPU to re-derive it — one BFS, two engines.
      lw: t.lowland ?? 0,
      // tile APPEAL contributions. `tileAppeal` (core/appeal.ts)
      // sums what each NEIGHBOUR contributes, so ship the per-tile
      // contribution and let the GPU gather it over `neigh`. `ap` is the
      // STATIC part (natural wonder +2, mountain +1, coast/lake +1) PLUS this
      // tile's t0 feature term; `apf` isolates that removable-feature term so
      // a chopped tile can subtract exactly it via feat_stripped. The rest is
      // DYNAMIC and recomputed GPU-side (completed built wonder +1,
      // MINE/QUARRY/OIL_WELL -1, INDUSTRIAL_ZONE/ENCAMPMENT -1).
      ap: (() => {
        let a = 0;
        if (naturalWonderAt(t)) a += 2;
        if (isMountain(t) && !naturalWonderAt(t)) a += 1;
        if (t.terrain === 'COAST' || t.terrain === 'LAKE') a += 1;
        if (t.feature === 'WOODS') a += 1;
        if (t.feature === 'RAINFOREST' || t.feature === 'MARSH') a -= 1;
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
      aps: (t.riverMask ?? 0) !== 0 || t.terrain === 'LAKE' ? 1 : 0,
      apo: naturalWonderAt(t) ? 5 : isMountain(t) ? 4 : -999,
      // river-edge crossing bits for the civ-seat MP walkers. The
      // GPU's neigh columns enumerate AXIAL_DIRS order (E NE NW W SW SE) —
      // the same order riverMask bits use — so bit d = crossing toward
      // neighbor column d, both engines.
      rm: t.riverMask ?? 0,
      cm: t.cliffMask ?? 0, // CLIFF edge mask — blocks embark/disembark
      // the resource's own-improvement roster index — resource
      // tiles accept exactly this improvement (validImprovements' resource
      // branch). -1 = no resource; -9 = a resource whose improvement the
      // action head carries no BUILD verb for, which no engine can place.
      rq: (() => {
        if (!t.resource) return -1;
        const i = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement);
        return i >= 0 ? i : -9;
      })(),
      fa_f:
        !t.district && !naturalWonderAt(t) && !isImpassable(t) &&
        (t.resource
          ? // resource tiles accept only the resource's improvement, ungated,
            RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) &&
            ((t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT') ||
              t.feature === 'FLOODPLAINS'))
          ? 1
          : 0,
      fa_h:
        !t.resource && !t.district && !naturalWonderAt(t) && !isImpassable(t) && !isWater(t) &&
        t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1
          : 0,
      mi:
        !t.district && !naturalWonderAt(t) && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS' && t.feature === null)
          ? 1
          : 0,
      lu:
        !t.resource && !t.district && !naturalWonderAt(t) && !isImpassable(t) && !isWater(t) && t.feature === 'WOODS'
          ? 1
          : 0,
      sr_c:
        !t.district && !naturalWonderAt(t) && !t.builtWonder && !isImpassable(t) && !isWater(t) &&
        !t.resource && t.elevation === 'FLAT' &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS' || t.terrain === 'DESERT') &&
        neighbors(map, t).some((n) => n.terrain === 'COAST')
          ? 1 : 0,
      fa_f_c:
        !t.district && !naturalWonderAt(t) && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT')
          ? 1 : 0,
      fa_h_c:
        !t.resource && !t.district && !naturalWonderAt(t) && !isImpassable(t) && !isWater(t) &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1 : 0,
      mi_c:
        !t.district && !naturalWonderAt(t) && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS')
          ? 1 : 0,
      // CIV6 (Continents): the landmass id, -1 for water. Derived at map
      // creation by `deriveContinents`, shipped so both engines read the
      // SAME ids rather than each flood-filling its own.
      cont: t.continent ?? -1,
      // CIV6 (Mountain Tunnel): the connected MOUNTAIN component this tile
      // belongs to, -1 off a mountain. Static, so it bakes (C-20).
      mrange: t.mountainRange ?? -1,
      fp: t.feature === 'FLOODPLAINS' ? 1 : 0,
      dc: (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT' ? 1 : 0,
      de: t.terrain === 'DESERT' ? 1 : 0,
      fz: !isWater(t) && t.elevation !== 'MOUNTAIN' ? 1 : 0,
    };
  };
  const tiles = map.tiles.map((t) => {
    const rec: Record<string, unknown> = tileRec(t);
    if (!t.resource) return rec;
    const bare: Record<string, unknown> = tileRec({ ...t, resource: null });
    const nr: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) {
      if (JSON.stringify(rec[k]) !== JSON.stringify(bare[k])) nr[k] = bare[k];
    }
    return { ...rec, nr };
  });
  const volcanoes = map.tiles.filter((t) => t.volcano).map((t) => t.index);
  const landTiles = map.tiles.filter((t) => !isWater(t)).length;
  const maxCamps = Math.max(1, Math.floor(landTiles / 120));

  const ownerSeatInit = map.tiles.map((t) => tileSeat(t));
  const ownerInit = map.tiles.map((t) => tileCity(t));

  return {
    // 4: `du` no longer refuses floodplains (GS builds districts on them), so
    // a format-3 fixture would silently hold a narrower placement surface.
    format: 4,
    seed: world.gen.seed,
    width: map.width,
    height: map.height,
    unitsMode: 1,
    fogOfWar: 1, // fog is LIVE in units mode — both engines derive t0 explored from the start units
    disasters: 1,
    volcanoes,
    maxCamps,
    rngInit: world.rngInit >>> 0,
    // `cityStateMax` is a genuine MAX — placement drops a city-state it
    // cannot space, so it sizes the minor rows and the roster may be
    // shorter. The majors have no such key: `civs[]` below IS the roster,
    // exact (`placeCivs` throws rather than drop a seat), and the GPU reads
    // its width off it.
    cityStateMax: world.gen.params.cityStateMax,
    cityStates: cityStateAtStart,
    civs: state.seats.map((s) => ({
      seat: s.seat,
      aggression: s.aggression,
      leader: s.civ,
      treasury: 0,
      cities: s.cities.map((civCity) => ({ id: civCity.id, center: civCity.centerIndex, pop: civCity.population })),
      units: state.units
        .filter((u) => u.seat === s.seat)
        .map((u) => ({ type: unitRosterIdx.get(u.type) ?? 0, tile: u.tileIndex })),
    })),
    tiles,
    ownerSeatInit,
    ownerInit,
    eraScoreInit: state.seats.map((s) => s.eraScore ?? 0),
    worldHash: world.worldHash,
  };
}
