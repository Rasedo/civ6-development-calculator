"""Religion self-test — the missionary chassis, the enhancer channels, and
the religious-victory face. The scripted rollout barely reaches any of it
(missionary buys need a founded religion + Shrine + complete Holy Site on a civ
seat, the enhancer race rarely lands, and no seed flips a majority in every civ
seat by the horizon), so these pokes pin the semantics the same way naval_test /
district_breadth_test do: build a BatchSim from a fixture, force the state
in-memory, then drive the EXACT engine twin (_seat_phase missionary buy, the
driven SPREAD applier, _spread_religious_pressure, _rel_atk_cs/_rel_def_cs,
_seat_route_income, _religious_victor) and assert TS-mirroring behaviour.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python gpu/religion2_test.py

Covered (all gate-unreachable):
  1. Missionary BUY — founder + Shrine + complete unpillaged Holy Site + 60
     faith buys exactly one missionary at the city center, faith −60; the base
     row has 3 charges.
  2. Missionary BUY pricing — HOLY_ORDER prices it 42 (mcost row); SCRIPTURE
     grants 4 charges (mchg row).
  3. Missionary BUY gating — cap 2 (no third), no Shrine (no buy), incomplete /
     pillaged Holy Site (no buy).
  4. Missionary WALK — driver policy, not engine; only the SPREAD half is poked.
  5. Missionary SPREAD — +10 lump (15 SCRIPTURE) into the target city's
     accumulator for g, charge −1, and death (major_unit_alive False, tile cleared) at 0.
  6. ITINERANT_PREACHERS presR — widens the religion's spread range by exactly 2.
  7. Enhancer COMBAT CS — JUST_WAR near (atk+def +10), CRUSADE onto following
     territory (atk +10), DEFENDER of the faith on following territory (def +5).
  8. MESSENGER_OF_THE_GODS — +2 gold +2 faith on a domestic route whose dest
     follows this civ seat's religion.
  9. Religious victor (direct) — seat 0 wins with 0, a civ seat wins with g, the
     not-every-seat refusal (-1), and the cityless-seat exclusion.
 10. Religious victor (through-step) — a step flips victory_type to 4 (religion)
     and to 6 (a civ seat), game_over set.
 11. Theological LOCATION bonuses — Holy Ground +5, the Holy City's territory
     +15 on top, a FORT improvement, and nothing at all from terrain.
 12. Religious HEALING — 3x the Holy Site's own faith, on or beside it, in the
     unit's own territory only, and nothing from a pillaged one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


# ------------------------------------------------------------------ helpers ---
def build(rules, path, steps: int = 20, dtype=torch.float64):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype))
    for _ in range(steps):
        sim.step()
    return sim


def enh_rows(sim) -> dict:
    """Derive each enhancer's civ_only_enhancer index (0-based; table index = +1) from
    the _enh table itself — never hardcoded against the key order."""
    e = sim._enh

    def row(mask) -> int:
        idx = mask.nonzero(as_tuple=True)[0]
        assert len(idx) == 1, f"expected exactly one enhancer row, got {idx.tolist()}"
        return int(idx[0]) - 1

    return {
        "ITINERANT": row(e["presR"] > 0),
        "SCRIPTURE": row(e["mchg"] == 1),
        "JUST_WAR": row(e["cnear"] != 0),
        "DEFENDER": row(e["cdef"] != 0),
        "CRUSADE": row(e["cvs"] != 0),
        "HOLY_ORDER": row(e["mcost"] != float(e["mcost"][0])),
        "MESSENGER": row(e["tradeRel"].abs().sum(dim=1) > 0),
    }


def free_tiles(sim, n: int, banned=()) -> list[int]:
    """First n on-map tiles that are not a city / civ-city / city-state center
    and carry no district / wonder / improvement."""
    out: list[int] = []
    banned = set(banned)
    for t in range(sim.T):
        if t in banned:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.citystate_at[0, t]) >= 0:
            continue
        if int(sim.district[0, t]) >= 0 or int(sim.built_wonder[0, t]) >= 0 or int(sim.improvement[0, t]) >= 0:
            continue
        out.append(t)
        if len(out) >= n:
            break
    assert len(out) >= n, f"not enough free tiles (wanted {n}, got {len(out)})"
    return out


def free_neighbor(sim, ctr: int, banned=()) -> int:
    """First on-map neighbour of ctr with no unit occupant that is not itself a
    city / civ-city / city-state center."""
    banned = set(banned)
    for d in range(6):
        t = int(sim.neigh[ctr][d])
        if t < 0 or t in banned:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.citystate_at[0, t]) >= 0:
            continue
        if not bool(sim.passable[0, t]):
            continue
        if (int(sim.civilian_at[0, t]) < 0 and int(sim.military_at[0, t]) < 0
                and int(sim.barb_at[0, t]) < 0):
            return t
    return -1


def clear_missionaries(sim, r: int) -> None:
    m = sim.major_unit_alive[0] & ((sim.major_unit_seat[0] - 1) == r) & (sim.major_unit_type[0] == sim._missionary_idx)
    for u in m.nonzero(as_tuple=True)[0].tolist():
        t = int(sim.major_unit_tile[0, u])
        sim.major_unit_alive[0, u] = False
        if int(sim.civilian_at[0, t]) == u:
            sim.civilian_at[0, t] = -1


def place_missionary(sim, r: int, t: int, charges: int) -> int:
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = r + 1
    sim.major_unit_type[0, slot] = sim._missionary_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_charges[0, slot] = charges
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = False
    sim.civilian_at[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def isolate_faith(sim, r: int) -> None:
    """Strip every faith lever on civ seat r except the one under test: founded
    religion, no pantheon/enhancer (re)founding drains, no beliefs."""
    sim.civ_religion_done[:, r + 1] = True
    sim.civ_pantheon_done[:, r + 1] = True
    sim.civ_prophets[:, r + 1] = 0
    sim.civ_pantheon[:, r + 1] = -1
    sim.civ_follower[:, r + 1] = -1
    sim.civ_enhancer[:, r + 1] = -1


def make_holy_site(sim, r: int, j: int) -> int:
    """Give civ seat r's city j a COMPLETE unpillaged Holy Site on a fresh tile;
    wipe the HS registry on every other slot. Returns the district tile."""
    HS = sim._hs_idx
    T_hs = free_tiles(sim, 1)[0]
    sim.district[0, T_hs] = HS
    sim.district_complete[0, T_hs] = True
    sim.district_pillaged[0, T_hs] = False
    sim.city_dist_tile[:, r + 1, :, HS] = -1
    sim.city_dist_tile[0, r + 1, j, HS] = T_hs
    return T_hs


def follow_all(sim, g: int) -> None:
    """Force every alive city (seat 0 + the civ seats) to follow religion g, so
    a fresh missionary finds NO target and keeps its full charges."""
    sim.city_followed[0, 0, :sim.RC] = torch.where(sim.city_alive[0, 0], torch.full_like(sim.city_followed[0, 0, :sim.RC], g), sim.city_followed[0, 0, :sim.RC])
    if sim.n_majors > 1:
        sim.city_followed[0, 1:sim.n_majors, :sim.RC] = torch.where(sim.city_alive[0, 1:sim.n_majors], torch.full_like(sim.city_followed[0, 1:sim.n_majors, :sim.RC], g), sim.city_followed[0, 1:sim.n_majors, :sim.RC])


def live_missionaries(sim, r: int) -> list[int]:
    m = sim.major_unit_alive[0] & ((sim.major_unit_seat[0] - 1) == r) & (sim.major_unit_type[0] == sim._missionary_idx)
    return m.nonzero(as_tuple=True)[0].tolist()


def order_relig_buy(sim, r: int, j: int, kind: int = 5) -> None:
    """Stash the religious-unit faith-buy INTENT on the wire (kind 5 =
    missionary, 6 = apostle). The engines are decision-free: the buy is an
    ORDER `_seat_buy_ladder` re-validates, never a choice the phase makes —
    so every gating poke stashes the intent and asserts the REFUSAL."""
    sim.seat_ext[0, r + 1] = True
    sim.apply_seat_actions(r + 1, relig=(torch.full((1,), kind, dtype=torch.long),
                                         torch.full((1,), j, dtype=torch.long)))


# ------------------------------------------------------------------ pokes -----
def poke_missionary_buy(rules, rj, path):
    """1. A founder with the SHRINE + a complete unpillaged Holy Site + 60 faith
    buys exactly ONE missionary at the buying city center; faith debited exactly
    60 (read as a BUY-vs-NO-BUY diff); base charges 3."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "civ capital slot must be alive"
    assert sim._missionary_idx >= 0 and sim._shrine_bidx >= 0 and sim._hs_idx >= 0, "missionary anchors missing"
    SHRINE, TEMPLE = sim._shrine_bidx, sim._temple_bidx

    isolate_faith(sim, r)
    sim.civ_faith[:, r + 1] = 90.0
    clear_missionaries(sim, r)
    sim.city_bldg[:, r + 1, :, SHRINE] = False
    sim.city_bldg[0, r + 1, j, SHRINE] = True
    if TEMPLE >= 0:
        sim.city_bldg[:, r + 1, :, TEMPLE] = False  # no worship buy competes for the faith
    make_holy_site(sim, r, j)
    follow_all(sim, r + 1)  # spawned missionary finds no target -> keeps full charges
    ctr = int(sim.city_center[0, r + 1, j])
    # clear the MERGED planes: p_/v_/u_ are DERIVED read-only views, so a
    # subscript write to one lands in a temporary and is silently discarded.
    sim.military_at[0, ctr] = -1
    sim.civilian_at[0, ctr] = -1

    base = sim.snapshot()
    order_relig_buy(sim, r, j)
    sim._seat_phase()
    ms = live_missionaries(sim, r)
    assert len(ms) == 1, f"founder did not buy exactly one missionary (got {len(ms)})"
    u = ms[0]
    assert int(sim.major_unit_tile[0, u]) == ctr, f"missionary not spawned at the buying city center ({int(sim.major_unit_tile[0, u])} != {ctr})"
    assert int(sim.major_unit_charges[0, u]) == 3, f"base missionary must carry 3 charges, got {int(sim.major_unit_charges[0, u])}"
    faith_buy = float(sim.civ_faith[0, r + 1])

    # control: keep the SHRINE (so its faith income is IDENTICAL) but fill the
    # missionary cap with inert 0-charge units so NO buy fires. The faith delta
    # then isolates the flat 60 debit.
    sim.restore(base)
    for t in free_tiles(sim, 2):
        place_missionary(sim, r, t, charges=0)
    order_relig_buy(sim, r, j)  # the same intent, refused at the cap
    sim._seat_phase()
    assert len(live_missionaries(sim, r)) == 2, "cap control must not buy a 3rd missionary"
    faith_nobuy = float(sim.civ_faith[0, r + 1])
    assert abs((faith_nobuy - faith_buy) - 60.0) < 1e-6, (
        f"missionary debit not exactly 60 faith (nobuy {faith_nobuy} - buy {faith_buy} = {faith_nobuy - faith_buy})"
    )
    print(f"  1 missionary buy OK (1 unit at center {ctr}, 3 charges, -60 faith exact)")


