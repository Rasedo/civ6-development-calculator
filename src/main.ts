/** App entry: wires game state, canvas renderer, panels and input together. */

import './style.css';
import type { DistrictId, GameState } from './core/types';
import {
  createGame,
  foundCity,
  placeImprovement,
  removeImprovement,
  removeFeature,
  queueDistrict,
  queueBuilding,
  cancelQueueItem,
  endTurn,
  toggleLockedTile,
  serialize,
  deserialize,
} from './core/game';
import { computeCityStats, workableTiles } from './core/city';
import { districtPlacementTiles } from './core/rules';
import { MapRenderer, type CityViewOverlay } from './ui/render';
import { renderTilePanel, renderCityPanel, renderEmpireSummary, tileSummary, type PanelCallbacks } from './ui/panels';
import { MAP_SIZES, type MapSizeId } from './data/constants';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('map');
const renderer = new MapRenderer(canvas);

const sizeSelect = $<HTMLSelectElement>('size-select');
const seedInput = $<HTMLInputElement>('seed-input');
const resourcesToggle = $<HTMLInputElement>('resources-toggle');
const sandboxToggle = $<HTMLInputElement>('sandbox-toggle');
const contextPanel = $<HTMLElement>('context-panel');
const empireSummary = $<HTMLElement>('empire-summary');
const turnLabel = $<HTMLElement>('turn-label');
const messageLine = $<HTMLElement>('message-line');
const hoverLine = $<HTMLElement>('hover-line');

for (const [id, s] of Object.entries(MAP_SIZES)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = s.name;
  if (id === 'small') opt.selected = true;
  sizeSelect.appendChild(opt);
}
seedInput.value = String(Math.floor(Math.random() * 1e9));

// ---------------------------------------------------------------------------

interface UiState {
  mode: 'inspect' | 'found' | 'placeDistrict';
  pendingDistrict: DistrictId | null;
  pendingCityId: number | null;
  selectedTile: number | null;
  selectedCityId: number | null;
  hoverTile: number | null;
  manageCitizens: boolean;
}

const ui: UiState = {
  mode: 'inspect',
  pendingDistrict: null,
  pendingCityId: null,
  selectedTile: null,
  selectedCityId: null,
  hoverTile: null,
  manageCitizens: false,
};

let state: GameState = newGameFromControls();

function newGameFromControls(): GameState {
  const size = MAP_SIZES[sizeSelect.value as MapSizeId] ?? MAP_SIZES.small;
  return createGame({
    width: size.width,
    height: size.height,
    seed: Number(seedInput.value) || 1,
    withResources: resourcesToggle.checked,
    sandbox: sandboxToggle.checked,
  });
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;
function showMessage(text: string): void {
  messageLine.textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (messageLine.textContent = ''), 5000);
}

function selectCity(id: number | null): void {
  ui.selectedCityId = id;
  ui.selectedTile = null;
  ui.manageCitizens = false;
  if (ui.mode === 'placeDistrict') setMode('inspect');
}

function setMode(mode: UiState['mode']): void {
  ui.mode = mode;
  if (mode !== 'placeDistrict') {
    ui.pendingDistrict = null;
    ui.pendingCityId = null;
  }
  $<HTMLButtonElement>('mode-inspect').classList.toggle('active', mode === 'inspect');
  $<HTMLButtonElement>('mode-found').classList.toggle('active', mode === 'found');
}

