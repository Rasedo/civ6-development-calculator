"""B-D-S1: the war-weariness amenity split as GameCore_XP2_Release.dll codes
it (Player_Diplomacy 0x3cda00, called from 0x3d7020; the city's
requirement 0x5275a0; the sorts 0x3bde80 / 0x3bddd0 (opponents),
0x3bdd20 / 0x3bdbc0 / 0x3bdc70 / 0x3bdb10 (cities, population descending,
EASTL insertion under 29 entries: ties keep the city list's order)),
checked on the cross-section reads runs/ww_xsec_*.log.

    python tools/civ6lab/dll_ww.py [--rows]

The rule (per seat, each turn the allocation is rebuilt):
  need(city) = max(0, ceil(pop / CITY_POP_PER_AMENITY 2) - CITY_AMENITIES_FOR_FREE 0);
  per opponent o holding weariness W[o] > 0 against the seat: L(o) = W[o] // 400
    (WAR_WEARINESS_POINTS_FOR_AMENITY_LOSS), opponents at war first (list A),
    then the ones at peace (list B), each list in its own sort;
  A: L(o) goes to the seat's cities whose ORIGINAL OWNER is o, most populous
    first, each taking min(rest, need + LOSS_OVER_REQ_AMENITIES_AT_WAR_CITY 3);
  B: the same over o's former cities at + NONFOUNDED_CITY 1;
  the rest of every L(o) is pooled: R = sum of what A and B left;
  C: R to the seat's cities founded by a third party (original owner neither
    the seat nor any o of A or B), most populous first, need + NONFOUNDED 1;
  D: what remains to the seat's FOUNDED cities, most populous first, need +
    FOUNDED_CITY 0 — a founded city loses at most its need;
  a city with need 0 takes nothing; W // 400 is floored per opponent.
"""
from __future__ import annotations

import argparse
import glob
import json
import pathlib

RUNS = pathlib.Path(__file__).parent / "runs"
CAP = {"founded": 0, "nonfounded": 1, "atwar": 3}


def seats():
    for path in sorted(glob.glob(str(RUNS / "ww_xsec_*.log"))):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            by = {}
            for c in r.get("rows", []):
                if c.get("kind") == "city" and c.get("isMajor"):
                    by.setdefault((c["turn"], c["p"]), []).append(c)
            for k, cs in by.items():
                yield pathlib.Path(path).stem, k, cs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", action="store_true")
    a = ap.parse_args()
    n_city = n_cap = n_seat = 0
    fd_top = fd_bad = fd_full = fd_fullbad = 0
    need_ok = need_bad = 0
    for src, (turn, p), cs in seats():
        lost = [c for c in cs if c["sources"].get("LostFromWarWeariness", 0) > 0]
        if not lost:
            continue
        n_seat += 1
        for c in cs:
            if (c["pop"] + 1) // 2 != c["need"]:
                need_bad += 1
            else:
                need_ok += 1
        for c in lost:
            n_city += 1
            L = c["sources"]["LostFromWarWeariness"]
            if c["origOwner"] == p:
                cat = "founded"
            elif c["origOwner"] in c["wars"]:
                cat = "atwar"
            else:
                cat = "nonfounded"
            cap = c["need"] + CAP[cat]
            ok = L <= cap
            n_cap += ok
            if a.rows or not ok:
                print(f"{src} t{turn} p{p} {c['name'][14:]:22s} pop {c['pop']:2d} need {c['need']:2d} lost {L:2d} "
                      f"{cat:10s} cap {cap:2d} {'at cap' if L == cap else ('under' if ok else 'OVER')}")
        # D: founded losers are the most populous founded cities, all but the last at cap
        fd = sorted((c for c in cs if c["origOwner"] == p), key=lambda c: -c["pop"])
        fl = [c for c in fd if c["sources"].get("LostFromWarWeariness", 0) > 0]
        if fl:
            k = len(fl)
            top = fd[:k]
            minpop = min(c["pop"] for c in fl)
            good = all(c["pop"] >= minpop for c in top) and all(
                c["pop"] <= minpop for c in fd if c not in fl)
            fd_top += good
            fd_bad += not good
            for c in sorted(fl, key=lambda c: -c["pop"])[:-1]:
                if c["sources"]["LostFromWarWeariness"] == c["need"]:
                    fd_full += 1
                else:
                    fd_fullbad += 1
            if not good:
                print(f"   ORDER {src} t{turn} p{p}: losers {[(c['pop'], c['sources']['LostFromWarWeariness']) for c in fl]}"
                      f" founded pops {[c['pop'] for c in fd]}")
    print(f"need = ceil(pop/2): {need_ok}/{need_ok + need_bad} cities")
    print(f"{n_seat} seats with a loss; {n_city} losing cities; loss <= need + cap(category): {n_cap}/{n_city}")
    print(f"founded losers are the most populous founded cities: {fd_top}/{fd_top + fd_bad} seats;"
          f" non-last founded losers at their need: {fd_full}/{fd_full + fd_fullbad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
