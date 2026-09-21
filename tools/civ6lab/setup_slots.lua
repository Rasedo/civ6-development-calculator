-- FrontEnd: who is in the new game's player slots? GetHumanPlayerCount() read 0
-- with 2 participants, and a game with no human seat would leave the tuner with
-- localPlayer -1 — the state the README warns never to enter. This prints each
-- slot's status and civilization so the human seat can be confirmed before the
-- game starts.
local ok, ids = pcall(function() return GameConfiguration.GetParticipatingPlayerIDs() end)
if not ok or ids == nil then print("{\"kind\":\"slots\",\"error\":\"noids\"}") return end
for _, id in ipairs(ids) do
  local pc = PlayerConfigurations[id]
  local function T(f) local o, v = pcall(f); return tostring(o and v or "err") end
  print("{\"kind\":\"slots\",\"id\":" .. tostring(id)
    .. ",\"slotStatus\":\"" .. T(function() return pc:GetSlotStatus() end) .. "\""
    .. ",\"isHuman\":\"" .. T(function() return pc:IsHuman() end) .. "\""
    .. ",\"civ\":\"" .. T(function() return pc:GetCivilizationTypeName() end) .. "\""
    .. ",\"leader\":\"" .. T(function() return pc:GetLeaderTypeName() end) .. "\""
    .. ",\"alive\":\"" .. T(function() return pc:IsAlive() end) .. "\"}")
end
local acc = {}
for k, v in pairs(SlotStatus or {}) do acc[#acc + 1] = k .. "=" .. tostring(v) end
table.sort(acc)
print("{\"kind\":\"slots\",\"SlotStatus\":\"" .. table.concat(acc, " ") .. "\""
  .. ",\"humans\":" .. tostring(GameConfiguration.GetHumanPlayerCount())
  .. ",\"ai\":" .. tostring(GameConfiguration.GetAIPlayerCount())
  .. ",\"available\":" .. tostring(GameConfiguration.GetAvailablePlayerCount()) .. "}")
