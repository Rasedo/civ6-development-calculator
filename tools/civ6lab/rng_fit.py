"""Civ 6's random number generator, identified from tuner observations.

    state' = (1103515245 * state + 12345) mod 2^32     -- ANSI/glibc LCG
    r16    = range mod 65536                            -- the argument is
                                                        -- truncated to 16 bits
    if r16 == 0: return 0 AND DO NOT ADVANCE the state
    draw   = (top15(state') * r16) >> 15,  top15 = state' >> 17

Every number below came from Game.GetRandNum / Game.GetRandomSeed /
Game.SetRandomSeed over the tuner (runs/rng_20260921T090000Z.jsonl).
"""

M = 1 << 32
A, C = 1103515245, 12345


def u32(x):
    return x % M


def s32(x):
    x %= M
    return x - M if x >= (1 << 31) else x


def step(state):
    return u32(A * u32(state) + C)


def draw(state, rng):
    """Returns (value, newState) exactly as the game does."""
    r16 = rng % 65536
    if r16 == 0:
        return 0, u32(state)          # early return, state untouched
    s = step(state)
    return ((s >> 17) * r16) >> 15, s


fails = 0

print("== state recurrence (seed -> seed after one draw, range 1000000) ==")
for before, after in [(0, 12345), (1, 1103527590), (2, -2087924461), (3, -984409216),
                      (12345, -740551042), (65536, 1315778617),
                      (2147483647, 1043980748), (-1, -1103502900)]:
    got = s32(step(before))
    if got != after:
        fails += 1
        print(f"  MISS seed {before}: model {got} vs game {after}")
print(f"  {'all 8 match' if fails == 0 else 'MISMATCHES'}")

print("\n== the fold, every range measured from seed 12345 ==")
FOLD = [(2, 1), (6, 4), (100, 82), (1024, 847), (16384, 13559), (32767, 27117),
        (32768, 27118), (32769, 27118), (40000, 33103), (65535, 54235),
        (65536, 0), (65537, 0), (100000, 28521), (131072, 0), (262144, 0),
        (1000000, 14035), (16777216, 0), (2147483647, 54235)]
NO_ADVANCE = {65536, 131072, 262144, 16777216}
for rng, obs in FOLD:
    val, new = draw(12345, rng)
    advanced = new != u32(12345)
    want_advanced = rng not in NO_ADVANCE
    ok = val == obs and advanced == want_advanced
    if not ok:
        fails += 1
    print(f"  range {rng:>10}  game {obs:>6}  model {val:>6}  "
          f"advanced {advanced} (expected {want_advanced})  {'OK' if ok else 'MISS'}")

print("\n== the 24-draw stream from seed 12345 at range 32768 ==")
stream = [27118, 21378, 27442, 1749, 24847, 8022, 26254, 22445, 4205, 22514, 13526,
          19213, 4879, 10543, 12937, 16184, 29500, 23990, 8830, 26632, 20479, 11532,
          11735, 16048]
st = 12345
model = []
for _ in stream:
    v, st = draw(st, 32768)
    model.append(v)
if model == stream:
    print("  all 24 draws reproduced exactly")
else:
    fails += 1
    print(f"  MISMATCH\n   game  {stream}\n   model {model}")

print(f"\n== {'MODEL CONFIRMED on every observation' if fails == 0 else str(fails) + ' MISMATCHES'} ==")
