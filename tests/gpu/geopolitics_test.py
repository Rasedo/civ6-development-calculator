"""Geopolitics self-test — the gate-UNREACHABLE per-pair diplomatic surfaces
the scripted rollout touches only organically (the agreement clocks, denounce
gating, FORMAL-vs-SURPRISE stamping, the head's declare/peace gates,
war-weariness accrual, seat-to-seat city transfer hygiene).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python tests/gpu/geopolitics_test.py

Every poke builds a BatchSim from a fixture, forces the state in-memory, then
drives the EXACT engine surface: drive._geo_turn decides the five agreement
scans and `_geo_agreements` re-validates and executes them, while DECLARING
and SUING ride `_apply_war_column` — each seat's own war head, the one entry;
plus _seat_phase and _transfer_city. Thresholds come from rules.json (never
hardcoded).

EVERY PAIR PLANE IS INDEXED BY SEAT ROW, seat 0 included: `seat_denounced`,
`seat_warkind`, `seat_friend_turns`, `seat_ally_turns`,
`seat_borders_turns`, `war` and `war_turns` are all [.., 1+R, 1+R] and row 0
is a row like any other. The pokes below drive the SAME arm for a civ↔civ pair
and for a pair seat 0 is in, and assert the same rules.

Covered:
  a. Substrate: war/seat_warkind symmetric with a false diagonal; every pair
     tensor (incl. the directed seat_denounced and seat_borders_turns)
     survives snapshot/restore (_MUTABLE coverage).
  b. Denounce: strictly-stronger + in-proximity + not-at-war stamps the turn;
     the weaker side never stamps back; a STANDING denouncement is never
     re-stamped and an EXPIRED one may be renewed; an at-war pair does not
     stamp.
  c. DoW kind: a stamp between formalWarMinTurns and agreementTurns old makes
     the war FORMAL; a younger stamp, an expired one or no stamp is SURPRISE;
     war writes are symmetric — for a civ↔civ pair AND for a war seat 0
     declares, through the one applier.
  d. The head's DoW gates: ALLIES and Declared Friends are never declared on,
     an existing war is a no-op (no second grievance, no clock reset), and a
     declaration pays the target its sourced grievance row exactly once.
  i. The agreements themselves: friendship unlocks the alliance and the
     alliance needs its civic, the border grant is DIRECTED and needs the
     grantor's civic, war cancels the grant, an ally is dragged into a
     defensive war, and a Great Work changes hands with its provenance.
  e. Peace: refused below warMinTurns and refused when broke; once priced and
     paid it clears the war both directions, clears the FORMAL flag, zeroes
     BOTH rows' peace clocks and restarts the pair's war clock, while the
     denouncement grudge SURVIVES.
  f. Weariness through the real _seat_phase accrual: a declared but UNFOUGHT
     war accrues nothing and decays at the at-war rate, full peace decays four
     times faster, the casus belli picks an era COLUMN rather than a
     multiplier, and every seat axis behaves identically.
  g. _transfer_city: source slot dies with full registry hygiene, receiver
     appends at the END of the alive pool, the tile registry re-keys to the
     receiver's fresh rc id, _eff_version bumps, and
     _check_rc_registry_invariant stays green.
  h. Dtype: a float32 build steps 30 turns with the pair tensors live (bool/
     bool/long are dtype-stable by construction; the walk must not crash).

NOT poked: the DoW/sue PACING (proximity, strength edge, gang-up, weariness)
is `ladder.pick_war`'s policy, not an engine rule — the head re-validates the
rules only, and that is what these pokes address.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import BARB_SEAT
from warmup import settle_all
import drive


# The agreement pass: the ported scans decide, the engine arm re-validates.
def geo_denounce(sim) -> None:
    drive.geo_decide_and_apply(sim)
    sim._geo_agreements()


# Declaring and suing ride the seat's OWN war head — `war_targets(row)` order,
# column k declares the k-th target and column len(targets)+k sues it. Every
# row has one, seat 0 included, and `_apply_war_column` is the only entry.
def war_column(sim, row: int, tgt: int, sue: bool = False) -> torch.Tensor:
    targets = sim.war_targets(row)
    k = targets.index(tgt)
    col = (len(targets) + k) if sue else k
    return torch.full((sim.B,), col, dtype=torch.long, device=sim.device)


def head_war(sim, row: int, tgt: int, sue: bool = False) -> None:
    sim.seat_ext[:, row] = True  # the head only answers for a wire-driven seat
    sim._apply_war_column(row, war_column(sim, row, tgt, sue=sue))


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype))
    for _ in range(steps):
        sim.step()
    return sim


def clear_pairs(sim):
    """Wipe every pair-war artifact so a poke starts from a clean matrix. ONE
    block over the major rows — row 0's relations live in the same planes as
    every other row's, so there is nothing to clear separately."""
    nrow = sim.n_majors
    sim.war[:, :nrow, :nrow] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.war_turns[:, :nrow, :nrow] = 0
    sim.seat_warkind[:, :nrow, :nrow] = False
    sim.seat_denounced[:, :nrow, :nrow] = -1
    for _p in (sim.seat_friend_turns, sim.seat_ally_turns, sim.seat_borders_turns,
               sim.seat_delegation):
        _p[:, :nrow, :nrow] = 0
    sim.ww[:] = 0


def keep_capital_only(sim, row) -> int:
    """Reduce seat row `row` to its FIRST alive slot (strength = 8, one
    center). Returns that slot. Alive-masked readers everywhere make the bare
    city_alive flip safe."""
    slots = sim.city_alive[0, row].nonzero(as_tuple=True)[0].tolist()
    assert slots, f"seat row {row} has no alive city at the poke turn"
    for s in slots[1:]:
        sim.city_alive[0, row, s] = False
    return slots[0]


def controlled_pair(rules, path, extra_for_a: bool = True):
    """A sim where seat ROWS 1 and 2 are unit-less, capital-only (strength
    8 v 8) — plus, when extra_for_a, a spare city for row 1 ADJACENT to row
    2's capital (16 v 8: si > sj AND si > sj*1.3, proximity 1)."""
    sim = build(rules, path)
    assert sim.n_majors >= 3, "fixtures must carry two civs"
    sim.major_unit_alive[:] = False  # strengths reduce to nCities*8 exactly
    ja = keep_capital_only(sim, 1)
    jb = keep_capital_only(sim, 2)
    if extra_for_a:
        ctr_b = int(sim.city_center[0, 2, jb])
        nb = [int(x) for x in sim.neigh[ctr_b].tolist() if x >= 0]
        assert nb, "row 2's capital has no on-map neighbour"
        spare = (~sim.city_alive[0, 1]).nonzero(as_tuple=True)[0]
        assert len(spare), "no free rc slot for the spare city"
        s = int(spare[0])
        sim.city_alive[0, 1, s] = True
        sim.city_center[0, 1, s] = nb[0]
    clear_pairs(sim)
    return sim, ja, jb


# ------------------------------------------------------------------ pokes -----
def want(sim, row: int, verb: str, target: int, kind: int | None = None):
    """Hand ONE want-mask to the engine arm and let it re-validate. The driver
    decides these; a poke names the pair directly so the RULE is what is under
    test, never the scan that proposed it."""
    if kind is None:
        m = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool, device=sim.device)
        m[:, target] = True
    else:
        m = torch.zeros(sim.B, 3, sim.n_majors, dtype=torch.bool, device=sim.device)
        m[:, kind, target] = True
    sim.apply_geo(row, **{verb: m})
    sim._geo_agreements()


