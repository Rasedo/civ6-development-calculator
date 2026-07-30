/**
 * Canvas renderer: terrain, rivers (on hex edges), features, resources,
 * improvements, districts, cities, plus selection/highlight overlays.
 * Pan/zoom camera; everything is drawn in world units under a transform.
 */

import { hexCenter, cornerOffsets, EDGE_CORNERS, pixelToHex, inBounds, tileIndex, neighborOffset } from '../core/hex';
import { isBarbSeat, isRivalSeat, rivalOfSeat } from '../core/seats';
import type { GameMap, GameState, Tile } from '../core/types';
import { TERRAINS, MOUNTAIN_COLOR } from '../data/terrains';
import { RESOURCES, RESOURCE_CATEGORY_COLORS } from '../data/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { WONDERS } from '../data/wonders';
import { BUILT_WONDERS } from '../data/builtWonders';
import { UNITS } from '../data/units';
import { fogActive, isExplored } from '../core/fog';
import { CS_TYPE_COLORS } from '../data/cityStates';
import type { ImprovementId } from '../core/types';

export const HEX_SIZE = 24;

export interface CityViewOverlay {
  territory: Set<number>;
  worked: Set<number>;
  locked: Set<number>;
  centerIndex: number;
}

export interface DrawOptions {
  selected: number | null;
  hover: number | null;
  highlight: Set<number> | null;
  /** Small text badges drawn on tiles (e.g. adjacency previews, site ranks). */
  labels: Map<number, string> | null;
  /** Tiles to emphasize with a bright outline (best advisor picks). */
  bestTiles: Set<number> | null;
  cityView: CityViewOverlay | null;
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  zoom = 1;
  panX = 0;
  panY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  /** Fit the whole map in view. */
  fit(map: GameMap): void {
    const rect = this.canvas.getBoundingClientRect();
    const worldW = Math.sqrt(3) * HEX_SIZE * (map.width + 0.5);
    const worldH = 1.5 * HEX_SIZE * (map.height - 1) + 2 * HEX_SIZE;
    this.zoom = Math.min(rect.width / worldW, rect.height / worldH) * 0.96;
    this.panX = -(rect.width / this.zoom - worldW) / 2 - HEX_SIZE;
    this.panY = -(rect.height / this.zoom - worldH) / 2 - HEX_SIZE;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: sx / this.zoom + this.panX, y: sy / this.zoom + this.panY };
  }

  /** CSS-pixel canvas position -> tile index (or null). */
  screenToTile(map: GameMap, sx: number, sy: number): number | null {
    const w = this.screenToWorld(sx, sy);
    const [c, r] = pixelToHex(w.x, w.y, HEX_SIZE);
    if (!inBounds(map, c, r)) return null;
    return tileIndex(map, c, r);
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(5, Math.max(0.15, this.zoom * factor));
    this.panX = before.x - sx / this.zoom;
    this.panY = before.y - sy / this.zoom;
  }

  panBy(dxCss: number, dyCss: number): void {
    this.panX -= dxCss / this.zoom;
    this.panY -= dyCss / this.zoom;
  }

  /** Center the camera on a tile without changing zoom. */
  centerOn(map: GameMap, tileIndex: number): void {
    const tile = map.tiles[tileIndex];
    if (!tile) return;
    const rect = this.canvas.getBoundingClientRect();
    const c = hexCenter(tile.col, tile.row, HEX_SIZE);
    this.panX = c.x - rect.width / (2 * this.zoom);
    this.panY = c.y - rect.height / (2 * this.zoom);
  }

  // -------------------------------------------------------------------------

  draw(state: GameState, opts: DrawOptions): void {
    const { ctx } = this;
    const map = state.map;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.zoom * this.dpr;
    ctx.setTransform(k, 0, 0, k, -this.panX * k, -this.panY * k);

    // visible world rect (with margin) for culling
    const rect = this.canvas.getBoundingClientRect();
    const x0 = this.panX - 2 * HEX_SIZE;
    const y0 = this.panY - 2 * HEX_SIZE;
    const x1 = this.panX + rect.width / this.zoom + 2 * HEX_SIZE;
    const y1 = this.panY + rect.height / this.zoom + 2 * HEX_SIZE;
    const corners = cornerOffsets(HEX_SIZE);
    const fog = fogActive(state);
    const visible: { tile: Tile; cx: number; cy: number }[] = [];
    const hidden: { cx: number; cy: number }[] = [];
    for (const tile of map.tiles) {
      const { x, y } = hexCenter(tile.col, tile.row, HEX_SIZE);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (fog && !isExplored(state, tile.index)) {
        hidden.push({ cx: x, cy: y });
        continue; // unexplored tiles render as darkness and nothing else
      }
      visible.push({ tile, cx: x, cy: y });
    }

    const hexPath = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + corners[0].x, cy + corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(cx + corners[i].x, cy + corners[i].y);
      ctx.closePath();
    };

    // --- pass 0: the fog itself -------------------------------------------------
    for (const { cx, cy } of hidden) {
      hexPath(cx, cy);
      ctx.fillStyle = '#151a22';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- pass 1: terrain fills + elevation + features ------------------------
    for (const { tile, cx, cy } of visible) {
      const def = TERRAINS[tile.terrain];
      hexPath(cx, cy);
      ctx.fillStyle = tile.elevation === 'HILLS' && def.hillsColor ? def.hillsColor : def.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (tile.elevation === 'HILLS') this.drawHills(cx, cy);
      if (tile.elevation === 'MOUNTAIN') this.drawMountain(cx, cy);
      if (tile.volcano) {
        ctx.fillStyle = '#e05530';
        ctx.beginPath();
        ctx.arc(cx, cy - HEX_SIZE * 0.42, HEX_SIZE * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tile.droughtTurns > 0) {
        hexPath(cx, cy);
        ctx.fillStyle = 'rgba(160,110,40,0.28)';
        ctx.fill();
      }
      if (tile.feature) this.drawFeature(tile.feature, cx, cy);
      if (tile.wonder) {
        const w = WONDERS[tile.wonder];
        if (w) {
          hexPath(cx, cy);
          ctx.fillStyle = w.color + '66'; // translucent wonder tint
          ctx.fill();
        }
      }
    }

    // --- territory borders (always on) ---------------------------------------
    ctx.strokeStyle = 'rgba(216,181,74,0.6)';
    ctx.lineWidth = 1.4;
    for (const { tile, cx, cy } of visible) {
      if (tile.cityId === -1) continue;
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = neighborOffset(tile.col, tile.row, d);
        const n = inBounds(map, nc, nr) ? map.tiles[tileIndex(map, nc, nr)] : null;
        if (n && n.cityId === tile.cityId) continue;
        const [a, b] = EDGE_CORNERS[d];
        ctx.beginPath();
        ctx.moveTo(cx + corners[a].x, cy + corners[a].y);
        ctx.lineTo(cx + corners[b].x, cy + corners[b].y);
        ctx.stroke();
      }
    }

    // --- city-state territory borders ----------------------------------------
    for (const { tile, cx, cy } of visible) {
      const csId = tile.csId ?? -1;
      if (csId === -1) continue;
      const cs = state.cityStates.find((c) => c.id === csId);
      ctx.strokeStyle = cs ? CS_TYPE_COLORS[cs.type] : '#999999';
      ctx.lineWidth = 1.4;
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = neighborOffset(tile.col, tile.row, d);
        const n = inBounds(map, nc, nr) ? map.tiles[tileIndex(map, nc, nr)] : null;
        if (n && (n.csId ?? -1) === csId) continue;
        const [a, b] = EDGE_CORNERS[d];
        ctx.beginPath();
        ctx.moveTo(cx + corners[a].x, cy + corners[a].y);
        ctx.lineTo(cx + corners[b].x, cy + corners[b].y);
        ctx.stroke();
      }
    }

    // --- rival territory borders -----------------------------------------------
    for (const { tile, cx, cy } of visible) {
      const rivalId = tile.rivalId ?? -1;
      if (rivalId === -1) continue;
      const rival = state.rivals.find((r) => r.id === rivalId);
      ctx.strokeStyle = rival?.color ?? '#888888';
      ctx.lineWidth = 1.4;
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = neighborOffset(tile.col, tile.row, d);
        const n = inBounds(map, nc, nr) ? map.tiles[tileIndex(map, nc, nr)] : null;
        if (n && (n.rivalId ?? -1) === rivalId) continue;
        const [a, b] = EDGE_CORNERS[d];
        ctx.beginPath();
        ctx.moveTo(cx + corners[a].x, cy + corners[a].y);
        ctx.lineTo(cx + corners[b].x, cy + corners[b].y);
        ctx.stroke();
      }
    }

    // --- pass 2: rivers --------------------------------------------------------
    ctx.strokeStyle = '#4f9fe8';
    ctx.lineWidth = HEX_SIZE * 0.16;
    ctx.lineCap = 'round';
    for (const { tile, cx, cy } of visible) {
      if (tile.riverMask === 0) continue;
      for (let d = 0; d < 6; d++) {
        if (!(tile.riverMask & (1 << d))) continue;
        const [nc, nr] = neighborOffset(tile.col, tile.row, d);
        // draw each shared edge once
        if (inBounds(map, nc, nr) && tileIndex(map, nc, nr) < tile.index) continue;
        const [a, b] = EDGE_CORNERS[d];
        ctx.beginPath();
        ctx.moveTo(cx + corners[a].x, cy + corners[a].y);
        ctx.lineTo(cx + corners[b].x, cy + corners[b].y);
        ctx.stroke();
      }
    }

    // --- pass 3: overlays (territory, highlight) -------------------------------
    if (opts.cityView) {
      for (const { tile, cx, cy } of visible) {
        if (!opts.cityView.territory.has(tile.index)) continue;
        hexPath(cx, cy);
        ctx.fillStyle = 'rgba(216,181,74,0.12)';
        ctx.fill();
      }
    }
    if (opts.highlight) {
      for (const { tile, cx, cy } of visible) {
        if (!opts.highlight.has(tile.index)) continue;
        hexPath(cx, cy);
        ctx.fillStyle = 'rgba(80,220,120,0.28)';
        ctx.fill();
        ctx.strokeStyle = '#50dc78';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (opts.bestTiles) {
      for (const { tile, cx, cy } of visible) {
        if (!opts.bestTiles.has(tile.index)) continue;
        hexPath(cx, cy);
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
    }

    // --- pass 4: badges (resources, improvements, districts, wonders) ----------
    for (const { tile, cx, cy } of visible) {
      if (tile.resource) this.drawResource(tile.resource, cx, cy);
      if (tile.improvement) this.drawImprovement(tile.improvement as ImprovementId, cx, cy);
      if (tile.district && tile.district !== 'CITY_CENTER') {
        this.drawDistrict(tile.district, tile.districtComplete, cx, cy);
      }
      if (tile.builtWonder) this.drawBuiltWonder(tile.builtWonder, tile.builtWonderComplete, cx, cy);
      if (tile.wonder) this.drawWonder(tile.wonder, cx, cy);
    }

    // --- pass 4b: advisor labels -------------------------------------------------
    if (opts.labels && opts.labels.size > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${HEX_SIZE * 0.36}px system-ui, sans-serif`;
      for (const { tile, cx, cy } of visible) {
        const text = opts.labels.get(tile.index);
        if (text === undefined) continue;
        const w = ctx.measureText(text).width + HEX_SIZE * 0.3;
        const h = HEX_SIZE * 0.48;
        const y = cy - HEX_SIZE * 0.52;
        roundRect(ctx, cx - w / 2, y - h / 2, w, h, 3);
        ctx.fillStyle = 'rgba(16,19,24,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(text, cx, y + 0.5);
      }
    }

    // --- pass 5: worked pips ------------------------------------------------------
    if (opts.cityView) {
      for (const { tile, cx, cy } of visible) {
        if (!opts.cityView.worked.has(tile.index)) continue;
        ctx.beginPath();
        ctx.arc(cx, cy - HEX_SIZE * 0.55, HEX_SIZE * 0.13, 0, Math.PI * 2);
        ctx.fillStyle = '#62d97c';
        ctx.fill();
        if (opts.cityView.locked.has(tile.index)) {
          ctx.beginPath();
          ctx.arc(cx, cy - HEX_SIZE * 0.55, HEX_SIZE * 0.2, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }

    // --- pass 6: selection & hover ------------------------------------------------
    for (const { tile, cx, cy } of visible) {
      if (tile.index === opts.selected) {
        hexPath(cx, cy);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      } else if (tile.index === opts.hover) {
        hexPath(cx, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // --- pass 6b: units, camps, pillage marks -----------------------------------
    if (state.unitsMode) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const camps = new Set(state.barbCamps);
      const byTile = new Map<number, { code: string; fill: string; text: string }>();
      for (const u of state.units) {
        let fill = '#6fa8dc';
        let text = '#14202c';
        if (isBarbSeat(u.seat)) {
          fill = '#c04040';
          text = '#2c0e0e';
        } else if (isRivalSeat(u.seat)) {
          fill = rivalOfSeat(state, u.seat)?.color ?? '#888888';
          text = '#101318';
        }
        byTile.set(u.tileIndex, { code: UNITS[u.type]?.code ?? '?', fill, text });
      }
      for (const { tile, cx, cy } of visible) {
        if (camps.has(tile.index)) {
          ctx.font = `bold ${HEX_SIZE * 0.5}px system-ui, sans-serif`;
          ctx.fillStyle = '#e05555';
          ctx.fillText('⛺', cx, cy + 0.5);
        }
        if (tile.goodyHut) {
          ctx.font = `bold ${HEX_SIZE * 0.46}px system-ui, sans-serif`;
          ctx.fillStyle = '#ffd75e';
          ctx.fillText('🛖', cx, cy + 0.5);
        }
        if (tile.pillaged) {
          ctx.font = `bold ${HEX_SIZE * 0.42}px system-ui, sans-serif`;
          ctx.fillStyle = '#ff6a3d';
          ctx.fillText('✕', cx + HEX_SIZE * 0.4, cy + HEX_SIZE * 0.42);
        }
        const badge = byTile.get(tile.index);
        if (!badge) continue;
        const x = cx - HEX_SIZE * 0.42;
        const y = cy - HEX_SIZE * 0.42;
        ctx.beginPath();
        ctx.arc(x, y, HEX_SIZE * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = badge.fill;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = badge.text;
        ctx.font = `bold ${HEX_SIZE * 0.3}px system-ui, sans-serif`;
        ctx.fillText(badge.code, x, y + 0.5);
      }
    }

    // --- pass 7: city banners --------------------------------------------------------
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { tile, cx, cy } of visible) {
      if (tile.district !== 'CITY_CENTER') continue;
      const city = state.cities.find((c) => c.centerIndex === tile.index);
      if (!city) continue;
      const loyalty = city.loyalty ?? 100;
      const label = `${city.isCapital ? '★ ' : ''}${city.name}  ${city.population}${loyalty < 100 ? `  ⚑${Math.round(loyalty)}` : ''}`;
      ctx.font = `bold ${HEX_SIZE * 0.38}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + HEX_SIZE * 0.5;
      const h = HEX_SIZE * 0.62;
      const by = cy - HEX_SIZE * 1.12;
      ctx.fillStyle = 'rgba(16,19,24,0.92)';
      ctx.strokeStyle = '#d8b54a';
      ctx.lineWidth = 1.2;
      roundRect(ctx, cx - w / 2, by - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ecdfb8';
      ctx.fillText(label, cx, by + 0.5);
    }

    // --- rival city banners ------------------------------------------------------
    for (const { tile, cx, cy } of visible) {
      let owner: { color: string; atWar: boolean } | null = null;
      let label = '';
      for (const rival of state.rivals) {
        const rc = rival.cities.find((c) => c.centerIndex === tile.index);
        if (rc) {
          owner = rival;
          label = `${rival.atWar ? '⚔ ' : ''}${rc.name}  ${rc.population}`;
          break;
        }
      }
      if (!owner) continue;
      ctx.font = `bold ${HEX_SIZE * 0.34}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + HEX_SIZE * 0.5;
      const h = HEX_SIZE * 0.58;
      const by = cy - HEX_SIZE * 1.05;
      ctx.fillStyle = 'rgba(16,19,24,0.92)';
      ctx.strokeStyle = owner.color;
      ctx.lineWidth = owner.atWar ? 2 : 1.2;
      roundRect(ctx, cx - w / 2, by - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dfe5ec';
      ctx.fillText(label, cx, by + 0.5);
    }

    // --- city-state banners ----------------------------------------------------
    for (const { tile, cx, cy } of visible) {
      const cs = state.cityStates.find((c) => c.centerIndex === tile.index);
      if (!cs) continue;
      const label = `◆ ${cs.name}${cs.envoys > 0 ? `  ${cs.envoys}⚑` : ''}`;
      ctx.font = `bold ${HEX_SIZE * 0.34}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + HEX_SIZE * 0.5;
      const h = HEX_SIZE * 0.58;
      const by = cy - HEX_SIZE * 1.05;
      ctx.fillStyle = 'rgba(16,19,24,0.92)';
      ctx.strokeStyle = CS_TYPE_COLORS[cs.type];
      ctx.lineWidth = 1.2;
      roundRect(ctx, cx - w / 2, by - h / 2, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dfe5ec';
      ctx.fillText(label, cx, by + 0.5);
    }
  }

  // --- glyph helpers ---------------------------------------------------------

  private drawHills(cx: number, cy: number): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.4;
    for (const [dx, dy] of [
      [-0.28, 0.12],
      [0.18, 0.02],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + dx * HEX_SIZE, cy + dy * HEX_SIZE, HEX_SIZE * 0.2, Math.PI, 0);
      ctx.stroke();
    }
  }

  private drawMountain(cx: number, cy: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(cx - HEX_SIZE * 0.52, cy + HEX_SIZE * 0.34);
    ctx.lineTo(cx, cy - HEX_SIZE * 0.5);
    ctx.lineTo(cx + HEX_SIZE * 0.52, cy + HEX_SIZE * 0.34);
    ctx.closePath();
    ctx.fillStyle = MOUNTAIN_COLOR;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // snow cap
    ctx.beginPath();
    ctx.moveTo(cx - HEX_SIZE * 0.14, cy - HEX_SIZE * 0.18);
    ctx.lineTo(cx, cy - HEX_SIZE * 0.5);
    ctx.lineTo(cx + HEX_SIZE * 0.14, cy - HEX_SIZE * 0.18);
    ctx.closePath();
    ctx.fillStyle = '#e9edf1';
    ctx.fill();
  }

  private drawFeature(feature: string, cx: number, cy: number): void {
    const { ctx } = this;
    const s = HEX_SIZE;
    switch (feature) {
      case 'WOODS':
        ctx.fillStyle = '#2f5d2a';
        for (const [dx, dy] of [
          [-0.3, 0.08],
          [0.05, -0.18],
          [0.32, 0.1],
        ] as const) {
          tri(ctx, cx + dx * s, cy + dy * s, s * 0.34);
        }
        break;
      case 'RAINFOREST':
        ctx.fillStyle = '#1f6b40';
        for (const [dx, dy] of [
          [-0.28, 0.05],
          [0.04, -0.18],
          [0.3, 0.08],
          [0.0, 0.22],
        ] as const) {
          ctx.beginPath();
          ctx.arc(cx + dx * s, cy + dy * s, s * 0.17, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'MARSH':
        ctx.strokeStyle = '#2e6e5e';
        ctx.lineWidth = 1.6;
        for (const [dx, dy] of [
          [-0.25, -0.1],
          [0.1, 0.05],
          [-0.15, 0.22],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(cx + (dx - 0.18) * s, cy + dy * s);
          ctx.lineTo(cx + (dx + 0.18) * s, cy + dy * s);
          ctx.stroke();
        }
        break;
      case 'FLOODPLAINS':
        ctx.strokeStyle = '#4f8f4f';
        ctx.lineWidth = 1.6;
        for (const yy of [0.18, 0.34]) {
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.45, cy + yy * s);
          ctx.quadraticCurveTo(cx - s * 0.15, cy + (yy - 0.12) * s, cx + s * 0.05, cy + yy * s);
          ctx.quadraticCurveTo(cx + s * 0.3, cy + (yy + 0.12) * s, cx + s * 0.45, cy + yy * s);
          ctx.stroke();
        }
        break;
      case 'OASIS':
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#3fa9d8';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = '#2f7d3f';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'REEF':
        ctx.strokeStyle = '#e88fb1';
        ctx.lineWidth = 1.8;
        for (const [dx, dy] of [
          [-0.2, 0.05],
          [0.18, -0.12],
        ] as const) {
          ctx.beginPath();
          ctx.arc(cx + dx * s, cy + dy * s, s * 0.16, Math.PI, 0);
          ctx.stroke();
        }
        break;
      case 'ICE':
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#eef4f8';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
    }
  }

  private drawResource(resource: string, cx: number, cy: number): void {
    const { ctx } = this;
    const def = RESOURCES[resource];
    if (!def) return;
    const x = cx - HEX_SIZE * 0.42;
    const y = cy + HEX_SIZE * 0.42;
    ctx.beginPath();
    ctx.arc(x, y, HEX_SIZE * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = RESOURCE_CATEGORY_COLORS[def.category];
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#14171c';
    ctx.font = `bold ${HEX_SIZE * 0.26}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name[0], x, y + 0.5);
  }

  private drawImprovement(imp: ImprovementId, cx: number, cy: number): void {
    const { ctx } = this;
    const def = IMPROVEMENTS[imp];
    const x = cx + HEX_SIZE * 0.4;
    const y = cy + HEX_SIZE * 0.42;
    const w = HEX_SIZE * 0.52;
    const h = HEX_SIZE * 0.36;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 2);
    ctx.fillStyle = '#e8e4d6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#21262e';
    ctx.font = `bold ${HEX_SIZE * 0.24}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.code, x, y + 0.5);
  }

  private drawBuiltWonder(id: string, complete: boolean, cx: number, cy: number): void {
    const { ctx } = this;
    const def = BUILT_WONDERS[id];
    if (!def) return;
    const w = HEX_SIZE * 1.05;
    const h = HEX_SIZE * 0.58;
    ctx.save();
    if (!complete) ctx.setLineDash([3, 2]);
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
    ctx.fillStyle = 'rgba(40,32,12,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `bold ${HEX_SIZE * 0.32}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(complete ? `♛${def.code}` : `♛${def.code}…`, cx, cy + 0.5);
  }

  private drawWonder(wonder: string, cx: number, cy: number): void {
    const { ctx } = this;
    const def = WONDERS[wonder];
    if (!def) return;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `bold ${HEX_SIZE * 0.34}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✦${def.code}`, cx, cy + 0.5);
  }

  private drawDistrict(district: string, complete: boolean, cx: number, cy: number): void {
    const { ctx } = this;
    const def = DISTRICTS[district as keyof typeof DISTRICTS];
    const w = HEX_SIZE * 1.05;
    const h = HEX_SIZE * 0.58;
    ctx.save();
    if (!complete) ctx.setLineDash([3, 2]);
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
    ctx.fillStyle = 'rgba(16,19,24,0.85)';
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = def.color;
    ctx.font = `bold ${HEX_SIZE * 0.34}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(complete ? def.code : `${def.code}…`, cx, cy + 0.5);
  }
}

function tri(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x - size / 2, y + size * 0.4);
  ctx.lineTo(x, y - size * 0.6);
  ctx.lineTo(x + size / 2, y + size * 0.4);
  ctx.closePath();
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
