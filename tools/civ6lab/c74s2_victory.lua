-- InGame: the victory settings and who has won. One JSON line:
--   {"kind":"victory","turn":T,"winningTeam":..,"settings":{VictoryType: value}, "vm":{...}}
local function P(f)
  local ok, v = pcall(f)
  if ok then return v end
  return "err:" .. tostring(v)
end
local parts = {}
for r in GameInfo.Victories() do
  local v = P(function() return GameConfiguration.GetValue(r.VictoryType) end)
  parts[#parts + 1] = '"' .. r.VictoryType .. '":"' .. tostring(v) .. '"'
end
local won = P(function() return Game.GetWinningTeam() end)
local wtype = P(function() return Game.GetVictoryType and Game.GetVictoryType() end)
print('{"kind":"victory","turn":' .. Game.GetCurrentGameTurn() .. ',"winningTeam":"' .. tostring(won)
  .. '","victoryType":"' .. tostring(wtype) .. '","settings":{' .. table.concat(parts, ",") .. '}}')
