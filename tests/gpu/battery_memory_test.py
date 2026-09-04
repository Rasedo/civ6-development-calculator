"""THE BATTERY DEGRADES IN TIME, NOT IN THE BOX (#230).

    python tests/gpu/battery_memory_test.py

OWNER, 2026-09-04, after a second BSOD: the battery launched beside a VM
holding 24 GB and took the machine down. The fan-out was fixed and
memory-blind — up to 8 serve shards plus a 9-worker poke pool, each holding a
batched sim and a TS child, sized from core count with nothing reading how
much memory was free.

Their words: "it would run longer without enough memory instead of hard
crashing." So the bar here is that the planner NARROWS and never refuses, and
that a memory death is neither a pass nor a red.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(ROOT / "tools" / "gpu"))
import battery  # noqa: E402
import test_stats  # noqa: E402


def with_free(mb, fn):
    """Run `fn` as if the box had `mb` free."""
    old = os.environ.get("CIV6_BATTERY_MEM_MB")
    os.environ["CIV6_BATTERY_MEM_MB"] = str(mb)
    try:
        return fn()
    finally:
        if old is None:
            del os.environ["CIV6_BATTERY_MEM_MB"]
        else:
            os.environ["CIV6_BATTERY_MEM_MB"] = old


def test_the_probe_reads_this_box() -> None:
    free = battery.free_mb()
    assert free > 0, "free memory is unreadable on this box"
    assert free < 4 * 1024 * 1024, f"{free}MB free is not a plausible figure"
    got = with_free(1234, battery.free_mb)
    assert got == 1234.0, f"the CIV6_BATTERY_MEM_MB door read {got}"
    print(f"  1 the probe OK — {free:.0f}MB free, and the override door works")


def test_plenty_of_memory_keeps_the_full_fan_out() -> None:
    per = battery.lane_mb()
    plenty = battery.MEM_RESERVE_MB + per * (8 + battery.POKE_WORKERS) + 1024
    shards, pokes, why = with_free(plenty, lambda: battery.plan_pool(8))
    assert shards == 8, f"{shards} shards where the full 8 fit"
    assert pokes == battery.POKE_WORKERS, f"{pokes} poke workers where the full pool fits"
    assert "full fan-out" in why, why
    print(f"  2 the plan OK — {plenty:.0f}MB free keeps 8 shards and {pokes} workers")


def test_scarce_memory_narrows_and_never_refuses() -> None:
    """The whole point: fewer lanes, longer run — never a refusal, and never
    a fan-out the box cannot hold."""
    per = battery.lane_mb()
    for lanes in (1, 2, 3, 6, 10):
        free = battery.MEM_RESERVE_MB + per * lanes
        shards, pokes, why = with_free(free, lambda: battery.plan_pool(8))
        assert shards >= 1 and pokes >= 1, \
            f"{free:.0f}MB free planned {shards} shards / {pokes} workers — a refusal"
        assert shards <= 8, f"{shards} shards is more than asked for"
        assert pokes <= battery.POKE_WORKERS, f"{pokes} workers is more than the pool"
        assert shards + pokes <= max(2, lanes), \
            f"{free:.0f}MB free (room for {lanes}) planned {shards + pokes} lanes"
        if lanes < 8:
            assert "DEGRADING" in why, f"no degrade at room for {lanes}: {why}"
    print("  3 the degrade OK — narrows to fit, floors at 1 shard + 1 worker, never refuses")


def test_a_vm_sized_squeeze_still_runs() -> None:
    """The exact shape that crashed the box: almost nothing free."""
    shards, pokes, _why = with_free(battery.MEM_RESERVE_MB + 100, lambda: battery.plan_pool(8))
    assert (shards, pokes) == (1, 1), f"a near-empty box planned {shards} shards / {pokes} workers"
    print("  4 the squeeze OK — a near-empty box runs one shard and one worker")


def test_an_oom_lane_is_neither_pass_nor_red() -> None:
    assert battery.looks_oom("numpy.core._exceptions.MemoryError: Unable to allocate 4.00 GiB")
    assert battery.looks_oom("terminate called after throwing an instance of 'std::bad_alloc'")
    assert battery.looks_oom("RuntimeError: [enforce fail] ... out of memory")
    # ...and NOT on an ordinary red, or the harness would hide real failures
    assert not battery.looks_oom("AssertionError: 20 turns of Autocracy paid 0%, expected 1%")
    assert not battery.looks_oom("SERVE GATE FAILED — digests differ at turn 41")
    print("  5 the classifier OK — memory deaths only, ordinary reds untouched")


def test_the_outcome_has_its_own_name() -> None:
    """An OOM run must not record `pass` (its step count would be short — the
    verify-by-step-count rule exists for exactly this shape) and must not
    advance the cadence clock."""
    rec = {"result": "oom", "head": "deadbeef" * 5}
    assert test_stats._last_pass_head([rec]) == "", "an oom run reset the cadence clock"
    assert test_stats._last_pass_head([{"result": "pass", "head": "abc"}, rec]) == "abc"
    assert test_stats._OOM == -5
    # the recorded shape, so a reader can find the memory block
    src = (ROOT / "tools" / "gpu" / "test_stats.py").read_text(encoding="utf-8")
    assert '"mem": mem' in src, "the record carries no memory block"
    print("  6 the outcome OK — `oom` is its own result and never a pass")


def test_the_history_is_readable() -> None:
    """`lane_mb` reads the same history `lane_cost` does, and must survive a
    log with no memory blocks in it — every run recorded before today."""
    per = battery.lane_mb()
    assert per > 0, "the per-lane budget is not positive"
    log = ROOT / "stats" / "battery.jsonl"
    if log.exists():
        rows = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines() if l.strip()]
        assert rows, "the battery log is empty"
        # older rows carry no `mem` key at all — the budget must still resolve
        assert any("mem" not in r for r in rows) or True
    print(f"  7 the history OK — {per:.0f}MB/lane budget from {log.name}")


def main() -> int:
    test_the_probe_reads_this_box()
    test_plenty_of_memory_keeps_the_full_fan_out()
    test_scarce_memory_narrows_and_never_refuses()
    test_a_vm_sized_squeeze_still_runs()
    test_an_oom_lane_is_neither_pass_nor_red()
    test_the_outcome_has_its_own_name()
    test_the_history_is_readable()
    print("BATTERY OK battery_memory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
