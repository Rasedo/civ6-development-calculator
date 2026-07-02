/**
 * DOM side panels: tile inspector, city panel, research trees, government,
 * empire summary. Pure rendering + callback wiring; no game logic here.
 */

import type { DistrictId, GameState, Tile, YieldKey, Yields } from '../core/types';
import { YIELD_KEYS } from '../core/types';
import { tileYields, effectiveAdjacency } from '../core/yields';
import { computeCityStats, luxuryAmenities, borderCandidates, type CityStats } from '../core/city';
import { validImprovements, canRemoveFeature, availableBuildings, districtPlacementTiles } from '../core/rules';
import { itemCost, itemLabel, tilePurchaseCost } from '../core/game';
import { makeYieldCtx, computeUnlocks, availableTechs, availableCivics, getModifiers } from '../core/effects';
import { hasRiver, hasFreshWater } from '../core/query';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { WONDERS } from '../data/wonders';
import { choiceLabel, type BuildChoice, type Projection, type SettleSiteScore } from '../core/advisor';
import { TECHS, ERAS, type ResearchEffect, type TechDef } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { maxSpecialtyDistricts } from '../data/constants';

export interface PanelCallbacks {
  onPlaceImprovement(tileIndex: number, imp: string): void;
  onRemoveImprovement(tileIndex: number): void;
  onRemoveFeature(tileIndex: number): void;
  onSelectCity(cityId: number): void;
  onStartDistrictPlacement(cityId: number, type: DistrictId): void;
  onStartBuyTile(cityId: number): void;
  onQueueBuilding(cityId: number, buildingId: string): void;
  onCancelQueue(cityId: number, index: number): void;
  onFocusChange(cityId: number, focus: string): void;
  onToggleManageCitizens(checked: boolean): void;
  onSetResearch(kind: 'tech' | 'civic', id: string): void;
  onSetGovernment(id: string): void;
  onSetPolicy(slotIndex: number, policyId: string | null): void;
  onGotoTile(tileIndex: number): void;
  onOpenCompare(cityId: number): void;
  onToggleCandidate(index: number): void;
  onSetHorizon(turns: number): void;
  onRunCompare(): void;
}

