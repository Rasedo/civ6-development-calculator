-- GameCore_Tuner: the turn-start witness for the autoplay differential
-- harness (lab_json.lua's J / P / OUT are prefixed by the caller).
--
-- Every player's start of turn runs inside its own block, one player at a
-- time in ascending id (tools/civ6lab/turn_order_civ6.md, A1-A11):
-- GameEvents.PlayerTurnStarted(p) fires before the block banks anything,
-- GameEvents.PlayerTurnStartComplete(p) after its cities, units and banks.
-- GameEvents fire synchronously inside the DLL, so a listener reads the
-- state at exactly those two points. ZMODE:
--   arm   install the two listeners once per game (the GameCore_Tuner state's
--         global LAB_H1 lives as long as the game; a loaded game installs
--         afresh), then print the starts line
--   starts  print {k = "starts", ...}: per player the last turn each event
--         fired for it
--   read  the same with the witness of the record's turn and the one before
--
-- The witness of a player's start, `pre` at PlayerTurnStarted and `post` at
-- PlayerTurnStartComplete, from what GameCore's objects expose (no food or
-- culture box, loyalty, citizens or queue progress readers there — those
-- are InGame-only): the generator's state, the player's gold, faith,
-- research and progress, civic;
-- per city its population, food surplus, owned plots, yields and majority
-- religion. `pre` is what the start banks from (the player's last actions
-- done); `post` what it left.
local mode = "ZMODE"
local now = Game.GetCurrentGameTurn()
if LAB_H1 == nil then LAB_H1 = { armed = false, started = {}, complete = {}, witness = {} } end
local H = LAB_H1

local function cityWitness(c)
  local w = {}
  local function r(k, f)
    local ok, v = pcall(f)
    w[k] = ok and v or ("err:" .. tostring(v))
  end
  r("id", function() return c:GetID() end)
  r("pop", function() return c:GetPopulation() end)
  r("foodSurplus", function() return c:GetGrowth():GetFoodSurplus() end)
  r("plots", function() return #c:GetOwnedPlots() end)
  r("yields", function()
    local y = {}
    for row in GameInfo.Yields() do y[#y + 1] = c:GetYield(row.Index) end
    return y
  end)
  r("majorityReligion", function() return c:GetReligion():GetMajorityReligion() end)
  return w
end

local function playerWitness(p)
  local pl = Players[p]
  if pl == nil then return "noplayer" end
  local w = {}
  local function r(k, f)
    local ok, v = pcall(f)
    w[k] = ok and v or ("err:" .. tostring(v))
  end
  -- the synchronous generator's state here (a read, no draw), so the
  -- engines can replay this start's draws from it (tools/civ6lab/rng_fit.py)
  r("seed", function() return Game.GetRandomSeed() end)
  r("gold", function() return pl:GetTreasury():GetGoldBalance() end)
  r("faith", function() return pl:GetReligion():GetFaithBalance() end)
  r("researching", function() return pl:GetTechs():GetResearchingTech() end)
  r("researchProgress", function()
    local t = pl:GetTechs():GetResearchingTech()
    return t >= 0 and pl:GetTechs():GetResearchProgress(t) or -1
  end)
  r("civic", function() return pl:GetCulture():GetProgressingCivic() end)
  local cities = {}
  pcall(function()
    for _, c in pl:GetCities():Members() do cities[#cities + 1] = cityWitness(c) end
  end)
  w.cities = cities
  return w
end

-- the witness of turn `t` for player `p`, `slot` "pre" or "post"; the
-- turns before t - 2 are dropped
local function keep(p, slot)
  local t = Game.GetCurrentGameTurn()
  H.witness[t] = H.witness[t] or {}
  local byP = H.witness[t]
  byP[p] = byP[p] or {}
  byP[p][slot] = playerWitness(p)
  for k in pairs(H.witness) do if k < t - 2 then H.witness[k] = nil end end
end

if mode == "arm" and not H.armed then
  GameEvents.PlayerTurnStarted.Add(function(p)
    H.started[p] = Game.GetCurrentGameTurn()
    pcall(keep, p, "pre")
  end)
  GameEvents.PlayerTurnStartComplete.Add(function(p)
    pcall(keep, p, "post")
    H.complete[p] = Game.GetCurrentGameTurn()
  end)
  H.armed = true
end

local starts = {}
for p = 0, 63 do
  if H.started[p] ~= nil or H.complete[p] ~= nil then
    starts[tostring(p)] = { H.started[p] or -1, H.complete[p] or -1 }
  end
end
-- the witness as a flat list (J writes six levels deep): one entry per
-- turn, player and point, its player fields and cities beside them
local wit = {}
for _, t in ipairs(mode == "read" and { ZTURN - 1, ZTURN } or {}) do
  for p, v in pairs(H.witness[t] or {}) do
    for _, slot in ipairs({ "pre", "post" }) do
      local w = v[slot]
      if type(w) == "table" then
        local e = { turn = t, player = p, point = slot }
        for k2, x in pairs(w) do e[k2] = x end
        wit[#wit + 1] = e
      end
    end
  end
end
OUT({ k = "starts", turn = now, armed = H.armed, starts = starts, witness = wit })
