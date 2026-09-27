"""Read out the turn-order recorders WITHOUT advancing or clearing: swap each
armed log out (turnorder_run.read_all) and write its lines to
runs/turnorder/<tag>_<stamp>.jsonl in turnorder_run's row form. Used after a
turnorder_run whose last turn stopped before the local seat's start (a
Congress session or a popup held it): answer the hold
(`turnorder_unstick.py`), then read what the seat's start recorded.

    python tools/civ6lab/turnorder_c93read.py --host 127.0.0.2 --tag c93_t151p0 [--recs GC,IG,C9]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

import turnorder_run as tr
from tuner import Tuner


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--recs", default="GC,IG,C9")
    a = ap.parse_args()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outp = tr.HERE / "runs" / "turnorder" / f"{a.tag}_{stamp}.jsonl"
    t = Tuner(a.host).connect()
    with outp.open("w", encoding="utf-8") as f:
        for r in a.recs.split(","):
            lines = tr.read_all(t, r)
            for ln in lines:
                f.write(json.dumps(tr.parse(r, ln), ensure_ascii=False) + "\n")
            print(f"{r}: {len(lines)} events")
    t.close()
    print("wrote", outp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
