-- InGame: ZMODE=arm registers a UnitAddedToMap listener that, when a unit of
-- p62 is placed, records every plot within 3 of ZCX:ZCY holding a unit at
-- that moment (owner:type) — the occupancy the placement saw; ZMODE=read
-- prints the records and clears them. Lines: "snap|turn|id|x|y|x:y=o:type,...;..."
--   --set ZMODE=arm --set ZCX=20 --set ZCY=32
if "ZMODE" == "arm" then
  if LAB_SNAP == nil then LAB_SNAP = {} end
  if LAB_SNAP_ARMED == nil then
    local ok, e = pcall(function()
      Events.UnitAddedToMap.Add(function(p, id, x, y)
        if p ~= 62 then return end
        local occ = {}
        for dx = -4, 4 do
          for dy = -4, 4 do
            local q = Map.GetPlot(ZCX + dx, ZCY + dy)
            if q ~= nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) <= 3 then
              local us = {}
              for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do
                us[#us + 1] = u:GetOwner() .. ":" .. GameInfo.Units[u:GetType()].UnitType .. ":" .. u:GetID()
              end
              if #us > 0 then occ[#occ + 1] = q:GetX() .. ":" .. q:GetY() .. "=" .. table.concat(us, ",") end
            end
          end
        end
        LAB_SNAP[#LAB_SNAP + 1] = "snap|" .. Game.GetCurrentGameTurn() .. "|" .. id .. "|" .. tostring(x) .. "|" .. tostring(y) .. "|" .. table.concat(occ, ";")
      end)
    end)
    LAB_SNAP_ARMED = true
    print("snap armed " .. tostring(ok) .. " " .. tostring(e))
  else
    print("snap already armed")
  end
else
  for _, s in ipairs(LAB_SNAP or {}) do print(s) end
  LAB_SNAP = {}
end
