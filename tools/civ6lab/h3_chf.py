"""H-3: TerrainBuilder.CanHaveFeature(plot, f[, bool]) against a model built
from the live database's rows (Features and its child tables), scored plot by
plot on the finished maps of natives-probe sessions (chf records).

    python tools/civ6lab/h3_chf.py --rows runs/<session with h3_dbrows>.jsonl \
        --tables runs/<session with h3_dbtables>.jsonl runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import argparse
import collections
import json
import re

from h3_x import Session, unhex

MOUNTAIN = {2, 5, 8, 11, 14}
NWSLACK = 0
HILLS = {1, 4, 7, 10, 13}
WATER = {15, 16}


def load_tables(path: str) -> dict:
    rec = json.loads(open(path, encoding="utf-8").read().splitlines()[0])
    t = collections.defaultdict(list)
    for ln in rec["extra"]["h3_dbtables.lua"]:
        name, _, kv = ln.partition(" ")
        if name in ("COUNT", "ERR", "GP"):
            continue
        row = dict(part.split("=", 1) for part in re.split(r",(?=[A-Za-z_]+=)", kv) if "=" in part)
        t[name].append(row)
    return t


class DB:
    def __init__(self, rows_session: Session, tables: dict):
        self.T = rows_session.db["T"]
        self.F = rows_session.db["F"]
        self.R = rows_session.db["R"]
        self.tname = {int(i): r["PrimaryKey"] if "PrimaryKey" in r else r.get("TerrainType") for i, r in self.T.items()}
        self.tidx = {v: k for k, v in self.tname.items()}
        self.fidx = {r["FeatureType"]: i for i, r in self.F.items()}
        self.ridx = {r["ResourceType"]: i for i, r in self.R.items()}
        self.tables = tables

        def group(tab, key, val, idx):
            out = collections.defaultdict(set)
            for r in tables.get(tab, []):
                out[r[key]].add(idx[r[val]])
            return out
        self.valid_terrains = group("Feature_ValidTerrains", "FeatureType", "TerrainType", self.tidx)
        self.adj_terrains = group("Feature_AdjacentTerrains", "FeatureType", "TerrainType", self.tidx)
        self.not_adj_terrains = group("Feature_NotAdjacentTerrains", "FeatureType", "TerrainType", self.tidx)
        self.adj_features = group("Feature_AdjacentFeatures", "FeatureType", "FeatureTypeAdjacent", self.fidx)
        self.not_near = group("Feature_NotNearFeatures", "FeatureType", "FeatureTypeAvoid", self.fidx)
        self.res_terrains = group("Resource_ValidTerrains", "ResourceType", "TerrainType", self.tidx)
        self.res_features = group("Resource_ValidFeatures", "ResourceType", "FeatureType", self.fidx)

    def fb(self, f: int, col: str) -> bool:
        return self.F[f].get(col) == "true"

    def fi(self, f: int, col: str, default: int = 0) -> int:
        v = self.F[f].get(col)
        return int(v) if v not in (None, "nil") else default


class Plots:
    """the finished map's facts a rule can read"""

    def __init__(self, s: Session, nw_features: set[int] | None = None):
        """the game's own plot bits when the session carries them, else the
        predicates derived from the dump (h3_plotfacts)"""
        self.s = s
        g = s.g
        if s.x1("plot", "IsLake") is not None:
            bits = s.bits
            self.nw = s.bits("IsNaturalWonder")
        else:
            from h3_plotfacts import derive
            d = derive(s)
            bits = d.__getitem__
            self.nw = [s.feature[i] in (nw_features or set()) for i in range(g.n)]
        self.lake = bits("IsLake")
        self.coastal = bits("IsCoastalLand")
        self.fresh = bits("IsFreshWater")
        self.river = bits("IsRiver")
        self.imp = bits("IsImpassable")
        self.water = bits("IsWater")
        self.radj = bits("IsRiverAdjacent")
        self.salt_adj = [any(q is not None and self.water[q] and not self.lake[q] and s.feature[q] != 1 for q in g.ring1(i)) for i in range(g.n)]
        self.nwplots = [i for i in range(g.n) if self.nw[i]]
        self.cliff = [bool(fl & 56) for fl in s.flags]
        # a cliff on any edge: own NE/NW/W flags or a neighbour's facing flag
        self.cliff_any = []
        for i in range(g.n):
            c = bool(s.flags[i] & 56)
            e, se, sw = g.adj(i, 1), g.adj(i, 2), g.adj(i, 3)
            c |= e is not None and bool(s.flags[e] & 32)
            c |= se is not None and bool(s.flags[se] & 16)
            c |= sw is not None and bool(s.flags[sw] & 8)
            self.cliff_any.append(c)
        # hex distance to the nearest land plot
        land = [i for i in range(g.n) if not self.water[i]]
        self.dland = [0] * g.n
        dist = {i: 0 for i in land}
        frontier = list(land)
        while frontier:
            nxt = []
            for u in frontier:
                for v in g.ring1(u):
                    if v is not None and v not in dist:
                        dist[v] = dist[u] + 1
                        nxt.append(v)
            frontier = nxt
        self.dland = [dist.get(i, 99) for i in range(g.n)]


