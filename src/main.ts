/** App entry: wires game state, canvas renderer, panels and input together. */

import './style.css';
import type { DistrictId, GameState } from './core/types';
import {
  createGame,
  createGameFromMap,
  foundCity,
  placeImprovement,
  removeImprovement,
  removeFeature,
  queueDistrict,
  queueBuilding,
  cancelQueueItem,
  endTurn,
  toggleLockedTile,
  buyTile,
  queueWonder,
  setSpecialists,
  setTechResearch,
  setCivicResearch,
  setGovernment,
  setPolicy,
  serialize,
  deserialize,
} from './core/game';
import { computeCityStats, workableTiles, luxuryAmenities, borderCandidates } from './core/city';
import { wonderPlacementTiles } from './core/rules';
import { getModifiers } from './core/effects';
import {
  scoreDistrictSpots,
  scoreSettleSites,
  compareCandidates,
  projectTurns,
  type SettleSiteScore,
} from './core/advisor';
import { MapRenderer, type CityViewOverlay } from './ui/render';
import {
  renderTilePanel,
  renderCityPanel,
  renderEmpireSummary,
  renderResearchPanel,
  renderGovernmentPanel,
  renderSettlePanel,
  renderComparePanel,
  renderImportPanel,
  renderGreatPeoplePanel,
  renderPlannerPanel,
  renderReligionPanel,
  renderTradePanel,
  renderEmpirePlanPanel,
  tileSummary,
  type PanelCallbacks,
  type CompareState,
  type PlannerState,
  type EmpirePlanState,
} from './ui/panels';
import { parseCivExport, importSummary } from './core/importer';
import { toggleBoost } from './core/boosts';
import { tileAppeal, appealTier } from './core/appeal';
import { searchBuildOrder, adoptPlan } from './core/planner';
import { choosePantheon, foundReligion, queueSettler } from './core/game';
import { addTradeRoute, removeTradeRoute } from './core/trade';
import { searchEmpirePlan, adoptEmpirePlan } from './core/empirePlanner';
import { MAP_SIZES, type MapSizeId } from './data/constants';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('map');
const renderer = new MapRenderer(canvas);

const sizeSelect = $<HTMLSelectElement>('size-select');
const seedInput = $<HTMLInputElement>('seed-input');
const resourcesToggle = $<HTMLInputElement>('resources-toggle');
const wondersToggle = $<HTMLInputElement>('wonders-toggle');
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

type RightView =
  | 'context'
  | 'tech'
  | 'civic'
  | 'government'
  | 'settle'
  | 'compare'
  | 'import'
  | 'greatPeople'
  | 'planner'
  | 'religion'
  | 'trade'
  | 'empirePlan';

interface UiState {
  mode: 'inspect' | 'found' | 'placeDistrict' | 'placeWonder' | 'buyTile';
  rightView: RightView;
  pendingDistrict: DistrictId | null;
  pendingWonder: string | null;
  pendingCityId: number | null;
  selectedTile: number | null;
  selectedCityId: number | null;
  hoverTile: number | null;
  manageCitizens: boolean;
  settleSites: SettleSiteScore[] | null;
  compare: CompareState | null;
  planner: PlannerState | null;
  empirePlan: EmpirePlanState;
  lastImportSummary: string | null;
}

const ui: UiState = {
  mode: 'inspect',
  rightView: 'context',
  pendingDistrict: null,
  pendingWonder: null,
  pendingCityId: null,
  selectedTile: null,
  selectedCityId: null,
  hoverTile: null,
  manageCitizens: false,
  settleSites: null,
  compare: null,
  planner: null,
  empirePlan: { objective: 'balanced', horizon: 30, results: null },
  lastImportSummary: null,
};

let state: GameState = newGameFromControls();

