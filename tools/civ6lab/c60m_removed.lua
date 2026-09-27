-- InGame: ZMODE=arm registers a UnitRemovedFromMap listener (once per game
-- load) that appends "turn:player:id" for player ZSEAT (-1 = all) to a global
-- list; ZMODE=read prints the list in removal order and clears it.
--   --set ZMODE=arm --set ZSEAT=9
if "ZMODE" == "arm" then
  LAB_REMOVED = {}
  if LAB_REMOVED_ARMED == nil then
    local ok, e = pcall(function()
      Events.UnitRemovedFromMap.Add(function(p, id)
        if LAB_REMOVED_SEAT == nil or LAB_REMOVED_SEAT < 0 or p == LAB_REMOVED_SEAT then
          LAB_REMOVED[#LAB_REMOVED + 1] = Game.GetCurrentGameTurn() .. ":" .. p .. ":" .. id
        end
      end)
    end)
    LAB_REMOVED_ARMED = true
    print("armed " .. tostring(ok) .. (ok and "" or (" " .. tostring(e))))
  else
    print("already armed")
  end
  LAB_REMOVED_SEAT = ZSEAT
else
  local l = LAB_REMOVED or {}
  print("removed n=" .. #l)
  for _, s in ipairs(l) do print(s) end
  LAB_REMOVED = {}
end
