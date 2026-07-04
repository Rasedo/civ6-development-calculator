# GPU engine — autonomous build plan

Ordered roadmap toward the district economy, single-agent search, and
self-play. Worked in **small stages, each committed + pushed green** so a
container rollback never loses more than the in-flight stage. Every stage
re-syncs first (`git stash -u; git fetch; git merge --ff-only origin/<branch>`),
mirrors the TS oracle, and must pass BOTH parity gates + `tsc` before commit:

    npm run gpu:export && python3 gpu/parity_test.py      # scripted gate
    npm run gpu:rollout && npm run gpu:replay             # off-script gate

Legend: [ ] todo  [~] in progress  [x] done (commit hash)

## 1. District economy  (biggest GPU↔TS gap)
Only the City Center is ported; specialty districts + their buildings are the
largest missing slice of the Civ6 economy. Sub-stages mirror the FARM phase
(inert plumbing → one type → adjacency → buildings → RL action).

- [x] **D1** Inert plumbing: engine district-state tensor ([B,T] type idx, -1=none),
      exporter ships the district catalog (id, cost, adjacencyYield, adjacency
      rules, housing, placement flags) + STATIC per-tile adjacency contribution
      (mountain/rainforest/woods/reef/river/sea-resource/natural-wonder — known
      at t=0). Self-test; both gates stay green (nothing builds districts yet).
- [~] **D2** Campus placement + adjacency yield (split):
  - [x] **D2a** raw static-source adjacency table [B,T,10] exported (in-exporter
        self-check: floor(static)==districtAdjacency on every non-dynamic tile) +
        engine loads it inert.
  - [ ] **D2b** scripted exporter places one Campus on its best-adjacency owned
        tile; GPU mirrors placement + floor(static + live dynamic center/district)
        adjacency yield into city totals + district-per-pop cap. Gate to green.
- [ ] **D3** Dynamic adjacency: adjacent-district (+0.5 each), city-center,
      harbor, mine/quarry (IZ), built-wonder. Add the rest of the specialty
      districts. Gate to green.
- [ ] **D4** District buildings (Library/University, Market/Bank, Shrine/Temple,
      Workshop/Factory, etc.): unlocks, yields, housing, specialist slots.
- [ ] **D5** RL production head can queue districts (widen production action
      space); off-script coverage; retrain-ready.
- [ ] **D6** Specials: Aqueduct/Neighborhood housing, Harbor coastal placement,
      Encampment not-adjacent-to-center.

## 2. Single-agent MCTS  (score lever over the existing net)
Primitives already exist: deterministic batched forward model (in-state
mulberry32), cheap clone/restore (`_MUTABLE` + `_pristine`), trained policy
priors + value head (train_ppo `self.v`), legal-action masks.

- [ ] **M1** PUCT driver over BatchSim (clone→step→backup) using policy priors +
      value leaf eval. CPU smoke test.
- [ ] **M2** Factored action space (5 heads/turn): Gumbel/Sampled-AlphaZero style
      search over sampled action-tuples. Eval vs the 213.6 policy.
- [ ] **M3** (opt) Search-distilled policy improvement loop; handle RNG chance
      nodes (sample futures / expectimax) for robustness.

## 3. Multi-civ symmetry  (unlocks self-play + AlphaZero)
Blocker: player is a full citizen, rivals are a reduced heuristic NPC model.

- [ ] **C1** Promote rivals to full symmetric per-owner state (owner dimension on
      cities/economy/research/gov); keep TS parity.
- [ ] **C2** Per-civ egocentric obs, per-civ action routing, per-civ reward.
- [ ] **C3** Self-play trainer + opponent league (PFSP, frozen snapshots).

## Status log
- stage 0: plan committed (durable across rollbacks). Baseline `5a6f2b6`:
  districts absent from GPU scope (scripted export builds none), so D1 is inert.
- D1 [x]: district catalog (10 defs — cost/adjYield/adjacency-src/housing/
  placement flags) exported; engine loads it inert + a [B,T] district tensor
  (-1=none) in _MUTABLE (resets). Self-test green (Campus science/54, CH river+2
  gold, Harbor coastal); both gates stay green. Next: D2 — scripted Campus
  placement + static (terrain-based) adjacency yield, gate-verified.
- D2a [x]: raw static-source adjacency table [B,T,10] exported + loaded inert.
  In-exporter self-check passed on all 24 maps (floor(static)==districtAdjacency
  wherever no dynamic source is live; the just-founded city center is skipped).
  Campus static max 6.0; both gates green. Next: D2b — Campus placement + the
  floored (static + live center/district) adjacency yield into city totals.
- D2b DESIGN (studied; implement next turn — kept here so a rollback can't lose
  it). Scope kept tractable by placing the Campus where dynamic adjacency = 0,
  so the yield is PURELY static (D2a already proved floor(static)==
  districtAdjacency there); dynamic sources (adjacent district/center/mine) are
  D3.
  * Placement rule (BOTH engines, deterministic, instant-place a COMPLETE
    Campus once): trigger when the capital has WRITING (CAMPUS unlock) and a
    valid tile exists and no Campus yet (maxSpecialtyDistricts(pop)=floor((pop-1)
    /3)+1 >= 1 is always true). Candidate tiles = owned by the capital, within
    work radius 3, workable (static `st`), NOT the center, NOT adjacent to ANY
    city center (this zeroes the DISTRICT/CITY_CENTER dynamic source → pure
    static yield), land/non-district/non-wonder. Pick MAX floor(static Campus
    adjacency) [= floor(d_static_adj[tile,0]) in GPU, = districtAdjacency in TS],
    ties to LOWEST tile index. If none qualifies, place nothing.
  * TS exporter (scripts/export-gpu.ts turn loop, after the per-city production
    block ~line 642): tile.district='CAMPUS'; tile.districtComplete=true;
    capital.districts.push({type:'CAMPUS',tileIndex}); mark campusPlaced. Export
    campusUnlockTech = techList index of WRITING (the CAMPUS unlockDistrict) and
    campusIdx=0.
  * GPU engine: mirror the SAME trigger+tile choice and set self.district[b,tile]
    =0 (place BEFORE that turn's city-yield computation, matching TS ordering).
    (1) PAVING: in _city_totals cand mask (line ~901) add
    `& (self.district.gather(1,tcf).reshape(B,C,M) < 0)` so district tiles are
    never worked (mirrors workableTiles `!t.district`). (2) YIELD: for each
    owned tile with district==0 (Campus), add floor(d_static_adj[b,tile,0]) to
    the city's SCIENCE column (idx 3) in the total — compute over the same 37-
    tile work window. Bump _eff_version on placement if needed.
  * Canary: nudge the Campus static adjacency (+1) → gate must break.
  * Iterate: first mismatch → parity_test HEAD column → the likely suspects are
    the tile-choice tie-break, the citizen reassignment after paving, and place
    timing (same turn in both). Then D3 relaxes placement + adds dynamic sources.
