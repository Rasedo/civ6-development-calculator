-- civ6lab_mapprobe_natives (H-3): the quiet probe's recorder (Gathering
-- Storm's Continents.lua from the civ6lab_xp2_*.lua copies, nothing drawn by
-- the probe, the same LOG of Lua draws and native markers) plus what the
-- natives do to the map, in a second record X:
--   keys|<object>|<method names>             the API the map script sees
--   areas|<n>|<rle area id per plot>|<id:plots:water,...>   after each AreaBuilder.Recalculate
--   stamp|before|<rle 0 land / 1 water / 2 lake>, stamp|after|<rle continent>
--   choke|<n>|<method>|<plot indices>        after each AnalyzeChokepoints
--   flood|<i:featureBefore>featureAfter,...> GenerateFloodplains' changes
--   ice|<i>|<event>|<t.f before>|<t.f after>|<ring changed 0/1>
--   low|<i>|<elevation>|<before>|<after>    AddCoastalLowland, the plot's readers
--   corner|<x,y>|<x,y or nil>                GetInlandCorner
--   fwstate|<rle 0 land / 1 water / 2 lake>  the map at the first FindWater
--   fw|<x,y>|<range>|<flag>|<result>         every Map.FindWater
--   nw|<feature>|<x,y>|<i:terrainBefore:terrainAfter,...>   SetFeatureType of a natural wonder
--   mnw|<feature>|<indices>|<plots carrying it after>       SetMultiPlotFeatureType
--   ciu|<continents in use>                  Map.GetContinentsInUse's answer
--   sdiv|<args>|<GetNumMajorCivStarts>, splots|<i>|<indices>, sinfo|<i>|<k=v,...>, and m* for minors
--   ocand|<waterMap>|<n>, oplace|<args>|<n placed>, otile|<i>|<plot index>   the ocean starts
-- and at the end, on the finished map (the wrappers restored):
--   plot|<name>|<hex bits or rle or list> (lake, coastal, fresh, river, impassable, area, yields)
--   fert|<GetPlotFertility(i, -1) per plot>, fertw|<major>|<check>|<...>
--   fsc|<range>|<hex bits of Map.FindSecondContinent>
--   chf|<feature>|<bits arg false>|<bits arg true>|<bits no arg>, chr|<resource>|<bits>
-- LOG is stored in plot properties civ6lab_mapprobe (entries ;-joined, 3000
-- characters a chunk), X as one ;-joined string cut into 3000-character
-- pieces in civ6lab_mapprobe_x (count civ6lab_mapprobe_xn on plot 0).

local raw = TerrainBuilder.GetRandomNumber
local LOG, X = {}, {}
local RID, RN = {}, 0

include(CIV6LAB_SCRIPT or "civ6lab_xp2_continents")

local unpack_ = table.unpack or unpack

local function rid(reason)
	local k = tostring(reason)
	local i = RID[k]
	if i == nil then RN = RN + 1; i = RN; RID[k] = i end
	return i
end

local function isplot(x)
	if type(x) ~= "table" then return false end
	local ok, gx = pcall(function() return x.GetX end)
	return ok and type(gx) == "function"
end

local function pstr(p)
	if p == nil then return "nil" end
	local ok, s = pcall(function() return "@" .. p:GetX() .. "," .. p:GetY() end)
	return ok and s or "@?"
end

