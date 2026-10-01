-- either state: the methods of Game.GetEras() (metatable walk inside pcall),
-- and seat ZSEAT's dedication state
local e = Game.GetEras()
local names = {}
local ok = pcall(function()
  local mt = getmetatable(e)
  local idx = mt and mt["__index"]
  if type(idx) == "table" then for k, _ in pairs(idx) do names[#names + 1] = tostring(k) end end
end)
table.sort(names)
print("methods " .. tostring(ok) .. ": " .. table.concat(names, ","))
local function tri(f)
  local o, v = pcall(f)
  if o then
    if type(v) == "table" then
      local p = {}
      for k, x in pairs(v) do p[#p + 1] = tostring(k) .. "=" .. tostring(x) end
      return "{" .. table.concat(p, ",") .. "}"
    end
    return tostring(v)
  end
  return "err:" .. tostring(v)
end
print("allowed " .. tri(function() return e:GetPlayerNumAllowedCommemorations(ZSEAT) end)
  .. " choices " .. tri(function() return e:GetPlayerCommemorateChoices(ZSEAT) end)
  .. " active " .. tri(function() return e:GetPlayerActiveCommemorations(ZSEAT) end)
  .. " era " .. tri(function() return e:GetCurrentEra() end))
