"""The city events, their behaviour trees and the contracts on the GPU
(`gpu/core/sim_citytrees.py`): one city-state city of
tests/cpu/minors/city-trees-scenario.json runs its turns of its city AI, each
of the scenario's variants a game of one batch, against the per-turn digests
tests/cpu/minors/city-trees.test.ts pins (city-trees-pins.json); the City
Defense event's start and its slot.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/city_trees_test.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "gpu"))

from core import load_rules
from core.sim_citytrees import (
    GOAL_CIVIC,
    GOAL_PLOT,
    GOAL_TECH,
    SLOT_DEFENSE,
    CityAi,
    building_event,
    city_contracts,
    city_tree_tables,
    contract_built,
    defense_event,
    district_event,
    free_slots,
    goals_reached,
    improvement_event,
    in_hand_check,
    pick_improvement,
    queue_contract,
    takes_turn,
    tick_city_trees,
)

FX = 256
FX_MIN = -9999 * FX
SC = json.loads((ROOT / "tests/cpu/minors/city-trees-scenario.json").read_text(encoding="utf-8"))
L = torch.long


class Game:
    """one variant's world: the city, its units, research and production"""

    def __init__(self, T, variant: dict):
        self.sc = {**SC, **variant}
        self.techs = {T.tech_code[t] for t in SC["techs"]}
        self.civics = {T.civic_code[c] for c in SC["civics"]}
        self.held: list[int] = []
        self.placed: list[tuple[int, int]] = []
        self.improved: set[int] = set()
        self.units: list[dict] = []
        self.next_unit = 40
        self.ties = list(variant["ties"])
        self.pending: list[tuple] = []
        self.current = None  # (unit, building, district, plot)
        self.left = 0
        self.cleared = 0
        self.founded_turn = -99
        self.current_value = FX_MIN
        self.researching = None
        self.spent: set[int] = set()


