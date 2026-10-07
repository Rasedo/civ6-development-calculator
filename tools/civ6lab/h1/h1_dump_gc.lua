-- GameCore_Tuner: what only the authoritative state answers for the
-- autoplay differential harness — the turn and the game's random seed at the
-- dump, the named volcanoes in the game's volcano order, and (ZCAT=1, once a
-- game) the map's lists. One JSON line per kind (lab_json.lua prefixed by the
-- caller).
OUT({k = "gc", turn = Game.GetCurrentGameTurn(), seed = P(function() return Game.GetRandomSeed() end)})

-- the volcano vector's NAMED entries in its own order (GetNamedVolcanoes walks
-- the vector by index and leaves out an unnamed one; the volcano roll's
-- choice indexes the named entries in this order): [plot, NamedVolcanoes
-- index]
OUT({k = "volcanoes", total = P(function() return MapFeatureManager.GetNumVolcanoes() end),
  list = P(function()
    local out = {}
    for _, v in ipairs(MapFeatureManager.GetNamedVolcanoes()) do
      out[#out + 1] = {v.PlotY * (Map.GetGridSize()) + v.PlotX, v.TypeID}
    end
    return out
  end)})

if ZCAT == 1 then
  -- the river vector in its own index order (the flood weight 0xa2cfc0 walks
  -- it so): per river its ID, its name (TypeID, -1 unnamed), its plot list,
  -- its Floodplains list and its edges (plot pairs)
  local rivers = P(function()
    local out = {}
    for z = 0, RiverManager.GetNumRivers() - 1 do
      local r = RiverManager.GetRiverByIndex(z)
      local rp = RiverManager.GetRiverByIndex(z, "plots")
      local rf = RiverManager.GetRiverByIndex(z, "floodplain")
      local re = RiverManager.GetRiverByIndex(z, "edges")
      local edges = {}
      for _, e in ipairs((re and re.Edges) or {}) do edges[#edges + 1] = {e[1], e[2]} end
      out[#out + 1] = {index = z, id = r and r.ID, name = r and r.TypeID,
        plots = (rp and rp.Plots) or {}, floodplain = (rf and rf.Floodplain) or {}, edges = edges}
    end
    return out
  end)
  -- each plot's continent (Plot:GetContinentType(), -1 none), in plot order
  local continents = P(function()
    local W, H = Map.GetGridSize()
    local out = {}
    for i = 0, W * H - 1 do out[i + 1] = Map.GetPlotByIndex(i):GetContinentType() end
    return out
  end)
  OUT({k = "mapLists", rivers = rivers, continents = continents,
    mapSeed = P(function() return MapConfiguration.GetValue("RANDOM_SEED") end),
    gameSeed = P(function() return GameConfiguration.GetValue("GAME_SYNC_RANDOM_SEED") end)})
end
