"""H-3: the start regions, ours against the game's natives-probe records
(sdiv / sinfo for the majors, mdiv / minfo for the minors): each region's
box, fertility and civs side by side, the first difference named.

    python tools/civ6lab/h3_regcmp.py runs/h3_session_<stamp>.jsonl --script Terra
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
from h3_roster import args as roster_args  # noqa: E402
from tools.civ6map import world as W  # noqa: E402
from tools.civ6map.check import session_setup  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--script", required=True)
    a = p.parse_args()
    rec = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln][a.line]
    xs = rec["probe"]["x"]
    for e in xs:
        if e.startswith(("sdiv|", "mdiv|", "ciu|")):
            print("game", e[:200])
    snap = {}
    orig_maj, orig_min = W.Starts.DivideMapIntoMajorRegions, W.Starts.DivideMapIntoMinorRegions

    def maj(self, *args):
        orig_maj(self, *args)
        snap["major"] = [r.copy() for r in self.major]
        snap["entries"] = self.entries([self.w.plot_fertility(i) for i in range(self.w.N)], self.lmid)

    def mnr(self, *args):
        orig_min(self, *args)
        snap["minor"] = [r.copy() for r in self.minor]
    W.Starts.DivideMapIntoMajorRegions, W.Starts.DivideMapIntoMinorRegions = maj, mnr
    majors, minors = roster_args(rec)
    size, n_minors, options = session_setup(rec)
    generate(a.script, size, int(rec["map_seed"]), majors=majors, n_minors=n_minors, minors=minors, options=options)
    print("our entries (continent, landmass, fertility, box W E S N):")
    for e in snap["entries"]:
        print("  ", e.continent, e.landmass, e.fertility, e.west, e.east, e.south, e.north)
    for kind, tag in (("major", "sinfo|"), ("minor", "minfo|")):
        game = [e for e in xs if e.startswith(tag)]
        ours = snap.get(kind, [])
        print(f"{kind}: game {len(game)} regions, ours {len(ours)}")
        for k in range(max(len(game), len(ours))):
            g = game[k][len(tag):] if k < len(game) else "-"
            o = ours[k] if k < len(ours) else None
            os_ = (f"cont={o.continent} fert={o.fertility} W={o.west} E={o.east} S={o.south} N={o.north} civs={o.civs}"
                   if o else "-")
            print(f"  game {g}\n  ours {os_}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
