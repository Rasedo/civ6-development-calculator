-- GameCore_Tuner (after lab_json.lua): remove every unit on the plots ZPLOTS
-- ("x:y;x:y") that does not belong to seat 0.
local n = 0
for x, y in string.gmatch("ZPLOTS", "(%d+):(%d+)") do
  for _, u in ipairs(Units.GetUnitsInPlot(Map.GetPlot(tonumber(x), tonumber(y))) or {}) do
    if u:GetOwner() ~= 0 then Players[u:GetOwner()]:GetUnits():Destroy(u); n = n + 1 end
  end
end
OUT({kind = "clear", removed = n})
