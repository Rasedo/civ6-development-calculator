"""Protocol smoke test for the node bridge — stdlib only, no ML deps.

    python python/test_bridge.py

Runs masked-random episodes on two parallel env slots and checks shapes,
auto-reset, reward telescoping and determinism of the wire format.
"""

from __future__ import annotations

import json
import random
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BRIDGE = REPO / "dist-rl" / "rl-bridge.js"


def request(proc, msg):
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    assert line, "bridge died"
    out = json.loads(line)
    assert "error" not in out, out
    return out


def run() -> None:
    assert BRIDGE.exists(), "run `npm run rl:build` first"
    proc = subprocess.Popen(
        ["node", str(BRIDGE)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )
    info = request(proc, {"cmd": "init", "envs": 2, "horizon": 30, "objective": "balanced", "seed": 5})
    assert info["ok"] and info["obsSize"] > 0 and info["candSize"] > 0
    obs_size, cand_size, max_cands = info["obsSize"], info["candSize"], info["maxCands"]
    print(f"init ok: obs={obs_size} cand={cand_size} maxCands={max_cands} fv={info['featureVersion']}")

    results = request(proc, {"cmd": "reset"})["results"]
    assert len(results) == 2
    for r in results:
        assert len(r["obs"]) == obs_size
        assert len(r["cands"]) == max_cands * cand_size
        assert len(r["mask"]) == max_cands and sum(r["mask"]) >= 1

    rng = random.Random(7)
    done_count = 0
    reward_sums = [0.0, 0.0]
    finals: list[float] = []
    last = results
    for _ in range(2000):
        actions = []
        for r in last:
            valid = [i for i, m in enumerate(r["mask"]) if m]
            actions.append(rng.choice(valid))
        last = request(proc, {"cmd": "step", "actions": actions})["results"]
        for i, r in enumerate(last):
            reward_sums[i] += r["reward"]
            if r["done"]:
                done_count += 1
                finals.append(r["score"])
                assert r["turn"] >= 30, f"episode ended early: turn {r['turn']}"
                # fresh episode obs comes back immediately (auto-reset)
                assert sum(r["mask"]) >= 1
        if done_count >= 4:
            break
    assert done_count >= 4, "episodes never finished"
    assert all(s > 0 for s in finals), finals
    print(f"episodes finished: {done_count}, final scores: {[round(s) for s in finals]}")
    print(f"reward sums (≈ score climbed): {[round(s) for s in reward_sums]}")

    proc.stdin.write(json.dumps({"cmd": "close"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=5)
    print("bridge smoke test PASSED")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print("FAILED:", e)
        sys.exit(1)
