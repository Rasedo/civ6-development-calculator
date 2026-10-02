-- InGame: the turn lock — holds an all-AI observer game at a chosen turn.
-- A handler on the InGame event ZEV (TurnBegin; a per-player event filtered
-- to player ZWHO, -1 any) takes a reference on the event it is dispatching
-- (UI.ReferenceCurrentEvent, the popups' "lock engine") once the turn reaches
-- the target, and the game's turn processing waits until the reference is
-- released (UI.ReleaseEventID). State lives in the InGame global
-- LAB_TURN_LOCK, so a new or loaded game installs afresh; the first call in
-- a game installs the handler.
--   ZMODE: target (hold at turn ZT or later) | step (aim at the held turn + 1,
--   then release) | release (no target, release) | read
local mode, arg = "ZMODE", ZT
local h = LAB_TURN_LOCK
if h == nil then
  h = { target = -1, id = nil, held = -1, holds = 0, seen = -1, err = "", ev = "ZEV" }
  LAB_TURN_LOCK = h
  local who = ZWHO
  Events[h.ev].Add(function(a1)
    local s = LAB_TURN_LOCK
    if who >= 0 and a1 ~= who then return end
    local turn = Game.GetCurrentGameTurn()
    s.seen = turn
    if s.target >= 0 and turn >= s.target and s.id == nil then
      local ok, id = pcall(UI.ReferenceCurrentEvent)
      if ok then
        s.id, s.held, s.holds = id, turn, s.holds + 1
      else
        s.err = tostring(id)
      end
    end
  end)
end
local out = ""
if mode == "target" then
  h.target = arg
elseif mode == "release" or mode == "step" then
  if mode == "step" then
    h.target = (h.held >= 0 and h.held or Game.GetCurrentGameTurn()) + 1
  else
    h.target = -1
  end
  if h.id ~= nil then
    local ok, err = pcall(UI.ReleaseEventID, h.id)
    out = " released " .. tostring(h.id) .. " " .. (ok and "ok" or ("err:" .. tostring(err)))
    h.id = nil
  else
    out = " nothing held"
  end
end
print("lock turn " .. Game.GetCurrentGameTurn() .. " target " .. h.target .. " held " .. h.held
  .. " id " .. tostring(h.id) .. " holds " .. h.holds .. " seen " .. h.seen .. " ev " .. h.ev .. out
  .. (h.err ~= "" and (" err:" .. h.err) or ""))
