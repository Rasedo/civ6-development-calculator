-- GameCore_Tuner (after lab_json.lua): give seat ZP ZN governor points.
local g = Players[ZP]:GetGovernors()
local before = P(function() return g:GetGovernorPoints() end)
local call = P(function() g:ChangeGovernorPoints(ZN) return true end)
OUT({kind = "points", seat = ZP, n = ZN, before = before, call = call, after = P(function() return g:GetGovernorPoints() end)})
