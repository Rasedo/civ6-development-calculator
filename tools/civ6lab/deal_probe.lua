-- InGame: the Research Agreement's stated turn count without the deal screen.
-- lab 2 left C-2 blocked on "the number only DiplomacyDealView shows", but the
-- screen is only a reader of DealManager: a working deal can be created from
-- the socket, an AGREEMENT item added, and the item's own duration read back.
-- First: does the manager exist here, and what does it answer to?
local function keys(label, o)
  if o == nil then print("{\"kind\":\"deal\",\"" .. label .. "\":\"nil\"}") return end
  local acc = {}
  local mt = getmetatable(o)
  local okx, idx = pcall(function() return mt and mt["__index"] end)
  local src = (okx and type(idx) == "table") and idx or o
  for k, v in pairs(src) do if type(k) == "string" then acc[#acc + 1] = k end end
  table.sort(acc)
  print("{\"kind\":\"deal\",\"" .. label .. "\":\"" .. table.concat(acc, " ") .. "\"}")
end
local okd, dm = pcall(function() return DealManager end)
if not okd or dm == nil then print("{\"kind\":\"deal\",\"DealManager\":\"nil\"}") return end
keys("DealManager", dm)
local okt, dt = pcall(function() return DealItemTypes end)
if okt and dt ~= nil then
  local acc = {}
  for k, v in pairs(dt) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"deal\",\"DealItemTypes\":\"" .. table.concat(acc, " ") .. "\"}")
end
local oka, da = pcall(function() return DealAgreementTypes end)
if oka and da ~= nil then
  local acc = {}
  for k, v in pairs(da) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"deal\",\"DealAgreementTypes\":\"" .. table.concat(acc, " ") .. "\"}")
end
local okdr, dd = pcall(function() return DealDirection end)
if okdr and dd ~= nil then
  local acc = {}
  for k, v in pairs(dd) do acc[#acc + 1] = k .. "=" .. tostring(v) end
  table.sort(acc)
  print("{\"kind\":\"deal\",\"DealDirection\":\"" .. table.concat(acc, " ") .. "\"}")
end
