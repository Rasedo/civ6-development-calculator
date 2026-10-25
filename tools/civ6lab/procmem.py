"""A running Civ 6 instance's memory, read and written from outside
(ReadProcessMemory / WriteProcessMemory / VirtualProtectEx through ctypes):
the process of a host's instance, a module's base, typed reads.

    pm = ProcMem.of_host("127.0.0.4")
    base = pm.module("GameCore_XP2_FinalRelease.dll")
    turn = pm.i32(pm.u64(base + 0xb8aa68) + 0xc0)
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import struct

import game

_k32 = ctypes.WinDLL("kernel32", use_last_error=True)
_psapi = ctypes.WinDLL("psapi", use_last_error=True)

PROCESS_ALL = 0x0010 | 0x0020 | 0x0008 | 0x0400 | 0x1000  # VM_READ, VM_WRITE, VM_OPERATION, QUERY_INFORMATION, QUERY_LIMITED
PAGE_EXECUTE_READWRITE = 0x40

_k32.OpenProcess.restype = wt.HANDLE
_k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
_k32.ReadProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                   ctypes.POINTER(ctypes.c_size_t)]
_k32.WriteProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                    ctypes.POINTER(ctypes.c_size_t)]
_k32.VirtualProtectEx.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_size_t, wt.DWORD, ctypes.POINTER(wt.DWORD)]
_k32.CloseHandle.argtypes = [wt.HANDLE]
_psapi.EnumProcessModulesEx.argtypes = [wt.HANDLE, ctypes.POINTER(wt.HMODULE), wt.DWORD, ctypes.POINTER(wt.DWORD),
                                        wt.DWORD]
_psapi.GetModuleBaseNameW.argtypes = [wt.HANDLE, wt.HMODULE, wt.LPWSTR, wt.DWORD]


class _MBI(ctypes.Structure):
    _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p), ("AllocationProtect", wt.DWORD),
                ("PartitionId", wt.WORD), ("RegionSize", ctypes.c_size_t), ("State", wt.DWORD), ("Protect", wt.DWORD),
                ("Type", wt.DWORD)]


_k32.VirtualQueryEx.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.POINTER(_MBI), ctypes.c_size_t]
_k32.VirtualQueryEx.restype = ctypes.c_size_t


class MemError(OSError):
    pass


class ProcMem:
    def __init__(self, pid: int):
        self.pid = pid
        self.h = _k32.OpenProcess(PROCESS_ALL, False, pid)
        if not self.h:
            raise MemError(f"OpenProcess({pid}) failed: {ctypes.get_last_error()}")
        self._buf = ctypes.create_string_buffer(1 << 16)

    @classmethod
    def of_host(cls, host: str) -> "ProcMem":
        pids = game.instance_pids(host)
        if not pids:
            raise MemError(f"no instance carries -TunerIP {host}")
        return cls(pids[0])

    def close(self) -> None:
        if self.h:
            _k32.CloseHandle(self.h)
            self.h = None

    def module(self, name: str) -> int | None:
        """the base address of a loaded module by file name (case-insensitive)"""
        arr = (wt.HMODULE * 1024)()
        need = wt.DWORD()
        if not _psapi.EnumProcessModulesEx(self.h, arr, ctypes.sizeof(arr), ctypes.byref(need), 3):
            raise MemError(f"EnumProcessModulesEx failed: {ctypes.get_last_error()}")
        nm = ctypes.create_unicode_buffer(260)
        for i in range(min(1024, need.value // ctypes.sizeof(wt.HMODULE))):
            if arr[i] and _psapi.GetModuleBaseNameW(self.h, arr[i], nm, 260) and nm.value.lower() == name.lower():
                return int(arr[i])
        return None

    def read(self, addr: int, n: int) -> bytes:
        if n <= 0:
            return b""
        buf = self._buf if n <= len(self._buf) else ctypes.create_string_buffer(n)
        got = ctypes.c_size_t()
        if not _k32.ReadProcessMemory(self.h, ctypes.c_void_p(addr), buf, n, ctypes.byref(got)) or got.value != n:
            raise MemError(f"read {n} at {addr:#x} failed: {ctypes.get_last_error()}")
        return buf.raw[:n]

    def write(self, addr: int, data: bytes) -> None:
        got = ctypes.c_size_t()
        if not _k32.WriteProcessMemory(self.h, ctypes.c_void_p(addr), data, len(data), ctypes.byref(got)) \
                or got.value != len(data):
            raise MemError(f"write {len(data)} at {addr:#x} failed: {ctypes.get_last_error()}")

    def protect(self, addr: int, n: int, prot: int = PAGE_EXECUTE_READWRITE) -> int:
        old = wt.DWORD()
        if not _k32.VirtualProtectEx(self.h, ctypes.c_void_p(addr), n, prot, ctypes.byref(old)):
            raise MemError(f"VirtualProtectEx at {addr:#x} failed: {ctypes.get_last_error()}")
        return old.value

    def regions(self):
        """the committed, readable regions: (base, size)"""
        mbi = _MBI()
        addr = 0
        while addr < 0x7FFFFFFF0000:
            if not _k32.VirtualQueryEx(self.h, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)):
                break
            b, n = mbi.BaseAddress or 0, mbi.RegionSize
            if mbi.State == 0x1000 and not (mbi.Protect & 0x101) and mbi.Protect & 0xEE:
                yield b, n
            addr = b + n

    def u64(self, addr: int) -> int:
        return struct.unpack("<Q", self.read(addr, 8))[0]

    def i32(self, addr: int) -> int:
        return struct.unpack("<i", self.read(addr, 4))[0]

    def u32(self, addr: int) -> int:
        return struct.unpack("<I", self.read(addr, 4))[0]

    def u8(self, addr: int) -> int:
        return self.read(addr, 1)[0]

    def qwords(self, addr: int, n: int) -> list[int]:
        return list(struct.unpack(f"<{n}Q", self.read(addr, 8 * n)))

    def cstr(self, addr: int, limit: int = 256) -> str:
        """a NUL-terminated string, read a page at a time (one ending before
        an unmapped page reads)"""
        out = b""
        while len(out) < limit:
            n = min(limit - len(out), 0x1000 - ((addr + len(out)) & 0xFFF))
            b = self.read(addr + len(out), n)
            if b"\0" in b:
                return (out + b.split(b"\0", 1)[0]).decode("utf-8", "replace")
            out += b
        return out.decode("utf-8", "replace")
