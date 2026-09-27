-- InGame, the B-89 tail: may an AIR strike, a ranged or bombard shot, or a
-- city's strike take a civilian or a lone Support unit? For every attacker in
-- ZATT ("p:id" units, "c:x:y" a city) against every target unit in ZTG
-- ("p:id"): CombatManager.CanAttackTarget per CombatType, SimulateAttackVersus,
-- the attacker's own order test at the target plot (AIR_ATTACK for an
-- aircraft, RANGE_ATTACK otherwise, the city's RANGE_ATTACK command) with its
-- failure reasons, whether the plot is in the order's target list, and for an
-- aircraft SimulateAttackInto's defender block. Nothing is fired. One JSON
-- line per pair.
--   --set "ZATT=0:4653065;c:36:46" --set "ZTG=6:11206661;6:11272228" --set ZTAG=x
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('[%c]', ' ')) end
local function T(f)
  local ok, a, b = pcall(f)
  if not ok then return "err:" .. tostring(a), nil end
  return a, b
end
local function reasons(res)
  if type(res) ~= "table" then return "" end
  local fr = res[UnitOperationResults.FAILURE_REASONS] or res[CityCommandResults.FAILURE_REASONS]
  if type(fr) ~= "table" then return "" end
  local o = {}
  for _, s in ipairs(fr) do o[#o + 1] = Locale.Lookup(s) end
  return table.concat(o, "|")
end
local function inPlots(tr, key, x, y)
  if type(tr) ~= "table" or type(tr[key]) ~= "table" then return "none" end
  local pi = Map.GetPlotIndex(x, y)
  for _, v in ipairs(tr[key]) do if v == pi then return "yes" end end
  return "no(" .. #tr[key] .. ")"
end
local cts = {{"MELEE", CombatTypes.MELEE}, {"RANGED", CombatTypes.RANGED}, {"BOMBARD", CombatTypes.BOMBARD},
  {"AIR", CombatTypes.AIR}, {"nil", nil}}
local turn = Game.GetCurrentGameTurn()
for spec in string.gmatch("ZATT", "([^;]+)") do
  local a, aname, isCity, ax, ay = nil, spec, false, 0, 0
  local cx, cy = string.match(spec, "^c:(%d+):(%d+)$")
  if cx then
    isCity = true
    a = CityManager.GetCityAt(tonumber(cx), tonumber(cy))
    ax, ay = tonumber(cx), tonumber(cy)
    aname = "city@" .. cx .. ":" .. cy
  else
    local p, id = string.match(spec, "(%d+):(%d+)")
    a = Players[tonumber(p)]:GetUnits():FindID(tonumber(id))
    if a then ax, ay = a:GetX(), a:GetY(); aname = p .. ":" .. GameInfo.Units[a:GetType()].UnitType .. "@" .. ax .. ":" .. ay end
  end
  for p, id in string.gmatch("ZTG", "(%d+):(%d+)") do
    local d = Players[tonumber(p)]:GetUnits():FindID(tonumber(id))
    local o = {'"kind":"b89t"', '"tag":"ZTAG"', '"turn":' .. turn, '"att":"' .. esc(aname) .. '"'}
    if a == nil or d == nil then
      o[#o + 1] = '"error":"missing a=' .. tostring(a ~= nil) .. ' d=' .. tostring(d ~= nil) .. '"'
    else
      local x, y = d:GetX(), d:GetY()
      local def = GameInfo.Units[d:GetType()]
      o[#o + 1] = '"def":"' .. p .. ':' .. def.UnitType .. '@' .. x .. ':' .. y .. '"'
      o[#o + 1] = '"defClass":"' .. tostring(def.FormationClass) .. '"'
      o[#o + 1] = '"onTile":' .. Map.GetPlot(x, y):GetUnitCount()
      o[#o + 1] = '"dist":' .. Map.GetPlotDistance(ax, ay, x, y)
      local acomp = T(function() return a:GetComponentID() end)
      for _, ct in ipairs(cts) do
        o[#o + 1] = '"can_' .. ct[1] .. '":"' .. esc(tostring(T(function()
          return CombatManager.CanAttackTarget(acomp, d:GetComponentID(), ct[2]) end))) .. '"'
      end
      local res = T(function() return CombatManager.SimulateAttackVersus(acomp, d:GetComponentID()) end)
      if type(res) == "table" then
        local A, D = res[CombatResultParameters.ATTACKER], res[CombatResultParameters.DEFENDER]
        o[#o + 1] = '"versus":"type=' .. tostring(res[CombatResultParameters.COMBAT_TYPE])
          .. ' acs=' .. tostring(A and A[CombatResultParameters.COMBAT_STRENGTH])
          .. ' dcs=' .. tostring(D and D[CombatResultParameters.COMBAT_STRENGTH])
          .. ' ddmg=' .. tostring(D and D[CombatResultParameters.DAMAGE_TO])
          .. ' admg=' .. tostring(A and A[CombatResultParameters.DAMAGE_TO]) .. '"'
      else
        o[#o + 1] = '"versus":"' .. esc(tostring(res)) .. '"'
      end
      if isCity then
        local params = {[CityCommandTypes.PARAM_X] = x, [CityCommandTypes.PARAM_Y] = y}
        local can, r = T(function() return CityManager.CanStartCommand(a, CityCommandTypes.RANGE_ATTACK, params, true) end)
        o[#o + 1] = '"order":"CITY_RANGE_ATTACK","can":"' .. esc(tostring(can)) .. '","why":"' .. esc(reasons(r)) .. '"'
        local tr = T(function() return CityManager.GetCommandTargets(a, CityCommandTypes.RANGE_ATTACK) end)
        o[#o + 1] = '"inTargets":"' .. inPlots(tr, CityCommandResults.PLOTS, x, y) .. '"'
      else
        local isAir = GameInfo.Units[a:GetType()].Domain == "DOMAIN_AIR"
        local op = isAir and UnitOperationTypes.AIR_ATTACK or UnitOperationTypes.RANGE_ATTACK
        local params = {[UnitOperationTypes.PARAM_X] = x, [UnitOperationTypes.PARAM_Y] = y}
        local can, r = T(function() return UnitManager.CanStartOperation(a, op, nil, params, true) end)
        o[#o + 1] = '"order":"' .. (isAir and "AIR_ATTACK" or "RANGE_ATTACK") .. '","can":"' .. esc(tostring(can)) .. '","why":"' .. esc(reasons(r)) .. '"'
        local tr = T(function() return UnitManager.GetOperationTargets(a, op) end)
        o[#o + 1] = '"inTargets":"' .. inPlots(tr, UnitOperationResults.PLOTS, x, y) .. '"'
        if isAir then
          local s = T(function() return CombatManager.SimulateAttackInto(acomp, CombatTypes.AIR, x, y) end)
          if type(s) == "table" then
            local D = s[CombatResultParameters.DEFENDER]
            local who = "none"
            if type(D) == "table" and type(D[CombatResultParameters.ID]) == "table" then
              local id2 = D[CombatResultParameters.ID]
              who = tostring(id2.player) .. ":" .. tostring(id2.id) .. ":t" .. tostring(id2.type)
            end
            o[#o + 1] = '"into":"def=' .. who .. ' dcs=' .. tostring(D and D[CombatResultParameters.COMBAT_STRENGTH])
              .. ' ddmg=' .. tostring(D and D[CombatResultParameters.DAMAGE_TO]) .. '"'
          else
            o[#o + 1] = '"into":"' .. esc(tostring(s)) .. '"'
          end
        end
      end
    end
    print("{" .. table.concat(o, ",") .. "}")
  end
end
