-- GameCore_Tuner (after lab_json.lua): B-89 Bomber scene — every unit within
-- ZR of ZX,ZY (owner, id, type, plot, damage, terrain / hills / feature of
-- the plot) and seat 0's war with ZP.
local out = {}
for q = 0, 63 do
  local o = Players[q]
  if o ~= nil and o:IsAlive() then
    for _, u in o:GetUnits():Members() do
      local d = Map.GetPlotDistance(u:GetX(), u:GetY(), ZX, ZY)
      if d <= ZR then
        local pl = Map.GetPlot(u:GetX(), u:GetY())
        out[#out + 1] = {q, u:GetID(), GameInfo.Units[u:GetType()].UnitType, u:GetX(), u:GetY(), u:GetDamage(), d,
          pl:IsHills(), pl:GetFeatureType(), pl:GetOwner()}
      end
    end
  end
end
OUT({kind = "scan", turn = Game.GetCurrentGameTurn(), war = P(function() return Players[0]:GetDiplomacy():IsAtWarWith(ZP) end), units = out})
