import os
import re
import urllib.parse
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.schemas import (
    TossUpdate,
    RecordDeliveryRequest,
    DeclareBatsmanRequest,
    ChangeBowlerRequest,
    SelectNewBatterRequest,
    PenaltyRunsRequest,
    CustomBannerRequest,
    MusicControlRequest,
    CommentaryDisplayRequest
)
from app.services.commentary_service import generate_ai_commentary
from app.services.scoring_engine import (
    start_match,
    start_second_innings,
    record_delivery,
    declare_batsman,
    change_bowler,
    select_new_batter,
    swap_strike,
    undo_last_delivery,
    undo_toss,
    apply_penalty_runs,
    get_live_match_state
)
from app.websocket.manager import ws_manager

logger = logging.getLogger("cricket_app.api.scoring")

router = APIRouter(prefix="/api/scoring", tags=["Scoring Engine"])

async def broadcast_match_update(db: Session, match_id: int, event_type: str = "SCORE_UPDATE"):
    try:
        live_state = get_live_match_state(db, match_id)
        if live_state:
            live_state["latest_event"] = event_type
        await ws_manager.broadcast_to_match(match_id, {
            "type": event_type,
            "data": live_state
        })
        return live_state
    except Exception as e:
        logger.error(f"Failed to broadcast live match state for match {match_id}: {e}")
        return None

