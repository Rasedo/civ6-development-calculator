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


def plan_value(sim, city: int, end_turn: int, depth: int) -> float:
    """empire_score for game 0 at absolute `end_turn`, assuming `city` re-plans to
    `depth` at each of its future decisions before `end_turn` and every other
    head/city stays scripted. depth==0 rolls out purely scripted. Self-restoring:
    the sim is left exactly as it was passed in (eval-only)."""
    s0 = sim.snapshot()
    while sim.turn < end_turn and not _pending(sim, city):
        sim.step()  # scripted-advance to this city's next decision (or the horizon)
    if depth == 0 or sim.turn >= end_turn or not _pending(sim, city):
        while sim.turn < end_turn:
            sim.step()
        v = float(sim.empire_score()[0])
        sim.restore(s0)
        return v
    s1 = sim.snapshot()
    best = -float("inf")
    for a in _legal(sim, city):
        _commit(sim, city, a)
        v = plan_value(sim, city, end_turn, depth - 1)
        if v > best:
            best = v
        sim.restore(s1)
    sim.restore(s0)
    return best


def plan_production(sim, city: int = 0, horizon: int = 20, depth: int = 1):
    """Closed-loop depth-`depth` search over `city`'s current production decision
    for a B=1 sim. The leaf assumes future decisions are ALSO planned (depth-1),
    not scripted, so depth>1 sees setup moves that only pay off past the next
    decision. Returns (best_action, {action: value}); deterministic, ties to the
    lowest action index. depth=1 is the open-loop 1-ply search (== search_production
    at the same effective horizon)."""
    assert sim.B == 1, "planning searches one game at a time"
    cands = _legal(sim, city)
    if not cands:
        return None, {}
    end_turn = sim.turn + horizon
    s1 = sim.snapshot()
    vals = {}
    for a in cands:
        _commit(sim, city, a)
        vals[a] = plan_value(sim, city, end_turn, depth - 1)
        sim.restore(s1)
    best = max(cands, key=lambda a: (vals[a], -a))
    return best, vals


def mpc_play(sim, city: int = 0, horizon: int = 20, depth: int = 1, turns: int = 60) -> float:
    """Play `turns` real turns with `city`'s production chosen by plan_production at
    each of its decisions (model-predictive control) and everything else scripted.
    Re-planning every turn adapts to the realized RNG futures. MUTATES sim — this is
    the actual game, not a rollout, so pass a throwaway sim. Returns the final
    empire_score for game 0."""
    for _ in range(turns):
        if _pending(sim, city):
            a, _ = plan_production(sim, city, horizon, depth)
            _commit(sim, city, a)
        else:
            sim.step()
    return float(sim.empire_score()[0])
