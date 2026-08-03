# #96 THE GREAT RESTRUCTURE — the surveyed plan

Base: `ad0bac4`. Four surveys (2026-08-03) mapped the whole surface. This
file is the distillation; re-surveying costs ~400k tokens, so START HERE.

Owner framing: "there should be only seat symbols"; "cut gpu engine file
into several pieces, this thing is unmaintainable"; independent module
dirs (ui / ts-engine / gpu-engine / seeder / decision-server / rl);
fixtures become seeded worlds. Escalated 2026-08-03 to one experimental
batch, accelerate pace.

---

## 0. THE THREE FINDINGS THAT CHANGE THE PLAN

**(a) The rename is not a rename.** ~14,000 occurrences, ~590 distinct
symbols, ~130 files. The dominant cost is NOT the word "rival" (3,821 TS
+ 2,260 PY) — it is the five PLANE PREFIX families that contain no
"rival" substring at all and that a grep for "rival" never finds:

| family | distinct | occ | what it is |
|---|---|---|---|
| `r_*`    | 61 | 1,290 | per-rival scalars — **`= civ_x[:, 1:]`** |
| `rc_*`   | 47 | 1,544 | rival city block — `= cty_x[:, 1:1+rp]` |
| `v_*`    | 35 |   847 | rival unit pool |
| `rr_*`   | 10 |   193 | rival<->rival relation — `war[:, 1:1+R, 1:1+R]` |
| `cs_r_*` |  7 |   112 | (CS x rival) — `= csr_x[:, 1:]` |

**Several symbols must be DELETED, not renamed** — renaming them
preserves the asymmetry under a new spelling, which is what the owner's
directive forbids: `civOfRival` (316 sites; it IS `r+1`, so the correct
edit is deleting the call), `rivalOfCiv` (29), `type RivalCity = City`
(82, already a pure alias), `rules.civs.rivalBase` (literally encodes the
off-by-one), `v_civ` (140, redundant with `unit_seat`), `rival_at` (101,
a derived view of `tile_seat`), `controlled` (`= seat_ext[:, 1:1+r_pad]`).

**SILENT-FAILURE SITE:** `engine.py` `_MUTABLE` (module-level, ~450-521)
is ~230 NAME STRINGS; `snapshot()`/`restore()`/`_check_state_discipline`/
`_pristine` all do `getattr(self, k)` by string. 27 entries are
rival-named. A miss does NOT raise — `hasattr` guards it and the plane
simply stops being snapshotted. `snapshot_restore_test` is the ONLY
coverage. Four more string registries with the same failure mode:
`_CS_PAIR_FIELDS`, `_CIV_PAIR_FIELDS`, `_RC_SLOT_FIELDS` (17034-17047),
`self._UNIT_PLANES`, plus 23 `register_alias` calls (names built by
f-string from a table, so grep will not find `r_treasury` near its own
definition). `pool_view` keys on the literal prefixes `"p"`/`"v"`/`"u"`.

Prefix-pass ORDER is load-bearing: `cs_r_` before `cs_` and before `r_`,
else you get `cs_seat_seat_envoys`. `v_`/`r_` collide with ordinary
locals (only 14 of 35 `v_*` and 40 of 61 `r_*` are planes). No incidental
substring collisions exist ("arrival"/"derivative" appear only in prose).

Use the EXISTING codemod harness (`scripts/codemod/pysub.py` +
`harness.ts`, built for #56: dry-run default, write-read-back-compare,
CRLF-preserving). Do not write another str.replace script.

