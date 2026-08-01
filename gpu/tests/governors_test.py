"""B-24 (task #68) governors / era-score self-test — the age/governor loyalty
surfaces the 24×250 scripted rollout only reaches organically (the player
never accrues to GOLDEN_T in-gate, era boundaries land at fixed turns, and the
greedy governor pick + capital immunity ride inside the loyalty loops).

    npm run gpu:export                     # (once) writes gpu/fixtures/  (S3 catalog)
    $env:PYTHONUTF8='1'; python gpu/governors_test.py

Every poke builds a BatchSim from a fixture, forces state in-memory, then
drives the EXACT engine twin (_transfer_rc_to_rc, the step-tail era boundary,
_apply_loyalty_and_flips, _rival_phase) and asserts TS-mirroring behaviour.
EVERY constant is derived from rules.json via the engine's own loaders
(sim._era_len/_era_dark/_era_gold/_era_pts/_gov_per/_gov_max/_gov_loy/
_age_factor) — nothing is hardcoded.

Covered:
  a. Event hooks: _transfer_rc_to_rc bumps the RECEIVER's era_score by the
     conquer const (and nobody else's); _era_pts is exactly rules.json.eras.
     found/wonder/pantheon/religion/gp share the identical `+= const` shape at
     their own sites (proven in-gate: rollout 72/72 + the S1 logdiff over 750
     live fields) and their score→age arithmetic is covered by poke b.
  b. Boundary math: at a turn that crosses a multiple of eras.length each civ's
     new-era Age comes from the just-ended window's score — darkT-1→Dark,
     darkT→Normal, goldenT-1→Normal, goldenT→Golden — then era_score resets 0.
  c. Age pressure: the player loyalty twin's pressure scales every SOURCE
     civ's contribution by its age factor (Dark ½ / Normal 1 / Golden 1½);
     asserted by an EXACT reconstruction across five (player, rival, rival)
     age combos (quantized-milli).
  d. Governor pick: titles = min(govMax, civics//perTitle) sit in the LOWEST-
     loyalty alive cities (+GOVERNOR_LOYALTY), ties → lower slot index. Rival
     path via _rival_phase two-run diff (a boundary tie resolves to the lower
     slot); player path via _apply_loyalty_and_flips two-run diff.
  e. Player-Golden reachability: forcing era_score[0] ≥ goldenT across a
     boundary flips the player to Golden (the axis the scripted gate never
     reaches) — then the player's OWN-pressure term scales ×1.5 vs Normal.
  f. Capital immunity: a capital that ranks lowest (so it IS governor-picked)
     still pins at LOYALTY_MAX, both engines' seats.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def q(x: float) -> int:
    """js_round to milli — the engine's quantized-loyalty rank key (B-29)."""
    return math.floor(x * 1000 + 0.5)


def add_player_city(sim, col: int, tile: int, pop: int, loy: float, seq: int) -> None:
    sim.alive[0, col] = True
    sim.is_cap[0, col] = False
    sim.site[0, col] = tile
    sim.pop[0, col] = pop
    sim.loyalty[0, col] = loy
    sim.city_seq[0, col] = seq


def recon_player_next(sim, c: int, tier_idx_c: int, picked: bool) -> float:
    """Closed-form applyLoyalty for player city c: every source contribution
    scaled by its civ's age factor, then pressure + amenity + governor, clamped.
    Matches _apply_loyalty_and_flips when pop_before == pop (pop_mix == pop)."""
    rng = int(sim.rules.rivals.get("loyaltyRange", 9))
    scale = float(sim.rules.rivals.get("loyaltyScale", 20))
    af = sim._age_factor.tolist()
    sc = int(sim.site[0, c])
    own = 0.0
    for cp in range(sim.C):
        if not bool(sim.alive[0, cp]):
            continue
        w = max(0.0, rng + 1 - float(sim.pair_dist[sc, int(sim.site[0, cp])]))
        own += float(sim.pop[0, cp]) * w
    own_eff = own * af[int(sim.civ_age[0, 0])]
    for_eff = 0.0
    for r in range(sim.R):
        sub = 0.0
        for j in range(sim.RC):
            if not bool(sim.rc_alive[0, r, j]):
                continue
            w = max(0.0, rng + 1 - float(sim.pair_dist[sc, int(sim.rc_center[0, r, j])]))
            sub += float(sim.rc_pop[0, r, j]) * w
        for_eff += sub * af[int(sim.civ_age[0, r + 1])]
    tot = own_eff + for_eff
    press = scale * (own_eff - for_eff) / tot if tot > 0 else 0.0
    amen = float(sim._loyalty_amenity[tier_idx_c])
    gov = sim._gov_loy if picked else 0.0
    if bool(sim.is_cap[0, c]):
        return 100.0
    return max(0.0, min(100.0, float(sim.loyalty[0, c]) + press + amen + gov))