local function flagstr(f)
	if isplot(f) then return pstr(f) end
	if type(f) ~= "table" then return tostring(f) end
	if f[1] ~= nil then
		local a = {}
		for _, v in ipairs(f) do a[#a + 1] = isplot(v) and pstr(v) or tostring(v) end
		return "[" .. table.concat(a, ",") .. "]"
	end
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

local function hexbits(get)
	local out, n = {}, N()
	local d, k = 0, 0
	for i = 0, n - 1 do
		local ok, v = pcall(get, Map.GetPlotByIndex(i), i)
		if ok and v then d = d + 2 ^ k end
		k = k + 1
		if k == 4 then out[#out + 1] = string.format("%x", d); d, k = 0, 0 end
	end
	if k > 0 then out[#out + 1] = string.format("%x", d) end
	return table.concat(out)
end

local function water3(p)
	if p:IsLake() then return 2 end
	if p:IsWater() then return 1 end
	return 0
end

local function keys(o)
	local acc, seen = {}, {}
	local function add(t)
		if type(t) ~= "table" then return end
		for k, _ in pairs(t) do
			if type(k) == "string" and not seen[k] then seen[k] = true; acc[#acc + 1] = k end
		end
	end
	add(o)
	local mt = getmetatable(o)
	if type(mt) == "table" then
		add(mt)
		local okx, idx = pcall(function() return mt.__index end)
		if okx then add(idx) end
	end
	table.sort(acc)
	return table.concat(acc, ",")
end

-- facts after a native: land/water/hills/mountains, continents in use
local function facts()
	local land, hills, mtn, lake, cont, feat = 0, 0, 0, 0, {}, 0
	for i = 0, N() - 1 do
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

local FACTS = { StampContinents = true, GenerateFloodplains = true, Recalculate = true }

local function methodLike(pat)
	local mt = getmetatable(Map.GetPlotByIndex(0))
	local idx = type(mt) == "table" and mt.__index or nil
	local hits = {}
	if type(idx) == "table" then
		for k, v in pairs(idx) do
			if type(k) == "string" and string.find(k, pat) and type(v) == "function" then hits[#hits + 1] = k end
		end
	end
	table.sort(hits)
	return hits
end

local function lowlandReaders(p)
	local out = {}
	for _, m in ipairs(methodLike("Lowland")) do
		local ok, v = pcall(function() return p[m](p) end)
		out[#out + 1] = m .. "=" .. (ok and tostring(v) or "err")
	end
	if TerrainManager ~= nil then
		local ok, v = pcall(function() return TerrainManager.GetCoastalLowlandType(p) end)
		out[#out + 1] = "TM=" .. (ok and tostring(v) or "err")
	end
	return table.concat(out, ",")
end

local function tf(p) return tostring(p:GetTerrainType()) .. "." .. tostring(p:GetFeatureType()) end

local nRecalc, nChoke = 0, 0
local fwState = false
local PRE, POST = {}, {}

POST["AreaBuilder.Recalculate"] = function()
	nRecalc = nRecalc + 1
	local sizes, seen = {}, {}
	local ids = perplot(function(p)
		local a = p:GetArea()
		local id = a:GetID()
		if not seen[id] then
			seen[id] = true
			local okw, w = pcall(function() return a:IsWater() end)
			sizes[#sizes + 1] = tostring(id) .. ":" .. tostring(a:GetPlotCount()) .. ":" .. (okw and tostring(w) or "?")
		end
		return id
	end)
	X[#X + 1] = "areas|" .. nRecalc .. "|" .. rle(ids) .. "|" .. table.concat(sizes, ",")
end

PRE["TerrainBuilder.StampContinents"] = function()
	X[#X + 1] = "stamp|before|" .. rle(perplot(water3))
	X[#X + 1] = "stamp|terrain|" .. rle(perplot(function(p) return p:GetTerrainType() end))
end
POST["TerrainBuilder.StampContinents"] = function()
	X[#X + 1] = "stamp|after|" .. rle(perplot(function(p) return p:GetContinentType() end))
end

POST["TerrainBuilder.AnalyzeChokepoints"] = function()
	nChoke = nChoke + 1
	for _, m in ipairs(methodLike("hoke")) do
		local hits = {}
		for i = 0, N() - 1 do
			local p = Map.GetPlotByIndex(i)
			local ok, v = pcall(function() return p[m](p) end)
			if ok and v and v ~= 0 then hits[#hits + 1] = i .. (v == true and "" or ("=" .. tostring(v))) end
		end
		X[#X + 1] = "choke|" .. nChoke .. "|" .. m .. "|" .. table.concat(hits, ",")
	end
end

PRE["TerrainBuilder.GenerateFloodplains"] = function()
	return perplot(function(p) return p:GetFeatureType() end)
end
POST["TerrainBuilder.GenerateFloodplains"] = function(before)
	local after = perplot(function(p) return p:GetFeatureType() end)
	local d = {}
	for i = 1, #after do
		if after[i] ~= before[i] then d[#d + 1] = (i - 1) .. ":" .. tostring(before[i]) .. ">" .. tostring(after[i]) end
	end
	X[#X + 1] = "flood|" .. table.concat(d, ",")
end

local function ringtf(i)
	local p = Map.GetPlotByIndex(i)
	local s = { tf(p) }
	for dir = 0, 5 do
		local q = Map.GetAdjacentPlot(p:GetX(), p:GetY(), dir)
		s[#s + 1] = q and tf(q) or "-"
	end
	return table.concat(s, " ")
end

PRE["TerrainBuilder.AddIce"] = function(i)
	return { tf(Map.GetPlotByIndex(i)), ringtf(i) }
end
POST["TerrainBuilder.AddIce"] = function(st, _res, i, e)
	X[#X + 1] = "ice|" .. tostring(i) .. "|" .. tostring(e) .. "|" .. st[1] .. "|" .. tf(Map.GetPlotByIndex(i)) ..
		"|" .. (ringtf(i) == st[2] and 0 or 1)
end

PRE["TerrainBuilder.AddCoastalLowland"] = function(i)
	local p = Map.GetPlotByIndex(i)
	return tf(p) .. "," .. lowlandReaders(p)
end
POST["TerrainBuilder.AddCoastalLowland"] = function(st, _res, i, e)
	local p = Map.GetPlotByIndex(i)
	X[#X + 1] = "low|" .. tostring(i) .. "|" .. tostring(e) .. "|" .. st .. "|" .. tf(p) .. "," .. lowlandReaders(p)
end

POST["TerrainBuilder.GetInlandCorner"] = function(_st, res, p)
	X[#X + 1] = "corner|" .. pstr(p):sub(2) .. "|" .. (res[1] and pstr(res[1]):sub(2) or "nil")
end

POST["Map.FindWater"] = function(_st, res, p, r, b)
	if not fwState then
		fwState = true
		X[#X + 1] = "fwstate|" .. rle(perplot(water3))
	end
	X[#X + 1] = "fw|" .. pstr(p):sub(2) .. "|" .. tostring(r) .. "|" .. tostring(b) .. "|" .. tostring(res[1])
end

local function carriers(f)
	local a = {}
	for i = 0, N() - 1 do
		if Map.GetPlotByIndex(i):GetFeatureType() == f then a[#a + 1] = i end
	end
	return a
end

PRE["TerrainBuilder.SetFeatureType"] = function(p, f)
	local row = GameInfo.Features[f]
	if row == nil or not row.NaturalWonder then return nil end
	local t = {}
	for i = 0, N() - 1 do t[i] = Map.GetPlotByIndex(i):GetTerrainType() end
	return t
end
POST["TerrainBuilder.SetFeatureType"] = function(t, _res, p, f)
	if t == nil then return end
	local out = {}
	for _, i in ipairs(carriers(f)) do
		out[#out + 1] = i .. ":" .. tostring(t[i]) .. ":" .. tostring(Map.GetPlotByIndex(i):GetTerrainType())
	end
	X[#X + 1] = "nw|" .. tostring(f) .. "|" .. pstr(p):sub(2) .. "|" .. table.concat(out, ",")
end

POST["TerrainBuilder.SetMultiPlotFeatureType"] = function(_st, _res, plots, f)
	X[#X + 1] = "mnw|" .. tostring(f) .. "|" .. flagstr(plots) .. "|" .. table.concat(carriers(f), ",")
end

POST["Map.GetContinentsInUse"] = function(_st, res)
	X[#X + 1] = "ciu|" .. flagstr(res[1])
end

local function infostr(info)
	if type(info) ~= "table" then return tostring(info) end
	local ks = {}
	for k, v in pairs(info) do ks[#ks + 1] = tostring(k) .. "=" .. tostring(v) end
	table.sort(ks)
	return table.concat(ks, ",")
end

-- the map as a Divide call reads it: dfert|<major/minor>|<check>|<rle of
-- GetPlotFertility(i, -1, check)>, dstarts|<phase>|<player:plot,...> (every
-- player's GetStartingPlot), dlm|<phase>|<rle of plot:GetLandmassID? / area>
local fertBusy = false
local function divState(phase)
	fertBusy = true
	for _, chk in ipairs({ false, true }) do
		local vals = {}
		for i = 0, N() - 1 do
			local ok, v = pcall(StartPositioner.GetPlotFertility, i, -1, chk)
			vals[#vals + 1] = ok and tostring(v) or "e"
		end
		X[#X + 1] = "dfert|" .. phase .. "|" .. tostring(chk) .. "|" .. rle(vals)
	end
	fertBusy = false
	local st = {}
	for _, pid in ipairs(PlayerManager.GetAliveIDs and PlayerManager.GetAliveIDs() or {}) do
		local ok, p = pcall(function() return Players[pid]:GetStartingPlot() end)
		st[#st + 1] = tostring(pid) .. ":" .. tostring(ok and p and p:GetIndex())
	end
	X[#X + 1] = "dstarts|" .. phase .. "|" .. table.concat(st, ",")
	local lm = perplot(function(p)
		local ok, v = pcall(function() return p:GetLandmassID() end)
		if ok then return v end
		return "a" .. tostring(p:GetArea():GetID())
	end)
	X[#X + 1] = "dlm|" .. phase .. "|" .. rle(lm)
end
PRE["StartPositioner.DivideMapIntoMajorRegions"] = function() divState("major") end
PRE["StartPositioner.DivideMapIntoMinorRegions"] = function() divState("minor") end

POST["StartPositioner.DivideMapIntoMajorRegions"] = function(_st, _res, ...)
	local ok, n = pcall(function() return StartPositioner.GetNumMajorCivStarts() end)
	X[#X + 1] = "sdiv|" .. argstr(...) .. "|" .. tostring(ok and n)
end
POST["StartPositioner.GetMajorCivStartPlots"] = function(_st, res, i)
	X[#X + 1] = "splots|" .. tostring(i) .. "|" .. flagstr(res[1])
end
POST["StartPositioner.GetMajorCivStartInfo"] = function(_st, res, i)
	X[#X + 1] = "sinfo|" .. tostring(i) .. "|" .. infostr(res[1])
end
POST["StartPositioner.DivideMapIntoMinorRegions"] = function(_st, _res, ...)
	local ok, n = pcall(function() return StartPositioner.GetNumMinorCivStarts() end)
	X[#X + 1] = "mdiv|" .. argstr(...) .. "|" .. tostring(ok and n)
end
POST["StartPositioner.GetMinorCivStartPlots"] = function(_st, res, i)
	X[#X + 1] = "mplots|" .. tostring(i) .. "|" .. flagstr(res[1])
end
POST["StartPositioner.GetMinorCivStartInfo"] = function(_st, res, i)
	X[#X + 1] = "minfo|" .. tostring(i) .. "|" .. infostr(res[1])
end

-- GetPlotFertility calls with a major index (the start picker's weighted
-- fertility), in call order: gpf|<major>|<check>|<index>:<value>,...
local GPF = { key = nil, items = {} }
local function gpfFlush()
	if GPF.key then X[#X + 1] = "gpf|" .. GPF.key .. "|" .. table.concat(GPF.items, ",") end
	GPF.key, GPF.items = nil, {}
end
local gpfBusy = false
POST["StartPositioner.GetPlotFertility"] = function(_st, res, i, major, check)
	if fertBusy or gpfBusy or major == nil or major < 0 then return end
	local key = tostring(major) .. "|" .. tostring(check)
	if key ~= GPF.key then gpfFlush(); GPF.key = key end
	-- beside it, the same plot's fertility with no major and with the check off
	gpfBusy = true
	local okb, base = pcall(StartPositioner.GetPlotFertility, i, -1)
	local okf, nochk = pcall(StartPositioner.GetPlotFertility, i, major, false)
	gpfBusy = false
	GPF.items[#GPF.items + 1] = tostring(i) .. ":" .. tostring(res[1]) .. ":" .. tostring(okb and base) .. ":" ..
		tostring(okf and nochk)
end
-- the ocean starts: ocand|<waterMap>|<GetTotalOceanStartCandidates>,
-- oplace|<args>|<PlaceOceanStartCivs>, otile|<i>|<GetOceanStartTile>
POST["StartPositioner.GetTotalOceanStartCandidates"] = function(_st, res, ...)
	X[#X + 1] = "ocand|" .. argstr(...) .. "|" .. tostring(res[1])
end
POST["StartPositioner.PlaceOceanStartCivs"] = function(_st, res, ...)
	X[#X + 1] = "oplace|" .. argstr(...) .. "|" .. tostring(res[1])
end
POST["StartPositioner.GetOceanStartTile"] = function(_st, res, i)
	X[#X + 1] = "otile|" .. tostring(i) .. "|" .. tostring(res[1])
end
POST["StartPositioner.MarkMajorRegionUsed"] = function(_st, _res, i)
	gpfFlush()
	X[#X + 1] = "mark|" .. tostring(i)
end

local ORIG = { { TerrainBuilder, "GetRandomNumber", raw } }

pcall(function()
	TerrainBuilder.GetRandomNumber = function(r, reason)
		local v = raw(r, reason)
		LOG[#LOG + 1] = tostring(r) .. ":" .. tostring(v) .. ":" .. rid(reason)
		return v
	end
end)

-- quiet: in X only (their calls are many, and the draw ledger reads LOG)
local function wrap(tbl, tname, fname, quiet)
	local f = tbl[fname]
	ORIG[#ORIG + 1] = { tbl, fname, f }
	if type(f) ~= "function" then return end
	local label = tname .. "." .. fname
	pcall(function()
		tbl[fname] = function(...)
			if not quiet then LOG[#LOG + 1] = "<" .. label .. "(" .. argstr(...) .. ")" end
			local pre, post = PRE[label], POST[label]
			local st
			if pre then
				local okp, v = pcall(pre, ...)
				st = okp and v or nil
			end
			local res = { f(...) }
			if post then pcall(post, st, res, ...) end
			if not quiet then
				local tail = ""
				if FACTS[fname] then local okf, fs = pcall(facts); tail = " " .. tostring(fs) end
				LOG[#LOG + 1] = ">" .. label .. tail
			end
			return unpack_(res)
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
wrap(TerrainBuilder, "TerrainBuilder", "SetFeatureType", true)
wrap(AreaBuilder, "AreaBuilder", "Recalculate")
wrap(AreaBuilder, "AreaBuilder", "Calculate")
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMajorRegions")
wrap(StartPositioner, "StartPositioner", "DivideMapIntoMinorRegions")
wrap(StartPositioner, "StartPositioner", "PlaceOceanStartCivs")
wrap(StartPositioner, "StartPositioner", "GetTotalOceanStartCandidates")
wrap(StartPositioner, "StartPositioner", "GetOceanStartTile", true)
wrap(StartPositioner, "StartPositioner", "GetMajorCivStartPlots", true)
wrap(StartPositioner, "StartPositioner", "GetMajorCivStartInfo", true)
wrap(StartPositioner, "StartPositioner", "GetMinorCivStartPlots", true)
wrap(StartPositioner, "StartPositioner", "GetMinorCivStartInfo", true)
wrap(StartPositioner, "StartPositioner", "GetPlotFertility", true)
-- the start picker's choices: pick|major|<region>|<plot index>, pick|minor|<plot>
if AssignStartingPlots then
	local sm, sn = AssignStartingPlots.__SetStartMajor, AssignStartingPlots.__SetStartMinor
	ORIG[#ORIG + 1] = { AssignStartingPlots, "__SetStartMajor", sm }
	ORIG[#ORIG + 1] = { AssignStartingPlots, "__SetStartMinor", sn }
	AssignStartingPlots.__SetStartMajor = function(self, plots, i)
		local p = sm(self, plots, i)
		gpfFlush()
		X[#X + 1] = "pick|major|" .. tostring(i) .. "|" .. tostring(p and p:GetIndex())
		return p
	end
	AssignStartingPlots.__SetStartMinor = function(self, plots)
		local p = sn(self, plots)
		gpfFlush()
		X[#X + 1] = "pick|minor||" .. tostring(p and p:GetIndex())
		return p
	end
end
wrap(StartPositioner, "StartPositioner", "MarkMajorRegionUsed", true)
wrap(Map, "Map", "GetContinentsInUse")
wrap(Map, "Map", "FindWater", true)

local function finalTables()
	local n = N()
	X[#X + 1] = "grid|" .. table.concat({ Map.GetGridSize() }, ",")
	for _, nm in ipairs({ "IsLake", "IsCoastalLand", "IsFreshWater", "IsRiver", "IsImpassable", "IsWater",
		"IsNaturalWonder", "IsRiverAdjacent" }) do
		X[#X + 1] = "plot|" .. nm .. "|" .. hexbits(function(p) return p[nm](p) end)
	end
	X[#X + 1] = "plot|area|" .. rle(perplot(function(p) return p:GetArea():GetID() end))
	for y = 0, 5 do
		X[#X + 1] = "plot|yield" .. y .. "|" .. table.concat(perplot(function(p) return p:GetYield(y) end), ",")
	end
	X[#X + 1] = "fert|" .. table.concat(perplot(function(p) return StartPositioner.GetPlotFertility(p:GetIndex(), -1) end), ",")
	for _, chk in ipairs({ false, true }) do
		X[#X + 1] = "fertw|0|" .. tostring(chk) .. "|" ..
			table.concat(perplot(function(p) return StartPositioner.GetPlotFertility(p:GetIndex(), 0, chk) end), ",")
	end
	for r = 1, 3 do
		X[#X + 1] = "fsc|" .. r .. "|" .. hexbits(function(p) return Map.FindSecondContinent(p, r) end)
	end
	for row in GameInfo.Features() do
		local f = row.Index
		X[#X + 1] = "chf|" .. f .. "|" ..
			hexbits(function(p) return TerrainBuilder.CanHaveFeature(p, f, false) end) .. "|" ..
			hexbits(function(p) return TerrainBuilder.CanHaveFeature(p, f, true) end) .. "|" ..
			hexbits(function(p) return TerrainBuilder.CanHaveFeature(p, f) end)
	end
	for row in GameInfo.Resources() do
		local r = row.Index
		X[#X + 1] = "chr|" .. r .. "|" .. hexbits(function(p) return ResourceBuilder.CanHaveResource(p, r) end)
	end
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
	local xs = table.concat(X, ";")
	local nx = 0
	for s = 1, #xs, 3000 do
		Map.GetPlotByIndex(nx):SetProperty("civ6lab_mapprobe_x", string.sub(xs, s, s + 2999))
		nx = nx + 1
	end
	p0:SetProperty("civ6lab_mapprobe_xn", nx)
end

X[#X + 1] = "keys|plot|" .. keys(Map.GetPlotByIndex(0))
X[#X + 1] = "keys|TerrainBuilder|" .. keys(TerrainBuilder)
X[#X + 1] = "keys|Map|" .. keys(Map)
X[#X + 1] = "keys|AreaBuilder|" .. keys(AreaBuilder)
X[#X + 1] = "keys|StartPositioner|" .. keys(StartPositioner)
X[#X + 1] = "keys|ResourceBuilder|" .. keys(ResourceBuilder)
X[#X + 1] = "keys|Areas|" .. keys(Areas)
X[#X + 1] = "keys|TerrainManager|" .. tostring(TerrainManager ~= nil) .. "|" .. keys(TerrainManager)
X[#X + 1] = "keys|RiverManager|" .. tostring(RiverManager ~= nil) .. "|" .. keys(RiverManager)

local RealGenerateMap = GenerateMap

-- the players the map is made for, in player order:
-- roster|<id>:<civ type>:<leader type>:<IsMajor>:<IsAlive>,... (every
-- PlayerConfigurations entry with a civilization)
local function roster()
	local out = {}
	for id = 0, 63 do
		local okc, pc = pcall(function() return PlayerConfigurations[id] end)
		if okc and pc ~= nil then
			local ok1, civ = pcall(function() return pc:GetCivilizationTypeName() end)
			local ok2, ldr = pcall(function() return pc:GetLeaderTypeName() end)
			local ok3, maj = pcall(function() return Players[id]:IsMajor() end)
			local ok4, alive = pcall(function() return Players[id]:IsAlive() end)
			if ok1 and civ ~= nil and civ ~= "" then
				out[#out + 1] = id .. ":" .. tostring(civ) .. ":" .. (ok2 and tostring(ldr) or "err") .. ":" ..
					(ok3 and tostring(maj) or "err") .. ":" .. (ok4 and tostring(alive) or "err")
			end
		end
	end
	X[#X + 1] = "roster|" .. table.concat(out, ",")
end

function GenerateMap()
	pcall(roster)
	LOG[#LOG + 1] = "<GenerateMap"
	local ok, err = pcall(RealGenerateMap)
	LOG[#LOG + 1] = ">GenerateMap ok=" .. tostring(ok) .. " " .. tostring(err)
	for _, o in ipairs(ORIG) do pcall(function() o[1][o[2]] = o[3] end) end
	gpfFlush()
	local okt, errt = pcall(finalTables)
	X[#X + 1] = "final|" .. tostring(okt) .. "|" .. tostring(errt):gsub("[;|]", " ")
	local oks, errs = pcall(store)
	print("civ6lab_mapprobe_natives stored ok=" .. tostring(oks) .. " " .. tostring(errs))
	if not ok then error(err) end
end
