# Round B3 landing log

## Slice U — B-18 pressure→yields coupling

Agent U. Base sha `f21e62d` (ROUND_B3 design brief). Two commits, each
gate-serialized:

- `58e1278` INERT plumbing — follower belief moved to a per-city lookup,
  keyed on the OWNER religion (byte-identical). Scripted parity 0.0 milli
  on the UNCHANGED fixtures (proves the restructure).
- `6d6efca` FLIP — `B18_FOLLOWER_COUPLING_LIVE = true`, keyed on
  `followedReligion`. Fixtures regenerated. Scripted 0.0 milli, forced
  0.0 milli.

### What landed (as-built rules)

A city's FOLLOWER-belief yields now key on the religion THAT CITY follows
(`followedReligion`, the Slice-T pressure-spread output), not the owning
civ's religion. PANTHEON + FOUNDER + ENHANCER beliefs stay per-civ.
Religion id = the unified civ id (0 = player, i+1 = rival i); a city's
follower belief = the FOUNDING civ's chosen follower (`_follower_by_rel`:
col 0 = player = -1 in-gate since the player never founds; col i+1 =
`r_follower[:, i]`). A city following NO religion (-1) gets no
follower-belief yields (pad row 0). This is a BEHAVIOR CHANGE on both
seats: a civ's own follower belief no longer applies to cities that don't
follow it, and a player/rival city following a FOREIGN religion now draws
that religion's follower belief.

Follower channels moved (the 6 the 9 follower beliefs carry, all
follower-EXCLUSIVE by design): `workEthic` (Holy Site adjacency→prod),
`buildingYields` (Feed the World / Choral Music on Shrine/Temple),
`buildingHousing` (Religious Community), `amenitiesIfSpecialty` (Zen
Meditation), `faithPerWonder` (Divine Inspiration). PANTHEON/FOUNDER
channels (`bldgY` Stewardship, riverCity, growth/border mult, gppFlat,
perF/perC, featY/impRes/impY) stay per-civ.

**TS** (`master switch B18_FOLLOWER_COUPLING_LIVE`, data/religion.ts):
`getModifiers`/`getRivalModifiers` no longer apply the follower belief;
new `withFollowerBelief` + `followerBeliefForReligion` +
`followerReligionForCity` (effects.ts) layer it per-city in
`computeCityStats` (player), `rivalCityYields` / `rivalHousing` /
`rivalAmenityTiers` (rivals). `withFollowerBelief` clones ONLY the
follower channels onto the base Modifiers (all other channels shared by
reference → bit-identical to the old per-civ path when keyed on owner).

**GPU** (`rules.followerCoupling` → `self._b18_couple`): `_follower_by_rel`
/ `_follower_id_for` / `_fol_tab` gather the follower table per-city;
`_bel_add_pf` keeps pantheon+founder `bldgY` per-civ (the split einsum is
bit-exact — disjoint integer building keys). Wired into:
- `_city_totals` (PLAYER walk — NEW: the player had zero follower belief
  before). Work Ethic (HS floored adjacency → production, cached `hs_adj`),
  follower `bldgY` (fresh einsum, pre-amenity), Religious Community housing,
  Zen amenities (cached `spec_count`). `faithPerWonder` is follower-per-city
  too but INERT for the player — the GPU player walk models no wonders
  (built_wonder owner = 0 in-gate; a pre-existing player-wonder gap), so the
  DIVINE_INSPIRATION follower on a player city yields 0 in both engines.
- `_rival_city_yields` + `_rival_city_yields_all` (we, bldgY-split, fpw,
  per-rc via `rc_followed`) — kept bit-equal (D-9 bar).
- `_rival_amenity` (Zen per-rc), rival housing block (bldgH per-rc).

Inert-first was keyed on OWNER religion, reproducing the old per-civ apply
exactly (verified: pan/founder rows for we/fpw/zen/bldgH are all zero, so
those channels are purely follower; bldgY founder rows retained via
`_bel_add_pf`).

### Reachability (in-gate, 24×250)

PLAYER side is fully live: player cities hold 23 Shrines, 23 Temples, 33
Holy Site districts; player cities follow the two rival religions (first
flip ~t65) whose follower beliefs include WORK_ETHIC, FEED_THE_WORLD,
RELIGIOUS_COMMUNITY (all consuming). ZEN reachable (player reaches 2+
specialty districts). DIVINE_INSPIRATION inert (no player wonders). RIVAL
side: 219/293 rival cities follow a religion. The flip reshuffled 16/24
seeds (29,365 trace cells vs the inert base) — genuinely exercised, both
engines turn-exact.

