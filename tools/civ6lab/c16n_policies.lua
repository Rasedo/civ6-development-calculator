-- InGame, the local seat: fill every empty policy slot with an unlocked,
-- not obsolete policy of the slot's kind (a wildcard slot takes any kind),
-- none used twice, by RequestPolicyChanges as GovernmentScreen.lua sends it.
local me = Game.GetLocalPlayer()
local cu = Players[me]:GetCulture()
local n = cu:GetNumPolicySlots()
local used = {}
for i = 0, n - 1 do
  local p = cu:GetSlotPolicy(i)
  if p ~= nil and p >= 0 then used[p] = true end
end
local SLOT = {}
for r in GameInfo.GovernmentSlots() do SLOT[r.Index] = r.GovernmentSlotType end
local clear, add, picked = {}, {}, {}
for i = 0, n - 1 do
  local p = cu:GetSlotPolicy(i)
  if p == nil or p < 0 then
    local st = SLOT[cu:GetSlotType(i)] or "?"
    local want = ({SLOT_MILITARY = "SLOT_MILITARY", SLOT_ECONOMIC = "SLOT_ECONOMIC", SLOT_DIPLOMATIC = "SLOT_DIPLOMATIC",
      SLOT_GREAT_PERSON = "SLOT_GREAT_PERSON"})[st]
    for row in GameInfo.Policies() do
      if add[i] == nil and not used[row.Index] and (want == nil or row.GovernmentSlotType == want)
         and row.GovernmentSlotType ~= "SLOT_DARKAGE" and cu:IsPolicyUnlocked(row.Index) and not cu:IsPolicyObsolete(row.Index) then
        add[i] = row.Hash
        used[row.Index] = true
        picked[#picked + 1] = i .. ":" .. st .. ":" .. row.PolicyType
      end
    end
  end
end
local ok, err = pcall(function() cu:RequestPolicyChanges(clear, add) end)
print("policies seat " .. me .. " slots " .. n .. " filled " .. table.concat(picked, ",") .. " ok " .. tostring(ok) .. " " .. tostring(err))
