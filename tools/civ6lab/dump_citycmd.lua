-- InGame: the citizen-management API. The city panel can move a citizen from a
-- tile into a specialist slot, which is the only non-destructive way to build a
-- city whose every WORKED tile is inside a blast while a citizen stands on no
-- tile at all. Prints the command enum and the manager's own names.
local function keys(label, o)
  if o == nil then print(label .. " = nil") return end
  local acc = {}
  for k, v in pairs(o) do
    if type(k) == "string" then acc[#acc + 1] = k .. "=" .. (type(v) == "number" and tostring(v) or type(v)) end
  end
  table.sort(acc)
  print(label .. " [" .. #acc .. "] " .. table.concat(acc, " "))
end
keys("CityCommandTypes", CityCommandTypes)
keys("CityManager", CityManager)
keys("CityOperationTypes", CityOperationTypes)
