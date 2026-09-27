-- H-3, GameCore_Tuner: the live database's Terrains, Features and Resources
-- rows in index order, every column, one line each: "T|F|R <index> k=v,...".
local function row(tag, r)
  local ks = {}
  for k, v in pairs(r) do
    if type(v) ~= "function" and type(v) ~= "table" then ks[#ks + 1] = tostring(k) .. "=" .. tostring(v) end
  end
  table.sort(ks)
  print(tag .. " " .. tostring(r.Index) .. " " .. table.concat(ks, ","))
end
for r in GameInfo.Terrains() do row("T", r) end
for r in GameInfo.Features() do row("F", r) end
for r in GameInfo.Resources() do row("R", r) end
for r in GameInfo.Continents() do print("C " .. r.Index .. " " .. r.ContinentType) end
for r in GameInfo.RandomEvents() do
  if r.EffectOperatorType == "SEA_LEVEL" then print("E " .. r.Index .. " " .. r.RandomEventType .. " IceLoss=" .. tostring(r.IceLoss)) end
end
for r in GameInfo.CoastalLowlands() do print("L " .. r.Index .. " " .. tostring(r.CoastalLowlandType)) end
