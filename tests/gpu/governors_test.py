"""The governors / era-score poke lane — the age and governor-loyalty surfaces
the scripted rollout only reaches organically (no seat accrues to GOLDEN_T
in-gate, era boundaries land at fixed turns, and the greedy governor pick and
capital immunity ride inside the loyalty loops).

    $env:PYTHONUTF8='1'; python tests/gpu/governors_test.py

Every poke builds a BatchSim from a fixture, forces state in-memory, then
drives the exact engine twin (_transfer_city, the step-tail era boundary,
_seat_city_loyalty/_seat_loyalty_flips, _seat_phase). EVERY constant comes from rules.json
through the engine's own loaders (sim._era_len/_era_dark/_era_gold/_era_pts/
_gov_title_civics/_gov_loy/_age_factor) — nothing is hardcoded.

Covered:
  a. Event hooks: _transfer_city bumps the RECEIVER's era_score by the
     conquer const (and nobody else's); _era_pts is exactly rules.json.eras.
     found/wonder/pantheon/religion/gp share the identical `+= const` shape at
     their own sites, and their score→age arithmetic is covered by poke b.
  b. Boundary math: at a turn that crosses a multiple of eras.length each seat's
     new-era Age comes from the just-ended window's score — darkT-1→Dark,
     darkT→Normal, goldenT-1→Normal, goldenT→Golden — then era_score resets 0.
  c. Age pressure: the seat-0 loyalty twin's pressure scales every SOURCE
     seat's contribution by its age factor (Dark ½ / Normal 1 / Golden 1½);
     asserted by an EXACT reconstruction across five age combos
     (quantized-milli).
  d. Governor pick: one title per NAMED civic appoints one governor, and each
     seats the LOWEST-loyalty alive city (+GOVERNOR_LOYALTY), ties → lower slot
     index. The civ path via _seat_phase two-run diff (a boundary tie resolves
     to the lower slot); the seat-0 path via the same bodies driven at row 0.
  e. Golden reachability: forcing era_score[0] ≥ goldenT across a boundary
     flips seat 0 to Golden (the axis the scripted gate never reaches) — then
     its OWN-pressure term scales ×1.5 vs Normal.
  f. Capital immunity: a capital that ranks lowest (so it IS governor-picked)
     still pins at LOYALTY_MAX, on both seat families.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype))
    for _ in range(steps):
        sim.step()
    return sim


def q(x: float) -> int:
    """js_round to milli — the engine's quantized-loyalty rank key."""
    return math.floor(x * 1000 + 0.5)


def add_seat0_city(sim, col: int, tile: int, pop: int, loy: float) -> None:
    # Array position IS the column under append+reclaim.
    sim.city_alive[0, 0, col] = True
    sim.city_is_cap[0, 0, col] = False
    sim.city_center[0, 0, col] = tile
    sim.city_pop[0, 0, col] = pop
    sim.city_loyalty[0, 0, col] = loy
    # a city ADDRESSED by id (the governor roster is one) needs a real one —
    # the unset 0 aliases the capital
    sim.city_id[0, 0, col] = int(sim.civ_next_city_id[0, 0])
    sim.civ_next_city_id[0, 0] += 1


def recon_seat0_next(sim, c: int, tier_idx_c: int, picked: bool) -> float:
    """Closed-form applyLoyalty for seat-0 city c: every source contribution
    scaled by its seat's age factor, then pressure + amenity + governor,
    clamped. The engine twin is _seat_city_loyalty, which reads the same LIVE
    pops this reconstruction does."""
    rng = int(sim.rules.seats.get("loyaltyRange", 9))
    scale = float(sim.rules.seats.get("loyaltyScale", 20))
    af = sim._age_factor.tolist()
    sc = int(sim.city_center[0, 0, c])
    own = 0.0
    for cp in range(sim.RC):
        if not bool(sim.city_alive[0, 0, cp]):
            continue
        w = max(0.0, rng + 1 - float(sim.pair_dist[sc, int(sim.city_center[0, 0, cp])]))
        own += float(sim.city_pop[0, 0, cp]) * w
    own_eff = own * af[int(sim.civ_age[0, 0])]
    for_eff = 0.0
    for row in range(1, sim.n_majors):
        sub = 0.0
        for j in range(sim.RC):
            if not bool(sim.city_alive[0, row, j]):
                continue
            w = max(0.0, rng + 1 - float(sim.pair_dist[sc, int(sim.city_center[0, row, j])]))
            sub += float(sim.city_pop[0, row, j]) * w
        for_eff += sub * af[int(sim.civ_age[0, row])]
    tot = own_eff + for_eff
    press = scale * (own_eff - for_eff) / tot if tot > 0 else 0.0
    amen = float(sim._loyalty_amenity[tier_idx_c])
    gov = sim._gov_loy if picked else 0.0
    if bool(sim.city_is_cap[0, 0, c]):
        return 100.0
    return max(0.0, min(100.0, float(sim.city_loyalty[0, 0, c]) + press + amen + gov))


