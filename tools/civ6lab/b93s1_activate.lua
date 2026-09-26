-- InGame (after lab_json.lua): B-93-S1 — activate unit ZUID of player ZP (a
-- Great Person): restore its moves, test and request
-- UNITCOMMAND_ACTIVATE_GREAT_PERSON. ZGO=0 only reads. Prints the research
-- state, the unit's charges and the command's answer.
local pl = Players[ZP]
local u = pl:GetUnits():FindID(ZUID)
local te = pl:GetTechs()
local cur = te:GetResearchingTech()
local rec = {kind = "activate", p = ZP, uid = ZUID, found = u ~= nil, researching = cur,
  progress = P(function() return te:GetResearchProgress(cur) end),
  techs = P(function() local n = 0 for t in GameInfo.Technologies() do if te:HasTech(t.Index) then n = n + 1 end end return n end)}
if u ~= nil then
  local cmd = GameInfo.UnitCommands["UNITCOMMAND_ACTIVATE_GREAT_PERSON"].Hash
  rec.x, rec.y = u:GetX(), u:GetY()
  rec.charges = P(function() return u:GetGreatPerson():GetActionCharges() end)
  rec.moves = P(function() return u:GetMovesRemaining() end)
  if ZGO == 1 then
    rec.restore = P(function() UnitManager.RestoreMovement(u) return true end)
    rec.moves2 = P(function() return u:GetMovesRemaining() end)
    rec.can = P(function() return UnitManager.CanStartCommand(u, cmd, true) end)
    local ok, can, res = pcall(function() return UnitManager.CanStartCommand(u, cmd, false, true) end)
    rec.canFull = ok and can or ("err:" .. tostring(can))
    if ok and type(res) == "table" and res[UnitCommandResults.FAILURE_REASONS] then
      local t = {}
      for _, s in ipairs(res[UnitCommandResults.FAILURE_REASONS]) do t[#t + 1] = tostring(s) end
      rec.why = t
    end
    rec.request = P(function() UnitManager.RequestCommand(u, cmd) return true end)
  end
end
OUT(rec)
