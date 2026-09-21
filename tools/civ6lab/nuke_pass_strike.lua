-- InGame: run every strike in the scene-D population pass, one Bomber each.
-- The aim plot for an offset d is the FIRST land plot at exactly distance d
-- from the city centre in plot-index order, so the choice is deterministic
-- and is printed with the reading.
-- Prints one JSON line per strike with the population before it.
local PLAN = {
  { x = 23, y = 26, owner = 1, pop = 18, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop18-d0-thermo" },
  { x = 20, y = 29, owner = 1, pop = 12, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d0-thermo" },
  { x = 26, y = 28, owner = 1, pop = 8,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop8-d0-thermo" },
  { x = 26, y = 32, owner = 1, pop = 4,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop4-d0-thermo" },
  { x = 19, y = 14, owner = 2, pop = 16, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop16-d0-thermo" },
  { x = 30, y = 20, owner = 1, pop = 20, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop20-d0-thermo" },
  { x = 17, y = 25, owner = 6, pop = 12, d = 1, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d1-thermo" },
  { x = 18, y = 18, owner = 9, pop = 12, d = 2, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d2-thermo" },
  { x = 26, y = 18, owner = 4, pop = 12, d = 3, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d3-thermo" },
  { x = 12, y = 23, owner = 3, pop = 12, d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d0-nuclear" },
  { x = 13, y = 19, owner = 3, pop = 12, d = 1, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d1-nuclear" },
  { x = 22, y = 12, owner = 2, pop = 6,  d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop6-d0-nuclear" },
}
local bombers = {}
for _, u in Players[0]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "UNIT_BOMBER" and u:GetMovesRemaining() > 0 then
    bombers[#bombers + 1] = u
  end
end
print("bombers available " .. #bombers .. " strikes planned " .. #PLAN)
local next_bomber = 1
for _, r in ipairs(PLAN) do
  local ax, ay = r.x, r.y
  if r.d > 0 then
    ax, ay = nil, nil
    for i = 0, Map.GetPlotCount() - 1 do
      local q = Map.GetPlotByIndex(i)
      if Map.GetPlotDistance(r.x, r.y, q:GetX(), q:GetY()) == r.d
         and not q:IsWater() and not q:IsImpassable() then
        ax, ay = q:GetX(), q:GetY()
        break
      end
    end
  end
  local city = Cities.GetCityInPlot(r.x, r.y)
  local popBefore = city and city:GetPopulation() or -1
  local u = bombers[next_bomber]
  if u == nil or ax == nil then
    print("{\"scene\":\"D\",\"kind\":\"pass-strike\",\"tag\":\"" .. r.tag
      .. "\",\"error\":\"" .. (u == nil and "nobomber" or "noaimplot") .. "\"}")
  else
    next_bomber = next_bomber + 1
    local params = {}
    params[UnitOperationTypes.PARAM_X] = ax
    params[UnitOperationTypes.PARAM_Y] = ay
    params[UnitOperationTypes.PARAM_WMD_TYPE] = GameInfo.WMDs[r.wmd].Index
    local okc, can = pcall(function() return UnitManager.CanStartOperation(u, UnitOperationTypes.WMD_STRIKE, nil, params) end)
    local fired, erro = false, nil
    if okc and can then
      fired, erro = pcall(function() UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, params) end)
    end
    print("{\"scene\":\"D\",\"kind\":\"pass-strike\",\"tag\":\"" .. r.tag
      .. "\",\"city\":\"" .. (city and city:GetName() or "-") .. "\",\"owner\":" .. r.owner
      .. ",\"cx\":" .. r.x .. ",\"cy\":" .. r.y .. ",\"aimX\":" .. ax .. ",\"aimY\":" .. ay
      .. ",\"aimOffset\":" .. r.d .. ",\"wmd\":\"" .. r.wmd .. "\""
      .. ",\"popBefore\":" .. popBefore
      .. ",\"bomber\":" .. u:GetID() .. ",\"bomberDist\":" .. Map.GetPlotDistance(u:GetX(), u:GetY(), ax, ay)
      .. ",\"can\":" .. tostring(okc and can or false) .. ",\"fired\":" .. tostring(fired) .. "}")
  end
end
