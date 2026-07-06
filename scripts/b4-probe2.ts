import { createGame, endTurn, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
const state = createGame({ width: 44, height: 26, seed: 9157, withResources: true, withWonders: true, unitsMode: true, withVillages: false, cityStates: 3, rivals: 2 });
state.disasters = true;
foundCity(state, scoreSettleSites(state, 1)[0].tileIndex);
for (let t = 0; t < 101; t++) {
  endTurn(state);
  if (state.turn - 1 === 99 || state.turn - 1 === 100) {
    const r = state.rivals[1];
    console.log(`TS t${state.turn - 1}: pops=${r.cities.map((rc, j) => `${j}:${rc.population}(${rc.foodBox.toFixed(2)})`).join(' ')}`);
    console.log(`     dists=${r.cities.flatMap((rc, j) => rc.districts.filter((d) => d.type !== 'CITY_CENTER').map((d) => `${j}:${d.type}@${d.tileIndex}${state.map.tiles[d.tileIndex].districtComplete ? '!' : '?'}`)).join(' ')}`);
  }
}
