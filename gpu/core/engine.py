from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — the public module surface
from .simbase import _MUTABLE  # noqa: F401
from .sim_init import SimInit
from .sim_economy import SimEconomy
from .sim_masks import SimMasks
from .sim_orders import SimOrders
from .sim_minors import SimMinors
from .sim_seats import SimSeats
from .sim_spy import SimSpy
from .sim_gp import SimGp
from .sim_phase import SimPhase
from .sim_step import SimStep


class BatchSim(SimInit, SimEconomy, SimMasks, SimOrders, SimMinors, SimSeats, SimSpy, SimGp, SimPhase, SimStep):
    """One batched simulation over B games — see the mixins for each region."""
