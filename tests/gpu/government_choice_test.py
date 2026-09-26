"""THE GOVERNMENT CHOICE — the GPU half.

    python tests/gpu/government_choice_test.py

The TS twin is tests/cpu/seats/government-choice.test.ts.

A seat's government is a DRIVER decision on the wire: the record's
`government` names a roster position, `_adopt_government` validates it
against `_gov_open` (unlocked by the civics, never a government the seat has
been in before — a return is Anarchy, which no seat enters) and stores it in
`civ_gov_chosen`, where it stands until another record names one. A seat no
record has chosen for is in the newest government its civics unlock
(`_adopted_gov`). A change marks the new government held and carries the
slotted cards that still fit.

  1. the default is the newest tier; the record reaches every tier-mate and
     pays its bonus.
  2. a locked government and a return to a held one are refused.
  3. the choice stands when a newer tier unlocks; a change carries the cards.
  4. the record round-trips (`extract_record` / `replay_seat`), the
     observation carries `government` and `gov_open`, the compare renders
     the choice, and the driver's style pick takes every tier-mate across
     games.
"""

from __future__ import annotations

import inspect
import json
import sys
from pathlib import Path

import torch

_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_ROOT / "gpu"))
sys.path.insert(0, str(_ROOT / "policy"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES, neutral, records
from core.statecompare import _civ_scalar
from warmup import settle_all
import drive

ROW = 0


def build() -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(), device="cpu", dtype=torch.float64))
    assert sim._ngov and sim._npol, "no government catalog on the wire"
    return sim


