from __future__ import annotations

from .sim_init import SimInit
from .sim_economy import SimEconomy
from .sim_masks import SimMasks
from .sim_orders import SimOrders
from .sim_minors import SimMinors
from .sim_minorai import SimMinorAi
from .sim_minorops import SimMinorOps
from .sim_research import SimResearch
from .sim_civics import SimCivics
from .sim_policy import SimPolicy
from .sim_cityvalue import SimCityValue
from .sim_seats import SimSeats
from .sim_deals import SimDeals
from .sim_spy import SimSpy
from .sim_gp import SimGp
from .sim_governors import SimGovernors
from .sim_phase import SimPhase
from .sim_griev import SimGriev
from .sim_step import SimStep
from .sim_barb import SimBarb
from .sim_tactics import SimTactics
from .sim_barbops import SimBarbOps


class BatchSim(SimInit, SimEconomy, SimMasks, SimOrders, SimMinors, SimMinorAi, SimMinorOps, SimResearch, SimCivics, SimPolicy, SimCityValue, SimSeats, SimSpy, SimDeals, SimGp, SimGovernors, SimGriev, SimPhase, SimStep, SimBarb, SimBarbOps, SimTactics):
    """One batched simulation over B games — see the mixins for each region."""
