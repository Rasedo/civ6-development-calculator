-- GameCore_Tuner: one JSON line per living city-state, this turn — the C-38 watch
-- (what a city-state spends, builds and fields). Gold and faith banks, each
-- city's population, current build and progress, every unit (type, plot,
-- damage), the majors it is at war with, its suzerain and the envoys each
-- major holds there. `watch.py` calls it once a turn and appends the lines.
local turn = Game.GetCurrentGameTurn()
local majors = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then majors[#majors + 1] = p end
end
local function q(s) return "\"" .. tostring(s):gsub("\"", "'") .. "\"" end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() then
    local civ = PlayerConfigurations[p]:GetCivilizationTypeName()
    local gold = pl:GetTreasury():GetGoldBalance()
    local okf, faith = pcall(function() return pl:GetReligion():GetFaithBalance() end)
    local cities = {}
    for _, c in pl:GetCities():Members() do
      local bq = c:GetBuildQueue()
      local okb, cur = pcall(function() return bq:CurrentlyBuilding() end)
      local okp, prog = false, -1
      cities[#cities + 1] = "[" .. c:GetX() .. "," .. c:GetY() .. "," .. c:GetPopulation() .. ","
        .. q(okb and cur or "?") .. "," .. tostring(okp and prog or -1) .. "]"
    end
    local units = {}
    for _, u in pl:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      units[#units + 1] = "[" .. q(row and row.UnitType or u:GetType()) .. "," .. u:GetX() .. "," .. u:GetY()
        .. "," .. u:GetDamage() .. "]"
    end
    local wars = {}
    local dip = pl:GetDiplomacy()
    for _, m in ipairs(majors) do
      local okw, w = pcall(function() return dip:IsAtWarWith(m) end)
      if okw and w then wars[#wars + 1] = tostring(m) end
    end
    local inf = pl:GetInfluence()
    local suz = -1
    pcall(function() suz = inf:GetSuzerain() end)
    local env = {}
    for _, m in ipairs(majors) do
      local okt, n = pcall(function() return inf:GetTokensReceived(m) end)
      env[#env + 1] = tostring(okt and n or -1)
    end
    print("{\"t\":" .. turn .. ",\"p\":" .. p .. ",\"civ\":" .. q(civ)
      .. ",\"gold\":" .. string.format("%.2f", gold) .. ",\"faith\":" .. string.format("%.2f", okf and faith or -1)
      .. ",\"cities\":[" .. table.concat(cities, ",") .. "],\"units\":[" .. table.concat(units, ",")
      .. "],\"war\":[" .. table.concat(wars, ",") .. "],\"suz\":" .. suz .. ",\"envoys\":[" .. table.concat(env, ",") .. "]}")
  end
end
