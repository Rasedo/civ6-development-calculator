-- InGame: C-80 rule 2, one step — read minor ZM's owned plot count and the
-- envoys it has received from player 0, then top the envoy pool up and send
-- ONE more envoy. The give resolves on a later tick, so the NEXT call's read
-- is the answer to this call's give.
--   UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN,
--                             {[PlayerOperations.PARAM_PLAYER_ONE] = minorID})
--   --set ZM=8
local m = ZM
local pl = Players[m]
local inf = pl:GetInfluence()
local n = 0
for i = 0, Map.GetPlotCount() - 1 do
  if Map.GetPlotByIndex(i):GetOwner() == m then n = n + 1 end
end
local recv, suz, most = -1, -1, -1
pcall(function() recv = inf:GetTokensReceived(0) end)
pcall(function() suz = inf:GetSuzerain() end)
pcall(function() most = inf:GetMostTokensReceived() end)
local city = nil
for _, c in pl:GetCities():Members() do city = c end
print("{\"scene\":\"C-80\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"minor\":" .. m
  .. ",\"envoysFrom0\":" .. recv .. ",\"mostReceived\":" .. most .. ",\"suzerain\":" .. suz
  .. ",\"pop\":" .. (city and city:GetPopulation() or -1)
  .. ",\"plots\":" .. n .. "}")
local p0 = Players[0]
local tok = -1
pcall(function() tok = p0:GetInfluence():GetTokensToGive() end)
if tok < 1 then
  local okc, errc = pcall(function() p0:GetInfluence():ChangeTokensToGive(1) end)
  pcall(function() tok = p0:GetInfluence():GetTokensToGive() end)
  print("topup ok=" .. tostring(okc) .. " err=" .. tostring(errc) .. " tokens=" .. tok)
end
local params = {}
params[PlayerOperations.PARAM_PLAYER_ONE] = m
local oko, erro = pcall(function() UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN, params) end)
print("give minor=" .. m .. " tokensBefore=" .. tok .. " ok=" .. tostring(oko) .. " err=" .. tostring(erro))
