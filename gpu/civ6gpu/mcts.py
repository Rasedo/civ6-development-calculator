"""Single-agent search over the vectorized forward model (MCTS M1 / M2a).

The score lever over a fixed base policy: at a decision point, use the
deterministic forward model (snapshot -> apply -> scripted rollout -> restore)
to look past the immediate reward and pick the production action with the best
few-turn outcome, instead of the myopic scripted choice.

M1 (`search_production`) is an EXHAUSTIVE 1-ply search over ONE city's production
head (the widest lever), holding the other heads at the scripted policy during the
rollout. The scripted forward model is deterministic given the state (the RNG
stream lives in `rng_state`, which snapshot/restore round-trip), so a single
rollout per action yields that action's EXACT `horizon`-turn value — there is
nothing to sample, and scoring every legal action once and taking the argmax is
optimal. That makes a PUCT bandit pointless (and, unnormalized, actively wrong) at
M1; PUCT with a net's prior/value and RNG chance nodes waits for M2b, once a
trained checkpoint exists (Phase B) to make leaves expensive and stochastic.

M2a (`plan_production` / `mpc_play`) is the net-free planning extension: (1) DEPTH
— the leaf may assume `city` also PLANS (depth-1) at its future decisions rather
than reverting to scripted, so depth>1 sees setup moves that pay off past the next
decision; and (2) CLOSED LOOP — `mpc_play` re-searches at EVERY decision of the
real game (model-predictive control), which adapts to the realized disaster/barb
futures and compounds the per-decision edge. depth=1 reduces exactly to the
open-loop 1-ply search. Both remain eval-only during search: every rollout
restores its snapshot, so the parity-checked forward model is never perturbed.

M3 (`minmax_normalize` / `stack_tuples` / `clone_state` / `rehash_rng` /
`eval_tuples`) is the net-free plumbing under the Gumbel tuple search
(search_eval.py's `gumbelsearch` — the net wiring stays out of this module):
per-decision min-max Q normalization (M3a — mandatory under unbounded empire
scores), batched candidate evaluation where the k candidate tuples become the
BATCH dimension of one lockstep k-wide sim instead of a sequential B=1 loop
(M3c — restore()'s tensor.copy_ broadcasts a B=1 snapshot across all k rows, so
one snapshot clones k ways; bit-equal to the sequential loop, see
gumbel_test.py), and an honest-leaf RNG re-hash so continuations stop replaying
the exact realized future stream (M3d-lite).
"""
from __future__ import annotations


def _rollout_value(sim, city: int, action: int, horizon: int, snap: dict) -> float:
    """empire_score for game 0 after committing `action` in `city` this turn
    (other cities idle for the commit, then tech/civic/units/production all
    scripted) then `horizon` scripted turns. Restores the snapshot before
    returning, so the caller's state is untouched."""
    import torch

    pa = torch.full((1, sim.C), sim.IDLE, dtype=torch.long, device=sim.device)
    pa[0, city] = action
    sim.step(production=pa)  # commit the candidate; other heads follow the scripted policy
    for _ in range(horizon):
        sim.step()  # fully scripted rollout
    v = float(sim.empire_score()[0])
    sim.restore(snap)
    return v


def search_production(sim, city: int = 0, horizon: int = 15, value_fn=None):
    """Exhaustive 1-ply search over `city`'s legal production actions for a B=1
    sim. Scores every candidate by its `horizon`-turn scripted rollout and returns
    (best_action, {action: value}). Deterministic: the rollout is scripted so each
    value is exact; ties break to the lowest action index.

    value_fn(action) overrides the rollout leaf value (e.g. a trained value head),
    keeping the same exhaustive shape for M2's drop-in."""
    assert sim.B == 1, "M1 searches one game at a time"
    mask = sim.production_mask()[0, city]
    cands = mask.nonzero(as_tuple=True)[0].tolist()
    if not cands:
        return None, {}
    snap = sim.snapshot()
    leaf = value_fn if value_fn is not None else (lambda a: _rollout_value(sim, city, a, horizon, snap))
    vals = {a: leaf(a) for a in cands}
    best = max(cands, key=lambda a: (vals[a], -a))  # highest value; ties -> lowest index
    return best, vals


def greedy_production(sim, city: int = 0):
    """Myopic baseline: the production action with the best IMMEDIATE next-turn
    empire_score (horizon 0). What a 1-step-reward policy would pick."""
    return search_production(sim, city=city, horizon=0)


# --- M2a: net-free closed-loop planning (depth + MPC) -----------------------

def _pending(sim, city: int) -> bool:
    """True when `city` faces a production decision this turn (mask non-empty)."""
    return bool(sim.production_mask()[0, city].any())


def _legal(sim, city: int):
    return sim.production_mask()[0, city].nonzero(as_tuple=True)[0].tolist()


