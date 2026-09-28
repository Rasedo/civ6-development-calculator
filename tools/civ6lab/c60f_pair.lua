-- GameCore: for each plot in ZPLOTS ("x:y;x:y"), the city on it or within
-- 2 (owner, original owner, id) and the owner's standing on every melee
-- unit (PromotionClass PROMOTION_CLASS_MELEE, no civ trait): its prereq tech
-- and civic held or not, its strategic resource and the owner's stock of it.
-- One JSON line per city and per (city, unit).   --set ZPLOTS="31:39;30:48"
local seen = {}
for x, y in string.gmatch("ZPLOTS", "(%d+):(%d+)") do
  local best = nil
  for dx = -2, 2 do
    for dy = -2, 2 do
      local c = Cities.GetCityInPlot(tonumber(x) + dx, tonumber(y) + dy)
      if c ~= nil and best == nil then best = c end
    end
  end
  if best ~= nil and not seen[best:GetX() * 1000 + best:GetY()] then
    seen[best:GetX() * 1000 + best:GetY()] = true
    local o = best:GetOwner()
    local pl = Players[o]
    print(string.format('{"kind":"city","turn":%d,"x":%d,"y":%d,"owner":%d,"orig":%d,"name":"%s","era":%d}', Game.GetCurrentGameTurn(),
      best:GetX(), best:GetY(), o, best:GetOriginalOwner(), best:GetName(), pl:GetEra()))
    for row in GameInfo.Units() do
      if row.PromotionClass == "PROMOTION_CLASS_MELEE" and row.TraitType == nil then
        local tech = row.PrereqTech and GameInfo.Technologies[row.PrereqTech]
        local civic = row.PrereqCivic and GameInfo.Civics[row.PrereqCivic]
        local ht = tech == nil or pl:GetTechs():HasTech(tech.Index)
        local hc = civic == nil or pl:GetCulture():HasCivic(civic.Index)
        local res = row.StrategicResource or ""
        local stock = -1
        if res ~= "" then
          local ok, v = pcall(function() return pl:GetResources():GetResourceAmount(GameInfo.Resources[res].Index) end)
          stock = ok and v or -2
        end
        print(string.format('{"kind":"melee","x":%d,"y":%d,"owner":%d,"unit":"%s","combat":%d,"tech":"%s","hasTech":%s,"civic":"%s","hasCivic":%s,"res":"%s","stock":%s}',
          best:GetX(), best:GetY(), o, row.UnitType, row.Combat, tostring(row.PrereqTech), tostring(ht), tostring(row.PrereqCivic), tostring(hc), res, tostring(stock)))
      end
    end
  end
end