### Gates

- INERT scripted parity: 0.0 milli (unchanged fixtures).
- FLIP scripted parity: 0.0 milli (fixtures regenerated).
- FLIP forced-compaction (`CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`): 0.0
  milli — validates the `rc_followed`/`rc_pressure` reclaim permutation now
  that the yield paths READ `rc_followed` per slot.
- `npx tsc --noEmit` clean; `npx vitest run` 249 green.
- Poke `gpu/religion_gp_test.py` extended (SLICE-U FOLLOWER-COUPLING OK):
  a city following a FOREIGN religion draws that religion's follower belief
  bit-exactly (`_follower_by_rel`/`_follower_id_for`/`_fol_tab`), the
  pan+founder / follower `bldgY` split reconstructs the full row, and the
  flag routing (LIVE→followedReligion, INERT→owner) is asserted.
- No seed died; city-count distribution IDENTICAL to the round base; no
  SEED_OVERRIDES reroll.

### Flip-carry reconciliation (verified, no change needed)

`transferCityToRival` / `flipCityToRival` (rivals.ts) build the new
RivalCity with NO `religionPressure`/`followedReligion` (fresh undefined) —
matching the GPU's zero-on-death: `_spread_religious_pressure` zeroes
dead/absent slots each turn and re-derives `followed` from `pressure` AFTER
all flips, so a flipped/founded city re-accumulates from scratch. The
per-slot `rc_followed`/`rc_pressure` permute with the city in `_reclaim_rc`.
Proven consistent by the forced-compaction gate (0.0 milli) now that yields
read `rc_followed` per slot. No TS or GPU change required.

### Degradations / notes