def two_player_setup(rules, path):
    """A capital + two forced non-capital player cities on the capital's
    neighbours, civics wiped (titles 0). Returns (sim, [non-cap cols])."""
    sim = build(rules, path)
    sim.v_alive[:] = False
    cap = int(sim.is_cap[0].nonzero()[0])
    nb = [int(x) for x in sim.neigh[int(sim.site[0, cap])].tolist() if x >= 0]
    free = (~sim.alive[0]).nonzero(as_tuple=True)[0].tolist()
    cols = free[:2]
    add_player_city(sim, cols[0], nb[0], 4, 55.0, 10)
    add_player_city(sim, cols[1], nb[1], 4, 59.0, 11)
    # #51/S4.1r: GUARANTEE FOREIGN PRESSURE. Loyalty pressure is a RATIO —
    # `scale * (own - foreign) / (own + foreign)` — so with foreign == 0 it is
    # `own/own` and the SOURCE-civ age factor CANCELS ALGEBRAICALLY. The lane's
    # Golden x1.5 assertion then cannot fire, whatever the starting loyalty.
    # It used to hold only because the fixture happened to park a rival city in
    # range; a fixture change silently removed that and the lane went from
    # proving the multiplier to proving nothing. Plant one instead of hoping.
    if sim.R > 0:
        cap_tile = int(sim.site[0, cap])
        near = next(
            (t for t in range(sim.T)
             if 1 <= int(sim.pair_dist[cap_tile, t]) <= 3 and bool(sim.passable[0, t])),
            -1,
        )
        assert near >= 0, "no tile in loyalty range of the capital to plant a rival city on"
        sim.rc_alive[0, 0, 0] = True
        sim.rc_center[0, 0, 0] = near
        sim.rc_pop[0, 0, 0] = 6
    sim.civics[:] = False
    return sim, cols


# ------------------------------------------------------------------ pokes -----
def poke_event_hooks(rules, path):
    """a. _transfer_rc_to_rc bumps ONLY the receiver's era_score by conquer;
    _era_pts is exactly rules.json.eras (found/wonder/pantheon/religion/gp are
    the same shape at their own sites — in-gate + S1-logdiff proven)."""
    er = rules.eras
    sim = build(rules, path)
    for k, d in (("found", 2), ("conquer", 3), ("wonder", 3), ("pantheon", 1), ("religion", 2), ("gp", 1)):
        assert sim._era_pts[k] == int(er.get(k, d)), f"_era_pts[{k}] must mirror rules.json"

    conquer = sim._era_pts["conquer"]
    r_from = next(r for r in range(sim.R) if bool(sim.rc_alive[0, r].any()))
    r_to = next(r for r in range(sim.R) if r != r_from)
    j = int(sim.rc_alive[0, r_from].nonzero(as_tuple=True)[0][0])
    before = sim.era_score[0].clone()
    sim._transfer_rc_to_rc(0, r_from, j, r_to)
    delta = (sim.era_score[0] - before).tolist()
    exp = [0] * (1 + sim.R)
    exp[r_to + 1] = conquer
    assert delta == exp, f"conquer must accrue +{conquer} to the receiver only (got {delta})"
    print(f"  a event hooks OK (_era_pts == rules.eras; rc→rc transfer += {conquer} to receiver civ {r_to + 1} only)")


