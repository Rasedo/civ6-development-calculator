"""Geopolitics self-test — the gate-UNREACHABLE per-pair war surfaces the
scripted rollout touches only organically (denounce gating, FORMAL-vs-SURPRISE
stamping, the anti-thrash guards, war-weariness accrual, seat-to-seat city
transfer hygiene).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python gpu/geopolitics_test.py

Every poke builds a BatchSim from a fixture, forces the state in-memory, then
drives the EXACT engine surface: drive._geo_turn decides (the ported scans) and
the arms _geo_denounce_and_ally / _geo_declare_wars / _geo_make_peace
re-validate and execute; plus _seat_phase and _transfer_rc_to_rc. Thresholds
come from rules.json (never hardcoded).

Covered:
  a. Substrate: civ_pair_war/civ_pair_warkind symmetric with a false diagonal; all three
     pair tensors (incl. the directed civ_pair_denounced) survive snapshot/restore
     (_MUTABLE coverage).
  b. Denounce: strictly-stronger + in-proximity + not-at-war stamps the turn;
     the weaker side never stamps back; a grudge is set ONCE (no re-stamp); an
     at-war pair does not stamp.
  c. DoW kind: a stamp >= formalWarMinTurns old makes the war FORMAL; a younger
     stamp or no stamp is SURPRISE; civ_pair_war writes are symmetric.
  d. Anti-thrash: a target past peaceWw is never declared on (the same-turn
     sue-out thrash); a war-weary aggressor (>= dowWwMax) opens no front.
  e. Peace: EITHER side past peaceWw ends the war and clears the FORMAL flag
     both directions; the denouncement grudge SURVIVES the peace.
  f. Weariness through the real _seat_phase accrual: a declared but UNFOUGHT
     war accrues nothing and decays at the at-war rate, full peace decays four
     times faster, the casus belli picks an era COLUMN rather than a
     multiplier, and every seat axis behaves identically.
  g. _transfer_rc_to_rc: source slot dies with full registry hygiene, receiver
     appends at the END of the alive pool, the tile registry re-keys to the
     receiver's fresh rc id, _eff_version bumps, and
     _check_rc_registry_invariant stays green.
  h. Dtype: a float32 build steps 30 turns with the pair tensors live (bool/
     bool/long are dtype-stable by construction; the walk must not crash).

NOT poked: the seat-0-first target tie-break lives inside the war-act planes the
rollout replay exercises in-gate; the one-new-war-per-seat-per-turn `used` set
in drive._geo_turn needs R >= 3 (fixtures carry R = 2).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
import drive


# Each poke decides with the ported scans, then runs ONLY the arm under test:
# the unwanted intents are dropped so a forced-state case stays isolated.
def geo_denounce(sim) -> None:
    drive.geo_decide_and_apply(sim)
    sim._driven_geo_war = None
    sim._driven_geo_peace = None
    sim._geo_denounce_and_ally()


def geo_declare(sim) -> None:
    drive.geo_decide_and_apply(sim)
    sim._driven_denounce = None
    sim._driven_ally = None
    sim._driven_geo_peace = None
    sim._geo_declare_wars()


def geo_peace(sim) -> None:
    drive.geo_decide_and_apply(sim)
    sim._driven_denounce = None
    sim._driven_ally = None
    sim._driven_geo_war = None
    sim._geo_make_peace()


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def clear_pairs(sim):
    """Wipe every pair-war artifact so a poke starts from a clean matrix."""
    sim.civ_pair_war[:] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.civ_pair_warkind[:] = False
    sim.civ_pair_denounced[:] = -1
    sim.ww[:] = 0
    sim.civ_only_atwar[:] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose


def keep_capital_only(sim, r) -> int:
    """Reduce civ seat r to its FIRST alive slot (strength = 8, one center).
    Returns that slot. Alive-masked readers everywhere make the bare civ_city_alive
    flip safe."""
    slots = sim.civ_city_alive[0, r].nonzero(as_tuple=True)[0].tolist()
    assert slots, f"civ {r} has no alive city at the poke turn"
    for s in slots[1:]:
        sim.civ_city_alive[0, r, s] = False
    return slots[0]


def controlled_pair(rules, path, extra_for_a: bool = True):
    """A sim where civ seats 0 and 1 are unit-less, capital-only (strength
    8 v 8) — plus, when extra_for_a, a spare city for civ seat 0 ADJACENT to
    civ seat 1's capital (16 v 8: si > sj AND si > sj*1.3, proximity 1)."""
    sim = build(rules, path)
    assert sim.R >= 2, "fixtures must carry two civs"
    sim.civ_unit_alive[:] = False  # strengths reduce to nCities*8 exactly
    ja = keep_capital_only(sim, 0)
    jb = keep_capital_only(sim, 1)
    if extra_for_a:
        ctr_b = int(sim.civ_city_center[0, 1, jb])
        nb = [int(x) for x in sim.neigh[ctr_b].tolist() if x >= 0]
        assert nb, "civ 1's capital has no on-map neighbour"
        spare = (~sim.civ_city_alive[0, 0]).nonzero(as_tuple=True)[0]
        assert len(spare), "no free rc slot for the spare city"
        s = int(spare[0])
        sim.civ_city_alive[0, 0, s] = True
        sim.civ_city_center[0, 0, s] = nb[0]
    clear_pairs(sim)
    return sim, ja, jb


