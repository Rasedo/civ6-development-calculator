-- GameCore_Tuner, B-89-S1: the rig for "what may target a religious unit".
-- Around seat 0's city at ZCX:ZCY: walls on the city, a seat-0 Swordsman S and
-- Crossbowman X on two tiles next to the city, and four units of the enemy ZE
-- (Missionary, Apostle, Builder, Warrior), one per tile, each adjacent to S and
-- within 2 of X and of the city. Moves and attacks restored on seat 0's units
-- (UnitManager.RestoreMovement / RestoreUnitAttacks, GameCore) so the rig can
-- be read in the turn it is built. One JSON line per placed thing.
--   --set ZCX=36 --set ZCY=46 --set ZE=6
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')) end
local function P(f) local ok, v = pcall(f) if ok then return v end return "err:" .. tostring(v) end
local function out(t)
  local o = {}
  for k, v in pairs(t) do
    local s = (type(v) == "number" or type(v) == "boolean") and tostring(v) or ('"' .. esc(v) .. '"')
    o[#o + 1] = '"' .. k .. '":' .. s
  end
  print("{" .. table.concat(o, ",") .. "}")
end
local me = Players[0]
local city = nil
for _, c in me:GetCities():Members() do if c:GetX() == ZCX and c:GetY() == ZCY then city = c end end
if city == nil then out({kind = "b89", error = "nocity"}) return end
-- walls
local walls = GameInfo.Buildings["BUILDING_WALLS"].Index
local had = P(function() return city:GetBuildings():HasBuilding(walls) end)
if had ~= true then
  P(function() return WorldBuilder.CityManager():CreateBuilding(city, "BUILDING_WALLS", 100, Map.GetPlotIndex(ZCX, ZCY)) end)
end
out({kind = "walls", before = tostring(had), after = tostring(P(function() return city:GetBuildings():HasBuilding(walls) end))})

local function free(q)
  return q ~= nil and not q:IsWater() and not q:IsImpassable() and not q:IsMountain() and not q:IsCity()
    and q:GetUnitCount() == 0 and q:GetDistrictType() < 0
end
local ring1 = {}
for dx = -3, 3 do
  for dy = -3, 3 do
    local q = Map.GetPlot(ZCX + dx, ZCY + dy)
    if free(q) and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) <= 2 then ring1[#ring1 + 1] = q end
  end
end
-- pick S and X among ring 1, and 4 targets around S, maximising the count
local best = nil
for _, s in ipairs(ring1) do
  for _, x in ipairs(ring1) do
    if x ~= s then
      local tg = {}
      for d = 0, 5 do
        local q = Map.GetAdjacentPlot(s:GetX(), s:GetY(), d)
        if free(q) and q ~= x and Map.GetPlotDistance(q:GetX(), q:GetY(), x:GetX(), x:GetY()) <= 2 then
          tg[#tg + 1] = q
        end
      end
      -- the tiles within the city's range first
      table.sort(tg, function(a, b)
        return Map.GetPlotDistance(a:GetX(), a:GetY(), ZCX, ZCY) < Map.GetPlotDistance(b:GetX(), b:GetY(), ZCX, ZCY)
      end)
      local near = 0
      for _, q in ipairs(tg) do if Map.GetPlotDistance(q:GetX(), q:GetY(), ZCX, ZCY) <= 2 then near = near + 1 end end
      if best == nil or #tg > #best.tg or (#tg == #best.tg and near > best.near) then best = {s = s, x = x, tg = tg, near = near} end
    end
  end
end
if best == nil or #best.tg < 4 then out({kind = "b89", error = "noroom", n = best and #best.tg or 0}) return end

-- a religion neither founded by seat 0 nor its majority
local mine = P(function() return me:GetReligion():GetReligionTypeCreated() end)
local maj = P(function() return me:GetReligion():GetReligionInMajorityOfCities() end)
local rel = nil
local theirs = P(function() return Players[ZE]:GetReligion():GetReligionTypeCreated() end)
if type(theirs) == "number" and theirs >= 0 and theirs ~= mine and theirs ~= maj then rel = GameInfo.Religions[theirs].ReligionType end
if rel == nil then
  for r in GameInfo.Religions() do
    if rel == nil and r.Index ~= mine and r.Index ~= maj and not r.Pantheon then rel = r.ReligionType end
  end
end
out({kind = "religion", mine = tostring(mine), majority = tostring(maj), enemyFounded = tostring(theirs), used = tostring(rel)})

local function make(p, ty, q, tag)
  local u = P(function() return Players[p]:GetUnits():Create(GameInfo.Units[ty].Index, q:GetX(), q:GetY()) end)
  local rec = {kind = "unit", tag = tag, owner = p, type = ty, x = q:GetX(), y = q:GetY()}
  if type(u) == "string" then rec.error = u elseif u == nil then rec.error = "nil" else
    rec.id = u:GetID()
    if p == 0 then
      rec.restoreMoves = tostring(P(function() UnitManager.RestoreMovement(u) return true end))
      rec.restoreAttacks = tostring(P(function() UnitManager.RestoreUnitAttacks(u) return true end))
      rec.moves = u:GetMovesRemaining()
    end
    if ty == "UNIT_MISSIONARY" or ty == "UNIT_APOSTLE" then
      rec.setReligion = tostring(P(function() u:GetReligion():SetReligionType(rel) return true end))
      rec.religion = tostring(P(function() return u:GetReligion():GetReligionType() end))
      rec.spread = tostring(P(function() return u:GetReligion():GetSpreadCharges() end))
    end
  end
  out(rec)
end
make(0, "UNIT_SWORDSMAN", best.s, "S")
make(0, "UNIT_CROSSBOWMAN", best.x, "X")
make(ZE, "UNIT_MISSIONARY", best.tg[1], "M")
make(ZE, "UNIT_APOSTLE", best.tg[2], "A")
make(ZE, "UNIT_BUILDER", best.tg[3], "B")
make(ZE, "UNIT_WARRIOR", best.tg[4], "W")
out({kind = "b89", city = city:GetID(), cx = ZCX, cy = ZCY, extra = #best.tg,
  war = tostring(me:GetDiplomacy():IsAtWarWith(ZE))})
