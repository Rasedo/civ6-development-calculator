-- GameCore_Tuner: the SYNCHRONOUS state witness. ZMODE=arm registers GE
-- listeners that, when each fires, snapshot the state of the event's player
-- (GameEvents run inside the DLL's own processing, so what a listener reads is
-- the state at that point of the turn):
--   seq|turn|seed|event|args|g=gold f=faith rt=tech rp=techProgress cv=civic
--   cc=civicCompletedThisTurn|cities id:pop:plots:tug:item;...|units n:dmgSum:movesSum
-- to the global LAB_SNR2.log. ZMODE=swap / readtaken (ZOFF, ZN) as in
-- turnorder_arm.lua; ZMODE=count.
local mode = "ZMODE"
if LAB_SNR2 == nil then LAB_SNR2 = { n = 0, log = {}, armed = false } end
local S = LAB_SNR2

local function snapPlayer(p)
  local P = Players[p]
  if P == nil then return "noplayer" end
  local out = {}
  local function r(k, f)
    local ok, v = pcall(f)
    out[#out + 1] = k .. "=" .. (ok and tostring(v) or "E")
  end
  r("g", function() return P:GetTreasury():GetGoldBalance() end)
  r("f", function() return P:GetReligion():GetFaithBalance() end)
  local okt, rt = pcall(function() return P:GetTechs():GetResearchingTech() end)
  out[#out + 1] = "rt=" .. (okt and tostring(rt) or "E")
  r("rp", function() return P:GetTechs():GetResearchProgress(rt) end)
  r("cv", function() return P:GetCulture():GetProgressingCivic() end)
  r("cc", function() return P:GetCulture():GetCivicCompletedThisTurn() end)
  local cs = {}
  pcall(function()
    for _, c in P:GetCities():Members() do
      local okp, pop = pcall(function() return c:GetPopulation() end)
      local okl, pl = pcall(function() return #c:GetOwnedPlots() end)
      local okg, tug = pcall(function() return c:GetGrowth():GetTurnsUntilGrowth() end)
      local okb, it = pcall(function() return c:GetBuildQueue():CurrentlyBuilding() end)
      local okf, fs = pcall(function() return c:GetGrowth():GetFoodSurplus() end)
      local okh, hp = pcall(function() return c:GetYield(1) end)
      local okr, rel = pcall(function()
        local rg = c:GetReligion()
        local fl = {}
        for ri = -1, 15 do
          local okn, nf = pcall(function() return rg:GetNumFollowers(ri) end)
          if okn and nf ~= nil and nf > 0 then fl[#fl + 1] = ri .. "/" .. nf end
        end
        return rg:GetMajorityReligion() .. "/" .. table.concat(fl, "/")
      end)
      cs[#cs + 1] = c:GetID() .. ":" .. (okp and pop or "E") .. ":" .. (okl and pl or "E") .. ":"
        .. (okg and tug or "E") .. ":" .. (okb and tostring(it) or "E") .. ":" .. (okf and fs or "E")
        .. ":" .. (okh and hp or "E") .. ":" .. (okr and rel or "E")
    end
  end)
  out[#out + 1] = "C=" .. table.concat(cs, ";")
  local n, dmg, mv = 0, 0, 0
  pcall(function()
    for _, u in P:GetUnits():Members() do
      n = n + 1
      dmg = dmg + u:GetDamage()
      mv = mv + u:GetMovesRemaining()
    end
  end)
  out[#out + 1] = "U=" .. n .. ":" .. dmg .. ":" .. mv
  return table.concat(out, " ")
end

local function rec(tag, ...)
  S.n = S.n + 1
  local args = { ... }
  local a = {}
  for i = 1, 6 do if args[i] ~= nil then a[#a + 1] = tostring(args[i]) end end
  local okt, tn = pcall(function() return Game.GetCurrentGameTurn() end)
  local oks, sd = pcall(function() return Game.GetRandomSeed() end)
  local p = tonumber(args[1])
  local function all()
    local acc = {}
    for q = 0, 63 do
      local okq, alive = pcall(function() return Players[q] ~= nil and Players[q]:IsAlive() end)
      if okq and alive then acc[#acc + 1] = "P" .. q .. " " .. snapPlayer(q) end
    end
    return table.concat(acc, " || ")
  end
  local snap = ""
  if tag == "OnGameTurnStarted" or tag == "OnGameTurnEnded" then
    if ZWATCH >= 0 then snap = snapPlayer(ZWATCH) else snap = all() end
  elseif p ~= nil and p >= 0 and p < 64 then
    snap = snapPlayer(p)
  end
  local head = S.n .. "|" .. (okt and tn or "?") .. "|" .. (oks and sd or "-") .. "|"
  S.log[#S.log + 1] = head .. tag .. "|" .. table.concat(a, ",") .. "|" .. snap
  -- with ZWATCH -1, every player's turn boundary also carries the whole world
  if ZWATCH < 0 and (tag == "PlayerTurnStarted" or tag == "PlayerTurnStartComplete") then
    S.log[#S.log + 1] = head .. "ALL@" .. tag .. "|" .. table.concat(a, ",") .. "|" .. all()
  end
end

if mode == "arm" then
  if S.armed then print("already armed") return end
  local names = { "PlayerTurnStarted", "PlayerTurnStartComplete", "OnFaithEarned", "OnCivicCulturevated",
    "BuildingConstructed", "UnitCreated", "OnCityPopulationChanged", "OnDistrictConstructed",
    "PolicyChanged", "OnGameTurnEnded", "OnGameTurnStarted", "OnGreatPersonActivated", "CityBuilt",
    "CityConquered", "OnPillage", "OnCombatOccurred" }
  local ok = 0
  for _, nm in ipairs(names) do
    local tag = nm
    if pcall(function() GameEvents[nm].Add(function(...) rec(tag, ...) end) end) then ok = ok + 1 end
  end
  S.armed = true
  print("snap armed " .. ok)
elseif mode == "swap" then
  S.taken = S.log; S.log = {}; print("swapped " .. #S.taken)
elseif mode == "readtaken" then
  local tk = S.taken or {}
  for i = ZOFF + 1, math.min(#tk, ZOFF + ZN) do print(tk[i]) end
  print("END " .. #tk)
elseif mode == "clear" then
  S.log = {}; print("cleared")
elseif mode == "on" then
  print("on")
elseif mode == "mark" then
  S.log[#S.log + 1] = "0|0|-|MARK|ZMARK|"
  print("marked")
else
  print("count " .. #S.log)
end
