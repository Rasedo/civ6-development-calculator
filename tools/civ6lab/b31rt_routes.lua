-- InGame, B-31r: every outgoing trade route of player ZP with what might set
-- its plunder payout: the Trader, origin and destination cities (owner,
-- position, population), their hex distance, the Trader's path length
-- (GetTradeRoutePath), both sides' yields, and every other field the route
-- record carries. One JSON-ish line per route.
--   --set ZP=1
local function flat(v)
  if type(v) ~= "table" then return tostring(v) end
  local o = {}
  for k, x in pairs(v) do o[#o + 1] = tostring(k) .. "=" .. flat(x) end
  return "{" .. table.concat(o, ",") .. "}"
end
local tm = Game.GetTradeManager()
for _, c in Players[ZP]:GetCities():Members() do
  local ok, routes = pcall(function() return c:GetTrade():GetOutgoingRoutes() end)
  for _, r in ipairs(ok and routes or {}) do
    local dc = Players[r.DestinationCityPlayer]:GetCities():FindID(r.DestinationCityID)
    local plen = "?"
    pcall(function()
      local path = tm:GetTradeRoutePath(r.OriginCityPlayer, r.OriginCityID, r.DestinationCityPlayer, r.DestinationCityID)
      plen = #path
    end)
    local fields = {}
    for k, x in pairs(r) do if k ~= "OriginYields" and k ~= "DestinationYields" then fields[#fields + 1] = k .. "=" .. flat(x) end end
    local function ys(t) local o = {} for _, y in ipairs(t or {}) do o[#o + 1] = y.YieldIndex .. ":" .. y.Amount end return table.concat(o, " ") end
    print("trader=" .. tostring(r.TraderUnitID) .. " origin=" .. c:GetName() .. "@" .. c:GetX() .. ":" .. c:GetY() .. " pop=" .. c:GetPopulation()
      .. " dest=p" .. r.DestinationCityPlayer .. ":" .. (dc and (dc:GetName() .. "@" .. dc:GetX() .. ":" .. dc:GetY() .. " pop=" .. dc:GetPopulation()) or "?")
      .. " dist=" .. (dc and Map.GetPlotDistance(c:GetX(), c:GetY(), dc:GetX(), dc:GetY()) or -1) .. " path=" .. plen
      .. " oy=[" .. ys(r.OriginYields) .. "] dy=[" .. ys(r.DestinationYields) .. "] | " .. table.concat(fields, " "))
  end
end
