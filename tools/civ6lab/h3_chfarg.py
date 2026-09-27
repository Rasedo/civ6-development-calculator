"""H-3: CanHaveFeature's third argument: per feature, the plots where the
game's answer with true differs from false and from no argument, with the
plot's terrain, feature and water facts.

    python tools/civ6lab/h3_chfarg.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unhex


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        names = {int(i): r.get("FeatureType") for i, r in s.db["F"].items()}
        for e in s.xs("chf"):
            f = int(e[1])
            bf, bt, bn = (unhex(e[k], s.g.n) for k in (2, 3, 4))
            d_tf = [i for i in range(s.g.n) if bt[i] != bf[i]]
            d_nf = [i for i in range(s.g.n) if bn[i] != bf[i]]
            if d_tf or d_nf:
                kinds = collections.Counter((bt[i], s.terrain[i], s.feature[i]) for i in d_tf)
                print(f"{path[-26:]} f{f} {names.get(f, '?')}: true!=false on {len(d_tf)} "
                      f"(true,terrain,feature) {kinds.most_common(6)}; none!=false on {len(d_nf)} "
                      f"{collections.Counter((bn[i], s.terrain[i], s.feature[i]) for i in d_nf).most_common(4)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
