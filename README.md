# 🏏 Hostel Cricket Tournament Management & Real-Time Live Scoring System

A fast, responsive, and easy-to-use tournament manager and ball-by-ball live scoring platform built for hostel cricket tournaments, local leagues, and university cups.

Built with **Python + FastAPI**, **SQLite** (`data/cricket.db` with SQLAlchemy ORM and WAL mode), **WebSockets** for zero-delay real-time score broadcasts, **ReportLab** for 100% offline PDF scorecard export, and **Vanilla CSS/JavaScript** (no heavy frontend framework required).

---

## 🌟 Key Features

1. **Tournament Management**:
   - Create tournaments (e.g., *Hostel Cricket Cup 2026*).
   - Add teams (e.g. *Team A*, *Team B*, *Team C*, *Team D*) and player lists (name only).
   - Schedule matches between teams with custom overs quota.

2. **Tactile Live Scorer Screen**:
   - Big buttons for quick phone/laptop scoring: `0`, `1`, `2`, `3`, `4`, `6`, `W`.
   - Extras support: `Wide`, `No Ball`, `Bye`, `Leg Bye` (with extra runs).
   - **Undo Last Ball**: Instant rollback and state recalculation.
   - Wicket modal with dismissal types: Bowled, Caught, LBW, Run Out, Stumped, Other, and replacement batter selection.
   - Strike rotation, over completion (6 legal balls), and automated innings handover.

3. **Real-Time WebSocket Engine**:
   - Channel per match: `/ws/matches/{match_id}`.
   - Instant ball-by-ball updates to all connected devices without page refreshes or polling.
   - Auto-reconnect with fallback REST synchronization.

4. **Live Scoreboard Page (`/match/{match_id}/live`)**:
   - Clean TV/Mobile hero score: Runs/Wickets, Overs, CRR, RRR, Target & Required Runs.
   - Active Striker (`★`) and Non-striker with live stats (R, B, 4s, 6s, SR).
   - Active Bowler figures (O, M, R, W, Econ).
   - Ball chips timeline for current over and recent 12 deliveries.

5. **Full Scorecard (`/match/{match_id}/scorecard`)**:
   - Detailed batting table (Runs, Balls, 4s, 6s, SR, Dismissals).
   - Bowling figures (Overs, Maidens, Runs, Wickets, Economy).
   - Fall of Wickets (FoW) and Extras breakdown.
   - **Offline ReportLab PDF Scorecard**: Generates professional printable A4 PDF scorecards with 0 external dependencies.

6. **Tournament Standings & NRR**:
   - Automatically updated Points Table: Played, Won, Lost, Tied, No Result, Points, and Net Run Rate (NRR).
   - Leaderboards: Top Run Scorers (*Orange Cap*) & Top Wicket Takers (*Purple Cap*).

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11+, FastAPI, Uvicorn
- **Database**: SQLite (SQLAlchemy ORM, WAL mode, stored in `data/cricket.db`)
- **PDF Engine**: ReportLab (100% offline generation)
- **Real-Time**: WebSockets (`/ws/matches/{match_id}`)
- **Frontend**: HTML5, Modern Dark Theme Vanilla CSS, Vanilla JavaScript (ES6)

---

## 🚀 Windows Installation & Setup Guide

### Step 1: Open Directory
Open PowerShell or Command Prompt in the project directory:
```powershell
cd "d:\cricket scoring app"
```

### Step 2: Install Python Dependencies
```powershell
python -m pip install -r requirements.txt
```

### Step 3: Run the Server
```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open your browser at:
👉 **`http://localhost:8000`**

---

## 📱 Local Wi-Fi Multi-Device Access (Scorer Laptop + Viewer Phones)

Because Uvicorn listens on `0.0.0.0:8000`, any device on the same hostel Wi-Fi network can access the app!

1. Find the Scorer Laptop's local IP address (e.g. `192.168.1.10`):
   - On Windows: run `ipconfig` in Command Prompt. Look for **IPv4 Address**.
2. **Scorer Device (Laptop)**:
   - Opens: `http://localhost:8000/match/1/scorer`
