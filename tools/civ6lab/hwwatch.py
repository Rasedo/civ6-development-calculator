"""A DATA BREAKPOINT ON A RUNNING INSTANCE: who writes an address.

    python tools/civ6lab/hwwatch.py --host 127.0.0.2 --addr 0x138868064 --out runs/x.hw.jsonl [--len 4] [--hits 200]

Attaches to the instance as a debugger (DebugActiveProcess, the process
left running when the watcher detaches), sets debug register 0 on every
thread (and each new one) to break on a write of `--len` bytes at each of
`--addr` (debug registers 0..3), and on each hit writes one JSON line: the
writing instruction (the RVA of the game DLL past it: a data breakpoint
traps after the write), the address that fired and its bytes now, the game
turn, the thread, and the DLL return addresses
found on the stack's first 0x400 bytes (a crude call stack). It detaches
(the registers cleared) after `--hits` hits, `--seconds`, or the stop file
`<out>.stop`. Every other debug event is passed on untouched (an exception
as not handled), so the game runs as before, only slower.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import json
import pathlib
import struct
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import procmem  # noqa: E402

DLL = "GameCore_XP2_FinalRelease.dll"
_k32 = ctypes.WinDLL("kernel32", use_last_error=True)

DBG_CONTINUE, DBG_NOT_HANDLED = 0x00010002, 0x80010001
EXCEPTION_DEBUG_EVENT, CREATE_THREAD_DEBUG_EVENT, CREATE_PROCESS_DEBUG_EVENT = 1, 2, 3
EXIT_PROCESS_DEBUG_EVENT, LOAD_DLL_DEBUG_EVENT = 5, 6
EXCEPTION_SINGLE_STEP, EXCEPTION_BREAKPOINT = 0x80000004, 0x80000003
CONTEXT_DEBUG_REGISTERS, CONTEXT_CONTROL = 0x00100010, 0x00100001
THREAD_ALL = 0x0002 | 0x0008 | 0x0010 | 0x0040   # SUSPEND_RESUME, GET_CONTEXT, SET_CONTEXT, QUERY_INFORMATION
TH32CS_SNAPTHREAD = 0x4

# x64 CONTEXT offsets
C_FLAGS, C_DR0, C_DR6, C_DR7, C_RSP, C_RIP = 0x30, 0x48, 0x68, 0x70, 0x98, 0xF8
C_SIZE = 1232


class DEBUG_EVENT(ctypes.Structure):
    _fields_ = [("code", wt.DWORD), ("pid", wt.DWORD), ("tid", wt.DWORD), ("pad", wt.DWORD),
                ("u", ctypes.c_byte * 160)]


class THREADENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ThreadID", wt.DWORD),
                ("th32OwnerProcessID", wt.DWORD), ("tpBasePri", wt.LONG), ("tpDeltaPri", wt.LONG),
                ("dwFlags", wt.DWORD)]


_k32.WaitForDebugEvent.argtypes = [ctypes.POINTER(DEBUG_EVENT), wt.DWORD]
_k32.ContinueDebugEvent.argtypes = [wt.DWORD, wt.DWORD, wt.DWORD]
_k32.OpenProcess.restype = wt.HANDLE
_k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
_k32.OpenThread.restype = wt.HANDLE
_k32.OpenThread.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
_k32.GetThreadContext.argtypes = [wt.HANDLE, ctypes.c_void_p]
_k32.SetThreadContext.argtypes = [wt.HANDLE, ctypes.c_void_p]
_k32.CloseHandle.argtypes = [wt.HANDLE]
_k32.CreateToolhelp32Snapshot.restype = wt.HANDLE
_k32.Thread32First.argtypes = [wt.HANDLE, ctypes.POINTER(THREADENTRY32)]
_k32.Thread32Next.argtypes = [wt.HANDLE, ctypes.POINTER(THREADENTRY32)]


class Ctx:
    """an aligned x64 CONTEXT buffer"""

    def __init__(self):
        self.raw = ctypes.create_string_buffer(C_SIZE + 16)
        self.addr = (ctypes.addressof(self.raw) + 15) & ~15

    def put(self, off: int, fmt: str, v) -> None:
        ctypes.memmove(self.addr + off, struct.pack(fmt, v), struct.calcsize(fmt))

    def get(self, off: int, fmt: str):
        return struct.unpack(fmt, ctypes.string_at(self.addr + off, struct.calcsize(fmt)))[0]


def threads(pid: int) -> list[int]:
    snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
    te = THREADENTRY32()
    te.dwSize = ctypes.sizeof(te)
    out = []
    ok = _k32.Thread32First(snap, ctypes.byref(te))
    while ok:
        if te.th32OwnerProcessID == pid:
            out.append(te.th32ThreadID)
        ok = _k32.Thread32Next(snap, ctypes.byref(te))
    _k32.CloseHandle(snap)
    return out


def set_dr(tid: int, addrs: list[int], length: int, on: bool) -> bool:
    h = _k32.OpenThread(THREAD_ALL, False, tid)
    if not h:
        return False
    try:
        c = Ctx()
        c.put(C_FLAGS, "<I", CONTEXT_DEBUG_REGISTERS)
        if not _k32.GetThreadContext(h, ctypes.c_void_p(c.addr)):
            return False
        lenbits = {1: 0, 2: 1, 8: 2, 4: 3}[length]
        dr7 = c.get(C_DR7, "<Q") & ~0xFFFF00FF
        for i, ad in enumerate(addrs):
            if on:
                dr7 |= (1 << (2 * i)) | (1 << (16 + 4 * i)) | (lenbits << (18 + 4 * i))
            c.put(C_DR0 + 8 * i, "<Q", ad if on else 0)
        c.put(C_DR6, "<Q", 0)
        c.put(C_DR7, "<Q", dr7)
        return bool(_k32.SetThreadContext(h, ctypes.c_void_p(c.addr)))
    finally:
        _k32.CloseHandle(h)


def hit_context(tid: int) -> tuple[int, int, int]:
    """rip, rsp and DR6 (its low bits: which register fired), DR6 cleared"""
    h = _k32.OpenThread(THREAD_ALL, False, tid)
    try:
        c = Ctx()
        c.put(C_FLAGS, "<I", CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS)
        _k32.GetThreadContext(h, ctypes.c_void_p(c.addr))
        rip, rsp, dr6 = c.get(C_RIP, "<Q"), c.get(C_RSP, "<Q"), c.get(C_DR6, "<Q")
        c.put(C_FLAGS, "<I", CONTEXT_DEBUG_REGISTERS)
        c.put(C_DR6, "<Q", 0)
        _k32.SetThreadContext(h, ctypes.c_void_p(c.addr))
        return rip, rsp, dr6
    finally:
        _k32.CloseHandle(h)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--addr", required=True, help="at most four addresses, comma-separated")
    p.add_argument("--len", type=int, default=4, help="1, 2, 4 or 8 bytes, each address aligned to it")
    p.add_argument("--hits", type=int, default=200)
    p.add_argument("--seconds", type=float, default=600.0)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    addrs = [int(x, 16) for x in a.addr.split(",")][:4]
    pm = procmem.ProcMem.of_host(a.host)
    base = pm.module(DLL)
    size = 0x1000000
    stop = pathlib.Path(a.out + ".stop")
    stop.unlink(missing_ok=True)
    if not _k32.DebugActiveProcess(pm.pid):
        print("DebugActiveProcess failed", ctypes.get_last_error())
        return 1
    _k32.DebugSetProcessKillOnExit(False)
    hproc = _k32.OpenProcess(0x1FFFFF, False, pm.pid)
    out = open(a.out, "w", encoding="utf-8", newline="\n")
    ev = DEBUG_EVENT()
    armed, hits, t0, detaching = False, 0, time.monotonic(), False
    try:
        while True:
            if not _k32.WaitForDebugEvent(ctypes.byref(ev), 200):
                if not detaching and (hits >= a.hits or stop.exists() or time.monotonic() - t0 > a.seconds):
                    detaching = True
                    _k32.DebugBreakProcess(ctypes.c_void_p(hproc))
                continue
            status = DBG_CONTINUE
            if ev.code == CREATE_THREAD_DEBUG_EVENT and armed:
                set_dr(ev.tid, addrs, a.len, True)
            elif ev.code == EXIT_PROCESS_DEBUG_EVENT:
                print("the process exited")
                return 1
            elif ev.code == EXCEPTION_DEBUG_EVENT:
                code = struct.unpack_from("<I", bytes(ev.u), 0)[0]
                if code == EXCEPTION_BREAKPOINT and not armed:
                    n = sum(set_dr(t, addrs, a.len, True) for t in threads(pm.pid))
                    armed = True
                    print(f"armed on {n} threads at " + ",".join(hex(x) for x in addrs), flush=True)
                elif code == EXCEPTION_BREAKPOINT and detaching:
                    for t in threads(pm.pid):
                        set_dr(t, addrs, a.len, False)
                    _k32.ContinueDebugEvent(ev.pid, ev.tid, DBG_CONTINUE)
                    break
                elif code == EXCEPTION_SINGLE_STEP and armed:
                    rip, rsp, dr6 = hit_context(ev.tid)
                    which = [i for i in range(len(addrs)) if dr6 & (1 << i)]
                    stack = pm.read(rsp, 0x400)
                    rets = [hex(q - base) for q in struct.unpack("<128Q", stack) if base <= q < base + size][:16]
                    hits += 1
                    out.write(json.dumps({"rip": hex(rip - base) if base <= rip < base + size else hex(rip),
                                          "which": [hex(addrs[i]) for i in which],
                                          "bytes": [pm.read(addrs[i], a.len).hex() for i in which],
                                          "turn": pm.i32(pm.u64(base + 0xB8AA68) + 0xC0),
                                          "tid": ev.tid, "stack": rets}) + "\n")
                    out.flush()
                elif code != EXCEPTION_BREAKPOINT:
                    status = DBG_NOT_HANDLED
            _k32.ContinueDebugEvent(ev.pid, ev.tid, status)
    finally:
        _k32.DebugActiveProcessStop(pm.pid)
        out.close()
    print(f"{hits} hits -> {a.out}; detached")
    return 0


if __name__ == "__main__":
    sys.exit(main())
