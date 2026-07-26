# ROUND RESIDUALS (#71) — the nine-item + three-debt sweep

Owner goal 2026-07-26: B-8, B-18, B-17, B-26, B-23, B-24, B-27, A-5r,
A-9 residuals + the three debts. EXPERIMENTAL mode: no per-stage gates,
NO subagents, ONE ladder + parity-hunt at the very END.

## SCOPE REALITY — read first

This is roughly **6.85 of B's open weight plus 0.3 of A's, across ~10
independent mechanics**, several of which are full subsystems (tourism,
the Trader unit + roads, the dedication system, an Encampment HP pool =
a new attackable entity). For calibration: #70 moved 2.8 of weight with
five slices, needed four latent fixes, and consumed a full context
window WITH subagents. This goal is several times that, with subagents
disallowed. It will span multiple context windows — that is a fact
about the size, not a reason to stop. Work the order below; each item is
independently landable, so a context boundary costs nothing if this file
is kept current.

**HARD RULE (from #70): verify every fidelity premise against a real
Civ 6 source BEFORE writing code.** Two of #70's five premises were
fabrications found in this repo's own AUDIT text. The gates prove the two
engines agree, never that they agree with Civ 6. Each item below carries
its verification status.

## STATUS

- [x] **DEBT-2 religionAttackCS on city attacks — DONE, BOTH ENGINES.**
  VERIFIED: Crusade/Just War raise the UNIT's combat strength based on
  where the unit stands, not on what it hits, so a city target cannot
  exempt them. The recorded debt understated it — ALL SIX city-attack
  sites omitted the term, not just the ranged ones. TS now adds
  `religionAttackCS` at `attackCity`, `attackRivalCity`,
  `attackCityState`, and the `rngcs`/`vrngc`/`rngrc` rolls, ordered
  religion-then-aura to match the unit-vs-unit assembly.
  GPU DONE: `_rel_atk_cs` added immediately BEFORE
  the aura add (order is load-bearing for float association) at the four
  RIVAL-attacker sites — `_rival_attack_rival_city` (rcty), the rival
  `csty` block, `_hostile_city_attack`'s rival branch (pcty), and
  `_hostile_ranged_strike`'s city branch (vrngc). The four
  PLAYER-attacker sites are structurally 0 (`_rel_atk_cs` documents that
  the GPU player carries no religion — `holy_tile[:, 0]` is never set in
  any gate mode) — add a comment, not a call, matching the existing
  convention. The BARB `_attack_rival_city` site takes no term.
- [x] **DEBT-1 melee_test fixtures_o4 — DONE.** `SEED_OVERRIDES` is
  keyed by INDEX and tuned for the parity-contract roster (R_MAX 2);
  overriding a dying seed there would silently reshuffle the MAIN fixture
  set and invalidate the whole gate. Added `SEED_OVERRIDES_ALT`, a
  per-roster map consulted by the new `seedFor(s)` ONLY when R_MAX differs
  from 2 (3 rivals: index 15 → 9199, since 9196's player is wiped by t100
  under the post-#70 world). R_MAX 2 takes the identical old path, so the
  main fixtures are byte-unaffected. fixtures_o4 regenerated; melee_test
  prints "C3c MELEE OK".
- [x] **DEBT-3 — RESOLVED AS A NON-ISSUE (verified, no code change).**
  `Unit.owner` (types.ts) admits ONLY `'player' | 'barbarian' | 'rival'`,
  and no site anywhere in src/core constructs a city-state-owned unit —
  levied units belong to the LEVYING civ (A-12). So there is no CS unit
  plane for the GPU hostile scans to omit; the reported asymmetry cannot
  occur. This is the G-3 re-verify rule paying out again: the third
  #70-era "suspicious" note to dissolve under verification rather than
  need a fix.

## ORDER (cheapest and best-verified first)

1. **DEBT-2 GPU half** — finish what is already half-landed. No new
   premise to verify.
2. [x] **B-8 (0.1) — DONE, BOTH ENGINES.** Naval war-march targeting:
   rival ADMIRALs now march the war effort on the SAME chassis, target
   scan and ≤range stop as GENERALs (`rivalGeneralActions` /
   `_rival_general_actions`). VERIFIED: real Civ 6 Great Admirals are
   units you move with the fleet; an admiral held at the capital can
   never put its naval aura over the front. Only the aura's DOMAIN
   differs and that is decided at the roll sites by `inGeneralAura` /
   `_gen_aura_hit`, not by the walker. B-8's ONLY remaining residual is
   the controlled-rival RL mask, which rides #50 — so B-8 is complete
   for everything outside #50.
3. **A-9 (0.2)** — NEIGHBORHOOD. **PREMISE VERIFIED 2026-07-26, spec
   below is sourced — implement directly, do NOT re-derive:**
   * housing BY APPEAL TIER: Breathtaking 6 / Charming 5 / Average 4 /
     Uninviting 3 / Disgusting 2;
   * unlocked by the URBANIZATION civic;
   * NO per-city limit (it is not a specialty district, so
     `countsTowardLimit` must be FALSE — note the P4 boost bug where
     AQUEDUCT wrongly counted toward "build any specialty district");
   * `districtMaintenance` already exempts NEIGHBORHOOD (0 gold).
   **RECON RESULT — the TS side is ALREADY DONE.** `computeHousing`
   (city.ts) already runs `total += appealTier(tileAppeal(map, dt)).housing`
   for a complete unpillaged NEIGHBORHOOD, and the districts row already
   carries `countsTowardLimit: false`, `allowMultiple: true` and
   `housing: 0 // appeal-based`. So A-9's REAL remaining work is only:
   (a) add NEIGHBORHOOD to `SCAFFOLD_DISTRICTS` — it is deliberately held
   out with a now-STALE comment ("stays out pending the appeal-housing
   stage"; that stage has landed), so today nothing ever BUILDS one;
   (b) the GPU side, which has NO NEIGHBORHOOD handling at all (grep finds
   it only in the exporter's maintenance-exempt list) and NO appeal plane —
   the plane must be derived and kept live against feature/terrain changes,
   which is the whole cost of this item.
   VERIFY BEFORE (a): that `appealTier().housing` really returns 6/5/4/3/2,
   and that flipping the scaffold does not trip the specialty-district
   BOOST predicate (the P4 AQUEDUCT bug) — `countsTowardLimit: false`
   should already protect it, but the GPU `_detect_boosts` twin must agree.
4. **B-18 (0.2)** — apostles + theological combat on the existing
   missionary chassis. VERIFY apostle combat rules.
5. **B-26 (0.6)** — cliffs, naval barbs, scout-then-raid escalation.
   Cliffs need a new map property (mapgen + movement + adjacency);
   naval barbs need barb hulls on the water plane.
6. **B-25/B-27 (1.0)** — the improvements roster tail. Blocked on appeal
   and naval, so land it AFTER 3 and 5.
7. **A-5r (0.1)** — tile purchase. `buyTile`/`tilePurchaseCost` are
   TS-player-only with no GPU twin on any seat. Scripted-rival tile
   purchase is landable now; the PLAYER verb rides #50.
8. **B-23 (0.9)** — Trader unit + roads. A real subsystem: a new unit
   class that physically walks a route and lays roads, plus a road plane
   affecting movement cost on both engines.
9. **B-24 (0.9)** — the dedication system. Owner-enumerated: Golden Age
   bonuses, the Normal/Dark dedication converting to era score, and the
   HEROIC Age (Dark→Golden grants three dedications) which needs a
   `prevAge` substrate — a new per-civ column on both engines.
10. **B-17 (0.3)** — Encampment HP pool + movement block. LAST because
    it is the largest despite its small weight: in real Civ 6 these are
    ONE mechanic (enemies cannot enter until the district's own HP is
    reduced), i.e. a new ATTACKABLE ENTITY with targeting, damage, heal,
    capture and a movement-legality term in every walker on both
    engines. #70 deliberately scoped it out for exactly this reason.

## CLOSING LADDER (once, at the end)

tsc → full vitest → re-export (READ output) → scripted parity ALONE as
the tripwire → then rollout + forced compaction CONCURRENTLY (every item
here touches units/slots) → standalone poke-lane sweep → ONE battery →
AUDIT close-out with the table RE-SUMMED from per-item weights.

Expect a multi-mechanic hunt: batching trades away attribution, so a red
gate will not name its cause. `.claude/scratchpad/` one-seed probes
(~15s) beat the 280s gate while localizing — write one early.
