# Engine audit v4 — 2026-08-09

Fourth audit generation, replacing v3 (2026-07-12, last complete at
`ebdab84`). Per this ledger's own rule, resolved entries are dropped
WHOLESALE — v3 carried ~3,600 lines of resolution history, hunt logs
and round briefs; all of it lives in git history. What remains below is
every OPEN item, restated against the current engine (seat vocabulary,
current symbols), plus the freeze backlog the first serve run must
validate.

**RULES (owner):**
- Every note anchors code BY SYMBOL — function/method/class/exported
  constant — never by line number. Line numbers rot; symbols grep.
- VERIFY-BEFORE-IMPLEMENT: every fidelity claim is checked against a
  real Civ 6 source before implementation — never off residual text,
  briefs or comments. Unverifiable magnitudes are recorded, not
  invented.
- SOURCE OF TRUTH is real Civ 6. Reachability is never a licence to
  deviate; gates prove the two engines agree, never that they agree
  with Civ 6.
- Every landed mechanic records WHICH lane can reach it. A green gate
  over an unreached mechanic proves nothing.

**State:** P8 training PARKED until this file is clean. A TEST FREEZE
is in force — everything since the restructure sits behind the compile
bar only, and the first `npm run seed && npm run export` +
`python gpu/serve_gate.py --batched` run opens the hunt (see the freeze
backlog at the bottom). Restore the seed set to 24 before the final
hunt — the 12-seed set is a temporary dev-speed cut.

All surviving `_LIVE` master switches are ON (GOVERNMENTS_ADOPTION,
B18_FOLLOWER_COUPLING, CITY_RELIGION_ADDER, ADMIRAL_MARCH,
DEDICATION_PAYOUTS, ENGINEER, BARB_SCOUT_OPENER); no mechanic is inert
behind a flag. RIVAL_TILE_BUY_LIVE and APOSTLE_BUY_LIVE were DELETED by
#103/#104 — those spends are wire decisions now.

## Completion estimate (owner-requested; guesstimates)

Hand-weighted 1–8 by implementation size; partial items carry
fractional credit. Chapters C/D/E/G closed in full and dropped.

| Chapter | Weight | Done | % |
|---|---|---|---|
| A symmetry | 41 | 40.0 | **98%** |
| B fidelity | 88 | 87.11 | **99%** |
| Closed chapters (C/D/E/G) | 62 | 62 | 100% |
| **Overall** | **191** | **189.11** | **99%** |

## A. Seat symmetry — open

- **A-9r. NEIGHBORHOOD district.** The one district the 9-wide scaffold
  still lacks (URBANIZATION civic unlock, appeal-tier housing). Its old
  blocker is gone — the appeal plane exists (the Seaside Resort pays
  gold = appeal) — so this is now ordinary district plumbing on both
  engines. (The other old A-9 residual, palace relocation on capital
  loss, has since landed: `_relocate_palace_seat0` / `_relocate_palace_civ`.)
- **A-11r. Trade-route tails.** (1) Seat 0's GPU route machinery:
  storage is seat-indexed (`seat_routes` / `seat_route_exp` /
  `seat_route_dest`, row 0 allocated) but the seat-0 rows' gated reach
  is unproven — measure at the freeze-lift hunt. (2) civ↔civ routes
  were descoped when civs could not meet each other; that reason is
  dead (civ↔civ war, denounce and alliance all exist), so the descope
  is now unjustified. (3) The international leg is gate-unreachable
  under current decisions (0 routes form in-gate; poke-proven only).
  (4) No seat's wire carries a trade-route DECISION — route creation is
  an eager rule; a route verb is P8-surface work. (5) No physical
  Trader unit — routes lay roads (`layTradeRoad` / `_lay_trade_road`)
  but nothing walks, so a route cannot be plundered en route.