def poke_missionary_pricing(rules, rj, path):
    """2. HOLY_ORDER prices the missionary at 42 (mcost row); SCRIPTURE grants 4
    charges (mchg row)."""
    sim = build(rules, path)
    r, j = 0, 0
    E = enh_rows(sim)
    SHRINE, TEMPLE = sim._shrine_bidx, sim._temple_bidx
    assert int(sim._enh["mcost"][E["HOLY_ORDER"] + 1]) == 42, "HOLY_ORDER mcost row must be 42"
    assert int(sim._enh["mchg"][E["SCRIPTURE"] + 1]) == 1, "SCRIPTURE mchg row must be +1"
    assert int(sim._type_charges[sim._missionary_idx]) == 3, "base missionary charges must be 3"

    def one_buy(enh_idx: int, faith0: float):
        s = build(rules, path)
        isolate_faith(s, r)
        s.civ_enhancer[:, r + 1] = enh_idx
        s.civ_faith[:, r + 1] = faith0
        clear_missionaries(s, r)
        s.city_bldg[:, r + 1, :, SHRINE] = False
        s.city_bldg[0, r + 1, j, SHRINE] = True
        if TEMPLE >= 0:
            s.city_bldg[:, r + 1, :, TEMPLE] = False
        make_holy_site(s, r, j)
        follow_all(s, r + 1)
        base = s.snapshot()
        order_relig_buy(s, r, j)
        s._seat_phase()
        ms = live_missionaries(s, r)
        # debit diff vs a cap-filled control (Shrine kept -> identical income)
        faith_buy = float(s.civ_faith[0, r + 1])
        s.restore(base)
        for t in free_tiles(s, 2):
            place_missionary(s, r, t, charges=0)
        order_relig_buy(s, r, j)
        s._seat_phase()
        debit = float(s.civ_faith[0, r + 1]) - faith_buy
        return ms, debit

    # HOLY_ORDER: 42 faith affords the buy; the debit is exactly 42.
    ms, debit = one_buy(E["HOLY_ORDER"], 42.0)
    assert len(ms) == 1, "HOLY_ORDER founder with 42 faith did not buy"
    assert abs(debit - 42.0) < 1e-6, f"HOLY_ORDER debit not 42 ({debit})"

    # SCRIPTURE: the bought missionary carries 4 charges (3 + mchg 1).
    s2 = build(rules, path)
    E2 = enh_rows(s2)
    isolate_faith(s2, r)
    s2.civ_enhancer[:, r + 1] = E2["SCRIPTURE"]
    s2.civ_faith[:, r + 1] = 90.0
    clear_missionaries(s2, r)
    s2.city_bldg[:, r + 1, :, SHRINE] = False
    s2.city_bldg[0, r + 1, j, SHRINE] = True
    if TEMPLE >= 0:
        s2.city_bldg[:, r + 1, :, TEMPLE] = False
    make_holy_site(s2, r, j)
    follow_all(s2, r + 1)
    order_relig_buy(s2, r, j)
    s2._seat_phase()
    ms2 = live_missionaries(s2, r)
    assert len(ms2) == 1, "SCRIPTURE founder did not buy"
    assert int(s2.major_unit_charges[0, ms2[0]]) == 4, f"SCRIPTURE missionary must carry 4 charges, got {int(s2.major_unit_charges[0, ms2[0]])}"
    print("  2 missionary pricing OK (HOLY_ORDER -42 faith; SCRIPTURE 4 charges)")


