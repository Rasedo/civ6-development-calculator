/**
 * DOM side panels: tile inspector, city panel, empire summary.
 * Pure rendering + callback wiring; no game logic lives here.
 */

import type { DistrictId, GameState, Tile, YieldKey, Yields } from '../core/types';
import { YIELD_KEYS } from '../core/types';
import { tileYields, districtAdjacency } from '../core/yields';
import { computeCityStats, luxuryAmenities, type CityStats } from '../core/city';
import { validImprovements, canRemoveFeature, availableBuildings, districtPlacementTiles } from '../core/rules';
import { itemCost, itemLabel } from '../core/game';
import { hasRiver, hasFreshWater } from '../core/query';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { maxSpecialtyDistricts } from '../data/constants';

export interface PanelCallbacks {
  onPlaceImprovement(tileIndex: number, imp: string): void;
  onRemoveImprovement(tileIndex: number): void;
  onRemoveFeature(tileIndex: number): void;
  onSelectCity(cityId: number): void;
  onStartDistrictPlacement(cityId: number, type: DistrictId): void;
  onQueueBuilding(cityId: number, buildingId: string): void;
  onCancelQueue(cityId: number, index: number): void;
  onFocusChange(cityId: number, focus: string): void;
  onToggleManageCitizens(checked: boolean): void;
}

const YIELD_LABELS: Record<YieldKey, string> = {
  food: 'Food',
  production: 'Prod',
  gold: 'Gold',
  science: 'Sci',
  culture: 'Cult',
  faith: 'Faith',
};

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function yieldsHtml(y: Partial<Yields>, showZero = false): string {
  const parts: string[] = [];
  for (const k of YIELD_KEYS) {
    const v = y[k] ?? 0;
    if (!showZero && v === 0) continue;
    parts.push(`<span class="yield y-${k}">${fmt(v)} ${YIELD_LABELS[k]}</span>`);
  }
  return parts.length ? parts.join(' ') : '<span class="muted">no yields</span>';
}

// ---------------------------------------------------------------------------

export function renderTilePanel(
  container: HTMLElement,
  state: GameState,
  tileIndex: number,
  cb: PanelCallbacks,
): void {
  const tile = state.map.tiles[tileIndex];
  const terrain = TERRAINS[tile.terrain];
  const elevLabel =
    tile.elevation === 'MOUNTAIN' ? ' (Mountain)' : tile.elevation === 'HILLS' ? ' (Hills)' : '';
  const owner = state.cities.find((c) => c.id === tile.cityId);

  const chips: string[] = [];
  if (tile.feature) chips.push(`<span class="chip">${FEATURES[tile.feature].name}</span>`);
  if (tile.resource) {
    const r = RESOURCES[tile.resource];
    chips.push(`<span class="chip chip-${r.category}">${r.name} (${r.category}) ${yieldsHtml(r.yields)}</span>`);
  }
  if (hasRiver(tile)) chips.push('<span class="chip chip-river">River</span>');
  if (hasFreshWater(state.map, tile)) chips.push('<span class="chip chip-river">Fresh water</span>');

  let districtHtml = '';
  if (tile.district) {
    const d = DISTRICTS[tile.district];
    const status = tile.districtComplete ? '' : ' — under construction';
    let adj = '';
    if (d.adjacencyYield) {
      adj = ` · adjacency: ${yieldsHtml({ [d.adjacencyYield]: districtAdjacency(state.map, tile, tile.district) } as Partial<Yields>)}`;
    }
    districtHtml = `<div class="row"><b style="color:${d.color}">${d.name}</b>${status}${adj}</div>`;
  }

  let improvementHtml = '';
  if (tile.improvement) {
    const def = IMPROVEMENTS[tile.improvement as keyof typeof IMPROVEMENTS];
    improvementHtml = `<div class="row">Improvement: <b>${def.name}</b>
      <button data-act="rm-imp">Remove</button></div>`;
  } else {
    const valid = validImprovements(state, tile);
    if (valid.length) {
      improvementHtml =
        '<div class="row label">Build improvement (free, instant):</div><div class="btnrow">' +
        valid
          .map((id) => {
            const def = IMPROVEMENTS[id];
            return `<button data-act="imp" data-imp="${id}" title="${def.description}">${def.name} (${yieldsStr(def.yields)})</button>`;
          })
          .join('') +
        '</div>';
    } else if (tile.cityId === -1 && !terrain.water) {
      improvementHtml = '<div class="muted">Unclaimed — found a city within 3 tiles to use this tile.</div>';
    }
  }

  let featureHtml = '';
  if (tile.feature && canRemoveFeature(tile).ok) {
    featureHtml = `<div class="row"><button data-act="rm-feat">Remove ${FEATURES[tile.feature].name}</button></div>`;
  }

  container.innerHTML = `
    <h2>${terrain.name}${elevLabel}</h2>
    <div class="row chips">${chips.join(' ') || ''}</div>
    <div class="row">${yieldsHtml(tileYields(tile))}</div>
    <div class="row">Owner: ${owner ? `<a href="#" data-act="city">${owner.name}</a>` : '<span class="muted">none</span>'}</div>
    ${districtHtml}
    ${improvementHtml}
    ${featureHtml}
    <div class="hint muted">Coordinates: ${tile.col}, ${tile.row}</div>
  `;

  container.querySelector('[data-act="rm-imp"]')?.addEventListener('click', () => cb.onRemoveImprovement(tileIndex));
  container.querySelector('[data-act="rm-feat"]')?.addEventListener('click', () => cb.onRemoveFeature(tileIndex));
  container.querySelector('[data-act="city"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (owner) cb.onSelectCity(owner.id);
  });
  container.querySelectorAll('[data-act="imp"]').forEach((b) =>
    b.addEventListener('click', () => cb.onPlaceImprovement(tileIndex, (b as HTMLElement).dataset.imp!)),
  );
}

