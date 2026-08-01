# Archive — shipped designs & research syntheses

Historical documents, consolidated (2026-07-08). Each design here is
IMPLEMENTED and its stage log lives in BUILD_PLAN.md; the text is kept
verbatim for the reasoning record. The living docs are BUILD_PLAN.md
(roadmap + status log), TRAINING.md (guide + results), SEARCH.md.


---

# [C1 decision — Road A (full-fidelity symmetric rivals)]

# C1 — the self-play architecture decision

> **DECIDED 2026-07-06: Road A — full-fidelity C1.** The user chose to
> promote rivals to full symmetric civs in BOTH engines under the parity
> contract. The staged plan lives in `BUILD_PLAN.md` §3 (C1-A groundwork →
> C1-B subsystem promotion → C2 egocentric surface → C3 self-play trainer).
> The analysis below is kept for the record.

Self-play with tree search needs a second **policy-driven** civilization.
Today both engines have exactly one: the player is a full citizen
(per-city queues/districts/buildings, tech+civic trees, treasury, units,
envoys, GP), while rivals are ~7 scalars per civ (`r_tech`,
`r_prodstock`, `r_milstock`, war flags) plus city pop/HP lists and a
heuristic behavior walk. There is no owner dimension on any action,
observation or reward tensor; `empire_score()` sums player cities only.
"Drop a second policy in" is not an option — something must be built.
Two honest roads, and a hybrid that defers the expensive commitment.

## Road A — full-fidelity C1: promote rivals in BOTH engines

Re-architect the real engines so every player subsystem gains an owner
dimension (`[B, O, C, …]`), with per-owner masks/obs/reward and the
TS oracle rebuilt symmetrically (the parity contract demands both sides
change together).

- **Payoff:** self-play happens on the *real* environment — everything
  learned applies directly to the full-fidelity world; one engine to
  maintain; the scripted-rival code deletes eventually.
- **Cost:** this is the largest single project in the repo's history —
  bigger than the whole district arm. Every fixture regenerates, every
  benchmark baseline resets (rival behavior changes), the parity gates
  roughly double in weight, and the RL surface (obs 83 → per-owner
  egocentric, action routing, reward) rewrites alongside. BUILD_PLAN's
  scoping verdict stands: "a two-engine RE-ARCHITECTURE, not a
  refactor."
- **Risk:** months of stages before the first self-play game; nothing
  ships in between.

## Road B — symmetric mini-env first

Build a NEW, small environment that is owner-indexed from day one: two
civs, shared map, the covered economic core (growth, districts-lite,
units, loyalty), no TS mirror — or a thin one — and run C2/C3
(egocentric obs, league, PFSP) plus the M3 search-distillation loop on
it.

- **Payoff:** self-play infrastructure (the genuinely new machinery —
  league play, frozen-snapshot pools, per-civ reward, search-in-the-loop
  training) gets built and validated in days-to-weeks, not months; zero
  parity burden; findings (net architecture, search config, league
  hyperparameters) transfer as *knowledge* even though weights don't.
- **Cost:** a second env to write and maintain; its conclusions are
  suggestive, not binding, for the full engine; risks the mini-env
  drifting into its own research toy.

## Road C — hybrid (recommended): defer the commitment, buy information

1. Keep pushing the single-agent arm on the real engine — it is NOT
   exhausted: tuplesearch still loses to greedy (the value head is the
   bottleneck), M3's search-distilled training is unexplored, and the
   new verbs (purchases live; war/peace plumbed; capture/ranged next)
   keep raising the ceiling vs the scripted world.
2. In parallel (cheap), build Road B's mini-env to de-risk C2/C3: prove
   the league/self-play machinery works AT ALL on a Civ-like action
   space before betting the engines on it.
3. Commit to full C1 only when self-play in the mini-env demonstrably
   produces strategies the scripted world can't teach (early war
   punishes, loyalty sieges, forward-settle denial). If it doesn't,
   C1's cost was never worth paying.

## The questions only you can answer

1. **What's the goal?** "Strongest agent on this simulator" → M3 first,
   C1 maybe never. "Self-play research platform / AlphaZero-style
   result" → mini-env now, C1 when proven.
2. **Appetite:** C1 is a multi-month autonomous project with heavy
   fixture churn; the mini-env is days-to-weeks. Which fits your
   patience for no-visible-progress phases?