@router.post("/matches/{match_id}/toss")
async def handle_toss_and_start(
    match_id: int,
    payload: TossUpdate,
    db: Session = Depends(get_db)
):
    try:
        start_match(
            db=db,
            match_id=match_id,
            toss_winner_id=payload.toss_winner_id,
            toss_decision=payload.toss_decision,
            striker_id=payload.striker_id,
            non_striker_id=payload.non_striker_id,
            bowler_id=payload.bowler_id,
            total_overs=payload.total_overs,
            max_overs_per_bowler=payload.max_overs_per_bowler
        )
        live_state = await broadcast_match_update(db, match_id, event_type="TOSS_STARTED")
        return {"status": "ok", "message": "Match started", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/toss/undo")
@router.post("/matches/{match_id}/undo-toss")
async def handle_undo_toss(
    match_id: int,
    db: Session = Depends(get_db)
):
    try:
        undo_toss(db=db, match_id=match_id)
        live_state = await broadcast_match_update(db, match_id, event_type="TOSS_UNDONE")
        return {"status": "ok", "message": "Toss undone successfully. Match reset to upcoming.", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/start-innings-2")
async def handle_start_innings_2(
    match_id: int,
    payload: TossUpdate, # reusing striker_id, non_striker_id, bowler_id
    db: Session = Depends(get_db)
):
    try:
        start_second_innings(
            db=db,
            match_id=match_id,
            striker_id=payload.striker_id,
            non_striker_id=payload.non_striker_id,
            bowler_id=payload.bowler_id
        )
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "2nd Innings started", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/delivery")
async def handle_record_delivery(
    match_id: int,
    payload: RecordDeliveryRequest,
    db: Session = Depends(get_db)
):
    try:
        record_delivery(
            db=db,
            match_id=match_id,
            runs_batter=payload.runs_batter,
            extras_type=payload.extras_type,
            extras_runs=payload.extras_runs,
            is_wicket=payload.is_wicket,
            wicket_type=payload.wicket_type,
            player_out_id=payload.player_out_id,
            fielder_id=payload.fielder_id,
            new_batter_id=payload.new_batter_id
        )
        if payload.is_wicket:
            event_type = "WICKET_HIT"
        elif payload.extras_type == "noball":
            event_type = "NO_BALL_HIT"
        elif payload.extras_type == "wide":
            event_type = "WIDE_HIT"
        elif payload.runs_batter == 6 or payload.extras_runs == 6:
            event_type = "SIX_HIT"
        elif payload.runs_batter == 4 or payload.extras_runs == 4:
            event_type = "FOUR_HIT"
        elif (payload.runs_batter == 0 and payload.extras_runs == 0) and payload.extras_type in ("none", "dic", "declared", "bye", "legbye"):
            event_type = "DOT_BALL_HIT"
        elif (payload.runs_batter == 1 or payload.extras_runs == 1) and payload.extras_type in ("none", "dic", "declared", "bye", "legbye"):
            event_type = "ONE_RUN_HIT"
        elif (payload.runs_batter == 2 or payload.extras_runs == 2) and payload.extras_type in ("none", "dic", "declared", "bye", "legbye"):
            event_type = "TWO_RUNS_HIT"
        else:
            event_type = "SCORE_UPDATE"
        live_state = await broadcast_match_update(db, match_id, event_type=event_type)
        return {"status": "ok", "message": "Delivery recorded", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/bowler")
async def handle_change_bowler(
    match_id: int,
    payload: ChangeBowlerRequest,
    db: Session = Depends(get_db)
):
    try:
        change_bowler(db, match_id, payload.bowler_id, reset_over_balls=payload.reset_over_balls)
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "Bowler changed", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/new-batter")
async def handle_select_new_batter(
    match_id: int,
    payload: SelectNewBatterRequest,
    db: Session = Depends(get_db)
):
    try:
        select_new_batter(db, match_id, payload.new_batter_id)
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "Batter selected", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/swap-strike")
async def handle_swap_strike(
    match_id: int,
    db: Session = Depends(get_db)
):
    try:
        swap_strike(db, match_id)
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "Strike swapped", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/batsman-dic")
async def handle_batsman_dic(
    match_id: int,
    payload: DeclareBatsmanRequest,
    db: Session = Depends(get_db)
):
    try:
        declare_batsman(
            db=db,
            match_id=match_id,
            player_out_id=payload.player_out_id,
            new_batter_id=payload.new_batter_id
        )
        live_state = await broadcast_match_update(db, match_id, event_type="WICKET_HIT")
        return {"status": "ok", "message": "Batsman DIC (Declared) recorded", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/undo")
async def handle_undo_delivery(
    match_id: int,
    db: Session = Depends(get_db)
):
    try:
        undo_last_delivery(db, match_id)
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "Last delivery undone", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/penalty")
async def handle_penalty_runs(
    match_id: int,
    payload: PenaltyRunsRequest,
    db: Session = Depends(get_db)
):
    try:
        apply_penalty_runs(
            db=db,
            match_id=match_id,
            team_id=payload.team_id,
            penalty_runs=payload.penalty_runs,
            reason=payload.reason
        )
        live_state = await broadcast_match_update(db, match_id)
        return {"status": "ok", "message": "Penalty runs applied", "data": live_state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matches/{match_id}/transition")
async def handle_trigger_transition(
    match_id: int,
    db: Session = Depends(get_db)
):
    try:
        live_state = get_live_match_state(db, match_id)
        await ws_manager.broadcast_to_match(match_id, {
            "type": "BROADCAST_TRANSITION",
            "data": live_state
        })
        return {"status": "ok", "message": "Transition broadcasted"}
    except Exception as e:
        logger.error(f"Error broadcasting transition: {e}")
        return {"status": "ok", "message": "Transition sent"}

@router.post("/matches/{match_id}/custom-banner")
async def handle_custom_banner(
    match_id: int,
    payload: CustomBannerRequest,
    db: Session = Depends(get_db)
):
    try:
        live_state = get_live_match_state(db, match_id)
        banner_dict = {
            "text": payload.text,
            "subtext": payload.subtext,
            "theme": payload.theme,
            "sound": payload.sound,
            "duration_ms": payload.duration_ms,
            "action": payload.action
        }
        await ws_manager.broadcast_to_match(match_id, {
            "type": "CUSTOM_BANNER",
            "banner": banner_dict,
            "data": live_state
        })
        return {"status": "ok", "message": "Custom banner broadcasted", "banner": banner_dict}
    except Exception as e:
        logger.error(f"Error broadcasting custom banner: {e}")
        return {"status": "ok", "message": "Banner sent", "banner": payload.model_dump()}


def get_music_tracks_metadata():
    """Scans the music directory and returns structured metadata with clean titles and categories."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    music_dir = os.path.join(base_dir, "music")
    if not os.path.exists(music_dir):
        return []

    valid_extensions = (".mp3", ".mpeg", ".m4a", ".wav", ".ogg", ".aac", ".flac", ".mp4")
    files = [f for f in os.listdir(music_dir) if f.lower().endswith(valid_extensions)]
    files.sort(key=lambda x: x.lower())

    # Map filename prefixes/keywords to categories, friendly titles & icons
    curated_map = {
        "ipl cricket theme song": ("IPL Cricket Theme Song", "IPL & Anthem", "🏏"),
        "ipl scorecard music": ("IPL Scorecard Anthem", "IPL & Anthem", "📊"),
        "ms dhoni": ("MS Dhoni Signature Theme", "IPL & Anthem", "🦁"),
        "azeem o shaan shahenshah": ("Azeem O Shaan Shahenshah", "IPL & Anthem", "👑"),
        "medan": ("Medan Theme", "IPL & Anthem", "🏟️"),
        "are you ready": ("Are You Ready!", "Stadium & Hype", "⚡"),
        "dj air horn": ("DJ Air Horn", "Stadium & Hype", "📢"),
        "clapping sound": ("Crowd Clapping / Applause", "Stadium & Hype", "👏"),
        "siren": ("Emergency Siren Alert", "Stadium & Hype", "🚨"),
        "bhuuun": ("Vuvuzela Stadium Horn", "Stadium & Hype", "🎺"),
        "aaayyy": ("Aaayyy Crowd Shout", "Stadium & Hype", "🗣️"),
        "na nanana": ("Na Na Na Na Celebration", "Stadium & Hype", "🎵"),
        "20th century fox phonk": ("20th Century Fox Phonk", "Beats & Remix", "🔥"),
        "century fox": ("Century Fox Club Remix", "Beats & Remix", "🎧"),
        "beat drop": ("Epic Bass & Beat Drop", "Beats & Remix", "💥"),
        "paga sa dha": ("Pa-Ga-Sa-Dha Fusion Beat", "Beats & Remix", "🎶"),
        "sarkari": ("Sarkari Theme Beat", "Beats & Remix", "🎩"),
        "dhol1": ("Punjabi Dhol Beats 1", "Dhol & Celebration", "🪘"),
        "dhol2": ("High Energy Dhol Beats 2", "Dhol & Celebration", "🪘"),
        "suspense baas": ("Suspense Bass Drop", "Suspense & Drama", "🥁"),
        "suspense": ("Dramatic Suspense Tension", "Suspense & Drama", "⏳"),
        "minions banana": ("Minions Banana Song", "Memes & Comedy", "🍌"),
        "despicable me": ("Minions Banana Song", "Memes & Comedy", "🍌"),
        "jhim tapak": ("Jhim Tapak Dam Dam", "Memes & Comedy", "🎪"),
        "tururur": ("Tururur Meme Tune", "Memes & Comedy", "🕺"),
        "laughing meme": ("Viral Laughing Meme", "Memes & Comedy", "🤣"),
        "laugh.mp3": ("Funny Laugh 1", "Memes & Comedy", "😆"),
        "laugh2": ("Funny Laugh 2", "Memes & Comedy", "😂"),
        "laugh3": ("Funny Laugh 3", "Memes & Comedy", "😹"),
        "funny laughing sound": ("Crowd Belly Laugh", "Memes & Comedy", "🤣"),
        "black funny kid": ("Funny Kid Laughing Meme", "Memes & Comedy", "🚗"),
        "ohhh no": ("Oh No No No Meme", "Memes & Comedy", "😱")
    }

    tracks = []
    for fn in files:
        fn_lower = fn.lower()
        title = None
        category = "Other Sound FX"
        icon = "🎵"

        for key, (mapped_title, mapped_cat, mapped_icon) in curated_map.items():
            if key in fn_lower:
                title = mapped_title
                category = mapped_cat
                icon = mapped_icon
                break

        if not title:
            # Clean up raw filename: strip extension, remove hashtags and weird characters
            cleaned = re.sub(r'(\.mp3|\.mpeg|\.m4a|\.wav|\.ogg|\.aac|\.flac|\.mp4)', '', fn, flags=re.IGNORECASE)
            cleaned = re.sub(r'#\w+', '', cleaned)
            cleaned = re.sub(r'[-_]+', ' ', cleaned).strip()
            title = cleaned.title() if cleaned else fn

        tracks.append({
            "filename": fn,
            "title": title,
            "category": category,
            "icon": icon,
            "url": f"/music/{urllib.parse.quote(fn)}"
        })

    # Sort by Category order, then Title
    category_order = {
        "IPL & Anthem": 1,
        "Stadium & Hype": 2,
        "Dhol & Celebration": 3,
        "Beats & Remix": 4,
        "Suspense & Drama": 5,
        "Memes & Comedy": 6,
        "Other Sound FX": 7
    }
    tracks.sort(key=lambda t: (category_order.get(t["category"], 99), t["title"]))
    return tracks


@router.get("/music-list")
def list_music_tracks():
    """Returns list of available DJ soundboard & music tracks from the music/ folder."""
    return {"tracks": get_music_tracks_metadata()}


@router.post("/matches/{match_id}/music")
async def handle_music_control(
    match_id: int,
    payload: MusicControlRequest,
    db: Session = Depends(get_db)
):
    """Broadcasts a music play or stop command to the live stream view and connected clients."""
    try:
        live_state = get_live_match_state(db, match_id)
        
        track_info = None
        if payload.track:
            all_tracks = get_music_tracks_metadata()
            for t in all_tracks:
                if t["filename"] == payload.track or t["url"].endswith(payload.track):
                    track_info = t
                    break
            if not track_info:
                track_info = {
                    "filename": payload.track,
                    "title": os.path.splitext(payload.track)[0],
                    "icon": "🎵",
                    "category": "Sound FX",
                    "url": f"/music/{urllib.parse.quote(payload.track)}"
                }

        msg = {
            "type": "MUSIC_PLAY" if payload.action == "play" else "MUSIC_STOP",
            "action": payload.action,
            "track": track_info,
            "volume": payload.volume if payload.volume is not None else 1.0,
            "loop": bool(payload.loop),
            "data": live_state
        }
        
        await ws_manager.broadcast_to_match(match_id, msg)
        logger.info(f"Music {payload.action.upper()} triggered for match {match_id}: {track_info.get('title') if track_info else 'None'}")
        return {"status": "ok", "message": f"Music {payload.action} broadcasted", "music": msg}
    except Exception as e:
        logger.error(f"Error broadcasting music command for match {match_id}: {e}")
        return {"status": "error", "detail": str(e)}


@router.post("/matches/{match_id}/generate-commentary")
async def handle_generate_commentary(
    match_id: int,
    db: Session = Depends(get_db)
):
    """Generates AI/smart real-time commentary based on current match situation."""
    try:
        live_state = get_live_match_state(db, match_id)
        res = await generate_ai_commentary(live_state)
        return {
            "status": "ok",
            "commentary": res.get("commentary", ""),
            "source": res.get("source", "engine")
        }
    except Exception as e:
        logger.error(f"Error generating commentary for match {match_id}: {e}")
        return {
            "status": "ok",
            "commentary": "Match in progress. Excellent contest between bat and ball.",
            "source": "fallback"
        }


@router.post("/matches/{match_id}/commentary-display")
async def handle_commentary_display(
    match_id: int,
    payload: CommentaryDisplayRequest,
    db: Session = Depends(get_db)
):
    """Broadcasts commentary text to the Live View and connected displays in real-time."""
    try:
        live_state = get_live_match_state(db, match_id)
        msg = {
            "type": "COMMENTARY_DISPLAY",
            "match_id": match_id,
            "text": payload.text.strip(),
            "data": live_state
        }
        await ws_manager.broadcast_to_match(match_id, msg)
        logger.info(f"Commentary sent to Live View for match {match_id}: {payload.text[:40]}...")
        return {"status": "ok", "message": "Commentary sent to Live View", "text": payload.text}
    except Exception as e:
        logger.error(f"Error broadcasting commentary display for match {match_id}: {e}")
        return {"status": "error", "detail": str(e)}



