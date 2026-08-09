"""The in-place write discipline that GPU aliasing depends on.

`p_*`/`v_*`/`u_*`, the city planes and the per-seat scalars are VIEWS of a few
merged tensors. A view survives `x.add_(y)`. It does NOT survive
`self.x = self.x + y`, which swaps in a fresh tensor and orphans every alias
pointing at the old storage. No behavioural gate can see that: parity and
rollout both pass with orphaned aliases, right up to the stage that reads
through one.

So this lane checks the SOURCE, not the behaviour.

RULE 1 - no self-referential rebinding after __init__.
    `self.x = <expr mentioning self.x>` must be an in-place write. The scan is
    AST-based, not line-based: a self-reference can sit on a continuation line
    and a line scan silently skips the statement.

RULE 2 - no stale captures around an in-place write.
    `was = self.x` binds a REFERENCE, so after an in-place write to `self.x`
    the local reads the NEW value and any before/after comparison built on it
    silently cannot fire. `.clone()` is the fix.

RULE 3 - no `setattr(self, name, ...)` rebinding (plus 3b: `_alloc_*` helpers,
    which are exempt from it, must be called only from __init__).
    The dynamic form is invisible to RULE 1 — and a loop over plane names can
    rebind a whole pool in one statement — so it is banned outside allocation.

RULE 4 - no rebinding at all of a plane listed in ALIASED, self-referential or
    not. `self.seat0_unit_aura_mp = (p_hit & p_ok).long() * gm` mentions no seat0_unit_aura_mp,
    passes RULE 1 clean, and still detaches the plane from its pool.

The rules are static and cost milliseconds, which is the point -- they guard
an invariant that only fails much later, in a stage that is expensive to
bisect.
"""

from __future__ import annotations

import ast
import pathlib
import sys

# The engine's class body is split across the sim_*.py mixins with the
# shared floor in simbase.py — the discipline rules walk ALL of them
# (engine.py itself is only the assembly and holds no method bodies).
_CORE = pathlib.Path(__file__).resolve().parent.parent.parent / "gpu" / "core"
ENGINE_FILES = sorted([_CORE / "simbase.py"] + list(_CORE.glob("sim_*.py")))

IN_PLACE = {
    "copy_", "add_", "sub_", "mul_", "div_", "zero_", "fill_",
    "clamp_", "logical_or_", "logical_and_", "logical_not_",
    "scatter_", "index_copy_", "masked_fill_", "index_fill_",
}

# RULE 1 exemptions: attributes that are legitimately rebound because they are
# not tensors, or are rebuilt wholesale rather than mutated. Keep this list
# SHORT and justified -- every entry is a plane that can never be aliased.
ALLOWED_REBIND: set[str] = set()

# The merged unit pool. Each of these is a VIEW into unit_<plane>, so ANY
# rebinding orphans it -- not only the self-referential kind RULE 1 catches.
_POOL_PLANES = (
    "alive", "acted", "type", "tile", "hp",
    "fortify", "xp", "charges", "aura_mp", "emb", "seat",
)
# the per-seat scalars and research vectors are views of civ_*.
_CIV_FIELDS = (
    "best_melee", "builders_trained", "civic_prog", "cur_civic", "cur_tech",
    "diplo_favor", "diplo_points", "envoys_avail", "influence", "tech_prog",
    "treasury", "war_weariness", "techs", "civics", "tech_boosted", "civic_boosted",
)
ALIASED: frozenset[str] = frozenset(
    [f"{pre}_unit_{plane}" for pre in ("seat0", "civ", "barb") for plane in _POOL_PLANES]
    + [f for n in _CIV_FIELDS for f in (n, f"civ_only_{n}")]
    # the three legacy war names are SLICES of `war`. A rebind detaches the
    # relation from the matrix every reader consults, and every gate stays
    # green while the two halves drift apart.
    + ["civ_only_atwar", "civ_pair_war", "citystate_atwar"]
    # the five (civ, city-state) relations — citystate_x is row 0 of seat_citystate_x and civ_only_citystate_x
    # is rows 1.., so a rebind detaches one side of the relation from the
    # other and every gate stays green.
    + [f"citystate_{n}" for n in ("met", "envoys", "quest", "quest_camp", "quest_issued")]
    + [f"citystate_r_{n}" for n in ("met", "envoys", "quest", "quest_camp", "quest_issued")]
    # a minor's city is the city block's minor section, so these four are views
    # like every other city field.
    + ["citystate_alive", "citystate_center", "citystate_pop", "citystate_hp"]
    # the five pairs whose two sides never shared a name.
    + ["culture_total", "civ_only_culture", "faith", "civ_only_faith", "tourism_total",
       "civ_only_tourism", "warmonger", "civ_only_warmonger", "gp_points", "civ_only_gpp"]
    # the seat-indexed war clocks.
    + ["civ_only_warturns", "civ_only_peaceturns", "citystate_war_turns"]
    # the city block's seat-0 and civ views (the base itself is registered).
    + ["alive", "site", "pop", "city_hp", "outer_hp", "is_cap", "loyalty",
       "tiles_acquired", "food_box", "culture_box", "current", "progress",
       "cur_cost", "q_dtile", "gw_writing", "gw_art", "gw_music", "relics",
       "artifacts", "buildings"]
    + ["civ_city_alive", "civ_city_center", "civ_city_pop", "civ_city_hp", "civ_city_outer_hp", "civ_city_is_cap",
       "civ_city_loyalty", "civ_city_acquired", "civ_city_growth", "civ_city_cbox", "civ_city_current",
       "civ_city_progress", "civ_city_cost", "civ_city_qtile", "civ_city_gw_writing", "civ_city_gw_art",
       "civ_city_gw_music", "civ_city_relics", "civ_city_artifacts", "civ_city_bldg"]
)


