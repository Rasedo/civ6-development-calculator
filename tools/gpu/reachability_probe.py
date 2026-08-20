"""REACHABILITY — what a driven 250-turn game actually reaches.

A green gate proves the two engines agree over the regime the scripted seeds
enter. docs/AUDIT.md's "Reachability" section lists the mechanics believed to
sit OUTSIDE that regime; every one of them was prose. This driver counts them.

GPU-only and driven exactly as the serve gate drives it (the same
`_decide_turn` over the same seat order), because reachability is a property
of the DRIVEN GAME, not of the comparison. What it answers, in order:

  apostleBuy    the driver emitting faith-buy kind 6 (B-18r's latent needs it)
  urbanization  the URBANIZATION civic, which gates the Neighborhood column
  neighborhood  a Neighborhood actually placed
  secondShip    any seat holding two hulls at once (B-28r's one-galley cap)
  intlRoute     an INTERNATIONAL trade leg (B-31r)
  theoAdjacent  two religious units of DIFFERENT religions standing adjacent —
                theological combat's precondition, not its outcome
  antiquityDig  an antiquity site excavated
  tourists      visiting vs domestic at the final turn, per seat: the culture
                victory's own comparison (`_culture_victor`)

Run: python tools/gpu/reachability_probe.py [--turns 250]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(ROOT / "policy"))
from core import BatchEnv, load_rules, load_fixture, fixture_paths, FIXTURES  # noqa: E402
from core.simbase import js_round  # noqa: E402
import drive  # noqa: E402
import ladder  # noqa: E402

KEYS = ("apostleBuy", "urbanization", "neighborhood", "secondShip",
        "intlRoute", "theoAdjacent", "antiquityDig")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--turns", type=int, default=250)
    args = ap.parse_args()

    rules = load_rules()
    fixtures = [load_fixture(p) for p in fixture_paths()]
    seeds = [int(fx["seed"]) for fx in fixtures]
    env = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    seats = list(range(sim.n_majors))
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold),
                                  sim._wond_n if sim.districts_on else 0,
                                  len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for row in seats:
        drive.take_seat(sim, row)

    urb = next((i for i, c in enumerate(rj["civics"]) if c["id"] == "URBANIZATION"), -1)
    assert urb >= 0, "URBANIZATION not in the exported civics table"
    relig_t = torch.zeros(sim.NU, dtype=torch.bool)
    for idx in (getattr(sim, "_missionary_idx", -1), getattr(sim, "_apostle_idx", -1)):
        if 0 <= idx < relig_t.numel():
            relig_t[idx] = True

    seeds_hit: dict[str, set[int]] = {k: set() for k in KEYS}
    first_turn: dict[str, int] = {}

    def mark(key: str, mask, turn: int) -> None:
        for b in range(sim.B):
            if bool(mask[b]):
                seeds_hit[key].add(seeds[b])
                first_turn.setdefault(key, turn + 1)

    for t in range(args.turns):
        for row in seats:
            rec = drive._decide_turn(env, sim, row, roster, classes, seeds=seeds, turn=t)
            relig = rec[9]
            if isinstance(relig, tuple) and len(relig) == 2 and relig[0] is not None:
                mark("apostleBuy", (relig[0] == 6), t)
        sim.step()

        mark("urbanization", sim.civ_civics[:, :, urb].any(dim=1), t)
        if sim._nbhd_didx >= 0:
            mark("neighborhood", (sim.district == sim._nbhd_didx).any(dim=1), t)
        nav_u = sim.unit_naval[sim.unit_type.clamp(min=0)]
        for row in seats:
            cnt = (sim.unit_alive & (sim.unit_seat == row) & nav_u).sum(dim=1)
            mark("secondShip", cnt >= 2, t)
        mark("intlRoute", (sim.seat_route_dseat >= 0).any(dim=2).any(dim=1), t)
        # a DIG's product is an ARTIFACT in a museum slot; the site plane
        # alone only says a site exists.
        mark("antiquityDig", (sim.city_artifacts > 0).any(dim=2).any(dim=1), t)

        # theological combat's PRECONDITION: two religious units of different
        # religions standing adjacent. The resolver cannot fire without it, so
        # this is what bounds any claim about it.
        rel_u = relig_t[sim.unit_type.clamp(min=0)] & sim.unit_alive
        if bool(rel_u.any()):
            hit = torch.zeros(sim.B, dtype=torch.bool)
            for b in range(sim.B):
                idxs = rel_u[b].nonzero(as_tuple=True)[0].tolist()
                for i in idxs:
                    ti, si = int(sim.unit_tile[b, i]), int(sim.unit_seat[b, i])
                    for j in idxs:
                        if j <= i:
                            continue
                        if int(sim.unit_seat[b, j]) == si:
                            continue
                        if int(sim.pair_dist[ti, int(sim.unit_tile[b, j])]) == 1:
                            hit[b] = True
            mark("theoAdjacent", hit, t)

    print(f"REACHABILITY — {sim.B} seeds x {args.turns} turns, driven")
    for k in KEYS:
        n = len(seeds_hit[k])
        ft = first_turn.get(k)
        print(f"  {k:14s} {n}/{sim.B} seeds" + (f", first at t{ft}" if ft else "   NEVER"))

    vis_div = sim.n_majors * sim._tourism_per_visitor
    print("  tourists at the final turn (visiting vs domestic, per seat):")
    for row in range(sim.n_majors):
        vis = torch.div(sim.civ_tourism[:, row].long(), vis_div, rounding_mode="floor")
        dom = torch.div(js_round(sim.civ_culture[:, row] * 1000).long(),
                        1000 * sim._culture_per_tourist, rounding_mode="floor")
        print(f"    seat {row}: visiting max {int(vis.max())} / mean {float(vis.double().mean()):.1f}"
              f"   domestic max {int(dom.max())} / mean {float(dom.double().mean()):.1f}")


if __name__ == "__main__":
    main()
