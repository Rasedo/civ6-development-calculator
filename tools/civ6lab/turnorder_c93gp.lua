-- GameCore_Tuner: the great-people timeline, and (ZDO=1) player ZP recruits
-- the first individual on offer in class ZCLS through GreatPeople:RecruitPerson.
-- Prints the timeline (slot: class, individual, claimant, era, cost) before and after,
-- CanRecruitPerson, the recruit call's result and the seed before and after.
--   --set ZP=0 --set ZCLS=0 --set ZDO=1
local GP = Game.GetGreatPeople()
local function show(tag)
  local s = {}
  for i, e in ipairs(GP:GetTimeline()) do
    s[#s + 1] = i .. ":" .. tostring(e.Class) .. "/" .. tostring(e.Individual) .. "/" .. tostring(e.Claimant)
      .. "/" .. tostring(e.Era) .. "/" .. tostring(e.Cost)
  end
  print(tag .. " seed=" .. Game.GetRandomSeed() .. " " .. table.concat(s, " "))
end
show("before")
local ind = nil
for _, e in ipairs(GP:GetTimeline()) do if e.Class == ZCLS then ind = e.Individual end end
print("individual=" .. tostring(ind))
local ok, c = pcall(function() return GP:CanRecruitPerson(ZP, ind) end)
print("can=" .. tostring(ok) .. " " .. tostring(c))
if ZDO == 1 and ind ~= nil and ind >= 0 then
  local ok2, r = pcall(function() return GP:RecruitPerson(ZP, ind) end)
  print("recruit=" .. tostring(ok2) .. " " .. tostring(r))
  show("after")
  local n = 0
  for _, u in Players[ZP]:GetUnits():Members() do
    if u:IsGreatPerson() then n = n + 1 end
  end
  print("greatPersonUnits=" .. n)
end
