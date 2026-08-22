"""PROMOTIONS — the ladder, the head, the evaluator and the XP award.

    python tests/gpu/promotions_test.py

The serve gate can only prove the two engines agree on the games it plays;
this lane proves the RULES, against the sourced numbers, on surfaces a
250-turn scripted game barely scratches: the 15-per-level ladder, the
without-replacement Apostle draw, the prerequisite chain, every conditional
Combat Strength kind, and the exact-integer XP award both engines share.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import (
    MAX_LEVEL, PROMOTE_HEAL, XP_BATTLE_CAP, XP_CITY_ATTACK, XP_CITY_FELLED,
    XP_PER_LEVEL,
)
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(8):
        sim.step()
    return sim


def cls_of(sim, name: str) -> int:
    return list(sim.rules.promo_classes).index(name)


def type_in_class(sim, name: str) -> int:
    """the first chassis that promotes from this class."""
    c = cls_of(sim, name)
    hit = (sim.rules_dev.u_promo_class == c).nonzero(as_tuple=True)[0]
    assert hit.numel(), f"no chassis promotes from {name}"
    return int(hit[0])


def test_catalog(sim) -> None:
    rd = sim.rules_dev
    n = len(rd.promo_classes)
    assert n >= 10, f"{n} promotion classes, expected the nine military ones and the Apostle"
    # CIV6: "A unit reaches its maximum level at level 8 when it earns all 7
    # possible Promotions" — every military tree offers at least those seven.
    for c in range(n):
        rows = int(rd.promo_rows[c])
        assert rows >= MAX_LEVEL - 1 or rd.promo_classes[c] == "APOSTLE", \
            f"class {rd.promo_classes[c]} holds {rows} rows, fewer than the 7 a unit can earn"
        assert rows <= rd.promo_cols, f"class {rd.promo_classes[c]} overflows the PROMOTE head"
    # every civilian chassis promotes from nothing
    for t in range(sim.NU):
        if bool(sim._type_civilian[t]) and t not in (sim._apostle_idx, getattr(sim, "_inquisitor_idx", -1)):
            assert int(rd.u_promo_class[t]) < 0, f"unit type {t} is a civilian with a promotion tree"
    print(f"  catalog OK — {n} classes, {int(rd.promo_rows.sum())} rows, head {rd.promo_cols} wide")


def test_ladder(sim) -> None:
    lv = torch.arange(1, MAX_LEVEL + 1)
    owed = sim._xp_to_next(lv).tolist()
    assert owed == [15, 30, 45, 60, 75, 90, 105, 0], f"the ladder reads {owed}"
    total, cum = 0, []
    for x in owed[:-1]:
        total += x
        cum.append(total)
    assert cum == [15, 45, 90, 150, 225, 315, 420], f"cumulative {cum}"
    # the pool clamps at the requirement and stops
    lvl = torch.tensor([1, 1, 1, MAX_LEVEL])
    xp = torch.tensor([0, 8, 15, 0])
    got = sim._bank_xp(xp, lvl, torch.tensor([8, 8, 8, 8])).tolist()
    assert got == [8, 15, 15, 0], f"bankXp gave {got}"
    print("  ladder OK — 15 x the level, capped at 7 promotions, no excess carried")


def test_award(sim) -> None:
    one = torch.ones(1, dtype=torch.long)
    def bx(own, foe, died=False, ranged=False, init=False, pct=0, mult=1):
        return int(sim._battle_xp(
            one * own, one * foe, foe_died=one.bool() * died, ranged=ranged,
            initiated=init, pct=one * pct, mult=one * mult)[0])
    assert bx(20, 20) == 3, "a plain melee battle pays the +2 term"
    assert bx(20, 20, init=True) == 4, "the initiator's +1"
    assert bx(20, 20, ranged=True) == 2, "a ranged battle pays +1, not +2"
    assert bx(20, 20, died=True) == 4, "a kill doubles the base"
    assert bx(10, 25) == 5, "0.5 rounds UP"
    assert bx(10, 200) == XP_BATTLE_CAP, "unit battles cap at 8"
    assert bx(20, 20, pct=100) == 6 and bx(20, 20, mult=2) == 6, "the modifiers ride the base"
    assert bx(0, 20) == 0, "a chassis with no strength banks nothing"
    cx = lambda base, pct=0, mult=1: int(sim._city_xp(one * base, one * pct, one * mult)[0])
    assert cx(XP_CITY_ATTACK) == XP_CITY_ATTACK and cx(XP_CITY_FELLED) == XP_CITY_FELLED, \
        "city XP is not capped at 8"
    assert cx(3, 50) == 5, "4.5 rounds up"
    print("  award OK — foeCS/ownCS, the kill doubling, the caps and the rounding")


def test_evaluator(sim) -> None:
    rd = sim.rules_dev
    mel = type_in_class(sim, "MELEE")
    t = torch.tensor([mel])
    # BATTLECRY sits at column 0 of the MELEE list: +7 attacking melee/ranged/anticav
    held = torch.tensor([1])
    yes = torch.ones(1, dtype=torch.bool)
    no = torch.zeros(1, dtype=torch.bool)
    atk_vs_mel = int(sim._promo_cs(t, held, attacking=yes, foe_type=t)[0])
    assert atk_vs_mel > 0, "the first MELEE promotion pays nothing attacking a melee foe"
    assert int(sim._promo_cs(t, held, attacking=no, foe_type=t)[0]) == 0, \
        "an attack-only promotion paid on defence"
    cav = type_in_class(sim, "HEAVY_CAV")
    assert int(sim._promo_cs(t, held, attacking=yes, foe_type=torch.tensor([cav]))[0]) == 0, \
        "the class mask let a cavalry foe through"
    assert int(sim._promo_cs(t, torch.tensor([0]), attacking=yes, foe_type=t)[0]) == 0, \
        "a unit holding nothing scored a promotion bonus"
    # a slot the class does not own is never read
    lone = torch.tensor([1 << (rd.promo_cols - 1)])
    if int(rd.promo_rows[cls_of(sim, "MELEE")]) < rd.promo_cols:
        assert int(sim._promo_cs(t, lone, attacking=yes, foe_type=t)[0]) == 0, \
            "a bit past the end of the class list was scored"
    # `inDistrictTile` asks `!!t.district`, which a CITY CENTRE satisfies:
    # two promotions read the answer about the other side, so the centre
    # registry has to count here as well as the placeable-district plane.
    ctr = int(sim.city_center[0, 0, 0])
    plain = next(i for i in range(sim.T)
                 if int(sim.centre_slot_at[0, i]) < 0 and int(sim.district[0, i]) < 0
                 and (sim.FORT < 0 or int(sim.improvement[0, i]) != sim.FORT))
    probe = torch.tensor([[ctr, plain]], dtype=torch.long).expand(sim.B, 2)
    on = sim._on_district(probe)
    assert bool(on[0, 0]), "a unit on a city CENTRE is not in a district"
    assert not bool(on[0, 1]), "a bare tile reads as a district"
    print("  evaluator OK — attacking, the class mask, the end of the list, the centre")


def test_mask_and_apply(sim) -> None:
    rd = sim.rules_dev
    row = 0
    slot = int(sim.unit_next[0])
    sim.unit_next[0] += 1
    mel = type_in_class(sim, "MELEE")
    ctr = int(sim.city_center[0, row, 0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = mel
    sim.major_unit_tile[0, slot] = ctr
    sim.major_unit_hp[0, slot] = 40
    sim.major_unit_level[0, slot] = 1
    sim.major_unit_xp[0, slot] = 0
    sim.major_unit_promos[0, slot] = 0
    sim.major_unit_promo_offer[0, slot] = 0

    sc = torch.tensor([[slot + sim.POOL_LO["major"]]])
    ty = torch.tensor([[mel]])
    assert not bool(sim._promo_offer_mask(sc, ty).any()), "a unit owed XP was offered a promotion"
    sim.major_unit_xp[0, slot] = XP_PER_LEVEL
    open_now = sim._promo_offer_mask(sc, ty)[0, 0]
    n_rows = int(rd.promo_rows[cls_of(sim, "MELEE")])
    assert bool(open_now[0]), "the first rung is not open at level 2"
    assert not bool(open_now[n_rows:].any()), "a column past the class list is open"
    deep = [k for k in range(n_rows) if int(rd.promo_req[cls_of(sim, "MELEE"), k]) != 0]
    assert deep, "the MELEE tree has no prerequisite rows"
    assert not bool(open_now[deep[0]]), "a tier-2 row opened with no prerequisite held"

    # the applier: bit, level, xp, heal, and the turn
    sim.major_unit_mp[0, slot] = 2
    sim.seat_ext[:, row] = True
    smap = sim._seat_slot_map(row)
    rank = int((smap[0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert int(smap[0, rank]) == slot + sim.POOL_LO["major"], "the unit is not in its seat's slot map"
    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[0, rank] = sim._A_PROMOTE
    sim._apply_seat_unit_actions(row, a)
    assert int(sim.major_unit_promos[0, slot]) == 1, "the promotion bit did not land"
    assert int(sim.major_unit_level[0, slot]) == 2, "the level did not rise"
    assert int(sim.major_unit_xp[0, slot]) == 0, "the pool did not reset"
    assert int(sim.major_unit_hp[0, slot]) == 40 + PROMOTE_HEAL, "the 50 HP were not paid"
    assert int(sim.major_unit_mp[0, slot]) == 0, "the turn did not end"

    # the deep row is open NOW, and the held one is not
    open2 = sim._promo_offer_mask(sc, ty)[0, 0]
    assert not bool(open2.any()), "a unit with no XP was offered another rung"
    sim.major_unit_xp[0, slot] = XP_PER_LEVEL * 2
    open3 = sim._promo_offer_mask(sc, ty)[0, 0]
    assert not bool(open3[0]), "a held promotion was offered twice"
    assert bool(open3[deep[0]]), "the prerequisite did not open its child"
    print("  mask+apply OK — the prerequisite chain, the bit, the heal and the spent turn")


def test_apostle_offer(sim) -> None:
    rd = sim.rules_dev
    cls = int(rd.u_promo_class[sim._apostle_idx])
    n = int(rd.promo_rows[cls])
    assert n >= 3, f"the apostle list holds {n} rows, fewer than the three it draws from"
    seen = set()
    for _ in range(24):
        slot = int(sim.unit_next[0])
        sim.unit_next[0] += 1
        sim.major_unit_type[0, slot] = sim._apostle_idx
        sim.major_unit_promos[0, slot] = 0
        before = int(sim.rng_state[0])
        sim._offer_apostle_promos(0, torch.tensor([True]))
        assert int(sim.rng_state[0]) != before, "the offer drew nothing"
        off = int(sim.major_unit_promo_offer[0, slot])
        assert bin(off).count("1") == sim._apostle_promo_offer, \
            f"the offer holds {bin(off).count('1')} columns, want {sim._apostle_promo_offer}"
        assert off < (1 << n), "the offer names a column the apostle list does not have"
        assert int(sim.major_unit_xp[0, slot]) == XP_PER_LEVEL, "the apostle cannot take its one rung"
        seen |= {k for k in range(n) if (off >> k) & 1}
    assert len(seen) > sim._apostle_promo_offer, "24 draws never left the same three columns"
    print(f"  apostle OK — three distinct columns a draw, {len(seen)}/{n} rows reached over 24")


def main() -> None:
    sim = build()
    assert sim._A_PROMOTE >= 0, "no PROMOTE head in the action enum"
    test_catalog(sim)
    test_ladder(sim)
    test_award(sim)
    test_evaluator(sim)
    test_mask_and_apply(sim)
    test_apostle_offer(sim)
    print("PROMOTIONS OK")


if __name__ == "__main__":
    main()
