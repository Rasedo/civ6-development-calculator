-- GameCore: candidate founding sites for seat 0 near seat ZP, by BORDER
-- distance (the nearest plot ZP owns), for C-2-S1. A site is land, passable,
-- not a mountain, unowned, no natural wonder, at least 4 from every city
-- (the founding rule), at border distance ZBMIN..ZBMAX from ZP. Each line:
--   site x y border <b to ZP> city <d to ZP's nearest city> other <b to the
--   nearest OTHER major's border (99 when > 6)> minor <b to a minor's border>
-- sorted nearest-first within each border distance; ZN per distance.
--   --set ZP=1 --set ZBMIN=1 --set ZBMAX=3 --set ZN=6
local P, BMIN, BMAX, N = ZP, ZBMIN, ZBMAX, ZN
local cities = {}
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do cities[#cities + 1] = {c:GetX(), c:GetY(), p} end
  end
end
local owned = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local o = q:GetOwner()
  if o >= 0 then owned[#owned + 1] = {q:GetX(), q:GetY(), o} end
end
local found = {}
for b = BMIN, BMAX do found[b] = {} end
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if not q:IsWater() and not q:IsImpassable() and not q:IsMountain() and q:GetOwner() == -1
     and not q:IsNaturalWonder() then
    local x, y = q:GetX(), q:GetY()
    local dmin, dp = 999, 999
    for _, c in ipairs(cities) do
      local d = Map.GetPlotDistance(x, y, c[1], c[2])
      if d < dmin then dmin = d end
      if c[3] == P and d < dp then dp = d end
    end
    if dmin >= 4 and dp <= BMAX + 6 then
      local bp, bo, bm = 999, 99, 99
      for _, o in ipairs(owned) do
        local d = Map.GetPlotDistance(x, y, o[1], o[2])
        if o[3] == P then
          if d < bp then bp = d end
        elseif Players[o[3]]:IsMajor() then
          if d < bo and d <= 6 then bo = d end
        elseif d < bm and d <= 6 then bm = d end
      end
      if bp >= BMIN and bp <= BMAX then
        local l = found[bp]
        l[#l + 1] = {x, y, bp, dp, bo, bm}
      end
    end
  end
end
for b = BMIN, BMAX do
  local l = found[b]
  table.sort(l, function(u, v) if u[5] ~= v[5] then return u[5] > v[5] end return u[4] < v[4] end)
  for k = 1, math.min(N, #l) do
    local s = l[k]
    print(string.format("site %d %d border %d city %d other %d minor %d", s[1], s[2], s[3], s[4], s[5], s[6]))
  end
  print(string.format("count border %d: %d", b, #l))
end
