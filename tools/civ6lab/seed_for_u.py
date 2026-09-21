"""Find seeds whose FIRST draw lands near a wanted u, to bracket a threshold."""
import sys

M = 1 << 32
A = 1103515245


def u_of(seed):
    return ((((A * (seed % M) + 12345) % M) >> 17)) / 32768


wants = [float(x) for x in sys.argv[1:]] or [0.05, 0.25, 0.42, 0.46, 0.49, 0.51, 0.55, 0.75, 0.95]
best = {w: (None, 9) for w in wants}
for seed in range(1, 300000):
    u = u_of(seed)
    for w in wants:
        if abs(u - w) < best[w][1]:
            best[w] = (seed, abs(u - w))
print(" ".join(str(best[w][0]) for w in wants))
for w in wants:
    print(f"  u~{w}: seed {best[w][0]}  actual u={u_of(best[w][0]):.5f}")
