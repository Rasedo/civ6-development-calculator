# GPU engine — autonomous build plan

Ordered roadmap: the district economy (§1, done), single-agent search
(§2, done through M2b-2), full-fidelity symmetric rivals → self-play
(§3, Road A decided 2026-07-06), and the agency verbs (§4, purchases +
ranged live, war/peace gated). Worked in **small stages, each committed
+ pushed green** so a
container rollback never loses more than the in-flight stage. Every stage
re-syncs first (`git stash -u; git fetch; git merge --ff-only origin/<branch>`),
mirrors the TS oracle, and must pass BOTH parity gates + `tsc` before commit:

    npm run gpu:export && python3 gpu/parity_test.py      # scripted gate
    npm run gpu:rollout && npm run gpu:replay             # off-script gate

Legend: [ ] todo  [~] in progress  [x] done (commit hash)

## 1. District economy  (biggest GPU↔TS gap)
Only the City Center is ported; specialty districts + their buildings are the
largest missing slice of the Civ6 economy. Sub-stages mirror the FARM phase
(inert plumbing → one type → adjacency → buildings → RL action).

- [x] **D1** Inert plumbing: engine district-state tensor ([B,T] type idx, -1=none),
      exporter ships the district catalog (id, cost, adjacencyYield, adjacency
      rules, housing, placement flags) + STATIC per-tile adjacency contribution
      (mountain/rainforest/woods/reef/river/sea-resource/natural-wonder — known
      at t=0). Self-test; both gates stay green (nothing builds districts yet).
- [x] **D2** Campus placement + adjacency yield (COMPLETE — a Campus is placed
      live and yields, both gates green, canary bites):
  - [x] **D2a** raw static-source adjacency table [B,T,10] exported (in-exporter
        self-check: floor(static)==districtAdjacency on every non-dynamic tile) +
        engine loads it inert.
  - [x] **D2b-machinery** _city_totals paves district tiles (excluded from
        citizen candidates) + adds floor(d_static_adj[·,CAMPUS]) science for
        owned Campus tiles (pre-amenity, mirrors cityDistrictYields); exporter
        ships the `du` placeable-land mask + campusUnlockTech/campusIdx. Inert,
        poke-verified, both gates green.
  - [x] **D2b-activate** Campus placed live (SCRIPTED_CAMPUS=true); CS
        buildDistrict quest mirrored; builder excludes district tiles. Both gates
        green; canary (Campus science +1) breaks the gate. D2 COMPLETE.
- [x] **D3** Dynamic adjacency + other district types (COMPLETE for the district
      types reachable in 100-turn scripted games — Campus/Holy Site/Commercial
      Hub; IZ/Theater/Harbor are pop-10+ 4th-slot districts, deferred as
      unexercised — see status log):
  - [x] **D3a** dynamic DISTRICT source for Campus (+0.5 per adjacent completed
        district/center incl. rival centers); placement relaxed to allow
        center-adjacent tiles. Both gates green; canary (dyn 0.5→1.0) bites.
  - [~] **D3b** other adjacency district types (Holy Site, Commercial Hub, IZ):
        - [x] **D3b-1** generalized the yield loop, maintenance, and CS-quest
              `already`/satisfaction over district types (data-driven from the
              catalog + askable map); behavior-preserving, both gates green.
        - [x] **D3b-2** scripted placement generalized to a scaffold LIST; places
              a HOLY_SITE too (per-pop cap). Coverage: Campus 22/24, Holy Site
              24/24 games; both gates green first try.
        - [x] **D3b-3** Commercial Hub added to the scaffold (one line, unlock
              CURRENCY); river static + DISTRICT dyn via the generic loop. Both
              gates green; coverage 4/24 games (needs pop 7 + Currency).
        - [—] **D3b-4** Industrial Zone / Theater / Harbor — DEFERRED (unexercised).
              Reachability check (horizon-100 era): capital pop maxed at 9 (median
              5), 0/24 games reached the 4th specialty slot (pop≥10), APPRENTICESHIP
              (IZ unlock) unresearched in 100 turns. At the settled 250-turn horizon
              APPRENTICESHIP IS reachable, so the deferral is no longer
              horizon-blocked — these districts remain unimplemented (AUDIT A-9). The
              MINE_OR_QUARRY / CITY_CENTER / BUILT_WONDER dynamic sources come with
              them.
- [x] **D4** District buildings (Library/University/Research Lab, Shrine/Temple,
      Market/Bank/Stock Exchange): buildable set extended past City-Center;
      _buildable gates each on tech-unlock + the city owning a completed district
      of that type (reqDistrict, via a per-city has-district onehot) + a
      prerequisite building (requiresAny). Yields/housing flow through the
      existing b_yields/b_housing. Specialists NOT modeled — effectiveSpecialists
      reads city.specialists (a manual setting the scripted policy never sets),
      so all citizens work tiles. Both gates green; canary (disable the gate →
      GPU builds an ungated Library, bldgs0 diverges) bites hard. Coverage thin
      (Library 1/24, Shrine 2/24 — buildings compete on cost) but non-vacuous.
- [x] **D5** RL production head can place districts (widen production action space).
  - [x] **D5a** Gated-off plumbing (behind `_rl_district_active=False`, inert):
        shared `_place_district_capital(di, want)` best-tile helper (the scaffold's
        eligibility/rank/place logic, extracted); the scripted scaffold refactored to
        call it (behavior-preserving); `production_mask` widened from NB+2+NU to
        NB+2+NU+nScaffold — the district columns are capital-only (slot 0) and gate on
        has_tech & under specialty cap & an empty placeable tile exists & one-per-type,
        but return all-False while `_rl_district_active` is off; a matching RL apply
        block in `step()`'s production branch (district codes sit above the unit range;
        placement is instant/free and leaves the build slot idle). Provably inert:
        `masked_choice`'s argmax over valid entries is invariant to trailing all-False
        columns and never touches the mulberry32 stream, so rollout picks the same
        actions and logs the same trace; the GPU never emits a district code, so
        replay-gpu.ts's existing dispatch is untouched. Both gates green
        (scripted 24×100, off-script 72×100); inertness self-test confirms width
        21→24 with district columns all-False.
  - [x] **D5b** Flipped `_rl_district_active=True`; replay-gpu.ts now handles the
        district action (unit branch bounded to `a<NB+2+NU`; `a>=NB+2+NU` places on
        the TS side via canPlaceDistrict + the same best-tile scan); rollout.py emits
        the scaffold id map. Driving the off-script gate to green (72×100, 51 district
        actions across 45 games) surfaced FIVE latent bugs, all vacuous until off-script
        districts existed — each fixed by mirroring the TS rule:
        (1) **builder-district** — `unit_action_mask`/execution let a builder improve a
        district tile; added `& district<0` (TS validImprovements forbids it).
        (2) **civic-unlocked buildings** — Temple/Amphitheater/… gate on a CIVIC, not a
        tech; the exporter only mapped tech `unlockBuilding`. Added `unlockCivic` +
        `_buildable` civic gate.
        (3) **Commercial-Hub building maintenance** — Market/Bank/Stock Exchange are
        upkeep-free (city.ts buildingMaintenance); the exporter's cost formula charged
        1 gold. Added the `district==='COMMERCIAL_HUB' → 0` case.
        (4) **CS per-district envoy bonus** — a scientific/religious/… CS at ≥3 (again
        ≥6) envoys adds +districtBonus to each owned district of its type
        (csEnvoyBonuses.districtAdd); the GPU only had the flat capital bonus. Exported
        typeDistrictIdx/districtBonus, added `cs_dbonus` into the district-yield loop.
        (5) **player great people** — a Campus/Holy Site/Commercial Hub accrues
        Scientist/Prophet/Merchant points (1 + its buildings/turn); the n-th costs
        gpCost(n) from the SAME gp_earned pool the rival race consumes (rivals claim
        first in rivalPhase, then the player after research — the GPU order matches).
        Effects apply advanceGreatPeople-style: science→current tech, culture→current
        civic, gold→treasury, production→capital. Modeled `player_gp_points` +
        `_advance_player_great_people`. Canary: seed 9196 earns Aryabhata at turn 64
        (+50 science) — without it the GPU lagged one tech (col1) at turn 83.
        Both gates green (scripted 24×100, off-script 72×100). RL is now district-capable
        — ready to retrain with the wider action space.
- **D6** Specials (housing/coastal/military districts):
  - [x] **D6a AQUEDUCT** — DONE + green. The non-specialty housing district is now a
        placeable RL/scaffold district. It has its own placement (adjacent to the city
        center AND a water source — river / adjacent lake·oasis·mountain — no adjacency
        yield → lowest tile), does NOT consume the specialty cap (spec_count now counts
        only countsTowardLimit types), costs 0 upkeep (per-district `maintenance`
        exported + summed), and applies conditional housing in _city_totals
        (fresh city: +aqFreshBonus=2; non-fresh: water housing raised to
        aqNoFreshTotal=6). Unlock is ENGINEERING (Classical) — NOT MASONRY (the initial
        wiring bug: the scripted tech-includes check passed on MASONRY while
        canPlaceDistrict gates on the ENGINEERING unlock, over-placing). Reachability:
        ENGINEERING was 0/24 in the horizon-100-era scripted games (it IS reachable
        at the settled 250-turn horizon), and off-script random tech play reaches it —
        3/72 games place an Aqueduct, so housing/placement/cap/upkeep are all
        non-vacuously verified. Both gates green.
  - [x] **D6b HARBOR** — DONE + green. Coastal specialty district, placed 7×
        off-script. Two new mechanisms landed: (1) a COASTAL-WATER placement surface
        (per-tile `cw` = isCoastalWater & no wonder & no non-bonus resource — the
        static part of canPlaceDistrict for a coastal district; the land `d_usable`
        does NOT apply); _place_district picks `coastal_water` for placement=2.
        (2) generalized dynamic adjacency: `_district_adj_raw` = static + 0.5·adjc +
        CITY_CENTER·(adjacent centers) + HARBOR_DISTRICT·(adjacent harbors), with the
        amounts derived from the catalog. Harbor gets +2.5/center (2 CITY_CENTER +
        0.5 DISTRICT); and the previously-vacuous HARBOR_DISTRICT +2 on Commercial
        Hub now fires when a CommHub sits next to a Harbor. Bug found on the way: the
        first `cw` omitted the non-bonus-resource / wonder exclusions, so the GPU
        placed a Harbor on a tile canPlaceDistrict rejects — displacing a Commercial
        Hub and swinging treasury ~18g (seed 9066). Both gates green (24×100, 72×100).
  - [—] **Encampment** — wired end-to-end (placement 'encampment'/code 3:
        notAdjacentToCityCenter, specialty, no yield) and reaches 21 placements
        off-script, but HELD OUT of the scaffold. It left a subtle culture→civic
        completion-timing edge (seed 9248, civics off by 1 at t98) that isn't worth
        chasing for a no-yield military district that only competes for the scarce
        cap. Re-add `{id:'ENCAMPMENT',unlockId:'BRONZE_WORKING',placement:'encampment'}`
        to SCAFFOLD_DISTRICTS to re-enable. NOTE: the fix that landed here anyway —
        requires/notAdjacentToCityCenter must test ALL adjacent CITY_CENTERs (player
        AND rival, via `_adj_center_count()`), not just the placing city's own
        center — also corrected a latent Aqueduct over/under-placement.
  - [—] **Neighborhood** — needs a late civic (Urbanization, Industrial, cost
        1060) still unreached even at the 250-turn horizon.