function newGameFromControls(): GameState {
  const size = MAP_SIZES[sizeSelect.value as MapSizeId] ?? MAP_SIZES.small;
  return createGame({
    width: size.width,
    height: size.height,
    seed: Number(seedInput.value) || 1,
    withResources: resourcesToggle.checked,
    withWonders: wondersToggle.checked,
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
  ui.rightView = 'context';
  if (ui.mode === 'placeDistrict' || ui.mode === 'buyTile') setMode('inspect');
}

function setMode(mode: UiState['mode']): void {
  ui.mode = mode;
  if (mode !== 'placeDistrict') ui.pendingDistrict = null;
  if (mode !== 'placeWonder') ui.pendingWonder = null;
  if (mode !== 'placeDistrict' && mode !== 'placeWonder' && mode !== 'buyTile') {
    ui.pendingCityId = null;
  }
  $<HTMLButtonElement>('mode-inspect').classList.toggle('active', mode === 'inspect');
  $<HTMLButtonElement>('mode-found').classList.toggle('active', mode === 'found');
}

function setRightView(view: RightView): void {
  ui.rightView = view;
  for (const [btn, v] of [
    ['view-tech', 'tech'],
    ['view-civic', 'civic'],
    ['view-government', 'government'],
    ['view-gp', 'greatPeople'],
    ['view-religion', 'religion'],
    ['view-trade', 'trade'],
    ['view-empire-plan', 'empirePlan'],
    ['settle-advisor', 'settle'],
  ] as const) {
    $<HTMLButtonElement>(btn).classList.toggle('active', view === v);
  }
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
  onStartBuyTile(cityId) {
    ui.mode = 'buyTile';
    ui.pendingCityId = cityId;
    showMessage('Click a highlighted tile to buy it (right-click/Esc to cancel).');
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
  onSetResearch(kind, id) {
    const r = kind === 'tech' ? setTechResearch(state, id) : setCivicResearch(state, id);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onSetGovernment(id) {
    const r = setGovernment(state, id);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onSetPolicy(slotIndex, policyId) {
    const r = setPolicy(state, slotIndex, policyId);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onGotoTile(tileIndex) {
    renderer.centerOn(state.map, tileIndex);
    refresh();
  },
  onOpenCompare(cityId) {
    const candidates = compareCandidates(state, cityId);
    ui.compare = {
      cityId,
      candidates,
      // baseline + the first couple of real options pre-checked
      selected: new Set(candidates.slice(0, 3).map((_, i) => i)),
      horizon: 20,
      results: null,
    };
    ui.rightView = 'compare';
    refresh();
  },
  onToggleCandidate(index) {
    if (!ui.compare) return;
    if (ui.compare.selected.has(index)) ui.compare.selected.delete(index);
    else ui.compare.selected.add(index);
    ui.compare.results = null;
    refresh();
  },
  onSetHorizon(turns) {
    if (!ui.compare) return;
    ui.compare.horizon = turns;
    ui.compare.results = null;
    refresh();
  },
  onRunCompare() {
    if (!ui.compare) return;
    const { cityId, candidates, selected, horizon } = ui.compare;
    ui.compare.results = [...selected]
      .sort((a, b) => a - b)
      .map((i) => projectTurns(state, cityId, candidates[i], horizon));
    refresh();
  },
  onStartWonderPlacement(cityId, wonderId) {
    ui.mode = 'placeWonder';
    ui.pendingCityId = cityId;
    ui.pendingWonder = wonderId;
    showMessage('Click a highlighted tile to place the wonder (right-click/Esc to cancel).');
    refresh();
  },
  onSetSpecialists(cityId, tileIndex, count) {
    const r = setSpecialists(state, cityId, tileIndex, count);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onToggleBoost(id) {
    toggleBoost(state, id);
    refresh();
  },
  onOpenPlanner(cityId) {
    ui.planner = { cityId, objective: 'balanced', horizon: 30, results: null };
    ui.rightView = 'planner';
    refresh();
  },
  onSetObjective(objective) {
    if (!ui.planner) return;
    ui.planner.objective = objective;
    ui.planner.results = null;
    refresh();
  },
  onSetPlanHorizon(turns) {
    if (!ui.planner) return;
    ui.planner.horizon = turns;
    ui.planner.results = null;
    refresh();
  },
  onRunPlanner() {
    if (!ui.planner) return;
    showMessage('Searching build orders…');
    const planner = ui.planner;
    // Let the message paint before the synchronous search.
    setTimeout(() => {
      planner.results = searchBuildOrder(state, planner.cityId, {
        horizon: planner.horizon,
        objective: planner.objective,
      });
      showMessage(`Found ${planner.results.length} plan(s).`);
      refresh();
    }, 20);
  },
  onQueueSettler(cityId) {
    const r = queueSettler(state, cityId);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onSetEmpireObjective(objective) {
    ui.empirePlan.objective = objective;
    ui.empirePlan.results = null;
    refresh();
  },
  onSetEmpireHorizon(turns) {
    ui.empirePlan.horizon = turns;
    ui.empirePlan.results = null;
    refresh();
  },
  onRunEmpirePlan() {
    showMessage('Searching empire plans…');
    setTimeout(() => {
      ui.empirePlan.results = searchEmpirePlan(state, {
        horizon: ui.empirePlan.horizon,
        objective: ui.empirePlan.objective,
      });
      showMessage(`Found ${ui.empirePlan.results.length} plan(s).`);
      refresh();
    }, 20);
  },
  onAdoptEmpirePlan(index) {
    const plan = ui.empirePlan.results?.[index];
    if (!plan) return;
    const r = adoptEmpirePlan(state, plan);
    showMessage(
      r.reason ? `Adopted ${r.adopted} step(s); ${r.reason}` : `Adopted ${r.adopted} step(s).`,
    );
    refresh();
  },
  onChoosePantheon(beliefId) {
    const r = choosePantheon(state, beliefId);
    if (!r.ok) showMessage(r.reason!);
    else showMessage('Pantheon chosen.');
    refresh();
  },
  onFoundReligion(choice) {
    const r = foundReligion(state, choice);
    if (!r.ok) showMessage(r.reason!);
    else showMessage(`${state.religion.name} founded!`);
    refresh();
  },
  onAddTradeRoute(from, to) {
    const r = addTradeRoute(state, from, to);
    if (!r.ok) showMessage(r.reason!);
    refresh();
  },
  onRemoveTradeRoute(index) {
    removeTradeRoute(state, index);
    refresh();
  },
  onAdoptPlan(index) {
    if (!ui.planner?.results) return;
    const plan = ui.planner.results[index];
    if (!plan) return;
    const city = state.cities.find((c) => c.id === ui.planner!.cityId);
    if (city) {
      while (city.queue.length > 0) cancelQueueItem(state, city.id, 0);
    }
    const r = adoptPlan(state, ui.planner.cityId, plan);
    showMessage(
      r.reason ? `Adopted ${r.adopted} step(s); ${r.reason}` : `Adopted ${r.adopted} step(s).`,
    );
    selectCity(ui.planner.cityId);
    refresh();
  },
  onImportMap(text) {
    try {
      const { map, report } = parseCivExport(text);
      state = createGameFromMap(map, sandboxToggle.checked);
      ui.selectedTile = null;
      ui.selectedCityId = null;
      ui.settleSites = null;
      ui.compare = null;
      ui.lastImportSummary = importSummary(report);
      setMode('inspect');
      renderer.fit(state.map);
      showMessage(`Map imported: ${ui.lastImportSummary}`);
      refresh();
    } catch (e) {
      showMessage(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ---------------------------------------------------------------------------

function empirePerTurn(): { science: number; culture: number } {
  const lux = luxuryAmenities(state);
  const mods = getModifiers(state);
  let science = 0;
  let culture = 0;
  for (const c of state.cities) {
    const s = computeCityStats(state, c, lux, mods);
    science += s.total.science;
    culture += s.total.culture;
  }
  return { science, culture };
}

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
    if (ui.rightView === 'context') {
      renderCityPanel(contextPanel, state, stats, ui.manageCitizens, callbacks);
    }
  } else if (ui.rightView === 'context') {
    if (ui.selectedTile !== null) {
      renderTilePanel(contextPanel, state, ui.selectedTile, callbacks);
    } else {
      contextPanel.innerHTML =
        '<h2>Welcome</h2><p class="muted">Generate a map, switch to <b>Found city</b> mode and click a land tile. Open the city to place districts/buildings and buy tiles; use the Tech/Civics/Government views to run your empire. Sandbox mode skips costs and research gating.</p>';
    }
  }

  if (ui.rightView === 'tech' || ui.rightView === 'civic') {
    const per = empirePerTurn();
    renderResearchPanel(
      contextPanel,
      state,
      ui.rightView === 'tech' ? 'tech' : 'civic',
      ui.rightView === 'tech' ? per.science : per.culture,
      callbacks,
    );
  } else if (ui.rightView === 'government') {
    renderGovernmentPanel(contextPanel, state, callbacks);
  } else if (ui.rightView === 'settle' && ui.settleSites) {
    renderSettlePanel(contextPanel, state, ui.settleSites, callbacks);
  } else if (ui.rightView === 'compare' && ui.compare) {
    renderComparePanel(contextPanel, state, ui.compare, callbacks);
  } else if (ui.rightView === 'import') {
    renderImportPanel(contextPanel, ui.lastImportSummary, callbacks);
  } else if (ui.rightView === 'greatPeople') {
    renderGreatPeoplePanel(contextPanel, state);
  } else if (ui.rightView === 'planner' && ui.planner) {
    renderPlannerPanel(contextPanel, state, ui.planner, callbacks);
  } else if (ui.rightView === 'religion') {
    renderReligionPanel(contextPanel, state, callbacks);
  } else if (ui.rightView === 'trade') {
    renderTradePanel(contextPanel, state, callbacks);
  } else if (ui.rightView === 'empirePlan') {
    renderEmpirePlanPanel(contextPanel, state, ui.empirePlan, callbacks);
  }

  let highlight: Set<number> | null = null;
  let labels: Map<number, string> | null = null;
  let bestTiles: Set<number> | null = null;
  if (ui.mode === 'placeDistrict' && ui.pendingCityId !== null && ui.pendingDistrict) {
    const city = state.cities.find((c) => c.id === ui.pendingCityId);
    if (city) {
      const spots = scoreDistrictSpots(state, city, ui.pendingDistrict);
      highlight = new Set(spots.map((s) => s.tileIndex));
      labels =
        ui.pendingDistrict === 'NEIGHBORHOOD'
          ? new Map(
              spots.map((s) => [
                s.tileIndex,
                `⌂${appealTier(tileAppeal(state.map, state.map.tiles[s.tileIndex])).housing}`,
              ]),
            )
          : new Map(spots.map((s) => [s.tileIndex, `+${s.adjacency}`]));
      if (spots.length > 0) {
        const top = spots[0].score;
        bestTiles = new Set(spots.filter((s) => s.score === top).map((s) => s.tileIndex));
      }
    }
  } else if (ui.mode === 'placeWonder' && ui.pendingCityId !== null && ui.pendingWonder) {
    const city = state.cities.find((c) => c.id === ui.pendingCityId);
    if (city) highlight = new Set(wonderPlacementTiles(state, city, ui.pendingWonder));
  } else if (ui.mode === 'buyTile' && ui.pendingCityId !== null) {
    const city = state.cities.find((c) => c.id === ui.pendingCityId);
    if (city) highlight = new Set(borderCandidates(state, city));
  } else if (ui.settleSites && ui.rightView === 'settle') {
    highlight = new Set(ui.settleSites.map((s) => s.tileIndex));
    labels = new Map(ui.settleSites.map((s, i) => [s.tileIndex, `#${i + 1}`]));
    bestTiles = new Set(ui.settleSites.slice(0, 1).map((s) => s.tileIndex));
  }

  renderer.draw(state, {
    selected: ui.selectedTile ?? (ui.selectedCityId !== null ? cityView!.centerIndex : null),
    hover: ui.hoverTile,
    highlight,
    labels,
    bestTiles,
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
      ui.settleSites = null;
      setMode('inspect');
      setRightView('context');
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

  if (ui.mode === 'placeWonder' && ui.pendingCityId !== null && ui.pendingWonder) {
    const r = queueWonder(state, ui.pendingCityId, ui.pendingWonder, tileIdx);
    if (r.ok) {
      const cityId = ui.pendingCityId;
      setMode('inspect');
      selectCity(cityId);
      showMessage(state.sandbox ? 'Wonder placed.' : 'Wonder added to the production queue.');
    } else {
      showMessage(r.reason!);
    }
    refresh();
    return;
  }

  if (ui.mode === 'buyTile' && ui.pendingCityId !== null) {
    const cityId = ui.pendingCityId;
    const r = buyTile(state, cityId, tileIdx);
    if (r.ok) {
      setMode('inspect');
      selectCity(cityId);
      showMessage('Tile purchased.');
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
  ui.rightView = 'context';
  setRightView('context');
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
  ui.settleSites = null;
  ui.compare = null;
  setMode('inspect');
  setRightView('context');
  renderer.fit(state.map);
  refresh();
  showMessage(`Map generated (seed ${state.map.seed}).`);
});

$<HTMLButtonElement>('randomize-seed').addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 1e9));
});

$<HTMLButtonElement>('import-btn').addEventListener('click', () => {
  setRightView(ui.rightView === 'import' ? 'context' : 'import');
  refresh();
});

$<HTMLButtonElement>('mode-inspect').addEventListener('click', () => {
  setMode('inspect');
  refresh();
});

$<HTMLButtonElement>('mode-found').addEventListener('click', () => {
  setMode(ui.mode === 'found' ? 'inspect' : 'found');
  refresh();
});

$<HTMLButtonElement>('settle-advisor').addEventListener('click', () => {
  if (ui.rightView === 'settle') {
    ui.settleSites = null;
    setRightView('context');
    setMode('inspect');
  } else {
    ui.settleSites = scoreSettleSites(state);
    ui.selectedCityId = null;
    ui.selectedTile = null;
    setRightView('settle');
    setMode('found');
    showMessage(
      ui.settleSites.length
        ? 'Top settle sites ranked on the map — click one to found a city.'
        : 'No legal founding sites.',
    );
  }
  refresh();
});

for (const [btn, view] of [
  ['view-tech', 'tech'],
  ['view-civic', 'civic'],
  ['view-government', 'government'],
  ['view-gp', 'greatPeople'],
  ['view-religion', 'religion'],
  ['view-trade', 'trade'],
  ['view-empire-plan', 'empirePlan'],
] as const) {
  $<HTMLButtonElement>(btn).addEventListener('click', () => {
    setRightView(ui.rightView === view ? 'context' : view);
    refresh();
  });
}

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
  ui.settleSites = null;
  ui.compare = null;
  setMode('inspect');
  setRightView('context');
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