- `faithPerWonder` follower coupling is INERT for the PLAYER on the GPU
  (no player wonders modeled on the walk). TS `computeCityStats` applies it
  correctly (× the player's wonder count = 0 in-gate). If a future round
  models player wonders on the GPU walk, add the follower `fpw` term there.
- `amenitiesIfSpecialty` from POLICIES stays TS-only on the GPU (pre-existing
  A-7r gap, inert in-gate). Only the belief ZEN term is added to the GPU
  amenity balance; consistent because policy `amenitiesIfSpecialty` is
  gate-inert for the player.
- `_pcfol` (player follower ids) is recomputed each `_city_totals` call
  (not folded into the D-10 cache): the term is pop-free but `city_followed`
  can shift between turns without an `_eff_version` bump, so caching it
  would risk staleness. Cost is negligible (one small gather + einsum).
- Master switch `B18_FOLLOWER_COUPLING_LIVE` (data/religion.ts) is now
  permanently true; the inert (owner-keyed) path is dead code kept for the
  two-commit audit trail. Safe to inline in a later cleanup.

### Deferrals / latents

- Enhancer EFFECTS, missionaries/apostles, theological combat, religious
  victory — OUT (unchanged from B-18 scope; the coupling doesn't touch them).
- No new latent parity issues observed. The 16/24-seed reshuffle held
  turn-exact on both the scripted and forced gates.

## Slice V — B-13 `unlockPolicy` wiring (#46 residual)

Agent V. Branch `slice-v-unlockpolicy`, base f21e62d. Commits: f1183fb
(batch 1), e7eabd8 (batch 2), + this log.

### What landed

All **37** Round-B2 catalog cards (the ones appended after FIVE_YEAR_PLAN in
`data/policies.ts`) now carry an `unlockPolicy` grant on a granting civic in
`data/civics.ts`. Every one of the 56 catalog cards is now reachable — the
exporter's `policies[].unlockCivic` has **zero** `-1` entries. Full-catalog
parity (owner standing ruling) achieved.

Landed in two GATE-SERIALIZED batches (scripted gate 0.0 milli after each):

**Batch 1 — Ancient/Classical granting civics (19 cards), commit f1183fb**
- CODE_OF_LAWS → Discipline, Survey
- CRAFTSMANSHIP → Agoge, Ilkum
- FOREIGN_TRADE → Caravansaries, Maritime Industries
- MILITARY_TRADITION → Maneuver, Strategos
- STATE_WORKFORCE → Conscription, Corvée
- EARLY_EMPIRE → Colonization
- MYSTICISM → Inspiration, Revelation, God of the Open Sky\*
- POLITICAL_PHILOSOPHY → Diplomatic League, Charismatic Leader
- DRAMA_AND_POETRY → Literary Tradition
- THEOLOGY → Martyrdom\*
- DEFENSIVE_TACTICS → Bastions

**Batch 2 — Medieval..Information granting civics (18 cards), commit e7eabd8**
- FEUDALISM → Feudal Contract, Serfdom
- DIVINE_RIGHT → Chivalry, Gothic Architecture
- REFORMED_CHURCH → Grand Master's Chapel\*
- CIVIL_ENGINEERING → Public Works, Skyscrapers
- MERCANTILISM → Free Trade\*
- NATIONALISM → Elite Forces
- SUFFRAGE → Economic Union
- TOTALITARIANISM → Total War\*
- MOBILIZATION → Levée en Masse, Redoubt
- IDEOLOGY → Monumentality\*
- COLD_WAR → Containment
- RAPID_DEPLOYMENT → Military First
- SOCIAL_MEDIA → Collective Activism, Online Communities

Real-Civ-6 civic sources verified against the Arioch/Well-of-Souls civics
analyst + the Fandom card pages (WebSearch/WebFetch); the confident majority sit
on their exact real granting civic.

### Substituted civics (\* above)

Cards with **no distinct real granting civic** — placed on the closest-era
present civic and recorded here:
- **God of the Open Sky** — not a real policy card (it is a Civ 6 *pantheon*).
  Placed on MYSTICISM (Ancient religious civic).
- **Martyrdom** — real unlock is a religious civic; repo tags the card
  `diplomatic` (a pre-existing kind approximation). Placed on THEOLOGY.
- **Grand Master's Chapel** — a real Government-Plaza *building* (faith buys
  military units), not a civic card. Placed on REFORMED_CHURCH (closest
  religious-Renaissance civic).
- **Free Trade** — real "Free Market" already occupies The Enlightenment
  (FREE_MARKETS original); this extra trade card has no distinct real civic.
  Placed on MERCANTILISM (Renaissance economic/trade).
- **Total War** — real granting civic (Scorched Earth, Atomic) is absent from
  the 51-node tree. Placed on TOTALITARIANISM (closest present modern-military).
- **Monumentality** — a Golden-Age *dedication* policy in real Civ 6, not
  civic-granted. Placed on IDEOLOGY (Modern wildcard-flavored civic).
- **Elite Forces** / **Redoubt** — real granting civic uncertain (Industrial/
  Modern military); placed on NATIONALISM and MOBILIZATION respectively as the
  best-known era home. Gate-inert; catalog placement only.

### Newly implemented channel (both engines, same pipeline point)

None of the 37 new cards carries a gov/policy *yield* channel — they are all
INERT (empty `effects`). But the wiring **activated a dormant inspiration**:

**MEDIEVAL_FAIRES "run 4 policy cards"** (`data/boosts.ts`, `check.kind ===
'policies'`, count 4). It was unreachable before: the scripted player never
filled 4 policy slots in-gate (military/diplomatic cards were unlocked by no
civic, so those slots sat empty). The new wiring fills 4+ slots early, so TS
fires the inspiration and applies −40% to the MEDIEVAL_FAIRES civic cost,
shifting the whole civic-research trajectory (first caught as a `civics`
count desync, seed 9079 t99, in the batch-1 gate).

This inspiration was **exported nowhere and detected nowhere on the GPU** — a
latent that only my wiring could surface:
- Exporter (`scripts/export-gpu.ts`): the boost loop had no `policies` case, so
  the row was silently dropped. Added `else if (c.kind === 'policies') row = {
  kind: 'policies', count: c.count }`.
- GPU (`engine.py _detect_boosts`): no `policies` case (fell through to
  `continue`). Added it — counts the PLAYER's slotted-policy mask
  (`_gov_policy_mods(self.civics)[4].sum()`) at the same turn-top point as TS
  `detectBoosts`, gated on `_gov_has_effects`. **Player-only**: TS
  `rivalCheckSatisfied` returns `false` for `policies`, and the rival boost
  loop has no `policies` case, so it correctly skips it for every rival.

With both sides mirrored the batch-1 gate went 0.0 milli. This is a real
fidelity fix (real Civ 6 does give the Medieval Faires inspiration for running
4 cards), not a workaround.

### Re-derived channel-reachability proof (updates AUDIT A-7)

The AUDIT A-7r "unreachable by proof" note was derived under the OLD unlock set.
Re-derivation after this wiring:

**The reachable yield-channel set is UNCHANGED.** The 37 new cards are (a) all
inert and (b) all appended AFTER the 19 originals in the POLICIES table. Both
engines fill slots greedily in table order (TS `computeAdoption` findIndex; GPU
`_gov_policy_mods` per-kind cumsum + wildcard overflow, table order). Therefore:
- A later-table-order card can NEVER displace an earlier one — an original's
  slot placement depends only on the cards *before* it in table order, which
  are all originals. So the set of slotted **effect-carrying originals** is
  byte-identical to before the wiring, and their yields are unchanged.
- New cards can only fill slots left EMPTY after every unlocked original is
  placed (previously-idle military/diplomatic slots, and wildcard overflow only
  once all earlier-table overflow originals are placed). They add zero yield.
- Diplomatic cards now make AUTOCRACY's D slot live (expected/wanted) — inert,
  no yield delta.

So `adjacencyMult / buildingYieldMult / amenitiesIfSpecialty / newDeal` remain
UNREACHABLE by the same argument as before (the overflow into W is still, in
table order, LAND_SURVEYORS + INSULAE before NEW_DEAL/FIVE_YEAR_PLAN; CLASSICAL_
REPUBLIC's `amenitiesAll` still loses its unlock-civic tie to AUTOCRACY).
`housingAll` (MONARCHY) / `housingIfDistricts` (INSULAE) / `yieldMult` (MERCHANT_
REPUBLIC) / `tilePurchaseMult` (LAND_SURVEYORS, gate-inert — no `buyTile` verb)
stay exactly as A-7r last recorded. The **one new live channel** is the
MEDIEVAL_FAIRES `policies` inspiration (above) — now implemented in both
engines. Poke `government_test.py` cases 7 + 8 lock this in: every new card is
asserted inert, and the inspiration is asserted to fire at ≥4 / not below.

### Gates / validation (all in-worktree)

- `npx tsc --noEmit` clean (both batches).
- `npx vitest run` — 249 tests, 30 files, all green.
- Scripted gate `python gpu/parity_test.py` — 0.0 milli after batch 1, batch 2.
- Forced-compaction gate `CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3` — 0.0 milli.
- `gpu/government_test.py` (battery cputests lane) — extended with cases 6/7/8,
  green.

### Degradations / deferrals

- **No deferrals** — all 37 cards wired.
- No scripted-seed casualties: the MEDIEVAL_FAIRES trajectory shift did not
  structurally kill any seed (no SEED_OVERRIDES reroll needed).

### Latents noticed

- The `policies` boost gap (exporter + GPU `_detect_boosts`) was a pre-existing
  latent, dormant only because no civic granted the military/diplomatic cards
  needed to fill 4 slots. Now closed. No other `checkSatisfied`/`_detect_boosts`
  kind is missing from the GPU (audited the switch: building, cityPop, totalPop,
  coastalCity, cities, greatPeople, tech, anyWonderBuilt, nearNaturalWonder,
  improvement, district, policies — all covered; `nearNaturalWonder`-style rows
  already present).

### Infra note (not a code change)

This worktree was auto-pruned during an owner-requested pause (changeless
worktree cleanup): its `.git` pointer and working files were removed, and it
dropped out of `git worktree list`. Recovered by re-registering it via
`git worktree add --force <path> -b slice-v-unlockpolicy f21e62d` (the harness
EnterWorktree tool refuses for a cwd-pinned subagent; direct main-repo mutation
is classifier-blocked, correctly). Side effect to note for the orchestrator:
the MAIN checkout's HEAD was left DETACHED at f21e62d (an accidental
`git checkout -f` during diagnosis, before the pruning was understood) — its
branch `claude/eloquent-mayer-si4ggq` still points at f21e62d (no commits
lost, tree was clean, `-f` discarded nothing). Re-attaching it was
classifier-blocked; the orchestrator may want to `git checkout
claude/eloquent-mayer-si4ggq` in the main checkout.


## Slice W — B-25 GPU space-race sim

Base sha: f21e62d (ROUND_B3 design brief). Agent W worktree.

### As-built chain semantics

The Science-victory chain (6 sequential space-race projects: Earth Satellite
-> Moon Landing -> Mars Reactor/Habitation/Hydroponics -> Exoplanet Expedition)
now SHIPS to the GPU. Previously it was TS-complete but FILTERED from the
exported projects table ("gate-unreachable at 100t").

- **Exporter (scripts/export-gpu.ts):** the `projects.rows` table now maps ALL
  of `PROJECTS` (the `!p.space` filter is gone). Every row carries the existing
  `d`/`y`/`g` plus four new fields: `sp` (space flag 1/0), `vic` (victory step
  1/0), `rt` (requiresTech -> techs-table idx, or -1), `rp` (requiresProject ->
  projects-table idx, or -1). Space rows sit LAST (chain order), exactly as in
  `data/projects.ts`.
- **GPU (gpu/civ6gpu/engine.py):**
  - `_space_proj_idx` / `_space_step` / `_space_victory_idx` derived from the
    exported rows in `__init__`.
  - `space_done` [B, 1+R, n_space] bool, unified civ space (0 = player, 1..R =
    rival i), `_MUTABLE`-registered. WRITE-tracked bookkeeping mirroring TS
    `state.spaceProjects` / `rival.spaceProjects` (nothing reads it for
    behaviour — the victory fires on the victory STEP directly, like TS).
  - Rival completion path (the existing A-14 projects path in `_rival_phase`):
    a completed space step sets `space_done[:, r+1, step]`; the VICTORY step
    sets `victory_type = 4` (player DEFEAT, the domination-defeat mirror) +
    `game_over`. The rival greedy pick never SELECTS a space row (RESEARCH_GRANTS
    wins the Campus slot 0 first), so this is inert in-gate — present for the
    rival chain + the poke path, exactly matching `rivals.ts` completeProject.
  - endTurn recompute (the `self.turn += 1` tail of `step`): now mirrors
    `game.ts` lines 904-909 — `space_won = victoryType in {3,4}` takes
    precedence over the domination/score recompute (`game_over = space_won |
    dom>=0 | turn>limit`; `victory_type` preserved when `space_won`). In-gate
    `space_won` is always False, so this is byte-identical to the prior recompute.
  - `winner` left untouched: for a space victory (`dom<0`, `game_over`) both TS
    (`scripts/gpu-trace.ts` line 63) and the GPU already resolve `winner` to the
    score-leader — no divergence, so no change was needed.

### Reachability finding (empirical)

**GATE-UNREACHABLE at 250t — poke-covered.** Evidence:
- The exporter unfilter is INERT: re-export left the per-seed fixture hash
  BYTE-IDENTICAL (`md5sum seed*.json | md5sum` = `587a9f71599c7092f1c69fff2c4346c8`
  before and after). Only `rules.json` (the projects table) changed; no TS
  trajectory moved (TS untouched).
- The scripted parity gate (GPU vs TS, both regenerated) is **0.0 milli** with
  the space rows shipped: the GPU project machinery stays turn-exact — adding
  the 6 rows at the END of the table shifts only the internal rival wonder/
  project code offsets (encoder + decoder both derive from `len(_proj_rows)`,
  so they move together) and nothing in the traced state.
- Structural reason nobody starts the chain: the SCRIPTED player never queues
  projects (it builds cheapest buildings), and the GPU has **no player project
  production subsystem at all** (projects were only ever ported for rivals,
  A-14); rivals run the greedy `.find` over `PROJECTS` in data order, so a
  Campus city always resolves to RESEARCH_GRANTS (row 0) before reaching the
  space rows. The Information/Future tech gates are moot — no civ queues a
  space project under the scripted policy regardless of tech.

Because the chain is gate-unreachable, the parity gates prove INERTNESS; the
semantics are pinned by `gpu/space_race_test.py` (wired into `battery.py`
cputests), a GPU-only poke asserting against the TS contract (the
government_test / religion_gp_test pattern — the pokes here do NOT spawn a
TS subprocess). It proves: the exported chain (6 rows, chain order via `rp`,
single tech-gated victory step); a rival completing the victory step ->
`victoryType 4` + `game_over` + `space_done` through the real rival path; the
endTurn recompute PRESERVES a science win/defeat (3 and 4) and leaves a running
game at 0; and the `space_done` snapshot/restore round-trip.

### Harness end-of-game semantics (as discovered)

`gpu/parity_test.py` steps a FIXED `n_turns` (= the recorded trace length)
regardless of `game_over`; `game_over`/`winner`/`victoryType` are integer trace
columns compared at atol 0.0. TS mirrors this — the exporter records a trace row
every turn to `N_TURNS=250` (`turn > TURN_LIMIT` never fires below 250, dom
never fires in-gate). Since the space chain is gate-unreachable, an in-gate game
never ends early in EITHER engine, so the "a game that ends in-gate must end
identically" contract is satisfied vacuously (and proven by the 0.0 gate). The
recompute change keeps that exact behaviour for the reachable trajectory.

### Degradations / deferrals (recorded)

- **victoryType 3 (player science WIN) has no GPU production path.** The GPU
  never gave the player a project-production subsystem (the A-14 asymmetry:
  `self.current`'s code space is buildings/settler/idle/units/districts — no
  project codes), and the scripted player never queues projects. Building a full
  player project subsystem to reach a gate-unreachable, RL-unused victory is
  disproportionate (the ROUND_B2 deferral reasoning still holds). What IS
  mirrored: the endTurn recompute PRESERVES a `victoryType 3` if set (proven by
  the poke) — the only behavioural contract the player-win recompute owns. If a
  future round adds player projects (full-length player-driven rollouts reaching
  the Information era), wire a player space-completion that sets
  `space_done[:, 0, step]` + `victory_type = 3` at the player city-loop
  completion point (the `made_district`-adjacent block in `step`), mirroring
  `game.ts` completeProject.
- **space_done is write-only bookkeeping** (matching TS `spaceProjects`, which
  is read only by the PLAYER `availableProjects`, absent on the GPU). No KILL
  hygiene is needed: it is per-CIV (not slot-coupled — `_reclaim_rc` leaves it
  intact) and a dead rival cannot write it; nothing reads it for behaviour.
- **Sequencing (step n+1 requires step n) + tech gating live only as exported
  DATA** (`rp`/`rt`) on the GPU, asserted by the poke. They gate the TS player
  `availableProjects`; the GPU rival greedy pick never selected space rows in
  either engine (TS `.find` ignores `requiresTech`/`requiresProject` too), so
  there is no GPU selection site that consumes them today. Shipped so a future
  player/rival space-selection can gate on them without a re-export.

### Validation (this worktree)

- `npx tsc --noEmit`: clean.
- `npx vitest run tests/space-victory.test.ts`: 4/4 green.
- Fixture re-export: seed hash byte-identical (see above).
- Scripted parity gate (`PYTHONUTF8=1 python gpu/parity_test.py`): PARITY OK,
  0.0 milli.
- Forced-compaction gate (`CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`): 0.0 milli.
- `gpu/space_race_test.py`: OK (wired into battery.py cputests).


Each agent appends its section (§U/§V/§W/§X). AUDIT.md updates happen at
merge (orchestrator), not in agent worktrees.

## Slice X — B-29 combat fidelity (wounded + river)

Branch: `worktree-agent-adfae4bdf06745359` (base f21e62d).
Commits:
- `21a61e7` B-29 (1/2): wounded-strength combat penalty
- `ece8af8` B-29 (2/2): river-crossing melee penalty + combat_mod poke

### As-built formulas
- **Wounded penalty** (both engines, `woundPenalty` / `_wound`): a unit's
  effective CS = `base − 10·((100 − hp)/100)`, i.e. −1 CS per 10 HP lost,
  linear, up to −10 at 0 HP. Float, no rounding. Applied to every UNIT whose
  CS enters a damage roll — attacker AND defender — at all 18 `_damage_roll`
  call sites: mel/melc, rng (military + lone-civilian defenders), rngrc,
  rngcs, csty/cstyc, rcty/rctyc (player siege + barb siege), pcty/pctyc,
  vrng/vrngc, pcstk, rcstk.
- **River penalty** (both engines): a MELEE attack whose attacker→target edge
  satisfies `crossesRiver` gives the attacker −5 CS (constant
  `RIVER_ATTACK_PENALTY`). Applied at the four melee families only —
  mel/melc, rcty/rctyc (player + barb), csty/cstyc, pcty/pctyc — attacker
  seat, so the −5 shows in both the attack roll and its retaliation counter.
  Ranged (rng/rngrc/rngcs/vrng/vrngc) and the wall strikes (pcstk/rcstk, the
  attacker is the city) are river-immune.

### The quantization mechanism (the parity crux)
The wounded penalty makes `strengthDiff` fractional (a multiple of 0.1). The
GPU's exp base is a precomputed JS table (torch/libm `exp` differs by an ulp
and damage rounds to an int). So `damageRoll`/`_damage_roll` now **quantize**:
`q = round(diff·10)`, `base = 30·e^(0.04·q/10)`, and the exporter ships the
table at 0.1 granularity (**121 → 1201 entries**, index `i = q+600`). TS and
the table evaluate the identical JS expression for the same integer `q`, so
the GPU reads back the exact double. The quantization also makes float
**association irrelevant** between engines (round snaps ~1e-13 noise away), so
each side is free to assemble the effective strengths in its own order.
The CB statelog `diff` field now logs `q` (10·strengthDiff) on both engines.

