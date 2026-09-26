-- InGame: the World Congress resolutions in force, as the Review screen
-- reads them (`Game.GetWorldCongress():GetResolutions(localPlayer)`,
-- WorldCongressPopup.lua): one line per resolution, every field it carries.
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local me = Game.GetLocalPlayer()
local ok, rs = pcall(function() return Game.GetWorldCongress():GetResolutions(me) end)
if not ok or type(rs) ~= "table" then print('{"kind":"wc","turn":' .. Game.GetCurrentGameTurn() .. ',"err":"' .. esc(rs) .. '"}') return end
for i, r in pairs(rs) do
  if type(r) == "table" then
    local f = {}
    for k, v in pairs(r) do
      if type(v) ~= "table" then f[#f + 1] = '"' .. esc(k) .. '":"' .. esc(v) .. '"' end
    end
    local def = GameInfo.Resolutions[r.Type]
    f[#f + 1] = '"resolution":"' .. esc(def and def.ResolutionType or "?") .. '"'
    table.sort(f)
    print('{"kind":"wc","turn":' .. Game.GetCurrentGameTurn() .. ',' .. table.concat(f, ",") .. '}')
  else
    print('{"kind":"wc","turn":' .. Game.GetCurrentGameTurn() .. ',"key":"' .. esc(i) .. '","value":"' .. esc(r) .. '"}')
  end
end
