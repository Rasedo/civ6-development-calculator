-- H-3: pairs' visit order over integer-keyed tables built as t[1..n] = x and
-- then partly set to nil, after table.insert / table.remove, filled in
-- reverse, and with keys past the end. One line per table:
--   P|<case>|<n>|<#t>|<keys in pairs order>
-- Runs unchanged in the game (any Lua state) and under lupa with vm.py's
-- HKS_PAIRS (h3_pairscheck.py).
local seed = 12345
local function rnd(m)
	seed = (seed * 16807) % 2147483647
	return seed % m
end

local function fill(n)
	local t = {}
	for i = 1, n do t[i] = i * 10 end
	return t
end

local function emit(name, n, t)
	local ks = {}
	for k, _ in pairs(t) do ks[#ks + 1] = tostring(k) end
	print("P|" .. name .. "|" .. n .. "|" .. tostring(#t) .. "|" .. table.concat(ks, ","))
end

for n = 1, 40 do
	local t
	t = fill(n)
	emit("full", n, t)

	t = fill(n)
	for i = 3, n, 3 do t[i] = nil end
	emit("nil3", n, t)

	t = fill(n)
	for i = 1, math.floor(n / 2) do t[i] = nil end
	emit("nillow", n, t)

	t = fill(n)
	for i = math.floor(n / 2) + 1, n do t[i] = nil end
	emit("nilhigh", n, t)

	t = fill(n)
	for i = 1, n do if rnd(2) == 0 then t[i] = nil end end
	emit("nilrnd", n, t)

	t = fill(n)
	for i = 1, n do if rnd(4) == 0 then t[i] = nil end end
	for _ = 1, 3 do table.insert(t, 999) end
	emit("ins", n, t)

	t = fill(n)
	table.remove(t, 1)
	if n > 2 then table.remove(t, 2) end
	for i = 1, n do if rnd(3) == 0 then t[i] = nil end end
	emit("rem", n, t)

	t = fill(n)
	for i = 1, n do if rnd(2) == 0 then t[i] = nil end end
	for i = 1, n do if t[i] == nil and rnd(2) == 0 then t[i] = 7 end end
	emit("refill", n, t)

	t = {}
	for i = n, 1, -1 do t[i] = i end
	emit("rev", n, t)

	t = {}
	for i = n, 1, -1 do t[i] = i end
	for i = 2, n, 2 do t[i] = nil end
	emit("revnil2", n, t)

	t = fill(n)
	t[n + 5] = 1
	t[2 * n + 3] = 1
	emit("beyond", n, t)

	t = fill(n)
	for i = 1, n - 1 do t[i] = nil end
	emit("lastonly", n, t)

	t = {}
	for i = 1, n do if rnd(3) ~= 0 then t[i] = i end end
	emit("sparse", n, t)
end
print("DONE")