class World:
    """the scenario's world over the batch (`TreeWorld`)"""

    def __init__(self, T, games: list[Game], turn: int):
        self.T, self.g, self.turn = T, games, turn
        self.B = len(games)
        self.seat = SC["seat"]
        ni, nd = len(T.improvement_rows), len(T.district_rows)
        evs = [g.sc["evals"] for g in games]
        P = max(len(ev) for ev in evs)
        imps = torch.full((self.B, P, ni), FX_MIN, dtype=L)
        dists = torch.full((self.B, P, nd), FX_MIN, dtype=L)
        for b, ev in enumerate(evs):
            for p, e in enumerate(ev):
                for k, v in e["improvements"].items():
                    imps[b, p, T.improvement_row[k]] = v * FX
                for k, v in e["districts"].items():
                    dists[b, p, T.district_row[k]] = v * FX

        def col(key):
            return torch.tensor([[bool(ev[p][key]) if p < len(ev) else False for p in range(P)] for ev in evs])
        self._evals = {"plot": torch.tensor([[ev[p]["plot"] if p < len(ev) else -1 for p in range(P)] for ev in evs], dtype=L),
                       "valid": torch.tensor([[p < len(ev) for p in range(P)] for ev in evs]), "owned": col("owned"),
                       "improvable": col("improvable"), "district_ok": col("districtOk"), "near_owned": col("nearOwned"),
                       "imps": imps, "dists": dists}
        self._bt = torch.full((self.B, len(T.building_rows)), FX_MIN, dtype=L)
        for k, v in SC["buildings"].items():
            self._bt[:, T.building_row[k]] = v * FX
        self._ut = torch.full((self.B, len(T.unit_rows)), FX_MIN, dtype=L)
        for k, v in SC["units"].items():
            self._ut[:, T.unit_row[k]] = v * FX

    def _per(self, fn, *xs):
        shape = xs[0].shape
        flat = [x.reshape(self.B, -1) for x in xs]
        out = torch.tensor([[fn(b, *[int(f[b, j]) for f in flat]) for j in range(flat[0].shape[1])] for b in range(self.B)])
        return out.reshape(shape)

    # the city
    def home_city(self):
        return SC["city"]

    def city_alive(self):
        return True

    def city_plot(self):
        return torch.full((self.B,), SC["cityPlot"], dtype=L)

    def under_threat(self):
        return False

    def _cur(self, k):
        return torch.tensor([(g.current[k] if g.current else -1) for g in self.g], dtype=L)

    def cur_unit(self):
        return self._cur(0)

    def cur_building(self):
        return self._cur(1)

    def cur_district(self):
        return self._cur(2)

    def founded_turn(self):
        return torch.tensor([g.founded_turn for g in self.g], dtype=L)

    def current_value(self):
        return torch.tensor([g.current_value for g in self.g], dtype=L)

    def building_blocked(self, row):
        return self._per(lambda b, r: r in self.g[b].held, row).bool()

    def district_blocked(self, row, plot):
        return self._per(lambda b, r: any(d == r for d, _ in self.g[b].placed), row).bool()

    def can_train(self, row):
        return True

    def trains_sea(self):
        return False

    def build_turns(self, unit, bld, dist):
        return SC["buildTurns"]

    def item_value(self, unit, bld, dist, plot):
        u = torch.where(unit >= 0, self._ut.gather(1, unit.clamp(min=0).unsqueeze(1)).squeeze(1), FX_MIN)
        b = torch.where(bld >= 0, self._bt.gather(1, bld.clamp(min=0).unsqueeze(1)).squeeze(1), FX_MIN)
        return torch.where(unit >= 0, u, b)

    def building_held(self, row):
        return self._per(lambda b, r: r in self.g[b].held or (self.g[b].current is not None and self.g[b].current[1] == r), row).bool()

    def district_held(self, row):
        return self._per(lambda b, r: any(d == r for d, _ in self.g[b].placed), row).bool()

    def threat(self):
        return -1

    def event_building(self):
        idx, val = [], []
        for b in range(self.B):
            best, bv = -1, FX_MIN
            for k in range(self._bt.shape[1]):
                v = int(self._bt[b, k])
                held = k in self.g[b].held or (self.g[b].current is not None and self.g[b].current[1] == k)
                if held or v <= bv:
                    continue
                best, bv = k, v
            idx.append(best)
            val.append(bv)
        return torch.tensor(idx, dtype=L), torch.tensor(val, dtype=L)

    def event_unit(self):
        idx, val = [], []
        for b in range(self.B):
            best, bv = -1, FX_MIN
            for k, u in enumerate(self.T.unit_rows):
                v = int(self._ut[b, k])
                if u["foundCity"] or u["buildCharges"] > 0 or u["combat"] == 0 or u["recon"] or v <= bv:
                    continue
                best, bv = k, v
            idx.append(best)
            val.append(bv)
        return torch.tensor(idx, dtype=L), torch.tensor(val, dtype=L)

    def evals(self):
        return self._evals

    def tables(self):
        return self._bt, self._ut

    # the seat
    def tech_held(self, code):
        return self._per(lambda b, c: c in self.g[b].techs, code).bool()

    def civic_held(self, code):
        return self._per(lambda b, c: c in self.g[b].civics, code).bool()

    def researching_tech(self, code):
        return self._per(lambda b, c: c == self.g[b].researching, code).bool()

    def researching_civic(self, code):
        return torch.zeros_like(code, dtype=torch.bool)

    def owns(self, plot):
        return self._per(lambda b, p: p in SC["owned"], plot).bool()

    def operation_live(self, ids):
        return False

    def start_operation(self, name, plot, mask):
        return -1

    def builder_type(self, imp):
        return torch.where(imp >= 0, self.T.unit_row["UNIT_BUILDER"], -1)

    def district_tie(self, mask):
        out = []
        for b in range(self.B):
            out.append(self.g[b].ties.pop(0) if bool(mask[b]) and self.g[b].ties else 0)
        return torch.tensor(out, dtype=L)

    def plot_city(self, plot):
        return self._per(lambda b, p: SC["city"] if p in SC["owned"] else -1, plot)

    def can_place_district(self, plot, d):
        return self._per(lambda b, p, r: r >= 0 and p in SC["districtSites"] and all(q != p for _, q in self.g[b].placed),
                         plot, d).bool()

    def can_improve(self, plot, imp):
        names = {i: r["type"] for i, r in enumerate(self.T.improvement_rows)}
        return self._per(lambda b, p, i: i >= 0 and p not in self.g[b].improved and [p, names[i]] in SC["canImprove"],
                         plot, imp).bool()

    def plot_owner(self, plot):
        return self._per(lambda b, p: self.seat if p in SC["owned"] else -1 if p in SC["unowned"] else 5, plot)

    def units(self):
        U = max([len(g.units) for g in self.g] + [1])
        out = {k: torch.full((self.B, U), -1, dtype=L) for k in ("id", "type", "plot", "charges")}
        out["valid"] = torch.zeros(self.B, U, dtype=torch.bool)
        for b, g in enumerate(self.g):
            for j, u in enumerate(g.units):
                for k in ("id", "type", "plot", "charges"):
                    out[k][b, j] = u[k]
                out["valid"][b, j] = True
        return out

    def distance(self, plots, plot):
        return (plots - plot.unsqueeze(1)).abs()

    def reach_this_turn(self, plot, moves, among):
        return True

    def turns_to(self, plot, among):
        return torch.ones_like(among, dtype=torch.long)

    def order(self, uid, kind, plot, imp, mask):
        for b in range(self.B):
            if not bool(mask[b]):
                continue
            g = self.g[b]
            u = int(uid[b])
            g.pending.append((u, kind, int(plot[b]), int(imp[b])))
            unit = next((x for x in g.units if x["id"] == u), None)
            if kind != "move" and (unit["charges"] if unit else 0) <= 1:
                g.spent.add(u)

    def unit_alive(self, ids):
        return self._per(lambda b, u: any(x["id"] == u for x in self.g[b].units) and u not in self.g[b].spent, ids).bool()

    def builders_make_wonders(self):
        return False

    def builders_make_districts(self):
        return False

    def clear_production(self, mask):
        for b in range(self.B):
            if bool(mask[b]):
                self.g[b].cleared += 1


