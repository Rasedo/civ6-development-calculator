-- InGame (or GameCore): the full air-strike preview of one attacker into a
-- list of plots. Every block (ATTACKER, DEFENDER, INTERCEPTOR, ANTI_AIR) with
-- its ID, COMBAT_STRENGTH, STRENGTH_MODIFIER, damage fields and each
-- PREVIEW_TEXT_* list (localised). The ANTI_AIR / INTERCEPTOR blocks carry
-- garbage when no such unit exists, so each block's ID is printed and the
-- reader gates on it. ZMODE: normal = SimulateAttackInto, priority =
-- SimulatePriorityAttackInto. ZCT: the CombatTypes hash (AIR 1184946373).
--   --set ZA=6:123 --set "ZPLOTS=34:46;33:46" --set ZMODE=normal --set ZCT=1184946373 --set ZTAG=x
local function esc(s) return (tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', ' ')) end
local name = {}
for k, v in pairs(CombatResultParameters) do if type(v) == "number" then name[v] = k end end
local function J(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "number" or t == "boolean" then return tostring(v) end
  if t == "table" then
    local o = {}
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    if n > 0 and #v == n then
      for _, x in ipairs(v) do o[#o + 1] = J(x) end
      return "[" .. table.concat(o, ",") .. "]"
    end
    for k, x in pairs(v) do o[#o + 1] = '"' .. esc(name[k] or k) .. '":' .. J(x) end
    return "{" .. table.concat(o, ",") .. "}"
  end
  return '"' .. esc(v) .. '"'
end
local ap, aid = string.match("ZA", "(%d+):(%d+)")
local a = Players[tonumber(ap)]:GetUnits():FindID(tonumber(aid))
if a == nil then print('{"kind":"airpreview","error":"noattacker"}') return end
local ct = tonumber("ZCT")
for x, y in string.gmatch("ZPLOTS", "(%d+):(%d+)") do
  x, y = tonumber(x), tonumber(y)
  local ok, res = pcall(function()
    if "ZMODE" == "priority" then return CombatManager.SimulatePriorityAttackInto(a:GetComponentID(), ct, x, y) end
    return CombatManager.SimulateAttackInto(a:GetComponentID(), ct, x, y)
  end)
  local rec = {kind = "airpreview", tag = "ZTAG", mode = "ZMODE", turn = Game.GetCurrentGameTurn(),
    att = ap .. ":" .. aid .. ":" .. GameInfo.Units[a:GetType()].UnitType, ax = a:GetX(), ay = a:GetY(), x = x, y = y}
  if not ok then rec.error = "err:" .. tostring(res)
  elseif type(res) ~= "table" then rec.error = "result " .. tostring(res)
  else
    for k, v in pairs(res) do
      local bn = name[k] or tostring(k)
      if type(v) == "table" then
        local b = {}
        for kk, vv in pairs(v) do
          local f = name[kk] or tostring(kk)
          if type(vv) == "table" and f:sub(1, 13) == "PREVIEW_TEXT_" then
            local l = {}
            for _, s in ipairs(vv) do l[#l + 1] = Locale.Lookup(s) end
            b[f] = l
          elseif type(vv) == "table" then
            local l = {}
            for k3, v3 in pairs(vv) do l[tostring(k3)] = v3 end
            b[f] = l
          else
            b[f] = vv
          end
        end
        -- the unit the block names, as the game reads it now
        if type(b.ID) == "table" and b.ID.player ~= nil and b.ID.type == 1 then
          local pl = Players[b.ID.player]
          local u = pl and pl:GetUnits():FindID(b.ID.id)
          b.unit = u and (GameInfo.Units[u:GetType()].UnitType .. "@" .. u:GetX() .. ":" .. u:GetY() .. " dmg=" .. u:GetDamage()) or "none"
        end
        rec[bn] = b
      else
        rec[bn] = v
      end
    end
  end
  print(J(rec))
end
