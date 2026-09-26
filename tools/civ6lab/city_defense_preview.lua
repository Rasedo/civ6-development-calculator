-- The combat preview's breakdown of every city centre's defence (InGame):
-- CombatManager.SimulateAttackVersus from a land military unit of another
-- player onto the centre district, then the DEFENDER's base strength and
-- each preview text list (terrain, defenses, modifier, opponent, promotion,
-- resources, health) — the terms the game adds to the centre's strength.
-- ZMAX caps the cities read (-1 = all). One JSON line per city.
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', ' ')) end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" or t == "boolean" then return tostring(v) end
  if t == "table" then
    if #v > 0 or next(v) == nil then
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
local function P(f)
  local ok, v = pcall(f)
  if ok then return v end
  return "err:" .. tostring(v)
end

local cap = tonumber("ZMAX") or -1
local turn = Game.GetCurrentGameTurn()
local TEXTS = {"PREVIEW_TEXT_TERRAIN", "PREVIEW_TEXT_DEFENSES", "PREVIEW_TEXT_MODIFIER", "PREVIEW_TEXT_OPPONENT",
  "PREVIEW_TEXT_PROMOTION", "PREVIEW_TEXT_RESOURCES", "PREVIEW_TEXT_HEALTH", "PREVIEW_TEXT_ASSIST"}

-- one land military unit per player, the attacker for cities not its own
local attacker = {}
for q = 0, 63 do
  local o = Players[q]
  if o ~= nil and o:IsAlive() then
    for _, u in o:GetUnits():Members() do
      local row = GameInfo.Units[u:GetType()]
      if row ~= nil and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" and (row.Combat or 0) > 0
          and (row.RangedCombat or 0) == 0 then
        attacker[q] = u
        break
      end
    end
  end
end

local n = 0
for p = 0, 63 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    for _, c in pl:GetCities():Members() do
      if cap >= 0 and n >= cap then break end
      local centre = nil
      for _, d in c:GetDistricts():Members() do
        if GameInfo.Districts[d:GetType()].DistrictType == "DISTRICT_CITY_CENTER" then centre = d end
      end
      local atk = nil
      for q, u in pairs(attacker) do
        if q ~= p then atk = u break end
      end
      local rec = {kind = "preview", turn = turn, owner = p, city = c:GetName(), x = c:GetX(), y = c:GetY(),
        def = centre and P(function() return centre:GetDefenseStrength() end)}
      if centre ~= nil and atk ~= nil then
        rec.attacker = {p = atk:GetOwner(), u = GameInfo.Units[atk:GetType()].UnitType}
        local ok, res = pcall(function() return CombatManager.SimulateAttackVersus(atk:GetComponentID(), centre:GetComponentID()) end)
        if not ok then
          rec.error = "err:" .. tostring(res)
        elseif res == nil then
          rec.error = "nil result"
        else
          local dres = res[CombatResultParameters.DEFENDER]
          if dres == nil then
            rec.error = "no defender block"
          else
            rec.base = dres[CombatResultParameters.COMBAT_STRENGTH]
            for _, key in ipairs(TEXTS) do
              local list = dres[CombatResultParameters[key]]
              if list ~= nil then
                local out = {}
                for _, item in ipairs(list) do out[#out + 1] = item end
                if #out > 0 then rec[key] = out end
              end
            end
          end
        end
      end
      print(J(rec))
      n = n + 1
    end
  end
end
