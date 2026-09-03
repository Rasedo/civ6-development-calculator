"""THE SEAT'S ROSTER ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/seat_rows_test.py

The TS twin is tests/cpu/seats/seat-rows.test.ts.

CIV6 (the install's TraitModifiers): the Scottish Enlightenment's happiness
percentages and Great Person points, the government slot of Plato's
Republic and the Holy Roman Emperor, the Culture and Faith a kill pays
Gorgo and Tamar, Thermopylae's per-policy strength, and the Amazon's
rainforest adjacency.
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

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]
BARB_SEAT = 200


def play(sim, row: int, name):
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def lead(sim, row: int, civ: str, leader: str) -> None:
    """Seat a civilization by one NAMED leader — a civilization with two."""
    play(sim, row, civ)
    sim.row_leader[0, row] = sim._leader_idx(leader)
    sim._eff_version += 1


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def T(*xs) -> torch.Tensor:
    return torch.tensor(list(xs), dtype=torch.long)


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._happy_yield_rows) == 4 and len(sim._happy_gpp_rows) == 4
    assert len(sim._policy_slot_rows) == 2 and len(sim._post_combat_yield_rows) == 2
    assert sum(1 for r in sim._district_adj_rows if r[4] == 2) == 4, "the Amazon's four"
    assert sum(1 for r in sim._combat_cs_rows if r[5] == 1) == 1, "Thermopylae's magnitude"
    print("  1 wire OK — 4 + 4 + 2 + 2 rows, 4 feature adjacencies, 1 per-policy row")


def test_policy_slots(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "ROME")
    base = sim._wonder_extra_slots(0)[B0].tolist()
    play(sim, 0, "GREECE")
    got = sim._wonder_extra_slots(0)[B0].tolist()
    assert got[3] == base[3] + 1 and got[0] == base[0], "Plato's Republic — a WILDCARD"
    lead(sim, 0, "GERMANY", "BARBAROSSA")
    got = sim._wonder_extra_slots(0)[B0].tolist()
    assert got[0] == base[0] + 1 and got[3] == base[3], "the Holy Roman Emperor — a MILITARY"
    play(sim, 0, "ROME")
    assert sim._wonder_extra_slots(0)[B0].tolist() == base, "the slot outlived the roster row"
    print("  2 policy slots OK — a Wildcard for Greece, a Military for Barbarossa")


def test_kill_yields(rules, path) -> None:
    warrior = UNITS.index("WARRIOR")
    settler = UNITS.index("SETTLER")
    half = int(RULES["units"][warrior]["combat"]) // 2
    assert half > 0

    def killed_as(civ: str, leader: str, vict: int, barb: bool) -> tuple[int, int]:
        sim = fresh(rules, path)
        lead(sim, 0, civ, leader)
        c0 = float(sim.civ_civic_prog[B0, 0])
        f0 = float(sim.civ_faith[B0, 0])
        sim._unit_kill_event(T(0), T(vict), torch.tensor([barb]), torch.tensor([True]))
        return int(float(sim.civ_civic_prog[B0, 0]) - c0), int(float(sim.civ_faith[B0, 0]) - f0)

    assert killed_as("GREECE", "GORGO", warrior, False) == (half, 0), "Thermopylae's Culture"
    assert killed_as("GREECE", "GORGO", warrior, True) == (half, 0), "a barbarian victim pays too"
    assert killed_as("GREECE", "GORGO", settler, False) == (0, 0), "a civilian has no strength"
    assert killed_as("GEORGIA", "TAMAR", warrior, False) == (0, half), "Tamar's Faith"
    assert killed_as("ROME", "TRAJAN", warrior, False) == (0, 0), "a plain seat banked a kill"
    print(f"  3 kill yields OK — {half} Culture for Gorgo, {half} Faith for Tamar")


def test_thermopylae(rules, path) -> None:
    sim = fresh(rules, path)
    lead(sim, 0, "GREECE", "GORGO")
    warrior = UNITS.index("WARRIOR")
    land = next(t for t in range(sim.T) if not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]))
    hp = torch.tensor([100.0], dtype=sim.unit_hp.dtype)

    def cs() -> int:
        return int(sim._roster_cs(T(0), T(warrior), T(land), T(1), hp, False)[B0])

    assert int(sim._military_policies(T(0))[B0]) == 0 and cs() == 0, "a card-less seat"
    civics = [c["id"] for c in RULES["civics"]]
    for name in ("CODE_OF_LAWS", "FOREIGN_TRADE", "CRAFTSMANSHIP", "MILITARY_TRADITION"):
        sim.civ_civics[B0, 0, civics.index(name)] = True
    sim._eff_version += 1
    sim._gov_pol_cache.clear()
    n = int(sim._military_policies(T(0))[B0])
    assert n > 0, "no Military policy slotted — the scene measures nothing"
    assert cs() == n, f"the per-policy magnitude read {cs()} against {n} slotted"
    play(sim, 0, "ROME")
    sim._gov_pol_cache.clear()
    assert cs() == 0, "the magnitude outlived Gorgo"
    print(f"  4 Thermopylae OK — +1 per slotted Military policy ({n} slotted)")


def test_amazon(rules, path) -> None:
    sim = fresh(rules, path)
    campus = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "CAMPUS")
    harbor = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "HARBOR")
    # a tile of this row's own ground with rainforest around it
    t = next(t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == 0 and not bool(sim.water[B0, t]))
    ring = [int(x) for x in sim.neigh[t].tolist() if x >= 0]
    for x in ring:
        sim.feat_id[B0, x] = sim._rainforest_fid
        sim.feat_stripped[B0, x] = False
    sim._eff_version += 1
    play(sim, 0, "ROME")
    base_c = float(sim._district_adj_floor(campus)[B0, t])
    base_h = float(sim._district_adj_floor(harbor)[B0, t])
    play(sim, 0, "BRAZIL")
    got_c = float(sim._district_adj_floor(campus)[B0, t])
    got_h = float(sim._district_adj_floor(harbor)[B0, t])
    assert got_c == base_c + len(ring), f"the Amazon paid {got_c - base_c} for {len(ring)} rainforest"
    assert got_h == base_h, "the Amazon paid a Harbor"
    print(f"  5 the Amazon OK — +1 per adjacent Rainforest on four districts ({len(ring)} around)")


def test_happy_rows(rules, path) -> None:
    """The happiness rows read the tier `_seat_amenity` decides."""
    sim = fresh(rules, path)
    tiers = sim.rules.amenity_tiers
    ecstatic, happy = 0, 1
    assert tiers[happy][0] == 1 and tiers[ecstatic][0] == 3, "the tier order moved"

    def give_luxuries(sim, n: int) -> None:
        """Improved luxuries on this row's own ground — the amenity source
        `luxuryAmenities` ranks, so the tier follows the count."""
        seen: set[int] = set()
        for t in range(sim.T):
            if len(seen) >= n:
                break
            k = int(sim.lux_id[B0, t])
            if k < 0 or k in seen or int(sim.tile_seat[B0, t]) != 0:
                continue
            sim.improvement[B0, t] = int(sim.lux_req[B0, t])
            sim.pillaged[B0, t] = False
            seen.add(k)
        sim._eff_version += 1

    def sci_and_tier(name, pop: int, lux_add: int) -> tuple[float, int]:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        s2.city_pop[B0, 0, 0] = pop
        give_luxuries(s2, lux_add)
        tier = int(s2._seat_amenity(0)[0][B0, 0])
        sci = float(s2._seat_city_walk(0, amen_yf=s2._seat_amenity(0)[2])[B0, 0, 3])
        return sci, tier

    seen_tier = False
    for pop, lux in ((6, 0), (6, 2), (6, 4), (1, 0), (1, 4)):
        base, t_base = sci_and_tier("ROME", pop, lux)
        scot, t_scot = sci_and_tier("SCOTLAND", pop, lux)
        assert t_base == t_scot, "the roster row moved the TIER itself"
        want = 1.05 if t_base == happy else 1.1 if t_base == ecstatic else 1.0
        assert abs(scot - base * want) < 1e-9, f"tier {t_base} paid {scot / base if base else 0}"
        if t_base in (happy, ecstatic):
            seen_tier = True
    assert seen_tier, "no scene reached Happy or Ecstatic — the rows went unmeasured"
    print("  6 happiness rows OK — 5% Happy and 10% Ecstatic on Science, Content untouched")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_policy_slots(rules, path)
    test_kill_yields(rules, path)
    test_thermopylae(rules, path)
    test_amazon(rules, path)
    test_happy_rows(rules, path)
    print("BATTERY OK seat_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
