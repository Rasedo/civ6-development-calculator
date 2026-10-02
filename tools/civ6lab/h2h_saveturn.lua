-- InGame or FrontEnd: the turn a named save carries, from the save list's
-- metadata (the Load screen's own query). The query answers asynchronously:
-- the first call sends it, a later call prints what came back.
--   --set ZNAME=h2h_held_t30
if H2H_SAVES == nil then
  H2H_SAVES = "pending"
  local function OnResults(fileList, qid)
    UI.CloseFileListQuery(qid)
    LuaEvents.FileListQueryResults.Remove(OnResults)
    local out = {}
    for _, s in ipairs(fileList) do
      local path = tostring(s.Path or "")
      if string.find(path, "ZNAME", 1, true) then
        out[#out + 1] = path:match("[^/\\]+$") .. " turn=" .. tostring(s.CurrentTurn)
      end
    end
    H2H_SAVES = table.concat(out, " ; ")
  end
  LuaEvents.FileListQueryResults.Add(OnResults)
  UI.QuerySaveGameList(SaveLocations.LOCAL_STORAGE, SaveTypes.SINGLE_PLAYER,
    SaveLocationOptions.NORMAL + SaveLocationOptions.LOAD_METADATA)
end
print("saves " .. tostring(H2H_SAVES))
