-- LiveSync.lua
-- Prints an incremental empire snapshot to Lua.log on load and at the start
-- of every player turn. The Development Calculator polls the log (Import
-- panel -> Live sync) and mirrors the game state.
--
-- Block format:
--   CIV6SYNC_BEGIN|<turn>|<localPlayerId>
--   CIV6SYNC_RESEARCH|TECH_A,TECH_B|CIVIC_A,CIVIC_B
--   CIV6SYNC_GOV|GOVERNMENT_X
--   CIV6SYNC_POLICIES|POLICY_A,POLICY_B
--   CIV6SYNC_BELIEFS|BELIEF_A,BELIEF_B
--   CIV6SYNC_CITY|<cityId>|<x>|<y>|<population>|<name>
--   CIV6SYNC_CITYBLD|<cityId>|BUILDING_A,BUILDING_B
--   CIV6SYNC_QUEUE|<cityId>|<producedType>|<progress>|<cost>
--   CIV6SYNC_PLOT|<x>|<y>|<improvement>|<district>|<wonder>|<ownerPlayerId>   (deltas only)
--   CIV6SYNC_END
--
-- Government/policy/belief/queue reads are wrapped in pcall: the UI-context
-- API surface varies between game versions, and a missing method should cost
-- one line of the snapshot, not the whole sync.

local lastPlotSig = {};

local function SyncSnapshot()
	local me = Game.GetLocalPlayer();
	if me == nil or me == -1 then return; end
	local player = Players[me];
	if player == nil then return; end

	print("CIV6SYNC_BEGIN|" .. Game.GetCurrentGameTurn() .. "|" .. me);

	-- Research ---------------------------------------------------------------
	local techs = {};
	local playerTechs = player:GetTechs();
	for row in GameInfo.Technologies() do
		if playerTechs:HasTech(row.Index) then
			table.insert(techs, row.TechnologyType);
		end
	end
	local civics = {};
	local playerCulture = player:GetCulture();
	for row in GameInfo.Civics() do
		if playerCulture:HasCivic(row.Index) then
			table.insert(civics, row.CivicType);
		end
	end
	print("CIV6SYNC_RESEARCH|" .. table.concat(techs, ",") .. "|" .. table.concat(civics, ","));

	-- Government & slotted policy cards ---------------------------------------
	pcall(function()
		local gov = playerCulture:GetCurrentGovernment();
		if gov ~= nil and gov >= 0 then
			local row = GameInfo.Governments[gov];
			if row ~= nil then print("CIV6SYNC_GOV|" .. row.GovernmentType); end
		end
		local cards = {};
		local slots = playerCulture:GetNumPolicySlots();
		for slot = 0, slots - 1 do
			local pol = playerCulture:GetSlotPolicy(slot);
			if pol ~= nil and pol >= 0 then
				local prow = GameInfo.Policies[pol];
				if prow ~= nil then table.insert(cards, prow.PolicyType); end
			end
		end
		if #cards > 0 then print("CIV6SYNC_POLICIES|" .. table.concat(cards, ",")); end
	end);

	-- Pantheon + founded-religion beliefs --------------------------------------
	pcall(function()
		local beliefs = {};
		local playerReligion = player:GetReligion();
		local pantheon = playerReligion:GetPantheon();
		if pantheon ~= nil and pantheon >= 0 then
			local brow = GameInfo.Beliefs[pantheon];
			if brow ~= nil then table.insert(beliefs, brow.BeliefType); end
		end
		local created = playerReligion:GetReligionTypeCreated();
		if created ~= nil and created > 0 then
			local relBeliefs = Game.GetReligion():GetReligion(created).Beliefs;
			if relBeliefs ~= nil then
				for _, b in ipairs(relBeliefs) do
					local brow = GameInfo.Beliefs[b];
					if brow ~= nil then table.insert(beliefs, brow.BeliefType); end
				end
			end
		end
		if #beliefs > 0 then print("CIV6SYNC_BELIEFS|" .. table.concat(beliefs, ",")); end
	end);

	-- Cities -----------------------------------------------------------------
	for _, city in player:GetCities():Members() do
		print("CIV6SYNC_CITY|" .. city:GetID() .. "|" .. city:GetX() .. "|" .. city:GetY() ..
			"|" .. city:GetPopulation() .. "|" .. Locale.Lookup(city:GetName()));
		local blds = {};
		local cityBuildings = city:GetBuildings();
		for row in GameInfo.Buildings() do
			if cityBuildings:HasBuilding(row.Index) then
				table.insert(blds, row.BuildingType);
			end
		end
		print("CIV6SYNC_CITYBLD|" .. city:GetID() .. "|" .. table.concat(blds, ","));

		-- Current production (front of the build queue) --------------------------
		pcall(function()
			local bq = city:GetBuildQueue();
			local hash = bq:GetCurrentProductionTypeHash();
			if hash == nil or hash == 0 then return; end
			local row = GameInfo.Buildings[hash] or GameInfo.Districts[hash]
				or GameInfo.Units[hash] or GameInfo.Projects[hash];
			if row == nil then return; end
			local kind = row.BuildingType or row.DistrictType or row.UnitType or row.ProjectType;
			local progress = 0;
			local cost = 0;
			pcall(function() progress = bq:GetProductionProgress(hash) or 0; end);
			pcall(function() cost = bq:GetProductionCost(hash) or 0; end);
			print("CIV6SYNC_QUEUE|" .. city:GetID() .. "|" .. kind .. "|" .. progress .. "|" .. cost);
		end);
	end

	-- Plot deltas -------------------------------------------------------------
	for i = 0, Map.GetPlotCount() - 1 do
		local plot = Map.GetPlotByIndex(i);

		local imp = "-";
		if plot:GetImprovementType() >= 0 then
			local row = GameInfo.Improvements[plot:GetImprovementType()];
			if row ~= nil then imp = row.ImprovementType; end
		end
		local dist = "-";
		if plot:GetDistrictType() >= 0 then
			local row = GameInfo.Districts[plot:GetDistrictType()];
			if row ~= nil then dist = row.DistrictType; end
		end
		local wonder = "-";
		if plot:GetWonderType() >= 0 then
			local row = GameInfo.Buildings[plot:GetWonderType()];
			if row ~= nil then wonder = row.BuildingType; end
		end
		local owner = plot:GetOwner();

		local sig = imp .. "|" .. dist .. "|" .. wonder .. "|" .. owner;
		if lastPlotSig[i] == nil and sig == "-|-|-|-1" then
			lastPlotSig[i] = sig; -- untouched plot; nothing to report
		elseif lastPlotSig[i] ~= sig then
			lastPlotSig[i] = sig;
			print("CIV6SYNC_PLOT|" .. plot:GetX() .. "|" .. plot:GetY() .. "|" ..
				imp .. "|" .. dist .. "|" .. wonder .. "|" .. owner);
		end
	end

	print("CIV6SYNC_END");
end

Events.LoadScreenClose.Add(SyncSnapshot);
Events.LocalPlayerTurnBegin.Add(SyncSnapshot);
