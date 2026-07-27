"""#55 (A-19/B-33/B-22) geopolitics self-test — the gate-UNREACHABLE per-pair
war surfaces the 24x250 scripted rollout touches only organically (denounce
gating, FORMAL-vs-SURPRISE stamping, the anti-thrash guards, the casus-belli
war-weariness differential, rival->rival city transfer hygiene).

    npm run gpu:export        # (once) writes gpu/fixtures/  (S3 catalog)
    $env:PYTHONUTF8='1'; python gpu/geopolitics_test.py

Every poke builds a BatchSim from a fixture, forces the state in-memory, then
drives the EXACT engine twin (_rival_rival_denounce, _rival_rival_declare_wars,
_rival_rival_make_peace, _rival_phase, _transfer_rc_to_rc) and asserts
TS-mirroring behaviour. Thresholds come from rules.json (never hardcoded).

Covered:
  a. Substrate: rr_war/rr_warkind symmetric with a false diagonal; all three
     pair tensors (incl. the directed rr_denounced) survive snapshot/restore
     (_MUTABLE coverage).
  b. Denounce: strictly-stronger + in-proximity + not-at-war stamps the turn;
     the weaker side never stamps back; a grudge is set ONCE (no re-stamp); an
     at-war pair does not stamp.
  c. DoW kind: a stamp >= rrFormalMinTurns old makes the war FORMAL; a younger
     stamp or no stamp is SURPRISE; rr_war writes are symmetric.
  d. Anti-thrash: a target past rrPeaceWw is never declared on (the same-turn
     sue-out thrash); a war-weary aggressor (>= rrDowWwMax) opens no front.
  e. Peace: EITHER side past rrPeaceWw ends the war and clears the FORMAL flag
     both directions; the denouncement grudge SURVIVES the peace.
  f. Weariness differential (the real _rival_phase accrual): SURPRISE war
     +perTurn*surpriseMult/turn, FORMAL +perTurn*formalMult, full peace decays,
     the PLAYER-war axis stays at the x1 baseline, the cap clamps.
  g. _transfer_rc_to_rc: source slot dies with full registry hygiene, receiver
     appends at the END of the alive pool, the A-17 tile registry re-keys to
     the receiver's fresh rc id, _eff_version bumps, and the A-24 registry
     invariant scan stays green.
  h. Dtype: a float32 build steps 30 turns with the pair tensors live (bool/
     bool/long are dtype-stable by construction; the walk must not crash).

NOT poked (documented): the S2 player-first target tie-break lives inside the
war-act planes the rollout replay exercises in-gate (72/72); the one-new-war-
per-civ-per-turn `used` set needs R >= 3 (fixtures carry R = 2).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def clear_pairs(sim):
    """Wipe every pair-war artifact so a poke starts from a clean matrix."""
    sim.rr_war[:] = False
    sim.rr_warkind[:] = False
    sim.rr_denounced[:] = -1
    sim.r_war_weariness[:] = 0
    sim.r_atwar[:] = False


def keep_capital_only(sim, r) -> int:
    """Reduce rival r to its FIRST alive slot (strength = 8, one center).
    Returns that slot. Alive-masked readers everywhere make the bare
    rc_alive flip safe (the S5 'never trust a hole' rule)."""
    slots = sim.rc_alive[0, r].nonzero(as_tuple=True)[0].tolist()
    assert slots, f"rival {r} has no alive city at the poke turn"
    for s in slots[1:]:
        sim.rc_alive[0, r, s] = False
    return slots[0]


def controlled_pair(rules, path, extra_for_a: bool = True):
    """A sim where rival 0 and rival 1 are unit-less, capital-only (strength
    8 v 8) — plus, when extra_for_a, a spare city for rival 0 ADJACENT to
    rival 1's capital (16 v 8: si > sj AND si > sj*1.3, proximity 1)."""
    sim = build(rules, path)
    assert sim.R >= 2, "fixtures must carry two rivals"
    sim.v_alive[:] = False  # strengths reduce to nCities*8 exactly
    ja = keep_capital_only(sim, 0)
    jb = keep_capital_only(sim, 1)
    if extra_for_a:
        ctr_b = int(sim.rc_center[0, 1, jb])
        nb = [int(x) for x in sim.neigh[ctr_b].tolist() if x >= 0]
        assert nb, "rival 1's capital has no on-map neighbour"
        spare = (~sim.rc_alive[0, 0]).nonzero(as_tuple=True)[0]
        assert len(spare), "no free rc slot for the spare city"
        s = int(spare[0])
        sim.rc_alive[0, 0, s] = True
        sim.rc_center[0, 0, s] = nb[0]
    clear_pairs(sim)
    return sim, ja, jb


