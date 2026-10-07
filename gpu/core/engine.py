from __future__ import annotations

from .sim_init import SimInit
from .sim_economy import SimEconomy
from .sim_masks import SimMasks
from .sim_orders import SimOrders
from .sim_minors import SimMinors
from .sim_seats import SimSeats
from .sim_deals import SimDeals
from .sim_spy import SimSpy
from .sim_gp import SimGp
from .sim_governors import SimGovernors
from .sim_phase import SimPhase
from .sim_griev import SimGriev
from .sim_step import SimStep
from .sim_barb import SimBarb


class BatchSim(SimInit, SimEconomy, SimMasks, SimOrders, SimMinors, SimSeats, SimSpy, SimDeals, SimGp, SimGovernors, SimGriev, SimPhase, SimStep, SimBarb):
    """One batched simulation over B games — see the mixins for each region."""
