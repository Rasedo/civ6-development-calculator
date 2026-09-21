-- GameCore_Tuner: GetReactorByIndex(i) hands back the whole record
--   { Age, CityID, LastAccidentTurn, Owner, PlotIndex }
-- but GetReactorAge / GetReactorAccidentThreshold refuse both the record and
-- the loop index. Their arity is undocumented, so every plausible shape is
-- tried once and whichever answers is the signature. Also greps the LIVE
-- database for the parameters an accident rule would be spelled with.
local fm = Game.GetFalloutManager()
local r = nil
local okr, rec = pcall(function() return fm:GetReactorByIndex(0) end)
if okr then r = rec end
if r == nil then print("{\"kind\":\"reactor-threshold\",\"error\":\"noreactor\"}") return end
local pi, own, cid = r.PlotIndex, r.Owner, r.CityID
local function T(label, f)
  local ok, v = pcall(f)
  print("{\"kind\":\"reactor-threshold\",\"call\":\"" .. label .. "\",\"ok\":" .. tostring(ok)
    .. ",\"value\":\"" .. tostring(ok and v or "err") .. "\"}")
end
T("Age(plotIndex)", function() return fm:GetReactorAge(pi) end)
T("Age(owner,plotIndex)", function() return fm:GetReactorAge(own, pi) end)
T("Age(owner,cityID)", function() return fm:GetReactorAge(own, cid) end)
T("Threshold()", function() return fm:GetReactorAccidentThreshold() end)
T("Threshold(plotIndex)", function() return fm:GetReactorAccidentThreshold(pi) end)
T("Threshold(owner,plotIndex)", function() return fm:GetReactorAccidentThreshold(own, pi) end)
T("Threshold(age)", function() return fm:GetReactorAccidentThreshold(r.Age) end)
T("Threshold(record)", function() return fm:GetReactorAccidentThreshold(r) end)
T("HasFallout(plotIndex)", function() return fm:HasFallout(pi) end)
-- the live DB's own parameters for an accident
for p in GameInfo.GlobalParameters() do
  local nm = p.Name or ""
  if string.find(nm, "REACTOR", 1, true) or string.find(nm, "ACCIDENT", 1, true)
     or string.find(nm, "MELTDOWN", 1, true) or string.find(nm, "POWER_PLANT", 1, true) then
    print("{\"kind\":\"reactor-threshold\",\"param\":\"" .. nm .. "\",\"value\":\"" .. tostring(p.Value) .. "\"}")
  end
end