# ------------------------------------------------------------------ pokes -----
def poke_substrate(rules, path):
    """a. Pair-matrix shape/symmetry + _MUTABLE snapshot/restore coverage."""
    sim = build(rules, path)
    R = sim.R
    assert sim.rr_war.dtype == torch.bool and sim.rr_warkind.dtype == torch.bool
    assert sim.rr_denounced.dtype == torch.long
    diag = torch.arange(R)
    assert not bool(sim.rr_war[0, diag, diag].any()), "rr_war diagonal must stay false"
    assert bool((sim.rr_war[0, :R, :R] == sim.rr_war[0, :R, :R].T).all()), "organic rr_war must be symmetric"
    assert bool((sim.rr_warkind[0, :R, :R] == sim.rr_warkind[0, :R, :R].T).all()), "organic rr_warkind must be symmetric"

    snap = sim.snapshot()
    w0, k0, d0 = sim.rr_war.clone(), sim.rr_warkind.clone(), sim.rr_denounced.clone()
    sim.rr_war[:] = True
    sim.rr_warkind[:] = True
    sim.rr_denounced[:] = 7
    sim.restore(snap)
    assert bool((sim.rr_war == w0).all()) and bool((sim.rr_warkind == k0).all()) and bool((sim.rr_denounced == d0).all()), (
        "pair tensors must round-trip snapshot/restore (_MUTABLE)"
    )
    print("  a substrate OK (bool/bool/long, false diagonal, symmetric, snapshot-covered)")


def poke_denounce(rules, path):
    """b. The denounce pass: stronger-and-near stamps once, directed."""
    sim, _, _ = controlled_pair(rules, path)
    t = int(sim.turn)
    sim._rival_rival_denounce()
    assert int(sim.rr_denounced[0, 0, 1]) == t, "stronger rival 0 must stamp its grudge with the current turn"
    assert int(sim.rr_denounced[0, 1, 0]) == -1, "the strictly-weaker side must never stamp back"

    sim.rr_denounced[0, 0, 1] = 3  # grudge persistence: set once, never re-stamped
    sim._rival_rival_denounce()
    assert int(sim.rr_denounced[0, 0, 1]) == 3, "an existing grudge must not be re-stamped"

    sim.rr_denounced[0, 0, 1] = -1
    sim.rr_war[0, 0, 1] = sim.rr_war[0, 1, 0] = True  # at-war pairs skip
    sim._rival_rival_denounce()
    assert int(sim.rr_denounced[0, 0, 1]) == -1, "an at-war pair must not denounce"
    print("  b denounce OK (turn-stamped, directed, once, war-gated)")


def poke_dow_kind(rules, path):
    """c. DoW FORMAL iff the aggressor's stamp is >= rrFormalMinTurns old."""
    sim, _, _ = controlled_pair(rules, path)
    fmin = int(sim.rules.rivals.get("rrFormalMinTurns", 5))
    t = int(sim.turn)

    sim.rr_denounced[0, 0, 1] = t - fmin  # exactly at the bar -> FORMAL
    sim._rival_rival_declare_wars()
    assert bool(sim.rr_war[0, 0, 1]) and bool(sim.rr_war[0, 1, 0]), "DoW must write rr_war symmetrically"
    assert bool(sim.rr_warkind[0, 0, 1]) and bool(sim.rr_warkind[0, 1, 0]), "an old-grudge war must be FORMAL"

    clear_pairs(sim)
    sim.rr_denounced[0, 0, 1] = t - (fmin - 1)  # one turn too fresh -> SURPRISE
    sim._rival_rival_declare_wars()
    assert bool(sim.rr_war[0, 0, 1]) and not bool(sim.rr_warkind[0, 0, 1]), "a fresh-grudge war must be SURPRISE"

    clear_pairs(sim)  # no grudge at all -> SURPRISE
    sim._rival_rival_declare_wars()
    assert bool(sim.rr_war[0, 0, 1]) and not bool(sim.rr_warkind[0, 0, 1]), "a no-grudge war must be SURPRISE"
    print(f"  c DoW kind OK (FORMAL at stamp age >= {fmin}, else SURPRISE; symmetric writes)")


def poke_anti_thrash(rules, path):
    """d. The two DoW guards: weary target, weary aggressor."""
    sim, _, _ = controlled_pair(rules, path)
    peace_ww = int(sim.rules.rivals.get("rrPeaceWw", 10))
    ww_max = int(sim.rules.rivals.get("rrDowWwMax", 6))

    sim.r_war_weariness[0, 1] = peace_ww + 1  # target would sue out the same turn
    sim._rival_rival_declare_wars()
    assert not bool(sim.rr_war[0, 0, 1]), "a target past rrPeaceWw must never be declared on (same-turn thrash)"

    clear_pairs(sim)
    sim.r_war_weariness[0, 0] = ww_max  # war-weary aggressor opens no front
    sim._rival_rival_declare_wars()
    assert not bool(sim.rr_war[0, 0, 1]), "an aggressor at rrDowWwMax must not declare"
    print(f"  d anti-thrash OK (target ww > {peace_ww} skipped; aggressor ww >= {ww_max} inert)")


