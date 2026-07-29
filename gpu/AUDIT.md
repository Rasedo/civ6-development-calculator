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
  **FORT + MILITARY ENGINEER LANDED (2026-07-28, #78).** Both sourced by direct
  Civilopedia fetch: the FORT is "Occupying unit receives +4 Defense Strength,
  and automatically gains 2 turns of fortification", built by a Military
  Engineer, prereq Siege Tactics; the MILITARY ENGINEER is 170 Production,
  2 Movement, 2 build charges, prereq Military Engineering.
  BOTH APPENDED LAST, per the index-stability rule stated on the ImprovementId
  union — roster order IS each engine's index, so inserting anywhere else
  renumbers every existing improvement/unit and every exported fixture. (I did
  place FORT mid-list first and moved it; the union's own comment caught it.)
  `validImprovementsIn` gained an optional `builder` — it was unit-agnostic
  because every improvement before this one could be built by any Builder, and
  the FORT is the first that cannot. Callers passing nothing keep the old
  behaviour and never see the FORT, a safe default rather than a silent change.
  The +4 goes into `terrainDefense` on the TS side (the single chokepoint every
  defender path routes through) and, on the GPU, into two new helpers
  `_tdef_g`/`_tdef_i` replacing all NINE `tdef` read sites. It must be LIVE
  rather than baked into the static `tdef` plane, because a fort is built,
  pillaged and replaced mid-game and the chop/found paths rewrite `tdef` from
  hills alone — which would silently erase a baked-in bonus.
  TWO HALVES NOT MODELLED, recorded rather than approximated: the automatic
  2 turns of fortification (needs a hook on every tile-entry site; fortifyBonus
  is a separate accumulator), and "deals minor damage to and depletes the
  movement of hostile units walking onto this tile" (no tile-enters-damage hook
  exists in either engine, and the damage is unquantified — inventing a number
  is the guessed-constant failure this sweep exists to catch).
  **GATE REACHABILITY IS ZERO, MEASURED**: across 6 seeds x 250 turns NO
  Military Engineer is produced and NO fort is placed, so scripted parity is
  vacuous for this mechanic. It is proven instead by two constructed lanes —
  tests/fort.test.ts (4 assertions: +4, stacks with hills to 7, no yields,
  offered to MILITARY_ENGINEER and nobody else) and gpu/fort_test.py (+4 and
  stacking, both index forms agreeing, and the bonus staying OUT of the static
  plane so removing the fort removes it). Nothing yet BUILDS an engineer — the
  production/AI wiring is the remaining B-27 tail, alongside the post-tech-tree
  improvements.
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

- **B-19/#39 PROJECT RATES — FIXED 2026-07-29 (#79).** The last Festival
  residual is closed, and the sourcing sweep's recorded numbers were re-verified
  against the Civilopedia/wiki rather than trusted from this file:
    * `PROJECT_YIELD_FRACTION` 0.75 -> **0.15**. Real Civ 6 converts 15% of the
      city's production to the district's yield. CONFIRMED IDENTICAL for Campus
      Research Grants (Science), Holy Site Prayers (Faith) and the Theater
      Square Festival (Culture), so the rate is UNIFORM — the "per-project
      table" the residual called for is not needed for yield. The old 0.75 was
      five times real.
    * `PROJECT_GPP_FRACTION` 0.3 -> **0.22** for a single-class project.
    * The THEATER SQUARE FESTIVAL now pays Great WRITER, ARTIST **and**
      MUSICIAN **0.11 each** via new `gpClasses`/`gppFraction` overrides on
      ProjectDef. This is not arbitrary: the Festival's D_TYPE is 5 where every
      other district project's is 10, which is exactly the 11-vs-22 split.
  `gpClass` is retained as the primary class and the GPU keeps its single `g`
  column for INDEX STABILITY; the new `gs` (class list) and `gf` (per-row rate)
  columns are additive, and the GPU falls back to `g`/the global fraction when
  they are absent.
  GATE REACHABILITY, MEASURED: over the 12-seed 250-turn gate the rivals
  complete **51** Campus Research Grants and **7** Holy Site Prayers and
  **ZERO** Festivals. So scripted parity genuinely covers the YIELD-fraction
  change (58 completions, both engines moving together at 0.0 milli) but cannot
  reach the multi-class award at all. New poke lanes construct it directly:
  `gpu/festival_test.py` (exported table + a planted rival completion paying
  11 to each of the three classes and nothing elsewhere, with a guard that the
  Festival rate never equals the single-class rate) and a TS twin in
  `tests/economy.test.ts` that measures against a CONTROL turn, because a
  Theater Square accrues +1 to each of those classes per turn on its own.
  ONE TEST CORRECTED, not silenced: `economy.test.ts` "Encampment Training
  grants only general points" asserted the treasury delta was
  `< cost * PROJECT_YIELD_FRACTION`. That bound only passed because the
  fraction was 0.75 — at the sourced 0.15 the bound (2.4) falls BELOW ordinary
  city gold income (4.25), so it was testing the constant's size, not the
  project. It now asserts the real invariant (TRAINING carries no yield by
  construction; no other GP class moves).
  Gates: tsc clean, vitest 443/443, re-export, scripted parity 0.0 milli,
  BATTERY OK 523s.
  **SLICE 5 — src/data/resources.ts BONUS rows (2026-07-28, #78).** All seven
  bonus-resource yields VERIFIED CORRECT against the wiki resource list (Wheat,
  Rice, Cattle, Sheep, Bananas +1 Food; Stone, Deer +1 Production). No change.
  ONE SOURCED RESIDUAL found in the pass: real Civ 6 gives RICE and WHEAT an
  ADDITIONAL +1 Food when the city has a working WATER MILL. This model gates
  the Water Mill on a river and pays its own flat +1 food/+1 production but not
  the per-resource bonus. Recorded, not fixed — a yield change needing its own
  gated round with the term at the same position on both engines. The LUXURY and
  STRATEGIC rows are NOT yet swept.
  **REPRODUCTION ATTEMPTED - THE RECONSTRUCTION WAS WRONG (2026-07-28, #78).**
  The worktree at `.claude/hunt78` (base e56e988 + the five combat strengths +
  SEED_OVERRIDES 6: 9080) was exported and run through a full plain rollout:
  **REPLAY PARITY OK, 72/72 - the rGScore1 red does NOT reproduce.**
  WHY THE RECONSTRUCTION MISSED IT: the original red battery ran BEFORE the
  Camp retraction, so that tree ALSO carried the erroneous `CAMP gold: 1`. Camp
  gold feeds rival city yields, which feed rivalEmpireScore - so my own wrong
  constant was part of the trajectory that reached the divergence, and a
  reconstruction without it reaches a different world entirely.
  WHAT THIS MEANS: the rGScore1 divergence is a LATENT that needed a specific
  trajectory to expose, and BOTH known ways of reaching it are now gone (the
  Camp value is corrected, and the Monarchy slot fix shifted trajectories
  again). It is NOT fixed and NOT currently reachable. The reproduction recipe
  recorded earlier is WRONG and would send the next hunt down a dead end -
  corrected here, which is the point of recording it.
  The `.claude/hunt78` worktree can be removed; it reproduces nothing.
  **REPRODUCED AT LAST (2026-07-28) — the recipe above is WRONG; here is the
  right one.** e56e988 sits AFTER the Camp retraction, which is exactly why it
  reaches a different world. The correct base is **61c1e66**, the commit that
  recorded "5 errors found, change REVERTED pending a hunt": like 81bb972 for
  the envoy case its tree IS the code that produced the red, and it still
  carries the erroneous `CAMP gold: 1`.
      git worktree add <dir> 61c1e66 --detach
      git diff 8eddd91~1 8eddd91 -- src/data/units.ts | git apply   # 5 strengths
      SEED_OVERRIDES 6: 9080          (9079 is wiped by the stronger world)
      npx vite-node scripts/export-gpu.ts
      python gpu/rollout.py --shards 4 --pipeline-replay
  gives, byte-exact:
      seed 9235 rng 2026006134: turn 249: column 72  TS=188400 GPU=191250
  i.e. the 2850-milli = 2.85 gap. Worktree preserved at `.claude/hunt-rg`.
  THE LESSON, twice over: reproduce on the EXACT state, never an approximation.
  Both failed reconstructions this session omitted something the original
  trajectory contained — here my own wrong Camp constant.
  **LOCALIZED IMMEDIATELY (2026-07-28): it is an ERA SCORE award, not a yield.**
  logdiff on the reproduction puts the FIRST divergence at turn 112 with exactly
  ONE differing field, on rival 0's trace row:
      112 RT0  GPU: ... ers21 ...
               TS : ... ers23 ...
  Every other field at that turn is identical — ncity7 pop31 treas-305800
  fai1007200 ntech24 nciv19 war0 ww7 rrw0 rrk0 age1 terr:78 wterr:5 tsum:45729
  rsc:403987. So the two engines award rival 0 a DIFFERENT ERA SCORE (GPU 21,
  TS 23, a 2-point gap), and that propagates through Ages into the score column
  137 turns later as the 2.85 rGScore1 gap.
  THIS IS A DIFFERENT ROOT CAUSE FROM THE ENVOY CASE — nothing to do with the
  ownership-blind attack predicate. Era score is the B-24 event ladder
  (`rules.eras`: found / conquer / wonder / pantheon / religion / gp), so the
  question is which EVENT one engine credits and the other does not, or credits
  at a different value. GPU is LOWER by 2, so TS awarded something extra.
  **NARROWED TO RELIGION FOUNDING (2026-07-28) — a COUNT vs a SET.**
  Per-turn era score for rival 0, straight from the two statelogs:
      t111 GPU 18 / TS 18 (agree) | t112 GPU 21 / TS 23 | t113 22/24 | t120 34/36
  So at t112 the GPU awards +3 and TS awards +5 — ONE EXTRA 2-POINT EVENT on the
  TS side, and the gap persists until the age reset zeroes both. The ladder has
  exactly two 2-pointers (FOUND 2, RELIGION 2) and `ncity` is 7 on BOTH sides at
  t112, so nothing was founded. That leaves RELIGION.
  Both engines award ERA_SCORE_RELIGION at the founding moment, so the question
  is WHEN the religion is founded, and the two gates are not the same test:
   * TS (core/rivals.ts ~975-990) builds real lists and requires
     `followers.length > 0 && founders.length > 0`, filtering on
     `id !== state.religion.founder && !claimedBeliefs.includes(id)` — it
     excludes claimed beliefs AND THE PLAYER'S OWN FOUNDER BELIEF.
   * GPU (engine.py ~13078) gates on COUNTS:
     `ropen = rdue & (claimed_f_n < followerPool 8) & (claimed_o_n < founderPool 8)`.
  A count and a set diverge the moment their exclusion sets differ, and TS
  carries an exclusion a bare count cannot represent. That shifts the founding
  turn -> the era score -> the Age -> the 2.85 rGScore1 gap at t249.
  **COUNT-vs-SET REFUTED BY MEASUREMENT (2026-07-28).** Both seats instrumented:
      GPU (row 56) t108-115: claimed_f_n=2 claimed_o_n=2 fPool=9 oPool=8
                             rdue=False ropen=False done=True
      TS  same window:       followers=8 founders=7 claimed=2 done=false
  The belief POOLS gate neither engine — TS has 8 followers and 7 founders free
  and both agree 2 beliefs are claimed. The count-vs-set difference is real in
  the code but is not what diverges here.
  **WHAT DIFFERS IS THE FOUNDING TURN.** The GPU already has
  `r_religion_done=True` at t108 (founded BEFORE the window); TS is still
  unfounded at t112, which is exactly where the arithmetic demanded its +2.
  So the question moves UPSTREAM to the eligibility gate rather than the draw:
      rdue = active & ~done & pantheon_done & (prophets > 0) & has_holy_site
  **RETRACTED (2026-07-28): the religion narrative below is WRONG.** Rival 0's
  era score in both statelogs reads t76 3/3, t77 3/3, t78 3/3, **t79 6/6 (+3 on
  BOTH)**, t80 7/7, t110 17/17 — the two engines agree unbroken from t76 to t111,
  so TS founds its religion at ~t79 exactly as the GPU does. The religion timing
  does NOT diverge and the different-Ages story is false.
  TWO METHOD ERRORS produced it, both mine: (1) the TS probe filtered on
  `rival.id === 0` but NOT on the GAME, and the replay walks all 72 — its
  `done=false` lines at t112 were from other games, a flaw I had ALREADY recorded
  one commit earlier and then reasoned from anyway; (2) I assumed a 2-point gap
  must be ONE 2-point event, when two 1-pointers (GP, pantheon, dedication) give
  the same delta — that is what made RELIGION look like the only candidate.
  WHAT SURVIVES, all measured: first divergence t112 (GPU 21 / TS 23); exact
  agreement through t111; +3 GPU vs +5 TS at t112; the gap persists to t120 and
  is wiped by an Age reset (both 0 at t150); and the GPU's gate trace itself is
  sound (pantheon + holy site ready by t76, prophet at t78, founds t78/79).
  **TS's AWARD STREAM, NAMED (2026-07-28)** — addEraScore re-instrumented WITH
  the game filter (`__cbLog` is defined only for the logged game), rival 0:
      t110 +1 -> 17 | t111 +1 -> 18 | t111 +2 -> 20 | t111 +2 -> 22 |
      t112 +1 -> 23 | t113 +1 -> 24
  That also explains the statelog sampling: it reads 18 at t111 and 23 at t112
  because the two +2s land AFTER the t111 snapshot (18+2+2+1 = 23).
  So TS credits **TWO 2-POINT EVENTS** between the t111 and t112 snapshots while
  the GPU gains only +3 in the same interval. The ladder's only 2-pointers are
  FOUND and RELIGION, so TS is crediting two foundings, or a founding plus a
  religion.
  THE CONTRADICTION TO CHASE: `ncity` is 7 on BOTH engines at t112 — if TS
  founded two cities at t111 the counts should differ, and they do not.
  Candidates: a founding immediately undone (razed/lost) that keeps its era
  score; a double-award on a single event; or a 2-point path not yet enumerated.
  **LOCALIZED (2026-07-28): it is the B-24 DEDICATION award, and the two engines
  run DIFFERENT FORMULAS.** GPU named stream (row 56, rival 0):
      t111 dedication 18->20 | t115 dedication 24->26 | t116 gp 27->28 |
      t116 dedication 28->30
  Every 2-point award around t111 on BOTH seats is a DEDICATION — retiring the
  last of the FOUND/RELIGION reasoning.
   * TS `core/eras.ts dedicationEraScore`: gated on age !== 2 (not Golden),
     returns `DEDICATION_ERA_SCORE (1) * dedications[civ]` — a PER-TURN
     climb-out bonus scaled by the civ's dedication COUNT.
   * GPU `engine.py ~8318`: `era_score[:, civ] += pay * n * _ded_event_score[kind]`
     with `DED_EVENT_SCORE = [1, 1, 1, 2]` — an EVENT-KEYED payout scaled by the
     dedication KIND.
  Both emit +2 here by different routes (a count of 2 vs a kind score of 2), so
  they agree by coincidence until count and kind-score part — exactly the shape
  of a latent that hides for a hundred turns then leaves a permanent gap.
  **WITHDRAWN (2026-07-28): the "different formulas" claim above is WRONG — my
  GPU probe missed a site.** BOTH engines carry BOTH paths:
    per-turn climb-out: TS `dedicationEraScore` (via applyDedications) | GPU
      ~14626 `_es = where(_gold, 0, dedications * _ded_era)`
    event-keyed (#77):  TS `dedicationEvent` (boosts.ts, game.ts) | GPU ~8318
      `era_score[:, civ] += pay * n * _ded_event_score[kind]`
  I enumerated the GPU sites with the text pattern `era_score[..., r + 1] +=`,
  and the per-turn site is a WHOLE-TENSOR add (`self.era_score = self.era_score
  + _es`) that does not match it. So the [GERA] stream was partial while the TS
  stream (hooked inside addEraScore) was complete — comparing them manufactured
  the difference.
  THIRD PATTERN-ENUMERATION MISS THIS SESSION (after the trace planted in the
  barbarian walk, and the TS probe filtered by rival but not by game). The rule
  that keeps proving itself: hook the COMMON FUNCTION or diff STATE at
  boundaries; never enumerate call sites by grep.
  WHAT STILL STANDS: the divergence is in the DEDICATION award — the GPU's event
  site fires +2 at t111 and every 2-pointer around t111 on both seats is a
  dedication. WHICH path diverges, and why, is NOT established.
  **ANSWERED (2026-07-28) — it is a CONVERSION COUNT, not the era-score system.**
  State comparison at the per-turn dedication probe, row 56 / civ 1:
      t108-111  GPU dedications=1 age=1 perTurnEs=1, eraScore 14,15,16,17
                TS  IDENTICAL on every field
      t112      GPU eraScore=20 (+3)   |   TS eraScore=22 (+5)
  So the per-turn term is byte-identical on both seats. The divergence is wholly
  in the EVENT-keyed awards between those probes:
      GPU: +1 per-turn, then ONE event +2            = +3
      TS : +1 per-turn, then TWO events +2, +2       = +5
  `DED_EVENT_SCORE = [1,1,1,2]`, kind 3 = EXODUS_OF_THE_EVANGELISTS, "+2 per city
  CONVERTED" (#77). A +2 award is one converted city, so **at t111 TS credits TWO
  city conversions and the GPU credits ONE.**
  THAT MOVES THE HUNT OUT OF B-24 ENTIRELY AND INTO RELIGIOUS SPREAD (B-18): the
  engines disagree on how many cities flip to rival 0's religion that turn.
  Era score, Age and the 2.85 gap at t249 all follow from the one extra flip.
  The dedication and era-score paths are EXONERATED — do not touch them.
  **A REAL MISMATCH WAS FOUND AND FIXED HERE, BUT IT IS NOT THIS BUG.** TS calls
  `dedicationEvent` once per OCCURRENCE (game.ts:1261 sits inside the per-city
  loop); the GPU's `_dedication_event` took a bool MASK [B], so N occurrences in
  one turn paid ONCE, and the two conversion sites collapsed explicitly with
  `.any(dim=1)`. It now takes a COUNT and the conversion sites pass `.sum(dim=1)`,
  matching #77's sourced "+2 PER CITY converted". Battery OK 491s.
  GATE-UNREACHABLE: parity is 0.0 milli both BEFORE and AFTER, so the scripted
  gate never reaches a multi-conversion turn. The fix rests on the TS-vs-GPU
  code comparison and #77's wording, not on any gate.
  **IT DOES NOT FIX rGScore1** — applying it in the reproduction leaves the red
  BYTE-IDENTICAL (TS=188400 GPU=191250), i.e. GPU behaviour in that game did not
  move at all.
  MY REASONING ERROR, the THIRD of this shape in this hunt: I saw a +2 award and
  concluded "one converted city, since DED_EVENT_SCORE[3] = 2". The payment is
  `n * score`, so +2 is equally a score-1 dedication (kind 0/1/2) held TWICE in a
  Heroic age. I measured the award VALUE and assumed the KIND.
  STILL OPEN. What holds: first divergence t112; GPU +3 vs TS +5 between the
  t111/t112 probes; per-turn dedication terms identical on both seats; the extra
  award is EVENT-keyed. What is NOT established: which KIND, hence which event.
  NEXT STEP: print the KIND and `n` at the GPU award site and at the matching TS
  call for civ 1 at t111 — NAME the dedication instead of inferring it from its
  score.
  **ROOT-CAUSED 2026-07-29 (#79): rGScore1 IS A LOST RELIC ON A CITY TRANSFER.**
  The whole 2.85 gap is ONE RELIC (4 faith) in rival 1's SECOND city, which
  rival 1 acquires on the final turn. Measured, not inferred — at t250 the two
  engines agree on that city's pop and on five of six yields and differ only in
  faith:
      TS  r1 city5   pop=4 F=13 P=12.35 G=15.2 S=6.65 C=1.9 Fa=14.2500 relics=0
      GPU r1 cityj1  pop=4 F=13 P=12.35 G=15.2 S=6.65 C=1.9 Fa=18.0500 relics=1
  4 faith x 0.95 (global amenity factor) = 3.80 faith; x 0.75 (the faith score
  weight) = 2.85 = the exact rGScore1 gap. `rGScore` is `rivalEmpireScore`, a
  DERIVED weighted sum recomputed per turn, so nothing accumulates — the gap
  appears the instant the city changes hands and not before.
  WHY t249 IS THE FIRST RED: the trace row labelled t249 is emitted when
  `self.turn == 250`, and rival 1 goes from 1 city to 2 exactly there. Every
  earlier turn agrees; `replay-gpu.ts` breaks at the first bad turn.
  MECHANISM: TS enumerates the new city's fields by hand in its three transfer
  constructors (`rivals.ts` defected / flipped, `combat.ts` captured) and never
  lists `relics` / `greatWorksWriting` / `greatWorksArt` / `greatWorksMusic` —
  B-30 taught those literals to keep districts/buildings/wonders, but B-20 added
  the works later and never revisited them. The GPU keeps `rc_relics` and
  `rc_gw_*` as per-city PLANES moved by the transfer registry. Registry vs
  hand-written literal — the same asymmetry class as [[new-class-invariant-sweep]].
  CIV 6 SOURCE: the victor gains control of the Great Works held in a captured
  city's buildings/districts/wonders (the Palace's are the exception, and TS
  already drops PALACE). So carrying them is the FAITHFUL direction and the GPU
  is the closer engine here — TS is the wrong one, per the source-of-truth rule
  that we do NOT reflexively mirror TS.
  **THE NAIVE FIX IS WRONG AND IS NOT SHIPPED — REVERTED.** Adding all four
  counts to all three constructors traded 1 red for 3 (seed 9105 t139
  rCivicProg1, seed 9235 t229 rGScore0, seed 9301 t213 rGScore0). Narrowing to
  ONLY the measured rc->rc flip path still left 2 reds — seed 9235 t229 gap 2.70
  (= 4 x 0.90 x 0.75) and seed 9301 t213 gap 2.85 — both again EXACTLY one
  relic, but now with **TS higher than the GPU**, the opposite direction from
  t249. So the GPU does NOT simply carry relics across every rc->rc flip; its
  effective rule is narrower and is NOT yet characterized.
  MY REASONING ERROR, the FOURTH of this shape in this hunt: I measured ONE
  transfer path (relics=1 carried at t249) and generalized to three, then to
  "the registry carries everything". The measurement covered one path only.
  NEXT STEP: characterize the GPU side FIRST — probe `rc_relics` for the source
  and destination slot across every rc->rc flip in seeds 9235/9301, and find
  which flips preserve it and which zero it (candidate: `_reclaim_rc`
  compaction permutes the destination slot, so a relic survives only when the
  destination index is not reclaimed). Only then decide the single faithful rule
  and apply it to BOTH engines together.
  **FIXED 2026-07-29 (#79) — THREE OMISSIONS OF THE SAME PAIR.** The relic that
  root-caused rGScore1 was never "carried by the GPU registry" (my earlier
  reading, now retracted). #73 added `rc_gw_art` and `rc_relics` AFTER the three
  places that enumerate the per-city work planes by hand, and none was updated:

    1. GPU `_transfer_rc_to_rc` DEST: zeroed `rc_gw_writing`/`rc_gw_music` on the
       receiving slot and never touched `rc_gw_art`/`rc_relics`. `slot =
       occ.max() + 1` REUSES indices, so the new city inherited whatever a dead
       occupant left there. The seed 9235 t249 "GPU has a relic" was a GHOST.
    2. GPU `_transfer_rc_to_rc` SOURCE: the loser-slot hygiene wiped districts,
       wonders, buildings, queue and HP but not the four work counts, which is
       what left the ghost behind for (1) to inherit.
    3. GPU `_RC_SLOT_FIELDS`: listed writing and music but not art or relics, so
       a slot COMPACTION left those two behind at the old index — a city could
       lose its relic or pick up its neighbour's without any transfer at all.

  Plus the TS twin: `transferRivalCityToRival` builds the receiving city from a
  hand-written literal that B-30 taught to keep districts/buildings/wonders but
  which never listed the four work counts, so every TS rc->rc flip destroyed
  them.

  RULE APPLIED (Civ 6 source, not TS): the victor gains control of the Great
  Works held in a captured city's buildings/districts/wonders — and B-30 already
  carries the Amphitheater/Museum/Temple that house them, so carrying the counts
  is the only self-consistent reading. Both engines now carry all four and clear
  the dead source slot.

  WHY EVERY EXISTING GATE MISSED IT: `relics_test`, `great_works_test` and
  `rc_registry_test` were all GREEN before the fix — none constructed a transfer
  or a compaction. `relics_test` now does both, with a planted GHOST value (7) in
  the receiving slot so "carried" cannot be confused with "inherited the reused
  slot's leftovers", and asserts membership of all four planes in
  `_RC_SLOT_FIELDS`. NEGATIVE CONTROL RUN: dropping `rc_gw_art` back out of the
  tuple makes the lane fail, so the assert is load-bearing. TS twin:
  `tests/relic-transfer.test.ts`.

  METHOD NOTE, and the fourth reasoning error of this hunt: I measured ONE
  transfer (relics=1 carried at t249) and generalized to "the registry carries
  everything", then shipped a 3-path TS fix that turned 1 red into 3. Narrowing
  to the measured path still left 2. Only reading `_transfer_rc_to_rc` and
  `_RC_SLOT_FIELDS` line by line produced the actual rule. A further self-
  inflicted delay: two verification rounds compared the fixed TS against a STALE
  GPU trace, because `replay-gpu.ts` replays a log that `gpu/rollout.py` must
  regenerate first — the reds "not moving" was the regeneration missing, not the
  fix failing.
  VERIFIED: REPLAY PARITY OK, 72/72 games x 250 turns, 0.0 milli-units — the
  rGScore1 red is CLOSED on the 24-seed lane that reaches the mechanic.

- **#49 NEUTRAL-RIVAL TARGETING — FIXED 2026-07-29 (#79).** The #78 attack-target
  fix excluded only the attacker's OWN capital, which left the neutral case
  live: while `hostileToPlayer`, a rival still selected the centre of a rival it
  was at PEACE with, `meleeAttack`'s `rivalTarget` refused it (that path gates on
  `civsAtWar`), `attack` stayed true, `march` was suppressed, and the unit froze
  — the identical failure shape, one seat over. Both engines carried it, and the
  GPU comment documented it as the "no-op quirk".
  FIX: the arm is now the player-city arm it always claimed to be. TS excludes
  ANY rival centre for a rival attacker (`foreignCentre`, which subsumes the old
  `ownCentre`); the GPU drops the `rvcity_at` clause entirely, leaving
  `center_at >= 0` (player centres only). Legitimate rival-vs-rival capture is
  untouched — it arrives through `rivalVsRivalCity` / `enemy_rc & d==1 & melee`,
  which correctly require `civsAtWar` and melee adjacency.
  CITY-STATES ARE NOT PART OF THIS, MEASURED: the task note suspected them, but
  an unconquered city-state's centre tile carries NO `CITY_CENTER` district —
  that district is written only on player founding (game.ts), rival founding
  (rivals.ts) and CS CAPTURE (combat.ts), by which point the tile belongs to a
  real city. City-states were never reachable through this arm; the `csWar` arm
  owns that path and is unchanged.
  Barbarians are untouched by construction (both guards key on
  `owner === 'rival'` / the rival act path), keeping the barb paths
  byte-identical — the same deliberate narrowness as #78.
  GATE REACHABILITY, MEASURED: **197** rival-acts across the 12-seed 250-turn
  gate had a foreign rival centre as a newly-excluded target, i.e. 197 acts that
  previously froze now march. Note what parity does and does not prove here:
  both engines changed together, so scripted parity stayed 0.0 milli — the gate
  shows AGREEMENT, never invariance, and never agreement with real Civ 6.
  Gates: tsc clean, vitest 443/443, re-export, scripted parity 0.0 milli,
  BATTERY OK 587s.

  GATE REACHABILITY, MEASURED AND SEVERE: with the 12-seed set, `tsc` + 440
  vitest + re-export + scripted parity were ALL GREEN with the broken 3-path fix
  applied (0.0 milli). Seed 9235 is not in the 12-seed set, so the shrunk gate
  cannot see this mechanic at all and would have shipped the regression. The
  24-seed `replay-gpu.ts` reproduction is the ONLY lane that catches it — one
  more reason [[seed-set-shrunk]] must be restored to 24 before the final hunt.
  METHOD: this is the first probe in the sequence to produce a clean answer, and
  the only one that compared STATE at a fixed point instead of enumerating call
  sites. Three earlier attempts failed by enumeration.
  (Superseded account follows.)
  **TRACED (2026-07-28): the GPU founds at t78, gated by the PROPHET.**
      t76-77  pantheon=True hs=True prophets=0  -> rdue=False
      t78     prophets=1                        -> rdue=True ropen=True -> FOUNDS
      t79     done=True, claimed 1 -> 2
  TS founds at t112 (the arithmetic pins that turn): a ~34-turn gap, gated on
  the rival PROPHET arriving.
  AND THIS RESOLVES THE APPARENT CONTRADICTION — if the GPU awarded at t78, why
  were both era scores 18 at t111? Because era score RESETS at an Age boundary
  (both read 0 at t150 and t200). The GPU's +2 landed in an EARLIER age and was
  wiped; TS's +2 at t112 lands in the live age and survives. The same event
  credited in DIFFERENT AGES leaves a permanent 2-point gap — which is why this
  never looked like a missing award and why the trace showed agreement right up
  to t111.
  NEXT STEP, now narrow: compare rival PROPHET acquisition — `r_prophets` on the
  GPU against whatever TS gates its religion branch on — and find why rival 0 has
  a prophet at t78 on one seat and ~t112 on the other (faith rate, prophet cost,
  or the claim condition). WHICH ENGINE IS RIGHT is open and must be decided
  against real Civ 6: a 34-turn swing in the first religion is large either way.
  PROBE FLAW to fix next pass: the TS probe filters on `rival.id === 0` but NOT
  on the game, and the replay walks all 72 — so its lines are not attributable
  to seed 9235 alone. The conclusion rests on the row-filtered GPU probe plus the
  era-score arithmetic.
  **#78 (2026-07-28) - the epsilon tie-break bug, FOUND AND FIXED, but it is
  NOT the cause of this gap.** The GPU broke worked-tile ties by perturbing
  the score (`score - tc * 1e-9`) in self.dtype, where TS sorts
  `b.score - a.score || a.index - b.index` - exact score, then lowest index.
  MEASURED, not reasoned: in f64 the epsilon survives and the lowest index
  wins, matching TS; in f32 the epsilon is BELOW the ULP of a score around 40
  (~4e-6), rounds away completely, and topk then resolves exact ties by its
  own unspecified order - taking the HIGHEST index. The tie-break was
  silently INVERTED in every f32 lane.
  BLAST RADIUS IS THE RL PATH, NOT THE GATES. The f64 lanes (scripted parity,
  rollout, the battery's parity lane) were always correct, which is why no
  gate ever saw it. f32 is used by eval.py, behavior_probe.py, gen_targets.py
  and duel_eval.py - the environment P8 will TRAIN in. An agent trained there
  would have worked different tiles than the spec, permanently and invisibly.
  This is the wrong-constant failure mode one level down: a gate-green
  divergence that only the RL target ever experiences.
  THE SAME BUG SAT IN `_auto_pick` (a 1e-6 epsilon on tech/civic costs of
  several thousand beakers - even further below the f32 ULP), so equal-cost
  techs resolved by argmin order instead of table order in those lanes.
  FIX, both sites: force the tie-break key to f64 (`.double()`), exactly as
  the rival twin `_rival_city_yields_all` already does. f64 lanes are
  arithmetically unchanged - `.double()` is a no-op on an f64 tensor - so no
  gate number can move; the f32 lanes now behave like f64.
  THIS DOES NOT EXPLAIN THE ENVOY GAP, which is an f64 divergence. Ruled out
  by the same measurement: in f64 the construct orders exactly as TS unless
  two tiles' true scores differ by a NONZERO amount under ~1.1e-6, and Civ
  tile scores move in halves. The hunt below stands.
  REACHABILITY, MEASURED (the gate-reachability rule). At 30 turns the f32
  poke lane agrees with f64 EVEN WITH THE BUG PRESENT, so the obvious
  assertion there would have been decoration. Sweeping fixtures x turn counts
  with the fix reverted put the divergence at 120 turns: seed9002 diverges in
  pop, seed9014 in pop AND techs. With the fix, seed9014 goes fully clean —
  that flip is the proof the bug was LIVE and the fix repairs it, and it is
  what the poke lane now asserts.
  **RESIDUAL, OPEN: seed9002 STILL diverges in `pop` at 120 turns after the
  fix.** So a SECOND dtype-dependent divergence source exists beyond these two
  tie-breaks. It may be benign — f32 rounding legitimately flipping a growth
  threshold is expected and is NOT a bug — but it is unproven either way and
  is deliberately NOT asserted by the lane. Next step: bisect seed9002's f32
  BISECTED, THEN CLOSED (2026-07-28) — **NOT a second bug; inherent f32
  behaviour.** The bisect first put the divergence at turn 48 in `u_tile`
  (unit 1 on a different tile), with the turn-55 pop split downstream of it:
  at that split food_box is +16.65 against a need of 33 and both dtypes hold
  pop 3, so the growth threshold is nowhere near — by t55 the f32 branch
  simply has one more unit alive and buys a settler where f64 banks the gold.
  THE MEASUREMENT THAT CLOSED IT: f32 and f64 accumulators differ from TURN 1
  (max |f32-f64| = 2.9e-07 at t1, growing monotonically to ~5e-05 by t48). The
  two dtypes are different computations from the first turn, so EVERY discrete
  comparison in the engine — `mp >= cost`, `food >= need`, any score ranking —
  must eventually land on opposite sides. t48 is just the first boundary the
  accumulated error crossed. No construct is at fault and nothing to fix.
  CONSEQUENCE FOR TESTING, and it cost a bad test: **f32-vs-f64 end-to-end
  equality is NOT an invariant and must never be asserted.** The first version
  of this poke asserted exactly that at 120 turns; it passed only by where the
  boundaries happened to fall on one fixture, and it never tested the
  tie-break at all. Replaced with a CONSTRUCT assert — the tie-break key must
  be f64 in an f32 build — which is invariant, fixture-independent, needs no
  reachability measurement, and flips red the moment the .double() is reverted
  (verified both ways). It also drops two 120-turn builds from the lane.
  METHOD NOTE: the first bisect watched only pop/alive/techs/civics and walked
  past the real split, because unit state is not in that set. A bisect is only
  as good as the fields it compares.
  GATE: BATTERY OK, every lane green. The f64 lanes landed exactly on their
  historical baselines (parity 650.1s vs ~650, gpu-gate 593.6s vs ~594),
  confirming by MEASUREMENT what the fix predicted by construction: forcing
  the key to f64 costs those lanes nothing. The 3760s wall was eval-random
  1653s + eval-scripted 1473s. That pattern superficially indicts the change
  (they are the f32 lanes it touches) but the arithmetic refutes it: the
  .double() sits AFTER the gather, on ~11k elements, sub-second in total
  across a run. Most likely the historical ~584s battery figures were
  --no-eval, plus machine contention. UNRESOLVED and cheap to settle with one
  uncontended eval.py run — worth doing before P8, which trains in f32.
  **THE 1.0 GAP IS NOT THE ENVOY BONUS - IT IS A DOWNSTREAM TILE PICK
  (2026-07-28, #78).** Decisive arithmetic, no rollout needed. BALANCED_WEIGHTS
  are food 1, production 2, gold 1, science 1.5, culture 1.5, faith 0.75, and
  the score is `pop*3 + sum(weight * yield)`. A gap of EXACTLY 1.0 can
  therefore only be ONE GOLD or ONE FOOD - never science (1.5), culture (1.5),
  production (2) or faith (0.75), and never pop (multiples of 3).
  CS_TYPE_YIELD maps trade->gold and NOTHING to food. Trade is the ONE type
  whose value the per-type patch does NOT change (it stays 2). So the extra
  1.0 CANNOT be the envoy bonus term itself.
  CONCLUSION: the envoy change shifts city yields, which shifts the GREEDY
  CITIZEN/TILE ASSIGNMENT, and the two engines then disagree about which tile
  a city works - a 1-food or 1-gold tile. That is a PRE-EXISTING tie-break
  latent in the worked-tile pick, exposed by ANY yield-touching change, which
  is exactly why TWO unrelated corrections (combat strengths, envoy values)
  both surfaced small score-only gaps off-script while scripted parity stayed
  at 0.0 milli.
  NEXT STEP for the bisect: resume seed 9170 rng 2026006119 near t220 with
  per-city WORKED-TILE logging and compare the picks, rather than chasing the
  envoy/score terms - they are downstream symptoms, not the cause.
  **CACHE THEORY REFUTED (2026-07-28, #78).** The per-type envoy patch was
  re-applied ON TOP of the cache fix and the plain rollout re-run: the red
  reproduces IDENTICALLY - seed 9170 rng 2026006119, turn 220, HEAD column 8,
  TS 118677 vs GPU 119677. Same seed, same turn, same values. So the stale
  yield cache was NOT the cause (the fix stays: it is a real defect regardless).
  THE UPSIDE: the reproduction is DETERMINISTIC AND EXACT, which is what a
  checkpointed bisect needs. Recipe: re-apply the per-type envoy patch (seven
  wiring sites, listed above), export, then run rng 2026006119 UNSHARDED with
  `--ckpt` and bracket with `gpu/ckptdiff.py --rng`.
  RULED OUT so far for this case, each verified:
   * all THREE GPU sites and all THREE TS sites are wired to the per-type
     value - grep shows no flat `capitalBonus` literal remains in either engine;
   * the type->index mapping is consistent: the exporter writes
     `CITY_STATE_TYPES.indexOf(cs.type)` and `capitalBonusByType` is
     `CITY_STATE_TYPES.map(...)`, so a scientific CS cannot pick up trade's 2;
   * a stale `_eff_version` yield cache on envoy assignment (this entry).
  THE SHAPE IS STILL THE SHARPEST CLUE: GPU is HIGHER by EXACTLY 1.0 in a
  score that sums `pop*N + weighted yields`, i.e. ONE yield, ONE city, weight 1
  - and only off-script. Something makes the GPU credit the old +2 (or an extra
  +1) for one city-state in one city on one turn onward.
  **CACHE-INVALIDATION FIX LANDED (2026-07-28, #78).** `self._eff_version += 1`
  added at BOTH `cs_envoys` increment sites. Battery OK (720s, 78 checks),
  scripted parity 0.0 milli. It is behaviour-NEUTRAL in both gates, which is
  itself informative: the SCRIPTED policy never hits the stale window, so this
  bug could only ever have shown up off-script - exactly the profile of the
  envoy red. Landed on its own merit regardless of the hunt: a derived cache
  that is not invalidated by a write which changes it is a defect whether or
  not a current test reaches it.
  THE THEORY IS NOT YET CONFIRMED. Proving it needs the per-type envoy patch
  re-applied ON TOP of this fix and the plain rollout re-run; if seed 9170 t220
  then goes green, the cache was the cause.
  **LEADING THEORY for the envoy red, found by inspection (2026-07-28, #78):
  a STALE YIELD CACHE on envoy assignment.** The GPU caches city yields keyed
  on `_eff_version`, and the CAPITAL envoy bonus is part of that computation.
  But NEITHER site that increments `cs_envoys` bumps the version:
    engine.py ~13564  the per-turn envoy assignment (`cs_envoys[rows, pick] += 1`)
    engine.py ~7130   the QUEST reward (`cs_envoys[rows, s] += questEnvoys`)
  So when a city-state crosses the 1/3/6 envoy thresholds, the capital's yields
  can stay CACHED at their pre-crossing value until some unrelated write bumps
  the version. That is a PRE-EXISTING bug independent of the envoy magnitude —
  the per-type change (2 -> 1) merely alters how much a stale cache costs,
  which is exactly why it surfaced as an off-script score gap of EXACTLY 1.0
  (one yield, one city, weight 1) rather than as a scripted-parity failure.
  It also fits the rGScore1 case: both are score columns summing cached yields.
  NEXT STEP: add `self._eff_version += 1` at BOTH envoy-increment sites, then
  re-apply the per-type envoy patch and re-run the plain rollout. If the theory
  holds, seed 9170 t220 goes green WITHOUT touching the envoy values, and the
  fix should be committed on its own as a cache-invalidation bug BEFORE the
  per-type correction rides on top.
  THE ENVOY CASE IS THE LIVE ONE. Its red (player score, seed 9170 t220, gap
  EXACTLY 1.0) was produced on a tree with the Camp value already CORRECT, so
  it is reproducible by simply re-applying the per-type envoy patch (seven
  wiring sites, all recorded above). That is the reproduction the next hunt
  should use - not this worktree.
  **ENVOY RED REPRODUCED EXACTLY AND LOCALIZED (2026-07-28, #78) — and the
  earlier "downstream worked-tile pick" conclusion is WRONG.**
  METHOD (owner's correction, and it is the reason this worked): reproduce on
  the EXACT state, never a proxy on HEAD. Worktree at 81bb972 — the commit that
  recorded the attempt-and-revert, which touched ONLY AUDIT.md, so its tree is
  byte-identical to the code that produced the red. The patch itself was
  reverted before committing and is not in git, so it was rebuilt from the spec
  recorded here (per-type table +1 / trade +2 gold, four TS sites, three GPU
  sites, exporter key). Confirmation that the rebuild is faithful: tsc clean and
  scripted parity 0.0 milli, exactly as the original commit reported — and then
  the replay reproduced the red BYTE-IDENTICALLY:
      seed 9170 rng 2026006119: turn 220: column 8 TS=118677 GPU=119677
  FIRST DIVERGENCE IS TURN 218, TWO TURNS EARLIER, AND IT IS NOT A YIELD:
      218 RU1 738 t2   GPU: (absent)     TS: 1 hp100 a1
      218 RU1 739 t2   GPU: 1 hp100 a1   TS: (absent)
  A rival WARRIOR (type 2, moves 2). At t217 BOTH engines have it on tile 740,
  unacted. At t218 GPU is on 739 and TS on 738. Map width 44, so 738/739/740
  are consecutive in row 16: 739 is adjacent to 740, 738 is NOT. **TS took TWO
  steps (740->739->738); the GPU took ONE and stopped.** So the cause is the
  rival PATROL move budget/step choice, not the envoy bonus and not the
  citizen worked-tile pick — the score gap at t220 is two turns downstream.
  BOTH 739 AND 738 ARE BARBARIAN CAMPS (`camp: 1`, desert). Both engines clear a
  camp by stepping on it (TS clearCampFor, GPU _clear_camp_at) and both loop
  while movement remains, so neither the camp nor multi-step is the difference.
  CANDIDATES, none yet confirmed — needs a checkpoint resume with logging:
   * COST: GPU `1 + _terr + _riv` from _road_terms vs TS
     `moveCostInto(here, step) + riverCharge(...)`;
   * TARGET: GPU minimises against `tgt` via pair_dist, TS sorts candidates by
     hexDistance to `home` — if those differ the engines path to different
     destinations;
   * TIE-BREAK: TS `.sort(dist)[0]` is a STABLE sort, so ties fall to
     `tilesWithin` order; the GPU breaks ties by direction index (`d*8 + dir`);
   * ZOC halt after the first step (GPU `_in_enemy_zoc(dest, r_atwar, ...)` vs
     TS `inEnemyZoc`), which would zero the GPU's remaining movement;
   * the TS top-of-loop guard `hexDistance(here, home) <= 3 -> return`.
  **RESUME + TRACE DONE (2026-07-28) — and it eliminated the obvious suspect.**
  Resumed from the t210 full-batch checkpoint (12 turns, seconds) and CONFIRMED
  the resume is faithful: the resumed statelog reproduces `218 RU1 739 t2 =
  1 hp100 a1` exactly. Batch row for rng 2026006119 is 41; checkpoints are
  FULL-BATCH and named by the FIRST rng (gpu_2026006078_t*.pt), which is why no
  file carries the hunted rng in its name.
  THE PATROL LOOP IS NOT THE MOVER. With a trace on the rival patrol
  (engine.py ~7810, the `skey = d_nb*8 + arange6` loop) the unit shows
  `cur=740 tgt=739 d_cur=1 d_best=0 cost=1.0 mp=2.0 moving=False mv=False` —
  i.e. the patrol DECLINED to move it, and its target was 739, one step away.
  Yet the unit still ends the turn on 739. So a SECOND rival-unit mover did it:
  the action/verb path at engine.py ~5085, which writes `v_tile[rows_, sc]` =
  tgt directly, sets v_acted and calls _clear_camp_at.
  THIS REFRAMES THE WHOLE CANDIDATE LIST ABOVE: cost, tie-break, ZOC and the
  <=3-from-home guard all belong to the PATROL, which is not the code that
  moved this unit. They are not ruled out for other divergences but they are
  not this one.
  **PHASE HUNT (2026-07-28): FOUR of the five rival movement phases are now
  ELIMINATED for this unit, by trace, not by reading.**
   * `_rival_builder_actions` — traced: reads `moving=False`. It is the BUILDER
     phase and the unit is a WARRIOR, so it was never a candidate; my first
     trace went here by mistake and the `moving=False` it reported meant
     nothing.
   * `_apply_rival_unit_actions` — ruled out structurally: it gates on
     `controlled[:, r]`, and rollout.json's action stream is PLAYER-only
     (`{"t": 223, "u": [[731, 3, 0]]}`), so rivals are scripted in this run.
   * `_rival_unit_peace_act` — traced: at t217 it fires only for v50
     (`mp=4.0`, `roam=False`), never for the 2-move warrior.
   * `_rival_unit_war_act` — traced: fires t210-t213 only, for units sitting at
     `d_cur=0` (already on target, hence `moving=False`), and NOTHING at t218.
  THE DISPATCH EXPLAINS THE SPLIT (engine.py ~13040/13062): the war act runs for
  `atw_any`, the peace act for `active & ~atw_any`. Rival 1 is at war at
  t210-213 and at peace by t217, so the two traces cover different turns — and
  neither covers t218, when the unit actually moves 740 -> 739.
  SO A FIFTH PATH MOVES IT. Leading candidate: an ATTACK-then-ADVANCE, i.e. the
  warrior kills a barbarian on 739 and advances onto the cleared camp, rather
  than making a walking move at all. That fits the evidence that no walk-phase
  trace fires, and it fits the tiles: 739 and 738 are BOTH barbarian camps.
  **MOVER IDENTIFIED (2026-07-28): `_rival_unit_war_act`'s WALK, at t217.**
  A phase-boundary DIFFER settled it where five rounds of hand-placed traces had
  not: snapshot every rival unit's tile for the batch row, compare after each
  phase, print what changed.
      [h78] t217 AFTER general:   {50: (740, 692), 66: (741, 693)}
      [h78] t217 AFTER war/walk:  {1: (740, 739)}
      [h78] t218 AFTER builder:   {78: (None, 740)}
  So rival unit v1 walks 740 -> 739 during the WAR MARCH on turn 217 and stops;
  the advance-after-combat path never fires (its trace produced ZERO lines).
  TWO TRAPS THIS EXPOSED, both of which cost rounds:
   * a hand-placed trace on the `mv = (... has_imp ... mp >= cost)` pattern went
     into the BARBARIAN walk, not the rival war walk — the two loops are
     textually near-identical and `str.replace(..., 1)` takes the first. The
     trace then printed plausible-looking lines from the wrong loop. The DIFFER
     has no such failure mode; use it FIRST next time.
   * the statelog is keyed by TILE, not unit: v1 vacates 740 at t217 and a
     DIFFERENT unit, v78, SPAWNS on 740 at t218. Reading the log naively makes
     it look like one unit stood still. Any TS-side comparison must key on unit
     identity.
  STATE: GPU walks 740 -> 739 (one step) and halts; TS ends on 738, which is not
  adjacent to 740, so TS took two steps. Both tiles are barbarian camps.
  **A REAL ASYMMETRY FOUND IN THE WAR MARCH — but TESTED AND IT IS NOT THIS
  BUG.** The TS twin is `walkPath` (core/units.ts), named by the GPU walk's own
  comment. It clears barbarian camps ONLY for the player:
      if (unit.owner === 'player') { ... barbCamps.splice(...); treasury += 50 }
  while the GPU walk calls `_clear_camp_at(mv, dest, civ=self.v_civ[:, v])` for
  RIVAL units. So a rival war-marching over a camp razes it on the GPU and
  leaves it standing in TS. TS is also internally inconsistent: its own peace
  `patrol` already calls `clearCampFor`, which handles any non-barb owner and
  credits the right treasury — `walkPath` just kept a player-only inline copy.
  TESTED, NOT ASSUMED: replacing walkPath's inline clear with `clearCampFor` in
  the reproduction worktree (tsc clean) and re-running the replay gives the
  IDENTICAL red — `turn 220: column 8 TS=118677 GPU=119677`. So the camp
  asymmetry changes nothing in this game and is NOT the cause. It remains a
  genuine defect worth its own slice: real Civ 6 lets ANY civ's military unit
  clear a camp, so TS is the engine in the wrong here, not the GPU.
  **LANDED (2026-07-28).** walkPath's player-only inline clear is replaced by
  `clearCampFor(state, unit, nextIndex)`, which no-ops for barbarians and
  credits the right treasury (player -> state.treasury, rival -> that rival's).
  revealAround/claimGoodyHut stay player-only. Unlike the attack-target fix,
  this one lands cleanly: export throws no wiped-player seed, scripted parity
  24x250 0.0 milli, vitest 431/431.
  SIDE-CATCH worth keeping: the hunt WORKTREE under `.claude/` was polluting the
  main `npm test` run — vitest's include glob does not respect .gitignore, so it
  collected the worktree's copy of tests/ and ran it against the worktree's
  PATCHED source (4 spurious failures, all in its citystates.test.ts). That
  would have turned the battery's vitest lane red for reasons unrelated to the
  tree under test. vite.config.ts now excludes `**/.claude/**` permanently.
  **TRAP RE-HIT (memory rule 5): a `--resume-t` run OVERWRITES
  gpu/fixtures/gpu_statelog.txt** with a partial starting at the resume turn.
  Running logdiff afterwards compared a 2757-line resume fragment against a full
  TS log and reported a bogus "FIRST DIVERGENCE at turn 2" with the GPU absent
  everywhere. The replay's own verdict line is the trustworthy signal after a
  resume; logdiff needs a FRESH full GPU run.
  **THE TS TWIN IS `hostileUnitAct` (core/combat.ts), NOT `walkPath`** — walkPath
  is never called from rivals.ts at all; the GPU comment cites it only for the
  COST formula. hostileUnitAct DOES call `clearCampFor`, which is exactly why
  patching walkPath's camp clear changed nothing. Its halt conditions map onto
  the GPU's cleanly: `marchOnto` <-> `has_imp`, `stepD >= 1` <-> `d_best >= 1`,
  `movesLeft < cost && movesLeft < full` <-> `(mp >= cost) | (mp >= full_mp)`.
  **LEADING HYPOTHESIS (2026-07-28): the GPU never RE-TARGETS within a turn, so
  a unit standing ON its target freezes.** Traced inside war_act's own bounds
  (anchored by line, not by a text pattern):
      [WAR] t210 v1  cur=740 tgt=740 d_cur=0 d_best=1 mv=False
      [WAR] t211 v41 cur=739 tgt=739 d_cur=0 d_best=1 mv=False
  `tgt` EQUALS `cur` in every line and `d_cur` is 0. Tiles 740 and 739 are both
  barbarian CAMPS, so the camp a unit occupies is the target it selected. With
  d_cur = 0 no neighbour can satisfy `d_best < d_cur`, so the walk refuses to
  move at all. The GPU computes `tgt` ONCE before the walk loop; TS's
  hostileUnitAct re-scans for a target on each call and keeps marching. That
  predicts exactly the observed shape: the GPU takes one step onto a camp and
  stops for the turn, TS clears one and walks on to the next (740 -> 739 -> 738).
  NOT YET PROVEN. The test: make the GPU re-select `tgt` after each step (or
  after a camp clear) and re-run the replay; if seed 9170 t220 goes green, the
  hypothesis holds. Care is needed on draw-order parity — re-targeting must not
  consume RNG the TS side does not.
  **ROOT CAUSE PINNED (2026-07-28): the GPU's march GATE, not its cost.** The
  counter-evidence above resolved the moment the trace filter was widened from
  "cur in {738,739,740}" to "this unit, these turns" — the earlier `tgt == cur`
  lines were units that had ALREADY ARRIVED, i.e. exactly the ones that never
  move, so the filter was showing only the uninteresting cases:
      t217 v1 cur=740 dest=739 tgt=734 d_cur=6 cost=1.0 mp=3.0 moving=True  mv=True
      t218 v1 cur=739 dest=738 tgt=734 d_cur=5 cost=4.0 mp=3.0 moving=False mv=False
  SO IT IS NOT ONE TURN WITH TWO STEPS — it is TWO TURNS, and the GPU skips the
  second. Both engines step 740 -> 739 on t217 (cost 1). On t218 the unit holds
  FULL MP (3.0) and the next step costs 4.0 (a river crossing: +3). The GPU's
  own budget rule `(mp >= cost) | (mp >= full_mp)` — the "a unit at full MP may
  always take one step" rule TS states explicitly — WOULD allow it. It does not
  move because `moving=False`: the march gate (`march & has_tgt`) excluded the
  unit for that turn. TS's hostileUnitAct marches it and pays the crossing.
  DATA-MODEL TRAP that cost several wrong deductions here: the tile key `riv` is
  a BOOLEAN (`hasRiver(t) ? 1 : 0`), while the six-bit edge mask the movement
  code reads is the separate key `rm` -> `self.river_mask`. Reading `riv` as the
  mask makes every river look like "bit 0 = East".
  RULED OUT ALONG THE WAY, each by measurement: the direction convention (GPU
  `neighbor_table` even-row index 3 = (-1,0) = W, matching TS AXIAL_DIRS[3] = W),
  the terrain term (`tmove = 0` on all three tiles, so `_terr = 0`), the camp
  clear (patched and re-run: identical red), and the re-targeting hypothesis
  (`tgt` is 734 throughout, never the unit's own tile).
  **WHY `march` IS FALSE, MEASURED (2026-07-28): the GPU ATTACKS instead.**
  `march = act & ~attack & ~pillage & ~dist_pillage`, and tracing all four gates
  for this unit gives:
      t217 v1 here=740 act=True attack=False pillage=False march=True
      t218 v1 here=739 act=True attack=True  pillage=False march=False
  So the GPU does not skip the march for movement points or the river cost at
  all — `attack` PRE-EMPTS `march`. At t218 its attack-target scan finds a
  target adjacent to 739; TS's does not, and TS walks the unit to 738 instead.
  THIS INVERTS THE READING OF THE TILES. 738 is a barbarian CAMP, and TS MOVING
  ONTO it means TS saw that tile as EMPTY (its step filter rejects occupied
  tiles), while the GPU saw something attackable there. So the real question is
  no longer about movement rules: **the two engines disagree about what STANDS
  on or near 738 at t218.**
  **THE BARB/CAMP THEORY IS DEAD — and the shape is now a PHANTOM TARGET.**
  Probing barbarian occupancy and camp survival alongside the gates:
      t217 v1 here=740 ... march=True  | barb_at 738=-1 739=-1 740=-1 | camp738=False camp739=False
      t218 v1 here=739 ... attack=True | barb_at 738=-1 739=-1 740=-1 | camp738=False camp739=False
      t219 v1 here=739 ... attack=True | barb_at 738=-1 739=-1 740=-1 | camp738=False camp739=False
  There is NO barbarian on 738/739/740 and NO camp on 738/739 from t215 onward —
  the camps visible in the t0 FIXTURE were cleared long before this window, so
  every inference above that leaned on "both tiles are camps" was built on
  stale t0 data rather than live state. Reading fixture tiles as if they were
  current state is the trap; the camps were real at t0 and gone by t215.
  THE UNIT IS STUCK: `attack=True` on t218 AND t219, still on 739, HP 100, with
  nothing dying and no state moving. A genuine attack damages or kills something
  and resolves; an attack that repeats forever against an unchanging board is a
  target the scan believes in and the resolver cannot act on. Meanwhile TS finds
  no target at all and marches to 738.
  **THE TARGET IS THE CIV'S OWN CITY (2026-07-28).**
      t218 v1 here=739 attack=True march=False | tgt_tile=740 center_at=-1 rvcity_at=1 hp=True rng=1
  Tile 740 — the tile the unit VACATED at t217 — carries `rvcity_at=1`, a city
  belonging to rival 1, the unit's OWN civ. (The differ's
  `t218 AFTER builder: {78: (None, 740)}` is that city's first unit spawning.)
  So a rival unit targets its own city, the resolver refuses, `attack` stays
  true, `march` is suppressed, and the unit freezes from t218 to the end.
  THE PREDICATE IS OWNERSHIP-BLIND IN BOTH ENGINES. GPU:
  `((center_at >= 0) | (rvcity_at >= 0)) & hp` — once hostile to the PLAYER,
  every centre in range counts, including its own and those of rivals it is at
  PEACE with. TS is the same by construction: `combat.ts:768`
  `playerCity = hostileToPlayer && t.district === 'CITY_CENTER' && d <= range`,
  with no owner test at all. The in-code comment calls this a "quirk" to mirror;
  that is the wrong conclusion. A unit attacking its own city and freezing
  forever is not a Civ 6 rule, it is a missing hostility check — and mirroring
  it keeps the gates green while BOTH engines drift from Civ 6, the one class
  parity structurally cannot catch.
  **FIXING ONLY THE GPU WAS TRIED AND IS WRONG — MEASURED.** Replacing the term
  with `((center_at >= 0) & hp) | enemy_rc | units_pl` (enemy_rc = not mine AND
  at war, applied at full range so ranged bombardment survives) took the gate
  from 1 failure to **13**, adding e.g. seed 9118 t46 column 43. The correction
  is right for Civ 6 but must land on BOTH engines in one slice, or the GPU
  simply stops matching TS everywhere the blind predicate fires. Queued.
  ALSO CORRECTED: my earlier claim that "TS does not do this" was wrong. TS does
  it generally — the 13 failures prove it — it merely did NOT fire in seed 9170
  at t218. That asymmetry is now the live question.
  **ROOT CAUSE CONFIRMED (2026-07-28): the own-city target SUPPRESSES the march.**
  The river was a red herring. Tile 739's real mask is `rm=14` (bits 1,2,3), so
  bit 3 = West IS set — there genuinely is a river on the 739->738 edge and the
  GPU's cost=4.0 is CORRECT. (The confusion came from reading `riv`, a boolean
  `hasRiver`, as the six-bit mask; the mask key is `rm`.)
  THE CHAIN, entirely from traces:
    t217  both engines step 740 -> 739 (cost 1.0), then both CORRECTLY refuse
          the second step: mp 2.0 < cost 4.0 and 2.0 < full 3.0.
    t218  both hold FULL MP (3.0), and both engines carry the same "a unit at
          full MP may always take one step" rule (GPU `mp >= full_mp`, TS
          `movesLeft < full`). TS applies it, pays the river, reaches 738.
          The GPU never reaches its march: the attack scan finds the civ's OWN
          city on 740 at d=1, so `attack=True` and
          `march = act & ~attack & ...` is False. The unit is stranded on 739
          for the rest of the game.
  So the ownership-blind predicate is the ROOT CAUSE, not an aftermath, and not
  the movement cost. The fix is task #47 and must land on BOTH engines together
  — a GPU-only correction measured 13 gate failures against a baseline of 1.
  STILL OPEN, the only remaining gap: TS's predicate is equally blind
  (combat.ts:768), so why does it not fire on 740 at t218?
  TWO CANDIDATE ANSWERS NOW REFUTED BY MEASUREMENT (2026-07-28):
   * "the city is founded later in TS" — NO. Both statelogs carry the rival city
     on tile 740 from TURN 2; it is an INITIAL city, not founded mid-game.
   * "TS's tile lacks the CITY_CENTER district its predicate keys on" — NO.
     Initial rivals are built through foundRivalCity (rivals.ts:258-287), which
     sets `tile.district = 'CITY_CENTER'` (rivals.ts:202).
  So both engines hold the SAME city on 740 and BOTH predicates are blind —
  both should select it and freeze — yet TS marches to 738 and the GPU does not.
  The difference must be in how each treats the tile the unit STANDS ON versus
  adjacent (the GPU scan carries an explicit `d_all >= 1`), in the range test,
  or in which tile the unit occupies when each engine runs its scan.
  **DONE, AND IT SETTLES THE ROOT CAUSE (2026-07-28).** TS's candidate list was
  instrumented, and so was the road network on both sides:
      GPU: road738=False road739=True road740=True bridged=True
      TS:  road738=false road739=true  road740=true
  IDENTICAL. Every cost input agrees between the engines — roads, the river mask
  (rm=14, bit 3 = West set), the direction convention (both dir 3) and the
  terrain term (tmove=0) — so both correctly charge 1.0 for 740->739
  (road-to-road, river waived) and 4.0 for 739->738 (no road on the far end).
  The road-waiver hypothesis is therefore dead too.
  With every cost input equal, the only asymmetry left is POSITIONAL: the GPU's
  unit ENDS a turn on 739, adjacent to its own city on 740, and the
  ownership-blind predicate then freezes it there permanently (tgt_tile=740,
  rvcity_at=1, attack=True, march=False, repeating every later turn). TS's unit
  is never sitting on 739 at a turn start in this game, so its equally blind
  predicate never fires.
  THAT TS IS EQUALLY BLIND IS OBSERVED, NOT INFERRED: in another game of the
  same replay, `[TS] t215 u171 at=739 targets=[740]` — a TS unit adjacent to its
  OWN city, selecting it as a target, frozen exactly as the GPU is. Task #47 is
  therefore the correct fix, on both engines.
  THE ONE UNEXPLAINED DETAIL, for the next session: TS's u1 is logged at 740 at
  t217 and at 738 at t218, covering two tiles across that boundary where the GPU
  covers one, even though both engines carry the same full-MP-always-steps rule.
  That step accounting is what puts the units in different places to begin with.
  Reproduction preserved at `.claude/hunt-envoy`; still byte-identical.
  **LANDED (2026-07-28), owner accepted the seed churn. BATTERY OK 1434s.**
  Final shape, symmetric and narrow: exclude the centres of the ATTACKER'S OWN
  civ. TS gains an `ownCentre` test on the playerCity arm; the GPU gains
  `(rvcity_at >= 0) & (rvcity_at != ac)`. BARBARIANS untouched on both seats —
  they own no cities and attacking any civ's city is correct for them.
  TWO EARLIER SHAPES FAILED, BOTH FROM ASYMMETRY, and both symptoms looked like
  evidence against fixing the bug at all:
   * GPU-only with `enemy_rc` at FULL range -> 13 rollout failures (it widened
     GPU ranged targeting past TS's melee-only rule);
   * BOTH seats restricted to "player cities only" -> scripted parity RED at
     t31 on an `rng` divergence, because `attackTargets` is shared by
     BARBARIANS: TS lost ranged-barb targets on rival cities while the GPU's
     barb path was untouched.
  SEED CHURN, as predicted: 3 of 24 re-picked (9014 -> 9015, 9132 -> 9133,
  9301 -> 9302 at indices 1, 10, 23) — the wiped-player class, both engines
  agreeing on the collapse. Fewer than the 5 the broader shape needed.
  **IDLE-BOX BASELINE (2026-07-28, #40) — replaces every earlier timing.**
      battery WALL 1434s (~= its slowest lane, gpu-gate)
      lanes IN BATTERY: gpu-gate 1380 | parity 1340 | mcts-search 844 |
                        mcts-plan 501 | gumbel 404 | religion2 135 | naval 119
      parity STANDALONE, idle: 435s
  TWO CORRECTIONS THIS MEASUREMENT FORCED:
   * IN-BATTERY LANE TIMES ARE CONTENDED, NOT LANE COSTS — parity is 1340s
     inside the battery and 435s standalone on the SAME idle box, ~3x. The
     battery overlaps ~41 lanes and its wall is the slowest one, so quoting a
     lane time as "what that gate costs" is wrong (I did exactly that when
     reasoning about the eval and mcts lanes earlier).
   * `parity_test.py` HAS NO `--seeds` FLAG. It prints `len(fixtures)` and
     ignores the argument: `--seeds 12` ran 431s against `--seeds 24` at 435s
     and both printed "24 seeds". The recorded guidance "281s@24 / 159s@12, use
     12 for the inner loop" describes a knob that does not exist.
  THE WALL DOUBLED (687s -> 1434s) BECAUSE OF THE #47 FIX, not the machine:
  unfrozen rivals march and fight, so more units live and every turn costs more.
  A real price of correctness and the new floor.
  **STILL OPEN, and CHEAPER than first recorded: the NEUTRAL-RIVAL case.** A
  rival can still target the city of a rival it is at PEACE with, freezing the
  same way. I called this a wide change; it is not. The hostility state is
  already tracked on both engines — TS has ONE oracle, `unitsHostile`
  (units.ts:215), covering same-side, barbarian, rival-rival via the A-19/B-33
  `atWarRivals` per-pair substrate, and rival-player via `atWar`; the GPU has
  `rr_war` + `r_atwar`, which `enemy_rc` already composes. The genuine gap is
  CITY-STATES: `unitsHostile` has no owner kind for them, which is why TS routes
  CS centres through a separate `csWar` arm and the GPU through `cs_suz_t`. So
  the follow-up is "ask the existing oracle" plus a CS answer, not new state.
  Symmetric shape, both seats: TS restricts the arm NAMED `playerCity` (which
  matched ANY CITY_CENTER tile) to actual player cities via
  `state.cities.some(c => c.centerIndex === t.index)`; the GPU drops the blind
  `| (rvcity_at >= 0)`, leaving `(center_at >= 0) & hp`, with hostile rival
  centres on the existing `enemy_rc & d == 1 & ~rngd` line — the exact mirror of
  TS's `rivalVsRivalCity`. (This also explains the earlier 13-failure attempt:
  that version used `enemy_rc` at FULL RANGE, widening GPU ranged targeting
  beyond TS's melee-only rule. Not evidence against the fix.)
  tsc clean, but the fixture EXPORT throws: seed 9014 loses every player city by
  t250, then 9105, then 9132 — three of 24 and still climbing when I stopped.
  THE CAUSE IS WHAT THE FIX REVEALS: rival units used to FREEZE THEMSELVES
  beside any city, so unfreezing them is a large AI buff and the player no
  longer survives. **The gate's survivability partly depended on the bug.**
  Landing it means re-picking a meaningful fraction of the seed set, which
  changes what the gate measures and breaks comparability with every historical
  number. FOR RL THIS MATTERS MORE THAN FOR THE GATE: the training world
  currently contains crippled opponents — a policy trained against frozen
  rivals learns against an enemy that does not fight.
  (Superseded hypothesis, kept as a record of what was ruled out: within-turn
  ORDER of founding vs unit acts. REFUTED — both engines found cities BEFORE
  units act: GPU `_rival_try_found` at 7494/11951/12416 precedes the unit
  dispatch at 12888/13068/13091; TS `tryFoundCity` at 2659/3043 precedes the
  unit loop at 3341.)
  THE REPRODUCTION IS PRESERVED at `.claude/hunt-envoy` (worktree, detached at
  81bb972, node_modules junctioned, patch applied, fixtures + t210 checkpoints
  present). Unlike the earlier `.claude/hunt78` worktree, this one REPRODUCES —
  do not delete it without re-deriving the state.
  **CONSOLIDATED HUNT STATE for BOTH score latents (2026-07-28, #78).** Two
  independent yield-touching changes each turned the PLAIN rollout red in a
  SCORE column while scripted parity stayed at 0.0 milli:
    five combat strengths -> rGScore1, seed 9235 t249, gap 2.85
    per-type envoy bonus  -> player score, seed 9170 t220, gap EXACTLY 1.0
  Both scores are `pop * N + sum(weighted city YIELDS)` (empireScore /
  rivalEmpireScore in core/empirePlanner.ts). A gap of exactly 1.0 therefore
  means ONE yield off by ONE in ONE city at weight 1 - for the envoy case, the
  capital's science, i.e. the envoy bonus itself.
  RULED OUT so far, each verified not guessed:
   * bestMeleeCS asymmetry - both engines gate on non-ranged, read the ROSTER
     table, and update monotonically on spawn;
   * a missed flat `capitalBonus` site - grep shows none remain in either
     engine after the seven-site wiring;
   * a STALE DERIVED TENSOR on GPU (`_cs_capbonus` cached at __init__ from
     `cs_type`) going stale across the rollout's per-game reset() - `cs_type`
     is NOT in _MUTABLE, so it is static and the cache cannot drift.
  STILL OPEN as the leading theory: the gap enters through a YIELD TERM that
  only the off-script policy reaches, and the two cases share one cause. War
  weariness is now a compared column (`rWarWeariness`) so it will name itself
  if it is involved - though the envoy case makes it less likely, since the
  PLAYER score diverged with no rival war in play.
  A REPRODUCTION WORKTREE is staged at `.claude/hunt78` (base e56e988, the
  commit before the Monarchy slot fix, plus only the five combat strengths and
  SEED_OVERRIDES 6: 9080) - the exact red state for the rGScore1 case. Next
  step there: export, plain rollout to confirm, then a CHECKPOINTED single-rng
  run (`--ckpt`, unsharded - sharded runs write none) and ckptdiff to bracket
  the first divergent turn.
  **ENVOY 1-BONUS FIX ATTEMPTED AND REVERTED (2026-07-28, #78).** The per-type
  correction was BUILT on both seats - CS_CAPITAL_BONUS_BY_TYPE (trade 2, rest
  1), wired through FOUR TS sites (player csEnvoyBonuses, rival
  csRivalEnvoyBonuses, envoyBonusDelta) and THREE GPU sites (the player capital
  bonus and two rival-seat twins), exported as `capitalBonusByType` indexed by
  CITY_STATE_TYPES. Scripted parity went GREEN at 0.0 milli and vitest 431/431
  after de-hardcoding five assertions that asserted the old flat 2.
  IT IS NOT LANDED: the battery's gpu-gate went RED off-script at seed 9170
  t220, HEAD column 8 = the PLAYER empire score, TS 118677 vs GPU 119677 - a
  gap of exactly 1.0, the size of the 2->1 change. No remaining flat
  `capitalBonus` use exists in either engine (verified by grep), so this is a
  divergence EXPOSED by the change rather than a missed wiring site.
  SAME SHAPE as the rGScore1 latent: scripted parity clean, plain rollout red,
  a small integral gap in a SCORE column that sums weighted yields. TWO
  independent yield-touching changes have now surfaced a score-only off-script
  divergence, which points at ONE underlying cause in the score/yield path
  rather than two coincidences. That is the strongest lead either hunt has.
  REVERTED so the tree stays green; the sourced values and all seven wiring
  sites are recorded so the redo does not re-derive them.
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
  **SLICE 17 - src/data/policies.ts government tiers (2026-07-28, #78).**
  VERIFIED by direct Civilopedia fetch: MONARCHY is tier 2 and its entry reads
  "2 Diplomatic Favor per turn" - which validates B-22/#75's favor chain END TO
  END, since that mechanic pays favor equal to the government TIER (and
  Chiefdom at tier 0 paying nothing follows the same rule).
  ONE SOURCED DEVIATION recorded: the real Monarchy's POLICY SLOTS are
  2 Military / 1 Economic / 1 Diplomatic / 2 Wildcard; this model gives it
  3 Military / 1 Economic / 1 Diplomatic / 1 Wildcard - same TOTAL of six, but
  it admits one more military card and one fewer wildcard. Slot composition
  gates which cards can be slotted, so it is behavioural, not cosmetic. Fixing
  it means re-checking all ten governments' slot lists and re-gating - its own
  round. **MONARCHY'S SLOTS ARE NOW FIXED** (2026-07-28): 3M/1E/1D/1W ->
  2M/1E/1D/2W, the Civilopedia composition. Battery OK.
  **ALL TEN GOVERNMENTS NOW VERIFIED (2026-07-28, #78)** by direct Civilopedia
  fetch, with the three disputed ones re-fetched asking for the slot section
  VERBATIM rather than a paraphrase. THREE MORE WERE WRONG:
      AUTOCRACY          [M,M,E,D]      -> [M,E,D,W]        1M/1E/1D/1W
      OLIGARCHY          [M,E,D,W]      -> [M,M,E,W]        2M/1E/0D/1W
      MERCHANT_REPUBLIC  [M,E,E,D,W,W]  -> [M,E,E,D,D,W]    1M/2E/2D/1W
  Correct as written: CHIEFDOM 1M/1E, CLASSICAL_REPUBLIC 0M/2E/1D/1W,
  THEOCRACY 2M/2E/1D/1W, DEMOCRACY 1M/3E/2D/2W, COMMUNISM 3M/3E/1D/1W,
  FASCISM 4M/1E/1D/2W.
  **WATER MILL, VERIFIED AND STILL UNIMPLEMENTED (2026-07-28, #78).** The
  queued brief said "rice/wheat +1 food". The Civilopedia says something
  BROADER: "Bonus resources improved by Farms gain +1 Food each" — a general
  rule over farm-improved bonus resources, not a two-resource special case.
  In the CURRENT catalog those are exactly WHEAT and RICE (resources.ts has no
  Maize), so the two readings coincide TODAY and diverge the moment a third
  farm bonus resource is added. Implement the general form
  (category === 'bonus' && improvement === 'FARM'), not the named pair.
  Base +1 Food/+1 Production and the river-adjacency requirement are already
  correct; the resource bonus is NOT implemented on either engine — buildings.ts
  carries only `yields: { food: 1, production: 1 }` and `special: 'WATER_MILL'`,
  whose sole meaning today is the river buildability gate. This is a YIELDS-PATH
  slice on both engines, not a constant edit, so it is queued rather than
  folded into the government batch.
  **IMPLEMENTED PLAYER-SIDE (2026-07-28, #78).** city.ts gains a waterMillBonus
  applied POST-selection over the worked set, exactly like the neighbouring
  petraBonus; the GPU mirrors it in the player worked-tile block next to the
  Petra and farm-adjacency terms. Modelled GENERALLY — bonus category AND the
  resource's own required improvement is FARM — so a third farm bonus resource
  is picked up automatically instead of a hardcoded rice/wheat pair.
  Two new plumbing pieces: an explicit `farmBonusFood` building flag (NOT the
  existing `river` flag, which selects the same building today but means
  "requires a river city" and would diverge the moment another river-gated
  building exists), and `res_cat`, the per-tile resource CATEGORY plane that
  export-gpu.ts has emitted as `res` all along and no engine ever consumed.
  Gates: tsc clean, scripted parity 24x250 0.0 milli.
  **RIVAL SIDE NOW IMPLEMENTED TOO (2026-07-28) — all four sites done.**
  rivals.ts mirrors city.ts's waterMillBonus post-selection over the worked
  set, next to its Petra block; the GPU mirrors it in BOTH rival twins,
  _rival_city_yields_all (batched) and _rival_city_yields (per-j), kept
  structurally identical so column j stays bit-identical between them.
  This was worth doing rather than recording as a deviation precisely BECAUSE
  no gate could ever have caught it: withholding the bonus from rivals leaves
  the two engines agreeing with each other, so parity stays green while both
  deviate from Civ 6 together. Gates: tsc clean, vitest 431/431, parity 24x250
  0.0 milli with rivals live.
  REACHABILITY MEASURED (3 seeds, 250 turns): 1 of 11 alive cities holds a
  Water Mill, and 4 farm-improved bonus tiles are OWNED by player cities (6
  exist on the maps at all). So the mechanic is reachable in principle but the
  coverage is THIN, and whether that one city works one of those four tiles is
  not established — parity green here is weak evidence, not proof. A poke lane
  that constructs the configuration directly is the right guard; queued with
  the rival-side pair.
  **POKE LANE ADDED (2026-07-28): gpu/watermill_test.py**, wired into the
  battery. It rewrites the tile planes directly — every tile a city owns becomes
  a FARM carrying a farm-improved BONUS resource — rather than waiting for a
  seed to wander into the configuration, and asserts the three things the
  implementation could plausibly get wrong: the bonus is worth exactly +1 food
  per eligible WORKED tile; it is gated on the BUILDING (a control city without
  the Water Mill must not move); and it is gated on the RESOURCE, not on the
  Farm alone (stripping the bonus-resource identity while keeping the Farms
  returns the city to baseline).
  The lane earned its place on its FIRST run by failing: the expected delta had
  to include the Water Mill's own +1 base food, which I had omitted. It now
  reads that base from rules.b_yields rather than hardcoding it, so a future
  re-source of the building's yields cannot silently invalidate the lane.
  **GREAT LIBRARY, VERIFIED (2026-07-28, #78).** Direct Civilopedia fetch
  confirms the queued claim exactly: "+2 Great Works of Writing slots", on top
  of +2 Science, +1 Great Scientist point, +1 Great Writer point and +1000
  Tourism from Rock Concerts, at 400 Production (cost already correct).
  The blocker is confirmed ARCHITECTURAL, not a data gap: slots come from
  GW_BUILDINGS in data/greatPeople.ts, a fixed one-building-per-kind table
  (AMPHITHEATER/MUSEUM/BROADCAST_CENTER with GW_SLOTS [2,3,1]) keyed off
  `city.buildings.includes(building)`. A WONDER has no way to contribute
  capacity. Implementing it means a second, additive wonder-slot channel
  threaded through the capacity computation on BOTH engines — a real slice,
  correctly queued rather than faked with a data edit.
  **DESIGN SETTLED (2026-07-28), so the next pass executes rather than
  re-derives.** The constraint that shapes it: `placeGreatWorks` is
  deliberately MAP-FREE (data/greatPeople.ts takes only cities), but wonder
  COMPLETENESS lives on the tile (`builtWonderComplete`), so the extra slots
  cannot be derived inside it. Do NOT pass the map in — that would drag map
  types into the data layer.
  TS: add `GW_WONDER_SLOTS = { GREAT_LIBRARY: [2, 0, 0] }` (per-kind, writing
  first) beside GW_SLOTS; give `placeGreatWorks` an optional
  `extra?: (city) => number` argument; replace the current
  `if (!c.buildings.includes(building)) continue` + `GW_SLOTS[kind] - used`
  with a capacity of `(has building ? GW_SLOTS[kind] : 0) + extra(c)` and skip
  only when capacity <= used. NOTE the semantic change this encodes: a wonder
  alone can then hold works with no Amphitheater present, which is correct for
  Civ 6 and is the whole point of the channel.
  Callers compute `extra` because they hold the map: game.ts:1155 over
  `completedWonders(state, city)`, rivals.ts:910 over `rc.wonders` filtered by
  `state.map.tiles[w.tileIndex].builtWonderComplete` (the same filter its Petra
  block already uses).
  GPU: the rival capacity is `cap = self.rc_bldg[:, r, :, bcol].long() * nslots`
  (engine.py ~2599); add the wonder term from `rc_wonder` + built_wonder_complete
  against a new per-wonder slot table exported alongside the existing wonder
  rows, and mirror it in the player path.
  **IMPLEMENTED (2026-07-28), all four sites.** greatPeople.ts gains
  GW_WONDER_SLOTS ({ GREAT_LIBRARY: [2, 0, 0] }) and placeGreatWorks takes an
  optional `extra(city)` resolver; capacity is now
  `(has building ? GW_SLOTS[kind] : 0) + extra(c)`, skipping only when capacity
  <= used. That last part is the real semantic change: a wonder can now hold
  works in a city with NO Amphitheater, which the old early-return on a missing
  building could not express. game.ts and rivals.ts supply the resolver because
  they hold the map (completeness lives on `builtWonderComplete`); GwCity gained
  an optional `wonders` field so the resolver can read it without dragging map
  types into the data layer.
  GPU: a new per-wonder `gwslots` export row -> `_wond_gw` [nW, 3], added to
  BOTH capacity sites. The rival side reads its rc_wonder registry (same source
  and completeness test as its Petra block); the PLAYER side has no per-city
  wonder registry, so it attributes by TILE OWNERSHIP — which is also what makes
  a captured wonder carry its slots correctly.
  GATE NOTE — MY PREDICTION WAS WRONG, MEASURED: I expected this to be
  gate-unreachable like the #71 Great Works re-key, because the Theater-Square
  line is nearly unbuilt. In fact the GREAT LIBRARY is BUILT 4 TIMES across 6
  seeds (44 completed wonders of all kinds), so the channel is genuinely
  exercised and parity green here is real evidence, not vacuous. Recorded
  because the reverse mistake — assuming reachability — is the one this rule
  exists to prevent, and it cuts both ways.
  **SOURCE SWEEP, ROUND 2 (2026-07-28) — one item unblocked, two still not.**
  YOSEMITE: **SOURCED AND NOW FIXED (2026-07-28).**
  `features/feature_yosemite` resolves (the host indexes natural wonders under
  `features/`, which is why `wonders/` kept 404ing): "+1 Gold, +1 Food, +1
  Science to adjacent tiles", "impassable — units cannot enter this two-tile
  natural wonder", "+2 Appeal to neighbouring tiles".
  IMPLEMENTED as `impassable: true` with
  `adjacentYields: { gold: 1, food: 1, science: 1 }` and no own-tile yield.
  **THE RECORDED NOTE WAS WRONG about the cost**: it called this a mechanic
  change needing a new adjacency channel "the way Holy Sites already have one".
  `adjacentYields` ALREADY EXISTED and five wonders already used it, so this was
  a data fix, not a round. Worth remembering — a residual's own difficulty
  estimate can be stale, and this one deterred the work for several rounds.
  ITS +2 APPEAL NEEDS NOTHING: core/appeal.ts already credits any adjacent
  natural wonder +2 generically, so Yosemite gets the right appeal by the
  general rule.
  REACHABILITY IS UNPROVABLE FROM THE GATE, stated plainly: the fixtures carry
  `nw` as a BOOLEAN ("is a natural wonder tile"), not a wonder id — 42 such
  tiles across all 12 seeds — so nothing tells us whether YOSEMITE specifically
  was rolled onto any map. Parity green therefore does not prove this change.
  tests/yosemite.test.ts pins the data directly instead.
  FESTIVAL: still unsourced as a PROJECT — `projects/*` is not indexed on that
  host (project_festival and project_theater_square_festival both 404). But the
  DISTRICT entry independently confirms the principle behind the recorded
  deviation: the Theater Square reads "+1 Great Writer point per turn. +1 Great
  Artist point per turn. +1 Great Musician point per turn" — all THREE culture
  classes, which is what projects.ts says the Festival should award against the
  single `gpClass: 'ARTIST'` modelled. The RATES (~11% of invested production
  each, 15% production -> Culture) remain unconfirmed, so the slice still
  cannot be implemented under verify-before-implement.
  **APPEAL: NOW SOURCED (2026-07-28) — the owner supplied the working URLs.**
  My slugs were missing the LOCALE segment: the concept lives at
  `/en-US/gathering-storm/concepts/cities_11/`, and projects under
  `/en-US/gathering-storm/wonders/project_enhance_district_theater/`. Worth
  remembering — every earlier 404 in this sweep may have been the same omission.
  CIVILOPEDIA (GS) gives: +4 if the tile is ON a Mountain; +2 each adjacent
  Natural Wonder; +1 each adjacent Holy Site / Theater Square / Entertainment
  Complex / wonder; +1 each adjacent Mountain, Coast, Woods or Oasis; +1 if the
  tile is on a River or Lake; +1 each Chateau and Sphinx; -1 each adjacent
  Industrial Zone / Encampment / Airport / Spaceport; -1 each adjacent
  Rainforest / Marsh / Floodplain; -1 each adjacent pillaged tile; -1 each
  adjacent Mine / Quarry / Oil Well / Offshore Oil Rig / Airstrip.
  **DIFFED AGAINST core/appeal.ts — FIVE GAPS AND ONE OUTRIGHT BUG:**
   1. MISSING +1 for an adjacent OASIS (queued item 1).
   2. MISSING +1 when the tile itself is ON a River or Lake (queued item 1).
      The model instead credits an adjacent LAKE, which the source assigns to
      the ON-tile term, not adjacency.
   3. MISSING -1 for adjacent FLOODPLAINS (the model penalises only
      Rainforest/Marsh).
   4. MISSING -1 for an adjacent PILLAGED tile.
   5. MISSING the fixed Breathtaking base for MOUNTAIN and NATURAL WONDER tiles
      (queued item 2).
   6. **`appealTier` BOUNDARIES ARE OFF BY ONE.** Source: Average is -1 to 1,
      Uninviting -3 to -2. Model: `appeal >= 0` -> Average and `appeal >= -2` ->
      Uninviting. So appeal -1 is misclassified Uninviting and -3 misclassified
      Disgusting. This is a live defect, not a missing term: it changes
      Neighborhood HOUSING, and housing feeds growth.
  **SOURCE CONFLICT RESOLVED (owner, 2026-07-28): the FIXED reading is right.**
  Natural-wonder tiles are a fixed 5 and mountain tiles a fixed 4, and NEITHER
  is affected by adjacent tiles at all. The Civilopedia's terser "+4 if the tile
  is on a Mountain" reads as additive and that reading is WRONG — I implemented
  it that way first and it had to be corrected.
  WHAT DOES move them: BLANKET AURAS — the Eiffel Tower, the Golden Gate Bridge,
  and Great Engineers such as Alvar Aalto and Charles Correa. Those do not send
  an adjacency signal; they overwrite the tile's own property directly, so a
  mountain inside the aura's zone has its value raised. None of them are
  modelled here, so 5 and 4 are final — but when one IS added it must apply ON
  TOP of the fixed value, never through the neighbour loop.
  IMPLEMENTED as early returns in `tileAppeal` and, on the GPU, an `apo`
  override plane (-999 = compute normally) applied after the neighbour gather.
  tests/yosemite.test.ts pins both against deliberately hostile neighbours (an
  adjacent Industrial Zone and Marsh must not move a 5 or a 4).
  **FESTIVAL: FULLY SOURCED (2026-07-28, owner-supplied) — and it exposes a
  much bigger constant error than the multi-class gap.**
  Theater Square Festival, per the fandom GS articles: "converting 15% of the
  city's Production output to Culture" while ongoing, and on completion "Great
  Writer, Great Artist, and Great Musician points EACH equal to approximately
  11% of the Production invested (on Standard speed)". The exact GPP rule is
      GPP = D_TYPE * (1 + 7 * DEVELOPMENT_RATIO)
  with D_TYPE = 5 for the Theater Square Festival (10 for most district
  projects, 30 for Occult Research) and DEVELOPMENT_RATIO = max(techs unlocked /
  total techs, civics unlocked / total civics). Documented quirk: the GPP yield
  does NOT scale with game speed even though the project COST does, so the
  effective conversion is ~22% on Standard for a Campus project but ~43% on
  Online and ~15% on Epic. Base cost 25 Production, progressive.
  **THE MODEL'S CONSTANTS ARE GLOBAL AND ONE IS 5x OFF.** projects.ts carries
  `PROJECT_YIELD_FRACTION = 0.75` and `PROJECT_GPP_FRACTION = 0.3` for EVERY
  project. Against the sourced Festival values:
   * yield: 0.75 vs 0.15 — the culture conversion is FIVE TIMES too generous.
   * GPP: 0.3 to ONE class vs ~0.11 to EACH of three. The AGGREGATE (~0.33) is
     nearly right, which is exactly why this never looked anomalous — the
     distribution is what is wrong, not the total.
  SCOPE WARNING for whoever implements it: these fractions are shared by all
  projects, and the real rates are PER PROJECT (the same source puts Campus
  Research Grants at ~22% of production to GP points on Standard). Changing the
  globals would silently re-tune every other project, so this needs a per-project
  table sourced project by project, not a one-line constant edit. The D_TYPE
  ladder above is the right shape for the GPP half.
  STILL NOT IMPLEMENTED — it is now a sourcing-complete, DESIGN-pending slice
  rather than a blocked one.
  WHY NONE OF THEM EVER TRIPPED A GATE: every error preserved the government's
  TOTAL slot count and only got the composition wrong — a Wildcard standing in
  for a Diplomatic slot, or a Military for a Wildcard. Slot COUNT is what any
  structural check would compare; slot TYPE is what gates which cards may be
  slotted. This is the wrong-constant class in its purest form.
  TWO INHERENT BONUSES NOTED AS UNMODELED while fetching (recorded, not
  silently folded in): OLIGARCHY's "+4 Combat Strength to land melee,
  anti-cavalry and naval melee units", and CLASSICAL_REPUBLIC's "+1 Housing"
  (the +1 Amenity half IS modeled via amenitiesAll). AUTOCRACY's real bonus is
  per Government-Plaza/Diplomatic-Quarter/Palace building; the code's flat +1
  all-yields-in-capital is a standing approximation of the Palace term.
  POLICY CARDS spot-checked: URBAN_PLANNING is "+1 Production in all
  cities" in an ECONOMIC slot - text, effect and slot type all match. The
  remaining card effects are not individually fetched; NARROWED marker.
  **SWEEP STATUS: all 18 marked files have now been touched** - 10 fully or
  partly verified with citations in place, 2 stale headers corrected, and every
  unswept remainder named explicitly rather than left under a blanket marker.
  **SLICE 16 - src/data/builtWonders.ts (2026-07-28, #78).** Spot-checked by
  direct Civilopedia fetch: PYRAMIDS 220 Production and GREAT_LIBRARY 400
  Production both CORRECT as written. Remaining wonder COSTS not individually
  fetched and the EFFECTS not swept at all - NARROWED marker.
  SOURCED RESIDUAL noticed in the pass: the real GREAT_LIBRARY carries "+2
  Great Works of Writing slots". This model has no per-WONDER Great Work slot
  channel (slots come from BUILDINGS only, GW_BUILDINGS in data/greatPeople.ts),
  so a wonder granting slots is unmodeled. Recorded, not fixed - it would need
  the slot lookup to sum building AND wonder sources on both engines.
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
  **SLICE 9 LANDED - src/data/units.ts COMBAT STRENGTHS (2026-07-28, #78).**
  FIVE corrections: SWORDSMAN 36->35, PIKEMAN 41->45, CROSSBOWMAN melee 15->30,
  KNIGHT 48->50, GALLEY 30->25. Verified CORRECT: Scout 10, Warrior 20, Slinger
  5/15, Archer 15/25, Spearman 25, Horseman 36, Musketman 55, Quadrireme 20/25
  and every movement value. These feed `damageRoll` directly - the Crossbowman's
  melee was wrong by 2x.
  THREE FOLLOW-ONS, all resolved: (a) the stronger hostile world wipes index 6's
  seed 9079 before t250, so SEED_OVERRIDES 6: 9080 (verified to survive);
  (b) strategic-resources.test.ts hard-coded `>= 36` and now reads
  `UNITS.SWORDSMAN.combat` from the roster; (c) TWO POKE LANES hard-coded the
  FILENAME seed9079.json and broke when the override moved index 6 -
  domination_test and bankruptcy_test, both now resolving BY POSITION. General
  hazard: a SEED_OVERRIDES entry silently breaks anything pinned to a fixture
  FILENAME, which the override block's own comments do not warn about.
  WAR WEARINESS IS NOW TRACED (compared PER_RIVAL column `rWarWeariness`). It
  feeds the amenity tier, the tier scales city yields, and rivalEmpireScore is
  pop*3 + weighted yields - so an untraced weariness divergence could only
  surface as an unexplained rGScore gap. Same hole rFaith had before #71.
  **THE rGScore1 LATENT IS MASKED, NOT ROOT-CAUSED.** The blocker (seed 9235
  t249, TS 188400 vs GPU 191250) no longer reproduces, but the only change
  between the red run and the green one is the MONARCHY slot fix, which alters
  which cards rivals slot and therefore every downstream trajectory. Seed 9235
  simply no longer reaches the diverging state. A green gate is NOT evidence
  the bug is gone; it can resurface on any change that shifts trajectories.
  WHAT THE HUNT ESTABLISHED, so the next attempt starts narrower: the
  bestMeleeCS theory is REFUTED (both engines gate on non-ranged, read the
  ROSTER table, update monotonically on spawn); `rivalEmpireScore` is
  pop*3 + weighted city YIELDS and every traced input was GREEN at the
  divergent turn, so the gap enters through a YIELD term, not a count; the
  prime suspect is the AMENITY TIER via war weariness - now traced.
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