def poke_agreements(rules, path):
    """i. The four AGREEMENTS and the gift, each on its own sourced gate."""
    sim, _, _ = controlled_pair(rules, path)
    term = int(sim._agreement_turns)
    al_c, ob_c = int(sim._alliance_civic), int(sim._open_borders_civic)
    assert al_c >= 0 and ob_c >= 0, "the two agreement civics must export"

    # CIV6: "You can only enter into an Alliance with a civilization if you and
    # its leader are Declared Friends", and the civic comes first either way.
    sim.civ_civics[:, 1, al_c] = True
    want(sim, 1, "ally", 2)
    assert int(sim.seat_ally_turns[0, 1, 2]) == 0, "an alliance needs a Declared Friend"
    want(sim, 1, "friend", 2)
    assert int(sim.seat_friend_turns[0, 1, 2]) == term, "friendship runs the agreement term"
    assert int(sim.seat_friend_turns[0, 2, 1]) == term, "friendship is symmetric"
    sim.civ_civics[:, 1, al_c] = False
    want(sim, 1, "ally", 2)
    assert int(sim.seat_ally_turns[0, 1, 2]) == 0, "an alliance needs the Civil Service civic"
    sim.civ_civics[:, 1, al_c] = True
    want(sim, 1, "ally", 2)
    assert int(sim.seat_ally_turns[0, 1, 2]) == term, "friends with the civic ALLY"
    assert int(sim.seat_ally_turns[0, 2, 1]) == term, "an alliance is symmetric"

    # CIV6: "You cannot denounce Declared Friends or Allies."
    want(sim, 1, "denounce", 2)
    assert int(sim.seat_denounced[0, 1, 2]) == -1, "an ally cannot be denounced"

    # CIV6 (Open Borders): the grant is DIRECTED and needs the grantor's civic.
    clear_pairs(sim)
    want(sim, 1, "borders", 2)
    assert int(sim.seat_borders_turns[0, 1, 2]) == 0, "the grant needs Early Empire"
    sim.civ_civics[:, 1, ob_c] = True
    want(sim, 1, "borders", 2)
    assert int(sim.seat_borders_turns[0, 1, 2]) == term, "the grantor's own civic opens it"
    assert int(sim.seat_borders_turns[0, 2, 1]) == 0, (
        "granting open borders must NOT grant them back"
    )
    # ...and a denouncement in EITHER direction closes the offer.
    clear_pairs(sim)
    sim.seat_denounced[0, 2, 1] = int(sim.turn)
    want(sim, 1, "borders", 2)
    assert int(sim.seat_borders_turns[0, 1, 2]) == 0, "a denouncer is granted nothing"

    # A DECLARED war cancels the grant both ways.
    clear_pairs(sim)
    sim.seat_borders_turns[0, 1, 2] = sim.seat_borders_turns[0, 2, 1] = term
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]), "the declaration must land for the rest of this check"
    assert int(sim.seat_borders_turns[0, 1, 2]) == 0 and int(sim.seat_borders_turns[0, 2, 1]) == 0, (
        "war opens the border the grant was lifting"
    )

    # CIV6 (Defensive Pact): an ally of the VICTIM joins; an ally of the
    # AGGRESSOR does not, and the dragged ally pays no grievance.
    clear_pairs(sim)
    sim.civ_grievance.zero_()
    sim.seat_ally_turns[0, 0, 2] = sim.seat_ally_turns[0, 2, 0] = term
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 0, 1]) and bool(sim.war[0, 1, 0]), (
        "the victim's ally must be dragged into the war"
    )
    assert bool(sim.seat_warkind[0, 0, 1]), "an obligation answered is a FORMAL war"
    assert int(sim._grievances_against(0)[0]) == 0, "the dragged ally earns no grievances"
    clear_pairs(sim)
    sim.civ_grievance.zero_()
    sim.seat_ally_turns[0, 0, 1] = sim.seat_ally_turns[0, 1, 0] = term
    head_war(sim, 1, 2)
    assert not bool(sim.war[0, 0, 2]), "an AGGRESSOR's ally is never dragged in"

    # THE COUNTDOWN, at the pair's lower row's tail: symmetric clocks tick
    # once, the directed grant ticks in both directions.
    clear_pairs(sim)
    sim.seat_friend_turns[0, 1, 2] = sim.seat_friend_turns[0, 2, 1] = 2
    sim.seat_ally_turns[0, 1, 2] = sim.seat_ally_turns[0, 2, 1] = 2
    sim.seat_borders_turns[0, 1, 2] = 2
    sim.seat_borders_turns[0, 2, 1] = 1
    live = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    for r in range(sim.n_majors):
        sim._seat_war_peace_tail(r, live)
    assert int(sim.seat_friend_turns[0, 1, 2]) == 1 and int(sim.seat_friend_turns[0, 2, 1]) == 1
    assert int(sim.seat_ally_turns[0, 1, 2]) == 1 and int(sim.seat_ally_turns[0, 2, 1]) == 1
    assert int(sim.seat_borders_turns[0, 1, 2]) == 1, "the outgoing grant ticks"
    assert int(sim.seat_borders_turns[0, 2, 1]) == 0, "the incoming grant EXPIRES at zero"
    for r in range(sim.n_majors):
        sim._seat_war_peace_tail(r, live)
    assert int(sim.seat_ally_turns[0, 1, 2]) == 0, "an alliance expires by reaching zero"
    assert int(sim.seat_borders_turns[0, 2, 1]) == 0, "an expired clock never goes negative"
    print(f"  i agreements OK (friendship -> alliance, {term}-turn terms, directed grant, "
          "defensive pact, countdown)")


def poke_gift(rules, path):
    """i2. A GREAT WORK changes hands: out of the giver's first holding city,
    into the taker's first with room, provenance and all."""
    sim, _, _ = controlled_pair(rules, path)
    kind, bcol = 1, sim._gw_bidx[1]
    if bcol < 0:
        print("  i2 gift SKIPPED (no ART slot building in the catalog)")
        return
    ja = int(sim.city_alive[0, 1].nonzero(as_tuple=True)[0][0])
    jb = int(sim.city_alive[0, 2].nonzero(as_tuple=True)[0][0])
    sim.city_bldg[0, 1, ja, bcol] = True
    sim.city_bldg[0, 2, jb, bcol] = True
    sim.city_gw_art[0, 1, ja] = 1
    sim.city_gwart_type[0, 1, ja, 0] = 7
    sim.city_gwart_artist[0, 1, ja, 0] = 3

    want(sim, 1, "gift", 2, kind=kind)
    assert int(sim.city_gw_art[0, 1, ja]) == 0, "the giver loses the work"
    assert int(sim.city_gw_art[0, 2, jb]) == 1, "the taker gains it"
    assert int(sim.city_gwart_type[0, 1, ja, 0]) == -1, "the giver's slot empties"
    assert int(sim.city_gwart_artist[0, 1, ja, 0]) == -1, "...artist and all"
    assert int(sim.city_gwart_type[0, 2, jb, 0]) == 7, "the work keeps WHAT it is"
    assert int(sim.city_gwart_artist[0, 2, jb, 0]) == 3, "...and WHO made it"

    # nothing to give, and nowhere to put it, are both refusals
    want(sim, 1, "gift", 2, kind=kind)
    assert int(sim.city_gw_art[0, 2, jb]) == 1, "a seat with no work gives nothing"
    sim.city_gw_art[0, 1, ja] = 1
    sim.city_gw_art[0, 2, jb] = int(sim._gw_slots_k[1])
    want(sim, 1, "gift", 2, kind=kind)
    assert int(sim.city_gw_art[0, 1, ja]) == 1, "a full receiver refuses the gift"
    # CIV6 (Trading): "You can trade with all the leaders except the ones
    # you're at war with."
    sim.city_gw_art[0, 2, jb] = 0
    sim.war[0, 1, 2] = sim.war[0, 2, 1] = True
    sim.sync_war()
    want(sim, 1, "gift", 2, kind=kind)
    assert int(sim.city_gw_art[0, 1, ja]) == 1, "a seat at war gives nothing"
    print("  i2 gift OK (work + provenance move, empty/full/at-war all refuse)")


