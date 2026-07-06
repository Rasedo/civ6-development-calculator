# C1-B3/B4/B5 stage designs

> Produced by a read-only design agent while C1-B2 was being implemented,
> then reconciled against B2 AS BUILT. **Reconciliation notes:** (1) B2 went
> further than the design's interface assumption — BOTH pooled stocks
> (`productionStock` AND `militaryStock`) are retired; units already train
> through per-city queues at real `UNITS` costs and spawn at their producing
> city (no home-pick RNG draw), so **B5c's queue-units half is already done**
> — its remaining scope is the war-gate/strength recalibration note (B2 chose:
> strength = cities×8 + Σ fielded combat, stock term dropped) and ranged-rival
> deferral. (2) References to `r_milstock`/`prodStock` trace columns are stale:
> B2's trace ships Σ front-item progress / Σ front-item cost instead. (3) The
> B2 picker is `rivalPhase`'s inline pick loop (capital-prefers-settler, one in
> flight per civ, units to cap) — B4's "picker grows a district branch" applies
> there. Everything else stands as designed.

**Interface assumption for B2 (superseded — see reconciliation):** rival
cities run real `City.queue` items at catalog costs, fed by `rivalCityYields`
production, chosen by a deterministic scripted picker, with GPU per-rival-city
queue tensors (`rc_current [B,R,RC]`, `rc_cost`, `rc_progress`).

---

## C1-B3 — rival research: real tech/civic trees (replaces `r_tech`)

**Goal:** rivals accumulate real 🧪/🎭 streams, run the real 32-tech / 31-civic
trees with cheapest-first auto-pick, and every `r_tech` consumer reads the
real tree. `rival.techLevel` and the `×(1+techLevel/25)` stand-in are deleted.
No eurekas for rivals (rationale below). Rival research consumes **zero RNG
draws**, so this stage — unlike B1 — cannot shift the mulberry32 stream
between engines; the parity risk is float/ordering only.

### Complete consumer inventory of `r_tech`/`techLevel` (from code)

| # | Site | Use | B3 replacement |
|---|------|-----|----------------|
| 1 | rivals.ts accrual | `techLevel += 0.15 + 0.05·cities` | real advance: banked science vs `TECHS[..].cost` |
| 2 | rivalCityYields | `production *= 1 + techLevel/25` — drives settler/queue pacing | interim stand-in `1 + nTechs(civ)/K`; retired at B5 |
| 3 | unit cost `45 + techLevel·2` | (retired by B2 as built — real `UNITS` costs already live) | — |
| 4 | type ladder `>12 HORSEMAN / >6 SPEARMAN / WARRIOR` | still live in the B2 picker | real tech gates: HORSEBACK_RIDING → HORSEMAN, BRONZE_WORKING → SPEARMAN |
| 5 | combat.ts rival city defense `15 + pop + ⌊techLevel·1.5⌋` (GPU mirrored) | | `15 + pop + ⌊nTechs·defPerTech⌋`, `defPerTech` exported (start 1.5, calibrate) |
| 6 | trace col `round(techLevel·1000)` | | replaced by richer research columns (below) |
| 7 | types.ts field, test literals, deserialize | | field deleted; `??=`-style save migration |

### Sub-stages

- **B3a — plumb + advance, consumers untouched** (r_tech still drives
  everything; new state observable only via new trace columns):
  * TS: `RivalCiv.research` (same shape as `state.research`).
    Behavior-preserving refactor FIRST (fixtures byte-identical, A-stage
    pattern): `availableTechsIn(research)` + thin player wrappers; a
    boost-free `effectiveResearchCostIn`.
  * Streams: `rivalCityYields` returns all-six `Yields`; science/culture =
    center + worked tiles' columns + `pop·CITIZEN_SCIENCE(0.7)` /
    `pop·CITIZEN_CULTURE(0.3)`. Faith/gold summed but unconsumed (documented
    dead until a rival treasury exists).
  * Advance: in `rivalPhase`, after the per-city loop and BEFORE the picker
    consumers see it next turn — pin the placement in a comment on both
    sides. Cheapest-first auto-pick (cost asc, table-order ties), progress +=
    science, while-loop completion with subtract-need (mirror
    advanceResearch minus boosts/government).
  * GPU: new `_MUTABLE` tensors `r_techs [B,R,NT] bool`, `r_civics [B,R,NC]`,
    `r_cur_tech/r_cur_civic [B,R]`, `r_tech_prog/r_civic_prog [B,R] f64`.
    Advance reuses `_available_mask` + the auto-pick per r. Science
    accumulation mirrors the TS per-city sequential adds (the `_dyadic_fp`
    branch pattern).
  * Trace: rival block widens with `[nTechs, nCivics, techProg·ms,
    civicProg·ms]`; `techProg·ms` is the high-value column — it diverges the
    first turn any rival science term is wrong.