def _self_attr(node: ast.AST) -> str | None:
    """`self.foo` -> "foo", anything else -> None."""
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    ):
        return node.attr
    return None


def _functions(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def rule1_rebinds(tree: ast.AST) -> list[tuple[int, str]]:
    """Self-referential `self.x = ...` outside __init__."""
    bad: list[tuple[int, str]] = []
    for fn in _functions(tree):
        if fn.name == "__init__":
            continue
        for node in ast.walk(fn):
            if not isinstance(node, ast.Assign) or len(node.targets) != 1:
                continue
            name = _self_attr(node.targets[0])
            if name is None or name in ALLOWED_REBIND:
                continue
            if any(_self_attr(sub) == name for sub in ast.walk(node.value)):
                bad.append((node.lineno, name))
    return bad


def rule2_stale_captures(tree: ast.AST) -> list[tuple[int, str, str, int, int]]:
    """`local = self.x` ... in-place write to self.x ... local read again."""
    bad = []
    for fn in _functions(tree):
        captures = [
            (n.lineno, n.targets[0].id, _self_attr(n.value))
            for n in ast.walk(fn)
            if isinstance(n, ast.Assign)
            and len(n.targets) == 1
            and isinstance(n.targets[0], ast.Name)
            and _self_attr(n.value) is not None
        ]
        if not captures:
            continue
        writes: dict[str, list[int]] = {}
        for n in ast.walk(fn):
            if (
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr in IN_PLACE
            ):
                owner = _self_attr(n.func.value)
                if owner is not None:
                    writes.setdefault(owner, []).append(n.lineno)
        for cap_line, local, attr in captures:
            for w_line in writes.get(attr, []):
                if w_line <= cap_line:
                    continue
                reads = [
                    x.lineno
                    for x in ast.walk(fn)
                    if isinstance(x, ast.Name)
                    and x.id == local
                    and isinstance(x.ctx, ast.Load)
                    and x.lineno > w_line
                ]
                if reads:
                    bad.append((cap_line, local, attr, w_line, min(reads)))
    return bad


def rule3_setattr_rebinds(tree: ast.AST) -> list[tuple[int, str]]:
    """`setattr(self, <name>, <value>)` — a rebind the static rules cannot see.

    __init__ is exempt: that is where planes are ALLOCATED, and the merged
    unit pool builds its bases and views through exactly this call. Everywhere
    else, setattr on self means rebinding something that already exists, which
    is the thing that must not happen.

    `_alloc_*` helpers are exempt on the same grounds — they are __init__ split
    into named pieces so it does not become a thousand lines. The exemption is
    CHECKED, not assumed: `rule3b_alloc_callers` proves every one of them is
    called from __init__ and nowhere else, so "allocator" can never quietly
    become "thing that reruns mid-game and orphans the views".
    """
    bad = []
    for fn in _functions(tree):
        if fn.name == "__init__" or fn.name.startswith("_alloc_"):
            continue
        for node in ast.walk(fn):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "setattr"
                and len(node.args) == 3
                and isinstance(node.args[0], ast.Name)
                and node.args[0].id == "self"
            ):
                bad.append((node.lineno, ast.unparse(node.args[1])[:60]))
    return bad