def poke_closed_border(rules, path):
    """i3. The border itself: `_border_closed` over one foreign tile, every
    lift the source names, and the two unit classes that ignore it."""
    sim = build(rules, path)
    ob_c = int(sim._open_borders_civic)
    term = int(sim._agreement_turns)
    tile = (sim.tile_seat[0] == 2).nonzero(as_tuple=True)[0]
    assert len(tile), "seed row 2 owns no tile at the poke turn"
    t = tile[0].reshape(1, 1)

    def shut(row, utype=None):
        return bool(sim._border_closed(t, row, utype)[0, 0])

    sim.civ_civics[:, 2, ob_c] = False
    assert not shut(1), "ground is open until its owner takes Early Empire"
    sim.civ_civics[:, 2, ob_c] = True
    assert shut(1), "Early Empire closes the owner's ground to a foreign major"
    assert not shut(2), "a seat is never shut out of its own ground"

    sim.seat_borders_turns[0, 2, 1] = term
    assert not shut(1), "the OWNER's grant lets this seat in"
    sim.seat_borders_turns[0, 2, 1] = 0
    sim.seat_borders_turns[0, 1, 2] = term
    assert shut(1), "granting passage the other way lets nobody in"
    sim.seat_borders_turns[0, 1, 2] = 0

    sim.seat_ally_turns[0, 1, 2] = sim.seat_ally_turns[0, 2, 1] = term
    assert not shut(1), "CIV6: allies automatically have Open Borders"
    sim.seat_ally_turns[0, 1, 2] = sim.seat_ally_turns[0, 2, 1] = 0

    sim.war[0, 1, 2] = sim.war[0, 2, 1] = True
    sim.sync_war()
    assert not shut(1), "war opens what the civic closed"
    sim.war[0, 1, 2] = sim.war[0, 2, 1] = False
    sim.sync_war()
    assert shut(1), "and peace closes it again"

    # CIV6 (Movement): "Traders ignore borders" / "Religious units also ignore
    # borders". Everything else is bound.
    ut = torch.full((1, 1), sim._trader_idx, dtype=torch.long, device=sim.device)
    assert not shut(1, ut), "a Trader ignores borders"
    rel = (sim._rel_strength > 0).nonzero(as_tuple=True)[0]
    assert len(rel), "the roster must carry a religious unit"
    assert not shut(1, torch.full((1, 1), int(rel[0]), dtype=torch.long, device=sim.device)), (
        "a religious unit ignores borders"
    )
    war_idx = int((sim._type_combat > 0).nonzero(as_tuple=True)[0][0])
    assert shut(1, torch.full((1, 1), war_idx, dtype=torch.long, device=sim.device)), (
        "a military unit is bound by the border"
    )

    # A CITY-STATE's ground never closes, and a barbarian is never bound.
    if sim.S > 0:
        cs_tile = (sim.tile_seat[0] >= 100).nonzero(as_tuple=True)[0]
        if len(cs_tile):
            assert not bool(sim._border_closed(cs_tile[0].reshape(1, 1), 1)[0, 0]), (
                "city-state ground carries no Early Empire to close it"
            )
    assert not bool(sim._border_closed(t, BARB_SEAT)[0, 0]), "a barbarian asks nobody"
    print("  i3 closed border OK (civic, grant direction, ally, war, trader/religious exemptions)")


def poke_substrate(rules, path):
    """a. Pair-matrix shape/symmetry + _MUTABLE snapshot/restore coverage. The
    block under test spans EVERY major row, seat 0 included — the round that
    made the head the one war entry made row 0 a row of these planes."""
    sim = build(rules, path)
    nrow = sim.n_majors
    assert sim.war.dtype == torch.bool and sim.seat_warkind.dtype == torch.bool
    assert sim.seat_denounced.dtype == torch.long and sim.war_turns.dtype == torch.long
    for _p in ("seat_warkind", "seat_denounced", "seat_friend_turns",
               "seat_ally_turns", "seat_borders_turns"):
        _t = getattr(sim, _p)
        assert _t.shape[1] >= nrow and _t.shape[2] >= nrow, (
            f"{_p} must be a seat-PAIR plane covering row 0 (got {tuple(_t.shape)})"
        )
    diag = torch.arange(nrow)
    assert not bool(sim.war[0, diag, diag].any()), "the war diagonal must stay false"
    for _p in ("war", "seat_warkind", "seat_friend_turns", "seat_ally_turns"):
        blk = getattr(sim, _p)[0, :nrow, :nrow]
        assert bool((blk == blk.T).all()), f"the organic major block of {_p} must be symmetric"

    snap = sim.snapshot()
    keep = {p: getattr(sim, p).clone() for p in ("war", "war_turns", "seat_warkind", "seat_denounced",
                                                 "seat_friend_turns", "seat_ally_turns", "seat_borders_turns")}
    sim.war[:, :nrow, :nrow] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.war_turns[:] = 11
    sim.seat_warkind[:] = True
    sim.seat_friend_turns[:] = 5
    sim.seat_ally_turns[:] = 5
    sim.seat_borders_turns[:] = 5
    sim.seat_denounced[:] = 7
    sim.restore(snap)
    for _p, _v in keep.items():
        assert bool((getattr(sim, _p) == _v).all()), (
            f"{_p} must round-trip snapshot/restore (_MUTABLE)"
        )
    print("  a substrate OK (bool/bool/long, false diagonal, symmetric over rows 0..R, snapshot-covered)")


def poke_denounce(rules, path):
    """b. The denounce arm: stronger-and-near stamps once, directed."""
    sim, _, _ = controlled_pair(rules, path)
    t = int(sim.turn)
    geo_denounce(sim)
    assert int(sim.seat_denounced[0, 1, 2]) == t, "the stronger row must stamp its grudge with the current turn"
    assert int(sim.seat_denounced[0, 2, 1]) == -1, "the strictly-weaker side must never stamp back"

    sim.seat_denounced[0, 1, 2] = 3  # a STANDING denouncement is never re-stamped
    geo_denounce(sim)
    assert int(sim.seat_denounced[0, 1, 2]) == 3, "a standing denouncement must not be re-stamped"

    # CIV6: "A Denunciation lasts for 30 turns, after which its effects
    # expire" — and an expired one may be renewed.
    term = int(sim._agreement_turns)
    sim.seat_denounced[0, 1, 2] = t - term
    assert not bool(sim._denounce_active(1, 2)[0]), f"a denouncement must expire at {term} turns"
    assert bool(sim._denounce_active(1, 2)[0].logical_not()), "expiry is the clock reaching zero"
    geo_denounce(sim)
    assert int(sim.seat_denounced[0, 1, 2]) == t, "an EXPIRED denouncement may be renewed"

    sim.seat_denounced[0, 1, 2] = -1
    sim.war[0, 1, 2] = sim.war[0, 2, 1] = True  # at-war pairs skip
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    geo_denounce(sim)
    assert int(sim.seat_denounced[0, 1, 2]) == -1, "an at-war pair must not denounce"
    print("  b denounce OK (turn-stamped, directed, once, war-gated)")


