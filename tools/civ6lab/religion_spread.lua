-- InGame: scene E, step 2 — run UNITOPERATION_SPREAD_RELIGION at a plot
-- with every idle Apostle of player 0 that is standing on it, and print the
-- city's religion ledger before and after.
--   --set ZCX=38 --set ZCY=19
local cx, cy = ZCX, ZCY
local op = GameInfo.UnitOperations["UNITOPERATION_SPREAD_RELIGION"].Hash
local city = Cities.GetCityInPlot(cx, cy)
local function relname(i)
  if i == nil or i < 0 then return "none" end
  local r = GameInfo.Religions[i]
  return (r ~= nil and r.ReligionType or ("id" .. i))
end
local function ledger(tag)
  if city == nil then print(tag .. " nocity") return end
  local cr = city:GetReligion()
  local parts = {}
  for _, row in ipairs(cr:GetReligionsInCity()) do
    parts[#parts + 1] = relname(row.Religion) .. ":f=" .. tostring(row.Followers) .. ",p=" .. tostring(row.Pressure)
  end
  print(tag .. " turn=" .. Game.GetCurrentGameTurn() .. " city=" .. city:GetName()
    .. " pop=" .. city:GetPopulation() .. " majority=" .. relname(cr:GetMajorityReligion())
    .. " [" .. table.concat(parts, " | ") .. "]")
end
ledger("before")
for _, u in Players[0]:GetUnits():Members() do
  if u:GetX() == cx and u:GetY() == cy and GameInfo.Units[u:GetType()].UnitType == "UNIT_APOSTLE" then
    local params = {}
    params[UnitOperationTypes.PARAM_X] = cx
    params[UnitOperationTypes.PARAM_Y] = cy
    local okc, can = pcall(function() return UnitManager.CanStartOperation(u, op, nil, params) end)
    local oko, erro = pcall(function() UnitManager.RequestOperation(u, op, params) end)
    local urel = -1
    pcall(function() urel = u:GetReligion():GetReligionType() end)
    print("spread unit=" .. u:GetID() .. " rel=" .. relname(urel)
      .. " can=" .. tostring(okc and can or "ERR") .. " requested=" .. tostring(oko) .. " err=" .. tostring(erro))
  end
end
ledger("after")
