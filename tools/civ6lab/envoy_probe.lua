-- InGame: C-80 rule 2 — a city-state's owned plots against the envoys it has
-- received from player 0. One JSON line per minor.
--   pPlayer:GetInfluence():GetTokensReceived(majorID) / :GetSuzerain()
--   Players[0]:GetDiplomacy():HasMet(id)
local counts = {}
for i = 0, Map.GetPlotCount() - 1 do
  local o = Map.GetPlotByIndex(i):GetOwner()
  if o ~= nil and o >= 0 then counts[o] = (counts[o] or 0) + 1 end
end
local p0 = Players[0]
local tokens = -1
pcall(function() tokens = p0:GetInfluence():GetTokensToGive() end)
print("{\"scene\":\"C-80\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"kind\":\"pool\",\"tokensToGive\":" .. tokens .. "}")
for _, pl in ipairs(PlayerManager.GetAliveMinors()) do
  local id = pl:GetID()
  local inf = pl:GetInfluence()
  local recv, suz, most = -1, -1, -1
  pcall(function() recv = inf:GetTokensReceived(0) end)
  pcall(function() suz = inf:GetSuzerain() end)
  pcall(function() most = inf:GetMostTokensReceived() end)
  local met = false
  pcall(function() met = p0:GetDiplomacy():HasMet(id) end)
  local ncity = 0
  for _ in pl:GetCities():Members() do ncity = ncity + 1 end
  print("{\"scene\":\"C-80\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"kind\":\"minor\",\"player\":" .. id
    .. ",\"civ\":\"" .. tostring(PlayerConfigurations[id]:GetCivilizationTypeName()) .. "\",\"met\":" .. tostring(met)
    .. ",\"envoysFrom0\":" .. recv .. ",\"mostReceived\":" .. most .. ",\"suzerain\":" .. suz
    .. ",\"cities\":" .. ncity .. ",\"plots\":" .. (counts[id] or 0) .. "}")
end
