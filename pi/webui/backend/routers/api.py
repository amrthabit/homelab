"""API routes — snapshot, history, toggles, and SSE stream."""
import asyncio
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from ..models import Snapshot, ToggleResult, HistoryPoint
from ..services import snapshot, state as state_svc, nftables, uptime
from .. import config

router = APIRouter(prefix="/api")

# Pub/sub for live snapshot updates
_subscribers: list[asyncio.Queue] = []


async def broadcast_snapshot() -> None:
    """Push a fresh snapshot to all SSE subscribers."""
    if not _subscribers:
        return
    snap = snapshot.build()
    payload = snap.model_dump_json()
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


async def periodic_broadcast() -> None:
    """Background task — push snapshot every SNAPSHOT_INTERVAL_SEC."""
    while True:
        await asyncio.sleep(config.SNAPSHOT_INTERVAL_SEC)
        await broadcast_snapshot()


@router.get("/snapshot", response_model=Snapshot)
def get_snapshot() -> Snapshot:
    return snapshot.build()


@router.get("/history/{mac:path}", response_model=list[HistoryPoint])
def get_history(mac: str) -> list[HistoryPoint]:
    return uptime.history(mac)


def _apply_and_respond(state) -> ToggleResult:
    state_svc.save(state)
    ok, msg = nftables.apply(state)
    if not ok:
        raise HTTPException(status_code=500, detail=msg)
    asyncio.get_event_loop().create_task(broadcast_snapshot())
    return ToggleResult(ok=ok, msg=msg, state=state)


@router.post("/toggle/{key}", response_model=ToggleResult)
def post_toggle(key: str) -> ToggleResult:
    state = state_svc.load()
    if not hasattr(state, key) or not isinstance(getattr(state, key), bool):
        raise HTTPException(status_code=400, detail=f"unknown bool key: {key}")
    setattr(state, key, not getattr(state, key))
    return _apply_and_respond(state)


@router.post("/iot_wan/{mac:path}", response_model=ToggleResult)
def post_iot_wan(mac: str) -> ToggleResult:
    state = state_svc.load()
    macs = set(state.iot_wan_macs)
    mac = mac.lower()
    macs.discard(mac) if mac in macs else macs.add(mac)
    state.iot_wan_macs = sorted(macs)
    return _apply_and_respond(state)


@router.post("/trusted_wan/{mac:path}", response_model=ToggleResult)
def post_trusted_wan(mac: str) -> ToggleResult:
    state = state_svc.load()
    blocked = set(state.trusted_wan_blocked_macs)
    mac = mac.lower()
    blocked.discard(mac) if mac in blocked else blocked.add(mac)
    state.trusted_wan_blocked_macs = sorted(blocked)
    return _apply_and_respond(state)


@router.get("/stream")
async def stream():
    """Server-Sent Events — pushes the full Snapshot on every tick or change."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=4)
    _subscribers.append(queue)

    # Send initial snapshot immediately
    queue.put_nowait(snapshot.build().model_dump_json())

    async def gen():
        try:
            while True:
                payload = await queue.get()
                yield {"event": "snapshot", "data": payload}
        finally:
            if queue in _subscribers:
                _subscribers.remove(queue)

    return EventSourceResponse(gen())
