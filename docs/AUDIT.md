# Engine audit — open work

THIS FILE IS A LIST OF OPEN WORK. A resolved entry is DELETED, not
annotated; what was fixed, when and why is the git log's job. No history,
no shipped-prose, no test rosters — one weight and one OPEN list per entry,
each bullet naming its build, its blocker or its ask.

**RULES (owner):**
- Anchor code BY SYMBOL, never by line number.
- VERIFY-BEFORE-IMPLEMENT against a real Civ 6 source: the owner's install
  (XML over civilopedia; Base <- Exp1 <- Exp2, take the last) first, forums
  second. An unsourced magnitude is an ASK, never an invention.
- A gap deferred on an unbuilt mechanic is TWO open items: the mechanic and
  the gap naming it. "Recorded" and "descoped" are deferrals, never closures.
- Every new mechanic records which lane REACHES it; a green gate over an
  unreached mechanic proves nothing.
- When an entry closes, delete its row and its entry in the SAME commit.

**State:** P8 training PARKED until this file is empty. Restore `N_SEEDS`
to 24 before the final hunt.

## Open weight

Hand-weighted 1–8 by the size of what is LEFT to build, not by what the
mechanic was worth when the entry opened. One row per entry, no row
without an entry. No percentage: closed weight is deleted by design.

| Open item | Weight | What is left |
|---|---|---|
| **A. Engine vs engine** | **1** | A-1 and A-2 CLOSED (#246l, #246s); A-3 a Missionary one tile apart at seed 9287 turn 156 |
| B-20r park orientation | 1 | no canonical vertical in this hex frame; every rhombus offered — a model choice, nothing to build until one is chosen |
| B-22r World Congress competitions | 1 | Aid Request (a gold-gift verb and a disaster trigger); the World Games' tourism and the Space Station's production rewards |
| B-24r governor tails | 2 | a fourth card style, Foreign Investor and Affluence on C-38, four clauses on C-1/C-31 |
| B-31r trade-route tails | 1 | plunder PERCENTAGES sourced and shipped, the base is DLL; chain depth is ask 2; the per-district gold shape is ask 16; free-choice destination head is P8 |
| B-34r flood tails | 1 | coastal floods; the Egyptian and Soothsayer halves |
| B-51r Encampment pool on capture | 1 | ask |
| B-54r unique-unit flank/support stacks | 1 | Impi and Hypaspist, once C-78 seats them |
| B-56r inert promotions | 1 | Boarding SHIPPED; the sight table needs a WALK ruling (ask 12); Ground Crews waits on a PATROL that is no data row at all |
| B-61r Great Person clauses with no carrier | 2 | ten `open: B-61r` ledger rows |
| B-62r suzerain adjacency at a wonder tile | 0 | CLOSED — no improvement in the install is buildable on a natural wonder plot, so the add is unreachable |
| B-66 formations | 1 | a THREE-member escort, the rider's own reveal |
| B-67 district price progression | 1 | GAME_PROGRESS curve for five districts, DLL-side |
| B-D unsourced data values | 1 | Democracy's route pays only its own city; per-city war weariness (DLL), GAME_SPEED shape, unit faith rate |
| **B. Fidelity vs real Civ 6** | **16** | |
| C-1 power | 1 | accident roll and damage tables (sourced, on ask 5), a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 2 | joint war, join war, research agreement, a luxury lump; mark/demand/discuss on C-76; what a mid-build purchase does to the hammers is an ask |
| C-16 the spy's second half | 1 | how the four UnitOperations probability columns compose (the escape's TERMS are sourced, its scale is ask 15); a Free City as spy ground |
| C-20 Mountain Tunnel's route multiplier | 1 | the ONE modifier the row names carries no arguments at all — the magnitude is wholly DLL |
| C-22 Preserve housing table | 1 | middle bands stylized |
| C-26 civilization abilities, the residue | 1 | agendas (C-76), four unread DLL clauses, the Rock Band's venue bits (C-79) |
| C-31 the nuclear strike's last clauses | 1 | the per-delivery split and the bomber's 50%-HP threshold (both on C-34's unpublished damage), citizens killed, wonder in the blast (ask) |
| C-33 Giant Death Robot's Range | 0 | CLOSED — the install says Range 3, this engine has 3, and the five-hex row is scenario-only |
| C-34 air combat's second half | 2 | fighter interception and Patrol (unsourced roll); Priority Target carries NO data at all — a command row, an icon and an interface mode |
| C-35 drowned ground is COAST | 0 | CLOSED — every ring fact reads a submerged tile as coast on both engines |
| C-38 a city-state's city | 1 | growth and border are in; what it SPENDS gold and faith on is ask 10 |
| C-41 Volcanic Soil | 1 | where an eruption lays it is an ask |
| C-49 named storms | 1 | the HEADING is sourced (`PrevailingWinds`); what `Movement 8` counts is ask 17 |
| C-60 the Free City's own play | 1 | two owner rulings and nothing to build: its units/walls/retaliation, its amenities |
| C-64 majority religion | 1 | a per-seat majority read; the tie rule is an ask |
| C-67 diplomatic preference weights | 1 | waits on a decider with alternatives (P8) |
| C-69 two unique rows with trait clauses | 0 | CLOSED — the Tsikhe and the Mission shipped with C-79's rows |
| C-74 per-game counts over per-object rolls | 1 | ask (volcanoes and reactors) |
| C-76 an opinion scale | 2 | a compared per-pair opinion on both engines; what moves it is an ask |
| C-78 unique UNITS absent | 1 | all 31 civilization uniques are built; the nine LEADER units are left, and two clauses wait on B-56r and C-79 |
| C-79 unique INFRASTRUCTURE absent | 1 | every district, building and improvement is built; what is left is four clauses with no carrier |
| **C. Absent systems** | **31** | |
| **OPEN, TOTAL** | **35** | |

## The question ledger — owner asks, one line each

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or a primary source is reached. The ruling is written into
the entry and the line leaves.

1. **C-41 — where Volcanic Soil lands.** Which tiles an eruption paints,
   and whether an already-improved tile takes it — DLL.


2. **B-31r — the course's depth.** `ROUTE_CHAIN_MAX` 6, the same shape.

3. **B-51r — the Encampment's pool on a city capture.** `city_outer_hp`
   zeroes; the district's own pool rides through. No rule reached.

4. **C-64 — the majority-religion tie.** Two religions in equal cities; no
   source names the winner.

5. **C-74 / C-1 — per-GAME counts over per-OBJECT rolls.** The install
   counts eruptions and reactor accidents per game; this engine rolls per
   volcano and would roll per reactor. PROPOSAL: divide the per-turn rate
   by the map's count of objects at risk.

6. **C-31 — a wonder in a nuke's blast.** Pillaged or not: unsourced.

7. **C-76 — the opinion deltas.** The install names every
   `LOC_DIPLO_MODIFIER_*` and publishes no amount; forum figures cite
   nothing. The ANCHORS are fully sourced (100 / 83 / 66 / 50 / 33 / 16 / 0,
   with a `DiplomaticYieldBonus` beside each); what no source gives is what
   MOVES a pair between them. Ruling this unblocks the whole of C-76 at once
   — a carrier without deltas is a constant, so neither half can ship
   alone.

8. **C-2 — what a mid-build gold purchase does to the hammers.** One
    tested report says a UNIT keeps its progress and a BUILDING's is wasted;
    this engine banks both, on the standing rule that hammers never burn.
    One forum post against a principle — the owner's call.

9. **Two city-state names this roster invented.** "Venice" and "Bandar
    Brunei" are not Civ 6 city-states. Their bonuses are AMSTERDAM's (base;
    Antioch carries the same text in Expansion1) and JAKARTA's. Both
    MECHANICS are built and sourced; only the names are wrong. Renaming
    them touches `seeder/place.ts`, which is hashed into `genStamp`, so the
    fix costs a reseed and a fresh `worlds.lock`. Rename, or keep the names?

10. **C-38 — what a city-state SPENDS on.** Its Gold and Faith bank and
    nothing draws on them. `GlobalParameters.xml` carries five MINOR knobs
    and all five are placement; no XML row anywhere names a city-state
    purchase, build weight or reserve. Leave them banking, or name a rule?

11. **C-16 — a Free City as spy ground.** The install carries NO data gate:
    the ten `UnitOperations` spy rows name a `TargetDistrict` and nothing
    else, and no requirement set anywhere keys on `CivilizationLevels`.
    Which cities a spy may travel to is DLL. Both engines walk the major
    rows today. Open the Free City to spies, or leave it closed?

12. **B-56r — how sight is SPENT.** `SightThroughModifier` (Woods,
    Rainforest, Hills 1; Mountains and the great natural wonders 2) and
    `SightModifier` (Hills +1, Mountains +2) are published; the WALK is not.
    Two readings fit the columns: a sight BUDGET spent along the hex path, or
    a radius with tiles occluded BEHIND a blocker. They differ on every map
    with a ridge, so neither engine ships one until this is ruled.

