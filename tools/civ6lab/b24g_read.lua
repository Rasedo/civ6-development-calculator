-- InGame (after lab_json.lua): the seat's governors and the reactors. For
-- seat ZP: points obtained / spent, CanAppoint, every appointed governor
-- (type index or hash as GetType answers, the row, its city, established,
-- its promotions by DB.MakeHash as GovernorPanel.lua reads them), and every
-- reactor's owner, city and plot.
local me = ZP
local g = Players[me]:GetGovernors()
local rec = {kind = "govread", seat = me}
rec.points = P(function() return g:GetGovernorPoints() end)
rec.spent = P(function() return g:GetGovernorPointsSpent() end)
rec.canAppoint = P(function() return g:CanAppoint() end)
rec.govs = {}
local ok, has, list = pcall(function() return g:GetGovernorList() end)
rec.listOk = ok
if ok and list then
  for _, x in ipairs(list) do
    local t = x:GetType()
    local row = GameInfo.Governors[t]
    local e = {type = t, row = row and row.GovernorType or "?"}
    e.city = P(function() local c = x:GetAssignedCity() return c and c:GetID() or -1 end)
    e.cityOwner = P(function() local c = x:GetAssignedCity() return c and c:GetOwner() or -1 end)
    e.established = P(function() return x:IsEstablished() end)
    e.promos = {}
    if row then
      for pr in GameInfo.GovernorPromotionSets() do
        if pr.GovernorType == row.GovernorType then
          if P(function() return x:HasPromotion(DB.MakeHash(pr.GovernorPromotion)) end) == true then
            e.promos[#e.promos + 1] = pr.GovernorPromotion
          end
        end
      end
    end
    rec.govs[#rec.govs + 1] = e
  end
end
rec.reactors = {}
local fm = Game.GetFalloutManager()
local n = P(function() return fm:GetReactorCount() end)
if type(n) == "number" then
  for k = 0, n - 1 do
    local r = fm:GetReactorByIndex(k)
    local c = CityManager.GetCity(r.Owner, r.CityID)
    rec.reactors[#rec.reactors + 1] = {k = k, owner = r.Owner, city = r.CityID, plot = r.PlotIndex,
      name = c and Locale.Lookup(c:GetName()) or "?", x = c and c:GetX(), y = c and c:GetY(),
      gov = c and P(function() local q = c:GetAssignedGovernor() return q and q:GetType() or -1 end)}
  end
end
OUT(rec)