def apply_loyalty_row(sim, tier, row: int = 0) -> None:
    """The seat block's loyalty pass for one seat row, with an explicit amenity
    TIER map: the loop-top governor seats, then applyLoyalty per living column
    in array order (pops read live, the engine's own order), then the flips.
    Exactly what _seat_turn does around _seat_city_loyalty."""
    gov = sim._seat_governor_seats(row)
    flip = torch.zeros(sim.B, sim.RC, dtype=torch.bool)
    for j in range(sim.RC):
        act = sim.city_alive[:, row, j]
        if not bool(act.any()):
            continue
        jc = torch.full((sim.B,), j, dtype=torch.long)
        flip[:, j] = sim._seat_city_loyalty(row, jc, act, tier[:, j], gov[:, j])
    sim._seat_loyalty_flips(row, flip)


def two_city_setup(rules, path):
    """A capital + two forced non-capital seat-0 cities on the capital's
    neighbours, civics wiped (titles 0). Returns (sim, [non-cap cols])."""
    sim = build(rules, path)
    sim.major_unit_alive[:] = False
    cap = int(sim.city_is_cap[0, 0].nonzero()[0])
    nb = [int(x) for x in sim.neigh[int(sim.city_center[0, 0, cap])].tolist() if x >= 0]
    free = (~sim.city_alive[0, 0]).nonzero(as_tuple=True)[0].tolist()
    cols = free[:2]
    add_seat0_city(sim, cols[0], nb[0], 4, 55.0)
    add_seat0_city(sim, cols[1], nb[1], 4, 59.0)
    # GUARANTEE FOREIGN PRESSURE. Loyalty pressure is a RATIO —
    # `scale * (own - foreign) / (own + foreign)` — so with foreign == 0 it is
    # `own/own` and the SOURCE-seat age factor CANCELS ALGEBRAICALLY, leaving
    # the Golden x1.5 assertion unable to fire whatever the starting loyalty.
    # Plant a civ city in range rather than hoping a fixture parks one there.
    if sim.n_majors > 1:
        cap_tile = int(sim.city_center[0, 0, cap])
        near = next(
            (t for t in range(sim.T)
             if 1 <= int(sim.pair_dist[cap_tile, t]) <= 3 and bool(sim.passable[0, t])),
            -1,
        )
        assert near >= 0, "no tile in loyalty range of the capital to plant a civ city on"
        sim.city_alive[0, 1, 0] = True
        sim.city_center[0, 1, 0] = near
        sim.city_pop[0, 1, 0] = 6
    sim.civ_civics[:, 0] = False
    return sim, cols


# ------------------------------------------------------------------ pokes -----
def poke_event_hooks(rules, path):
    """a. _transfer_city bumps ONLY the receiver's era_score by conquer;
    _era_pts is exactly rules.json.eras (found/wonder/pantheon/religion/gp are
    the same shape at their own sites)."""
    er = rules.eras
    sim = build(rules, path)
    for k, d in (("found", 2), ("conquer", 3), ("wonder", 3), ("pantheon", 1), ("religion", 2), ("gp", 1)):
        assert sim._era_pts[k] == int(er.get(k, d)), f"_era_pts[{k}] must mirror rules.json"

    conquer = sim._era_pts["conquer"]
    civ_only_from = next(r for r in range(sim.n_majors - 1) if bool(sim.city_alive[0, r + 1].any()))
    civ_only_to = next(r for r in range(sim.n_majors - 1) if r != civ_only_from)
    j = int(sim.city_alive[0, civ_only_from + 1].nonzero(as_tuple=True)[0][0])
    before = sim.era_score[0].clone()
    sim._transfer_city(0, civ_only_from + 1, j, civ_only_to + 1, conquest=False)
    delta = (sim.era_score[0] - before).tolist()
    exp = [0] * (sim.n_majors)
    exp[civ_only_to + 1] = conquer
    assert delta == exp, f"conquer must accrue +{conquer} to the receiver only (got {delta})"
    print(f"  a event hooks OK (_era_pts == rules.eras; rc→rc transfer += {conquer} to receiver civ {civ_only_to + 1} only)")


