"""REACHABILITY — what a driven 250-turn game actually reaches.

A green gate proves the two engines agree over the regime the scripted seeds
enter. docs/AUDIT.md's "Reachability" section lists the mechanics believed to
sit OUTSIDE that regime; every one of them was prose. This driver counts them.

GPU-only and driven exactly as the serve gate drives it (the same
`_decide_turn` over the same seat order), because reachability is a property
of the DRIVEN GAME, not of the comparison. What it answers, in order:

  apostleBuy    the driver emitting faith-buy kind 6 (B-18r's latent needs it)
  urbanization  the URBANIZATION civic, which gates the Neighborhood column
  placed:<ID>   a district column actually placed, for the late-unlock rows
  secondShip    any seat holding two hulls at once (B-28r's one-galley cap)
  intlRoute     an INTERNATIONAL trade leg (B-31r)
  theoAdjacent  two religious units of DIFFERENT religions standing adjacent —
                theological combat's precondition, not its outcome
  antiquityDig  an antiquity site excavated
  natHistory    NATURAL_HISTORY, the Archaeologist's civic — the dig's blocker
  conservation  CONSERVATION, the Naturalist's civic
  csWar         a (major, city-state) war cell live (B-44r)
  csPeace       a minor war ENDED through the sue column
  specPin       a citizen pinned into a district's specialist slots (B-30r)
  tileLock      a plot pinned by the lock head
  ballot        a turn on which the driver submits a Congress ballot (B-22r)
  tourists      visiting vs domestic at the final turn, per seat: the culture
                victory's own comparison (`_culture_victor`)
  policyCards   which policy cards the greedy slot fill ever puts in a slot,
                and the most a seat holds at once
  wonders       wonders actually FINISHED — the fourteen wonder-effect
                channels have no gate coverage until one completes

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

# The district columns worth counting: the pop-gated Neighborhood and the six
# whose unlocks sit in the Industrial era or later.
DISTRICT_MARKS = ("NEIGHBORHOOD", "DAM", "CANAL", "WATER_PARK", "PRESERVE",
                  "GOVERNMENT_PLAZA", "DIPLOMATIC_QUARTER")

KEYS = ("apostleBuy", "urbanization", "secondShip",
        "intlRoute", "theoAdjacent", "antiquityDig",
        "csWar", "csPeace", "specPin", "tileLock", "ballot",
        "natHistory", "conservation",
        "friendship", "alliance", "openBorders", "closedStep", "workGift",
        "defensivePact") + tuple(f"placed:{d}" for d in DISTRICT_MARKS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--turns", type=int, default=250)
    ap.add_argument("--deep-share", type=float, default=None,
                    help="override ladder.DEEP_SHARE for a coverage sweep")
    ap.add_argument("--diplo-share", type=float, default=None,
                    help="override ladder.DIPLO_SHARE for a coverage sweep")
    args = ap.parse_args()
    if args.deep_share is not None:
        ladder.DEEP_SHARE = args.deep_share
    if args.diplo_share is not None:
        ladder.DIPLO_SHARE = args.diplo_share

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

    def civic_at(name: str) -> int:
        i = next((k for k, c in enumerate(rj["civics"]) if c["id"] == name), -1)
        assert i >= 0, f"{name} not in the exported civics table"
        return i

    dist_marks = [(f"placed:{dd['id']}", i) for i, dd in enumerate(sim.districts_cat)
                  if dd["id"] in DISTRICT_MARKS]
    urb = civic_at("URBANIZATION")
    nat_hist, conserv = civic_at("NATURAL_HISTORY"), civic_at("CONSERVATION")
    relig_t = torch.zeros(sim.NU, dtype=torch.bool)
    for idx in (getattr(sim, "_missionary_idx", -1), getattr(sim, "_apostle_idx", -1)):
        if 0 <= idx < relig_t.numel():
            relig_t[idx] = True

    pol_ids = [p["id"] for p in rj["policies"]]
    slotted_seen: set[str] = set()
    slotted_max = 0

    seeds_hit: dict[str, set[int]] = {k: set() for k in KEYS}
    first_turn: dict[str, int] = {}
    cs_lo, cs_hi = sim.n_majors, sim.n_majors + sim.S
    minor_war_turns = torch.zeros(sim.B, dtype=torch.long)
    was_minor_war = torch.zeros(sim.B, dtype=torch.bool)

    def mark(key: str, mask, turn: int) -> None:
        for b in range(sim.B):
            if bool(mask[b]):
                seeds_hit[key].add(seeds[b])
                first_turn.setdefault(key, turn + 1)

    gw_before = None
    for t in range(args.turns):
        # The DIPLOMATIC verbs are decided outside `_decide_turn`, so a probe
        # that skips this measures a table with no agreements in it.
        drive.geo_decide_and_apply(sim, seeds)
        gw_before = [p[:, :sim.n_majors].clone() for p in
                     (sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music)]
        for row in seats:
            rec = drive._decide_turn(env, sim, row, roster, classes, seeds=seeds, turn=t)
            relig = rec[9]
            if isinstance(relig, tuple) and len(relig) == 2 and relig[0] is not None:
                mark("apostleBuy", (relig[0] == 6), t)
            vote = rec[16]
            if vote is not None:
                mark("ballot", (vote[:, :, 0] >= 0).any(dim=1), t)
        sim.step()

        for row in seats:
            sl = sim._gov_policy_mods(sim.civ_civics[:, row])[4]
            slotted_max = max(slotted_max, int(sl.sum(dim=1).max()))
            for i in sl.any(dim=0).nonzero(as_tuple=True)[0].tolist():
                slotted_seen.add(pol_ids[i])

        mark("urbanization", sim.civ_civics[:, :, urb].any(dim=1), t)
        mark("natHistory", sim.civ_civics[:, :, nat_hist].any(dim=1), t)
        mark("conservation", sim.civ_civics[:, :, conserv].any(dim=1), t)
        for _k, _di in dist_marks:
            mark(_k, (sim.district == _di).any(dim=1), t)
        nav_u = sim.unit_naval[sim.unit_type.clamp(min=0)]
        for row in seats:
            cnt = (sim.unit_alive & (sim.unit_seat == row) & nav_u).sum(dim=1)
            mark("secondShip", cnt >= 2, t)
        mark("intlRoute", (sim.seat_route_dseat >= 0).any(dim=2).any(dim=1), t)
        # the MINOR half of the war head: a war cell between a major row and a
        # city-state column, and the turn one of them closes.
        minor_war = sim.war[:, :sim.n_majors, cs_lo:cs_hi].any(dim=2).any(dim=1)
        mark("csWar", minor_war, t)
        minor_war_turns += minor_war.long()
        mark("csPeace", was_minor_war & ~minor_war, t)
        was_minor_war = minor_war
        mark("specPin", (sim.city_spec_pin >= 0).any(dim=3).any(dim=2).any(dim=1), t)
        mark("friendship", (sim.seat_friend_turns > 0).any(dim=2).any(dim=1), t)
        mark("alliance", (sim.seat_ally_turns > 0).any(dim=2).any(dim=1), t)
        mark("openBorders", (sim.seat_borders_turns > 0).any(dim=2).any(dim=1), t)
        # A CLOSED border is only a rule where a unit actually stands against
        # one: the refusal, not the civic.
        _ut = sim.unit_type.clamp(min=0)
        for row in seats:
            _mine = sim.unit_alive & (sim.unit_seat == row)
            if not bool(_mine.any()):
                continue
            _nb = sim.neigh[sim.unit_tile.clamp(min=0)]
            _shut = sim._border_closed(_nb, row, _ut.unsqueeze(2).expand_as(_nb))
            mark("closedStep", (_shut & _mine.unsqueeze(2)).any(dim=2).any(dim=1), t)
        # a WORK that changed hands: one seat's holding fell while the table's
        # total held, which only the gift verb does.
        if gw_before is not None:
            for _now, _was in zip((sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music), gw_before):
                _n = _now[:, :sim.n_majors]
                mark("workGift", ((_n.sum(dim=2) < _was.sum(dim=2)).any(dim=1)
                                  & (_n.sum(dim=(1, 2)) >= _was.sum(dim=(1, 2)))), t)
        # THE PACT'S EXACT SIGNATURE: the war head only ever marks a war FORMAL
        # off the DECLARER's own denouncement, and writes the kind BOTH ways —
        # so the stamp has to be absent in both directions before a formal war
        # is a dragged ally rather than the victim's side of someone else's.
        _R = sim.n_majors
        _st = sim.seat_denounced[:, :_R, :_R]
        mark("defensivePact", (sim.war[:, :_R, :_R] & sim.seat_warkind[:, :_R, :_R]
                              & (_st < 0) & (_st.transpose(1, 2) < 0)).any(dim=2).any(dim=1), t)
        mark("tileLock", sim.tile_locked.any(dim=1), t)
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
        print(f"  {k:24s} {n}/{sim.B} seeds" + (f", first at t{ft}" if ft else "   NEVER"))
    print(f"  minor-war turns per seed: max {int(minor_war_turns.max())}, "
          f"mean {float(minor_war_turns.double().mean()):.1f}; standing at the final turn: "
          f"{int((sim.city_spec_pin >= 0).sum())} pinned slots, {int(sim.tile_locked.sum())} locked plots")

    wdone = sim.built_wonder_complete
    n_seeds_w = int(wdone.any(dim=1).sum())
    print(f"  wonders FINISHED: {int(wdone.sum())} across {n_seeds_w}/{sim.B} seeds")

    _gw = sum(int(p[:, :sim.n_majors].sum()) for p in
              (sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music))
    _slots = sum(int((sim.city_bldg[:, :sim.n_majors, :, c] & sim.city_alive[:, :sim.n_majors]).sum())
                 for c in sim._gw_bidx if c >= 0)
    print(f"  great works HELD at the final turn: {_gw}, in {_slots} slot buildings")

    _liv = (sim.seat_friend_turns > 0).sum(), (sim.seat_ally_turns > 0).sum(), (sim.seat_borders_turns > 0).sum()
    print(f"  agreements STANDING at the final turn (pair cells): "
          f"{int(_liv[0])} friendship, {int(_liv[1])} alliance, {int(_liv[2])} open-borders grants")

    print(f"  policy cards ever slotted: {len(slotted_seen)}/{len(pol_ids)}, "
          f"at most {slotted_max} at once")
    print("    " + ", ".join(sorted(slotted_seen)))
    print("    never: " + ", ".join(p for p in sorted(pol_ids) if p not in slotted_seen))

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
