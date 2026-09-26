-- InGame: B-D — the policy-unlock price, every major, this turn: the price
-- (`GetCostToUnlockPolicies`), whether a change was made, the civics
-- completed so far, the civic in progress and its turns left, the treasury.
-- One JSON line per major.
local turn = Game.GetCurrentGameTurn()
local function P(f)
  local ok, v = pcall(f)
  if not ok then return '"err"' end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return '"' .. tostring(v) .. '"'
end
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local cu = pl:GetCulture()
    local done = 0
    for c in GameInfo.Civics() do
      local ok, v = pcall(function() return cu:HasCivic(c.Index) end)
      if ok and v then done = done + 1 end
    end
    print('{"kind":"policy","turn":' .. turn .. ',"p":' .. p
      .. ',"cost":' .. P(function() return cu:GetCostToUnlockPolicies() end)
      .. ',"changed":' .. P(function() return cu:PolicyChangeMade() end)
      .. ',"civics":' .. done
      .. ',"progressing":' .. P(function() return cu:GetProgressingCivic() end)
      .. ',"turnsLeft":' .. P(function() return cu:GetTurnsLeft() end)
      .. ',"gold":' .. P(function() return pl:GetTreasury():GetGoldBalance() end)
      .. ',"government":' .. P(function() return cu:GetCurrentGovernment() end)
      .. ',"era":' .. P(function() return pl:GetEra() end)
      .. ',"cities":' .. P(function() return pl:GetCities():GetCount() end)
      .. ',"culture":' .. P(function() return cu:GetCultureYield() end)
      .. ',"goldPerTurn":' .. P(function() return pl:GetTreasury():GetGoldYield() - pl:GetTreasury():GetTotalMaintenance() end)
      .. ',"techs":' .. P(function() local n = 0; for t in GameInfo.Technologies() do if pl:GetTechs():HasTech(t.Index) then n = n + 1 end end; return n end)
      .. '}')
  end
end
