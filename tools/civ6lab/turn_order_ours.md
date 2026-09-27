# Our engines' turn order

Read from `cpu/core/game.ts` `endTurn`, `cpu/core/phase.ts` `seatPhase`, and the
GPU twin `gpu/core/sim_step.py` `SimStep.step` / `gpu/core/sim_phase.py`
`SimPhase._seat_phase`, `_seat_turn`. The two engines run the same sequence
step for step; the GPU symbol is given where it differs in name.

One call of `endTurn(state)` (GPU `step()`) is one game turn. The driver
(`policy/`) decides every seat's record for the turn from the observation
taken before the call; the record is applied inside the seat's block (step 5).

## The sequence

1. **Units: heal, fortify, movement refresh, fallout** (`refreshUnits`,
   `units.ts`; GPU the `units_mode` block at the top of `step`). Every unit of
   every owner, in `state.units` order: heals if it spent no movement since the
   last refresh (+20 friendly city, +15 own ground, +10 neutral, +5 foreign;
   the modifiers), fortify counter, `movesLeft`/`movesFull` reset, attacks
   reset, then 50 fallout damage.
2. **Barbarians** (`barbarianPhase`, `combat.ts`; GPU `_barbarian_phase`):
   barbarian moves reset, camp spawn roll, regarrison / raid spawns, the
   barbarian walk and attacks.
3. **Disasters and random events** (`disasterPhase`, `disasters.ts`; GPU
   `_disaster_phase`), when `state.disasters`: drought and fallout timers tick,
   `wakeVolcanoes`, `randomEvent` (one event per turn, from
   `RANDOM_EVENT_START_TURN`), `fireTurn`, then every live storm walks and
   strikes (`stormWalk`, `stormTurn`), then the aid request.
4. **City-states** (`cityStatePhase` — the city-state centre heals +10 — then
   `minorPhase`, `minorBuild.ts`; GPU `_city_state_phase`), each minor in
   array order: levy return, army-loss stamp, power, `minorAccrue` (yields,
   gold, upkeep, `bankruptcy`, science/culture/faith, growth, border growth),
   `minorResearch`, plan, upgrades, purchases, builders, trade, `minorBuild`
   (production), city strikes, `minorWalk` (its units move).
5. **Majors** (`seatPhase`, `phase.ts`; GPU `_seat_phase`):
   1. every major's unit movement is reset again with the general's aura frozen
      (GPU `_refresh_aura_mp`, `_reset_mp("major")`);
   2. `dealPhase` (standing deals pay, clocks, stale offers), then the
      diplomacy arms for ALL seats in seat order: denounce, friendship,
      alliance, delegation/embassy, open borders, gifts, deal offers, deal
      accepts, promises (GPU `_deal_phase`, `_geo_agreements`);
   3. then each seat in `state.seats` order (seat 0..n-1; GPU `_seat_turn(row)`):
      1. a city-less seat banks its pre-settle yields and walks its units only;
      2. `accrueStockpiles`, `chargeUnitUpkeep` (strategic resources),
         `resolveSeatPower`;
      3. `governorPhase` (titles, placements, establishment clocks);
      4. `resolveSuzerains`; `tickSpies`, `tickSpyEffects`; relic reserve;
         `warWearinessTurn`; `detectBoosts` (Eurekas / Inspirations);
      5. city-states met by exploration; influence points banked and converted
         to envoys; city-state quests resolved / issued;
      6. **the record** (`applySeatActionRecord`; GPU `_seat_record_apply`):
         production / research / civic picks, government, policies, beliefs,
         districts, and the rest of the non-unit verbs;
      7. the gold purchase (one per turn), the faith purchases, the missile
         silo launch, the levy, the trade-route walk / new route / expiry
         (GPU `_seat_buy_ladder`, `_seat_trade_phase`);
      8. `computeCityStats` for every city ONCE, before the walk (the
         loop-top snapshot every step below reads; GPU `_seat_city_stats`);
      9. **the city walk**, each city in `actor.cities` order (a snapshot; a
         city founded this turn does not act):
         `applyLoyalty` (loyalty delta; a city at 0 is marked to flip) →
         yields summed into the seat's gold / faith / science / culture →
         `seatGrowth` (food box, growth or starvation) → production added to
         the queue head, **one completion** (`completeQueueItem`), overflow →
         `cityBorderGrowth` → `cityStrikes` → city heal +20 and Encampment heal
         (GPU `_seat_city_loyalty`, `_seat_city_growth`,
         `_seat_city_produce`, `_seat_border_growth`,
         `_seat_city_fire_and_heal`);
      10. the marked cities flip (`flipCity`; GPU `_seat_loyalty_flips`);
      11. alliance route yields, foreign-follower yields, ally percentages;
          **science banked, techs complete** (`effectiveResearchCostIn`
          loop); **culture banked**; gold banked; faith banked;
          `seatAccumulators` (tourism, diplomatic favor, grievances); **unit
          gold upkeep** and WMD upkeep charged; **`bankruptcy`** (shortfall,
          clamp, disbands); technology unit grants spawn; **civics complete**;
          government held / policies carried (GPU `_seat_research_tail`);
      12. `advanceGreatPeople` (points, recruitment, replacement offer);
          the pantheon race;
      13. war clocks, treaty / friendship / alliance / border countdowns,
          alliance points and level effects, peace counter, conquest clock
          (GPU `_seat_war_peace_tail`);
      14. **the seat's unit orders** from the record
          (`applySeatUnitOrders`; GPU `apply_seat_unit_sequence`): moves,
          attacks, founding, every unit verb.
