-- InGame: can the local seat buy each unit in ZUNITS ("A,B") in its capital
-- with gold? CanStartCommand's answer and failure reasons, the price.
--   --set ZUNITS=UNIT_INFANTRY,UNIT_MUSKETMAN --set ZCITY=0   (0 = the capital, else a city id)
local me = Game.GetLocalPlayer()
local c = Players[me]:GetCities():GetCapitalCity()
if ZCITY ~= 0 then for _, x in Players[me]:GetCities():Members() do if x:GetID() == ZCITY then c = x end end end
print("city " .. c:GetName() .. " " .. c:GetX() .. ":" .. c:GetY())
for name in string.gmatch("ZUNITS", "[%w_]+") do
  local row = GameInfo.Units[name]
  local p = {[CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash,
    [CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION,
    [CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index}
  local ok, can, res = pcall(function() return CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, p, true) end)
  local why = {}
  if ok and type(res) == "table" and type(res[CityCommandResults.FAILURE_REASONS]) == "table" then
    for _, s in ipairs(res[CityCommandResults.FAILURE_REASONS]) do why[#why + 1] = Locale.Lookup(s) end
  end
  local price = "?"
  pcall(function() price = c:GetGold():GetPurchaseCost(GameInfo.Yields["YIELD_GOLD"].Index, row.Hash, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION) end)
  print(name .. " can=" .. (ok and tostring(can) or ("err:" .. tostring(can))) .. " price=" .. tostring(price)
    .. " gold=" .. Players[me]:GetTreasury():GetGoldBalance() .. " why=" .. table.concat(why, "|"))
end
