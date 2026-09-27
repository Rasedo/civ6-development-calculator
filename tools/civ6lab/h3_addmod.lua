local function count()
  local n, gs = 0, false
  for _, m in ipairs(GameConfiguration.GetEnabledMods() or {}) do
    n = n + 1
    if tostring(m.Id):lower() == "4873eb62-8ccc-4574-b784-dda455e74e68" then gs = true end
  end
  return n, gs
end
print("before", count())
local h = Modding.GetModHandle("e6d8f6ba-a2bf-4f6b-ba4b-f5446f403033")
print("handle", h)
GameConfiguration.AddEnabledMods(h)
print("after AddEnabledMods(h)", count())