def poke_peace(rules, path):
    """e. Peace on EITHER side's weariness; kind clears, grudge survives."""
    sim, _, _ = controlled_pair(rules, path)
    peace_ww = int(sim.rules.rivals.get("rrPeaceWw", 10))
    sim.rr_war[0, 0, 1] = sim.rr_war[0, 1, 0] = True
    sim.rr_warkind[0, 0, 1] = sim.rr_warkind[0, 1, 0] = True
    sim.rr_denounced[0, 0, 1] = 2

    sim.r_war_weariness[0, 0] = peace_ww  # at the bar, not past -> war persists
    sim._rival_rival_make_peace()
    assert bool(sim.rr_war[0, 0, 1]), "peace must not fire AT the threshold (strictly greater)"

    sim.r_war_weariness[0, 0] = peace_ww + 1
    sim._rival_rival_make_peace()
    assert not bool(sim.rr_war[0, 0, 1]) and not bool(sim.rr_war[0, 1, 0]), "peace must clear rr_war both directions"
    assert not bool(sim.rr_warkind[0, 0, 1]) and not bool(sim.rr_warkind[0, 1, 0]), "the ended war's FORMAL flag must clear"
    assert int(sim.rr_denounced[0, 0, 1]) == 2, "the denouncement grudge must SURVIVE the peace"
    print(f"  e peace OK (fires past ww {peace_ww}, either side; kind cleared, grudge kept)")


def poke_ww_differential(rules, path):
    """f. The casus-belli accrual through the REAL _rival_phase: SURPRISE
    x surpriseMult, FORMAL x formalMult, peace decays, player axis x1, cap."""
    sim, _, _ = controlled_pair(rules, path, extra_for_a=False)  # 8 v 8: no organic DoW/denounce
    rww = sim.rules.war_weariness
    per = int(rww.get("perTurn", 1))
    s_mult, f_mult = int(rww.get("surpriseMult", 2)), int(rww.get("formalMult", 1))
    decay, cap = int(rww.get("decay", 4)), int(rww.get("cap", 16))

    sim.rr_war[0, 0, 1] = sim.rr_war[0, 1, 0] = True  # SURPRISE (kind False)
    snap = sim.snapshot()
    sim._rival_phase()
    assert int(sim.r_war_weariness[0, 0]) == per * s_mult and int(sim.r_war_weariness[0, 1]) == per * s_mult, (
        f"a SURPRISE war must accrue {per * s_mult}/turn (got {int(sim.r_war_weariness[0, 0])}/{int(sim.r_war_weariness[0, 1])})"
    )

    sim.restore(snap)
    sim.rr_warkind[0, 0, 1] = sim.rr_warkind[0, 1, 0] = True  # FORMAL
    sim._rival_phase()
    assert int(sim.r_war_weariness[0, 0]) == per * f_mult, f"a FORMAL war must accrue {per * f_mult}/turn"

    sim.restore(snap)
    sim.rr_war[0, 0, 1] = sim.rr_war[0, 1, 0] = False  # full peace decays
    sim.r_war_weariness[0, 0] = decay + 1
    sim._rival_phase()
    assert int(sim.r_war_weariness[0, 0]) == 1, f"full peace must decay ww by {decay}"

    sim.restore(snap)
    sim.rr_war[0, 0, 1] = sim.rr_war[0, 1, 0] = False  # PLAYER war: the pristine x1 axis
    sim.r_atwar[0, 0] = True
    sim._rival_phase()
    assert int(sim.r_war_weariness[0, 0]) == per * f_mult, "the player-war axis must stay at the x1 baseline"

    sim.restore(snap)  # SURPRISE at the cap clamps
    sim.r_war_weariness[0, 0] = cap - 1
    sim._rival_phase()
    assert int(sim.r_war_weariness[0, 0]) == cap, f"accrual must clamp at the cap {cap}"
    print(f"  f ww differential OK (surprise +{per * s_mult}, formal +{per * f_mult}, decay -{decay}, player x1, cap {cap})")


