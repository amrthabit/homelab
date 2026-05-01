"""Build a full Snapshot for the API + SSE stream."""
from ..models import Snapshot
from . import state, system, devices


def build() -> Snapshot:
    return Snapshot(
        state=state.load(),
        stats=system.stats(),
        vlans=devices.vlans(),
        interfaces=system.interfaces(),
        routes=system.routes(),
        firewall=system.firewall(),
    )