3. **Parity contract:** for the multi-agent arm, keep the two-engine
   bit-exact discipline (slow, trustworthy) or accept a single-engine
   mini-env (fast, unverified)? The single-agent arm keeps its gates
   either way.

Answer in any form ("road C", "mini-env but keep parity", "just do
C1") and the plan gets written as ordered stages in BUILD_PLAN.md.


---

# [C1-B3/B4/B5 stage designs (all shipped)]

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


---

# [C2 design — the per-seat egocentric RL surface (shipped)]

# C2 — the per-seat egocentric RL surface (design)

> Written at B-arc completion (2acc8c8). Spec source: BUILD_PLAN §3 "C1-C".
> The engine is DONE for this stage — C2 is training-side surgery over the
> parity-proven BatchSim; the gates keep running untouched underneath.

## What exists (the seat-0-only surface)

`gpu/civ6gpu/env.py` BatchEnv: obs = 14 global + 3×S CS + 3×R rival + 9×C
city features, all PLAYER-framed; masks/actions = the 5 heads (production
[B,C,NB+2+NU], tech, civic, units [B,P,13], envoy [B,S]) driving the PLAYER
tensors; reward = player empire-score delta. Rivals act via the scripted
`_rival_phase` picker.

## The structural fact C2 must respect

Rivals are BEHAVIORALLY symmetric (B-arc) but STRUCTURALLY separate:
player state lives in per-city planes (owner/center_at/queues via
`current`/`buildings` [B,C,NB]...) while rival state lives in rc_*/r_*/v_*
tensors. Two consequences:

1. **Egocentric obs = per-family RENDERING, not tensor swapping.** A seat-k
   observation renders "my empire" features from the rival tensor family
   when k>0 (rc_pop/rc_bldg/r_techs/...) and "opponent" features from the
   player planes — the FEATURE SCHEMA is seat-invariant, the sources are
   not. obs(seat) must emit exactly the same layout so one net serves all
   seats.
2. **Action routing = intercepting the scripted picker.** For a controlled
   rival seat the net's 5 heads replace the picker's choices, not the
   mechanics: production head → rc_current/rc_cost picks per rival city
   (settler / district / building / unit codes — the SAME code space the
   picker writes); tech/civic heads → r_cur_tech/r_cur_civic (the advance
   loop already honors them); units head → v_* acts (march/attack targets
   for rival military; builders stay scripted in C2 — their walk is
   deterministic policy, not economics); envoy head → masked all-False
   (rivals have no envoys until a later stage).

## Sub-stages (gate-serialized like the B-arc)

- **C2a — seat-parametrized surface, seat 0 only (behavior-preserving).**
  `BatchEnv(seat=0)` refactor: observe()/masks()/step()/reward gain a seat
  parameter internally routed to the existing player paths. Nothing about
  the emitted numbers changes for seat 0 — proven by bit-identical obs/mask
  tensors on the fixtures (a new `seat_test.py` asserts equality against
  the pre-refactor values) and an unchanged reference-net eval.
- **C2b — rival-seat rendering + routing, gated OFF.**
  observe(seat=k>0) renders the egocentric layout from rival tensors;
  masks(seat=k) exposes the rival decision space (production codes per
  rival city under the picker's own gates; research picks where cur==-1;
  unit acts for rival military; envoys all-False). step(actions, seat=k)
  writes the choices BEFORE `_rival_phase` runs and a `controlled[B,R]`
  mask tells the picker/research auto-pick/unit AI to skip controlled
  rivals. Gated OFF = controlled empty ⇒ byte-identical fixtures, both
  gates green (the B4a inert pattern).
- **C2c — O=2 duel env + smoke test.**
  `DuelEnv`: two seats over one BatchSim (seat 0 = player civ, seat 1 =
  rival 0), per-seat obs/mask/reward; reward phase switch:
  `reward=dense` (own score delta — bootstrap) | `relative` (own minus
  opponent delta, symmetrized — self-play). Smoke: random-policy duels run
  the horizon with both seats acting, scores move, no NaNs; scripted-vs-
  scripted duel reproduces the plain scripted world when seat 1 mirrors
  the picker (sanity anchor).
- **C2d — trainer plumbing.** train_ppo grows `--seats 2` (seat-swapped
  batches: each game contributes both perspectives), checkpoint metadata
  records the seat count; fit_env_to_checkpoint keeps old nets loadable
  (seat-0-only). Then C3a takes over (EMA opponent, 80/20 frozen mixture).

## Decisions pinned now

- Builders under net control: NO in C2 (deterministic walk stays scripted
  for both seats; the net steers economics through what to build, not
  where to walk). Revisit with V-verbs.
- War/peace head for rival seats: OFF in C2 (the war gate stays scripted)
  — C3's league needs it, land it as C3-prep.
- O>2: the seat axis is parametric from C2a on, but only O=2 is exercised
  until C3c.
- Obs schema: keep the existing feature blocks and sizes EXACTLY (a seat-1
  render fills the same slots: "my cities" = rc slots up to C, padded;
  "rivals" block = the player empire viewed as a rival + remaining true
  rivals). Nets stay shape-compatible across seats by construction.

## Verification

C2a: bit-identical obs/masks (seat_test.py) + fixtures hash unchanged.
C2b: fixtures hash unchanged with controlled=∅; a poke test drives one
rival production/tech choice and asserts the picker honored it.
C2c: smoke duels + the scripted-mirror sanity anchor.
Battery stays the gate for every sub-stage.


---

# [C3c design — O=4 free-for-all (i/ii/iv shipped; iii = trainer seats=O + piKL, tracked in BUILD_PLAN)]

# C3c — O=4 free-for-all (design)

> Written while c3a-5 (PFSP) trains. Spec: BUILD_PLAN §3 C3c. Everything
> here is CPU-side prep; activation waits for the c3a-5 ladder read.

## What O=4 needs that O=2 already has

The C2 surface is O-parametric by construction: `_seat_rival(k)` covers any
rival, `rival_masks/apply_rival_actions/rival_score/rival_unit_mask/
_apply_rival_unit_actions` all take `r`, and `observe(seat=k)` renders any
rival's egocentric view (its rival block holds the player + the OTHER
rivals). The gaps are:

1. **Fixtures with 3 rivals.** The gate fixtures (2 rivals) are a parity
   CONTRACT — they must not change. O=4 gets its OWN pool
   (`gpu/fixtures_o4/`), exported with `rivals: 3`, used ONLY by training/
   duel tooling. Exporter: a `--rivals` argv (default 2, writing to the
   default dir; `--rivals 3 --out gpu/fixtures_o4` for the FFA pool).
   Loader: `FIXTURES` stays the gate pool; `load_fixture` takes explicit
   paths already — BatchEnv/DuelEnv/MeleeEnv accept a fixtures list, so
   only the pool GLOB moves behind a parameter in the training entrypoints.
   The parity gates NEVER read the O=4 pool.
2. **MeleeEnv** — the DuelEnv generalization: seats = [0..O-1] over one
   BatchSim (seat 0 the player civ, seats 1..O-1 = rivals 0..O-2, all
   controlled). step(actions: list[dict]) applies every rival seat's
   choices then advances with seat 0's; rewards [B, O]:
   - dense: own score delta per seat
   - relative: own delta minus the MEAN of the others' (zero-sum across
     seats by construction, the FFA analog of the duel's flip)
3. **Trainer**: `--seats O` generalizes the seat-axis batching (obs
   [B, O, F] → [OB, F]); self mode trains every seat's rows; PFSP drives
   any subset of non-focal seats from the pool.
4. **α-Rank**: the eval protocol over ≥3 checkpoints — round-robin
   duel_eval margins → a payoff matrix → the α-Rank stationary
   distribution (a ~50-line power-method script, `gpu/eval/alpharank.py`),
   ranking the pool instead of raw win rates once intransitivity appears.
5. **piKL anchoring** (mixed-motive collapse guard): an auxiliary KL term
   toward an ANCHOR policy (the scripted-equivalent or the last stable
   checkpoint) added to the PPO loss for FFA runs: `--anchor <ckpt>
   --anchor-kl <coef>`. Cheap to plumb (one extra forward + KL on learner
   rows); OFF by default; activated for O=4 runs per Diplodocus.
6. **Kingmaking telemetry**: per-seat win vs score distributions logged
   per update (already derivable from the [B, O] scores at episode end).

## Order

