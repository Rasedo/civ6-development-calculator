-- MapExporter.lua
-- Prints the whole map to Lua.log in a line-based format the Development
-- Calculator can import. Runs once when the load screen closes.
--
-- Line format:
--   CIV6MAP_BEGIN|<width>|<height>
--   CIV6MAP|<x>|<y>|<terrain>|<feature or ->|<resource or ->|<L or ->|<riverFlags>
--   CIV6MAP_END
--
-- riverFlags bits: 1 = IsWOfRiver (river on the plot's east edge),
--                  2 = IsNWOfRiver (river on the plot's southeast edge),
--                  4 = IsNEOfRiver (river on the plot's southwest edge).

local function ExportMap()
	local width, height = Map.GetGridSize();
	print("CIV6MAP_BEGIN|" .. tostring(width) .. "|" .. tostring(height));

	for i = 0, Map.GetPlotCount() - 1 do
		local plot = Map.GetPlotByIndex(i);

		local terrain = "TERRAIN_OCEAN";
		local terrainInfo = GameInfo.Terrains[plot:GetTerrainType()];
		if terrainInfo ~= nil then
			terrain = terrainInfo.TerrainType;
		end

		local feature = "-";
		if plot:GetFeatureType() >= 0 then
			local featureInfo = GameInfo.Features[plot:GetFeatureType()];
			if featureInfo ~= nil then
				feature = featureInfo.FeatureType;
			end
		end

		local resource = "-";
		if plot:GetResourceType() >= 0 then
			local resourceInfo = GameInfo.Resources[plot:GetResourceType()];
			if resourceInfo ~= nil then
				resource = resourceInfo.ResourceType;
			end
		end

		local lake = plot:IsLake() and "L" or "-";

		local river = 0;
		if plot:IsWOfRiver() then river = river + 1; end
		if plot:IsNWOfRiver() then river = river + 2; end
		if plot:IsNEOfRiver() then river = river + 4; end

		print("CIV6MAP|" .. plot:GetX() .. "|" .. plot:GetY() .. "|" .. terrain .. "|" ..
			feature .. "|" .. resource .. "|" .. lake .. "|" .. river);
	end

	print("CIV6MAP_END");
end

Events.LoadScreenClose.Add(ExportMap);
