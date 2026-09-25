"""THE GATHERING STORM ROWS THE CATALOGS MISSED — the GPU half.

    npm run export                          # writes seeder/worlds/
    python tests/gpu/gs_rows_test.py

The TS twins are tests/cpu/units/greatPerson.test.ts ("the Gathering Storm
admirals") and tests/cpu/map/offshore-wind-farm.test.ts.

CIV6 (Expansion2_GreatPeople_Admirals.xml over GreatPeople_Admirals.xml):
  Rajendra Chola   ABILITY_CHOLA_NAVAL_COMBAT, +3 Combat Strength on every
                   naval combat unit of the seat (`_roster_cs`), no gold
  Francis Drake    a Privateer "with 1 promotion level" (Experience -1), the
                   civilization's unique where it has one (UniqueOverride)
  Ching Shih       500 Gold typed ScaleByGameSpeed
CIV6 (Expansion2_Improvements.xml): the Offshore Wind Farm, a Builder row on
Coast (and Lake) with no resource and no feature, after Predictive Systems:
its BUILD column, the unit mask, the applier, the Builder's job plane, and
its 2 Power to the city that owns the plot.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths, FIXTURES
from warmup import opened, warm_base

B0, ROW = 0, 0


def fresh(rules, path) -> BatchSim:
    return warm_base(str(path), lambda: opened(rules, path, 8))


def ids(R: dict) -> dict:
    return {u["id"]: i for i, u in enumerate(R["units"])}


def find_person(sim, want: dict) -> tuple[int, int]:
    """the (class, queue position) whose row carries exactly these columns"""
    for cls in range(sim._gp_effects.shape[0]):
        for at in range(int(sim._gp_roster[cls])):
            row = sim._gp_effects[cls, at]
            if all(float(row[c]) == v for c, v in want.items()):
                return cls, at
    raise AssertionError(f"no person carries {want}")


def perm_col(sim, name: str) -> int:
    return sim._GP_PERM0 + sim._gp_perm_names.index(name)


def fx_col(sim, name: str) -> int:
    return sim._GPFX[name]


def spend(sim, cls: int, at: int, tile: int) -> None:
    """stand the person up on `tile` and spend its one charge there"""
    ones = torch.ones(sim.B, dtype=torch.bool)
    t = torch.full((sim.B,), tile, dtype=torch.long)
    born = sim._spawn_unit(ROW, ones.clone(), t, int(sim._gp_class_unit[cls]),
                           charges=torch.ones(sim.B, dtype=torch.long),
                           gp_at=torch.full((sim.B,), at, dtype=torch.long))
    assert bool(born.all()), "the person did not spawn"
    slot = getattr(sim, sim.POOL_NEXT["major"]) - 1 + sim.POOL_LO["major"]
    sim._gp_apply(ROW, ones.clone(), slot, t)
    sim._eff_version += 1


def shore(sim) -> int:
    """a land plot of this seat's reach beside open Coast, nobody on either"""
    taken = set(sim.unit_tile[B0][sim.unit_tile[B0] >= 0].tolist())
    coast = sim._imp_terr[sim._imp_ids.index("OFFSHORE_WIND_FARM")][0]
    for t in range(sim.T):
        if bool(sim.water[B0, t]) or not bool(sim.passable[B0, t]) or t in taken:
            continue
        if int(sim.centre_slot_at[B0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n >= 0 and n not in taken and int(sim.terrain[B0, n]) == coast and bool(sim.wpass[B0, n]):
                return t
    raise AssertionError("no plot beside open Coast")


def test_chola(rules, path) -> None:
    sim = fresh(rules, path)
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    u = ids(R)
    cls, at = find_person(sim, {perm_col(sim, "navalCombat"): 3.0})
    assert float(sim._gp_effects[cls, at, fx_col(sim, "gold")]) == 0.0, "Chola pays no gold in Gathering Storm"
    tile = torch.full((sim.B,), int(sim.city_center[B0, ROW, 0]), dtype=torch.long)
    foe = torch.full((sim.B,), 1, dtype=torch.long)
    hp = torch.full((sim.B,), 100, dtype=torch.long)

    def cs(kind: str, seat: int = ROW) -> int:
        return int(sim._roster_cs(torch.full((sim.B,), seat, dtype=torch.long),
                                  torch.full((sim.B,), u[kind], dtype=torch.long),
                                  tile, foe, hp, False)[B0])

    kinds = ("GALLEY", "QUADRIREME", "PRIVATEER", "AIRCRAFT_CARRIER", "SEA_DOG", "WARRIOR", "ADMIRAL")
    before = {k: cs(k) for k in kinds}
    foe0 = cs("GALLEY", 1)
    gold0 = float(sim.civ_treasury[B0, ROW])
    spend(sim, cls, at, int(sim.city_center[B0, ROW, 0]))
    assert float(sim._gp_perm(ROW, "navalCombat")[B0]) == 3.0
    for k in ("GALLEY", "QUADRIREME", "PRIVATEER", "AIRCRAFT_CARRIER", "SEA_DOG"):
        assert cs(k) == before[k] + 3, f"{k}: {before[k]} -> {cs(k)}"
    assert cs("WARRIOR") == before["WARRIOR"], "a land unit takes nothing"
    assert cs("ADMIRAL") == 0, "no Combat value, no strength"
    assert cs("GALLEY", 1) == foe0, "another seat's hull takes nothing"
    assert float(sim.civ_treasury[B0, ROW]) == gold0, "no gold"
    print("  1 Rajendra Chola OK — +3 on the seat's naval combat units, nothing on land or across seats")


def test_drake(rules, path) -> None:
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    u = ids(R)
    for civ, want in (("ROME", "PRIVATEER"), ("ENGLAND", "SEA_DOG")):
        sim = fresh(rules, path)
        keep = (sim.row_civ.clone(), sim.row_leader.clone())
        ci = sim._civ_ids.index(civ)
        pair = next(i for i, c in enumerate(sim._pair_civ) if c == ci)
        sim.row_civ[:, ROW] = ci
        sim.row_leader[:, ROW] = pair
        cls, at = find_person(sim, {fx_col(sim, "unitIdx"): float(u["PRIVATEER"]),
                                    fx_col(sim, "unitPromotions"): 1.0,
                                    perm_col(sim, "routePlunderPct"): 50.0})
        assert float(sim._gp_effects[cls, at, fx_col(sim, "gold")]) == 0.0, "Drake pays no gold in Gathering Storm"
        gold0 = float(sim.civ_treasury[B0, ROW])
        spend(sim, cls, at, shore(sim))
        slot = int(sim.unit_next[B0]) - 1
        assert int(sim.unit_type[B0, slot]) == u[want], \
            f"{civ}: the grant is {R['units'][int(sim.unit_type[B0, slot])]['id']}, not {want}"
        assert bool(sim.water[B0, int(sim.unit_tile[B0, slot])]), "the hull stands on water"
        need = int(sim._xp_to_next(sim.unit_level[B0:B0 + 1, slot])[0])
        assert need > 0 and int(sim.unit_xp[B0, slot]) == need, "one promotion level"
        assert float(sim._gp_perm(ROW, "routePlunderPct")[B0]) == 50.0
        assert float(sim.civ_treasury[B0, ROW]) == gold0, "no gold"
        sim.row_civ.copy_(keep[0])
        sim.row_leader.copy_(keep[1])
    print("  2 Francis Drake OK — a Privateer one level up, a Sea Dog for England")


def test_ching_shih(rules, path) -> None:
    sim = fresh(rules, path)
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    # CIV6 (ScaleByGameSpeed): the Standard-speed amount times the speed's
    # CostMultiplier, truncated
    want = float(int(500 * float(R["scenario"]["gameSpeed"]) + 1e-9))
    cls, at = find_person(sim, {fx_col(sim, "gold"): want, perm_col(sim, "routePlunderPct"): 60.0})
    gold0 = float(sim.civ_treasury[B0, ROW])
    spend(sim, cls, at, int(sim.city_center[B0, ROW, 0]))
    assert float(sim.civ_treasury[B0, ROW]) == gold0 + want, f"{gold0} -> {float(sim.civ_treasury[B0, ROW])}"
    print(f"  3 Ching Shih OK — {want:.0f} Gold at this speed")
    # GREATPERSON_GRACE_HOPPER_ACTIVE Amount 2, GREATPERSON_SAMORI_TURE_ACTIVE
    # UNIT_SPEC_OPS: the wire carries the layered rows
    u = ids(R)
    find_person(sim, {fx_col(sim, "freeTechRandom"): 2.0})
    find_person(sim, {fx_col(sim, "unitIdx"): float(u["SPEC_OPS"]), fx_col(sim, "unitPromotions"): 1.0})
    print("    Grace Hopper's two free techs and Samori Toure's Spec Ops ride the wire")


# ---------------------------------------------------------------------------
# THE OFFSHORE WIND FARM


def give(sim, k: int) -> None:
    ut = int(sim._imp_unlock[k])
    assert ut >= 0, "the row names no tech"
    sim.civ_techs[:, ROW, ut] = True
    sim._eff_version += 1


def own(sim, t: int) -> None:
    sim.tile_seat[B0, t] = ROW
    sim.tile_city[B0, t] = int(sim.city_id[B0, ROW, 0])
    sim._tile_owner_ver += 1
    sim._eff_version += 1


def stand_builder(sim, t: int) -> int:
    """a Builder spawned at the capital and walked onto plot `t` — a water
    plot needs the embarked plane, which is what `_occ_set` reads. Returns its
    rank in this seat's slot map."""
    slot = int(sim.unit_next[B0])
    sim._spawn_unit(ROW, torch.ones(sim.B, dtype=torch.bool),
                    torch.full((sim.B,), int(sim.city_center[B0, ROW, 0]), dtype=torch.long),
                    sim._builder_idx)
    rows = torch.tensor([B0])
    sim._occ_clear(rows, torch.tensor([int(sim.unit_tile[B0, slot])]), torch.tensor([slot]))
    sim.unit_tile[B0, slot] = t
    sim.unit_emb[B0, slot] = bool(sim.water[B0, t])
    sim._occ_set(rows, torch.tensor([t]), torch.tensor([slot]))
    sim.unit_mp[B0, slot] = sim._mp_scale
    return int((sim._seat_slot_map(ROW)[B0] == slot).nonzero()[0])


def build_at(sim, t: int, k: int) -> tuple[bool, bool]:
    """(the mask's BUILD column, the applier's landing) for a Builder on `t`"""
    rank = stand_builder(sim, t)
    col = sim._A_IMP[k]
    offered = bool(sim._seat_unit_mask(ROW)[B0, rank, col])
    act = torch.full(sim._seat_slot_map(ROW).shape, -1, dtype=torch.long)
    act[B0, rank] = col
    sim._apply_seat_unit_actions(ROW, act)
    return offered, int(sim.improvement[B0, t]) == k


def coast_plot(sim, k: int) -> int:
    """a Coast plot with no resource, feature, improvement or unit on it"""
    coast = sim._imp_terr[k][0]
    taken = set(sim.unit_tile[B0][sim.unit_tile[B0] >= 0].tolist())
    ok = ((sim.terrain[B0] == coast) & sim.wpass[B0] & (sim.res_imp[B0] < 0) & (sim.feat_id[B0] < 0)
          & (sim.improvement[B0] < 0) & (sim.district[B0] < 0) & ~sim.nwonder[B0])
    for t in ok.nonzero().flatten().tolist():
        if t not in taken:
            return t
    raise AssertionError("no bare Coast plot on this map")


def test_owf_column(rules, path) -> None:
    sim = fresh(rules, path)
    iids = sim._imp_ids
    k = iids.index("OFFSHORE_WIND_FARM")
    assert k == len(iids) - 1 == 38, "appended LAST, after Qhapaq Nan"
    assert iids.index("MOUNTAIN_ROAD") == 37, "no earlier build column moved"
    assert sim._A_IMP[k] == sim._act["BUILD_OFFSHORE_WIND_FARM"] == sim._act["PILLAGE"] - 1
    assert sim._imp_water[k] and not sim._imp_ground[k], "a WATER row"
    assert sim._imp_no_feat[k], "no Improvement_ValidFeatures row: a feature refuses it"
    assert float(sim._imp_power[k]) == 2.0
    print(f"  4 Offshore Wind Farm column OK — improvement {k}, BUILD column {sim._A_IMP[k]}")


def test_owf_build(rules, path) -> None:
    sim = fresh(rules, path)
    k = sim._imp_ids.index("OFFSHORE_WIND_FARM")
    t = coast_plot(sim, k)
    own(sim, t)
    assert not bool(sim._seat_job_mask(ROW)[B0, t]), "a job before Predictive Systems"
    offered, landed = build_at(sim, t, k)
    assert not offered and not landed, "laid without Predictive Systems"

    sim = fresh(rules, path)
    t = coast_plot(sim, k)
    own(sim, t)
    give(sim, k)
    assert bool(sim._seat_job_mask(ROW)[B0, t]), "no Builder job on an owned bare Coast plot"
    offered, landed = build_at(sim, t, k)
    assert offered and landed, f"the mask offered {offered}, the applier landed {landed}"
    assert not bool(sim._seat_job_mask(ROW)[B0, t]), "a built plot is no job"

    # a FEATURE refuses it, and so does a plot another seat holds
    sim = fresh(rules, path)
    t = coast_plot(sim, k)
    own(sim, t)
    give(sim, k)
    fid = 1 if int(sim._soil_fid) == 0 else 0
    sim.feat_id[B0, t] = fid
    sim.feat_stripped[B0, t] = False
    sim._eff_version += 1
    assert not bool(sim._imp_ground_ok(k)[B0, t]), "a feature plot takes it"
    assert not bool(sim._seat_job_mask(ROW)[B0, t]), "a feature plot is a job"
    print(f"  5 Offshore Wind Farm build OK — plot {t}: refused before its tech, masked, laid, then no job")


def test_owf_power(rules, path) -> None:
    sim = fresh(rules, path)
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    bidx = {b["id"]: i for i, b in enumerate(R["buildings"])}
    k = sim._imp_ids.index("OFFSHORE_WIND_FARM")
    t = coast_plot(sim, k)
    own(sim, t)
    sim.city_bldg[B0, ROW, 0, bidx["RESEARCH_LAB"]] = True   # a Base Load, so the supply is read
    sim._bldg_version += 1
    sim._eff_version += 1
    s0 = float(sim._city_power_need(ROW)[1][B0, 0])
    sim.improvement[B0, t] = k
    sim._eff_version += 1
    s1 = float(sim._city_power_need(ROW)[1][B0, 0])
    assert s1 == s0 + 2.0, f"the city's supply {s0} -> {s1}"
    sim.pillaged[B0, t] = True
    sim._eff_version += 1
    assert float(sim._city_power_need(ROW)[1][B0, 0]) == s0, "a pillaged generator pays nothing"
    print(f"  6 Offshore Wind Farm power OK — the owning city's supply {s0} -> {s1}")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_chola(rules, path)
    test_drake(rules, path)
    test_ching_shih(rules, path)
    test_owf_column(rules, path)
    test_owf_build(rules, path)
    test_owf_power(rules, path)
    print("BATTERY OK gs_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
