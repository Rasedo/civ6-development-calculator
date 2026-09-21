-- InGame: grep the LIVE database's GlobalParameters for the terms a nuclear
-- population rule would be spelled with. The install's XML shows no such row,
-- but the live DB carries every DLC and mod layer, so ask the game itself.
local pats = { "WMD", "NUKE", "NUCLEAR", "FALLOUT", "POPULATION_LOSS", "POP_LOSS", "BLAST" }
local n = 0
for r in GameInfo.GlobalParameters() do
  local nm = r.Name or ""
  for _, p in ipairs(pats) do
    if string.find(nm, p, 1, true) then
      n = n + 1
      print("{\"kind\":\"param\",\"name\":\"" .. nm .. "\",\"value\":\"" .. tostring(r.Value) .. "\"}")
      break
    end
  end
end
print("{\"kind\":\"param-total\",\"hits\":" .. n .. "}")
-- and the WMD rows as the live DB has them
for r in GameInfo.WMDs() do
  local acc = {}
  for k, v in pairs(r) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"wmd\",\"row\":\"" .. table.concat(acc, " ") .. "\"}")
end
