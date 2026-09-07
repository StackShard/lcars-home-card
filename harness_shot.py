#!/usr/bin/env python3
"""Render local harness at 768x1024 DPR2 and screenshot it for visual iteration."""
import asyncio, base64, json, sys, urllib.request
from pathlib import Path

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/harness_shot.png")
URL = "http://127.0.0.1:8124/harness.html"

async def main():
    import websockets
    targets = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json"))
    page = [t for t in targets if t["type"] == "page"][0]
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=64*1024*1024) as ws:
        rid = 0
        async def call(method, params=None):
            nonlocal rid
            rid += 1
            await ws.send(json.dumps({"id": rid, "method": method, "params": params or {}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == rid:
                    return m.get("result", {})
        async def ev(expr):
            r = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            return r.get("result", {}).get("value")

        await call("Emulation.setDeviceMetricsOverride", {"width": 768, "height": 1024, "deviceScaleFactor": 2, "mobile": False})
        await call("Page.navigate", {"url": URL})
        ready = False
        for _ in range(40):
            await asyncio.sleep(0.5)
            if await ev("!!document.querySelector('lcars-home-panel')?.shadowRoot?.querySelector('.forecast-item')"):
                ready = True
                break
        print("harness_ready:", ready, flush=True)
        await asyncio.sleep(2)
        shot = await call("Page.captureScreenshot", {"format": "png"})
        OUT.write_bytes(base64.b64decode(shot["data"]))
        print("saved", OUT, flush=True)

asyncio.run(main())