C3c-i fixtures pool + exporter arg; C3c-ii MeleeEnv + smoke (random 4-seat
FFA runs the horizon, relative rewards zero-sum); C3c-iii trainer seats=4 +
piKL flag; C3c-iv alpharank.py over the c3a pool; activation = the first
O=4 run, gated on the c3a-5 read.

## Non-goals here

V-W1/V-W2 (the symmetric war head + capture) stay their own §4 stage — an
FFA without war verbs is still a meaningful economics race with barb/
defense pressure, and the war stage lands independently.


---

# [RL research synthesis (informed M3 + the C-arc)]

# RL trajectory review — literature synthesis (2026-07-06)

Synthesized from 26 primary sources gathered by a deep-research sweep
(5 search angles → fetch → claim extraction; the adversarial-verification
stage was skipped by user choice, so treat claims as faithful extractions
from primary sources rather than independently verified). Question: is
this project's RL trajectory sound, what breaks at 4-player self-play,
and which methodologies are we missing?

## Verdict in one paragraph

The trajectory — PPO on a factored masked action space, a perfect
snapshot/restore forward model, and a decided arc toward
search-distilled training (M3) and league self-play (C3) — is the
published recipe, and two of our empirical results this week are
*predicted* by the literature (the 1-ply value-leaf failure, and the
raw-score PUCT pathology). Three course corrections are warranted:
(1) M3 must replace plain sampled search with **Gumbel top-k +
Sequential Halving** and train the value head on **search-derived,
off-policy-corrected targets** — not merely "more search"; (2) the
**dense score-delta reward is the right bootstrap but the wrong
self-play objective** — plan a switch to relative/sparse reward for the
league phase and watch for score-hacking; (3) **start self-play at 2
players**, keep the owner dimension `O` parametric, and scale to 4-FFA
with population methods — 4-player works empirically (Pluribus,
Diplomacy) but has no convergence guarantees and needs specific
mitigations.

## 1. Is the trajectory sound? — Yes, with published confirmations

