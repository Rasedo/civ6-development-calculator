# RL trajectory review — literature synthesis (2026-07-06)

Synthesized from 26 primary sources gathered by a deep-research sweep
(5 search angles → fetch → claim extraction; the adversarial-verification
stage was skipped by user choice, so treat claims as faithful extractions
from primary sources rather than independently verified). Question: is
this project's RL trajectory sound, what breaks at 4-player self-play,
and which methodologies are we missing?

## Verdict in one paragraph

The trajectory — PPO on a factored masked action space, a perfect
snapshot/restore forward model, and a decided arc toward
search-distilled training (M3) and league self-play (C3) — is the
published recipe, and two of our empirical results this week are
*predicted* by the literature (the 1-ply value-leaf failure, and the
raw-score PUCT pathology). Three course corrections are warranted:
(1) M3 must replace plain sampled search with **Gumbel top-k +
Sequential Halving** and train the value head on **search-derived,
off-policy-corrected targets** — not merely "more search"; (2) the
**dense score-delta reward is the right bootstrap but the wrong
self-play objective** — plan a switch to relative/sparse reward for the
league phase and watch for score-hacking; (3) **start self-play at 2
players**, keep the owner dimension `O` parametric, and scale to 4-FFA
with population methods — 4-player works empirically (Pluribus,
Diplomacy) but has no convergence guarantees and needs specific
mitigations.

## 1. Is the trajectory sound? — Yes, with published confirmations

