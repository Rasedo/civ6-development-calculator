-- InGame: close every open diplomacy session between the seat and any
-- other player — the conversation an AI opens with the human (a proposal, a
-- first meeting, a demand) holds the turn under Autoplay until it is answered.
-- `DiplomacyManager.CloseSession` is what leaving the conversation does
-- (DiplomacyActionView.lua ExitConversationMode): no answer, the session ends.
-- The seat is ZSEAT when set (the UI's local player reads -1 while Autoplay
-- holds it), else the local player, else seat 0.
local me = tonumber("ZSEAT") or Game.GetLocalPlayer()
if me == nil or me < 0 then me = 0 end
local closed = {}
for p = 0, 62 do
  if p ~= me and Players[p] ~= nil then
    local ok, id = pcall(function() return DiplomacyManager.FindOpenSessionID(me, p) end)
    if ok and id ~= nil and id >= 0 then
      pcall(function() DiplomacyManager.CloseSession(id) end)
      closed[#closed + 1] = p .. ":" .. id
    end
  end
end
print("closed sessions [" .. table.concat(closed, ",") .. "]")
