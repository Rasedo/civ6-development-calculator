"""THE THIRTY-ONE UNIQUE UNITS, GPU side.

Every stat below is the install's own Units.xml row and every clause is one
UnitAbilities.xml ability; the TS pins in tests/cpu/units/unique-{land,sea-air}-units.ts
hold the same numbers, and the serve gate compares the two engines running.

This lane drives `_chassis_ability_cs` and the chassis planes directly: the
driver trains a unique unit only where the seeder happened to seat its
civilization, so a catalog row could ship unreached for a whole round.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/unique_units_test.py
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
    # the naval and air half, and the two late land rows
    "P51_MUSTANG": ("AMERICA", "FIGHTER", 520, 10, 105),
    "MINAS_GERAES": ("BRAZIL", "BATTLESHIP", 430, 5, 70),
    "SEA_DOG": ("ENGLAND", "PRIVATEER", 280, 4, 40),
    "U_BOAT": ("GERMANY", "SUBMARINE", 430, 3, 65),
    "DE_ZEVEN_PROVINCIEN": ("NETHERLANDS", "FRIGATE", 280, 4, 50),
    "BARBARY_CORSAIR": ("OTTOMAN", "PRIVATEER", 240, 4, 40),
    "BIREME": ("PHOENICIA", "GALLEY", 65, 4, 35),
    "JANISSARY": ("OTTOMAN", "MUSKETMAN", 120, 2, 60),
    "SAKA_HORSE_ARCHER": ("SCYTHIA", None, 100, 4, 20),
}


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = build(rules, paths[0])
    print(f"unique_units_test on {paths[0].name}")

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
    # the sea and air clauses
    assert int(col("_type_vs_fighter_cs", "P51_MUSTANG")) == 5
    assert float(col("_type_xp_rate", "P51_MUSTANG")) == 1.5
    assert int(col("_type_ocean_cs", "U_BOAT")) == 10
    assert int(col("_type_district_atk_cs", "DE_ZEVEN_PROVINCIEN")) == 7
    assert bool(col("_type_raid_free", "BARBARY_CORSAIR"))
    assert bool(col("_type_capture_ships", "SEA_DOG"))
    assert int(col("_type_guards_traders", "BIREME")) == 2, "the Bireme guards WATER"
    assert int(col("_type_guards_traders", "MANDEKALU_CAVALRY")) == 1, "the Mandekalu guards LAND"
    assert int(col("_type_free_promos", "JANISSARY")) == 1
    # EVERY civilization in the roster now names a unique chassis
    _seen = {int(u["uniq"]) for u in rules.units if int(u["uniq"]) >= 0}
    assert len(_seen) == len(civs), (
        f"{len(civs) - len(_seen)} civilizations have no unique unit")
    print("  2 ability columns OK — every clause on its own chassis, all "
          f"{len(civs)} civilizations covered")

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

    # 7 — the two rows the roster ledger called open
    _saka = [r for r in rules.uniques["extraUnitCopies"] if int(r[4]) >= 0]
    assert _saka, "no extra-copy row names a chassis"
    assert ids[int(_saka[0][4])] == "SAKA_HORSE_ARCHER", (
        f"the chassis-keyed copy row names {ids[int(_saka[0][4])]}")
    assert int(_saka[0][3]) == 1, "the Saka copy is one unit"
    _jan = rules.uniques["unitPopCost"]
    assert _jan, "the Janissary's population row never reached the wire"
    assert ids[int(_jan[0][2])] == "JANISSARY", "the population row names the wrong chassis"
    assert int(_jan[0][3]) == -1 and int(_jan[0][4]) == 1, (
        "the Janissary costs ONE citizen, in a founded city")
    print("  7 roster rows OK — the Saka's second copy and the Janissary's citizen")

    # 8 — the TWELVE unique DISTRICTS reached the wire as variants
    _dvar = {}
    for _i, _d in enumerate(rules.districts):
        for _v in _d.get("variants", []):
            _dvar[(_d["id"], civs[int(_v["civ"])])] = _v
    WANT = [
        ("THEATER_SQUARE", "GREECE"), ("INDUSTRIAL_ZONE", "GERMANY"),
        ("CAMPUS", "KOREA"), ("COMMERCIAL_HUB", "MALI"), ("HOLY_SITE", "RUSSIA"),
        ("ENCAMPMENT", "ZULU"), ("NEIGHBORHOOD", "KONGO"),
        ("HARBOR", "ENGLAND"), ("HARBOR", "PHOENICIA"),
        ("ENTERTAINMENT_COMPLEX", "BRAZIL"),
        ("AQUEDUCT", "ROME"), ("WATER_PARK", "BRAZIL"),
    ]
    assert set(_dvar) == set(WANT), f"the unique-district wire is {set(_dvar) ^ set(WANT)} off"
    for _k in WANT:
        assert _k in _dvar, f"{_k[1]}'s variant of {_k[0]} never reached the wire"
        # CIV6 (Districts.xml): a unique district's Cost is HALF the row it
        # replaces, without exception — 27 against 54, 18 against 36.
        assert abs(float(_dvar[_k]["costMult"]) - 0.5) < 1e-9, f"{_k} is not priced at half its base row"
    assert int(_dvar[("ENCAMPMENT", "ZULU")]["housing"]) == 1, "the Ikanda's Housing"
    assert int(_dvar[("NEIGHBORHOOD", "KONGO")]["housing"]) == 5, "the M'banza's Housing"
    assert int(_dvar[("ENTERTAINMENT_COMPLEX", "BRAZIL")]["amenities"]) == 2, "the Carnival's Amenity"
    # the Seowon's own set: a flat FOUR and a MINUS one per district
    _seo = _dvar[("CAMPUS", "KOREA")]["adj"]
    _names = list(rules.beliefs["adjSrcNames"])
    _by = {_names[int(a)]: float(b) for a, b in _seo}
    assert _by.get("SELF") == 4 and _by.get("DISTRICT") == -1, f"the Seowon's rows are {_by}"
    assert "MOUNTAIN" not in _by, "the Seowon still reads a mountain"
    # the M'banza pays its own Food and Gold, and grants an Apostle
    _mb = _dvar[("NEIGHBORHOOD", "KONGO")]
    assert [float(x) for x in _mb["flat"]][:3] == [2.0, 0.0, 4.0], f"the M'banza's flat {_mb['flat']}"
    assert ids[int(_mb["grantUnit"])] == "APOSTLE", "the M'banza grants no Apostle"
    assert int(_dvar[("HARBOR", "ENGLAND")]["grantNaval"]) == 1, "the Dockyard grants no hull"
    assert int(_dvar[("HARBOR", "PHOENICIA")]["grantNaval"]) == 0, "the Cothon grants a hull"
    # the Bath's own Housing and Amenity, and the Copacabana's Amenity
    assert int(_dvar[("AQUEDUCT", "ROME")]["housing"]) == 2, "the Bath's Housing"
    assert int(_dvar[("AQUEDUCT", "ROME")]["amenities"]) == 1, "the Bath's Amenity"
    assert int(_dvar[("WATER_PARK", "BRAZIL")]["amenities"]) == 2, "the Copacabana's Amenity"
    print(f"  8 unique districts OK — {len(WANT)} variants, the Seowon's own set, "
          "the M'banza's yields and the Dockyard's hull")

    # 9 — the Cothon's project, priced off the game's own progress
    # a project row carries no id — its INDEX is its action code, so the row
    # is read where the catalog puts it: LAST, so nothing earlier shifted.
    _prows = list(rules.projects["rows"])
    _cot = _prows[-1]
    assert int(_cot["mc"]) == 1, "the last project moves no capital"
    assert int(_cot["pcg"]) > 0, "the project takes no game-progress curve"
    assert int(_cot["pc"]) > 0, "the project has no base price"
    assert int(_cot["cv"]) == civs.index("PHOENICIA"), "the project is not Phoenicia's"
    _harb = next(i for i, d in enumerate(rules.districts) if d["id"] == "HARBOR")
    assert int(_cot["d"]) == _harb, "the project asks for no Harbor — the Cothon IS one"
    # exactly ONE row moves a capital, and exactly one is civilization-gated
    assert sum(int(r["mc"]) for r in _prows) == 1, "more than one project moves a capital"
    assert sum(1 for r in _prows if int(r["cv"]) >= 0 or int(r["ld"]) >= 0) == 1, (
        "more than one project is gated to a civilization")
    print("  9 cothon project OK — last in the catalog, Phoenicia's, priced off game progress")

    # 10 — the EIGHT unique BUILDINGS: every column the exporter carries and
    # every clause that is not a column. `_b_cols` merges the overrides; a -1
    # scalar (or an all-zero `hasYields`) means "take the base row's".
    _bids = [b["id"] for b in rules.buildings]
    _bvar = {}
    for _bi, _b in enumerate(rules.buildings):
        for _v in _b.get("variants", []):
            _bvar[(_bids[_bi], civs[int(_v["civ"])])] = _v
    _want = {
        ("BROADCAST_CENTER", "AMERICA"), ("UNIVERSITY", "ARABIA"),
        ("FACTORY", "JAPAN"), ("STABLE", "MONGOLIA"),
        ("RENAISSANCE_WALLS", "GEORGIA"), ("BANK", "OTTOMAN"),
        ("AMPHITHEATER", "MAORI"), ("ZOO", "HUNGARY"), ("TEMPLE", "NORWAY"),
    }
    assert set(_bvar) == _want, f"the unique-building wire is {set(_bvar) ^ _want} off"
    _bank = rules.buildings[_bids.index("BANK")]
    _gb = _bvar[("BANK", "OTTOMAN")]
    assert 0 < int(_gb["cost"]) < int(_bank["cost"]), "the Grand Bazaar is not cheaper than the Bank"
    assert int(_gb["amenityPerLuxuryType"]) == 1 and int(_gb["strategicPerType"]) == 1
    _ef = _bvar[("FACTORY", "JAPAN")]
    assert int(_ef["hasYields"]) == 1 and _ef["yields"][1] == 4, "the Electronics Factory pays no 4 Production"
    assert int(_ef["cost"]) == -1, "the Electronics Factory names a price of its own"
    _tb = _bvar[("ZOO", "HUNGARY")]
    assert int(_tb["amenities"]) == 2 and int(_tb["amenitiesWithFeature"][1]) == 2
    _ts = _bvar[("RENAISSANCE_WALLS", "GEORGIA")]
    assert int(_ts["wallsHpBonus"]) == 100 and _ts["goldenAgeY"][5] == 4
    _mr = _bvar[("AMPHITHEATER", "MAORI")]
    assert int(_mr["noGreatWorks"]) == 1 and _mr["featureTileY"][4] == 1 and _mr["featureTileY"][5] == 1
    assert int(_mr["maintenance"]) == 0, "the Marae keeps the Amphitheater's upkeep"
    _or = _bvar[("STABLE", "MONGOLIA")]
    assert int(_or["trainMovement"]) == 1 and len(_or["trainMovementClasses"]) == 2
    _md = _bvar[("UNIVERSITY", "ARABIA")]
    assert int(_md["districtAdjacencyAsFaith"]) == 1
    print("  10 unique buildings OK — nine wire rows, every override and clause")

    # 11 — the Madrasa's own unlock REPLACES the University's
    _bp = list(rules.uniques["buildingPrereq"])
    assert len(_bp) == 1, "the building-unlock override table is not one row"
    _pc, _pl, _pb, _pt, _pv = (int(x) for x in _bp[0])
    assert _pc == civs.index("ARABIA") and _pb == _bids.index("UNIVERSITY")
    assert _pt < 0 and _pv >= 0, "the Madrasa waits on a TECH, not a civic"
    print("  11 madrasa unlock OK — Arabia's University opens on a civic")

    # 12 — the merged per-row column table: a seat that plays no variant
    # reads the base catalog, and the one that does reads its own.
    _ott = civs.index("OTTOMAN")
    _bi_bank = _bids.index("BANK")
    _cols0 = sim._b_cols(0)
    assert _cols0["cost"].shape == (sim.B, len(_bids)), "the merged cost table is the wrong shape"
    for r in range(sim.n_majors):
        _c = sim._b_cols(r)["cost"][:, _bi_bank]
        _plays = sim.row_civ[:, r] == _ott
        assert bool((_c[~_plays] == float(_bank["cost"])).all()), (
            f"row {r} pays the Bazaar price where it plays no Ottoman")
        if bool(_plays.any()):
            assert bool((_c[_plays] == float(_gb["cost"])).all()), (
                f"row {r} pays the Bank price where it PLAYS the Ottomans")
    # REACH the merge: the seeder need not have dealt the Ottomans to anybody,
    # so seat them by hand on game 0 of a spare row and read the table again.
    # (`_b_cols` caches by row, so this uses a row nothing above has asked for.)
    _spare = sim.n_majors - 1
    sim._bvar_col_cache.pop(_spare, None)  # the loop above cached the base table
    sim.row_civ[0, _spare] = _ott
    _cm = sim._b_cols(_spare)
    assert float(_cm["cost"][0, _bi_bank]) == float(_gb["cost"]), (
        "a seated Ottoman row still pays the Bank's price")
    assert float(_cm["amenities"][0, _bids.index("ZOO")]) == float(rules.buildings[_bids.index("ZOO")]["amenities"]), (
        "the Ottoman row took Hungary's Thermal Bath Amenity")
    if sim.B > 1:
        assert float(_cm["cost"][1, _bi_bank]) == float(_bank["cost"]), (
            "the merge leaked into a game that plays no Ottoman")
    print("  12 merged columns OK — the base row everywhere, the variant on the seated game alone")

    print("UNIQUE UNITS OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
