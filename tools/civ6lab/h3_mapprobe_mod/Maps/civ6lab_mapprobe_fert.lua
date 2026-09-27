-- civ6lab_mapprobe_fert (H-3): GetPlotFertility(i, major, bCheckOthers)
-- measured inside map generation, where the start positioner holds its
-- regions. After Gathering Storm's Continents.lua has made the map, the
-- major regions are divided again (fresh, none used), a plot P of region 0
-- is taken, the plots within 4 of P made flat grassland (no feature,
-- resource or river), and F(P, -1), F(P, 0, false), F(P, 0, true) read
-- while single plots around P change, while starts are set near P, and
-- while regions are marked used. Records fx|<label>|<values> in X
-- (civ6lab_mapprobe_x, like the natives probe).

local X = {}

include "civ6lab_xp2_continents"

local function N() local w, h = Map.GetGridSize(); return w * h end

local function store()
	local xs = table.concat(X, ";")
	local nx = 0
	for s = 1, #xs, 3000 do
		Map.GetPlotByIndex(nx):SetProperty("civ6lab_mapprobe_x", string.sub(xs, s, s + 2999))
		nx = nx + 1
	end
	Map.GetPlotByIndex(0):SetProperty("civ6lab_mapprobe_xn", nx)
end

local function F3(p)
	local i = p:GetIndex()
	return StartPositioner.GetPlotFertility(i, -1) .. "/" .. StartPositioner.GetPlotFertility(i, 0, false) .. "/" ..
		StartPositioner.GetPlotFertility(i, 0, true)
end

local function experiments()
	local nMaj = PlayerManager.GetAliveMajorsCount()
	StartPositioner.DivideMapIntoMajorRegions(nMaj, 150, 50, false)
	local plots = StartPositioner.GetMajorCivStartPlots(0)
	X[#X + 1] = "fx|regions|" .. StartPositioner.GetNumMajorCivStarts() .. "|" .. #plots
	-- P: a land plot of region 0 with every plot within 4 land
	local P, best = nil, -1
	for _, i in ipairs(plots) do
		local p = Map.GetPlotByIndex(i)
		if not p:IsWater() then
			local n = 0
			for dx = -4, 4 do
				for dy = -4, 4 do
					local q = Map.GetPlotXYWithRangeCheck(p:GetX(), p:GetY(), dx, dy, 4)
					if q and not q:IsWater() then n = n + 1 end
				end
			end
			if n > best then P, best = p, n end
		end
	end
	if P == nil then X[#X + 1] = "fx|noP|"; return end
	local disc = {}
	for dx = -4, 4 do
		for dy = -4, 4 do
			local q = Map.GetPlotXYWithRangeCheck(P:GetX(), P:GetY(), dx, dy, 4)
			if q and not q:IsWater() then disc[#disc + 1] = q end
		end
	end
	X[#X + 1] = "fx|land in 4|" .. best
	local function clean(q)
		TerrainBuilder.SetTerrainType(q, 0)
		TerrainBuilder.SetFeatureType(q, -1)
		ResourceBuilder.SetResourceType(q, -1)
		pcall(function() TerrainBuilder.SetWOfRiver(q, false, -1, -1) end)
		pcall(function() TerrainBuilder.SetNWOfRiver(q, false, -1, -1) end)
		pcall(function() TerrainBuilder.SetNEOfRiver(q, false, -1, -1) end)
	end
	for _, q in ipairs(disc) do clean(q) end
	X[#X + 1] = "fx|P|" .. P:GetX() .. "," .. P:GetY() .. "|" .. F3(P)
	-- the plot's own kind
	for _, k in ipairs({ {"t", 3}, {"t", 1}, {"f", 3}, {"r", 11}, {"r", 0}, {"r", 42} }) do
		if k[1] == "t" then TerrainBuilder.SetTerrainType(P, k[2])
		elseif k[1] == "f" then TerrainBuilder.SetFeatureType(P, k[2])
		else ResourceBuilder.SetResourceType(P, k[2], 1) end
		X[#X + 1] = "fx|own " .. k[1] .. k[2] .. "|" .. F3(P)
		clean(P)
	end
	-- one neighbour changed, at distance 1..4 east
	for _, k in ipairs({ {"t", 3}, {"t", 1}, {"t", 2}, {"t", 6}, {"f", 3}, {"r", 11}, {"r", 0} }) do
		local out = {}
		for d = 1, 4 do
			local q = Map.GetPlotXYWithRangeCheck(P:GetX(), P:GetY(), d, 0, d)
			if k[1] == "t" then TerrainBuilder.SetTerrainType(q, k[2])
			elseif k[1] == "f" then TerrainBuilder.SetFeatureType(q, k[2])
			else ResourceBuilder.SetResourceType(q, k[2], 1) end
			out[#out + 1] = d .. ":" .. F3(P)
			clean(q)
		end
		X[#X + 1] = "fx|nb " .. k[1] .. k[2] .. "|" .. table.concat(out, " ")
	end
	-- the ring of P made plains-hills, one plot at a time added
	local ring = {}
	for d = 0, 5 do ring[#ring + 1] = Map.GetAdjacentPlot(P:GetX(), P:GetY(), d) end
	local out = {}
	for n = 1, 6 do
		TerrainBuilder.SetTerrainType(ring[n], 4)
		out[#out + 1] = n .. ":" .. F3(P)
	end
	X[#X + 1] = "fx|ring hills|" .. table.concat(out, " ")
	for _, q in ipairs(ring) do clean(q) end
	-- regions marked used
	for r = 1, math.min(3, StartPositioner.GetNumMajorCivStarts() - 1) do
		StartPositioner.MarkMajorRegionUsed(r)
		X[#X + 1] = "fx|mark " .. r .. "|" .. F3(P)
	end
	StartPositioner.MarkMajorRegionUsed(0)
	X[#X + 1] = "fx|mark 0|" .. F3(P)
	-- a start plot set at distance d (player 1)
	local out2 = {}
	for d = 1, 12 do
		local q = Map.GetPlotXYWithRangeCheck(P:GetX(), P:GetY(), d, 0, d)
		if q then
			Players[1]:SetStartingPlot(q)
			out2[#out2 + 1] = d .. ":" .. F3(P)
		end
	end
	X[#X + 1] = "fx|start1 at d|" .. table.concat(out2, " ")
end

local RealGenerateMap = GenerateMap

function GenerateMap()
	local ok, err = pcall(RealGenerateMap)
	X[#X + 1] = "real|" .. tostring(ok) .. "|" .. tostring(err):gsub("[;|]", " ")
	local starts = {}
	for p = 0, 63 do
		local pl = Players[p]
		if pl and pl:GetStartingPlot() then starts[p] = pl:GetStartingPlot() end
	end
	local oke, erre = pcall(experiments)
	X[#X + 1] = "exp|" .. tostring(oke) .. "|" .. tostring(erre):gsub("[;|]", " ")
	for p, q in pairs(starts) do Players[p]:SetStartingPlot(q) end
	local oks, errs = pcall(store)
	print("civ6lab_mapprobe_fert stored ok=" .. tostring(oks) .. " " .. tostring(errs))
	if not ok then error(err) end
end
