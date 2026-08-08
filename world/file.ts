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
  /** Unit type id (a string — the engine validates it against its roster). */
  type: string;
  tile: number;
}

export interface WorldCiv {
  /** Leader index — the engine resolves identity (name, color, city names)
   *  from its own leader table. Civ 0 is not special; the array is the
   *  seat order. */
  leader: number;
  /** 0..1 — war likelihood; drawn from this civ's placement stream. */
  aggression: number;
  /** Starting units, in array order (the order is part of the contract:
   *  the serve gate compares per-unit rows in array order). */
  units: WorldUnit[];
}

export interface WorldCityState {
  name: string;
  type: string;
  center: number;
}

/** Per-tile layers, parallel arrays over tile index. Coded layers index into
 *  `catalogs`; -1 = none. */
export interface WorldMapLayers {
  width: number;
  height: number;
  terrain: number[];
  elevation: number[];
  feature: number[];
  resource: number[];
  wonder: number[];
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
  wonders: string[];
}

export interface WorldFile {
  format: 'world@1';
  gen: {
    seed: number;
    /** The placement policy version — bump it whenever a placement rule
     *  changes, so worlds.lock says WHY every hash moved. */
    placement: string;
    params: { width: number; height: number; csMax: number; rMax: number };
    /** Hash of the seeder+world sources that generated this file. */
    genStamp: string;
  };
  catalogs: WorldCatalogs;
  map: WorldMapLayers;
  civs: WorldCiv[];
  cityStates: WorldCityState[];
  /** The play stream's declared start: (seed ^ 0x9e3779b9) >>> 0. */
  rngInit: number;
  /** sha256 of this file without the hash itself — the worlds.lock entry. */
  worldHash?: string;
}