- **Our negative result was predicted.** "On the role of planning"
  (ICLR'21, arXiv:2011.04021): planning's main contribution is at
  TRAINING time (better targets and data distribution); evaluation-time
  search adds only ~7.4pp on average — and, mechanistically, *learned
  value functions have systematically higher errors on low-probability
  (off-policy) actions, and expanding such actions during search
  propagates those errors*. That is exactly why our PPO/GAE-trained
  value head cannot rank sampled tuples (tuplesearch 182–192 vs greedy
  195 at every temperature). The lever we identified (M3) is the right
  one — and eval-time search should be expected to stay marginal even
  after M3; the win comes through training.
- **Expert Iteration is the frame** (ExIt, NeurIPS'17, arXiv:1705.08439):
  search-improved targets beat policy-gradient training, and *online*
  data aggregation (keep old search data, DAgger-style) beats batch.
  AlphaZero's own value target is effectively on-policy (SARSA-like);
  off-policy search-derived value targets — soft-Z / A0C / A0GB
  (ALA'20 → NCA'22) — train faster and stronger. M3's value-target
  design should start from soft-Z (root search value) rather than
  final-game outcomes.
- **Our sampled-tuple design is the published one** (Sampled MuZero,
  ICML'21, arXiv:2104.06303): factored per-dimension categoricals with
  sampled complete tuples is their exact construction (56-dim humanoid);
  K as small as 3–50 samples approaches full-enumeration strength. Two
  corrections we don't yet apply: the visit/selection machinery must be
  **importance-corrected** (β̂/β) or it biases toward the proposal, and
  behavior-cloning search targets **discards value information** —
  MAZero (ICLR'24, arXiv:2405.11778) fixes that with advantage-weighted
  policy targets (AWPO) plus an optimistic backup, OS(λ), designed for
  deterministic models like ours.
- **Low-budget search needs Gumbel** (Gumbel MuZero, ICLR'22 Spotlight):
  vanilla AlphaZero's policy update *can fail to improve at all* when
  the budget can't visit every root action — our regime (46-column
  production head × per-unit heads, single consumer GPU). Gumbel top-k
  with Sequential Halving guarantees policy improvement with as few as
  2 simulations; MA-Gumbel variants (AAAI'24) extend this to
  exponentially factored multiagent tuples. "MCTS as regularized policy
  optimization" (ICML'20, arXiv:2007.12509) is the same story from the
  optimization side. LightZero (NeurIPS'23 D&B) has maintained reference
  implementations of the whole family.
- **Unbounded-score search needs Q normalization** (SameGame,
  arXiv:2005.11335): with dense unbounded rewards, per-node min-max
  normalization of Q inside the search is mandatory — we independently
  hit this in M1 ("unnormalized PUCT sticks on the first-scored
  action"). Same paper flags an open question whether value heads help
  at all in single-agent unbounded-score optimization (they used
  policy-guided rollouts instead) — a second reason our value-leaf
  failed that is *specific to score maximization*, beyond off-policy
  error.
- **A structural advantage worth naming:** we have a perfect, cheap,
  bit-exact forward model. The MuZero-family's heaviest machinery
  (model learning, consistency losses — EfficientZero's biggest
  ablation win) exists to compensate for NOT having one. We are in the
  AlphaZero-with-free-model regime; EfficientZero's remaining relevant
  idea is **reanalyze** (refresh replay-buffer targets with fresh
  search — 99–100% of targets recomputed).
- **Dense-score caveats** (see §2 too): CivRealm (arXiv:2401.10568) —
  the closest published precedent, PPO on a full Freeciv — got trapped
  in a myopic local optimum by score reward (spamming units instead of
  founding cities, because founding dips score short-term). Our engine's
  score shape apparently avoids that specific trap (our nets expand
  aggressively — the loyalty saga proves it), but CoastRunners (OpenAI,
  2016) stands as the canonical warning: a score-maximizing policy can
  look great on the score metric while being degenerate against the
  actual goal. Any future "win condition" needs its own eval, not just
  empire score.

## 2. Four-player FFA: real risks, known mitigations, 2p-first

- **The theory is genuinely against n>2:** Nash beyond 2-player
  zero-sum is PPAD-complete; equilibrium *selection* is ill-posed
  (independently computed equilibria don't compose — Pluribus's Lemonade
  Stand example); learning dynamics need not converge at all
  (α-Rank, Nature Sci.Rep. 2019); naive latest-vs-latest self-play can
  cycle forever under non-transitivity (self-play survey,
  arXiv:2408.01072). CFR/minimax-style guarantees exist **only** for
  the 2-player zero-sum duel — the fallback you named is exactly the
  theoretically safe regime.
- **But empirically n-player works when you add structure:** Pluribus
  (Science 2019) reached superhuman 6-max poker with self-play + search
  and *no* guarantees — framing n-player self-play as an empirical
  question. Diplodocus (arXiv:2210.05492) got top-human in 7-player
  no-press Diplomacy, but only by **anchoring search and RL to a
  reference policy** (DiL-piKL) — pure self-play provably insufficient
  in mixed-motive games. Its lesson transfers: we have no human data,
  but we DO have a scripted-civ policy and frozen snapshots to anchor
  toward (a piKL-style KL-regularizer toward the scripted policy or the
  previous checkpoint during n-player search/training).
- **Kingmaking/collusion:** our game is closer to poker/Generals than
  Diplomacy — there is no negotiation channel, so explicit collusion
  can't be *communicated*; the risks are implicit (two losing civs both
  dogpiling the leader is actually *desired* balance; a trained policy
  learning to throw games to a "teammate" checkpoint is the failure to
  watch). Mitigations from the literature: population diversity (league
  with exploiters — AlphaStar, Nature 2019 — noting AlphaStar's league
  was for a 1v1 game), α-Rank instead of Nash as the meta-solver /
  evaluator for n-player populations (α-PSRO; and NeuPL-JPSRO,
  AAMAS'24, which provably converges to a *coarse correlated
  equilibrium* — the tractable n-player target), and reward design
  (below).
- **Reward design is where FFA bites first.** Our per-turn score delta
  is not zero-sum: in self-play, four score-maximizers can converge on
  mutual non-aggression (peaceful co-farming maximizes everyone's
  score) — which may be *fine* for an "optimizer" project but is not
  "competitive Civ". OpenAI Five's fix: **symmetrize the dense reward**
  (subtract opponents' reward — e.g., own score delta minus the
  mean/max of others') to restore zero-sum pressure while keeping
  density. The 2026 Generals.io result (arXiv:2606.23348 — post-cutoff,
  unverified but detailed) goes further: dense material shaping
  actively HURT; sparse win/loss + a difficulty curriculum + plain PPO
  self-play (EMA opponent, no league) reached superhuman in a 2p
  strategy game on one GPU-vectorized simulator. Practical takeaway:
  dense score for single-agent bootstrap (proven here), then
  **relative-score or win/loss for the self-play phase**, possibly
  annealed.
- **Recommended path (and it costs nothing architecturally):** build
  C1/C2 with the owner dimension `O` as a parameter, seat-swapped PPO
  at **O=2 first** (duel: cleanest signal, guarantees-adjacent, ~half
  the tensor width, faster league iteration), and scale to O=4 as a
  second phase with: α-Rank league evaluation, PFSP matchmaking,
  anchored search, symmetrized reward, and an explicit eye on
  kingmaking metrics (e.g., per-seat win distribution vs score
  distribution). 2p results remain scientifically meaningful on their
  own; 4p rides the same code.

## 3. Methodologies we hadn't discussed, ranked by expected impact

1. **Gumbel top-k + Sequential Halving root selection** (Gumbel MuZero)
   — replaces plain prior-sampling in tuplesearch; guaranteed policy
   improvement at 2–16 simulations; the single highest-leverage change
   to the search arm, and the M3 policy-target generator.
2. **Search-derived off-policy value targets + reanalyze** (soft-Z/A0C/
   A0GB; EfficientZero's target refresh; ExIt's online data
   aggregation) — the other half of M3: the value head must be trained
   on search-improved play, with targets recomputed as the net improves.
3. **Per-node min-max Q normalization** in all search Q usage
   (SameGame) — systematize what M1 discovered ad hoc; prerequisite for
   any PUCT/Gumbel machinery over unbounded empire scores.
4. **AWPO + importance correction for sampled spaces** (MAZero; Sampled
   MuZero) — when distilling search into the policy, weight by
   advantages and correct for the sampling proposal instead of
   behavior-cloning visit counts.
5. **Reward-phase plan** — dense score → symmetrized relative score →
   (optionally) win/loss with curriculum, per training phase (OpenAI
   Five; Generals.io'26; CoastRunners/CivRealm warnings).
6. **Cheap PPO upgrades for self-play** (Generals.io'26): EMA opponent
   for plain self-play before any league; top-advantage sample
   filtering; plus OpenAI Five's horizon/γ annealing.
7. **α-Rank as the league evaluator** and CCE (not Nash) as the
   n-player solution concept (α-PSRO / NeuPL-JPSRO) — decide BEFORE
   building C3's matchmaking, so the league telemetry is right from
   day one.
8. **Anchored (piKL-style) search/training for n-player** (Diplodocus)
   — regularize toward the scripted policy or last checkpoint to keep
   n-player search from sharpening into brittle best-responses.
9. **Multi-continuation leaf evaluation** (Pluribus): evaluate search
   leaves under k alternative opponent continuations instead of one —
   robustness tool once opponents are learned policies, not scripts.
10. **Policy Gradient Search** (arXiv:1904.03646) — a tree-free planner
    (adapt a simulation policy online) as a fallback if trees stay
    awkward in the factored tuple space; pairs with ExIt.

Not recommended: learned-model machinery (MuZero dynamics, consistency
losses) — our bit-exact snapshot/restore model makes it dead weight;
Stochastic MuZero — our env is deterministic given rng_state (LightZero's
2048 benchmarks show chance-node modeling matters only under real
stochasticity; our search's RNG-clairvoyance is a separate, smaller issue
addressable by leaf RNG re-hashing).

## Cross-checks against our own measurements

| Our result | Literature |
|---|---|
| 1-ply value leaf loses to greedy at every τ | ICLR'21: off-policy value error propagates through search; SameGame: value heads questionable under unbounded scores |
| Raw-score PUCT sticks on first action (M1) | SameGame: min-max Q normalization is mandatory with unbounded rewards |
| Factored 5-head masked categoricals + sampled tuples | Sampled MuZero's exact construction (their §factored policies) |
| PPO alone reaches 217–222 vs scripted in ~80 min | OpenAI Five / Generals.io'26: model-free PPO self-play scales further than expected; search optional |
| netgreedy ≈ tuplesearch at eval | ICLR'21: eval-time search adds ~7pp on average; training-time is where planning pays |