/** Mutable state for the build-comparison view (owned by main.ts). */
export interface CompareState {
  cityId: number;
  candidates: BuildChoice[];
  selected: Set<number>;
  horizon: number;
  results: Projection[] | null;
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

function yieldsStr(y: Partial<Yields>): string {
  return YIELD_KEYS.filter((k) => y[k])
    .map((k) => `+${fmt(y[k]!)} ${YIELD_LABELS[k]}`)
    .join(', ');
}

// ---------------------------------------------------------------------------

export function renderTilePanel(
  container: HTMLElement,
  state: GameState,
  tileIndex: number,
  cb: PanelCallbacks,
): void {
  const tile = state.map.tiles[tileIndex];
  const ctx = makeYieldCtx(state);
  const terrain = TERRAINS[tile.terrain];
  const elevLabel =
    tile.elevation === 'MOUNTAIN' ? ' (Mountain)' : tile.elevation === 'HILLS' ? ' (Hills)' : '';
  const owner = state.cities.find((c) => c.id === tile.cityId);
  const wonder = tile.wonder ? WONDERS[tile.wonder] : null;

  const chips: string[] = [];
  if (wonder) chips.push(`<span class="chip chip-wonder">✦ ${wonder.name}</span>`);
  if (tile.feature) chips.push(`<span class="chip">${FEATURES[tile.feature].name}</span>`);
  if (tile.resource) {
    const r = RESOURCES[tile.resource];
    chips.push(`<span class="chip chip-${r.category}">${r.name} (${r.category}) ${yieldsHtml(r.yields)}</span>`);
  }
  if (hasRiver(tile)) chips.push('<span class="chip chip-river">River</span>');
  if (hasFreshWater(state.map, tile)) chips.push('<span class="chip chip-river">Fresh water</span>');

  let wonderHtml = '';
  if (wonder) {
    const fx: string[] = [];
    if (Object.keys(wonder.tileYields).length) fx.push(`tile: ${yieldsStr(wonder.tileYields)}`);
    if (wonder.adjacentYields) fx.push(`adjacent tiles: ${yieldsStr(wonder.adjacentYields)}`);
    if (wonder.doublesAdjacentTerrain) fx.push('adjacent tiles: double terrain yields');
    if (wonder.impassable) fx.push('impassable');
    wonderHtml = `<div class="row muted">Natural wonder — ${fx.join(' · ')}. Cannot be settled, improved or districted.</div>`;
  }

  let districtHtml = '';
  if (tile.district) {
    const d = DISTRICTS[tile.district];
    const status = tile.districtComplete ? '' : ' — under construction';
    let adj = '';
    if (d.adjacencyYield) {
      adj = ` · adjacency: ${yieldsHtml({ [d.adjacencyYield]: effectiveAdjacency(ctx, tile, tile.district) } as Partial<Yields>)}`;
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
    } else if (tile.cityId === -1 && !terrain.water && !wonder) {
      improvementHtml = '<div class="muted">Unclaimed — found a city nearby or grow borders to use this tile.</div>';
    }
  }

  let featureHtml = '';
  if (tile.feature && canRemoveFeature(state, tile).ok) {
    featureHtml = `<div class="row"><button data-act="rm-feat">Remove ${FEATURES[tile.feature].name}</button></div>`;
  }

  container.innerHTML = `
    <h2>${wonder ? `✦ ${wonder.name}` : terrain.name + elevLabel}</h2>
    <div class="row chips">${chips.join(' ') || ''}</div>
    <div class="row">${yieldsHtml(tileYields(ctx, tile))}</div>
    <div class="row">Owner: ${owner ? `<a href="#" data-act="city">${owner.name}</a>` : '<span class="muted">none</span>'}</div>
    ${wonderHtml}
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
  const ctx = makeYieldCtx(state);

  const growthLine =
    stats.turnsToGrow !== null
      ? `grows in <b>${stats.turnsToGrow}</b> turn(s)`
      : stats.foodSurplus < 0
        ? '<span class="bad">starving!</span>'
        : 'stagnant';

  const borderLine =
    stats.border.nextTile !== null
      ? stats.border.turns !== null
        ? `next tile in <b>${stats.border.turns}</b> turn(s)`
        : 'no culture output'
      : 'nowhere to grow';
  const buyCost = tilePurchaseCost(state, city);
  const canBuy = borderCandidates(state, city).length > 0;

  // Districts section
  const districtRows = city.districts
    .map((d) => {
      const def = DISTRICTS[d.type];
      const tile = map.tiles[d.tileIndex];
      const complete = tile.districtComplete;
      let adj = '';
      if (def.adjacencyYield && complete) {
        adj = ` <span class="muted">adj:</span> ${yieldsHtml({ [def.adjacencyYield]: effectiveAdjacency(ctx, tile, d.type) } as Partial<Yields>)}`;
      }
      const blds = city.buildings
        .filter((b) => BUILDINGS[b]?.district === d.type)
        .map((b) => `<span class="chip">${BUILDINGS[b]?.name ?? b}</span>`)
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

  // District placement options (research-gated list still shown, disabled when no spots)
  const specialtyUsed = city.districts.filter((d) => DISTRICTS[d.type].countsTowardLimit).length;
  const maxD = maxSpecialtyDistricts(city.population);
  const unlocks = state.sandbox ? null : computeUnlocks(state);
  const districtOptions = PLACEABLE_DISTRICTS.map((id) => {
    const def = DISTRICTS[id];
    const locked = unlocks ? !unlocks.districts.has(id) : false;
    const spots = locked ? 0 : districtPlacementTiles(state, city, id).length;
    const label = locked ? `${def.name} (locked)` : `${def.name} (${spots} tile${spots === 1 ? '' : 's'})`;
    return `<option value="${id}" ${spots === 0 ? 'disabled' : ''}>${label}</option>`;
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
      <span>Borders</span><span>${fmt(stats.border.progress)} / ${stats.border.cost} culture · ${borderLine}</span>
    </div>
    <div class="row btnrow">
      <button data-act="buy-tile" ${canBuy ? '' : 'disabled'}>Buy tile (${buyCost}g)</button>
      <button data-act="compare">Compare builds…</button>
    </div>
    <div class="row"><b>Yields/turn:</b> ${yieldsHtml(stats.total)}</div>
    <details><summary>Yield breakdown</summary>
      <div class="statgrid">
        <span>Tiles</span><span>${yieldsHtml(stats.breakdown.tiles)}</span>
        <span>Districts</span><span>${yieldsHtml(stats.breakdown.districts)}</span>
        <span>Buildings</span><span>${yieldsHtml(stats.breakdown.buildings)}</span>
        <span>Citizens</span><span>${yieldsHtml(stats.breakdown.citizens)}</span>
        <span>Gov/policies</span><span>${yieldsHtml(stats.breakdown.bonuses)}</span>
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
    ${buildable || '<div class="muted">Nothing available (complete districts and research further).</div>'}
    ${state.sandbox ? '' : `<h3>Production queue</h3>${queueRows || '<div class="muted">Queue is empty.</div>'}`}
  `;

  container.querySelector('[data-act="focus"]')?.addEventListener('change', (e) => {
    cb.onFocusChange(city.id, (e.target as HTMLSelectElement).value);
  });
  container.querySelector('[data-act="manage"]')?.addEventListener('change', (e) => {
    cb.onToggleManageCitizens((e.target as HTMLInputElement).checked);
  });
  container.querySelector('[data-act="buy-tile"]')?.addEventListener('click', () => cb.onStartBuyTile(city.id));
  container.querySelector('[data-act="compare"]')?.addEventListener('click', () => cb.onOpenCompare(city.id));
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

// ---------------------------------------------------------------------------
// Research trees
// ---------------------------------------------------------------------------

function effectSummary(effects: ResearchEffect[]): string {
  const parts: string[] = [];
  for (const fx of effects) {
    switch (fx.kind) {
      case 'unlockImprovement':
        parts.push(IMPROVEMENTS[fx.improvement]?.name ?? fx.improvement);
        break;
      case 'unlockDistrict':
        parts.push(DISTRICTS[fx.district]?.name ?? fx.district);
        break;
      case 'unlockBuilding':
        parts.push(BUILDINGS[fx.building]?.name ?? fx.building);
        break;
      case 'unlockFeatureRemoval':
        parts.push(`remove ${FEATURES[fx.feature]?.name ?? fx.feature}`);
        break;
      case 'improvementYields':
        parts.push(`${IMPROVEMENTS[fx.improvement]?.name}: ${yieldsStr(fx.yields)}`);
        break;
      case 'farmAdjacency':
        parts.push('farms +1 food with 2+ adjacent farms');
        break;
      case 'hillFarms':
        parts.push('farms on hills');
        break;
      case 'unlockGovernment':
        parts.push(`gov: ${GOVERNMENTS[fx.government]?.name ?? fx.government}`);
        break;
      case 'unlockPolicy':
        parts.push(`policy: ${POLICIES[fx.policy]?.name ?? fx.policy}`);
        break;
    }
  }
  return parts.join(', ');
}

export function renderResearchPanel(
  container: HTMLElement,
  state: GameState,
  kind: 'tech' | 'civic',
  perTurn: number,
  cb: PanelCallbacks,
): void {
  const defs: (TechDef | CivicDef)[] = Object.values(kind === 'tech' ? TECHS : CIVICS);
  const completed = new Set(kind === 'tech' ? state.research.techs : state.research.civics);
  const availableIds = new Set(
    (kind === 'tech' ? availableTechs(state) : availableCivics(state)).map((d) => d.id),
  );
  const current = kind === 'tech' ? state.research.tech : state.research.civic;
  const progress = kind === 'tech' ? state.research.techProgress : state.research.civicProgress;

  const rows = ERAS.map((era) => {
    const inEra = defs.filter((d) => d.era === era);
    if (inEra.length === 0) return '';
    const items = inEra
      .map((d) => {
        const fx = effectSummary(d.effects);
        const prereqNames = d.prereqs.map((p) => (kind === 'tech' ? TECHS[p] : CIVICS[p])?.name ?? p);
        let status: string;
        let cls = '';
        if (completed.has(d.id)) {
          status = '✓';
          cls = 'done';
        } else if (d.id === current) {
          const turns = perTurn > 0 ? Math.ceil((d.cost - progress) / perTurn) : '∞';
          status = `${fmt(progress)}/${d.cost} · ~${turns}t`;
          cls = 'current';
        } else if (availableIds.has(d.id)) {
          status = `<button data-act="research" data-id="${d.id}">Research</button>`;
        } else {
          status = `<span class="muted">needs ${prereqNames.join(', ')}</span>`;
          cls = 'locked';
        }
        return `<div class="research-row ${cls}">
          <span><b>${d.name}</b> <span class="muted">${d.cost}${kind === 'tech' ? '🧪' : '🎭'}</span><br>
          <small class="muted">${fx || '—'}</small></span>
          <span>${status}</span>
        </div>`;
      })
      .join('');
    return `<h3>${era}</h3>${items}`;
  }).join('');

  container.innerHTML = `
    <h2>${kind === 'tech' ? 'Technologies' : 'Civics'}</h2>
    <div class="row muted">+${fmt(perTurn)} ${kind === 'tech' ? 'science' : 'culture'}/turn — unselected research auto-picks the cheapest option.</div>
    ${rows}
  `;
  container.querySelectorAll('[data-act="research"]').forEach((b) =>
    b.addEventListener('click', () => cb.onSetResearch(kind, (b as HTMLElement).dataset.id!)),
  );
}

// ---------------------------------------------------------------------------
// Government & policies
// ---------------------------------------------------------------------------

export function renderGovernmentPanel(
  container: HTMLElement,
  state: GameState,
  cb: PanelCallbacks,
): void {
  const unlocks = computeUnlocks(state);
  const sandbox = state.sandbox;
  const curId = state.government.current;
  const cur = curId ? GOVERNMENTS[curId] : null;

  const govOptions = Object.values(GOVERNMENTS)
    .filter((g) => sandbox || unlocks.governments.has(g.id))
    .sort((a, b) => a.tier - b.tier)
    .map((g) => `<option value="${g.id}" ${g.id === curId ? 'selected' : ''}>${g.name} (tier ${g.tier})</option>`)
    .join('');

  let slotsHtml = '';
  if (cur) {
    slotsHtml = cur.slots
      .map((slotKind, i) => {
        const chosen = state.government.policies[i];
        const fitting = Object.values(POLICIES).filter(
          (p) =>
            (sandbox || unlocks.policies.has(p.id)) &&
            cardFitsSlot(p, slotKind) &&
            (!state.government.policies.includes(p.id) || chosen === p.id),
        );
        const options =
          `<option value="">— empty —</option>` +
          fitting
            .map((p) => `<option value="${p.id}" ${chosen === p.id ? 'selected' : ''}>${p.name}</option>`)
            .join('');
        const desc = chosen ? POLICIES[chosen]?.description ?? '' : '';
        return `<div class="slot-row">
          <span class="slot-kind slot-${slotKind}">${slotKind}</span>
          <select data-act="policy" data-slot="${i}">${options}</select>
          <div class="muted"><small>${desc}</small></div>
        </div>`;
      })
      .join('');
  }

  container.innerHTML = `
    <h2>Government</h2>
    ${
      cur
        ? `<div class="row"><select data-act="gov">${govOptions}</select></div>
           <div class="row muted">${cur.description}</div>
           <h3>Policy slots</h3>
           ${slotsHtml}
           <div class="hint muted">Diplomatic cards don't exist yet (no other civs) — diplomatic slots sit idle. Swapping is free (Civ 6 charges gold outside civic completions).</div>`
        : '<div class="muted">No government yet — finish the Code of Laws civic.</div>'
    }
  `;

  container.querySelector('[data-act="gov"]')?.addEventListener('change', (e) => {
    cb.onSetGovernment((e.target as HTMLSelectElement).value);
  });
  container.querySelectorAll('[data-act="policy"]').forEach((sel) =>
    sel.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      cb.onSetPolicy(Number(el.dataset.slot), el.value || null);
    }),
  );
}

// ---------------------------------------------------------------------------
// Advisors
// ---------------------------------------------------------------------------

export function renderSettlePanel(
  container: HTMLElement,
  state: GameState,
  sites: SettleSiteScore[],
  cb: PanelCallbacks,
): void {
  const rows = sites
    .map((s, i) => {
      const t = state.map.tiles[s.tileIndex];
      return `<div class="build-row site-row" data-idx="${s.tileIndex}">
        <span><b>#${i + 1}</b> (${t.col}, ${t.row}) — score ${fmt(s.score)}<br>
        <small class="muted">water ${fmt(s.housing)} · tiles ${fmt(s.yieldScore * 0.35)} · resources ${fmt(s.resourceScore)}</small></span>
        <button data-act="goto" data-idx="${s.tileIndex}">Show</button>
      </div>`;
    })
    .join('');

  container.innerHTML = `
    <h2>Settle advisor</h2>
    <div class="row muted">Top founding sites by fresh water, unclaimed workable yields and nearby resources (new luxuries weighted extra). Found-city mode is active — click a ranked tile on the map to settle it.</div>
    ${rows || '<div class="muted">No legal founding sites.</div>'}
  `;
  container.querySelectorAll('[data-act="goto"]').forEach((b) =>
    b.addEventListener('click', () => cb.onGotoTile(Number((b as HTMLElement).dataset.idx))),
  );
}

export function renderComparePanel(
  container: HTMLElement,
  state: GameState,
  compare: CompareState,
  cb: PanelCallbacks,
): void {
  const city = state.cities.find((c) => c.id === compare.cityId);
  if (!city) {
    container.innerHTML = '<div class="muted">City no longer exists.</div>';
    return;
  }

  const candidateRows = compare.candidates
    .map((c, i) => {
      const extra =
        c.kind === 'district'
          ? ` <span class="muted">@ (${state.map.tiles[c.tileIndex].col}, ${state.map.tiles[c.tileIndex].row})</span>`
          : '';
      return `<label class="inline"><input type="checkbox" data-act="cand" data-i="${i}" ${compare.selected.has(i) ? 'checked' : ''}>
        ${choiceLabel(c)}${extra}</label>`;
    })
    .join('');

  let resultsHtml = '';
  if (compare.results) {
    const cols = compare.results;
    const header = cols.map((r) => `<th>${r.label}</th>`).join('');
    const metric = (
      name: string,
      value: (r: Projection) => number | string,
      better: 'high' | 'none' = 'high',
    ) => {
      const values = cols.map((r) => (r.error ? null : value(r)));
      const numeric = values.filter((v): v is number => typeof v === 'number');
      const best = better === 'high' && numeric.length ? Math.max(...numeric) : null;
      const cells = values
        .map((v, i) =>
          cols[i].error
            ? '<td class="muted">—</td>'
            : `<td class="${best !== null && v === best ? 'best' : ''}">${typeof v === 'number' ? fmt(v) : v}</td>`,
        )
        .join('');
      return `<tr><td>${name}</td>${cells}</tr>`;
    };
    resultsHtml = `
      <table class="compare-table">
        <tr><th></th>${header}</tr>
        ${metric('Population', (r) => r.pop)}
        ${metric('Food/t', (r) => r.yields.food)}
        ${metric('Prod/t', (r) => r.yields.production)}
        ${metric('Gold/t', (r) => r.yields.gold)}
        ${metric('Sci/t', (r) => r.yields.science)}
        ${metric('Cult/t', (r) => r.yields.culture)}
        ${metric('Faith/t', (r) => r.yields.faith)}
        ${metric('Science total', (r) => r.scienceTotal)}
        ${metric('Culture total', (r) => r.cultureTotal)}
        ${metric('Treasury', (r) => r.treasury)}
        ${metric('Techs done', (r) => r.techs)}
        ${metric('Completed', (r) => r.completed.join(', ') || '—', 'none')}
      </table>
      ${cols.some((r) => r.error) ? `<div class="muted hint">${cols.filter((r) => r.error).map((r) => `${r.label}: ${r.error}`).join(' · ')}</div>` : ''}
    `;
  }

  container.innerHTML = `
    <h2>Compare builds — ${city.name}</h2>
    <div class="row muted">Each option clears the queue, builds only that item, then simulates forward (sandbox off, citizens/research/borders on autopilot). Districts use their best-scored tile.</div>
    <div class="row">${candidateRows || '<span class="muted">Nothing buildable right now.</span>'}</div>
    <div class="row">
      <label>Horizon <select data-act="horizon">
        ${[10, 20, 30, 50].map((h) => `<option value="${h}" ${compare.horizon === h ? 'selected' : ''}>${h} turns</option>`).join('')}
      </select></label>
      <button data-act="run" class="primary">Run comparison</button>
    </div>
    ${resultsHtml}
  `;

  container.querySelectorAll('[data-act="cand"]').forEach((el) =>
    el.addEventListener('change', () => cb.onToggleCandidate(Number((el as HTMLElement).dataset.i))),
  );
  container.querySelector('[data-act="horizon"]')?.addEventListener('change', (e) => {
    cb.onSetHorizon(Number((e.target as HTMLSelectElement).value));
  });
  container.querySelector('[data-act="run"]')?.addEventListener('click', () => cb.onRunCompare());
}

// ---------------------------------------------------------------------------

export function renderEmpireSummary(container: HTMLElement, state: GameState): void {
  const research = state.research;
  const techLine = research.tech
    ? `${TECHS[research.tech]?.name} ${fmt(research.techProgress)}/${TECHS[research.tech]?.cost}`
    : research.techs.length === Object.keys(TECHS).length
      ? 'all complete'
      : 'auto-picks next turn';
  const civicLine = research.civic
    ? `${CIVICS[research.civic]?.name} ${fmt(research.civicProgress)}/${CIVICS[research.civic]?.cost}`
    : research.civics.length === Object.keys(CIVICS).length
      ? 'all complete'
      : 'auto-picks next turn';
  const gov = state.government.current ? GOVERNMENTS[state.government.current]?.name : 'none';

  if (state.cities.length === 0) {
    container.innerHTML = '<span class="muted">No cities yet — use "Found city" and click a land tile.</span>';
    return;
  }
  const lux = luxuryAmenities(state);
  const mods = getModifiers(state);
  const totals = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
  let pop = 0;
  for (const c of state.cities) {
    const s = computeCityStats(state, c, lux, mods);
    for (const k of YIELD_KEYS) totals[k] += s.total[k];
    pop += c.population;
  }
  container.innerHTML = `
    <div>${state.cities.length} city(ies), pop ${pop} · ${gov}</div>
    <div class="statgrid">
      <span class="y-science">Science</span><span>+${fmt(totals.science)} (${fmt(state.scienceTotal)})</span>
      <span class="y-culture">Culture</span><span>+${fmt(totals.culture)} (${fmt(state.cultureTotal)})</span>
      <span class="y-gold">Gold</span><span>+${fmt(totals.gold)} (${fmt(state.treasury)})</span>
      <span class="y-faith">Faith</span><span>+${fmt(totals.faith)} (${fmt(state.faithTotal)})</span>
      <span class="y-science">Tech</span><span>${techLine}</span>
      <span class="y-culture">Civic</span><span>${civicLine}</span>
    </div>`;
}

/** One-line tile description for the hover bar. */
export function tileSummary(state: GameState, tile: Tile): string {
  const t = TERRAINS[tile.terrain];
  const parts = [
    `${t.name}${tile.elevation === 'HILLS' ? ' Hills' : tile.elevation === 'MOUNTAIN' ? ' Mountain' : ''}`,
  ];
  if (tile.wonder) parts.push(`✦ ${WONDERS[tile.wonder]?.name}`);
  if (tile.feature) parts.push(FEATURES[tile.feature].name);
  if (tile.resource) parts.push(RESOURCES[tile.resource].name);
  if (tile.improvement) parts.push(IMPROVEMENTS[tile.improvement as keyof typeof IMPROVEMENTS].name);
  if (tile.district) parts.push(DISTRICTS[tile.district].name);
  const city = state.cities.find((c) => c.id === tile.cityId);
  if (city) parts.push(`(${city.name})`);
  return parts.join(' · ');
}
