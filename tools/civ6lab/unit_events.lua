-- InGame (or GameCore with ZSRC=GameEvents): ZMODE=arm registers listeners on
-- UnitAddedToMap and UnitMoved for player ZP that append "turn:event:id:x:y"
-- to a global list as "turn:event:player:id:x:y"; ZMODE=read prints the list (and clears it with ZCLEAR=1).
-- The listeners record where a unit is PLACED during turn processing, before
-- its owner's turn moves it.
--   --set ZMODE=arm --set ZP=62 --set ZSRC=Events
--   --set ZMODE=read --set ZP=62 --set ZSRC=Events --set ZCLEAR=0
local src = ZSRC
if "ZMODE" == "arm" then
  if LAB_UNIT_LOG == nil then LAB_UNIT_LOG = {} end
  if LAB_UNIT_ARMED == nil then
    local ok1, e1 = pcall(function()
      src.UnitAddedToMap.Add(function(p, id, x, y)
        if ZP < 0 or p == ZP then LAB_UNIT_LOG[#LAB_UNIT_LOG + 1] = Game.GetCurrentGameTurn() .. ":add:" .. p .. ":" .. id .. ":" .. tostring(x) .. ":" .. tostring(y) end
      end)
    end)
    local ok2, e2 = pcall(function()
      src.UnitMoved.Add(function(p, id, x, y)
        if ZP < 0 or p == ZP then LAB_UNIT_LOG[#LAB_UNIT_LOG + 1] = Game.GetCurrentGameTurn() .. ":move:" .. p .. ":" .. id .. ":" .. tostring(x) .. ":" .. tostring(y) end
      end)
    end)
    LAB_UNIT_ARMED = true
    print("armed add=" .. tostring(ok1) .. (ok1 and "" or (" " .. tostring(e1))) .. " move=" .. tostring(ok2) .. (ok2 and "" or (" " .. tostring(e2))))
  else
    print("already armed")
  end
else
  local l = LAB_UNIT_LOG or {}
  print("log n=" .. #l)
  for _, s in ipairs(l) do print(s) end
  if ZCLEAR == 1 then LAB_UNIT_LOG = {} end
end
