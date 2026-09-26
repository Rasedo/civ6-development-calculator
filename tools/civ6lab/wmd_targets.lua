-- InGame: every plot a given launcher may send a given weapon to. Session 2
-- learned that the target list comes back as ONE key holding a flat list of
-- PLOT INDICES, so this decodes that shape and prints a few with their
-- distance from the launcher — which says whether a refusal is about range,
-- visibility or something else entirely.
--   --set ZPLAYER=0 --set ZUNIT=123 --set ZWMD=WMD_NUCLEAR_DEVICE
-- a pcall read in three states: its value, or "err:<msg>" when the call threw
local function tri(ok, v)
  local s = ok and tostring(v) or ("err:" .. tostring(v))
  return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end))
end
local function trij(ok, v)
  if ok and (type(v) == "boolean" or type(v) == "number") then return tostring(v) end
  if ok and v == nil then return "null" end
  return "\"" .. tri(ok, v) .. "\""
end
local u = nil
for _, x in Players[ZPLAYER]:GetUnits():Members() do if x:GetID() == ZUNIT then u = x end end
if u == nil then print("{\"kind\":\"wmdtargets\",\"error\":\"nounit\"}") return end
local p = {}
p[UnitOperationTypes.PARAM_WMD_TYPE] = GameInfo.WMDs["ZWMD"].Index
local ok, res = pcall(function()
  return UnitManager.GetOperationTargets(u, UnitOperationTypes.WMD_STRIKE, p)
end)
if not ok or type(res) ~= "table" then
  print("{\"kind\":\"wmdtargets\",\"result\":\"" .. tri(ok, res) .. "\"}")
  return
end
local total, sample = 0, {}
for key, v in pairs(res) do
  if type(v) == "table" then
    for _, idx in pairs(v) do
      if type(idx) == "number" then
        total = total + 1
        if #sample < 8 then
          local q = Map.GetPlotByIndex(idx)
          if q ~= nil then
            sample[#sample + 1] = q:GetX() .. ":" .. q:GetY() .. "(d"
              .. Map.GetPlotDistance(u:GetX(), u:GetY(), q:GetX(), q:GetY()) .. ")"
          end
        end
      end
    end
  end
end
print("{\"kind\":\"wmdtargets\",\"unit\":" .. ZUNIT .. ",\"wmd\":\"ZWMD\",\"launcherAt\":\""
  .. u:GetX() .. ":" .. u:GetY() .. "\",\"targets\":" .. total
  .. ",\"sample\":\"" .. table.concat(sample, " ") .. "\"}")
