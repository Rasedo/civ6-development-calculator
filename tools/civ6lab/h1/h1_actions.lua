-- InGame: the action log for the autoplay differential harness
-- (lab_json.lua's J / P / OUT are prefixed by the caller).
--
-- The dump is a photograph of each turn; this is what happened between two
-- photographs. Listeners on the InGame `Events` the game fires for every
-- player's deeds append one row per event — [seq, turn, event name, args...]
-- — to the InGame global LAB_H1A, which lives as long as the game (a new or
-- loaded game installs afresh). The arguments are logged as the game passes
-- them (numbers, booleans, strings); their meaning per event is the UI's
-- handler signature (Base/Assets/UI, DLC/Expansion2/UI).
-- ZMODE:
--   arm    install the listeners once per game; print the status line
--   read   print {k = "actions", list = rows since the last read} and clear
--   status print the status line only
local mode = "ZMODE"
if LAB_H1A == nil then LAB_H1A = { armed = false, seq = 0, rows = {}, missing = {}, dropped = 0, luxWatch = {} } end
local A = LAB_H1A
local CAP = 200000

-- the deeds a replay needs: what each player did, where units went, what
-- cities made and bought, what research / civics / policies / governments /
-- governors / beliefs / envoys / routes / wars changed, what plots gained
local NAMES = {
  "PlayerTurnActivated", "PlayerTurnDeactivated",
  "UnitAddedToMap", "UnitRemovedFromMap", "UnitMoved", "UnitMoveComplete", "UnitTeleported",
  "UnitCommandStarted", "UnitOperationStarted", "UnitOperationSegmentComplete",
  "UnitKilledInCombat", "UnitCaptured", "UnitUpgraded", "UnitPromoted", "UnitFormCorps", "UnitFormArmy",
  "UnitEnterFormation", "UnitExitFormation", "UnitEmbarkedStateChanged", "UnitChargesChanged",
  "UnitGreatPersonActivated", "UnitDamageChanged", "UnitFortificationChanged", "UnitActivityChanged",
  "CombatVisBegin", "CombatVisEnd",
  "CityAddedToMap", "CityRemovedFromMap", "CityTransfered", "CityLiberated", "CityInitialized",
  "CityProductionChanged", "CityProductionQueueChanged", "CityProductionCompleted", "CityProjectCompleted",
  "CityMadePurchase", "CityTileOwnershipChanged", "CityWorkerChanged", "CityFocusChanged",
  "CityPopulationChanged", "CityReligionChanged", "CityOccupationChanged",
  "DistrictAddedToMap", "DistrictRemovedFromMap", "DistrictPillaged", "BuildingAddedToMap", "BuildingChanged",
  "WonderCompleted", "ImprovementAddedToMap", "ImprovementRemovedFromMap", "ImprovementChanged",
  "ResearchChanged", "ResearchCompleted", "ResearchQueueChanged", "CivicChanged", "CivicCompleted",
  "CivicQueueChanged", "GovernmentChanged", "GovernmentPolicyChanged", "GovernmentPolicyObsoleted",
  "GovernorAppointed", "GovernorAssigned", "GovernorChanged", "GovernorEjected", "GovernorPromoted",
  "PantheonFounded", "ReligionFounded", "BeliefAdded",
  "InfluenceGiven", "InfluenceChanged",
  "TradeRouteAddedToMap", "TradeRouteActivityChanged",
  "DiplomacyDeclareWar", "DiplomacyMakePeace", "DiplomacyDealEnacted", "DiplomacyMeet", "DiplomacyMeetMajors",
  "GoodyHutReward", "GreatWorkCreated", "GreatWorkMoved", "PlotYieldChanged",
  "SpyAdded", "SpyRemoved", "SpyMissionCompleted",
  "PlayerDefeat", "PlayerDestroyed", "PlayerEraChanged", "PlayerAgeChanged",
  "EmergencyStarted", "EmergencyCompleted", "WorldCongressFinished",
}

local function arm()
  for _, name in ipairs(NAMES) do
    local ok = pcall(function()
      Events[name].Add(function(...)
        local a = A
        if #a.rows >= CAP then a.dropped = a.dropped + 1 return end
        a.seq = a.seq + 1
        local row = { a.seq, Game.GetCurrentGameTurn(), name }
        local args = { ... }
        for i = 1, select("#", ...) do
          local v = args[i]
          local t = type(v)
          if t == "number" or t == "boolean" or t == "string" then row[#row + 1] = v
          elseif v == nil then row[#row + 1] = "nil"
          else row[#row + 1] = "<" .. t .. ">" end
        end
        -- a focus change carries the city's yields as the listener reads
        -- them: one letter per Yields row, F favored, D disfavored, . neither
        if name == "CityFocusChanged" then
          row[#row + 1] = P(function()
            local cit = CityManager.GetCity(args[1], args[2]):GetCitizens()
            local s = {}
            for y in GameInfo.Yields() do
              s[#s + 1] = cit:IsFavoredYield(y.Index) and "F" or (cit:IsDisfavoredYield(y.Index) and "D" or ".")
            end
            return table.concat(s)
          end)
        end
        a.rows[#a.rows + 1] = row
        -- a city founded with no luxury allocated is watched: the first
        -- row after which the allocation names it logs LuxAllocArrived
        -- [owner, city, the row's seq]; its owner's activation ends the watch
        -- (LuxAllocNone)
        if name == "CityAddedToMap" then
          local ok, n = pcall(function() return #Players[args[1]]:GetResources():GetCityResourceAllocations(args[2]) end)
          if ok and n == 0 then a.luxWatch[#a.luxWatch + 1] = {args[1], args[2]} end
        end
        if #a.luxWatch > 0 then
          local keep = {}
          for _, w in ipairs(a.luxWatch) do
            local ok, n = pcall(function() return #Players[w[1]]:GetResources():GetCityResourceAllocations(w[2]) end)
            local tag = (ok and n > 0) and "LuxAllocArrived"
              or ((name == "PlayerTurnActivated" and args[1] == w[1]) and "LuxAllocNone" or nil)
            if tag then
              a.seq = a.seq + 1
              a.rows[#a.rows + 1] = { a.seq, Game.GetCurrentGameTurn(), tag, w[1], w[2], a.seq - 1 }
            else
              keep[#keep + 1] = w
            end
          end
          a.luxWatch = keep
        end
      end)
    end)
    if not ok then A.missing[#A.missing + 1] = name end
  end
  A.armed = true
end

if mode == "arm" and not A.armed then arm() end
if mode == "read" then
  local rows = A.rows
  A.rows = {}
  OUT({k = "actions", list = rows, dropped = A.dropped})
  A.dropped = 0
end
OUT({k = "actions_status", armed = A.armed, pending = #A.rows, seq = A.seq, missing = A.missing})
