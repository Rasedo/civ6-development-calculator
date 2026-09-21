-- InGame: is a plot revealed / visible to player 0? Two far aim plots were
-- refused as silo targets although they sit inside the nuclear device's
-- ICBMStrikeRange of 12, and fog is the obvious candidate.
--   --set ZLIST=29:13,26:15,30:15
local out = {}
for pair in ("ZLIST"):gmatch("[^,]+") do
  local x, y = pair:match("(%-?%d+):(%-?%d+)")
  if x ~= nil then
    local px, py = tonumber(x), tonumber(y)
    local rev, vis = "?", "?"
    pcall(function() rev = tostring(PlayersVisibility[0]:IsRevealed(px, py)) end)
    pcall(function() vis = tostring(PlayersVisibility[0]:IsVisible(px, py)) end)
    out[#out + 1] = "{\"at\":\"" .. px .. ":" .. py .. "\",\"revealed\":\"" .. rev
      .. "\",\"visible\":\"" .. vis .. "\"}"
  end
end
print("{\"kind\":\"reveal\",\"plots\":[" .. table.concat(out, ",") .. "]}")
