import { describe, it, expect } from 'vitest';
import { playerSeat, setTileOwner } from '../src/core/seats';
import { makeState, tileAtCoords, grantTechs } from './helpers';
import { foundCity } from '../src/core/game';
import { spawnUnit, archaeologistExcavate, trainableUnits } from '../src/core/units';
import { markAntiquitySite } from '../src/core/combat';
import {
  ARTIFACT_BUILDING,
  ARTIFACT_SLOTS,
  ARTIFACT_CULTURE,
  ARTIFACT_TOURISM,
  ARCHAEOLOGIST_CHARGES,
  artifactCulture,
  artifactTourism,
} from '../src/data/greatPeople';
import { BUILDINGS } from '../src/data/buildings';
import type { City, GameState } from '../src/core/types';

// B-20 (#79) ARTIFACTS + ARCHAEOLOGY. Sourced from the Civ 6 wiki: an Artifact
// pays +3 Culture / +3 Tourism, an Archaeological Museum holds 3, and the
// Archaeologist (3 charges, Natural History) excavates Antiquity Sites, which
// pre-Modern events create.

function found(state: GameState, col: number, row: number): City {
  const r = foundCity(state, tileAtCoords(state.map, col, row).index);
  expect(r.ok).toBe(true);
  return r.city!;
}

describe('B-20 (#79): artifacts and archaeology', () => {
  it('the sourced constants and the museum choice', () => {
    expect(ARTIFACT_CULTURE).toBe(3);
    expect(ARTIFACT_TOURISM).toBe(3);
    expect(ARTIFACT_SLOTS).toBe(3);
    expect(ARCHAEOLOGIST_CHARGES).toBe(3);
    // real Civ 6: a Theater Square holds the ART museum OR the ARCHAEOLOGICAL
    // one, never both
    expect(BUILDINGS.MUSEUM.exclusiveWith).toContain(ARTIFACT_BUILDING);
    expect(BUILDINGS[ARTIFACT_BUILDING].exclusiveWith).toContain('MUSEUM');
    // ... and BOTH unlock on Humanism (the bug this pinned: the new building
    // had no unlock at all, so only the GPU could build it)
    expect(BUILDINGS[ARTIFACT_BUILDING].district).toBe('THEATER_SQUARE');
  });

  it('a pre-Modern death leaves an antiquity site; a tile never stacks two', () => {
    const state = makeState();
    const t = tileAtCoords(state.map, 5, 5);
    markAntiquitySite(state, t.index);
    expect(t.antiquity).toBe(true);
    markAntiquitySite(state, t.index); // no stacking
    expect(t.antiquity).toBe(true);
  });

  it('an Archaeologist excavates a site into an artifact, and the dig is consumed', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    const dig = tileAtCoords(state.map, 6, 5);
    setTileOwner(dig, city.seat, city.id);
    markAntiquitySite(state, dig.index);

    const arch = spawnUnit(state, 'ARCHAEOLOGIST', dig.index)!;
    arch.tileIndex = dig.index;
    expect(arch.charges).toBe(ARCHAEOLOGIST_CHARGES);

    expect(archaeologistExcavate(state, arch.id).ok).toBe(true);
    expect(city.artifacts).toBe(1);
    expect(dig.antiquity).toBe(false); // the dig is spent
    expect(arch.charges).toBe(ARCHAEOLOGIST_CHARGES - 1);

    // ... and the artifact pays the sourced yields
    expect(artifactCulture(city)).toBe(ARTIFACT_CULTURE);
    expect(artifactTourism(city)).toBe(ARTIFACT_TOURISM);

    // a second excavation with no site underfoot is refused
    expect(archaeologistExcavate(state, arch.id).ok).toBe(false);
  });

  it('excavation is refused with no free museum slot, rather than losing the find', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    city.artifacts = ARTIFACT_SLOTS; // full
    const dig = tileAtCoords(state.map, 6, 5);
    setTileOwner(dig, city.seat, city.id);
    markAntiquitySite(state, dig.index);
    const arch = spawnUnit(state, 'ARCHAEOLOGIST', dig.index)!;
    arch.tileIndex = dig.index;

    expect(archaeologistExcavate(state, arch.id).ok).toBe(false);
    expect(city.artifacts).toBe(ARTIFACT_SLOTS);
    expect(dig.antiquity).toBe(true); // the dig survives a refused excavation
  });

  it('an Archaeologist needs Natural History AND a museum with a free slot', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    const has = () => trainableUnits(state, city).some((d) => d.id === 'ARCHAEOLOGIST');
    expect(has()).toBe(false); // no civic, no museum
    grantTechs(state); // (techs only — the civic gate is separate)
    playerSeat(state).research.civics.push('NATURAL_HISTORY');
    expect(has()).toBe(false); // civic in, but still no museum
    city.buildings.push(ARTIFACT_BUILDING);
    expect(has()).toBe(true);
    city.artifacts = ARTIFACT_SLOTS; // museum full -> nothing left to dig for
    expect(has()).toBe(false);
  });
});
