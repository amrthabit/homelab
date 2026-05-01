"""State persistence — read/write /var/lib/homelab/state.json."""
import json
from .. import config
from ..models import State


def load() -> State:
    config.STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not config.STATE_FILE.exists():
        save(State(**config.DEFAULT_STATE))
    raw = json.loads(config.STATE_FILE.read_text())
    # Backfill any missing keys from defaults
    merged = {**config.DEFAULT_STATE, **raw}
    return State(**merged)


def save(state: State) -> None:
    config.STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    config.STATE_FILE.write_text(state.model_dump_json(indent=2))