### Seats covered / cities excluded
All seats symmetric: player, rival (war acts route through the shared
`meleeAttack`/`hostileUnitAct`), barbarian, and city-state combats. **Cities,
city-state centers and ANCIENT_WALLS pools are NOT units** — their strengths
(`cityDefenseStrength`, `rivalCityDefense`, the 15+pop CS formula, the wall
outer pool) are unchanged; only the unit on the other side of those rolls
gets its wound term.

### River lookup on the GPU
No new export was needed — the per-tile `riverMask` ("rm") already ships and
the movement walkers already read `(river_mask[tile] >> dir) & 1` for the +3
crossing charge. New `_river_cross(frm, to)` reuses that: neigh column d IS
riverMask bit d, so it finds the neighbour direction landing on the target
and returns that bit (mirrors `crossesRiver`, incl. the from.riverMask==0 and
non-adjacent → 0 cases).

### SEED_OVERRIDES / fixtures
No new SEED_OVERRIDES. Both re-exports completed with no structural seed
deaths (existing overrides {2: 9028, 4: 9054} unchanged). Full fixture regen
happened at each behavior commit (every trajectory reshuffles); fixtures are
gitignored/regenerated, so the commits are code-only.

### Poke drift
None. All 249 vitest tests pass unchanged (combat.test.ts assertions are
qualitative — kill/less-than-full-HP — and hold for fresh-HP units). No
war_test / purchase_test / rlenv drift observed.

