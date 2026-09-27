-- Either state: every unit within ZR of ZX:ZY (all players), one line each:
-- owner, id, type, class, domain, position, damage, moves, activity (InGame).
-- Also prints the CombatTypes table when the state has it.
--   --set ZX=36 --set ZY=44 --set ZR=4
local cts = {}
pcall(function() for k, v in pairs(CombatTypes) do cts[#cts + 1] = k .. "=" .. tostring(v) end end)
print("CombatTypes " .. table.concat(cts, " "))
local acts = {}
pcall(function() for k, v in pairs(ActivityTypes) do acts[v] = k end end)
for _, p in ipairs(PlayerManager.GetAliveIDs()) do
  local pl = Players[p]
  for _, u in pl:GetUnits():Members() do
    local x, y = u:GetX(), u:GetY()
    if x >= 0 and Map.GetPlotDistance(x, y, ZX, ZY) <= ZR then
      local d = GameInfo.Units[u:GetType()]
      local act = "?"
      pcall(function() local a = UnitManager.GetActivityType(u); act = acts[a] or tostring(a) end)
      print(p .. ":" .. u:GetID() .. " " .. d.UnitType .. " class=" .. tostring(d.FormationClass) .. " dom=" .. tostring(d.Domain)
        .. " at=" .. x .. ":" .. y .. " dmg=" .. u:GetDamage() .. " moves=" .. u:GetMovesRemaining() .. " act=" .. act)
    end
  end
end
