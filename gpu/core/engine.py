"""THE BATCHED SIM — BatchSim, assembled from its region mixins.

The module floor (Rules, load_rules/load_fixture, FIXTURES, UNIT_SLOTS, the
_MUTABLE plane registry, hex/pool helpers) lives in `simbase.py`; the class
body is divided by region across the `sim_*.py` mixins. This module
re-exports the whole public surface, so `from core.engine import ...` reaches
every name — but module-global PATCHING (e.g. a probe setting MAJOR_POOL_MAX)
must target `core.simbase`, where the globals actually live.
"""
from __future__ import annotations

from .simbase import *  # noqa: F401,F403 — the public module surface
from .simbase import _MUTABLE  # noqa: F401
from .sim_init import SimInit
from .sim_economy import SimEconomy
from .sim_masks import SimMasks
from .sim_orders import SimOrders
from .sim_minors import SimMinors
from .sim_seats import SimSeats
from .sim_phase import SimPhase
from .sim_step import SimStep


class BatchSim(SimInit, SimEconomy, SimMasks, SimOrders, SimMinors, SimSeats, SimPhase, SimStep):
    """One batched simulation over B games — see the mixins for each region."""
