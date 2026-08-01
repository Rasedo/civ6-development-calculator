"""Batched RL environment over BatchSim: masks → actions → score-delta reward.

Fixed-horizon lockstep episodes (every game resets together, like the ES
trainer's fixed-length rollouts): call reset(), then step() `horizon`
times, reading masks() before each step to constrain the policy's five
heads — per-city production, research, civics, per-unit orders, envoys.
Rewards telescope to empireScore(state, 'balanced') at the horizon, the
exact fitness the TS benchmarks report.

Two observation streams feed the phase-5 policy:

  observe()        [B, obs_size]  — empire + per-city-slot features
  unit_features()  [B, P, 8]      — per unit slot, for the units head
                                    (alive, type, hp, position, and the
                                    bearing to the nearest barbarian camp)

reset(scramble=...) re-seeds each game's in-state mulberry32 per episode,
so consecutive episodes see different barbarian spawns, quests, wars and
disasters on the same maps; reset() without it reproduces the fixture's
exact stream — the parity setting.
"""

from __future__ import annotations

import torch

from .engine import BatchSim, Rules, P_MAX

def n_unit_acts(rules: Rules) -> int:
    """#51/S0.3: the unit head's width, from the SHIPPED enum — never a literal.

    This was `N_UNIT_ACTS = 17` on both sides while the real mask has been 26
    wide since the resource-improvement columns landed, so building a Policy
    against the live env raised a size mismatch. No battery lane exercised the
    trainer, which is why a 9-column gap sat in a green tree.
    """
    names = (rules.actions or {}).get("unit", [])
    if not names:
        raise ValueError("rules.actions.unit missing - re-export (npm run gpu:export)")
    return len(names)
from .rng import hash_keys

_M32 = (1 << 32) - 1
_GLOBAL_F = 14
_PER_CS_F = 3
_PER_RIVAL_F = 3
_PER_CITY_F = 9
UNIT_FEATURES = 8