6. **The Free Cities** (`freeCitiesPhase`; GPU `_free_cities_phase`):
   amenities, gold, upkeep, `bankruptcy`, then per city grant unit, build,
   strikes, heal, loyalty; the Free Cities units walk; cities at 0 loyalty
   join.
7. **Theological combat** (`theologicalCombatPhase`), every apostle /
   inquisitor in unit order.
8. **Religious pressure** (`spreadReligiousPressure`, `game.ts`; GPU
   `_spread_religious_pressure`): ONE pass over every city at once — all
   sources press, then every city re-picks the religion it follows.
9. **Climate** (`climateTurn`): CO2 phase, ice melt, lowland flood /
   submerge.
10. **`state.turn += 1`.**
11. **Era boundary** (`eraBoundary`, every `ERA_LENGTH` turns): road tier,
    every major's Age from the window's era score, dedications, golden grants,
    the score window resets; `eraInspirations`.
12. **World Congress** (`worldCongress`): special sessions, `resolveEmergencies`,
    `resolveCompetition`, the regular session when due (it reads the NEW turn
    number).
13. The exoplanet flight; the victory checks (space, domination, religion,
    culture, diplomatic) and the turn limit (`state.turn > TURN_LIMIT`, the
    score leader).

## Summary of positions

| system | where |
|---|---|
| seat order | barbarians → city-states (array order) → majors (seat 0..n-1) → Free Cities |
| per-seat economy | all inside the seat's block, cities walked after the record's picks and purchases |
| per-city order | loyalty → growth → production (1 completion) → borders → strikes → heal |
| yields read by growth / production | the loop-top `computeCityStats` snapshot, before any completion this turn |
| research / civic completion | after the city walk (civics after upkeep and bankruptcy) |
| gold income, upkeep, bankruptcy | after the city walk; the shortfall's amenity penalty is read by NEXT turn's cities |
| faith, GP points, pantheon | after the city walk |
| unit heal | step 1, all units at once, at the top of the turn |
| unit movement refresh | step 1, then again for majors at step 5.1 |
| unit actions | at the tail of the seat's own block, after its economy |
| city heal | inside the owner's city walk |
| disasters / random events / storms | step 3, after barbarians, before city-states |
| religious spread | step 8, one global pass after every seat |
| climate | step 9, before the turn increment |
| era / ages | step 11, after the increment |
| World Congress, emergencies | step 12, after the increment |
| score / turn limit | step 13 |
