-- InGame (after lab_json.lua): B-93-S1 — activate player ZP's Great Person
-- standing at ZX,ZY: test and request UNITCOMMAND_ACTIVATE_GREAT_PERSON.
-- ZGO=0 only reads. Prints the research state (the current tech, its
-- progress, the techs held, and the summed progress over every tech not yet
-- held — a total an overflow into the next tech cannot hide), the unit's
-- charges and the command's answer.
local pl = Players[ZP]
local u = nil
for _, x in ipairs(Units.GetUnitsInPlot(Map.GetPlot(ZX, ZY)) or {}) do
  if x:GetOwner() == ZP and GameInfo.Units[x:GetType()].UnitType == "UNIT_GREAT_SCIENTIST" then u = x end
end
local te = pl:GetTechs()
local cur = te:GetResearchingTech()
local rec = {kind = "activate", tag = "ZTAG", p = ZP, x = ZX, y = ZY, found = u ~= nil, researching = cur,
  progress = P(function() return te:GetResearchProgress(cur) end),
  techs = P(function() local n = 0 for t in GameInfo.Technologies() do if te:HasTech(t.Index) then n = n + 1 end end return n end),
  open = P(function() local s = 0 for t in GameInfo.Technologies() do if not te:HasTech(t.Index) then s = s + te:GetResearchProgress(t.Index) end end return s end),
  held = P(function() local s = 0 for t in GameInfo.Technologies() do if te:HasTech(t.Index) then s = s + te:GetResearchCost(t.Index) end end return s end)}
if u ~= nil then
  local cmd = GameInfo.UnitCommands["UNITCOMMAND_ACTIVATE_GREAT_PERSON"].Hash
  rec.uid = u:GetID()
  rec.charges = P(function() return u:GetGreatPerson():GetActionCharges() end)
  rec.moves = P(function() return u:GetMovesRemaining() end)
  if ZGO == 1 then
    rec.can = P(function() return UnitManager.CanStartCommand(u, cmd, true) end)
    local ok, can, res = pcall(function() return UnitManager.CanStartCommand(u, cmd, false, true) end)
    if ok then rec.canFull = can else rec.canFull = "err:" .. tostring(can) end
    if ok and type(res) == "table" and res[UnitCommandResults.FAILURE_REASONS] then
      local t = {}
      for _, s in ipairs(res[UnitCommandResults.FAILURE_REASONS]) do t[#t + 1] = tostring(s) end
      rec.why = t
    end
    rec.request = P(function() UnitManager.RequestCommand(u, cmd) return true end)
  end
end
OUT(rec)
