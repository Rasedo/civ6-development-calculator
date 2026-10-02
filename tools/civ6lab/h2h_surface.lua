-- H-2 hold: list the pause / autoplay surface in this Lua state (any state).
-- Every global is named literally (the tuner chunk has no _G); each table's
-- keys are printed sorted, a missing global prints "absent".
local function keys(name, t)
  if t == nil then print(name .. " absent") return end
  local ks = {}
  local ok, err = pcall(function()
    for k, _ in pairs(t) do ks[#ks + 1] = tostring(k) end
    local mt = getmetatable(t)
    if mt ~= nil and type(mt["__index"]) == "table" then
      for k, _ in pairs(mt["__index"]) do ks[#ks + 1] = "mt." .. tostring(k) end
    end
  end)
  table.sort(ks)
  print(name .. " (" .. (ok and "ok" or ("err:" .. tostring(err))) .. "): " .. table.concat(ks, " "))
end
keys("AutoplayManager", AutoplayManager)
keys("Automation", Automation)
keys("Game", Game)
keys("GameConfiguration", GameConfiguration)
keys("PlayerManager", PlayerManager)
keys("GameEvents", GameEvents)
print("turn " .. tostring(Game.GetCurrentGameTurn()))
