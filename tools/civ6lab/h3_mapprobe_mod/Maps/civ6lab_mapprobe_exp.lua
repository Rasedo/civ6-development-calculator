-- civ6lab_mapprobe_exp (H-3): controlled experiments on the map natives,
-- run inside map generation. It DRAWS (each StampContinents takes its 43),
-- so the map it finally makes is not the unprobed map.
--   A. before the real generation: land shapes written with SetTerrainType
--      (every other plot Ocean), continent types cleared, AreaBuilder.Recalculate,
--      StampContinents; one record per shape:
--        exp|<name>|<rle land 0 / water 1 at the stamp>|<rle continent per plot>
--      then every continent type is cleared again.
--   B. after the real generation (Gathering Storm's Continents.lua), for each
--      multi-plot natural wonder without a CustomPlacement, up to 8 anchors
--      where CanHaveFeature(plot, f, false) holds: the six neighbours'
--      CanHaveFeature(q, f, true) before, SetFeatureType(plot, f), the plots
--      carrying f after with their terrain before and after, then undone:
--        nwexp|<f>|<x,y>|<ne,e,se,sw,w,nw valid 0/1>|<i:tBefore:tAfter,...>
-- X is stored like the natives probe's (civ6lab_mapprobe_x, _xn on plot 0).

local X = {}

include "civ6lab_xp2_continents"

local function N() local w, h = Map.GetGridSize(); return w * h end

local function rle(vals)
	local out, cur, n = {}, nil, 0
	for i = 1, #vals do
		local v = vals[i]
		if v == cur then n = n + 1
		else
			if cur ~= nil then out[#out + 1] = tostring(cur) .. "*" .. n end
			cur, n = v, 1
		end
	end
	if cur ~= nil then out[#out + 1] = tostring(cur) .. "*" .. n end
	return table.concat(out, ",")
end

local function perplot(get)
	local vals = {}
	for i = 0, N() - 1 do
		local ok, v = pcall(get, Map.GetPlotByIndex(i))
		vals[#vals + 1] = ok and v or "e"
	end
	return vals
end

local function clearContinents()
	for i = 0, N() - 1 do pcall(function() TerrainBuilder.SetContinentType(Map.GetPlotByIndex(i), -1) end) end
end

-- shape(x, y) -> a terrain index for land, nil for Ocean
local function stamp(name, shape)
	local w, h = Map.GetGridSize()
	for i = 0, N() - 1 do
		local x, y = i % w, math.floor(i / w)
		local t = shape(x, y)
		TerrainBuilder.SetTerrainType(Map.GetPlotByIndex(i), t or 16)
	end
	clearContinents()
	AreaBuilder.Recalculate()
	local ok, err = pcall(function() TerrainBuilder.StampContinents() end)
	local land = perplot(function(p) return p:IsWater() and 1 or 0 end)
	local cont = perplot(function(p) return p:GetContinentType() end)
	X[#X + 1] = "exp|" .. name .. "|" .. rle(land) .. "|" .. rle(cont) .. (ok and "" or ("|ERR " .. tostring(err):gsub("[;|]", " ")))
end

local function rect(x0, x1, y0, y1)
	return function(x, y) return x >= x0 and x < x1 and y >= y0 and y < y1 end
end

local function union(...)
	local fs = { ... }
	return function(x, y)
		for _, f in ipairs(fs) do if f(x, y) then return true end end
		return false
	end
end

local function grass(f) return function(x, y) if f(x, y) then return 0 end return nil end end

local function fill_tall(cx, h, t)
	return function(x, y) if x >= cx - 6 and x < cx + 6 and y >= 3 and y < h - 3 then return t end return nil end
end

local function experimentsA()
	local w, h = Map.GetGridSize()
	local cx, cy = math.floor(w / 2), math.floor(h / 2)
	stamp("rect_center", grass(rect(math.floor(w * 0.15), math.floor(w * 0.85), math.floor(h * 0.2), math.floor(h * 0.8))))
	stamp("rect_center_again", grass(rect(math.floor(w * 0.15), math.floor(w * 0.85), math.floor(h * 0.2), math.floor(h * 0.8))))
	stamp("rect_shift5", grass(rect(math.floor(w * 0.15) + 5, math.floor(w * 0.85) + 5, math.floor(h * 0.2), math.floor(h * 0.8))))
	stamp("rect_tall", grass(rect(cx - 6, cx + 6, 3, h - 3)))
	stamp("rect_wide_thin", grass(rect(5, w - 5, cy - 2, cy + 2)))
	stamp("row_line", grass(rect(5, w - 5, cy, cy + 1)))
	stamp("two_equal", grass(union(rect(5, cx - 5, 8, h - 8), rect(cx + 5, w - 5, 8, h - 8))))
	stamp("two_unequal", grass(union(rect(3, cx + 5, 8, h - 8), rect(cx + 15, w - 5, 15, h - 15))))
	stamp("three_cols", grass(union(rect(3, 3 + math.floor(w / 4), 8, h - 8), rect(math.floor(w * 0.37), math.floor(w * 0.37) + math.floor(w / 4), 8, h - 8), rect(math.floor(w * 0.72), w - 3, 8, h - 8))))
	stamp("four_quads", grass(union(rect(5, cx - 4, 5, cy - 3), rect(cx + 4, w - 5, 5, cy - 3), rect(5, cx - 4, cy + 3, h - 5), rect(cx + 4, w - 5, cy + 3, h - 5))))
	stamp("five_blobs", grass(union(rect(3, 10, 5, 12), rect(20, 27, 5, 12), rect(36, 43, 5, 12), rect(3, 10, 25, 32), rect(20, 27, 25, 32))))
	stamp("rect_plus_island_near", grass(union(rect(10, cx, 10, h - 10), rect(cx + 3, cx + 4, cy, cy + 1))))
	stamp("rect_plus_island_far", grass(union(rect(10, cx, 10, h - 10), rect(w - 6, w - 5, cy, cy + 1))))
	stamp("single_plot", grass(rect(cx, cx + 1, cy, cy + 1)))
	stamp("rect_mountain_wall", function(x, y)
		if x >= 10 and x < w - 10 and y >= 8 and y < h - 8 then
			if x == cx then return 2 end
			return 0
		end
		return nil
	end)
	stamp("rect_desert", function(x, y) if x >= 10 and x < w - 10 and y >= 8 and y < h - 8 then return 6 end return nil end)
	stamp("L_shape", grass(union(rect(8, 16, 5, h - 5), rect(8, w - 8, 5, 12))))
	stamp("rect_west_edge", grass(rect(0, math.floor(w * 0.5), 10, h - 10)))
	-- one rectangle, several terrains: does the partition read the terrain?
	local R0 = rect(10, w - 10, 8, h - 8)
	local function fill(t) return function(x, y) if R0(x, y) then return t end return nil end end
	stamp("rectB_grass", fill(0))
	stamp("rectB_plains", fill(3))
	stamp("rectB_desert", fill(6))
	stamp("rectB_tundra", fill(9))
	stamp("rectB_grass_hills", fill(1))
	stamp("rectB_snow", fill(12))
	stamp("rectB_grass_mountain_col", function(x, y)
		if R0(x, y) then if x == cx then return 2 end return 0 end
		return nil
	end)
	stamp("rectB_west_desert_east_grass", function(x, y)
		if R0(x, y) then if x < cx then return 6 end return 0 end
		return nil
	end)
	stamp("rectB_west_grass_east_desert", function(x, y)
		if R0(x, y) then if x < cx then return 0 end return 6 end
		return nil
	end)
	stamp("rectB_south_desert", function(x, y)
		if R0(x, y) then if y < cy then return 6 end return 0 end
		return nil
	end)
	stamp("tall_grass", fill_tall(cx, h, 0))
	stamp("tall_desert", fill_tall(cx, h, 6))
	stamp("tall_plains", fill_tall(cx, h, 3))
	clearContinents()
end

local function experimentsB()
	local w, h = Map.GetGridSize()
	for row in GameInfo.Features() do
		if row.NaturalWonder and row.CustomPlacement == nil then
			local f = row.Index
			local anchors = {}
			for i = 0, N() - 1 do
				local p = Map.GetPlotByIndex(i)
				if not p:IsNaturalWonder() and TerrainBuilder.CanHaveFeature(p, f, false) then anchors[#anchors + 1] = i end
			end
			local step = math.max(1, math.floor(#anchors / 8))
			local k = 0
			for j = 1, #anchors, step do
				if k >= 8 then break end
				k = k + 1
				local i = anchors[j]
				local p = Map.GetPlotByIndex(i)
				local x, y = p:GetX(), p:GetY()
				local valid = {}
				for d = 0, 5 do
					local q = Map.GetAdjacentPlot(x, y, d)
					valid[#valid + 1] = (q and TerrainBuilder.CanHaveFeature(q, f, true)) and "1" or "0"
				end
				local tb = {}
				for q = 0, N() - 1 do tb[q] = Map.GetPlotByIndex(q):GetTerrainType() end
				local fb = {}
				for q = 0, N() - 1 do fb[q] = Map.GetPlotByIndex(q):GetFeatureType() end
				TerrainBuilder.SetFeatureType(p, f)
				local out = {}
				for q = 0, N() - 1 do
					local pq = Map.GetPlotByIndex(q)
					if pq:GetFeatureType() == f then
						out[#out + 1] = q .. ":" .. tb[q] .. ":" .. pq:GetTerrainType() .. ":" .. fb[q]
					end
				end
				X[#X + 1] = "nwexp|" .. f .. "|" .. x .. "," .. y .. "|" .. table.concat(valid, "") .. "|" .. table.concat(out, ",")
				for q = 0, N() - 1 do
					local pq = Map.GetPlotByIndex(q)
					if pq:GetFeatureType() == f then
						TerrainBuilder.SetFeatureType(pq, fb[q])
						TerrainBuilder.SetTerrainType(pq, tb[q])
					end
				end
			end
		end
	end
end

local function store()
	local xs = table.concat(X, ";")
	local nx = 0
	for s = 1, #xs, 3000 do
		Map.GetPlotByIndex(nx):SetProperty("civ6lab_mapprobe_x", string.sub(xs, s, s + 2999))
		nx = nx + 1
	end
	Map.GetPlotByIndex(0):SetProperty("civ6lab_mapprobe_xn", nx)
end

local RealGenerateMap = GenerateMap

function GenerateMap()
	local w, h = Map.GetGridSize()
	X[#X + 1] = "grid|" .. w .. "," .. h
	local oka, erra = pcall(experimentsA)
	X[#X + 1] = "phaseA|" .. tostring(oka) .. "|" .. tostring(erra):gsub("[;|]", " ")
	local ok, err = pcall(RealGenerateMap)
	X[#X + 1] = "real|" .. tostring(ok) .. "|" .. tostring(err):gsub("[;|]", " ")
	local okb, errb = pcall(experimentsB)
	X[#X + 1] = "phaseB|" .. tostring(okb) .. "|" .. tostring(errb):gsub("[;|]", " ")
	local oks, errs = pcall(store)
	print("civ6lab_mapprobe_exp stored ok=" .. tostring(oks) .. " " .. tostring(errs))
	if not ok then error(err) end
end
