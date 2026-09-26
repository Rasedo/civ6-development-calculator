-- InGame, B-89-S1: every legality reader the UI has, asked of each attacker
-- (seat-0 Swordsman S, Crossbowman X, the walled city at ZCX:ZCY, and any extra
-- attacker ids in ZXTRA as "p:id,p:id") against each target (ids in ZTG as
-- "p:id,..."). Nothing is fired. One JSON line per (attacker, target, reader).
--   --set ZS=<id> --set ZX=<id> --set ZCX=36 --set ZCY=46 --set ZTG=6:1,6:2 --set ZXTRA=
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', ' ')) end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" or t == "boolean" then return tostring(v) end
  if t == "table" then
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    if #v == n then
      local o = {}
      for _, x in ipairs(v) do o[#o + 1] = J(x) end
      return "[" .. table.concat(o, ",") .. "]"
    end
    local o = {}
    for k, x in pairs(v) do o[#o + 1] = '"' .. esc(k) .. '":' .. J(x) end
    return "{" .. table.concat(o, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local function T(f)
  local ok, a, b = pcall(f)
  if not ok then return "err:" .. tostring(a), nil end
  return a, b
end
local function reasons(res)
  if type(res) ~= "table" then return nil end
  local fr = res[UnitOperationResults.FAILURE_REASONS] or res[UnitCommandResults.FAILURE_REASONS]
    or res[CityCommandResults.FAILURE_REASONS]
  if type(fr) ~= "table" then return nil end
  local o = {}
  for _, s in ipairs(fr) do o[#o + 1] = Locale.Lookup(s) end
  return o
end
local function unit(p, id) return Players[p]:GetUnits():FindID(id) end
local turn = Game.GetCurrentGameTurn()
local S = unit(0, ZS)
local X = unit(0, ZX)
local city = CityManager.GetCityAt(ZCX, ZCY)
local centre = nil
for _, d in city:GetDistricts():Members() do
  if GameInfo.Districts[d:GetType()].DistrictType == "DISTRICT_CITY_CENTER" then centre = d end
end
local targets = {}
for p, id in string.gmatch("ZTG", "(%d+):(%d+)") do
  local u = unit(tonumber(p), tonumber(id))
  targets[#targets + 1] = {p = tonumber(p), id = tonumber(id), u = u}
end
local attackers = {{tag = "S", u = S}, {tag = "X", u = X}}
for p, id in string.gmatch("ZXTRA", "(%d+):(%d+)") do
  attackers[#attackers + 1] = {tag = "u" .. p .. ":" .. id, u = unit(tonumber(p), tonumber(id))}
end

local ctypes = {}
for k, v in pairs(CombatTypes) do ctypes[#ctypes + 1] = k .. "=" .. tostring(v) end
table.sort(ctypes)
print(J({kind = "combatTypes", turn = turn, list = ctypes}))

local function simulate(attComp, defComp, ct)
  local res, _ = T(function() return CombatManager.SimulateAttackVersus(attComp, defComp, ct) end)
  if type(res) ~= "table" then return {result = res == nil and "nil" or res} end
  local o = {}
  for _, side in ipairs({"ATTACKER", "DEFENDER"}) do
    local b = res[CombatResultParameters[side]]
    if type(b) == "table" then
      o[side] = {cs = b[CombatResultParameters.COMBAT_STRENGTH], dmg = b[CombatResultParameters.DAMAGE_TO],
        final = b[CombatResultParameters.FINAL_DAMAGE_TO]}
      local id = b[CombatResultParameters.ID]
      if type(id) == "table" then o[side].id = {player = id.player, id = id.id, type = id.type} end
    end
  end
  o.combatType = res[CombatResultParameters.COMBAT_TYPE]
  return o
end

local function rec(a, tgt, reader, v, extra)
  local r = {kind = "b89read", turn = turn, att = a, target = tgt.p .. ":" .. tgt.id,
    ttype = tgt.u and GameInfo.Units[tgt.u:GetType()].UnitType or "gone",
    tx = tgt.u and tgt.u:GetX(), ty = tgt.u and tgt.u:GetY(), reader = reader, v = v}
  if extra ~= nil then for k, x in pairs(extra) do r[k] = x end end
  print(J(r))
end

-- the ranged target lists, once per attacker
local function targetPlots(res, PL, MOD, ISTG)
  if type(res) ~= "table" then return tostring(res) end
  local pl, md = res[PL], res[MOD]
  if type(pl) ~= "table" then return "noplots" end
  local o = {}
  for i, pi in ipairs(pl) do
    if md == nil or md[i] == ISTG then
      local q = Map.GetPlotByIndex(pi)
      o[#o + 1] = q:GetX() .. ":" .. q:GetY()
    end
  end
  return o
end
for _, a in ipairs(attackers) do
  if a.u ~= nil then
    local r = T(function() return UnitManager.GetOperationTargets(a.u, UnitOperationTypes.RANGE_ATTACK) end)
    print(J({kind = "b89targets", turn = turn, att = a.tag, x = a.u:GetX(), y = a.u:GetY(), moves = a.u:GetMovesRemaining(),
      attacks = a.u:GetAttacksRemaining(),
      rangeTargets = targetPlots(r, UnitOperationResults.PLOTS, UnitOperationResults.MODIFIERS, UnitOperationResults.MODIFIER_IS_TARGET)}))
  end
end
local cr = T(function() return CityManager.GetCommandTargets(city, CityCommandTypes.RANGE_ATTACK, {}) end)
print(J({kind = "b89targets", turn = turn, att = "city", cityTargets =
  targetPlots(cr, CityCommandResults.PLOTS, CityCommandResults.MODIFIERS, CityCommandResults.MODIFIER_IS_TARGET)}))

for _, tgt in ipairs(targets) do
  if tgt.u ~= nil then
    local tc = tgt.u:GetComponentID()
    local tx, ty = tgt.u:GetX(), tgt.u:GetY()
    for _, a in ipairs(attackers) do
      if a.u ~= nil then
        local ac = a.u:GetComponentID()
        rec(a.tag, tgt, "SimulateAttackVersus", simulate(ac, tc, nil))
        if (a.u:GetRangedCombat() or 0) > 0 then
          rec(a.tag, tgt, "SimulateAttackVersus_RANGED", simulate(ac, tc, CombatTypes.RANGED))
          rec(a.tag, tgt, "CanAttackTarget_RANGED", tostring((T(function() return CombatManager.CanAttackTarget(ac, tc, CombatTypes.RANGED) end))))
          local ok, res = T(function() return UnitManager.CanStartOperation(a.u, UnitOperationTypes.RANGE_ATTACK, nil,
            {[UnitOperationTypes.PARAM_X] = tx, [UnitOperationTypes.PARAM_Y] = ty}, true) end)
          rec(a.tag, tgt, "CanStartOperation_RANGE_ATTACK", tostring(ok), {why = reasons(res)})
        end
        rec(a.tag, tgt, "CanAttackTarget_MELEE", tostring((T(function() return CombatManager.CanAttackTarget(ac, tc, CombatTypes.MELEE) end))))
        rec(a.tag, tgt, "CanAttackTarget_nil", tostring((T(function() return CombatManager.CanAttackTarget(ac, tc) end))))
        local ok, res = T(function() return UnitManager.CanStartOperation(a.u, UnitOperationTypes.MOVE_TO, nil,
          {[UnitOperationTypes.PARAM_X] = tx, [UnitOperationTypes.PARAM_Y] = ty,
           [UnitOperationTypes.PARAM_MODIFIERS] = UnitOperationMoveModifiers.ATTACK}, true) end)
        rec(a.tag, tgt, "CanStartOperation_MOVE_TO_ATTACK", tostring(ok), {why = reasons(res),
          dist = Map.GetPlotDistance(a.u:GetX(), a.u:GetY(), tx, ty)})
      end
    end
    if centre ~= nil then
      local dc = centre:GetComponentID()
      rec("city", tgt, "SimulateAttackVersus", simulate(dc, tc, nil), {dist = Map.GetPlotDistance(ZCX, ZCY, tx, ty)})
      rec("city", tgt, "CanAttackTarget_RANGED", tostring((T(function() return CombatManager.CanAttackTarget(dc, tc, CombatTypes.RANGED) end))))
      local ok, res = T(function() return CityManager.CanStartCommand(city, CityCommandTypes.RANGE_ATTACK,
        {[CityCommandTypes.PARAM_X] = tx, [CityCommandTypes.PARAM_Y] = ty}, true) end)
      rec("city", tgt, "CanStartCommand_RANGE_ATTACK", tostring(ok), {why = reasons(res)})
    end
  end
end
-- Condemn Heretic from S where it stands (loose, then real, with reasons)
for _, a in ipairs(attackers) do
  if a.u ~= nil then
    local loose = T(function() return UnitManager.CanStartCommand(a.u, UnitCommandTypes.CONDEMN_HERETIC, true) end)
    local now, res = T(function() return UnitManager.CanStartCommand(a.u, UnitCommandTypes.CONDEMN_HERETIC, false, true) end)
    local here = {}
    local q = Map.GetPlot(a.u:GetX(), a.u:GetY())
    for _, v in ipairs(Units.GetUnitsInPlot(q) or {}) do
      here[#here + 1] = v:GetOwner() .. ":" .. GameInfo.Units[v:GetType()].UnitType
    end
    print(J({kind = "b89condemn", turn = turn, att = a.tag, x = a.u:GetX(), y = a.u:GetY(),
      loose = tostring(loose), now = tostring(now), why = reasons(res), onTile = here}))
  end
end
