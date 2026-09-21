-- InGame: what agreements does the LIVE Gathering Storm database actually
-- carry? Expansion1_Alliances.xml opens with <Delete Type=
-- "DIPLOACTION_RESEARCH_AGREEMENT"/> and Expansion2 re-ships that file, so the
-- Civ5-style Research Agreement should be gone from the running game and the
-- Research ALLIANCE should be what replaced it. This asks the game, not the XML.
local function row(t, key)
  local ok, r = pcall(function() return GameInfo[t][key] end)
  print("{\"kind\":\"db\",\"table\":\"" .. t .. "\",\"key\":\"" .. key .. "\",\"present\":"
    .. tostring(ok and r ~= nil) .. "}")
end
row("DiplomaticActions", "DIPLOACTION_RESEARCH_AGREEMENT")
row("DiplomaticActions", "DIPLOACTION_DECLARE_FRIENDSHIP")
row("DiplomaticActions", "DIPLOACTION_ALLIANCE")
-- every agreement-flagged diplomatic action the live DB has
local acc = {}
for r in GameInfo.DiplomaticActions() do
  if r.Agreement == true then
    acc[#acc + 1] = r.DiplomaticActionType .. "(initiator=" .. tostring(r.InitiatorPrereqTech)
      .. ",target=" .. tostring(r.TargetPrereqTech) .. ")"
  end
end
print("{\"kind\":\"db\",\"agreementActions\":\"" .. table.concat(acc, " ") .. "\"}")
-- the alliance table that replaced it, with its levels
local ok, it = pcall(function() return GameInfo.Alliances() end)
if ok and it ~= nil then
  local al = {}
  for r in GameInfo.Alliances() do al[#al + 1] = tostring(r.AllianceType) end
  print("{\"kind\":\"db\",\"alliances\":\"" .. table.concat(al, " ") .. "\"}")
end
-- and the parameters that time an alliance / an agreement
for r in GameInfo.GlobalParameters() do
  local nm = r.Name or ""
  if string.find(nm, "ALLIANCE", 1, true) or string.find(nm, "AGREEMENT", 1, true)
     or string.find(nm, "FRIENDSHIP", 1, true) then
    print("{\"kind\":\"db\",\"param\":\"" .. nm .. "\",\"value\":\"" .. tostring(r.Value) .. "\"}")
  end
end
