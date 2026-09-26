-- InGame: ask 4's real reader. The signature is a CITY, not a plot or an index
--   kFalloutManager:GetReactorAge(pCity)
--   kFalloutManager:GetReactorAccidentThreshold(pCity)
-- (DLC/Expansion2/UI/Loaders/ToolTipLoader_Expansion2.lua:172), and the
-- tooltip reads the threshold as a SEVERITY gate: > 0 means an accident of
-- level 1 is possible, > 1 means level 2, and the notification icons go to
-- SEV2. Prints one line per reactor per call, so a turn-by-turn watch is just
-- this probe between `advance` calls.
--   --set ZTAG=t131
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local fm = Game.GetFalloutManager()
local n = fm:GetReactorCount()
for i = 0, n - 1 do
  local r = fm:GetReactorByIndex(i)
  if r ~= nil then
    local city = nil
    for _, pl in ipairs(Players) do
      local ok, cs = pcall(function() return pl:GetCities() end)
      if ok and cs ~= nil then
        for _, c in cs:Members() do
          if c:GetOwner() == r.Owner and c:GetID() == r.CityID then city = c end
        end
      end
    end
    local function T(f) return tri(pcall(f)) end
    local q = Map.GetPlotByIndex(r.PlotIndex)
    print("{\"kind\":\"reactor-city\",\"stage\":\"ZTAG\",\"turn\":" .. Game.GetCurrentGameTurn()
      .. ",\"i\":" .. i .. ",\"owner\":" .. tostring(r.Owner)
      .. ",\"city\":\"" .. (city and city:GetName():gsub("LOC_CITY_NAME_", "") or "?") .. "\""
      .. ",\"plot\":\"" .. (q and (q:GetX() .. ":" .. q:GetY()) or "?") .. "\""
      .. ",\"recordAge\":" .. tostring(r.Age)
      .. ",\"lastAccidentTurn\":" .. tostring(r.LastAccidentTurn)
      .. ",\"age\":\"" .. (city and T(function() return fm:GetReactorAge(city) end) or "nocity") .. "\""
      .. ",\"accidentThreshold\":\"" .. (city and T(function() return fm:GetReactorAccidentThreshold(city) end) or "nocity") .. "\""
      .. ",\"falloutHere\":" .. tostring(fm:GetFalloutTurnsRemaining(r.PlotIndex)) .. "}")
  end
end
