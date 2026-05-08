#!/usr/bin/env python3
"""
WebSocket 推送演示：小 JSON（文本帧）或 MessagePack（二进制帧）。

依赖：pip install websockets msgpack

运行：
  python scripts/realtime_ws_demo.py           # 默认 JSON
  python scripts/realtime_ws_demo.py --msgpack # 二进制 MessagePack

前端联调：打开 web/realtime-ws-test.html（默认连接 ws://127.0.0.1:8765）。
生产请换为：鉴权、TLS(wss)、与业务队列对接，勿长期依赖本脚本。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any

try:
    import msgpack
except ImportError:
    msgpack = None  # type: ignore[assignment]

try:
    import websockets
except ImportError as e:
    raise SystemExit("请先安装: pip install websockets msgpack") from e


def _payload(ts_ms: int) -> dict[str, Any]:
    # 短字段名，减轻 JSON 体积；与前端约定即可
    return {
        "i": "demo-unit-1",
        "t": ts_ms,
        "lon": 116.4074 + (ts_ms % 5000) / 1e6,
        "lat": 39.9042 + (ts_ms % 7000) / 1e6,
        "k": 1,
    }


async def handler(ws: Any, use_msgpack: bool) -> None:
    remote = getattr(ws, "remote_address", None)
    print(f"client connected {remote} msgpack={use_msgpack}")
    try:
        async for _ in ws:
            pass
    except Exception:
        pass
    finally:
        print(f"client gone {remote}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--msgpack", action="store_true", help="发送二进制 MessagePack 帧（否则 UTF-8 JSON 文本）")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    use_mp = args.msgpack
    if use_mp and msgpack is None:
        raise SystemExit("MessagePack 模式需要: pip install msgpack")

    clients: set[Any] = set()

    async def register(ws: Any) -> None:
        clients.add(ws)
        try:
            await handler(ws, use_mp)
        finally:
            clients.discard(ws)

    async def broadcast() -> None:
        while True:
            await asyncio.sleep(1.0)
            if not clients:
                continue
            ts = int(time.time() * 1000)
            body = _payload(ts)
            if use_mp:
                raw: str | bytes = msgpack.packb(body)
            else:
                raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
            dead = []
            for c in clients:
                try:
                    await c.send(raw)
                except Exception:
                    dead.append(c)
            for c in dead:
                clients.discard(c)

    async with websockets.serve(register, args.host, args.port, ping_interval=20, ping_timeout=20):
        print(f"WebSocket 演示 ws://{args.host}:{args.port}  format={'msgpack' if use_mp else 'json'}")
        await broadcast()


if __name__ == "__main__":
    asyncio.run(main())
