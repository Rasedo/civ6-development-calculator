-- GameCore (after lab_json.lua): B-91 — land plots off continent ZCONT, unowned,
-- flat or hills, no feature-blocked terrain, no city within 4: candidate sites
-- for player ZP's Settler. Prints up to 30, nearest ZP's capital first.
local cap = Players[ZP]:GetCities():GetCapitalCity()
local out = {}
local W, H = Map.GetGridSize()
for i = 0, W * H - 1 do
  local pl = Map.GetPlotByIndex(i)
  if not pl:IsWater() and not pl:IsMountain() and pl:GetOwner() == -1 and pl:GetContinentType() ~= ZCONT
     and pl:GetContinentType() ~= -1 and not pl:IsImpassable() and pl:GetUnitCount() == 0 then
    local near = false
    for _, p in ipairs(PlayerManager.GetAlive()) do
      for _, c in p:GetCities():Members() do
        if Map.GetPlotDistance(c:GetX(), c:GetY(), pl:GetX(), pl:GetY()) < 4 then near = true end
      end
      if near then break end
    end
    if not near then
      out[#out + 1] = {x = pl:GetX(), y = pl:GetY(), cont = pl:GetContinentType(), terrain = pl:GetTerrainType(),
        d = Map.GetPlotDistance(cap:GetX(), cap:GetY(), pl:GetX(), pl:GetY())}
    end
  end
end
table.sort(out, function(a, b) return a.d < b.d end)
local top = {}
for k = 1, math.min(30, #out) do top[k] = out[k] end
OUT({kind = "sites", p = ZP, n = #out, top = top})