def poke_boundary(rules, path):
    """b. Age assignment at the darkT/goldenT edges + the window reset. Tested
    on civ 0 (the player never accrues in a unit-less single step — verified:
    the era_score set right before the boundary is exactly what it reads)."""
    sim = build(rules, path)
    sim.v_alive[:] = False
    dark, gold, elen = sim._era_dark, sim._era_gold, sim._era_len
    sim.turn = elen - 1
    snap = sim.snapshot()
    # (score, expected age): the four threshold edges
    cases = [(dark - 1, 0), (dark, 1), (gold - 1, 1), (gold, 2)]
    for score, exp_age in cases:
        sim.restore(snap)
        sim.turn = elen - 1
        sim.era_score[:] = 0
        sim.era_score[0, 0] = score
        sim.step()
        assert int(sim.turn) % elen == 0, "the step must land on the boundary"
        got = int(sim.civ_age[0, 0])
        assert got == exp_age, f"score {score} must map to age {exp_age} (got {got})"
        # #71 FLAG 2 (DEDICATION_PAYOUTS_LIVE): the window still RESETS at the
        # boundary, but the dedication payout runs IMMEDIATELY after it (the TS
        # endTurn order: eraBoundary -> applyDedications), so a DARK or NORMAL
        # civ has already banked one turn of climb-out score into the FRESH
        # window. A GOLDEN civ is paid in faith instead and stays at 0.
        want_es = 0 if exp_age == 2 else sim._ded_era * int(sim.dedications[0, 0])
        assert int(sim.era_score[0, 0]) == want_es, (
            f"fresh window must hold exactly this turn's dedication payout "
            f"({want_es}), got {int(sim.era_score[0, 0])}"
        )
    print(f"  b boundary OK (darkT {dark}, goldenT {gold}: {dark-1}→Dark, {dark}→Normal, {gold-1}→Normal, {gold}→Golden; window reset)")


def poke_age_pressure(rules, path):
    """c. Player loyalty pressure scales each SOURCE civ's contribution by its
    age factor — EXACT reconstruction across five (player, r0, r1) age combos.
    (1,0,0)/(1,2,2) isolate the RIVAL source factor ½/1½; (0,1,1)/(2,1,1) the
    PLAYER own factor — every term is a multiple of ½ (exact f64)."""
    sim, cols = two_player_setup(rules, path)
    tier = torch.zeros(sim.B, sim.C, dtype=torch.long)
    pop_before = sim.pop.clone()
    snap = sim.snapshot()
    combos = [(1, 1, 1), (0, 1, 1), (2, 1, 1), (1, 0, 0), (1, 2, 2)]
    for combo in combos:
        sim.restore(snap)
        for i in range(1 + sim.R):
            sim.civ_age[0, i] = combo[i] if i < len(combo) else 1
        exp = {c: recon_player_next(sim, c, 0, False) for c in range(sim.C) if bool(sim.alive[0, c])}
        sim._apply_loyalty_and_flips(tier, pop_before)
        for c in exp:
            got = float(sim.loyalty[0, c])
            assert q(exp[c]) == q(got), f"age {combo} city {c}: recon {exp[c]:.5f} != engine {got:.5f}"
    print(f"  c age pressure OK (factors {sim._age_factor.tolist()} reconstructed exactly across {len(combos)} age combos)")