def poke_missionary_gating(rules, rj, path):
    """3. No buy when: 2 live missionaries already exist (cap), no SHRINE, or the
    Holy Site is incomplete / pillaged."""
    r, j = 0, 0

    def setup(with_shrine=True, hs_complete=True, hs_pillaged=False, prefill=0):
        s = build(rules, path)
        SH, TE = s._shrine_bidx, s._temple_bidx
        isolate_faith(s, r)
        s.civ_faith[:, r + 1] = 500.0
        clear_missionaries(s, r)
        s.city_bldg[:, r + 1, :, SH] = False
        if with_shrine:
            s.city_bldg[0, r + 1, j, SH] = True
        if TE >= 0:
            s.city_bldg[:, r + 1, :, TE] = False
        T_hs = make_holy_site(s, r, j)
        s.district_complete[0, T_hs] = hs_complete
        s.district_pillaged[0, T_hs] = hs_pillaged
        follow_all(s, r + 1)
        # prefill live missionaries with 0 charges (inert: they neither move nor die)
        for _k in range(prefill):
            t = free_tiles(s, 1, banned=set())[0]
            place_missionary(s, r, t, charges=0)
        return s

    # cap: two live missionaries -> no third
    s = setup(prefill=2)
    assert len(live_missionaries(s, r)) == 2
    order_relig_buy(s, r, j)
    s._seat_phase()
    assert len(live_missionaries(s, r)) == 2, "cap breached: a 3rd missionary was bought at cap 2"

    # no shrine
    s = setup(with_shrine=False)
    order_relig_buy(s, r, j)
    s._seat_phase()
    assert len(live_missionaries(s, r)) == 0, "bought a missionary WITHOUT the Shrine"

    # incomplete holy site
    s = setup(hs_complete=False)
    order_relig_buy(s, r, j)
    s._seat_phase()
    assert len(live_missionaries(s, r)) == 0, "bought a missionary on an INCOMPLETE Holy Site"

    # pillaged holy site
    s = setup(hs_pillaged=True)
    order_relig_buy(s, r, j)
    s._seat_phase()
    assert len(live_missionaries(s, r)) == 0, "bought a missionary on a PILLAGED Holy Site"
    print("  3 missionary gating OK (cap 2, no-Shrine, incomplete-HS, pillaged-HS all block)")


