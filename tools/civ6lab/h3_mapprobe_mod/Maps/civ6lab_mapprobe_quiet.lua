-- civ6lab_mapprobe_quiet (H-3): Gathering Storm's Continents.lua (the
-- Expansion2 file and its utilities, carried as civ6lab_xp2_*.lua (h3_xp2copy.py)
-- so the includes do not resolve to Base), run under a recorder that draws NOTHING of
-- its own: the map is the unprobed map. Every Lua GetRandomNumber is logged
-- as range:value:reason-id; every native builder call as "<Name(args)" and
-- ">Name" markers, with a few map facts after some of them. The native draws
-- are counted offline by aligning the Lua draws against the stream from the
-- map seed (h3_ledger.py). Stored in plot properties as civ6lab_mapprobe.

local raw = TerrainBuilder.GetRandomNumber
local LOG = {}
local RID, RN = {}, 0

include "civ6lab_xp2_continents"

local function rid(reason)
	local k = tostring(reason)
	local i = RID[k]
	if i == nil then RN = RN + 1; i = RN; RID[k] = i end
	return i
end

local function flagstr(f)
	if type(f) ~= "table" then return tostring(f) end
	local ks = {}
	for k, v in pairs(f) do ks[#ks + 1] = tostring(k) .. "=" .. tostring(v) end
	table.sort(ks)
	return "{" .. table.concat(ks, "|") .. "}"
end

local function argstr(...)
	local parts = {}
	for i = 1, select("#", ...) do
		local x = select(i, ...)
		if type(x) == "table" then parts[#parts + 1] = flagstr(x)
		elseif type(x) == "userdata" then parts[#parts + 1] = "ud"
		else parts[#parts + 1] = tostring(x) end
	end
	return table.concat(parts, ",")
end

-- map facts after a native: land/water/hills/mountains, continents in use
local function facts()
	local w, h = Map.GetGridSize()
	local n = w * h
	local land, hills, mtn, lake, cont, feat = 0, 0, 0, 0, {}, 0
	for i = 0, n - 1 do
		local p = Map.GetPlotByIndex(i)
		if not p:IsWater() then land = land + 1 end
		if p:IsHills() then hills = hills + 1 end
		if p:IsMountain() then mtn = mtn + 1 end
		if p:IsLake() then lake = lake + 1 end
		if p:GetFeatureType() ~= -1 then feat = feat + 1 end
		local c = p:GetContinentType()
		if c ~= -1 then cont[c] = (cont[c] or 0) + 1 end
	end
	local cs = {}
	for k, v in pairs(cont) do cs[#cs + 1] = tostring(k) .. ":" .. tostring(v) end
	table.sort(cs)
	return "land=" .. land .. " hills=" .. hills .. " mtn=" .. mtn .. " lake=" .. lake .. " feat=" .. feat ..
		" cont=" .. table.concat(cs, "/")
end

local FACTS = { StampContinents = true, AddIce = false, GenerateFloodplains = true, Recalculate = true,
	AnalyzeChokepoints = false }

local ORIG = { { TerrainBuilder, "GetRandomNumber", raw } }

pcall(function()
	TerrainBuilder.GetRandomNumber = function(r, reason)
		local v = raw(r, reason)
		LOG[#LOG + 1] = tostring(r) .. ":" .. tostring(v) .. ":" .. rid(reason)
		return v
	end
end)

local function wrap(tbl, tname, fname)
	local f = tbl[fname]
	ORIG[#ORIG + 1] = { tbl, fname, f }
	if type(f) ~= "function" then return end
	pcall(function()
		tbl[fname] = function(...)
			LOG[#LOG + 1] = "<" .. tname .. "." .. fname .. "(" .. argstr(...) .. ")"
			local res = { f(...) }
			local tail = ""
			if FACTS[fname] then local okf, fs = pcall(facts); tail = " " .. tostring(fs) end
			LOG[#LOG + 1] = ">" .. tname .. "." .. fname .. tail
			return (table.unpack or unpack)(res)
		end
	end)
end

wrap(Fractal, "Fractal", "Create")
wrap(Fractal, "Fractal", "CreateRifts")
wrap(TerrainBuilder, "TerrainBuilder", "StampContinents")
wrap(TerrainBuilder, "TerrainBuilder", "AnalyzeChokepoints")
wrap(TerrainBuilder, "TerrainBuilder", "GenerateFloodplains")
wrap(TerrainBuilder, "TerrainBuilder", "AddIce")
wrap(TerrainBuilder, "TerrainBuilder", "AddCoastalLowland")
wrap(TerrainBuilder, "TerrainBuilder", "GetInlandCorner")
wrap(TerrainBuilder, "TerrainBuilder", "SetWOfRiver")
wrap(TerrainBuilder, "TerrainBuilder", "SetNWOfRiver")
wrap(TerrainBuilder, "TerrainBuilder", "SetNEOfRiver")
wrap(TerrainBuilder, "TerrainBuilder", "GetFeaturePlacementPlotList")
wrap(TerrainBuilder, "TerrainBuilder", "SetMultiPlotFeatureType")
wrap(AreaBuilder, "AreaBuilder", "Recalculate")
wrap(AreaBuilder, "AreaBuilder", "Calculate")
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMajorRegions")
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMinorRegions")
wrap(StartPositioner, "StartPositioner", "PlaceOceanStartCivs")
wrap(Map, "Map", "GetContinentsInUse")

-- the Fractal object's methods live on a metatable shared by every fractal:
-- wrapped when the first fractal is made
local fracWrapped = false
local function wrapFractalMethods(obj)
	if fracWrapped then return end
	fracWrapped = true
	local mt = getmetatable(obj)
	local idx = type(mt) == "table" and mt.__index or nil
	LOG[#LOG + 1] = "<FractalWrap(mt=" .. type(mt) .. "|idx=" .. type(idx) .. ")"
	LOG[#LOG + 1] = ">FractalWrap"
	if type(idx) ~= "table" then return end
	local br = idx.BuildRidges
	ORIG[#ORIG + 1] = { idx, "BuildRidges", br }
	idx.BuildRidges = function(self, ...)
		LOG[#LOG + 1] = "<Fractal:BuildRidges(" .. argstr(...) .. ")"
		local res = { br(self, ...) }
		LOG[#LOG + 1] = ">Fractal:BuildRidges"
		return (table.unpack or unpack)(res)
	end
end
local createWrapped = Fractal.Create
Fractal.Create = function(...)
	local obj = createWrapped(...)
	local okw, ew = pcall(wrapFractalMethods, obj)
	if not okw then LOG[#LOG + 1] = "<FractalWrapError(" .. tostring(ew):gsub("[;:]", " ") .. ")"; LOG[#LOG + 1] = ">FractalWrapError" end
	return obj
end

local function store()
	local chunks, cur, n = {}, {}, 0
	for _, s in ipairs(LOG) do
		cur[#cur + 1] = s
		n = n + #s + 1
		if n > 3000 then chunks[#chunks + 1] = table.concat(cur, ";"); cur, n = {}, 0 end
	end
	if #cur > 0 then chunks[#chunks + 1] = table.concat(cur, ";") end
	local names = {}
	for k, i in pairs(RID) do names[#names + 1] = i .. "=" .. k end
	table.sort(names)
	local p0 = Map.GetPlotByIndex(0)
	p0:SetProperty("civ6lab_mapprobe_n", #chunks)
	p0:SetProperty("civ6lab_mapprobe_reasons", table.concat(names, "\n"))
	for i, c in ipairs(chunks) do
		Map.GetPlotByIndex(i - 1):SetProperty("civ6lab_mapprobe", c)
	end
end

local RealGenerateMap = GenerateMap

function GenerateMap()
	LOG[#LOG + 1] = "<GenerateMap"
	local ok, err = pcall(RealGenerateMap)
	LOG[#LOG + 1] = ">GenerateMap ok=" .. tostring(ok) .. " " .. tostring(err)
	for _, o in ipairs(ORIG) do pcall(function() o[1][o[2]] = o[3] end) end
	local oks, errs = pcall(store)
	print("civ6lab_mapprobe_quiet stored ok=" .. tostring(oks) .. " " .. tostring(errs))
	if not ok then error(err) end
end
