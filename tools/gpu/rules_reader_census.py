"""THE READER CENSUS — every rules.json key must be READ by both engines.

    python tools/gpu/rules_reader_census.py            # report
    python tools/gpu/rules_reader_census.py --strict   # exit 1 on any orphan not in ALLOWLIST
    python tools/gpu/rules_reader_census.py --baseline tools/gpu/rules_reader_census_baseline.txt
        # the battery's form: exit 1 only on an orphan the baseline does not
        # list; regenerate the baseline DELIBERATELY (`> that file`) when a
        # known orphan is read or deleted, never as a battery side effect

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
code names at all — that key is exported to nobody. The ALLOWLIST table names the
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

CIV_LEVEL_REASON = (
    "an install `CivilizationLevels` permission carried literally: only the two annex "
    "columns fork a live rule — canAnnexTilesWithCulture the culture claim, "
    "canAnnexTilesWithReceivedInfluence the minor's plot per envoy; the rest are asserted "
    "against each engine's own shape in "
    "tests/cpu/minors/civ-levels.test.ts:38 and tests/gpu/minor_record_test.py:99")

# key -> why nobody needs to read it
#
# Two kinds of entry live here. A name that NOTHING has to read (prose, an
# identity column). And a name one engine reads under ANOTHER SPELLING: the
# fact IS implemented, the census's by-name heuristic simply cannot see the
# reader — a cpu/data helper that closes over the column (`POWER_PLANT_IDS`,
# `civUpgradeTarget`), a dynamic `row[k]` over a key list, a wire column the
# GPU consumes re-encoded as an integer code, or a value only a test asserts.
# Every entry names its reader with a file:line, so a later sweep can check
# the claim instead of trusting the sentence.
ALLOWLIST: dict[str, str] = {
    "srcStamp": "the source hash: compared by the battery, not read by a rule",
    "id": "identity — rows are addressed by index on the wire",
    "name": "prose",
    "description": "prose",
    # ---- prose columns ----
    "desc": "prose: the eureka's Civilopedia sentence (cpu/data/boosts.ts:36)",
    "title": "prose: the governor's Civilopedia epithet (cpu/data/governors.ts:30)",
    # ---- read through a cpu/data helper the census does not walk ----
    "powerPlant": "TS reads it as POWER_PLANT_IDS (cpu/data/buildings.ts:1078), consumed at "
                  "cpu/core/yields.ts:605, climate.ts:43, congress.ts:231; the GPU reads the wire "
                  "key (gpu/core/simbase.py:433)",
    "upgradesTo": "TS reads it in civUpgradeTarget (cpu/data/units.ts:3565), called from "
                  "cpu/core/units.ts:1352 and cpu/core/stockpile.ts:224",
    "cavalryTag": "TS reads it in isLightCavalry (cpu/data/units.ts:3573), called from "
                  "cpu/core/production.ts:385",
    "uniqueLeader": "TS reads it in civUnitAllowed / civReplacement (cpu/data/units.ts:3665, :3673), "
                    "called from cpu/core/units.ts:1282 and cpu/core/stockpile.ts; the GPU reads the wire's "
                    "`uniqLeader` (gpu/core/sim_init.py, `_type_uniq_leader`)",
    "defenseCS": "TS reads it in improvementDefenseCS (cpu/data/improvements.ts:1500), called "
                 "from cpu/core/combat.ts:108 and :655; the GPU reads the wire's `defCs` "
                 "(gpu/core/sim_init.py:1855)",
    "gpClasses": "TS reads it in gpClassesOf (cpu/data/projects.ts:468), called from "
                 "cpu/core/production.ts:165",
    "gppFraction": "TS reads it in gppFractionOf (cpu/data/projects.ts:472), called from "
                   "cpu/core/production.ts:167",
    # ---- read dynamically, by a key the code holds in a list ----
    "diplomatic": "the Potala Palace's extraSlots column, read as `xs[k]` over SLOT_KINDS at "
                  "cpu/core/effects.ts:1159",
    # ---- the same fact under the other engine's spelling ----
    "onCoastalWater": "the GPU reads this clause as districtScaffold placement code 2 "
                      "(gpu/core/sim_economy.py:3057), TS as def.placement.onCoastalWater "
                      "(cpu/core/rules.ts:519) — HARBOR and WATER_PARK, checked row for row",
    "reqAdjCenter": "the GPU reads this clause as placement code 1 (gpu/core/sim_economy.py:3067), "
                    "TS as def.placement.requiresAdjacentCityCenter (cpu/core/rules.ts:584) — the "
                    "Aqueduct, the only row carrying it",
    "reqWaterOrMountain": "the other half of placement code 1's `aqsrc` "
                          "(gpu/core/sim_economy.py:3069) against "
                          "def.placement.requiresWaterSourceOrMountain (cpu/core/rules.ts:589)",
    "notAdjCenter": "the GPU reads this clause as placement code 3 "
                    "(gpu/core/sim_economy.py:3067), TS as "
                    "def.placement.notAdjacentToCityCenter (cpu/core/rules.ts:595) — the "
                    "Encampment and the Preserve",
    "unlockId": "the scaffold table's SOURCE column: TS gates a district on the tech/civic's own "
                "`unlockDistrict` effect (cpu/core/rules.ts:495), and the exporter resolves this "
                "column into the `unlockTech`/`unlockCivic` indices the GPU reads",
    "unlockKind": "the same scaffold source column — which of the two indices the exporter fills",
    "farmHousing": "the FARM's housing is its improvement row's own `housing` column, read by "
                   "TS as `idef.housing` (cpu/core/city.ts computeHousing) and by the GPU as "
                   "`_imp_housing` (gpu/core/sim_init.py); this scalar is the same install fact "
                   "transcribed a second time",
    "gpWorkClasses": "the Great Work classes are read by TS as GW_WORK_CLASSES "
                     "(cpu/core/gpAbility.ts activateGreatPerson) and by the GPU as the wire's "
                     "`gwClsByKind` (gpu/core/sim_init.py `_gw_cls`); this column is the same set "
                     "transcribed a second time",
    "cleanCharges": "CLEAN_FALLOUT spends exactly one build charge through each engine's shared "
                    "charge spend (cpu/core/units.ts cleanFallout -> spendCharge, "
                    "gpu/core/sim_orders.py `_spend_build_charge`), which is this constant's value",
    "unlockCivic": "the Madrasa's PrereqCivic: the live gate is BUILDING_PREREQ_ROWS, read at "
                   "cpu/core/effects.ts:120 and gpu/core/sim_economy.py:1632; the building "
                   "variant's own column is the same install row transcribed twice",
    "uranium": "the charge is paid off the BUILD PROJECT's own row (`rs`/`rc`, "
               "cpu/core/stockpile.ts:277 and gpu/core/sim_seats.py:3029); the device column is "
               "the same install fact transcribed a second time",
    "severity": "no rule reads a storm's Severity: the warmed world reads each row's own "
                "`cipd` (ChanceIncreasePerDegree) — stormWeights (cpu/core/disasters.ts) and "
                "`_event_rows` (gpu/core/sim_economy.py) — so the column is carried for a test "
                "to assert",
    "resourceOnly": "the rule is the resource early return: a resourced tile offers exactly "
                    "RESOURCES[r].improvement (cpu/core/rules.ts:328) and no other arm lists a "
                    "resource-only row",
    "buildInLine": "ruled NOT a legality rule on both engines — cpu/core/rules.ts:204 and "
                   "gpu/core/sim_seats.py:3678: the install's line-DRAWING helper for the "
                   "placement UI",
    "WATER_PARK": "a MAP KEY of `seats.bandVenueBits`, which the GPU loads whole "
                  "(gpu/core/sim_init.py:1542); the district bits are applied through "
                  "`bandVenueDistricts` (gpu/core/sim_masks.py:2680), not by name",
    # ---- carried for a test to assert, not for a rule to read ----
    "lowlandMaxBand": "the cap the shipped `lw` plane is asserted against, read at "
                      "tests/gpu/climate_test.py:92 and :275; the band itself is derived once on "
                      "TS (deriveLowlands) and the GPU reads the plane, not the constant",
    # `canAnnexTilesWithReceivedInfluence` is not here because it is READ now:
    # a minor takes one plot per envoy received (cpu/core/cityStates.ts
    # `envoyTiles`, gpu/core/sim_minors.py `_minor_envoy_tiles`), which is the
    # column's own live fork. `startingTilesForCity` is NOT here either: that
    # row the engine's shape CONTRADICTS rather than matches (every city of
    # every class starts with its whole first ring), so it stays an orphan on
    # purpose — see the AUDIT.
    "canFoundCities": CIV_LEVEL_REASON,
    "canAnnexTilesWithGold": CIV_LEVEL_REASON,
    "canBuildWonders": CIV_LEVEL_REASON,
    "canEarnGreatPeople": CIV_LEVEL_REASON,
    "canGiveInfluence": CIV_LEVEL_REASON,
    "canReceiveInfluence": CIV_LEVEL_REASON,
    "ignoresUnitStrategicResourceRequirements": CIV_LEVEL_REASON,
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
    wire = json.loads(RULES.read_text(encoding="utf-8"))
    paths: set[str] = set()
    for g, v in wire.items():
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
    print(f"rules.json: {len(paths)} key paths over {len(wire)} groups")
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
    if "--baseline" in argv:
        # THE RATCHET: the known orphans are the baseline file's list; the
        # battery must catch a NEW one — a key exported or a column added that no
        # engine reads — while the list burns down.
        bpath = pathlib.Path(argv[argv.index("--baseline") + 1])
        known = {ln.strip() for ln in bpath.read_text(encoding="utf-8").splitlines()
                 if ln.startswith("    ")}
        now = set(no_gpu) | set(no_ts)
        new = sorted(now - known)
        for n in new:
            print(f"NEW ORPHAN {n}")
        fixed = len(known - now)
        print("READER CENSUS " + ("RED" if new else "OK") + f" against {bpath.name} — "
              f"{len(new)} new, {len(now) - len(new)} known, {fixed} fixed")
        return 1 if new else 0
    if strict and bad:
        print("READER CENSUS RED — an exported key or catalog column nobody names; read it or allowlist it with a reason")
        return 1
    print("READER CENSUS " + ("OK" if not bad else "REPORTED"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
