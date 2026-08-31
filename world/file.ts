/**
 * THE WORLD FILE FORMAT (Layer A) — canonical, seeder-owned, sufficient to
 * reconstruct the t0 world in any engine.
 *
 * Types only, no runtime imports: `world/` is the module both sides share, and
 * the format is the contract between `seeder/world.ts` (the producer) and
 * `cpu/world/load.ts` (the consumer). Layer B — the compiled per-tile planes
 * the GPU reads — is a pure function of this file plus the rule catalogs, and
 * is produced by `cpu/export/`, never here.
 *
 * Every index space the file uses is declared IN the file (`catalogs`), so a
 * renumbered catalog is a load-time failure, not a silent permutation. Unit
 * and city-state types are STRINGS. `rngInit` is DECLARED, not captured
 * mid-stream: placement draws from the seeder's own labelled streams, so the
 * play stream starts exactly at the seed.
 */

export interface WorldUnit {
  type: string;
  tile: number;
}

export interface WorldCiv {
  leader: number;
  aggression: number;
  units: WorldUnit[];
}

export interface WorldCityState {
  name: string;
  type: string;
  center: number;
}

export interface WorldMapLayers {
  width: number;
  height: number;
  terrain: number[];
  elevation: number[];
  feature: number[];
  resource: number[];
  riverMask: number[];
  cliffMask: number[];
  volcano: number[];
  goodyHut: number[];
}

export interface WorldCatalogs {
  terrains: string[];
  elevations: string[];
  features: string[];
  resources: string[];
}

export interface WorldFile {
  format: 'world@1';
  gen: {
    seed: number;
    placement: string;
    params: { width: number; height: number; cityStateMax: number; civCount: number };
    genStamp: string;
  };
  catalogs: WorldCatalogs;
  map: WorldMapLayers;
  civs: WorldCiv[];
  cityStates: WorldCityState[];
  rngInit: number;
  worldHash?: string;
}
