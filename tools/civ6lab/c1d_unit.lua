-- GameCore_Tuner (after lab_json.lua): C-1 — ZN units of type ZUNIT for the
-- reactor ZK's owner on the reactor's plot (ZN 0: remove every unit there).
local fm = Game.GetFalloutManager()
local r = fm:GetReactorByIndex(ZK)
local rp = Map.GetPlotByIndex(r.PlotIndex)
local out = {kind = "unit", k = ZK, x = rp:GetX(), y = rp:GetY(), made = {}, removed = 0}
if ZN == 0 then
  for q = 0, 63 do
    local o = Players[q]
    if o ~= nil and o:IsAlive() then
      for _, u in o:GetUnits():Members() do
        if u:GetX() == rp:GetX() and u:GetY() == rp:GetY() then o:GetUnits():Destroy(u); out.removed = out.removed + 1 end
      end
    end
  end
else
  for i = 1, ZN do
    local u = P(function() return Players[r.Owner]:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, rp:GetX(), rp:GetY()) end)
    out.made[i] = (type(u) == "table" or type(u) == "userdata") and u:GetID() or tostring(u)
  end
end
OUT(out)