- **D6 COMPLETE (reachable specials):** Aqueduct (housing) + Harbor (coastal gold)
  are live under both gates. The district action space now covers the economic
  three + housing + coastal — enough for a district-rich retrain.

## 2. Single-agent MCTS  (score lever over the existing net)
Primitives already exist: deterministic batched forward model (in-state
mulberry32), cheap clone/restore (`_MUTABLE` + `_pristine`), trained policy
priors + value head (train_ppo `self.v`), legal-action masks.

- [x] **M1** DONE — `snapshot`/`restore` (clone every `_MUTABLE` tensor + turn) +
      an EXHAUSTIVE 1-ply `search_production` over one city's production head: score
      each legal action by its horizon-15 scripted rollout, take the argmax. The
      scripted forward model is deterministic (RNG lives in `rng_state`, round-tripped
      by snapshot/restore), so ONE rollout per action is its exact value — a PUCT
      bandit is pointless here and, unnormalized, actively wrong (its exploration term
      is dwarfed by raw ~60–180 empire scores, so it sticks on the first-scored action
      and never visits the rest). `gpu/mcts_test.py`: snapshot/restore bit-exact over
      104 tensors + deterministic; search deterministic, eval-only (state bit-identical
      after), >= greedy on all 12 seeds and strictly beats it on 9 (typically finding a
      SETTLER/second-city line that compounds past the myopic building). Both gates green.
- [x] **M2a** DONE — net-free planning lever (needs no checkpoint): DEPTH
      (`plan_production` — the rollout leaf may assume `city` keeps PLANNING at its
      future decisions instead of reverting to scripted, so depth>1 sees setup moves
      that pay off past the next decision) + CLOSED LOOP (`mpc_play` re-searches at
      EVERY decision of the real game — model-predictive control — adapting to the
      realized RNG futures). Both stay eval-only during search (snapshot/restore).
      Result: closed-loop depth-1 beats the scripted base policy on final empire_score
      on 5/6 seeds (mean +28, never worse), ~14 s/game on CPU. `gpu/mcts_test.py`
      covers determinism, eval-only, and the win over scripted. Both gates green.
      `gpu/search_eval.py` benchmarks scripted-vs-search on matched B=1 worlds
      (the reproducible harness for this arm; net rows land in M2b).