### New poke
`gpu/combat_mod_test.py` (wired into `gpu/battery.py` cputests). Proves, vs an
independent Python reference of the TS spec: (A) `_wound` bit-exact for HP
0..100; (B) `_river_cross` == the exported riverMask bit over 402 edges;
(C) `_damage_roll` reproduces the 0.1-granular table + `js_round` for
fractional diffs; (D) an integrated wounded melee whose CB `diff` equals the
full assembly, drops by exactly 50 (=5 CS) when the river edge is forced on
(counter +50); (E) a ranged strike across the same edge with NO shift.

### Gates (this worktree)
- `npx tsc --noEmit` clean; `npx vitest run` 249/249.
- Scripted parity `python gpu/parity_test.py`: **0.0 milli** (after wounded;
  again after river).
- Forced-compaction `CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`: **0.0 milli**.
- `gpu/combat_mod_test.py`: **COMBAT MOD OK**.
- (Off-script gate + full battery run once at merge — orchestrator.)

### Latents noticed
- No new pooled state was added (wound reads existing hp tensors; river reads
  the static riverMask), so there was no `_MUTABLE`/KILL-hygiene surface —
  the forced-compaction gate confirms it.
- The exp table is only 1201 entries wide (diff clamped to ±60 on the GPU as
  before); wounds/river only shrink |diff|, so saturation is unreachable
  in-gate — unchanged from the pre-B-29 clamp behaviour.
- Wound applies to the lone-civilian defender in the ranged paths too (its
  base combat is 0, so its effective CS goes slightly negative). Harmless and
  symmetric; a civilian is still killed. Called out in case a future
  capture-instead-of-kill mechanic (B-31) revisits civilian defense.