- **B3b — consumers swap + `techLevel` deleted:** consumers 2/4/5 per the
  table; exporter ships `rules.rivals.research = { prodPerTech, defPerTech,
  spearTech, horseTech }`; `r_tech` leaves `_MUTABLE`; save migration.

### Eurekas for rivals: skip, documented

Boost conditions are mostly structurally unsatisfiable for rivals before
later stages (building/district/improvement/GP/policy conditions need
B2/B4/B5/never state). Only cityPop/totalPop/cities/coastalCity/tech could
fire — a ≤30% discount on a handful of techs. Cheapest-first at full cost is
the honest B3 policy; asymmetry-vs-player is a fairness issue only at
self-play, where C2's learned policy drives research anyway — revisit at B6
with owner-scoped checkSatisfied. Parity unaffected (both engines skip
identically).

### Balance impact (quantified; fixtures/baselines legitimately regenerate)

- Rival science ≈ 0.7·popSum + small tile terms → ~2🧪/turn early, ~8-10
  late → **~10-12 techs by t100** (cheapest-first cumulative ≈ 565 through
  the Ancient tier).
- **Military slowdown is the headline:** SPEARMAN (BRONZE_WORKING, ~485🧪 ≈
  t70-85) vs today's techLevel>6 ≈ t25; HORSEMAN mostly unreached in 100
  turns. Rival armies stay WARRIOR-heavy → strength drops → fewer wars.
- Production: the old mult reaches ~2.1× at t100; `1 + nTechs/25` gives only
  ~1.45× — **K≈12 restores end-of-horizon parity (~1.9×)**; export
  `prodPerTech` and calibrate on the 24-seed run (targets: rival popSum
  curves, settle counts, player-city flip counts).
