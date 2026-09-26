-- InGame: the diplomatic standing of seat 0 toward seat ZP and back, for
-- C-2-S1 (what might scale a broken promise's grievance). Every read prints
-- its value or "err:<msg>".
--   --set ZP=1
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v):match("[^\n]*"))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local P = ZP
local out = {"turn=" .. Game.GetCurrentGameTurn()}
local okE, era = pcall(function() return Game.GetEras():GetCurrentEra() end)
out[#out + 1] = "era=" .. tri(okE, era)
for _, pr in ipairs({{0, P}, {P, 0}}) do
  local a, b = pr[1], pr[2]
  local d = Players[a]:GetDiplomacy()
  local function r(name, f) local ok, v = pcall(f); out[#out + 1] = a .. ">" .. b .. "." .. name .. "=" .. tri(ok, v) end
  r("state", function()
    local s = Players[a]:GetDiplomaticAI():GetDiplomaticStateIndex(b)
    return GameInfo.DiplomaticStates[s].StateType
  end)
  r("atWar", function() return d:IsAtWarWith(b) end)
  r("grievances", function() return d:GetGrievancesAgainst(b) end)
  r("delegation", function() return d:HasDelegationAt(b) end)
  r("embassy", function() return d:HasEmbassyAt(b) end)
  r("openBorders", function() return d:HasOpenBordersFrom(b) end)
end
print(table.concat(out, " "))
