"""Does the owner-switch guard fire, and only where it should?"""
import json
import subprocess
import sys

CASES = [
    ("Write mode",          {"tool_name": "Write", "tool_input": {"file_path": "C:\\civ6-development-calculator\\.claude\\mode"}}, 2),
    ("Edit mode /",         {"tool_name": "Edit", "tool_input": {"file_path": "C:/civ6-development-calculator/.claude/mode"}}, 2),
    ("mode.py set",         {"tool_name": "Bash", "tool_input": {"command": "python tools/mode.py measure"}}, 2),
    ("echo > mode",         {"tool_name": "Bash", "tool_input": {"command": "echo normal > .claude/mode"}}, 2),
    ("Set-Content mode",    {"tool_name": "PowerShell", "tool_input": {"command": "Set-Content .claude\\mode build"}}, 2),
    ("mode.py read ok",     {"tool_name": "Bash", "tool_input": {"command": "python tools/mode.py"}}, 0),
    ("cat mode ok",         {"tool_name": "Bash", "tool_input": {"command": "cat .claude/mode"}}, 0),
    ("cat 2>/dev/null ok",  {"tool_name": "Bash", "tool_input": {"command": "cat .claude/mode 2>/dev/null"}}, 0),
    ("Get-Content ok",      {"tool_name": "PowerShell", "tool_input": {"command": "Get-Content .claude\\mode"}}, 0),
    ("write naming mode", {"tool_name": "PowerShell", "tool_input": {"command": "Add-Content .gitignore '.claude/mode'"}}, 2),
    ("printf >> mode",      {"tool_name": "Bash", "tool_input": {"command": "printf x >> .claude/mode"}}, 2),
    ("Write mode.py ok",    {"tool_name": "Write", "tool_input": {"file_path": "C:/civ6-development-calculator/tools/mode.py"}}, 0),
    ("battery ok",          {"tool_name": "Bash", "tool_input": {"command": "python gpu/battery.py"}}, 0),
]
bad = 0
for name, payload, want in CASES:
    p = subprocess.run([sys.executable, "-X", "utf8", ".claude/hooks/owner_files.py"],
                       input=json.dumps(payload), capture_output=True, text=True)
    got = p.returncode
    if got != want:
        bad += 1
    print(f"  {'OK ' if got == want else 'BAD'} {name:18} want {want} got {got}")
print("OWNER GUARD", "OK" if not bad else f"FAILED ({bad})")
sys.exit(1 if bad else 0)