def main() -> int:
    rj = json.loads((FIXTURES / "rules.json").read_text())
    gov = {g["id"]: i for i, g in enumerate(rj["governments"])}
    civ = {c["id"]: i for i, c in enumerate(rj["civics"])}
    sim = build()
    active = torch.ones(sim.B, dtype=torch.bool)
    sim.seat_ext[:, ROW] = True
    snap = sim.snapshot()

    def scene(*civics: str) -> None:
        sim.restore(snap)
        sim.civ_civics[:, ROW] = False
        for c in civics:
            sim.civ_civics[:, ROW, civ[c]] = True
        sim.civ_gov_held[:, ROW] = 0
        sim.civ_policies[:, ROW] = False
        sim._eff_version += 1

    def record(g: int | None = None, policies=None) -> None:
        t = None if g is None else torch.full((sim.B,), g, dtype=torch.long)
        sim.apply_seat_actions(ROW, government=t, policies=policies)
        sim._seat_record_apply(ROW, active)

    def now() -> str | None:
        g, has = sim._adopted_gov(ROW)
        return next(k for k, v in gov.items() if v == int(g[0])) if bool(has[0]) else None

    # 1) the default and the tier-mates
    for name in ("OLIGARCHY", "CLASSICAL_REPUBLIC", "AUTOCRACY"):
        scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY")
        assert now() == "AUTOCRACY", f"the default is the newest tier, table order: {now()}"
        record(gov[name])
        assert now() == name and int(sim.civ_gov_chosen[0, ROW]) == gov[name], f"the record did not adopt {name}"
        bit = 1 << gov[name]
        want = 0 if name == "AUTOCRACY" else bit
        assert int(sim.civ_gov_held[0, ROW]) & bit == want, f"{name}: held after the change"
        assert torch.equal(sim._seat_policy_slots(ROW)[0] - sim._wonder_extra_slots(ROW)[0],
                           sim._gov_slots[gov[name]]), f"{name}: the slots are not its own"
    scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY")
    assert float(sim._gov_mods(ROW)[12]["gppmult"][0]) == 1.0
    record(gov["CLASSICAL_REPUBLIC"])
    assert abs(float(sim._gov_mods(ROW)[12]["gppmult"][0]) - 1.15) < 1e-12, "the chosen government's bonus is not paid"
    print("  1 the choice OK - the default is the newest tier, the record reaches every tier-mate and pays it")

    # 2) refusals
    scene("CODE_OF_LAWS")
    record(gov["MONARCHY"])
    assert now() == "CHIEFDOM" and int(sim.civ_gov_chosen[0, ROW]) == -1, "a locked government was adopted"
    assert sim._gov_open(ROW)[0].nonzero().flatten().tolist() == [gov["CHIEFDOM"]]
    scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY")
    record(gov["OLIGARCHY"])
    record(gov["AUTOCRACY"])
    op = sim._gov_open(ROW)[0]
    assert not bool(op[gov["OLIGARCHY"]]) and bool(op[gov["AUTOCRACY"]]) and bool(op[gov["CLASSICAL_REPUBLIC"]])
    record(gov["OLIGARCHY"])
    assert now() == "AUTOCRACY", "a return to a held government was accepted"
    print("  2 the refusals OK - a locked government and a return to a held one")

    # 3) the choice stands; a change carries the cards
    scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY")
    record(gov["OLIGARCHY"])
    sim.civ_civics[:, ROW, civ["DIVINE_RIGHT"]] = True
    sim._eff_version += 1
    assert now() == "OLIGARCHY", "a newer tier displaced the chosen government"
    record(None)
    assert now() == "OLIGARCHY"
    scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY", "DIVINE_RIGHT")
    up = torch.zeros(sim.B, sim._npol, dtype=torch.bool)
    up[:, [p["id"] for p in rj["policies"]].index("URBAN_PLANNING")] = True
    record(gov["CHIEFDOM"], up)
    assert torch.equal(sim.civ_policies[0, ROW], up[0]), "the card set was not laid into the chosen government"
    record(gov["MONARCHY"])
    assert now() == "MONARCHY" and bool(sim.civ_policies[0, ROW][up[0]].all()), "the change dropped a card that fits"
    print("  3 the standing choice OK - a newer tier leaves it, a change carries the cards")

    # 4) the wire, the observation, the compare and the driver
    kw = {name: None for name in inspect.signature(records.extract_record).parameters}
    kw.update(sim=sim, row=ROW, b=0, prod=(torch.full((1, 1), -1), torch.full((1, 1), -1)),
              seq=torch.full((1, 1, 1), -1), government=torch.tensor([gov["OLIGARCHY"]]))
    rec = records.extract_record(**kw)
    assert rec["government"] == gov["OLIGARCHY"], rec
    scene("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY")
    records.replay_seat(sim, ROW, {"production": [], "tech": None, "civic": None, "units": [],
                                   "government": gov["OLIGARCHY"]})
    sim._seat_record_apply(ROW, active)
    assert now() == "OLIGARCHY", "the replayed record did not adopt"
    obs = neutral.seat_obs(sim, ROW)[0]["policy"]
    assert obs["government"] == gov["OLIGARCHY"], obs
    assert obs["gov_open"] == sorted(gov[k] for k in ("CHIEFDOM", "AUTOCRACY", "OLIGARCHY", "CLASSICAL_REPUBLIC")), obs
    assert _civ_scalar("civ_gov_chosen")(sim, 0, [ROW]) == [gov["OLIGARCHY"]]
    st = neutral.static_for(sim)
    assert st.gov_tier == [int(g["tier"]) for g in rj["governments"]]
    tier1 = {gov[k] for k in ("AUTOCRACY", "OLIGARCHY", "CLASSICAL_REPUBLIC")}
    nob = {"policy": {"gov_open": sorted(tier1 | {gov["CHIEFDOM"]})}}
    picks = drive._decide_government(st, [nob] * 64, ROW, list(range(64)), "cpu")
    assert set(picks.tolist()) == tier1, f"the style draw does not reach every tier-mate: {set(picks.tolist())}"
    again = drive._decide_government(st, [nob] * 64, ROW, list(range(64)), "cpu")
    assert torch.equal(picks, again), "the style draw is not persistent"
    assert "government" == drive.DECIDE_FIELDS[-1], "the government field is not appended at the end"
    print("  4 the wire OK - the record round-trips, the observation and the compare carry it, the driver reaches every tier-mate")
    print("BATTERY OK government_choice")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
