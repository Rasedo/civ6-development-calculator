-- GameCore_Tuner: scene E, step 1 — spawn N Apostles for player 0 on one
-- plot and set each one's faith by NAME (Debug/Unit.ltp:
-- unitReligion:SetReligionType("RELIGION_X")). Prints the unit ids; the
-- spread itself is religion_spread.lua, because UnitManager.RequestOperation
-- lives in InGame only (GameCore's UnitManager has no such method).
--   --set ZREL=RELIGION_CATHOLICISM --set ZCX=38 --set ZCY=19 --set ZN=1
-- Tokens are Z-prefixed on purpose: a bare REL token would also rewrite the
-- substring inside RELIGION_*.
local cx, cy, n = ZCX, ZCY, ZN
local rel = "ZREL"
local pl = Players[0]
local ids = {}
for i = 1, n do
  local u = pl:GetUnits():Create(GameInfo.Units["UNIT_APOSTLE"].Index, cx, cy)
  if u == nil then print("spawn failed " .. i) return end
  local ur = u:GetReligion()
  local okr = pcall(function() ur:SetReligionType(rel) end)
  local got = -1
  pcall(function() got = ur:GetReligionType() end)
  ids[#ids + 1] = u:GetID()
  print("apostle " .. i .. " id=" .. u:GetID() .. " at " .. cx .. ":" .. cy
    .. " setOk=" .. tostring(okr) .. " unitRel=" .. tostring(got))
end
print("ids " .. table.concat(ids, ","))
