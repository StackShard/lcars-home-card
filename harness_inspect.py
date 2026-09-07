#!/usr/bin/env python3
"""Inspect local harness page state via the live CDP websocket (bypasses guard)."""
import asyncio, json, sys, urllib.request

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
        expr = """(() => {
          const panel = document.querySelector('lcars-home-panel');
          const root = panel?.shadowRoot;
          const txt = (el) => el ? el.textContent.trim().slice(0,80) : null;
          return JSON.stringify({
            url: location.href,
            panel: !!panel,
            version: root?.querySelector('.shell')?.dataset?.version || null,
            loading: txt(root?.querySelector('.loading')),
            rail: root?.querySelector('.rail')?.textContent.replace(/\\s+/g,' ').trim().slice(0,150) || null,
            tabs: [...(root?.querySelectorAll('.tab span')||[])].map(e=>e.textContent.trim()),
            wordText: txt(root?.querySelector('.feed-panel.word')),
            cameraCount: root?.querySelectorAll('ha-camera-stream').length || 0,
            forecastItems: root?.querySelectorAll('.forecast-item').length || 0,
            cardCount: root?.querySelectorAll('.panel').length || 0,
            shellHeight: root?.querySelector('.shell')?.getBoundingClientRect().height || 0,
          });
        })()"""
        r = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        print(r.get("result", {}).get("value", r), flush=True)

asyncio.run(main())
