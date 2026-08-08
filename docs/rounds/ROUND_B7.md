# ROUND B7 — Great People: B-17 residuals + B-20 Great Works + B-8 auras (task #63)

2026-07-19. Three slices → 3 parallel Opus worktree agents off this
committed brief (the B10 pattern). Agents verify HEAD == the commit
that added this file (`git log -1 -- gpu/docs/rounds/ROUND_B7.md`) and
`git reset --hard` to it if stale. ONE battery at round END, main
session only — agents run the gate ladder, never the battery.

Substrate already live (do not rebuild): 9-class global GP race
(`GP_CLASS_DISTRICT`/`GP_CLASSES`, era ladder `gpCost`), claim
dispatch `applyGreatPersonEffect` (game.ts) + the rival mirror
(phase.ts, the `while (earned < ...)` loop) + the GPU rectangular
`gpEffects` apply; Encampment GPP flows since B9
(`greatPersonPointsPerTurn`); B-4 XP (`Unit.xp`, `XP_LEVELS`, GPU
`p_xp`/`v_xp`); B-31 civilian capture with the POOL-END invariant;
the B6 civilian real-MP walk chassis (missionary); B-29 quantized
damage-diff chokepoints (`damageRoll`/`_damage_roll`, q=round(diff·10)).

## Slice E — B-17 Encampment residuals

Rulings (real Civ 6 sized to model; catalog tone is "Civ 6-ish"):
1. **Specialist slot**: add `ENCAMPMENT: { production: 1, gold: 1 }`
   to `SPECIALIST_YIELDS` (data/greatPeople.ts) and stop
   `citySpecialistSlots` skipping ENCAMPMENT — verify the real-Civ-6
   value first and use it if it differs; both engines' specialist
   machinery + the exporter rows follow data-driven.
2. **District strike**: a city (player AND rival) with a COMPLETE
   unpillaged ENCAMPMENT fires the B-2 strike pattern as an
   ADDITIONAL once-per-turn ranged strike (range 2, nearest hostile,
   one `damageRoll` at the city's defense strength, no retaliation,
   never captures) — real Civ 6 Encampments strike separately from
   walls. Same draw order both engines; a city with walls AND
   Encampment rolls twice (walls first, then Encampment — document
   the order at the B-2 site). No separate Encampment HP pool —
   recorded residual.
3. **Training XP**: units TRAINED or PURCHASED in a city whose
   Encampment holds military buildings start with XP = 5 per
   building tier (BARRACKS/STABLE = 5, +ARMORY = 10, +MILITARY_ACADEMY
   = 15; best tier counts, not sum), player and rival mirrored
   (rc_bldg check on the rival side). Zero draws. Verify which of
   those buildings exist in the BUILDINGS catalog — data-drive off
   what's there; if only BARRACKS exists, the ladder is just 5.
DESCOPED (record on B-17): Encampment HP pool, movement block.

## Slice W — B-20 Great Works (multi-charge Writers/Musicians)

Rulings:
- WRITER and MUSICIAN claims no longer apply their instant culture
  lump. Each claimed person carries **2 Great Works**. Each work
  needs an OPEN SLOT in the claiming civ's cities: AMPHITHEATER
  gives 2 writing slots, and whatever later Theater-line building
  exists in the BUILDINGS catalog (check for MUSEUM/BROADCAST_CENTER
  class rows) gives 2 music slots — if no music-slot building
  exists, MUSICIAN works share the AMPHITHEATER slots (document).
  Works fill deterministically: lowest city (city_seq order for the
  player, slot order for rivals), lowest slot first. A work yields
  **+2 culture/turn** (music works +1 culture +1 gold if you can
  differentiate cheaply, else +2 culture — document the pick) as a
  building-tier city yield, both engines, player cities AND rival
  cities (rivals claim from the same race).
- **Overflow**: charges with no open slot anywhere degrade to the
  CURRENT instant culture lump for that person (the pre-B7
  behavior) — never lost, never banked.
