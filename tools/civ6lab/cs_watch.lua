-- GameCore_Tuner: one JSON line per living minor this turn (the city-states
-- and the Free Cities player) — the C-38 watch (what a city-state spends,
-- builds and fields). Gold and faith banks, each city's
-- [x, y, population, current item] (the progress and cost getters do not
-- exist on the GameCore queue: `minor_prod.lua` reads them in InGame), every unit
-- (type, plot, damage), the majors it is at war with, its suzerain and the
-- envoys each major holds there. `watch.py` calls it once a turn and appends
-- the lines. A pcall read prints its value, or "err:<msg>" when the call
-- threw; a clean false prints false.
local turn = Game.GetCurrentGameTurn()
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function J(ok, v)
  if not ok then return "\"err:" .. esc(v) .. "\"" end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return "\"" .. esc(v) .. "\""
end
local majors = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then majors[#majors + 1] = p end
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and not pl:IsMajor() and not pl:IsBarbarian() then
    local civ = PlayerConfigurations[p]:GetCivilizationTypeName()
    local gold = pl:GetTreasury():GetGoldBalance()
    local faith = J(pcall(function() return pl:GetReligion():GetFaithBalance() end))
    local cities = {}
    for _, c in pl:GetCities():Members() do
      local bq = c:GetBuildQueue()
      local okb, cur = pcall(function() return bq:CurrentlyBuilding() end)
      cities[#cities + 1] = "[" .. c:GetX() .. "," .. c:GetY() .. "," .. c:GetPopulation() .. ","
        .. J(okb, cur) .. "]"
    end
    local units = {}
    for _, u in pl:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      units[#units + 1] = "[\"" .. esc(row and row.UnitType or u:GetType()) .. "\"," .. u:GetX() .. "," .. u:GetY()
        .. "," .. u:GetDamage() .. "]"
    end
    local wars = {}
    local dip = pl:GetDiplomacy()
    for _, m in ipairs(majors) do
      local okw, w = pcall(function() return dip:IsAtWarWith(m) end)
      if not okw then wars[#wars + 1] = J(okw, w) elseif w then wars[#wars + 1] = tostring(m) end
    end
    local inf = pl:GetInfluence()
    local suz = J(pcall(function() return inf:GetSuzerain() end))
    local env = {}
    for _, m in ipairs(majors) do
      env[#env + 1] = J(pcall(function() return inf:GetTokensReceived(m) end))
    end
    print("{\"t\":" .. turn .. ",\"p\":" .. p .. ",\"civ\":\"" .. esc(civ) .. "\""
      .. ",\"gold\":" .. string.format("%.2f", gold) .. ",\"faith\":" .. faith
      .. ",\"cities\":[" .. table.concat(cities, ",") .. "],\"units\":[" .. table.concat(units, ",")
      .. "],\"war\":[" .. table.concat(wars, ",") .. "],\"suz\":" .. suz .. ",\"envoys\":[" .. table.concat(env, ",") .. "]}")
  end
end
