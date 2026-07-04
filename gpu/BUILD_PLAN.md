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

- [ ] **D1** Inert plumbing: engine district-state tensor ([B,T] type idx, -1=none),
      exporter ships the district catalog (id, cost, adjacencyYield, adjacency
      rules, housing, placement flags) + STATIC per-tile adjacency contribution
      (mountain/rainforest/woods/reef/river/sea-resource/natural-wonder — known
      at t=0). Self-test; both gates stay green (nothing builds districts yet).
- [ ] **D2** Scripted exporter builds ONE specialty district (Campus) on its
      best static-adjacency tile; GPU mirrors placement + the static adjacency
      yield (floor rule) + district-per-pop cap. Iterate gate to green.
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
- 2026-07-04 stage 0: plan committed (durable across rollbacks). Baseline at
  `5a6f2b6`: districts absent from GPU scope (scripted export builds none), so
  D1 plumbing is a verified no-op. Next: D1.