# (No approach-walk poke: seeking a distant spread target is the DRIVER's
# policy, not an engine rule. The engine half — SPREAD execution — is poked
# below through the driven applier.)


def drive_spread(sim, r: int, u: int, target: int) -> None:
    """Execute a SPREAD order for civ seat r's unit u through the driven
    applier — the engine half of the verb (re-validated, draws from the shared
    stream), with the column encoded exactly as the driver encodes it
    (SPREAD_HERE when standing on the target, else + direction + 1)."""
    sim.seat_ext[:, r + 1] = True
    smap = sim._seat_slot_map(r + 1)
    row = int((smap[0] == u).nonzero(as_tuple=True)[0][0])
    here = int(sim.major_unit_tile[0, u])
    if here == target:
        col = int(sim._A_SPREAD)
    else:
        col = int(sim._A_SPREAD) + 1 + [int(x) for x in sim.neigh[here].tolist()].index(target)
    seq = torch.full((sim.B, int(smap.shape[1]), 1), -1, dtype=torch.long)
    seq[0, row, 0] = col
    sim.apply_seat_unit_sequence(r + 1, seq)  # the applier takes the ROW


def poke_missionary_spread(rules, rj, path):
    """5. A missionary within 1 of a non-following target adds the lump (10 base,
    15 SCRIPTURE) to that city's accumulator for g, spends a charge, and dies at
    0 charges (tile cleared)."""
    def run(enh_idx, expect_lump, charges):
        sim = build(rules, path)
        E = enh_rows(sim)
        r = 0
        g = r + 1
        clear_missionaries(sim, r)
        sim.civ_religion_done[:, r + 1] = True  # the SPREAD arm's own gate
        if enh_idx is not None:
            sim.civ_enhancer[:, r + 1] = E[enh_idx]
        c = 0
        assert bool(sim.city_alive[0, 0, c])
        ctr = int(sim.city_center[0, 0, c])
        sim.city_followed[0, 0, c] = 0 if g != 0 else 1  # target follows != g
        if sim.n_majors > 1:  # every civ city follows g, so the seat-0 city is the only target
            sim.city_followed[0, 1:sim.n_majors, :sim.RC] = torch.where(sim.city_alive[0, 1:sim.n_majors], torch.full_like(sim.city_followed[0, 1:sim.n_majors, :sim.RC], g), sim.city_followed[0, 1:sim.n_majors, :sim.RC])
        nb = free_neighbor(sim, ctr)
        assert nb >= 0, "no free neighbour of the target center"
        u = place_missionary(sim, r, nb, charges=charges)
        pres0 = int(sim.city_pressure[0, 0, c, g])
        drive_spread(sim, r, u, ctr)
        pres1 = int(sim.city_pressure[0, 0, c, g])
        assert pres1 - pres0 == expect_lump, f"spread lump {pres1 - pres0} != {expect_lump}"
        return sim, u, nb

    # base lump 10, charges 2 -> survives at 1
    sim, u, nb = run(None, 10, charges=2)
    assert bool(sim.major_unit_alive[0, u]) and int(sim.major_unit_charges[0, u]) == 1, "spread must drop a charge and survive at 1"

    # SCRIPTURE lump 15, charges 1 -> dies at 0
    sim2, u2, nb2 = run("SCRIPTURE", 15, charges=1)
    assert not bool(sim2.major_unit_alive[0, u2]), "missionary must die at 0 charges"
    assert int(sim2.civilian_at[0, nb2]) < 0, "dead missionary's tile must be cleared"
    print("  5 missionary spread OK (+10 base / +15 SCRIPTURE, charge -1, death at 0)")


