"""THE TWENTY-TWO UNIQUE LAND UNITS, GPU side.

Every stat below is the install's own Units.xml row and every clause is one
UnitAbilities.xml ability; the TS pins in tests/cpu/units/unique-land-units.ts
hold the same numbers, and the serve gate compares the two engines running.

This lane drives `_chassis_ability_cs` and the chassis planes directly: the
driver trains a unique unit only where the seeder happened to seat its
civilization, so a catalog row could ship unreached for a whole round.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/unique_land_units_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all  # noqa: E402

B0 = 0

ROWS = {
    "MAMLUK": ("ARABIA", "KNIGHT", 180, 4, 50),
    "MOUNTIE": ("CANADA", None, 290, 5, 62),
    "CROUCHING_TIGER": ("CHINA", None, 140, 2, 30),
    "OKIHTCITAW": ("CREE", "SCOUT", 40, 3, 20),
    "GARDE_IMPERIALE": ("FRANCE", "LINE_INFANTRY", 360, 2, 70),
    "KHEVSURETI": ("GEORGIA", "MAN_AT_ARMS", 160, 2, 48),
    "HOPLITE": ("GREECE", "SPEARMAN", 65, 2, 28),
    "HUSZAR": ("HUNGARY", "CAVALRY", 335, 5, 65),
    "WARAKAQ": ("INCA", "SKIRMISHER", 165, 3, 20),
    "VARU": ("INDIA", None, 120, 2, 40),
    "SAMURAI": ("JAPAN", "MAN_AT_ARMS", 160, 2, 48),
    "NGAO_MBEBA": ("KONGO", "SWORDSMAN", 110, 2, 38),
    "HWACHA": ("KOREA", "FIELD_CANNON", 250, 2, 45),
    "MANDEKALU_CAVALRY": ("MALI", "KNIGHT", 220, 4, 55),
    "TOA": ("MAORI", "SWORDSMAN", 120, 2, 38),
    "MALON_RAIDER": ("MAPUCHE", None, 230, 4, 55),
    "KESHIG": ("MONGOLIA", None, 160, 4, 35),
    "COSSACK": ("RUSSIA", "CAVALRY", 340, 5, 67),
    "HIGHLANDER": ("SCOTLAND", "RANGER", 380, 3, 50),
    "CONQUISTADOR": ("SPAIN", "MUSKETMAN", 250, 2, 58),
    "CAROLEAN": ("SWEDEN", "PIKE_AND_SHOT", 250, 3, 55),
    "IMPI": ("ZULU", "PIKEMAN", 125, 2, 45),
}


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = build(rules, paths[0])
    print(f"unique_land_units_test on {paths[0].name}")

    ids = [u["id"] for u in rules.units]
    idx = {u: i for i, u in enumerate(ids)}
    civs = list(rules.uniques["civs"])
    speed = float(sim.rules.game_speed)

    # 1 — every row reached the wire with the install's numbers
    for uid, (civ, repl, cost, moves, combat) in ROWS.items():
        assert uid in idx, f"{uid} never reached the wire"
        r = rules.units[idx[uid]]
        assert civs[int(r["uniq"])] == civ, f"{uid} names the wrong civilization"
        got_repl = ids[int(r["repl"])] if int(r["repl"]) >= 0 else None
        assert got_repl == repl, f"{uid} replaces {got_repl}, wanted {repl}"
        assert int(r["moves"]) == moves, f"{uid} moves"
        assert int(r["combat"]) == combat, f"{uid} combat"
        assert int(r["cost"]) == round(cost * speed), f"{uid} cost"
    print(f"  1 catalog OK — {len(ROWS)} rows, every one keyed to its civilization")

    # 2 — the ability columns landed on the right chassis
    def col(name: str, uid: str):
        return sim.__getattribute__(name)[idx[uid]]

    assert int(col("_type_ground_cs", "KHEVSURETI")) == 7
    assert bool(col("_type_ground_hills", "KHEVSURETI"))
    assert int(col("_type_ground_cs", "HIGHLANDER")) == 5
    assert bool((sim._type_ground_feat[idx["HIGHLANDER"]] >= 0).any()), "the Highlander names no feature"
    assert bool(col("_type_no_hill_cost", "KHEVSURETI"))
    assert bool(col("_type_no_woods_cost", "NGAO_MBEBA"))
    assert int(col("_type_adj_same_cs", "HOPLITE")) == 10
    assert int(col("_type_adj_enemy_cs", "VARU")) == -5
    assert int(col("_type_adj_enemy_cs", "TOA")) == -5
    assert int(col("_type_def_ranged_cs", "NGAO_MBEBA")) == 10
    assert bool(col("_type_no_wound", "SAMURAI"))
    assert int(col("_type_unused_mp_cs", "CAROLEAN")) == 3
    assert int(col("_type_alliance_cs", "HUSZAR")) == 3
    assert (int(col("_type_near_terr_cs", "COSSACK")), int(col("_type_near_terr_rng", "COSSACK"))) == (5, 1)
    assert (int(col("_type_near_terr_cs", "MALON_RAIDER")),
            int(col("_type_near_terr_rng", "MALON_RAIDER"))) == (5, 4)
    assert int(col("_type_home_cont_cs", "GARDE_IMPERIALE")) == 10
    assert int(col("_type_near_rel_cs", "CONQUISTADOR")) == 10
    assert int(col("_type_near_park_cs", "MOUNTIE")) == 5
    assert bool(col("_type_heals_always", "MAMLUK"))
    assert bool(col("_type_move_after_atk", "COSSACK"))
    assert bool(col("_type_no_move_shoot", "HWACHA"))
    assert bool(col("_type_extra_attack", "WARAKAQ"))
    assert float(col("_type_flank_mult", "IMPI")) == 2.0
    assert float(col("_type_xp_rate", "IMPI")) == 1.25
    assert int(col("_type_free_promos", "OKIHTCITAW")) == 1
    assert int(col("_type_kill_gp_general", "GARDE_IMPERIALE")) == 10
    assert int(col("_type_kill_gold_pct", "MANDEKALU_CAVALRY")) == 100
    assert bool(col("_type_park_builder", "MOUNTIE"))
    assert bool(col("_type_escort_speed", "KESHIG"))
    assert int(col("_type_pillage_cost", "MALON_RAIDER")) == 1
    assert bool(col("_type_guards_traders", "MANDEKALU_CAVALRY"))
    assert bool(col("_type_capture_converts", "CONQUISTADOR"))
    print("  2 ability columns OK — every clause on its own chassis and nobody else's")

    # 3 — the composer reads the GROUND under the unit
    hill = int(sim.hills[B0].long().argmax()) if bool(sim.hills[B0].any()) else -1
    flat = int((~sim.hills[B0]).long().argmax())
    seat = torch.zeros(sim.B, dtype=torch.long)
    kh = torch.full((sim.B,), idx["KHEVSURETI"], dtype=torch.long)
    if hill >= 0:
        got = int(sim._chassis_ability_cs(seat, kh, torch.full((sim.B,), hill))[B0])
        assert got == 7, f"the Khevsureti scored {got} on a hill, wanted 7"
    assert int(sim._chassis_ability_cs(seat, kh, torch.full((sim.B,), flat))[B0]) == 0, (
        "the Khevsureti scored on flat ground")
    print(f"  3 ground OK — +7 on a hill (tile {hill}), nothing on the flat")

    # 4 — the movement waiver rides the same clause
    if hill >= 0:
        d1 = torch.full((sim.B,), hill)
        _riv = torch.zeros(sim.B, dtype=torch.long)
        _pr = torch.zeros(sim.B, dtype=torch.long)
        plain = sim._road_terms(d1, d1, _riv, torch.full((sim.B,), idx["WARRIOR"]), _pr)[0]
        waived = sim._road_terms(d1, d1, _riv, kh, _pr)[0]
        assert int(plain[B0]) - int(waived[B0]) == sim._mp_scale, (
            f"the hill waiver moved {int(plain[B0]) - int(waived[B0])}, wanted {sim._mp_scale}")
        print("  4 movement OK — the hill charge comes back off for the chassis that waives it")

    # 5 — the Samurai reads no wound penalty, and a Warrior does
    hp = torch.full((sim.B,), 50, dtype=torch.long)
    sam = torch.full((sim.B,), idx["SAMURAI"], dtype=torch.long)
    war = torch.full((sim.B,), idx["WARRIOR"], dtype=torch.long)
    assert float(sim._wound(hp, war)[B0]) > 0, "a wounded Warrior takes no penalty"
    assert float(sim._wound(hp, sam)[B0]) == 0.0, "the Samurai takes a wound penalty"
    print("  5 wound OK — the Samurai fights on undiminished")

    # 6 — the Hwacha must set up
    assert bool(sim._type_no_move_shoot[idx["HWACHA"]]), "the Hwacha lost its setup clause"
    assert int(sim._type_bombard[idx["HWACHA"]]) == 0, (
        "the Hwacha carries a Bombard, so the clause proves nothing")
    print("  6 setup OK — the siege gate reaches a chassis with no Bombard")

    print("UNIQUE LAND UNITS OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
