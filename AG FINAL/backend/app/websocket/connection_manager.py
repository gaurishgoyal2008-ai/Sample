import asyncio
import json
import logging
from typing import List, Set
from fastapi import WebSocket

logger = logging.getLogger("ceova.websocket")

class ConnectionManager:
    """Manages active WebSockets for live video telemetry, events, and stats."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"[WebSocket] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"[WebSocket] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast_json(self, data: dict):
        if not self.active_connections:
            return

        dead_connections = set()
        msg_str = json.dumps(data)

        for connection in list(self.active_connections):
            try:
                await connection.send_text(msg_str)
            except Exception as e:
                logger.debug(f"[WebSocket] Error sending message: {e}")
                dead_connections.add(connection)

        for dead in dead_connections:
            self.active_connections.discard(dead)
