-- InGame or PlotInfo: search for the SWAP_TILE_OWNER call shape the DLL
-- accepts. Claimant city ZA (seat 0), target plot ZX,ZY owned by its sibling.
-- Every parameter variant goes to CanStartCommand (both bTest values) and to
-- GetCommandTargets; every returned table is dumped, failure reasons included.
--   --set ZA=65536 --set ZX=18 --set ZY=14
local a = CityManager.GetCity(0, ZA)
local plot = Map.GetPlot(ZX, ZY)
local T = CityCommandTypes
local modeParam = UI.GetInterfaceModeParameter and UI.GetInterfaceModeParameter(T.PARAM_SWAP_TILE_OWNER)
local function dump(v, depth)
  depth = depth or 0
  if type(v) ~= "table" then return tostring(v) end
  if depth > 2 then return "{...}" end
  local parts = {}
  for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. dump(x, depth + 1) end
  return "{" .. table.concat(parts, ",") .. "}"
end
local variants = {
  {"none", nil, false},
  {"mode", modeParam, false},
  {"plotidx", plot:GetIndex(), false},
  {"cityid", ZA, false},
  {"one", 1, false},
  {"none+xy", nil, true},
  {"plotidx+xy", plot:GetIndex(), true},
  {"cityid+xy", ZA, true},
  {"one+xy", 1, true},
}
print("modeParam=" .. tostring(modeParam) .. " headSelected=" .. tostring(UI.GetHeadSelectedCity() and UI.GetHeadSelectedCity():GetID()))
for _, v in ipairs(variants) do
  local t = {}
  if v[2] ~= nil then t[T.PARAM_SWAP_TILE_OWNER] = v[2] end
  if v[3] then t[T.PARAM_X] = ZX; t[T.PARAM_Y] = ZY end
  for _, bt in ipairs({true, false}) do
    local ok, can, res = pcall(function() return CityManager.CanStartCommand(a, T.SWAP_TILE_OWNER, t, bt) end)
    print(v[1] .. " bTest=" .. tostring(bt) .. " can=" .. tostring(ok and can or ("ERR " .. tostring(can))) .. " res=" .. dump(res))
  end
  local ok2, tr = pcall(function() return CityManager.GetCommandTargets(a, T.SWAP_TILE_OWNER, t) end)
  print(v[1] .. " targets=" .. dump(ok2 and tr or ("ERR " .. tostring(tr))))
end
