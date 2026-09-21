-- The scene-D population pass, as data. Both nuke_pass_setup.lua and
-- nuke_pass_strike.lua paste this table in (the tuner takes one chunk per
-- call, so it is duplicated rather than require()d).
--
-- Every row is an INDEPENDENT draw: a nuke on one city does not touch
-- another, so one reload buys the whole sweep.
--   pop sweep      thermonuclear, aim ON the centre, pops 4/8/12/16/18/20
--   distance sweep thermonuclear, pop 12, aim 0/1/2/3 tiles off the centre
--   radius-1 sweep nuclear device, pops 6/12, aim 0 and 1 off the centre
PLAN = {
  { x = 23, y = 26, owner = 1, pop = 18, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop18-d0-thermo" },
  { x = 20, y = 29, owner = 1, pop = 12, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d0-thermo" },
  { x = 26, y = 28, owner = 1, pop = 8,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop8-d0-thermo" },
  { x = 26, y = 32, owner = 1, pop = 4,  d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop4-d0-thermo" },
  { x = 19, y = 14, owner = 2, pop = 16, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop16-d0-thermo" },
  { x = 30, y = 20, owner = 1, pop = 20, d = 0, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop20-d0-thermo" },
  { x = 17, y = 25, owner = 6, pop = 12, d = 1, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d1-thermo" },
  { x = 18, y = 18, owner = 9, pop = 12, d = 2, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d2-thermo" },
  { x = 26, y = 18, owner = 4, pop = 12, d = 3, wmd = "WMD_THERMONUCLEAR_DEVICE", tag = "pop12-d3-thermo" },
  { x = 12, y = 23, owner = 3, pop = 12, d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d0-nuclear" },
  { x = 13, y = 19, owner = 3, pop = 12, d = 1, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop12-d1-nuclear" },
  { x = 22, y = 12, owner = 2, pop = 6,  d = 0, wmd = "WMD_NUCLEAR_DEVICE", tag = "pop6-d0-nuclear" },
}