const callbacks: PanelCallbacks = {
  onPlaceImprovement(tileIndex, imp) {
    const r = placeImprovement(state, tileIndex, imp as never);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onRemoveImprovement(tileIndex) {
    removeImprovement(state, tileIndex);
    refresh();
  },
  onRemoveFeature(tileIndex) {
    const r = removeFeature(state, tileIndex);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onSelectCity(cityId) {
    selectCity(cityId);
    refresh();
  },
  onStartDistrictPlacement(cityId, type) {
    ui.mode = 'placeDistrict';
    ui.pendingCityId = cityId;
    ui.pendingDistrict = type;
    showMessage('Click a highlighted tile to place the district (right-click/Esc to cancel).');
    refresh();
  },
  onQueueBuilding(cityId, buildingId) {
    const r = queueBuilding(state, cityId, buildingId);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onCancelQueue(cityId, index) {
    cancelQueueItem(state, cityId, index);
    refresh();
  },
  onFocusChange(cityId, focus) {
    const city = state.cities.find((c) => c.id === cityId);
    if (city) city.focus = focus as never;
    refresh();
  },
  onToggleManageCitizens(checked) {
    ui.manageCitizens = checked;
    showMessage(checked ? 'Click owned tiles to lock/unlock them for citizens.' : '');
    refresh();
  },
};

// ---------------------------------------------------------------------------

function refresh(): void {
  // Keep stale selections from surviving regeneration.
  if (ui.selectedCityId !== null && !state.cities.some((c) => c.id === ui.selectedCityId)) {
    ui.selectedCityId = null;
  }

  let cityView: CityViewOverlay | null = null;
  if (ui.selectedCityId !== null) {
    const city = state.cities.find((c) => c.id === ui.selectedCityId)!;
    const stats = computeCityStats(state, city);
    cityView = {
      territory: new Set(state.map.tiles.filter((t) => t.cityId === city.id).map((t) => t.index)),
      worked: new Set(stats.workedTiles),
      locked: new Set(city.lockedTiles),
      centerIndex: city.centerIndex,
    };
    renderCityPanel(contextPanel, state, stats, ui.manageCitizens, callbacks);
  } else if (ui.selectedTile !== null) {
    renderTilePanel(contextPanel, state, ui.selectedTile, callbacks);
  } else {
    contextPanel.innerHTML =
      '<h2>Welcome</h2><p class="muted">Generate a map, switch to <b>Found city</b> mode and click a land tile. Then open the city to place districts and buildings, and improve tiles from the tile panel.</p>';
  }

  let highlight: Set<number> | null = null;
  if (ui.mode === 'placeDistrict' && ui.pendingCityId !== null && ui.pendingDistrict) {
    const city = state.cities.find((c) => c.id === ui.pendingCityId);
    if (city) highlight = new Set(districtPlacementTiles(state, city, ui.pendingDistrict));
  }

  renderer.draw(state, {
    selected: ui.selectedTile ?? (ui.selectedCityId !== null ? cityView!.centerIndex : null),
    hover: ui.hoverTile,
    highlight,
    cityView,
  });

  renderEmpireSummary(empireSummary, state);
  turnLabel.textContent = String(state.turn);
}

// --- canvas input -----------------------------------------------------------

let dragging = false;
let downX = 0;
let downY = 0;
let redrawQueued = false;

function queueRedraw(): void {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    refresh();
  });
}

canvas.addEventListener('mousedown', (e) => {
  downX = e.offsetX;
  downY = e.offsetY;
  dragging = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (e.buttons & 1) {
    if (dragging || Math.abs(e.offsetX - downX) + Math.abs(e.offsetY - downY) > 4) {
      dragging = true;
      renderer.panBy(e.movementX, e.movementY);
      queueRedraw();
      return;
    }
  }
  const t = renderer.screenToTile(state.map, e.offsetX, e.offsetY);
  if (t !== ui.hoverTile) {
    ui.hoverTile = t;
    hoverLine.textContent = t !== null ? tileSummary(state, state.map.tiles[t]) : '';
    queueRedraw();
  }
});

canvas.addEventListener('mouseleave', () => {
  ui.hoverTile = null;
  hoverLine.textContent = '';
  queueRedraw();
});

canvas.addEventListener('click', (e) => {
  if (dragging) {
    dragging = false;
    return;
  }
  const tileIdx = renderer.screenToTile(state.map, e.offsetX, e.offsetY);
  if (tileIdx === null) return;
  const tile = state.map.tiles[tileIdx];

  if (ui.mode === 'found') {
    const r = foundCity(state, tileIdx);
    if (r.ok && r.city) {
      setMode('inspect');
      selectCity(r.city.id);
      showMessage(`${r.city.name} founded.`);
    } else {
      showMessage(r.reason ?? 'Cannot found a city here.');
    }
    refresh();
    return;
  }

  if (ui.mode === 'placeDistrict' && ui.pendingCityId !== null && ui.pendingDistrict) {
    const r = queueDistrict(state, ui.pendingCityId, ui.pendingDistrict, tileIdx);
    if (r.ok) {
      const cityId = ui.pendingCityId;
      setMode('inspect');
      selectCity(cityId);
      showMessage(state.sandbox ? 'District placed.' : 'District added to the production queue.');
    } else {
      showMessage(r.reason!);
    }
    refresh();
    return;
  }

  // inspect mode
  if (
    ui.manageCitizens &&
    ui.selectedCityId !== null &&
    tile.cityId === ui.selectedCityId &&
    tileIdx !== state.cities.find((c) => c.id === ui.selectedCityId)!.centerIndex
  ) {
    const city = state.cities.find((c) => c.id === ui.selectedCityId)!;
    if (workableTiles(state, city).some((t) => t.index === tileIdx)) {
      toggleLockedTile(state, city.id, tileIdx);
      refresh();
      return;
    }
  }

  if (tile.district === 'CITY_CENTER') {
    const city = state.cities.find((c) => c.centerIndex === tileIdx);
    if (city) {
      selectCity(city.id);
      refresh();
      return;
    }
  }
  ui.selectedCityId = null;
  ui.selectedTile = tileIdx;
  refresh();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  queueRedraw();
}, { passive: false });

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (ui.mode !== 'inspect') {
    setMode('inspect');
  } else {
    ui.selectedTile = null;
    ui.selectedCityId = null;
  }
  refresh();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setMode('inspect');
    refresh();
  }
});

