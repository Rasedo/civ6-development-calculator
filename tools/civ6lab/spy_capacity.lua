-- GameCore_Tuner: give the local seat ZN more spy capacity by attaching the
-- civics' own grant (CIVIC_GRANT_SPY, EFFECT_GRANT_SPY) and set its gold to
-- ZGOLD; print every capacity reader that answers, before and after.
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local me = ZSEAT
local pl = Players[me]
local function caps(label)
  local d = pl:GetDiplomacy()
  local out = {}
  for _, name in ipairs({"GetSpyCapacity", "GetMaxSpies", "GetNumSpies", "GetSpyLimit"}) do
    local ok, v = pcall(function() return d[name](d) end)
    out[#out + 1] = name .. "=" .. tri(ok, v)
  end
  print(label .. " " .. table.concat(out, " "))
end
caps("before")
for i = 1, ZN do
  local ok, err = pcall(function() pl:AttachModifierByID("CIVIC_GRANT_SPY") end)
  if not ok then print("attach ERR " .. tostring(err)) break end
end
pl:GetTreasury():SetGoldBalance(ZGOLD)
caps("after")
