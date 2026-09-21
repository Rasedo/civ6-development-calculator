-- InGame: plot distance from each tile player 0 has a city on (the only tiles
-- a Bomber can be created on) to every city on the map, so a strike is only
-- aimed at a target inside Bomber Range 10.
local bases = {}
for _, c in Players[0]:GetCities():Members() do
  bases[#bases + 1] = { name = c:GetName():gsub("LOC_CITY_NAME_", ""), x = c:GetX(), y = c:GetY() }
end
for _, pl in ipairs(Players) do
  local ok, cities = pcall(function() return pl:GetCities() end)
  if ok and cities ~= nil then
    for _, c in cities:Members() do
      local parts = {}
      for _, b in ipairs(bases) do
        parts[#parts + 1] = "\"" .. b.name .. "\":" .. Map.GetPlotDistance(b.x, b.y, c:GetX(), c:GetY())
      end
      print("{\"kind\":\"range\",\"city\":\"" .. c:GetName():gsub("LOC_CITY_NAME_", "")
        .. "\",\"owner\":" .. pl:GetID() .. ",\"x\":" .. c:GetX() .. ",\"y\":" .. c:GetY()
        .. "," .. table.concat(parts, ",") .. "}")
    end
  end
end
