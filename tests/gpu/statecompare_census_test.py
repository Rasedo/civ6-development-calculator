"""STATE COMPARE — the census and the digest algebra, GPU half.

The census is the anti-rot contract: every `_MUTABLE` plane in
`gpu/core/engine.py` is either named by a manifest field's `planes` or
excluded with a reason. Adding a tensor without deciding what compares it
fails HERE.

The algebra tests mirror `tests/cpu/statecompare-census.test.ts` value for
value: same keys, same columns, same properties. Cross-language BIT-equality
is not pinned by fixtures — the serve gate's digest lane proves it live over
real state every run. No torch: statecompare parses the engine's source.

    python tests/gpu/statecompare_census_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import statecompare  # noqa: E402


def main() -> None:
    man = statecompare.load_manifest()
    complaints = statecompare.census(man)
    assert complaints == [], "\n".join(complaints)
    statecompare.check_extractors(man)

    for g in man["groups"]:
        for f in g["fields"]:
            assert f["compare"] in ("exact", "milli"), f"{g['name']}.{f['name']}: compare {f['compare']!r}"
            # A field either names the surface it reads on one engine, or is
            # DERIVED — computed from surfaces another field already covers,
            # and carried only so a collision between them is loud. Silence is
            # the third case, and the one this rejects.
            assert f.get("covers") or f.get("planes") or f.get("derived"), (
                f"{g['name']}.{f['name']} names no surface on either engine and is not marked derived"
            )
            if f.get("derived"):
                assert f.get("note"), f"{g['name']}.{f['name']} is derived but says nothing about what it guards"

    # --- the digest algebra (the TS test's vectors, mirrored) ---
    keys = [3, 7, 11]
    cols = [
        ("exact", [1, 2, 3]),
        ("milli", [0.5, [1.25, -2.5], 0]),
        ("exact", [[4, 5], [], [6]]),
    ]
    base = statecompare.fold_rows(keys, cols)

    shuffled = [keys[2], keys[0], keys[1]]
    scols = [(c, [v[2], v[0], v[1]]) for c, v in cols]
    assert statecompare.fold_rows(shuffled, scols) == base, "row order must not change the digest"

    assert statecompare.fold_rows([3, 7, 12], cols) != base, "a changed key must change the digest"

    swapped = [cols[2], cols[1], cols[0]]
    assert statecompare.fold_rows(keys, swapped)["exact"] != base["exact"], "column order must change the digest"

    same_milli = statecompare.fold_rows(keys, [cols[0], ("milli", [0.5004, [1.25, -2.5], 0]), cols[2]])
    assert same_milli == base, "a sub-half-milli drift must round away"
    moved = statecompare.fold_rows(keys, [cols[0], ("milli", [0.501, [1.25, -2.5], 0]), cols[2]])
    assert moved["milli"] != base["milli"] and moved["exact"] == base["exact"], \
        "a milli drift must move only the milli digest"

    off_by_one = statecompare.fold_rows(keys, [("exact", [1, 2, 4]), cols[1], cols[2]])
    assert off_by_one["exact"] != base["exact"] and off_by_one["milli"] == base["milli"], \
        "an integer off-by-one must move only the exact digest — the class the flat trace tolerance passed"

    for kind in ("exact", "milli"):
        assert len(base[kind]) == 16 and int(base[kind], 16) >= 0, f"{kind} digest must be 64-bit hex"

    n_fields = sum(len(g["fields"]) for g in man["groups"])
    print(f"STATECOMPARE CENSUS TEST OK — census clean, extractors complete, "
          f"digest algebra holds over {n_fields} fields / {len(man['groups'])} groups")


if __name__ == "__main__":
    main()
