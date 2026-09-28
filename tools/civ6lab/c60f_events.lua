-- InGame: ZMODE=arm registers listeners for player ZP's units leaving the map
-- (UnitRemovedFromMap), dying in combat (UnitKilledInCombat, either side),
-- and taking damage (UnitDamageChanged), appended to a global list as
-- "turn:event:player:id:extra"; ZMODE=read prints the list and clears it.
-- A unit removed with no kill is a disband or a delete.
--   --set ZMODE=arm --set ZP=62      --set ZMODE=read --set ZP=62
if "ZMODE" == "arm" then
  if LAB_C60F_LOG == nil then LAB_C60F_LOG = {} end
  if LAB_C60F_ARMED == nil then
    local r = {}
    r[#r + 1] = tostring(pcall(function()
      Events.UnitRemovedFromMap.Add(function(p, id)
        if p == ZP then LAB_C60F_LOG[#LAB_C60F_LOG + 1] = Game.GetCurrentGameTurn() .. ":removed:" .. p .. ":" .. id .. ":" end
      end)
    end))
    r[#r + 1] = tostring(pcall(function()
      Events.UnitKilledInCombat.Add(function(kp, kid, p, id)
        if kp == ZP or p == ZP then LAB_C60F_LOG[#LAB_C60F_LOG + 1] = Game.GetCurrentGameTurn() .. ":killed:" .. kp .. ":" .. kid .. ":by" .. tostring(p) .. "/" .. tostring(id) end
      end)
    end))
    r[#r + 1] = tostring(pcall(function()
      Events.UnitDamageChanged.Add(function(p, id, dmg)
        if p == ZP then LAB_C60F_LOG[#LAB_C60F_LOG + 1] = Game.GetCurrentGameTurn() .. ":damage:" .. p .. ":" .. id .. ":" .. tostring(dmg) end
      end)
    end))
    LAB_C60F_ARMED = true
    print("armed " .. table.concat(r, ","))
  else
    print("already armed")
  end
else
  local l = LAB_C60F_LOG or {}
  for _, s in ipairs(l) do print(s) end
  LAB_C60F_LOG = {}
end
