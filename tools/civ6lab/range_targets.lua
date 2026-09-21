-- InGame: what RANGE_ATTACK targets does a unit actually have, and is the plot
-- I want among them? CanStartOperation returning false says nothing about WHY;
-- the target list does.
--   --set ZAU=123 --set ZTX=37 --set ZTY=16
local u = Players[0]:GetUnits():FindID(ZAU)
if u == nil then print("{\"kind\":\"rangetargets\",\"error\":\"nounit\"}") return end
local ok, res = pcall(function()
  return UnitManager.GetOperationTargets(u, UnitOperationTypes.RANGE_ATTACK)
end)
local want = Map.GetPlot(ZTX, ZTY):GetIndex()
local list, found = {}, false
if ok and type(res) == "table" then
  for k, v in pairs(res) do
    if type(v) == "table" then
      for _, i in ipairs(v) do
        if type(i) == "number" then
          local q = Map.GetPlotByIndex(i)
          if q ~= nil and #list < 12 then
            list[#list + 1] = "\"" .. q:GetX() .. ":" .. q:GetY() .. "\""
          end
          if i == want then found = true end
        end
      end
    end
  end
end
local vis = "?"
pcall(function()
  vis = tostring(PlayersVisibility[0]:IsVisible(ZTX, ZTY))
end)
print("{\"kind\":\"rangetargets\",\"unit\":" .. ZAU .. ",\"ok\":" .. tostring(ok)
  .. ",\"wantVisible\":\"" .. vis .. "\",\"wantOffered\":" .. tostring(found)
  .. ",\"some\":[" .. table.concat(list, ",") .. "]}")
