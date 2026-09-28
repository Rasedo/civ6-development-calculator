"""H-3: tools/civ6map/check.py on natives-probe sessions with the roster the
game drew (h3_roster.py), one summary line per record.

    python tools/civ6lab/h3_rostercheck.py runs/h3_session_<stamp>.jsonl [...] [--script Pangaea]

The full check.py output of each goes to .claude/scratchpad/h3chk_<tag>.txt.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from h3_roster import args as roster_args  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("sessions", nargs="+")
    p.add_argument("--script", default="")
    a = p.parse_args()
    for s in a.sessions:
        for line, ln in enumerate(pathlib.Path(s).read_text(encoding="utf-8").splitlines()):
            rec = json.loads(ln)
            majors, minors = roster_args(rec)
            cmd = [sys.executable, str(ROOT / "tools/civ6map/check.py"), "--session", s, "--line", str(line),
                   "--majors", ",".join(majors), "--minors", ",".join(minors)]
            if a.script:
                cmd += ["--script", a.script]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            out = r.stdout + r.stderr
            (ROOT / ".claude/scratchpad" / f"h3chk_{rec['tag']}.txt").write_text(out, encoding="utf-8")
            head = [x for x in out.splitlines() if x.startswith(("map seed", "Lua draws", "map facts", "unspecified",
                                                                   "Traceback"))]
            js = out[out.find("\n{") + 1:] if "\n{" in out else ""
            try:
                cmp_ = json.loads(js)
                starts = "starts EQUAL" if cmp_["starts ours"] == cmp_["starts game"] else "starts DIFFER"
                tail = f"plots {cmp_['plots']} differ {cmp_['differ']} {starts}"
            except ValueError:
                tail = "no map comparison: " + out.strip().splitlines()[-1][:200] if out.strip() else "no output"
            print(f"{rec['tag']} ({len(majors)} majors, {len(minors)} minors)")
            for h in head:
                print("   ", h)
            print("   ", tail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