function yieldsStr(y: Partial<Yields>): string {
  return YIELD_KEYS.filter((k) => y[k])
    .map((k) => `+${fmt(y[k]!)} ${YIELD_LABELS[k]}`)
    .join(', ');
}

// ---------------------------------------------------------------------------

export function renderCityPanel(
  container: HTMLElement,
  state: GameState,
  stats: CityStats,
  manageCitizens: boolean,
  cb: PanelCallbacks,
): void {
  const city = stats.city;
  const map = state.map;

  const growthLine =
    stats.turnsToGrow !== null
      ? `grows in <b>${stats.turnsToGrow}</b> turn(s)`
      : stats.foodSurplus < 0
        ? '<span class="bad">starving!</span>'
        : 'stagnant';

  // Districts section
  const districtRows = city.districts
    .map((d) => {
      const def = DISTRICTS[d.type];
      const tile = map.tiles[d.tileIndex];
      const complete = tile.districtComplete;
      let adj = '';
      if (def.adjacencyYield && complete) {
        adj = ` <span class="muted">adj:</span> ${yieldsHtml({ [def.adjacencyYield]: districtAdjacency(map, tile, d.type) } as Partial<Yields>)}`;
      }
      const blds = city.buildings
        .filter((b) => buildingDistrict(b) === d.type)
        .map((b) => `<span class="chip">${buildingName(b)}</span>`)
        .join(' ');
      return `<div class="district-row">
        <span class="dcode" style="border-color:${def.color};color:${def.color}">${def.code}</span>
        <b>${def.name}</b>${complete ? '' : ' <span class="muted">(building…)</span>'}${adj}
        <div class="chips">${blds}</div>
      </div>`;
    })
    .join('');

  // Buildable buildings
  const buildable = availableBuildings(state, city)
    .map((b) => {
      const turns = state.sandbox
        ? ''
        : ` · ${b.cost}⚙ ≈ ${stats.total.production > 0 ? Math.ceil(b.cost / stats.total.production) : '∞'}t`;
      const fx: string[] = [];
      if (b.yields) fx.push(yieldsStr(b.yields));
      if (b.housing) fx.push(`+${b.housing} housing`);
      if (b.amenities) fx.push(`+${b.amenities} amenity${b.regional ? ' (regional)' : ''}`);
      if (b.special === 'SHIPYARD') fx.push('Prod = Harbor adjacency');
      return `<div class="build-row"><span>${b.name} <span class="muted">[${DISTRICTS[b.district].name}]${turns}</span><br>
        <small>${fx.join(' · ') || ''}</small></span>
        <button data-act="bld" data-id="${b.id}">${state.sandbox ? 'Build' : 'Queue'}</button></div>`;
    })
    .join('');

  // District placement options
  const specialtyUsed = city.districts.filter((d) => DISTRICTS[d.type].countsTowardLimit).length;
  const maxD = maxSpecialtyDistricts(city.population);
  const districtOptions = PLACEABLE_DISTRICTS.map((id) => {
    const def = DISTRICTS[id];
    const spots = districtPlacementTiles(state, city, id).length;
    return `<option value="${id}" ${spots === 0 ? 'disabled' : ''}>${def.name} (${spots} tile${spots === 1 ? '' : 's'})</option>`;
  }).join('');

  // Queue
  const queueRows = city.queue
    .map((item, i) => {
      const cost = itemCost(item);
      const left = cost - item.progress;
      const turns = stats.total.production > 0 ? Math.ceil(left / stats.total.production) : '∞';
      return `<div class="queue-row"><span>${i + 1}. ${itemLabel(item)}
        <span class="muted">${fmt(item.progress)}/${cost}⚙${i === 0 ? ` · ~${turns}t` : ''}</span></span>
        <button data-act="cancel" data-i="${i}">✕</button></div>`;
    })
    .join('');

  container.innerHTML = `
    <h2>${city.isCapital ? '★ ' : ''}${city.name}</h2>
    <div class="row">Population <b>${city.population}</b> · ${growthLine}</div>
    <div class="row statgrid">
      <span>Food box</span><span>${fmt(city.foodBox)} / ${stats.growthNeeded} (+${fmt(stats.effectiveFoodSurplus)})</span>
      <span>Housing</span><span class="${stats.housing - city.population < 1 ? 'bad' : ''}">${city.population} / ${fmt(stats.housing)}</span>
      <span>Amenities</span><span>${stats.amenities.have} / ${stats.amenities.needed} — ${stats.amenities.tier.name}</span>
      <span>Districts</span><span>${specialtyUsed} / ${maxD} specialty slots</span>
    </div>
    <div class="row"><b>Yields/turn:</b> ${yieldsHtml(stats.total)}</div>
    <details><summary>Yield breakdown</summary>
      <div class="statgrid">
        <span>Tiles</span><span>${yieldsHtml(stats.breakdown.tiles)}</span>
        <span>Districts</span><span>${yieldsHtml(stats.breakdown.districts)}</span>
        <span>Buildings</span><span>${yieldsHtml(stats.breakdown.buildings)}</span>
        <span>Citizens</span><span>${yieldsHtml(stats.breakdown.citizens)}</span>
      </div>
      <div class="muted hint">Amenity modifier ×${stats.amenities.tier.yieldFactor} on non-food.</div>
    </details>
    <div class="row">
      <label>Focus <select data-act="focus">
        ${['balanced', ...YIELD_KEYS].map((f) => `<option value="${f}" ${city.focus === f ? 'selected' : ''}>${f}</option>`).join('')}
      </select></label>
      <label class="inline"><input type="checkbox" data-act="manage" ${manageCitizens ? 'checked' : ''}> lock tiles by clicking</label>
    </div>
    <h3>Districts</h3>
    ${districtRows || '<div class="muted">None yet.</div>'}
    <div class="row">
      <select data-act="district-select">${districtOptions}</select>
      <button data-act="place-district">Place…</button>
    </div>
    <h3>Buildings available</h3>
    ${buildable || '<div class="muted">Nothing available (districts must be completed first).</div>'}
    ${state.sandbox ? '' : `<h3>Production queue</h3>${queueRows || '<div class="muted">Queue is empty.</div>'}`}
  `;

  container.querySelector('[data-act="focus"]')?.addEventListener('change', (e) => {
    cb.onFocusChange(city.id, (e.target as HTMLSelectElement).value);
  });
  container.querySelector('[data-act="manage"]')?.addEventListener('change', (e) => {
    cb.onToggleManageCitizens((e.target as HTMLInputElement).checked);
  });
  container.querySelector('[data-act="place-district"]')?.addEventListener('click', () => {
    const sel = container.querySelector('[data-act="district-select"]') as HTMLSelectElement;
    if (sel.value) cb.onStartDistrictPlacement(city.id, sel.value as DistrictId);
  });
  container.querySelectorAll('[data-act="bld"]').forEach((b) =>
    b.addEventListener('click', () => cb.onQueueBuilding(city.id, (b as HTMLElement).dataset.id!)),
  );
  container.querySelectorAll('[data-act="cancel"]').forEach((b) =>
    b.addEventListener('click', () => cb.onCancelQueue(city.id, Number((b as HTMLElement).dataset.i))),
  );
}

