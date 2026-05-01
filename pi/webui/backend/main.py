"""FastAPI entry point — serves the JSON API + the built Solid SPA."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .routers import api as api_router
from .services import gigahub


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(api_router.periodic_broadcast()),
        asyncio.create_task(gigahub.periodic()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()


app = FastAPI(title="homelab", lifespan=lifespan)
app.include_router(api_router.router)

# Serve built SPA assets
if config.DIST_DIR.exists():
    # /assets/* etc. are mounted directly
    for sub in config.DIST_DIR.iterdir():
        if sub.is_dir():
            app.mount(f"/{sub.name}", StaticFiles(directory=sub), name=sub.name)


@app.get("/", response_class=HTMLResponse)
async def spa_root():
    index = config.DIST_DIR / "index.html"
    if not index.exists():
        return HTMLResponse(
            "<pre>Frontend not built. Run pi/webui/deploy.sh on the Pi.</pre>",
            status_code=503,
        )
    return FileResponse(index)


@app.get("/{path:path}")
async def spa_fallback(path: str):
    target = config.DIST_DIR / path
    if target.is_file():
        return FileResponse(target)
    index = config.DIST_DIR / "index.html"
    return FileResponse(index)
