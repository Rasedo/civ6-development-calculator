"""What holds seat 0's turn on --host, answered once each (lab.diagnose /
lab.handle), then the InGame and GameCore turns.

    python tools/civ6lab/c60f_diag.py --host 127.0.0.4
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import lab  # noqa: E402
import h4  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--host", default="127.0.0.4")
p.add_argument("--answer", action="store_true")
a = p.parse_args()
h4.guard(120, "diag")
t = h4.connect(a.host)
causes = lab.diagnose(t, 0)
print("causes", causes)
if a.answer:
    for c in causes:
        print("answer", c, lab.handle(t, 0, c))
print("GC turn", lab.turn(t), "IG", t.run(lab.IG, "print(Game.GetCurrentGameTurn())"))
t.close()
