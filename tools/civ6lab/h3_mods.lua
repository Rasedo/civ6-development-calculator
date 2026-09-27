local ids = {}
for _, m in ipairs(GameConfiguration.GetEnabledMods() or {}) do
  local s = {}
  if type(m) == "table" then for k, v in pairs(m) do s[#s + 1] = tostring(k) .. "=" .. tostring(v) end else s[1] = tostring(m) end
  ids[#ids + 1] = "{" .. table.concat(s, ",") .. "}"
end
print("enabled " .. #ids)
for _, s in ipairs(ids) do print("  " .. s) end
local ok, all = pcall(function() return Modding.GetInstalledMods() end)
if ok and all then
  for _, h in ipairs(all) do
    local ok2, info = pcall(function() return Modding.GetModInfo(h) end)
    if ok2 and info then print("installed " .. tostring(h) .. " " .. tostring(info.Id) .. " " .. tostring(info.Name) .. " enabled=" .. tostring(Modding.IsModEnabled(h))) end
  end
end
