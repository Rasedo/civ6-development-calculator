-- InGame, once per turn of the C-16 / C-2 loop (`c16n_cycle.py`): the
-- promises seat ZA has made to ZB (all four kinds, `IsPromiseMade` as
-- DiplomacyActionView reads it), ZB's grievances against ZA and their change
-- per turn, and every grievance-log entry of the pair from turn ZSINCE on.
-- One line, prefixed "c2 ".
local turn = Game.GetCurrentGameTurn()
local a, b = ZA, ZB
local out = {turn = turn}
local d = Players[a]:GetDiplomacy()
out.promises = {}
for k, v in pairs(PromiseTypes) do
  local ok, made = pcall(function() return d:IsPromiseMade(b, v) end)
  if ok then out.promises[k] = made else out.promises[k] = "err:" .. tostring(made) end
end
local okg, g = pcall(function() return Players[b]:GetDiplomacy():GetGrievancesAgainst(a) end)
if okg then out.griev = g else out.griev = "err:" .. tostring(g) end
local gd = Game.GetGameDiplomacy()
local okr, r = pcall(function() return gd:GetGrievanceChangePerTurn(b, a) end)
if okr then out.perTurn = r else out.perTurn = "err:" .. tostring(r) end
out.log = {}
local okl, log = pcall(function() return gd:GetGrievanceLogEntries(b, a) end)
if okl and type(log) == "table" then
  for _, e in pairs(log) do
    if type(e) == "table" and (tonumber(e.Turn) or turn) >= ZSINCE then
      local f = {}
      for k, v in pairs(e) do f[k] = v end
      out.log[#out.log + 1] = f
    end
  end
else
  out.log = "err:" .. tostring(log)
end
local function J(v)
  local t = type(v)
  if t == "table" then
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = '"' .. tostring(k) .. '":' .. J(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "number" or t == "boolean" then return tostring(v)
  elseif v == nil then return "null" end
  return '"' .. tostring(v):gsub('[%c"\\]', " ") .. '"'
end
print("c2 " .. J(out))