def poke_dow_kind(rules, path):
    """c. DoW FORMAL iff the aggressor's stamp is >= formalWarMinTurns old —
    for a civ↔civ pair AND for a war seat 0 declares, through the ONE applier
    each row's head calls."""
    sim, _, _ = controlled_pair(rules, path)
    fmin = int(sim.rules.seats.get("formalWarMinTurns", 5))
    t = int(sim.turn)

    sim.seat_denounced[0, 1, 2] = t - fmin  # exactly at the bar -> FORMAL
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]) and bool(sim.war[0, 2, 1]), "a DoW must write the war matrix symmetrically"
    assert bool(sim.seat_warkind[0, 1, 2]) and bool(sim.seat_warkind[0, 2, 1]), "an old-grudge war must be FORMAL"

    clear_pairs(sim)
    sim.seat_denounced[0, 1, 2] = t - (fmin - 1)  # one turn too fresh -> SURPRISE
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]) and not bool(sim.seat_warkind[0, 1, 2]), "a fresh-grudge war must be SURPRISE"

    clear_pairs(sim)  # no grudge at all -> SURPRISE
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]) and not bool(sim.seat_warkind[0, 1, 2]), "a no-grudge war must be SURPRISE"

    # ...and the casus belli EXPIRES with the denouncement that opened it.
    clear_pairs(sim)
    sim.seat_denounced[0, 1, 2] = t - int(sim._agreement_turns)
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]) and not bool(sim.seat_warkind[0, 1, 2]), (
        "an EXPIRED denouncement carries no casus belli"
    )

    # ROW 0 IS A ROW: the same head, the same applier, the same two outcomes.
    clear_pairs(sim)
    sim.seat_denounced[0, 0, 1] = t - fmin
    head_war(sim, 0, 1)
    assert bool(sim.war[0, 0, 1]) and bool(sim.war[0, 1, 0]), "seat 0's DoW must write the war matrix symmetrically"
    assert bool(sim.seat_warkind[0, 0, 1]) and bool(sim.seat_warkind[0, 1, 0]), "seat 0's old-grudge war must be FORMAL"
    clear_pairs(sim)
    head_war(sim, 0, 1)
    assert bool(sim.war[0, 0, 1]) and not bool(sim.seat_warkind[0, 0, 1]), "seat 0's no-grudge war must be SURPRISE"

    # ...and the head reaches seat 0 from a civ row too — the column that was
    # dead until the head became symmetric.
    clear_pairs(sim)
    head_war(sim, 2, 0)
    assert bool(sim.war[0, 2, 0]) and bool(sim.war[0, 0, 2]), "a civ row must be able to declare ON seat 0"
    print(f"  c DoW kind OK (FORMAL at stamp age >= {fmin}, else SURPRISE; symmetric writes, every row)")


def poke_dow_gates(rules, path):
    """d. The head's own DoW gates — the rules `_apply_war_column`
    re-validates whoever asks: ALLIES are never declared on, an existing war
    is a no-op, and one declaration buys exactly one grievance."""
    sim, _, _ = controlled_pair(rules, path)
    dow = int(sim._griev_war_surprise)  # no denouncement stands, so it is a SURPRISE war

    sim.seat_ally_turns[0, 1, 2] = sim.seat_ally_turns[0, 2, 1] = 30
    head_war(sim, 1, 2)
    assert not bool(sim.war[0, 1, 2]), "an ALLY must never be declared on"
    assert int(sim._grievances_against(1)[0]) == 0, "a refused declaration must not earn grievances"

    # CIV6 (Declaring Friendship): Declared Friends "cannot undertake hostile
    # actions (such as Denouncing or going to war) against each other".
    clear_pairs(sim)
    sim.civ_grievance[0].zero_()
    sim.seat_friend_turns[0, 1, 2] = sim.seat_friend_turns[0, 2, 1] = 30
    head_war(sim, 1, 2)
    assert not bool(sim.war[0, 1, 2]), "a Declared Friend must never be declared on"

    # the same gate on seat 0's own axis
    clear_pairs(sim)
    sim.seat_ally_turns[0, 0, 1] = sim.seat_ally_turns[0, 1, 0] = 30
    head_war(sim, 0, 1)
    assert not bool(sim.war[0, 0, 1]), "seat 0 must not declare on its ally either"

    # a live declaration: war both ways, clock at 0, exactly one grievance
    clear_pairs(sim)
    sim.civ_grievance[0].zero_()
    sim.war_turns[0, 1, 2] = sim.war_turns[0, 2, 1] = 9
    head_war(sim, 1, 2)
    assert bool(sim.war[0, 1, 2]) and int(sim.war_turns[0, 1, 2]) == 0, "a declaration restarts THAT war's clock"
    assert int(sim._grievance_with(2, 1)[0]) == dow, (
        f"declaring must pay the target a surprise war ({dow}), got {int(sim._grievance_with(2, 1)[0])}"
    )

    # ...and declaring again on a war already running changes nothing
    sim.war_turns[0, 1, 2] = sim.war_turns[0, 2, 1] = 6
    head_war(sim, 1, 2)
    assert int(sim.war_turns[0, 1, 2]) == 6, "an existing war must not have its clock restarted"
    assert int(sim._grievance_with(2, 1)[0]) == dow, "an existing war must not earn a SECOND grievance"
    print(f"  d DoW gates OK (allies exempt on every axis, one clock reset, one grievance of {dow})")


