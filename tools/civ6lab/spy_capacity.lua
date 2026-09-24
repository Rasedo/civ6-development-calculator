-- GameCore_Tuner: give the local seat ZN more spy capacity by attaching the
-- civics' own grant (CIVIC_GRANT_SPY, EFFECT_GRANT_SPY) and set its gold to
-- ZGOLD; print every capacity reader that answers, before and after.
local me = ZSEAT
local pl = Players[me]
local function caps(label)
  local d = pl:GetDiplomacy()
  local out = {}
  for _, name in ipairs({"GetSpyCapacity", "GetMaxSpies", "GetNumSpies", "GetSpyLimit"}) do
    local ok, v = pcall(function() return d[name](d) end)
    out[#out + 1] = name .. "=" .. (ok and tostring(v) or "ERR")
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
