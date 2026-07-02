import { describe, it, expect } from 'vitest';
import { parseCivExport, importSummary } from '../src/core/importer';
import { neighborOffset, oppositeDir, inBounds, tileIndex, DIR_E, DIR_NE } from '../src/core/hex';

function makeExport(lines: string[], width = 6, height = 6): string {
  const plots: string[] = [];
  const provided = new Map<string, string>();
  for (const l of lines) {
    const [, x, y] = l.split('|');
    provided.set(`${x},${y}`, l);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      plots.push(provided.get(`${x},${y}`) ?? `CIV6MAP|${x}|${y}|TERRAIN_OCEAN|-|-|-|0`);
    }
  }
  return [`CIV6MAP_BEGIN|${width}|${height}`, ...plots, 'CIV6MAP_END'].join('\n');
}

describe('civ 6 map importer', () => {
  it('parses terrain, elevation, lakes, features and resources', () => {
    const text = makeExport([
      'CIV6MAP|1|1|TERRAIN_GRASS|-|-|-|0',
      'CIV6MAP|2|1|TERRAIN_PLAINS_HILLS|FEATURE_FOREST|RESOURCE_DEER|-|0',
      'CIV6MAP|3|1|TERRAIN_DESERT_MOUNTAIN|-|-|-|0',
      'CIV6MAP|1|2|TERRAIN_COAST|-|RESOURCE_FISH|L|0',
      'CIV6MAP|2|2|TERRAIN_PLAINS|FEATURE_JUNGLE|RESOURCE_BANANAS|-|0',
      'CIV6MAP|3|2|TERRAIN_DESERT|FEATURE_FLOODPLAINS|-|-|0',
    ]);
    const { map, report } = parseCivExport(text);
    expect(report.plots).toBe(36);
    expect(report.missingPlots).toBe(0);

    const at = (x: number, y: number) => map.tiles[tileIndex(map, x, y)];
    expect(at(1, 1)).toMatchObject({ terrain: 'GRASSLAND', elevation: 'FLAT' });
    expect(at(2, 1)).toMatchObject({ terrain: 'PLAINS', elevation: 'HILLS', feature: 'WOODS', resource: 'DEER' });
    expect(at(3, 1)).toMatchObject({ terrain: 'DESERT', elevation: 'MOUNTAIN' });
    expect(at(1, 2)).toMatchObject({ terrain: 'LAKE', resource: 'FISH' });
    expect(at(2, 2)).toMatchObject({ feature: 'RAINFOREST', resource: 'BANANAS' });
    expect(at(3, 2)).toMatchObject({ terrain: 'DESERT', feature: 'FLOODPLAINS' });
  });

  it('maps natural wonders and reports unknown content', () => {
    const text = makeExport([
      'CIV6MAP|2|2|TERRAIN_DESERT|FEATURE_ULURU|-|-|0',
      'CIV6MAP|3|3|TERRAIN_GRASS|FEATURE_EVEREST|-|-|0',
      'CIV6MAP|4|4|TERRAIN_GRASS|-|RESOURCE_GYPSUM|-|0',
    ]);
    const { map, report } = parseCivExport(text);
    expect(map.tiles[tileIndex(map, 2, 2)].wonder).toBe('ULURU');
    expect(report.wonders).toContain('ULURU');
    expect(report.unknownFeatures['FEATURE_EVEREST']).toBe(1);
    expect(report.unknownResources['RESOURCE_GYPSUM']).toBe(1);
    expect(map.tiles[tileIndex(map, 3, 3)].feature).toBeNull();
    expect(importSummary(report)).toContain('unknown');
  });

  it('imports river flags with symmetric masks', () => {
    const text = makeExport([
      'CIV6MAP|2|2|TERRAIN_GRASS|-|-|-|3', // east edge (1) + southeast-in-civ edge (2)
    ]);
    const { map } = parseCivExport(text);
    const t = map.tiles[tileIndex(map, 2, 2)];
    expect(t.riverMask & (1 << DIR_E)).toBeTruthy();
    expect(t.riverMask & (1 << DIR_NE)).toBeTruthy();
    for (let d = 0; d < 6; d++) {
      if (!(t.riverMask & (1 << d))) continue;
      const [nc, nr] = neighborOffset(t.col, t.row, d);
      if (!inBounds(map, nc, nr)) continue;
      const n = map.tiles[tileIndex(map, nc, nr)];
      expect(n.riverMask & (1 << oppositeDir(d))).toBeTruthy();
    }
  });

  it('tolerates Lua.log prefixes and junk lines', () => {
    const body = makeExport(['CIV6MAP|1|1|TERRAIN_TUNDRA|-|-|-|0'])
      .split('\n')
      .map((l) => ` InGame: ${l}`)
      .join('\n');
    const text = `Loading mod...\n${body}\nGame ended.`;
    const { map } = parseCivExport(text);
    expect(map.tiles[tileIndex(map, 1, 1)].terrain).toBe('TUNDRA');
  });

  it('fails clearly without a header and counts missing plots', () => {
    expect(() => parseCivExport('CIV6MAP|0|0|TERRAIN_GRASS|-|-|-|0')).toThrow(/plot line before/);
    expect(() => parseCivExport('no map here')).toThrow(/No CIV6MAP_BEGIN/);

    const partial = ['CIV6MAP_BEGIN|6|6', 'CIV6MAP|0|0|TERRAIN_GRASS|-|-|-|0', 'CIV6MAP_END'].join('\n');
    const { report } = parseCivExport(partial);
    expect(report.missingPlots).toBe(35);
  });
});
