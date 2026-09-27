-- civ6lab_mapprobe_stamp (H-3): StampContinents on controlled land shapes,
-- run inside map generation before the real one (so it DRAWS: each stamp
-- takes its 43, and the map made after is not the unprobed map).
-- The shapes come from civ6lab_stampshapes.lua (h3_stampprobe.py writes
-- it): STAMP_SHAPES[w] = { {name, rle}, ... } for a map w plots wide, the
-- rle over every plot "t*n,..." with t a terrain index or -1 for Ocean.
-- Per shape: terrain written, continent types cleared,
-- AreaBuilder.Recalculate, StampContinents, then one record
--   sx|<name>|<rle continent per plot>
-- stored like the natives probe's X (civ6lab_mapprobe_x, _xn on plot 0).

local X = {}

include "civ6lab_xp2_continents"
include "civ6lab_stampshapes"

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

local function unrle(s)
	local out = {}
	for part in string.gmatch(s, "[^,]+") do
		local v, n = string.match(part, "^(-?%d+)%*(%d+)$")
		v, n = tonumber(v), tonumber(n)
		for _ = 1, n do out[#out + 1] = v end
	end
	return out
end

local function clearContinents()
	for i = 0, N() - 1 do pcall(function() TerrainBuilder.SetContinentType(Map.GetPlotByIndex(i), -1) end) end
end

local function stampAll()
	local w, h = Map.GetGridSize()
	local list = STAMP_SHAPES and STAMP_SHAPES[w] or {}
	for _, sh in ipairs(list) do
		local t = unrle(sh[2])
		for i = 0, N() - 1 do
			local v = t[i + 1]
			TerrainBuilder.SetTerrainType(Map.GetPlotByIndex(i), (v == nil or v < 0) and 16 or v)
		end
		clearContinents()
		AreaBuilder.Recalculate()
		local ok, err = pcall(function() TerrainBuilder.StampContinents() end)
		local cont = {}
		for i = 0, N() - 1 do cont[#cont + 1] = Map.GetPlotByIndex(i):GetContinentType() end
		X[#X + 1] = "sx|" .. sh[1] .. "|" .. rle(cont) .. (ok and "" or ("|ERR " .. tostring(err):gsub("[;|]", " ")))
	end
	clearContinents()
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
	local oka, erra = pcall(stampAll)
	X[#X + 1] = "phaseA|" .. tostring(oka) .. "|" .. tostring(erra):gsub("[;|]", " ")
	local ok, err = pcall(RealGenerateMap)
	X[#X + 1] = "real|" .. tostring(ok) .. "|" .. tostring(err):gsub("[;|]", " ")
	local oks, errs = pcall(store)
	print("civ6lab_mapprobe_stamp stored ok=" .. tostring(oks) .. " " .. tostring(errs))
	if not ok then error(err) end
end