3. **Viewer Devices (Phones, Laptops, Hostel TV)**:
   - Open: `http://192.168.1.10:8000/match/1/live`
   - Real-time live scores will update instantaneously across all screens when the scorer enters a ball!

---

## 🧪 Running Automated Tests

Run the test suite with:
```powershell
python -m pytest
```

---

## 📁 Project Structure

```
cricket-app/
│
├── app/
│   ├── config.py                 # App configuration & .env loader
│   ├── database.py               # SQLAlchemy database engine & Session
│   ├── main.py                   # FastAPI server & route definitions
│   ├── models/
│   │   └── models.py             # Tournament, Team, Player, Match, Innings, Delivery, Wicket
│   ├── schemas/
│   │   └── schemas.py            # Pydantic validation models
│   ├── api/
│   │   ├── tournaments.py        # Tournament, Team, Player, Points Table API
│   │   ├── matches.py            # Match scheduling, scorecards, live state
│   │   └── scoring.py            # Ball delivery, wicket, extras, bowler change, undo
│   ├── services/
│   │   ├── scoring_engine.py     # Authoritative ball-by-ball cricket scoring rules engine
│   │   └── stats_service.py      # Points table & NRR calculation, Leaderboards
│   └── websocket/
│       └── manager.py            # WebSocket Room connection manager
│
├── templates/
│   ├── base.html                 # Main layout & navigation
│   ├── index.html                # Home page with tournament creator & live match cards
│   ├── tournament.html           # Tournament dashboard (matches, teams, points, stats)
│   ├── scorer.html               # Scorer screen with big tactile buttons & modals
│   ├── live.html                 # TV & Mobile optimized live score screen
│   ├── scorecard.html            # Standalone match scorecard
│   └── points.html               # Standalone points table
│
├── static/
│   ├── css/
│   │   └── style.css             # High-contrast sports dark theme CSS
│   └── js/
│       ├── websocket-client.js   # Resilient WebSocket client with auto-reconnect
│       ├── scorer.js             # Scorer pad actions, hotkeys & modal handlers
│       ├── live.js               # Scoreboard animations & scorecard tab
│       └── tournament.js         # Tournament & squad management
│
├── tests/
│   ├── test_scoring_engine.py    # Unit tests for cricket scoring logic & NRR
│   └── test_api.py               # REST API integration tests
│
├── .env.example
├── .env
├── requirements.txt
└── README.md
```

---

## ☁️ Free Cloud Deployment (Render + anti-sleep keep-alive)

Free Python hosts (Render/Railway) spin a service **down after ~15 min without traffic**, which would kill the live score mid-tournament. This repo is pre-configured to survive that:

1. **Built-in self keep-alive** — on Render, the app pings its own `/health` every 5 minutes (`RENDER_EXTERNAL_URL` is read automatically), so the 15-minute idle timer never fires. No external service strictly required.
2. **Optional belt & suspenders** — add a free [UptimeRobot](https://uptimerobot.com) HTTP monitor pointed at `https://YOUR-APP.onrender.com/health` (5-min interval). Then even if the self-ping ever fails, the external ping keeps it warm.

### Deploy in 3 steps
1. Click the Render blueprint link for this repo (or Render Dashboard → *New* → *Blueprint*, pick this repo — it reads `render.yaml`).
2. Wait for the first build (~3–5 min). Your app is live at `https://hostel-cricket-live.onrender.com`.
3. Create the tournament/teams **on the deployed URL** and share:
   - Spectators / big screen: `https://hostel-cricket-live.onrender.com/match/{id}/live`
   - Scorer: `https://hostel-cricket-live.onrender.com/match/{id}/scorer`

### Important notes for free-tier hosting
- **Single worker only** (`render.yaml` already sets `--workers 1`): WebSocket rooms and SQLite must live in one process.
- **Ephemeral disk**: if Render ever restarts the container, the SQLite file resets. With keep-alive active this is rare; for insurance set `ADMIN_TOKEN` in the Render dashboard and snapshot the DB via `GET /api/admin/backup-db?token=YOUR_TOKEN` after setup and after each match day.
- 50–100 concurrent WebSocket viewers is comfortably within the free tier's capacity — per-ball updates are tiny JSON broadcasts.
