-- GameCore_Tuner: just the war, with nothing else attached. The three-argument
-- form is the one that bites; DeclareWarOn(p) alone returns ok and leaves
-- IsAtWarWith false (session 2's failure table).
--   --set ZP=1
local d = Players[0]:GetDiplomacy()
local before = d:IsAtWarWith(ZP)
if not before then
  pcall(function() d:DeclareWarOn(ZP, WarTypes.SURPRISE_WAR, true) end)
end
print("{\"kind\":\"war\",\"player\":" .. ZP .. ",\"before\":" .. tostring(before)
  .. ",\"after\":" .. tostring(d:IsAtWarWith(ZP)) .. "}")