def poke_boundary(rules, path):
    """b. Age assignment at the darkT/goldenT edges + the window reset, driven
    on age slot 0 (seat 0): it accrues nothing during a unit-less single step,
    so the score forced right before the boundary is exactly what the boundary
    reads."""
    sim = build(rules, path)
    sim.major_unit_alive[:] = False
    dark, gold, elen = sim._era_dark, sim._era_gold, sim._era_len
    # the bars are PER SEAT: base + cities at the boundary (the drift
    # counters are zero on a fresh sim)
    ncity = int(sim.city_alive[0, 0].long().sum())
    dark_b, gold_b = dark + ncity, dark + ncity + (gold - dark)
    sim.turn = elen - 1
    snap = sim.snapshot()
    # (score, expected age): the four threshold edges
    cases = [(dark_b - 1, 0), (dark_b, 1), (gold_b - 1, 1), (gold_b, 2)]
    for score, exp_age in cases:
        sim.restore(snap)
        sim.turn = elen - 1
        sim.era_score[:] = 0
        sim.era_score[0, 0] = score
        sim.step()
        assert int(sim.turn) % elen == 0, "the step must land on the boundary"
        got = int(sim.civ_age[0, 0])
        assert got == exp_age, f"score {score} must map to age {exp_age} (got {got})"
        # The window RESETS at the boundary, and NO flat payout follows it:
        # dedications pay era score off EVENTS (dedicationEvent) or a golden
        # standing bonus — never per turn. The fresh window must read 0.
        assert int(sim.era_score[0, 0]) == 0, (
            f"fresh window must be empty, got {int(sim.era_score[0, 0])}"
        )
        # the drift's memory ticks with the age just entered
        assert int(sim.dark_ages[0, 0]) == (1 if exp_age == 0 else 0)
        assert int(sim.golden_ages[0, 0]) == (1 if exp_age == 2 else 0)
    print(f"  b boundary OK (bars {dark_b}/{gold_b} over {ncity} cities: "
          f"{dark_b-1}→Dark, {dark_b}→Normal, {gold_b-1}→Normal, {gold_b}→Golden; window reset)")


def poke_age_pressure(rules, path):
    """c. Seat-0 loyalty pressure scales each SOURCE seat's contribution by its
    age factor — EXACT reconstruction across five (seat 0, r0, r1) age combos.
    (1,0,0)/(1,2,2) isolate the FOREIGN source factor ½/1½; (0,1,1)/(2,1,1) the
    OWN factor — every term is a multiple of ½ (exact f64)."""
    sim, cols = two_city_setup(rules, path)
    tier = torch.zeros(sim.B, sim.RC, dtype=torch.long)
    snap = sim.snapshot()
    combos = [(1, 1, 1), (0, 1, 1), (2, 1, 1), (1, 0, 0), (1, 2, 2)]
    for combo in combos:
        sim.restore(snap)
        for i in range(sim.n_majors):
            sim.civ_age[0, i] = combo[i] if i < len(combo) else 1
        exp = {c: recon_seat0_next(sim, c, 0, False) for c in range(sim.RC) if bool(sim.city_alive[0, 0, c])}
        apply_loyalty_row(sim, tier)
        for c in exp:
            got = float(sim.city_loyalty[0, 0, c])
            assert q(exp[c]) == q(got), f"age {combo} city {c}: recon {exp[c]:.5f} != engine {got:.5f}"
    print(f"  c age pressure OK (factors {sim._age_factor.tolist()} reconstructed exactly across {len(combos)} age combos)")


def _grant_titles(sim, row: int, n: int) -> None:
    """Research the first `n` of the thirteen civics that each grant a title."""
    sim.civ_civics[0, row, :] = False
    keep = sim._gov_title_civics[sim._gov_title_civics >= 0].tolist()
    for c in keep[:n]:
        sim.civ_civics[0, row, c] = True


