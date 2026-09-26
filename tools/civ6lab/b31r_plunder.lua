-- InGame: B-31r-S1, seat 0's unit ZUID asks for UNITCOMMAND_PLUNDER_TRADE_ROUTE
-- (CanStartCommand with the result table, the refusal texts decoded as the
-- game gives them); ZDO = 1 also requests it. Before and after: seat 0's
-- gold and faith, science and culture progress (UNVERIFIED getters, each
-- printed or "err:<msg>"), and the unit's plot.
--   --set ZUID=123 --set ZDO=0
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v):match("[^\n]*"))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local pl = Players[0]
local u = pl:GetUnits():FindID(ZUID)
if u == nil then print("plunder: nounit") return end
local function purse(tag)
  local out = {tag, "turn=" .. Game.GetCurrentGameTurn(), "at=" .. u:GetX() .. ":" .. u:GetY()}
  local function r(name, f) local ok, v = pcall(f); out[#out + 1] = name .. "=" .. tri(ok, v) end
  r("gold", function() return pl:GetTreasury():GetGoldBalance() end)
  r("faith", function() return pl:GetReligion():GetFaithBalance() end)
  r("sciProgress", function() local t = pl:GetTechs(); return t:GetResearchProgress(t:GetResearchingTech()) end)
  r("culProgress", function() local c = pl:GetCulture(); return c:GetCulturalProgress(c:GetProgressingCivic()) end)
  r("moves", function() return u:GetMovesRemaining() end)
  print(table.concat(out, " "))
end
purse("before")
local okc, can, res = pcall(function() return UnitManager.CanStartCommand(u, UnitCommandTypes.PLUNDER_TRADE_ROUTE, true, true) end)
local reasons = {}
if okc and type(res) == "table" then
  for k, v in pairs(res) do
    if type(v) == "table" then for _, s in pairs(v) do reasons[#reasons + 1] = tostring(k) .. ":" .. tostring(s) end
    else reasons[#reasons + 1] = tostring(k) .. ":" .. tostring(v) end
  end
end
print("plunder can " .. tri(okc, can) .. " reasons " .. table.concat(reasons, " | "))
if ZDO == 1 and okc and can then
  local okr, e = pcall(function() UnitManager.RequestCommand(u, UnitCommandTypes.PLUNDER_TRADE_ROUTE) end)
  print("plunder requested " .. tostring(okr) .. " " .. tostring(e))
end