**Cross-engine string contracts** (renaming one side breaks the gate —
which is the GOOD case; the bad case is renaming both and re-exporting,
which makes the frozen statelog baseline unfalsifiable): trace column
names (`_TRACE_PER_RIVAL` vs `gpu-trace.ts` PER_RIVAL_COLS — S0.1 landed
a name-identity assertion, so this pair is actually the SAFEST item);
`rules.trace` JSON keys; `rules.civs.rivalBase`; tile wire keys `rv`/`rci`
(`rv` is a 0-based rival index with -1 sentinel, NOT a seat — renaming
without `+1` silently shifts every tile's owner); the fixture `rivals`
array (position = index); statelog line keys (`RT${r}`, `rrw`, `rrk`) —
these are the FROZEN BASELINE, change them LAST in a commit that changes
nothing else.

**(b) The engine split wants MIXINS, not function groups.** Decisive
reason: the call graph is genuinely cyclic (combat -> unit verbs ->
capture -> combat; `_rival_phase` calls 40+ methods across 20 groups and
12 call back). As free functions taking `sim` that is a cyclic import
graph broken only by deferred imports at ~1,900 call sites; as mixins,
`self.X()` resolves through the MRO and the coupling becomes
documentation-only. Also 8 `@property` methods can only live on a class.
And a mixin move is a BYTE-IDENTICAL TEXT MOVE with zero call-site edits
— the only refactor shape reviewable as "same bytes, different file" in a
turn-exact engine. Method names are globally unique across all 264 (no
MRO collisions). Cheapest per-tranche proof: hash `inspect.getsource` of
every `BatchSim` method before/after and diff the name->hash map.

**HARD BLOCKER, must be tranche 0:** `gpu/tests/inplace_discipline_test.py`
hard-codes `ENGINE = .../civ6gpu/engine.py` and `ast.parse`s THAT ONE
FILE; `rule3b_alloc_callers` asserts every `_alloc_*` is seen being called
from `__init__` in the same AST. The moment a method moves it either
false-fails or silently stops guarding what left. Teach it to union-parse
`civ6gpu/*.py` FIRST.

Keep with `__init__` in engine.py and importable as `civ6gpu.engine.X`:
`_MUTABLE`, the three class-attr field tuples, `_UNIT_PLANES`, every
`register_alias` call, `P_MAX`, `PLAYER_SEAT`, `BARB_SEAT`, `js_round`,
`pool_view`, `FLANKING_CS`, `SUPPORT_CS`, `_ALIAS_CHECK` (6+ test files
import these by name).

`step()`'s phase ORDER lives in its body, not the file layout, so moving
callees cannot perturb it. But `_rival_phase` (1762 lines) is step()'s
mirror for seats 1..R and the two orders are only auditable side by side
— extract it WHOLE, adjacent to step(), never decomposed in this task.

**(c) The scripted policy DIES, it does not move** — owner correction:
the TS engine is already a decision-server client (CIV6_SERVE mode), the
UI just is not pointed at the wire yet. Transport DECIDED: dev server
(browser cannot spawn Python; same record schema; no TS/WASM ladder
port). See task #100. This unblocks deleting the whole (D) policy bucket
below instead of carefully preserving it.

---

## 1. rivals.ts DISSOLUTION (3859 lines, 61 symbols, 775 rival-occ)

`type RivalCity = City` ALREADY — the data model merged; only code paths
are forked. Merge sequence (survey's, by ascending risk):

1. **Free deletes:** `rivalCityMaintenance` (VERBATIM copy of
   `city.ts:cityMaintenance`), `foundRivalCity` (one-line wrapper of
   `foundCityAt`), `rivalUnits` -> `seats.ts:unitsOf`, `nearestDistance`
   -> `hex.ts`, `relocatePalace` move (already fully seat-generic).
2. **Pure seat-param, formula-identical:** `rivalTilePurchaseCost`
   (character-identical to `game.ts:tilePurchaseCost`),
   `rivalDistrictDiscounted`, `rivalQuestSatisfied`, `issueRivalQuest`,
   `queueRivalProject` (decide whether refusing space/victory rows is the
   rule).
3. **Constant reconciliation — GATE-VISIBLE, needs a Civ 6 source:**
   `playerStrength` uses `cities*10` unrounded, `rivalStrength` uses
   `cities*8` then `Math.round`. `sueForPeace` player vs AI paths use
   DIFFERENT min-turn constants. Both feed observations.
4. **The transfer trio** — DONE 2026-08-03 (`ad0bac4`, Great Works).
   Remaining deltas: `transferCityToRival` derives kept districts from
   owned tiles + dedupes by type where the rr twin copies verbatim; only
   it carries the raze-at-cap arm; only the rr twin adds
   `RR_WARMONGER_CAPTURE`.
5. **`placeRivalWonder`** re-implements the WHOLE placement predicate by
   hand instead of calling `rules.ts:canPlaceWonder` — largest
   hand-transcription risk left in the file.
6. **The economy twins, last:** `rivalHousing` -> `computeHousing` (one
   real delta: player adds every district's `housing` + the NEIGHBORHOOD
   appeal term, rival adds only NEIGHBORHOOD — verify against
   data/districts.ts); then `rivalAmenityTiers` -> `luxuryAmenities` +
   the `computeCityStats` amenity block (rival OMITS
   `wonderRegionalAmenities` — a rival wonder granting amenities pays
   nothing); then `rivalCityYields` -> `computeCityStats` (term-for-term
   aligned and cross-annotated, but rival inlines everything into one
   flat total; merge by making `computeCityStats` SEAT-AWARE, never by
   extending the rival text).
7. **(B) moves:** `nextCityName`->game.ts, `isFormalWar`/
   `setWarKindFormal`/`breakAlliance`->seats.ts, `makePeace`->diplomacy,
   `levyUnits`->cityStates.ts, `applyLoyalty` seat-param,
   `theologicalCombat`->combat.ts, `grantRelic`->city.ts,
   `assertRivalRegistryCoherent`->invariants, `applyRivalActionRecord` +
   `applyRivalUnitOrders`->seatTurn.ts (NO external callers, seat is
   already the real key).
8. **(C)** `worldCongress` -> its own `congress.ts` (already iterates all
   civs symmetrically; only the playerSeat/rivalsOf split needs
   `allSeats`).
9. **(D) DELETE after task #100** (the `!recU`-gated scripted arms; the
   survey estimates this is the bulk of rivalPhase's 1259 lines):
   `tryFoundCity` scan, `patrol`, `tryQueueRivalDistrict/Building/Wonder`,
   `rivalHasBuilder/Engineer`, the job scans, `rivalBuilderActions` policy
   half, `rivalMissionaryActions`, `rivalGeneralActions`,
   `rivalRivalDenounce/DeclareWars/MakePeace`, `claimBeliefs` pick half,
   and inside rivalPhase the envoy/gold/faith/trade/research scans.
   `RIVAL_BUY_UNITS` is a shared DECISION TABLE (exported only for the
   seeder to mirror into the GPU) -> policy module.

External callers to keep working: `scripts/export-gpu.ts`
(`RIVAL_BUY_UNITS`, `rivalPhase`, `sueForPeace`, `levyUnits`),
`scripts/statelog.ts` (`rivalCityYields`), `src/main.ts` (`declareWar`,
`sueForPeace`, `levyUnits`), `src/ui/panels.ts` (`loyaltyDelta`,
`playerStrength`, `rivalStrength`, `rivalProximity`), and ~15 test files.

---

## 2. ENGINE SPLIT — 7 tranches (31 groups, 18,502 lines)

T0 enabler: fix `inplace_discipline_test` (union-parse); establish the
engine.py re-export contract.
T1 `core.py` (523: the 13 pure module-level fns, Rules, loaders,
constants, `_MUTABLE` re-exported) + trace mixin (224; `trace_row` has
ZERO inbound callers inside the class — smallest blast radius).
T2 leaf phases ~1,430: disasters 110, reclaim 120, diplomacy/congress 269,
city-states 329, barbarians 600.
T3 base mixin ~1,020: map/occupancy/spawn geometry 773 + cost scalars 116
+ the 7 RNG/damage primitives. Highest fan-in — move once, before T5.
T4 economy family ~1,816: government 160, research 183, tile yields 273,
great people 317, districts/wonders 340, religion 543.
T5 combat + unit verbs ~3,900 (two tranches): auras/MP 369, capture/
transfer/loyalty 668, player unit verbs 789, combat 965, rival unit
verbs 1,348.
T6 economy twins + RL surface ~3,080: player city totals 595, rival
production 417, rival expansion 320, trade 420, rival city yields 1,152,
masks/obs 1,191 (last two get their own files/tranches).
T7 LAST, the orchestrators ~3,045: `_rival_phase` 1762 + `step` 1283.

End state: engine.py keeps re-exports + class decl + construction (1763)
+ invariants/snapshot (222) ~= 2,000 lines, plus ~20 sibling mixins.

Cross-cutter to watch: `self._eff_version` is touched in 22 of 31 groups
(152 sites) and the "bump after write" rule is enforced by comments only.
Give it a `_bump_eff()` home — but that changes call sites, so it is its
own tranche, never smuggled into a move.

Stale doc anchors to re-point in the tranche that moves them:
`gpu/AUDIT.md:1434` (engine.py ~13040/13062),
`gpu/UNIFY_SEATS_PLAN.md:199` (engine.py:15063).

---

## 3. MODULE DIRECTORIES

Target: ui / ts-engine / gpu-engine / seeder / serve-client /
decision-server / rl / tooling / civ6mod / docs.

- **seeder/serve-client split is CLEAN**: `export-gpu.ts` line ~1818
  `if (!SERVE) { write; continue; }` — the seeder path exits before the
  250-turn loop, which is SERVE-only. Shared surface is just
  `buildWorld(seed)` + `SEED_OVERRIDES`/`seedFor` and two `if (SERVE)`
  mutations inside the world build (`rivalActions = {}`,
  `autoResearch = false`). Seeder's remaining engine imports are then
  world-gen + rules only (legitimate); `endTurn`/`observeSeat`/
  `applySeatZeroUnits`/queue fns/`assignEnvoy`/`traceRow`/`tsStateLines`
  all belong to the serve client.
- `gpu/ladder.py` is ALREADY a pure decision server (imports torch only).
  `gpu/drive.py` is policy by intent but duck-types into ~10 BatchSim
  privates — that is the extraction work. `gpu/serve_gate.py` is a
  parity HARNESS, not a server -> tooling/gates.
- `src/ui/*` is clean; the inversion runs the other way:
  `src/core/rlenv.ts` imports `../ui/autopilot`. Move autopilot out of ui.
- RL is mostly rubble: `gen_targets.py` deleted (ad0bac4); `eval.py` and
  `search_eval.py` keep net-free lanes, net paths ImportError; no
  `class Policy`/`nn.Module` survives anywhere in gpu/. The legacy TS/ES
  + python/SB3 arm is orphaned and not in the battery at all.

**Blockers, in the order they must be cleared:**
1. `FIXTURES = Path(__file__).parent.parent/"fixtures"` in engine.py:40 —
   the most-referenced constant in the repo (serve_gate x6, all eval, ~40
   tests). It resolves relative to the GPU ENGINE, so the engine defines
   where the seeder writes. Must become config/argv/env FIRST.
2. `sys.path.insert` in **60 files** (48 tests, 4 eval, 6 tools,
   serve_gate) + implicit-namespace sibling imports (`import drive`,
   `import ladder`, `import stamp`) that only work because gpu/ is on the
   path. Real packages + pyproject.
3. `gpu/stamp.py:source_stamp()` hashes `ROOT/src/**/*.ts` +
   `ROOT/scripts/export-gpu.ts` — hardcodes both the TS engine root and
   the seeder entry. Any move silently invalidates every fixture stamp.
4. `serve_gate.py` duplicates the `npx vite-node scripts/export-gpu.ts …`
   invocation at TWO sites (x2 argv shape + fixtures dir).
5. tsconfig `paths` aliases (none exist today; ~60 `../src/…` literals in
   scripts/).
6. `battery.py`'s ~50 hardcoded lane paths -> derive from a manifest.
7. `src/main.ts:4` uses `'../src/core/seats'` (resolves today, breaks on
   any move); `index.html` `/src/main.ts`; `vite.rl.config.ts` 4 entries.

Tests: `tests/*` (66 files) import ONLY `src/core`/`src/data` -> move
wholesale to ts-engine/tests (except rlenv/policy tests -> rl).
`gpu/tests/*` (54) -> gpu-engine/tests, except `ladder_test`/`drive_test`
-> decision-server, `mcts_test`/`gumbel_test` follow mcts.py. NOTE 36 of
49 assert directly on `r_*`/`rc_*`/`v_*` planes — a plane rename touches
36 test files whose names give no warning.
