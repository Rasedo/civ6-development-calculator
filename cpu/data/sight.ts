/**
 * HOW SIGHT IS SPENT — measured 2026-09-13 in the live game (ask 11, B-56r;
 * `tools/civ6lab/sight_find.lua` + `sight_read.lua`, 17 geometries): it is
 * OCCLUSION BY ELEVATION, not a budget. A tile on the ray from the observer
 * hides everything behind it iff its SightThroughModifier sum — its
 * elevation's plus its feature's — EXCEEDS the observer's own SightModifier;
 * the range is the unit's BaseSightRange alone (a hill adds height, never
 * range); Sentry's `CanSee` means the FEATURE half of the through-cost is 0.
 *
 * CIV6 (Terrains.xml, every layer): every *_HILLS row carries
 * `SightModifier="1" SightThroughModifier="1"`, every *_MOUNTAIN row 2 and 2 —
 * the height a tile stands at is the height it puts in the way, so one table
 * serves both. CIV6 (Features.xml, all layers): FEATURE_FOREST 1 (this
 * engine's WOODS), FEATURE_JUNGLE 1 (RAINFOREST); of the natural wonders this
 * engine fields, ULURU 1, TORRES_DEL_PAINE 2, KILIMANJARO 2, YOSEMITE 2,
 * EVEREST 2 — Crater Lake, the Dead Sea, Galapagos, the Barrier Reef, the
 * Pantanal, Dover and the Eye of the Sahara carry no column at all.
 */
export const ELEVATION_SIGHT: Readonly<Record<string, number>> = { HILLS: 1, MOUNTAIN: 2 };

export const FEATURE_SIGHT_THROUGH: Readonly<Record<string, number>> = {
  WOODS: 1,
  RAINFOREST: 1,
  ULURU: 1,
  TORRES_DEL_PAINE: 2,
  MOUNT_KILIMANJARO: 2,
  YOSEMITE: 2,
  MOUNT_EVEREST: 2,
};

/** the farthest any chassis looks — the reach of the static line table both
 *  engines precompute (the Mountie's 4 plus a Spyglass is 5). */
export const SIGHT_MAX = 5;