def rule(db: DB, P: Plots, f: int, i: int, skip=()) -> tuple[bool, str]:
    """CanHaveFeature(plot i, f, true): the single-plot test, the first
    failing clause's name (clauses named in `skip` are not tested)"""
    for why, bad in clauses(db, P, f, i):
        if why not in skip and bad():
            return False, why
    return True, "ok"


def clauses(db: DB, P: Plots, f: int, i: int):
    s, g = P.s, P.s.g
    name = db.F[f]["FeatureType"]
    t = s.terrain[i]
    ring = g.ring1(i)
    vt = db.valid_terrains.get(name)
    at = db.adj_terrains.get(name)
    nat = db.not_adj_terrains.get(name)
    af = db.adj_features.get(name)
    nn = db.not_near.get(name)
    mn, mx = db.fi(f, "MinDistanceLand"), db.fi(f, "MaxDistanceLand")
    mnw = db.fi(f, "MinDistanceNW", -1)
    return [
        ("has feature", lambda: s.feature[i] != -1),
        ("terrain", lambda: vt is not None and t not in vt and not (P.lake[i] and db.fb(f, "Lake"))),
        ("NoCoast", lambda: db.fb(f, "NoCoast") and not P.water[i] and P.salt_adj[i]),
        ("NoRiver", lambda: db.fb(f, "NoRiver") and (P.river[i] or P.radj[i])),
        ("RequiresRiver", lambda: db.fb(f, "RequiresRiver") and not P.river[i]),
        ("Lake: water next to it", lambda: db.fb(f, "Lake") and any(q is not None and P.water[q] for q in ring)),
        ("a lake", lambda: P.lake[i] and not db.fb(f, "Lake")),
        ("Coast", lambda: db.fb(f, "Coast") and not P.salt_adj[i]),
        ("MinDistanceLand", lambda: bool(mn) and P.dland[i] < mn),
        ("MaxDistanceLand", lambda: bool(mx) and P.dland[i] > mx),
        ("NoAdjacentFeatures", lambda: db.fb(f, "NoAdjacentFeatures") and any(q is not None and s.feature[q] != -1 for q in ring)),
        ("AdjacentTerrains", lambda: bool(at) and not any(q is not None and s.terrain[q] in at for q in ring)),
        ("NotAdjacentTerrains", lambda: bool(nat) and any(q is not None and s.terrain[q] in nat for q in ring)),
        ("AdjacentFeatures", lambda: bool(af) and not any(q is not None and s.feature[q] in af for q in ring)),
        ("NotNearFeatures", lambda: bool(nn) and any(g.dist(i, q) <= g.n // 256 for q in range(g.n) if s.feature[q] in nn)),
        ("MinDistanceNW", lambda: mnw > 0 and any(g.dist(i, q) <= mnw for q in P.nwplots)),
    ]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("--feature", default="")
    p.add_argument("--show", type=int, default=4)
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    tot = collections.Counter()
    bad = collections.Counter()
    for path in a.sessions:
        s = Session(path)
        P = Plots(s)
        for e in s.xs("chf"):
            f = int(e[1])
            name = db.F[f]["FeatureType"]
            if a.feature and a.feature not in name:
                continue
            for variant, bits in (("true", e[3]),):
                got = unhex(bits, s.g.n)
                shown = 0
                for i in range(s.g.n):
                    pred, why = rule(db, P, f, i)
                    tot[(name, variant)] += 1
                    if pred != got[i]:
                        bad[(name, variant)] += 1
                        if shown < a.show and a.feature:
                            shown += 1
                            print(f"  {path[-24:]} {name} arg={variant} plot {s.g.xy(i)} t{s.terrain[i]} f{s.feature[i]} "
                                  f"r{s.resource[i]} game={got[i]} model={pred} ({why}) coastal={P.coastal[i]} "
                                  f"river={P.river[i]} lake={P.lake[i]} dland={P.dland[i]}")
    for k in sorted(tot):
        if bad[k] or a.feature:
            print(f"{k[0]:32s} arg={k[1]:5s} wrong {bad[k]:6d} of {tot[k]}")
    print("features exact under every argument:", len({k[0] for k in tot} - {k[0] for k in bad if bad[k]}),
          "of", len({k[0] for k in tot}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
