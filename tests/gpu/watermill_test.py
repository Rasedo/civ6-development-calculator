"""WATER MILL poke lane.

    python tests/gpu/watermill_test.py

The Civilopedia rule: "Bonus resources improved by Farms gain +1 Food each."

Gate coverage for this mechanic is thin — few cities hold a Water Mill and few
eligible tiles are owned — so scripted parity agreeing is weak evidence rather
than proof. This lane constructs the configuration directly instead of hoping a
seed wanders into it.

It asserts the three things the implementation can plausibly get wrong:
  a. the bonus fires at all, and is worth exactly +1 food per eligible tile;
  b. it is gated on the BUILDING (no Water Mill -> no bonus), so it cannot be
     an unconditional farm bonus wearing the building's name;
  c. it is gated on the RESOURCE being a farm-improved BONUS resource, not on
     the tile merely carrying a Farm.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules, path, steps=40):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(steps):
        sim.step()
    return sim


def food_of(sim, c):
    return float(sim._city_totals()[0][0, c, 0])


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    if not paths:
        print("no fixtures — run `npm run seed && npm run export` first")
        raise SystemExit(1)
    # SCAN for a fixture that still has two live cities at t40 rather than
    # pinning paths[0]: the control comparison needs a second city, and which
    # seeds still hold one moves with any trajectory change.
    sim = None
    for p in paths:
        cand = build(rules, str(p))
        if int(cand.city_alive[0, 0].sum()) >= 2:
            sim = cand
            break
    assert sim is not None, "no fixture has two live cities at t40 — cannot run the control comparison"

    wm_cols = sim.rules_dev.b_farmbonus.nonzero().flatten().tolist()
    assert len(wm_cols) == 1, f"expected exactly one farm-bonus building (the Water Mill), got {wm_cols}"
    wm = wm_cols[0]

    alive = sim.city_alive[0, 0].nonzero().flatten().tolist()
    c0, c1 = alive[0], alive[1]

    # Make every tile c0 owns an eligible one: FARM improvement carrying a
    # farm-improved BONUS resource. Rewriting the planes directly is the point
    # — it removes the dependence on a seed happening to generate the setup.
    own0 = sim.city_slot_at(0)[0] == c0
    body = own0 & (sim.district[0] < 0) & (sim.built_wonder[0] < 0) & sim.work_ok[0]
    n_elig = int(body.sum())
    assert n_elig > 0, "city 0 owns no plain workable tiles to convert"
    sim.improvement[0][body] = sim.FARM
    sim.res_cat[0][body] = 1  # bonus category
    sim.res_imp[0][body] = sim.FARM
    sim._eff_version += 1

    base0, base1 = food_of(sim, c0), food_of(sim, c1)

    # (a) + (b): grant the building to c0 ONLY.
    sim.city_bldg[0, 0, c0, wm] = True
    sim._eff_version += 1
    got0, got1 = food_of(sim, c0), food_of(sim, c1)
    delta = got0 - base0

    # The delta carries TWO things: the per-tile bonus AND the Water Mill's own
    # base food (+1). Read the base from the rules rather than hardcoding it, so
    # a re-source of the building's yields cannot silently invalidate the lane.
    base_food = float(sim.rules_dev.b_yields[wm][0])
    worked = min(int(sim.city_pop[0, 0, c0]), n_elig)  # the center is never eligible (it carries no improvement)
    assert abs(delta - (worked + base_food)) < 1e-9, (
        f"Water Mill food delta {delta} != worked eligible tiles {worked} + its own base food "
        f"{base_food} (pop {int(sim.city_pop[0, 0, c0])}, eligible owned {n_elig})"
    )
    assert delta > 0, "the bonus never fired — lane proves nothing"
    assert abs(got1 - base1) < 1e-12, (
        f"control city moved by {got1 - base1} — the bonus is not gated on the BUILDING"
    )
    print(f"  a Water Mill +1 food/tile OK (+{delta:.0f} = {worked} worked eligible tiles + {base_food:.0f} base)")
    print("  b building-gated OK (control city without the Water Mill unchanged)")

    # (c) resource-gated: keep the Farms, drop the bonus-resource identity.
    sim.res_cat[0][body] = 0
    sim._eff_version += 1
    stripped = food_of(sim, c0)
    assert abs(stripped - (base0 + base_food)) < 1e-9, (
        f"food {stripped} != {base0 + base_food} with the resources stripped — the bonus is keying on "
        "the FARM alone, not on a farm-improved BONUS resource"
    )
    print("  c resource-gated OK (plain Farms with no bonus resource get nothing)")

    print("watermill_test OK — #78 Water Mill: +1 food per farm-improved bonus resource, building- and resource-gated")


if __name__ == "__main__":
    main()
