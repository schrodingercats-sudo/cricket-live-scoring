import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends, HTTPException

logger = logging.getLogger(__name__)
import httpx
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import init_db, get_db
from app.api.tournaments import router as tournaments_router
from app.api.matches import router as matches_router
from app.api.scoring import router as scoring_router
from app.api.videos import router as videos_router
from app.services.video_service import get_versioned_video_url, get_all_video_versions, get_static_asset_url
from app.websocket.manager import ws_manager
from app.models.models import Tournament, Match, Team
from app.services.scoring_engine import get_live_match_state, get_full_scorecard

def normalize_all_tournament_match_numbers():
    """Ensure all matches have match_number equal to their unique match ID (matching URL /match/{id}/...)."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        matches = db.query(Match).all()
        for m in matches:
            if m.match_number != m.id:
                m.match_number = m.id
        db.commit()
    except Exception as e:
        logger.debug(f"Notice during match numbers normalization: {e}")
    finally:
        db.close()

KEEP_ALIVE_INTERVAL_SECONDS = 300

async def keep_alive_loop():
    """Self-ping this service's public /health URL so free hosts (Render free tier)
    never see 15 minutes of inactivity and spin the service down."""
    url = (os.getenv("RENDER_EXTERNAL_URL") or settings.KEEP_ALIVE_URL or "").rstrip("/")
    if not url:
        logger.info("Keep-alive disabled (no RENDER_EXTERNAL_URL / KEEP_ALIVE_URL set).")
        return
    logger.info(f"Keep-alive enabled: pinging {url}/health every {KEEP_ALIVE_INTERVAL_SECONDS}s")
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                resp = await client.get(f"{url}/health")
                logger.debug(f"Keep-alive ping -> HTTP {resp.status_code}")
            except Exception as ping_err:
                logger.debug(f"Keep-alive ping failed: {ping_err}")
            await asyncio.sleep(KEEP_ALIVE_INTERVAL_SECONDS)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database tables in SQLite (data/cricket.db)
    init_db()
    normalize_all_tournament_match_numbers()
    logger.info(f"Hostel Cricket App started on SQLite database '{settings.SQLITE_DB_PATH}'.")
    keep_alive_task = asyncio.create_task(keep_alive_loop())
    yield
    keep_alive_task.cancel()
    try:
        await keep_alive_task
    except asyncio.CancelledError:
        pass
    logger.info("Hostel Cricket App shutting down.")

app = FastAPI(
    title="Hostel Cricket Scoring App",
    description="Simple, clean, responsive tournament management & live scoring platform",
    version="1.0.0",
    lifespan=lifespan
)

# GZip compression middleware (accelerates response transfer speeds over local Wi-Fi / networks)
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS middleware for open local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Intelligent Cache-Control Middleware: Cache static assets, but keep live HTML/API real-time
@app.middleware("http")
async def optimize_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    ct = response.headers.get("content-type", "")

    # Videos (four.mp4, six.mp4, out.mp4, etc.)
    # When requested with version query ?v=..., cache safely in browser for fast replay; when unversioned, revalidate
    if path.startswith("/static/videos") or any(path.endswith(ext) for ext in (".mp4", ".m4v", ".webm")):
        if "v=" in str(request.url.query):
            response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
        else:
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
    # Heavy static media (audio, fonts, images) -> cache for performance
    elif (
        path.startswith(("/static", "/music", "/logo"))
        or any(path.endswith(ext) for ext in (".mp3", ".m4a", ".woff2", ".woff", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"))
    ):
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
    # Dynamic live views, score HTML, JavaScript, and real-time REST endpoints -> Fresh, no stale data
    else:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response

# Mount static, music, logo and templates
import mimetypes
mimetypes.add_type("audio/mpeg", ".mpeg")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/mp4", ".m4a")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MUSIC_DIR = os.path.join(BASE_DIR, "music")
LOGO_DIR = os.path.join(BASE_DIR, "logo")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
if os.path.exists(MUSIC_DIR):
    app.mount("/music", StaticFiles(directory=MUSIC_DIR), name="music")
if os.path.exists(LOGO_DIR):
    app.mount("/logo", StaticFiles(directory=LOGO_DIR), name="logo")
templates = Jinja2Templates(directory=TEMPLATES_DIR)
templates.env.globals["video_url"] = get_versioned_video_url
templates.env.globals["get_video_versions"] = get_all_video_versions
templates.env.globals["static_url"] = get_static_asset_url

def get_tournament_logo() -> str:
    """Helper to find tournament logo from logo directory or static/logo directory."""
    if os.path.exists(LOGO_DIR):
        files = [f for f in os.listdir(LOGO_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'))]
        if files:
            return f"/logo/{files[0]}"
    static_logo = os.path.join(STATIC_DIR, "logo")
    if os.path.exists(static_logo):
        files = [f for f in os.listdir(static_logo) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'))]
        if files:
            return f"/static/logo/{files[0]}"
    return "/logo/baps-color-logo-white-wordmark.1veoral3ktspt.png"

from fastapi.responses import FileResponse, Response

@app.get("/favicon.ico", include_in_schema=False)
async def get_favicon():
    logo_file = os.path.join(LOGO_DIR, "baps-color-logo-white-wordmark.1veoral3ktspt.png")
    if os.path.exists(logo_file):
        return FileResponse(logo_file, media_type="image/png")
    return Response(content=b"", media_type="image/x-icon")

# Mount API Routers
app.include_router(tournaments_router)
app.include_router(matches_router)
app.include_router(scoring_router)
app.include_router(videos_router)

# Health check for uptime monitors & keep-alive pings (no DB hit, always fast)
@app.get("/health")
def health():
    return {
        "status": "ok",
        "ws_rooms": {str(match_id): len(conns) for match_id, conns in ws_manager.active_rooms.items()},
    }

# Admin DB snapshot download (disabled unless ADMIN_TOKEN is set)
@app.get("/api/admin/backup-db")
def backup_db(token: str = "", db: Session = Depends(get_db)):
    from sqlalchemy import text
    if not settings.ADMIN_TOKEN or token != settings.ADMIN_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        # Fold WAL journal into the main DB file so the download is a complete snapshot
        db.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        db.commit()
    except Exception as cp_err:
        logger.warning(f"WAL checkpoint during backup failed: {cp_err}")
    return FileResponse(settings.SQLITE_DB_PATH, media_type="application/octet-stream", filename="cricket-backup.db")

# WebSocket Real-Time Endpoint
@app.websocket("/ws/matches/{match_id}")
async def websocket_match_endpoint(websocket: WebSocket, match_id: int):
    await ws_manager.connect(websocket, match_id)
    try:
        while True:
            # Keep socket alive and handle incoming client ping-pong heartbeat or messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data and data != "pong":
                try:
                    import json
                    msg = json.loads(data)
                    if isinstance(msg, dict):
                        # Relay broadcast events (such as DISPLAY_ANIMATION) to the match room
                        await ws_manager.broadcast_to_match(match_id, msg)
                except Exception as parse_err:
                    logger.debug(f"WS message parse error in match {match_id}: {parse_err}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, match_id)
    except Exception as e:
        logger.warning(f"WebSocket error in match {match_id}: {e}")
        ws_manager.disconnect(websocket, match_id)


# Frontend Page Routes (HTML)
from sqlalchemy.orm import selectinload

@app.get("/")
def home_page(request: Request, db: Session = Depends(get_db)):
    tournaments = (
        db.query(Tournament)
        .options(selectinload(Tournament.teams), selectinload(Tournament.matches))
        .filter(Tournament.is_deleted == False)
        .order_by(Tournament.id.desc())
        .all()
    )
    live_matches = db.query(Match).filter(Match.status == "live", Match.is_deleted == False).all()
    upcoming_matches = db.query(Match).filter(Match.status == "upcoming", Match.is_deleted == False).limit(5).all()
    recent_matches = db.query(Match).filter(Match.status == "completed", Match.is_deleted == False).order_by(Match.id.desc()).limit(5).all()
    return templates.TemplateResponse(request=request, name="index.html", context={
        "tournaments": tournaments,
        "live_matches": live_matches,
        "upcoming_matches": upcoming_matches,
        "recent_matches": recent_matches
    })

@app.get("/tournament/{tournament_id}")
def tournament_dashboard(tournament_id: int, request: Request, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    
    matches = db.query(Match).filter(Match.tournament_id == tournament_id, Match.is_deleted == False).order_by(Match.match_number.asc(), Match.id.asc()).all()
    deleted_matches = db.query(Match).filter(Match.tournament_id == tournament_id, Match.is_deleted == True).order_by(Match.deleted_at.desc()).all()
    teams = db.query(Team).filter(Team.tournament_id == tournament_id).all()
    return templates.TemplateResponse(request=request, name="tournament.html", context={
        "tournament": tourney,
        "matches": matches,
        "deleted_matches": deleted_matches,
        "teams": teams
    })

@app.get("/tournament/{tournament_id}/points")
def points_table_page(tournament_id: int, request: Request, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return templates.TemplateResponse(request=request, name="points.html", context={
        "tournament": tourney
    })

@app.get("/match/{match_id}/scorer")
def scorer_page(match_id: int, request: Request, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    try:
        live_state = get_live_match_state(db, match_id)
    except Exception:
        live_state = None
    return templates.TemplateResponse(request=request, name="scorer.html", context={
        "match": match,
        "live_state": live_state
    })

@app.get("/match/{match_id}/live")
def live_page(match_id: int, request: Request, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    try:
        live_state = get_live_match_state(db, match_id)
    except Exception:
        live_state = None
    return templates.TemplateResponse(request=request, name="live.html", context={
        "match": match,
        "live_state": live_state,
        "logo_url": get_tournament_logo(),
        "video_versions": get_all_video_versions()
    })

@app.get("/match/{match_id}/scorecard")
def scorecard_page(match_id: int, request: Request, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return templates.TemplateResponse(request=request, name="scorecard.html", context={
        "match": match
    })

@app.get("/history")
def history_page(request: Request, db: Session = Depends(get_db)):
    deleted_matches = (
        db.query(Match)
        .options(selectinload(Match.tournament), selectinload(Match.team1), selectinload(Match.team2), selectinload(Match.innings))
        .filter(Match.is_deleted == True)
        .order_by(Match.deleted_at.desc())
        .all()
    )
    deleted_tournaments = (
        db.query(Tournament)
        .options(selectinload(Tournament.teams), selectinload(Tournament.matches))
        .filter(Tournament.is_deleted == True)
        .order_by(Tournament.deleted_at.desc())
        .all()
    )
    return templates.TemplateResponse(request=request, name="history.html", context={
        "deleted_matches": deleted_matches,
        "deleted_tournaments": deleted_tournaments
    })

@app.get("/animation/{match_id}")
@app.get("/match/{match_id}/animation")
def animation_dashboard_page(match_id: int, request: Request, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(selectinload(Match.tournament), selectinload(Match.team1), selectinload(Match.team2))
        .filter(Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    try:
        live_state = get_live_match_state(db, match_id)
    except Exception:
        live_state = None
    return templates.TemplateResponse(request=request, name="animation.html", context={
        "match": match,
        "live_state": live_state,
        "logo_url": get_tournament_logo()
    })

@app.get("/commentator/{match_id}")
@app.get("/match/{match_id}/commentator")
def commentator_dashboard_page(match_id: int, request: Request, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(selectinload(Match.tournament), selectinload(Match.team1), selectinload(Match.team2))
        .filter(Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    try:
        live_state = get_live_match_state(db, match_id)
    except Exception:
        live_state = None
    
    # List active/recent matches for match selector
    all_matches = (
        db.query(Match)
        .options(selectinload(Match.tournament), selectinload(Match.team1), selectinload(Match.team2))
        .filter(Match.is_deleted == False)
        .order_by(Match.id.desc())
        .limit(20)
        .all()
    )
    
    return templates.TemplateResponse(request=request, name="commentator.html", context={
        "match": match,
        "live_state": live_state,
        "all_matches": all_matches,
        "logo_url": get_tournament_logo()
    })

