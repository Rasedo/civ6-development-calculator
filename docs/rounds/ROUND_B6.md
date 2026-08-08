# ROUND B6 — religion: B-18 residuals + B-25 religious victory (task #62)

2026-07-19. Closes B-18 to ~95% and the B-25 religious-victory slice.
Serial main-session stages (S1-S3) + one Opus coverage agent (S4), the
B9 pattern. ONE battery at round END.

## Scope (from AUDIT B-18/B-25 "STILL OPEN")

B-18: enhancer EFFECTS (all 7 inert), Missionaries/Apostles,
theological combat, religious victory. B-25: the religious-victory
face (Culture/Diplomatic stay open).

DESCOPED UPFRONT (recorded residuals, the B9-R4 pattern):
- APOSTLES + THEOLOGICAL COMBAT — apostles add abilities/combat on top
  of the missionary chassis; scripted seats rarely collide religious
  units, so fidelity value is low until then. Residual on B-18.
- PLAYER missionaries — the scripted player script has no faith-buy
  verb and the RL action head is parked until #50/A-18; the machinery
  lands SHARED where possible, but only rivals buy/send. Residual
  rides #50.

## Design decisions (source-of-truth: real Civ 6, sized to modeled
scope; the DATA descriptions in data/religion.ts ARE the enhancer spec)

- **Pressure lump (missionary spread)**: real Civ 6 spreads ~200
  pressure vs ~30/turn ambient; our ambient is
  RELIGION_PRESSURE_PER_TURN=1, so SPREAD_PRESSURE=10 (a decade of
  ambient — decisively flips, ambient can re-erode). SCRIPTURE
  ("stronger pressure") ×1.5 → 15 (integer, exact).
- **MISSIONARY unit**: civilian, charges=3 (vanilla), +1 with
  SCRIPTURE. Faith-purchase-only at round(100·GAME_SPEED)=60 faith
  (the worship-cost pattern); HOLY_ORDER ×0.7 → 42 (round). Gate:
  founded religion + a city with COMPLETE unpillaged HOLY_SITE +
  SHRINE (real Civ 6's Shrine requirement). Rival policy: buy in the
  A-5 faith block AFTER the worship buy (worship saturates first),
  cap 2 live missionaries per civ, spawn at the buying city center.
- **Spread behavior**: real-MP walk (the builder-walk machinery
  class) toward the NEAREST city (any civ, incl. own) whose
  followedReligion != this civ's religion, stop within 1 of the
  center, SPREAD: += lump pressure for the owner religion on that
  city, charge −1, unit dies at 0 charges. Deterministic target scan
  (distance, ties by tile index) — ZERO new RNG draws anywhere in
  this round.
- **Enhancer effects** (identity machinery exists per-civ;
  ITINERANT/SCRIPTURE/HOLY_ORDER/MESSENGER wire into named channels,
  the three combat ones key on tile→owning-city followedReligion):
  - ITINERANT_PREACHERS: holy-center pressure range 10 → 12 for that
    religion (spreadReligiousPressure / _spread_religious_pressure
    read a per-religion range).
  - SCRIPTURE: +1 charge, lump 15 (above).
  - HOLY_ORDER: missionary cost ×0.7 (above).
  - MESSENGER_OF_THE_GODS: +2 gold +2 faith on each trade route whose
    DESTINATION city follows this civ's religion — added at the route
    income sites (routeYields consumers, both engines, pre-tier).
  - JUST_WAR: +10 CS when fighting within 3 tiles of any city
    following your religion.
  - DEFENDER_OF_THE_FAITH: +5 CS when DEFENDING on a tile owned by a
    city following your religion.
  - CRUSADE: +10 CS attacking a unit standing on a tile owned by a
    city following your religion.
  Tile→owning-city religion: TS tile.cityId/rivalCityId → city
  followedReligion; GPU owner (player slot) / rc_tile_id (A-17
  registry) → city_followed/rc followed planes. Combat mods join the
  B-29 chokepoints (damage-diff quantization q=round(diff·10) — the
  new ±10/±5 adders are integers, table-safe).
- **Religious victory**: religion g wins when EVERY alive civ
  (player + each rival with ≥1 city) has MORE THAN HALF of its cities
  following g (real Civ 6 predominance-in-every-civilization).
  victoryType 5 = religion 0 (player's) wins; 6 = a rival religion
  wins (defeat). Checked in endTurn alongside the science check, GPU
  at the mirrored position; the existing victoryType trace column
  carries it.

## Stages

- **S1 — enhancer effects**: all 7 channels EXCEPT the two that need
  the missionary chassis (SCRIPTURE charge/lump + HOLY_ORDER cost
  land with S2; ITINERANT/MESSENGER/JUST_WAR/DEFENDER/CRUSADE now).
  Exporter ships per-enhancer effect rows; GPU reads via the _bel_*
  enhancer-slot machinery. Gates.
- **S2 — missionary chassis (rival)**: unit row (civilian, charges),
  faith purchase in the A-5 faith block (after worship; the B9-R2
  invariant: any new rc-state write that feeds later-city yields
  bumps _eff_version — pressure writes do NOT feed same-turn yields,
  verify and document), walk + spread + charge death, cap 2/civ.
  POOL-END invariant on spawn; _reclaim discipline for the new
  per-unit charge state (v_charges exists — reuse). SCRIPTURE +
  HOLY_ORDER wire in. Gates + forced-compaction.
- **S3 — religious victory**: the predominance check both engines +
  vitest. Gates.
- **S4 — coverage + close (Opus agent, efficiency contract below)**:
  extend gpu/religion_gp poke lane or add lane `religion2`
  (missionary buy/walk/spread/death, each enhancer channel, victory
  flip incl. the defeat direction), vitest, existing-lane recheck
  BEFORE the battery, then ONE battery (--no-eval), AUDIT close-out
  (B-18 → 95%, B-25 → 80%), HANDOFF/memory.

## Standing rules in force

Gates ladder per stage: tsc → touched vitest → export (READ output;
rm orphaned seedNNNN.json on SEED_OVERRIDES changes) → scripted
PYTHONUTF8=1 python gpu/parity_test.py → forced CIV6_RECLAIM_AT=12
CIV6_RC_RECLAIM_AT=3 → rollout --shards 4 --pipeline-replay. ONE
battery at round end. Draw-count neutrality for every new mechanic.
New tensors match dtypes (f32 gumbel lane). Every rc_bldg write bumps
_eff_version (B9-R2 invariant); any endTurn-top state read the TS
replay sequences after unit orders sits AFTER _apply_unit_actions
(the B9-R2 ww class). AUDIT anchors by SYMBOL. Red gate →
statelog-first hunt (gpu/HUNTING.md). Commit via git commit -F
<scratchpad file>.

Agent efficiency contract (S4 prompt carries verbatim): (1) iterate
on the scripted parity gate only while red; forced + rollout ONCE
each at the end; green ladder = STOP; (2) Grep to locate, then ONE
generous-context Read per work zone; (3) batch independent shell
commands, tail/filter long outputs.