- [x] **M2b-1** DONE — a TRAINED net wired into the search + benchmark harness. Proven
      that train_ppo.py LEARNS on the district engine (a CPU run climbed empire_score
      85→135, best 138.1) and plugged the net in two ways via `gpu/search_eval.py`:
      `net` (policy head drives the capital) and `netsearch` (the M2a search with the
      net's VALUE head as the 1-ply leaf, no rollout). On matched worlds all three
      challengers crush scripted (net +68, netsearch +58, search +48); netsearch beats
      rollout search at ~8x the speed (value head is a good cheap leaf — the M3 lever).
      Table + caveats in the status log. Checkpoints stay gitignored (gpu/runs/).
- [x] **M2b-2** DONE (machinery + benchmark) — Sampled-AlphaZero search over the full
      5-head action tuple: `netgreedy` (net drives all heads greedily) + `tuplesearch`
      (net-prior tuple sampling, net-value or rollout leaf, play the best). On a 135.6
      GPU-trained net over 6 matched worlds the full net policy beats scripted +38, but
      net-value-leaf tuplesearch only TIES greedy (163 vs 165, 2W/4L) — the mid-net's
      value head is too noisy to search against. Needs a STRONG net (Q-normalized PUCT /
      chance nodes deferred until then). See the M2b-2 + Phase-B(local) status entries.
- [ ] **M3** Search-distilled training — the AlphaZero loop, research-informed
      (`gpu/ARCHIVE.md`; our value-leaf failure and raw-score PUCT pathology
      are both predicted by published work). Sub-stages, each green on its own:
      - [x] **M3a** min-max Q normalization (`minmax_normalize`, degenerate-
            range guard) — shipped with the Gumbel package. Original spec: —
            mandatory under unbounded empire scores (SameGame); systematizes the
            ad-hoc M1 finding before any PUCT/Gumbel machinery lands.
      - [x] **M3b** `gumbelsearch` (search_eval): greedy + (k−1) sampled tuples
            with Gumbel noise g+logp, Sequential Halving over ROLLOUT DEPTH
            (deterministic env ⇒ budget buys depth, not revisits; rungs
            [1,6,12] at k=8), cut by g + logp + (50+d)·q̄. **FIRST eval-time
            tuple search to beat the greedy net: 243.7 vs netgreedy 240.3,
            5/6 head-to-head (tune3, matched worlds)** — plain-sampling
            tuplesearch lost at every temperature. k=16 ties (3W/3L); the
            one loss (9066, −54) is a value-blend misrank over an excellent
            greedy line — per ICLR'21, eval-time gains stay marginal; the
            machinery's real payoff is M3d training targets.
      - [x] **M3c** Batched candidate evaluation (`stack_tuples`/`clone_state`/
            `eval_tuples` in mcts.py): the k tuples ARE the batch dim of one
            lockstep k-wide sim; restore()'s copy_ broadcasts the B=1
            snapshot. Self-test proves batched == sequential BIT-EXACTLY
            (both dtypes, padding, rehash). ~1/k the sequential wall-clock —
            the M3d data-generation unlock.
      - [ ] **M3d** Training targets: search-derived OFF-POLICY value targets
            (soft-Z root-value first; A0C/A0GB variants if needed),
            AWPO/importance-corrected policy distillation instead of visit-count
            cloning (MAZero / Sampled MuZero), reanalyze-style target refresh as
            the net improves. The leaf RNG re-hash SHIPPED as `rehash_rng` +
            `--honest-rng` (keyed on each row's own rng_state so common random
            numbers survive batching; clairvoyance bonus measured ≈ 4 mean
            points at identical runtime).

## 3. Multi-civ symmetry  (unlocks self-play + AlphaZero)
Blocker: player is a full citizen, rivals are a reduced heuristic NPC model.

**DECIDED 2026-07-06 (user): Road A — full-fidelity C1.** Promote rivals to
full symmetric civs in BOTH engines, keeping the two-gate parity contract.
See `gpu/ARCHIVE.md`. Plan principles: (1) never a big-bang rewrite —
every stage lands with both gates green; (2) TS stays the oracle at every
step; (3) behavior-preserving refactors FIRST (fixtures unchanged), then
one rival subsystem at a time swaps heuristic → real machinery (fixtures
and baselines legitimately regenerate at each activation); (4) the old
scripted-rival heuristic is re-expressed as a scripted POLICY driving a
full civ — it remains the parity anchor and becomes self-play's baseline
opponent; (5) the verbs arm (war/capture) folds in where symmetric state
makes it natural. Research-informed additions (`gpu/ARCHIVE.md`):
(6) the owner dimension **O is a parameter** — self-play starts at
**O=2 (duel)**, the theoretically safe regime (2-player-zero-sum-adjacent
guarantees; half the tensor width; faster league iteration), and scales
to the 4-player FFA as a second phase on the SAME code; (7) **reward
phases**: dense per-turn score delta for single-agent bootstrap (proven),
SYMMETRIZED relative score (own delta minus opponents' — OpenAI Five's
zero-sum restoration) for self-play, optionally sparse win/objective
later — four independent score-maximizers would otherwise converge on
peaceful co-farming; (8) n-player league telemetry targets **CCE via
α-Rank**, not Nash (PPAD-complete, ill-posed selection), decided BEFORE
C3's matchmaking is built.

- **C1-A. TS unification groundwork (behavior-preserving; fixtures unchanged):**
  - [x] A1. One `civId` space (player = 0, rivals 1..R): `src/core/civs.ts`
        defines the numbering + owner-qualified accessors; ownership reads
        migrated. Proof: 232 tests, fixtures BYTE-IDENTICAL, both gates green.
  - [x] A2. Rival cities ARE real `City` objects (`RivalCity extends City` +
        {hp, foundedTurn}; growthBox → foodBox; inert queue/buildings/districts
        defaults; per-rival ids KEPT — they drive border pacing). Save
        migration fills only missing fields (round-trip byte-identical).
        Proof: 232 tests, fixtures BYTE-IDENTICAL, both gates green.
  (B1 status detail) C1-B1 [x] — the FIRST behavior-changing promotion; fixtures
  legitimately regenerated. TS: rivalCityYields now runs the real citizen path
  under defaultModifiers — candidates mirror workableTiles (owned, in-radius,
  no district/wonder tiles EXCLUDED-not-zeroed, impassable out, WATER IN),
  scored by the exported tileScore ('balanced' focus_base over all six yields,
  ties by GLOBAL tile index), topped by population; the center adds real
  floored yields (tileYieldsForCenter) instead of the flat 3🍞/2⚙; growth uses
  the real accounting (true surplus incl. negative, unscaled growthFoodNeeded —
  RIVAL_GROWTH_FACTOR retired — grow SUBTRACTS the need, starvation shrinks with
  pop floor 1). techLevel×(1+t/25) stays as the research stand-in until B3;
  RIVAL_MAX_POP stays as the housing stand-in until B2+. GPU mirror iterated
  through THREE gate catches: (1) tie-break — the new TS sort ties by global
  tile index (assignWorkedTiles) where the old heuristic kept tilesWithin
  order; the GPU key now subtracts the global id, not the window position
  (probe: 4 tiles tied at score 6, engines picked different thirds). (2) the
  static yield plane now exports UNPAVED (district-nulled) values — paving is
  a runtime mask in every GPU consumer, and rival centers need their real
  yields live (probe: hills centers gave TS 2⚙ vs GPU's floor 1⚙ → prodstock
  drift on seeds 9131/9209). (3) LUXURY AMENITY SHARING — a pre-existing,
  documented-as-inert gap that phase-6b mines silently made reachable: a
  random game's builder MINED DIAMONDS at t91 and the TS amenity tier shifted
  every yield multiplier (seed 9144, all accumulators drifting together).
  Now modeled: exporter ships per-tile lux/luxreq planes + luxAmenityCities;
  engine `_luxury_amenities` mirrors luxuryAmenities exactly (unique improved
  luxuries inside borders — pillage faithfully does NOT suspend — iterative +1
  to the 4 neediest, need desc / slot asc, grants feed back into the ranking).
  replay-gpu.ts gained a REPLAY_DEBUG env flag printing ALL differing columns
  (found the amenity signature: every accumulator drifting at one turn).
  Proof: both gates green on the NEW fixtures (scripted 24×100, off-script
  72×100 mean 130.2), 232/232 tests, tsc, all four self-tests. FRESH BASELINES
  (world friendlier — weaker rivals, less loyalty pressure): eval random
  122.8 ± 11.2 (was 115.1), scripted 192.2 ± 13.6 (was 162.2). All pre-B1
  nets/benchmarks are stale by construction; tune3 trains on this world next.
  - [x] A3. GPU adopts the civ numbering (behavior-preserving): exporter
        asserts rival ids contiguous 0..R-1 and ships `civs: {player: 0,
        rivalBase: 1}` in rules.json; engine gains PLAYER_CIV /
        civ_of_rival / rival_of_civ, `self.O = 1 + R` seat metadata, and a
        load-time assert that fixture numbering matches the constants
        (exercised by every gate run). Tensor re-layout deliberately
        deferred INTO each B-stage (road ii): every B-stage regenerates
        fixtures anyway, the risk amortizes, and seat-0 bit-exactness is
        provable per family. Proof: seed fixtures BYTE-IDENTICAL, rules.json
        delta = exactly the `civs` key, both gates + 232 tests +
        purchase/mcts self-tests green.
- **C1-B. Subsystem promotion, one at a time (each: TS change → export →
  both gates → GPU mirror → new baselines):**
  - [x] B1. Rival tile-working via the REAL citizen/yield path: tileScore
        selection (balanced focus, global-index ties), real floored center
        yields, real growth curve (unscaled, subtract-need, starvation);
        housing/amenities for rivals defer to B2+ (maxPop stays the stand-in).
        Fresh baselines: random 122.8, scripted 192.2 (world got friendlier).
        Gate catches: GPU tie-break + district-nulled yield plane + LUXURY
        AMENITY SHARING (pre-existing gap, now modeled). See status log.
  - [x] B5. Rival builders/housing/occupancy COMPLETE — the B-arc is done:
        rivals are full-fidelity symmetric civs within the engine scope.
        **B5b-iii-a** (3e04aa6): rivalCityYields under
        modifiersFromResearch — OWNER mine boosts on worked tiles (and the
        selection score); the B3 prod stand-in DELETED; production is
        terrain-honest (baselines 113.2/164.5 — rivals softened as real
        mines under-replace the flat multiplier). **B5b-iii-b** (a9d7d84):
        real housing (wh plane, Aqueduct rule, building housing, radius-3
        improvement housing) with housingGrowthFactor on positive surplus;
        RIVAL_MAX_POP + the kk selection-width coupling retired (baselines
        114.4/172.7 — housing throttles harder than the old cap). Gate
        catch: computeHousing counts PILLAGED improvements (shelter, not
        yields) — reachable only via a flipped city inheriting an ex-player
        pillaged farm, which the off-script gate manufactured (seed 9001,
        one pop at t100). **B5c audits**: war-gate healthy post-B3-B5 (21
        declarations across 19/24 seeds, t21-61 — 1.3x threshold stands);
        luxury amenities verified player-borders-only in BOTH engines
        (rival-mined diamonds feed neither); deferred with notes: ranged
        rivals (needs a ranged hostile-AI path, B7), pillage asymmetry
        (nobody pillages rival improvements until B7's war verbs). Every
        pre-B5 reference net is stale; the next trains on the B5 world.
        NEXT: C2 — the per-seat egocentric RL surface (O parametric, O=2
        duel first) per §3.
  - [~] WAS: B5 in progress. **B5a + B5b-i + B5b-ii DONE**.
        B5b-ii: rival BUILDERS end-to-end — trained through the queues (one
        per civ while jobs exist, cap-slotted), spawned as civilians (rciv
        probe, roster charges), best-gain improvement on valid tiles
        (constant Δ-score gains, FARM>MINE>LUMBER ties), deterministic walk
        to the nearest job, disband at zero charges. EIGHT parity catches —
        the richest hunt of the project: (1) TS rival-unit civId is the RAW
        rival id, not the unified civ space; (2) job scope had to intersect
        validImprovementsIn with {FARM,MINE,LUMBER} (resource-improvement
        jobs are a later stage); (3) GPU hostiles couldn't see rival
        civilians (scan + roll-free lone-civilian kill); (4) TS
        patrol/war-march moved builders (civilians filtered both engines);
        (5) GPU patrol mask missed rvciv blocking; (6) GPU rival-military
        spawn probe blanket-blocked own-civ builders (TS stacks
        cross-domain); (7) builder gates must evaluate under the PHASE-TOP
        unlock snapshot (TS computes rivalUnlocks pre-advance — divergent
        exactly on unlock-completion turns); (8) the random-action player
        move path had inline blocking without the rvciv term (off-script
        gate catch). occupancy_test extended with organic-population,
        plane/slot coherence and spawn-over-own-builder cases. Both gates +
        full battery green. B5b-iii next: modifiersFromResearch into
        rivalCityYields + rival housing (retire RIVAL_MAX_POP + the prod
        stand-in). Earlier: **B5a DONE** (inert) —
        rvciv_at civilian-occupancy plane + v_charges join _MUTABLE;
        _blocked_for/_first_free_spot grow civ-aware rival probes ('rmil'/
        'rciv': rival civs are FOREIGN to each other, own-civ cross-domain
        stacks); TS tileFreeForUnit gains the same civ-aware foreign check
        (side alone can't distinguish rival civs — identical semantics in
        the all-military world, so provably inert: fixtures hash 51a10bd5
        unchanged, both gates green, new occupancy_test pokes all seven
        probe directions + snapshot coverage + organic-inertness).
        B5b next (i: extractions; ii: builders end-to-end; iii: real rival
        modifiers + housing retiring RIVAL_MAX_POP + the prod stand-in).
  - [x] B4. Rival districts + buildings COMPLETE. **B4c**: GP accrual is
        real — 1 + (that district's built buildings) per city owning a
        COMPLETED GP-class district, replacing cities × RIVAL_GPP_RATE
        (constant now unused; claim mechanics unchanged: zero-on-claim, no
        effects, rivals-first). Rivals accrue 0 GPP until their first
        Campus/HS/CH completes (~t70+), so the player wins the early Great
        People uncontested; baselines unchanged within CI (108.7/154.9) —
        the effect is in claim turns, not score means. battery.py now
        always surfaces eval baselines. Earlier: **B4a + B4b-1 + B4b-2**. B4b-2: rival
        BUILDINGS — picker queues the cheapest available (catalog-order
        ties) under the rival's own tech/civic unlocks, required district
        COMPLETE (single-slot queues can't wait like the player's
        multi-item queue), prereq chains, Water Mill river gate (new
        per-tile `riv` plane); completions land in rc_bldg and their
        def.yields join the streams (exported catalog has no
        regional/SHIPYARD/worship scope, so the plain sum IS
        cityBuildingYields). Trace gains rNBldg + rQCost now reads
        building costs from the catalog (the one "mismatch" this stage
        was a TRACE false positive — both engines queued the same
        Monument; the trace column just couldn't price building items).
        One CUDA catch: the yields matmul read a CPU rules tensor — CPU
        parity green, evals crashed; the battery's eval lane is what
        covers device placement. Baselines: random 108.7 ± 11.4 (HARDER
        — rival buildings compound), scripted 154.9 ± 11.5 (flat). B4c
        (GP accrual 1 + #district-buildings) remains. B4b-1: COMPLETED rival
        districts add floor(districtAdjacency) into their yield column —
        the rival cityDistrictYields under empty modifiers (adjacencyMult 1,
        no envoys, no Work Ethic); gold/faith land in columns without rival
        consumers yet; GPU recomputes adjacency LIVE per city so same-phase
        completions are seen like the TS sequential loop. Both gates green
        first battery. Baselines unchanged within CI (116.0/156.3): rival
        Campuses complete ~t60-90, so the accrued science barely moves
        100-turn aggregates — the payoff compounds at longer horizons and
        with B4b-2 buildings. Earlier: **B4a** (placement + queued completion).
        Step 1 (inert): district_complete [B,T] plane, all 11 consumers
        gated per their exact TS rule, both gates green on UNCHANGED
        fixtures (hash 878b1b03). Step 2: canPlaceDistrictIn (owner-
        qualified via {unlocks, ownsTile}), districtCostIn, shared
        SCAFFOLD_DISTRICTS in data/districts.ts; rival picker branch
        settler → district → unit (tile = best floor(districtAdjacency),
        ties lowest index; queue paves + clears improvement, completion
        flips the plane); GPU _place_district_rival + rc_qtile/rc_dist_tile
        registries. Catches this stage: (1) queued-unit count treated
        district codes as units (GPU starved its army while building);
        (2) rival districts leaked into three PLAYER-scoped checks (CS
        quest already/satisfaction, district eurekas) — owner-gated;
        (3) sibling rival centers were placeable (TS rejects via
        district='CITY_CENTER'); (4) LATENT B3a float-association bug:
        TS `sum += a + b` is sum + (a + b), GPU had (sum + a) + b — one
        ulp apart, flipped a civic completion when cost 70 landed inside
        it (seed 9079 t98). B4b next: adjacency yields into rival streams
        + rival housing; B4c: rival GP accrual from districts. Baselines
        statistically unchanged (random 116.0 ± 10.6, scripted 156.2 ±
        11.1) — placement-only, yields arrive with B4b.
  - [x] B3. Rival research COMPLETE. B3a: real trees/streams/advance
        (status below). B3b: all four consumers swapped — production
        ×(1 + nTechs/RIVAL_PROD_DIV=12), unit types gate on the rival's real
        BRONZE_WORKING/HORSEBACK_RIDING, city defense 15+pop+nTechs×3
        (exported research params) — and techLevel is DELETED (accrual,
        field, trace column, r_tech tensor). Two gate catches: (1) a
        batch-collapsed `.sum()` (no dim) in the defense read summed tech
        counts across the whole BATCH — B=1 probes were clean, only the
        B=24 harness exposed it; (2) flipped-center feature strip — player
        founding removes the removable feature (and improvement), the
        static plane didn't know, so loyalty-flipped centers over-yielded
        for their new rival owners: new per-tile `fy` plane + mutable
        `feat_stripped` mask written at player founding, subtracted before
        the center floors. Founding now also clears improvement/pillage in
        the GPU (mirroring foundCity — latent, structurally rare pre-B3).
        Fresh baselines in TRAINING.md. Prior stage notes: **B3a DONE** — RivalCiv.research
        (same shape as the player's), rival science/culture streams
        (tile+center columns + citizen 0.7/0.3), cheapest-first advance at
        RAW cost through the shared _auto_pick (table-order ties), banked
        progress with multi-completion + exhaustion drain; trace widened
        with nTechs/nCivics/techProg/civicProg (gate-checked from day one).
        techLevel STILL drives every consumer until B3b. Both gates green.
        B3b next: consumer swap (prod stand-in K≈12, unit-type tech gates,
        city defense) + techLevel deleted + calibration.
  - [x] B2. Per-city REAL production queues (settlers + units at real
        UNITS costs) replace BOTH pooled stocks, the pace/split constants,
        and the home-city RNG draw; capital-prefers-settler picker; strength
        = cities×8 + Σ fielded combat; trace ships Σ queue progress/cost.
        Buildings enter at B4 (they need B3's research). BOTH GATES GREEN
        FIRST TRY. Fresh baselines: random 106.4, scripted 156.1 — the world
        got HARDER (every city produces continuously). tune3 now stale.
        Detailed designs for B3/B4/B5: gpu/C1_B3-B5_DESIGN.md (agent-drafted,
        reconciled against B2 as built).
  - [x] B3. Rival research: real tech/civic trees — replaced r_tech (detail
        above; rival eurekas landed later — AUDIT A-3 RESOLVED).
  - [x] B4. Rival districts/buildings with real adjacency (detail above).
  - [x] B5. Rival builders + improvements; unit training on the real path
        (detail above).
  - [ ] B6. Unified GP/pantheon/belief races on the real machinery.
  - [ ] B7. Symmetric conflict: war/peace both ways (V-W1 head activates),
        loyalty flips BOTH ways, and city capture in owner terms (a captured
        city changes `civId` — absorbing V-W2 cleanly, no slot growth hack).
- [x] **C1-C = C2. Egocentric RL surface — COMPLETE** (design in
  gpu/C2_DESIGN.md; four gate-serialized stages): **C2a** (66895c9) the
  surface is seat-parametrized, seat 0 bit-preserved (seat_test twin-env
  equality); **C2b** (aa25f70 + ed10ec5 + 1822316) the controlled-rivals
  mask (scripted decisions skip, mechanics honor external writes),
  rival_masks/apply_rival_actions in the PLAYER head layout (one net
  serves every seat), seat-k obs rendered schema-invariant from the rival
  tensor family, rival_score as the per-seat reward source; the rival
  unit AI stays SCRIPTED for controlled seats until C3-prep's war verbs;
  **C2c** (d16bb52) DuelEnv — O=2 over one sim, dense|relative reward
  phases, relative EXACTLY zero-sum, dense seat-0 bit-equal to BatchEnv
  on twin worlds; **C2d** seat-swapped PPO plumbing (--seats 2, seats
  ride the batch axis; checkpoints record seats/reward_mode; CPU smoke
  green). Original spec: per-seat obs (each civ sees itself as
  seat 0), owner-parameterized masks/action routing, per-civ reward with the
  reward-phase switch built in (dense own-score for bootstrap; symmetrized
  relative score for self-play); BatchEnv gains a seat axis, O parametric.
- **C1-D = C3. Self-play trainer, staged:**
  - [~] C3a IN FLIGHT: machinery SHIPPED (--opponent ema: EMA + frozen
        pool 80/20, learner-rows-only updates); RUN 1 (dense, 30 updates)
        evaluates at **215.6 ± 11.8 — +43 over scripted (172.7)**; run 2
        (relative phase, resumed) training. Original spec:
        Seat-swapped PPO at **O=2**, plain self-play with an EMA
        opponent + a frozen-snapshot mixture (OpenAI Five's 80/20 sufficed
        before any league; Generals.io'26 confirms on one GPU) — cheap PPO
        upgrades ride along (top-advantage filtering, horizon/γ annealing).
  - [ ] **C3-prep (NEXT): the rival units head** — the c3a-2 duels proved
        the seat asymmetry dominates (seat 0 wins 88% both orderings), so
        controlled rivals need unit control before more self-play compute:
        (i) rival_unit_masks(r)/unit features over the civ's v-slots in
        slot order padded to P_MAX (the player units-head layout: move
        0-5 / attack 6-11 / hold 12 / build 13-15 with the B5b job rules
        for builders); (ii) _apply_rival_unit_actions mirroring
        _apply_unit_actions (slot order, shared-stream combat draws — off
        the parity path since controlled=∅ in gates); (iii) re-add the
        C2b-1 war/peace-AI skips for controlled rivals (correct once the
        net drives units); (iv) env: masks/unit_features/step seat-1
        routing; (v-REVISED) rival-initiated war/peace stays on the
        SCRIPTED rolls even for controlled rivals: a seat-1-only war head
        would break net-shape symmetry across seats — the right structure
        is ONE new war head for BOTH seats when V-W1 activates globally,
        with V-W2 capture giving wars a payoff. Then re-run the c3a
        ladder and require the duel metric to discriminate nets before
        C3b activation. LADDER SO FAR: c3a-1 dense 215.6; c3a-2 relative
        207.8; c3a-3 (+units head) 211.4 — family-flat on the standard
        world, seat 0 wins ~90% both orderings throughout; c3a-4 switches
        to --opponent self because EMA mode never gives seat-1 play any
        gradient (the structural cause of the persistent seat gap).
  - [ ] C3b. League when plain self-play plateaus or cycles: frozen snapshot
        pool + PFSP matchmaking + exploiters; eval protocol = head-to-head
        vs frozen refs + vs the scripted-policy civ, ranked by **α-Rank**.
  - [ ] C3c. Scale to **O=4 FFA**: α-Rank/CCE meta-solver, piKL-style
        ANCHORING of search/training toward the scripted policy or last
        checkpoint (Diplodocus's fix for mixed-motive self-play collapse),
        kingmaking telemetry (per-seat win vs score distributions), and
        Pluribus-style multi-continuation leaf evaluation once opponents
        are learned policies.

## 4. Agency verbs  (depth-of-control: give the policy the missing decisions)
Evidence says training value comes from verbs, not content breadth: the TS ~310
plateau was an action-space ceiling, and gold/faith are dead yields the policy
can only watch accumulate. Each verb lands as gated-off plumbing (mask width
unchanged while off, so existing checkpoints stay loadable), then activates
behind the off-script gate — the D5 pattern.

### §4b. Rival-seat verb parity (the FFA ladder's structural prerequisite)
Measured 2026-07: the seat decides O=4 FFAs (spread 66.3); rival chop alone
recovered a fifth (52.9, 77b8a27). The remaining slices, TS-FIRST per the
contract:

> RETRO (2026-07, AUDIT chapter A): the "scripted rivals never SPEND"
> premise below is OBSOLETE. TS rivals now bank and spend gold (A-5: one
> building purchase/civ/turn in `rivalPhase`), build world wonders (A-4),
> and run projects (A-14). VP-G1/VP-G2 need re-scoping against that shipped
> behavior — the accrual + spend already exist on the TS side, so these
> boxes are now largely a GPU-mirror + controlled-seat-mask task.

- [ ] **VP-G1 Rival gold, inert**: TS RivalCiv.treasury (??= 0 migration),
      accrued in the rival yields phase from the civ's worked gold yields
      (reuse computeRivalCityYields' tile walk — add the gold column;
      scripted rivals never SPEND, so behavior is inert-but-visible). Trace
      column (treasury per civ) so the gates check it from turn one; GPU
      r_treasury [B,R] mirrors the accrual in _rival_city_yields.
      Fixture-regenerating (new save field + trace column); baselines
      unaffected (player-side untouched).
- [ ] **VP-G2 Rival purchases (controlled seats only)**: rival_masks'
      production purchase columns (in the player layout, currently
      False-padded) go real for controlled rivals — priced off r_treasury
      at goldPurchaseMult, sequential slot walk like V-P1, executed in
      apply_rival_actions. Scripted rivals keep never-spending (gates
      untouched by construction); melee_eval re-read = the dividend.
- [ ] **VP-E1 Rival envoys**: needs rival influence accrual + CS standing
      per rival — the largest slice; design after VP-G2's dividend read.

Ordering: VP-G1 is a /port-mechanic engine round (~half a session); VP-G2
rides the C2 surface (mask + applier only). Expected combined dividend: the
ladder's economy component; spawn asymmetry stays (world-gen, accepted).

- [x] **V-P1** Gold purchases, plumbed + gated OFF: production head grows
      NB+1+NU purchase columns (buy building / settler / unit at
      goldPurchaseMult× cost, mirroring purchaseBuilding/purchaseSettler/
      purchaseUnit) behind `_rl_purchase_active=False`. Sequential slot walk for
      the order-coupled parts (settler prices, shared treasury). Self-test
      `gpu/purchase_test.py`; both gates green.
- [x] **V-P2** Purchases ACTIVE off-script: flag flipped (mask 26→46),
      replay-gpu.ts dispatches purchase codes as soft-fail no-ops (both
      engines re-validate at execution). Gate coverage: 158 purchases across
      69/72 games. Caught + fixed a LATENT rival-economy bug (see status log:
      rival-worked mine production). Both gates + tsc green.
- [x] **V-W1** Player-initiated war/peace (declare on a rival; peace-for-gold
      mirroring the TS deal), plumbed + gated OFF: a NEW `war` head
      (`war_mask()` [B,2R], `step(war=…)`), not wired into BatchEnv until
      activation. Self-test `gpu/war_test.py`; both gates green.
- [x] **V-W2** City capture: player melee vs rival city centers
      (attackCity/captureRivalCity semantics), gated. DESIGN CONSTRAINT
      (recorded at C3-prep): capture INTO the player breaks the static
      player-city-slot assumption (C sites are pre-planned) — the clean
      landing is the §3 owner-dimension note at line ~472 (captured city
      changes civId on the RIVAL side of the tensors, i.e. capture-as-
      civ-transfer between rc pools first: player-capture = transfer to a
      reserved player-civ rc pool, rendered into obs; true player-slot
      absorption comes with the [B,O,C] unification). Needs its own
      design round + war-head symmetry (see C3-prep v-REVISED).
- [x] **V-R** Ranged attacks ACTIVE: `rangedStrength/rangedRange` exported;
      ranged units execute codes 6-11 as rangedAttack (one roll, no
      retaliation, no advance, no camp clear; range-1 targets — legal for
      rng-1 and rng-2 alike). Mask unchanged; replay dispatches by unit type
      via rollout.json's `rangedActive`. Self-test `gpu/ranged_test.py`;
      both gates + tsc green.

## Status log
- stage 0: plan committed (durable across rollbacks). Baseline `5a6f2b6`:
  districts absent from GPU scope (scripted export builds none), so D1 is inert.
- D1 [x]: district catalog (10 defs — cost/adjYield/adjacency-src/housing/
  placement flags) exported; engine loads it inert + a [B,T] district tensor
  (-1=none) in _MUTABLE (resets). Self-test green (Campus science/54, CH river+2
  gold, Harbor coastal); both gates stay green. Next: D2 — scripted Campus
  placement + static (terrain-based) adjacency yield, gate-verified.
- D2a [x]: raw static-source adjacency table [B,T,10] exported + loaded inert.
  In-exporter self-check passed on all 24 maps (floor(static)==districtAdjacency
  wherever no dynamic source is live; the just-founded city center is skipped).
  Campus static max 6.0; both gates green. Next: D2b — Campus placement + the
  floored (static + live center/district) adjacency yield into city totals.
- D2b DESIGN (studied; implement next turn — kept here so a rollback can't lose
  it). Scope kept tractable by placing the Campus where dynamic adjacency = 0,
  so the yield is PURELY static (D2a already proved floor(static)==
  districtAdjacency there); dynamic sources (adjacent district/center/mine) are
  D3.
  * Placement rule (BOTH engines, deterministic, instant-place a COMPLETE
    Campus once): trigger when the capital has WRITING (CAMPUS unlock) and a
    valid tile exists and no Campus yet (maxSpecialtyDistricts(pop)=floor((pop-1)
    /3)+1 >= 1 is always true). Candidate tiles = owned by the capital, within
    work radius 3, workable (static `st`), NOT the center, NOT adjacent to ANY
    city center (this zeroes the DISTRICT/CITY_CENTER dynamic source → pure
    static yield), land/non-district/non-wonder. Pick MAX floor(static Campus
    adjacency) [= floor(d_static_adj[tile,0]) in GPU, = districtAdjacency in TS],
    ties to LOWEST tile index. If none qualifies, place nothing.
  * TS exporter (scripts/export-gpu.ts turn loop, after the per-city production
    block ~line 642): tile.district='CAMPUS'; tile.districtComplete=true;
    capital.districts.push({type:'CAMPUS',tileIndex}); mark campusPlaced. Export
    campusUnlockTech = techList index of WRITING (the CAMPUS unlockDistrict) and
    campusIdx=0.
  * GPU engine: mirror the SAME trigger+tile choice and set self.district[b,tile]
    =0 (place BEFORE that turn's city-yield computation, matching TS ordering).
    (1) PAVING: in _city_totals cand mask (line ~901) add
    `& (self.district.gather(1,tcf).reshape(B,C,M) < 0)` so district tiles are
    never worked (mirrors workableTiles `!t.district`). (2) YIELD: for each
    owned tile with district==0 (Campus), add floor(d_static_adj[b,tile,0]) to
    the city's SCIENCE column (idx 3) in the total — compute over the same 37-
    tile work window. Bump _eff_version on placement if needed.
  * Canary: nudge the Campus static adjacency (+1) → gate must break.
  * Iterate: first mismatch → parity_test HEAD column → the likely suspects are
    the tile-choice tie-break, the citizen reassignment after paving, and place
    timing (same turn in both). Then D3 relaxes placement + adds dynamic sources.
- D2b-machinery [x]: _city_totals now excludes district tiles from citizen
  candidates (paving, mirrors workableTiles !t.district) and adds
  floor(d_static_adj[·,CAMPUS]) science for owned Campus tiles BEFORE the
  amenity multiplier (mirrors cityDistrictYields); exporter ships the `du`
  district-placeable land mask + campusUnlockTech(WRITING)/campusIdx; engine
  loads d_usable/campus_unlock_tech/campus_placed(unused yet)/CAMPUS. Inert
  (nothing places a Campus) → both gates green; poke-test: a poked Campus
  (floor adj 2) lifts capital science 3.57→5.67. Next: D2b-activate (scripted
  instant-place on the best non-center-adjacent tile; mirror the choice; gate).
- D2b-activate [~] IMPLEMENTED BUT GATED OFF (SCRIPTED_CAMPUS=false → district
  Scaffold.active=0 → engine _campus_active=False → no Campus placed → both
  gates green). The placement MIRROR WORKS (verified this turn: TS exporter +
  GPU pick the identical tile), and two real bugs were found and FIXED (correct,
  currently inert):
  * District maintenance — a completed Campus costs 1 gold/turn
    (districtMaintenance); added to _city_totals maintenance. (Symptom: GPU
    treasury +1 gold/turn, score +1; seed 9079 t51.)
  * kind:'district' eurekas/inspirations (STATE_WORKFORCE "build any specialty
    district", MATHEMATICS 3, per-type ones) — exported (non-distinct) + detected
    in _detect_boosts from self.district counts. (Symptom: civics diverged.)
  REMAINING BLOCKER: building a district flips the city-state buildDistrict
  quest's `!already` check (cityStates.ts issueQuest ~ln 216-219) → removes
  buildDistrict from the quest options once the player has that district →
  changes the quest-selection nextRandom → diverges the whole CS quest/envoy RNG
  stream (envoys/quest/culture/units cascade, seeds 9014/9066 t56-58). The GPU
  stubs district quests as never-satisfiable and draws-then-discards the district
  pick (engine ~ln 1668-1701). NEXT (D2b-activate rd 2): record the drawn
  district, model the `!already` option-removal so the quest RNG matches, satisfy
  the quest on district completion (+envoy); then flip SCRIPTED_CAMPUS=true, gate.
- D2b-activate [x] DONE — SCRIPTED_CAMPUS=true, a Campus is placed live per game
  (seed 9079 by t53). Round-2 fixes: (1) CS buildDistrict-quest mirror — record
  draw1's district in cs_quest_district, drop buildDistrict from the option count
  when draw1==CAMPUS & the player owns one (quest-pick RNG now matches), and
  satisfy a CAMPUS district quest (+envoy). (2) scripted builder excludes district
  tiles from its farm-job mask + build check (a district paves the tile;
  validImprovements returns [] there) — fixed seed 9066 (builder had mis-targeted
  the Campus tile → +1 unit, −1 farm). Both gates green (scripted 24 seeds with
  Campuses, off-script 72 games); canary (Campus science +1) fails at seed 9079
  t53. **D2 (Campus economy) COMPLETE.** Next: D3 — relax placement + add the
  dynamic adjacency sources (adjacent district/center/mine/wonder) and the other
  district types (Holy Site, Commercial Hub, Industrial Zone, Harbor…).
- D3a [x]: Campus adjacency is now floor(static + 0.5*adjacent completed
  districts). A shared _adj_district_count() helper counts player centers
  (center_at), player specialty districts (self.district) AND rival centers
  (rvcity_at — rivals set tile.district='CITY_CENTER' in TS and matchesAdjacency
  has no owner filter). Dropped the "no adjacent district" placement restriction
  from both the exporter scan and the engine elig; both now score by the full
  floor(static+dynamic), so a Campus may sit beside the center for +0.5. Both
  gates green (scripted 24 seeds, off-script 72 games); canary (dyn amount
  0.5→1.0) fails at seed 9014 t63. Next: D3b — the other adjacency district types.
- D3b-2 [x]: scripted placement is now a scaffold LIST — engine _scaffold=
  [(Campus,WRITING),(HolySite,ASTROLOGY)] + dscaffold_placed[B,n]; places each
  in order when unlocked and the per-pop cap floor((pop-1)/3)+1 allows, on its
  best floor(static+0.5*adj) tile. Coverage: Campus 22/24, Holy Site 24/24
  games. Both gates green FIRST TRY — D3b-1's generalized yield/maintenance/
  CS-quest handled Holy Site with no extra work. Next: D3b-3 Commercial Hub.
- D3 [x] COMPLETE (reachable districts): Campus/Holy Site/Commercial Hub place
  and yield under full parity (dynamic adjacency, per-pop cap, maintenance,
  eurekas, CS quests). Reachability check (100-turn scripted, 24 seeds):
  capital pop max 9 / median 5; 0/24 reach the 4th specialty slot (pop>=10);
  APPRENTICESHIP never researched. So IZ/Theater/Harbor are DEFERRED as
  unexercised. Next: D4 (district buildings + specialists), which unlock with
  their districts (Library/WRITING, Shrine/ASTROLOGY, Market/CURRENCY) so they
  ARE covered; then D5 (RL district action) to enable a district-capable retrain.
- D4 [x]: buildable set extended past the City Center. _buildable now gates each
  building on tech-unlock + (for district buildings) the city owning a completed
  district of that type (reqDistrict via a per-city has-district onehot) + a
  prerequisite building (requiresAny → _b_has_reqs). Exporter tags each building
  with reqDistrict/reqBuildings; cheapestBuilding filters to the exported set.
  Specialists NOT modeled (effectiveSpecialists reads city.specialists, a manual
  setting the scripted policy never touches → all citizens work tiles). Both
  gates green; canary (if False on the gate → GPU builds an ungated Library,
  bldgs0 TS 3 vs GPU 4 + cascade) bites. Coverage thin (Library 1/24, Shrine
  2/24 — buildings compete on cost) but non-vacuous. Next: D5.
- D5a [x]: gated-off plumbing for the RL district action (behind
  _rl_district_active=False → inert). Extracted the scaffold's placement into a
  shared _place_district_capital(di, want) (eligibility: owned, district-usable,
  empty, radius<=3, not the center; rank floor(static+0.5*adjacent-completed),
  ties to lowest tile index); refactored the scripted scaffold to call it
  (behaviour-preserving). Widened production_mask 21→24 (NB=12,NU=7,+3 scaffold);
  the district columns are capital-only and gate on has_tech & under the
  per-pop specialty cap & an empty placeable tile exists & one-per-type, but are
  all-False until the flip. Added the matching RL apply block in step()'s
  production branch (district codes sit above the unit range at NB+2+NU+si;
  placement is instant/free and leaves the build slot idle). Inert by
  construction: masked_choice's argmax over valid entries ignores trailing
  all-False columns and never consumes mulberry32, so rollout logs the identical
  trace and the GPU never emits a district code (replay-gpu.ts untouched). Both
  gates green (scripted 24×100, off-script 72×100); inertness self-test confirms
  the widened mask's district columns are all-False. Next: D5b (flip it on + teach
  replay-gpu.ts the district action + iterate the off-script gate, then retrain).
- D5b [x] COMPLETE: `_rl_district_active=True`; districts are a live off-script
  action (51 placements across 45/72 games). replay-gpu.ts places the same tile
  on the TS side (canPlaceDistrict + best floor(districtAdjacency), ties lowest
  index) and leaves the slot idle; rollout.py exports the scaffold id map. The
  gate surfaced 5 latent bugs, each vacuous until off-script districts existed,
  all fixed by mirroring TS: (1) builders could improve a district tile —
  unit_action_mask + build execution now gate `& district<0`; (2) Temple &c are
  civic-unlocked, not tech — exporter emits unlockCivic, _buildable ANDs a civic
  gate; (3) Commercial-Hub buildings (Market/Bank/Stock Exchange) are upkeep-free
  — exporter maintenance formula special-cases them to 0; (4) CS per-district
  envoy bonus (≥3/≥6 envoys → +2 to each district of the CS's type) — exported
  typeDistrictIdx/districtBonus, engine sums cs_dbonus into the district-yield
  loop; (5) player great people — Campus/Holy Site/Commercial Hub accrue
  Scientist/Merchant/Prophet points (1 + district buildings), earned from the
  SAME gp_earned pool the rival race drains (rivals first in rivalPhase, player
  after research — GPU order already matches), effects science→tech / gold→
  treasury / culture→civic / prod→capital. Reachability: 45/72 games place a
  district; the great-people fix is bit by seed 9196 (earns Aryabhata @t64, +50
  science) which else lagged a tech at t83. Both gates green FIRST-TRY after the
  5th fix. D5 DONE — the RL action space now includes districts; retrain next.
- Note on scope honesty: IZ/Theater/Harbor/Encampment districts and their great-
  people classes (Engineer/Artist/Admiral/General) remain unplaceable, so their
  accrual/effects are structurally inert (0 points → never earned) — modeled
  generically but never exercised, like the deferred district yields. D6
  (Aqueduct/Neighborhood housing, Harbor coastal, Encampment) is still pending.
- D5c [x] ANY-CITY district placement — DONE + LIVE (`_rl_any_city=True`, both
  gates green). Non-capital cities place districts too (mask/apply loop over all
  slots in slot order, recomputing adjacency each placement to match the replay's
  sequential act.p loop; replay dropped its is-capital guard). Coverage 51/45 games
  → 89/54 (37 placements in non-capital slots 1-3). Three latent bugs fixed to get
  here, each exposed only by non-capital districts:
  (1) FOUNDING-FEATURE — foundCity (game.ts:168) clears the center tile's removable
  feature (woods/rainforest/reef), dropping the DISTRICT adjacency it lent to
  neighbours; the GPU's d_static_adj is baked post-capital-founding, so a non-capital
  founding must subtract that live. Exporter emits per-tile `fadj` [T,nD]; the
  founding loop subtracts it from each neighbour's d_static_adj (now in _MUTABLE,
  _eff_version bumped).
  (2) RIVAL-DISTRICT PAVING — a loyalty flip hands a rival a player's district
  tile (rival_at set on the flipped city's tiles, self.district kept). TS's
  rivalCityYields sees tileYields=0 there (a district paves the tile), but the GPU
  paved only center_at/rvcity_at, so it credited the flipped Holy Site full
  food/prod and picked it into the rival's top-pop tiles (seed 9027 t100: rival-1
  prodStock +0.615). Added `| (self.district>=0)` to the rival-yield paved mask.
  (3) (the slot-order placement + adjacency recompute, so two cities founding near
  each other resolve districts in the same order as the replay.)
  Both gates green (scripted 24×100, off-script 72×100). D5 fully complete —
  the RL policy can place districts in ANY city under parity.
- M1 [x] single-agent search (score lever). Two eval-only primitives on BatchSim,
  neither touched by the parity gates: (a) `snapshot()`/`restore()` clone every
  `_MUTABLE` tensor (incl. `rng_state`) + the turn counter and copy_ them back,
  bumping `_eff_version` so the derived caches recompute; (b) `search_production`
  (gpu/civ6gpu/mcts.py) — exhaustive 1-ply over one city's production head: commit
  each legal action (others idle, then tech/civic/units/production scripted), roll
  out `horizon` scripted turns, read empire_score, restore; argmax over the actions.
  Chose exhaustive over the planned PUCT bandit because the scripted forward model is
  DETERMINISTIC (its only randomness is `rng_state`, which snapshot/restore round-
  trips), so a single rollout per action is that action's exact value — nothing to
  sample. A naive flat PUCT is not just redundant but WRONG here: Q is the raw empire
  score (~60–180) while the exploration bonus is ~1–2, so once the first action scores
  it dominates PUCT forever and the bandit never visits the rest (observed: 6 of 7
  candidates left at 0 visits, best mis-picked). Real PUCT (net priors + value +
  Q-normalization + RNG chance nodes) is deferred to M2 where leaves become expensive
  and stochastic. `gpu/mcts_test.py` (new, follows the parity_test.py convention):
  snapshot/restore bit-exact across 104 tensors + step-after-restore deterministic;
  search deterministic, leaves state bit-identical, and its horizon-15 pick is >=
  the greedy (horizon-0) pick on all 12 seeds — strictly better on 9, where it
  favours a SETTLER/second-city line that out-compounds the myopic building over 15
  turns. Both parity gates stay green (additive engine change; forward model
  untouched). Next: M2.
- M2 scoped against reality: M2 as written wants a TRAINED net (policy prior + value
  head) and to "eval vs the 213.6 policy", but there is NO checkpoint in the repo —
  213.6 is a documented past overnight RTX-4070 result (14-action farms-only, see
  README/TRAINING), not a saved net, and a fresh run needs a GPU (this container is
  CPU). So M2 splits: M2b (net wiring) is BLOCKED on Phase B (training infra + a GPU
  run); M2a is the net-free planning lever I can build and verify here now.
- M2a [x] net-free closed-loop planning (mcts.py, pure additions — no engine change).
  Two levers over M1's open-loop 1-ply: (1) DEPTH — `plan_value`/`plan_production`
  make the rollout leaf assume `city` keeps PLANNING (to `depth`) at its future
  decisions rather than reverting to scripted, so depth>1 can value setup moves that
  only pay off past the next decision; depth=1 reduces exactly to M1. (2) CLOSED LOOP
  — `mpc_play` re-runs the search at EVERY decision of the actual game (model-
  predictive control), so the per-decision edge compounds and the plan adapts to the
  realized disaster/barb RNG. All search stays eval-only (snapshot/restore round-
  trips; the game itself advances only through legal production actions already
  covered by the D5/D6 off-script gate). Measured: closed-loop depth-1 vs the scripted
  base policy over 60-turn games (horizon 20) — final empire_score beats scripted on
  5/6 seeds (+61.5/+26.3/+35.8/+13.1/+30.5, one tie, never worse), ~14 s/game on CPU
  (search fires only at the ~10 decision turns, not every turn). `gpu/mcts_test.py`
  extended: plan_production deterministic + eval-only (incl. one depth-2 node), and
  mpc-d1 >= scripted on all sampled seeds / strictly better on the majority. Both
  parity gates unaffected (mcts.py isn't imported by the gates) and re-verified green.
  depth>=2 full games are too slow on CPU (~7x/level; the B=1 float64 step is ~20 ms)
  so depth is a parameter, exercised at a single node, not run game-length here. Next:
  either Phase B (unblock M2b's net) or C1 (net-free symmetric-rival refactor).
- Phase-B bring-up [x]: train_ppo.py runs and LEARNS on the district-capable engine as
  is (no code change needed). A CPU run (batch 48, horizon 60, 62 updates, ~360
  steps/s, ~8 min) climbed episode-mean empire_score 85→135 (best 138.1, max ~213),
  entropy 4.2→0.6 — a clean learning curve. So the RL pipeline is intact on the wider
  (district/unit) action space; a strong net still wants a GPU overnight run, but a
  usable net is trainable here. Checkpoint gitignored under gpu/runs/.
- M2b-1 [x]: net wired into the search + benchmark (search_eval.py gains --policy
  net|netsearch and a uniform --dtype; mcts.py stays net-free, engine untouched).
  `net` = the policy head drives the capital greedily; `netsearch` = the M2a search
  with the net's VALUE head as the 1-ply leaf (no rollout). Benchmarked against
  scripted on MATCHED float32 worlds (5 games x 100 turns, capital-production surface,
  everything else scripted — the scripted baseline is identical across runs, so the
  four columns are one table):
      seed     scripted    net    search   netsearch
      9001       137.4    242.0    256.3     220.9
      9014        75.0    178.5     90.2     174.5
      9027        77.8    166.8    132.2     164.8
      9040       136.5    210.8    217.9     188.2
      9053        94.5     63.4     63.4      61.3
      mean       104.2    172.3    152.0     161.9   (gain +68 / +48 / +58, all 4/5)
      s/game       ~1       ~2     28-58      3-7
  Takeaways: (1) both the trained net and net-free rollout search crush the scripted
  base policy — RL trains cleanly on the district engine and search is a real lever.
  (2) net vs search is per-world complementary (search wins 9001/9040, net wins
  9014/9027) and statistically tied at n=5 (CIs ±59/±72). (3) netsearch — the net's
  value head as a 1-ply search leaf — beats rollout search on the mean at ~8x the
  speed, so the value head is a good cheap rollout replacement (the M3 lever: net
  value at the leaves buys depth within budget). (4) on 9053 ALL THREE (net 63.4,
  search 63.4, netsearch 61.3) converge BELOW scripted (94.5): a shared blind spot
  across the policy head, the rollout, AND the value head — a genuine objective/world
  quirk (all misvalue the capital's expansion there), not a single-method artifact,
  worth probing. Caveats: the net is used OUT OF DISTRIBUTION (trained to drive all 5
  heads, here it only picks the capital's production, scripted elsewhere); n=5 is a
  small, high-variance sample; float32 vs float64 trajectories diverge over 100 turns
  so search_eval fixes one --dtype (float32, the net's) across a comparison. Both
  parity gates unaffected (search_eval/train_ppo aren't imported by them; engine
  untouched). Next: M2b-2 (full 5-head Gumbel/PUCT search, wants a stronger/GPU net)
  or C1 (net-free symmetric-rival refactor toward self-play).
- M2a empire extension [x]: the search now controls EVERY city's production, not just
  the capital (mcts.py `mpc_play_empire`; search_eval.py `--all-cities` for search|net).
  Each turn every pending city is searched INDEPENDENTLY from the shared pre-decision
  state (plan_production self-restores, so all cities see the same base) and the picks
  commit together in one step — production actions never collide (each city places only
  on tiles it owns) and the per-turn re-plan corrects the independence approximation.
  Benchmark (4 games x 60 turns, matched float32, net-free): capital-only search 99.5
  (+24.7 over scripted, 3/4) → empire-wide 107.3 (+32.5, 4/4). The extra gain
  concentrates where non-capital cities have real production choices (seed9001
  125.8→154.8, +29) and is ~neutral where they don't (9027/9040 within 0.2); it also
  turns seed9014's capital-only tie into a small win. Cost scales with city count — one
  6-city late game took 246 s for a single 60-turn game — so it is opt-in (--all-cities).
  mcts_test.py adds an empire determinism + >=scripted check (green). No engine change;
  parity gates unaffected. The single-agent PRODUCTION search is now empire-complete;
  remaining search levers (tech/civic/unit heads, deeper trees) and the net-guided
  M2b-2 are GPU/effort-gated. Next: C1 (net-free symmetric-rival refactor → self-play)
  is the highest-value CPU-reachable direction.
- Search arm capstone [x]: `gpu/SEARCH.md` documents the primitives (snapshot/restore,
  1-ply/closed-loop/empire search), the tools (mcts_test.py, search_eval.py), the
  benchmark table, and the reproduction commands. Includes the seed9053 investigation:
  it is NOT a bug — the search led the whole game (95.9 @ t90, 4 cities from aggressive
  SETTLERs) then lost 2 cities in the last 30 turns (→63.4) because it controls only
  production, not military, so its undefended expansion is razed/flipped in a hostile
  world (scripted stays at 2 cities and wins 94.5). Same instinct sinks the net there.
  VERIFIED mechanism (corrected): the lost cities were at FULL HP — they LOYALTY-FLIPPED
  (loyalty decayed to 0 under rival pressure ~40 turns after founding), not razed. So the
  fix is loyalty-shaped (longer horizon / amenity-aware empire production / expansion
  restraint), NOT unit/military control. Doc-only; no code/parity impact.
- C1 scoping [x] (investigation, no code change): mapped the rival-vs-player asymmetry
  to size the "symmetric rivals" refactor honestly.
  * PLAYER state is full: per-city pop / production queue (`current`,`cur_cost`) /
    districts (`district[B,T]`) / buildings / food+culture boxes; techs bitmask +
    `tech_prog`; civics + `civic_prog`; treasury; government; per-slot units
    (position/hp/movement); envoys; great-people points.
  * RIVAL state is a reduced heuristic (engine.py `_rival_phase` ~2513, src/core/
    rivals.ts): `rival_at`/`rvcity_at` (tile + center ownership), a population scalar
    per rival city, a rival-wide `militaryStock`, scalar tech/prod progression, and
    heuristic behaviour (economy → border expand → found → spawn units → war/peace).
    NO production queue, districts, buildings, tech/civic trees, government, envoys or GP.
  * Therefore C1 = replicate the ENTIRE player subsystem across an owner dimension in
    BOTH engines. The blocker is "keep TS parity": promoting rivals in the GPU alone
    diverges from TS; promoting them in TS too changes every rival's behaviour, so all
    24+72 parity fixtures change — it is a two-engine RE-ARCHITECTURE, not a refactor,
    and its only payoff (self-play) needs a GPU training run C2/C3 later add. Verdict:
    C1 is a poor fit for autonomous CPU work on a rollback-prone box — it wants a
    deliberate, GPU-backed effort. Interim option if self-play is wanted sooner: a
    separate SYMMETRIC mini-env (owner-indexed from the start) rather than promoting
    the full-fidelity engine. This is a phase boundary worth a human decision, not
    filler; the single-agent search arm (M1–M2b-1 + empire + SEARCH.md) is complete.
- Loyalty-aware search [x]: fixes the seed9053 over-expansion class (verified as LOYALTY
  flips, not razes). Threaded a `value_fn` through plan_value/plan_production/mpc_play/
  mpc_play_empire (defaults to raw empire_score — backward-compatible, mcts_test green)
  and added `loyalty_shaped_value(penalty, thresh)`: it discounts the leaf by each own
  city's loyalty erosion visible AT the horizon (`penalty` per point below `thresh`).
  The doomed city's full flip lands ~40–60 turns out, past the 20-turn rollout, but its
  erosion is already ~13 pts by horizon-20, so `penalty=2` (≈26) outweighs the settler's
  score gain and curbs the over-expansion. Measured (capital search, 100 turns): seed9053
  63.4 → 89.0 (+25.6, ≈ scripted 94.5); near-free where safe (seed9001 −1.5/256, seed9014
  ±0 — healthy cities hold loyalty ~100 so incur ~no penalty). `search_eval.py --loyalty-
  aware [--loyalty-penalty]`; mcts_test asserts shaped ≤ empire value + deterministic +
  eval-only. Same value_fn hook `netsearch` uses. No engine change; parity gates unaffected.
- LOCAL/GPU [x]: session teleported (`--teleport`) from the 4-vCPU cloud box to local
  hardware (Ryzen 9 3900X 24-thread, 32 GB, RTX 4070 SUPER 12 GB, torch 2.12.1+cu132).
  train_ppo.py runs on CUDA unchanged. Throughput: the engine is launch-bound at small
  batch (GPU ≈ CPU at B≤128) but scales — ~2020 steps/s @ B=1024, ~5760 @ B=4096 (~15× the
  cloud CPU), <1 GB of 12 GB VRAM. A 40M-step run is now ~2 h. B=1 searches stay CPU (launch-
  bound) but fan out across 24 cores. So the GPU-gated roadmap (strong net, self-play) is
  unblocked locally; the old 213.6 was a past RTX-4070 result on a simpler 14-action engine.
- M2b-2 [x] net-guided search over the full 5-head tuple (search_eval.py; mcts.py stays
  net-free). `netgreedy` = the trained net drives production/tech/civic/units/envoy greedily;
  `tuplesearch` = draw the greedy tuple + k−1 tuples sampled from the net's factored policy
  (net = prior), score each by the net value head (--tuple-leaf net) or a scripted rollout
  (--tuple-leaf rollout), play the best. Seeded per game (reproducible; verified). Trained a
  quick net on GPU (25 updates B=4096, ~15 min → 135.6 mean, entropy 0.67) and benchmarked on
  6 matched worlds x 100 turns:
      seed    scripted   netgreedy   tuplesearch(net,k8)
      9001      146.0      257.3        275.9   (+18.6 vs greedy)
      9014       84.5      165.0        156.5
      9027      109.8      126.0        148.7   (+22.7)
      9040      136.5      126.5        100.5   (−26.0)
      9053       93.5       68.5         62.9   (loyalty over-expansion — both fail)
      9066      190.3      246.5        234.9
      mean      126.7      165.0        163.2   (+38 / +37 vs scripted; both 4/6)
  Findings: (1) the full net policy strongly beats scripted (+38) — RL trains well on the
  district/unit engine. (2) net-value-leaf tuplesearch only TIES greedy (163 vs 165; 2 wins
  4 losses head-to-head): searching against a mid-strength net's value head amplifies its
  ranking errors as often as it helps — the standard "search is only as good as its value
  function". (3) both net and net-search inherit the loyalty over-expansion weakness (9053).
  (4) `--tuple-leaf rollout` is reliable but ~25×+ slower and its scripted continuation is a
  policy mismatch. Conclusion: the machinery works; net-guided search needs a STRONG net
  (accurate value + sharp policy) to beat greedy — now a ~2 h GPU job. Next: train a strong
  net, re-run tuplesearch (expect it to pull ahead), then M3 / C1. No engine change; parity
  gates unaffected (search_eval/train_ppo aren't imported by them).
- V-P1 [x] gold purchases, plumbed + gated OFF (`_rl_purchase_active=False`). The
  production head learns NB+1+NU new codes above the district range — buy building j /
  a settler / unit u outright at goldPurchaseMult× production cost (exported from
  GOLD_PURCHASE_MULT; engine defaults 4 for older fixtures) — mirroring
  purchaseBuilding/purchaseSettler/purchaseUnit: buildings need `_buildable` (==
  availableBuildings ∧ buildingCompletable at a pending decision, since the queue is
  empty and GPU districts are complete-on-place), units need trainableUnits + a free
  spawn tile (TS refunds when spawnUnit fails → no-op here, no deduction), settlers pay
  settlerCost×mult and bump state.settlers immediately. Order-coupling mirrored by a
  sequential slot walk (`_apply_settlers_and_purchases`): queued OR bought settlers
  raise later slots' prices and purchases drain the shared treasury in slot order,
  exactly like the replay's act.p loop; the gated-off path keeps the vectorized
  prefix-sum settler block byte-identical (building/unit assignments never write the
  SETTLER code, so splitting them out is provably behavior-preserving). While OFF the
  mask KEEPS its 26-column width (unlike D5a's all-False columns) so tune1-era
  checkpoints stay loadable for the pending benchmarks; ON widens 26→46.
  `gpu/purchase_test.py`: gated-off inertness is bit-exact (a purchase code == IDLE
  across all _MUTABLE), width 26/46, building purchase instant + slot idle + exact
  gold delta (incl. the same-turn upkeep a TS purchase also pays), unit spawn + tech
  gate, and two same-turn settler buys pricing sequentially (440 then 560). Both gates
  green (scripted 24×100, off-script 72×100); tsc green. Purchased-settler founding
  and treasury timing are exercised by the self-test, not the gates, until V-P2 flips
  the flag — the replay-side purchase dispatch is V-P2 scope. tune1 finished meanwhile
  (30/30 updates, train mean 209.9, best 210.9): benchmarks next, THEN V-P2.
- V-W1 [x] player war/peace, plumbed + gated OFF (`_rl_war_active=False`). A NEW
  diplomacy head rather than production codes: `war_mask()` [B, 2R] (cols 0..R-1
  declareWar — rival alive & not at war, free, no RNG; cols R..2R-1 sueForPeace —
  at war ≥ peaceMinWarTurns(8) & treasury ≥ peaceGold0(150) + peaceGoldSlope(10)·
  warTurns, params exported from PEACE_MIN_WAR_TURNS / PEACE_GOLD_COST) and a
  `step(war=[B])` arg applied FIRST in the turn (before unit orders, so a same-turn
  declaration legalizes attacks at execution; the pre-step masks the policy sampled
  simply lag one turn — execution revalidation keeps both engines identical). Peace
  clears atWar/warTurns/peaceTurns exactly like makePeace, so the rival redeclare
  gate (peaceturns > 20) applies automatically; the war-roll RNG stream shifts
  identically in both engines because it is state-driven (skipped when already at
  war), preserving draw-for-draw parity. Gated-off: mask all-False, step(war=…)
  ignored — `gpu/war_test.py` proves a war code is a bit-exact no-op across all
  _MUTABLE, and proves the ACTIVE transitions equal hand-poked declareWar/
  sueForPeace + a plain step (bit-identical over every tensor — the strongest
  equivalence, immune to same-turn rival-phase confounds; peace cost 240 at
  warTurns 9 on seed9001). The head is NOT in BatchEnv.masks()/train_ppo yet —
  wiring + replay dispatch (act.w) land at activation with the V-P2-style retrain.
  Both gates green (rollout summary bit-identical to pre-change: 43.8/115.2/224.8);
  tsc green.
- V-P2 [x] purchases ACTIVE + a latent rival-economy bug caught by the gate.
  `_rl_purchase_active=True` (production head 26→46), replay-gpu.ts dispatches
  `a >= NB+2+NU+nScaffold` to purchaseBuilding/purchaseSettler/purchaseUnit as
  SOFT-FAIL no-ops (the district branch is now bounded above; both engines
  re-validate at execution: slot-order treasury drain, spawn-tile refund), and
  the off-script gate runs 158 purchases (4 buildings / 1 settler / 153 units,
  69/72 games — units dominate because they're cheapest vs a mostly-thin
  treasury; buildings/settlers are deterministically covered by
  purchase_test.py). FIRST RUN FAILED — seed9001 t88 col32 (rival prodStock,
  TS 38.782 vs GPU 38.235) — and the diagnosis is a textbook family-2 latent
  bug, invisible until purchases put player improvements in rival reach:
  **rival-worked tiles missed improvement BASE production**. TS rivalCityYields
  calls tileYields with defaultModifiers(), so a rival working a player-built
  MINE/LUMBER_MILL gets its base +1⚙ (but NOT the player's Apprenticeship/
  Industrialization boosts — those ride ctx.mods); the GPU read the raw static
  production plane (a pre-6b comment still said "production is static").
  Repro: the purchased t32 BUILDER's mine landed where rival 0's t87 FOUNDING
  (city4, tile 907) claimed it; the first worked-turn accrual differed by
  1⚙ × techmult(1.876) × prodToSettler × pace = 0.547. Fix: `_neutral_prod()`
  — improvement base production, pillage-suspended, NO tech boosts, cached per
  _eff_version (reset/restore clear it) — used by _rival_city_yields; the
  player path keeps the boosted `_eff_prod()`. The farm FOOD side was already
  correct (`_eff_food` is modifier-free, matching defaultModifiers). Note the
  gate's rollout summary is unchanged (45.0/115.7/244.6) — the fix moves rival
  prodStock accounting, not the action stream, on these seeds; the trace
  comparator is what caught it. Both gates green after the fix (scripted
  24×100, off-script 72×100); tsc green; purchase/war/mcts self-tests green.
  RETRAIN NOTE: tune1 and every older checkpoint are 26-column nets — they no
  longer load against the live mask; flip `_rl_purchase_active=False` to
  benchmark them, or retrain (next: a tune2 on the 46-action head).
- V-R [x] ranged strikes ACTIVE (`_rl_ranged_active=True`). The exporter ships the
  previously-dropped `ranged` field (Slinger 15/1, Archer 25/2 → rangedStrength/
  rangedRange; engine `_p_rng_str`, torch.long — the damage table indexes by the
  strength diff). Execution of attack codes 6-11 splits by unit type: ranged units
  run the rangedAttack mirror — ONE damage roll vs (defender combat + terrain
  defense), no retaliation, no advance, no camp clear, attacker never moves — and
  melee units keep the proven path byte-identically. The action MASK is unchanged
  (same adjacent-hostile legality), so no checkpoint-width impact; the policy just
  stops paying the melee-retaliation tax on its ranged roster. Range-1 targets
  only for now (legal for both rng-1/rng-2; Archer's 12-tile ring-2 target set is
  an action-space widening deferred to a later stage). replay-gpu.ts dispatches by
  the SAME rule — unit type has `ranged` AND rollout.json's `rangedActive` flag —
  so pre-V-R action logs still replay as melee. RNG contract: ranged consumes ONE
  mulberry32 draw where melee consumes two; both engines branch on identical
  state, preserving draw-for-draw parity. `gpu/ranged_test.py` isolates the
  unit-action phase (a full step lets the world hit back and confounds hp
  assertions): ranged attacker untouched + stationary while the defender drops
  (100→83 on the probe), the SAME attack under flag-off gets the slinger KILLED
  by melee retaliation, and the mask is flag-invariant. Both gates green
  (off-script mean rose 115.7→116.5 — ranged units survive their attacks now);
  tsc + purchase/war self-tests green.
- tune2 [x] benchmarked (the 46-action purchase head; user-extended to 50 updates,
  20.5M steps): eval 221.6 ± 14.5 vs tune1's 216.9 ± 13.5 on the identical engine
  (tune1 re-evaluated bit-identically post-V-R — its policy never attacks with
  ranged units, so the buff is unrealized by old nets), matched-world netgreedy a
  dead-even 195.4. Verdict: purchases are a small real positive on retrain; the
  training curve ran ahead of tune1's throughout (183.6 vs ~172 at update 9).
  Ranged value awaits a tune3 trained under ranged semantics. Reference net for
  the 46-column head: gpu/runs/tune2/best.pt (train-best 218.3).
- C1-A1 [x] one civ-id space (behavior-preserving). New `src/core/civs.ts`: the
  player is civ 0, rival r is civ r+1 (city-states and barbarians deliberately
  OUTSIDE the civ numbering — never promoted); accessors `tileOwnerCiv` /
  `tileRivalCiv` / `tileOwnedByCiv` / `tileClaimed` / `tileForeignTo(t, civ)` /
  `unitCiv`, each implemented as the EXACT pre-C1 per-field test (incl. field
  precedence and the both-fields-set corner: `tileOwnedByCiv` reads only the
  civ's own field, `tileForeignTo(·, PLAYER_CIV)` is literally `csId || rivalId`).
  Ten ownership-READ sites migrated across rivals/rules/game/advisor/city/
  spatial/combat (tileOwned delegates to tileClaimed; founding ring-1 claim;
  settle blocking; settle-advisor + border-growth + camp-spawn foreign tests;
  spatial's ownedForeign plane; capture-transfer + border-adjacency +
  rival-worked-tile rival.id equality tests). WRITES stay raw field writes —
  they restructure in A2 when rival cities become real City objects. Unit
  `owner` string tests (26 sites) also deferred to A2; `unitCiv` ships now so
  A3's GPU mirror + exporter adopt the same numbering. Proof of behavior
  preservation: 232/232 vitest, `npm run gpu:export` produces BYTE-IDENTICAL
  fixtures (md5 bed511d5… before and after), scripted parity green, and the
  refactored TS oracle replays all 72 off-script GPU games turn-exactly. tsc
  green. Next: A2 — rival cities as civId-tagged City objects behind the same
  heuristic, trace-identical.
- C1-A2 [x] rival cities are real City objects (behavior-preserving). Types:
  `RivalCity extends City` + rival-only {hp, foundedTurn} (player city hp stays
  in state.cityHp until B7 unifies); `City.civId?: number` (absent = player,
  `cityCiv()` accessor in civs.ts); the heuristic's `growthBox` RENAMED to the
  real `foodBox` (5 sites — exporter never shipped it, so fixtures can't move).
  Both constructors (foundRivalCity + the loyalty-flip transfer) now write the
  full City shape with inert defaults (empty queue/buildings/lockedTiles/
  specialists, focus 'balanced', cultureBox 0, districts = [CITY_CENTER at the
  center] mirroring foundCity, civId = civOfRival). CRITICALLY KEPT: per-rival
  `nextCityId` counters — rc.id values feed the exported rc ids (at the
  time also `(turn + rc.id·3) % borderPeriod` pacing, since retired in
  P5/S4 — rival borders grow on culture); renumbering would shift traces. Id
  collisions with player ids remain harmless (rival cities never enter
  state.cities / state.cityHp) until B7 unifies the id space deliberately.
  deserialize() migrates OLD saves by filling only MISSING fields in place
  (`??=`) — the first rebuild-the-object attempt broke the rival determinism
  test by reordering JSON keys; current-shape saves must round-trip
  byte-identically. Test literals in deeper/rivals tests updated to the City
  shape. Proof: tsc + 232/232 vitest green, `gpu:export` fixtures
  BYTE-IDENTICAL (md5 bed511d5… — third consecutive stage on the same bytes),
  scripted parity green, off-script replay of all 72 GPU games turn-exact.
  Next: A3 — the GPU engine's owner-dimensioned mirror of A1/A2's layout
  (seat-0 slices bit-equal to today's tensors), then B1 (rival tile-working
  on the real citizen/yield path — the first behavior-CHANGING promotion).
- HORIZON-250 ALIGNMENT [x] (2026-07-10, tasks #27+#28): every horizon default
  now resolves to the SINGLE knob — TS TURN_LIMIT / GPU rules.turn_limit (the
  fixtures' scenario.turnLimit) = 250. Owner's call: train/eval to the score
  victory, not past it (the prior 300 default optimized 50 turns the
  scoreboard never sees; 100-default eval scored nets 150 turns short).
  Flipped: BatchEnv/DuelEnv/MeleeEnv (None→turn_limit), rollout --turns,
  train_ppo --horizon, eval/duel_eval/melee_eval/behavior_probe/gen_targets,
  horizon_audit, engine turnLimit fallback 100→250, TS CivEnv + ADVISOR_HORIZON
  (now = TURN_LIMIT). search_eval keeps --turns 100 (SEARCH.md benchmark
  comparability). Fixtures untouched (exporter already wrote turnLimit 250);
  off-script gate now runs 250t — a strict prefix of the proven-exact 300t run
  (the rollout policy is counter-based, stateless per turn). Old horizon-100
  baselines in TRAINING.md are historical; all prior nets were already orphaned
  by the 46→52 action-head growth and have been deleted (gpu/runs pruned to
  tune3, the gumbel_test reference). Full audit that found this: gpu/AUDIT.md.
- P1 RIVAL WATER + V-CS [x] (2026-07-10, 10d2382 + 7d5b125, task #29): rival
  founding claims the FULL first ring (water incl., mirroring foundCity) and
  rival border expansion claims water — the Harbor line is structurally
  rival-reachable (wterr 3→56 over a game). The reshuffled trajectories then
  exposed a LATENT missing mechanic (seed 9066 t245): the GPU had NO
  player-vs-city-state combat — V-CS ported attackCityState/captureCityState
  (cs_hp, defCS 15+pop+6mil, capture → player city at pop×0.75/half HP, +10
  siege recovery) with the trace hardened to key city-states by ID. Plus C-22:
  rival Shipyard special production (floor(Harbor adjacency)), both engines.
  Follow-ups in AUDIT §C-1: offer CS attacks in the RL mask (new verb, needs
  eval re-baseline), TS captureCityState lacks the city-cap raze rule.
- P2 PLAYER DISTRICT COST [x] (2026-07-10, task #30): districts are no longer
  free+instant for the player — the production decision QUEUES them at
  districtCost(state) (today: floor(round(54·speed)·(1+9·max(tech%, civic%))),
  ×0.6 for an under-represented specialty type — districtCostIn/
  districtDiscounted in game.ts), through TS queueDistrict everywhere: tile paved INCOMPLETE
  + feature stripped at queue time, completion via the production loop
  (q_dtile remembers the target; district codes double as current codes).
  Scripted autopilots (exporter + GPU) queue the next scaffold district when
  the capital idles — between the warrior branch and the cheapest-building
  fallback, at most one per turn. PICK POLICY (both engines): candidate tiles
  exclude resources — queueDistrict's bonus-resource strip stays unexercised
  (a res_stripped plane is the enabling work if a future net should place on
  bonus tiles; noted in AUDIT). Traps paid: (a) the completion spawn call
  indexes the unit-civ table with the UNMASKED current column — district codes
  must be clamped out (index-8-of-7 crash caught by the first parity run);
  (b) _strip_feature_at was NOT idempotent — paving a previously CHOPPED tile
  double-subtracted the feature's lent adjacency from neighbours (TS
  feature=null is naturally idempotent; 6 of the 7 gate fails, e.g. an
  adjacent Holy Site's faith dropped 2→1 GPU-only at seed 9040 t132); the
  founding-strip twin got the same guard. (c) PRE-EXISTING precedence bug the
  reshuffle exposed (7th fail, seed 9053 t204): TS meleeAttack lets units ON
  the tile take the hit first — a lone hostile CIVILIAN dies ROLL-FREE and
  the attacker advances (even onto an at-war rival CENTER); the GPU had no
  civilian branch and besieged the CITY through its occupant (2 extra draws +
  the city's counter killed the attacker). New civk branch mirrors it; siege/
  cs_hit now yield to hostile civilians.
- LOG FROZEN at P2 — gpu/AUDIT.md and the git log are the live status.


## 5. The Civ 6 gap — engine completion toward the REAL goal (2026-07-08)

The ultimate goal (owner's words): the best champion — duel or FFA — on an
engine close enough to Civ 6. Everything in §1-4 built the training/parity
INFRASTRUCTURE; this section is the remaining GAME. The RL track is PARKED
(methodology settled and banked in TRAINING.md/ARCHIVE.md; c3a-4 was the
last interim champion) — one cheap adoption-smoke rung per shipped system,
nothing more, until the final campaign on the finished engine.

Ordered by how much each system changes what "best champion" MEANS:

- [x] **G-V (i) horizon-300 audit DONE** (gpu/horizon_audit.py, scripted
      autopilot, 12 seeds → 300 turns). FINDINGS reorder everything below:
      * **Cliff #1 (G-S, HARD CRASH ~t150): unit pools cap at 96 slots,
        append-only (dead slots never reclaimed).** U_MAX/P_MAX in engine.py.
        Barbs + rival units accumulate past the cap. FIRST engine change.
      * **Cliff #2 (THE deep one): the engine has no player second half.**
        Score PEAKS ~t200 (207) then DECLINES to 195@t300; d/turn goes
        1.47→0.07→-0.20. Player cities CONTRACT 3.7→2.2 while RIVAL cities
        SCALE 8.5→13.5 — the scripted player is out-expanded and run over.
        NOT barbs (steady ~6). MECHANISM (gpu/cityloss_probe.py): the loss
        is LOYALTY, not conquest — 74% of city losses happen AT PEACE
        (26 peace vs 9 war), i.e. rivals' loyalty pressure scales with
        their empire and flips the player's border cities. A competent
        player may need to play TALL (fewer, bigger, high-loyalty cities)
        — a hypothesis the diagnostic net tests. Trees have DEPTH (23.9/32
        techs, 5 still
        pickable @t300) — research STARVES as the empire shrinks, doesn't
        deplete. Housing ceilings pop ~17. Gold balloons unspent 243→782
        (scripted has no purchase; a net fixes that).
      * **DIAGNOSTIC DONE (horizon_audit --policy c3a-10, greedy, OOD past
        t100): a COMPETENT PLAYER SUSTAINS.** Score plateaus ~285 from
        t200-300 (vs scripted's decline to 195); pop KEEPS GROWING to 25.4
        (vs scripted stall ~17); cities hold 3.0 (vs 2.2). The net plays
        TALL (25 pop / 3 cities — hypothesis confirmed). So "no second
        half" was AUTOPILOT WEAKNESS, not a structural cap — the horizon
        extension is VIABLE, and this ANSWERED IT WITHOUT a training run.
      * BUT two real late-game gaps remain: (a) score goes FLAT past t200
        (the net maxes its tall cities + tech and has nothing to push
        higher → this is precisely what VICTORY CONDITIONS + late content
        provide); (b) treasury runs deeply NEGATIVE (−1491 @t300 — the net
        over-purchases, no BANKRUPTCY mechanic exists; a G-D/G-V fidelity
        bug to fix). Loyalty still soft-caps the player at ~3 cities.
      * REVISED IMPLICATION: G-V is closer to the CHEAP path — add victory
        conditions + late-game objective, fix bankruptcy — than to "the
        late game is structurally broken." A horizon-300 TRAINED net (vs
        this OOD greedy one) is now OPTIONAL/later — it would raise the
        ~285 floor, not answer a blocking question.
      Remaining G-V slices (re-scoped): (ii) game-end semantics (per-game
      'done' + winner, traced); (iii) DOMINATION victory (capture exists —
      needs capital flags + all-capitals-lost); (iv) SCORE victory at the
      limit. Science/culture/religious victories arrive with their systems.
- [ ] **G-C Combat depth** — makes domination a real axis (and plausibly
      dethrones the economist): city WALLS + ranged city strikes, siege
      units/classes (support vs melee vs ranged), promotions, healing,
      zone-of-control. The war chapter's conclusion (armies don't pay)
      was measured on wall-less 40-defense cities — this system re-opens it.
- [ ] **G-R Religion** — a full yield economy (faith exists as a dead pool),
      pantheons/beliefs, religious units, pressure, the religious victory.
- [ ] **G-T Trade routes** — traders, route yields, roads, plunder.
- [ ] **G-D Full trees** — the complete district roster (Theater/Entertainment/
      Aqueduct-as-real/Neighborhood...), full building trees, the full
      tech/civic trees to the modern era (today's trees end early).
- [ ] **G-S Scale** — 300 turns everywhere, 8-10 cities, bigger maps,
      more rivals; batch/memory work on the GPU side.

Sizing honesty: each of G-C/G-R/G-D is a B-arc-sized effort; G-V and G-T are
half that; G-S is engineering. Cut-line options: STRATEGIC CORE = G-V + G-C
+ G-R (champions mean something Civ-like); FULL FIDELITY adds G-T/G-D/G-S.
Every slice lands via /gate-stage + /port-mechanic; adoption smokes only.
