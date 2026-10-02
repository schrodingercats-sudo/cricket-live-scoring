/**
 * Robust WebSocket Client for Cricket Live Scoring
 * WebSocket-First Architecture with zero continuous REST polling.
 */
class CricketWebSocketClient {
  constructor(matchId, onStateUpdate, onStatusChange) {
    this.matchId = matchId;
    this.onStateUpdate = onStateUpdate;
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 5000;
    this.isExplicitlyClosed = false;
    this.hasConnectedOnce = false;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.seenEventIds = new Set();
    this.maxSeenEventIds = 200;
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    this.isExplicitlyClosed = false;

    // Prevent duplicate WebSocket connections
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clean up previous socket if in closing/closed state
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/matches/${this.matchId}`;

    if (this.onStatusChange) this.onStatusChange("connecting");

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`WebSocket connected to match ${this.matchId}`);
        const isReconnect = this.hasConnectedOnce;
        this.reconnectAttempts = 0;
        this.hasConnectedOnce = true;
        if (this.onStatusChange) this.onStatusChange("connected");

        // On reconnect, fetch latest match state once via REST to catch up seamlessly
        if (isReconnect) {
          this.fetchLatestRestState();
        }

        // Start keepalive heartbeat ping every 25 seconds
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send("ping");
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        if (!event.data || event.data === "pong" || event.data === "ping") {
          return;
        }

        try {
          const message = JSON.parse(event.data);
          if (!message) return;

          // Event deduplication check
          const eventId = message.event_id || message._nonce;
          if (eventId) {
            if (this.seenEventIds.has(eventId)) {
              return; // Duplicate event ignored
            }
            this.seenEventIds.add(eventId);
            if (this.seenEventIds.size > this.maxSeenEventIds) {
              const firstItem = this.seenEventIds.values().next().value;
              this.seenEventIds.delete(firstItem);
            }
          }

          const stateData = message.data || (message.runs !== undefined ? message : null);
          if (stateData && this.onStateUpdate) {
            this.onStateUpdate(stateData, message.type, message.banner || null, message);
          } else if (message.type && this.onStateUpdate) {
            this.onStateUpdate(message.data || {}, message.type, message.banner || null, message);
          }
        } catch (e) {
          // Non-JSON message, ignore safely
        }
      };

      this.ws.onclose = () => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        if (this.onStatusChange) this.onStatusChange("disconnected");
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };
    } catch (e) {
      console.error("Failed to initialize WebSocket:", e);
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    console.log(`Reconnecting WebSocket in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed && !this.isConnected()) {
        this.connect();
      }
    }, delay);
  }

  async fetchLatestRestState() {
    try {
      const res = await fetch(`/api/matches/${this.matchId}/live?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (this.onStateUpdate) {
          this.onStateUpdate(data, "STATE_SYNC", null, { type: "STATE_SYNC", data });
        }
      }
    } catch (e) {
      console.warn("Failed to fetch REST live state on sync:", e);
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

// Global toast helper
function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