13. **C-60 — a Free City's amenities.** The tier is computed per OWNER, off
    the seat's luxuries and policies, and the Free Cities player has none —
    so every Free City sits at the bottom band forever. `CivilizationLevels`
    has no amenity column and no XML row names one. Give the free row a
    fixed tier, or let the bottom band stand?

14. **C-60 — a Free City's defence.** "Will repair pillaged improvements
    and spawn units to defend itself, and may build walls", "will try to
    retaliate". No XML row names the unit, the cadence or the walls, and
    its strike needs a target rule. Name them, or leave the floor-15
    defence and the walls it revolted with?

15. **C-16 — what the spy's escape chance is a chance OUT OF.** The install
    publishes the whole term list and every term is a LEVEL:
    `ESPIONAGE_ESCAPE_BASE_CHANCE` 10, `_LEVEL_BOOST` +1 per spy level,
    `_COUNTERSPY_LEVEL_MODIFIER` -1 per counterspy level,
    `_POLICE_CORRECT_MODIFIER` -4, `ESPIONAGE_MAX_LEVEL` 4, and Ace Driver's
    own `MODIFIER_PLAYER_UNIT_ESCAPE_BOOST` 4 (all three spy promotions ship
    at the install's sizes). What no row says is the SCALE — read as percent,
    a base of 10 makes escape nearly impossible — nor where the ROUTE comes
    in: this engine's base is per route (Airplane 40 / Boat 50 / Vehicle 60 /
    Foot 70) and the install has one base and no route term. Name the scale,
    or keep the per-route table?

16. **B-31r — what a trade route pays per district.** `GlobalParameters`
    carries `TRADE_ROUTE_GOLD_PER_ORIGIN_DISTRICT` 2 and
    `_PER_DESTINATION_DISTRICT` 2, unmodified by either expansion. This
    engine pays a flat 3 plus ONE gold per destination SPECIALTY district and
    nothing for the origin's. The rows say the real model reads BOTH
    endpoints at 2 apiece; what they do not say is how the DLL composes them
    (all districts or specialty only, floored or halved), and taken literally
    a mature pair of cities pays more than any observed route. Take the two
    rows literally, or keep the flat head?

17. **C-49 — what `Movement 8` counts on a storm.** The HEADING is not DLL
    after all: `Expansion2_RandomEvents.xml` publishes `<PrevailingWinds>`,
    22 weighted direction rows banded by latitude, and this map already
    carries the latitude they key on. Every storm row also carries
    `Movement="8" Duration="3" Spacing="15"`. What the data never says is
    the unit of 8 — hexes per turn, or a movement pool a hex spends from.
    Name the per-turn hex count and the walk is buildable in full.

## A. Engine vs engine

The digest is the only instrument for this class; a round that widens what
the gate reaches is worth more here than one that re-reads the exporter.