def poke_presr(rules, rj, path):
    """6. ITINERANT_PREACHERS presR widens the religion's spread range by exactly
    2: a city at distance base+2 receives pressure only with the enhancer, and a
    city at base+3 never does."""
    sim = build(rules, path)
    r = 0
    g = r + 1
    E = enh_rows(sim)
    base = int(sim._pressure_range)
    assert int(sim._enh["presR"][E["ITINERANT"] + 1]) == 2, "ITINERANT presR row must be 2"

    # a holy tile A with receivers at exactly base+2 and base+3.
    A = C2 = C3 = -1
    for cand in free_tiles(sim, 600):
        d = sim.pair_dist[cand]
        has2 = bool((d == base + 2).any())
        has3 = bool((d == base + 3).any())
        if has2 and has3:
            A = cand
            C2 = int((d == base + 2).nonzero(as_tuple=True)[0][0])
            C3 = int((d == base + 3).nonzero(as_tuple=True)[0][0])
            break
    assert A >= 0, f"no holy tile with base+2 and base+3 receivers (base {base})"

    # only religion g is founded; two dedicated civ-seat-r slots hold the receivers.
    sim.holy_tile[0] = -1
    sim.holy_tile[0, g] = A
    S2, S3 = 5, 6
    for s, ct in ((S2, C2), (S3, C3)):
        sim.city_alive[0, r + 1, s] = True
        sim.city_center[0, r + 1, s] = ct
        sim.city_pressure[0, r + 1, s] = 0

    def spread_get():
        sim.city_pressure[0, r + 1, S2] = 0
        sim.city_pressure[0, r + 1, S3] = 0
        sim._spread_religious_pressure()
        return int(sim.city_pressure[0, r + 1, S2, g]), int(sim.city_pressure[0, r + 1, S3, g])

    # WITH ITINERANT: range base+2 -> receiver at base+2 gets +1, base+3 nothing.
    sim.civ_enhancer[:, r + 1] = E["ITINERANT"]
    p2, p3 = spread_get()
    assert p2 == 1 and p3 == 0, f"ITINERANT range wrong (base+2 {p2}, base+3 {p3})"

    # WITHOUT the enhancer: range base -> the base+2 receiver gets nothing.
    sim.civ_enhancer[:, r + 1] = -1
    p2n, _ = spread_get()
    assert p2n == 0, f"unenhanced religion reached base+2 ({p2n}) — presR leaked"
    print(f"  6 ITINERANT presR OK (range {base} -> {base + 2}; base+2 in, base+3 out)")


def poke_combat_cs(rules, rj, path):
    """7. Enhancer combat CS adders, probed directly on hand-set planes:
    JUST_WAR +10 near a following city (attacker AND defender), CRUSADE +10
    attacking on following territory, DEFENDER +5 defending on following
    territory."""
    sim = build(rules, path)
    r = 0
    g = r + 1
    E = enh_rows(sim)
    sim.civ_religion_done[:, r + 1] = True
    # seat-0 city 0 follows g; its center is the battle tile (near3 + terr both
    # true there — each enhancer isolates its own channel via the zero terms).
    c = 0
    assert bool(sim.city_alive[0, 0, c])
    ctr = int(sim.city_center[0, 0, c])
    sim.city_followed[0, 0, c] = g
    sim.tile_seat[0, ctr] = 0  # the center tile is seat-0-owned -> terr[g, ctr] true
    sim._rel_planes_cache = None
    seat = torch.tensor([g])  # a religion's id IS its founder's seat
    bt = torch.tensor([ctr])

    sim.civ_enhancer[:, r + 1] = E["JUST_WAR"]
    atk = float(sim._rel_atk_cs(seat, bt)[0])
    dfn = float(sim._rel_def_cs(seat, bt)[0])
    assert atk == 10.0 and dfn == 10.0, f"JUST_WAR near adder wrong (atk {atk}, def {dfn})"

    sim.civ_enhancer[:, r + 1] = E["CRUSADE"]
    atk_c = float(sim._rel_atk_cs(seat, bt)[0])
    assert atk_c == 10.0, f"CRUSADE attack-on-territory adder wrong ({atk_c})"

    sim.civ_enhancer[:, r + 1] = E["DEFENDER"]
    dfn_d = float(sim._rel_def_cs(seat, bt)[0])
    assert dfn_d == 5.0, f"DEFENDER defend-on-territory adder wrong ({dfn_d})"

    # a seat outside the religion id space (a barbarian, a city-state, nobody)
    # gets nothing.
    z = float(sim._rel_atk_cs(torch.tensor([-1]), bt)[0])
    assert z == 0.0, f"a seat with no religion must get no combat bonus ({z})"
    zb = float(sim._rel_atk_cs(torch.tensor([200]), bt)[0])
    assert zb == 0.0, f"a barbarian must get no religious combat bonus ({zb})"

    # no founded religion -> no adder either.
    sim.civ_religion_done[:, r + 1] = False
    sim.civ_enhancer[:, r + 1] = E["JUST_WAR"]
    z2 = float(sim._rel_atk_cs(seat, bt)[0])
    assert z2 == 0.0, f"unfounded religion must give no combat bonus ({z2})"
    print("  7 enhancer combat CS OK (JUST_WAR +10 atk/def, CRUSADE +10 atk, DEFENDER +5 def)")


