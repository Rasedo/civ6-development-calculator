"""civ6lab c38s3_fit — C-38-S3 from `c38s3_run.py` records: per run and
city-state, the bank, Builders and military turn by turn, and each unit that
appears with the turn's gold change and what the city was producing the turn
before (item, progress / cost from `minor_prod.lua`). A unit that appears
with the bank falling by at least --drop is a PURCHASE; one that appears as
the city's finished item with no such fall is TRAINED. Then the arm table:
Builder arm, minors that bought a Builder within 1, 2 and 5 turns; military
arm, purchases per minor-turn by the military size set.

    python tools/civ6lab/c38s3_fit.py tools/civ6lab/runs/c38s3_*.jsonl [--quiet]
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cs_analyze import pair_upgrades, upgrade_chains  # noqa: E402

CIVIL = {"UNIT_BUILDER", "UNIT_TRADER", "UNIT_SETTLER", "UNIT_MISSIONARY", "UNIT_APOSTLE", "UNIT_INQUISITOR",
         "UNIT_GURU", "UNIT_ARCHAEOLOGIST", "UNIT_NATURALIST", "UNIT_ROCK_BAND", "UNIT_SPY", "UNIT_WARRIOR_MONK"}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    p.add_argument("--drop", type=float, default=30.0, help="the bank fall that marks a purchase")
    p.add_argument("--quiet", action="store_true")
    a = p.parse_args(argv)
    table = collections.defaultdict(lambda: collections.Counter())
    reach = upgrade_chains()
    for path in a.logs:
        setup, cs, prod = {}, collections.defaultdict(dict), collections.defaultdict(dict)
        arm = None
        for ln in open(path, encoding="utf-8"):
            r = json.loads(ln)
            arm = (r["arm"], r["gold"], r["k"], r["burn"], r["save"])
            if r["rec"] == "setup" and "p" in r:
                setup[r["p"]] = r
            elif r["rec"] == "cs" and "p" in r and r.get("civ") != "CIVILIZATION_FREE_CITIES":
                cs[r["p"]][r["t"]] = r
            elif r["rec"] == "prod" and "p" in r:
                prod[r["p"]][r["turn"]] = r
        if not a.quiet:
            print(f"== {path}  arm={arm}")
        for pl, rows in sorted(cs.items()):
            s = setup.get(pl, {})
            turns = sorted(rows)
            t0 = turns[0]
            first_builder = None
            buys = []
            for i in range(1, len(turns)):
                r0, r1 = rows[turns[i - 1]], rows[turns[i]]
                u0 = collections.Counter(u[0] for u in r0["units"])
                u1 = collections.Counter(u[0] for u in r1["units"])
                new = u1 - u0
                lost = u0 - u1
                ups = pair_upgrades(new, lost, reach)
                dg = r1["gold"] - r0["gold"]
                pr = prod[pl].get(turns[i - 1], {})
                if ups:
                    buys.append((turns[i], "upgrade " + ",".join(f"{o[5:]}>{u[5:]}" for o, u in ups), len(ups),
                                 round(dg, 1), "UPGRADE", pr.get("build"), pr.get("progress"), pr.get("cost")))
                for kind, n in new.items():
                    near_done = pr.get("build") == kind and (pr.get("cost") or 0) > 0 and pr["progress"] >= pr["cost"] / 2
                    how = "TRAIN" if near_done else ("BUY" if dg <= -a.drop else ("TRAIN" if pr.get("build") == kind else "?"))
                    buys.append((turns[i], kind, n, round(dg, 1), how, pr.get("build"), pr.get("progress"), pr.get("cost")))
                    if kind == "UNIT_BUILDER" and first_builder is None:
                        first_builder = (turns[i] - t0, how)
            mil_buys = [b for b in buys if b[4] == "BUY" and b[1] not in CIVIL]
            if arm[0] == "military" and not s.get("warWith0", False):
                key = ("military", arm[1], f"k={arm[2]}")
                table[key]["minors"] += 1
                table[key]["minor_turns"] += len(turns) - 1
                table[key]["military_buys"] += len(mil_buys)
                table[key]["minors_buying"] += 1 if mil_buys else 0
                table[key]["builder_buys"] += sum(1 for b in buys if b[4] == "BUY" and b[1] == "UNIT_BUILDER")
                if s.get("military") != arm[2]:
                    table[key]["setup_short"] += 1
            if arm[0] == "builder" and not s.get("warWith0", False):
                key = ("builder", arm[1])
                table[key]["minors"] += 1
                if first_builder is not None and first_builder[1] == "BUY":
                    for w in (1, 2, 5):
                        if first_builder[0] <= w:
                            table[key][f"bought<={w}"] += 1
                elif first_builder is not None:
                    table[key][f"got_by_{first_builder[1]}"] += 1
            if not a.quiet:
                gold = " ".join(f"{rows[t]['gold']:.0f}" for t in turns)
                print(f"  p{pl:<2} {rows[t0]['civ'][13:]:<14} war0={s.get('warWith0')} mil={s.get('military')} "
                      f"bld={s.get('builders')} gold [{gold}]")
                for b in buys:
                    print(f"      t{b[0]} +{b[2]} {b[1]} dgold {b[3]} {b[4]} (was building {b[5]} {b[6]}/{b[7]})")
    print("\n== arms")
    for key in sorted(table, key=str):
        print(" ", key, dict(table[key]))
    return 0



if __name__ == "__main__":
    sys.exit(main())
