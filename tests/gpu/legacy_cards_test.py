"""THE GOVERNMENT LEGACY CARDS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/legacy_cards_test.py

The TS twin is tests/cpu/city/legacy-cards.test.ts.

CIV6 (Legacy policy card): every government but the Chiefdom has one; it
carries that government's OWN inherent bonus, it is a Wildcard, it is
"unlocked by" the government, and it "cannot be slotted while in" it.

Proven here:
  * the roster reaches the wire — one legacy row per government, each naming
    its own government and carrying that government's effect columns;
  * `civ_gov_held` is written at the civic loop's exit, the position
    `seatPhase` writes it at, and only a completed civic can move it;
  * the gate is two-sided: no bit, no card; the seat's CURRENT government
    still refuses its own;
  * the greedy fill takes a legacy card only once no ordinary card is left
    for the Wildcard — the shape that starves the Dark Age pool, and what
    makes this reachability rather than a rule.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0, ROW = 0, 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
POLS = [p["id"] for p in RULES["policies"]]
GOVS = [g["id"] for g in RULES["governments"]]
CIVICS = [c["id"] for c in RULES["civics"]]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def civics_for(sim, target: str) -> list[int]:
    """`target` and every civic it needs, as column indices."""
    pre = {c["id"]: list(c["prereqs"]) for c in RULES["civics"]}
    need, stack = set(), [target]
    while stack:
        x = stack.pop()
        if x in need:
            continue
        need.add(x)
        stack += [p if isinstance(p, str) else CIVICS[p] for p in pre[x]]
    return [CIVICS.index(c) for c in need]


def research(sim, row: int, target: str) -> None:
    sim.civ_civics[:, row] = False
    for c in civics_for(sim, target):
        sim.civ_civics[B0, row, c] = True
    sim._eff_version += 1


def slots(sim, row: int, wildcards: int, held: torch.Tensor | None = None) -> list[str]:
    extra = torch.zeros(sim.B, 4, dtype=torch.long)
    extra[:, 3] = wildcards
    if held is None:
        held = sim.civ_gov_held[:, row]
    m = sim._slotted_policies(sim.civ_civics[:, row], extra, None, None, held)
    return [POLS[i] for i in range(len(POLS)) if bool(m[B0, i])]


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    legacy = {POLS[i]: GOVS[int(g)] for i, g in enumerate(sim._pol_legacy.tolist()) if g >= 0}
    want = {f"LEGACY_{g['id']}": g["id"] for g in RULES["governments"] if int(g["tier"]) > 0}
    assert legacy == want, f"the wire carries {sorted(legacy)}, the catalog says {sorted(want)}"
    # ...and each one's effect columns ARE its government's own
    for pid, gid in legacy.items():
        pi, gi = POLS.index(pid), GOVS.index(gid)
        pol, gov = RULES["policies"][pi], RULES["governments"][gi]
        shared = [k for k in pol if k in gov and k not in ("id", "unlockCivic", "slots", "tier")]
        assert shared, "no effect column is shared between a card and a government row"
        for k in shared:
            assert pol[k] == gov[k], f"{pid}.{k} != {gid}.{k}"
    print(f"  1 wire OK — {len(legacy)} legacy rows, each its government's own bonus")


def test_held_is_written(rules, path) -> None:
    sim = fresh(rules, path)
    assert int(sim.civ_gov_held[B0, ROW]) == 0, "a seat starts holding nothing"
    research(sim, ROW, "POLITICAL_PHILOSOPHY")
    ad, has = sim._adopted_gov(sim.civ_civics[:, ROW])
    assert GOVS[int(ad[B0])] == "AUTOCRACY" and bool(has[B0])
    # nothing is recorded until the seat phase runs its civic loop
    assert int(sim.civ_gov_held[B0, ROW]) == 0
    sim.step()
    assert int(sim.civ_gov_held[B0, ROW]) & (1 << GOVS.index("AUTOCRACY")), \
        "the seat did not record the government it is in"
    print("  2 held OK — written at the civic loop's exit, once the phase runs")


def test_gate_is_two_sided(rules, path) -> None:
    sim = fresh(rules, path)
    research(sim, ROW, "DIVINE_RIGHT")
    ad, _ = sim._adopted_gov(sim.civ_civics[:, ROW])
    assert GOVS[int(ad[B0])] == "MONARCHY"
    auto = 1 << GOVS.index("AUTOCRACY")
    mon = 1 << GOVS.index("MONARCHY")
    none = torch.zeros(sim.B, dtype=torch.long)
    assert "LEGACY_AUTOCRACY" not in slots(sim, ROW, 40, none), "no bit, and the card still slotted"
    both = torch.full((sim.B,), auto | mon, dtype=torch.long)
    got = slots(sim, ROW, 40, both)
    assert "LEGACY_AUTOCRACY" in got, "the bit is set and the card did not slot"
    assert "LEGACY_MONARCHY" not in got, "the seat's CURRENT government slotted its own legacy"
    print("  3 gate OK — no bit no card, and the current government refuses its own")


def test_greedy_fill(rules, path) -> None:
    sim = fresh(rules, path)
    research(sim, ROW, "DIVINE_RIGHT")
    held = torch.full((sim.B,), 1 << GOVS.index("AUTOCRACY"), dtype=torch.long)
    narrow = slots(sim, ROW, 0, held)
    wide = slots(sim, ROW, 40, held)
    assert "LEGACY_AUTOCRACY" not in narrow, "an ordinary overflow card should reach the Wildcard first"
    assert "LEGACY_AUTOCRACY" in wide, "a wide bench must reach the card"
    assert set(narrow) <= set(wide), "widening the bench dropped a card"
    print(f"  4 greedy fill OK — {len(narrow)} cards on the real bench, {len(wide)} on a wide one")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_held_is_written(rules, path)
    test_gate_is_two_sided(rules, path)
    test_greedy_fill(rules, path)
    print("BATTERY OK legacy_cards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
