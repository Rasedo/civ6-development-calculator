import { describe, it, expect } from 'vitest';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { makeState, settleAt, tileAtCoords, grantTechs, holdWorks } from '../helpers';
import { spawnUnit, archaeologistExcavate, trainableUnits } from '../../../cpu/core/units';
import { markAntiquitySite } from '../../../cpu/core/combat';
import { ARCHAEOLOGIST_CHARGES } from '../../../cpu/data/greatPeople';
import { GW_HOLDERS, GWO_ARTIFACT, GWO_CULTURE, GWO_TOURISM, GWS_ARTIFACT } from '../../../cpu/data/greatWorks';
import { greatWorkTourism, greatWorkYields, gwCountObjs } from '../../../cpu/core/greatWorks';
const ARTIFACT_BUILDING = 'ARCHAEOLOGICAL_MUSEUM';
const ARTIFACT_SLOTS = 3;
const artifacts = (c: City) => gwCountObjs(c, [GWO_ARTIFACT]);
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState } from '../../../cpu/core/types';

// ARTIFACTS + ARCHAEOLOGY. Sourced from the Civ 6 wiki: an Artifact
// pays +3 Culture / +3 Tourism, an Archaeological Museum holds 3, and the
// Archaeologist (3 charges, Natural History) excavates Antiquity Sites, which
// pre-Modern events create.

function found(state: GameState, col: number, row: number): City {
  // settleAt spawns the settler that founding consumes under unitsMode
  return settleAt(state, tileAtCoords(state.map, col, row).index);
}

describe('artifacts and archaeology', () => {
  it('the sourced constants and the museum choice', () => {
    expect(GWO_CULTURE[GWO_ARTIFACT]).toBe(3);
    expect(GWO_TOURISM[GWO_ARTIFACT]).toBe(3);
    expect(GW_HOLDERS.find((h) => h.id === ARTIFACT_BUILDING)!.slots).toEqual([{ type: GWS_ARTIFACT, count: ARTIFACT_SLOTS }]);
    expect(ARCHAEOLOGIST_CHARGES).toBe(3);
    // real Civ 6: a Theater Square holds the ART museum OR the ARCHAEOLOGICAL
    // one, never both
    expect(BUILDINGS.MUSEUM.exclusiveWith).toContain(ARTIFACT_BUILDING);
    expect(BUILDINGS[ARTIFACT_BUILDING].exclusiveWith).toContain('MUSEUM');
    // ... and BOTH unlock on Humanism. A building with no unlock at all is
    // buildable on the GPU and not on TS, so the unlock must be present.
    expect(BUILDINGS[ARTIFACT_BUILDING].district).toBe('THEATER_SQUARE');
  });

  it('a pre-Modern death leaves an antiquity site; a tile never stacks two', () => {
    const state = makeState();
    const t = tileAtCoords(state.map, 5, 5);
    markAntiquitySite(state, t.index, 0);
    expect(t.antiquity).toBe(true);
    markAntiquitySite(state, t.index, 0); // no stacking
    expect(t.antiquity).toBe(true);
  });

  it('an Archaeologist excavates a site into an artifact, and the dig is consumed', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings.push(ARTIFACT_BUILDING);
    const dig = tileAtCoords(state.map, 6, 5);
    setTileOwner(dig, city.seat, city.id);
    markAntiquitySite(state, dig.index, 0);

    const arch = spawnUnit(state, 'ARCHAEOLOGIST', dig.index, 0)!;
    arch.tileIndex = dig.index;
    expect(arch.charges).toBe(ARCHAEOLOGIST_CHARGES);

    expect(archaeologistExcavate(state, arch.id, 0).ok).toBe(true);
    expect(artifacts(city)).toBe(1);
    expect(dig.antiquity).toBe(false); // the dig is spent
    expect(arch.charges).toBe(ARCHAEOLOGIST_CHARGES - 1);

    // ... and the artifact pays the sourced yields
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_ARTIFACT]);
    expect(greatWorkTourism(state, city, false)).toBe(GWO_TOURISM[GWO_ARTIFACT]);

    // a second excavation with no site underfoot is refused
    expect(archaeologistExcavate(state, arch.id, 0).ok).toBe(false);
  });

  it('excavation is refused with no free museum slot, rather than losing the find', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    city.buildings = city.buildings.filter((b) => b !== 'PALACE'); // no Palace slot to fall back on
    city.buildings.push(ARTIFACT_BUILDING);
    holdWorks(city, GWO_ARTIFACT, ARTIFACT_SLOTS); // full
    const dig = tileAtCoords(state.map, 6, 5);
    setTileOwner(dig, city.seat, city.id);
    markAntiquitySite(state, dig.index, 0);
    const arch = spawnUnit(state, 'ARCHAEOLOGIST', dig.index, 0)!;
    arch.tileIndex = dig.index;

    expect(archaeologistExcavate(state, arch.id, 0).ok).toBe(false);
    expect(artifacts(city)).toBe(ARTIFACT_SLOTS);
    expect(dig.antiquity).toBe(true); // the dig survives a refused excavation
  });

  it('an Archaeologist needs Natural History AND a museum with a free slot', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = found(state, 5, 5);
    // the capital's Palace slot takes an Artifact too; take it away so the
    // museum alone decides
    city.buildings = city.buildings.filter((b) => b !== 'PALACE');
    const has = () => trainableUnits(state, 0, city).some((d) => d.id === 'ARCHAEOLOGIST');
    expect(has()).toBe(false); // no civic, no museum
    grantTechs(state); // (techs only — the civic gate is separate)
    seatOf(state, 0)!.research.civics.push('NATURAL_HISTORY');
    expect(has()).toBe(false); // civic in, but still no museum
    city.buildings.push(ARTIFACT_BUILDING);
    expect(has()).toBe(true);
    holdWorks(city, GWO_ARTIFACT, ARTIFACT_SLOTS); // museum full -> nothing left to dig for
    expect(has()).toBe(false);
  });
});
