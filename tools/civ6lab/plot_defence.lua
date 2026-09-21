-- GameCore_Tuner: the terrain and feature of named plots, with the DEFENCE
-- modifier each contributes. The ICBM warhead's effective defence came out
-- different at different aim plots in a way that is not monotone in distance,
-- and a defender's terrain bonus is the obvious candidate.
--   --set ZLIST=36:15,35:15,34:15,32:15,30:15
local out = {}
for pair in ("ZLIST"):gmatch("[^,]+") do
  local x, y = pair:match("(%-?%d+):(%-?%d+)")
  if x ~= nil then
    local q = Map.GetPlot(tonumber(x), tonumber(y))
    if q ~= nil then
      local t = GameInfo.Terrains[q:GetTerrainType()]
      local fIdx = q:GetFeatureType()
      local f = fIdx >= 0 and GameInfo.Features[fIdx] or nil
      out[#out + 1] = "{\"at\":\"" .. x .. ":" .. y .. "\""
        .. ",\"terrain\":\"" .. (t and t.TerrainType or "?") .. "\""
        .. ",\"terrainDefence\":" .. tostring(t and t.DefenseModifier or 0)
        .. ",\"hills\":" .. tostring(q:IsHills())
        .. ",\"feature\":\"" .. (f and f.FeatureType or "none") .. "\""
        .. ",\"featureDefence\":" .. tostring(f and f.DefenseModifier or 0)
        .. ",\"river\":" .. tostring(q:IsRiver())
        .. ",\"owner\":" .. q:GetOwner() .. "}"
    end
  end
end
print("{\"kind\":\"plotdef\",\"plots\":[" .. table.concat(out, ",") .. "]}")
