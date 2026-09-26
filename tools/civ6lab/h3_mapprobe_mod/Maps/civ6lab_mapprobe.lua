-- civ6lab_mapprobe (H-3): Gathering Storm's Continents.lua, unchanged, run
-- under a recorder. Every Lua call of TerrainBuilder.GetRandomNumber is
-- logged as range:value:reason-id; around each heavy native builder four
-- GetRandomNumber(32768) PINS fix the generator's state exactly, so the
-- native draws between two pins are counted offline. The log is stored in
-- plot properties ("civ6lab_mapprobe" on plots 0..k-1, the chunk count and
-- the reason table on plot 0) for GameCore_Tuner to read after the start.

local raw = TerrainBuilder.GetRandomNumber
local LOG = {}
local RID, RN = {}, 0

local function pin(tag)
	local t = {}
	for i = 1, 4 do t[i] = raw(32768, "civ6lab pin") end
	LOG[#LOG + 1] = "P" .. tag .. "=" .. table.concat(t, ",")
end

pin("load")

include "Continents"

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

pcall(function()
	TerrainBuilder.GetRandomNumber = function(r, reason)
		local v = raw(r, reason)
		LOG[#LOG + 1] = tostring(r) .. ":" .. tostring(v) .. ":" .. rid(reason)
		return v
	end
end)

-- the natives' tables are shared with GameCore's other Lua contexts, so every
-- wrapper is undone when GenerateMap returns
local ORIG = { { TerrainBuilder, "GetRandomNumber", raw } }

local function wrap(tbl, tname, fname, logargs)
	local f = tbl[fname]
	ORIG[#ORIG + 1] = { tbl, fname, f }
	if type(f) ~= "function" then return end
	pcall(function()
		tbl[fname] = function(...)
			local a = { ... }
			local desc = tname .. "." .. fname
			if logargs then
				local parts = {}
				for i = 1, select("#", ...) do
					local x = a[i]
					parts[#parts + 1] = (type(x) == "table") and flagstr(x) or tostring(x)
				end
				desc = desc .. "(" .. table.concat(parts, ",") .. ")"
			end
			pin("<" .. desc)
			local res = { f(...) }
			pin(">" .. tname .. "." .. fname)
			return (table.unpack or unpack)(res)
		end
	end)
end

wrap(Fractal, "Fractal", "Create", true)
wrap(Fractal, "Fractal", "CreateRifts", false)
wrap(TerrainBuilder, "TerrainBuilder", "StampContinents", false)
wrap(TerrainBuilder, "TerrainBuilder", "AnalyzeChokepoints", false)
wrap(TerrainBuilder, "TerrainBuilder", "GenerateFloodplains", true)
wrap(TerrainBuilder, "TerrainBuilder", "AddIce", false)
wrap(AreaBuilder, "AreaBuilder", "Recalculate", false)
wrap(AreaBuilder, "AreaBuilder", "Calculate", false)
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMajorRegions", true)
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMinorRegions", true)
wrap(StartPositioner, "StartPositioner", "PlaceOceanStartCivs", false)

local RealGenerateMap = GenerateMap

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

function GenerateMap()
	pin("entry")
	local mr = {}
	local okm = pcall(function() for i = 1, 4 do mr[i] = math.random(1000000) end end)
	LOG[#LOG + 1] = "M=" .. (okm and table.concat(mr, ",") or "err")
	RealGenerateMap()
	pin("exit")
	for _, o in ipairs(ORIG) do pcall(function() o[1][o[2]] = o[3] end) end
	local ok, err = pcall(store)
	print("civ6lab_mapprobe stored ok=" .. tostring(ok) .. " " .. tostring(err))
end
