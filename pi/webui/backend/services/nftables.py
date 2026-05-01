"""Render and apply the nftables ruleset."""
import subprocess
from jinja2 import Environment, FileSystemLoader
from .. import config
from ..models import State


def render(state: State) -> str:
    env = Environment(
        loader=FileSystemLoader(config.NFTABLES_TEMPLATE.parent),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env.get_template(config.NFTABLES_TEMPLATE.name).render(state=state.model_dump())


def apply(state: State) -> tuple[bool, str]:
    rendered = render(state)
    config.NFTABLES_CONF.write_text(rendered)
    result = subprocess.run(
        ["nft", "-f", str(config.NFTABLES_CONF)], capture_output=True, text=True
    )
    if result.returncode != 0:
        return False, result.stderr
    return True, "applied"
