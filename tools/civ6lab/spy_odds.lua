-- InGame: the offensive odds for ONE named spy against ONE plot, printed as
-- JSON so two readings can be diffed field by field. spy_probe.lua takes the
-- LAST spy of player 0; this one takes any owner's spy by id, which is what a
-- counterspy scene needs (the attacker belongs to the defender's enemy).
--   --set ZSPY=9043999 --set ZOWNER=1 --set ZTX=36 --set ZTY=22 --set ZTAG=withCounterspy
local spy = nil
for _, u in Players[ZOWNER]:GetUnits():Members() do
  if u:GetID() == ZSPY then spy = u end
end
if spy == nil then print("{\"kind\":\"spy-odds\",\"error\":\"nospy\"}") return end
local target = Map.GetPlot(ZTX, ZTY)
for op in GameInfo.UnitOperations() do
  if op.CategoryInUI == "OFFENSIVESPY" then
    local ok, res = pcall(UnitManager.GetResultProbability, op.Index, spy, target)
    if ok and type(res) == "table" then
      local parts = {}
      for k, v in pairs(res) do parts[#parts + 1] = "\"" .. tostring(k) .. "\":" .. tostring(v) end
      table.sort(parts)
      print("{\"kind\":\"spy-odds\",\"stage\":\"ZTAG\",\"op\":\"" .. op.OperationType:gsub("UNITOPERATION_SPY_", "")
        .. "\",\"base\":" .. tostring(op.BaseProbability) .. "," .. table.concat(parts, ",") .. "}")
    end
  end
end
