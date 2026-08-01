# FINAL ADOPTION PLAN — #55 (ruff + pyright on `gpu/`) and #56 (ts-morph codemods)

## 0. Headline

**Neither tool found a single live simulation bug.** Post-refutation the yield is: 2 real static defects, 3 stale return annotations (25 diagnostics, one construct that would actively mislead the next tuple-widening), ~20 dead locals, and 1 latent trap. That is worth adopting for the *tripwire* value on future edits, not for the backlog. Size the effort accordingly: **4 rounds, 3 battery runs, zero parity re-baselining.**

Everything below is verified against the live tree this session (`gpu/eval/search_eval.py:325-327`, `gpu/civ6gpu/__init__.py`, `gpu/battery.py:175-192`, `tsconfig.json`, `package.json`, `engine.py:952-958`). Working tree at plan time: `M package.json`, `?? pyrightconfig.json`, `?? scripts/codemod/` — nothing else.

---

## 1. Exact config file contents

### 1.1 `C:\civ6-development-calculator\ruff.toml` (new, repo root)

Root `ruff.toml`, **not** `pyproject.toml`: this repo is npm-rooted and inventing a `pyproject.toml` muddies `pip install -e .` semantics.

```toml
# ruff.toml — Python lint policy for gpu/ (task #55).
#
# Admission rule for the GATE: a rule must be drivable to ZERO and be either a
# defect class or a real-bug tripwire. Anything that fires hundreds of times on
# the house style stays advisory — a noisy gate is a gate people learn to skip.
# The advisory set (S101, D, ANN, PLR2004, N8xx, T201, E501, C901, ...) is swept
# by hand via `npm run lint:py:advisory`; it MUST NOT be added to `select`.

target-version = "py314"
line-length = 120
extend-exclude = ["gpu/fixtures", "gpu/fixtures_o4", "gpu/runs", "python", "node_modules", "dist", "dist-rl", ".venv"]

[lint]
select = [
  "E4",                                   # import placement/format
  "E711", "E712", "E713", "E714",         # == None / == True / not-in / not-is
  "E721", "E722",                         # type() ==, bare except
  "E9",                                   # syntax / IO errors
  "F",                                    # pyflakes — the core defect set
  "W",                                    # incl. W605 invalid escape sequence
  "I",                                    # isort (verified: zero hits on engine.py)
  "B",                                    # bugbear
  "UP",                                   # pyupgrade, at py314
  "C4",                                   # comprehension misuse
  "SIM",                                  # minus the two below
  "ARG",                                  # unused args = "took the index, ignored it"
  "PLE",                                  # pylint errors: 0 today, free insurance
  "PLW1510",                              # subprocess.run without check= (gate drivers)
  "PLW2901",                              # loop var overwritten in body
  "RUF",                                  # minus the unicode/style ones below
]
# NOTE: E501 is deliberately NOT selected. line-length above documents intent for
# new code and feeds only the formatter, which is excluded on engine.py anyway.
# Selecting E501 would put reflow pressure on engine.py's long tensor expressions.
ignore = [
  "E402",      # probe scripts do `import sys; sys.path.insert(...)` first — deliberate
  "B007",      # unused loop control var; 9 hits, pure style in tensor loops
  "SIM108",    # if/else -> ternary; hurts readability of guarded tensor branches
  "SIM115",    # open() without CM; the 4 hits are long-lived streaming log handles
  "RUF001", "RUF002", "RUF003",  # ambiguous unicode: 106 hits. engine.py uses — and ×
  "RUF005",    # list concat -> unpacking; style only
]

[lint.per-file-ignores]
# B023: 16 hits, ALL inside BatchSim._g5_hm, ALL false positives (defined and
# called in the same loop iteration). DELETE THIS LINE in round B, when _g5_hm
# gets default-arg binding — the ignore is load-bearing only until then, and it
# hides a REAL cross-rival corruption the day someone hoists _h_key out of the
# `for r` loop for perf.
"gpu/civ6gpu/engine.py" = ["B023"]

# The poke lanes share one uniform signature poke_x(rules, rj, path); `rj` unused
# in 15 of them is the contract, not a smell.
"gpu/*_test.py"  = ["ARG001", "ARG002"]
"gpu/*_probe.py" = ["ARG001", "ARG002"]

# RUF059 (unused unpacked variable): 28 hits, all the "unpack the 6-tuple, read
# one" documentation idiom in the drivers/lanes. `gpu/*.py` matches only the top
# level, so the rule stays LIVE inside gpu/civ6gpu/ where it costs 0 today and
# guards the engine. Do NOT put RUF059 in the global `ignore` — a per-file-ignore
# subtracts and cannot re-enable, so the pair would be a silent no-op.
"gpu/*.py" = ["RUF059"]

[format]
# GUARDRAIL, not an adoption. engine.py is under turn-exact parity work; a reflow
# buries real diffs. This makes an accidental `ruff format .` a no-op on it.
# It protects ONE file — `ruff format` is still never to be run on this repo.
exclude = ["gpu/civ6gpu/engine.py"]
```

`target-version = "py314"` is load-bearing (B905's `strict=` suggestion is py310+, the whole `UP` family targets a runtime). Honest correction to the investigation: the unpinned fallback is *not* py39 — `--show-settings` reports `linter.unresolved_target_version = none`, `formatter = 3.10`. Pin it anyway.

### 1.2 `C:\civ6-development-calculator\pyrightconfig.json`

**Phase 1 — lands in Round A, replaces the current 192-byte file:**

```json
{
  "include": ["gpu"],
  "exclude": ["**/__pycache__", "gpu/fixtures", "gpu/fixtures_o4", "gpu/runs", "python", ".venv"],
  "venvPath": ".",
  "venv": ".venv",
  "pythonVersion": "3.14",
  "typeCheckingMode": "basic",
  "reportMissingImports": "warning",

  "reportAttributeAccessIssue": "none"
}
```

**Phase 2 — replaces it in Round C, once the generated annotation block has landed and the residual is zero. This is the version that gets gated:**

```json
{
  "include": ["gpu"],
  "exclude": ["**/__pycache__", "gpu/fixtures", "gpu/fixtures_o4", "gpu/runs", "python", ".venv"],
  "venvPath": ".",
  "venv": ".venv",
  "pythonVersion": "3.14",
  "typeCheckingMode": "basic",
  "reportMissingImports": "warning",

  "//": "GATED at zero: these are the families that actually caught something.",
  "reportAttributeAccessIssue": "error",
  "reportReturnType": "error",
  "reportAssignmentType": "error",
  "reportGeneralTypeIssues": "error",
  "reportUndefinedVariable": "error",
  "reportRedeclaration": "error",

  "//2": "OFF: the engine's lazy-None-cache idiom (`x = None` above the loop, bound and read under the same predicate) is pervasive and pyright cannot narrow it. 26 of 26 hits were noise; 55 of the 95 reportArgumentType are one dynamic `Rules(**{...})` splat that no annotation change can fix. Sweep these by hand, never gate them.",
  "reportArgumentType": "none",
  "reportOptionalMemberAccess": "none",
  "reportOptionalSubscript": "none",
  "reportOptionalOperand": "none",
  "reportCallIssue": "none",
  "reportOperatorIssue": "none"
}
```

### 1.3 `package.json` — script and pin additions

```json
  "scripts": {
    "lint": "oxlint src scripts tests",
    "lint:py": "python -m ruff check gpu",
    "lint:py:fix": "python -m ruff check gpu --fix",
    "lint:py:advisory": "python -m ruff check gpu --statistics --select S101,ANN,D,PLR2004,N803,N806,T201,C901,PLR0912,PLR0915,E501",
    "typecheck:py": "pyright",
    "codemod:annots": "python gpu/tools/gen_sim_annotations.py --check"
  },
  "devDependencies": {
    "pyright": "1.1.411",
    "ts-morph": "28.0.0"
  }