- City defense at t100: old ≈ 15+pop+40; defPerTech=1.5 gives 15+pop+16 →
  barbs sack rival cities more → consider 3.0 (calibrate, don't guess).
- If flips collapse to ~0, add an exported `sciMult` difficulty knob (a
  Civ6-authentic AI handicap) rather than re-inflating K.

### Canary

Rival citizen science 0.7 → 0.75 → `techProg·ms` diverges on the first turn
any rival city exists, every seed. B3b consumer canary: leave K=25 in place
of the exported prodPerTech → queue-progress columns diverge within turns.

### Risks / mitigations

1. Float order of the science sum — mirror the TS per-city sequential adds.
2. Advance placement inside rivalPhase — pin it on both sides; the
   `techProg·ms` column catches one-phase offsets immediately.
3. Save round-trip — A2 `??=`-only migration; rival determinism test.
4. Vacuous mirror in B3a — impossible: the new trace columns gate-check the
   machinery from day one.

**Size:** ~1–1.5× B1. Gate-catch expectation LOW-MODERATE (no RNG draws, no
cross-owner tile interactions).

---

## C1-B4 — rival districts/buildings with real adjacency

**Goal:** rival cities queue and complete real districts (Campus/Holy
Site/Commercial Hub + Aqueduct where sourced) via B2's queues at
`districtCost` scaled by RIVAL research (B3 dependency), yield real floored
adjacency into the B3 streams, and unlock district buildings for the picker
via rival techs/civics. GP ACCRUAL unifies onto the real per-district
formula. In-progress (queued-not-complete) districts enter the GPU model
here.

### Sub-stages

- **B4a — placement + completion machinery:**
  * TS: owner-qualified `canPlaceDistrictFor(state, civ, city, type, tile)` —
    unlocks from `computeUnlocksIn(research)`, ownership `tileOwnedByCiv` +
    radius vs the center ("owned by this city" for rivals = owned by the civ
    AND within the work radius, matching rivalCityYields' convention).
    Player wrapper keeps exact behavior. The picker grows a district branch:
    per rival city, in scaffold order, queue `kind:'district'` when the
    rival's research has the unlock and maxSpecialtyDistricts(pop) allows;
    tile = best floor(districtAdjacency), ties lowest index. REAL queued
    completion, not instant-place — tile.district set at queue time
    (mirrors queueDistrict), districtComplete on finish.
  * GPU: new completion plane `district_complete [B,T] bool` (player
    placements keep writing True immediately); rival district state
    `rc_district_tile [B,R,RC,nD]`; `_place_district` parameterized per
    owner (the D5a extraction pattern); adjacency counters gain
    `& district_complete` and automatically pick up rival specialty
    districts (matchesAdjacency has no owner filter — a completed rival
    Campus gives the player's Campus +0.5, and vice versa).
  * Trace: rival block appends `[nDistricts, nBldgs]`.
- **B4b — yields:** rivalCityYields adds cityDistrictYields +
  cityBuildingYields under the rival's modifiers (adjacencyMult=1, no envoy
  adds, no Work Ethic — structurally zero for rivals). Building gates swap
  to rival techs AND civics + has-district + prereq onehots. NO maintenance
  sink (no rival treasury) — documented, deferred to the stage that gives
  rivals gold.
- **B4c — GP accrual unification (accrual only):** replace the flat
  `cities × RIVAL_GPP_RATE` with the real `1 + (#buildings of that
  district)` per rival city owning a completed GP_CLASS_DISTRICT[cls].
  Claim mechanics unchanged (zero-on-claim, no effects, rivals-first order)
  — full claim/effect unification is B6. Balance: rivals accrue 0 GPP until
  their first Campus/HS/CH completes → the player wins the first Great
  People uncontested; measure GP claim turns in the 24-seed run.

### The owner-dimension question (evaluated)

B4 does NOT force `[B,O,C]` unification. The three storage families it needs
extend the existing parallel-tensors pattern every cross-owner consumer
already uses. Costs: (a) shared logic parameterized, not duplicated (D5a
extraction pattern); (b) every "all districts on the map" consumer audited
(list below). TRUE re-layout stays deferred to C2 (per-seat obs forces it
there). Revisit only if the per-class loops over (R×RC×nD) turn out
unmaintainable — they won't at R=2, RC=10, nD=10.

### Cross-owner couplings to audit (each a candidate D5c-class latent bug)

1. Player district adjacency gains rival-district sources (both engines
   simultaneously — the intended observable).
2. Rival citizen candidates must respect district_complete=False tiles too
   (TS paves at queue time — keep consistent).
3. Barb camp candidates must exclude new rival district tiles dynamically
   (the static camp plane only covers t=0).
4. siteQuality/settle surfaces: already excluded via ownership.
5. CS buildDistrict quest counts PLAYER districts only — verify no rival
   leakage in cs_quest_district.
6. Loyalty-flip transfer semantics: keep "districts not adopted" (flipped
   districts stay paved-but-dead for both owners); symmetric adoption is B7.

### Exporter changes

rules.districts/buildings already ship everything; new:
rules.rivals.districtScaffold (likely reuse districtScaffold.place). Per-tile
planes are already sufficient (du, dadj, fadj, aqsrc).

### Balance impact

Rival science/culture jump once Campuses land → faster techs → stronger B3
consumers; Commercial Hub gold is dead yield (no rival treasury) —
documented. Rivals claw back some of B3's nerf, fidelity-honestly. Housing
deliberately NOT retired here — RIVAL_MAX_POP stays until B5.

### Canary

Rival Campus static adjacency +1 (the proven D2 canary, per-owner) → rival
techProg·ms diverges at first rival-Campus completion. Cross-owner: drop
rival districts from _adj_district_count → player science·ms diverges where
a player Campus adjoins one.

### Risks / mitigations

1. **Completion-plane retrofit** — the single riskiest piece (every current
   GPU consumer assumes complete-on-place). Mitigate: introduce
   district_complete defaulting True in an INERT commit (both gates green,
   zero behavior change) before any rival queue writes False.
2. Same-turn placement ordering (player RL placements vs rival scripted) —
   pin: player slots in slot order (D5c rule), then rivals in id/city order
   inside rivalPhase; mirror exactly.
3. districtCost timing — cost locks at queue time from the rival's current
   research counts; pin queue-vs-advance order.
4. GP race regression — B4c changes shared-pool consumption outcomes; add
   GP claim turns to the status-log checklist.

**Size:** ~2.5–3× B1 (four gate-runs; the completion plane and cross-owner
audit are where the catches live). Highest expected gate-catch density.

---

## C1-B5 — rival builders + improvements (+ what remains of unit training)

**Goal:** rivals train BUILDERs through B2 queues, walk them
deterministically to jobs, and build FARM/MINE/LUMBER_MILL gated on THEIR
research; the B3 production stand-in retires — rival production grows the
real way. Real housing retires RIVAL_MAX_POP here (farms supply the housing
that makes it survivable). (B2 as built already moved unit TRAINING to
queues; B5c's remaining scope is noted below.)

### Sub-stages

- **B5a — rival civilian occupancy plane (inert plumbing):** rival units are
  currently all-military by construction. Add `rvciv_at [B,T]` +
  `v_charges [B,U_MAX]`; make `_blocked_for`/`_first_free_spot` civ- and
  domain-aware for rival units (any FOREIGN unit blocks — including other
  rival civs' — own same-domain blocks, own cross-domain stacks). Inert
  while no rival civilian exists; poke self-test (purchase_test pattern).
- **B5b — rival builders + improvements:**
  * TS: `validImprovementsFor(state, civ, tile)` (ownership + the rival's
    unlocks). Scripted builder policy in rivalPhase: on an owned
    valid-unimproved tile, build the improvement maximizing Δ tileScore
    among unlocked {FARM, MINE, LUMBER}, ties FARM>MINE>LUMBER then lowest
    tile; else single-step toward the nearest job (the exporter's player
    builder walk verbatim, zero RNG).
  * **Rival modifiers become real here:** rivalCityYields'
    defaultModifiers() swaps to `modifiersFromResearch(rival.research)`
    (improvementYields mine boosts, farmAdjTier, hillFarms; government/
    religion/CS blocks omitted — structurally zero). GPU: `_rival_prod(r)`
    forks per rival with the rival's own mine-boost gather over r_techs;
    farm-adjacency food parameterized by the rival's farmAdjTier. Audit
    every "improvement BASE yields, never the player's boosts" comment and
    update the invariant: never the PLAYER's boosts; the OWNER's boosts now
    apply.
  * **Housing (retire RIVAL_MAX_POP):** rival growth applies
    housingGrowthFactor(housing − pop) to positive surplus, with
    computeHousing-for-rivals = center water (needs a new per-tile `cl`
    coastal-land plane in the exporter) + districts (B4) + buildings (B2) +
    0.5/farm + no mods. Land AFTER builders are farming (same stage,
    ordered), else rivals stall at pop ~4-6.
- **B5c — remaining unit-path items:** ranged rivals deferred (needs a
  ranged hostile-AI path) with a one-line note; verify the war-gate
  declaration counts across 24 seeds after B3-B5 land (B2 already dropped
  the stock term from strength — recalibrate the 1.3× threshold only if
  declarations collapse). Pillage asymmetry documented: nobody pillages
  rival improvements until B7 gives the player war verbs. Verify
  `_luxury_amenities` keeps counting player-borders-only luxuries — a
  rival-improved luxury must NOT feed player amenities.

### Exporter changes

Per-tile `cl` (coastal land) plane; builder-policy tie order if not
hardcoded; improvements catalog already ships. Trace: the global
improvements count already covers rival builds.

### Balance impact

Rival production becomes terrain-honest — per-seed variance widens (good for
self-play diversity). Retiring the B3 stand-in against real mines ≈
production-neutral on average if K was calibrated. Housing: rivals plateau
~8-10 pop vs the old hard 12 — mild loyalty-pressure reduction.

### Canary

Rival builder charges 3→4 → global improvements count diverges at the 4th
build of any rival builder — certain, early. Secondary: drop the rival
mine-boost gather → research/queue columns drift on seeds where a rival
mines (the V-P2 rival-mine catch, now first-class).

### Risks / mitigations

1. **Stacking/occupancy is the RNG-adjacent surface**: builder walks are
   deterministic, but spawn probes and blocked-step choices shift draw order
   when occupancy differs → whole-stream divergence. Mitigate: B5a's inert
   plane + self-test first; the trace rngState column localizes the first
   bad turn.
2. Owner's-boosts invariant flip — grep both engines for every
   defaultModifiers/_neutral_prod comment before flipping.
3. Builder-vs-district tile competition — rival builder masks gate
   `& district<0`, district placement gates `& improvement<0` (the D5b
   catch, generalized).

**Size:** ~2× B1. B5a+B5b one heavy session, B5c light (mostly verification
after B2's early delivery).

---

## Sequencing / parallelization feasibility

**The stages must stay serial through the gates**: (1) fixtures are one
shared artifact — every stage regenerates them, and generated-JSON conflicts
are unresolvable except by regeneration; (2) hard dependencies: B4 needs B3
(district unlocks + districtCost read rival research; civic-gated
buildings), B5 needs B3 (improvement gates, rival modifiers). Keep plan
order **B3 → B4 → B5**.

**What CAN overlap safely:** (a) behavior-preserving TS refactors with
byte-identical fixtures (availableTechsIn / computeUnlocksIn /
modifiersFromResearch / canPlaceDistrictFor extractions); (b) gated-off GPU
plumbing + self-tests (the D5a/V-P1/B5a pattern); (c) calibration harness
work (24-seed flip/war/GP-turn counters). Only one stage may own a fixture
regeneration at a time, landing both gates green before the next begins.

**Baseline discipline (every stage):** fresh eval random/scripted baselines
+ a status-log note of the world-shift direction; all prior nets go stale by
construction at each activation stage — the accepted C1 cost.