def run(rules) -> list:
    T = city_tree_tables(rules)
    games = [Game(T, v) for v in SC["variants"]]
    B = len(games)
    ai = CityAi(T, T.trees_of("MINOR_CIV_DEFAULT_TRAIT"), B, 1, torch.device("cpu"))
    s = 0
    allm = torch.ones(B, dtype=torch.bool)
    tech_name = {v: k for k, v in T.tech_code.items()}
    civic_name = {v: k for k, v in T.civic_code.items()}
    imp_names = [r["type"] for r in T.improvement_rows]
    out = [[] for _ in range(B)]
    for t in range(1, SC["turns"] + 1):
        for g in games:
            for u, kind, plot, _imp in g.pending:
                unit = next((x for x in g.units if x["id"] == u), None)
                if unit is None:
                    continue
                if kind == "move":
                    unit["plot"] = plot
                else:
                    unit["charges"] -= 1
                    if kind == "improve":
                        g.improved.add(plot)
            g.units = [x for x in g.units if x["charges"] > 0]
            g.pending = []
            g.spent = set()
            for name in g.sc["gain"].get(str(t), []):
                g.techs.add(T.tech_code[name])
            r = g.sc["researching"].get(str(t))
            g.researching = T.tech_code[r] if r else None
        # the items in production complete
        built = torch.zeros(B, dtype=torch.bool)
        bu, bb, bd, bid = [torch.full((B,), -1, dtype=L) for _ in range(4)]
        for b, g in enumerate(games):
            if g.current is None:
                continue
            g.left -= 1
            if g.left:
                continue
            unit, bld, dist, plot = g.current
            if unit >= 0:
                bid[b] = g.next_unit
                g.units.append({"id": g.next_unit, "type": unit, "plot": SC["cityPlot"], "charges": int(T.unit_rows[unit]["buildCharges"])})
                g.next_unit += 1
            elif bld >= 0:
                g.held.append(bld)
            elif dist >= 0:
                g.placed.append((dist, plot))
            bu[b], bb[b], bd[b] = unit, bld, dist
            built[b] = True
            g.current = None
        w = World(T, games, t)
        contract_built(ai, s, SC["city"], bu, bb, bd, bid, built)
        goals_reached(ai, s, w, allm)
        free_slots(ai, s, w, allm)
        in_hand_check(ai, s, w, allm)
        best_imp = pick_improvement(ai, s, w, allm)
        building_event(ai, s, w, allm)
        district_event(ai, s, w, allm)
        improvement_event(ai, s, w, best_imp, allm)
        idle = torch.tensor([g.current is None for g in games])
        hand = city_contracts(ai, s, w, idle)
        take = idle & takes_turn(ai, s, hand, SC["bestUnit"] * FX, SC["bestProject"] * FX)
        ai.in_hand[:, s] = torch.where(idle & ~take, -1, ai.in_hand[:, s])
        hj = hand.clamp(min=0)
        cu, cb, cd, cp = ai.c_unit[:, s].gather(1, hj.unsqueeze(1)).squeeze(1), ai.c_building[:, s].gather(1, hj.unsqueeze(1)).squeeze(1), \
            ai.c_district[:, s].gather(1, hj.unsqueeze(1)).squeeze(1), ai.c_plot[:, s].gather(1, hj.unsqueeze(1)).squeeze(1)
        ok = torch.tensor([(int(cb[b]) not in games[b].held) if int(cb[b]) >= 0
                           else (all(d != int(cd[b]) for d, _ in games[b].placed) if int(cd[b]) >= 0 else True) for b in range(B)])
        q = queue_contract(ai, s, hand, w, ok, take)
        for b, g in enumerate(games):
            if bool(q[b]):
                g.current = (int(cu[b]), int(cb[b]), int(cd[b]), int(cp[b]))
                g.left = SC["buildTurns"]
                g.current_value = int(ai.c_value[b, s, int(hand[b])])
        w = World(T, games, t)
        tick_city_trees(ai, s, w, t, allm)
        for b, g in enumerate(games):
            trees = sorted((int(ai.tr_id[b, s, k]), k) for k in range(6) if bool(ai.tr_alive[b, s, k]))
            cons = []
            for j in sorted(range(ai.c_id.shape[2]), key=lambda j: int(ai.c_id[b, s, j])):
                cid = int(ai.c_id[b, s, j])
                if cid < 0:
                    continue
                kind = int(ai.c_goal_kind[b, s, j])
                goal = int(ai.c_goal[b, s, j])
                item = (T.unit_rows[int(ai.c_unit[b, s, j])]["type"] if int(ai.c_unit[b, s, j]) >= 0
                        else T.building_rows[int(ai.c_building[b, s, j])]["type"] if int(ai.c_building[b, s, j]) >= 0
                        else T.district_rows[int(ai.c_district[b, s, j])]["type"] if int(ai.c_district[b, s, j]) >= 0
                        else tech_name[goal] if kind == GOAL_TECH else civic_name[goal] if kind == GOAL_CIVIC
                        else f"PLOT {int(ai.c_plot[b, s, j])}" if kind == GOAL_PLOT else "")
                cons.append([cid, int(ai.c_tree[b, s, j]), item, int(ai.c_progress[b, s, j]), int(ai.c_value[b, s, j]),
                             int(ai.c_city[b, s, j]), int(ai.c_plot[b, s, j]), int(ai.c_turns[b, s, j])])
            res = sorted((int(ai.r_plot[b, s, r]), int(ai.r_tree[b, s, r]), int(ai.r_value[b, s, r]))
                         for r in range(ai.r_plot.shape[2]) if int(ai.r_plot[b, s, r]) >= 0)
            cur = ""
            if g.current is not None:
                u_, b_, d_, _ = g.current
                cur = (T.unit_rows[u_]["type"] if u_ >= 0 else T.building_rows[b_]["type"] if b_ >= 0 else T.district_rows[d_]["type"])
            out[b].append({
                "t": t,
                "slots": [int(x) for x in ai.slots[b, s]],
                "trees": [[k, tid, sorted(int(u) for u in ai.tr_units[b, s, k] if int(u) >= 0)] for tid, k in trees],
                "contracts": cons,
                "res": [list(r) for r in res],
                "hand": int(ai.in_hand[b, s]),
                "orders": [[u, k, p, imp_names[i] if i >= 0 else ""] for u, k, p, i in g.pending],
                "current": cur,
                "cleared": g.cleared,
            })
    return out


