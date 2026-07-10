# Engine audit — 2026-07-10

Full-project audit run after the horizon-300 flip (1fca921): (A) horizon-flip completeness,
(B) doc/comment staleness, (C) player–rival symmetry, (D) real-Civ-6 fidelity of implemented
mechanics. Scope rule for (D): only IMPLEMENTED behaviour counts — missing features are not
divergences. Standing direction: where the sim diverges from real Civ 6, real Civ 6 wins
(see memory `source-of-truth`); where player and rival paths diverge, symmetry wins.

Status tags: **[CONFIRMED]** = re-verified by hand this session; everything else is
audit-reported with file:line citations (verify the exact lines when picking the item up).
Line numbers are as of commit 1fca921.

---

## A. Horizon flip was only half-applied — RESOLVED (task #27, 2026-07-10)

Owner's decision: the single knob is **TURN_LIMIT = 250** (not 300) — train and
evaluate to the score victory, not past it. Every default below now resolves to
TS `TURN_LIMIT` / GPU `rules.turn_limit` (the fixtures' `scenario.turnLimit`);
`search_eval` keeps `--turns 100` for SEARCH.md benchmark comparability.
Original finding, for the record:

Flipped to 300: `gpu/train_ppo.py:241`, `gpu/rollout.py:38`, `gpu/horizon_audit.py:28`.
Still defaulting to 100:

- `gpu/eval.py:47`, `gpu/duel_eval.py:51`, `gpu/melee_eval.py:33`, `gpu/behavior_probe.py:68`,
  `gpu/gen_targets.py:37`
- `gpu/civ6gpu/env.py:41` (BatchEnv default)
- `gpu/civ6gpu/engine.py:154` (`turnLimit` fallback)
- TS: `src/core/rlenv.ts:255` (`horizon ?? 100`), `src/core/aiAdvisor.ts:23` (`ADVISOR_HORIZON`)

Net effect: nets train at 300 but every eval/duel/melee harness scores at 100.
Also reconcile the three horizon knobs: training/rollout episode length (300),
TS score-victory `TURN_LIMIT = 250` (`src/core/game.ts:39`), GPU turnLimit fallback (100).

Related: `gpu/BUILD_PLAN.md`'s "unreachable in 100 turns → revisit with a longer horizon"
deferrals (`:60-61` IZ/Theater district code, `:129` ENGINEERING, `:156` Neighborhood/
Urbanization, `:41-42`, `:57`, `:698-700`) have hit their stated unblock condition — they are
now actionable, not parked.

## B. Stale docs / comments — FIXED (task #28, 2026-07-10)

- `AGENT_PROMPT.md:13` — "100-turn development game" (now 300 train/rollout, TS TURN_LIMIT 250).
- `AGENT_PROMPT.md:111-120` — G-V arc marked IN PROGRESS; it shipped (GV done, pool cap 765ab4f,
  flip 1fca921).
- `gpu/GV_DESIGN.md:3,9,14-15,115-117` — says the horizon-300 flip is still pending / "only
  after GV-2"; `:14-15` "REMAINING: GV-3/4/5" contradicts `:5-8` which mark them SHIPPED.
- `gpu/README.md:69-71` — off-script gate described as "72 random games × 100 turns"; it now
  runs 300 (rollout default).
- `gpu/TRAINING.md:73,77` — recommends `--horizon 100` "matches the eval protocol"; reads as
  current guidance but no longer matches the trainer default (nor eval once #27 lands).
- `src/ui/panels.ts:1416` — "horizon-100 game (the training setting)": training is 300 now;
  the TS advisor itself is still genuinely horizon-100 (`ADVISOR_HORIZON`) — reword.
- `gpu/civ6gpu/engine.py:609` — "Nothing places a district yet … verified no-op — D2 adds
  scripted placement": D2–D5 shipped; framing predates them.
- `gpu/civ6gpu/engine.py:3063` — "rivals hold no gold": stale since VP-G1/G2 (`r_treasury`
  exists and controlled rivals spend).
- `src/core/mapgen.ts:7` — "a later stage can bypass this by importing map JSON": the import
  path already exists (`panels.ts` import-text). Minor.
- Root `CLAUDE.md` is an empty untracked file — fill or delete.

## C. Player–rival symmetry findings  (tasks #29–#31)

Rivals must be full-fidelity symmetric agents: same formulas, same available actions;
only the decision policy may differ. Findings (engine = TS / GPU / both):

### Structural capability blocks

1. **Rivals can never own coastal water — FIXED 2026-07-10 (10d2382).** Rival founding now
   claims the full first ring (water included, mirroring foundCity) and rival border expansion
   claims water (only impassable + natural wonders excluded), both engines. Rivals hold water
   from turn 1 (wterr 3 → 56 over a 250t game); the Harbor line is structurally reachable.
   THE GATE THEN CAUGHT a latent missing mechanic the reshuffle exposed: the GPU had NO
   player-vs-city-state combat (TS meleeAttack's csTarget fallback) — **V-CS ported** same
   commit: cs_hp (maxHp 150), defCS = 15+pop(+6 militaristic), capture → player city, +10/turn
   siege recovery, trace keyed by CS id. NEW follow-ups: (a) the RL unit-attack MASK does not
   yet OFFER attacks on CS centers — a new verb, do deliberately with an eval re-baseline;
   (b) TS `captureCityState` has NO city-cap raze rule (unlike `captureRivalCity`, combat.ts:317)
   — TS-side consistency fix; the GPU skips city creation at a full empire (documented).
2. **Rival-unreachable catalog** [TS] — outside `SCAFFOLD_DISTRICTS` (`data/districts.ts:250-256`):
   THEATER_SQUARE, INDUSTRIAL_ZONE, ENCAMPMENT, ENTERTAINMENT_COMPLEX, NEIGHBORHOOD and all
   their buildings; worship buildings (no rival worship); PALACE (no unlock path — see item 14).
   Ties into the BUILD_PLAN horizon-100 deferrals now unblocked (§A).
3. **Rivals can't clear barb camps** [both] — player gets +50 gold + removal
   (`combat.ts:183-188`, `units.ts:180-186`, `engine.py:2481,2625`); rival kills leave the camp.
4. **Pillage/repair one-directional** [both] — hostiles pillage only player tiles
   (`combat.ts:407`, `engine.py:3785`); rival improvements are pillage-immune except disasters,
   and nothing can repair a pillaged rival tile (GPU also lacks a player repair action; TS has
   `units.ts:353-361`).
5. **Capture slot overflow** [both] — player at full city cap razes instead
   (`combat.ts:317-325`, `engine.py:2319-2320`); rival side: TS pushes unbounded
   (`rivals.ts:378`), GPU hard-asserts on full slots (`engine.py:4390`) — crashable.

### Formula divergences (player path ≠ rival path)

6. **Player districts were free + instant in the GPU/exporter harness — FIXED 2026-07-10
   (task #30).** All player district placement now routes through TS `queueDistrict`
   semantics in both engines: tile paved incomplete + feature stripped at queue time, the
   production slot pays `districtCost(state)` (the rival formula off player research),
   completion via the production loop. Scripted autopilots queue the next scaffold district
   when the capital idles (warrior branch → district → cheapest building). PICK POLICY kept
   narrow in both engines: candidate tiles exclude resources, so queueDistrict's
   bonus-resource strip stays unexercised — a `res_stripped` plane (the chop-twin treatment
   for resources) is the enabling work if bonus-tile placement should ever be offered.
7. **Unit healing** [both] — player +10 own territory / +5 elsewhere (`units.ts:291`,
   `engine.py:4716-4718`); rivals+barbs +10 unconditionally (`units.ts:291` `: true` branch,
   `engine.py:4714-4715`). See also fidelity D-2 (the shared model itself diverges from real).
8. **City healing** [both] — player +20 gated on no hostile adjacent (`combat.ts:505-513`,
   `engine.py:2834-2843`); rival +15 peace / +5 war, never siege-gated (`rivals.ts:917`,
   `engine.py:4082,4170-4172`).
9. **City defense strength** [both] — player `max(15, garrisonCS) + floor(pop/2)`
   (`combat.ts:56-60`); rival `15 + pop + floor(3·nTechs)` (`combat.ts:241-244`,
   `engine.py:2357,3722`) — garrison ignored for rivals.
10. **Sack** [both] — sacking a player city costs pop ×0.75 + treasury −min(100, 20%) +
    adjacent pillage (`combat.ts:71-81`, `engine.py:3871-3894`); sacking a rival city is
    pop-only — `r_treasury` untouched, no pillage ring (`combat.ts:256-261`,
    `engine.py:3734-3738`).
11. **Capture plunder** — player capturing a rival city: TS grants +40 (`combat.ts:354`);
    **[CONFIRMED] GPU `_capture_rival_city` (`engine.py:2302-2338`) had NO +40 — a latent
    TS↔GPU parity bug** (masked only because no off-script game captures a rival city yet).
    **FIXED 2026-07-10**: the GPU now credits +40 AND ends the war on the rival's last city
    (a second TS-mirror gap found in the same TS block, combat.ts:357-360; the raze path
    mirrors TS's early return — no gold, war unchanged). war_test poke covers all branches.
    STILL OPEN (C-11b): rival capturing a player city plunders nothing in either engine
    (`rivals.ts:368-399`, `engine.py:4376-4405`) — the symmetry half.
12. **Rival economy skipped** [both] — no building/district/unit maintenance, no bankruptcy
    disband for rivals; they bank gross gold (`rivals.ts:869,940`, `engine.py:4096,4188`) vs
    the player's full upkeep chain (`city.ts:81-102`, `game.ts:736-753`, `engine.py:1505-1508,
    4809-4810`).
13. **Rival peace is free; player peace costs 150+10·warTurns** [GPU controlled-rival head] —
    `engine.py:3063-3067` (stale "rivals hold no gold" comment) vs `rivals.ts:258-272`,
    `engine.py:1719-1725`. Rival settler-purchase is also hard-False (`engine.py:3053`) while
    building/unit purchase exists (VP-G2).
14. **Founding cluster** [both] — rival capital pop 3 + no Palace ever vs player pop 1 +
    PALACE; rival center feature not stripped (`rivals.ts:107-141`, `engine.py:4933-4934`);
    settler curve 90+40·(n−1) (`data/rivals.ts:27`) vs player 80+30·n; rival-rival spacing
    `CITY_MIN_DIST+1` vs 3 elsewhere (`rivals.ts:448-454`, `engine.py:3567-3574`).
15. **Border growth** [both] — player: culture box vs `borderGrowthCost`, radius 5,
    res/yield priority + tile purchase (`city.ts:296-343`, `game.ts:709-721`,
    `engine.py:4762-4797`); rival: free 9-turn timer, radius 3, `res·3 − 2·dist` score,
    `rc.cultureBox` accrued but never consumed (`rivals.ts:405-426,914`,
    `engine.py:3500-3523,4168`).
16. **Great people** [both] — player keeps overflow (`points -= cost`) and gets GP effects
    (`game.ts:810-841`, `engine.py:1334-1344`); rival GPP zeroed on claim, claimed GP has no
    effect (`rivals.ts:484-489`, `engine.py:4242-4249`).
17. **Pantheon/religion** [both] — player: 25 faith + Holy Site/Prophet gates
    (`game.ts:941-992`); rival: free timed claims (turn 18+8r / 45+12r), rival faith yield has
    no consumer (`rivals.ts:492-519`, `engine.py:4253-4264`).
18. **Eurekas player-only** [both] — `rivals.ts:920-947` ("no eurekas for rivals until B6"),
    `engine.py:4176-4219`. Known/planned (B6) — listed for completeness.
19. **Loyalty one-directional** [both] — player cities take pressure and can flip to rivals
    (`rivals.ts:309-364`, `engine.py:4321+`); rival cities have no loyalty state, can never
    flip to the player.
20. **Amenities skipped for rivals** [both] — no rival amenity model at all; `rivalHousing`
    is water+buildings+improvements only (`rivals.ts:716-735`) vs the player's full amenity
    tier scaling (`city.ts:440-504`, `engine.py:1495-1504`).
21. **TS unit movement** [TS] — player: full-MP A* multi-turn paths (`units.ts:113-202,
    287-310`); rival/barb: exactly one 1-tile step or action per turn (`rivals.ts:522-541`,
    `combat.ts:394-448`). GPU is internally symmetric (1 step each) but thereby diverges from
    the TS player rule (masked: the exporter emits single-tile steps).
22. **Shipyard `special` yields ignored in the rival building sum — FIXED 2026-07-10**
    (both engines mirror `production += floor(Harbor adjacency)` for rival Shipyards).
    STILL OPEN: `regional` building yields (`yields.ts:192-212`) remain player-only —
    latent until IZ/EC districts enter the rival scaffold (see §A BUILD_PLAN deferrals).
23. **Controlled-rival purchase apply re-checks only ownership+gold** [GPU, minor] —
    `engine.py:3137-3160` vs the player path's full re-validation (`engine.py:4450,4473`).
24. **Rival ranged-vs-city gate missing** [GPU, latent — no rival ranged roster yet] —
    player mask has `melee_only` (`engine.py:1965-1966`), rival mask lacks it
    (`engine.py:2050-2051`).

25. **[GATE-CAUGHT 2026-07-10, not in the original audit] GPU player-attack precedence
    missed TS's lone-civilian rule** — TS `meleeAttack` lets units ON the tile take the hit
    first: a lone hostile civilian dies ROLL-FREE and the attacker advances, even onto an
    at-war rival city center; the GPU besieged the CITY through its occupant. FIXED with
    P2 (civk branch; siege/cs_hit yield to hostile civilians). Exposed by trajectory
    reshuffle at seed 9053 t204.

Also one-directional by construction (track, lower priority): barb camp spawn spacing and
barb marches consider player assets only (`combat.ts:367-448`); wonders, projects, trade
routes, envoys/suzerain/levy, specialists, tile/settler purchase, chop lumps (TS), goody
huts, fog are player-only mechanic families in TS.

Checked and symmetric (no action): melee combat rolls/terrain defense/victor-survives, shared
RNG stream, growth curve/starvation/housing factors, citizen yields, tile yields incl. natural
wonders/disasters, farm/mine research boosts, district adjacency + placement gates + cost
curve, specialty-district pop cap, building gates + cost tie-break, research banking/autopick,
work radius, worked-tile scoring, center min yields, Aqueduct housing, stacking rules
(rmil/pmil = one rule parameterized by owner — NOT a bug), spawn ring, builder improvement
validity, chop grant scaling (GPU), city HP 200, capture pop ×0.75, Water Mill river gate,
GP accrual base, domination detection.

## D. Real-Civ-6 fidelity divergences (implemented features only)  (task #32)

TS core audited (GPU mirrors it). Confidence: H = high, M = medium, L = low.
"Real" values verified against the Civ 6 wiki / civfanatics where cited in the audit run.

STATUS 2026-07-10: **FIXED — D-1, D-2 (the MP-gated four-tier healing model, closing
C-7/C-8 too), D-3/D-4 (real entry rule: MP ≥ full step cost incl. river +3, with the
full-MP one-tile exception — TS-only; both gate paths only ever walk one step from
full MP, so the GPU one-step model already matches), D-5, D-6, D-7, D-8 (minus the
25% under-represented discount), D-9, D-10 partial (base 50; +4/builder escalation
open), D-13 verified subset, D-14, D-16 (real border curve 10+(6t)^1.3, both
engines), D-19 (specialists yield-only — also closed a latent TS↔GPU GPP
divergence: the GPU never counted them), D-20 (pillage heals only from FOOD
improvements, both engines, both raider classes), D-24; D-11 decided (R&F/GS
canon).** The gate hunts these slices triggered also fixed: the
player-side per-city interleave (the #23 class), strip idempotence + the founding
twin, non-removable-feature adjacency (nfadj/reef), the flipped-center double-strip
(old task #21's residual), torch.argmax tie semantics (first_argmax), the empire-score
float association, and the third dormant-TS-fallback: ranged attacks ROLL against lone
civilians (melee-vs-CS and melee-vs-civilian were the first two). REMAINING
high-value: the D-13 remainder (verify values), the D-10 escalation, plus the
medium/low tail (D-12, D-15, D-17, D-18, D-21, D-22, D-23).

### High confidence

1. **Combat damage random factor 0.75–1.25** (`combat.ts:51-54`) — real: 0.8–1.2. H
2. **Healing model** (`units.ts:287-293`) — heals every turn even after moving/attacking; no
   city (+20) or neutral (+10) tiers. Real: only if no MP spent; +20 city / +15 friendly /
   +10 neutral / +5 enemy. H (also symmetry C-7)
3. **Movement uses the Civ-5 partial-MP rule** (`units.ts:161-175`) — enters while
   `movesLeft > 0`. Real Civ 6: need MP ≥ full tile cost (full-MP 1-tile exception). H
4. **River crossing zeroes remaining MP** (`units.ts:172-175`) — real: +3 MP cost. H
5. **CITY_MIN_DIST = 3** (`data/constants.ts:15`) — real blocks settling within 3 tiles
   (min center distance 4). H
6. **Settler completion doesn't cost 1 pop** (`game.ts:686-687`). H
7. **Trade capacity: Market+Lighthouse stack in one city** (`trade.ts:22-25`) — real: +1 max
   per city from that pair. H
8. **District cost scaling** (`game.ts:52-56`) — `round(54·(1+8·done/total))` averaging both
   trees; real: `floor(54·(1+9·max(tech%,civic%)))` + 25% under-represented discount. H
9. **Horseman CS 35** (`data/units.ts:97-107`) — real 36. H
10. **Builder cost flat 54** (`data/units.ts:33-42`) — real 50 + 4/builder trained. H
11. **Boost fraction 40%** — DECIDED 2026-07-10: the sim's canon is **Rise & Fall /
    Gathering Storm** (40% boosts; the GS Reef and GS disasters are already modeled).
    Not a bug; no code change. H

### Medium confidence

12. **Amenity tier thresholds one tier lenient; no Unrest/Revolt** (`constants.ts:76-83`) —
    real: Content = 0 only, Displeased −1..−2, Unhappy −3..−4, Unrest −5..−6 (rebels),
    Revolt ≤−7. Multipliers per tier match. M
13. **Building maintenance tiering off** (`city.ts:81-89`) — real: Monument/Granary/Water
    Mill 0 (code 1), Temple 2 (code 1), Workshop 1 (code 2), worship 0 (code 2). M
14. **District maintenance charges Commercial Hub & Harbor** (`city.ts:91-93`) — real exempts
    those two. M
15. **GAME_SPEED 0.6 non-uniform** — scales units/buildings/techs/civics but not wonders
    (`builtWonders.ts`), districts (`game.ts:52`), settlers (`game.ts:127`), projects →
    those cost ~1.67× more relative to real ratios. M
16. **Border growth cost** (`constants.ts:24-26`) — `floor(20+10·n^1.1)`; real
    `10+(6·n)^1.3` — too fast late (n=10: 146 vs ~214). M
17. **Tile gold purchase = 4× border culture cost** (`constants.ts:29`, `game.ts:512-517`) —
    real: own ring-distance + research schedule (~50/75 base), not coupled to the culture
    counter. M
18. **Loyalty happiness ±3/±1.5 and pressure cap ±10** (`data/rivals.ts:56-63`,
    `rivals.ts:309-328`) — real: ±6/±3 and swing to ±20; era weighting absent. M
19. **Specialists generate GPP** (`game.ts:796-799`) — real: yields only. M
20. **Pillage heals +25 for ANY improvement** (`combat.ts:405-412`) — real: heal from
    food-type improvements only; others grant yields. M
21. **Worship buildings production-buildable** (`rules.ts:259-261`, `game.ts:287-299`) —
    real: faith-purchase only (fixed 190). M
22. **City defense ignores best-unit-ever rule** (`combat.ts:56-60`) — real bases CS on the
    strongest melee unit ever built + garrison flat bonus + walls. M (also symmetry C-9)
23. **Ranged units can't attack cities** (`combat.ts:194-213`) — real allows it (with wall
    rules). M
24. **Arena missing +1 culture** (`data/buildings.ts:86`). M

### Low confidence / minor

25. Appeal "Average" band 0..1 vs real −1..1 (`appeal.ts:31-37`). L
26. Insulae/Medina count ALL non-center districts vs real specialty-only (`city.ts:199-205`);
    `policies.ts:27` comment contradicts the implementation. L
27. Veterancy covers Encampment only; real also Harbor (`data/policies.ts:69`). L
28. Astrology eureka condition: "own tile adjacent to natural wonder" vs real "discover a
    natural wonder" (`data/boosts.ts:38`). L
29. Melee mutual-kill: attacker HP floored to 1 (`combat.ts:171-173`) — real resolution
    uncertain. L
30. Tech-cost outliers inside the compact tree (header admits eyeballing, civics are exact):
    Banking 390/Medieval (real 490/Renaissance), Mass Production & Astronomy 580 (real 490),
    Industrialization 930 (real 700), Sanitation Industrial (real Modern). L

Verified faithful (no action): growth curve, housing growth factors, amenities-needed
formula + tier multipliers, food 2/pop, citizen 0.7s/0.3c, center min yields, housing
(water/Aqueduct), luxury distribution, district pop cap, work radius, purchase ×4, district
adjacency + placement, specialist yields, unit/city HP, city heal amount, unit roster
(except D-9/10), tile/improvement yields, terrain defense, regional range 6, pantheon 25,
checked beliefs, government slots, trade range 15, camp reward 50, pillage amount, loyalty
pressure shape, capital loyalty immunity, barb fog spawning.

Acknowledged simplifications (comment-marked design choices, NOT tracked as bugs): compact
tech/civic trees, GAME_SPEED 0.6, condensed auto-claim great people, eyeballed
policy/religion/wonder/city-state/appeal/disaster values, chop lump formula, domestic trade
yield approximation, civilian capture→kill, barb sack-instead-of-stall, scripted rival
diplomacy, no walls, bankruptcy disband approximation.
