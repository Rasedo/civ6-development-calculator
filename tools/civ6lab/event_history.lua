-- InGame: the game's random-event record, turn by turn. GetEventsForTurn(t)
-- holds at most one record per turn (the event that STARTED on t); the
-- Climate screen walks it over t = 0..now (ClimateScreen.lua:622). One JSON
-- line per turn with every field of the record as the game hands it
-- (RandomEvent, Name, StartTurn, EndTurn, StartLocation, CurrentLocation,
-- CurrentDirection, River, Volcano, NaturalWonderVolcano, TilesDamaged,
-- PopLost, UnitsLost, FertilityAdded, and anything else it carries), the
-- event's type name, and each plot-index field decoded to x,y:
--   {"kind":"turn","t":T,"event":{...}}   a record (any non-empty table)
--   {"kind":"turn","t":T,"event":null}    an empty turn (nil or {})
--   {"kind":"turn","t":T,"event":"err:<message>"}
-- A header line names the turn, the turn limit and the realism setting; a
-- frequencies line carries that setting's RandomEvent_Frequencies.
local function esc(s)
  s = tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')
  return (s:gsub('%c', function(c) return string.format('\\u%04x', c:byte()) end))
end
local function J(v, depth)
  local t = type(v)
  depth = depth or 0
  if v == nil then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return '"' .. tostring(v) .. '"' end
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.10g", v)
  end
  if t == "table" then
    if depth > 5 then return '"<deep>"' end
    local n, count, arr = #v, 0, true
    for k in pairs(v) do count = count + 1; if type(k) ~= "number" then arr = false end end
    local parts = {}
    if arr and count == n then
      for i = 1, n do parts[i] = J(v[i], depth + 1) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do parts[#parts + 1] = '"' .. esc(k) .. '":' .. J(v[k], depth + 1) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local function P(f)
  local ok, v = pcall(f)
  if ok then return v end
  return "err:" .. tostring(v)
end

local now = Game.GetCurrentGameTurn()
local realism = P(function() return GameConfiguration.GetValue("GAME_REALISM") end)
local rname = nil
for r in GameInfo.RealismSettings() do
  if tonumber(r.Index) == tonumber(realism) then rname = r.RealismSettingType end
end
print('{"kind":"header","now":' .. now .. ',"maxTurns":' .. J(P(function() return Game.GetMaxGameTurns() end))
  .. ',"realism":' .. J(realism) .. ',"realismType":' .. J(rname) .. '}')
local freq = {}
for r in GameInfo.RandomEvent_Frequencies() do
  if tostring(r.RealismSettingType) == tostring(rname) then freq[r.RandomEventType] = r.OccurrencesPerGame end
end
print('{"kind":"frequencies","realismType":' .. J(rname) .. ',"occurrencesPerGame":' .. J(freq) .. '}')

local PLOT_FIELDS = {"StartLocation", "CurrentLocation"}
for t = 0, now do
  local e = P(function() return GameRandomEvents.GetEventsForTurn(t) end)
  local filled = false
  if type(e) == "table" then for _ in pairs(e) do filled = true; break end end
  if filled then
    local row = e.RandomEvent ~= nil and GameInfo.RandomEvents[e.RandomEvent] or nil
    local xy = {}
    for _, k in ipairs(PLOT_FIELDS) do
      local i = e[k]
      local q = type(i) == "number" and i >= 0 and Map.GetPlotByIndex(i) or nil
      if q ~= nil then xy[k] = {q:GetX(), q:GetY()} end
    end
    print('{"kind":"turn","t":' .. t .. ',"eventType":' .. J(row and row.RandomEventType)
      .. ',"event":' .. J(e) .. ',"xy":' .. J(xy) .. '}')
  elseif type(e) == "table" or e == nil then
    print('{"kind":"turn","t":' .. t .. ',"event":null}')
  else
    print('{"kind":"turn","t":' .. t .. ',"event":' .. J(e) .. '}')
  end
end