- **Our negative result was predicted.** "On the role of planning"
  (ICLR'21, arXiv:2011.04021): planning's main contribution is at
  TRAINING time (better targets and data distribution); evaluation-time
  search adds only ~7.4pp on average — and, mechanistically, *learned
  value functions have systematically higher errors on low-probability
  (off-policy) actions, and expanding such actions during search
  propagates those errors*. That is exactly why our PPO/GAE-trained
  value head cannot rank sampled tuples (tuplesearch 182–192 vs greedy
  195 at every temperature). The lever we identified (M3) is the right
  one — and eval-time search should be expected to stay marginal even
  after M3; the win comes through training.
- **Expert Iteration is the frame** (ExIt, NeurIPS'17, arXiv:1705.08439):
  search-improved targets beat policy-gradient training, and *online*
  data aggregation (keep old search data, DAgger-style) beats batch.
  AlphaZero's own value target is effectively on-policy (SARSA-like);
  off-policy search-derived value targets — soft-Z / A0C / A0GB
  (ALA'20 → NCA'22) — train faster and stronger. M3's value-target
  design should start from soft-Z (root search value) rather than
  final-game outcomes.
- **Our sampled-tuple design is the published one** (Sampled MuZero,
  ICML'21, arXiv:2104.06303): factored per-dimension categoricals with
  sampled complete tuples is their exact construction (56-dim humanoid);
  K as small as 3–50 samples approaches full-enumeration strength. Two
  corrections we don't yet apply: the visit/selection machinery must be
  **importance-corrected** (β̂/β) or it biases toward the proposal, and
  behavior-cloning search targets **discards value information** —
  MAZero (ICLR'24, arXiv:2405.11778) fixes that with advantage-weighted
  policy targets (AWPO) plus an optimistic backup, OS(λ), designed for
  deterministic models like ours.
- **Low-budget search needs Gumbel** (Gumbel MuZero, ICLR'22 Spotlight):
  vanilla AlphaZero's policy update *can fail to improve at all* when
  the budget can't visit every root action — our regime (46-column
  production head × per-unit heads, single consumer GPU). Gumbel top-k
  with Sequential Halving guarantees policy improvement with as few as
  2 simulations; MA-Gumbel variants (AAAI'24) extend this to
  exponentially factored multiagent tuples. "MCTS as regularized policy
  optimization" (ICML'20, arXiv:2007.12509) is the same story from the
  optimization side. LightZero (NeurIPS'23 D&B) has maintained reference
  implementations of the whole family.
- **Unbounded-score search needs Q normalization** (SameGame,
  arXiv:2005.11335): with dense unbounded rewards, per-node min-max
  normalization of Q inside the search is mandatory — we independently
  hit this in M1 ("unnormalized PUCT sticks on the first-scored
  action"). Same paper flags an open question whether value heads help
  at all in single-agent unbounded-score optimization (they used
  policy-guided rollouts instead) — a second reason our value-leaf
  failed that is *specific to score maximization*, beyond off-policy
  error.
- **A structural advantage worth naming:** we have a perfect, cheap,
  bit-exact forward model. The MuZero-family's heaviest machinery
  (model learning, consistency losses — EfficientZero's biggest
  ablation win) exists to compensate for NOT having one. We are in the
  AlphaZero-with-free-model regime; EfficientZero's remaining relevant
  idea is **reanalyze** (refresh replay-buffer targets with fresh
  search — 99–100% of targets recomputed).
- **Dense-score caveats** (see §2 too): CivRealm (arXiv:2401.10568) —
  the closest published precedent, PPO on a full Freeciv — got trapped
  in a myopic local optimum by score reward (spamming units instead of
  founding cities, because founding dips score short-term). Our engine's
  score shape apparently avoids that specific trap (our nets expand
  aggressively — the loyalty saga proves it), but CoastRunners (OpenAI,
  2016) stands as the canonical warning: a score-maximizing policy can
  look great on the score metric while being degenerate against the
  actual goal. Any future "win condition" needs its own eval, not just
  empire score.

## 2. Four-player FFA: real risks, known mitigations, 2p-first

- **The theory is genuinely against n>2:** Nash beyond 2-player
  zero-sum is PPAD-complete; equilibrium *selection* is ill-posed
  (independently computed equilibria don't compose — Pluribus's Lemonade
  Stand example); learning dynamics need not converge at all
  (α-Rank, Nature Sci.Rep. 2019); naive latest-vs-latest self-play can
  cycle forever under non-transitivity (self-play survey,
  arXiv:2408.01072). CFR/minimax-style guarantees exist **only** for
  the 2-player zero-sum duel — the fallback you named is exactly the
  theoretically safe regime.
- **But empirically n-player works when you add structure:** Pluribus
  (Science 2019) reached superhuman 6-max poker with self-play + search
  and *no* guarantees — framing n-player self-play as an empirical
  question. Diplodocus (arXiv:2210.05492) got top-human in 7-player
  no-press Diplomacy, but only by **anchoring search and RL to a
  reference policy** (DiL-piKL) — pure self-play provably insufficient
  in mixed-motive games. Its lesson transfers: we have no human data,
  but we DO have a scripted-civ policy and frozen snapshots to anchor
  toward (a piKL-style KL-regularizer toward the scripted policy or the
  previous checkpoint during n-player search/training).
- **Kingmaking/collusion:** our game is closer to poker/Generals than
  Diplomacy — there is no negotiation channel, so explicit collusion
  can't be *communicated*; the risks are implicit (two losing civs both
  dogpiling the leader is actually *desired* balance; a trained policy
  learning to throw games to a "teammate" checkpoint is the failure to
  watch). Mitigations from the literature: population diversity (league
  with exploiters — AlphaStar, Nature 2019 — noting AlphaStar's league
  was for a 1v1 game), α-Rank instead of Nash as the meta-solver /
  evaluator for n-player populations (α-PSRO; and NeuPL-JPSRO,
  AAMAS'24, which provably converges to a *coarse correlated
  equilibrium* — the tractable n-player target), and reward design
  (below).
- **Reward design is where FFA bites first.** Our per-turn score delta
  is not zero-sum: in self-play, four score-maximizers can converge on
  mutual non-aggression (peaceful co-farming maximizes everyone's
  score) — which may be *fine* for an "optimizer" project but is not
  "competitive Civ". OpenAI Five's fix: **symmetrize the dense reward**
  (subtract opponents' reward — e.g., own score delta minus the
  mean/max of others') to restore zero-sum pressure while keeping
  density. The 2026 Generals.io result (arXiv:2606.23348 — post-cutoff,
  unverified but detailed) goes further: dense material shaping
  actively HURT; sparse win/loss + a difficulty curriculum + plain PPO
  self-play (EMA opponent, no league) reached superhuman in a 2p
  strategy game on one GPU-vectorized simulator. Practical takeaway:
  dense score for single-agent bootstrap (proven here), then
  **relative-score or win/loss for the self-play phase**, possibly
  annealed.
- **Recommended path (and it costs nothing architecturally):** build
  C1/C2 with the owner dimension `O` as a parameter, seat-swapped PPO
  at **O=2 first** (duel: cleanest signal, guarantees-adjacent, ~half
  the tensor width, faster league iteration), and scale to O=4 as a
  second phase with: α-Rank league evaluation, PFSP matchmaking,
  anchored search, symmetrized reward, and an explicit eye on
  kingmaking metrics (e.g., per-seat win distribution vs score
  distribution). 2p results remain scientifically meaningful on their
  own; 4p rides the same code.

## 3. Methodologies we hadn't discussed, ranked by expected impact

1. **Gumbel top-k + Sequential Halving root selection** (Gumbel MuZero)
   — replaces plain prior-sampling in tuplesearch; guaranteed policy
   improvement at 2–16 simulations; the single highest-leverage change
   to the search arm, and the M3 policy-target generator.
2. **Search-derived off-policy value targets + reanalyze** (soft-Z/A0C/
   A0GB; EfficientZero's target refresh; ExIt's online data
   aggregation) — the other half of M3: the value head must be trained
   on search-improved play, with targets recomputed as the net improves.
3. **Per-node min-max Q normalization** in all search Q usage
   (SameGame) — systematize what M1 discovered ad hoc; prerequisite for
   any PUCT/Gumbel machinery over unbounded empire scores.
4. **AWPO + importance correction for sampled spaces** (MAZero; Sampled
   MuZero) — when distilling search into the policy, weight by
   advantages and correct for the sampling proposal instead of
   behavior-cloning visit counts.
5. **Reward-phase plan** — dense score → symmetrized relative score →
   (optionally) win/loss with curriculum, per training phase (OpenAI
   Five; Generals.io'26; CoastRunners/CivRealm warnings).
6. **Cheap PPO upgrades for self-play** (Generals.io'26): EMA opponent
   for plain self-play before any league; top-advantage sample
   filtering; plus OpenAI Five's horizon/γ annealing.
7. **α-Rank as the league evaluator** and CCE (not Nash) as the
   n-player solution concept (α-PSRO / NeuPL-JPSRO) — decide BEFORE
   building C3's matchmaking, so the league telemetry is right from
   day one.
8. **Anchored (piKL-style) search/training for n-player** (Diplodocus)
   — regularize toward the scripted policy or last checkpoint to keep
   n-player search from sharpening into brittle best-responses.
9. **Multi-continuation leaf evaluation** (Pluribus): evaluate search
   leaves under k alternative opponent continuations instead of one —
   robustness tool once opponents are learned policies, not scripts.
10. **Policy Gradient Search** (arXiv:1904.03646) — a tree-free planner
    (adapt a simulation policy online) as a fallback if trees stay
    awkward in the factored tuple space; pairs with ExIt.

Not recommended: learned-model machinery (MuZero dynamics, consistency
losses) — our bit-exact snapshot/restore model makes it dead weight;
Stochastic MuZero — our env is deterministic given rng_state (LightZero's
2048 benchmarks show chance-node modeling matters only under real
stochasticity; our search's RNG-clairvoyance is a separate, smaller issue
addressable by leaf RNG re-hashing).

## Cross-checks against our own measurements

| Our result | Literature |
|---|---|
| 1-ply value leaf loses to greedy at every τ | ICLR'21: off-policy value error propagates through search; SameGame: value heads questionable under unbounded scores |
| Raw-score PUCT sticks on first action (M1) | SameGame: min-max Q normalization is mandatory with unbounded rewards |
| Factored 5-head masked categoricals + sampled tuples | Sampled MuZero's exact construction (their §factored policies) |
| PPO alone reaches 217–222 vs scripted in ~80 min | OpenAI Five / Generals.io'26: model-free PPO self-play scales further than expected; search optional |
| netgreedy ≈ tuplesearch at eval | ICLR'21: eval-time search adds ~7pp on average; training-time is where planning pays |