def poke_governor_civ(rules, path):
    """d(civ). Two title civics appoint two governors, which seat the two
    LOWEST-loyalty cities via _seat_phase; a boundary TIE resolves to the lower
    slot index. Two-run diff (2 titles vs 0) isolates the +GOVERNOR_LOYALTY
    from the (identical) pressure."""
    sim = build(rules, path)
    sim.major_unit_alive[:] = False
    r = 0
    slots = sim.city_alive[0, r + 1].nonzero(as_tuple=True)[0].tolist()
    cap = next(s for s in slots if bool(sim.city_is_cap[0, r + 1, s]))
    noncap = [s for s in slots if not bool(sim.city_is_cap[0, r + 1, s])]
    # ensure ≥3 non-caps so a rank-1 tie has a discriminating loser
    nb = [int(x) for x in sim.neigh[int(sim.city_center[0, r + 1, cap])].tolist() if x >= 0]
    ni = 0
    while len(noncap) < 3:
        s = int((~sim.city_alive[0, r + 1]).nonzero(as_tuple=True)[0][0])
        sim.city_alive[0, r + 1, s] = True
        sim.city_is_cap[0, r + 1, s] = False
        sim.city_center[0, r + 1, s] = nb[ni]
        sim.city_pop[0, r + 1, s] = 3
        sim.city_id[0, r + 1, s] = int(sim.civ_next_city_id[0, r + 1]); sim.civ_next_city_id[0, r + 1] += 1
        noncap.append(s); ni += 1
    noncap = sorted(noncap)[:3]
    gov = sim._gov_loy
    sim.city_loyalty[0, r + 1, cap] = 90.0
    sim.city_loyalty[0, r + 1, noncap[0]] = 20.0          # rank 0 (distinct)
    sim.city_loyalty[0, r + 1, noncap[1]] = 30.0          # rank 1 — tie…
    sim.city_loyalty[0, r + 1, noncap[2]] = 30.0          # …with rank 2 (loses on slot index)
    snap = sim.snapshot()

    def run(nc):
        sim.restore(snap)
        _grant_titles(sim, r + 1, nc)
        titles = int(sim._governor_titles_earned(r + 1)[0])
        sim._seat_phase()
        return titles, {s: float(sim.city_loyalty[0, r + 1, s]) for s in [cap] + noncap}

    t0, l0 = run(0)
    t2, l2 = run(2)  # two title civics → two appointments
    assert t0 == 0 and t2 == 2, f"titles must be 0 and 2 (got {t0}, {t2})"
    diff = {s: l2[s] - l0[s] for s in [cap] + noncap}
    got8 = sorted(s for s in noncap if abs(diff[s] - gov) < 1e-9)
    assert got8 == sorted([noncap[0], noncap[1]]), f"the two LOWEST (tie→slot {noncap[1]}) must get +{gov} (got {got8})"
    assert abs(diff[noncap[2]]) < 1e-9, "the tie's higher-slot loser gets nothing"
    assert abs(diff[cap]) < 1e-9, "the capital moves 0 (pinned)"
    print(f"  d governor civ OK (titles 2 → slots {got8} +{gov}; rank-1 tie broke to lower slot {noncap[1]})")


def poke_governor_seat0(rules, path):
    """d(seat 0). One title civic appoints one governor, who seats the single
    LOWEST-loyalty non-capital row-0 city; two-run diff (1 title vs 0) isolates
    the +GOVERNOR_LOYALTY."""
    sim, cols = two_city_setup(rules, path)  # loyalties 55, 59; capital 100
    tier = torch.zeros(sim.B, sim.RC, dtype=torch.long)
    gov = sim._gov_loy
    weakest = min(cols, key=lambda c: (q(float(sim.city_loyalty[0, 0, c])), c))  # ties by array position = column
    _grant_titles(sim, 0, 1)
    snap = sim.snapshot()
    sim._governor_phase(0, sim.civ_alive[:, 0] & sim.city_alive[:, 0].any(dim=1))
    apply_loyalty_row(sim, tier)
    with_gov = {c: float(sim.city_loyalty[0, 0, c]) for c in range(sim.RC) if bool(sim.city_alive[0, 0, c])}
    sim.restore(snap)
    _grant_titles(sim, 0, 0)
    sim._governor_phase(0, sim.civ_alive[:, 0] & sim.city_alive[:, 0].any(dim=1))
    apply_loyalty_row(sim, tier)
    no_gov = {c: float(sim.city_loyalty[0, 0, c]) for c in with_gov}
    for c in with_gov:
        d = with_gov[c] - no_gov[c]
        if c == weakest:
            assert abs(d - gov) < 1e-9, f"the weakest city {c} must gain +{gov} (got {d})"
        else:
            assert abs(d) < 1e-9, f"city {c} must not move (got {d})"
    print(f"  d governor seat 0 OK (titles 1 → weakest col {weakest} +{gov}; others unchanged)")


