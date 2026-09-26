-- GameCore_Tuner: grant player ZP every technology (and every civic when
-- ZCIV=1). Prints the counts.
--   --set ZP=0 --set ZCIV=1
local p = Players[ZP]
local n, c = 0, 0
for t in GameInfo.Technologies() do
  if not p:GetTechs():HasTech(t.Index) then p:GetTechs():SetTech(t.Index, true); n = n + 1 end
end
if ZCIV == 1 then
  for v in GameInfo.Civics() do
    if not p:GetCulture():HasCivic(v.Index) then p:GetCulture():SetCivic(v.Index, true); c = c + 1 end
  end
end
print('{"kind":"grant","player":' .. ZP .. ',"techs":' .. n .. ',"civics":' .. c .. '}')
