"""Does the guard actually fire? A ban that does not fire is worse than none."""
import json
import subprocess
import sys

HD = "<" + "<"
CASES = [
    ("heredoc quoted",   "python - " + HD + "'PY'\nprint(1)\nPY", 2),
    ("heredoc bare",     "cat " + HD + "EOF\nx\nEOF", 2),
    ("heredoc dash",     "cat " + HD + "-EOF\nx\nEOF", 2),
    ("git commit -F -",  "git commit -F - " + HD + "'EOF'\nmsg\nEOF", 2),
    ("sleep",            "sleep 30", 2),
    ("Start-Sleep",      "Start-Sleep -Seconds 5", 2),
    ("here-STRING ok",   "grep x " + HD + "<" + "'text'", 0),
    ("shift ok",         "python -c 'print(1 " + HD + " 3)'", 0),
    ("plain ok",         "python tools/audit_totals_check.py", 0),
]
bad = 0
for name, cmd, want in CASES:
    p = subprocess.run([sys.executable, "-X", "utf8", ".claude/hooks/no_heredoc.py"],
                       input=json.dumps({"tool_input": {"command": cmd}}),
                       capture_output=True, text=True)
    got = p.returncode
    mark = "OK " if got == want else "BAD"
    if got != want:
        bad += 1
    print(f"  {mark} {name:16} want {want} got {got}")
print("HOOK GUARD", "OK" if not bad else f"FAILED ({bad})")
sys.exit(1 if bad else 0)
