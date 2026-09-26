-- InGame: buy a unit in player 0's capital the way ProductionPanel.lua does.
--   CityManager.RequestCommand(city, CityCommandTypes.PURCHASE, {
--     [CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash,
--     [CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION,
--     [CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index })
-- A unit bought this way is TRAINED IN A CITY, not socket-spawned.
--   --set ZUNIT=UNIT_SPY
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
local c = Players[0]:GetCities():GetCapitalCity()
local row = GameInfo.Units["ZUNIT"]
local params = {}
params[CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash
params[CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION
params[CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index
local okc, can = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, params) end)
local oko, erro = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.PURCHASE, params) end)
print("buy ZUNIT in " .. c:GetName() .. " gold=" .. math.floor(Players[0]:GetTreasury():GetGoldBalance())
  .. " can=" .. tri(okc, can) .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
