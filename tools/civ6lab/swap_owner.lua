-- GameCore_Tuner: hand city ZB (seat 0) the plot ZX,ZY, trying the ownership
-- calls in turn, and print which one took and the plot's owner city after.
--   --set ZB=131073 --set ZX=18 --set ZY=13
local p = Map.GetPlot(ZX, ZY)
local city = CityManager.GetCity(0, ZB)
local tried = {}
local function owned()
  local c = Cities.GetPlotPurchaseCity(p)
  return c ~= nil and c:GetID() == ZB
end
local function try(name, f)
  if owned() then return end
  local ok, err = pcall(f)
  tried[#tried + 1] = name .. (ok and "" or ("(" .. tostring(err):sub(1, 60) .. ")")) .. (owned() and "=TOOK" or "")
end
try("WorldBuilder.SetPlotOwner", function() WorldBuilder.CityManager():SetPlotOwner(ZX, ZY, 0, ZB) end)
try("plot:SetOwner(p,city,true)", function() p:SetOwner(0, ZB, true) end)
try("plot:SetOwner(p,city)", function() p:SetOwner(0, ZB) end)
local c = Cities.GetPlotPurchaseCity(p)
print("plot " .. ZX .. "," .. ZY .. " owner city " .. tostring(c and c:GetID()) .. " | " .. table.concat(tried, " ; "))