function buildingDistrict(id: string): DistrictId | null {
  return BUILDINGS[id]?.district ?? null;
}

function buildingName(id: string): string {
  return BUILDINGS[id]?.name ?? id;
}

// ---------------------------------------------------------------------------

export function renderEmpireSummary(container: HTMLElement, state: GameState): void {
  if (state.cities.length === 0) {
    container.innerHTML = '<span class="muted">No cities yet — use "Found city" and click a land tile.</span>';
    return;
  }
  const lux = luxuryAmenities(state);
  const totals = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
  let pop = 0;
  for (const c of state.cities) {
    const s = computeCityStats(state, c, lux);
    for (const k of YIELD_KEYS) totals[k] += s.total[k];
    pop += c.population;
  }
  container.innerHTML = `
    <div>${state.cities.length} city(ies), pop ${pop}</div>
    <div class="statgrid">
      <span class="y-science">Science</span><span>+${fmt(totals.science)} (${fmt(state.scienceTotal)})</span>
      <span class="y-culture">Culture</span><span>+${fmt(totals.culture)} (${fmt(state.cultureTotal)})</span>
      <span class="y-gold">Gold</span><span>+${fmt(totals.gold)} (${fmt(state.treasury)})</span>
      <span class="y-faith">Faith</span><span>+${fmt(totals.faith)} (${fmt(state.faithTotal)})</span>
    </div>`;
}

/** Tooltip-ish single line about a tile (used during hover). */
export function tileSummary(state: GameState, tile: Tile): string {
  const t = TERRAINS[tile.terrain];
  const parts = [
    `${t.name}${tile.elevation === 'HILLS' ? ' Hills' : tile.elevation === 'MOUNTAIN' ? ' Mountain' : ''}`,
  ];
  if (tile.feature) parts.push(FEATURES[tile.feature].name);
  if (tile.resource) parts.push(RESOURCES[tile.resource].name);
  if (tile.improvement) parts.push(IMPROVEMENTS[tile.improvement as keyof typeof IMPROVEMENTS].name);
  if (tile.district) parts.push(DISTRICTS[tile.district].name);
  const city = state.cities.find((c) => c.id === tile.cityId);
  if (city) parts.push(`(${city.name})`);
  return parts.join(' · ');
}
