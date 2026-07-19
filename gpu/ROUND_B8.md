# ROUND B8 — CS & trade: B-21 re-key + B-23 trade fidelity + A-12 levy/quests (task #64)

2026-07-19. Three slices → 3 parallel Opus worktree agents off this
committed brief (the B10/B7 pattern). Agents verify HEAD == the
commit that added this file and reset --hard to it if stale. ONE
battery at round END, main session only.

Substrate already live (do not rebuild): per-civ envoys/influence/
greedy assignment + strict suzerain contest (A-12a: `cs_r_envoys`,
`isSuzerain`/`rivalIsSuzerain`), rival→CS routes + suzerain
trade-capacity term (A-12 3b-1), join-the-suzerain's-war + CS
conquest (3b-2), rival domestic routes `r_routes` (A-11), player
quests (`issueQuest`/`questSatisfied`/`QUEST_COOLDOWN`/
`QUEST_ENVOYS`, kinds clearCamp/sendTradeRoute/buildDistrict),
player levy (`levyUnits`: suzerain + militaristic + LEVY_GOLD_COST +
LEVY_COOLDOWN + LEVY_UNITS spawns), CS data tables
`CS_TYPE_BUILDINGS` + `CS_SUZERAIN_BONUS` (data/cityStates.ts —
currently INERT in the live path).

## Slice K — B-21 re-key (envoy channel + suzerain perk rows)

- The LIVE 3/6-envoy yield channel (src/core/cityStates.ts — the
  three `CS_TYPE_DISTRICT[cs.type]` sites around `csBonusYields`)
  re-keys to `CS_TYPE_BUILDINGS`: the 3-envoy tier applies its yield
  to cities holding the tier-1 building, the 6-envoy tier the tier-2
  building (real Civ 6: CS bonuses land on matching BUILDINGS, not
  bare districts). Mirror in every GPU consumer of the same channel
  (player AND rival envoy-bonus paths — A-12a wired rival bonuses at
  1/3/6; keep the 1-envoy tier as-is).
- `CS_SUZERAIN_BONUS` rows go LIVE: the suzerain (player or rival)
  receives the per-CS unique bonus in place of / on top of the
  type-generic perk exactly as the data rows specify — read the rows,
  implement what they express within modeled systems, DESCOPE rows
  needing absent systems (document each). Exporter ships the rows.
- A-12a probes said envoys reach 9 in 6/8 seeds → the 3/6 tiers are
  gate-reachable now; report in-gate evidence (seeds where a 3+ tier
  fires).

## Slice T — B-23 trade fidelity (international routes + duration)

- **International routes**: the player can route to a MET rival's
  city and rivals to player/other-rival cities — model: destination
  yields via a new `routeYieldsInternational` = gold keyed on the
  destination city's completed specialty districts (real Civ 6
  international routes are gold-heavy: +3 gold base +1 per
  destination specialty district — use that), plus the existing
  domestic-style food/production ONLY for domestic (unchanged).
  Rival side joins the A-11 `r_routes` machinery (id-keyed, one new
  route/civ/turn, income pre-tier both GPU yield paths, symmetric
  interdiction on war — extend the existing interdiction to
  international pairs: war with the destination civ kills the
  route).
- **Duration/completion**: every route (domestic, CS, international)
  now carries `expiresTurn = start + TRADE_ROUTE_DURATION` (ruling:
  20 turns — real-ish 21 land trimmed to the model's online speed);
  at expiry the route is removed and the owner re-picks NEXT turn
  via the existing deterministic policies. Zero draws (expiry is
  arithmetic; re-pick uses existing draw-free pickers).
- Trader unit and roads: DESCOPED residuals (record on B-23).
- Scripted-player policy: extend the existing route picker to
  consider international destinations AFTER domestic+CS (keeps
  fixture trajectories tamer); rivals: nearest-city preference as
  the existing r_routes picker does.

## Slice L — A-12 close (rival levy + rival quests, zero-draw)

- **Rival levy**: mirror `levyUnits` for rivals — an AT-WAR rival
  that is suzerain of a militaristic CS levies when affordable
  (LEVY_GOLD_COST off its treasury, LEVY_COOLDOWN per CS shared
  across seats — one `lastLevyTurn` per CS, real Civ 6 semantics:
  levied troops go to ONE civ), spawning LEVY_UNITS units of the
  existing 2-step levy ladder at the CS center into the RIVAL's
  pool (POOL-END append; kill/reclaim hygiene). Policy position:
  inside the rival gold block AFTER existing purchases (the A-5
  pattern — document the exact position both engines). Levy-type
  era ladder stays 2-step (residual note).
- **Rival quests — ZERO-DRAW design** (the deferral reason was
  draw-count risk; this design removes it): each CS maintains ONE
  quest per RIVAL civ (`rivalQuest[r]`), issued
  DETERMINISTICALLY — no RNG: on cooldown expiry the quest kind is
  the FIRST SATISFIABLE option in the fixed order
  [clearCamp (nearest camp within range), buildDistrict (the CS
  type's district), sendTradeRoute] evaluated against that rival's
  state; completion pays +QUEST_ENVOYS to that rival's envoy pool
  at the A-12a accrual position. The PLAYER quest path is untouched
  (its draws stay identical — verify draw-count neutrality
  explicitly). GPU mirrors with per-(cs,r) tensors, _MUTABLE +
  reclaim discipline.
- Report in-gate evidence: rival levies fired / rival quests
  completed across the 24 seeds.

## Shared-surface rules

- K and L both touch cityStates.ts and the rival CS phase — K owns
  the YIELD/bonus channel (`csBonusYields` sites + suzerain perk),
  L owns the quest section + levy; do not edit the other's
  functions. T owns trade.ts + route pickers + r_routes.
- Each agent ships its own poke file + battery lane (`cs_bonus` /
  `trade2` / `cs_verbs`) as one minimal line in gpu/battery.py +
  TS vitest pokes.
- Merge order K → L → T.

## Standing rules in force

Identical to gpu/ROUND_B7.md's section (gates ladder per slice,
never the battery, draw-count neutrality, _MUTABLE/dtype/reclaim/
POOL-END hygiene, _eff_version on every yield-bearing write, AUDIT
by SYMBOL with proposed wording in the final report (B-21 →
RESOLVED-minus-descoped-rows, B-23 → ~70%, A-12 → RESOLVED w/
residual notes), statelog-first hunts, commit -F with the standard
trailers, efficiency contract, worktree bootstrap with fixture
copy + PYTHONUTF8 + no idle-waiting).