def poke_messenger_route(rules, rj, path):
    """8. MESSENGER_OF_THE_GODS adds +2 gold +2 faith to a domestic route whose
    destination city follows this civ seat's religion (r+1), isolated by a
    with-vs-without-enhancer diff on _seat_route_income."""
    sim = build(rules, path)
    r = 0
    g = r + 1
    E = enh_rows(sim)
    sim.civ_religion_done[:, r + 1] = True
    sim.war[:, 0, 1 + r] = sim.war[:, 1 + r, 0] = False
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    sim.barb_unit_alive[:] = False
    sim.military_at[:] = -1  # no raiders left to suspend the route

    # two dedicated civ-seat-r cities well apart; a single domestic route between.
    FROM, DEST = 5, 6
    tiles = free_tiles(sim, 2)
    for s, ct in ((FROM, tiles[0]), (DEST, tiles[1])):
        sim.city_alive[0, r + 1, s] = True
        sim.city_center[0, r + 1, s] = ct
        sim.city_dist_tile[0, r + 1, s] = -1  # no specialty districts -> per = 1
    sim.city_id[0, r + 1, FROM] = 4100
    sim.city_id[0, r + 1, DEST] = 4101
    sim.city_followed[0, r + 1, DEST] = g  # destination follows this civ's religion
    sim.seat_routes[:, r + 1] = -1
    sim.seat_routes[0, r + 1, 0, 0] = 4100
    sim.seat_routes[0, r + 1, 0, 1] = 4101

    def income(enh_idx):
        sim.civ_enhancer[:, r + 1] = enh_idx
        sim._seat_route_cache = None
        inc = sim._seat_route_income(r + 1)
        assert inc is not None, "route income None with a live domestic route"
        # engine yield order: food, prod, gold, sci, cul, faith
        return float(inc[0, FROM, 2]), float(inc[0, FROM, 5])

    g0, f0 = income(-1)
    gM, fM = income(E["MESSENGER"])
    assert abs((gM - g0) - 2.0) < 1e-9, f"MESSENGER gold term wrong (+{gM - g0})"
    assert abs((fM - f0) - 2.0) < 1e-9, f"MESSENGER faith term wrong (+{fM - f0})"

    # a destination NOT following g gets no Messenger term.
    sim.city_followed[0, r + 1, DEST] = 0 if g != 0 else 1
    g1, f1 = income(E["MESSENGER"])
    assert abs(g1 - g0) < 1e-9 and abs(f1 - f0) < 1e-9, "Messenger term leaked to a non-following destination"
    print("  8 MESSENGER route OK (+2 gold +2 faith on a following-dest domestic route)")


def poke_victor_direct(rules, rj, path):
    """9. _religious_victor direct: seat 0 wins (0), a civ seat wins (g), the
    not-every-seat refusal (-1), and the cityless-seat exclusion."""
    sim = build(rules, path)
    assert sim.n_majors >= 2, "need at least one civ"
    r = 0
    g = r + 1

    def set_follow(pg, rg_map):
        """pg = seat 0's religion; rg_map[ri] = each civ seat's religion (None
        leaves that seat cityless)."""
        sim.city_followed[0, 0, :sim.RC] = torch.where(sim.city_alive[0, 0], torch.full_like(sim.city_followed[0, 0, :sim.RC], pg), torch.full_like(sim.city_followed[0, 0, :sim.RC], -1))
        for row in range(1, sim.n_majors):
            val = rg_map.get(row - 1, None)
            if val is None:
                sim.city_alive[0, row] = False
            else:
                sim.city_followed[0, row] = torch.where(sim.city_alive[0, row], torch.full_like(sim.city_followed[0, row], val), torch.full_like(sim.city_followed[0, row], -1))

    # seat 0 wins: religion 0 founded, everyone follows 0.
    sim.holy_tile[0] = -1
    sim.holy_tile[0, 0] = 0
    set_follow(0, {ri: 0 for ri in range(sim.n_majors - 1)})
    assert int(sim._religious_victor()[0]) == 0, "seat-0-predominant religion 0 must win"

    # a civ seat wins: only g founded, everyone follows g.
    sim2 = build(rules, path)
    sim2.holy_tile[0] = -1
    sim2.holy_tile[0, g] = 0
    sim2.city_followed[0, 0, :sim2.RC] = torch.where(sim2.city_alive[0, 0], torch.full_like(sim2.city_followed[0, 0, :sim2.RC], g), torch.full_like(sim2.city_followed[0, 0, :sim2.RC], -1))
    for ri in range(sim2.n_majors - 1):
        sim2.city_followed[0, ri + 1] = torch.where(sim2.city_alive[0, ri + 1], torch.full_like(sim2.city_followed[0, ri + 1], g), torch.full_like(sim2.city_followed[0, ri + 1], -1))
    assert int(sim2._religious_victor()[0]) == g, f"civ religion {g} must win"

    # refusal: g founded and predominant in seat 0's cities, but a civ seat with
    # cities follows a different religion -> no g everywhere, and no other g
    # founded -> -1.
    sim3 = build(rules, path)
    sim3.holy_tile[0] = -1
    sim3.holy_tile[0, g] = 0
    sim3.city_followed[0, 0, :sim3.RC] = torch.where(sim3.city_alive[0, 0], torch.full_like(sim3.city_followed[0, 0, :sim3.RC], g), torch.full_like(sim3.city_followed[0, 0, :sim3.RC], -1))
    assert bool(sim3.city_alive[0, 1].any()), "civ 0 must hold a city for the refusal shape"
    sim3.city_followed[0, 0 + 1] = torch.where(sim3.city_alive[0, 1], torch.full_like(sim3.city_followed[0, 0 + 1], g + 1), torch.full_like(sim3.city_followed[0, 0 + 1], -1))
    for ri in range(1, sim3.n_majors - 1):
        sim3.city_followed[0, ri + 1] = torch.where(sim3.city_alive[0, ri + 1], torch.full_like(sim3.city_followed[0, ri + 1], g), torch.full_like(sim3.city_followed[0, ri + 1], -1))
    assert int(sim3._religious_victor()[0]) == -1, "a dissenting civ civ must refuse the victory"

    # cityless exclusion: the same dissenting seat, but eliminated (no cities),
    # drops out of the every-seat test -> g wins.
    sim3.city_alive[0, 1] = False
    assert int(sim3._religious_victor()[0]) == g, "a cityless civ must be excluded from the every-civ requirement"
    print("  9 religious victor (direct) OK (seat 0, civ g, refusal -1, cityless excluded)")


