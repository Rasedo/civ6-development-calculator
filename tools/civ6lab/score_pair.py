"""civ6lab score_pair — B-82-S2: what ONE building adds to CATEGORY_EMPIRE.

    python tools/civ6lab/score_pair.py --host 127.0.0.1 --save lab4_t150 --player 1 \
        --buildings pop:1,district:DISTRICT_HARBOR,BUILDING_STOCK_EXCHANGE

A load replays one random stream, so two loads of one save play the same
turn. Per arm: load `--save`, place the arm's building complete in the
player's capital (`score_step.lua`'s WorldBuilder call; the control places
nothing), pass one turn by Autoplay, read every category of every major in
InGame. The control runs twice (its two reads must agree, or the pairing is
void). One JSON line per arm: runs/score_pair_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent

LUA_READ = """
local out = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local cs = {}
    for c in GameInfo.ScoringCategories() do
      local ok, v = pcall(function() return pl:GetCategoryScore(c.Index) end)
      cs[#cs + 1] = '"' .. c.CategoryType .. '":' .. (ok and tostring(v) or '"err"')
    end
    out[#out + 1] = '"' .. p .. '":{' .. table.concat(cs, ",") .. '}'
  end
end
print("{" .. table.concat(out, ",") .. "}")
"""


def arm(host: str, save: str, player: int, building: str | None) -> dict:
    if game.cmd_load(argparse.Namespace(host=host, port=4318, name=save, wait=600.0)) != 0:
        raise SystemExit(f"load of {save!r} failed")
    t = Tuner(host).connect()
    lp = lab.local_player(t)
    turn0 = lab.turn(t)
    placed = None
    if building:
        kind, _, what = building.rpartition(":")
        lua = (HERE / "score_arm.lua").read_text(encoding="utf-8")
        lua = lua.replace("ZP", str(player)).replace("ZKIND", kind or "building").replace("ZWHAT", what)
        step = [x for x in t.run(lab.GC, lua) if x.startswith("{")]
        placed = json.loads(step[-1]) if step else None
    lab.advance(t, "autoplay", lp, 600.0)
    turn1 = lab.turn(t)
    cats = json.loads(t.run(lab.IG, LUA_READ)[-1])
    t.close()
    return {"building": building, "turn0": turn0, "turn1": turn1, "placed": placed, "cats": cats}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--save", default="lab4_t150")
    p.add_argument("--player", type=int, default=1)
    p.add_argument("--buildings", required=True, help="comma list of arms: BUILDING_X, building:BUILDING_X, district:DISTRICT_X, pop:1")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"score_pair_{stamp}.jsonl"
    arms: list[str | None] = [None, None] + a.buildings.split(",")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for b in arms:
            rec = arm(a.host, a.save, a.player, b)
            fh.write(json.dumps({"save": a.save, "player": a.player, **rec}) + "\n")
            fh.flush()
            emp = rec["cats"].get(str(a.player), {}).get("CATEGORY_EMPIRE")
            print(f"{b or 'control'}: turn {rec['turn0']}->{rec['turn1']} empire {emp}"
                  f" took {rec['placed'] and rec['placed'].get('took')}", flush=True)
    print("->", out.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
