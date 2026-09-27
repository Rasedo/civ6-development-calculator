print("FEATURE_VOLCANO " .. tostring(GameInfo.Features["FEATURE_VOLCANO"] and GameInfo.Features["FEATURE_VOLCANO"].Index))
print("MEGADISASTERS " .. tostring(GameCapabilities.HasCapability("CAPABILITY_MEGADISASTERS")))
local n = 0
for _ in GameInfo.Features() do n = n + 1 end
print("features " .. n)
local ids = {}
for _, m in ipairs(GameConfiguration.GetEnabledMods() or {}) do ids[#ids + 1] = tostring(m.Id) end
print("mods " .. #ids)
