# GPU engine — autonomous build plan

Ordered roadmap toward the district economy, single-agent search, and
self-play. Worked in **small stages, each committed + pushed green** so a
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
              Reachability check: capital pop maxes at 9 (median 5), 0/24 games
              reach the 4th specialty slot (pop≥10) and APPRENTICESHIP (IZ unlock)
              is never researched in 100 turns. Adding them = vacuous code. Revisit
              only with a longer horizon or a forced high-pop scenario. The
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
        ENGINEERING is 0/24 in the scripted policy (never reached in 100 turns) so
        scripted coverage is vacuous, but off-script random tech play reaches it —
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
  - [—] **Neighborhood** — needs a late civic (Urbanization) unreached in 100 turns.
- **D6 COMPLETE (reachable specials):** Aqueduct (housing) + Harbor (coastal gold)
  are live under both gates. The district action space now covers the economic
  three + housing + coastal — enough for a district-rich retrain.

## 2. Single-agent MCTS  (score lever over the existing net)
Primitives already exist: deterministic batched forward model (in-state
mulberry32), cheap clone/restore (`_MUTABLE` + `_pristine`), trained policy
priors + value head (train_ppo `self.v`), legal-action masks.

- [ ] **M1** PUCT driver over BatchSim (clone→step→backup) using policy priors +
      value leaf eval. CPU smoke test.
- [ ] **M2** Factored action space (5 heads/turn): Gumbel/Sampled-AlphaZero style
      search over sampled action-tuples. Eval vs the 213.6 policy.
- [ ] **M3** (opt) Search-distilled policy improvement loop; handle RNG chance
      nodes (sample futures / expectimax) for robustness.

## 3. Multi-civ symmetry  (unlocks self-play + AlphaZero)
Blocker: player is a full citizen, rivals are a reduced heuristic NPC model.

- [ ] **C1** Promote rivals to full symmetric per-owner state (owner dimension on
      cities/economy/research/gov); keep TS parity.
- [ ] **C2** Per-civ egocentric obs, per-civ action routing, per-civ reward.
- [ ] **C3** Self-play trainer + opponent league (PFSP, frozen snapshots).

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