class BatchEnv:
    def __init__(self, fixtures: list[dict], rules: Rules, device: str = "cpu", dtype=torch.float32, horizon: int | None = None):
        self.sim = BatchSim(fixtures, rules, device=device, dtype=dtype)
        # None -> the game's own length: scenario turnLimit (TS TURN_LIMIT).
        # Episodes end when the score victory fires; training past it would
        # optimize turns the scoreboard never sees.
        self.horizon = int(rules.turn_limit) if horizon is None else horizon
        self._episode = 0
        self._last_score = self.sim.empire_score()
        s = self.sim
        # odd-r offset → axial, for hex distances in unit features
        t = torch.arange(s.T, device=s.device)
        row = torch.div(t, s.W, rounding_mode="floor")
        col = t % s.W
        self._ax_q = (col - torch.div(row - (row & 1), 2, rounding_mode="floor")).to(torch.long)
        self._ax_r = row.to(torch.long)

    @property
    def obs_size(self) -> int:
        s = self.sim
        return _GLOBAL_F + _PER_CS_F * s.S + _PER_RIVAL_F * s.R + _PER_CITY_F * s.C

    def reset(self, scramble: int | None = None) -> torch.Tensor:
        """Restore the initial state (all games, lockstep).

        scramble=None replays the fixture's recorded RNG stream — identical
        worlds every episode, and what the parity gates compare against.
        Passing an int re-seeds each game's mulberry32 from (scramble, game
        index, episode counter): same maps, fresh barbarians/quests/wars/
        disasters each episode — the training setting.
        """
        self.sim.reset()
        if scramble is not None:
            s = self.sim
            h = hash_keys(scramble, torch.arange(s.B, dtype=torch.int64), self._episode)
            s.rng_state.copy_((h & _M32).to(s.rng_state.dtype).to(s.device))
            self._episode += 1
        self._last_score = self.sim.empire_score()
        return self.observe()

    def _seat_rival(self, seat: int) -> int:
        """Seat k>0 maps to rival k-1; seat 0 is the player civ."""
        r = seat - 1
        if r < 0 or r >= self.sim.R:
            raise ValueError(f"seat {seat} out of range (O = {self.sim.R + 1})")
        return r

    def masks(self, seat: int = 0) -> dict[str, torch.Tensor]:
        """production [B, C, NB+2+NU], tech [B, NT], civic [B, NC], units
        [B, P, 13], envoy [B, S] — all-False rows mean no decision pends
        there this turn. Seat k>0 (C2b): the controlled rival's decision
        space in the same layouts; units/envoy all-False (the rival unit
        AI stays scripted until C3-prep; rivals have no envoys)."""
        if seat != 0:
            r = self._seat_rival(seat)
            s = self.sim
            m = s.rival_masks(r)
            prod = m["production"][:, : s.C]  # city axis mirrors the player width
            pw = s.production_mask().shape[2]
            if prod.shape[2] < pw:  # purchase block active: pad all-False
                pad = torch.zeros(s.B, prod.shape[1], pw - prod.shape[2], dtype=torch.bool, device=s.device)
                prod = torch.cat([prod, pad], dim=2)
            return {
                "war": m["war"],  # C3-sym: the rival's war head (declare/peace vs the player)
                "production": prod,
                "tech": m["tech"],
                "civic": m["civic"],
                "units": s.rival_unit_mask(r),  # C3-prep: the rival units head is live
                "envoy": torch.zeros(s.B, s.S, dtype=torch.bool, device=s.device),
            }
        return {
            "war": self.sim.war_mask(),  # V-W1 active: [B, 2R] declare/peace
            "production": self.sim.production_mask(),
            "tech": self.sim.tech_mask(),
            "civic": self.sim.civic_mask(),
            "units": self.sim.unit_action_mask(),
            "envoy": self.sim.envoy_mask(),
        }

    def step(
        self,
        production: torch.Tensor | None = None,
        tech: torch.Tensor | None = None,
        civic: torch.Tensor | None = None,
        units: torch.Tensor | None = None,
        envoy: torch.Tensor | None = None,
        war: torch.Tensor | None = None,
        seat: int = 0,
    ) -> tuple[torch.Tensor, torch.Tensor, bool]:
        """Returns (obs [B, F], reward [B], done). done is batch-wide —
        lockstep fixed-horizon episodes; the caller resets. Seat k>0
        (C2b): actions route into the controlled rival BEFORE the world
        steps; reward is that rival's score delta."""
        if seat != 0:
            r = self._seat_rival(seat)
            self.sim.controlled[:, r] = True
            self.sim.apply_rival_actions(r, production=production, tech=tech, civic=civic, war=war)
            if units is not None:
                self.sim._apply_rival_unit_actions(r, units)
            prev = getattr(self, "_last_rival_score", None)
            if prev is None or prev.get("r") != r:
                prev = {"r": r, "score": self.sim.rival_score(r)}
            self.sim.step()
            score = self.sim.rival_score(r)
            reward = score - prev["score"]
            self._last_rival_score = {"r": r, "score": score}
            return self.observe(seat), reward, self.sim.turn > self.horizon
        self.sim.step(production=production, tech=tech, civic=civic, units=units, envoy=envoy, war=war)
        score = self.sim.empire_score()
        reward = score - self._last_score
        self._last_score = score
        return self.observe(seat), reward, self.sim.turn > self.horizon

    def _escalators(self, seat: int, techs, civics, builders, settler_cost) -> list:
        """#51/S8.4b (#66): the three production costs that ESCALATE with a
        seat's own state — district, settler, builder.

        Every other production price is static rules data, which the ladder
        already loads from `rules.json`. Static data is NOT state and does not
        belong in an observation; carrying 122 cost floats to express three
        moving numbers would be noise a policy has to learn to ignore. Computed
        HERE, with the engine's own helpers, so the escalation rule stays in the
        engine — the same reason research emits effective cost rather than a
        boost flag."""
        s = self.sim
        d = s.dtype
        dcp = s.rules.district_cost
        t_pct = techs.sum(dim=1).to(d) / max(s.rules_dev.t_cost.shape[0], 1)
        c_pct = civics.sum(dim=1).to(d) / max(s.rules_dev.c_cost.shape[0], 1)
        d_cost = torch.floor(dcp.get("base", 32) * (1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct)))
        return [d_cost / 1000.0, settler_cost / 1000.0, s._builder_cost(builders).to(d) / 1000.0]

    def observe(self, seat: int = 0) -> torch.Tensor:
        """[B, obs_size] — empire globals, city-state courtship, rival
        posture, and per-city-slot economy/defense, all roughly unit-scaled.
        The schema is seat-invariant by design (C2): seat k>0 renders the
        same layout from the rival tensor family (C2b)."""
        if seat != 0:
            return self._observe_rival(self._seat_rival(seat))
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        dev = s.device
        need = s._growth_needed(s.pop).clamp(min=1)
        denom = s.cur_cost.clamp(min=1)
        owned = (s.owner.unsqueeze(1) == torch.arange(C, device=dev).view(1, C, 1)).sum(dim=2).to(d)
        per_city = torch.stack(
            [
                s.alive.to(d),
                s.pop.to(d) / 10.0,
                s.food_box / need,
                torch.where(s.current >= 0, s.progress / denom, torch.zeros_like(s.progress)),
                s.culture_box / s._border_cost(s.tiles_acquired).clamp(min=1),
                owned / 20.0,
                torch.where(s.alive, s.city_hp, torch.zeros_like(s.city_hp)).to(d) / 200.0,
                s.loyalty.to(d) / 100.0,
                (s.current >= 0).to(d),
            ],
            dim=2,
        )  # [B, C, 9]
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.techs.sum(dim=1).to(d) / max(s.techs.shape[1], 1),
                s.civics.sum(dim=1).to(d) / max(s.civics.shape[1], 1),
                s.tech_prog / 50.0,
                s.civic_prog / 50.0,
                s.settlers.to(d),
                s.settlers_queued.to(d),
                s.alive.sum(dim=1).to(d) / C,
                (s.treasury / 200.0).clamp(max=5.0),
                s.envoys_avail.to(d) / 5.0,
                s.influence / 100.0,
                s.n_camps.to(d) / 5.0,
                s.u_alive.sum(dim=1).to(d) / 10.0,
                s.p_alive.sum(dim=1).to(d) / 10.0,
            ],
            dim=1,
        )  # [B, 14]
        cs = torch.stack(
            [
                s.cs_met.to(d),
                s.cs_envoys.to(d) / 6.0,
                (s.cs_quest > 0).to(d),
            ],
            dim=2,
        )  # [B, S, 3]
        riv = torch.stack(
            [
                (s.r_alive & s.r_atwar).to(d),
                s.r_warturns.to(d) / 14.0,
                (s.rc_alive.sum(dim=2) * s.r_alive.long()).to(d) / 6.0,
            ],
            dim=2,
        )  # [B, R, 3]
        # #51/S8.4 (#66): EFFECTIVE research cost per option — the quantity the
        # decision actually uses, not the boost flag it derives from. Emitting
        # flags would force the policy to apply `boosted ? base*(1-frac) : base`
        # itself, and that formula is a RULE: it must live in the engine, or a
        # rule leaks into the policy and the two can drift.
        #
        # FULL WIDTH on purpose, unmasked. The mask carries legality separately;
        # what the full vector buys is PLANNING — a boosted tech several prereqs
        # away should change which branch a policy walks toward now, and masking
        # to the legal frontier would delete exactly that signal.
        return torch.cat([emp, cs.reshape(B, -1), riv.reshape(B, -1), per_city.reshape(B, -1),
                          torch.stack(self._escalators(0, s.techs, s.civics, s.builders_trained,
                                                      (s.rules.settler_base + s.rules.settler_per_city
                                                       * (s.alive.sum(dim=1) - 1 + s.settlers).clamp(min=0).to(d))), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.tech_boosted, 0).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.civic_boosted, 0, is_civic=True).to(d) / 1000.0], dim=1)

    def _rival_unit_features(self, r: int) -> torch.Tensor:
        """[B, P, 8] the player unit-feature layout over the rival's slot
        map: alive, type, hp, axial position, camp bearing zeros (the
        scripted hunt heuristic is a player-policy feature)."""
        s = self.sim
        d = s.dtype
        B = s.B
        smap = s.rival_slot_map(r)
        present = smap >= 0
        sc = smap.clamp(min=0)
        tile = s.v_tile.gather(1, sc).clamp(min=0)
        out = torch.stack(
            [
                present.to(d),
                s.v_type.gather(1, sc).to(d) / 10.0,
                s.v_hp.gather(1, sc).to(d) / 100.0,
                self._ax_q[tile].to(d) / 20.0,
                self._ax_r[tile].to(d) / 20.0,
                torch.zeros(B, P_MAX, dtype=d, device=s.device),
                torch.zeros(B, P_MAX, dtype=d, device=s.device),
                s.v_charges.gather(1, sc).to(d) / 3.0,
            ],
            dim=2,
        )
        return out * present.unsqueeze(2).to(d)

    def _observe_rival(self, r: int) -> torch.Tensor:
        """The seat-invariant obs layout rendered from rival r's tensors:
        my empire = the rc_*/r_* family (slots beyond C invisible — RC>C by
        flips only), the CS block zeros (no rival courtship), the rival
        block's slot 0 = THE PLAYER viewed as an opponent, then the other
        rivals.

        #51/S8.1c: this used to zero treasury/envoys/influence and render
        loyalty as a constant 1.0, with comments saying rivals had no such
        state. Those comments were TRUE WHEN WRITTEN and the planes landed
        later — `r_treasury`, `r_influence`, `r_envoys_avail` and `rc_loyalty`
        all exist and are live. A policy driving a rival was therefore shown a
        civ with no money, no influence, no envoys and perfect loyalty
        everywhere. Nothing caught it because NOTHING COMPARES OBSERVATIONS:
        parity compares trace columns and an observation is not one. Same
        invisibility as #62 (city-state war state) and #63 (antiquity sites).
        `seatTurn.ts:observeSeat` is now the reference for this layout."""
        s = self.sim
        d = s.dtype
        B, C = s.B, s.C
        dev = s.device
        pop = s.rc_pop[:, r, :C].to(d)
        alive = s.rc_alive[:, r, :C]
        needs = s._growth_needed(s.rc_pop[:, r, :C]).clamp(min=1)
        denom = s.rc_cost[:, r, :C].clamp(min=1)
        per_city = torch.stack(
            [
                alive.to(d),
                pop / 10.0,
                s.rc_growth[:, r, :C].to(d) / needs.to(d),
                torch.where(s.rc_current[:, r, :C] >= 0, s.rc_progress[:, r, :C].to(d) / denom.to(d), torch.zeros_like(pop)),
                torch.zeros(B, C, dtype=d, device=dev),  # no per-city border box
                s.rc_acquired[:, r, :C].to(d) / 20.0 if hasattr(s, "rc_acquired") else torch.zeros(B, C, dtype=d, device=dev),
                torch.where(alive, s.rc_hp[:, r, :C].to(d), torch.zeros_like(pop)) / 200.0,
                s.rc_loyalty[:, r, :C].to(d) / 100.0,  # #51/S8.1c: rc_loyalty EXISTS
                (s.rc_current[:, r, :C] >= 0).to(d),
            ],
            dim=2,
        )  # [B, C, 9]
        n_own_units = (s.v_alive & (s.v_civ == r)).sum(dim=1).to(d)
        emp = torch.stack(
            [
                torch.full((B,), float(s.turn) / self.horizon, dtype=d, device=dev),
                s.r_techs[:, r].sum(dim=1).to(d) / max(s.r_techs.shape[2], 1),
                s.r_civics[:, r].sum(dim=1).to(d) / max(s.r_civics.shape[2], 1),
                s.r_tech_prog[:, r].to(d) / 50.0,
                s.r_civic_prog[:, r].to(d) / 50.0,
                # #51/S8.1c: field 5 is the seat's BANKED settlers and field 6 is
                # how many are QUEUED — the player renders exactly that. This
                # rendered the queued COUNT in field 5 and a mere BOOLEAN in
                # field 6, so the two fields meant different things depending on
                # which seat you asked. `r_settlers` is the rival's bank and has
                # existed since S4.1r ("one plane, one rule").
                s.r_settlers[:, r].to(d),
                (s.rc_current[:, r] == 0).sum(dim=1).to(d),
                s.rc_alive[:, r].sum(dim=1).to(d) / C,
                (s.r_treasury[:, r] / 200.0).clamp(max=5.0),  # #51/S8.1c: r_treasury EXISTS
                s.r_envoys_avail[:, r].to(d) / 5.0,  # #51/S8.1c: r_envoys_avail EXISTS
                s.r_influence[:, r].to(d) / 100.0,  # #51/S8.1c: r_influence EXISTS
                s.n_camps.to(d) / 5.0,
                s.u_alive.sum(dim=1).to(d) / 10.0,
                n_own_units / 10.0,
            ],
            dim=1,
        )  # [B, 14]
        cs = torch.zeros(B, s.S, _PER_CS_F, dtype=d, device=dev)
        # opponents: slot 0 = the player, then the other rivals in order
        opp_cols = [
            torch.stack(
                [
                    (s.r_alive[:, r] & s.r_atwar[:, r]).to(d),  # the war IS vs the player
                    s.r_warturns[:, r].to(d) / 14.0,
                    s.alive.sum(dim=1).to(d) / 6.0,
                ],
                dim=1,
            )
        ]
        for o in range(s.R):
            if o == r:
                continue
            opp_cols.append(
                torch.stack(
                    [
                        (s.r_alive[:, o] & s.r_atwar[:, o]).to(d),
                        s.r_warturns[:, o].to(d) / 14.0,
                        (s.rc_alive[:, o].sum(dim=1) * s.r_alive[:, o].long()).to(d) / 6.0,
                    ],
                    dim=1,
                )
            )
        riv = torch.stack(opp_cols, dim=1)  # [B, R, 3]
        # #51/S8.4 (#66): EFFECTIVE research cost per option — the quantity the
        # decision actually uses, not the boost flag it derives from. Emitting
        # flags would force the policy to apply `boosted ? base*(1-frac) : base`
        # itself, and that formula is a RULE: it must live in the engine, or a
        # rule leaks into the policy and the two can drift.
        #
        # FULL WIDTH on purpose, unmasked. The mask carries legality separately;
        # what the full vector buys is PLANNING — a boosted tech several prereqs
        # away should change which branch a policy walks toward now, and masking
        # to the legal frontier would delete exactly that signal.
        return torch.cat([emp, cs.reshape(B, -1), riv.reshape(B, -1), per_city.reshape(B, -1),
                          torch.stack(self._escalators(r + 1, s.r_techs[:, r], s.r_civics[:, r],
                                                      s.r_builders_trained[:, r] if hasattr(s, "r_builders_trained")
                                                      else torch.zeros(B, dtype=torch.long, device=dev),
                                                      torch.zeros(B, dtype=d, device=dev)), dim=1),
                          s._eff_cost(s.rules_dev.t_cost.unsqueeze(0).expand(B, -1), s.r_tech_boosted[:, r], r + 1).to(d) / 1000.0,
                          s._eff_cost(s.rules_dev.c_cost.unsqueeze(0).expand(B, -1), s.r_civic_boosted[:, r], r + 1, is_civic=True).to(d) / 1000.0], dim=1)

    def unit_features(self, seat: int = 0) -> torch.Tensor:
        """[B, P, 8] per player-unit-slot features for the units head:
        alive, type, hp, map position, and range/bearing to the nearest
        barbarian camp (zeros when no camp stands — the head then has
        nothing to hunt). Seat k>0: zeros — a controlled rival's unit head
        is masked off until C3-prep, so there is nothing to featurize."""
        if seat != 0:
            return self._rival_unit_features(self._seat_rival(seat))
        s = self.sim
        d = s.dtype
        B = s.B
        tile = s.p_tile.clamp(min=0)
        uq, ur = self._ax_q[tile], self._ax_r[tile]  # [B, P]
        camp = s.camp_tile  # [B, K], -1 padded
        live_camp = camp >= 0
        cq, cr = self._ax_q[camp.clamp(min=0)], self._ax_r[camp.clamp(min=0)]  # [B, K]
        dq = cq.unsqueeze(1) - uq.unsqueeze(2)  # [B, P, K]
        dr = cr.unsqueeze(1) - ur.unsqueeze(2)
        dist = (dq.abs() + dr.abs() + (dq + dr).abs()) // 2
        dist = torch.where(live_camp.unsqueeze(1), dist, torch.full_like(dist, 9999))
        near_d, near_k = dist.min(dim=2)  # [B, P]
        has_camp = live_camp.any(dim=1, keepdim=True)  # [B, 1]
        ndq = dq.gather(2, near_k.unsqueeze(2)).squeeze(2)
        ndr = dr.gather(2, near_k.unsqueeze(2)).squeeze(2)
        alive = s.p_alive
        z = torch.zeros(B, P_MAX, dtype=d, device=s.device)
        keep = alive & has_camp
        feats = torch.stack(
            [
                alive.to(d),
                torch.where(alive, s.p_type, torch.zeros_like(s.p_type)).to(d) / max(len(s.rules.units or []), 1),
                torch.where(alive, s.p_hp, torch.zeros_like(s.p_hp)).to(d) / 100.0,
                torch.where(alive, (tile % s.W).to(d) / s.W, z),
                torch.where(alive, torch.div(tile, s.W, rounding_mode="floor").to(d) / s.H, z),
                torch.where(keep, (near_d.to(d) / 20.0).clamp(max=1.0), z),
                torch.where(keep, (ndq.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
                torch.where(keep, (ndr.to(d) / 10.0).clamp(min=-1.0, max=1.0), z),
            ],
            dim=2,
        )  # [B, P, 8]
        return feats