# ------------------------------------------------------------------ pokes -----
def poke_substrate(rules, path):
    """a. Pair-matrix shape/symmetry + _MUTABLE snapshot/restore coverage."""
    sim = build(rules, path)
    R = sim.R
    assert sim.civ_pair_war.dtype == torch.bool and sim.civ_pair_warkind.dtype == torch.bool
    assert sim.civ_pair_denounced.dtype == torch.long
    diag = torch.arange(R)
    assert not bool(sim.civ_pair_war[0, diag, diag].any()), "civ_pair_war diagonal must stay false"
    assert bool((sim.civ_pair_war[0, :R, :R] == sim.civ_pair_war[0, :R, :R].T).all()), "organic civ_pair_war must be symmetric"
    assert bool((sim.civ_pair_warkind[0, :R, :R] == sim.civ_pair_warkind[0, :R, :R].T).all()), "organic civ_pair_warkind must be symmetric"

    snap = sim.snapshot()
    w0, k0, d0 = sim.civ_pair_war.clone(), sim.civ_pair_warkind.clone(), sim.civ_pair_denounced.clone()
    sim.civ_pair_war[:] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.civ_pair_warkind[:] = True
    sim.civ_pair_denounced[:] = 7
    sim.restore(snap)
    assert bool((sim.civ_pair_war == w0).all()) and bool((sim.civ_pair_warkind == k0).all()) and bool((sim.civ_pair_denounced == d0).all()), (
        "pair tensors must round-trip snapshot/restore (_MUTABLE)"
    )
    print("  a substrate OK (bool/bool/long, false diagonal, symmetric, snapshot-covered)")


def poke_denounce(rules, path):
    """b. The denounce arm: stronger-and-near stamps once, directed."""
    sim, _, _ = controlled_pair(rules, path)
    t = int(sim.turn)
    geo_denounce(sim)
    assert int(sim.civ_pair_denounced[0, 0, 1]) == t, "stronger civ 0 must stamp its grudge with the current turn"
    assert int(sim.civ_pair_denounced[0, 1, 0]) == -1, "the strictly-weaker side must never stamp back"

    sim.civ_pair_denounced[0, 0, 1] = 3  # grudge persistence: set once, never re-stamped
    geo_denounce(sim)
    assert int(sim.civ_pair_denounced[0, 0, 1]) == 3, "an existing grudge must not be re-stamped"

    sim.civ_pair_denounced[0, 0, 1] = -1
    sim.civ_pair_war[0, 0, 1] = sim.civ_pair_war[0, 1, 0] = True  # at-war pairs skip
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    geo_denounce(sim)
    assert int(sim.civ_pair_denounced[0, 0, 1]) == -1, "an at-war pair must not denounce"
    print("  b denounce OK (turn-stamped, directed, once, war-gated)")