- **A-1. BUENOS AIRES COUNTED DEAD BONUS RESOURCES.** CLOSED 2026-09-08 with
  #246l. The gate now runs past seed 9027 entirely.
  - TS counts a bonus resource by reading `t.resource`, and NULLS that field
    at the two places a bonus copy dies — a Builder harvesting it, and a
    district paving it. The GPU keeps `res_id` and marks `res_stripped` at
    those same two sites, and the Buenos Aires count did not ask the mark, so
    two consumed copies were still paying a full amenity round apiece and two
    cities sat a tier high.
  - THE HUNT IS THE ENTRY. The symptom was six yield fractions at turn 99;
    every delta was exactly `0.05 x yield` or `0.10 x food surplus`, which is
    one amenity tier. The balance is DERIVED and no field named it, so three
    instruments had to be built before the term could be read: the tier as a
    compared field (#246b), the two-sided amenity log (#246e), and the grant
    stamp (#246k) — which closed it by printing NOTHING, proving the rounds
    were never Great Merchant products at all.
  - THREE HYPOTHESES DIED ON THE WAY, each to a battery run rather than to an
    argument: a missing `max(0, ...)` on the war-weariness penalty, the
    luxury ranking's tie-break, and the within-turn phase order. The last two
    were real divergences in their own right and shipped as #246d and #246h;
    neither was this one.
  - TWO SIBLINGS ARE NAMED, NOT FIXED: a Builder improving a luxury mid-turn
    has the same phase-order exposure the invented count had, and every other
    reader of `res_id` owes `res_stripped` the same question this one did.

- **A-2. THE ROUTE DEST CODE NAMED A POSITION.** CLOSED 2026-09-08 with
  #246s.
  - The wire carries a trade route as [origin CENTRE, dest code], a code of
    `-(2 + n)` meaning a city-state. The APPLIER has always decoded `n` with
    `cityStateById` — an ID — while the driver ENCODED `-(2 + ci)` with `ci`
    the array position. `captureCityState` splices that array, so the two
    halves of TS agreed only until a minor was taken; the GPU keeps a fixed
    slot per city-state and never renumbers, so it was the encoder that was
    wrong and its own decoder that proved it.
  - The gate log named it by printing the CENTRE beside each code: the GPU's
    -2/-3/-4 read 541/983/257 and TS's -2/-3 read 983/257 — the same list,
    shifted by one, with TS missing the entry the GPU still held.
  - `placeCityStateAt(state, i, ...)` assigns the id from fixture order, so
    id == initial index == GPU slot, permanently. That is the invariant the
    whole city-state wire rests on — the LEVY names an id through
    `cityStateById` too — and it is now the one the route code uses.
  - THE CLASS is `wire position vs id`: a wire field naming a roster member
    by ARRAY POSITION breaks the moment the roster can shrink. This roster
    can, and did.

- **A-3. A MISSIONARY ONE TILE APART.** OPEN, and the first fire now that A-2
  is gone — seed 9287 turn 156, eleven seeds and thirty-nine turns deeper
  than where this round started.

        unit[649]: GPU-ONLY row {seat 1, type 14, hp 100, charges 3, ...}
        unit[645]: TS-ONLY  row {seat 1, type 14, hp 100, charges 3, ...}

  - The keys decode to (tile 162, slot 1) and (tile 161, slot 1): the SAME
    Missionary, the same stacking class, every other field identical, on
    ADJACENT tiles. Not a key or a class question — a step.
  - The `spread` twin did not flag, so both engines chose the same target;
    what differs is the walk to it. Both replay the same record, and
    `rec.units` is one entry per STEP, so one engine took a step the other
    refused.
  - THE STEP HALF SHIPPED (#246u-#246x) and the pair reads. At turn 155, one
    turn BEFORE the digest flags, seat 2 steps to different destinations from
    the SAME origins:

        D-TS   st:2:357:356 t155 moved     D-GPU  st:2:357:401 t155 blocked
        D-TS   st:2:492:449 t155 moved     D-GPU  st:2:492:536 t155 blocked

    The deltas are -1 / -43 on TS and +44 / +43 on the GPU — different
    DIRECTIONS out of the same tile.
  - RULED OUT: the direction decode. `phase.ts` uses `neighborTile`, the
    slot-preserving decoder, under a comment naming this exact hazard, and
    the GPU gathers from a `neigh` plane that keeps its -1. Neither
    compacts.
  - THE TWO CANDIDATES LEFT. Either the engines hold DIFFERENT UNITS at the
    same tile — in which case the order reached different chassis and the
    origins matching is a coincidence of position — or the replay's row-to-
    unit alignment has slipped, which `phase.ts`' own comment already warns
    about: "row j addresses the seat's j-th unit in SPAWN order ... this is
    an ASSUMPTION the gate has to hold ... if it ever breaks, every seat's
    orders land on the wrong units and the failure looks like chaos rather
    than an ordering bug." Same origin with a different destination is what
    that would look like.
  - A CORRECTION TO THIS ENTRY. #246A read two ADJACENT lines as a matched
    pair; they were two UNPAIRED lines, because the pairs print (GPU, TS) and
    an edge key cannot pair a step whose destinations differ. The conclusion
    below still holds — both engines independently log rank j3, type 20, out
    of tile 357 — but it rests on the FIELDS, not on the display, and the key
    is now the ORDER (seat, turn, rank) so the case the log exists for can
    actually pair.
  - THE ALIGNMENT HOLDS, and that fork is closed (#246z). With the rank and
    the type on the line:

        D-TS   st:2:357:356 t155 j3 ty20 moved
        D-GPU  st:2:357:401 t155 j3 ty20 blocked
        D-TS   st:2:492:449 t155 j9 ty14 moved
        D-GPU  st:2:492:536 t155 j9 ty14 blocked

    Same rank, same type, same origin, different destination. The order
    reached the SAME chassis on both engines, so this is not the row-to-unit
    slip `phase.ts` warns about, and it is not two units sharing a tile.
  - THE DIRECTION TABLES AGREE, checked by hand rather than assumed. TS's
    `AXIAL_DIRS` through `offsetToAxial`/`axialToOffset` yields, for an EVEN
    row, [(1,0), (0,-1), (-1,-1), (-1,0), (-1,1), (0,1)], and for an ODD row
    [(1,0), (1,-1), (0,-1), (-1,0), (0,1), (1,1)] — element for element the
    GPU's `even` and `odd` lists in `simbase`. Both keep their -1 slots, so
    the compaction is out too.
  - THE ACTION NUMBERS MATCH; THE GPU IS ONE STEP AHEAD. Keyed on the ORDER
    the pairs finally line up, and they say something different from what the
    edge-keyed lines suggested:

        D-GPU  st:2:155:13 ty20 a5 at447 to491 blocked
        D-TS   st:2:155:13 ty20 a5 at402 to447 moved
        D-GPU  st:2:155:9  ty14 a4 at492 to536 blocked
        D-TS   st:2:155:9  ty14 a4 at449 to492 moved

    Same rank, same type, SAME ACTION — and the GPU already stands on the
    tile TS is only now moving into. The GPU took a further step for that
    rank which TS never attempted at all: TS's last line for the rank is a
    completed move, not a refusal.
  - SO IT IS MOVEMENT POINTS. `applySeatUnitOrders` skips a unit whose
    `movesLeft <= 0` and the GPU's step arm gates on `mp > 0`; the record
    carries the same steps to both. One engine had the movement for another
    hop and the other did not.
  - AND THE COMPARISON COULD NOT HAVE SHOWN IT. `movesLeft` IS a compared
    field, but once the two engines put the unit on different tiles its
    census KEY differs, so the row prints as GPU-ONLY / TS-ONLY and no field
    is ever compared. A key built from mutable position hides every field of
    a row that moved — worth remembering before trusting a keyed diff's
    silence.
  - ONE CAVEAT ON THE EVIDENCE, because it would mislead a reader who did not
    run it: the OTHER step pairs in that dump show different ORIGINS (TS
    402->447 against GPU 447->490). That is a window artifact — the log keeps
    24 lines per kind and a turn's steps for one seat exceed it, so the two
    sides show different subsets of the same walk. Only the pairs that SHARE
    an origin are evidence. Widening that window, or keying the line by step
    index, is the next thing the instrument needs.
  - **THE READING ABOVE WAS THE INSTRUMENT, NOT THE ENGINES.** Adding the
    pre-step MP to the line was supposed to settle "who had the movement";
    what it actually exposed is that the pairs were never pairs. A turn's
    unit record is K ROWS, not one — `applySeatUnitOrders` walks
    `for (const step of steps)` and `apply_seat_unit_sequence` walks
    `for k in range(seq.shape[2])` — and the key named (seat, turn, rank)
    only. Every row of a turn therefore collided on one key, and the pairing
    keeps the LAST line per key, so a GPU line from row 2 printed against a
    TS line from row 0. "The GPU is one step ahead" was exactly that: the
    GPU's later row against TS's earlier one.
  - THE SECOND HALF OF THE SAME DEFECT: TS refuses a spent unit at a gate
    ABOVE the log site (`movesLeft <= 0` returns before the movement arm),
    while the GPU carries `mp > 0` as a term of `ok` and logs the refusal.
    So a spent unit printed one-sided, which reads as the GPU attempting a
    hop the oracle never tried. It never tried it either; it just did not
    say so. Both engines now print the refusal.
  - WHAT THE INSTRUMENT LOOKS LIKE NOW, and it is the shape the next hunt
    reads: the key is `st:<seat>:<turn>:<k>:<rank>`; the step window is the
    last two TURNS on both engines rather than the last N lines, because a
    line count straddles the turn boundary at a different place on each
    side; the pairing sorts keys FIELD BY FIELD AND NUMERICALLY (a string
    sort put rank 10 before rank 2, so "the first disagreement" was not the
    first line printed) and caps each kind at ten pairs, since once a unit
    stands on the wrong tile every later step of the turn disagrees as a
    consequence.
  - STILL OPEN, and no longer claimed to be movement points: the seed 9287
    turn 156 unit divergence. The two ruled-out causes survive — the
    row-to-unit alignment holds and the direction tables agree — and
    `movesLeft` remains uncomparable once the tiles differ, for the reason
    given above. Everything between those two facts is unmeasured again.
  - **AND THE FIXED INSTRUMENT NAMED IT: NOT ONE ORDERED STEP DISAGREES.**
    With the sequence row in the key and TS printing its refusals, the seed
    9287 turn 156 dump carries ZERO `st:` disagreements — every ordered step
    of turns 155 and 156 pairs term for term on both engines — while the unit
    census still holds one seat-1 Builder at tile 162 on the GPU and 161 on
    TS. A unit that ends the turn somewhere else than the oracle put it, with
    every step it was ordered to take agreeing, is not moving by its own
    order. It is being CARRIED.
  - **THE ESCORT DRAGGED ONE RIDER WHERE TS DRAGS THE LIST.** `stepUnit`
    takes `escortRiders`' whole list and walks it twice — once to refuse the
    step if a rider cannot stand at the destination or afford the cost, once
    to move them all. `_escort_rider` returned ONE candidate, the first of
    the civilian, support and embarked planes to answer, and `_step_verb`
    carried that one. While the two non-military stacking classes were ONE
    class the two rules were the same rule; the SUPPORT split made a
    three-member formation reachable, and from that commit the GPU left the
    second rider standing. Nothing in the step log could show it: the
    MOVER's step agrees, and the rider is carried inside the verb.
  - TWO MORE OF THE SAME ROOT, found by writing the poke that reproduces it —
    and the poke could not even build the scene until both were fixed:
    - the GPU's escort GATE read `is_civ | u_emb`, and a Battering Ram is
      not `civilian` on the wire (it carries no build charges), so nine
      chassis could never join a formation at all. TS's `escortable` is a
      passenger at sea or `unitIsNoncombat` — the civilian class AND the
      support one.
    - the GPU's refusal walked the civilian and embarked planes and turned
      away ANY escorted rider standing there, whatever its class, where
      `escortUnit` refuses only a second rider of the SAME class. Even with
      the gate widened, the Builder beside the Ram would have refused it.
    - and `_escort_rider`'s `carrier` asked "not civilian, not embarked"
      where TS asks `unitDomain(...) === 'military'`, so a support chassis
      counted as an ESCORT on the GPU and could drag a rider of its own.
    All three are one sentence read wrong: `_type_civilian` is the CLASS, and
    what these rules wanted was `unitIsNoncombat`. This is the
    new-class-invariant sweep the SUPPORT split owed and did not pay.
  - THE REVEAL FOLLOWED THE LIST TOO: `stepUnit` lights the circle at the
    WIDEST sight in the formation, which is the whole reason a formation
    carries an Observation Balloon or a Drone. Reading one rider revealed a
    three-member formation at the wrong radius.
  - PINNED ON BOTH ENGINES: `escort_test`'s section 10 (a Warrior with a
    Builder and a Battering Ram steps, and all three land, all three pay)
    and `escort.test.ts`'s "drags BOTH riders when the escort steps".
  - **AND THE PLACEMENT LOG NAMED IT IN ONE LINE EACH.**

        D-GPU  sp:1:156:161:14 at162
        D-TS   sp:1:156:161:14 at161

    Same seat, same turn, the SAME anchor and the same chassis: TS put the
    Builder on the tile it was asked for and the GPU walked to a neighbour,
    because the GPU held that plot's CIVILIAN slot occupied.
  - THE CAUSE: `_spawn_unit` wrote the occupancy planes BY HAND, two arms off
    `_type_civilian` — and `_type_civilian` is the NONCOMBAT set, not the
    civilian stacking class. Every support chassis was therefore born into
    the wrong plane: the Military Engineer (build charges, no combat) among
    the civilians, the Battering Ram and the Medic among the military. A
    Builder trained onto a plot holding a Military Engineer was refused a
    tile `spawnUnit` gives it, and walked one hex away.
  - THE SECOND HALF, found in the same read: `_vacate` cleared the civilian,
    military and embarked planes — the three that existed before the split —
    so a despawned SUPPORT unit went on holding its plot for the rest of the
    game. It now clears through `_occ_clear`, which has always walked all
    four, and the two are one reader again.
  - BOTH ARE THE SAME MISS, and it is the one this project already has a
    name for: a new per-slot plane misses every existing walk. `_occ_set`,
    `_occ_clear`, the fixture loader and even the escort poke's own `put`
    helper were all taught the three-way split when the SUPPORT class landed
    — the helper had the identical bug and was fixed then. `_spawn_unit` and
    `_vacate` were the two the sweep did not reach.
  - PINNED: `escort_test`'s section 11 spawns a Military Engineer through
    `_spawn_unit`, asserts it holds the SUPPORT plane and neither of the
    others, spawns a Builder at the same anchor and asserts it lands ON that
    anchor, then vacates the Engineer and asserts the plane is given back.
  - ONE ASYMMETRY FOUND WHILE READING THE APPLIERS, recorded rather than
    fixed because nothing has shown it firing: TS refuses EVERY verb from a
    unit with `movesLeft <= 0` (spies excepted), while the GPU has no such
    global gate — only individual arms carry one. It is unreachable from
    today's driver, whose follow-on rows are movement-only by construction
    (`best = key.argmin(dim=1)` is a direction, 0..5) and whose row 0 runs
    on a refreshed pool. A driver that ever emitted a verb after a spend
    would split the two engines here.

## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-20r. A PARK'S ORIENTATION.** Weight 1.
  - Civ 6 fixes the park rhombus's vertical; this hex frame has none, so
    every rhombus is offered. A model choice; nothing to build until a
    vertical is chosen.
- **B-22r. WORLD CONGRESS COMPETITIONS.** Weight 1.
  - THE SCORE TABLE SHIPPED with #244s. `<EmergencyScoreSources>` is one row
    per (competition, quantity) with its own `ScoreAmount`, and several
    competitions score on more than one at once, so `scored` stopped being a
    single value and became a LIST of (kind, amount, of) rows on both
    engines. Five kinds are live: `FromCO2Footprint`, `FromGreatPerson`,
    `FromProject`, `FromBuilding`, `FromDistrict`. The Climate Accords'
    decommission bonus, which had its own constant and its own call site,
    folded into the table as three ordinary `FromProject` rows.
  - THE WORLD GAMES and the SPACE STATION shipped with it — both score on
    holdings ("Maintaining Stadiums", "Maintaining Campus Districts") plus a
    project, and both publish all three tiers (FIRST PLACE 1 Diplomatic
    Victory point, TOP TIER 50 Favor). Their two projects, `TRAIN_ATHLETES`
    and `TRAIN_ASTRONAUTS`, are `UnlocksFromEffect` rows like the
    decommission three, so `accordsOnly` became `competitionOnly`, naming
    the competition that opens the row.
  - NEITHER competition's EXTRA rewards are modelled: the World Games pay
    tourism onto a first-place Campus and onto each tier's Stadiums and
    Aquatics Centers (2/2/1), and the Space Station pays space-race project
    production (+40% top tier, +20% bottom) and a first-place spaceship
    speed. All published, none built — a reward channel each engine lacks.
  - AID REQUEST is the one competition still absent. It scores `FromGold`
    ("Sending gifts of Gold to the Target", 1 per gold), `FromProject`
    `PROJECT_SEND_AID` at 200, `FromAtWar` at -30 and `FromBadCO2Footprint`
    at -400; its tiers are published too (2 Diplomatic Victory points, 100
    and 50 Favor). What it needs is a GOLD-GIFT verb — no engine can send
    gold to a named rival — and a disaster TRIGGER, since it is the one
    competition the Congress does not vote in.
  - BORDER DISPUTE and CATASTROPHE, which an earlier draft of this entry
    named, are in neither the install's fifteen emergency types nor this
    engine's catalog. They were never rows; the line is withdrawn.
  - THE NOBEL PRIZE competitions are Sweden-only (C-26).
- **B-24r. GOVERNOR TAILS.** Weight 2.
  - The district PURCHASE verb SHIPPED with #244p, gold and faith both, and
    with it CONTRACTOR and DIVINE ARCHITECT, which had carried empty effects
    since governors landed. Both promotions are pure permissions
    (`CanPurchase` booleans with no price of their own), so the price is the
    engine's: the production cost a builder would pay, through the purchase
    multiplier a building already pays. Two composers came out of the build —
    one district COST and one district COMPLETION per engine — so a discount
    is worth the same to a buyer as to a builder, and a bought Encampment
    gets its walls. A purchase touches neither the city's queue nor its
    production bank: hammers are not spent by a cheque.
  - AIR DEFENSE INITIATIVE was shipped in #245 with no exporter column: the
    GPU asked `_gpromo` for a channel the loader never loaded, got `None`,
    and paid every seat zero while TS paid the promotion. Fixed with the
    column, and `seat_symmetry_check` now fails on any governor channel read
    by a string the loader does not carry.
  - The FISHERY and CITY PARK SHIPPED with #242m, and with them Aquaculture
    and Parks and Recreation, which had carried empty effects since governors
    landed. Both are LIANG's, not Reyna's, and each promotion OPENS the row
    in its own city rather than merely paying it — which is why the install
    writes the plot yield as a second, separate modifier: the improvement
    stands after the governor leaves and that payment stops.
  - Renewable Subsidizer and Industrialist wait on C-1's plants; Arms Race
    Proponent on C-31's armament projects.
  - FOREIGN INVESTOR needs a minor that accumulates strategic resources
    (C-38); AFFLUENCE copies the ground's luxuries because a minor improves
    nothing (C-38).
  - NO CARD STYLE ASKS FOR A DARK AGE CARD: the driver's three styles never
    reach one (measured: a forced Dark Age slots 0 of 13). A fourth style
    is the carrier; poke-only until then.
  - Who to hire and where to seat him is a heuristic (catalog order,
    lowest-loyalty city) — a decision for P8's surface.
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  - `ROUTE_CHAIN_MAX` 6 is a capacity choice — ask 2.
  - `PLUNDER_ROUTE_GOLD` 50 is a MODEL NUMBER, and a 2026-09-08 pass of the
    install says it will stay one: `GlobalParameters.xml` carries no plunder
    amount of any kind, and the only trade-route plunder rows anywhere are
    Lisbon's immunity and an Admiral's bonus, neither of which publishes a
    figure. Not "unsourced pending a look" — looked at, and absent.
  - The IMPROVEMENT pillage table, by contrast, IS published and this engine
    already matches it: 26 of 26 rows agree with `PlunderType` /
    `PlunderAmount` (Gold 50, Faith 25, Heal 50), checked row by row on
    2026-09-08. `PLUNDER_NONE` on the Mountain Tunnel, with an Amount of 50
    beside it, is the install's own typo for `NO_PLUNDER` and is read as
    "no plunder" rather than modelled as a fifth kind.
  - THE PLUNDER PERCENTAGES, by contrast, are published and both already
    ship at the install's size: `MODIFIER_PLAYER_UNITS_ADJUST_PLUNDER_YIELDS`
    appears exactly twice — `TOTAL_WAR_PLUNDER_BONUS` Amount 50, which is
    Total War's `pillageMult 1.5` / `routePlunderMult 1.5`, and
    `LETTEROFMARQUE_PLUNDER_BONUS` Amount 100, which is the naval raider
    card's doubling. So the shape around the base is sourced even where the
    base is not.
  - A NEW ASK OFF THE SAME PASS (ask 16): `TRADE_ROUTE_GOLD_PER_ORIGIN_DISTRICT`
    2 and `_PER_DESTINATION_DISTRICT` 2 are in Base `GlobalParameters` and
    neither expansion touches them, while this engine pays a flat 3 plus one
    gold per destination SPECIALTY district and nothing for the origin's.
    The rows say the model reads both endpoints; how the DLL composes them
    they do not say.
  - ALREADY SOURCED AND CORRECT, checked while there: the route's range
    (`TRADE_ROUTE_LAND_RANGE_REFUEL` 15, `_WATER_RANGE_REFUEL` 30) and its
    20-turn minimum with the era bump (`TRADE_ROUTE_TURN_DURATION_BASE`,
    `TradeRouteMinimumEndTurnChange`).
  - The destination is one candidate row plus take/skip; the free-choice
    head is P8 work.
- **B-34r. FLOOD TAILS.** Weight 1.
  - COASTAL floods are not modelled: a flood reaches a river's own tiles
    (`_flood_river` / the river walk), and a coastal one needs a shoreline
    reach and the lowland bands to drive it.
  - The EGYPTIAN ability's flood half and the SOOTHSAYER's are C-26's and
    an absent chassis'.
- **B-51r. THE ENCAMPMENT'S POOL ON CAPTURE.** Weight 1.
  - `city_outer_hp` zeroes on a city capture; `Tile.encampOuterHp` /
    `encamp_outer_hp` rides through. Ask 5.
- **B-54r. UNIQUE-UNIT FLANK AND SUPPORT STACKS.** Weight 1.
  - Zulu's Impi and Macedon's Hypaspist raise flanking or support for
    themselves alone — after C-78 seats the chassis.
- **B-56r. THE INERT PROMOTIONS.** Weight 1.
  Three of 107 rows in `cpu/data/promotions.ts` carry `none`. A 2026-09-08
  sourcing pass found a published rule behind all three:
  - SENTRY — `SENTRY_SEE_THROUGH_FEATURES`,
    `MODIFIER_PLAYER_UNIT_ADJUST_SEE_THROUGH_FEATURES`, `CanSee = true`. A
    BOOLEAN over a published table: `SightThroughModifier` costs 1 more per
    Woods, Rainforest or Hill and 2 per Mountain or great natural wonder,
    and `SightModifier` pays +1 standing on Hills, +2 on a Mountain. Both
    engines reveal a flat radius today. The TABLE is data; what the install
    does not publish is the WALK — a sight BUDGET spent along the path, or a
    radius with occlusion behind a blocker. Ask 16.
  - GROUND_CREWS — `GROUND_CREWS_BONUS_HEALTH`,
    `MODIFIER_PLAYER_UNIT_GRANT_HEAL_AFTER_ACTION`, and NO amount: the
    modifier type is the whole rule, so the engine's own healing supplies the
    number. PATROL turns out to be no data row at all (C-34).
  - BOARDING SHIPPED with #242n. PercentDefeatedStrength 100, YIELD_GOLD,
    against an opponent of DOMAIN_SEA. It was never a missing mechanic — but
    it was not the seat-level POST_COMBAT_YIELD_ROWS channel either, because
    the promotion belongs to the KILLING UNIT. It became a NAVAL_KILL_GOLD
    promotion kind read at the kill event, which taught the GPU's
    `_unit_kill_event` the killer's promo word: four of its eight call sites
    already held it for the `_disciples_spread` standing right beside them,
    and the other four are a city's shot or a nuke, where TS passes no killer
    either.
- **B-61r. GREAT PERSON CLAUSES WITH NO CARRIER.** Weight 2.
  - Ten `open: B-61r` rows in `docs/roster_ledger.json`: tourism x4,
    regional range x2, city-state absorption, barbarian conversion, ocean
    passage, Tupac Amaru's per-district grant walk.
- **B-62r. A SUZERAIN IMPROVEMENT'S ADJACENCY AT A WONDER TILE.** Weight 0.
  CLOSED 2026-09-08 on the install: the case is UNREACHABLE, so the early
  return cannot be observed as wrong.
  - `tileYields` leaves on a NATURAL wonder before the adjacency add and
    `_tile_add_live` masks the same tiles. For that to be a fidelity
    question an improvement would have to stand on such a plot.
  - It cannot. All 34 feature rows carrying `NaturalWonder="true"` were
    checked across Base and both expansions: NOT ONE carries
    `Removable="true"`, so the feature can never be cleared; and
    `Improvement_ValidFeatures` over the whole install names exactly eight
    features — Floodplains (three rows), Forest, Geothermal Fissure, Jungle,
    Marsh and Volcanic Soil — none of which is a natural wonder.
  - So no improvement is buildable on a natural wonder plot in real Civ 6,
    and an improvement-adjacency add there is a term the game never pays.
- **B-63r. THE GANG-UP BAR.** RETIRED 2026-09-08 (owner ruling).
  - `GRIEVANCE_GANG` was filed as an ask on the reading that it reproduces a
    Civ 6 AI threshold. It does not: it has exactly ONE reader per engine and
    that reader is the OBSERVATION renderer (`observe.ts` / `env.py`, the
    `cv` block's `gang` field), consumed only by this project's own driver
    heuristic. No engine rule reads it and no state moves on it, so there is
    no fidelity question to source. It stays on the wire because the
    observation must be identical on both engines — a parity requirement the
    value cannot break.
  - Enkidu's allied-war discount, which this entry wrongly said waited on the
    bar, SHIPPED with #242j: `Discount` 150 forgiven at a declaration on a
    foe of the declarer's ally.
  - NOT converted into a new ask, recorded instead: `gang` is the only
    grievance signal anywhere in the observation, so one hand-set bar is the
    whole resolution the policy gets on a subsystem with fourteen sourced
    magnitudes feeding it. Whether to hand it `grievancesAgainst / SCALE` is
    a P8 feature-design choice.

- **B-66. FORMATIONS.** Weight 1.
  - THE SUPPORT STACKING CLASS SHIPPED with #246o. `Units.xml` types nine
    chassis `FormationClass="FORMATION_CLASS_SUPPORT"` — the Battering Ram,
    the Siege Tower, the Military Engineer, the Medic, the Observation
    Balloon, the Anti-Air Gun, the Mobile SAM, the Drone and the Supply
    Convoy — and this engine read every one of them as a CIVILIAN, so a Ram
    and a Settler could not share a plot and a formation could never hold
    three. It is now a stacking slot of its own on both engines, with a
    fourth occupancy plane beside `military_at` / `civilian_at` /
    `embarked_at` and its own arm in the stacking rule.
  - THE SPLIT IS NARROW ON PURPOSE. Every OTHER rule that asked "is this a
    civilian" and meant "not a fighter" keeps its old answer through
    `unitIsNoncombat`, which names the set the domain used to name — the
    embark tech, the spent-charge disband and the disaster's civilian toll
    among them. A new class invalidates every predicate that said one word
    and meant another, and the only honest fix is to name the set they meant.
  - TWO THINGS THE SPLIT BROKE AND THE BAR CAUGHT: the anti-air cover scan
    skipped any slot outside its three-name list, so the two anti-air chassis
    stopped answering strikes the moment they left the civilian slot; and the
    census's unit KEY was `tile * 3 + class`, which a fourth class makes
    ambiguous — a civilian and a support unit on one tile would have merged
    into a single compared row. Both are fixed and the key is `* 4`.
  - WHAT REMAINS is the DRAG: TS forms with one rider per class and carries
    them all, while the GPU still drags ONE rider per step (civilian, then
    support, then a passenger at sea). A three-member formation FORMS on both
    engines and stacks on both; only the multi-rider step is outstanding.
  - THE RIDER'S FOG SHIPPED with #246a. Sight belongs to a UNIT and a
    formation's members stand on one tile, so the circle both engines draw is
    the WIDEST member's — which is the whole reason a formation carries an
    Observation Balloon or a Drone. Both chassis had sat at the default sight
    of 2; the install gives them `BaseSightRange` 3 and 5.
  - The install gives the Drone and the Supply Convoy NO `Maintenance` at
    all, where this engine charges 3 and 2. Two named magnitudes for the
    sourcing pass, not changed here.
- **B-67. THE DISTRICT PRICE PROGRESSION.** Weight 1. A 2026-09-08 sourcing
  pass found this entry half wrong: one of the two models is not DLL at all,
  and this engine already implements it — for PROJECTS.
  - `Districts.xml` publishes the model AND its parameter on every row.
    `COST_PROGRESSION_GAME_PROGRESS` with `CostProgressionParam1="1000"` runs
    on exactly six: the Aqueduct (Cost 36), the Bath (18), the Neighborhood
    (54), the Mbanza (27), the Canal (81) and the Dam (81).
    `COST_PROGRESSION_NUM_UNDER_AVG_PLUS_TECH` runs on every other specialty
    district, `Param1` 40 — except the Diplomatic Quarter and the Government
    Plaza at 25.
  - THE 40/25 ALREADY SHIPS, under another name: it is exactly this engine's
    `districtDiscountPct`, the under-represented discount both cost composers
    apply. So NUM_UNDER_AVG_PLUS_TECH's parameter was never unsourced; only
    the shape around it is a stylization.
  - GAME_PROGRESS IS ALREADY IMPLEMENTED, in `projectCost` — the Cothon's
    `costProgressGame` 1500 is that model, and its body is
    `base + floor(round(Param1 x GAME_SPEED) x progress)` where progress is
    the larger of the tech and civic shares, the same reading
    `districtCostIn` takes. Six district rows carrying a `costProgressGame`
    of 1000 and one branch in the two cost composers is the whole build; the
    Bath and the Mbanza are variants and ride their base's model with their
    own cost. BUILDABLE, and the only reason it did not land in this round's
    batches is that it arrived after the fourth commit, with a battery
    already running.
- **B-D. UNSOURCED DATA VALUES.** Weight 2.
  - DEMOCRACY'S ROUTE PAYS ONLY ITS OWN CITY. SOURCED (GS): "Your Trade
    Routes to an Ally or Suzerain's city provide +4 Food and +4 Production
    for BOTH CITIES." The ORIGIN half ships on both engines, and so does the
    extra quarter-point a turn; the DESTINATION's half pays another seat's
    city, and no channel here pays a foreign city for an incoming route.
  - THE PER-CITY WAR-WEARINESS SPLIT: the install's numbers are
    `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, FOUNDED_CITY 0,
    NONFOUNDED_CITY 1}`, `_POINTS_FOR_AMENITY_LOSS 400`,
    `_PER_COMBAT_IN_{ALLIED 1, FOREIGN 2}_LANDS`, `_PER_UNIT_KILLED 3`,
    `_PER_WMD_LAUNCHED 10`, `_DECAY_{PEACE_DECLARED 2000, TURN_AT_PEACE 200,
    TURN_AT_WAR 50}`, `_WARMONGER_BASE 16`; how the per-city rows compose is
    DLL. The empire-wide rule ships (`warWearinessPenalty`).
  - `GAME_SPEED` 0.6 is a SHAPE difference: real Civ 6 scales cost, yield
    and turn tables independently.
  - THE FAITH RATE FOR A LAND COMBAT UNIT is inferred from the building
    rate (`FAITH_PURCHASE_MULT`, reused by `unitFaithCost` /
    `_seat_faith_unit_candidate`); no page states the unit one.
  - The BELIEF magnitudes (`religion` header) and the tuning constants in
    `seats` (its header names them) are stylizations no source closes.
  - Oligarchy and Classical Republic are adopted in NO game
    (`computeAdoption` / `_adopted_gov` take the newest tier); their rows
    are held by the two government lanes' borrowed-row drills only.

## C. Absent systems — the blockers, and the gaps waiting on them

- **C-1. POWER.** Weight 2.
  - THE ACCIDENT ROLL. SOURCED `Expansion2_RandomEvents.xml`:
    `RANDOM_EVENT_NUCLEAR_ACCIDENT_{MINOR,MAJOR,CATASTROPHIC}`, Severity
    0/1/2, `MinTurnAtRisk` 10/20/30 (the reactor age each opens at),
    `OccurrencesPerGame` 1 apiece at MODERATE; `RandomEvent_Damages`: MINOR
    improvement pillaged 10%, building pillaged 20%, radiation 100% for 2
    turns; MAJOR civilians killed 50%, improvement pillaged 40%, district
    pillaged 50%, buildings pillaged 100%, radiation 10 turns, land/naval
    units 50% @ 20-50 HP, garrison 50% @ 20-50; CATASTROPHIC improvement
    pillaged 100%, buildings DESTROYED 100%, district pillaged 100%,
    population -80%, radiation 20 turns, units 100% @ 20-50, garrison 100%
    @ 20-50, civilians 100%. The age SCALING is DLL. The clock ships
    (`City.reactorAge` / `city_reactor_age`); the roll waits on ask 5.
  - A CITY-STATE'S CITIES ARE NEVER POWERED: `resolveSeatPower` /
    `_resolve_seat_power` run for majors only. Vacuous today (nothing in
    `minorLadder` draws or supplies Power, pinned by
    `minor_yields_test::test_power_vacuous`); due when C-38's ladder
    reaches a building with a load.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 2.
  - WHAT A MID-BUILD PURCHASE DOES TO THE HAMMERS. The queue-front sale
    itself ships (`goldPurchasableBuildings` drops the queue term;
    `dropQueuedBuilding` banks the progress and closes the entry). The one
    tested report found (steamcommunity.com/app/289070/discussions/0/
    1848072002747657088) says a UNIT keeps its progress and a BUILDING's is
    WASTED — which contradicts this engine's standing rule that hammers
    never burn, on one forum post. Both engines BANK; the disposition is an
    ask.
  - JOIN ONGOING WAR SHIPPED with #242k, as a WAR KIND rather than an
    agreement: `DIPLOACTION_THIRD_PARTY_WAR` publishes every column a kind
    needs (`InitiatorPrereqCivic` CIVIC_FOREIGN_TRADE, no
    `DenouncementTurnsRequired`, 100 / 100 / 300), and `Agreement="true"`
    says how the UI reaches it, not what it costs.
  - JOINT WAR is the same row column for column; the only thing separating
    them is that its target is not yet at war, which needs a TWO-SIDED
    agreement object the deal table does not carry. `DEAL_ITEM_KINDS` has no
    war item; a joint war is one seat's offer that binds the other's
    declaration next turn, so the item has to survive a turn boundary and
    apply to a seat that did not choose it.
  - RESEARCH AGREEMENT: the GATE is published and the PAYOUT is not.
    `InitiatorPrereqTech` and `TargetPrereqTech` are both
    TECH_SCIENTIFIC_THEORY, `NoCurrentResearchAgreement` makes it one live
    agreement per pair, and Worth/Cost rows exist ONLY at DIPLO_STATE_ALLIED
    (40) and DIPLO_STATE_DECLARED_FRIEND (20) — so the state floor is data,
    not lore. What no row anywhere carries is how much science it pays or
    how long it runs; `Duration` is absent from the row.
  - ASK-FOR-PROMISE waits on C-76.
  - A LUXURY HAS NO LUMP TO TRADE: a luxury is a boolean access gate; the
    RESOURCE item names a strategic only. This is a MODEL choice, not a
    missing datum — the install trades the resource and its ACCESS, never an
    amount of a luxury, so there is nothing to source and the entry keeps it
    only as a note.
  - A MISSION LEAVES NO MARK ("a small positive bonus in your
    relationship"), DEMAND and DISCUSS (the four promises of
    `Expansion2_DiplomaticActions.xml`, FavorCost 30, GrievancesForRefusal
    25, GrievancesPerIncursion 25) and the WAR OF RETRIBUTION's
    RequiresBrokenPromise all wait on C-76.
  - Readings with no source, identical on both engines: the intel bonus is
    unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS`
    a side, an offer standing two turns; a war does not end a standing deal;
    and the Third Party War's "another player" read as an ALLY, because
    consent is what `Agreement="true"` means and an alliance is the only
    relationship this engine holds that says "would agree with me" — the
    install itself attaches the ally relationship to this situation when it
    writes Enkidu's trait as "anyone at war with their allies".
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  - WHAT A LEVEL IS WORTH. The install's UnitOperations rows publish
    `BaseProbability` (13 Siphon Funds, Foment Unrest, Fabricate Scandal;
    14 Sabotage Production, Steal Tech Boost, Neutralize Governor; 15 Great
    Work Heist, Disrupt Rocketry, Breach Dam; 16 Recruit Partisans),
    `LevelProbChange` 1, `EnemyProbChange` 3, `EnemyLevelProbChange` 1.
    The exact question: how do the four compose into the chassis page's
    56/35/20/10, and which is the counterspy's catch?
    `SPY_SUCCESS_PER_LEVEL_PCT`, `SPY_CAPTURE_PCT` and `SPY_ESCAPE_ROUTES`'
    base rates are the model values a published composition replaces.
  - ONE ROW BREAKS THE PATTERN, and a 2026-09-08 re-read of the table found
    it: FABRICATE_SCANDAL carries `BaseProbability` and `LevelProbChange`
    and NO counterspy columns at all — no `EnemyProbChange`, no
    `EnemyLevelProbChange` — and runs 16 turns where every other offensive
    mission runs 8. Whatever the DLL's composition is, the enemy terms do
    not enter that mission's, which is a real constraint on any guess: a
    composition that always subtracts them cannot be right.
  - THE ESCAPE'S TERMS ARE SOURCED, ITS SCALE IS NOT — a 2026-09-08 pass.
    `GlobalParameters` publishes the whole term list and every term is a
    LEVEL: `ESPIONAGE_ESCAPE_BASE_CHANCE` 10, `_LEVEL_BOOST` +1 per spy
    level, `_COUNTERSPY_LEVEL_MODIFIER` -1 per counterspy level,
    `_POLICE_CORRECT_MODIFIER` -4, `ESPIONAGE_MAX_LEVEL` 4,
    `ESPIONAGE_BONUS_GAIN_SOURCES` 2 and `_GAIN_SOURCES_DURATION_MULTIPLIER`
    3. The three spy promotions all ship at the install's sizes: Ace Driver
    `MODIFIER_PLAYER_UNIT_ESCAPE_BOOST` 4, Quartermaster
    `MODIFIER_PLAYER_UNIT_BOOST_ALL_SPIES` 1, Seduction
    `MODIFIER_PLAYER_UNIT_ADJUST_SPY_OPERATION_CHANCE` 2 defensive.
    What is missing is the SCALE and the ROUTE: read as percent, a base of 10
    makes escape nearly impossible, and this engine's base is per route
    (Airplane 40 / Boat 50 / Vehicle 60 / Foot 70) where the install has one
    base and no route term at all. Ask 15.
  - A FREE CITY IS NOBODY'S TO SPY ON: both engines walk the major rows for
    a spy's ground, and the install carries no data gate to say whether that
    is right — ask 11.
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1. A 2026-09-08
  pass says this one will stay unsourced, and says so from the row rather
  than from an absence of searching.
  - The pedia's "Trade Routes traveling through it can multiply the Gold they
    get from districts at their destination" has exactly one XML carrier:
    `IMPROVEMENT_MOUNTAIN_TUNNEL` names ONE modifier, `MOUNTAIN_PORTAL`, of
    type `MODIFIER_MOUNTAIN_PORTAL` — and that modifier row has NO ARGUMENTS
    AT ALL. There is no `Amount` to read, in any layer. The multiplier lives
    wholly inside the DLL's handler for that modifier type.
  - Not "unpublished pending a look": looked at, and the row carries no
    number to find. The same finding shape as `PLUNDER_ROUTE_GOLD`.
  - The tunnel's OTHER columns are all published and worth checking against
    the catalog separately: `AllowImpassableMovement`, `BuildOnAdjacentPlot`,
    `DisasterResistant`, `CanBuildOutsideTerritory`, `PrereqTech`
    TECH_CHEMISTRY, and a build unit of UNIT_MILITARY_ENGINEER rather than
    the Builder.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published
    ceiling at Breathtaking; the middle bands are this model's own.
  - UNREACHABLE FROM THE OWNER'S INSTALL, which is Gathering Storm: the
    Preserve is a New Frontier Pass district and no `PRESERVE` row exists in
    Base, Expansion1 or Expansion2. This is not "unpublished" — it is a row
    the primary source does not contain, which no further sourcing can fix.
    The same is true of the Ngao Mbeba (no `MBEBA` anywhere in the install),
    so a sweep of which roster members this install cannot source belongs
    with the hygiene pass.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/ROSTER.md`, refreshed against the ledger on 2026-09-08;
  the ledger `docs/roster_ledger.json` reads `shipped` on 338 of 343 modifiers
  and `open: <item>` on 5, each under C-64 or C-67. Unique units are C-78,
  unique infrastructure C-79 and C-69.
  - THE AGENDAS — DLL-scored against an opinion scale neither engine has
    (C-76).
  - UNREAD DLL LOGIC, recorded: whether Trajan's grant fires on a CONQUERED
    city (founding ships); whether Iteru's flood avoid also skips the
    fertility half; whether the Knarr's Ocean clause reaches a Trader's
    course (`tradeWaterLevel` stays Cartography-gated); the Great Turkish
    Bombard's strike on a city.
  - THE ROCK BAND's four venue clauses (`Expansion2_UnitPromotions.xml`:
    Arena Rock / Street Carnival, Reggae Rock / Copacabana, Glam Rock /
    Acropolis, Surf Band / Royal Navy Dockyard) — all four venues are built
    now; what is left is reading the promotion's own venue bit.
  - The engine has no resource VISIBILITY, so the Stave Church counts every
    coastal resource where the install counts the visible ones.
  - The site census (`tests/cpu/seats/combat-rows.test.ts`,
    `tests/gpu/combat_rows_test.py`) allowlists one unpaid site: a CITY's
    own ranged strike composes its defender without the roster's rows
    (`cityStrikeStrength`'s block in `seatPhase`).
- **C-31. THE NUCLEAR STRIKE'S LAST CLAUSES.** Weight 1.
  - WHICH DELIVERY A COVER STOPS. The page's own rule ships — "Destroyers,
    Battleships, Missile Cruisers, and Mobile SAMs can protect adjacent
    tiles from nuclear strikes", deterministically, the device spent either
    way (`nukeInterceptor` / `_nuke_intercepted`). What the community tests
    add and no published text carries is the per-DELIVERY split (a silo
    answering to the Gun AA, the Battleship and the SAM; a submarine to the
    SAM alone) and the BOMBER's own threshold, its drop stopped when the
    interception takes it under 50% HP — which needs the interception
    DAMAGE the install never publishes (C-34). Until that is sourced the
    page's list answers every delivery alike.
  - THE CITIZENS A BLAST KILLS: buildable — C-77 exposed the pick, so
    `city.workedTiles` / `_worked_tiles(row)` now name who is standing in
    the blast. What is unsourced is HOW MANY die per ring, which is ask 6's
    neighbour.
  - A WONDER IN THE BLAST — ask 6.
- **C-33. THE GIANT DEATH ROBOT'S RANGE.** CLOSED 2026-09-08 — the entry was
  false twice over, and the install says so in one row.
  - `UNIT_GIANT_DEATH_ROBOT` carries `Range="3"`, not five, and this engine
    has carried 3 since the chassis landed. The only five-hex GDR range
    anywhere in the install is `PROMOTION_GDR_ATTACK_RANGE`, which exists in
    exactly one place: `DLC/CivRoyaleScenario/`. Scenario paths are excluded
    from sourcing by standing rule, so it was never a row this engine owed.
  - Nor is range 3 out of the action space's reach: the Bombard, the Rocket
    Artillery, the Machine Gun and the GDR itself all fire at 3 today, and
    the attack verb names a TILE rather than a direction, so the reach is the
    range and nothing about the encoding bounds it.
  - The lesson is the one this round has now paid for four times: a
    self-declared gap is a claim like any other, and this one had never been
    checked against a row.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2.
  A 2026-09-08 sourcing pass split this entry: four of its five items are
  data and only the interception ROLL is DLL.
  - THREE OF THE FOUR ALREADY SHIPPED, and an earlier draft of this entry
    said otherwise — the sourcing pass called them "buildable" without
    checking the catalog. `cpu/data/promotions.ts` has carried DOGFIGHTING +7
    vs AIR_FIGHTER, INTERCEPTOR +7 vs AIR_BOMBER and DROP_TANKS RANGE +2
    since the air trees landed, and all three match the install exactly. Read
    the catalog before calling a row absent.
  - AIR DEFENSE INITIATIVE SHIPPED with #242o: Victor's, level 3 behind
    Embrasure, +25 to an ANTI-AIR unit defending inside the governed city's
    territory. No new machinery — the anti-air strength already answers an
    air strike, and the territory test is Garrison Commander's.
  - INTERCEPTION BY A FIGHTER has no published strength, formula or cap on
    attempts; C-31's delivery shares the half.
  - PATROL IS NOT A DATA ROW. There is no `UNITOPERATION_PATROL`, no
    `UNITCOMMAND_PATROL` and no promotion named for it; the air operations
    are `AIR_ATTACK`, `REBASE` and the repair family. It is the UI's name for
    a fighter sitting ready, so the verb an engine would need is an INTERCEPT
    STANCE whose whole behaviour is the unpublished roll above.
  - PRIORITY TARGET IS A COMMAND WITH NO DATA. No PROMOTION of that name
    exists, and an earlier draft stopped there; a 2026-09-08 pass found the
    row it does have. `Expansion1_UnitCommands.xml` carries a Types row
    `UNITCOMMAND_PRIORITY_TARGET` and one `UnitCommands` row —
    `CategoryInUI="ATTACK"`, `InterfaceMode="INTERFACEMODE_PRIORITY_TARGET"`,
    an icon — and the text row is the bare label "Priority Target". No
    argument, no requirement set, no magnitude anywhere in Base or either
    expansion. Every term of it is DLL, and it is the one item on this entry
    that no ruling could make buildable from the install.
- **C-35. THE DROWNED GROUND IS COAST.** CLOSED.
  - SOURCED (the install's pedia, Sea Level Rise): submerged tiles "become
    coastal water tiles". Both engines keep terrain, feature and river edges
    underneath on purpose, so the mask is at the READ: `ringTerrain` and
    `ringFeature` on TS, `~tile_submerged` on the GPU's source counters. A
    drowned tile now lends the SEA's sources and none of the ground's — the
    same reasoning `submergeTile` already applied to the RESOURCE.
  - The ring both ways: a drowned tile IS coastal water while it still
    touches land, and every land neighbour of it becomes coastal land, with
    the water Housing that carries.
  - The Aqueduct's source was a BAKED derivation of a fact the sea can move
    (a drowned oasis). The atom it is made of (`aqown`) is exported beside
    it, both are `_MUTABLE` now, and the derivation is REBUILT over the ring
    rather than left stale — TS recomputes on every read, so only the GPU
    could go stale, and the climate poke pins the rebuild.
- **C-38. A CITY-STATE'S CITY.** Weight 1.
  Its yields ride the shared walk, and now so do the two rules that walk
  feeds.
  - FOOD AND CULTURE ARE IN. The install has ONE city rule, so the minor's
    city grows on its FOOD BOX and claims ground on its CULTURE BOX through
    the majors' own composers (`seatGrowth`, `cityBorderGrowth` /
    `_seat_city_growth`, `_seat_border_growth`). The 12-turn population clock
    is gone from both engines, and the minor's population and three boxes are
    compared state.
  - GOLD AND FAITH still only bank in `CityState.treasury` / `.faith`.
    `GlobalParameters.xml` holds five MINOR knobs and every one is PLACEMENT
    (`START_DISTANCE_*`, `WARMONGER_FINAL_MINOR_CITY_MULTIPLIER`); there is no
    city-state economy parameter of any kind, so what it spends them on is
    DLL AI with no data behind it — ask 10.
  - POWER: C-1's minor arm, due when the ladder reaches a load.
  - Foreign Investor and Affluence (B-24r) wait on a minor that improves and
    accumulates.
- **C-41. VOLCANIC SOIL.** Weight 1.
  - WHERE an eruption lays it — ask 1. The carrier (`addFeature` /
    `_add_feature`) is in.
- **C-45. THE QUEUE'S DEPTH.** CLOSED 2026-09-08 (owner ruling).
  - The queue is ONE deep: the "queue" is the current build.
  - The depth was never a mechanic. Only the HEAD accrued — every
    `progress +=` in the engine reads slot 0 — so an entry behind it held an
    id and a permanent zero. What makes hammers survive a switch is the
    per-item ledger and the city's own bank, both independent of depth.
  - What the slots DID cost was an action head nothing could use: Q-1 promote
    columns per city, legal every turn, asking for "bring entry k forward"
    while the per-city observation showed only the head's progress and a
    "something is queued" bit. The driver reached them with a 6% dice roll
    whose comment said they were "legal every turn and chosen never".
  - Removed with the depth: the promote block from both layouts, both
    appliers, `_q_promote`, the driver's reorder fuzz and its share knob.
- **C-49. NAMED STORMS.** Weight 1.
  - THE HEADING IS NOT DLL, and this entry said it was. A 2026-09-08 sourcing
    pass found `<PrevailingWinds>` in `Expansion2_RandomEvents.xml`: 22 rows
    giving a WEIGHTED direction per latitude band —

        lat  60..90    NW 1   W 2   SW 2      lat -30..-5    NW 1   W 2   SW 2
        lat  30..60    NE 2   E 2   SE 1      lat -60..-30   NE 1   E 2   SE 2
        lat   5..30    NW 2   W 2   SW 1      lat -90..-60   NW 2   W 2   SW 1
        lat   0..5     NW 1   W 1             lat  -5..0     W 1    SW 1

    and the map already carries the latitude they key on: `mapgen`'s
    `latOf(row) = (row - half) / half`, a signed degree at `latOf x 90`.
  - WHAT IS STILL UNSOURCED is the SPEED. Every storm row carries
    `Movement="8" Duration="3" Spacing="15"` beside its `Hexes` footprint
    (1, 3, 7, 19 — the centred hex counts), and nothing says what 8 counts.
    That is ask 17, and it is the whole of what stands between this row and
    a built walk.
  - A SEQUENCING NOTE, not a reason to defer indefinitely: a weighted
    direction draw per storm per turn is a NEW RNG CONSUMER, which reds
    fixtures across several classes with no engine bug behind it. It belongs
    in a batch of its own, after the open serve-gate hunt closes, so a
    reseed cannot be mistaken for the divergence being hunted.
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 1.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open
  to attack, and since #242i the religion walk). NOTHING BUILDABLE REMAINS —
  both bullets are owner rulings, with no magnitude either engine could
  invent:
  - ITS DEFENCE — ask 14. Today: floor-15 defence plus the walls it
    revolted with, healing 20 a turn.
  - ITS AMENITIES — ask 13.
- **C-64. A SEAT HAS NO MAJORITY RELIGION.** Weight 1.
  - Three ledger rows wait (`TRAIT_CITY_STATE_TOKEN_SAME_RELIGION`,
    `TRAIT_COMBAT_BONUS_OTHER_RELIGION`,
    `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION`). The carrier is a
    per-seat majority over its cities' followed religions on both engines;
    the tie rule is ask 4.
- **C-67. A DIPLOMATIC ACTION HAS NO PREFERENCE WEIGHT.** Weight 1.
  - `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
    `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` are DLL AI weightings; a
    preference needs a decider with alternatives — P8's, not a carrier's.
- **C-69. TWO UNIQUE ROWS WITH TRAIT CLAUSES.** CLOSED.
  - Every row is built. The three DISTRICTS — Kongo's M'banza with its free
    Apostle, England's Royal Navy Dockyard with the strongest hull the seat
    can train, Phoenicia's Cothon — then Georgia's Tsikhe (whose +50%
    Production is Strength in Unity's own RENAISSANCE_WALLS row, since the
    Tsikhe IS that building here) and Spain's Mission (+2 Loyalty to a city
    beside one, off the capital's continent).
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - `ERUPTION_CHANCE_PER_VOLCANO` is not covered by the MODERATE / 500
    ruling: the install counts eruptions per GAME, this engine rolls per
    VOLCANO; C-1's reactor is the same shape. Ask 7.
- **C-76. NO OPINION SCALE BETWEEN MAJORS.** Weight 2.
  - THE ANCHORS, in full (Base `DiplomaticActions.xml`, `DiplomaticStates`).
    A second published column the entry had not recorded rides beside the
    scale:

        state              RelationshipLevel   DiplomaticYieldBonus
        ALLIED                    100                   50
        DECLARED_FRIEND            83                   25
        FRIENDLY                   66                   25
        NEUTRAL                    50                    0
        UNFRIENDLY                 33                  -25
        DENOUNCED                  16                  -75
        WAR                         0                 -100

    This engine already holds four of the seven as explicit facts — WAR,
    DENOUNCED, DECLARED_FRIEND and ALLIED. FRIENDLY, NEUTRAL and UNFRIENDLY
    are exactly the bands an OPINION lands in, which is why they do not
    exist here.
  - THE CARRIER IS NOT SEPARABLE FROM THE DELTAS (2026-09-08). A per-pair
    opinion built now would be initialised at NEUTRAL 50 and never move, so
    it would be a compared plane holding a constant and three unreachable
    bands — dead state, not a carrier. Both halves land together or neither
    does, so C-76 is BLOCKED on ask 7 rather than half-buildable.
  - What `DiplomaticYieldBonus` is paid IN is not published either; the
    column sits on the state row and the leaders' own
    `MODIFIER_PLAYER_ADD_DIPLOMATIC_YIELD_MODIFIER` is a separate channel.
  - Waiting on it: the mission's mark, DEMAND, DISCUSS and its promises,
    the Retribution casus belli (C-2); the agendas (C-26); the preference
    weights (C-67).
- **C-78. UNIQUE UNITS ABSENT.** Weight 1.
  - Every one of the 34 civilizations names a unique chassis now — 31 rows
    with their abilities and pins on both engines. What is left is the nine
    LEADER units (Rough Rider, Black Army, ...), the blank rows of
    `docs/ROSTER.md`.
  - One half of a built row waits on another entry: the Ngao Mbeba's "can see
    through features" needs the sight-BLOCKING this engine does not model
    (B-56r). The Toa's Pā shipped with C-79.
- **C-79. UNIQUE INFRASTRUCTURE ABSENT.** Weight 1.
  - EVERY ROW IS BUILT. Twelve DISTRICTS, each a `civVariants` entry on the
    row it replaces with its own adjacency set and half its price (Acropolis,
    Hansa, Seowon, Suguba, Lavra, Ikanda, M'banza, Royal Navy Dockyard,
    Cothon, Street Carnival, Bath, Copacabana); nine BUILDINGS merged over
    their base rows by one composer per engine (Film Studio, Madrasa,
    Electronics Factory, Ordu, Tsikhe, Grand Bazaar, Marae, Thermal Bath,
    Stave Church); and twelve IMPROVEMENTS with their placement columns and
    adjacency rows (Château, Chemamull, Golf Course, Great Wall, Ice Hockey
    Rink, Kurgan, Pā, Mekewap, Mission, Open-Air Museum, Polder, Stepwell),
    beside the Sphinx, Terrace Farm and Ziggurat already in.
  - FOUR CLAUSES HAVE NO CARRIER IN THIS ENGINE, and each is recorded on the
    column that names it rather than invented:
    - the Great Wall's and the Pā's `PLOT_DAMAGE_TO_WALKING_INTO` /
      `_ADJACENT` (10 each) — damage on ENTERING a tile is unit-movement
      machinery this engine does not have, and no chapter owns it yet;
    - the Film Studio's "+100% Tourism pressure ... towards other
      civilizations in the Modern era" — a per-PAIR tourism pressure;
    - the Electronics Factory's "+4 Culture after Electricity" — a
      TECH-gated building yield the catalog has no column for, and the
      Marae's and the Thermal Bath's per-tile Tourism thirds with it;
    - "Tiles with <row> cannot be swapped" (Golf Course, Open-Air Museum) —
      there is no tile-swap verb to refuse.
  - The Stepwell's "+1 Faith beside a Holy Site, +1 Food beside a Farm" has
    NO `Improvement_Adjacencies` row in the install: both halves are
    DLL-side, so they are recorded rather than invented.
  - LEY LINE adjacency is out of scope by construction: it is a Secret
    Societies resource class this engine's map never places, so every
    `LeyLine_*` row on a unique district is unreachable.

## Harness — not weighted

- **THE DRIVER NEEDS A REAL STYLE MECHANISM.** A style is one boolean read
  at a single `if` inside `pick_research`. Wanted: NAMED KNOBS whose
  defaults reproduce today's picks exactly (research depth, production tier
  order, war appetite, expansion appetite, faith/culture lean, naval lean);
  PRESETS built from the knobs, assignable per actor as data; an assignment
  policy off the per-(seed, seat) stream or a table; CLI selection on the
  probe and the gate. The bar is the probe diff: a preset earns its place by
  ADDING reached rows without losing any. B-24r's fourth card style is the
  first customer.
