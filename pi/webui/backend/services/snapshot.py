"""Build a full Snapshot for the API + SSE stream."""
from ..models import Snapshot, GigahubInfo
from . import state, system, devices, gigahub


def build() -> Snapshot:
    gh = gigahub.cached()
    return Snapshot(
        state=state.load(),
        stats=system.stats(),
        vlans=devices.vlans(),
        gigahub=GigahubInfo(**gh),
        interfaces=system.interfaces(),
        routes=system.routes(),
        firewall=system.firewall(),
    )
