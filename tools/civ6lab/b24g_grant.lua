-- GameCore_Tuner (after lab_json.lua): seat ZP is granted every tech and civic
-- and ZG gold.
local p = Players[ZP]
local nt, nc = 0, 0
for t in GameInfo.Technologies() do if P(function() p:GetTechs():SetTech(t.Index, true) return true end) == true then nt = nt + 1 end end
for c in GameInfo.Civics() do if P(function() p:GetCulture():SetCivic(c.Index, true) return true end) == true then nc = nc + 1 end end
local g = P(function() p:GetTreasury():SetGoldBalance(ZG) return true end)
OUT({kind = "grant", seat = ZP, techs = nt, civics = nc, gold = g})
