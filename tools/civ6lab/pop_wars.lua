-- GameCore_Tuner: who is player 0 at war with, and who is at peace. The
-- interception clause both engines ship stops a strike for ANY seat but the
-- launcher's own, war or not, so the peaceful seats are the ones the third
-- party test needs.
local d = Players[0]:GetDiplomacy()
local parts = {}
for _, pl in ipairs(Players) do
  local i = pl:GetID()
  local ok, v = pcall(function() return d:IsAtWarWith(i) end)
  if ok and v ~= nil then
    parts[#parts + 1] = "\"" .. i .. "\":" .. tostring(v)
  end
end
print("{\"kind\":\"wars\"," .. table.concat(parts, ",") .. "}")