```

**Pin `pyright` and `ts-morph` exactly (drop the `^`).** A pyright minor bump adds diagnostics; with pyright in stage 0 that reds the gate on an `npm install`, not on a code change. Record the ruff pin as `ruff==0.16.1` in a two-line `requirements-dev.txt` next to `ruff.toml` for the same reason.

### 1.4 `gpu/battery.py` — stage 0 wiring (exact)

`py = sys.executable` is already bound at `battery.py:177`. Insert into the serial, bail-fast stage-0 tuple:

```python
        ("lint", [npx, "oxlint", "src", "scripts", "tests"]),  # #51: no-constant-binary-expression et al
        ("ruff", [py, "-m", "ruff", "check", "gpu"]),          # #55: the Python twin of the oxlint line. 0.18s.
        ("annots", [py, "gpu/tools/gen_sim_annotations.py", "--check"]),  # #55: round C
        ("pyright", [npx, "pyright"]),                         # #55: round C. 13s measured.
        ("export", [npm, "run", "gpu:export"]),
```

Also update the stage-0 banner string at `battery.py:180` from `"stage 0 (serial): tsc, export"`. **These are not lanes** — stage 0 is serial and bail-fast, so a lint red costs zero GPU wall-clock. Measured cost: ruff 0.18s cold, pyright **13s** (72 files, this session). Against ~420s that is +3.1%, and it buys the tripwire on 15 files no lane executes.

---

## 2. Slice order — cheapest first, verification named

The battery is ~420s and **must never run twice concurrently**. Three battery runs total, strictly sequential. No slice requires a parity re-baseline or a widened tolerance; for rounds B and C, parity reading **0.0 milli unchanged** *is* the proof the edits were behaviour-free.

### ROUND 0 — #56 harness. No gate change, no engine. **tsc + vitest only.**

| slice | content | verification |
|---|---|---|
| **0.1** | Commit `scripts/codemod/harness.ts` (615 lines) and `scripts/codemod/pysub.py` (304 lines). Add `scripts/codemod/__pycache__/` to `.gitignore`. Individual codemods stay one-shot in `.claude/scratchpad/*.ts` (gitignored). No npm script — `npx vite-node <file> -- --apply --check` is the command; a wrapper script would need a double `--` and is worse. | `npx tsc --noEmit`, `npm test`. **No parity, no battery.** `scripts` is in `tsconfig.json`'s `include` and `@types/node` is present in `node_modules/@types/`, so the harness is covered by the existing build gate — which is the whole point, given [[scripts-not-typechecked]]. |

The battery comment at `battery.py:187` claiming "most of `scripts/` cannot be typechecked (`@types/node` is not installed)" is **stale** — `@types/node` is installed and `tsconfig.json` lists `"types": ["vite/client", "node"]`. Fix the comment while wiring stage 0 in Round A.

### ROUND A — LINT ADOPTION. Config + sweep + wiring. **One battery at the end.**

| slice | content | verification |
|---|---|---|
| **A.1** | `ruff.toml` (§1.1), `pyrightconfig.json` phase 1 (§1.2), `package.json` scripts + pins (§1.3), `requirements-dev.txt`. Zero source changes. | `npm run lint:py` → expect **132 findings, 89 auto-fixable**. `npm run typecheck:py` → expect ~159 (3560 total − 3401 attribute). `npx tsc --noEmit` (package.json touched). Seconds. |
| **A.2** | **Pre-sweep source fixes — MUST precede A.3.** (a) `gpu/eval/train_ppo.py`: add `from typing import TYPE_CHECKING` / `if TYPE_CHECKING: from civ6gpu import MeleeEnv`; keep the in-function runtime import. (b) `gpu/civ6gpu/__init__.py`: add `"DuelEnv"` and `"MeleeEnv"` to `__all__`. | `npm run lint:py` (F821 and 2 of the 10 F401 gone). Import smoke (§A.4 list). Seconds. |
| **A.3** | `npm run lint:py:fix` — 89 safe fixes across 63 files (I001 ×68, F541 ×4, SIM300 ×3, UP034 ×2, C420, E401, RUF022, UP037, 8 F401). | **Assert `git diff --stat gpu/civ6gpu/engine.py` is EMPTY.** Measured: engine.py is not among the `+++` headers, and `ruff check gpu/civ6gpu/engine.py` reports *"No fixes available"*. Trap for the verifier: grepping the diff **text** for `engine.py` gives a false YES (isort hunks in poke lanes contain `from civ6gpu.engine import ...`) — check `+++` headers only. Then import smoke. |
| **A.4** | Residual burn-down, **all outside engine.py**: 5 `B905` → `strict=True`; 3 `PLW1510` → explicit `check=False`; 1 `PLW2901` (`gpu/tools/logdiff.py`); 1 `RUF046` (`gpu/tools/statelog.py`); 8 poke-lane `F841` — **delete the variable, do not add assertions** (three of the four proposed assertions were refuted, see §4); plus the one worthwhile coverage line: assert the APOSTLE in `gpu/tests/golden_move_test.py` sections 3 **and** 4. | `npm run lint:py` → only the engine.py residual remains. **Import smoke, mandatory** — a green battery verifies ~48 of the 63 swept files. These are run by no lane: `python -c "import gpu.train_ppo"`-style for `train_ppo.py`, `alpharank.py`, `bench.py`, `ckptdiff.py`, `duel_eval.py`, `melee_eval.py`, `search_eval.py`, `horizon_audit.py`, `gen_targets.py`, `profile_step.py`, `behavior_probe.py`, `chop_probe.py`, `cityloss_probe.py`, `mcts_test.py`, `gumbel_test.py`. |
| **A.5** | Wire `("ruff", ...)` into `battery.py` stage 0 (§1.4); fix the stale `@types/node` comment. | — |
| **A.6** | **BATTERY ×1** (~420s + 0.2s). | Full ladder green. |

### ROUND B — CONFIRMED DEFECT FIXES. `engine.py` + drivers. **One battery.**

Kept strictly separate from Round A: different risk class, and a red battery must be attributable to one or the other.

| slice | content | verification |
|---|---|---|
| **B.1** | The three stale return annotations, **each with its docstring** (see §3). Annotation + prose only, no executable change. | `npm run typecheck:py`: reportAssignmentType 20→0, reportReturnType 8→4, reportGeneralTypeIssues 1→0. |
| **B.2** | 14 `F841` dead-local deletions in `engine.py`; 6 `RUF012` → `ClassVar[...]` on `_CAPTURE_RESET` / `_TRACE_HEAD` / `_TRACE_PER_*`; `_g5_hm` default-arg binding (`def _g5_hm(r=r, _ctr_r=_ctr_r, _rcy_bel=_rcy_bel, _fol_h_rc=_fol_h_rc, _riv_h=_riv_h)`) and **delete the `B023` per-file-ignore from `ruff.toml`**. | `npm run lint:py` → **0 findings on gpu/**. |
| **B.3** | `gpu/eval/train_ppo.py` `_pool`: delete the dead `if fix_dir else None` inner branch. | ruff/pyright + import smoke. |
| **B.4** | **BATTERY ×1.** Run the touched poke lanes standalone first (`state_discipline_test`, `rc_registry_test`, `government_test`, `cs_bonus_test`, `district_breadth_test`) — the poke group serial-aborts, so battery-driven discovery costs a full run per red. | Parity **0.0 milli unchanged** is the behaviour-free proof for the F841 deletions. |

### ROUND C — PYRIGHT ATTRIBUTE CLOSURE + GATE. `engine.py` annotation block. **One battery.**

| slice | content | verification |
|---|---|---|
| **C.1** | Promote the proven generator to `gpu/tools/gen_sim_annotations.py` (from `.claude/scratchpad/mkann.py`). Modes: default writes the block between sentinels, `--check` regenerates and byte-compares. | `python gpu/tools/gen_sim_annotations.py --check` on an unmodified tree. |
| **C.2** | Insert the generated 188-line block into `BatchSim` (§3.4). | `git diff` shows the block and nothing else. Standalone `gpu/tests/rc_registry_test.py` and `gpu/tests/state_discipline_test.py`. `npm run typecheck:py` → **9** reportAttributeAccessIssue. |
| **C.3** | Kill the 9 survivors + the 4 residual reportReturnType: `# type: ignore[attr-defined]` at `gpu/tests/state_discipline_test.py` ×2 lines (`sim._seat_hp`, deliberate alias-rebind negative test — do **not** annotate it onto `BatchSim`), `ckptdiff.py:32` / `rollout.py:32` (`TextIO.reconfigure` typeshed gap), `train_ppo.py:567/577/599` (the `sample_heads` `0.0`-seed, refuted as unreachable — cite the refutation in the comment); `# type: ignore[return-value]` on `BatchSim.owner` / `rival_at` / `cs_at` / `_rival_regional`, each with a one-line comment naming the invariant (`_tile_owner_ver` inits to 0, cache vers to −1, monotone `+= 1`, so the first read always populates). | `npm run typecheck:py` under phase-2 config → **0**. |
| **C.4** | `pyrightconfig.json` → phase 2 (§1.2). Wire `("annots", ...)` and `("pyright", ...)` into stage 0. | — |
| **C.5** | **BATTERY ×1.** | Parity 0.0 milli unchanged. |

---

## 3. Pyright: the 3401 `reportAttributeAccessIssue` — **GENERATE**

**Decision: generate a class-body annotation block into `BatchSim` from the allocator tables, by AST. Suppress in the interim (`"reportAttributeAccessIssue": "none"`, Round A), flip to `"error"` once the block lands (Round C).**

### 3.1 Why generate, and why not the other three

The whole 3396-diag `BatchSim` bucket has **exactly one cause**: `setattr(self, <f-string>, …)` at 17 call sites in 6 loops. Measured: inserting the block takes total pyright errors **3559 → 172** and `reportAttributeAccessIssue` **3401 → 9**.

- **Suppress permanently** — rejected. It also blinds pyright to a genuine typo (`sim.rc_alve`), which is the one thing this rule is good at on a 71-file codebase where 961 of the diags are external `sim.<name>` reads across 20+ test files. Suppression is correct *only* as the Round-A interim so the config can land without a source change.
- **Exclude `engine.py`** — rejected. It also drops the 158 non-attribute diagnostics, which is where the entire real yield came from (the three stale tuples).
- **Hand-annotate** — rejected. 186 names duplicated from six tables that change every round; guaranteed drift.
- **Generate** — 186 names, **zero hand-written**, proven working.

### 3.2 Do NOT hoist the tables — new finding, contradicts Investigation 1

Investigation 1 suggests hoisting the four anonymous tables to class constants as "a pure move with no expression changes". **That is false and would be a behaviour edit.** Verified this session at `gpu/civ6gpu/engine.py:952-958`:

```python
        nt_b3, nc_b3 = len(rules.t_cost), len(rules.c_cost)
        ...
        for _nm, _w in (("techs", nt_b3), ("civics", nc_b3),
                        ("tech_boosted", nt_b3), ("civic_boosted", nc_b3)):
```

The rows carry `__init__` locals derived from the *instance's* `rules`. Hoisting them to class scope is a `NameError` at class-creation time, not a move. **Keep the tables where they are; the generator AST-parses them in place (proven).** This removes the only structural engine.py edit the plan would otherwise have needed.

### 3.3 The generator contract

`gpu/tools/gen_sim_annotations.py`, no new dependency (stdlib `ast`):

1. Parse `gpu/civ6gpu/engine.py`. Locate the 6 tables: the city block (20 rows → 60 names), `_civ_scalars` (12 → 36), the research vectors (4 → 12), the `_UNIT_PLANES` spec tuple (12 → 48), `_CIV_PAIR_FIELDS` (5 → 15), `_CS_PAIR_FIELDS` (5 → 15). Extract the **name column only** (string literals) — never the value expressions.
2. **Assert the target class is `BatchSim` and is undecorated.** `Rules` at `engine.py:83` is `@dataclass` with 73 class-body annotations; pasting a block there adds required constructor fields and breaks every `Rules(...)` call. Hard-fail if the target has any decorator.
3. Emit `<name>: torch.Tensor` lines sorted, between sentinels, immediately after the `BatchSim` docstring:
   ```python
       # --- BEGIN GENERATED SIM ATTRS (gpu/tools/gen_sim_annotations.py) ---
       # PEP 526 bare annotations: no class attribute, no descriptor, no runtime
       # effect. Regenerate after adding a row to any allocator table.
       civ_treasury: torch.Tensor
       ...
       # --- END GENERATED SIM ATTRS ---
   ```
4. `--check` regenerates and byte-compares → non-zero exit on drift. Wired into stage 0 so adding an allocator row fails loudly until the block is regenerated.
5. Never generate `_seat_hp` (a test monkeypatch at `gpu/tests/state_discipline_test.py:64/66`, not engine state).

### 3.4 Runtime risk: none, verified

`BatchSim` is undecorated, `type` metaclass, no `__slots__`, no subclass, no `__getattr__`/`__setattr__`, no `exec`/`vars(self)` writes anywhere in `gpu/`. A bare class-body annotation appends to `__annotations__` and creates nothing: `'p_alive' in BatchSim.__dict__` → `False`, `hasattr(BatchSim, 'p_alive')` → `False`. Therefore `_check_mutable_shapes` (guards on `hasattr`), `snapshot()`/`_pristine` (iterate `_MUTABLE` + `getattr`), and `_check_state_discipline` (walks `self._aliases`) are all unchanged. There is no `from __future__ import annotations` in the module, so the 186 `torch.Tensor` names are evaluated once at class creation — `torch` is imported at module top; cost is microseconds.

### 3.5 Cost of the block

`+32` previously-hidden diagnostics, all latent typing debt in `engine.py` (15× `Tensor | None` into a `Tensor` param, 8× tuple-arity, 2 in `gp_aura_test.py`). Under the phase-2 config the Optional/Argument families are `"none"`, so **only the tuple-arity ones surface — and Round B already fixed those.** Net effect at the gate: −3419, +0.

---

## 4. Confirmed real defects (post-refutation)

**Zero live simulation bugs.** Everything below is static, dead, or latent.

| # | file · symbol | what | fix | round |
|---|---|---|---|---|
| **1** | `gpu/eval/train_ppo.py` · `build_melee` | `-> "MeleeEnv"` — the name is undefined at module scope (module import is `from civ6gpu import BatchEnv, DuelEnv, load_rules, load_fixture, FIXTURES`; the only `MeleeEnv` import is inside the body). Reachable via `--seats 3\|4`. Flagged by both tools (F821 + `reportUndefinedVariable`). No runtime exposure (`from __future__ import annotations` + PEP 649). | `if TYPE_CHECKING: from civ6gpu import MeleeEnv`; keep the runtime import. | **A.2** |
| **2** | `gpu/civ6gpu/__init__.py` · `__all__` | `DuelEnv`/`MeleeEnv` are imported and re-exported but absent from `__all__` → F401 ×2. Sole dependent is `train_ppo.py:49` / `:207`, which **no battery lane imports** — a blind autofix would ship silently. | Add both to `__all__` (RUF022 in the same `--fix` run normalizes the order). | **A.2** |
| **3** | `engine.py` · `BatchSim._gov_policy_mods` | Declares `tuple[T,T,T,T,T]`, returns **6** on both paths (`city_y, cap_y, hous_all, ymult, slotted, emult` — `emult` from B9-R1 VETERANCY). 13 diags. The docstring is stale the same way (lists 5 channels, omits `emult`) — and the consumer does `_gov_policy_mods_cached("p", self.civics)[5]`, so fixing only the annotation leaves the misleading construct undocumented at the definition. | Widen to 6-tuple **and** add `emult` to the docstring, in one edit. All 30 call sites already unpack the real arity — no arity bug. | **B.1** |
| **4** | `engine.py` · `BatchSim._city_totals` | Declares 3-tuple, returns 4 (`total, housing, growth_f, tier_idx`). 9 diags. | Widen to 4-tuple + docstring. | **B.1** |
| **5** | `engine.py` · `BatchSim._rival_city_yields` | Declares `tuple[T,T]`, returns 6 (`f, pr, sc, cu, gold, faith`). 3 diags. | Widen to 6-tuple + docstring. | **B.1** |
| **6** | `engine.py` · `_barbarian_phase` | `rcap = max(self.R - 1, 0)` assigned **twice** (walls-strike block, Encampment-strike block), read **neither** time — pyflakes reports one, so the F841 count is understated everywhere. A fossil of #59's rival-dimension plumbing. Not a bug (an unused value miscomputes nothing). | Delete both. | **B.2** |
| **7** | `engine.py` · `_apply_rival_unit_actions`, `_scripted_builder`, `_apply_unit_actions`, `_attack_encampment`, `_hostile_city_attack`, + tuple-unpack leftovers | 14 dead locals total (`srows`, `stepped` ×2, `a_lo` ×2, `B`/`dev`/`cb`). All cleared: `_step_verb` owns the camp clear (`clear_camp: bool = True`, `clear_camp=False` only for the barbarian mover), and `a_lo` is a copy-pasted dispatch header — the sibling `_hostile_vs_unit` uses it for `a_occ[vr, ttc[vr]] = u + a_lo`, the other two never advance the attacker, which matches `src/core/combat.ts` (`attackEncampment`: *"The attacker does NOT advance"*). | Delete. If `_hostile_city_attack` ever gains advance-on-capture, `a_lo` is the variable it must use. | **B.2** |
| **8** | `engine.py` · `_CAPTURE_RESET`, `_TRACE_HEAD`, `_TRACE_PER_*` | RUF012 ×6 mutable class defaults. Read-only in practice (`.items()` / `list(...)`), so no cross-instance leakage — annotation-only, and it helps pyright. | `ClassVar[...]`. | **B.2** |
| **9** | `engine.py` · `BatchSim._rival_phase` → `_g5_hm` | B023 ×16 are **all** false positives (define-and-call in the same `r` iteration; `_h_key`/`maint_all`/`housing_all`/`need_all` reset per `r`). **But the trap is real**: `_h_key` hoisted out of the `r` loop — exactly the perf move G3-A/G4 made — turns this into a silent cross-rival yield corruption via a stale `r`. | Default-arg binding on `_g5_hm` (behaviour-identical), then delete the per-file-ignore. | **B.2** |
| **10** | `gpu/eval/train_ppo.py` · `_pool` | Dead branch: the inner `if fix_dir else None` sits inside the true arm of the outer `... if fix_dir else load_rules()`. | Delete. | **B.3** |
| **11** | hygiene, no defect | 5 `B905` → `strict=True` outside engine (all provable no-ops); 3 `PLW1510` → explicit `check=False`; 1 `PLW2901` (`gpu/tools/logdiff.py`); 1 `RUF046` (`gpu/tools/statelog.py`); 8 poke-lane F841. | as listed. | **A.4** |
| **12** | `gpu/tests/golden_move_test.py` | Real coverage gap: an APOSTLE is spawned in the "no dedication → no bonus, **for every class**" section and never asserted, in section 3 **and** section 4 (NORMAL age). An "apostle always gets the golden bonus" fault slips today. | Two assertion lines. Zero engine risk. | **A.4** |

---

## 5. REFUTED — settled, do not re-litigate

| # | claim | why it is dead |
|---|---|---|
| **R1** | `gpu/eval/search_eval.py` `--policy gumbelsearch` without `--checkpoint` crashes (`ck.get` on `None`) — *the investigation's only "REAL" finding*. | **Verified this session**, `gpu/eval/search_eval.py:325-327`: `NET_POLICIES = ("net","netsearch","netgreedy","tuplesearch","gumbelsearch")` / `if args.policy in NET_POLICIES and not args.checkpoint: ap.error(...)`. `ap.error` exits 2, ~80 lines before the site. The guard predates the gumbelsearch arm (`742f1bb` before `19501b4`). **Adding argparse validation would ship a duplicate guard.** |
| **R2** | `sample_heads`/`evaluate_heads` `logp, ent = 0.0, 0.0` survive as floats (latent). | Unreachable, not latent: `_heads_in` filters a fixed six-name tuple and the only `Policy.forward` in the repo unconditionally emits `"production"`. This is also the root cause of the 3 `float.mean/clamp` attribute diags. |
| **R3** | `gpu/tools/ckptdiff.py` `re.search(...).group()` can be `None` (latent). | Sole writer is `rollout.py` `_ckpt_writer` with a `%d` turn. Trigger is a human hand-dropping a malformed file into a debug directory. Cosmetic. |
| **R4** | `gpu/tests/festival_test.py` `float(None)` would `TypeError` instead of failing the assert. | `TypeError` vs `AssertionError` two lines later — same red lane, same traceback file. Zero difference. |
| **R5** | B905 `strict=False` in the rival improvement picker "cements silent truncation", the #78 shape. | `len(opts) ∈ {3,4}`; `valid` and `opt_g` are built with the **same** `len(opts) > 3` predicate, so the three iterables are always equal length. `strict=True` is a provable no-op, not a raise-capable behaviour change. Not #78's shape — the layout is derived from `len(opts)` itself, not a hardcoded width. |
| **R6** | `gpu/tests/stack_rules_test.py` passes vacuously without `assert bool(found[0])`. | The mechanic is asserted directly one line above (`assert bool(sim._blocked_for(tiles, PLAYER_SEAT)[0,0])`), and the only route to `found=False` is all seven candidates blocked — which *requires* the Encampment wall working. The proposed assertion tests a different property and is brittle on any fixture where the first free tile's neighbours all block. |
| **R7** | Deleting the `__init__.py` re-exports "breaks **every** training and duel-eval entrypoint". | Only `train_ppo.py`. `duel_eval.py:23`, `duel_test.py:22`, `melee_eval.py:23`, `melee_test.py:20-21` all import the submodule directly. The "ships silently" half stands; the blast radius was one file. |
| **R8** | `gpu/rollout.py` PLW1510 is "one refactor from a silently-passing gate". | `p.returncode` is captured into `replay_rcs[k]`; the failure signal is the recorded code, not the absence of an exception. |
| **R9** | `gpu/tests/cs_bonus_test.py` — an unchecked `districtBonus` magnitude means "a wrong size passes". | Parity compares GPU vs TS city yields at 0.0 milli over 12×250 with the scripted player assigning envoys; only a both-engines-wrong-key error is invisible. And `s3 - s1 != dbonus` (the term is scattered pre-amenity-factor), so the naive assertion ships a *wrong* assertion into a battery lane. |
| **R10** | `gpu/tests/rival_purchase_test.py` — unasserted `peaceGold0` reserve. | Coverage nit, parity-gated. Case 1 sets `r_treasury = 10_000`, so the boundary is untested but nothing is wrong. |
| **R11** | `BatchSim._alloc_war`, `tile_seat`, `register_alias` create attributes invisibly to pyright. | All plain assignment. `war` is not in the 142-name missing list; `register_alias` only records a recompute lambda in `self._aliases`. The sole mechanism is `setattr()` in 6 loops. |
| **R12** | `_MUTABLE` or the alias registry can source the generator. | `_MUTABLE` covers 19 of 142; the alias registry is runtime-only. AST is the route. |
| **R13** | Unpinned ruff falls back to `py39`. | `--show-settings` reports `linter.unresolved_target_version = none`, `formatter = 3.10`. Pin regardless — the pin is right, the stated fallback was not measured. |
| **R14** | `_blocked_for`'s `is_civilian` has a `None`-means-False path. | The signature defaults to `is_civilian=False`. The path does not exist; the noise verdict holds for a simpler reason. |
| **R15** | The candidate `ruff.toml` "keeps RUF059 live for the engine package". | Global `ignore` + `per-file-ignores` is a no-op — per-file-ignores subtract only. Verified: RUF059 reported nothing under `gpu/civ6gpu/`. **Fixed in §1.1** by removing it from `ignore` and scoping the exemption to `gpu/*.py`. |
| **R16** | "These files are battery lanes, so one battery after the sweep covers it." | ~15 of the 63 swept files are executed by no lane (list in slice A.4). A green battery verifies ~48 of 63. Import smoke is mandatory. |
| **R17** | The 4 anonymous allocator tables can be hoisted to class constants as "a pure move". | **Refuted this session** — `engine.py:952-958`, rows carry `__init__` locals (`nt_b3 = len(rules.t_cost)`). Hoisting is a `NameError`, not a move. Generator parses in place. |
| **R18** | `BatchSim.owner`/`rival_at`/`cs_at` cache staleness; `_rival_border_growth` `unowned`/`adj_own`; `_rival_phase` `_h_key`; `_step_verb` `~naval`; `_religious_victor` `n_r`; `_rel_combat_planes` `rc_win`; `_city_totals` `has_aq`; the `Rules(**{...})` splat; the `_commit`/`plan_production` `None` returns. | All independently re-walked by two reviewers and cleared. Monotone version counters, same-predicate guards, per-instance constants, dynamic splats. These are the reason the Optional/Argument/Call/Operator families go to `"none"` in the phase-2 config rather than being fixed. |

---

## 6. What this adoption does NOT cover

1. **The Python codemod half of the risk — the larger half.** Over the 29 codemod scripts from one round: TypeScript 8 scripts / **35 edit sites (21%)**, `engine.py` Python 21 scripts / **128 edit sites (79%)**. ts-morph physically cannot reach `engine.py`. The incident that motivated #56 (a script printing "applied" when nothing was written) was in the *Python* half. `pysub.py` fixes the **write protocol** (staging, `PLAN` vs `APPLIED`, backup dir, tmp→fsync→rename, read-back compare, full rollback, codepoint miss report, `py_compile` + `ruff --select F821,F811,F401` on the staged text) — it does **not** fix *targeting*. engine.py edits remain text-anchored. **LibCST is parked**, to be revisited only if anchor *misses* (not write failures) become the dominant cost — `pysub`'s refusal messages make that measurable for the first time.
2. **`reportArgumentType` and the whole Optional family are off at the gate.** 55 of the 95 are the dynamic `Rules(**{...})` splat that no annotation fixes; the rest are the lazy-`None`-cache idiom. Consequence: a genuinely wrong argument type in new code is invisible to the gate. Sweep by hand with `npm run lint:py:advisory` and an occasional `pyright` run under a stricter local override.
3. **The advisory ruff families are never gated**: S101 (1005), D (936), ANN (727), N806/N803 (378), PLR2004 (354), T201 (332), PT018 (102), C901/PLR0915/PLR0912 (129), E501 (~2000), COM812, FBT, EM+TRY, BLE001. `_rival_phase` is 800 lines *on purpose* — it mirrors a TS phase 1:1.
4. **No TS-side lint change.** `oxlint src scripts tests` is untouched; ts-morph is a codemod harness, not a linter. `src/core` gets no new static coverage from this work.
5. **Nothing here can detect a TS↔GPU divergence.** No parity re-baseline, no tolerance change, no new lane. Both tools are single-engine.
6. **`python/`** (dead legacy PPO dir, `ppo_civ6.zip`, own `requirements.txt`, referenced by nothing in `package.json` or `scripts/`) is *excluded*, not linted. Delete it in a separate slice.
7. **Three of the four flagged test-coverage gaps stay open** (`stack_rules_test`, `cs_bonus_test`, `rival_purchase_test`) — refuted as bugs, and two of the three proposed assertions would have been wrong. Only the `golden_move_test` apostle assertion is written.
8. **[[gate-reachability]] still applies.** Green ruff + green pyright says nothing about which lane can reach a mechanic.

---

## 7. What could go wrong

1. **UP037 ordering trap — the plan's sharpest edge.** The safe `--fix` sweep includes `gpu/eval/train_ppo.py`, and the hunk is exactly `-> "MeleeEnv"` → `-> MeleeEnv`: the autofix strips the quotes off a name that does not exist at module scope. **A.2 must land before A.3.** (Still not a runtime failure — `from __future__ import annotations` plus PEP 649 defer evaluation — but it converts a fixable F821 into an unfixable one.)
2. **F401 autofix deleting the `__init__.py` re-exports.** Today ruff 0.16.1 offers no fix there (verified: `--diff` and `--diff --unsafe-fixes` emit only I001 + RUF022), but a future ruff may become less polite. Adding both names to `__all__` in A.2 removes the finding at its source. Do **not** per-file-ignore F401 instead.
3. **"The battery covers the sweep" is false for ~15 files.** `train_ppo.py`, `alpharank.py`, `bench.py`, `ckptdiff.py`, `duel_eval.py`, `melee_eval.py`, `search_eval.py`, `horizon_audit.py`, `gen_targets.py`, `profile_step.py`, `behavior_probe.py`, `chop_probe.py`, `cityloss_probe.py`, `mcts_test.py`, `gumbel_test.py` are executed by no lane. A green battery with a broken `train_ppo` import is the exact "ships silently" failure this whole adoption is meant to prevent. Import smoke is not optional.
4. **The annotation block landing in `Rules`.** `Rules` (`engine.py:83`) is `@dataclass` with 73 class-body annotations; 186 more become required constructor fields and break every `Rules(...)` call. The generator must assert target class name **and** absence of decorators, and hard-fail otherwise.
5. **Annotation drift.** Adding a row to an allocator table without regenerating leaves a new attribute unannotated (a false pyright red) or, worse, a stale annotation on a removed attribute. Mitigated by `gen_sim_annotations.py --check` in stage 0 — but the check is only as good as the generator's table locators, which are AST-positional. If someone restructures one of the four anonymous tuples, `--check` fails loudly rather than silently generating a wrong block; treat that failure as "fix the generator", never "delete the check".
6. **The block's assumptions changing under it.** Adding `__slots__` to `BatchSim` would raise `ValueError: 'x' in __slots__ conflicts with class variable`; adding `from __future__ import annotations` changes evaluation timing; adding a `BatchSim` subclass or a metaclass changes the analysis. None exist today. The failure is loud, not silent.
7. **B023 per-file-ignore rot.** Between A.1 and B.2 the ignore is live on `engine.py`. If a perf slice hoists `_h_key` out of the `for r` loop in that window, the true positive is suppressed and the symptom is a stale-`r` cross-rival yield corruption — a parity red with no lint signal. Keep the window to one round.
8. **`ruff format` run by reflex.** `[format] exclude` protects `engine.py` and nothing else; every other Python file in the repo would reflow. The exclude is a seatbelt, not a licence. Never run it.
9. **Tool version drift reding stage 0 on an `npm install`.** Pin `pyright` and `ts-morph` exactly; record `ruff==0.16.1`.
10. **RUF059 surfacing unexpected hits inside `gpu/civ6gpu/` (non-engine modules).** It costs 0 there today. If un-ignoring surfaces hits, add those exact files to `per-file-ignores` — never re-add the global ignore, which is what made the rule a no-op in the first place (R15).
11. **Two batteries at once.** Rounds A, B and C each end in one battery and must be strictly serialized — concurrent batteries share `rollout.json.shardN` and `ckpt/` and corrupt each other, and a timed-out foreground battery keeps running in the background.
12. **Round B's `engine.py` edits are annotation-and-deletion only, but they are still `engine.py` edits under active parity work.** Run the touched poke lanes standalone before the battery; a red inside the poke group serial-aborts and costs a full 8-minute run per discovery.