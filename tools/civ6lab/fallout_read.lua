-- GameCore_Tuner: the fallout garrison's health, turn by turn. Both engines
-- take "any unit that ends its turn in a contaminated tile takes 50 damage" on
-- the pedia's word alone (cpu/data/nuclear.ts: "no install table carries it"),
-- so the live number is the only source there will ever be.
--   --set ZIDS=8912933,9044003,9109538,8978468
local p0 = Players[0]
local fm = Game.GetFalloutManager()
local ids = {}
for s in string.gmatch("ZIDS", "[0-9]+") do ids[#ids + 1] = tonumber(s) end
local out = {}
for _, id in ipairs(ids) do
  local u = p0:GetUnits():FindID(id)
  if u == nil then
    out[#out + 1] = "{\"id\":" .. id .. ",\"hp\":\"dead\"}"
  else
    -- a unit that died this turn can still be FOUND, parked at -9999: Map.GetPlot
    -- returns nil there and indexing it is what killed the first version of this probe
    local okq, q = pcall(function() return Map.GetPlot(u:GetX(), u:GetY()) end)
    local fo = (okq and q ~= nil) and fm:GetFalloutTurnsRemaining(q:GetIndex()) or -1
    out[#out + 1] = "{\"id\":" .. id .. ",\"x\":" .. u:GetX() .. ",\"y\":" .. u:GetY()
      .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage())
      .. ",\"damage\":" .. u:GetDamage()
      .. ",\"fallout\":" .. fo .. "}"
  end
end
print("{\"kind\":\"fallout-damage\",\"turn\":" .. Game.GetCurrentGameTurn() .. ",\"units\":[" .. table.concat(out, ",") .. "]}")
