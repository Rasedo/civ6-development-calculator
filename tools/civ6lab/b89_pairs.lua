-- Either state, B-89-S1: CombatManager.CanAttackTarget and SimulateAttackVersus
-- for listed (attacker, defender) unit pairs, any owners (AI and barbarian
-- attackers included). CanAttackTarget is the UI's own legality test
-- (UnitPanel.lua ReadTargetData); it does not look at range.
--   --set "ZPAIRS=6:10813440>0:4587535;63:21495867>0:4587535" --set ZTAG=gc
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')) end
local function T(f) local ok, v = pcall(f) if ok then return v end return "err:" .. tostring(v) end
local barb = -1
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and T(function() return pl:IsBarbarian() end) == true then barb = p end
end
local function unit(p, id)
  if p == 63 then p = barb end
  return Players[p]:GetUnits():FindID(id)
end
-- CombatTypes is an InGame table; its hashes, read there
local cts = {{"MELEE", 748940753}, {"RANGED", 784649805}, {"nil", nil}}
for ap, aid, dp, did in string.gmatch("ZPAIRS", "(%d+):(%d+)>(%d+):(%d+)") do
  local a, d = unit(tonumber(ap), tonumber(aid)), unit(tonumber(dp), tonumber(did))
  local o = {'"kind":"b89pair"', '"state":"ZTAG"', '"turn":' .. Game.GetCurrentGameTurn()}
  if a == nil or d == nil then
    o[#o + 1] = '"error":"missing a=' .. tostring(a ~= nil) .. ' d=' .. tostring(d ~= nil) .. '"'
  else
    o[#o + 1] = '"att":"' .. a:GetOwner() .. ':' .. GameInfo.Units[a:GetType()].UnitType .. '@' .. a:GetX() .. ':' .. a:GetY() .. '"'
    o[#o + 1] = '"def":"' .. d:GetOwner() .. ':' .. GameInfo.Units[d:GetType()].UnitType .. '@' .. d:GetX() .. ':' .. d:GetY() .. '"'
    o[#o + 1] = '"dist":' .. Map.GetPlotDistance(a:GetX(), a:GetY(), d:GetX(), d:GetY())
    for _, ct in ipairs(cts) do
      o[#o + 1] = '"can_' .. ct[1] .. '":"' .. esc(tostring(T(function()
        return CombatManager.CanAttackTarget(a:GetComponentID(), d:GetComponentID(), ct[2]) end))) .. '"'
    end
    local res = T(function() return CombatManager.SimulateAttackVersus(a:GetComponentID(), d:GetComponentID()) end)
    if type(res) == "table" then
      local A, D = res[CombatResultParameters.ATTACKER], res[CombatResultParameters.DEFENDER]
      o[#o + 1] = '"sim":"type=' .. tostring(res[CombatResultParameters.COMBAT_TYPE])
        .. ' acs=' .. tostring(A and A[CombatResultParameters.COMBAT_STRENGTH])
        .. ' dcs=' .. tostring(D and D[CombatResultParameters.COMBAT_STRENGTH])
        .. ' ddmg=' .. tostring(D and D[CombatResultParameters.DAMAGE_TO]) .. '"'
    else
      o[#o + 1] = '"sim":"' .. esc(tostring(res)) .. '"'
    end
  end
  print("{" .. table.concat(o, ",") .. "}")
end