- ARTIST stays the instant-lump class (legacy condensed roster).
  Tile activation + per-person abilities stay DESCOPED (record on
  B-20; player GP units ride #50 like missionaries).
- State: per-city work counts (TS `City`/rc fields + GPU planes/rc
  tensors) with full snapshot/_MUTABLE/reclaim discipline. ANY write
  that feeds city yields bumps `_eff_version` (the B9/B10
  invariant — works are yield-bearing state).

## Slice G — B-8 General/Admiral auras

Rulings:
- A GENERAL claim spawns a **GENERAL support unit** (civilian,
  charges undefined → walkers ignore it, 4 MP) at the claiming
  civ's capital, IN ADDITION to the roster's instant effect (the
  instant effect models the retire ability). ADMIRAL same, spawning
  at the capital (embark rules apply when it moves — #45 substrate).
- **Aura**: own LAND military units within 2 tiles of an own live
  GENERAL get **+5 CS** at every damage-roll site (attack AND
  defense); own NAVAL/embarked units within 2 of an ADMIRAL get
  +5 CS. Integer adder at the B-29 quantized chokepoints (the B6
  JUST_WAR/CRUSADE pattern — join the same assembly, table-safe).
  The +1 MP half of the real aura is DESCOPED (movement coupling —
  record on B-8).
- **Movement**: rival GENERALs walk with the war effort — real-MP
  walk (the missionary chassis class) toward the civ's CURRENT
  war-march target, stopping within 2 of it; at peace they hold
  position. Player GENERALs hold at the capital (the scripted
  player doesn't march). ADMIRALs hold at the capital (naval
  war-march targeting is a residual). Zero new RNG draws anywhere.
- GENERALs are capturable civilians (B-31 machinery, POOL-END on
  transfer — verify type-agnostic paths inherit, don't rebuild).
- GPU: new unit type rows ride the existing pools; NOT trainable/
  purchasable — apply the NEW-UNIT-TYPE CHECKLIST (mask
  production_mask + purchase u_ok + RL apply `trainable`; the B6
  faithOnly catch class). Spawn-at-claim is production-free.

## Shared-surface rules (conflict control)

- The GP claim dispatch (`applyGreatPersonEffect`, the phase.ts
  mirror loop, the GPU gpEffects apply): W edits the WRITER/MUSICIAN
  rows' behavior, G ADDS a spawn side-effect keyed on class
  GENERAL/ADMIRAL. Keep edits ADDITIVE and local to your class rows
  — no refactors of the dispatch shape; the merge session resolves
  overlaps (merge order E → W → G).
- E and G both touch combat: E at the B-2 city-strike site, G at the
  damage-roll CS assembly — different functions; do not touch the
  other's site.
- Each agent ships its OWN poke file + battery lane (`encampment` /
  `great_works` / `gp_aura`) registered as one line in gpu/battery.py
  (expect a trivial merge conflict there — keep the line minimal),
  plus TS vitest pokes for its mechanic.
- In-gate evidence to report: from your gate runs, how many of the
  24 scripted seeds show (E) an Encampment strike fired / nonzero
  training XP, (W) at least one slotted work, (G) at least one
  GENERAL unit alive — cheap greps over trace/statelog output only;
  don't build new tooling for it.

## Standing rules in force (identical to ROUND B10 — read that brief's
section if in doubt)

Gates ladder per agent slice: tsc → touched vitest → export (READ
output; the exporter sweeps orphaned fixtures itself since B10) →
scripted PYTHONUTF8=1 python gpu/parity_test.py (0.0 milli) → forced
CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 → rollout --shards 4
--pipeline-replay. Agents NEVER run the battery. Draw-count
neutrality (conditional draws gate on identical conditions both
engines; the E strike adds draws — SAME sites, SAME order, both
engines). New tensors: dtypes matched (f32 gumbel lane for anything
feeding the PLAYER walk), _MUTABLE registration, reclaim/kill
hygiene, POOL-END on ownership transfer. Every yield-bearing write
bumps _eff_version. AUDIT anchors by SYMBOL; propose your AUDIT
wording in the final report (B-17 → ~85%, B-20 → ~70%, B-8 →
RESOLVED-minus-MP — adjust to what you actually shipped). Red gate →
statelog-first hunt (gpu/HUNTING.md); budget a hunt — behavior
changes reshuffle all trajectories and historically expose old
latents. Commit on your worktree branch via git commit -F
<message-file> with the standard trailers; report branch + sha.

Agent efficiency contract (verbatim): (1) iterate on the scripted
parity gate only while red; forced + rollout ONCE each at the end;
green ladder = STOP; (2) Grep to locate, then ONE generous-context
Read per work zone; (3) batch independent shell commands,
tail/filter long outputs.

Worktree bootstrap: verify HEAD == the brief commit (reset --hard if
stale); copy gpu/fixtures/*.json from the MAIN checkout
(C:\civ6-development-calculator\gpu\fixtures) before first use;
PYTHONUTF8=1 on every piped python; write multi-line probes to
files (PowerShell 5.1 — no &&, no python -c heredocs); do NOT end
your turn idle-waiting on a background command — run gates in the
foreground.
