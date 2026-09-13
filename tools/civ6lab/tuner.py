"""A FireTuner client: the game's own debug socket, driven from Python.

Civilization VI opens TCP 4318 when `EnableTuner 1` is set in AppOptions.txt.
Firaxis' FireTuner GUI speaks this protocol; so can we, and then a Lua
snippet runs INSIDE the running game, in whichever Lua state we name, and
every `print()` it makes comes back over the socket. That is the whole lab:
the game is the oracle, this file is the wire.

Wire format, after civ6-mcp (MIT, Liam Wilkinson, 2026 — the protocol was
recovered there, the code here is a synchronous rewrite):

    [u32 LE length][i32 LE tag][payload bytes][NUL]

    tag 4  handshake   "APP:" -> game identity; "LSQ:" -> the Lua states,
                       NUL-separated as alternating index, name
    tag 3  command     "CMD:<state index>:<lua source>"

Replies to a command arrive as one message per print(): "O" NUL "<state>: "
followed by the text; a Lua error comes back as "ERR:...". Nothing marks the
END of a command's output, so `run` appends its own sentinel print and reads
until it sees it.

The states worth knowing (names as the game lists them):

    GameCore_Tuner          authoritative game state: Players[], Map, Game,
                            GameClimate, AutoplayManager; the Player/Storms/
                            Autoplay tuner panels live here
    TunerGameRandomEvents   GameRandomEvents.ApplyEvent — triggers a disaster
                            at a plot (the "Random Events" panel's state)
    InGame                  the UI's state: UI.*, UnitManager.*, notifications
    TunerUnitPanel / TunerCityPanel / TunerMapPanel   the other debug panels

Only ONE tuner client may be attached at a time: close FireTuner.exe first.
"""
from __future__ import annotations

import socket
import struct
import time

HEADER = struct.Struct("<Ii")
TAG_HELP, TAG_COMMAND, TAG_HANDSHAKE = 1, 3, 4
SENTINEL = "---CIV6LAB-END---"
DEFAULT_PORT = 4318


class TunerError(RuntimeError):
    """A Lua error inside the game, or a protocol failure."""


class Tuner:
    def __init__(self, host: str = "127.0.0.1", port: int = DEFAULT_PORT,
                 timeout: float = 5.0):
        self.host, self.port, self.timeout = host, port, timeout
        self.sock: socket.socket | None = None
        self.app = ""
        self.states: dict[str, int] = {}

    # -- transport ---------------------------------------------------------
    def connect(self) -> "Tuner":
        try:
            self.sock = socket.create_connection((self.host, self.port), self.timeout)
        except OSError as e:
            raise TunerError(
                f"no tuner at {self.host}:{self.port} — is Civ 6 running with "
                "EnableTuner 1, and is FireTuner.exe closed?") from e
        self._drain(0.3)
        self._send(TAG_HANDSHAKE, "APP:")
        m = self._recv(self.timeout)
        self.app = m[1] if m else "<no APP reply>"
        self._send(TAG_HANDSHAKE, "LSQ:")
        m = self._recv(self.timeout)
        self.states = _parse_states(m[1] if m else "")
        return self

    def close(self) -> None:
        if self.sock:
            self.sock.close()
            self.sock = None

    def refresh_states(self) -> dict[str, int]:
        """The state list changes when a game loads: re-ask."""
        self._drain(0.1)
        self._send(TAG_HANDSHAKE, "LSQ:")
        m = self._recv(self.timeout)
        self.states = _parse_states(m[1] if m else "")
        return self.states

    def _send(self, tag: int, payload: str) -> None:
        assert self.sock is not None
        data = payload.encode("utf-8") + b"\x00"
        self.sock.sendall(HEADER.pack(len(data), tag) + data)

    def _recv(self, timeout: float) -> tuple[int, str] | None:
        assert self.sock is not None
        self.sock.settimeout(timeout)
        try:
            head = self._exactly(HEADER.size)
            length, tag = HEADER.unpack(head)
            body = self._exactly(length)
        except socket.timeout:
            return None
        return tag, body.rstrip(b"\x00").decode("utf-8", errors="replace")

    def _exactly(self, n: int) -> bytes:
        assert self.sock is not None
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise TunerError("the game closed the tuner socket")
            buf += chunk
        return buf

    def _drain(self, quiet: float) -> list[str]:
        out = []
        while True:
            m = self._recv(quiet)
            if m is None:
                return out
            out.append(m[1])

    # -- the one verb --------------------------------------------------------
    def run(self, state: str, lua: str, timeout: float = 15.0) -> list[str]:
        """Run `lua` in the named state; return what it printed, in order.

        The sentinel is printed by a trailing statement of OUR OWN, so a
        snippet that errors mid-way raises TunerError with the game's message
        instead of returning a partial list as if it were whole.
        """
        if state not in self.states:
            self.refresh_states()
        if state not in self.states:
            raise TunerError(
                f"no Lua state {state!r}; the game lists {sorted(self.states)} "
                "(GameCore_Tuner and InGame appear only once a game is loaded)")
        idx = self.states[state]
        self._drain(0.05)
        self._send(TAG_COMMAND, f'CMD:{idx}:{lua}\nprint("{SENTINEL}")')
        lines: list[str] = []
        deadline = time.monotonic() + timeout
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                raise TunerError(
                    f"no sentinel from {state} within {timeout}s; got {lines[-3:]}")
            m = self._recv(min(left, 2.0))
            if m is None:
                continue
            tag, payload = m
            if payload.startswith("ERR:"):
                raise TunerError(f"{state}: {payload}")
            text = _output_text(payload)
            if text is None:
                continue
            if text.strip() == SENTINEL:
                return lines
            lines.append(text)


def _parse_states(raw: str) -> dict[str, int]:
    parts = [p.strip() for p in raw.split("\x00") if p.strip()]
    if len(parts) <= 1 and "\n" in raw:
        parts = [p.strip() for p in raw.split("\n") if p.strip()]
    states: dict[str, int] = {}
    i = 0
    while i + 1 < len(parts):
        try:
            idx = int(parts[i])
        except ValueError:
            i += 1
            continue
        states.setdefault(parts[i + 1], idx)
        i += 2
    return states


def _output_text(payload: str) -> str | None:
    """'O' NUL '<state>: text' -> text; anything else is not print output."""
    if not payload.startswith("O"):
        return None
    sep = payload.find(": ", 2)
    return payload[sep + 2:] if sep >= 0 else payload[1:].lstrip("\x00").strip()
