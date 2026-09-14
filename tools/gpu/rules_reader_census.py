"""THE READER CENSUS — every rules.json key must be READ by both engines.

    python tools/gpu/rules_reader_census.py            # report
    python tools/gpu/rules_reader_census.py --strict   # exit 1 on an unlisted orphan

Provenance (docs/PROVENANCE.md) says a constant is RIGHT; it cannot say the
constant is USED. The Stave Church, the Sea Dog's civic gate and the walls'
siege assist were all a correctly exported value that one engine never read.
This walks rules.json and asks, per key, whether a reader exists on each
side — by NAME, which is a heuristic and says so:

  * a GPU reader is the key's string literal ("cost", 'grantUnitNewCity')
    anywhere under gpu/core or policy/ — the loader in simbase.py picks
    JSON keys by literal, so an unread key has no literal;
  * a TS reader is a property access `.column` anywhere under cpu/core —
    the catalogs are read as `def.column`. The exporter RENAMES most keys
    on the way to the wire (`upgradesTo` -> `upTo`), so the TS half is
    censused over the CATALOG columns provenance.json names, not over the
    wire keys; the exporter itself is excluded because it is the WRITER.

A generic name (`cost`, `amount`, `v`) passes on both sides for the wrong
reason; the census is a floor, not a proof. What it CAN show is a key no
code names at all — that key is exported to nobody. `ALLOWLIST` names the
accepted orphans with a reason; `--strict` fails on any other.

Groups are censused by SHAPE: a list of rows contributes its rows' keys
(once per group); a dict contributes its nested paths; a scalar top-level
key contributes itself.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RULES = ROOT / "seeder" / "worlds" / "rules.json"
PROVENANCE = ROOT / "seeder" / "worlds" / "provenance.json"
GPU_DIRS = [ROOT / "gpu" / "core", ROOT / "policy"]
TS_DIRS = [ROOT / "cpu" / "core"]

# key -> why nobody needs to read it
ALLOWLIST: dict[str, str] = {
    "srcStamp": "the source hash: compared by the battery, not read by a rule",
    "id": "identity — rows are addressed by index on the wire",
    "name": "prose",
    "description": "prose",
}

SKIP_GROUPS = {"trace"}  # the trace column tables ride along for the driver, not a rule


def key_paths(x, prefix: str, out: set[str]) -> None:
    """collect `group.key` paths; a list's rows are merged into one shape"""
    if isinstance(x, dict):
        for k, v in x.items():
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                key_paths(v, p, out)
            else:
                out.add(p)
    elif isinstance(x, list):
        for v in x:
            if isinstance(v, (dict, list)):
                key_paths(v, prefix + "[]", out)
            else:
                out.add(prefix + "[]")
                break


def read_sources(dirs: list[pathlib.Path], exts: tuple[str, ...]) -> str:
    blobs = []
    for d in dirs:
        for f in sorted(d.rglob("*")):
            if f.suffix in exts and "node_modules" not in f.parts and "__pycache__" not in f.parts:
                blobs.append(f.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(blobs)


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    rules = json.loads(RULES.read_text(encoding="utf-8"))
    paths: set[str] = set()
    for g, v in rules.items():
        if g in SKIP_GROUPS:
            continue
        if isinstance(v, (dict, list)):
            key_paths(v, g, paths)
        else:
            paths.add(g)
    gpu_src = read_sources(GPU_DIRS, (".py",))
    ts_src = read_sources(TS_DIRS, (".ts",))
    gpu_lits = set(re.findall(r"""["']([A-Za-z_][A-Za-z0-9_]*)["']""", gpu_src))
    # `.col`, `['col']`, and a column NAMED to a helper (`seatBuildingSum(state,
    # seat, 'healOnKill')`) all read a column on TS — so string literals count
    # there too, as they do on the GPU
    ts_props = set(re.findall(r"\.([A-Za-z_][A-Za-z0-9_]*)\b", ts_src)) \
        | set(re.findall(r"""["']([A-Za-z_][A-Za-z0-9_]*)["']""", ts_src))

    # THE GPU HALF — wire keys against string literals
    no_gpu = []
    for p in sorted(paths):
        leaf = p.replace("[]", "").split(".")[-1]
        if leaf in ALLOWLIST:
            continue
        if leaf not in gpu_lits:
            no_gpu.append(p)
    print(f"rules.json: {len(paths)} key paths over {len(rules)} groups")
    print(f"  wire keys with NO GPU literal: {len(no_gpu)}")
    for p in no_gpu:
        print(f"    {p}")

    # THE TS HALF — catalog columns against property accesses
    no_ts: list[str] = []
    cols: set[str] = set()
    if PROVENANCE.exists():
        prov = json.loads(PROVENANCE.read_text(encoding="utf-8"))
        for e in prov["constants"]:
            if e["catalog"] == "const":
                continue
            # drop numeric indices and ALL-CAPS segments: `gpPoints.ADMIRAL`,
            # `buildingYields.SHRINE` are MAP KEYS read as `[cls]`, not columns
            segs = [s for s in e["name"].split(".")[2:]
                    if not s.isdigit() and not re.fullmatch(r"[A-Z][A-Z0-9_]*", s)]
            if segs:
                cols.add(f"{e['catalog']}.{segs[-1]}")
        for c in sorted(cols):
            col = c.split(".")[-1]
            if col in ALLOWLIST:
                continue
            if col not in ts_props:
                no_ts.append(c)
        print(f"provenance.json: {len(cols)} catalog columns")
        print(f"  columns with NO TS property access: {len(no_ts)}")
        for c in no_ts:
            print(f"    {c}")
    else:
        print("provenance.json missing — run `npm run export`; TS half skipped")

    bad = len(no_gpu) + len(no_ts)
    if strict and bad:
        print("READER CENSUS RED — an exported key or catalog column nobody names; read it or allowlist it with a reason")
        return 1
    print("READER CENSUS " + ("OK" if not bad else "REPORTED"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