// --- buttons -----------------------------------------------------------------

$<HTMLButtonElement>('generate-btn').addEventListener('click', () => {
  state = newGameFromControls();
  ui.selectedTile = null;
  ui.selectedCityId = null;
  setMode('inspect');
  renderer.fit(state.map);
  refresh();
  showMessage(`Map generated (seed ${state.map.seed}).`);
});

$<HTMLButtonElement>('randomize-seed').addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 1e9));
});

$<HTMLButtonElement>('mode-inspect').addEventListener('click', () => {
  setMode('inspect');
  refresh();
});

$<HTMLButtonElement>('mode-found').addEventListener('click', () => {
  setMode(ui.mode === 'found' ? 'inspect' : 'found');
  refresh();
});

sandboxToggle.addEventListener('change', () => {
  state.sandbox = sandboxToggle.checked;
  refresh();
});

$<HTMLButtonElement>('end-turn').addEventListener('click', () => {
  endTurn(state);
  refresh();
});

$<HTMLButtonElement>('end-turn-10').addEventListener('click', () => {
  for (let i = 0; i < 10; i++) endTurn(state);
  refresh();
});

const SAVE_KEY = 'civ6-dev-calculator-save';

$<HTMLButtonElement>('save-btn').addEventListener('click', () => {
  localStorage.setItem(SAVE_KEY, serialize(state));
  showMessage('Saved to browser storage.');
});

$<HTMLButtonElement>('load-btn').addEventListener('click', () => {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    showMessage('No save found.');
    return;
  }
  state = deserialize(raw);
  sandboxToggle.checked = state.sandbox;
  ui.selectedTile = null;
  ui.selectedCityId = null;
  setMode('inspect');
  renderer.fit(state.map);
  refresh();
  showMessage('Save loaded.');
});

window.addEventListener('resize', () => {
  renderer.resize();
  refresh();
});

// --- boot ---------------------------------------------------------------------

renderer.resize();
renderer.fit(state.map);
refresh();
