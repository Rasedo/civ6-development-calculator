# Engine audit v3 — 2026-07-12

Third audit generation, replacing v2 (2026-07-11). Closed chapters are
dropped wholesale — C (order/slot latents), D (the #36 optimization
batch), and the E-sweep (#49) landing logs live in git history (v2 last
at 806a4a0). Chapters below are refreshed by serial clean-context
sweeps against live code; unresolved v2 notes are inherited under their
original ids, new findings continue each chapter's numbering.

**RULE (owner, 2026-07-12): every note anchors the code/doc block to
fix BY SYMBOL — function/method/class/exported-constant names — never
by line number. Line numbers rot; symbols are greppable.**

**Ladder state:** P1–P7 done; P8 (#26) PARKED by owner directive until
this file is clean — the chapters below ARE the roadmap (tasks #41-#48,
then #50/A-18 with the ONE pre-P8 re-baseline).

## Completion estimate (owner-requested 2026-07-17; guesstimates)

Each item hand-weighted 1–8 by implementation size read off its
description (1 = constant/table tweak, 2 = focused mechanic, 3 =
mechanic + both-engine plumbing, 4 = big system, 8 = engine-wide);
partial items carry fractional credit. Update this block at every
stage that moves an item.

| Chapter | Weight | Done | % |
|---|---|---|---|
| A symmetry | 41 | 40.0 | **98%** |
| B fidelity | 88 | 87.11 | **99%** |
| C order/slot latents (closed) | 30 | 30 | 100% |
| D perf (closed) | 15 | 15 | 100% |
| E docs (closed) | 6 | 6 | 100% |
| G parity latents (closed) | 11 | 11 | 100% |
| **Overall (incl. closed)** | **191** | **189.11** | **99%** |
| Open chapters only (A+B) | 129 | 127.11 | **99%** |

(#71 RESIDUALS close-out, 2026-07-26 — table re-summed from per-item
weights. A-5r 95%→97% and A-9 95%→97% (machinery landed both engines,
scripted TRIGGERS held inert pending their own hunts); B-8 95%→100%
outside #50 (naval war-march); B-18 95%→97% (apostle + theological
combat landed, buy inert); B-26 80%→85% (scout-then-raid opener);
B-24 70%→75% (dedication substrate + payouts, incl. the prevAge Heroic
substrate). B-17/B-23/B-27 UNCHANGED — not started. Gains are modest by
design: this round spent most of its effort on a parity hunt, and three
mechanics ship INERT behind flags rather than live.)

(#70 ROUND SMALLS close-out, 2026-07-26 — table RE-ADDED from per-item
weights, never by deltas. A: A-9 90%→95% (palace relocation). B: B-8
90%→95% (strike-site auras + the +1 MP half), B-20 70%→75% (the music
magnitude fixed — see the REFUTATION in its entry; its residual list
also GREW, which is why the % barely moves), B-26 70%→80% (ranged
barbs). Chapter G grew 9→11 and stays closed: G-9 and G-10 were both
found AND fixed inside this round. The headline is not the +2.8 of done
weight — it is that a round of small residuals exposed FOUR dormant
parity latents, three of them one family. See the #70 chronicle entry.)

(2026-07-26 correction: the #69 "re-added" B row itself carried a
+2.0 slip — 82.6-claimed at the #68 close vs 80.6 by a fresh
per-item sum (the third +2.0-magnitude drift; B10 and #69 caught
the first two). The A row was clean. Every row above is re-summed
from the per-item weights. Consequence worth noting: B-22 (1.5
open weight), not B-24 (0.9), is the largest single open B item.)

(#69 close-out note: A-25 + G-8 + B-15 all closed in one round —
A-25 and G-8 resolved by RE-VERIFICATION (unreproducible sighting +
refuted artifact), not by fixes; chapter G is empty and CLOSED
again. TABLE RE-ADDED from the per-item weights (the B10 rule): the
incrementally-maintained totals had drifted −4.5 low (158.9-claimed
vs 163.4 true at the #69 open) and the weight total is 189, not 188
— every row above is a fresh sum, not a delta. Remaining open
items: chapter A = A-5r 5%, A-9 10%, A-18 (w3), A-21 (w2), A-22
(w2), A-23 (w2); chapter B = B-8 10%, B-15 0, B-17 15%, B-18 5%,
B-20 30%, B-22 50%, B-23 30%, B-24 (w3), B-25 20%, B-26 30%,
B-27 25%.)

(B8 note: chapter A's weight grew 39→41 — the new A-25 latent found
by slice K's hunt — so A's % DROPS despite A-12 resolving; the
denominator moved, not the work.)

(B10 close-out note: the rows are re-added sums — the prior overall
row carried a +2.0 arithmetic slip (144.0 vs the true 142.0), so
overall stays 79% despite the round's +3.6 of done weight.)

(2026-07-17: A-7r LIVE (#46r), A-5 resolved-minus-tile-purchase, B-18
spread, chapter G EMPTY. 2026-07-18 ROUND B3 U/V/W/X:
B-18 60%→75% — pressure→yields coupling LIVE; B-13 → 100% — full
unlockPolicy wiring; A-7r → 100% — the residual card wiring was
B-13's; B-25 50%→70% — GPU space-race sim poke-covered; B-29 done.
2026-07-18 #41 stage 1: A-17 RESOLVED — per-rc tile registry both
engines, per-city border adjacency + exact capture/transfer tile
sets; residual worked-tile civ-level scan split out as new A-23 w2.
Stage 2: A-11 → 90% — rival domestic trade routes live both engines
+ symmetric route interdiction; rival→CS routes wait on A-12.
Stage 3a: A-12 → 50% — per-civ envoys/influence/greedy assignment,
rival envoy bonuses, strict suzerain contest; CS verbs = stage 3b.
2026-07-18 ROUND B4 Y/AA/Z/AB (brief gpu/ROUND_B4.md): B-7, B-30,
B-31, B-32 all RESOLVED; new A-24 w2 = rival district/tile registry
consistency latent, split from slice AB's hunt. 2026-07-18 #45
NAVAL: B-6 RESOLVED — serial N1/N2/N3 off gpu/NAVAL_DESIGN.md, ONE
end-of-task battery incl. the new `naval` poke lane. 2026-07-19
ROUND B5 M1/M2/M3 (brief gpu/ROUND_B5.md): B-4, B-9, B-10 RESOLVED;
M1's hunt FIXED the GPU advance-after-kill terrain omission (land
units advancing onto water after killing an embarked defender — both
red rollout games, one class); new G-5 = the surviving 1-gold
rival-economy rounding latent M2 dodged by seed reroll. 2026-07-19
ROUND B9 R1-R3 serial (brief gpu/ROUND_B9.md): A-9 → 90% — scaffold
5→9, regional channel, worship faith-buy, rival PALACE; R1 fixed
EIGHT newly-reachable latents (f7b13d3), R2's gates caught the G4
buildings-are-own-column cache break + the player ww-vs-unit-orders
ordering latent (faf08cc), R3 hunt-free (73b9e32); G-5 second
sighting on a war capture → reroll 9301→9302. 2026-07-19 ROUND B6
S1-S4 serial (brief gpu/ROUND_B6.md): B-18 75%→95% — all 7 enhancer
EFFECTS live (S1 5e6ab7b, hunt-free) + the rival MISSIONARY chassis
(S2 512abe4: faith-buy 60/42 after worship, cap 2, real-MP walk +
spread lump 10/15, SCRIPTURE/HOLY_ORDER; in-gate 24/24 seeds, 264
buys/220 spreads; the rollout replay caught the missing faithOnly
production-mask term — the round's one gate catch); B-25 70%→80% —
religious victory (S3 79a056f: predominance >half in EVERY alive
civ, victoryType 5/6 at endTurn, poke-pinned — gate-unreachable at
250t). 2026-07-19 ROUND B10 R/B/H parallel worktrees (brief
gpu/ROUND_B10.md, task #66): A-24 RESOLVED (per-rc placement rule
`rivalCityId === rc.id`/`rc_tile_id == rc_id`, env-gated invariant
scan auto-ON under the forced gate, `rc_registry` lane); B-26 → 70%
(barb era ladder to MUSKETMAN + barbs obey ZOC; ranged barbs
DESCOPED — the GPU raider block lacks a ranged dispatch); G-5
ROOT-CAUSED: TS `transferCityToRival` kept duplicate-type districts
where the GPU type-keyed registry (and real Civ 6) hold one per
type — TS fixed, seeds 9222/9301 RESTORED in-gate; the merge added
the missing `_eff_version` bump on the transfer success path (the
one unpaired rc_bldg write in the engine); new G-6 = dormant
founding tie-break sighting (slice R, unverified). 2026-07-19/20
ROUND B7 E/W/G parallel worktrees (brief gpu/ROUND_B7.md, task
#63): B-17 → 85% (Encampment specialist row TS-only + the SECOND
city strike k=pestk/restk walls-first + training XP 5/10/15 by best
military building — ALL gate-unreachable, poke lane `encampment`;
real Civ 6 has NO Encampment specialist, the row is a documented
stylization); B-20 → 70% (slice W hunt-free: 2 works/person into
AMPHITHEATER/MUSEUM slots, +2c/turn building-tier, overflow→lump,
rival works in-gate 6 seeds/28 works, lane `great_works`); B-8 →
90% (slice G: spawn-only civilian chassis at claim, +5 CS
land/naval auras at the quantized sites, rival GENERAL war-walk;
the slice's hunt: the aura-plane cache missed RL-verb general
moves → position-fingerprint key; ADMIRAL in-gate 18/24, lane
`gp_aura`). 2026-07-20 ROUND B8 K/L/T parallel worktrees (brief
gpu/ROUND_B8.md, task #64): B-21 RESOLVED-minus-rows (K: 3/6-envoy
channel re-keyed to CS_TYPE_BUILDINGS tiers both seats, suzerain
perk LIVE 14/24 rows, lane `cs_bonus`; K's hunt found NEW A-25 —
conquered-city luxuries missing from the GPU empire amenity pool —
dodged 9196→9197, the B10 exporter sweep auto-removed the orphan);
A-12 RESOLVED (L hunt-free: rival levy at the A-5 gold-block
position, shared per-CS cooldown; rival quests ZERO-DRAW
deterministic first-satisfiable — the draw-count-risk deferral
dissolved by design; in-gate 6 levies/73 quests/24 completions,
lane `cs_verbs`); B-23 → 70% (T: route duration 20t ALL routes —
1122 in-gate expiries; international routes rival→player +
TS player→rival API, gold-only, war-interdicted, lane `trade2`;
T's hunt: the GPU at-capacity early return skipped route expiry —
`_expire_rival_routes` now runs on every exit path). 2026-07-20
task #55 SERIAL S1-S4 (brief gpu/GEOPOLITICS_DESIGN.md; GEO-1 agent
S1 992ea13 + S2 00f386b, GEO-H hunt 97ace18 = G-6+G-7 fixes, GEO-2
agent S3 c007280, S4 main-session): A-19 + B-33 RESOLVED — per-pair
war state live both engines, rival↔rival DoW/peace/capture in-gate
(4/24 seeds, 41 DoWs, 38 peaces); B-22 → 50% — denouncements +
FORMAL/SURPRISE casus belli + ww ×2/×1; B-15 → 95% — rival↔rival
magnitude raised, player −4 ceiling deferred on the NEW G-8 dormant
sighting (cap-32 experiment, unverified); GEO-2's hunts: the
anti-thrash DoW guard (same-turn declare/peace thrash) + the TS
`hostileRangedStrike` ranged-vs-rival scope-out (a pre-existing
S2-dormant latent). S4: lane `geopolitics` (8 pokes) +
tests/geopolitics.test.ts (7); three poke lanes fixed TEST-side on
the reshuffled trajectories — purchase (founding side-channel bound),
cs_verbs (levy units war-march off the ring: count by pool+civ+type),
district_breadth (Encampment placement probes fixtures in order) —
the B5/B7 poke-lane lesson firing again. 2026-07-20 #69 A25_G8
SERIAL main-session (brief gpu/A25_G8.md): A-25
RESOLVED-AS-VERIFIED-CORRECT (S1: the 9196 repro dissolved under the
#55 reshuffle — no capture on the current trajectory; the
capture→luxury-pool path poke-verified via `rc_registry` lane poke
d; 9196 RESTORED in-gate; FISHING_BOATS/luxreq-−9 note recorded on
A-18); G-8 RESOLVED-AS-REFUTED (S2: cap 16→32 with a proper export
runs the ENTIRE ladder green on the identical engine — the #55-S3
sighting was an experiment artifact, likely a raised TS constant
without re-export); B-15 CLOSED (the −4 ceiling live). No engine
fix shipped the whole round — both closures were re-verification,
the G-3 rule's biggest single payoff yet. Battery 36 lanes 516s.
2026-07-20 #68 B-24 GOVERNORS/ERAS (38f862c..78f4f52, brief
gpu/GOVERNORS_DESIGN.md, serial S1-S3 main-session + S4 Opus
coverage agent — ALL FOUR STAGES HUNT-FREE, the first fully
hunt-free multi-stage behavior round): S1 era-score substrate inert
(12 hook pairs, statelog-logdiff hook-parity proof, threshold
evidence measured); S2 Ages live (evidence-pinned DARK 3/GOLDEN 10,
source-civ pressure factors 0.5/1/1.5 halves-exact at all three
loyalty sites, player+rival age COMPARED trace columns — HEAD 23,
rival block 16); S3 governors (stateless greedy quantized-milli
+8 anchors; buoyed seed 9301 1→3 cities); S4 `governors` lane 7
pokes + 7 vitest (player-Golden axis poke-pinned). B-24 → 70% —
the DEDICATION system (Golden bonuses, Normal/Dark dedication,
HEROIC Age w/ prevAge substrate), dark-age policies and governor
establishment/promotions stay open (owner-confirmed enumeration).
Battery 37 lanes 543s. 2026-07-26 #70 ROUND SMALLS (brief
gpu/ROUND_SMALLS.md, owner-directed EXPERIMENTAL batched mode — all
slices implemented FIRST, ONE ladder at the end, no per-slice gates):
S1 B-20 music yields per kind, S2 B-8 aura at every unit-vs-city and
city-strike roll (23 sites), S3 B-8 +1 MP via a frozen per-turn
snapshot, S4 A-9 palace relocation, S5 B-26 ranged barbs. TWO
FABRICATED PREMISES caught by the OWNER before they shipped: B-20's
recorded "music +1c/+1g split" (no Great Work pays gold in Civ 6 — the
real gap was the MAGNITUDE, music 4 vs writing 2 under GS) and A-9's
invented selection rule (real Civ 6 uses HIGHEST POPULATION). Both are
why verify-before-implement is now mandatory: the gates prove the two
engines agree, never that they agree with Civ 6. The batch then
exposed FOUR dormant latents — G-9's capital-is-column-0 family (trace
Palace count, CS envoy capital bonus, suzerain perk, and the scripted
production chain) and G-10's missing CITY_CENTER district on conquered
city-states — none introduced by this round, all fixed. Subagents
caught three spec errors of MINE by reporting discrepancies instead of
silently mirroring: a missing `rngrc` site, the rivalPhase movement
re-reset that wiped the rival aura AND broke the heal gate, and the
`full_mp` freeze-point.)

Per-item weights (done% in parens where partial):
- A: A-5r 2 (95% — tile purchase → #50), A-7r 4 (done — ROUND B3
  closed the card wiring), A-9 4 (90% — ROUND B9; NEIGHBORHOOD +
  palace-relocation residuals), A-11 4 (done — A-12b closed the CS
  residual; the GPU player-route note rides A-18/#50),
  A-23 2 (RESOLVED — 2026-07-27, per-city worked-tile scan),
  A-21 2 (RESOLVED — 2026-07-27, player pillage verb),
  A-22 2 (RESOLVED — 2026-07-27, rival specialists + GPU model),
  A-18 3 (70% — 2026-07-27: player REPAIR + resource-improvement RL verbs
  landed, 17->24 action columns; the CS-attack column is BLOCKED on a
  missing player<->CS war state, and the P8 re-baseline is owner-deferred),
  A-12 4 (RESOLVED — ROUND B8 slice L closed the levy + zero-draw
  quest deferrals; 2-step levy ladder + UI-only player levy are
  recorded residuals), A-17 4 (done — #41 stage 1), A-18 3,
  A-19 4 (RESOLVED — task #55 S1/S2: per-pair war state
  `atWarRivals`/`rr_war`, symmetric hostility, rival↔rival capture
  via the existing transfer, zero-draw pairwise DoW + peace),
  A-20 2 (done),
  A-21 2, A-22 2, A-23 2 (new — split from A-17: civ-level
  worked-tile scan), A-24 2 (done — ROUND B10 slice R: per-rc
  placement rule + env-gated registry invariant scan), A-25 2 (done —
  #69 S1: the B8-K sighting unreproducible, capture→luxury-pool path
  poke-verified correct (`rc_registry` lane poke d), 9196 restored
  in-gate; FISHING_BOATS −9 note moved to A-18).
- B combat: B-1 3 / B-2 2 / B-3 2 / B-4 3 / B-5 2 / B-6 8 / B-7 2 /
  B-9 3 / B-10 3 / B-28 1 / B-29 2 / B-30 2 / B-31 1 / B-32 2 (done);
  B-15 2 (done — #55 S3 differential + #69 S2 cap 16→32: the −4
  ceiling live on every axis, G-8 refuted); B-26 3 (70% —
  ROUND B10: era ladder + barb ZOC; cliffs/ranged/naval/scout-raid
  remain); B-8 2 (90% — ROUND B7 slice G: spawn-at-claim chassis +
  +5 CS auras; +1 MP half residual).
- B progression: B-11 4 / B-12 3 / B-13 3 / B-14 1 (done);
  B-27 4 (75%).
- B economy/religion: B-16 2 / B-19 2 (done); B-17 2 (85%); B-18 4
  (95% — ROUND B6: enhancer effects + missionary chassis + religious
  victory; apostles/theological combat + player missionaries (#50)
  remain); B-20 3 (70% — ROUND B7: multi-charge + slotted works;
  abilities/tile-activation/music-split remain); B-21 2 (RESOLVED
  minus 10 descoped suzerain rows — ROUND B8 slice K: building re-key
  + suzerain perk, both seats); B-23 3 (70% — ROUND B8: route
  duration both engines (gate-proven, 1122 expiries) + international
  routes (rival→player, TS player→rival; intl leg gate-unreachable,
  poke-pinned); Trader unit/roads remain).
- B meta: B-25 3 (80% — religious victory landed; player project
  path + Culture/Diplomatic victories open); B-22 3 (80% — alliances + warmonger cost 2026-07-27; task #55
  S3: denouncement grudge + FORMAL/SURPRISE warKind + ww ×2/×1
  differential; alliances/World Congress/warmonger/peace-terms open);
  B-24 3 (70% — #68: era score + Ages + loyalty modulation +
  governor anchors ALL LIVE; the dedication system (Golden bonuses /
  Normal-Dark dedication / Heroic Age), dark-age policies and
  governor establishment/promotions remain);
  B-33 3 (RESOLVED — task #55 S2, the fidelity face of A-19).
- #70 ROUND SMALLS deltas (2026-07-26): A-9 4 (95% — palace relocation
  LIVE both engines, highest-population survivor, ties to acquisition
  order; `capitalTiles`/`cap_tile_*` deliberately static, which is what
  real Civ 6 does — original capital = domination target, relocated
  Palace = the bonuses. NEIGHBORHOOD + thin player regional coverage
  remain); B-8 2 (95% — the aura now joins EVERY roll where a unit
  fights a city or a city strikes a unit, and the +1 MP half is live via
  a per-turn FROZEN snapshot; naval war-march targeting + the
  controlled-rival RL mask ride #50); B-20 3 (75% — the music magnitude
  corrected to the real GS value; see the REFUTATION and the six-item
  enumeration in its entry); B-26 3 (80% — ranged barbs live, every
  third camp; cliffs, naval barbs and scout-raid escalation remain).
- #71 ROUND RESIDUALS deltas (2026-07-26). Batch 1: A-5r 2 (97% —
  scripted rival tile purchase landed BOTH engines, the trigger held
  inert behind RIVAL_TILE_BUY_LIVE pending its own hunt); A-9 4 (97% —
  NEIGHBORHOOD housing/appeal tiers both engines, scaffold row inert);
  B-8 2 (100% outside #50 — naval war-march targeting closed the last
  non-#50 residual); B-18 4 (97% — Apostle chassis + theological combat
  landed, the buy inert behind APOSTLE_BUY_LIVE); B-24 3 (75% —
  dedication substrate + payouts incl. the prevAge Heroic substrate;
  the named Golden-Age catalog, dark-age policies and governor
  establishment/promotions remain); B-26 3 (85% — scout-then-raid
  opener; cliffs and naval barbs remain).
  Batch 2: B-17 2 (95% — the ENCAMPMENT garrison pool and its movement
  block, both engines: a 100 HP per-TILE pool mustered at completion,
  hostile entry barred until it is beaten to 0, a melee assault wired
  through attackTargets so barbs/rivals/the player all reach it, the
  strike silenced at 0, repair on the wall pool's gate. Ranged-vs-
  district is the recorded residual); B-23 3 (85% — ROADS: laid by
  trade routes along the Trader's walk, road-to-road steps ignore the
  terrain penalty and, from the Classical era, the river charge. The
  physical Trader unit remains the residual).
  Batch 3: B-27 4 (85% — SEASIDE RESORT, both engines. Sourced against
  the Civilopedia: requires RADIO, buildable only on a FLAT COASTAL
  Grassland/Plains/Desert tile with BREATHTAKING appeal (>= 4), and it
  yields GOLD equal to that tile's Appeal — a DYNAMIC yield, so the
  catalog row is empty and the gold is computed in tileYields /
  _eff_yields and BOTH rival yield paths. Appended LAST to
  IMPROVEMENT_IDS so no existing improvement index moves. The matching
  TOURISM (also = Appeal) is NOT modeled — tourism does not exist in
  either engine, a recorded B-20 residual — and the PLAYER's RL build
  verb rides #50/A-18 with the other resource-improvement verbs, so the
  15% residual is those two. CORRECTION: the pre-build claim that this
  would be gate-UNREACHABLE was WRONG — Radio is reached and a resort is
  built in 1 of the 24 seeds (seed 9066, ~turn 210), which is exactly
  what caught the real bug: the rival yield paths do not share
  _eff_yields, so the appeal-gold had to be added to all three.
  Remaining B-27 tail: FORT (needs a Military Engineer unit) and the
  post-tech-tree improvements.
- #71 FLAG SWEEP (2026-07-27): five of the six inert `_LIVE` flags are now
  ON, each flipped and gated INDIVIDUALLY. A-5r 2 (100% outside #50 —
  scripted rival tile purchase LIVE; the PLAYER's buyTile verb rides #50);
  B-26 3 (90% — the scout-then-raid opener LIVE; cliffs and naval barbs
  remain); B-24 3 (80% — dedication payouts LIVE; the named Golden-Age
  catalog, dark-age policies and governor establishment/promotions remain);
  B-8 stays 100% outside #50 (the admiral war-march was its last inert
  residual and is now live). The city-attack religion adder (#71 DEBT-2)
  is live at all six sites.
  ONE REAL ENGINE BUG in the sweep — A-5r: TS BREAKS out of the per-city
  loop when the first city WITH a candidate is unaffordable; the GPU
  CONTINUED to the next city and bought a cheaper tile nine turns early
  (seed 9158 t157, ~98 gold). Two other recorded blockers were STALE and
  closed by re-verification (ADMIRAL_MARCH's seed-9287 split and the city
  religion adder's rollout reds both predate #71 batch 1's naval-march and
  DEBT-2 GPU work). APOSTLE_BUY_LIVE remains OFF with a full hunt log in
  its comment — its recorded rationale was also wrong, and the true split
  is a downstream religious-unit LIFECYCLE drift, not a buy-timing one.
- B-20 TOURISM SUBSTRATE (2026-07-27). TOURISM now exists on both engines
  and is TRACED, so parity proves it: a per-civ cumulative accumulator
  (`state.tourismTotal` / `RivalCiv.tourism`; GPU `tourism_total` /
  `r_tourism`, both in _MUTABLE), fed by GREAT WORKS at the sourced
  Gathering-Storm values that pair tourism with culture (writing 2, music 4)
  and by SEASIDE RESORTS, each worth its tile's APPEAL. Accumulated ONCE per
  turn at the civ level at the same position in both engines (right after
  the city loop, BEFORE the great-people advance), attributed by tile
  OWNERSHIP rather than worked-tile assignment so the seats cannot drift on
  citizen placement. Zero-draw, integer-only. This is the shared blocker
  inside B-20, B-25 and B-27, so it unblocks all three.
  HUNT (off-script only): the GPU summed Great Works over EVERY city column
  while TS iterates `state.cities` — a captured city kept paying tourism
  forever (seed 9105 t144, +4 = one music work of a lost city). Alive-masked
  on both seats. It surfaced only in the rollout because the scripted player
  never loses a city; culture stayed green throughout, which is what
  identified the counts as correct and pointed at the sum itself.
  WONDERS LANDED (same day, second slice): every COMPLETED wonder a civ owns
  pays `wonderTourismBase` (2) + 1 per era it has advanced PAST the wonder's
  own era — the real Civ 6 rule. A wonder's era is the era of its UNLOCK
  (tech or civic); a civ's era is the HIGHEST era among its completed
  techs/civics, so both sit on the SAME scale (`civEraIndex`/`_civ_era`,
  exported `techEra`/`civicEra`/`wonders.eras`).
  SECOND HUNT: POSITION IS LOAD-BEARING. TS accumulates rival tourism AFTER
  this turn's TECH completions but BEFORE any civic completes; the GPU
  accumulated one step early, so the wonder term read a stale ERA and lost
  exactly one era-past point per wonder (seed 9014 t112, a constant +1/+2).
  Moved to the matching position.
  STILL OPEN in B-20 (as of #71): relics, artifacts, National Parks, the
  Printing doubling, Great Works of ART and archaeology. B-20 -> 85%.
  (#73 closed relics + ART; #74 closes the PRINTING doubling — see below.)
  **RELICS LANDED (2026-07-27, #73).** Real Civ 6 counts a Relic as a Great
  Work held in a TEMPLE's single slot, paying +4 FAITH and +8 TOURISM — the
  densest tourism source in the game (verified: Civilization wiki
  "Relics"/"Great Work (Civ6)", Gathering Storm). Per-city counter
  `City.relics` / GPU `relics` + `rc_relics` (both in _MUTABLE), placed into
  the LOWEST city holding a temple with a free slot (array order =
  city/rc slot order); a relic with no open slot anywhere is LOST (real
  Civ 6's reserve storage is a recorded simplification). Faith rides the
  BUILDINGS bucket at the `greatWorkCulture` position in all three yield
  paths; tourism joins `_tourism_of`, ALIVE-masked like the Great Works.
  SOURCE + the one deviation: a relic is created when an Apostle carrying
  the MARTYR promotion dies in theological combat. Promotions are unmodeled
  and `theologicalCombat` is deliberately ZERO-DRAW (a conditional roll
  there would have to be mirrored draw-for-draw), so EVERY apostle killed
  in theological combat martyrs. That overstates relic frequency by roughly
  the promotion odds (~1 in 7); recorded, not hidden. A dead MISSIONARY
  yields nothing. Granted defender-then-attacker, matching the TS disband
  order, so slot placement is order-exact.
  MEASURED REACHABLE (this is why relics and not art works — see below):
  26 relics are held at t250 across 4 of the 24 seeds, and the tourism
  ceiling rose from 7 visiting tourists to 12. Parity green at 0.0 milli on
  the first pass, and NOT vacuously — rFaith and rTourism are both compared
  columns. Poke lanes: `tests/relics.test.ts` (6) + the `relics` battery
  lane (constants, placement, dead-city masking, tourism term, _MUTABLE).
  B-20 -> 92%.
  **GREAT WORKS RE-KEYED TO THE REAL CIV 6 MAPPING (2026-07-27, #73).**
  ART is now a real Great Work kind and the three kinds sit in their REAL
  buildings (verified: Civilization wiki per-building and per-Great-Person
  pages, Gathering Storm):
    kind 0 WRITING - Amphitheater,     2 slots, +2 culture / +2 tourism, Writer   makes 2
    kind 1 ART     - Art Museum,       3 slots, +2 culture / +2 tourism, Artist   makes 3
    kind 2 MUSIC   - Broadcast Center, 1 slot,  +4 culture / +4 tourism, Musician makes 2
  ARTIST is a work-carrying class now (it was instant-lump), and both engines
  index works by KIND rather than the old writing/music boolean:
  `GW_BUILDINGS/GW_SLOTS/GW_WORKS_PER_PERSON/GW_CULTURE/GW_TOURISM` +
  `GW_CLASS_KIND` in TS, `gw*ByKind` exported, `gw_art`/`rc_gw_art` planes and
  a `kind` argument through `_place_player_works`/`_place_rival_works` on GPU.
  WHY THIS ENTRY WAS REWRITTEN — a process correction worth keeping. The
  first version of this round MEASURED that the Theater-Square line is nearly
  unbuilt in the gate (AMPHITHEATER in 1 city, MUSEUM in 1, BROADCAST_CENTER
  in 0) and used that to REJECT the faithful re-key, on the grounds that
  moving music to its real home would take the gate's music works from 2 to
  zero. The owner rejected that reasoning outright: the ultimate goal is RL on
  a FAITHFUL reproduction of Civ 6, so gate reachability is a measurement tool
  for coverage and prioritisation, never a licence to keep a deviation. The
  deviation is now GONE.
  MEASURED EFFECT, reported honestly: player Great Works over the 24 seeds x
  250 turns went writing 2 / music 2 / art 0 -> writing 2 / music 0 / art 3.
  Music really did drop to zero (no Broadcast Center is ever built) and art
  gained 3 (one Artist fills the one Museum). Net Great-Work tourism 12 -> 10.
  Lower, and correct. Poke lanes updated to the real slot counts on both sides
  (`tests/great-works.test.ts` gained an ARTIST lane; the `great_works`
  battery lane asserts the per-kind exporter tables, the 1-slot Broadcast
  Center overflow and the exact 3-into-3 Artist fill).
  **PRINTING LANDED (2026-07-27, #74).** Real Civ 6's PRINTING tech DOUBLES the
  TOURISM of Great Works of WRITING (verified: Civilization wiki Printing /
  Great Work pages — it is the TOURISM that doubles, NOT the Amphitheater's
  slot count, which stays at 2; culture is untouched). `GW_PRINTING_TECH` +
  `GW_PRINTING_WRITING_MULT`, `greatWorkTourism(city, printing)` keyed on the
  OWNING civ's tech state on both seats; GPU `_gw_printing_tech` multiplies the
  writing term inside `_tourism_of`. Zero-draw, integer-only.
  MEASURED reachable: PRINTING is researched in 9 of the 24 player seeds and by
  46 rival civs by t250. Poke-pinned in tests/great-works.test.ts (doubles
  writing, leaves art/music and all culture untouched).
  B-20 RESIDUALS NOW: artifacts, National Parks and archaeology. B-20 -> 95%.
  #72 MEASUREMENT — these residuals now have a NUMBER on them. With only
  Great Works (writing/music), Seaside Resorts and wonders feeding it,
  lifetime tourism reaches at most 7 VISITING tourists over 250 turns while
  lifetime culture yields up to 97 DOMESTIC ones, so B-25's culture victory
  is unreachable by a factor of ~14. Closing the tourism residuals is what
  would make that condition live rather than merely correct.
  COVERAGE: with wonders in, rival tourism is non-zero in 23 of the 24 gate
  games (max 7137) — well exercised. The PLAYER's is non-zero in only 1
  (the scripted player rarely builds wonders or Great Works), so the player
  side rides the rollout.
  ARITHMETIC NOTE: batch 1's header re-add put B at 81.8; re-summing
  from these per-item weights gives 81.63. The 0.2 over-claim is
  corrected here — the FOURTH time this table has drifted from its own
  ledger. Always re-sum from the per-item lines, last occurrence wins.
- B-26 NAVAL BARBS (2026-07-27). B-26 3 (90% -> 95% — coastal camps field
  GALLEY/QUADRIREME raiders on both engines; see the body entry for the four
  GPU bugs and the two poke lanes). Delta +0.15 on B. Only CLIFFS and
  camp-spawn escalation remain in B-26, and cliffs are the larger of the two
  by a wide margin (a new edge property touching mapgen, movement and
  adjacency).
- B-25 CULTURE VICTORY (2026-07-27, #72). B-25 3 (80% -> 90% — the culture
  win lands on both engines, with per-rival lifetime culture as its traced
  substrate; see the body entry). Delta +0.30 on B. Diplomatic victory is the
  remaining named condition and is blocked on the World Congress (B-22).
- B-20 RELICS + the REAL GREAT-WORK MAPPING (2026-07-27, #73). B-20 3
  (85% -> 92%): martyr relics on both engines (temple-slotted, 4 faith + 8
  tourism, measured reachable at 26 held by t250 over 4 seeds), PLUS ART as a
  real Great Work kind with all three kinds moved to their real Civ 6 buildings
  (Amphitheater 2 / Art Museum 3 / Broadcast Center 1). Delta +0.21 on B.
  I first REJECTED the re-key because it costs the gate its music works; the
  owner overruled that — reachability never licenses a deviation. Artifacts,
  National Parks, the Printing doubling and archaeology remain.
- **NEW RESIDUAL CLASS — UNSOURCED DATA VALUES (raised 2026-07-27, #73).**
  The #73 owner directive ("the ultimate source of truth is Civ 6; the goal is
  RL on a FAITHFUL reproduction") points at a gap the A/B chapters do not
  currently name. The MECHANICS have been sourced item by item, but the DATA
  LAYER largely has not: 18 files under src/data + src/core carry explicit
  `eyeballed` / `approximate` / `stand-in` markers on their magnitudes —
  builtWonders (4 sites), policies (2), improvements (2), core/rivals (2), and
  one each in wonders, units, rivals, resources, religion, projects,
  constants, cityStates, buildings, boosts, appeal, combat.
  WHY IT MATTERS FOR P8: parity gates prove the two engines agree, and every
  fidelity round so far has verified a RULE. A wrong CONSTANT passes every gate
  forever and is invisible to both — and a policy card or wonder yield that is
  off by 2 changes what an RL agent learns to value just as surely as a wrong
  rule does. This is the same structural blind spot the verify-before-implement
  directive was written for, applied to numbers instead of behaviours.
  The natural shape is a per-file sourcing sweep (cite or correct each marked
  value), cheapest first: buildings/improvements/projects are small tables with
  well-documented Civ 6 values; builtWonders and policies are the large ones.
  **SLICE 1 — src/data/improvements.ts: RETRACTED AND CORRECTED
  (2026-07-28, #78).** The original entry claimed CAMP's `gold: 2` was wrong
  and "corrected" it to 1, citing a web-SEARCH SUMMARY, and presented it as
  this class's headline result ("23 Camps at t250 across 16 of 24 seeds, the
  wrong constant was skewing two-thirds of the gate"). **THAT WAS THE ERROR.**
  The Gathering Storm CIVILOPEDIA entry for the Camp reads "+2 Gold" and
  "+0.5 Housing". The repo's original 2 was right; the sweep broke a correct
  constant and shipped the break as a success story. Restored to 2, now
  sourced from the Civilopedia rather than a summary.
  Re-verified in the same pass and correct as written: Plantation (+2 gold),
  Pasture (+1 production), Quarry (+1 production), Farm, Mine, Lumber Mill,
  Fishing Boats, Oil Well. NOT MODELED (recorded): the Camp gains +1 Food and
  +1 Production with MERCANTILISM and a further +2 Gold with SYNTHETIC
  MATERIALS; this model pays the base yield only.
  THE REAL LESSON, which outranks the slice: a WebSearch result is a SUMMARY
  over hits, not a source. Of the four VALUE CHANGES this sweep made, the two
  taken from search summaries (CAMP, and COAL production 2 -> 1+1) were WRONG
  and are both reverted; the two taken from a direct Civilopedia FETCH (Arena,
  Stadium) were right; one summary-sourced change (Crater Lake +5 faith) was
  later confirmed right by fetch but was unverified when shipped. Primary
  fetches 2/2, summaries 1/3. The COAL summary had pattern-filled
  "+1 Production and +1 Food" from the NITER row directly above it.
  Slice 3 had ALREADY established the correct behaviour — it refused to change
  three housing constants on ambiguous search evidence — and the sweep then did
  the forbidden thing twice anyway. Recorded in memory `source-of-truth`.
  **SLICE 2 DONE — src/data/buildings.ts (2026-07-28, #78).** TWO errors, both
  verified directly against the Gathering Storm Civilopedia building entries:
  ARENA amenities 1 -> **2** ("+1 Culture", "+2 Amenities from entertainment" —
  the culture was already right, the amenity count was not), and STADIUM
  amenities 2 (marked "approximate") -> **1**, its base value. Stadium's further
  "+2 Amenities additionally when POWERED" is NOT modeled — no power system
  exists in either engine — and is now a recorded residual rather than being
  silently folded into the base, which is what the old 2 effectively did.
  GATE-UNREACHABLE, stated plainly: the Entertainment Complex line is entirely
  unbuilt across the 24 seeds (0 Arenas, 0 Zoos, 0 Stadiums), so parity green
  here is trivially true and this correction rests on the SOURCE, not on any
  gate. That is the opposite of slice 1's Camp, which 16 of 24 seeds exercised
  — and it is exactly why this class needs sourcing rather than testing.
  **SLICE 4 — src/data/projects.ts (2026-07-28, #78).** The district -> yield ->
  GP-class mapping checked against the Civilopedia project entries. FIVE of six
  correct as written (Campus/science/Scientist, Holy Site/faith/Prophet,
  Commercial Hub/gold/Merchant, Harbor/gold/Admiral, Encampment/-/General).
  ONE SOURCED DEVIATION, recorded not fixed: the THEATER SQUARE FESTIVAL grants
  Great WRITER, ARTIST **and** MUSICIAN points in real Civ 6 (each ~11% of the
  production invested, Standard speed) and converts 15% of the city's production
  to Culture; this model awards ARTIST alone because `gpClass` is a single
  field. Widening it to a class LIST and mirroring the multi-class award on the
  GPU is a behavioural change to GP earn timing and needs its own gated round —
  the rate and the class list are now recorded in the file so that round does
  not re-derive them.
  **SLICE 5 — src/data/resources.ts BONUS rows (2026-07-28, #78).** All seven
  bonus-resource yields VERIFIED CORRECT against the wiki resource list (Wheat,
  Rice, Cattle, Sheep, Bananas +1 Food; Stone, Deer +1 Production). No change.
  ONE SOURCED RESIDUAL found in the pass: real Civ 6 gives RICE and WHEAT an
  ADDITIONAL +1 Food when the city has a working WATER MILL. This model gates
  the Water Mill on a river and pays its own flat +1 food/+1 production but not
  the per-resource bonus. Recorded, not fixed — a yield change needing its own
  gated round with the term at the same position on both engines. The LUXURY and
  STRATEGIC rows are NOT yet swept.
  **SLICE 6 — src/data/cityStates.ts envoy system (2026-07-28, #78).** Verified
  against the wiki's City-state / Suzerain pages. CORRECT: the SUZERAIN rule
  (most envoys AND at least 3) and the 3-/6-envoy thresholds.
  ONE SOURCED DEVIATION, recorded not fixed: the FIRST envoy grants **+1** of
  the city-state's yield in real Civ 6, not +2, with TRADE city-states the lone
  exception at +2 Gold (and their 3-envoy step at +4 Gold rather than +2). This
  model pays a flat +2 for every type at 1 envoy. Correcting it is a yield
  change needing its own gated round on both engines, and it interacts with the
  existing B-21 note (the real 3-/6-envoy steps also key on the district's
  BUILDING TIERS, already recorded there as a degraded channel).
  **SLICE 7 — src/core/appeal.ts (2026-07-28, #78).** Every appeal term VERIFIED
  CORRECT against the wiki's Appeal page (adjacent natural wonder +2; mountain /
  woods / coast / lake +1; rainforest, marsh, mine, quarry, oil well, industrial
  zone, encampment -1; cumulative). TWO SOURCED GAPS, recorded not fixed — each
  moves Neighborhood housing AND Seaside Resort yields, so each needs its own
  gated round: (1) an adjacent OASIS gives +1 and adjacent RIVERS give +1, and
  this model has neither term (it credits LAKE by terrain only); (2) a tile that
  IS a mountain or natural wonder is BREATHTAKING BY DEFAULT in real Civ 6,
  where this model scores every tile purely from adjacency.
  **SLICE 8 — src/data/wonders.ts (2026-07-28, #78).** ONE REAL ERROR:
  CRATER_LAKE paid `faith: 4`; real Civ 6 gives it **5 Faith and 1 Science**
  (Civilization wiki, "Crater Lake (Civ6)"). Corrected. DEAD_SEA (+2 culture /
  +2 faith) re-verified and correct. The other ten natural wonders are NOT yet
  sourced individually, so the file keeps a NARROWED marker.
  **SLICE 8 RE-VERIFIED BY DIRECT FETCH (2026-07-28).** CRATER_LAKE's +5 Faith
  / +1 Science is CONFIRMED by the GS Civilopedia (it had been changed on a
  search summary). DEAD_SEA (+2 Faith / +2 Culture) and PANTANAL (+2 Food /
  +2 Culture) also confirmed correct as written.
  ONE SOURCED DEVIATION recorded in the same pass — YOSEMITE: real Civ 6 makes
  it IMPASSABLE and gives +1 Gold / +1 Food / +1 Science to ADJACENT tiles,
  where this model has it passable paying gold+science on its OWN tile. Three
  differences at once (passability, the own-tile-vs-adjacent channel, a missing
  +1 Food), so it is a mechanic change needing an adjacency yield channel for
  natural wonders — its own round, not a constant tweak.
  CORRECTED TALLY after the retraction above: of the sweep's value changes,
  TWO stand (Arena 1->2, Stadium 2->1, both Civilopedia-fetched) plus Crater
  Lake 4->5 (now fetch-confirmed); TWO were WRONG and are reverted (Camp,
  Coal), both taken from search summaries.
  **SLICE 15 - luxury resources + LUXURY_AMENITY_CITIES (2026-07-28, #78).**
  Spot-checked against the GS Civilopedia by direct fetch: WINE (+1 Food /
  +1 Gold) and COTTON (+3 Gold) both correct as written. Both entries also read
  "+4 Amenities (1 per city)", which VERIFIES `LUXURY_AMENITY_CITIES = 4` in
  data/constants.ts — a third value confirmed, in a different file, off the same
  two fetches. Ten luxury rows remain individually unfetched; NARROWED marker.
  **SLICE 13 - src/data/rivals.ts header (2026-07-28, #78).** The header said
  "all eyeballed", which this session made FALSE: relics, the culture-victory
  thresholds, diplomatic favor, the World Congress constants and the dedication
  catalog were all sourced into this file with citations at their definitions.
  Header corrected to list what IS sourced and narrow the marker to what is
  genuinely still model tuning - rival pacing/aggression, the ERA_* thresholds
  (evidence-pinned to this model's OWN measured distribution, not to Civ 6),
  the RR_* war/denounce/warmonger magnitudes and the governor constants. Same
  class of find as slice 12's stale religion header: a blanket marker that is
  wrong in BOTH directions hides real sourcing and invites false confidence.
  **SLICE 12 - src/data/religion.ts (2026-07-28, #78).** VERIFIED CORRECT:
  PANTHEON_FAITH_COST = 25 (Standard speed) and RELIGION_PRESSURE_RANGE = 10
  tiles. Also caught a STALE HEADER: it claimed "spread/pressure isn't
  modeled - once founded, all of your cities follow your religion", which
  B6-S2/B-18 refuted long ago (real per-city pressure, missionaries, apostles
  and theological combat ship on both engines, and #76 made religious
  predominance a victory condition). Corrected. NARROWED marker kept for
  SPREAD_PRESSURE / MISSIONARY_CAP / APOSTLE_CAP and the belief magnitudes -
  those are model stylizations, not Civ 6 values.
  **SLICE 11 - src/data/boosts.ts (2026-07-28, #78).** BOOST_FRACTION = 0.4
  VERIFIED CORRECT for the GS ruleset: boosts gave 50% in vanilla and were cut
  to 40% in Rise and Fall, which GS kept. Worth recording because 0.5 is the
  number most older guides quote, so a future "correction" toward 50% would be
  a regression. The individual boost CONDITION TEXTS keep a narrowed marker -
  not checked line by line.
  **SLICE 10 - src/core/combat.ts damage formula (2026-07-28, #78).** The BASE
  and EXPONENT are VERIFIED EXACT against the reverse-engineered Civ 6 formula
  (damage = 30 * e^(strengthDiff / 25) * random): base 30 matches, and
  `30 * exp(0.04 * q / 10)` with q = round(diff*10) is exp(diff/25) - the same
  curve, pre-quantized for the GPU exp table. That is the single most
  load-bearing formula in the model and it is right.
  The RANDOM RANGE is CONTESTED and deliberately NOT changed: the community
  formula quotes 0.75-1.25, but the SAME source says equal-strength hits land
  "reliably between 24 and 36" - and 30 x [0.75, 1.25] = [22.5, 37.5] while
  30 x [0.8, 1.2] = [24, 36] exactly. The repo's existing 0.8-1.2 is the
  internally consistent reading, so it stands. Recorded, not flipped.
  **SLICE 9 — src/data/units.ts COMBAT STRENGTHS: FIVE ERRORS FOUND, CHANGE
  REVERTED PENDING A HUNT (2026-07-28, #78).** Checked against a Civ 6
  unit-stat reference. FIVE combat strengths are WRONG in this model:
    SWORDSMAN   36 should be 35
    PIKEMAN     41 should be 45
    CROSSBOWMAN 15 should be 30   (its MELEE strength; ranged 40 is right)
    KNIGHT      48 should be 50
    GALLEY      30 should be 25
  Verified CORRECT: Scout 10, Warrior 20, Slinger 5/15, Archer 15/25, Spearman
  25, Horseman 36, Musketman 55, Quadrireme 20/25, and every movement value.
  These feed `damageRoll` directly and are the most load-bearing constants in
  the model for an RL agent's combat decisions — the Crossbowman's melee is
  wrong by 2x.
  WHY IT IS NOT LANDED. Applying the five corrections produced TWO downstream
  effects and one RED gate:
   (a) EXPECTED: the hostile world gets genuinely stronger, and index 6's seed
       9079 loses every player city before t250. Root-caused, and a
       SEED_OVERRIDES entry (6: 9080, verified to survive at healthy size) is
       the sanctioned fix — that part is fine.
   (b) EXPECTED: tests/strategic-resources.test.ts hard-coded `>= 36` for the
       Swordsman. The right repair is to read `UNITS.SWORDSMAN.combat` from the
       roster, not to patch the literal — a stale literal asserting a wrong
       value is the same failure as the wrong constant, with a green test
       defending it.
   (c) THE BLOCKER: the battery's gpu-gate (PLAIN rollout) went RED at
       **seed 9235, turn 249, column 72 = rGScore1** — rival 1's empire score,
       TS 188400 vs GPU 191250, a 2.85-point gap. Scripted parity was green at
       0.0 milli and the FORCED-COMPACTION rollout passed; only the plain
       rollout reaches it, so it is configuration-dependent and may be a
       PRE-EXISTING latent that the stronger units merely made reachable.
  LEAD CHECKED AND REFUTED (same session) — recorded so the next hunt does not
  re-walk it. The theory was that TS `spawnUnit` updates `bestMeleeCS` for any
  `combat > 0 && !ranged` unit (which INCLUDES a naval GALLEY, one of the five
  values that moved) while the GPU might differ. VERIFIED SYMMETRIC:
   * the GPU gates on `_p_rng_str[type] == 0` — the same non-ranged rule, with
     no naval exclusion on either side;
   * both read `_p_combat`, the ROSTER table, not the 9-entry barb table;
   * both are MONOTONIC maxima — `best_melee` at engine.py `torch.maximum` in
     `_spawn_player`, and `r_best_melee` likewise in the rival spawn path
     (so a rival's tracker is NOT frozen at its fixture init, which was the
     other half of the theory).
  The only asymmetry found is benign: TS also requires `combat > 0` where the
  GPU does not, which admits combat-0 civilians into a `max()` that ignores
  them.
  SO THE DIVERGENCE IS ELSEWHERE. Next candidates, in order: the empire-score
  formula's own inputs (rGScore is a ×1000 float, tol 2, and the gap is 2850
  milli = 2.85 points — large enough to be a term, not drift); and whatever
  the plain rollout reaches at seed 9235 t249 that the forced-compaction
  rollout does not.
  **USE CHECKPOINTS FOR THIS HUNT - I did not, and that was the process error.**
  The gate NAMES the turn (seed 9235, t249), so the procedure is: re-run that
  one rng UNSHARDED with `--ckpt` (rollout.py writes checkpoints only when
  `args.shard is None`, so every 4-shard run - including the battery's own
  gpu-gate lane - produces NONE), then `gpu/ckptdiff.py --rng` to bracket, then
  resume from the nearest earlier checkpoint WITH logging. Do NOT re-run a full
  `--log` rollout plus a 72-game TS replay: that is the ~40-minute mistake made
  on the B-26 naval-barb hunt earlier in this same session, for a divergence
  the gate had already localised to a turn.
  The change is REVERTED so the tree stays green; the sourced numbers are
  recorded here so the next round starts from them.
  10 marked files remain; constants.ts, projects.ts, resources.ts,
  cityStates.ts, appeal.ts and wonders.ts carry NARROWED markers (swept parts cited in place, unswept
  parts named). SIX slices in, the pattern is settled: THREE files had real
  errors (improvements, buildings, cityStates), THREE were correct as written
  (constants water-housing, projects mapping, resources bonus rows), and every
  pass leaves a CITATION whether or not it leaves a diff.
  **SLICE 3 DONE — src/data/constants.ts water-housing (2026-07-28, #78).**
  RESOLVED AS VERIFIED-CORRECT. The first search returned a confusing framing
  (+3 / +1 / +0, deltas rather than totals) and the authoritative pages were
  unavailable, so the values were left alone rather than changed on ambiguous
  evidence. A second, better-targeted search settled it: real Civ 6 gives
  5 Housing for fresh water (river/lake/oasis), 3 for coastal, 2 for no water,
  and the Aqueduct raises a non-fresh city to a TOTAL of 6 (+4 landlocked,
  +3 coastal) while adding a flat +2 to a fresh-water city. ALL FIVE constants
  already matched — no change needed, marker cleared, citation recorded in
  place. A verified-correct outcome IS progress (the G-3 rule); the rest of
  constants.ts is NOT yet swept.
- #74 SMALLS (2026-07-27). B-20 3 (92% -> 95% — the PRINTING writing-tourism
  doubling, measured reachable in 9/24 player seeds + 46 rival civs) and B-22 4
  (50% -> 60% — the PLAYER's grievance twin + the gang-up consequence, measured
  live at 192 civ-turns over the threshold). Delta +0.09 +0.40 = +0.49 on B.
- #75 WORLD CONGRESS S1 (2026-07-28). B-22 4 (60% -> 70% — DIPLOMATIC FAVOR on
  both seats, traced, measured at 175-656 by t250). Delta +0.40 on B.
- #76 WORLD CONGRESS S2+S3 (2026-07-28). B-22 4 (70% -> 85% — sessions, the
  favor vote and Diplomatic Victory Points; measured at 5-6 sessions/seed and
  102 DVP awarded) and B-25 3 (90% -> 97% — the DIPLOMATIC victory closes the
  last named victory condition). Delta +0.60 +0.21 = +0.81 on B.
- #77 NAMED DEDICATIONS (2026-07-28). B-24 3 (80% -> 85% — the named catalog
  and its event-keyed DARK/NORMAL faces, 4 of 12 dedications, 8 event sites;
  measured at 199 payouts with the Age distribution unmoved). Delta +0.15 on B.
- #78 SOURCING SWEEP slices 1-2 (2026-07-28). improvements.ts fully sourced
  (CAMP gold 2 -> 1, exercised by 16/24 seeds) and buildings.ts fully sourced
  (ARENA amenities 1 -> 2, STADIUM 2 -> 1; gate-unreachable, source-only). Not
  A/B weight items — this is the new UNSOURCED DATA VALUES class, 2 of 18
  files done.
- E: closed — E-16 RESOLVED by owner decision 2026-07-18 (AGENT_PROMPT.md
  archived to docs/archive/ instead of refreshed); the E-sweep was 5 done.
- G-9 2 (RESOLVED — #70: "the capital is always city column 0", a dormant
  assumption in FOUR places, all fixed; see the body entry).
- G-10 2 (RESOLVED — #70: a conquered city-state's centre tile never got
  its CITY_CENTER district in TS; see the body entry).
- G: G-1..G-10 ALL done — chapter G EMPTY again. G-6 (task #55:
  exporter `st` plane froze the dynamic `!t.district`) and G-7 (task
  #55: TS `withFollowerBelief` shallow-clone aliasing) RESOLVED;
  G-8 2 (RESOLVED-AS-REFUTED — #69 S2: the cap-32 sighting was an
  experiment artifact, most likely a raised TS constant without a
  re-export; cap 32 ships green, see the body entry).

---

## A. Player–rival asymmetry (the symmetry contract's open gaps)

Rivals must be full-fidelity symmetric agents — same formulas, same
available actions; only the decision policy may differ. Verified
against live code 2026-07-12 (post-#36–#40): all seven inherited items
remain open; four new gaps found in the sweep.

**[opus-ok: …] tags (2026-07-13)** mark the sub-slices delegable to
Opus subagents off an exhaustive brief (per the parallel-subagent
model rule: Fable for engine-core bit-exactness — rival-city core,
yield/score/RNG paths, combat; Opus for periphery — tables, exporter
plumbing, mask columns, hunt localization). Untagged items and the
untagged halves of tagged items stay Fable/main-session work.

- A-5 (remainder). Scripted rivals spend gold on ONE building per civ
  per turn (the A-5 block in `rivalPhase` (rivals.ts); `_rival_phase`
  (engine.py)) but never gold-buy units or settlers, and no rival ever
  buys a tile. The player has `purchaseUnit`/`purchaseSettler`/
  `buyTile`+`tilePurchaseCost` (game.ts), and the CONTROLLED heads
  already carry the missing machinery — `production_mask`+
  `_apply_settlers_and_purchases` (engine.py) for seat 0,
  `rival_masks`+`apply_rival_actions` (engine.py, the VP-G2 buy
  building/settler/unit codes) for controlled rivals — so the gap is
  the scripted policy's verbs (units/settlers) plus tile purchase,
  which has no rival or GPU twin on ANY seat (`buyTile` is
  TS-player-only). **RESOLVED except tile purchase (2026-07-17,
  A-5r)**: scripted rivals gold-buy settlers and units — priority
  BUILDING > SETTLER > UNIT, one purchase/civ/turn, controlled-head
  VP-G2 semantics, milli-rounded affordability, refunds on failed
  spawn/found. Unit branch parity-validated (82 in-gate fires);
  settler branch never fires organically — poke-covered
  (`gpu/rival_purchase_test.py`), a recorded coverage gap, not a bug.
  Tile purchase stays open (no GPU verb on any seat — fold into the
  A-18/#50 verb work).
- A-7 (remainder). RESOLVED (2026-07-17 #46r LIVE; 2026-07-18 ROUND B3
  slice V closed): both scripted seats adopt governments/slot policies
  turn-exact; remaining GPU channels proven unreachable under greedy
  adoption (exporter ships all), tilePurchaseMult gate-inert pending
  the A-5 tile-purchase verb.
- A-9 (90% — 2026-07-19, ROUND B9 R1-R3, gpu/ROUND_B9.md). RESOLVED
  minus the NEIGHBORHOOD stretch. `SCAFFOLD_DISTRICTS` is 9-wide
  (+INDUSTRIAL_ZONE, +THEATER_SQUARE/+ENTERTAINMENT_COMPLEX on CIVIC
  unlocks via `unlockKind`, +ENCAMPMENT with GPU placement code 3 =
  notAdjacentToCityCenter); the exporter table carries every district's
  buildings incl. the four REGIONAL rows (regionalEffects semantics on
  every seat of both engines: `rivalRegionalEffects` /
  `_rival_regional` + the player-walk reg_y/reg_am terms;
  `SCRIPTED_HELD_BUILDINGS` is EMPTY) and the five WORSHIP rows
  (faith-purchase-only: `b_worship` masks all five pickers; rivals buy
  at the A-5 position — `WORSHIP_BUILDINGS[(r+1)%5]`, flat
  worshipFaithCost, Temple + complete Holy Site). `foundRivalCity`
  grants the first-city PALACE (`rc_is_cap`-keyed GPU terms; B-30
  strips on capture, nothing relocates). ENGINEER/GENERAL/ARTIST GPP
  accrue via the generic `GP_CLASS_DISTRICT` machinery now that their
  districts exist. In-gate at t250: 21/24 seeds with rival worship
  buildings, 48 rival palaces, 66 rival regional buildings. Coverage:
  vitest tests/district-breadth.test.ts + poke lane `districts`
  (gpu/district_breadth_test.py). RESIDUALS: (1) NEIGHBORHOOD
  (URBANIZATION civic, appeal-tier housing, GPU appeal plane) — the
  R4 stretch, dropped by the brief's pre-authorized option; (2) no
  palace RELOCATION on capital loss (real Civ 6 moves it; both
  engines consistently grant-once-strip-forever); (3) player regional
  coverage is thin in-gate (1 player regional building at t250) — the
  scripted player rarely reaches Factories.
- A-11 (90% — 2026-07-18, task #41 stage 2). Rivals RUN domestic trade
  routes now: `RivalCiv.tradeRoutes` (rc-id pairs) / GPU `r_routes`
  [B,R,K,2] (id-keyed like `rc_tile_id` — compaction-immune), capacity
  via `rivalTradeCapacity` (trade.ts: FOREIGN_TRADE civic,
  Market-OR-Lighthouse per city, Colossus/Great Zimbabwe; no
  CS-suzerain term until A-12), ONE new route per civ per turn picked
  by the deterministic best-dest scan (`rivalPhase` creation block /
  `_rival_trade_phase`), origin income = `routeYields(dest)` added
  pre-tier in `rivalCityYields` / BOTH `_rival_city_yields` paths
  (per-j and the D-9 `_all` trace path), routes die with either
  endpoint (capture/transfer pruning both engines). Interdiction is
  SYMMETRIC now: `rivalRouteRaidedAt` suspends rival routes for
  barbarians always + player units at war, and `routeRaidedAt` gained
  the at-war-rival check (the old one-sidedness). Gate-reachable and
  gate-proven (scripted trajectories reshuffled). RESOLVED 2026-07-18
  (A-12b stage 1, 34ddb51): rival→CS routes landed — capacity's
  suzerain term, the widened creation scan (met CS after domestic
  dests, TOTAL-yields comparator), csRouteYields income via the
  [B,RC,6] `_rival_route_income`, capture pruning; probe: 5/8 seeds
  end with a live rival CS route. The GPU still has no PLAYER route
  machinery (unreachable in gated trajectories — no trade RL verb;
  batch with A-18/#50 if the P8 surface ever gains one).
- A-12. RESOLVED (2026-07-19, task #64 ROUND B8 slice L — rival levy + rival
  CS quests). The DIPLOMATIC layer is
  live both engines: per-civ envoys (`CityState.rivalEnvoys`/
  `rivalMet` / GPU `cs_r_envoys`/`cs_r_met`), rival influence→envoy
  accrual with the adopted-government tier (`rivalPhase` CS block /
  `_rival_cs_phase` — meet by PROXIMITY, `CS_MEET_RANGE` 3, rivals
  have no fog), the player's scripted greedy assignment mirrored
  (neediest-own-envoys, envoys*64+id key), rival capital/district
  envoy bonuses at 1/3/6 in `rivalCityYields` / both
  `_rival_city_yields` paths, and the suzerain CONTEST — `isSuzerain`
  is strictly-most-envoys now (ties → nobody), `rivalIsSuzerain` the
  rival test. Gate-reachable (probe: 6/8 seeds meet, envoys to 9).
  Stage 3b-1 (2026-07-18, 34ddb51): rival→CS trade routes + the
  suzerain trade-capacity term are LIVE both engines (see A-11).
  Stage 3b-2 (2026-07-18, 68ef7d5): JOIN-THE-SUZERAIN'S-WAR is live —
  an AT-WAR rival MELEE unit attacks an adjacent CS whose suzerain is
  the player (attackTargets csWar / the war-act's strict-isSuzerain
  plane), the csty/cstyc pair at the player block's exact position,
  conquest lands the CS as an rc (`captureCityStateForRival` /
  `_capture_city_state_rival` — transfer-style last-alive+1 append,
  ring re-tag to the A-17 registry, maxCities raze, route pruning).
  PROVEN IN-GATE: seed 9131's reference run contains a real rival CS
  conquest (it exposed the exporter's live-roster t0 dump — now
  snapshotted pre-run). Stage 3c (2026-07-19, ROUND B8 slice L):
  RIVAL LEVY + RIVAL QUESTS close the last deferrals.
  * LEVY — the `levyUnits` twin for rivals, in the `rivalPhase`
    gold-block tail / `_rival_phase` levy block just before
    `_rival_trade_phase` (the A-5 position, documented both engines):
    an AT-WAR rival suzerain (`rivalIsSuzerain`) of a militaristic CS
    spawns `LEVY_UNITS` of the 2-step ladder (`WARRIOR`≤60 else
    `SPEARMAN`) at the CS center via `spawnUnit`/`_spawn_rival`
    (POOL-END), paying `LEVY_GOLD_COST`, on `LEVY_COOLDOWN` per CS
    SHARED across seats (`CityState.lastLevyTurn` / `cs_last_levy`,
    init −cooldown). ONE CS per rival per turn (first eligible in id
    order). Payment + cooldown are unconditional on a free spawn spot
    (levyUnits pays before spawnUnit).
  * QUESTS (zero-draw) — one deterministic quest per (rival, CS):
    `CityState.rivalQuest`/`rivalQuestIssuedTurn` (types.ts, clock
    default 0) / GPU `cs_r_quest`/`cs_r_quest_camp`/`cs_r_quest_issued`.
    `issueRivalQuest`/`rivalQuestSatisfied` (rivals.ts) /
    `_rival_quest_phase` — resolve-then-issue at the A-12a accrual
    position, kind = the FIRST SATISFIABLE of [clearCamp (nearest camp
    ≤6, ties lowest tile), buildDistrict (the CS type's district via
    `CS_TYPE_DISTRICT`/`_cs_didx`), sendTradeRoute (reads route state
    only)], NO `nextRandom` anywhere; completion pays `QUEST_ENVOYS` to
    `rivalEnvoys`/`cs_r_envoys` (bumps `_eff_version`). The PLAYER quest
    path (`issueQuest`/`cityStatePhase`) is untouched — draw-count
    neutrality is proven by the `rng` trace column staying exact across
    24×250 (any added draw would diverge it) and a dedicated TS
    zero-draw poke. IN-GATE: 6 rival levies (seeds 9029/9092/9235) + 24
    rival quest completions across 14/24 seeds (clearCamp 6 / trade 5 /
    buildDistrict 13). RESIDUALS: levy era ladder stays 2-step (WARRIOR/
    SPEARMAN, not the full era ladder); the PLAYER levy verb stays
    UI-only (`main.ts` levyUnits call), absent from the scripted
    reference so the GPU mirrors only the rival path. Pokes:
    `gpu/cs_verbs_test.py` (battery lane `cs_verbs`) + `tests/cs-verbs.test.ts`.
- A-17. RESOLVED (2026-07-18, task #41): rival territory gained a
  per-city tile registry (TS `Tile.rivalCityId` / GPU `rc_tile_id`,
  persistent-rc-id keyed), fixing per-city border adjacency and exact
  capture/transfer tile sets; residual civ-level worked-tile scan
  split out as A-23.
- A-18. RL action surface. **CS-ATTACK COLUMN: ATTEMPTED 2026-07-27 AND
  FOUND BLOCKED — it is NOT merely a missing mask column.** I added it to
  both engines (GPU: city-state centres joined the 6-11 attack columns; TS:
  a `csPlayer` arm in `attackTargets`) and scripted parity stayed green, but
  it breaks a DELIBERATE, TESTED invariant: `tests/deeper.test.ts`
  "autopilot target lists never include peaceful city-states" asserts on
  `attackTargets` ITSELF. Since this model has NO player<->city-state war
  state, EVERY city-state is permanently peaceful, so there is no condition
  under which the player may legitimately be offered the attack — even
  though `meleeAttack`'s csTarget path accepts a player attacker (that
  permissiveness is the anomaly, not the missing column). Off-script the
  random policy took the new verb immediately: 13 rollout failures.
  PREREQUISITE, now the real A-18 blocker: a player<->CS hostility notion
  (a war/grievance flag, or reusing the A-12b suzerain-contest rule from the
  other seat). Until that exists the column must stay off. The OTHER A-18
  verbs (player builder REPAIR, resource improvements) carry no such
  dependency and are still open as normal work.
  **THE OTHER TWO VERBS ARE LANDED (2026-07-27, owner-unblocked; the P8
  re-baseline deliberately NOT run — "we are not finished with changing
  engine"):** the RL action space grew from 17 to 24 columns.
   - 17 = PLAYER BUILDER REPAIR. `builderRepair` (units.ts) had existed with
     no caller since the rival seat got it in A-13. Mask: a builder on an
     OWNED tile whose improvement or district is pillaged. Apply: clears a
     pillaged IMPROVEMENT first, else a pillaged DISTRICT (the TS order),
     spends the turn, costs NO charge. Decoded in replay-gpu.ts.
   - 18-23 = the RESOURCE improvements + SEASIDE_RESORT (QUARRY, PASTURE,
     CAMP, PLANTATION, OIL_WELL, SEASIDE_RESORT). `builderImprove` already
     validated ANY id through validImprovements — only the mask never offered
     them, which is why the player farmed while rivals placed the whole
     roster. Mask/apply key on the exported `res_imp` per-tile requirement
     plus the improvement's unlock tech, with SEASIDE_RESORT on `_seaside_ok`.
   FISHING_BOATS: the #69 note resolves itself — it is not in IMPROVEMENT_IDS,
   so `res_imp` is -1 on sea-resource tiles and the verb can never offer it.
   The -9 luxreq bake stays parity-safe, exactly as predicted.
   Gates: scripted parity 24x250 0.0 milli, FORCED compaction 0.0 milli,
   rollout REPLAY PARITY OK 72 games (the new verbs ARE sampled off-script —
   the rollout draws from the mask width), vitest 389/389, all 30 poke lanes,
   BATTERY OK 556s. Coverage note: column 17 fires readily; 18-23 need a
   builder standing on a resource tile and are correspondingly rare.
  Original entry (deliberately batched with the P8 re-baseline — task #50): `unit_action_mask` (engine.py)
  offers move/melee/hold/FARM/MINE/LUMBER_MILL/chop only — no
  CS-center attack column though the engine verb exists
  (`meleeAttack`'s `csTarget` path), no PLAYER builder repair verb
  (`builderRepair` (units.ts) exists; rivals repair via
  `_rival_builder_actions` since A-13), and no resource-improvement
  verbs (rivals place everything `validImprovementsIn` offers; the
  scripted player policy farms only). #69 NOTE: when improvement
  verbs land, FISHING_BOATS must either join `IMPROVEMENT_IDS`
  (export-gpu.ts — PEARLS/WHALES `luxreq` −9 currently means those
  luxuries can never amenity-activate on the GPU) or the verb must
  mask sea resources; today no path builds it in EITHER engine, so
  the −9 bake is parity-safe. [opus-ok: the mask-COLUMN
  plumbing (unit_action_mask rows for CS-attack/repair/improvements/
  pillage/specialists incl. A-21/A-22) — new verbs are inert under the
  scripted player policy, so gates can't drift; the APPLY-path wiring
  and the P8 re-baseline decisions stay Fable/main.]
- A-19. **RESOLVED (2026-07-20, task #55 S1/S2 — brief
  gpu/GEOPOLITICS_DESIGN.md)**: per-pair war state on unified civ ids
  (`RivalCiv.atWarRivals` + `civsAtWar`/`setRivalWar` in rivals.ts;
  GPU `rr_war` [B,R,R] symmetric bool, `_MUTABLE`). The (0, r+1)
  player pair still rides the untouched `atWar` boolean. S2 made it
  LIVE: `unitsHostile` symmetric off the pair state, every war-act
  scan (`attackTargets`, the war-march pick, `_rival_unit_war_act`
  and the war-target planes) includes at-war rivals' units/cities,
  rival↔rival capture via the EXISTING
  `transferRivalCityToRival`/`_transfer_rc_to_rc`, plus a ZERO-DRAW
  pairwise auto-DoW (`rivalRivalDeclareWars`/`_rival_rival_declare_wars`,
  deterministic id-order scan, one new war per civ per turn) and
  per-pair peace (`rivalRivalMakePeace`/`_rival_rival_make_peace`,
  either side's ww > RR_PEACE_WW). Trace: `rrw`/`rrk` bitmask columns
  in both statelog harnesses. RESIDUAL: a rival's RANGED unit stays
  scoped OUT of rival-vs-rival strikes (melee captures; the
  documented no-op quirk — `hostileRangedStrike`). Poke coverage:
  `gpu/geopolitics_test.py` (battery lane `geopolitics`) +
  `tests/geopolitics.test.ts`.
- A-20. RESOLVED (2026-07-13, task #54): rival cities heal the flat +20
  when unbesieged (the 15/5 war split was a local invention), one
  source both engines (`CITY_HEAL_PER_TURN` / `cityHealPerTurn`).
- A-21. **RESOLVED (2026-07-27).** The PLAYER PILLAGE verb exists on both
  engines — action column 24, and a new `playerPillage` (units.ts), since TS
  had NO player-pillage function at all. It mirrors the hostile rule exactly:
  a MILITARY unit on an ENEMY tile (an at-war rival's or a city-state's)
  pillages the improvement first, else a COMPLETE non-CITY_CENTER unpillaged
  district (the B-32 order); a PILLAGE_HEAL_IMPROVEMENTS target heals +25
  capped at unitHp; the turn is spent. GPU mask + apply share the same
  predicate and the existing `_imp_heals` table, so the two seats cannot
  drift. Gates: scripted parity 24x250 0.0 milli, FORCED compaction 0.0
  milli, rollout 72/72 (the verb IS sampled off-script), vitest 389/389, all
  30 poke lanes, BATTERY OK 663s.
  Original entry — the gap this closed: the player had no pillage verb: pillaging exists
  only on the hostile side (`hostileUnitAct` step 2 (combat.ts) /
  `_rival_unit_war_act` (engine.py) for at-war rivals, plus
  barbarians), there is no TS player-pillage function, and
  `unit_action_mask` (engine.py) carries no pillage column. Rivals
  wreck player improvements (and bank the +25
  `PILLAGE_HEAL_IMPROVEMENTS` heal); the player can only respond by
  killing units or taking cities. Natural batch with the A-18 mask
  work.
- A-22. **RESOLVED (2026-07-27).** Rivals now assign SPECIALISTS, and the GPU
  models them. Rule (real Civ 6 auto-assigns citizens wherever the yield is
  best): ONE merged ranking of workable TILES and open SPECIALIST SLOTS,
  scored by the same `tileScore` 'balanced' weighting, top `population` taken
  — exactly equivalent to "take a specialist when it beats the tile it would
  displace", and trivially mirrorable. Slots per district = that city's
  buildings belonging to it, with the district registered, COMPLETE and
  unpillaged (B-32). Ties go to TILES, because a slot's tie index (>= T)
  always loses in `score * 1e6 - tileIndex`.
  TWO TIE-BREAKS had to be aligned, and both were caught by the gate:
  (a) TS sorted equal-scoring slots by the city's BUILD order while the GPU
  used catalog order — CAMPUS science 2 and HOLY_SITE faith 2 score
  identically under focus_base, so the two engines picked different
  specialists (seed 9261 t99: GPU +tech/score, -faith). TS now sorts on the
  district's index in PLACEABLE_DISTRICTS, the exporter's canonical order.
  (b) the batched `_rival_city_yields_all` needed the same merge as the per-j
  path or the score/trace column drifted from the accumulators.
  New export: `specialistYields` [nD, 6] parallel to the districts catalog.
  Gates: scripted parity 24x250 0.0 milli, FORCED compaction 0.0 milli,
  rollout 72/72, vitest 389/389, all 30 poke lanes, BATTERY OK 732s.
  Original entry — the gap this closed: specialists were player-only:
  `setSpecialists` (game.ts) + `citySpecialistSlots`/
  `effectiveSpecialists` (city.ts) feed `SPECIALIST_YIELDS` into
  `computeCityStats`, but `rivalCityYields` (rivals.ts) never reads
  `RivalCity.specialists` (always `{}`) and no rival assignment path
  exists; the GPU models specialists on NEITHER seat (documented
  scope-out in gpu/BUILD_PLAN.md). Inert under scripted play today,
  but it becomes a live asymmetry the moment the P8 surface gains the
  verb — track alongside A-18.
- A-23. **RESOLVED (2026-07-27).** The rival worked-tile scan is now
  PER-CITY on both engines: `rivalCityYields`'s candidate filter gained
  `t.rivalCityId === rc.id` and BOTH GPU twins (`_rival_city_yields_all`'s
  batched-j `valid` and `_rival_city_yields`'s per-j `valid`) gained
  `rc_tile_id == rc_id[:, r, j]` — mirroring the player's
  `t.cityId === city.id`. Two adjacent rival cities can no longer both work
  the same civ tile, a double-count the player is structurally incapable of.
  Hunt-free: parity was green on the first pass, and it is NOT vacuous —
  1719 civ-owned tiles sit inside a rival city's work radius while
  registered to a SIBLING city across the 24 gate games, and every one of
  them was being double-counted before. Gates: scripted parity 24x250 0.0
  milli, FORCED compaction 0.0 milli, rollout 72/72, vitest 389, all 30
  poke lanes. Earlier description (the gap this closed): the scan was
  CIV-level: `rivalCityYields` (rivals.ts) ranks
  `tileOwnedByCiv(t, civOfRival(r))` tiles in the work radius (twin
  `_rival_city_yields` planes key on `rival_at == r`), vs the player's
  per-city `workableTiles` — two adjacent rival cities can both work
  the same civ tile (double-counting the player structurally cannot
  do). A-17's `rivalCityId`/`rc_tile_id` registry now makes the
  per-city convergence implementable; it reshuffles every rival yield
  every turn, so it needs its own gated stage.
- A-24. RESOLVED (2026-07-19, ROUND B10 slice R, task #66). Rival
  district/wonder placement now requires the target tile's A-17
  registry entry to be THIS city: `tryQueueRivalDistrict`'s `owns` +
  `tryQueueRivalWonder`'s filter gained `rivalCityId === rc.id`; GPU
  `_place_district_rival` elig + `_rival_phase` wonder `base_ok`
  gained `rc_tile_id == rc_id[:, r, j]` — mirroring the player's
  `canPlaceDistrict`/`canPlaceWonder` (`tile.cityId === city.id`). A
  sibling's registered tile is no longer a valid site (the seed-9118
  incoherence: rcId 4's HOLY_SITE on a tile registered to rcId 3 —
  B-30 had sidestepped it by deriving capture-kept districts from
  re-owned tiles). Machine-checked: `_check_rc_registry_invariant`
  (engine.py, forward tile↔rc + backward civ-ownership scan) /
  `assertRivalRegistryCoherent` (rivals.ts), env-gated
  `CIV6_RC_REGISTRY_CHECK` and auto-ON under `CIV6_RC_RECLAIM_AT` so
  the forced-compaction gate exercises it every turn; poke lane
  `rc_registry` (gpu/rc_registry_test.py). The site reshuffle
  surfaced two pre-existing latents: the G-5 class (fixed by slice H
  this round) and a founding tie-break sighting recorded as G-6.
- A-25. **RESOLVED-AS-VERIFIED-CORRECT (2026-07-20, #69 S1 — brief
  gpu/A25_G8.md)**. The B8-K sighting (seed 9196: scripted player
  conquest ~t240, GPU `amen_have` 0 vs TS −2, growth 0.70 vs 0.90)
  does NOT reproduce: 9196 RESTORED at `SEED_OVERRIDES[15]` runs
  0.0-milli green at 250t — under the #55 geopolitics reshuffle its
  trajectory no longer contains ANY capture (rivals grow to 13
  cities), so the suspected path was re-verified by DIRECT POKE
  instead: `_capture_rival_city` re-owns the A-17 ring to the new
  player city and an improved in-roster luxury on a captured tile
  feeds `_luxury_amenities` the same turn (`rc_registry` lane poke d,
  grants 0→2, registry invariant green). No fix shipped — current
  code is correct; the historical root is not archaeologically
  pinned (nothing to prove against). REAL FIND from the re-verify:
  `luxreq` −9 = PEARLS/WHALES, whose FISHING_BOATS improvement is
  outside the GPU roster — inert in BOTH engines today (no scripted
  builder builds it) but a LIVE asymmetry once #50's RL improvement
  verbs land (recorded on A-18; exporter comment updated).

## B. Engine fidelity vs real Civ 6 (missing/simplified systems)

Re-verified correct vs real base Civ 6 (2026-07-12): eureka/inspiration
40% (`BOOST_FRACTION`, data/boosts.ts), 1 specialty district per 3 pop
(`maxSpecialtyDistricts`, data/constants.ts), growth curve
15+8(n−1)+(n−1)^1.5 (`growthFoodNeeded`), amenities needed
ceil((pop−2)/2) (`amenitiesNeeded`), pantheon at 25 faith
(`PANTHEON_FAITH_COST`, data/religion.ts), all 10 base governments
(`GOVERNMENTS`, data/policies.ts). Also spot-verified faithful this
sweep: damage curve 30·e^(0.04·Δ)·rand(0.8–1.2) (`damageRoll`,
combat.ts), heal rates 20/15/10/5 (`refreshUnits`, core/units.ts),
water housing 5/3/2 + Aqueduct 6/+2 (`HOUSING_FRESH_WATER`/
`AQUEDUCT_NO_FRESH_TOTAL`), amenity bands and growth/yield factors
(`amenityTier`), housing growth throttle 1/0.5/0.25
(`housingGrowthFactor`), luxuries → 4 neediest cities
(`LUXURY_AMENITY_CITIES`), gold purchase ×4 (`GOLD_PURCHASE_MULT`),
district base 54 scaled by max(tech%,civic%) ×(1+9·p) plus the GS 40%
under-represented discount (`districtCostIn`/`districtDiscounted`,
core/game.ts), settler 80+30·n with pop −1 (`settlerCost`), city HP
200 / +20 heal (`CITY_MAX_HP`, `barbarianPhase`), envoy per 100
influence (`ENVOY_COST`), loyalty core: range 9, ±20 pressure, ±3/6
amenity term (`loyaltyDelta`, `LOYALTY_RANGE`/`LOYALTY_PRESSURE_SCALE`/
`LOYALTY_AMENITY`), unit costs/maintenance for the modeled roster
(`UNITS`). [opus-ok] tags below follow the same rule as chapter A's.
Note: every production/research cost is uniformly ×0.6
(`GAME_SPEED`) — a deliberate Online-speed choice, not counted as a
gap; likewise GS disasters are modeled minus sea-level rise
(`disasterPhase`, core/disasters.ts).

**Combat/military:**
- B-1. RESOLVED (2026-07-13, task #42): `ANCIENT_WALLS` grants a 100-HP
  OUTER pool (`outerHp`/`outer_hp`/`rc_outer_hp`) absorbing damage
  first; heals/wiped-on-capture, no `cityDefenseStrength` bump
  (1-tier), CS deferred, rivals build/buy it data-driven.
- B-2. RESOLVED (2026-07-13, task #42): a walled city strikes once/turn
  (range 2, nearest hostile, one `damageRoll` at `cityDefenseStrength`,
  no retaliation/capture); both seats, identical draw order, no CS
  strike.
- B-3. **RESOLVED for player+rival movement (2026-07-13, task #43);
  BARBARIANS (2026-07-19, ROUND B10 slice B, task #66)**: `inEnemyZoc`
  (units.ts) / `_in_enemy_zoc` + `_in_enemy_zoc_barb` (engine.py) —
  entering a tile adjacent to a hostile MILITARY unit halts the mover
  (movesLeft := 0) after the enter cost, tested live per step; wired
  into the player `walkPath` and all three A-8 rival walkers (war march
  / patrol / builder). B10: the rival-only gate in `hostileUnitAct` is
  LIFTED so barbarians obey ZOC too — `unitsHostile` halts a barb at any
  adjacent non-embarked PLAYER or RIVAL military (barbs are hostile to
  every non-barb, so no at-war gate; barbs raid rivals too, C-4a), other
  barbs exert nothing. GPU `_in_enemy_zoc_barb` (player+rival military
  exert; barbs don't) is checked per step in the `_barbarian_phase`
  raider multi-step loop. Zero new draws (pure geometry). In-gate: the
  barb-ZOC path fired in 21/24 scripted seeds. City-center ZOC still
  deferred.
- B-4. RESOLVED (2026-07-19, ROUND B5 slice M2): `Unit.xp` on
  player+rival units — +5 per attack executed, +2 per attack survived
  as a military defender (walls strikes included); `XP_LEVELS`
  [15,45,90] → flat +5 CS/level at every roll (the B-7 assembly
  pattern; dropped by the embarked override), GPU `p_xp`/`v_xp` with
  full snapshot/reclaim discipline, exp table widened 1201→4001.
  In-gate: level ≥1 in 15/24 seeds, ≥3 in 5. `bestMeleeCS` stays
  base-CS. Residuals: real promotion TREES/abilities, barb XP,
  heal-on-promote.
- B-5. RESOLVED (2026-07-13, task #43): `fortifyTurns` (military, cap 2)
  accrues on the no-MP-spent gate, reset by move/attack, +3/+6 CS to
  the defender at every roll site both engines; symmetric, snapshot-
  and `_reclaim_pool`-safe.
- B-6. RESOLVED (2026-07-18, task #45, serial N1→N2→N3 off
  gpu/NAVAL_DESIGN.md): embarkation + naval units both engines.
  `unitPassable` is unit-aware (naval on water; embarked land units on
  water — SAILING civilians / SHIPBUILDING all, CARTOGRAPHY oceans;
  embark/disembark cost all MP, `EMBARK_MOVES` 2); GALLEY + QUADRIREME
  (`UnitDef.naval`), coastal-or-Harbor production gate on all three
  surfaces, scripted rival galley policy + war-march/patrol water
  steps (in-gate: galleys 7/24 seeds, embark 7/24), embarked defense
  flat `EMBARKED_DEFENSE_CS` 10 (no attack/fortify/flank/support),
  embarked civilians captured per B-31 pool-end. GPU: `wpass`/
  `p_emb`/`v_emb` planes, `_embark_live` mirrored switch. Poke suite
  `gpu/naval_test.py` (battery `naval` lane) covers the
  gate-unreachable: player naval, city/CS capture from sea,
  quadrireme, ocean gate, walls-vs-ships. N2's hunt fixed a TS
  embarked-MP-reset bug and a GPU `r_routes` capacity latent.
  RESIDUALS: player scripted/RL naval + controlled-head water moves
  (#50 — the GPU RL move verb still reads the land plane); scripted
  settler/builder embark (own gated stage); naval barbs (B-26);
  Frigate+ hulls (B-10); Great Admiral (B-8); naval trade (B-23).
- B-7. RESOLVED (2026-07-18, ROUND B4 slice Y): `FLANKING_CS`/
  `SUPPORT_CS` (+2 per adjacent ally) at unit-vs-unit rolls — flanking
  on melee (`meleeAttack`), support on melee + ranged defense
  (`rangedAttack`, `hostileRangedStrike`, both walls strikes incl. the
  `rcstk` mirror); GPU `_flank_support` (batched, stacking gives ≤1
  military/tile). No flanking vs cities/CS/rc-cities (not units —
  recorded simplification).
- B-8. RESOLVED-minus-MP (2026-07-19, ROUND B7 slice G, task #63):
  GENERAL/ADMIRAL are a spawn-only combat-0 civilian chassis
  (`UnitDef.spawnOnly`; charges=1 → civilian in BOTH engines'
  conventions, excluded from every military/garrison/flank/support
  loop). `applyGreatPersonEffect` + the rivals.ts claim loop (GPU
  player GP loop + rival GP-claim loop) spawn the unit at the capital
  on claim, on top of the instant effect. Aura = `generalAuraCS` /
  GPU `_gen_aura_cs` (per-(civ,tile) dilated plane cached on a
  general-POSITION FINGERPRINT — the slice's hunt: an RL move verb
  relocated a general without bumping the old version counter and a
  later roll read a stale plane) adding +5 CS to own land within 2 of
  a GENERAL / own naval+embarked within 2 of an ADMIRAL at the
  `damageRoll`/`_damage_roll` unit-vs-unit sites next to the B6
  religion adders (quantized, table-safe). Rival GENERALs march the
  war effort (`rivalGeneralActions`/`_rival_general_actions`,
  missionary chassis, stop ≤2); player GENERALs + ADMIRALs hold at
  the capital. Capture rides the B-31 POOL-END paths. In-gate:
  ADMIRAL 18/24 seeds, 33 claims; GENERAL gate-unreachable (no
  scripted Encampment GPP — poke `gpu/gp_aura_test.py` +
  `tests/great-general.test.ts`). RESIDUALS: the +1 MP aura half
  (movement coupling), naval war-march targeting, aura at city/CS
  strike sites, controlled-rival RL mask predates the chassis
  (A-18/#50).
- B-9. RESOLVED (2026-07-19, ROUND B5 slice M1): strategic-resource
  ACCESS model — `UnitDef.requiresResource` + `civHasStrategic`
  (owned territory tile + resource + completed unpillaged matching
  improvement) / GPU `_res_avail_mask` gate build AND purchase on all
  three surfaces; HORSEMAN retro-gated on HORSES (early-game
  reshuffles proven in-gate). Residuals: GS stockpiles/accumulation/
  per-unit costs; niter and later strategics absent from maps.
- B-10. RESOLVED (2026-07-19, ROUND B5 slices M1+M3): roster extended
  through the gunpowder line — SWORDSMAN/PIKEMAN/CROSSBOWMAN/KNIGHT/
  MUSKETMAN (real-ish stats, tech + B-9 resource gates, data-driven
  everywhere) — and the scripted rival production ladder + A-5r buy
  roster are BEST-OF-ROSTER (strict `>` scan in UNITS-table order,
  GPU argmax mirror). In-gate: rivals field PIKEMAN 16/24 seeds,
  CROSSBOWMAN 19/24, MUSKETMAN 20/24 (SWORDSMAN/KNIGHT
  resource-starved in fixtures, vitest-covered). Residuals: siege
  line, Frigate+ naval hulls (with B-6), gold unit-upgrades, and the
  CONTROLLED rival_masks `ok_u` still hardcodes the old 5-unit roster
  (RL-surface decision — batch with A-18/#50).
- B-15. **RESOLVED (mechanism 2026-07-17 Round B2; magnitude closed
  2026-07-20 #69)**: war weariness — integer accumulator
  (`warWeariness`, +1/turn at war ×`WW_SURPRISE_MULT`/`WW_FORMAL_MULT`
  on the rival↔rival axis since #55-S3, −4/turn decay at peace) →
  flat amenity penalty via `computeCityStats`, symmetric
  player+rival, both engines (`_MUTABLE`-registered tensors; poke
  `gpu/war_weariness_test.py`). MAGNITUDE: `WAR_WEARINESS_CAP` 16→32
  (#69 S2) — the −4 empire ceiling is live (−1 per 8 war-turns
  player/FORMAL, −1 per 4 for SURPRISE rival wars); both engines
  clamp the ACCUMULATOR at the cap (accrual `Math.min` / GPU inc
  clamp — the read-side `warWearinessPenalty` Math.min is
  belt-and-braces). The #55-S3 deferral (G-8) did NOT reproduce at
  cap 32 on a properly-exported tree — full ladder + battery green.
- B-26. Map/barbarian fidelity: no cliffs (no such concept in
  data/terrains.ts or core/mapgen.ts). Barb raiders run the A-8 real-MP
  walk (RESOLVED 2026-07-13 task #44; `hostileUnitAct` both engines, GPU
  `_barbarian_phase` raider block = the vectorized multi-step loop
  mirroring `_rival_unit_war_act`) and obey ZOC (B-3, ROUND B10).
  **ERA LADDER RESOLVED (2026-07-19, ROUND B10 slice B, task #66)**: all
  three `barbarianPhase` spawn sites (new-camp spawn, empty-camp
  regarrison, the 0.1-roll raid) climb a shared MELEE ladder
  `barbMeleeType` — WARRIOR → SPEARMAN (t>60) → PIKEMAN (t>120) →
  MUSKETMAN (t>180); GPU `_barbarian_phase` `melee_type` mirror over the
  widened `unitCombat` barb table (u_type 0/1/2/3), thresholds
  `pikemanAfterTurn`/`musketmanAfterTurn`. Zero new draws (spawn-TYPE
  only). The exp/quantization table (4001) already covers PIKEMAN(41)/
  MUSKETMAN(55) — rival/player MUSKETMAN(55) use the same clamped
  `_damage_roll` (verified, not widened). The A-12 CS levy ladder
  (`state.turn > 60 ? SPEARMAN : WARRIOR` in rivals.ts) is untouched.
  In-gate: PIKEMAN+ barbs in 20/24 scripted seeds, MUSKETMAN in 20/24.
  **DESCOPED to residual — RANGED barbs**: the `campIdx%3==0` raid site
  was to spawn ARCHER(t≤120)/CROSSBOWMAN(t>120). TS `hostileUnitAct`
  dispatches ranged generically (`hostileRangedStrike`), but the GPU
  `_barbarian_phase` raider block is a MELEE-ADJACENCY scanner with no
  range-2 target scan and no ranged-strike dispatch for barb owners
  (unlike `_rival_unit_war_act`, which has both); wiring it needs a new
  GPU walker class (full-range scan + a barb `_hostile_ranged_strike`
  variant), so per the brief's descope clause ranged barbs are recorded
  here. (RANGED barbs LANDED later, #70/S5 — see the ledger.)
  **NAVAL BARBS LANDED (2026-07-27, #71).** Real Civ 6 coastal camps put
  out hulls, so the 0.1-roll raid site now spawns a GALLEY (QUADRIREME
  past the same era turn the crossbow ladder uses) for every FOURTH camp
  by INDEX (`campNo % 4 === 1` — a residue chosen so it never collides
  with the `% 3` ranged rule), on the LOWEST-INDEX free water neighbour
  of the camp. ZERO-DRAW: the 0.1 roll already fired and nothing else is
  consulted, so the draw stream is untouched. A barbarian owns no tech,
  so its water plane is `wpass` MINUS ocean — TS `waterEnterable` gates
  OCEAN on the owner's CARTOGRAPHY, which barbs never have; both engines
  therefore restrict spawn, march and post-kill advance to COAST/LAKE.
  Exporter: `unitCombat`/`unitMoves`/`unitRangedStrength`/`unitRangedRange`
  widened to 9 entries (7 = GALLEY, 8 = QUADRIREME) plus `unitNaval` and
  `barbNavalTypes`; GPU `_barb_galley_idx`/`_barb_quad_idx`,
  `_barb_water_ok`, `_spawn_barb(..., naval=True)`.
  FOUR GPU BUGS, all ONE stale assumption ("barbarians are never naval")
  written into four different places: (1) `_spawn_barb` probed the LAND
  plane, so the hull was silently dropped (seed 9170 t16, barbs TS=4
  GPU=3); (2) the melee post-kill ADVANCE hard-coded `adv_terr = land_ok`
  for barb attackers, so a hull that killed an adjacent land civilian
  walked ASHORE and then besieged the city from a land tile (seed 9170
  t34, city hp 113 vs 93 — the GPU city never healed); (3) the roll-free
  civilian-kill advance had no terrain gate at all; (4) the barb FORTIFY
  update had no `~naval` term — the rival and player pools have always
  had one (TS `refreshUnits` gates the dig-in on `!naval`), and its
  comment said in so many words "barbs are never naval so u_fortify is
  untouched". Every idle hull therefore collected the full +6 fortify
  defense TS never grants it. `_barb_water_ok` is now the single shared
  plane for the first three sites. A pre-existing field-name collision
  surfaced too: `_galley_idx` was already the roster index 12, so the
  barb-table field was renamed.
  HUNT NOTE: (4) was invisible to scripted parity (0.0 milli across
  24x250) and surfaced only in the ROLLOUT, as a 6.0-CS split on the
  `mel`/`melc` pair the moment a player unit first attacked a hull (seed
  9212 t80). The statelog pinned the turn but named the wrong culprit —
  the GPU BU line prints a side marker, not the unit type, so the
  defender read as a SPEARMAN; instrumenting TS's `meleeAttack` to dump
  its CS terms is what identified it as a GALLEY at `fort0`. Lesson
  recorded: when a mechanic gains a NEW UNIT CLASS, grep every comment
  that asserts the old invariant — all four sites here were findable by
  searching for the sentence, not by reading the diff.
  IN-GATE: exercised — seed 9170 spawns a galley by t16 and it kills a
  civilian at t33, which is what caught bugs (2) and (3). Poke lanes:
  `tests/combat.test.ts` "a coastal camp fields a barbarian hull, on
  water" and "a barbarian hull kills ashore but never advances onto
  land"; `tests/aura-movement.test.ts` "a naval unit never fortifies —
  barbarian hulls included" (with a land control unit in the same test).
  B-26 -> 95%.
  STILL OPEN in B-26: no cliffs (a new edge property — mapgen +
  movement + adjacency, the single largest remaining item), and
  camp-spawn escalation beyond the melee ladder.
- B-28. RESOLVED (2026-07-13, task #44): `terrainDefense` gives −2 on
  MARSH/FLOODPLAINS (was +3); GPU split the dual-purpose plane into
  `tdef` (defense) + `tmove` (enter cost) so movement is unchanged.
- B-29. RESOLVED (2026-07-18, ROUND B3 slice X): wounded units fight at
  −1 CS/10 HP lost and melee across a river (`crossesRiver`) −5
  attacker CS at all `damageRoll` sites; float association eliminated
  by a shared quantization `q = round(diff·10)` (exp table 1201).
- B-30. RESOLVED (2026-07-18, ROUND B4 slice AB): the three
  capture/transfer paths (`captureRivalCity`, `transferCityToRival`,
  `transferRivalCityToRival` + GPU twins) carry buildings (minus
  PALACE), wonders, and COMPLETE districts — derived from re-owned
  tiles (`districtComplete`, the GPU's liveness rule; incomplete stays
  paved-but-dead); `ANCIENT_WALLS` kept at `outerHp = 0` (heals via
  B-1, new owner gains the B-2 strike); razes stay scorched-earth; CS
  capture paths verified no-op (CS have no infra in-model). The
  worktree hunt exposed a pre-existing rival registry latent → A-24.
- B-31. RESOLVED (2026-07-18, ROUND B4 slice AA): player/rival melee
  CAPTURES a lone civilian (`meleeAttack` civilian branch — owner/civId
  flip, hp/charges kept, no roll, no advance; draw-count neutral).
  INVARIANT the slice established: the captured unit moves to the END
  of `state.units` / GPU pool-end append — an in-place flip broke slot
  order (dormant desync, seed 9261); ANY future ownership-transfer
  site must send the unit to the pool end on both engines. Residual:
  barbarians still kill (no prisoner/camp system); rival-vs-rival
  unreachable until A-19.
- B-32. RESOLVED (2026-07-18, ROUND B4 slice Z): `Tile.districtPillaged`
  / GPU `district_pillaged` [B,T] — raiders pillage COMPLETE non-center
  enemy districts (`hostileUnitAct` step 2 + step-3 march union; player
  districts for all raiders, rival districts for barbs per C-4a). While
  pillaged the district's adjacency, buildings (yields/housing/
  amenities/GPP), intrinsic housing and CS envoy channels go dark;
  static counts stay; repair via `builderRepair` + the rival builder
  twin; every rc pillage/repair bumps `_eff_version`. In-gate on both
  seats (5/24 player, 8/24 rival seeds). Residuals: no loot lumps (v1,
  D-20 convention); the scripted player never repairs districts (the
  repair verb rides A-18/#50) — symmetric, not a divergence.

**Progression breadth:**
- B-11. RESOLVED (2026-07-17, Round B2): `TECHS` is the full GS tree
  (68 entries), `ERAS` through Future, append-only; pure-military techs
  unlock nothing until B-10.
- B-12. RESOLVED (2026-07-17, Round B2): `CIVICS` 31 → 51, append-only,
  inspirations likewise.
- B-13. RESOLVED (2026-07-18, ROUND B3 slice V; breadth Round B2):
  `POLICIES` 19 → 58, all cards wired to a real `unlockPolicy` civic
  (zero unreachable); the wiring activated the dormant MEDIEVAL_FAIRES
  inspiration (fixed both engines). ~30 cards effect-inert pending
  absent systems (catalog-faithful, not a gap).
- B-14. RESOLVED (2026-07-17, Round B2, owner-ruled): `CITIZEN_SCIENCE`
  0.7 → 0.5 (real Civ 6); reshuffled every trajectory (fixture regen,
  seed 9053 reroll pending #56).
- B-27 (~85% — #71 batch 3 2026-07-26 landed the SEASIDE RESORT, closing
  the improvements-tail residual this entry recorded. The recorded
  blocker ("rest need naval/appeal") was STALE — both shipped earlier in
  #71. Requires RADIO, a FLAT COASTAL Grassland/Plains/Desert tile and
  BREATHTAKING appeal (>= 4); yields GOLD equal to the tile's appeal,
  computed dynamically in tileYields/_eff_yields and BOTH rival yield
  paths (the bug the gate caught: those paths do not share _eff_yields).
  Appended LAST to IMPROVEMENT_IDS so no index moved. STILL OPEN: the
  resort's TOURISM half (tourism does not exist — rides B-20), the
  PLAYER's RL build verb (rides #50/A-18 with the other
  resource-improvement verbs), and FORT (needs a Military Engineer).
  Earlier (largely RESOLVED 2026-07-17, Round B2): world wonders 30,
  natural wonders 12, pantheons 25 / follower 9 / founder 8 (+7
  enhancers), great people 9 classes incl. Writer/Musician, projects
  incl. the space-race chain; buildings were already real-complete per
  MODELED district (unmodeled districts' buildings arrive with A-9).
  Degradation ledger: gpu/ROUND_B2_LOG.md (each row that needed an
  absent system). Improvements 9 stays (rest need naval/appeal).

**Economy/districts/religion:**
- B-16. RESOLVED (2026-07-17, Round B2, owner-ruled → GS):
  INDUSTRIAL_ZONE +0.5/mine +1/quarry +2/adjacent-Aqueduct, HARBOR +1
  per CITY_CENTER (was +2); IZ channels LIVE since ROUND B9 R1 made
  IZ scaffold-reachable (2026-07-19).
- B-17 (~95% — #71 batch 2 2026-07-26 added the GARRISON POOL and the
  MOVEMENT BLOCK, the two residuals this entry recorded; sourced first:
  the Encampment fights independently of its city, carries 100 HP, and
  bars enemy entry until reduced to 0, after which the tile is occupied
  and the district goes silent. Modeled per-TILE (`Tile.encampHp` /
  `encamp_hp` [B,T], absent = FULL on the TS side, the `outerHp ??
  WALLS_HP` convention) so every walker's check is O(1). Mustered at all
  four completion sites; blocks via `encampmentBlocks`/`_encamp_block`
  folded into tileFreeForUnit, findPath, walkPath, the patrol passOk,
  the GPU `_blocked_for` and the player step verb; reduced by a MELEE
  assault ON the tile wired through `attackTargets`, so barbarians,
  war-marching rivals and the scripted/RL player all reach it with no
  walker surgery. Defense = the owner's civ-level max(15, bestMeleeCS),
  deliberately WITHOUT the city-centre garrison term. Heals on the wall
  pool's unbesieged gate/rate. STILL OPEN: ranged-vs-district (matching
  the ranged-vs-rival-city scope-out). NOTE: B-17 is GATE-UNREACHABLE —
  zero Encampments are built across the 24 scripted seeds, so scripted
  parity says nothing about it; the `encampment` poke lane and the
  random-action rollout are what actually exercise it, and the rollout
  is where this round's two bugs were caught.
  Earlier (ROUND B7 #63 slice E 2026-07-19): Encampment now carries
  its three residual roles, both engines, player + rival, poke-covered
  (gpu/encampment_test.py + tests/encampment.test.ts, battery lane
  `encampment`): (1) SPECIALIST SLOT — `SPECIALIST_YIELDS.ENCAMPMENT` =
  {production:1, gold:1} (real Civ 6 has NO citizen specialist for the
  Encampment; this is the stylized-model yield), `citySpecialistSlots`
  is data-driven off `SPECIALIST_YIELDS` so the row is the whole change
  (TS-only — the GPU has no specialist-yield machinery and the scripted
  gate never assigns specialists, so inert for parity). (2) DISTRICT
  STRIKE — a city (player AND rival) owning a COMPLETE unpillaged
  ENCAMPMENT fires the B-2 pattern as an ADDITIONAL once/turn ranged
  strike (`damageRoll`/`_damage_roll` k="pestk"/"restk"; range 2,
  nearest hostile, city defense strength, no retaliation, never
  captures). Walls-first draw order documented at the `barbarianPhase`
  B-2 site: the player runs the whole walls pass (pcstk) THEN the whole
  Encampment pass (pestk); the rival runs walls-then-Encampment per rc.
  No Encampment HP pool (recorded residual). (3) TRAINING XP — a
  MILITARY unit trained/purchased inherits the city's best Encampment
  military-building tier (`encampmentTrainXp` off `BuildingDef.trainXp`;
  BARRACKS/STABLE 5, ARMORY 10, MILITARY_ACADEMY 15; best tier, not sum;
  keys off building presence, NOT district-pillage state; player at
  `purchaseUnit`/production, rival at the gold-buy + production; GPU
  `_b_train_xp` + `_spawn_player`/`_spawn_rival` init_xp). GATE-
  UNREACHABLE: the scripted 24-seed gate never builds an Encampment
  (0/6 sampled seeds develop one), so all three add zero draws in-gate
  and parity is trivially exact (0.0 milli scripted/forced/rollout,
  hunt-free) — proven only via the forced-condition pokes, the B-25
  pattern. Remaining residuals: no Encampment HP pool, no movement
  block, no player-GP-unit tile activation.
- B-18 (re-scoped again 2026-07-17, #47r). LANDED since Round B2:
  belief catalogs (25/9/8/7), Enhancer slot, the rival ENHANCER race
  (mirrored 3rd `_next_random` draw after the founder draw — 31
  in-gate claims), and PRESSURE SPREAD both engines (+1 integer
  pressure/turn within 10 tiles of a founded religion's frozen holy
  center, `followedReligion` = argmax ties-to-lowest-id, KILL hygiene
  + `_reclaim_rc` permutation, proven by a new compared trace
  column — first in-gate flip ~t65). **Coupling LIVE (2026-07-18,
  ROUND B3 slice U)**: follower-belief yields (workEthic,
  buildingYields, buildingHousing, amenitiesIfSpecialty,
  faithPerWonder) key per-city on `followedReligion` in BOTH yield
  pipelines — the player walk gained a follower application it never
  had; landed inert-first (owner-keyed, byte-identical) then flipped;
  16/24 scripted seeds reshuffled turn-exact
  (gpu/ROUND_B3_LOG.md §U). Pantheon/founder/enhancer stay per-civ.
  **ROUND B6 (2026-07-19, #62)**: all 7 enhancer EFFECTS live
  (per-religion pressure range, `tradeReligionYields` route term, the
  three combat CS adders via `religionAttackCS`/`religionDefenseCS` /
  `_rel_atk_cs`/`_rel_def_cs` over `_rel_combat_planes`); the rival
  MISSIONARY chassis (`rivalMissionaryActions` /
  `_rival_missionary_actions` + the faith buy after the worship
  branch: 60/42 faith, cap `MISSIONARY_CAP`=2, SHRINE + complete
  Holy Site gate, real-MP walk to the nearest differently-followed
  city, `SPREAD_PRESSURE` lump 10/15, charge death); religious
  victory (see B-25). STILL OPEN (recorded residuals): Apostles +
  theological combat (abilities on top of this chassis); PLAYER
  missionaries (no faith-buy verb — rides #50/A-18).
- B-19. RESOLVED (2026-07-17, Round B2): era-anchored GP cost ladder
  (`gpCost`), global race kept, WRITER/MUSICIAN added (n_gp=9,
  appended). Building-GPP differentiation beyond +1/building absent.
- B-20. RESOLVED-minus-abilities (2026-07-19, ROUND B7 slice W, task
  #63): WRITER/MUSICIAN carry 2 Great Works each (`WORKS_PER_PERSON`/
  `placeGreatWorks`, GPU `_place_player_works`/`_place_rival_works`);
  works fill open `GW_WRITING_BUILDING`=AMPHITHEATER /
  `GW_MUSIC_BUILDING`=MUSEUM slots (`SLOTS_PER_BUILDING`=2; Broadcast
  Center is past-horizon, Museum's slots repurposed since ARTIST
  stays instant-lump), deterministic lowest-city (city_seq/rc order)
  then lowest-slot. Each slotted work yields building-tier culture BY
  KIND (`greatWorkCulture` in city.ts/rivals.ts; GPU `gw_writing`/
  `gw_music`/`rc_gw_*` in `_city_totals`/`_rival_city_yields`/
  `_rival_city_yields_all`, `_eff_version`-bumped, reset-on-birth +
  `_RC_SLOT_FIELDS`). Overflow charges degrade to the instant culture
  lump. In-gate: 6 seeds slot RIVAL works (28 works at t250); player
  slotting gate-unreachable in 250t (all overflow).
  **#70/S1 (2026-07-26) — the recorded "music +1 culture/+1 gold split"
  residual was REFUTED, not implemented.** NO Great Work pays gold in
  Civ 6; every Great Work pays CULTURE + TOURISM (Relics pay faith +
  tourism). The B7 note was an unsourced stylization; shipping it would
  have moved the engine AWAY from Civ 6 (the source-of-truth rule) and
  pinned the error into the battery. The REAL gap was the magnitude:
  `GW_WRITING_CULTURE` 2 / `GW_MUSIC_CULTURE` 4 (the Gathering Storm
  values, this repo's canon per D-11) now ship — writing unchanged,
  music 2→4. STILL OPEN, enumerated (owner-prompted 2026-07-26):
  (1) TOURISM entirely — no channel anywhere; when it lands these same
  counts owe +2 (writing) / +4 (music) tourism, and it is the gating
  dependency for the Culture victory (B-25), `RELIQUARIES`
  (religion.ts, catalog-present but effect-inert `{}`), the
  ONLINE_COMMUNITIES-class policy fillers, several wonder abilities
  (builtWonders.ts "tourism/appeal ability dropped") and the Anshan
  suzerain row (cityStates.ts).
  (2) GREAT WORKS OF ART — ARTIST is still an instant culture lump and
  carries NO works, so the whole art-work class is absent.
  (3) ARCHAEOLOGY — no Archaeologist unit, no antiquity sites, no
  ARTIFACT concept anywhere in either engine.
  (4) RELICS — no relic entity; only dropped-effect notes survive
  (builtWonders.ts "Relic slots ... dropped" ×2, RELIQUARIES inert).
  (5) SLOT HOMES are stylized, not real: real Civ 6 puts music in the
  BROADCAST_CENTER (1 slot) and splits the Museum into ART MUSEUM
  (3 art works) / ARCHAEOLOGICAL MUSEUM (3 artifacts) as a player
  choice; this model uses one generic MUSEUM with 2 slots repurposed
  for music because BROADCAST_CENTER (catalog-present, tech-unlocked)
  is past the 250t horizon. Palace/wonder work slots are also absent.
  (6) tile activation, per-person abilities, player GP units (#50/A-18).
- B-21. RESOLVED-minus-descoped-rows (2026-07-20, ROUND B8 slice K).
  The LIVE 3/6-envoy channel now keys to BUILDINGS: `csEnvoyBonuses` /
  `csRivalEnvoyBonuses` return `buildingAdd` keyed on the type's tier-1
  (`CS_TYPE_BUILDINGS[t][0]`, >=3 envoys) and tier-2 (`[t][1]`, >=6)
  building, routed through `mods.buildingYieldAdd` (player, effects.ts)
  and the `rc.buildings` loop (rival, rivals.ts) — inheriting
  cityBuildingYields' pillaged-dark + `def.regional` skip on BOTH seats.
  `envoyBonusDelta` re-keyed to match. GPU mirrors: player `cs_city6`
  via `torch.einsum(bf_live, cs_bld6)` (`_cs_b1idx`/`_cs_b2idx`), both
  rival yield paths (`_rival_city_yields_all` + `_rival_city_yields`)
  via `selb_cs`. The SUZERAIN perk is LIVE: `CS_SUZERAIN_LIVE` grants a
  flat +`CS_SUZERAIN_YIELD` (3) capital yield in the named channel to
  whichever seat holds the strict contest (`csSuzerainCapitalBonus` /
  `csRivalSuzerainCapitalBonus`; GPU `cs_suz_key`/`_cs_suz_amt` on the
  capital of all three yield paths). In-gate (250t): player 3-tier fires
  in most seeds (envoys reach 4-5), rival 6-tier + suzerain both fire
  (A-12a: rival envoys reach 9); the 6-tier + contest edges are pinned
  by `gpu/cs_bonus_test.py` (`cs_bonus` battery lane) + the suzerain
  vitest pokes. DESCOPED suzerain rows (14 shipped / 10 descoped, each
  documented in `CS_SUZERAIN_LIVE`): channel `none` (Kabul/Preslav/
  Yerevan — unit XP/cavalry/apostles), trade-route rows (Antioch/
  Kumasi/Amsterdam/Hunza — B-23), power rows (Toronto/Cardiff), and the
  amenities-channel row (Buenos Aires — the capital-yield vehicle
  carries the six yields only). RESIDUAL: the shipped rows degrade
  %-scaling/conditionals (Geneva's not-at-war, Stockholm's per-tier,
  Mexico City's project %) to a flat channel yield; industrial tier-2
  (FACTORY) is regional → its 6-tier is inert in both engines (parity-
  safe). Seed 9196 rerolled → 9197 (see A-25).
- B-23 (~85% — #71 batch 2 2026-07-26 landed ROADS, one of the two
  residuals this entry recorded. Sourced: roads are laid automatically
  by TRADERS serving land routes; an Ancient road lets a unit moving
  road-to-road ignore terrain penalties and has NO bridges; the
  Classical road adds bridges. `Tile.road` / `self.road` [B,T];
  `layTradeRoad`/`_lay_trade_road` walks the trader's path (nearest-
  neighbour toward the destination, ties by direction order — the
  war-march's own integer rule) and lays nothing at all for a SEA
  route; `moveCostInto` now takes the tile being LEFT; the bridge flag
  is latched at the era boundary in both engines. Gate-proven and NOT
  vacuous: 55-90 road tiles per game at turn 250. STILL OPEN: the
  physical Trader unit. Earlier (2026-07-20, ROUND B8 slice T, #64): Route DURATION +
  international routes landed both engines. DURATION: every route carries
  `expiresTurn = turn + TRADE_ROUTE_DURATION` (20, `core/trade.ts`); at
  expiry the route is removed and the owner re-picks NEXT turn via the
  existing deterministic pickers (arithmetic, zero draws). TS stamps it in
  `addTradeRoute`/`addCsTradeRoute`/`addIntlTradeRoute` + the rival pick
  push (`rivals.ts`), and the filter runs UNCONDITIONALLY — player via
  `expirePlayerRoutes` (game.ts endTurn, after rivalPhase), rivals via the
  filter AFTER the rival pick block (outside the capacity gate) mirrored on
  GPU by `_expire_rival_routes` (engine.py), called on EVERY exit path of
  `_rival_trade_phase` including the at-capacity early returns (the parity
  catch: an at-cap civ must still shed its expiring route). GPU carries
  per-route `r_route_exp` [B,R,K] (_MUTABLE, long, slot-parallel to
  `r_routes`; cleared at every capture/transfer/CS-death prune site).
  Gate-proven: 1122 expiry events fire across the 24 seeds × 250 turns
  (scripted + forced parity 0.0 milli, replay OK). INTERNATIONAL: a rival
  routes to a MET player city (`toPlayer` / GPU `r_route_dest` = the dest
  player-city CENTER TILE, >=0), income `routeYieldsInternational` =
  `INTL_ROUTE_GOLD`(3) + dest completed specialty count, GOLD ONLY (domestic
  keeps its food/prod), added pre-tier in `rivalCityYields` /
  `_rival_route_income`; considered AFTER domestic+CS (only when neither has
  a candidate) by NEAREST-city preference; suspended while at war with the
  destination civ (r_atwar) or a barbarian prowls an endpoint; pruned when
  the dest player center is gone (center_at<0, the TS `state.cities.find`
  twin). PLAYER→rival routes are TS-API-complete (`canAddIntlTradeRoute`/
  `addIntlTradeRoute` + `cityTradeYields` toRival branch, vitest-covered).
  Poke-pinned in gpu/trade2_test.py (battery lane `trade2`) +
  tests/trade-fidelity.test.ts. OPEN/DESCOPED: (1) the international leg is
  gate-UNREACHABLE under the scripted policy (rivals never exhaust
  domestic+CS destinations while holding spare capacity and an in-range
  player city — 0 intl routes form across the 24 seeds; correct parity, both
  engines agree), proven only by the poke — batch with #50/A-18 if a P8
  surface ever selects one; (2) rival→other-rival routes DESCOPED (rivals
  don't meet each other's cities until A-19); (3) no Trader unit, no roads
  (recorded residuals); (4) the GPU still has no PLAYER route machinery in
  the gated path (all player routes remain unreachable, per A-11/A-12b).
  Range flat 15 (`TRADE_ROUTE_RANGE`).

**Meta:**
- B-22 (50% — 2026-07-20, task #55 S3). **LANDED**: casus belli on the
  rival↔rival axis — a persistent directed denouncement grudge
  (`denouncedTurn`/`rr_denounced`, zero-draw
  `rivalRivalDenounce`/`_rival_rival_denounce` at the phase top, the
  DoW gate family at the weaker `si > sj` bar so the stamp precedes
  the war), per-pair `warKindFormal`/`rr_warkind` (FORMAL iff
  denounced ≥ RR_FORMAL_MIN_TURNS earlier, else SURPRISE), and the
  war-weariness accrual differential (SURPRISE ×WW_SURPRISE_MULT,
  FORMAL ×WW_FORMAL_MULT — the modeled casus-belli benefit; the
  player-war axis untouched). Anti-thrash DoW guard: never declare on
  a target already past RR_PEACE_WW (it would sue out the same turn).
  In-gate: 3 denouncements, 41 FORMAL / 0 SURPRISE scripted DoWs, 38
  peace firings; SURPRISE ×2 manifests off-script (rollout-proven).
  **ALLIANCES LANDED (2026-07-27).** Real Civ 6 gates an Alliance behind a
  Declaration of Friendship, and ALLIES CANNOT DECLARE WAR ON EACH OTHER —
  that last rule is what this models. `RivalCiv.alliedRivals` / GPU
  `rr_allied` [B,R,R] (in _MUTABLE), symmetric like `atWarRivals`/`rr_war`.
  A pair allies once it has been at PEACE for `rrAllyMinPeace` (30) turns
  with NO denouncement in either direction — the stylized stand-in for the
  friendship prerequisite — and a denouncement or a war breaks it on both
  sides. Formation runs immediately AFTER the denounce pass so a fresh grudge
  cannot be allied over on the same turn, and writes only from the LOWER id
  so scan order cannot matter. Zero-draw. The DoW gate gained
  `~rr_allied[a, b]`. NOT vacuous: alliances form in 12 of the 24 gate games.
  Gates: scripted parity 24x250 0.0 milli, FORCED compaction 0.0 milli,
  rollout 72/72, vitest 389/389, all 30 poke lanes, BATTERY OK 702s.
  **WARMONGER COST LANDED (2026-07-27).** Real Civ 6 prices aggression in
  GRIEVANCES: declaring war and taking cities make a civ shunned and ganged
  up on. Per-civ score (`RivalCiv.warmonger` / GPU `r_warmonger`, in
  _MUTABLE): +4 on declaring, +3 on taking a rival city, decaying 1 per turn
  while at peace on EVERY axis (floor 0). Two costs follow, which is what
  makes it a cost rather than a counter: any grievances BLOCK alliance
  formation, and past `rrWarmongerGang` (6) others may declare on the
  warmonger WITHOUT the usual strength advantage. Zero-draw, integer-only,
  and the decay sits beside the other per-turn civ accumulators so both
  engines apply it at the same position. NOT vacuous: the score peaks at 26
  in-gate. Parity was green on the first pass.
  **PLAYER GRIEVANCES LANDED (2026-07-27, #74).** The warmonger score was
  rival-only; the PLAYER now carries the exact twin (`state.warmonger` / GPU
  `p_warmonger`, in _MUTABLE), growing by RR_WARMONGER_DOW on declaring war and
  RR_WARMONGER_CAPTURE on taking a rival city, decaying 1/turn while at peace
  with EVERY rival (floor 0), at the same per-turn accumulator position in both
  engines. The CONSEQUENCE is what makes it a cost: past RR_WARMONGER_GANG a
  rival may declare on the player WITHOUT the usual 1.3x strength advantage —
  the rival-rival gang rule's twin. That gate sits BEFORE the 0.08 roll, so it
  changes how often the draw fires; both engines gate identically and scripted
  parity is green at 0.0 milli.
  Added to the HEAD trace as a compared column (`warmonger`, tol 0) — HEAD is 25.
  MEASURED live, not inert: the player's score peaks at exactly the gang
  threshold (6) with 192 civ-turns at or over it across the 24 seeds, so the
  changed DoW gate is genuinely exercised by the scripted policy.
  ONE OFF-SCRIPT BUG, caught by the new trace column on its first rollout
  (seed 9118 t69, warmonger TS=12 GPU=9 — exactly one capture): the GPU
  accrual sat BELOW the two raze `continue` branches in `_capture_rival_city`,
  so RAZING a city was free of grievances while keeping it was not. TS accrues
  at the top of `captureRivalCity`, before any raze logic, and TS is right —
  razing is if anything MORE warmongering than keeping. Moved to the top of the
  per-row loop. This is exactly why a new accumulator gets a compared trace
  column the day it lands.
  RECORDED ASYMMETRY: the +DOW accrual has no GPU twin because the GPU player
  has NO declare-war verb at all (no diplomacy action exists in the RL space);
  the CAPTURE accrual does mirror. It lands with the #50 player-verb work if a
  DoW action is ever added. Poke lanes: tests/grievances.test.ts (5) + the
  `geopolitics` battery lane (_MUTABLE, decay, floor).
  **WORLD CONGRESS S1 — DIPLOMATIC FAVOR LANDED (2026-07-28, #75).** The
  Congress currency now exists on both seats (`state.diploFavor` / GPU
  `diplo_favor`; `RivalCiv.diploFavor` / `r_diplo_favor`, all in _MUTABLE).
  Sourced (Civilopedia GS "World Congress" + Civilization wiki "Diplomatic
  Favor (Civ6)"): a civ earns favor per turn equal to its GOVERNMENT TIER
  (1-4; Chiefdom is tier 0 and pays nothing) plus DIPLO_FAVOR_PER_SUZERAIN (1)
  per city-state it is SUZERAIN of. Zero-draw, integer-only, accumulated once
  per turn at the civ level at the same position on both seats.
  The suzerain test is the exact `isSuzerain`/`rivalIsSuzerain` twin, including
  real Civ 6's TIE rule (a tie leaves NO suzerain) — pinned in the poke lane.
  Both new columns are COMPARED trace columns from day one: `diploFavor` on
  HEAD (now 26) and `rDiploFavor` on PER_RIVAL (now 21).
  MEASURED strongly reachable: by t250 the player holds 175-656 favor
  (mean 364) and rivals up to 576, with 0-2 suzerainties per seed. Parity green
  at 0.0 milli on the first pass.
  NOT MODELED, and deliberately NOT invented: favor from ALLIANCES (the player
  has no alliance axis), and the favor PENALTIES for CO2 (no climate system),
  global grievances and occupying original capitals. The sources name those
  terms but not their rates, and guessing a rate is exactly the fabrication the
  verify-before-implement rule exists to prevent.
  Poke lanes: tests/grievances.test.ts (4 favor cases) + the `geopolitics`
  battery lane (suzerain contest, tie rule, tier+suzerainty accrual, _MUTABLE).
  B-22 -> 70%. NEXT: S2 sessions + a resolution, S3 Diplomatic Victory Points
  and the win at 20 — see gpu/WORLD_CONGRESS_DESIGN.md.
  **WORLD CONGRESS S2+S3 LANDED (2026-07-28, #76).** The Congress convenes at
  every CONGRESS_INTERVAL (30) turn once ANY civ has reached CONGRESS_MIN_ERA
  (2 = Medieval), at the same post-increment position `eraBoundary` uses on
  both engines. One resolution runs per session: every civ commits ALL its
  DIPLOMATIC FAVOR as votes, the LARGEST commitment takes DVP_PER_RESOLUTION
  (1) Diplomatic Victory Point, and every commitment is SPENT whether or not it
  won. Ties keep the LOWER unified civ id; a civ with zero favor casts no vote
  and cannot win; a session with no favor anywhere still counts but awards
  nothing. Zero-draw — the outcome is a pure function of state.
  **DIPLOMATIC VICTORY** at DIPLO_VICTORY_POINTS (20, real Civ 6's threshold):
  victoryType 9 (player) / 10 (rival defeat). Precedence is now
  space > domination > religion > culture > DIPLOMATIC > score, and the
  diplomatic check is evaluated only where neither religion nor culture already
  won. This CLOSES B-25's last named victory condition.
  Three more COMPARED trace columns from day one: `congressSessions` and
  `diploPoints` on HEAD (now 28), `rDiploPoints` on PER_RIVAL (now 22).
  MEASURED, in three parts: the SESSION machinery is live (the Congress
  convenes 5-6 times per seed); the AWARD is live (102 DVP handed out across
  the 24 seeds, max 6 to any one civ); the 20-point WIN is GATE-UNREACHABLE at
  250 turns (6 of 20 is the best anyone manages), so the victory itself rests
  on the poke lanes exactly as the culture victory does.
  TWO RECORDED STYLIZATIONS, both because the real thing needs subsystems that
  do not exist: (1) VOTE SIZE — real Civ 6 lets each player choose how much
  favor to commit; there is no chooser on either seat and a roll would break
  the zero-draw contract, so every civ commits ALL its favor (the
  percentage-of-favor-spent tie-break is kept in the code so the rule is right
  when a chooser arrives); (2) DVP SOURCE — real Civ 6 awards points mainly
  through Emergencies and Scored Competitions, neither modeled, though GS does
  also award them via a late-game Congress resolution, so awarding to the
  resolution winner is faithful in SHAPE while overstating the rate.
  Poke lanes: tests/world-congress.test.ts (10: the schedule, the Medieval gate
  reading ANY civ, the vote, the tie rule, the spend, zero-favor, and all four
  victory cases including culture outranking diplomacy) + the `geopolitics`
  battery lane (the same on tensors).
  B-22 -> 85%. STILL OPEN: multiple/varied resolutions, Emergencies and Scored
  Competitions as real DVP sources, and peace deals with terms.
- B-24 (70% — 2026-07-20, task #68, brief gpu/GOVERNORS_DESIGN.md;
  serial S1-S3 main-session + S4 coverage agent, ALL FOUR stages
  hunt-free). **LANDED**: (1) ERA SCORE — per-civ zero-draw
  accumulators (`state.eraScore`/`era_score`, unified civ ids) fed by
  12 hook pairs (founds, all five capture families, rival wonder
  completion, pantheon/religion, GP claims both seats), 50-turn eras
  (`ERA_LENGTH`), t0 snapshot exported (`eraScoreInit`); hook parity
  proven by statelog logdiff (750 `ers` fields, zero divergence).
  (2) AGES — Dark/Normal/Golden per civ at every boundary
  (`eraBoundary` twin sites), thresholds EVIDENCE-PINNED
  (`ERA_DARK_T` 3 / `ERA_GOLDEN_T` 10 from the measured in-gate
  distribution); loyalty pressure scales by the SOURCE civ's factor
  (`AGE_PRESSURE` 0.5/1.0/1.5 — halves-exact) at all three loyalty
  sites; player + per-rival age are COMPARED trace columns; in-gate
  rivals hit all three ages. (3) GOVERNORS — stateless greedy +8
  anchors (`governorPicks`, quantized-milli ranking, acquisition-
  order ties; titles = civics/10 cap 5) both engines. Coverage:
  `governors` battery lane (7 pokes incl. the gate-unreachable
  player-Golden axis) + tests/governors.test.ts. STILL OPEN
  (owner-confirmed list, as of #71): the DEDICATION system, dark-age
  policies, governor establishment/promotions, per-civ tech-era drift.
  **NAMED DEDICATION CATALOG LANDED (2026-07-28, #77).** #71 modeled
  dedications as a COUNT with a FLAT per-turn payout. Real Civ 6 has each
  civ commit to a NAMED dedication per era, and every dedication has TWO
  faces: a DARK/NORMAL face paying ERA SCORE off a specific EVENT (the
  climb-out) and a GOLDEN face paying a standing bonus instead. Verified
  against the GS Civilopedia "Dedications" concept.
  FOUR dedications land — the ones whose EVENT already exists as a hook on
  both engines: 0 MONUMENTALITY (+1 per specialty DISTRICT completed),
  1 FREE_INQUIRY (+1 per EUREKA), 2 PEN_BRUSH_AND_VOICE (+1 per
  INSPIRATION), 3 EXODUS_OF_THE_EVANGELISTS (+2 per city CONVERTED).
  `DEDICATIONS` / `DED_EVENT_SCORE` + `dedicationEvent()`; GPU `ded_picks`
  [B, 1+R, 3] (in _MUTABLE) + `_dedication_event`. Eight event sites wired,
  four per seat: district completion, eureka, inspiration, conversion.
  THE PICK is a stateless deterministic ROUND-ROBIN over the catalog keyed
  on (era + civ + slot) — real Civ 6 lets the player choose, there is no
  chooser on either seat, and a roll would break the zero-draw contract.
  A HEROIC age takes three consecutive entries. Recorded stylization.
  THE GOLDEN FACE keeps #71's flat faith: the named Golden bonuses
  (Monumentality's faith purchases, Free Inquiry's eureka overflow, ...)
  need machinery this round does not build, and inventing substitutes is
  exactly what verify-before-implement forbids. Recorded residual.
  MEASURED, and the measurement mattered: the event faces fire 199 times
  across the 24 seeds (123 Monumentality, 50 Exodus, 24 inspirations, 2
  eurekas) — so this is live, not inert. The Age distribution is
  BYTE-IDENTICAL to the pre-#77 baseline (Dark/Normal/Golden 16.7/22.8/60.6%),
  measured by running the previous commit's engine over the same seeds: no
  civ crossed a threshold, so the evidence-pinned ERA_DARK_T/ERA_GOLDEN_T
  need NO re-pinning. Parity green at 0.0 milli on the first pass.
  Poke lane: tests/governors.test.ts (5 dedication cases — the matching
  event only, EXODUS's double rate, the Golden-age silence, the Heroic
  double-pay, and a civ with no commitments).
  B-24 -> 85%. STILL OPEN: the other eight catalog entries (four of which
  need spies / air units / artifacts / Giant Death Robots), the named
  GOLDEN bonuses, dark-age policies, governor establishment/promotions,
  and per-civ tech-era drift.
- B-25 (re-scoped 2026-07-17, Round B2). LANDED: Science victory — a
  6-step space-race project chain gated on late techs, `victoryType` 3
  (player win) / 4 (rival completion = defeat) in `endTurn`; Campus is
  the Spaceport proxy; TS-complete + vitest (`space-victory.test.ts`).
  **GPU sim LANDED (2026-07-18, ROUND B3 slice W)**: the chain ships
  to the GPU (exporter unfiltered with sp/vic/rt/rp fields,
  `space_done` per-civ state, rival completion → victoryType 4 +
  game_over via the A-14 projects path, endTurn recompute mirrored) —
  landed byte-identical and PROVEN GATE-UNREACHABLE even at 250t
  (rival greedy resolves a Campus to RESEARCH_GRANTS first; the
  player has no GPU project subsystem), so parity rests on
  `gpu/space_race_test.py` (gpu/ROUND_B3_LOG.md §W). **RELIGIOUS
  victory LANDED (2026-07-19, ROUND B6 S3)**: `religiousVictor` /
  `_religious_victor` — predominance (>half of each civ's cities)
  in EVERY alive civ, checked at endTurn on the just-flipped follow
  set, victoryType 5 (player religion) / 6 (rival religion, defeat),
  precedence space > domination > religion > score; gate-unreachable
  at 250t, poke-pinned (`tests/religious-victory.test.ts` + the
  `religion2` battery lane).
  **CULTURE victory LANDED (2026-07-27, #72).** Real Civ 6 (Gathering
  Storm, verified against the Civilopedia/wiki "Tourism" pages) scores two
  tourist populations: VISITING tourists from a civ's lifetime TOURISM
  (divided by nCivs x 200 — the Rise-and-Fall-onward value; vanilla's 150
  is the number the older community write-ups quote) and DOMESTIC tourists
  from its lifetime CULTURE (divided by 100). A civ wins the moment its
  visiting tourists exceed EVERY other civ's domestic tourists.
  victoryType 7 (player win) / 8 (rival win = defeat); precedence is now
  space > domination > religion > CULTURE > score, and the culture check is
  evaluated only where religion did not already win (`cultureVictor` /
  `_culture_victor`, the identical endTurn position in both engines).
  Both counts FLOOR to whole tourists, so the comparison is integer-exact
  and zero-draw; culture is milli-rounded before the floor (the bankruptcy
  convention) so sub-milli float drift cannot move a tourist count.
  SUBSTRATE: the missing half was per-rival LIFETIME CULTURE —
  `RivalCiv.cultureTotal` / GPU `r_culture` (in _MUTABLE), banking the same
  per-turn `culSum` that feeds `civicProgress`, which every completed civic
  SPENDS and which is therefore not a lifetime total. Added to the PER_RIVAL
  trace (`rCulture`, float x1000 tol 2) the day it landed, so parity proves
  the accumulator: green at 0.0 milli on the first pass.
  MEASURED GATE-UNREACHABLE (not guessed): across the 24 scripted seeds at
  250 turns the BEST any civ manages is a gap of -12 — visiting tourists
  peak at 7 while domestic reach 97. The cause is a real fidelity gap, not
  a tuning one: this model's tourism still lacks relics, artifacts,
  National Parks and Great Works of Art (all B-20 residuals), so the two
  populations are orders apart. Scripted parity therefore proves only the
  ACCUMULATOR; the CHECK is pinned by `tests/culture-victory.test.ts` (7
  pokes) and the new `culture_victory` battery lane (the same 7 semantics
  on GPU tensors + the _MUTABLE round-trip). B-25 -> 90%.
  **DIPLOMATIC victory LANDED (2026-07-28, #76)** — see the B-22 entry: the
  World Congress awards Diplomatic Victory Points and 20 wins (victoryType
  9/10). That was B-25's last unmodeled victory condition, so every named
  Civ 6 victory now exists on both engines: score, domination, science,
  religion, culture and diplomacy.
  STILL OPEN in B-25: only the player project-production path (victoryType 3
  can be preserved but not produced on the GPU). B-25 -> 97%.
- B-33. **RESOLVED (2026-07-20, task #55 S2/S3; the fidelity face of
  A-19)**: rivals now war, denounce, sue for peace and conquer among
  themselves (see A-19 + B-22 for the machinery). The star topology is
  gone — the in-gate seeds run genuine rival↔rival wars (4/24 seeds,
  41 DoWs, 38 peaces) with cross-rival city capture live in the
  rollout. Rival↔rival TRADE and alliances remain out of scope
  (recorded under B-23/B-22 respectively).

Sweep corrections (2026-07-12): B-13 policy count 20→19 (direct
recount); B-16 reframed — IZ mine value matches vanilla, deviation is
vs the GS ruleset the repo otherwise models; B-17 "inert" was stale —
Encampment produces General GPP and building yields now, remaining
gaps re-scoped; B-26's one-step barb march re-verified still open
(A-8 shipped full-MP for rivals only); B-27 figures refreshed by
direct count. All other inherited items re-verified accurate.

## D. Engine optimizations — CHAPTER CLOSED 2026-07-13

D-1..D-8 (task #36, f739d8c), D-10..D-18 (task #52, 1779904) and D-9
(task #53) all landed bit-exact; landing logs live in git history. D-9
(`_rival_city_yields_all` batching, gate-equivalence-proven) closed
the chapter. Hard constraint for any future item stays: bit-exact,
gate-equivalence is the bar; never read perf numbers off a contended
machine.

## E. Docs staleness

Fresh hunt 2026-07-13, post-#49-sweep (E-1..E-15 closed at 806a4a0) —
three verified contradictions the day-old sweep missed. **E-19..E-21
SWEPT 2026-07-13 (task #51)**: improvements.ts header rewritten to
current reality (9-improvement roster, real charges,
`validImprovementsIn` gating, sandbox bypass), both gpu/README
coverage cells corrected (chops/harvests are the only TS-only
remainder; player build heads stop at FARM/MINE/LUMBER_MILL), and a
RETRO note re-scopes BUILD_PLAN VP-G1/G2's never-spend premise
against shipped A-5/A-4/A-14. tsc clean. E-16 (AGENT_PROMPT.md
refresh) RESOLVED 2026-07-18: the owner archived the file to
docs/archive/ instead of refreshing it. Original items kept for
reference:

- E-19. RESOLVED (2026-07-13, task #51): `improvements.ts` header
  rewritten to current reality (9-improvement roster, real charges,
  `validImprovementsIn` gating, sandbox bypass).
- E-20. RESOLVED (2026-07-13, task #51): gpu/README coverage cells
  corrected — chops/harvests are the only TS-only improvement
  remainder since A-13.
- E-21. RESOLVED (2026-07-13, task #51): a RETRO note re-scopes
  BUILD_PLAN VP-G1/G2's never-spend premise against shipped
  A-5/A-4/A-14.

## G. Known parity latents (dormant)

G-1..G-7 resolved (detail in git history / the cited logs):

- G-6. RESOLVED (2026-07-20, task #55 GEO-H hunt, off the GEO-1
  branch). The class re-fired on the GEO-1 base: rollout seed 9235
  rng 2026006133 went red at t246 (rival production), first statelog
  divergence a rival FOUNDING at t247 — RC1's settler founds on tile
  687 (GPU) vs 644 (TS). ROOT (verified, NOT the C-7 tie-break the
  slice-R note guessed): the exporter's `st` static-settleable plane
  (`export-gpu.ts`, tile field `st`) baked `!t.district` — a DYNAMIC
  property — into an otherwise-static plane (water/impassable/wonder/
  OASIS). The engine's `_rival_try_found` candidate gate (`settle_ok`)
  ANDs `st` with a LIVE `self.district < 0` check, so a tile that held
  a district at export time (a scripted city's center, tile 644) but
  LOST it during the rollout (the city razed — seed 9235 runs under the
  A-19/B-33 rival-rival wars) stayed PERMANENTLY unsettleable in the
  GPU (`st`=0 frozen) while TS's `siteQuality` reads `tile.district`
  live and re-opened the freed tile. TS (live) is correct — real Civ 6
  re-settles a razed city's tile. FIX: drop `!t.district` from the `st`
  bake; the live `self.district < 0` gate already covers t0 AND
  dynamically built/removed districts. Wrong engine: the GPU input
  data (a static plane must not freeze a dynamic property). Seeds
  9235 + 9144 both green, rollout 72/72; scripted + forced 0.0-milli.

- G-7. RESOLVED (2026-07-20, task #55 GEO-H — the SECOND target game,
  a DISTINCT root cause the GEO-1 brief mis-attributed to the G-6
  settle class). Rollout seed 9144 rng 2026006111 went red at t182:
  player city 412 foodBox off by 0.85 (food yield identical, so NOT a
  worked-tile/territory divergence — a growth-FACTOR one). ROOT: a TS
  shared-reference ALIASING bug in `withFollowerBelief` (`effects.ts`).
  It shallow-cloned `buildingYieldAdd` (`{ ...base.buildingYieldAdd }`),
  which copies the top-level keys but SHARES their `Partial<Yields>`
  objects; `applyBeliefEffects` reuses an existing building's record
  (`mods.buildingYieldAdd[b] ??= {}`) and `addPartial` MUTATES it in
  place. When a follower belief adds to a building already in `base` —
  Feed-the-World's SHRINE +1 food while a religious city-state's
  3-envoy bonus had already put SHRINE (faith) in `base` — the mutation
  corrupted the per-turn FROZEN `mods` that `endTurn` computes once
  (game.ts:769) and reuses across the whole city loop. So a city
  FOLLOWING a Feed-the-World religion (city 538, processed first)
  leaked +1 Shrine food onto every LATER city's growth accrual (city
  412, which follows no religion) — foodBox drift the GPU, which
  computes each city's follower belief independently, never had. GPU
  is correct (source-of-truth: pick real-Civ-6 behaviour — a follower
  belief affects only its own city). FIX: DEEP-clone the nested
  per-building records in `withFollowerBelief`. Both target games green,
  rollout 72/72. NOTE: unreachable in the scripted gate (CS envoys
  never pass 1 there, so `base` never carries a CS building key to
  alias) — a rollout-only latent, dormant until an envoy-rich rival
  religion met a following player city.

- G-5. RESOLVED (2026-07-19, ROUND B10 slice-H, #66). The class: a
  rival's treasury off by EXACTLY 1 gold (± score, e.g. 5.4) on the
  turn it ACQUIRED a player city mid-phase — seed 9222 t184 (loyalty
  defect, ROUND B5) and seed 9301 rng 2026006147 t223 (rival 0 war-
  captures player city 586, B9-R2), rosters/per-city RC fields/combat
  all bit-identical. ROOT: `transferCityToRival` (rivals.ts) built the
  new rival city's `districts` by pushing EVERY complete owned district
  tile, so a player city holding duplicate-type districts (two CAMPUS
  tiles, 499 + 543) handed the rival BOTH campuses' floored adjacency.
  The GPU twin `_transfer_city_to_rival` writes the type-keyed registry
  `rc_dist_tile[type] = tile` in ascending tile order, silently
  OVERWRITING to one tile per type (kept 543, dropped 499) — and both
  its yield path (`_rival_city_yields_all`) and trace district count
  read that registry. Net: TS counted/yielded two campuses (raw science
  13), GPU one (raw science 9 → ×0.9 amenity factor = the 3.6 gap ×1.5
  science weight = 5.4 score; the treasury delta is the same missing
  campus's economy). Wrong engine: TS (real Civ 6 = one district per
  type per city; the GPU registry IS that model). FIX: `transferCityToRival`
  dedupes kept districts by type via a Map, last (highest tile index)
  wins — mirroring the GPU registry overwrite exactly. Verified: the
  faf08cc repro (seed 9301 rng 2026006147) goes red→green; SEED_OVERRIDES
  17:9222 + 23:9301 restored (the reshuffled current-engine trajectories
  no longer hit an acquisition at those turns, so they ride in-gate green
  rather than red — the fix closes the latent regardless). Only
  `transferCityToRival` (player→rival) can carry duplicate-type
  districts; captureRivalCity/`_transfer_rc_to_rc`/CS capture start from
  one-per-type sources.
- G-1. RESOLVED: `_rival_builder_actions` gain terms read current
  `r_techs`/`r_civics` (validity keeps the snapshot); poke
  `gpu/builder_gain_test.py`.
- G-2. RESOLVED (2026-07-17, #47r): GPU player GP loop banks faith via
  a `player_faith` accumulator mirroring the rival loop.
- G-3. RESOLVED-AS-REFUTED (2026-07-17, #46r): the iteration-order
  theory was wrong (`_reclaim_pool` is stable); the real flip blockers
  were housingAll, wildcard-slot overflow, and the builder camp-clear
  mirror — all fixed (`gpu/government_test.py`).
- G-4. RESOLVED-ON-CATCH (2026-07-17, #56): scripted builder walker
  moved AFTER production (TS order), fixing a one-turn phantom job.

- G-8. **RESOLVED-AS-REFUTED (2026-07-20, #69 S2 — the G-3 re-verify
  rule's third save, after G-3 itself and the A-24-family
  re-verifies)**. The #55-S3 sighting (cap 16→32 → seed 9092
  score/treasury/building drift at t216, attributed to a dormant
  −3/−4-amenity-tier divergence) does NOT reproduce: the SAME engine
  code (S4 shipped tests only) with `WAR_WEARINESS_CAP` = 32 and a
  PROPER re-export runs the full ladder green — scripted 24/24
  0.0-milli (9092 included), forced, rollout 72/72, battery 36
  lanes. Most probable artifact mechanism: the experiment raised the
  TS constant without re-exporting rules.json, leaving the GPU
  accumulator clamped at 16 while TS climbed to 32 — which produces
  EXACTLY the reported symptom the moment ww crosses 16 on a
  player-war seed. Both engines clamp the accumulator at the cap
  (verified at all four accrual sites); cap 32 is now SHIPPED
  (B-15's −4 ceiling).

- G-9. **RESOLVED (2026-07-26, #70 — found by the round's own hunt).**
  THE CLASS: "the capital is always city column 0". `is_cap` is set on
  column 0 at creation and was thereafter only ever CLEARED, so every
  reader that hardcoded column 0 agreed with TS by accident. A-9 palace
  RELOCATION broke the invariant and exposed four sites, each a real
  divergence the moment a capital falls and the Palace re-crowns a
  survivor:
  (1) `trace_row` counted the player's Palace as `+ (1 if c == 0 else 0)`
      — a HARNESS bug (the recurring D-10 class), while the RIVAL row
      already keyed correctly on `rc_is_cap`;
  (2) the city-state envoy CAPITAL bonus and (3) the B-21 SUZERAIN perk
      were added to `total[:, 0, :]`, where TS applies them through
      `mods.capitalYields` under `if (city.isCapital)`;
  (4) the SCRIPTED PRODUCTION chain — builder/settler/district branches —
      drove off column 0, so after seed 9183's capital was razed at t218
      the GPU queued nothing from a dead column while TS kept building in
      the new capital (the t226 `punits` 8-vs-7 symptom, with the missing
      BUILDER's improvements trailing behind it). The same pass fixed the
      `applyGreatPersonEffect` mirror: `productionToCapital` credited
      column 0 and GENERAL/ADMIRAL spawned at column 0.
  All four now resolve a live capital column / mask from `is_cap`. NOTE
  for #50: `holy_tile[:, 0]` is the same asymmetry, currently unreachable
  (player religion verb absent) — it needs the flag when #50 lands.
  LESSON: an invariant that holds only because a value never moves is a
  latent, not an invariant; the mechanic that makes it move finds them
  all at once.

- G-10. **RESOLVED (2026-07-26, #70)**. `captureCityState` and
  `captureCityStateForRival` (combat.ts) pushed a CITY_CENTER entry into
  the new city's `districts` array but never set
  `center.district = 'CITY_CENTER'` on the TILE — unlike `foundCity`
  (game.ts) and `foundRivalCity` (rivals.ts), which both do. So an
  annexed city-state's centre was invisible to every `tile.district`
  reader: `attackTargets`' playerCity check could not target it,
  `workableTiles` would let a citizen WORK the city centre, and
  settle/site scans counted the tile free. The GPU has no
  district-CITY_CENTER plane (it uses `center_at`/`rvcity_at` as the
  proxy) and so always treated it as a city — TS was the WRONG engine,
  and real Civ 6 agrees: a conquered city-state IS a city. Dormant
  because it needed a CS conquest AND a hostile in range; surfaced when
  #70/S5's ranged barb scan widened the exposure from d==1 to d<=2.

## F. Hunt tooling — MOVED (2026-07-13)

The hunt-tooling reference is IMPLEMENTED machinery, not an open gap;
it now lives in gpu/HUNTING.md (same content, maintained there).