def poke_victor_through_step(rules, rj, path):
    """10. Through a real step: preload pressure so _spread_religious_pressure
    flips every seat's cities to g, then _religious_victor at the step tail sets
    victory_type 4 (religion), victory_row = the winner, and game_over."""
    def drive(g, want_vt):
        sim = build(rules, path, steps=12)
        # freeze expansion so no fresh 0-pressure city breaks the majority: kill
        # every unit (settlers can't found) and idle every civ build queue.
        if sim.units_mode:
            sim.major_unit_alive[:] = False
            _pl = sim.military_at  # clear only this pool's entries
            _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
            _pl = sim.civilian_at  # clear only this pool's entries
            _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
        sim.major_unit_alive[:] = False
        _pl = sim.military_at  # clear only this pool's entries
        _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
        _pl = sim.civilian_at  # clear only this pool's entries
        _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1
        sim.barb_unit_alive[:] = False
        _pl = sim.military_at  # clear only this pool's entries
        _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
        if sim.n_majors > 1:
            sim.city_current[:, 1:sim.n_majors] = -1
            sim.city_progress[:, 1:sim.n_majors] = 0.0
            sim.city_cost[:, 1:sim.n_majors] = 1.0e9
            sim.civ_treasury[:, 1:] = 0.0
            sim.civ_faith[:, 1:] = 0.0
            sim.seat_ext[:, 1:sim.n_majors] = False
        # only religion g founded; preload an overwhelming g-pressure everywhere.
        sim.holy_tile[0] = -1
        sim.holy_tile[0, g] = int(sim.city_center[0, 0, sim.city_alive[0, 0].nonzero(as_tuple=True)[0][0]]) if g == 0 else 0
        sim.city_pressure[0, 0, :sim.RC] = 0
        sim.city_pressure[0, 0, :sim.RC, g] = torch.where(sim.city_alive[0, 0], torch.full((sim.RC,), 9000, dtype=sim.city_pressure[:, 0].dtype), torch.zeros(sim.RC, dtype=sim.city_pressure[:, 0].dtype))
        if sim.n_majors > 1:
            sim.city_pressure[0, 1:sim.n_majors, :sim.RC] = 0
            sim.city_pressure[0, 1:sim.n_majors, :sim.RC, g] = torch.where(sim.city_alive[0, 1:sim.n_majors], torch.full((sim.n_majors - 1, sim.RC), 9000, dtype=sim.city_pressure.dtype), torch.zeros((sim.n_majors - 1, sim.RC), dtype=sim.city_pressure.dtype))
        sim.step()
        return sim

    sim = drive(0, 5)
    assert int(sim.victory_type[0]) == 4, f"a religious victory is victory_type 4 (got {int(sim.victory_type[0])})"
    assert int(sim.victory_row[0]) == 0, f"victory_row must name seat 0 (got {int(sim.victory_row[0])})"
    assert bool(sim.game_over[0]), "seat-0 religious victory must end the game"

    sim2 = drive(1, 6)
    assert int(sim2.victory_type[0]) == 4, f"a religious victory is victory_type 4 (got {int(sim2.victory_type[0])})"
    assert int(sim2.victory_row[0]) >= 1, f"victory_row must name the winning civ row (got {int(sim2.victory_row[0])})"
    assert bool(sim2.game_over[0]), "civ religious victory must end the game"
    print("  10 religious victor (through-step) OK (seat 0 -> 5, civ -> 6, game_over)")


def poke_theo_location(rules, rj, path):
    """11. `_theo_def_strength` — the DEFENDER's location bonuses. CIV6: "+5" in
    the territory of a city following this religion, "+15" in the territory of
    that religion's Holy City, plus a defensive tile IMPROVEMENT, and NOTHING
    from physical terrain."""
    sim = build(rules, path)
    r = 0
    g = r + 1
    sim.civ_religion_done[:, g] = True
    c = 0
    assert bool(sim.city_alive[0, 0, c])
    ctr = int(sim.city_center[0, 0, c])
    tile = torch.tensor([ctr])
    seat = torch.tensor([g])

    sim.city_followed[0, 0, c] = -1
    sim.holy_tile[0, g] = -1
    sim.tile_seat[0, ctr] = 0
    sim._rel_planes_cache = None
    assert int(sim._theo_def_strength(seat, tile)[0]) == 0, "no following city, no bonus"

    sim.city_followed[0, 0, c] = g
    sim._rel_planes_cache = None
    ground = int(sim._theo_def_strength(seat, tile)[0])
    assert ground == sim._theo_holy_ground, f"Holy Ground must be {sim._theo_holy_ground}, got {ground}"

    # the same territory, now this religion's HOLY CITY: the two stack
    sim.holy_tile[0, g] = ctr
    both = int(sim._theo_def_strength(seat, tile)[0])
    assert both == sim._theo_holy_ground + sim._theo_holy_city, \
        f"Holy City territory must add {sim._theo_holy_city}, got {both}"

    # a HILL is terrain and contributes nothing; a FORT is an improvement
    sim.hills[0, ctr] = True
    assert int(sim._theo_def_strength(seat, tile)[0]) == both, "physical terrain must not count"
    if sim.FORT >= 0:
        sim.improvement[0, ctr] = sim.FORT
        assert int(sim._theo_def_strength(seat, tile)[0]) == both + sim._fort_def_cs, \
            "a FORT is an improvement and does count"
        sim.improvement[0, ctr] = -1

    # a seat with no religion of its own reads nothing
    assert int(sim._theo_def_strength(torch.tensor([200]), tile)[0]) == 0
    print(f"  11 theo location OK (+{sim._theo_holy_ground} ground, "
          f"+{sim._theo_holy_city} holy city, +{sim._fort_def_cs} fort, terrain 0)")


