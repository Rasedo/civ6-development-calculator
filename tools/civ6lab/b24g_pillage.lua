-- GameCore_Tuner (after lab_json.lua): set building ZB of the city at
-- ZCX:ZCY pillaged (ZV true) or repaired (false); read the GameCore state back.
local c = CityManager.GetCityAt(ZCX, ZCY)
local bl = c:GetBuildings()
local i = GameInfo.Buildings["ZB"].Index
local call = P(function() bl:SetPillaged(i, ZV) return true end)
OUT({kind = "pillage", city = c:GetID(), b = "ZB", v = ZV, call = call, now = P(function() return bl:IsPillaged(i) end)})