def poke_transfer(rules, path):
    """g. _transfer_rc_to_rc: loser hygiene, POOL-END append, A-17 re-key,
    _eff_version bump, A-24 invariant scan green."""
    sim = build(rules, path)
    r_from = next(r for r in range(sim.R) if bool(sim.rc_alive[0, r].any()))
    r_to = next(r for r in range(sim.R) if r != r_from)
    j = int(sim.rc_alive[0, r_from].nonzero(as_tuple=True)[0][0])
    c_t = int(sim.rc_center[0, r_from, j])
    id_from = int(sim.rc_id[0, r_from, j])
    id_next = int(sim.r_next_city_id[0, r_to])
    own = (sim.rc_tile_id[0] == id_from) & (sim.rival_at[0] == r_from)
    n_own = int(own.sum())
    occ = sim.rc_alive[0, r_to].nonzero(as_tuple=True)[0]
    exp_slot = int(occ.max()) + 1 if len(occ) else 0
    ev0 = sim._eff_version

    sim._transfer_rc_to_rc(0, r_from, j, r_to)

    assert not bool(sim.rc_alive[0, r_from, j]), "the loser slot must die"
    assert int(sim.rc_bldg[0, r_from, j].sum()) == 0 and int(sim.rc_current[0, r_from, j]) == -1, (
        "loser-slot hygiene: buildings/queue wiped"
    )
    assert bool((sim.rc_dist_tile[0, r_from, j] == -1).all()), "loser-slot hygiene: district registry wiped"
    assert bool(sim.rc_alive[0, r_to, exp_slot]), "the receiver must append at the END of the alive pool"
    assert int(sim.rc_center[0, r_to, exp_slot]) == c_t and not bool(sim.rc_is_cap[0, r_to, exp_slot])
    assert int(sim.rc_id[0, r_to, exp_slot]) == id_next and int(sim.r_next_city_id[0, r_to]) == id_next + 1
    assert int(sim.rvcity_at[0, c_t]) == r_to, "the center tile must re-seat to the receiver"
    rekeyed = (sim.rc_tile_id[0] == id_next) & (sim.rival_at[0] == r_to)
    assert int(rekeyed.sum()) == n_own, (
        f"A-17: exactly the flipping city's {n_own} tiles must re-key to the receiver ({int(rekeyed.sum())})"
    )
    # #70/S4 (A-9): the transfer bumps once for itself, and AGAIN when the
    # losing civ's capital was the city that just left and the Palace has to
    # relocate to its highest-population survivor. Both are real yield-bearing
    # changes, so the old "exactly once" is too strict — assert the invariant
    # that actually matters (it bumped, and no more than the two known writes).
    _bumped = sim._eff_version - ev0
    _relocated = bool(sim.rc_is_cap[0, r_from].any())
    assert 1 <= _bumped <= 2, f"the transfer must bump _eff_version (got {_bumped})"
    assert _bumped == (2 if _relocated else 1), (
        f"expected {'transfer + palace relocation' if _relocated else 'transfer only'}, got {_bumped} bumps"
    )
    sim._check_rc_registry_invariant()  # A-24: raises on any registry drift
    print(f"  g transfer OK (slot {j} r{r_from} -> pool-end slot {exp_slot} r{r_to}, {n_own} tiles re-keyed, registry green)")


def poke_float32(rules, path):
    """h. A float32 build steps 30 turns with the pair machinery live."""
    sim = build(rules, path, steps=30, dtype=torch.float32)
    assert sim.rr_war.dtype == torch.bool and sim.rr_warkind.dtype == torch.bool and sim.rr_denounced.dtype == torch.long
    print("  h float32 dtype OK (30 turns, pair tensors dtype-stable, no walk crash)")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"geopolitics_test on {path.name}")

    poke_substrate(rules, path)
    poke_denounce(rules, path)
    poke_dow_kind(rules, path)
    poke_anti_thrash(rules, path)
    poke_peace(rules, path)
    poke_ww_differential(rules, path)
    poke_transfer(rules, path)
    poke_float32(rules, path)
    print("GEOPOLITICS (A-19/B-33/B-22) POKES OK")


    # --- B-22 (#74): the PLAYER's grievance twin -----------------------------
    from civ6gpu.engine import _MUTABLE as _MUT2
    assert "p_warmonger" in _MUT2, "p_warmonger must be registered in _MUTABLE"
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert s3.p_warmonger.shape == (1,), s3.p_warmonger.shape
    # snapshot/restore round-trip
    s3.p_warmonger[:] = 7
    _snap = s3.snapshot()
    s3.p_warmonger[:] = 0
    s3.restore(_snap)
    assert int(s3.p_warmonger[0]) == 7, "p_warmonger must survive snapshot/restore"
    # decay only at peace on EVERY axis, floored at 0
    s3.r_atwar[:] = False
    s3.p_warmonger[:] = 2
    s3.step()
    assert int(s3.p_warmonger[0]) <= 1, "grievances must decay at peace"
    s3.p_warmonger[:] = 0
    s3.step()
    assert int(s3.p_warmonger[0]) == 0, "decay floors at zero"
    print("player grievances OK — _MUTABLE, decay, floor")

if __name__ == "__main__":
    main()
