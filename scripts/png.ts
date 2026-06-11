/**
 * Dependency-free map rasterizer + minimal PNG encoder, used by the
 * preview script to visualize generated maps without a browser.
 */

import { hexCenter, cornerOffsets, pixelToHex, inBounds, tileIndex, EDGE_CORNERS, neighborOffset, SQRT3 } from '../src/core/hex';
import { TERRAINS, MOUNTAIN_COLOR } from '../src/data/terrains';
import { WONDERS } from '../src/data/wonders';
import type { GameMap } from '../src/core/types';

const HEX = 9; // px per hex circumradius

const FEATURE_COLORS: Record<string, string> = {
  WOODS: '#2f5d2a',
  RAINFOREST: '#1f6b40',
  MARSH: '#2e6e5e',
  FLOODPLAINS: '#4f8f4f',
  OASIS: '#3fa9d8',
  REEF: '#e88fb1',
  ICE: '#eef4f8',
};

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function makePreviewPng(map: GameMap, deflate: (b: Buffer) => Buffer): Buffer {
  const margin = 2 * HEX;
  const w = Math.ceil(SQRT3 * HEX * (map.width + 0.5)) + margin * 2;
  const h = Math.ceil(1.5 * HEX * (map.height - 1) + 2 * HEX) + margin * 2;
  const px = new Uint8Array(w * h * 3);

  const put = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };

  // base terrain via inverse hex lookup
  const bg = rgb('#10141a');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [c, r] = pixelToHex(x - margin + SQRT3 * HEX * 0.0, y - margin, HEX);
      if (!inBounds(map, c, r)) {
        put(x, y, bg);
        continue;
      }
      const t = map.tiles[tileIndex(map, c, r)];
      const def = TERRAINS[t.terrain];
      let color =
        t.elevation === 'MOUNTAIN'
          ? MOUNTAIN_COLOR
          : t.elevation === 'HILLS' && def.hillsColor
            ? def.hillsColor
            : def.color;
      if (t.wonder) color = WONDERS[t.wonder]?.color ?? color;
      put(x, y, rgb(color));
    }
  }

  // rivers along edges
  const riverC = rgb('#4f9fe8');
  const corners = cornerOffsets(HEX);
  for (const t of map.tiles) {
    if (!t.riverMask) continue;
    const { x: cx, y: cy } = hexCenter(t.col, t.row, HEX);
    for (let d = 0; d < 6; d++) {
      if (!(t.riverMask & (1 << d))) continue;
      const [nc, nr] = neighborOffset(t.col, t.row, d);
      if (inBounds(map, nc, nr) && tileIndex(map, nc, nr) < t.index) continue;
      const [a, b] = EDGE_CORNERS[d];
      const ax = cx + corners[a].x + margin;
      const ay = cy + corners[a].y + margin;
      const bx = cx + corners[b].x + margin;
      const by = cy + corners[b].y + margin;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const y = ay + ((by - ay) * s) / steps;
        put(Math.round(x), Math.round(y), riverC);
        put(Math.round(x) + 1, Math.round(y), riverC);
      }
    }
  }

  // features and resources as center dots
  for (const t of map.tiles) {
    const { x: cx, y: cy } = hexCenter(t.col, t.row, HEX);
    const X = Math.round(cx + margin);
    const Y = Math.round(cy + margin);
    if (t.feature && FEATURE_COLORS[t.feature]) {
      const c = rgb(FEATURE_COLORS[t.feature]);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy <= 4) put(X + dx, Y + dy, c);
        }
      }
    }
    if (t.resource) {
      const c: [number, number, number] = [255, 255, 255];
      put(X, Y + 4, c);
      put(X + 1, Y + 4, c);
      put(X, Y + 5, c);
      put(X + 1, Y + 5, c);
    }
  }

  return encodePng(w, h, px, deflate);
}

// --- minimal PNG writer -------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0, 'ascii');
  Buffer.from(data).copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
}

function encodePng(
  w: number,
  h: number,
  rgbData: Uint8Array,
  deflate: (b: Buffer) => Buffer,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  // scanlines with filter byte 0
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgbData.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
