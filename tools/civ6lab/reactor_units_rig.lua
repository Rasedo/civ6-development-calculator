-- GameCore_Tuner: C-1-S1's unit rig. For every reactor the fallout manager
-- lists: a land military unit (ZMIL) on the reactor's plot, on two ring-1
-- plots and at distance 2 and 3; a Builder on the reactor's plot and on a
-- ring-1 plot; a garrison (ZMIL) on the city centre; a naval unit (ZNAV) on
-- an adjacent water plot where there is one. One line per placement.
--   --set ZMIL=UNIT_INFANTRY --set ZNAV=UNIT_DESTROYER
local fm = Game.GetFalloutManager()
local mil, nav = "ZMIL", "ZNAV"
local function free(p)
  return p ~= nil and not p:IsWater() and not p:IsImpassable() and not p:IsMountain()
    and Units.GetUnitCountInPlot(p:GetX(), p:GetY()) == 0
end
local function place(owner, ut, p, tag, k)
  local ok, u = pcall(function() return UnitManager.InitUnit(owner, ut, p:GetX(), p:GetY()) end)
  print('{"kind":"rig","reactor":' .. k .. ',"tag":"' .. tag .. '","unit":"' .. ut .. '","x":' .. p:GetX()
    .. ',"y":' .. p:GetY() .. ',"ok":' .. tostring(ok and u ~= nil) .. '}')
end
for k = 0, fm:GetReactorCount() - 1 do
  local r = fm:GetReactorByIndex(k)
  local rp = Map.GetPlotByIndex(r.PlotIndex)
  local c = CityManager.GetCity(r.Owner, r.CityID)
  place(r.Owner, mil, rp, "reactor", k)
  place(r.Owner, "UNIT_BUILDER", rp, "reactorBuilder", k)
  local ring = {}
  for d = 0, 5 do
    local p = Map.GetAdjacentPlot(rp:GetX(), rp:GetY(), d)
    if free(p) and not (c and p:GetX() == c:GetX() and p:GetY() == c:GetY()) then ring[#ring + 1] = p end
  end
  if ring[1] then place(r.Owner, mil, ring[1], "ring1a", k) end
  if ring[2] then place(r.Owner, mil, ring[2], "ring1b", k) end
  if ring[3] then place(r.Owner, "UNIT_BUILDER", ring[3], "ring1Builder", k) end
  for _, want in ipairs({2, 3}) do
    local done = false
    for dx = -want, want do
      for dy = -want, want do
        local p = Map.GetPlot(rp:GetX() + dx, rp:GetY() + dy)
        if not done and p and Map.GetPlotDistance(rp:GetX(), rp:GetY(), p:GetX(), p:GetY()) == want and free(p) then
          place(r.Owner, mil, p, "dist" .. want, k)
          done = true
        end
      end
    end
  end
  if c then place(r.Owner, mil, Map.GetPlot(c:GetX(), c:GetY()), "garrison", k) end
  for d = 0, 5 do
    local p = Map.GetAdjacentPlot(rp:GetX(), rp:GetY(), d)
    if p and p:IsWater() and Units.GetUnitCountInPlot(p:GetX(), p:GetY()) == 0 then
      place(r.Owner, nav, p, "naval", k)
      break
    end
  end
end
