"""The GOLDEN movement dedications: +2 MP, for whichever seat holds them.

    python gpu/golden_move_test.py

SOURCE (Civilopedia, Gathering Storm):
  MONUMENTALITY — "If chosen at the start of a Golden Age, +2 Movement for all
    Builders."
  EXODUS OF THE EVANGELISTS — "If chosen at the start of a Golden Age, +2
    Movement for all Missionaries, Apostles, and Inquisitors." This roster has
    no INQUISITOR, so MISSIONARY and APOSTLE are the whole class.

WHY THIS LANE EXISTS. B-24 (#79) implemented both, hunted them, and reverted:
scripted parity went green but the off-script gate diverged on the rng DRAW
COUNT, because TS kept movement points as STATE while the GPU kept none and
rebuilt `full_mp` inside every walker. #51/S5.1-S5.3 removed that split, and
this is the lane that pins the re-landed rule.

Every assertion has its NEGATIVE twin — the same unit without the dedication,
a unit of the wrong class, a barbarian, an embarked unit — so the lane cannot
pass by handing everything +2.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import BARB_SEAT, PLAYER_SEAT


def build() -> BatchSim:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))[:1]
    return BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)


def put(sim: BatchSim, pre: str, type_idx: int, seat: int, civ: int = 0) -> int:
    """Park a unit of `type_idx` in the given pool and return its slot."""
    counter = {"p": "p_next", "v": "v_next", "u": "next_slot"}[pre]
    slot = int(getattr(sim, counter)[0])
    getattr(sim, f"{pre}_alive")[0, slot] = True
    getattr(sim, f"{pre}_type")[0, slot] = type_idx
    getattr(sim, f"{pre}_seat")[0, slot] = seat
    getattr(sim, f"{pre}_emb")[0, slot] = False
    getattr(sim, f"{pre}_aura_mp")[0, slot] = 0
    if pre == "v":
        sim.v_civ[0, slot] = civ
    getattr(sim, counter)[0] += 1
    return slot


def full(sim: BatchSim, pre: str, slot: int) -> int:
    return int(sim._full_mp(pre)[0, slot])


def base(sim: BatchSim, type_idx: int) -> int:
    return int(sim._p_moves[type_idx])


def golden(sim: BatchSim, civ: int, kind: int) -> None:
    sim.civ_age[0, civ] = 2
    sim.ded_picks[0, civ, 0] = kind


def main() -> None:
    sim = build()
    bonus = sim._golden_move
    assert bonus > 0, (
        "eras.goldenMoveBonus is 0 — gpu/fixtures/rules.json is STALE. "
        "Re-run `npx vite-node scripts/export-gpu.ts`."
    )
    mono, exo = sim._ded_monumentality, sim._ded_exodus
    bld, mis, apo = sim._builder_idx, sim._missionary_idx, sim._apostle_idx
    assert bld >= 0 and mis >= 0 and apo >= 0, "roster indices missing"

    # ---- 1. no dedication -> no bonus, for every class ---------------------
    p_bld = put(sim, "p", bld, PLAYER_SEAT)
    v_mis = put(sim, "v", mis, 1, civ=0)
    v_apo = put(sim, "v", apo, 1, civ=0)
    assert full(sim, "p", p_bld) == base(sim, bld), "a Builder with no Golden age gained MP"
    assert full(sim, "v", v_mis) == base(sim, mis), "a Missionary with no Golden age gained MP"
    print(f"  1 no dedication: builder {full(sim, 'p', p_bld)}, missionary {full(sim, 'v', v_mis)} — unchanged")

    # ---- 2. MONUMENTALITY lifts BUILDERS, and only builders ---------------
    v_bld = put(sim, "v", bld, 1, civ=0)
    v_war = put(sim, "v", 2, 1, civ=0)  # WARRIOR — never a dedication class
    golden(sim, 0, mono)  # the PLAYER's civ index is 0
    golden(sim, 1, mono)  # rival 0 is unified civ 1
    assert full(sim, "p", p_bld) == base(sim, bld) + bonus, "MONUMENTALITY missed the player's Builder"
    assert full(sim, "v", v_bld) == base(sim, bld) + bonus, "MONUMENTALITY missed the RIVAL's Builder"
    assert full(sim, "v", v_war) == base(sim, 2), "MONUMENTALITY reached a WARRIOR"
    assert full(sim, "v", v_mis) == base(sim, mis), "MONUMENTALITY reached a Missionary"
    print(f"  2 MONUMENTALITY: builder {base(sim, bld)} -> {full(sim, 'p', p_bld)} for player AND rival; warrior/missionary untouched")

    # ---- 3. EXODUS lifts MISSIONARY + APOSTLE, and only those -------------
    sim2 = build()
    p_bld2 = put(sim2, "p", bld, PLAYER_SEAT)
    v_mis2 = put(sim2, "v", mis, 1, civ=0)
    v_apo2 = put(sim2, "v", apo, 1, civ=0)
    golden(sim2, 1, exo)
    assert full(sim2, "v", v_mis2) == base(sim2, mis) + bonus, "EXODUS missed the Missionary"
    assert full(sim2, "v", v_apo2) == base(sim2, apo) + bonus, "EXODUS missed the Apostle"
    assert full(sim2, "p", p_bld2) == base(sim2, bld), "EXODUS reached a Builder"
    print(f"  3 EXODUS: missionary {base(sim2, mis)} -> {full(sim2, 'v', v_mis2)}, apostle {base(sim2, apo)} -> {full(sim2, 'v', v_apo2)}; builder untouched")

    # ---- 4. a DARK/NORMAL age holding the same dedication pays nothing ----
    sim2.civ_age[0, 1] = 1
    assert full(sim2, "v", v_mis2) == base(sim2, mis), "a NORMAL age paid the golden bonus"
    print("  4 same dedication, NORMAL age — no bonus (a Golden age takes bonuses, a Dark one era score)")

    # ---- 5. barbarians hold no dedications -------------------------------
    sim3 = build()
    u_bld = put(sim3, "u", bld, BARB_SEAT)
    for civ in range(sim3.civ_age.shape[1]):
        golden(sim3, civ, mono)
    assert full(sim3, "u", u_bld) == base(sim3, bld), "a BARBARIAN drew a golden dedication"
    print("  5 barbarian seat: no dedication, no bonus, even with every civ golden")

    # ---- 6. an EMBARKED unit keeps the flat pool -------------------------
    if sim3._embark_live:
        sim4 = build()
        v_b = put(sim4, "v", bld, 1, civ=0)
        golden(sim4, 1, mono)
        assert full(sim4, "v", v_b) == base(sim4, bld) + bonus
        sim4.v_emb[0, v_b] = True
        assert full(sim4, "v", v_b) == sim4._embark_moves, (
            "an EMBARKED builder took the dedication onto the embark pool — "
            "embarkation speed is not a unit's own movement (TS unitFullMoves)"
        )
        print(f"  6 embarked: {base(sim4, bld) + bonus} -> {sim4._embark_moves} (the flat pool, bonus dropped)")

    # ---- 7. #51/S5.5: the OTHER three faces are keyed on the seat too ----
    # They were called with a hardcoded civ 0, so a rival in a Golden age got
    # the research discount / prophet points / culture of a civ that was not it.
    sim5 = build()
    if sim5.R > 0:
        fi, pb = sim5._ded_free_inquiry, sim5._ded_pen_brush
        cost = torch.full((sim5.B,), 200.0, dtype=sim5.dtype)
        boosted = torch.ones(sim5.B, dtype=torch.bool)
        plain = sim5._eff_cost(cost, boosted)
        golden(sim5, 1, fi)  # rival 0 = unified civ 1
        rival_g = sim5._eff_cost(cost, boosted, golden_civ=1)
        assert float(rival_g[0]) < float(plain[0]), (
            "a RIVAL in a golden FREE_INQUIRY got no extra discount — the call "
            "site is still asking about civ 0"
        )
        # ...and the PLAYER's Golden age must not pay for the rival
        sim6 = build()
        golden(sim6, 0, fi)
        assert float(sim6._eff_cost(cost, boosted, golden_civ=1)[0]) == float(plain[0]), (
            "the PLAYER's dedication discounted a RIVAL's research"
        )
        print(f"  7 FREE_INQUIRY: rival cost {float(plain[0]):.0f} -> {float(rival_g[0]):.0f}; the player's own age does not pay for it")

        # EXODUS's +4 prophet points and PEN_BRUSH's culture read the same table
        assert bool(sim5._golden_ded(1, fi)[0]) and not bool(sim5._golden_ded(0, fi)[0])
        sim7 = build()
        golden(sim7, 1, pb)
        assert bool(sim7._golden_ded(1, pb)[0]), "PEN_BRUSH unreachable for a rival"
        assert not bool(sim7._golden_ded(0, pb)[0]), "PEN_BRUSH leaked to the player"
        print("  8 per-seat table: a dedication answers for the civ that committed it, and only that civ")

    print("GOLDEN MOVE (B-24) OK — +2 MP for the seat that holds the dedication")


if __name__ == "__main__":
    main()
