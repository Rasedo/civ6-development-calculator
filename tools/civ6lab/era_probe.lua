-- Any state: the eras and which Dedication is legal now. COMMEMORATION rows
-- carry MinimumGameEra / MaximumGameEra, so the first row in the table is the
-- WRONG one late in the game. Every read is pcall'd and prints its value or
-- "err:<message>": the player's Eras object lives in GameCore while
-- Game.GetEras() answers in InGame.
local function esc(s)
  s = tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')
  return (s:gsub('%c', function(c) return string.format('\\u%04x', c:byte()) end))
end
local function V(ok, v)
  if not ok then return '"err:' .. esc(v) .. '"' end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return '"' .. esc(v) .. '"'
end
local function J(k, ok, v) print('{"kind":"era","' .. k .. '":' .. V(ok, v) .. '}') end
local okm, me = pcall(function() return Game.GetLocalPlayer() end)
if not okm or type(me) ~= "number" or me < 0 then me = 0 end
local pl = Players[me]
if pl ~= nil then
  local oke, eras = pcall(function() return pl:GetEras() end)
  if oke and eras ~= nil then
    local acc = {}
    local okx, idx = pcall(function() local mt = getmetatable(eras); return mt and mt["__index"] end)
    local src = (okx and type(idx) == "table") and idx or eras
    for k in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
    table.sort(acc)
    J("playerErasObject", true, table.concat(acc, " "))
  else
    J("playerErasObject", oke, eras)
  end
  J("player", true, me)
  J("playerEra", pcall(function() return pl:GetEra() end))
end
local okg, ge = pcall(function() return Game.GetEras():GetCurrentEra() end)
J("gameEra", okg, ge)
if okg and type(ge) == "number" then
  local r = GameInfo.Eras[ge]
  J("gameEraType", true, r and r.EraType)
end
for r in GameInfo.CommemorationTypes() do
  print('{"kind":"era","commemoration":"' .. r.CommemorationType .. '","min":' .. V(true, r.MinimumGameEra)
    .. ',"max":' .. V(true, r.MaximumGameEra) .. '}')
end
