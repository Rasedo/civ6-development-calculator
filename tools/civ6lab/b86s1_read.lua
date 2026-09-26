-- InGame, once a turn for B-86-S1 (where the lost Nuclear emergency's -1
-- lands): the emergency against seat ZTARGET as the target's own table shows
-- it (TurnsLeft, HasBegun, bSuccess, members), then for every city of every
-- player, each loyalty pressure source (`GetCulturalIdentity():
-- GetCityIdentityPressures()`, MinimapPanel_Expansion1.lua) that is a city of
-- a MAJOR within 9: the receiving city, the source city's owner, id,
-- population, capital flag and distance, and every numeric field of the
-- entry. One JSON line each.
--   --set ZTARGET=0
local turn = Game.GetCurrentGameTurn()
local okt, t = pcall(function() return Game.GetEmergencyManager():GetEmergencyInfoTable(ZTARGET) end)
for i, e in pairs(okt and t or {}) do
  if tostring(e.NameText) == "LOC_EMERGENCY_NAME_NUCLEAR" then
    local mem = {}
    for _, m in pairs(e.MemberIDs or {}) do mem[#mem + 1] = tostring(m) end
    print(string.format('{"kind":"emergency","turn":%d,"target":%s,"turnsLeft":%s,"begun":%s,"success":%s,"members":[%s]}',
      turn, tostring(e.TargetID), tostring(e.TurnsLeft), tostring(e.HasBegun), tostring(e.bSuccess), table.concat(mem, ",")))
  end
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsBarbarian() then
    for _, c in pl:GetCities():Members() do
      local okp, srcs = pcall(function() return c:GetCulturalIdentity():GetCityIdentityPressures() end)
      for _, s in ipairs(okp and srcs or {}) do
        local sc = CityManager.GetCity(s.CityOwner, s.CityID)
        if sc ~= nil and Players[s.CityOwner]:IsMajor() then
          local d = Map.GetPlotDistance(c:GetX(), c:GetY(), sc:GetX(), sc:GetY())
          if d <= 9 then
            local f = {}
            for k, v in pairs(s) do if type(v) == "number" then f[#f + 1] = '"' .. k .. '":' .. string.format("%.6g", v) end end
            table.sort(f)
            print(string.format('{"kind":"pressure","turn":%d,"to":[%d,%d],"toPop":%d,"from":[%d,%d],"fromPop":%d,"fromCapital":%s,"d":%d,%s}',
              turn, p, c:GetID(), c:GetPopulation(), s.CityOwner, s.CityID, sc:GetPopulation(), tostring(sc:IsCapital()), d, table.concat(f, ",")))
          end
        end
      end
    end
  end
end
