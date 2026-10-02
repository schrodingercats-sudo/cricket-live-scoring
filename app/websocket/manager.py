import json
import time
import uuid
import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger("cricket_app.websocket")

class ConnectionManager:
    def __init__(self):
        # Maps match_id -> list of active WebSocket connections
        self.active_rooms: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, match_id: int):
        await websocket.accept()
        if match_id not in self.active_rooms:
            self.active_rooms[match_id] = []
        self.active_rooms[match_id].append(websocket)
        logger.info(f"WebSocket connected to match {match_id}. Room count: {len(self.active_rooms[match_id])}")

    def disconnect(self, websocket: WebSocket, match_id: int):
        if match_id in self.active_rooms:
            if websocket in self.active_rooms[match_id]:
                try:
                    self.active_rooms[match_id].remove(websocket)
                except ValueError:
                    pass
            if len(self.active_rooms[match_id]) == 0:
                del self.active_rooms[match_id]
        logger.info(f"WebSocket disconnected from match {match_id}.")

    async def broadcast_to_match(self, match_id: int, message: dict):
        if match_id not in self.active_rooms:
            return

        # Ensure message contains unique event_id and timestamp for client deduplication
        if isinstance(message, dict):
            if "event_id" not in message:
                msg_type = message.get("type") or message.get("animation") or "event"
                message["event_id"] = f"{msg_type}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
            if "timestamp" not in message:
                message["timestamp"] = int(time.time() * 1000)

        payload = json.dumps(message)
        disconnected = []
        for ws in list(self.active_rooms.get(match_id, [])):
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending to WebSocket in match {match_id}: {e}")
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws, match_id)

ws_manager = ConnectionManager()

