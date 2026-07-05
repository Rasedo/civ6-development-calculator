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
- [~] **D3** Dynamic adjacency + other district types (split):
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
        - [ ] **D3b-4** Industrial Zone (needs a MINE_OR_QUARRY dynamic source in
              the yield loop + placement score).
- [ ] **D4** District buildings (Library/University, Market/Bank, Shrine/Temple,
      Workshop/Factory, etc.): unlocks, yields, housing, specialist slots.
- [ ] **D5** RL production head can queue districts (widen production action
      space); off-script coverage; retrain-ready.
- [ ] **D6** Specials: Aqueduct/Neighborhood housing, Harbor coastal placement,
      Encampment not-adjacent-to-center.

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
