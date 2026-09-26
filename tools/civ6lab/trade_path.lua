-- InGame, C-20-S1 / C-26-S3: the route chooser's own reads for one origin city
-- against each destination: Game.GetTradeManager():GetTradeRoutePath (plots,
-- portal entrances, exits; TradeRouteChooser.lua:476) with each plot's
-- terrain class, route, improvement and district, and the origin- and
-- destination-side yields From PotentialRoute / Path / Modifiers (all yields;
-- TradeSupport.lua 65-83), plus CanStartRoute. One JSON line per destination.
--   --set ZO=0:327683 --set ZD=all            (or ZD=4:65536,1:131073)
--   --set ZTAG=label
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')) end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" or t == "boolean" then return tostring(v) end
  if t == "table" then
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    local o = {}
    if n > 0 and #v == n then
      for _, x in ipairs(v) do o[#o + 1] = J(x) end
      return "[" .. table.concat(o, ",") .. "]"
    end
    if n == 0 then return "[]" end
    for k, x in pairs(v) do o[#o + 1] = '"' .. esc(k) .. '":' .. J(x) end
    return "{" .. table.concat(o, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local tm = Game.GetTradeManager()
local op, oid = string.match("ZO", "(%d+):(%d+)")
op, oid = tonumber(op), tonumber(oid)
local ocean = GameInfo.Terrains["TERRAIN_OCEAN"].Index
local coast = GameInfo.Terrains["TERRAIN_COAST"].Index
local dests = {}
if "ZD" == "all" then
  for p = 0, 63 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() then
      for _, c in pl:GetCities():Members() do
        if not (p == op and c:GetID() == oid) then dests[#dests + 1] = {p, c:GetID()} end
      end
    end
  end
else
  for p, id in string.gmatch("ZD", "(%d+):(%d+)") do dests[#dests + 1] = {tonumber(p), tonumber(id)} end
end
local function arr(f)
  local ok, v = pcall(f)
  if not ok then return "err:" .. tostring(v) end
  if type(v) ~= "table" then return v end
  local o = {}
  for i = 1, #v do o[i] = v[i] end
  return o
end
local function plotDesc(pi)
  if type(pi) ~= "number" or Map.GetPlotByIndex(pi) == nil then return "raw:" .. tostring(pi) end
  local q = Map.GetPlotByIndex(pi)
  local t = q:GetTerrainType()
  local cls = (t == ocean) and "O" or ((t == coast) and "c" or (q:IsLake() and "L" or (q:IsMountain() and "M" or "l")))
  local r = q:GetRouteType()
  local rn = (r >= 0 and GameInfo.Routes[r]) and GameInfo.Routes[r].RouteType:sub(7) or ""
  local im = q:GetImprovementType()
  local imn = (im >= 0 and GameInfo.Improvements[im]) and GameInfo.Improvements[im].ImprovementType:sub(13) or ""
  local d = q:GetDistrictType()
  local dn = (d >= 0 and GameInfo.Districts[d]) and GameInfo.Districts[d].DistrictType:sub(10) or ""
  return q:GetX() .. ":" .. q:GetY() .. ":" .. cls .. (rn ~= "" and ("/" .. rn) or "") .. (imn ~= "" and ("/" .. imn) or "")
    .. (dn ~= "" and ("/" .. dn) or "")
end
for _, dd in ipairs(dests) do
  local dp, did = dd[1], dd[2]
  local dc = Players[dp]:GetCities():FindID(did)
  local rec = {kind = "tradepath", tag = "ZTAG", turn = Game.GetCurrentGameTurn(), o = op .. ":" .. oid, d = dp .. ":" .. did,
    dname = dc and dc:GetName() or "?", dxy = dc and (dc:GetX() .. ":" .. dc:GetY()) or "?"}
  local ok, pl, pe, px = pcall(function() return tm:GetTradeRoutePath(op, oid, dp, did) end)
  if not ok then rec.path = "err:" .. tostring(pl) else
    local ps, n, nO, nc, nL, nl, nM, nrail = {}, 0, 0, 0, 0, 0, 0, 0
    for _, pi in ipairs(pl or {}) do
      local s = plotDesc(pi)
      ps[#ps + 1] = s
      n = n + 1
      local cls = string.match(s, "^%d+:%d+:(%a)")
      if cls == "O" then nO = nO + 1 elseif cls == "c" then nc = nc + 1 elseif cls == "L" then nL = nL + 1
      elseif cls == "M" then nM = nM + 1 else nl = nl + 1 end
      if string.find(s, "/RAILROAD") then nrail = nrail + 1 end
    end
    rec.n = n
    rec.counts = {ocean = nO, coast = nc, lake = nL, land = nl, mountain = nM, rail = nrail}
    rec.path = ps
    local ent, ex = {}, {}
    for i, pi in ipairs(pe or {}) do if pi ~= -1 then ent[#ent + 1] = i .. ">" .. plotDesc(pi) end end
    for i, pi in ipairs(px or {}) do if pi ~= -1 then ex[#ex + 1] = i .. ">" .. plotDesc(pi) end end
    rec.portalEntrances = ent
    rec.portalExits = ex
  end
  rec.canStart = tostring((pcall(function() return tm:CanStartRoute(op, oid, dp, did) end)) and tm:CanStartRoute(op, oid, dp, did))
  rec.originRoute = arr(function() return tm:CalculateOriginYieldsFromPotentialRoute(op, oid, dp, did) end)
  rec.originPath = arr(function() return tm:CalculateOriginYieldsFromPath(op, oid, dp, did) end)
  rec.originMods = arr(function() return tm:CalculateOriginYieldsFromModifiers(op, oid, dp, did) end)
  rec.destRoute = arr(function() return tm:CalculateDestinationYieldsFromPotentialRoute(op, oid, dp, did) end)
  rec.destPath = arr(function() return tm:CalculateDestinationYieldsFromPath(op, oid, dp, did) end)
  print(J(rec))
end
