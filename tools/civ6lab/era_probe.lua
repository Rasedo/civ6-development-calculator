-- Any state: which Dedication is legal right now? COMMEMORATION rows carry
-- MinimumGameEra / MaximumGameEra, so the first row in the table is the WRONG
-- one late in the game. Everything is pcall-guarded because the player's Eras
-- object lives in GameCore while Game.GetEras() answers in InGame.
local me = Game.GetLocalPlayer and Game.GetLocalPlayer() or 0
local function J(k, v) print("{\"kind\":\"era\",\"" .. k .. "\":\"" .. tostring(v) .. "\"}") end
local okp, pl = pcall(function() return Players[me] end)
if okp and pl ~= nil then
  local oke, eras = pcall(function() return pl:GetEras() end)
  if oke and eras ~= nil then
    local acc = {}
    local mt = getmetatable(eras)
    local okx, idx = pcall(function() return mt and mt["__index"] end)
    local src = (okx and type(idx) == "table") and idx or eras
    for k, v in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
    table.sort(acc)
    J("playerErasObject", table.concat(acc, " "))
  else
    J("playerErasObject", "nil")
  end
  local oke2, e = pcall(function() return pl:GetEra() end)
  J("playerEra", oke2 and e or "err")
end
local okg, ge = pcall(function() return Game.GetEras():GetCurrentEra() end)
J("gameEra", okg and ge or "err")
if okg and ge ~= nil then
  local r = GameInfo.Eras[ge]
  J("gameEraType", r and r.EraType or "?")
end
for r in GameInfo.CommemorationTypes() do
  print("{\"kind\":\"era\",\"commemoration\":\"" .. r.CommemorationType
    .. "\",\"min\":\"" .. tostring(r.MinimumGameEra) .. "\",\"max\":\"" .. tostring(r.MaximumGameEra) .. "\"}")
end
