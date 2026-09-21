-- InGame: buy a unit in player 0's capital the way ProductionPanel.lua does.
--   CityManager.RequestCommand(city, CityCommandTypes.PURCHASE, {
--     [CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash,
--     [CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION,
--     [CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index })
-- A unit bought this way is TRAINED IN A CITY, not socket-spawned.
--   --set ZUNIT=UNIT_SPY
local c = Players[0]:GetCities():GetCapitalCity()
local row = GameInfo.Units["ZUNIT"]
local params = {}
params[CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash
params[CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION
params[CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index
local okc, can = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, params) end)
local oko, erro = pcall(function() CityManager.RequestCommand(c, CityCommandTypes.PURCHASE, params) end)
print("buy ZUNIT in " .. c:GetName() .. " gold=" .. math.floor(Players[0]:GetTreasury():GetGoldBalance())
  .. " can=" .. tostring(okc and can or "ERR") .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
