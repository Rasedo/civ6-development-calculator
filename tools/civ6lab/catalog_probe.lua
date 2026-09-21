-- InGame: one read-only call that unblocks the two scenes left. Nothing is
-- created or changed; it only asks the live database and the live enum tables
-- for the names the next probes need.
--   * the Rock Band's operations (the Pop Star's gold rides on a concert)
--   * PlayerOperations, for whether a Missile Silo launch is a PLAYER operation
--     rather than a unit one (the engines model siloTiles and nukeCarrier, and
--     only the Bomber path has ever been fired from the socket)
--   * the Missile Silo improvement row
for r in GameInfo.UnitOperations() do
  local t = r.OperationType or ""
  if string.find(t, "ROCK", 1, true) or string.find(t, "CONCERT", 1, true)
     or string.find(t, "WMD", 1, true) then
    print("{\"kind\":\"catalog\",\"unitOperation\":\"" .. t .. "\",\"hash\":\"" .. tostring(r.Hash) .. "\"}")
  end
end
for r in GameInfo.UnitCommands() do
  local t = r.CommandType or ""
  if string.find(t, "ROCK", 1, true) or string.find(t, "CONCERT", 1, true) then
    print("{\"kind\":\"catalog\",\"unitCommand\":\"" .. t .. "\",\"hash\":\"" .. tostring(r.Hash) .. "\"}")
  end
end
local okp, po = pcall(function() return PlayerOperations end)
if okp and po ~= nil then
  local acc = {}
  for k, v in pairs(po) do if type(k) == "string" then acc[#acc + 1] = k end end
  table.sort(acc)
  print("{\"kind\":\"catalog\",\"PlayerOperations\":\"" .. table.concat(acc, " ") .. "\"}")
end
local function row(t, key, fields)
  local ok, r = pcall(function() return GameInfo[t][key] end)
  if not ok or r == nil then
    print("{\"kind\":\"catalog\",\"table\":\"" .. t .. "\",\"key\":\"" .. key .. "\",\"present\":false}")
    return
  end
  local acc = {}
  for _, f in ipairs(fields) do acc[#acc + 1] = "\"" .. f .. "\":\"" .. tostring(r[f]) .. "\"" end
  print("{\"kind\":\"catalog\",\"table\":\"" .. t .. "\",\"key\":\"" .. key .. "\",\"present\":true,"
    .. table.concat(acc, ",") .. "}")
end
row("Improvements", "IMPROVEMENT_MISSILE_SILO", { "Index", "PrereqTech", "TraitType", "OnePerCity" })
row("Units", "UNIT_ROCK_BAND", { "Index", "Cost", "PrereqCivic", "MustPurchase", "PromotionClass" })
row("Units", "UNIT_NUCLEAR_SUBMARINE", { "Index", "PrereqTech", "Domain" })
-- the Rock Band's promotions, one of which is the Pop Star
local okpr, it = pcall(function() return GameInfo.UnitPromotions() end)
if okpr and it ~= nil then
  local acc = {}
  for r in GameInfo.UnitPromotions() do
    if r.PromotionClass == "PROMOTION_CLASS_ROCK_BAND" then
      acc[#acc + 1] = r.UnitPromotionType .. "(lvl" .. tostring(r.Level) .. ")"
    end
  end
  print("{\"kind\":\"catalog\",\"rockBandPromotions\":\"" .. table.concat(acc, " ") .. "\"}")
end
