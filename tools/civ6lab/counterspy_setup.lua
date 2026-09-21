-- GameCore_Tuner: the counterspy scene, step one. Session 1 measured the
-- offensive mission roll as 3d6 against BaseProbability - k (k = 2 for a fresh
-- spy, +2 under Gain Sources) and left the COUNTERSPY column unmeasured. The
-- defender's counterspy is the missing term, and it can be read without any
-- mission being run: UnitManager.GetResultProbability is the UI's own source,
-- so the odds can be read with and without a defender in the city.
-- Puts one Spy of ZATTACKER on ZX:ZY (the target city's own plot) and, if
-- ZDEFENDER is a real player id, one Spy of that player on the same city.
--   --set ZX=23 --set ZY=26 --set ZATTACKER=0 --set ZDEFENDER=-1
local out = {}
local function spawn(pid, x, y, label)
  local pl = Players[pid]
  if pl == nil then out[#out + 1] = "\"" .. label .. "\":\"noplayer\"" return end
  local u = pl:GetUnits():Create(GameInfo.Units["UNIT_SPY"].Index, x, y)
  out[#out + 1] = "\"" .. label .. "\":" .. (u and u:GetID() or -1)
end
spawn(ZATTACKER, ZX, ZY, "attackerSpy")
if ZDEFENDER >= 0 then spawn(ZDEFENDER, ZX, ZY, "defenderSpy") end
print("{\"kind\":\"counterspy-setup\",\"at\":\"" .. ZX .. ":" .. ZY .. "\"," .. table.concat(out, ",") .. "}")
