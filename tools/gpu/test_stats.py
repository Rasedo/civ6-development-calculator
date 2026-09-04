"""TEST-RUN STATISTICS — what the battery costs and what each lane ever catches.

Two questions the testing strategy needs answered with data, not memory:

  1. Per BATTERY run: when did it run, on what HEAD, over which commits since
     the last GREEN run, and did it pass. `stats/battery.jsonl`, append-only,
     one JSON object per line, committed with the repo.
  2. Per LANE: how often it runs, how often it fails, and — the number that
     decides whether a lane earns its wall-clock — how often it was the ONLY
     lane failing. A lane that never fails alone has never told us anything
     the rest of the battery would not have.

`gpu/battery.py` calls `record()` at the end of every run, pass or fail, so
the log accrues without anybody remembering to write it. Read it with:

    python tools/gpu/test_stats.py            # the report
    python tools/gpu/test_stats.py --json     # the raw aggregate
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "stats" / "battery.jsonl"

_OK, _SKIP, _BAIL = 0, -1, -3
# #230: a lane the BOX killed for memory. Not a red — it says nothing
# about the code — and not a green, because the lane never ran.
_OOM = -5


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                              text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.SubprocessError):  # a stats writer must never break a run
        return ""


def _rows() -> list[dict]:
    if not LOG.exists():
        return []
    out = []
    for line in LOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def _last_pass_head(rows: list[dict]) -> str:
    for r in reversed(rows):
        if r.get("result") == "pass" and r.get("head"):
            return str(r["head"])
    return ""


def record(results, wall: float, ok: bool, mem: dict | None = None,
           oom: bool = False) -> None:
    """Append one battery record. `results` is battery.py's (name, secs, rc)
    list. Never raises: a statistics writer that can fail a green battery is
    worse than no statistics."""
    try:
        rows = _rows()
        head = _git("rev-parse", "HEAD")
        since = _last_pass_head(rows)
        span = _git("rev-list", f"{since}..HEAD") if since and since != head else ""
        commits = [c for c in span.splitlines() if c]
        if not since:
            commits = [head] if head else []
        steps = [{"lane": n, "secs": round(s, 1),
                  "status": "ok" if rc == _OK else "skip" if rc == _SKIP else "bail" if rc == _BAIL else "oom" if rc == _OOM else "fail"}
                 for n, s, rc in results]
        rec = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "head": head,
            "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
            # #230: three outcomes, not two. `oom` never counts as a pass,
            # so the cadence clock does not advance on one.
            "result": "oom" if oom else "pass" if ok else "fail",
            "mem": mem,
            "wall_s": round(wall, 1),
            "dirty": bool(_git("status", "--porcelain")),
            "since_last_pass": since,
            "commits_under_test": commits,
            "n_commits": len(commits),
            "failed_lanes": [s["lane"] for s in steps if s["status"] in ("fail", "bail")],
            "oom_lanes": [s["lane"] for s in steps if s["status"] == "oom"],
            "steps": steps,
        }
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")
    except Exception as exc:  # noqa: BLE001 — see the docstring
        print(f"(test-stats not recorded: {exc})", flush=True)


def report() -> dict:
    rows = _rows()
    runs = len(rows)
    passes = sum(1 for r in rows if r.get("result") == "pass")
    lanes: dict[str, dict] = {}
    for r in rows:
        failed = [s["lane"] for s in r.get("steps", []) if s["status"] == "fail"]
        for s in r.get("steps", []):
            st = lanes.setdefault(s["lane"], {"runs": 0, "fails": 0, "solo": 0, "secs": 0.0})
            st["runs"] += 1
            st["secs"] += float(s.get("secs", 0.0))
            if s["status"] == "fail":
                st["fails"] += 1
                if len(failed) == 1:
                    st["solo"] += 1
    return {"runs": runs, "passes": passes, "fails": runs - passes, "lanes": lanes}


def main() -> int:
    rep = report()
    if "--json" in sys.argv:
        print(json.dumps(rep, indent=1))
        return 0
    print(f"BATTERY RUNS: {rep['runs']}  (pass {rep['passes']} / fail {rep['fails']})")
    if not rep["runs"]:
        print("no runs recorded yet — stats/battery.jsonl is empty")
        return 0
    print(f"\n{'lane':<20} {'runs':>5} {'fails':>6} {'solo':>5} {'mean s':>7}   catch rate")
    for lane, st in sorted(rep["lanes"].items(), key=lambda kv: (-kv[1]["fails"], -kv[1]["secs"])):
        mean = st["secs"] / max(st["runs"], 1)
        rate = st["fails"] / max(st["runs"], 1)
        print(f"{lane:<20} {st['runs']:>5} {st['fails']:>6} {st['solo']:>5} {mean:>6.1f}s   {rate:6.1%}")
    print("\nsolo = runs where this lane was the ONLY one failing — what it caught that nothing else did.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