class Threat:
    """a city threatened in the first game only; its operation starts as
    tree 500, then no longer runs"""

    def __init__(self):
        self.started = []
        self.live = True

    def threat(self):
        return torch.tensor([0, -1])

    def city_plot(self):
        return torch.tensor([70, 70])

    def start_operation(self, name, plot, mask):
        self.started.append((name, plot[mask].tolist()))
        return torch.where(mask, 500, -1)

    def operation_live(self, ids):
        return torch.full_like(ids, self.live, dtype=torch.bool)


def test_defense(rules) -> None:
    """THE CITY DEFENSE EVENT (`defenseEvent`): the list's operation at the
    threatened city's plot, its tree in the defence slot while it runs
    (tests/cpu/minors/city-contracts.test.ts)"""
    T = city_tree_tables(rules)
    ai = CityAi(T, T.trees_of("MINOR_CIV_DEFAULT_TRAIT"), 2, 1, torch.device("cpu"))
    w = Threat()
    both = torch.ones(2, dtype=torch.bool)
    op = T.event_lists["MINOR_CIV_DEFAULT_TRAIT"]["CITY_UNDER_THREAT"]
    defense_event(ai, 0, w, op, both)
    assert w.started == [("City Defense", [70])], w.started
    assert ai.slots[:, 0, SLOT_DEFENSE].tolist() == [500, -1]
    free_slots(ai, 0, w, both)
    assert ai.slots[:, 0, SLOT_DEFENSE].tolist() == [500, -1]
    w.live = False
    free_slots(ai, 0, w, both)
    assert ai.slots[:, 0, SLOT_DEFENSE].tolist() == [-1, -1]
    print("  the City Defense event OK")


def main() -> None:
    test_defense(load_rules())
    got = run(load_rules())
    want = json.loads((ROOT / "tests/cpu/minors/city-trees-pins.json").read_text(encoding="utf-8"))
    for v, (g, p) in enumerate(zip(got, want)):
        for d, e in zip(g, p):
            assert d == e, (v, d, e)
    assert len(got) == len(want) and all(len(g) == len(p) for g, p in zip(got, want))
    print(f"city_trees_test: {len(got)} variants x {SC['turns']} turns OK")
    print("CITY TREES OK")


if __name__ == "__main__":
    main()
