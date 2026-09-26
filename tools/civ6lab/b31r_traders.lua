-- InGame: B-31r-S1's ground. Every major's Trader (owner, id, plot, water or
-- land, moves) and every outgoing route of every major city with every
-- field the route table carries (yields flattened), so a plunder can be
-- matched to the route it cut. Every read prints its value or "err:<msg>".
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function flat(v, depth)
  if type(v) ~= "table" then return esc(v) end
  if depth > 2 then return "<deep>" end
  local parts = {}
  for k, x in pairs(v) do parts[#parts + 1] = esc(k) .. ":" .. flat(x, depth + 1) end
  table.sort(parts)
  return "{" .. table.concat(parts, ",") .. "}"
end
local tr = GameInfo.Units["UNIT_TRADER"].Index
local turn = Game.GetCurrentGameTurn()
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    for _, u in pl:GetUnits():Members() do
      if u:GetType() == tr then
        local q = Map.GetPlot(u:GetX(), u:GetY())
        print(string.format("trader t%d p%d id %d at %d:%d water %s moves %s", turn, p, u:GetID(), u:GetX(), u:GetY(),
          tostring(q:IsWater()), tostring(u:GetMovesRemaining())))
      end
    end
    for _, c in pl:GetCities():Members() do
      local ok, routes = pcall(function() return c:GetTrade():GetOutgoingRoutes() end)
      if not ok then
        print("routes p" .. p .. " " .. esc(c:GetName()) .. " err:" .. esc(tostring(routes):match("[^\n]*")))
      elseif routes ~= nil then
        for _, r in ipairs(routes) do
          print(string.format("route t%d p%d from %s %s", turn, p, esc(c:GetName()), flat(r, 0)))
        end
      end
    end
  end
end