def poke_seat0_golden(rules, path):
    """e. era_score[0] ≥ goldenT across a boundary flips SEAT 0 to Golden (the
    axis the scripted gate never reaches — seat 0 caps below goldenT there),
    and its OWN-pressure term then scales ×1.5 vs Normal."""
    sim = build(rules, path)
    sim.major_unit_alive[:] = False
    elen, gold = sim._era_len, sim._era_gold
    gold_b = gold + int(sim.city_alive[0, 0].long().sum())  # the per-seat bar
    sim.turn = elen - 1
    snap0 = sim.snapshot()
    sim.era_score[:] = 0
    sim.era_score[0, 0] = gold_b - 1
    sim.step()
    assert int(sim.civ_age[0, 0]) == 1, "goldenT-1 keeps seat 0 Normal"
    sim.restore(snap0)
    sim.turn = elen - 1
    sim.era_score[:] = 0
    sim.era_score[0, 0] = gold_b
    sim.step()
    assert int(sim.civ_age[0, 0]) == 2, "goldenT flips seat 0 to Golden (the gate-unreachable axis)"

    # own-pressure ×1.5: reconstruct the seat-0 loyalty at Normal vs Golden and
    # confirm the engine matches Golden exactly (own term × af[2]=1.5).
    sim2, cols = two_city_setup(rules, path)
    tier = torch.zeros(sim2.B, sim2.RC, dtype=torch.long)
    snap = sim2.snapshot()
    sim2.civ_age[0, 0] = 1
    exp_norm = {c: recon_seat0_next(sim2, c, 0, False) for c in cols}
    apply_loyalty_row(sim2, tier)
    got_norm = {c: float(sim2.city_loyalty[0, 0, c]) for c in cols}
    sim2.restore(snap)
    sim2.civ_age[0, 0] = 2  # seat 0 Golden
    exp_gold = {c: recon_seat0_next(sim2, c, 0, False) for c in cols}
    apply_loyalty_row(sim2, tier)
    got_gold = {c: float(sim2.city_loyalty[0, 0, c]) for c in cols}
    af = sim2._age_factor.tolist()
    for c in cols:
        assert q(exp_norm[c]) == q(got_norm[c]) and q(exp_gold[c]) == q(got_gold[c]), (
            f"reconstruction must match engine at both ages (city {c})"
        )
        assert q(got_gold[c]) != q(got_norm[c]), f"Golden own-pressure (×{af[2]}) must move city {c} vs Normal"
    print(f"  e seat-0 Golden OK (goldenT {gold} → civ_age[0]=2 reachable; own-pressure ×{af[2]} reconstructed exactly)")


def poke_capital_immunity(rules, path):
    """f. A capital that ranks LOWEST (so it IS governor-picked) still pins at
    LOYALTY_MAX — on both seat families (the civ path through _seat_phase,
    seat 0 through the same loyalty bodies driven at row 0)."""
    lmax = float(rules.seats.get("loyaltyMax", 100))
    # a civ capital
    sim = build(rules, path)
    sim.major_unit_alive[:] = False
    r = 0
    cap = next(s for s in sim.city_alive[0, r + 1].nonzero(as_tuple=True)[0].tolist() if bool(sim.city_is_cap[0, r + 1, s]))
    sim.city_loyalty[0, r + 1, cap] = 5.0                 # lowest → would be picked
    _grant_titles(sim, r + 1, 1)
    sim._seat_phase()
    assert float(sim.city_loyalty[0, r + 1, cap]) == lmax, f"a governor-picked civ capital must pin at {lmax}"

    # the seat-0 capital
    sim2 = build(rules, path)
    sim2.major_unit_alive[:] = False
    pcap = int(sim2.city_is_cap[0, 0].nonzero()[0])
    sim2.city_loyalty[0, 0, pcap] = 5.0
    _grant_titles(sim2, 0, 1)
    sim2._governor_phase(0, sim2.civ_alive[:, 0] & sim2.city_alive[:, 0].any(dim=1))
    tier = torch.zeros(sim2.B, sim2.RC, dtype=torch.long)
    apply_loyalty_row(sim2, tier)
    assert float(sim2.city_loyalty[0, 0, pcap]) == lmax, f"a governor-picked seat-0 capital must pin at {lmax}"
    print(f"  f capital immunity OK (governor-picked capitals pin at {lmax}, both engines)")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"governors_test on {path.name}")

    poke_event_hooks(rules, path)
    poke_boundary(rules, path)
    poke_age_pressure(rules, path)
    poke_governor_civ(rules, path)
    poke_governor_seat0(rules, path)
    poke_seat0_golden(rules, path)
    poke_capital_immunity(rules, path)
    print("GOVERNORS POKES OK")


if __name__ == "__main__":
    main()
