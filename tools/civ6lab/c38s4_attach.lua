-- GameCore_Tuner (after lab_json.lua): C-38-S4 — attach modifier ZMOD to
-- major ZP (`AttachModifierByID`) and print the call's answer.
OUT({kind = "attach", p = ZP, mod = "ZMOD", call = P(function() return Players[ZP]:AttachModifierByID("ZMOD") end)})