def poke_religious_heal(rules, rj, path):
    """12. `_religious_heal` — CIV6: religious units "Heal only when standing on
    or next to a Holy Site in their own territory", at "3 times the Faith output
    of the Holy Site"; a military unit keeps the ordinary ladder."""
    sim = build(rules, path)
    r = 0
    g = r + 1
    isolate_faith(sim, r)
    j = 0
    assert bool(sim.city_alive[0, g, j])
    # one Holy Site in the whole world, so "no site in reach" means exactly that
    _wipe = sim.district[0] == sim._hs_idx
    sim.district[0, _wipe] = -1
    hs = make_holy_site(sim, r, j)
    sim.tile_seat[0, hs] = g
    sim.tile_city[0, hs] = int(sim.city_id[0, g, j])
    # a SHRINE stands INSIDE the Holy Site, so its faith is the site's output
    sim.city_bldg[:, g, :, sim._shrine_bidx] = False
    sim.city_bldg[0, g, j, sim._shrine_bidx] = True
    sim._eff_version += 1
    faith = int(sim._holy_site_faith()[0, hs])
    assert faith > 0, "the poke needs a site that actually produces faith"

    slot = place_missionary(sim, r, hs, 3)
    heal = sim._religious_heal("major")
    assert int(heal[0, slot]) == faith * sim._relig_heal_per_faith, \
        f"on the site: {int(heal[0, slot])} != 3 x {faith}"

    # NEXT to it heals the same; two tiles away heals nothing
    nb = next((int(t) for t in sim.neigh[hs].tolist()
               if t >= 0 and int(sim.civilian_at[0, int(t)]) < 0), -1)
    assert nb >= 0, "the Holy Site has no free neighbour to stand on"
    sim.civilian_at[0, hs] = -1
    sim.major_unit_tile[0, slot] = nb
    sim.civilian_at[0, nb] = slot + sim.POOL_LO["major"]
    sim.tile_seat[0, nb] = g
    assert int(sim._religious_heal("major")[0, slot]) == faith * sim._relig_heal_per_faith, \
        "a site NEXT DOOR heals just as well"

    far = next(t for t in free_tiles(sim, 12) if int(sim.pair_dist[hs, t]) >= 2)
    sim.civilian_at[0, nb] = -1
    sim.major_unit_tile[0, slot] = far
    sim.civilian_at[0, far] = slot + sim.POOL_LO["major"]
    sim.tile_seat[0, far] = g
    assert int(sim._religious_heal("major")[0, slot]) == 0, "no site in reach, no heal"

    # FOREIGN territory: the same site, the wrong owner
    sim.civilian_at[0, far] = -1
    sim.major_unit_tile[0, slot] = hs
    sim.civilian_at[0, hs] = slot + sim.POOL_LO["major"]
    sim.tile_seat[0, hs] = 0
    assert int(sim._religious_heal("major")[0, slot]) == 0, \
        "a Holy Site in someone else's territory heals nobody"
    sim.tile_seat[0, hs] = g

    # a PILLAGED site produces no faith and so heals nothing
    sim.district_pillaged[0, hs] = True
    sim._eff_version += 1
    assert int(sim._holy_site_faith()[0, hs]) == 0
    assert int(sim._religious_heal("major")[0, slot]) == 0
    sim.district_pillaged[0, hs] = False
    sim._eff_version += 1

    # and the ORDINARY ladder still answers for a military unit
    heal_all = sim._seat_heal("major")
    assert int(heal_all[0, slot]) == faith * sim._relig_heal_per_faith, \
        "_seat_heal must route a religious unit to its own rule"
    print(f"  12 religious heal OK (site faith {faith} -> "
          f"{faith * sim._relig_heal_per_faith} HP on and beside it, 0 elsewhere)")


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"religion2_test on {path.name}")

    poke_missionary_buy(rules, rj, path)
    poke_missionary_pricing(rules, rj, path)
    poke_missionary_gating(rules, rj, path)
    poke_missionary_spread(rules, rj, path)
    poke_presr(rules, rj, path)
    poke_combat_cs(rules, rj, path)
    poke_messenger_route(rules, rj, path)
    poke_victor_direct(rules, rj, path)
    poke_victor_through_step(rules, rj, path)
    poke_theo_location(rules, rj, path)
    poke_religious_heal(rules, rj, path)
    print("RELIGION2 (B6) POKES OK")


if __name__ == "__main__":
    main()