def poke_peace(rules, path):
    """e. Suing is PRICED and CLOCKED: refused under warMinTurns, refused when
    broke, and once paid it clears the war and its kind both directions,
    zeroes BOTH rows' peace clocks and restarts the war clock — while the
    denouncement grudge survives."""
    sim, _, _ = controlled_pair(rules, path)
    sr = sim.rules.seats
    wmin = int(sr.get("warMinTurns", 14))
    cost = float(sr.get("peaceGold0", 150) + sr.get("peaceGoldSlope", 10) * wmin)

    def _at_war():
        sim.war[0, 1, 2] = sim.war[0, 2, 1] = True
        sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
        sim.seat_warkind[0, 1, 2] = sim.seat_warkind[0, 2, 1] = True
        sim.seat_denounced[0, 1, 2] = 2

    _at_war()
    sim.civ_treasury[0, 1] = cost * 4
    sim.war_turns[0, 1, 2] = sim.war_turns[0, 2, 1] = wmin - 1  # one turn short
    head_war(sim, 1, 2, sue=True)
    assert bool(sim.war[0, 1, 2]), "peace must not fire under warMinTurns"

    sim.war_turns[0, 1, 2] = sim.war_turns[0, 2, 1] = wmin
    sim.civ_treasury[0, 1] = cost - 1  # ...and never on credit
    head_war(sim, 1, 2, sue=True)
    assert bool(sim.war[0, 1, 2]), "a seat that cannot pay the treaty must stay at war"

    sim.civ_treasury[0, 1] = cost + 25
    sim.peace_turns[0, 1] = sim.peace_turns[0, 2] = 7
    head_war(sim, 1, 2, sue=True)
    assert not bool(sim.war[0, 1, 2]) and not bool(sim.war[0, 2, 1]), "peace must clear the war matrix both directions"
    assert not bool(sim.seat_warkind[0, 1, 2]) and not bool(sim.seat_warkind[0, 2, 1]), "the ended war's FORMAL flag must clear"
    assert int(sim.seat_denounced[0, 1, 2]) == 2, "the denouncement grudge must SURVIVE the peace"
    assert abs(float(sim.civ_treasury[0, 1]) - 25.0) < 1e-6, (
        f"the treaty must debit peaceGold0 + slope*clock = {cost} (left {float(sim.civ_treasury[0, 1])})"
    )
    assert int(sim.war_turns[0, 1, 2]) == 0 and int(sim.war_turns[0, 2, 1]) == 0, "peace restarts the pair's war clock"
    assert int(sim.peace_turns[0, 1]) == 0 and int(sim.peace_turns[0, 2]) == 0, "BOTH sides' peace clocks restart"

    # the same treaty on seat 0's axis — one applier, one price
    clear_pairs(sim)
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.war_turns[0, 0, 1] = sim.war_turns[0, 1, 0] = wmin
    sim.civ_treasury[0, 0] = cost + 25
    head_war(sim, 0, 1, sue=True)
    assert not bool(sim.war[0, 0, 1]) and not bool(sim.war[0, 1, 0]), "seat 0's treaty must clear the war both ways"
    assert abs(float(sim.civ_treasury[0, 0]) - 25.0) < 1e-6, "seat 0 pays the same schedule"
    print(f"  e peace OK (>= {wmin} turns, priced {cost} and paid, both clocks restart, grudge kept, every row)")


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
    sim.war[0, 1 + 0, 1 + 1] = sim.war[0, 1 + 1, 1 + 0] = True  # SURPRISE (kind False)
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
    sim.seat_warkind[0, 1, 2] = sim.seat_warkind[0, 2, 1] = True  # FORMAL
    formal = int(sim._ww_era_base(torch.tensor([1]), torch.tensor([2]))[0])
    sim.restore(snap)
    surprise = int(sim._ww_era_base(torch.tensor([1]), torch.tensor([2]))[0])
    assert formal == int(rww["eraFormal"][0]) and surprise == int(rww["eraSurprise"][0]), (
        f"the casus belli must pick the COLUMN (formal {formal} / surprise {surprise})"
    )

    # full peace drains four times faster than a phoney war
    sim.restore(snap)
    sim.war[0, 1 + 0, 1 + 1] = sim.war[0, 1 + 1, 1 + 0] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.ww[0, 1, 2] = at_peace + 3
    sim._seat_phase()
    assert int(sim.ww[0, 1, 2]) == 3, f"full peace must shed {at_peace}"

    # a war seat 0 is IN behaves identically — weariness is not seat-dependent
    sim.restore(snap)
    sim.war[0, 1 + 0, 1 + 1] = sim.war[0, 1 + 1, 1 + 0] = False
    sim.war[0, 0, 1 + 0] = sim.war[0, 1 + 0, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.ww[0, 1, 0] = at_war + 11
    sim._seat_phase()
    assert int(sim.ww[0, 1, 0]) == 11, (
        "a war seat 0 is in decays at the same rate as a civ<->civ war — "
        "weariness is not seat-dependent (one rule for every seat)"
    )

    print(f"  f ww PER-BATTLE OK (declared-but-unfought = 0, decay -{at_war} at war / -{at_peace} at peace)")


def poke_transfer(rules, path):
    """g. _transfer_city: loser hygiene, POOL-END append, tile re-key,
    _eff_version bump, _check_rc_registry_invariant green."""
    sim = build(rules, path)
    civ_only_from = next(r for r in range(sim.n_majors - 1) if bool(sim.city_alive[0, r + 1].any()))
    civ_only_to = next(r for r in range(sim.n_majors - 1) if r != civ_only_from)
    j = int(sim.city_alive[0, civ_only_from + 1].nonzero(as_tuple=True)[0][0])
    c_t = int(sim.city_center[0, civ_only_from + 1, j])
    id_from = int(sim.city_id[0, civ_only_from + 1, j])
    id_next = int(sim.civ_next_city_id[0, civ_only_to + 1])
    own = (sim.tile_city[0] == id_from) & (sim.tile_seat[0] == civ_only_from + 1)
    n_own = int(own.sum())
    occ = sim.city_alive[0, civ_only_to + 1].nonzero(as_tuple=True)[0]
    exp_slot = int(occ.max()) + 1 if len(occ) else 0
    ev0 = sim._eff_version
    sim.civ_grievance.zero_()

    sim._transfer_city(0, civ_only_from + 1, j, civ_only_to + 1, conquest=False)

    # A LOYALTY FLIP earns no grievances: nobody declared anything, and TS
    # gates the whole accrual on `why === 'conquered'`.
    assert int(sim.civ_grievance.abs().sum()) == 0, "a flip must not touch the ledger"

    assert not bool(sim.city_alive[0, civ_only_from + 1, j]), "the loser slot must die"
    assert int(sim.city_bldg[0, civ_only_from + 1, j].sum()) == 0 and int(sim.city_current[0, civ_only_from + 1, j]) == -1, (
        "loser-slot hygiene: buildings/queue wiped"
    )
    assert bool((sim.city_dist_tile[0, civ_only_from + 1, j] == -1).all()), "loser-slot hygiene: district registry wiped"
    assert bool(sim.city_alive[0, civ_only_to + 1, exp_slot]), "the receiver must append at the END of the alive pool"
    assert int(sim.city_center[0, civ_only_to + 1, exp_slot]) == c_t and not bool(sim.city_is_cap[0, civ_only_to + 1, exp_slot])
    assert int(sim.city_id[0, civ_only_to + 1, exp_slot]) == id_next and int(sim.civ_next_city_id[0, civ_only_to + 1]) == id_next + 1
    assert int(sim.centre_slot_at[0, c_t]) >= 0 and int(sim.tile_seat[0, c_t]) == civ_only_to + 1, (
        "the center tile must re-seat to the receiver")
    rekeyed = (sim.tile_city[0] == id_next) & (sim.tile_seat[0] == civ_only_to + 1)
    assert int(rekeyed.sum()) == n_own, (
        f"exactly the flipping city's {n_own} tiles must re-key to the receiver ({int(rekeyed.sum())})"
    )
    # the transfer bumps once for itself, and AGAIN when the city that left was
    # the losing seat's capital and the Palace relocates to its highest-
    # population survivor. Both are real yield-bearing changes, so assert the
    # bump happened and stayed within those two known writes.
    _bumped = sim._eff_version - ev0
    _relocated = bool(sim.city_is_cap[0, civ_only_from + 1].any())
    assert 1 <= _bumped <= 2, f"the transfer must bump _eff_version (got {_bumped})"
    assert _bumped == (2 if _relocated else 1), (
        f"expected {'transfer + palace relocation' if _relocated else 'transfer only'}, got {_bumped} bumps"
    )
    sim._check_rc_registry_invariant()  # raises on any registry drift
    print(f"  g transfer OK (slot {j} r{civ_only_from} -> pool-end slot {exp_slot} r{civ_only_to}, {n_own} tiles re-keyed, registry green)")


def poke_float32(rules, path):
    """h. A float32 build steps 30 turns with the pair machinery live."""
    sim = build(rules, path, steps=30, dtype=torch.float32)
    assert sim.war.dtype == torch.bool and sim.seat_warkind.dtype == torch.bool and sim.seat_denounced.dtype == torch.long
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

def poke_delegation(rules, path):
    """i4. THE DELEGATION and the RESIDENT EMBASSY: the sender pays, the target
    is paid, the mission is one per pair and indefinite, a denouncement turns
    it away and a war kicks both halves out."""
    sim, _ja, _jb = controlled_pair(rules, path, extra_for_a=False)
    a, b = 1, 2
    sim.civ_treasury[:] = 1000.0
    sim.civ_civics[0, a, sim._embassy_civic] = False
    want(sim, a, "delegation", b)
    assert int(sim.seat_delegation[0, a, b]) == 1
    assert int(sim.seat_delegation[0, b, a]) == 0, "the mission is DIRECTED"
    # "...which is paid to the other leader."
    assert float(sim.civ_treasury[0, a]) == 1000.0 - sim._deleg_cost
    assert float(sim.civ_treasury[0, b]) == 1000.0 + sim._deleg_cost
    assert int(sim._diplo_vis()[0, a, b]) == 1 and int(sim._diplo_vis()[0, b, a]) == 0

    # one per pair: a second send buys nothing and costs nothing
    want(sim, a, "delegation", b)
    assert float(sim.civ_treasury[0, a]) == 1000.0 - sim._deleg_cost
    # ...and the sender's own civics price a NEW mission
    sim.civ_civics[0, a, sim._embassy_civic] = True
    want(sim, a, "delegation", 0)
    assert int(sim.seat_delegation[0, a, 0]) == 1
    assert float(sim.civ_treasury[0, a]) == 1000.0 - sim._deleg_cost - sim._embassy_cost

    # a denouncement either way turns it away, and so does an empty purse
    clear_pairs(sim)
    sim.civ_treasury[:] = 1000.0
    sim.seat_denounced[0, b, a] = int(sim.turn)
    want(sim, a, "delegation", b)
    assert int(sim.seat_delegation[0, a, b]) == 0, "a denouncer accepted a mission"
    assert float(sim.civ_treasury[0, a]) == 1000.0
    clear_pairs(sim)
    sim.civ_treasury[:] = sim._deleg_cost - 1.0
    want(sim, a, "delegation", b)
    assert int(sim.seat_delegation[0, a, b]) == 0, "an empty purse sent a mission"

    # CIV6: "when war is declared, delegations and ambassadors are kicked out"
    clear_pairs(sim)
    sim.civ_treasury[:] = 1000.0
    sim.seat_delegation[0, a, b] = sim.seat_delegation[0, b, a] = 1
    head_war(sim, a, b)
    assert bool(sim.war[0, a, b]), "the declaration must land for the rest of this check"
    assert int(sim.seat_delegation[0, a, b]) == 0 and int(sim.seat_delegation[0, b, a]) == 0, (
        "war left a mission standing"
    )
    print("  i4 mission OK (paid to the other leader, one per pair, denounce-gated, war clears)")


def poke_visibility(rules, path):
    """j. DIPLOMATIC VISIBILITY: five levels, one per source, the post and the
    alliance as alternatives, and the Combat Strength the leading side keeps.
    CIV6 (Diplomatic Visibility and Gossip)."""
    sim, _ja, _jb = controlled_pair(rules, path, extra_for_a=False)
    a, b = 1, 2
    assert sim._vis_max == 4, f"{sim._vis_max} levels, expected the published five"
    sim.seat_route_dseat[:] = -1
    vis = sim._diplo_vis()
    assert int(vis[0, a, b]) == 0 and int(vis[0, a, a]) == 0, "a blank table reads something"

    # "Establish a Trade Route to a civilization to increase visibility by one
    # level."
    sim.seat_route_dseat[0, a, 0] = b
    assert int(sim._diplo_vis()[0, a, b]) == 1
    assert int(sim._diplo_vis()[0, b, a]) == 0, "the route read back the other way"

    # "...researching the Printing Press technology. This will increase your
    # visibility with ALL civilizations by one level."
    sim.civ_techs[0, a, sim._vis_tech] = True
    v = sim._diplo_vis()
    assert int(v[0, a, b]) == 2 and int(v[0, a, 0]) == 1, "the tech pays one column only"

    # The post and the alliance do not stack.
    sim.seat_ally_turns[0, a, b] = sim.seat_ally_turns[0, b, a] = 20
    assert int(sim._diplo_vis()[0, a, b]) == 3
    ctr_b = int(sim.city_center[0, b, int(sim.city_alive[0, b].nonzero(as_tuple=True)[0][0])])
    sim._spawn_unit(a, torch.ones(1, dtype=torch.bool), torch.tensor([ctr_b]),
                    torch.tensor([sim._spy_idx]))
    slot = int((sim.unit_alive[0] & (sim.unit_type[0] == sim._spy_idx)).nonzero(
        as_tuple=True)[0][0])
    sim.unit_spy_mission[0, slot] = sim._spy_m_listening
    sim.unit_spy_level[0, slot] = 0
    sim._gen_ver += 1
    assert int(sim._diplo_vis()[0, a, b]) == 3, "the post added a level on top of the alliance"
    # ...a Secret Agent's post is the larger of the pair, so IT stands
    sim.unit_spy_level[0, slot] = sim._spy_secret_level
    assert int(sim._diplo_vis()[0, a, b]) == 4
    assert int(sim._listening_levels()[0, a, b]) == 2
    # and nothing reads past Top Secret
    sim.seat_route_dseat[0, a, 1] = b
    assert int(sim._diplo_vis()[0, a, b]) == sim._vis_max

    # CIV6 ("Intel on enemy movements"): +3 per level of the gap, to the side
    # that is ahead and to nobody else.
    _a = torch.full((sim.B,), a, dtype=torch.long, device=sim.device)
    _b = torch.full((sim.B,), b, dtype=torch.long, device=sim.device)
    gap = int(sim._diplo_vis()[0, a, b]) - int(sim._diplo_vis()[0, b, a])
    assert float(sim._vis_cs(_a, _b)[0]) == gap * sim._vis_cs_per_level
    assert float(sim._vis_cs(_b, _a)[0]) == 0.0, "the side behind was paid too"
    # a barbarian is not a civilization and reads nothing either way
    _barb = torch.full((sim.B,), BARB_SEAT, dtype=torch.long, device=sim.device)
    assert float(sim._vis_cs(_a, _barb)[0]) == 0.0
    assert float(sim._vis_cs(_barb, _a)[0]) == 0.0
    print("  j visibility OK (five levels, one per source, post-or-alliance, the intel bonus)")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"geopolitics_test on {path.name}")

    poke_substrate(rules, path)
    poke_denounce(rules, path)
    poke_dow_kind(rules, path)
    poke_dow_gates(rules, path)
    poke_agreements(rules, path)
    poke_closed_border(rules, path)
    poke_gift(rules, path)
    poke_peace(rules, path)
    poke_ww_differential(rules, path)
    poke_transfer(rules, path)
    poke_float32(rules, path)
    poke_delegation(rules, path)
    poke_visibility(rules, path)
    print("GEOPOLITICS POKES OK")


    # --- the grievance ledger ------------------------------------------------
    from core.engine import _MUTABLE as _MUT2
    # `civ_grievance [B, NS, NS]` is ONE plane and the BASE is what carries the
    # state through a snapshot.
    assert "civ_grievance" in _MUT2, "civ_grievance must be registered in _MUTABLE"
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    # ANTISYMMETRY: one write pays a cell and its mirror, so the pair carries
    # exactly one signed balance and the diagonal never moves.
    s3._add_grievance(0, 1, 40)
    assert int(s3.civ_grievance[0, 0, 1]) == 40 and int(s3.civ_grievance[0, 1, 0]) == -40
    assert int(s3._grievance_with(0, 1)[0]) == 40 and int(s3._grievance_with(1, 0)[0]) == -40
    assert int(s3._grievances_against(1)[0]) == 40, "the world's bill counts only what it is owed"
    assert int(s3._grievances_against(0)[0]) == 0, "a pair a seat is WINNING adds nothing"
    # snapshot/restore round-trip
    _snap = s3.snapshot()
    s3.civ_grievance.zero_()
    s3.restore(_snap)
    assert int(s3.civ_grievance[0, 0, 1]) == 40, "the ledger must survive snapshot/restore"
    # decay runs only while THAT pair is at peace, and never overshoots zero
    s3.war[:, 0, 1:s3.n_majors] = s3.war[:, 1:s3.n_majors, 0] = False
    s3.sync_war()  # a poke writes one cell; close the war matrix under transpose
    _base = max(s3._griev_decay_floor, s3._griev_decay_base - int(s3._world_era()[0]))
    s3.step()
    assert int(s3.civ_grievance[0, 0, 1]) == 40 - _base, "the pair must decay at its era rate"
    s3.civ_grievance[0, 0, 1] = 3
    s3.civ_grievance[0, 1, 0] = -3
    s3.step()
    assert int(s3.civ_grievance[0, 0, 1]) == 0, "the step never overshoots the neutral point"
    print("grievances OK — _MUTABLE, antisymmetry, the bill, decay")

    # --- DIPLOMATIC FAVOR ----------------------------------------------------
    assert _round_trips("civ_diplo_favor", _MUT2), "civ_diplo_favor must round-trip through _MUTABLE"
    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert s4._favor_per_suz == 1, f"GS pays 1 favor per suzerainty, got {s4._favor_per_suz}"
    # the suzerain tests: >= suzerainEnvoys AND strictly more than every civ seat
    suz_min = int(s4.rules.citystate.get("suzerainEnvoys", 3))
    s4.seat_citystate_envoys[:, 0].zero_(); s4.seat_citystate_envoys[:, 1:].zero_()
    assert int(s4._suzerain_count(0)[0]) == 0, "no envoys -> no suzerainties"
    s4.seat_citystate_envoys[:, 0, 0] = suz_min - 1
    assert int(s4._suzerain_count(0)[0]) == 0, "below the envoy minimum is not suzerainty"
    s4.seat_citystate_envoys[:, 0, 0] = suz_min
    assert int(s4._suzerain_count(0)[0]) == 1, "at the minimum with no civ contest -> suzerain"
    if s4.n_majors > 1:
        s4.seat_citystate_envoys[:, 1, 0] = suz_min  # a TIE leaves no suzerain (real Civ 6)
        assert int(s4._suzerain_count(0)[0]) == 0, "a tie must leave NO suzerain"
        s4.seat_citystate_envoys[:, 1, 0] = suz_min + 1
        assert int(s4._suzerain_count(1)[0]) == 1, "the strictly-higher civ is suzerain"
        assert int(s4._suzerain_count(0)[0]) == 0, "... and seat 0 is not"
    # the accrual itself: tier + suzerainties, and it is CUMULATIVE
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    f0 = int(s5.civ_diplo_favor[0, 0])
    s5.step()
    f1 = int(s5.civ_diplo_favor[0, 0])
    assert f1 >= f0, "favor never decreases"
    exp = int(s5._adopted_gov_tier(s5.civ_civics[:, 0])[0]) + s5._favor_per_suz * int(s5._suzerain_count(0)[0])
    s5.step()
    assert int(s5.civ_diplo_favor[0, 0]) - f1 == exp, (
        f"favor step must be tier+suzerainties ({exp}), got {int(s5.civ_diplo_favor[0, 0]) - f1}"
    )
    # CIV6 (Diplomatic Favor, "Losing Favor"): -5/turn per ORIGINAL CAPITAL
    # occupied, and a negative rate leaves the bank stuck at 0.
    assert _round_trips("city_orig_cap", _MUT2), "city_orig_cap must round-trip through _MUTABLE"
    assert s5._favor_occ_capital == 5, f"GS charges 5 per occupied capital, got {s5._favor_occ_capital}"
    _cap0 = (s5.city_orig_cap[0, 0] == 0) & s5.city_alive[0, 0]
    assert bool(_cap0.any()), "the founding must stamp seat 0's first city"
    assert int(_cap0.sum()) == 1, "only the FIRST city is an original capital"
    assert float(s5._occupied_capitals(0)[0]) == 0.0, "a seat's own capital costs it nothing"
    _col = int(_cap0.nonzero(as_tuple=True)[0][0])
    s5.city_orig_cap[0, 0, _col] = 1  # as if seat 1 had founded it and seat 0 taken it
    assert float(s5._occupied_capitals(0)[0]) == 1.0, "an occupied capital must be counted"
    s5.civ_diplo_favor[:, 0] = 100   # clear of the floor, so the RATE is readable
    f2 = int(s5.civ_diplo_favor[0, 0])
    s5.step()
    assert int(s5.civ_diplo_favor[0, 0]) - f2 == exp - int(s5._favor_occ_capital), (
        "the penalty must ride the same tick as the tier and the suzerainties"
    )
    s5.civ_diplo_favor[:, 0] = 1
    s5.step()
    assert int(s5.civ_diplo_favor[0, 0]) == 0, "a negative rate floors the bank at zero"
    print("diplomatic favor OK — suzerain contest, tie rule, tier+suz accrual, "
          "the occupied-capital penalty and its floor, _MUTABLE")

    # --- the WORLD CONGRESS + the DIPLOMATIC victory -------------------------
    for _f in ("congress_sessions", "congress_active", "civ_diplo_points"):
        assert _round_trips(_f, _MUT2), f"{_f} must round-trip through _MUTABLE"
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert s6._congress_interval == 30, f"GS convenes every 30 turns, got {s6._congress_interval}"
    assert s6._congress_min_era == 2, f"GS starts at the MEDIEVAL era (index 2), got {s6._congress_min_era}"
    assert s6._dvp_win == 20, f"GS diplomatic victory is 20 points, got {s6._dvp_win}"
    assert s6._congress_dv_min == 5, "the DV resolution enters at MODERN (index 5)"
    assert len(s6._congress_res) == len(rules.eras["congressResolutions"]), (
        "the GPU catalog must carry every exported resolution row")
    # CIV6: SoL +4 DVP, Potala +1 DVP + a diplomatic slot; FC's wildcard slot
    assert int(s6._wond_dvp.sum()) == 5, "the two DVP wonders pay 4 and 1"
    assert s6._wond_slots.sum(dim=0).tolist() == [1, 1, 1, 1],         "one wonder each adds a military, economic, diplomatic and wildcard slot" 

    # not a session turn -> nothing happens, favor untouched
    s6.civ_diplo_favor[:, 0] = 50
    s6.turn = s6._congress_interval + 1
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 0 and int(s6.civ_diplo_favor[0, 0]) == 50, "off-interval turns must do nothing"

    # a session turn but nobody is Medieval -> still nothing
    s6.turn = s6._congress_interval
    s6.civ_techs[:, 0].zero_(); s6.civ_techs[:, 1:].zero_(); s6.civ_civics[:, 0].zero_(); s6.civ_civics[:, 1:].zero_()
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 0, "pre-Medieval sessions must not convene"
    assert int(s6.civ_diplo_favor[0, 0]) == 50, "... and must not spend favor"

    # force Medieval via a tech whose era clears the bar, then run one session
    _era_ok = None
    for _t in range(s6.civ_techs.shape[2]):
        s6.civ_techs[:, 0].zero_(); s6.civ_techs[:, 0, _t] = True
        if int(s6._civ_era(s6.civ_techs[:, 0], s6.civ_civics[:, 0])[0]) >= s6._congress_min_era:
            _era_ok = _t
            break
    assert _era_ok is not None, "no tech reaches the Medieval era — check the era table"
    if s6.n_majors > 1:
        s6.civ_diplo_favor[:, 1] = 90
    # the slate is ANNOUNCED a session ahead (a first session draws its own,
    # at random) — hand this one its announcement so the order is pinned
    s6.congress_slate[0, 0] = 0
    s6.congress_slate[0, 1] = 1
    s6._world_congress()
    assert int(s6.congress_sessions[0]) == 1, "the session must convene"
    # pre-Modern there is no DV resolution, so the favor curve never walks
    assert int(s6.civ_diplo_favor[0, 0]) == 50 and int(s6.civ_diplo_favor[0, 1]) == 90, "favor spends on the DV resolution only"
    # the Medieval-eligible slate is UDT (0) then Patronage (1), outcome A
    assert s6.congress_active[0, :, 0].tolist() == [0, 1], "the Medieval slate is UDT + Patronage"
    assert s6.congress_active[0, :, 1].tolist() == [0, 0], "every free vote is outcome A"
    # every alive major voted the winning combo -> +1 DVP each per resolution
    for _r in range(s6.n_majors):
        assert int(s6.civ_diplo_points[0, _r]) == 2 * s6._dvp_per_res, "winning-combo voters each take the point"

    # the SLATE ROTATES: at Industrial three rows are eligible (UDT,
    # Patronage, Migration), and session 2 starts its window at rank 2
    s7 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _era_ind = None
    for _t in range(s7.civ_techs.shape[2]):
        s7.civ_techs[:, 0].zero_(); s7.civ_techs[:, 0, _t] = True
        if int(s7._civ_era(s7.civ_techs[:, 0], s7.civ_civics[:, 0])[0]) == 4:
            _era_ind = _t
            break
    assert _era_ind is not None, "no tech lands exactly on the Industrial era"
    s7.turn = s7._congress_interval
    s7.congress_sessions[:] = 1  # pretend session 1 already ran
    # session 2 convenes on the slate ANNOUNCED at session 1's close — hand it
    # the announcement, computed from the catalog rather than pinned positions
    _elig = [i for i, r in enumerate(s7._congress_res) if r["min"] <= 4 <= r["max"]]
    assert len(_elig) >= 4, "the Industrial pool wants at least four eligible rows"
    s7.congress_slate[0, 0] = _elig[2]
    s7.congress_slate[0, 1] = _elig[3]
    s7._world_congress()
    assert s7.congress_active[0, :, 0].tolist() == [_elig[2], _elig[3]], (
        f"the announced slate must convene as announced, got {s7.congress_active[0, :, 0].tolist()}"
    )
    assert s7._congress_res[_elig[2]]["id"] == "MIGRATION_TREATY", "the announced pair lands on Migration"
    # Migration's scripted vote is A-on-self; ties keep the LOWER seat
    assert s7.congress_active[0, 0, 1].tolist() == 0 and s7.congress_active[0, 0, 2].tolist() == 0

    # the DV resolution from Modern: the favor curve, the pile-on, the refunds
    s8 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    _era_mod = None
    for _t in range(s8.civ_techs.shape[2]):
        s8.civ_techs[:, 0].zero_(); s8.civ_techs[:, 0, _t] = True
        if int(s8._civ_era(s8.civ_techs[:, 0], s8.civ_civics[:, 0])[0]) >= s8._congress_dv_min:
            _era_mod = _t
            break
    assert _era_mod is not None, "no tech reaches the Modern era"
    assert s8.n_majors >= 3, "the DV poke wants three voters"
    s8.turn = s8._congress_interval
    s8.civ_diplo_points[:, 1] = 5      # seat 1 leads
    s8.civ_diplo_favor[:, 0] = 65      # walks 3 extra votes (60), 5 short of the 4th
    s8.civ_diplo_favor[:, 1] = 60      # walks exactly 3
    s8.civ_diplo_favor[:, 2] = 0       # the free vote only
    s8._world_congress()
    # the leader scan finds seat 1 (7 vs 2), seat 1 votes A-on-self weight 4,
    # seats 0+2 vote B-on-leader weights 4+1: B wins 5-4
    assert int(s8.civ_diplo_favor[0, 1]) == 60, "the losing outcome is refunded 100%"
    assert int(s8.civ_diplo_favor[0, 0]) == 5, "a winning-combo voter keeps no refund"
    assert int(s8.civ_diplo_favor[0, 2]) == 0
    # What the two REGULAR resolutions pay is their own slate's business, so
    # measure it: a twin whose Modern gate can never open runs the identical
    # session (the session draws nothing) minus the DV resolution.
    s8b = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    s8b._congress_dv_min = 99
    s8b.civ_techs[:, 0].zero_(); s8b.civ_techs[:, 0, _era_mod] = True
    s8b.turn = s8b._congress_interval
    s8b.civ_diplo_points[:, 1] = 5
    s8b.civ_diplo_favor[:, 0] = 65
    s8b.civ_diplo_favor[:, 1] = 60
    s8b.civ_diplo_favor[:, 2] = 0
    s8b._world_congress()
    assert s8b.congress_active[0, :, 0].tolist() == s8.congress_active[0, :, 0].tolist(), (
        "the twin must convene the same regular slate"
    )
    _reg = s8b.civ_diplo_points[0].tolist()
    assert int(s8.civ_diplo_points[0, 1]) == _reg[1] - s8._congress_dv_delta, "the leader loses the DV delta"
    assert (int(s8.civ_diplo_points[0, 0]) == _reg[0] + s8._dvp_per_res
            and int(s8.civ_diplo_points[0, 2]) == _reg[2] + s8._dvp_per_res), "B voters take the combo point"

    # the standing effects: write the plane directly, read every helper
    s8.congress_active[:, 0, :] = torch.tensor([1, 0, 2], dtype=torch.long)   # Patronage A on class 2
    s8.congress_active[:, 1, :] = torch.tensor([2, 1, 0], dtype=torch.long)   # Migration B on seat 0
    s8._eff_version += 1
    assert float(s8._congress_gpp_factor(2)[0]) == 2.0 and float(s8._congress_gpp_factor(0)[0]) == 1.0
    assert float(s8._congress_growth(0)[0]) == 0.8 and float(s8._congress_growth(1)[0]) == 1.0
    assert float(s8._congress_loyalty(0)[0]) == s8._c_mig_loy and float(s8._congress_loyalty(1)[0]) == 0.0
    s8.congress_active[:, 0, :] = torch.tensor([3, 0, 1], dtype=torch.long)   # Heritage A on ART
    assert s8._congress_gw_kmult()[0].tolist() == [1, 2, 1]
    s8.congress_active[:, 0, :] = torch.tensor([3, 1, 2], dtype=torch.long)   # Heritage B on MUSIC
    assert s8._congress_gw_kmult()[0].tolist() == [1, 1, 0]
    # the UDT ban empties the banned district's building columns in the mask
    s8.congress_active[:, 0, :] = torch.tensor([0, 1, 0], dtype=torch.long)   # UDT B on district 0
    s8._eff_version += 1
    _bb = s8._seat_buildable(0)
    _banned_cols = (s8._b_req_district == 0).nonzero(as_tuple=True)[0]
    assert len(_banned_cols) > 0, "district 0 must own buildings"
    assert not bool(_bb[:, :, _banned_cols].any()), "the UDT ban must empty the district's building columns"
    if s8._holy_didx >= 0:
        s8.congress_active[:, 0, :] = torch.tensor([0, 1, s8._holy_didx], dtype=torch.long)
        assert bool(s8._congress_holy_blocked().all()), "a HOLY_SITE ban refuses the worship faith-buy"

    # the victory check itself
    s9 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    s9.civ_diplo_points[:, 0] = s9._dvp_win - 1
    assert int(s9._diplomatic_victor()[0]) == -1, "one point short is not a win"
    s9.civ_diplo_points[:, 0] = s9._dvp_win
    assert int(s9._diplomatic_victor()[0]) == 0, "seat 0 wins at the threshold"
    if s9.n_majors > 1:
        s9.civ_diplo_points[:, 0].zero_()
        s9.civ_diplo_points[:, 1] = s9._dvp_win
        assert int(s9._diplomatic_victor()[0]) == 1, "a civ wins at the threshold"
    print("world congress OK — schedule, announced slate, combo DVP, DV curve+refunds, effect readers, UDT ban, victory")



if __name__ == "__main__":
    main()