def poke_governor_rival(rules, path):
    """d(rival). titles=2 seat the two LOWEST-loyalty cities via _rival_phase;
    a boundary TIE resolves to the lower slot index. Two-run diff (titles 2 vs
    0) isolates the +GOVERNOR_LOYALTY from the (identical) pressure."""
    sim = build(rules, path)
    sim.v_alive[:] = False
    r = 0
    slots = sim.rc_alive[0, r].nonzero(as_tuple=True)[0].tolist()
    cap = next(s for s in slots if bool(sim.rc_is_cap[0, r, s]))
    noncap = [s for s in slots if not bool(sim.rc_is_cap[0, r, s])]
    # ensure ≥3 non-caps so a rank-1 tie has a discriminating loser
    nb = [int(x) for x in sim.neigh[int(sim.rc_center[0, r, cap])].tolist() if x >= 0]
    ni = 0
    while len(noncap) < 3:
        s = int((~sim.rc_alive[0, r]).nonzero(as_tuple=True)[0][0])
        sim.rc_alive[0, r, s] = True
        sim.rc_is_cap[0, r, s] = False
        sim.rc_center[0, r, s] = nb[ni]
        sim.rc_pop[0, r, s] = 3
        sim.rc_id[0, r, s] = int(sim.r_next_city_id[0, r]); sim.r_next_city_id[0, r] += 1
        noncap.append(s); ni += 1
    noncap = sorted(noncap)[:3]
    gov = sim._gov_loy
    sim.rc_loyalty[0, r, cap] = 90.0
    sim.rc_loyalty[0, r, noncap[0]] = 20.0          # rank 0 (distinct)
    sim.rc_loyalty[0, r, noncap[1]] = 30.0          # rank 1 — tie…
    sim.rc_loyalty[0, r, noncap[2]] = 30.0          # …with rank 2 (loses on slot index)
    snap = sim.snapshot()

    def run(nc):
        sim.restore(snap)
        sim.r_civics[0, r, :] = False
        if nc:
            sim.r_civics[0, r, :nc] = True
        titles = int((sim.r_civics[0, r].sum() // sim._gov_per).clamp(max=sim._gov_max))
        sim._rival_phase()
        return titles, {s: float(sim.rc_loyalty[0, r, s]) for s in [cap] + noncap}

    t0, l0 = run(0)
    t2, l2 = run(2 * sim._gov_per)  # civics → titles 2
    assert t0 == 0 and t2 == 2, f"titles must be 0 and 2 (got {t0}, {t2})"
    diff = {s: l2[s] - l0[s] for s in [cap] + noncap}
    got8 = sorted(s for s in noncap if abs(diff[s] - gov) < 1e-9)
    assert got8 == sorted([noncap[0], noncap[1]]), f"the two LOWEST (tie→slot {noncap[1]}) must get +{gov} (got {got8})"
    assert abs(diff[noncap[2]]) < 1e-9, "the tie's higher-slot loser gets nothing"
    assert abs(diff[cap]) < 1e-9, "the capital moves 0 (pinned)"
    print(f"  d governor rival OK (titles 2 → slots {got8} +{gov}; rank-1 tie broke to lower slot {noncap[1]})")


def poke_governor_player(rules, path):
    """d(player). titles=1 seats the single LOWEST-loyalty non-capital player
    city; two-run diff (titles 1 vs 0) isolates the +GOVERNOR_LOYALTY."""
    sim, cols = two_player_setup(rules, path)  # loyalties 55, 59; capital 100
    tier = torch.zeros(sim.B, sim.C, dtype=torch.long)
    pop_before = sim.pop.clone()
    gov = sim._gov_loy
    weakest = min(cols, key=lambda c: (q(float(sim.loyalty[0, c])), int(sim.city_seq[0, c])))
    sim.civics[0, : sim._gov_per] = True  # titles 1
    snap = sim.snapshot()
    sim._apply_loyalty_and_flips(tier, pop_before)
    with_gov = {c: float(sim.loyalty[0, c]) for c in range(sim.C) if bool(sim.alive[0, c])}
    sim.restore(snap)
    sim.civics[:] = False  # titles 0
    sim._apply_loyalty_and_flips(tier, pop_before)
    no_gov = {c: float(sim.loyalty[0, c]) for c in with_gov}
    for c in with_gov:
        d = with_gov[c] - no_gov[c]
        if c == weakest:
            assert abs(d - gov) < 1e-9, f"the weakest city {c} must gain +{gov} (got {d})"
        else:
            assert abs(d) < 1e-9, f"city {c} must not move (got {d})"
    print(f"  d governor player OK (titles 1 → weakest col {weakest} +{gov}; others unchanged)")


def poke_player_golden(rules, path):
    """e. era_score[0] ≥ goldenT across a boundary flips the PLAYER to Golden
    (the axis the scripted 24×250 gate never reaches — the passive player caps
    below goldenT), and its OWN-pressure term then scales ×1.5 vs Normal."""
    sim = build(rules, path)
    sim.v_alive[:] = False
    elen, gold = sim._era_len, sim._era_gold
    sim.turn = elen - 1
    snap0 = sim.snapshot()
    sim.era_score[:] = 0
    sim.era_score[0, 0] = gold - 1
    sim.step()
    assert int(sim.civ_age[0, 0]) == 1, "goldenT-1 keeps the player Normal"
    sim.restore(snap0)
    sim.turn = elen - 1
    sim.era_score[:] = 0
    sim.era_score[0, 0] = gold
    sim.step()
    assert int(sim.civ_age[0, 0]) == 2, "goldenT flips the player to Golden (the gate-unreachable axis)"

    # own-pressure ×1.5: reconstruct the player loyalty at Normal vs Golden and
    # confirm the engine matches Golden exactly (own term × af[2]=1.5).
    sim2, cols = two_player_setup(rules, path)
    tier = torch.zeros(sim2.B, sim2.C, dtype=torch.long)
    pop_before = sim2.pop.clone()
    snap = sim2.snapshot()
    sim2.civ_age[0, 0] = 1
    exp_norm = {c: recon_player_next(sim2, c, 0, False) for c in cols}
    sim2._apply_loyalty_and_flips(tier, pop_before)
    got_norm = {c: float(sim2.loyalty[0, c]) for c in cols}
    sim2.restore(snap)
    sim2.civ_age[0, 0] = 2  # player Golden
    exp_gold = {c: recon_player_next(sim2, c, 0, False) for c in cols}
    sim2._apply_loyalty_and_flips(tier, pop_before)
    got_gold = {c: float(sim2.loyalty[0, c]) for c in cols}
    af = sim2._age_factor.tolist()
    for c in cols:
        assert q(exp_norm[c]) == q(got_norm[c]) and q(exp_gold[c]) == q(got_gold[c]), (
            f"reconstruction must match engine at both ages (city {c})"
        )
        assert q(got_gold[c]) != q(got_norm[c]), f"Golden own-pressure (×{af[2]}) must move city {c} vs Normal"
    print(f"  e player-Golden OK (goldenT {gold} → civ_age[0]=2 reachable; own-pressure ×{af[2]} reconstructed exactly)")


def poke_capital_immunity(rules, path):
    """f. A capital that ranks LOWEST (so it IS governor-picked) still pins at
    LOYALTY_MAX — both engines' seats (rival _rival_phase + player twin)."""
    lmax = float(rules.rivals.get("loyaltyMax", 100))
    # rival capital
    sim = build(rules, path)
    sim.v_alive[:] = False
    r = 0
    cap = next(s for s in sim.rc_alive[0, r].nonzero(as_tuple=True)[0].tolist() if bool(sim.rc_is_cap[0, r, s]))
    sim.rc_loyalty[0, r, cap] = 5.0                 # lowest → would be picked
    sim.r_civics[0, r, : sim._gov_per] = True       # titles 1
    sim._rival_phase()
    assert float(sim.rc_loyalty[0, r, cap]) == lmax, f"a governor-picked rival capital must pin at {lmax}"

    # player capital
    sim2 = build(rules, path)
    sim2.v_alive[:] = False
    pcap = int(sim2.is_cap[0].nonzero()[0])
    sim2.loyalty[0, pcap] = 5.0
    sim2.civics[0, : sim2._gov_per] = True
    tier = torch.zeros(sim2.B, sim2.C, dtype=torch.long)
    sim2._apply_loyalty_and_flips(tier, sim2.pop.clone())
    assert float(sim2.loyalty[0, pcap]) == lmax, f"a governor-picked player capital must pin at {lmax}"
    print(f"  f capital immunity OK (governor-picked capitals pin at {lmax}, both engines)")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"governors_test on {path.name}")

    poke_event_hooks(rules, path)
    poke_boundary(rules, path)
    poke_age_pressure(rules, path)
    poke_governor_rival(rules, path)
    poke_governor_player(rules, path)
    poke_player_golden(rules, path)
    poke_capital_immunity(rules, path)
    print("GOVERNORS (B-24) POKES OK")


if __name__ == "__main__":
    main()
