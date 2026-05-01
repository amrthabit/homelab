"""One-shot probe: drive the Bell Gigahub admin UI with Playwright, capture
every /cgi/json-req call so we can see which xpaths the My Usage / Statistics /
System Logs pages hit. Run from /opt/homelab/pi/webui via the venv:

    sudo /opt/homelab/pi/webui/venv/bin/python -m backend.probe_gigahub <page>

Where <page> is one of: usage | logs | statistics
"""
import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright


ADMIN_URL = "http://192.168.2.1"
ADMIN_PASS = os.environ.get("GIGAHUB_ADMIN_PASS") or "ulinevase"


async def capture(page_label: str) -> None:
    captured: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        async def on_request(req):
            if "json-req" in req.url:
                body = req.post_data
                captured.append({"url": req.url, "body": body})

        page.on("request", on_request)

        print(f"[probe] open {ADMIN_URL}")
        await page.goto(ADMIN_URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        # Find password field — try common selectors
        for sel in ["input[type=password]", "#password", "input[name=password]"]:
            try:
                el = await page.wait_for_selector(sel, timeout=3000)
                if el:
                    await el.fill(ADMIN_PASS)
                    print(f"[probe] filled password via {sel}")
                    break
            except Exception:
                continue

        # Submit — try common buttons
        for sel in ["button[type=submit]", "input[type=submit]", "button:has-text('Login')",
                    "button:has-text('Sign in')", "#submit-login", ".btn-login"]:
            try:
                el = await page.query_selector(sel)
                if el:
                    await el.click()
                    print(f"[probe] clicked {sel}")
                    break
            except Exception:
                continue

        await page.wait_for_timeout(3000)
        captured.clear()  # discard login traffic
        print(f"[probe] post-login URL: {page.url}")

        # Bell admin uses ?c=<page>. Try common page names.
        targets = {
            "usage":      ["myusage", "usage", "internetusage", "datausage"],
            "logs":       ["systemlogs", "syslog", "logs", "log"],
            "statistics": ["statistics", "stats"],
        }
        for slug in targets[page_label]:
            await page.goto(f"{ADMIN_URL}/?c={slug}", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            url_now = page.url
            ok_count = len(captured)
            print(f"[probe] tried ?c={slug} -> {url_now} ({ok_count} reqs so far)")
            if ok_count > 0 and "/?c=dashboard" not in url_now:
                # Stayed on the target page (didn't redirect to dashboard) and got data
                break

        # Click any "View"/"Refresh"-type button to trigger lazy data loads
        for view in ["View", "Refresh", "View usage", "Show", "Submit"]:
            try:
                el = await page.query_selector(f"button:has-text('{view}'), input[value='{view}']")
                if el:
                    await el.click()
                    print(f"[probe] clicked '{view}'")
                    await page.wait_for_timeout(3000)
                    break
            except Exception:
                continue

        await page.wait_for_timeout(2000)
        print(f"\n[probe] {len(captured)} json-req calls captured\n" + "=" * 60)
        for i, c in enumerate(captured):
            try:
                body = json.loads(c["body"]) if c["body"] else {}
                actions = body.get("request", {}).get("actions", [])
                for a in actions:
                    print(f"--- req {i} action {a.get('id')} method={a.get('method')}")
                    if "xpath" in a:
                        print(f"    xpath={a['xpath']}")
                    if "options" in a:
                        print(f"    options={a['options']}")
                    if "parameters" in a:
                        print(f"    parameters={json.dumps(a['parameters'])[:200]}")
            except Exception:
                print(f"--- req {i} (raw): {c['body'][:300]}")

        await browser.close()


if __name__ == "__main__":
    label = sys.argv[1] if len(sys.argv) > 1 else "usage"
    asyncio.run(capture(label))