def rule3b_alloc_callers(tree: ast.AST) -> list[tuple[int, str]]:
    """Every `_alloc_*` method must be called from __init__ and nowhere else.

    This is what buys rule 3's exemption for them. An allocator invoked from a
    step path would rebind live planes and silently orphan every alias of them
    — the RULE 4 failure, but wholesale."""
    init_calls, other_calls = set(), []
    for fn in _functions(tree):
        for node in ast.walk(fn):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "self"
                and node.func.attr.startswith("_alloc_")
            ):
                if fn.name == "__init__":
                    init_calls.add(node.func.attr)
                else:
                    other_calls.append((node.lineno, f"{fn.name} calls self.{node.func.attr}()"))
    for fn in _functions(tree):
        if fn.name.startswith("_alloc_") and fn.name not in init_calls:
            other_calls.append((fn.lineno, f"{fn.name} is never called from __init__"))
    return other_calls


def rule4_aliased_rebinds(tree: ast.AST) -> list[tuple[int, str]]:
    """Any rebinding at all of a merged-pool view, self-referential or not."""
    bad = []
    for fn in _functions(tree):
        if fn.name == "__init__":
            continue
        for node in ast.walk(fn):
            if not isinstance(node, ast.Assign) or len(node.targets) != 1:
                continue
            name = _self_attr(node.targets[0])
            if name in ALIASED:
                bad.append((node.lineno, name))
    return bad


def main() -> int:
    rebinds, stale, setattrs, allocs, aliased = [], [], [], [], []
    trees = []
    for path in ENGINE_FILES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        trees.append(tree)
        fn = path.name
        rebinds += [(fn, *x) for x in rule1_rebinds(tree)]
        stale += [(fn, *x) for x in rule2_stale_captures(tree)]
        setattrs += [(fn, *x) for x in rule3_setattr_rebinds(tree)]
        allocs += [(fn, *x) for x in rule3b_alloc_callers(tree)]
        aliased += [(fn, *x) for x in rule4_aliased_rebinds(tree)]

    for fn, line, name in rebinds:
        print(
            f"REBIND  {fn}:{line}: `self.{name} = <expr using self.{name}>` "
            f"— use an in-place write, or a view of this plane will be orphaned"
        )
    for fn, cap, local, attr, w, r in stale:
        print(
            f"STALE   {fn}:{cap}: `{local} = self.{attr}` is a reference; "
            f"self.{attr} is written in place at line {w} and `{local}` is read "
            f"again at line {r} — it will see the NEW value. Use .clone()."
        )

    for fn, line, what in setattrs:
        print(
            f"SETATTR {fn}:{line}: `setattr(self, {what}, ...)` rebinds a plane "
            f"— write it in place instead, or aliases of it are orphaned"
        )

    for fn, line, what in allocs:
        print(
            f"ALLOC   {fn}:{line}: {what} — an _alloc_* helper is __init__ "
            f"split up, so it may only run from __init__; anywhere else it "
            f"rebinds live planes and orphans every view of them"
        )

    for fn, line, name in aliased:
        print(
            f"ALIAS   {fn}:{line}: `self.{name} = ...` rebinds a VIEW of the "
            f"merged unit pool — write it in place, or the pool stops seeing it"
        )

    if rebinds or stale or setattrs or allocs or aliased:
        print(
            f"\nin-place discipline FAILED — {len(rebinds)} rebind(s), "
            f"{len(stale)} stale capture(s), {len(setattrs)} setattr rebind(s), "
            f"{len(allocs)} misplaced allocator call(s), "
            f"{len(aliased)} aliased-plane rebind(s)"
        )
        return 1

    # Report the scale of what is being guarded, so a silently-empty scan
    # (a refactor that renames the engine, say) reads as suspicious.
    n_inplace = sum(
        1
        for t in trees
        for n in ast.walk(t)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr in IN_PLACE
        and _self_attr(n.func.value) is not None
    )
    print(
        f"in-place discipline OK — {n_inplace} in-place self writes, "
        f"0 self-referential rebinds, 0 stale captures, 0 setattr rebinds, "
        f"{len(ALIASED)} pooled views guarded, allocators __init__-only"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
