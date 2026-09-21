-- GameCore_Tuner: did a warhead actually DETONATE on the aim plot?
-- Fallout on the aim plot is the signature of a landing; an intercepted strike
-- leaves none. Also lists every unit within 2 of the aim with its HP, so a
-- cancelled strike (defender untouched) separates from a landed one.
--   --set ZAX=36 --set ZAY=15
local fm = Game.GetFalloutManager()
local aim = Map.GetPlot(ZAX, ZAY)
local out = {}
for _, pl in ipairs(Players) do
  local ok, list = pcall(function() return pl:GetUnits() end)
  if ok and list ~= nil then
    for _, u in list:Members() do
      if Map.GetPlotDistance(ZAX, ZAY, u:GetX(), u:GetY()) <= 2 then
        out[#out + 1] = "{\"owner\":" .. pl:GetID() .. ",\"id\":" .. u:GetID()
          .. ",\"t\":\"" .. GameInfo.Units[u:GetType()].UnitType .. "\""
          .. ",\"at\":\"" .. u:GetX() .. ":" .. u:GetY() .. "\""
          .. ",\"hp\":" .. (u:GetMaxDamage() - u:GetDamage()) .. "}"
      end
    end
  end
end
local fo = {}
for dx = -2, 2 do
  for dy = -2, 2 do
    local okp, q = pcall(function() return Map.GetPlot(ZAX + dx, ZAY + dy) end)
    if okp and q ~= nil and Map.GetPlotDistance(ZAX, ZAY, q:GetX(), q:GetY()) <= 2 then
      local t = fm:GetFalloutTurnsRemaining(q:GetIndex())
      if t and t > 0 then
        fo[#fo + 1] = "{\"at\":\"" .. q:GetX() .. ":" .. q:GetY() .. "\",\"turns\":" .. t .. "}"
      end
    end
  end
end
print("{\"kind\":\"blastcheck\",\"aim\":\"" .. ZAX .. ":" .. ZAY .. "\""
  .. ",\"aimFallout\":" .. tostring(fm:GetFalloutTurnsRemaining(aim:GetIndex()))
  .. ",\"falloutTiles\":" .. #fo .. ",\"fallout\":[" .. table.concat(fo, ",") .. "]"
  .. ",\"units\":[" .. table.concat(out, ",") .. "]}")