def poke_dow_kind(rules, path):
    """c. DoW FORMAL iff the aggressor's stamp is >= formalWarMinTurns old."""
    sim, _, _ = controlled_pair(rules, path)
    fmin = int(sim.rules.seats.get("formalWarMinTurns", 5))
    t = int(sim.turn)

    sim.civ_pair_denounced[0, 0, 1] = t - fmin  # exactly at the bar -> FORMAL
    geo_declare(sim)
    assert bool(sim.civ_pair_war[0, 0, 1]) and bool(sim.civ_pair_war[0, 1, 0]), "DoW must write civ_pair_war symmetrically"
    assert bool(sim.civ_pair_warkind[0, 0, 1]) and bool(sim.civ_pair_warkind[0, 1, 0]), "an old-grudge war must be FORMAL"

    clear_pairs(sim)
    sim.civ_pair_denounced[0, 0, 1] = t - (fmin - 1)  # one turn too fresh -> SURPRISE
    geo_declare(sim)
    assert bool(sim.civ_pair_war[0, 0, 1]) and not bool(sim.civ_pair_warkind[0, 0, 1]), "a fresh-grudge war must be SURPRISE"

    clear_pairs(sim)  # no grudge at all -> SURPRISE
    geo_declare(sim)
    assert bool(sim.civ_pair_war[0, 0, 1]) and not bool(sim.civ_pair_warkind[0, 0, 1]), "a no-grudge war must be SURPRISE"
    print(f"  c DoW kind OK (FORMAL at stamp age >= {fmin}, else SURPRISE; symmetric writes)")


def poke_anti_thrash(rules, path):
    """d. The two DoW guards: weary target, weary aggressor."""
    sim, _, _ = controlled_pair(rules, path)
    peace_ww = int(sim.rules.seats.get("peaceWw", 10))
    ww_max = int(sim.rules.seats.get("dowWwMax", 6))

    sim.ww[0, 2, 1] = peace_ww + 1  # target would sue out the same turn
    geo_declare(sim)
    assert not bool(sim.civ_pair_war[0, 0, 1]), "a target past peaceWw must never be declared on (same-turn thrash)"

    clear_pairs(sim)
    sim.ww[0, 1, 2] = ww_max  # war-weary aggressor opens no front
    geo_declare(sim)
    assert not bool(sim.civ_pair_war[0, 0, 1]), "an aggressor at dowWwMax must not declare"
    print(f"  d anti-thrash OK (target ww > {peace_ww} skipped; aggressor ww >= {ww_max} inert)")


