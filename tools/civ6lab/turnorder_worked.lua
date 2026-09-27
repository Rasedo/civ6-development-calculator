-- InGame: the plots each city of player ZP works, with their improvement and
-- food / production yields, and the city's own food and production yields.
local P = Players[ZP]
for _, c in P:GetCities():Members() do
  local cit = c:GetCitizens()
  local rows = {}
  for _, pi in ipairs(Map.GetCityPlots():GetPurchasedPlots(c)) do
    local pl = Map.GetPlotByIndex(pi)
    local ok, w = pcall(function() return cit:IsPlotWorked(pl:GetX(), pl:GetY()) end)
    if ok and w then
      local imp = pl:GetImprovementType()
      local iname = imp >= 0 and GameInfo.Improvements[imp].ImprovementType or "-"
      rows[#rows + 1] = pl:GetX() .. "," .. pl:GetY() .. ":" .. iname .. ":f" .. pl:GetYield(0) .. ":p" .. pl:GetYield(1)
    end
  end
  print("city " .. c:GetID() .. " food=" .. c:GetYield(0) .. " prod=" .. c:GetYield(1) .. " worked " .. table.concat(rows, " "))
end
