# RESUME: seat-plane batch — SERVE GATE GREEN, one poke red

STATE: base fdec586, batch UNCOMMITTED. The cross-engine gate is GREEN:
serve_gate seed 9002 x 250 turns, obs equal on every (turn, seat),
traces within milli. tsc + 523 vitest green. snapshot_restore_test green.

## What landed
- ONE seatStrength(state, seat) at the rival's 8/city rounded; the three
  GPU copies (env.py ctx.ownStr, env.py's rival-seat view of the player,
  engine _rr_strengths) all agree. playerStrength/rivalStrength deleted.
- ONE quest issuer, zero-draw, no seat fork. issueRivalQuest deleted.
- ONE peace min-turns constant (RIVAL_WAR_MIN_TURNS).
- foundRivalCity + rivalUnits deleted.
- **seat_routes is a SEAT PLANE**: routes/route_dest/route_exp allocated
  over every seat; r_routes/r_route_dest/r_route_exp are [:, 1:] VIEWS
  (the seat_ext -> controlled idiom). _MUTABLE holds the seat bases.
- CS-quest RESOLVE index-space fix (see lesson below).

## RESOLVED: purchase_test — was NOT a bug
Measured (not guessed): against a twin sim taking an IDLE step on the
same seed, the buy charges 86.7 and spawns. The test failed because a
DIFFERENT unit dies in the same turn (the two removed CS-quest draws
shift the barb roll), so "total alive +1" came out flat. The assertion
conflated the verb under test with the rest of the phase order; it now
compares against the idle twin, which is SHARPER, not weaker. Green.

## THE RED (current): batched serve lane, seed 9106 turn 236
    TRACE col 85 = r1.rGScore : GPU 598145.0 vs TS 596345  (delta 1800)
NOTE seed 9002 is GREEN at 250 turns — this is seed-specific, which is
the [[smoke-scale-hides-divergence]] lesson in its exact form: my whole
hunt ran on ONE seed and the corpus lane found the rest. Run the hunt on
9106 from the start next time (gpu/serve_gate.py --seed 9106 --turns 240,
and instrument BEFORE re-running: see the probe lesson below).
rGScore is the rival GRIEVANCE score — a warmonger/diplomacy accumulator,
so the suspects are the paths this batch touched that feed it: the
seatStrength change (rGScore's DoW/denounce inputs read strength), and
RIVAL_WAR_MIN_TURNS now gating the player's sueForPeace at 14 instead of
10 (a peace that used to be legal at turn N is now legal at N+4, which
moves grievance decay). Check the strength consumers in the grievance
path FIRST — that is the one this batch actually changed.

## SUPERSEDED: purchase_test hypothesis (kept so it is not re-derived)
    assert int(sim.p_alive[0].sum()) == before + 1  # "purchased unit did not spawn"
CONFIRMED a regression from THIS batch (green at fdec586, red with it).
NOT trajectory drift across turns: the test builds a FRESH sim and steps
ONCE. But that one step still runs the city-state phase, and the
zero-draw quest change removes 2 _next_random calls from it, shifting the
RNG for every LATER PHASE IN THE SAME TURN — barbarian spawns included.
HYPOTHESIS (unverified): a barb now occupies the tile the purchased
warrior would spawn on, so _first_free_spot fails and the buy refunds.
DO NOT weaken the assertion until this is measured — "did not spawn" is
equally consistent with the purchase being REFUSED, which would be a
real bug. PROBE: print _first_free_spot's candidate set and the treasury
delta in that one step, with and without the quest change.

## LESSONS THIS ROUND (both cost real time)
1. PROBE, DO NOT GUESS. Four full 250-turn gate runs were spent on four
   wrong hypotheses about the t192 divergence. ONE probe printing the
   actual values (due=False cur=3 issued=12 owns=True) gave the answer
   instantly: the quest was not mis-ISSUED, it was issued at t12 and
   never RESOLVED.
2. ELIMINATING A THEORY IN ONE CODE PATH DOES NOT ELIMINATE IT IN ITS
   TWIN. I checked the index spaces in the ISSUE path, found them
   consistent, crossed the theory off — and the bug was the same theory
   in the RESOLVE path, which read cs_quest_district (a district-type
   index) through the askable-keyed own_tbl. Same "one fact, two
   readers" shape as seat_routes and the strength formula.
3. gpu/tests/trade2_test.py asserted the OLD route names were in
   _MUTABLE; updated to the seat bases (intent preserved). Expect more
   name-keyed test asserts as planes go seat-generic — grep tests for
   the plane name in the SAME commit that renames it.

## Then
battery -> commit with .claude/scratchpad/cm_rivalside.txt (needs a
seat_routes paragraph added). After that, per .claude/RESTRUCTURE_PLAN.md
S1, ONE batch: placeRivalWonder -> canPlaceWonder, queueRivalProject,
the economy twins, worldCongress -> congress.ts, the (B) movables. The
policy bucket dies with task #100 (UI -> decision server over the dev
server, owner-decided transport). Task #101: serve_gate has no
checkpoint/resume, so every probe replays from t0 — fix or at least
capture-once.


Base commit: fdec586. Everything below is in the working tree, not lost.