def _commit(sim, city: int, action: int) -> None:
    """Advance one turn with `city` producing `action` and every other head/city
    on the scripted policy."""
    import torch

    pa = torch.full((1, sim.C), sim.IDLE, dtype=torch.long, device=sim.device)
    pa[0, city] = action
    sim.step(production=pa)


def _empire_value(sim) -> float:
    """Default leaf value: the raw balanced empire score for game 0."""
    return float(sim.empire_score()[0])


def loyalty_shaped_value(penalty: float = 2.0, thresh: float = 100.0):
    """A leaf value that discounts empire_score by the loyalty-flip risk of the
    player's own cities: each alive city loses `penalty` per loyalty point below
    `thresh`. Because a doomed city bleeds loyalty steadily from founding (100 →
    0 over ~40–60 turns) but only actually flips well past a 20-turn rollout, the
    raw score never sees the loss; penalising the erosion visible AT the horizon
    steers the search away from over-expanding into flip-bound cities and toward
    loyalty-raising (amenity) production in the fragile ones. The capital is loyalty-
    pinned to 100, so it is never penalised. Returns a value_fn(sim)->float."""
    def v(sim) -> float:
        loy = sim.loyalty[0]
        alive = sim.alive[0].to(loy.dtype)
        risk = float(((thresh - loy).clamp(min=0) * alive).sum())
        return float(sim.empire_score()[0]) - penalty * risk
    return v


def plan_value(sim, city: int, end_turn: int, depth: int, value_fn=_empire_value) -> float:
    """`value_fn(sim)` for game 0 at absolute `end_turn`, assuming `city` re-plans to
    `depth` at each of its future decisions before `end_turn` and every other
    head/city stays scripted. depth==0 rolls out purely scripted. `value_fn` defaults
    to the raw empire score; pass e.g. `loyalty_shaped_value()` to shape the leaf.
    Self-restoring: the sim is left exactly as it was passed in (eval-only)."""
    s0 = sim.snapshot()
    while sim.turn < end_turn and not _pending(sim, city):
        sim.step()  # scripted-advance to this city's next decision (or the horizon)
    if depth == 0 or sim.turn >= end_turn or not _pending(sim, city):
        while sim.turn < end_turn:
            sim.step()
        v = value_fn(sim)
        sim.restore(s0)
        return v
    s1 = sim.snapshot()
    best = -float("inf")
    for a in _legal(sim, city):
        _commit(sim, city, a)
        v = plan_value(sim, city, end_turn, depth - 1, value_fn)
        if v > best:
            best = v
        sim.restore(s1)
    sim.restore(s0)
    return best


def plan_production(sim, city: int = 0, horizon: int = 20, depth: int = 1, value_fn=_empire_value):
    """Closed-loop depth-`depth` search over `city`'s current production decision
    for a B=1 sim. The leaf assumes future decisions are ALSO planned (depth-1),
    not scripted, so depth>1 sees setup moves that only pay off past the next
    decision. `value_fn` scores the leaf (default: raw empire score). Returns
    (best_action, {action: value}); deterministic, ties to the lowest action index.
    depth=1 is the open-loop 1-ply search (== search_production at the same horizon)."""
    assert sim.B == 1, "planning searches one game at a time"
    cands = _legal(sim, city)
    if not cands:
        return None, {}
    end_turn = sim.turn + horizon
    s1 = sim.snapshot()
    vals = {}
    for a in cands:
        _commit(sim, city, a)
        vals[a] = plan_value(sim, city, end_turn, depth - 1, value_fn)
        sim.restore(s1)
    best = max(cands, key=lambda a: (vals[a], -a))
    return best, vals


def mpc_play(sim, city: int = 0, horizon: int = 20, depth: int = 1, turns: int = 60,
             value_fn=_empire_value) -> float:
    """Play `turns` real turns with `city`'s production chosen by plan_production at
    each of its decisions (model-predictive control) and everything else scripted.
    Re-planning every turn adapts to the realized RNG futures. `value_fn` shapes the
    search leaf (e.g. loyalty_shaped_value); the RETURNED score is always the true
    empire_score. MUTATES sim — pass a throwaway sim."""
    for _ in range(turns):
        if _pending(sim, city):
            a, _ = plan_production(sim, city, horizon, depth, value_fn)
            _commit(sim, city, a)
        else:
            sim.step()
    return float(sim.empire_score()[0])


def _commit_many(sim, actions: dict) -> None:
    """Advance one turn committing {city: action} for several cities at once (the
    rest idle), matching how production is one simultaneous per-turn decision."""
    import torch

    pa = torch.full((1, sim.C), sim.IDLE, dtype=torch.long, device=sim.device)
    for c, a in actions.items():
        pa[0, c] = a
    sim.step(production=pa)