- **A-26. Seat-0 mask-policy exclusions have NO TS twin — the last
  per-seat action-surface asymmetries, all GPU-mask-side.** TS
  mechanics are seat-generic everywhere surveyed: `trainableUnits` /
  `purchaseUnit` offer naval hulls to EVERY seat gated only on
  `cityNavalCapable`; the unit-sequence walker's SPREAD and SNIPE arms
  execute for whichever seat's record carries them. The GPU withholds
  the columns from seat 0 instead: `city_mask` bans all naval training
  AND gold purchase (`~unit_naval`, sim_masks.py), the civ production
  mask hand-rolls a single one-hull galley column (`_galley_idx`,
  sim_seats.py) that matches neither `trainableUnits` nor real Civ 6,
  seat 0's SNIPE ring columns are all-False (no dispatch arm), and its
  SPREAD columns are all-False (blocked on seat-0 religion, #73). None
  of it is gate-visible: the exclusions live in the decider's masks, so
  identical records reach both engines. Burn-down: adopt the capability
  gate on BOTH mask families (kills the galley column), give seat 0 the
  snipe dispatch, let #73/#74 unlock spread/embark. Each is a behaviour
  round with rollout churn — needs the serve gate live. DEBT markers
  sit at the four sim_masks.py sites. Seat-0 columns for tile buy and
  faith purchases (the #104 wire kinds) belong to the same family.

## B. Fidelity vs real Civ 6 — open residuals

- **B-17r. Encampment:** ranged-vs-district strikes are out of scope
  (matching the ranged-vs-city scope-out). Everything else landed —
  100-HP pool (`encamp_hp`), movement block, garrison pool, district
  strike, training XP.
- **B-18r. Seat-0 religion (#73).** Civ-seat religion is complete
  (pantheon/founder/enhancer races, pressure, missionaries, apostles,
  theological combat, worship buildings, faith buys on the wire). Seat
  0 has faith income + worship spending but CANNOT FOUND a pantheon or
  religion on the GPU — the `civ_pantheon`/`civ_follower`/`civ_founder`/
  `civ_enhancer`/`civ_prophets`/`civ_religion_done` seat-0 rows are
  allocated and waiting. Until it lands, seat 0 fields no religious
  units (see A-26). KNOWN LATENT: a religious-unit lifecycle drift
  (recorded when APOSTLE_BUY was still a flag) becomes reachable the
  moment the driver emits faith-buy kind 6 — expect it at its causal
  turn in the first post-freeze serve hunt.
- **B-20r. Tourism tails.** Tourism, Great Works of writing/music/ART,
  relics, artifacts + archaeology (Archaeologist, antiquity sites,
  museum slots) and the wonder-era term all exist and are digest-
  compared. Open: NATIONAL PARKS (no concept); civ seats never PRODUCE
  an Archaeologist (seat-0-only so far — the production-wiring tail);
  recorded-not-modeled: theming bonuses, shipwreck excavation, trading
  works between civs, open-borders digs. Recorded deviation: every
  apostle killed in theological combat martyrs into a relic
  (promotions are unmodeled; overstates relic rate ~7×). MEASURED
  consequence: visiting tourists peak ~7 vs ~97 domestic at t250, so
  the culture victory is live-but-unreachable by ~14× until these
  close.
- **B-21r. City-state suzerain rows:** 14 shipped / 10 descoped
  (unit-XP, cavalry, apostle-promotion, trade-route, power and
  amenities channels — each documented at `CITY_STATE_SUZERAIN_LIVE`); shipped
  rows degrade %-scaling and conditionals to a flat channel yield.
- **B-22r. World Congress tails:** one resolution type only (real GS
  rotates many); Emergencies and Scored Competitions — the main real
  DVP sources — are unmodeled (awarding via the resolution winner is
  faithful in shape, overstated in rate); every civ commits ALL favor
  (no vote-size chooser on any seat); peace deals carry no terms; the
  favor PENALTIES (CO2, global grievances, occupied capitals) are
  named by sources without rates — recorded, not invented.
- **B-24r. Ages/governors tails:** Monumentality's faith-purchase of
  civilians + 30% discount, Exodus's +2 charges on new religious
  units, Free Inquiry's commercial-adjacency-gives-Science clause; the
  eight unmodeled dedication catalog entries (four need spies / air
  units / artifact systems / GDRs); dark-age policies; governor
  ESTABLISHMENT and promotions (governors are a stateless greedy
  ranking today); per-civ tech-era drift (eras are global 50-turn
  blocks).
- **B-25r. Victory tails:** every named Civ 6 victory exists on both
  engines; open is the seat-0 PROJECT-PRODUCTION path on the GPU
  (victoryType 3 can be preserved but not produced — the wire has no
  project/wonder columns for any seat, task #83), and the culture win's
  ~14× tourism gap (B-20r).
- **B-26r. Barbarian camp-spawn escalation** beyond the melee ladder
  (cliffs, ranged barbs and naval barbs all landed).
- **B-D. UNSOURCED DATA VALUES — a residual class, not one item.**
  Mechanics are sourced item by item; the DATA layer largely is not:
  files under cpu/data + cpu/core carry explicit `eyeballed` /
  `approximate` / `stand-in` markers on magnitudes (builtWonders,
  policies, improvements, wonders, units, resources, religion,
  projects, constants, cityStates, buildings, boosts, appeal, combat).
  A wrong CONSTANT passes every gate — both engines agree on the wrong
  number. Closing this is a sourcing sweep round: verify each marked
  magnitude against Civ 6 data, or record it as a deliberate
  stylization where the model genuinely diverges.

## The freeze backlog — what the first serve run must validate

Landed behind the compile bar only, in dependency order of suspicion:

1. The #104 wire verbs (tile buy kind 3, faith kinds 4/5/6, levy) and
   their candidate tripwires — including the B-18r apostle-lifecycle
   latent.
2. The #107 geo verbs (denounce/ally/rr-war/rr-peace on the wire, the
   decide-once-per-turn coupling).
3. serve_gate checkpoint/resume (#101) — exercise a resume against a
   fresh run before trusting it for diagnosis.
4. The storage renumbering + #109 city-block unification (one base per
   fact; `tile_city`, `centre_slot_at`, `city_dist_tile`, `city_wonder`,
   `city_prod_bank`, `civ_cap_tile`) — behaviour-preserving by intent,
   proven only by digests.
5. The protagonist relabel (#75) and the vocabulary purge (identifier
   renames, spelled storage families and kind tags) — behaviour-preserving by
   intent.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint, full
fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.
