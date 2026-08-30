"""UNIT ACTION ENUM — the mask, the dispatch and the RL head agree.

`rules.actions.unit` is the one source of the unit-action width and of every
verb's column. This lane pins that the exported enum, BOTH seats' masks, the
engine's dispatch constants and `env.n_unit_acts` all agree with it.

Neither failure mode raises: a consumer that hardcodes a width silently drops
the tail columns, and a verb dispatched on a bare column number that another
verb also occupies becomes a no-op on both engines at once — so the rollout
stays green while the verb does nothing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # --- 0) BOTH SEATS' masks are the enum's width -------------------------
    # ONE mask body serves every seat row, so this asserts the SHARED width
    # against the enum on two different rows — a row-dependent width would
    # mean a seat quietly loses the tail verbs (REPAIR, resource
    # improvements, FORT, PILLAGE).
    for _ in range(25):
        sim.step()
    assert sim.n_majors > 1, "needs a civ row to compare against"
    _pm = sim._seat_unit_mask(0)
    _rm = sim._seat_unit_mask(1)
    assert _pm.shape[2] == _rm.shape[2] == len(rj["actions"]["unit"]), (
        f"unit action width disagrees: row 0 {_pm.shape[2]}, row 1 {_rm.shape[2]}, "
        f"enum {len(rj['actions']['unit'])}"
    )
    print(f"  0 the unit mask is {_pm.shape[2]} wide on every row (= the enum) OK")

    # --- 1) the enum is shipped and matches the improvement roster ----------
    acts = rj["actions"]["unit"]
    imp_ids = rj["improvements"]["ids"]
    assert acts, "rules.actions.unit missing — the exporter must ship the enum"
    # +12 SNIPE, +7 SPREAD, +1 FOUND_CITY, +1 EXCAVATE, +1 PARK, the PROMOTE
    # head, +6 CONDEMN, +1 REMOVE_HERESY, +1 LAUNCH_INQUISITION,
    # +1 CONVERT_HEATHEN, +1 UPGRADE, the five VARIABLE-width heads, the
    # engineer's +1 BUILD_ROAD and +1 FINISH_DISTRICT, the Great Person's
    # +1 ACTIVATE_GP, the Rock Band's +1 PERFORM_CONCERT, then the Royal
    # Society's +1 BOOST_PROJECT, then the 6-wide FORM_UP head.
    pcol = rj["promotions"]["cols"]
    esp = rj["eras"]["espionage"]
    heads = [
        ("AIR_STRIKE_", sum(1 for n in acts if n.startswith("AIR_STRIKE_"))),
        ("AIR_PILLAGE_", sum(1 for n in acts if n.startswith("AIR_PILLAGE_"))),
        ("REBASE_", sum(1 for n in acts if n.startswith("REBASE_"))),
        ("SPY_TRAVEL_", esp["travelCols"]),
        ("SPY_MISSION_", len(esp["missions"])),
    ]
    want = 13 + len(imp_ids) + 3 + 12 + 7 + 3 + pcol + 10 + sum(w for _p, w in heads) + 3 + 28
    assert len(acts) == want, (
        f"enum is {len(acts)} wide, expected {want} for {len(imp_ids)} improvements, "
        f"a {pcol}-wide PROMOTE head and heads {heads}"
    )
    # A new verb joins at the END or it moves a column somebody else already
    # keys on: the religious tail, the ladder's own verb, the four heads in the
    # order the exporter appends them, the engineer's two, then the Great
    # Person's spend.
    _last = (["BUILD_ROAD", "FINISH_DISTRICT", "ACTIVATE_GP"]
             + [f"SNIPE3_{k}" for k in range(18)]  # the distance-3 ring
             + ["PERFORM_CONCERT", "BOOST_PROJECT"]
             + [f"FORM_UP_{d}" for d in range(6)]
             + ["ESCORT", "BREAK_ESCORT"]
             # the newest last-append: the bomber's second head
             + [f"AIR_PILLAGE_{k}" for k in range(dict(heads)["AIR_PILLAGE_"])])
    assert acts[-len(_last):] == _last, f"the trailing verbs must close the enum, got {acts[-30:]}"
    # AIR_PILLAGE closes the enum rather than sitting in the mid-enum run, so
    # `_last` is what proves its contiguity and the walk below skips it.
    _mid = [h for h in heads if h[0] != "AIR_PILLAGE_"]
    _tailstart = len(acts) - len(_last) - sum(w for _p, w in _mid)
    assert acts[_tailstart - 4:_tailstart] == [
        "REMOVE_HERESY", "LAUNCH_INQUISITION", "CONVERT_HEATHEN", "UPGRADE"], \
        "verb tail misplaced"
    _at_h = _tailstart
    for _pre, _w in _mid:
        assert _w > 0, f"{_pre} head is empty"
        assert acts[_at_h:_at_h + _w] == [f"{_pre}{k}" for k in range(_w)], \
            f"{_pre} head is not one contiguous run at {_at_h}"
        _at_h += _w
    assert _at_h == len(acts) - len(_last), "a head runs past the end of the enum"
    at = {n: i for i, n in enumerate(acts)}
    assert [acts[at["CONDEMN_0"] + d] for d in range(6)] == [f"CONDEMN_{d}" for d in range(6)], \
        "CONDEMN block is not one contiguous run"
    assert [acts[at["PROMOTE_0"] + k] for k in range(pcol)] == [f"PROMOTE_{k}" for k in range(pcol)], \
        "the PROMOTE head is not one contiguous run"
    assert at["PROMOTE_0"] + pcol == at["CONDEMN_0"], "PROMOTE must run straight into CONDEMN"
    assert acts[at["FOUND_CITY"]:at["FOUND_CITY"] + 3] == ["FOUND_CITY", "EXCAVATE", "PARK"], \
        "civilian verb tail misplaced"
    assert at["FOUND_CITY"] + 3 == at["PROMOTE_0"], "the civilian tail must run into PROMOTE"
    assert [acts[at["SPREAD_HERE"] + d] for d in range(7)] \
        == ["SPREAD_HERE"] + [f"SPREAD_{d}" for d in range(6)], "SPREAD tail misplaced"
    assert at["SPREAD_HERE"] + 7 == at["FOUND_CITY"], "SPREAD must run into FOUND_CITY"

    # PILLAGE is NOT the last column — the SNIPE ring and the SPREAD tail sit
    # after it — and every BUILD verb sits BEFORE it, so appending one
    # improvement moves it. Its seat is therefore derived, never written down:
    # `pick_unit_orders` takes the two columns as arguments for exactly this
    # reason, and this is the check that they line up with the enum.
    _pil = 13 + len(imp_ids) + 2
    assert acts[_pil] == "PILLAGE", f"PILLAGE must hold column {_pil}, got {acts[_pil]}"
    assert acts[_pil + 1] == "SNIPE_0", "the SNIPE ring must open right after PILLAGE"
    assert acts[_pil + 12] == "SNIPE_11", (  # SPREAD sits past the ring — key on the SEAT, not W-1
        f"the SNIPE ring must be {_pil+1}..{_pil+12}, got {acts[_pil+1]}..{acts[_pil+12]}"
    )
    for i, name in enumerate(imp_ids[:3]):
        assert acts[13 + i] == f"BUILD_{name}", f"dedicated build col {13+i} is {acts[13+i]}"
    for i, name in enumerate(imp_ids[3:]):
        assert acts[18 + i] == f"BUILD_{name}", f"resource build col {18+i} is {acts[18+i]}"

    # --- 2) the MASK is exactly as wide as the enum ------------------------
    m = sim._seat_unit_mask(0)
    assert m.shape[-1] == len(acts), f"mask {m.shape[-1]} wide, enum {len(acts)}"

    # --- 3) the engine dispatches by NAME, on the right columns ------------
    assert sim._A_PILLAGE == acts.index("PILLAGE"), "PILLAGE dispatch column"
    assert sim._A_CHOP == acts.index("CHOP"), "CHOP dispatch column"
    assert sim._A_REPAIR == acts.index("REPAIR"), "REPAIR dispatch column"
    assert sim._A_FOUND == acts.index("FOUND_CITY"), "FOUND_CITY dispatch column"
    assert sim._A_AIR_STRIKE == acts.index("AIR_STRIKE_0"), "AIR_STRIKE dispatch column"
    assert sim._A_AIR_PILLAGE == acts.index("AIR_PILLAGE_0"), "AIR_PILLAGE dispatch column"
    assert sim._A_REBASE == acts.index("REBASE_0"), "REBASE dispatch column"
    assert sim._A_SPY_TRAVEL == acts.index("SPY_TRAVEL_0"), "SPY_TRAVEL dispatch column"
    assert sim._A_SPY_MISSION == acts.index("SPY_MISSION_0"), "SPY_MISSION dispatch column"
    # pillage must NOT share a column with any build verb
    assert sim._A_PILLAGE not in sim._A_IMP, (
        f"PILLAGE column {sim._A_PILLAGE} collides with a BUILD column {sim._A_IMP} "
       "— this is exactly the FORT collision that made the verb dead"
    )
    for k, col in enumerate(sim._A_IMP):
        assert col == acts.index(f"BUILD_{imp_ids[k]}"), f"improvement {imp_ids[k]} dispatch column"

    # --- 4) the env's head-width derivation reads the LIVE enum ------------
    # a policy sizes its unit head from n_unit_acts, never from a literal
    from core.env import n_unit_acts

    assert n_unit_acts(rules) == len(acts), "env.n_unit_acts must read the shipped enum"

    print(
        f"unit_head OK — enum {len(acts)} wide, mask matches, PILLAGE at {sim._A_PILLAGE} "
        "(no BUILD collision), n_unit_acts reads the enum"
    )


if __name__ == "__main__":
    main()