def mpc_play_empire(sim, horizon: int = 20, depth: int = 1, turns: int = 60,
                    value_fn=_empire_value) -> float:
    """Like mpc_play but the search controls EVERY city's production, not just the
    capital. Each turn, every pending city is searched INDEPENDENTLY from the shared
    pre-decision state (plan_production is self-restoring), then all their picks are
    committed together in one step. The independence is an approximation — a city's
    rollout idles its co-deciders for the commit turn — but production actions never
    collide (each city places only on tiles it owns), and re-planning every turn
    corrects any within-turn drift. `value_fn` shapes the search leaf. MUTATES sim;
    returns the true final empire_score."""
    for _ in range(turns):
        pend = [c for c in range(sim.C) if _pending(sim, c)]
        if not pend:
            sim.step()
            continue
        chosen = {}
        for c in pend:
            best, _ = plan_production(sim, city=c, horizon=horizon, depth=depth, value_fn=value_fn)
            chosen[c] = best  # plan_production restores sim, so each city sees the same base
        _commit_many(sim, chosen)
    return float(sim.empire_score()[0])


# --- M3: shared plumbing for batched tuple search (net-free) -----------------

HEAD_ORDER = ("production", "tech", "civic", "units", "envoy")


def minmax_normalize(q, eps: float = 1e-9):
    """[M3a] Per-decision min-max normalization of candidate values to [0, 1]:
    (q - min) / (max - min) over the candidates competing at one root. Mandatory
    wherever Q mixes with prior/noise terms — raw empire scores (~60–280) dwarf
    log-prob-scale quantities (the M1 pathology; SameGame's published fix). A
    degenerate range (all values within eps) carries no ranking information and
    returns flat 0.5s, so selection falls back to the prior + Gumbel noise."""
    import torch

    lo, hi = q.min(), q.max()
    if float(hi - lo) <= eps:
        return torch.full_like(q, 0.5)
    return (q - lo) / (hi - lo)


def tuple_key(acts: dict) -> tuple:
    """Hashable identity of a B=1 five-head action tuple (candidate dedup)."""
    return tuple(v for h in HEAD_ORDER for v in acts[h].reshape(-1).tolist())


def stack_tuples(cands: list, k: int) -> dict:
    """Row-stack m <= k candidate action dicts (B=1 rows, sample_heads layout)
    into k-wide per-head tensors: candidate i becomes batch row i. Rows m..k-1
    repeat candidate 0, so one fixed k-wide sim serves any m — the pad rows step
    in lockstep but their values are never read."""
    import torch

    return {h: torch.cat([c[h] for c in cands] + [cands[0][h]] * (k - len(cands)), dim=0)
            for h in HEAD_ORDER if h in cands[0]}


def clone_state(sim_wide, snap: dict) -> None:
    """[M3c] Broadcast-restore a B=1 snapshot into a k-wide sim, cloning one
    state k ways: restore()'s tensor.copy_ broadcasts each [1, ...] snapshot
    tensor across all k rows (bit-exact per row — gumbel_test.py proves it, and
    proves the k-wide lockstep evolution stays row-identical to B=1)."""
    assert snap["mut"]["alive"].shape[0] == 1, "clone_state broadcasts a B=1 snapshot"
    sim_wide.restore(snap)


def rehash_rng(sim, salt: int = 0) -> None:
    """[M3d-lite] Honest leaves: re-hash each game's mulberry32 state in place
    (splitmix64 of the current value + salt, masked back to u32) so a search
    continuation stops replaying the exact RNG future the real game will
    realize. Deliberately a pure function of the row's OWN state — not the batch
    row index — so identical candidates draw identical perturbed futures (common
    random numbers: fair across candidates) and a batched evaluation stays
    bit-equal to the sequential one. Mutates rng_state only; snapshot/restore
    round-trips it like any other mutable tensor."""
    from .rng import hash_keys

    sim.rng_state.copy_(hash_keys(sim.rng_state, salt) & ((1 << 32) - 1))


def eval_tuples(env_wide, snap: dict, cands: list, horizon: int = 0,
                step_fn=None, rehash: bool = False):
    """[M3c] Evaluate m <= k candidate action tuples from ONE B=1 state in a
    single lockstep k-wide env (build it once per search run — the same fixture
    k times — and reuse it): broadcast-restore the snapshot, commit the tuples
    as row-wise actions in one step, optionally roll `horizon` continuation
    turns (step_fn(env_wide) per turn; default fully scripted), and return the
    per-candidate empire scores [m]. Bit-equal to the sequential
    snapshot/commit/restore loop over the same candidates (gumbel_test.py) at
    ~1/m the wall-clock — the throughput unlock for search-generated training
    data. rehash=True applies rehash_rng after the commit (M3d-lite). Leaves
    env_wide dirty (it is scratch); never touches the snapshot's source sim."""
    sim = env_wide.sim
    assert len(cands) <= sim.B, f"{len(cands)} candidates > sim width {sim.B}"
    clone_state(sim, snap)
    sim.step(**stack_tuples(cands, sim.B))
    if rehash:
        rehash_rng(sim)
    for _ in range(horizon):
        if step_fn is None:
            sim.step()
        else:
            step_fn(env_wide)
    return sim.empire_score()[: len(cands)]
