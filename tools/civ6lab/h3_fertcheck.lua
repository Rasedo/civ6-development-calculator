-- H-3: are the fertility natives callable from GameCore_Tuner in a live game?
print("SP " .. tostring(StartPositioner) .. " GPF " .. tostring(StartPositioner and StartPositioner.GetPlotFertility))
print("TB " .. tostring(TerrainBuilder) .. " STT " .. tostring(TerrainBuilder and TerrainBuilder.SetTerrainType))
print("RB " .. tostring(ResourceBuilder) .. " SRT " .. tostring(ResourceBuilder and ResourceBuilder.SetResourceType))
local ok, v = pcall(function() return StartPositioner.GetPlotFertility(100, -1) end)
print("fert100 " .. tostring(ok) .. " " .. tostring(v))
local w, h = Map.GetGridSize()
print("grid " .. w .. "x" .. h)
