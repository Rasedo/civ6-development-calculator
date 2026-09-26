-- ASK 9 / C-38: what a city-state does with its bank. InGame (treasury and
-- build queue are readable there). Print per living minor: gold, faith,
-- what it is building, its units by class, its city's population.
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() then
    local name = PlayerConfigurations[p]:GetCivilizationShortDescription()
    local gold = pl:GetTreasury():GetGoldBalance()
    local okf, faith = pcall(function() return pl:GetReligion():GetFaithBalance() end)
    local units, mil = 0, 0
    for _, u in pl:GetUnits():Members() do
      units = units + 1
      if GameInfo.Units[u:GetType()].Combat > 0 or GameInfo.Units[u:GetType()].RangedCombat > 0 then mil = mil + 1 end
    end
    for _, c in pl:GetCities():Members() do
      local bq = c:GetBuildQueue()
      local okb, cur = pcall(function() return bq:CurrentlyBuilding() end)
      local okp, prog = pcall(function() return bq:GetProductionProgress() end)
      print(string.format("cs p%d %-14s gold %6.1f faith %5s pop %2d units %2d (mil %d) building %s progress %s",
        p, name, gold, tri(okf, faith), c:GetPopulation(), units, mil, tri(okb, cur), tri(okp, prog)))
    end
  end
end
print("turn " .. Game.GetCurrentGameTurn())
