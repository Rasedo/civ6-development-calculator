-- ASK 15: what an international route pays, decomposed the way the UI asks.
-- InGame. Origin = player 0's capital; every foreign city of players 1..3 is
-- a destination. Per yield: FromPotentialRoute (the whole), FromPath, and
-- FromModifiers, plus the endpoints' district counts so the per-district
-- terms can be read off.
local tm = Game.GetTradeManager()
-- origin: player OOWNER's city whose name contains ONAME; with the tokens
-- left unsubstituted, player 0's capital
local me = tonumber("OOWNER") or 0
local origin = nil
if tonumber("OOWNER") then
  for _, c in Players[me]:GetCities():Members() do if c:GetName():find("ONAME") then origin = c end end
else
  origin = Players[me]:GetCities():GetCapitalCity()
end
if origin == nil then print("noorigin") return end
local function districts(c)
  local all, spec = 0, {}
  for _, d in c:GetDistricts():Members() do
    if d:IsComplete() then
      all = all + 1
      local row = GameInfo.Districts[d:GetType()]
      if row.DistrictType ~= "DISTRICT_CITY_CENTER" and row.DistrictType ~= "DISTRICT_WONDER"
         and row.DistrictType ~= "DISTRICT_AQUEDUCT" and row.DistrictType ~= "DISTRICT_CANAL"
         and row.DistrictType ~= "DISTRICT_DAM" and row.DistrictType ~= "DISTRICT_NEIGHBORHOOD" then
        spec[#spec + 1] = row.DistrictType:gsub("DISTRICT_", "")
      end
    end
  end
  return all, spec
end
local oall, ospec = districts(origin)
print("origin " .. origin:GetName() .. " districts(all=" .. oall .. ") specialty=[" .. table.concat(ospec, ",") .. "]")
local ynames = {}
for y in GameInfo.Yields() do ynames[y.Index] = y.YieldType:gsub("YIELD_", "") end
for p = 0, 3 do
  local pl = Players[p]
  if p ~= me and pl and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      local dall, dspec = districts(c)
      local can = tm:CanStartRoute(me, origin:GetID(), p, c:GetID())
      local parts = {}
      for yi = 0, 5 do
        local whole = tm:CalculateOriginYieldFromPotentialRoute(me, origin:GetID(), p, c:GetID(), yi)
        local path = tm:CalculateOriginYieldFromPath(me, origin:GetID(), p, c:GetID(), yi)
        local mods = tm:CalculateOriginYieldFromModifiers(me, origin:GetID(), p, c:GetID(), yi, -1)
        if whole ~= 0 or path ~= 0 or mods ~= 0 then
          parts[#parts + 1] = ynames[yi] .. "=" .. whole .. "(path " .. path .. ",mods " .. mods .. ")"
        end
      end
      local dparts = {}
      for yi = 0, 5 do
        local whole = tm:CalculateDestinationYieldFromPotentialRoute(me, origin:GetID(), p, c:GetID(), yi)
        if whole ~= 0 then dparts[#dparts + 1] = ynames[yi] .. "=" .. whole end
      end
      print("-> " .. c:GetName():gsub("LOC_CITY_NAME_", "") .. " (p" .. p .. ") can=" .. tostring(can)
            .. " destDistricts(all=" .. dall .. ") specialty=[" .. table.concat(dspec, ",") .. "]"
            .. " ORIGIN GETS " .. table.concat(parts, " ") .. " | DEST GETS " .. table.concat(dparts, " "))
    end
  end
end