def poke_peace(rules, path):
    """e. Peace on EITHER side's weariness; kind clears, grudge survives."""
    sim, _, _ = controlled_pair(rules, path)
    peace_ww = int(sim.rules.seats.get("peaceWw", 10))
    sim.civ_pair_war[0, 0, 1] = sim.civ_pair_war[0, 1, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.civ_pair_warkind[0, 0, 1] = sim.civ_pair_warkind[0, 1, 0] = True
    sim.civ_pair_denounced[0, 0, 1] = 2

    sim.ww[0, 1, 2] = peace_ww  # at the bar, not past -> war persists
    geo_peace(sim)
    assert bool(sim.civ_pair_war[0, 0, 1]), "peace must not fire AT the threshold (strictly greater)"

    sim.ww[0, 1, 2] = peace_ww + 1
    geo_peace(sim)
    assert not bool(sim.civ_pair_war[0, 0, 1]) and not bool(sim.civ_pair_war[0, 1, 0]), "peace must clear civ_pair_war both directions"
    assert not bool(sim.civ_pair_warkind[0, 0, 1]) and not bool(sim.civ_pair_warkind[0, 1, 0]), "the ended war's FORMAL flag must clear"
    assert int(sim.civ_pair_denounced[0, 0, 1]) == 2, "the denouncement grudge must SURVIVE the peace"
    print(f"  e peace OK (fires past ww {peace_ww}, either side; kind cleared, grudge kept)")


def poke_ww_differential(rules, path):
    """f. War-weariness accrual through the REAL _seat_phase: weariness is
    PER-BATTLE and seat-independent — SURPRISE, FORMAL and every seat axis
    accrue IDENTICALLY. The casus belli selects an era COLUMN, never a
    multiplier (no Civ 6 ruleset carries a weariness multiplier for it; the only
    surprise/formal number in shipped data is WarmongerPercent 150 vs 100, a
    GRIEVANCE column)."""
    sim, _, _ = controlled_pair(rules, path, extra_for_a=False)  # 8 v 8: no organic DoW/denounce
    rww = sim.rules.war_weariness
    at_war = int(rww["decayAtWar"])
    at_peace = int(rww["decayAtPeace"])

    # a war DECLARED is not a war FOUGHT: under the per-battle model a fresh war
    # with no battle in it costs both sides NOTHING.
    sim.civ_pair_war[0, 0, 1] = sim.civ_pair_war[0, 1, 0] = True  # SURPRISE (kind False)
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    snap = sim.snapshot()
    sim._seat_phase()
    assert int(sim._ww_max(1)[0]) == 0 and int(sim._ww_max(2)[0]) == 0, (
        f"a declared but UNFOUGHT war accrued weariness "
        f"({int(sim._ww_max(1)[0])}/{int(sim._ww_max(2)[0])})"
    )

    # ...and it DECAYS while it sits there, at the at-war rate.
    sim.restore(snap)
    sim.ww[0, 1, 2] = at_war + 7
    sim._seat_phase()
    assert int(sim.ww[0, 1, 2]) == 7, (
        f"a war nobody fought must shed {at_war} (got {int(sim.ww[0, 1, 2])})"
    )

    # FORMAL vs SURPRISE picks the era COLUMN, not a multiplier; at Ancient the
    # two columns are equal (16 = 16).
    sim.restore(snap)
    sim.civ_pair_warkind[0, 0, 1] = sim.civ_pair_warkind[0, 1, 0] = True  # FORMAL
    formal = int(sim._ww_era_base(torch.tensor([1]), torch.tensor([2]))[0])
    sim.restore(snap)
    surprise = int(sim._ww_era_base(torch.tensor([1]), torch.tensor([2]))[0])
    assert formal == int(rww["eraFormal"][0]) and surprise == int(rww["eraSurprise"][0]), (
        f"the casus belli must pick the COLUMN (formal {formal} / surprise {surprise})"
    )

    # full peace drains four times faster than a phoney war
    sim.restore(snap)
    sim.civ_pair_war[0, 0, 1] = sim.civ_pair_war[0, 1, 0] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.ww[0, 1, 2] = at_peace + 3
    sim._seat_phase()
    assert int(sim.ww[0, 1, 2]) == 3, f"full peace must shed {at_peace}"

    # the seat-0 war axis behaves identically — weariness is not seat-dependent
    sim.restore(snap)
    sim.civ_pair_war[0, 0, 1] = sim.civ_pair_war[0, 1, 0] = False
    sim.civ_only_atwar[0, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.ww[0, 1, 0] = at_war + 11
    sim._seat_phase()
    assert int(sim.ww[0, 1, 0]) == 11, (
        "the seat-0 war axis decays at the same rate as a civ<->civ war — "
        "weariness is not seat-dependent (#51/S7.8r, S7.8f)"
    )

    print(f"  f ww PER-BATTLE OK (declared-but-unfought = 0, decay -{at_war} at war / -{at_peace} at peace)")


def poke_transfer(rules, path):
    """g. _transfer_rc_to_rc: loser hygiene, POOL-END append, tile re-key,
    _eff_version bump, _check_rc_registry_invariant green."""
    sim = build(rules, path)
    civ_only_from = next(r for r in range(sim.R) if bool(sim.civ_city_alive[0, r].any()))
    civ_only_to = next(r for r in range(sim.R) if r != civ_only_from)
    j = int(sim.civ_city_alive[0, civ_only_from].nonzero(as_tuple=True)[0][0])
    c_t = int(sim.civ_city_center[0, civ_only_from, j])
    id_from = int(sim.civ_city_id[0, civ_only_from, j])
    id_next = int(sim.civ_only_next_city_id[0, civ_only_to])
    own = (sim.tile_city[0] == id_from) & (sim.civ_at[0] == civ_only_from)
    n_own = int(own.sum())
    occ = sim.civ_city_alive[0, civ_only_to].nonzero(as_tuple=True)[0]
    exp_slot = int(occ.max()) + 1 if len(occ) else 0
    ev0 = sim._eff_version

    sim._transfer_rc_to_rc(0, civ_only_from, j, civ_only_to)

    assert not bool(sim.civ_city_alive[0, civ_only_from, j]), "the loser slot must die"
    assert int(sim.civ_city_bldg[0, civ_only_from, j].sum()) == 0 and int(sim.civ_city_current[0, civ_only_from, j]) == -1, (
        "loser-slot hygiene: buildings/queue wiped"
    )
    assert bool((sim.civ_city_dist_tile[0, civ_only_from, j] == -1).all()), "loser-slot hygiene: district registry wiped"
    assert bool(sim.civ_city_alive[0, civ_only_to, exp_slot]), "the receiver must append at the END of the alive pool"
    assert int(sim.civ_city_center[0, civ_only_to, exp_slot]) == c_t and not bool(sim.civ_city_is_cap[0, civ_only_to, exp_slot])
    assert int(sim.civ_city_id[0, civ_only_to, exp_slot]) == id_next and int(sim.civ_only_next_city_id[0, civ_only_to]) == id_next + 1
    assert int(sim.civ_city_at[0, c_t]) == civ_only_to, "the center tile must re-seat to the receiver"
    rekeyed = (sim.tile_city[0] == id_next) & (sim.civ_at[0] == civ_only_to)
    assert int(rekeyed.sum()) == n_own, (
        f"A-17: exactly the flipping city's {n_own} tiles must re-key to the receiver ({int(rekeyed.sum())})"
    )
    # the transfer bumps once for itself, and AGAIN when the city that left was
    # the losing seat's capital and the Palace relocates to its highest-
    # population survivor. Both are real yield-bearing changes, so assert the
    # bump happened and stayed within those two known writes.
    _bumped = sim._eff_version - ev0
    _relocated = bool(sim.civ_city_is_cap[0, civ_only_from].any())
    assert 1 <= _bumped <= 2, f"the transfer must bump _eff_version (got {_bumped})"
    assert _bumped == (2 if _relocated else 1), (
        f"expected {'transfer + palace relocation' if _relocated else 'transfer only'}, got {_bumped} bumps"
    )
    sim._check_rc_registry_invariant()  # raises on any registry drift
    print(f"  g transfer OK (slot {j} r{civ_only_from} -> pool-end slot {exp_slot} r{civ_only_to}, {n_own} tiles re-keyed, registry green)")


def poke_float32(rules, path):
    """h. A float32 build steps 30 turns with the pair machinery live."""
    sim = build(rules, path, steps=30, dtype=torch.float32)
    assert sim.civ_pair_war.dtype == torch.bool and sim.civ_pair_warkind.dtype == torch.bool and sim.civ_pair_denounced.dtype == torch.long
    print("  h float32 dtype OK (30 turns, pair tensors dtype-stable, no walk crash)")



def _round_trips(name: str, mut) -> bool:
    """A per-seat field round-trips through snapshot/restore either by NAME or
    as a view of its merged `civ_*` base (`diplo_favor` is
    `civ_diplo_favor[:, 0]`), so accept either spelling — the property under
    test is the round-trip, not the storage layout."""
    if name in mut:
        return True
    base = name[2:] if name.startswith("r_") else name
    return f"civ_{base}" in mut

def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
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


    # --- seat 0's grievance twin ---------------------------------------------
    from core.engine import _MUTABLE as _MUT2
    # `warmonger` and `civ_only_warmonger` are the two halves of ONE
    # `civ_warmonger [B, 1+R]` plane, so the BASE is what carries the state
    # through a snapshot. Registering a view beside its base would restore into
    # fresh storage and orphan the other half.
    assert "civ_warmonger" in _MUT2, "civ_warmonger must be registered in _MUTABLE"
    assert "warmonger" not in _MUT2, "warmonger is a VIEW of civ_warmonger"
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert s3.warmonger.shape == (1,), s3.warmonger.shape
    assert s3.warmonger.data_ptr() == s3.civ_warmonger.data_ptr(), (
        "warmonger must share storage with civ_warmonger[:, 0]"
    )
    # snapshot/restore round-trip
    s3.warmonger[:] = 7
    _snap = s3.snapshot()
    s3.warmonger[:] = 0
    s3.restore(_snap)
    assert int(s3.warmonger[0]) == 7, "warmonger must survive snapshot/restore"
    # decay only at peace on EVERY axis, floored at 0
    s3.civ_only_atwar[:] = False
    s3.sync_war()  # a poke writes one cell; close the war matrix under transpose
    s3.warmonger[:] = 2
    s3.step()
    assert int(s3.warmonger[0]) <= 1, "grievances must decay at peace"
    s3.warmonger[:] = 0
    s3.step()
    assert int(s3.warmonger[0]) == 0, "decay floors at zero"
    print("seat-0 grievances OK — _MUTABLE, decay, floor")

    # --- DIPLOMATIC FAVOR ----------------------------------------------------
    for _f in ("diplo_favor", "civ_only_diplo_favor"):
        assert _round_trips(_f, _MUT2), f"{_f} must round-trip through _MUTABLE"
    s4 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert s4._favor_per_suz == 1, f"GS pays 1 favor per suzerainty, got {s4._favor_per_suz}"
    # the suzerain tests: >= suzerainEnvoys AND strictly more than every civ seat
    suz_min = int(s4.rules.citystate.get("suzerainEnvoys", 3))
    s4.citystate_envoys.zero_(); s4.civ_only_citystate_envoys.zero_()
    assert int(s4._suzerain_count(0)[0]) == 0, "no envoys -> no suzerainties"
    s4.citystate_envoys[:, 0] = suz_min - 1
    assert int(s4._suzerain_count(0)[0]) == 0, "below the envoy minimum is not suzerainty"
    s4.citystate_envoys[:, 0] = suz_min
    assert int(s4._suzerain_count(0)[0]) == 1, "at the minimum with no civ contest -> suzerain"
    if s4.R > 0:
        s4.civ_only_citystate_envoys[:, 0, 0] = suz_min  # a TIE leaves no suzerain (real Civ 6)
        assert int(s4._suzerain_count(0)[0]) == 0, "a tie must leave NO suzerain"
        s4.civ_only_citystate_envoys[:, 0, 0] = suz_min + 1
        assert int(s4._suzerain_count(1)[0]) == 1, "the strictly-higher civ is suzerain"
        assert int(s4._suzerain_count(0)[0]) == 0, "... and seat 0 is not"
    # the accrual itself: tier + suzerainties, and it is CUMULATIVE
    s5 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    f0 = int(s5.diplo_favor[0])
    s5.step()
    f1 = int(s5.diplo_favor[0])
    assert f1 >= f0, "favor never decreases"
    exp = int(s5._adopted_gov_tier(s5.civics)[0]) + s5._favor_per_suz * int(s5._suzerain_count(0)[0])
    s5.step()
    assert int(s5.diplo_favor[0]) - f1 == exp, (
        f"favor step must be tier+suzerainties ({exp}), got {int(s5.diplo_favor[0]) - f1}"
    )
    print("diplomatic favor OK — suzerain contest, tie rule, tier+suz accrual, _MUTABLE")

    # --- the WORLD CONGRESS + the DIPLOMATIC victory -------------------------
    for _f in ("congress_sessions", "diplo_points", "civ_only_diplo_points"):
        assert _round_trips(_f, _MUT2), f"{_f} must round-trip through _MUTABLE"
    s6 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert s6._congress_interval == 30, f"GS convenes every 30 turns, got {s6._congress_interval}"
    assert s6._congress_min_era == 2, f"GS starts at the MEDIEVAL era (index 2), got {s6._congress_min_era}"
    assert s6._dvp_win == 20, f"GS diplomatic victory is 20 points, got {s6._dvp_win}"

    # not a session turn -> nothing happens, favor untouched
    s6.diplo_favor[:] = 50
    s6.turn = s6._congress_interval + 1
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 0 and int(s6.diplo_favor[0]) == 50, "off-interval turns must do nothing"

    # a session turn but nobody is Medieval -> still nothing
    s6.turn = s6._congress_interval
    s6.techs.zero_(); s6.civ_only_techs.zero_(); s6.civics.zero_(); s6.civ_only_civics.zero_()
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 0, "pre-Medieval sessions must not convene"
    assert int(s6.diplo_favor[0]) == 50, "... and must not spend favor"

    # force Medieval via a tech whose era clears the bar, then run one session
    _era_ok = None
    for _t in range(s6.techs.shape[1]):
        s6.techs.zero_(); s6.techs[:, _t] = True
        if int(s6._civ_era(s6.techs, s6.civics)[0]) >= s6._congress_min_era:
            _era_ok = _t
            break
    assert _era_ok is not None, "no tech reaches the Medieval era — check the era table"
    if s6.R > 0:
        s6.civ_only_diplo_favor[:, 0] = 90  # the civ seat outspends seat 0, 90 vs 50
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 1, "the session must convene"
    assert int(s6.diplo_favor[0]) == 0, "every commitment is spent"
    if s6.R > 0:
        assert int(s6.civ_only_diplo_favor[0, 0]) == 0, "the winner's favor is spent too"
        assert int(s6.civ_only_diplo_points[0, 0]) == s6._dvp_per_res, "the largest commitment takes the point"
        assert int(s6.diplo_points[0]) == 0, "the loser takes nothing"

    # a TIE keeps the LOWER seat id (seat 0)
    s7 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    s7.turn = s7._congress_interval
    s7.techs.zero_(); s7.techs[:, _era_ok] = True
    s7.diplo_favor[:] = 25
    if s7.R > 0:
        s7.civ_only_diplo_favor[:, 0] = 25
    s7._world_congress()
    assert int(s7.diplo_points[0]) == s7._dvp_per_res, "a tie must go to the lower civ id"
    if s7.R > 0:
        assert int(s7.civ_only_diplo_points[0, 0]) == 0

    # zero favor everywhere: the session counts but awards nothing
    s8 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    s8.turn = s8._congress_interval
    s8.techs.zero_(); s8.techs[:, _era_ok] = True
    s8.diplo_favor.zero_(); s8.civ_only_diplo_favor.zero_()
    s8._world_congress()
    assert int(s8.congress_sessions[0]) == 1 and int(s8.diplo_points[0]) == 0, "no favor -> no award"

    # the victory check itself
    s9 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    s9.diplo_points[:] = s9._dvp_win - 1
    assert int(s9._diplomatic_victor()[0]) == -1, "one point short is not a win"
    s9.diplo_points[:] = s9._dvp_win
    assert int(s9._diplomatic_victor()[0]) == 0, "seat 0 wins at the threshold"
    if s9.R > 0:
        s9.diplo_points.zero_()
        s9.civ_only_diplo_points[:, 0] = s9._dvp_win
        assert int(s9._diplomatic_victor()[0]) == 1, "a civ wins at the threshold"
    print("world congress OK — schedule, Medieval gate, vote, tie rule, spend, DVP, victory")



if __name__ == "__main__":
    main()
