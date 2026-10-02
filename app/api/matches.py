from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Match, Tournament, Team
from app.schemas.schemas import MatchCreate
from app.services.scoring_engine import get_live_match_state, get_full_scorecard
from app.services.pdf_generator import generate_scorecard_pdf
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/matches", tags=["Matches"])

@router.post("")
def create_match(payload: MatchCreate, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == payload.tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    
    team1 = db.query(Team).filter(Team.id == payload.team1_id).first()
    team2 = db.query(Team).filter(Team.id == payload.team2_id).first()
    if not team1 or not team2 or team1.id == team2.id:
        raise HTTPException(status_code=400, detail="Invalid team selection")

    existing_matches_count = db.query(Match).filter(
        Match.tournament_id == payload.tournament_id,
        Match.is_deleted == False
    ).count()

    match = Match(
        tournament_id=payload.tournament_id,
        match_number=payload.match_number or 0,
        team1_id=payload.team1_id,
        team2_id=payload.team2_id,
        total_overs=payload.total_overs or tourney.format_overs,
        max_overs_per_bowler=payload.max_overs_per_bowler,
        scheduled_date=payload.scheduled_date,
        status="upcoming",
        is_deleted=False
    )
    db.add(match)
    db.flush()
    if not payload.match_number:
        match.match_number = match.id
    db.commit()
    db.refresh(match)

    return {
        "id": match.id,
        "match_number": match.match_number,
        "team1_name": team1.name,
        "team2_name": team2.name,
        "total_overs": match.total_overs,
        "max_overs_per_bowler": match.max_overs_per_bowler,
        "scheduled_date": match.scheduled_date.strftime("%b %d, %Y %I:%M %p") if match.scheduled_date else None,
        "status": match.status
    }

@router.get("")
def list_matches(
    tournament_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_deleted: Optional[bool] = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(Match)
    if is_deleted is not None:
        query = query.filter(Match.is_deleted == is_deleted)
    if tournament_id:
        query = query.filter(Match.tournament_id == tournament_id)
    if status:
        query = query.filter(Match.status == status)

    matches = query.order_by(Match.id.desc()).all()
    
    result = []
    for m in matches:
        team1_score = ""
        team2_score = ""
        for inn in m.innings:
            if inn.batting_team_id == m.team1_id:
                team1_score = f"{inn.total_runs}/{inn.total_wickets} ({inn.legal_balls // 6}.{inn.legal_balls % 6})"
            elif inn.batting_team_id == m.team2_id:
                team2_score = f"{inn.total_runs}/{inn.total_wickets} ({inn.legal_balls // 6}.{inn.legal_balls % 6})"

        result.append({
            "id": m.id,
            "tournament_id": m.tournament_id,
            "tournament_name": m.tournament.name if m.tournament else "",
            "match_number": m.match_number,
            "team1_id": m.team1_id,
            "team1_name": m.team1.name if m.team1 else "",
            "team2_id": m.team2_id,
            "team2_name": m.team2.name if m.team2 else "",
            "total_overs": m.total_overs,
            "max_overs_per_bowler": m.max_overs_per_bowler,
            "scheduled_date": m.scheduled_date.strftime("%b %d, %Y %I:%M %p") if m.scheduled_date else None,
            "scheduled_date_raw": m.scheduled_date.isoformat() if m.scheduled_date else None,
            "status": m.status,
            "team1_score": team1_score,
            "team2_score": team2_score,
            "result_text": m.result_text,
            "is_deleted": m.is_deleted,
            "deleted_at": m.deleted_at.strftime("%b %d, %Y %I:%M %p") if m.deleted_at else None
        })
    return result

@router.get("/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    return {
        "id": match.id,
        "tournament_id": match.tournament_id,
        "tournament_name": match.tournament.name if match.tournament else "",
        "match_number": match.match_number,
        "team1": {"id": match.team1.id, "name": match.team1.name, "short_name": match.team1.short_name, "logo_url": match.team1.logo_url, "players": [{"id": p.id, "name": p.name, "photo_url": p.photo_url} for p in match.team1.players]},
        "team2": {"id": match.team2.id, "name": match.team2.name, "short_name": match.team2.short_name, "logo_url": match.team2.logo_url, "players": [{"id": p.id, "name": p.name, "photo_url": p.photo_url} for p in match.team2.players]},
        "total_overs": match.total_overs,
        "max_overs_per_bowler": match.max_overs_per_bowler,
        "scheduled_date": match.scheduled_date.strftime("%b %d, %Y %I:%M %p") if match.scheduled_date else None,
        "scheduled_date_raw": match.scheduled_date.isoformat() if match.scheduled_date else None,
        "status": match.status,
        "is_deleted": match.is_deleted,
        "toss_winner_id": match.toss_winner_id,
        "toss_decision": match.toss_decision,
        "result_text": match.result_text
    }

@router.get("/{match_id}/live")
def get_match_live_state(match_id: int, db: Session = Depends(get_db)):
    try:
        state = get_live_match_state(db, match_id)
        return state
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{match_id}/scorecard")
def get_match_scorecard(match_id: int, db: Session = Depends(get_db)):
    try:
        scorecard = get_full_scorecard(db, match_id)
        return scorecard
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{match_id}/scorecard/pdf")
def download_match_scorecard_pdf(match_id: int, db: Session = Depends(get_db)):
    try:
        pdf_bytes, filename = generate_scorecard_pdf(match_id, db)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate scorecard PDF: {str(e)}")

@router.delete("/{match_id}")
def delete_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    # Soft delete -> moves match to history
    match.is_deleted = True
    match.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Match moved to history successfully", "match_id": match.id, "status": "archived"}

@router.post("/{match_id}/restore")
def restore_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    # Restore match back into active tournament schedule
    match.is_deleted = False
    match.deleted_at = None
    db.commit()
    return {"message": "Match restored to tournament successfully", "match_id": match.id}

@router.delete("/{match_id}/permanent")
def permanent_delete_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    db.delete(match)
    db.commit()
    return {"message": "Match permanently deleted"}

from app.services.scoring_engine import get_live_match_state

@router.post("/{match_id}/animation")
async def trigger_match_animation(match_id: int, payload: dict, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    action = payload.get("action", "").upper()
    anim_name = payload.get("animation", "VS")
    
    if action in ("STOP", "SHOW_LIVE", "LIVE_VIEW") or anim_name in ("STOP", "STOP_ANIMATION", "CLOSE", "CLOSE_ANIMATION", "SHOW_LIVE", "SHOW_LIVE_VIEW", "LIVE_VIEW") or payload.get("type") in ("STOP_ANIMATION", "SHOW_LIVE_VIEW") or payload.get("show_live_view"):
        event_payload = {
            "type": "STOP_ANIMATION",
            "action": "STOP",
            "show_live_view": True,
            "match_id": match_id,
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
        await ws_manager.broadcast_to_match(match_id, event_payload)
        return {"status": "ok", "action": "STOP", "broadcasted": True, "event": event_payload}
    
    if anim_name in ("STRIKER", "NON_STRIKER", "NON-STRIKER", "BOWLER", "PLAYER_CARD") or payload.get("player"):
        role = payload.get("role")
        player_data = payload.get("player")
        
        if not player_data:
            try:
                live_state = get_live_match_state(db, match_id)
            except Exception:
                live_state = {}
                
            norm_anim = anim_name.upper().replace("_", "-")
            if norm_anim == "STRIKER":
                role = "STRIKER"
                p = live_state.get("striker")
                team_name = live_state.get("batting_team") or (match.team1.name if match.team1 else "Team A")
                if not p and match.team1 and match.team1.players:
                    p = {"id": match.team1.players[0].id, "name": match.team1.players[0].name, "photo_url": match.team1.players[0].photo_url}
                if p:
                    player_data = {
                        "id": p.get("id"),
                        "name": p.get("name", "Striker Batsman"),
                        "team_name": team_name,
                        "photo_url": p.get("photo_url"),
                        "runs": p.get("runs", 0),
                        "balls": p.get("balls", 0),
                        "fours": p.get("fours", 0),
                        "sixes": p.get("sixes", 0)
                    }
                else:
                    player_data = {
                        "id": 1,
                        "name": "Striker Batsman",
                        "team_name": team_name,
                        "photo_url": None,
                        "runs": 0, "balls": 0, "fours": 0, "sixes": 0
                    }
            elif norm_anim in ("NON-STRIKER", "NONSTRIKER"):
                role = "NON-STRIKER"
                p = live_state.get("non_striker")
                team_name = live_state.get("batting_team") or (match.team1.name if match.team1 else "Team A")
                if not p and match.team1 and len(match.team1.players) > 1:
                    p = {"id": match.team1.players[1].id, "name": match.team1.players[1].name, "photo_url": match.team1.players[1].photo_url}
                elif not p and match.team1 and match.team1.players:
                    p = {"id": match.team1.players[0].id, "name": match.team1.players[0].name, "photo_url": match.team1.players[0].photo_url}
                if p:
                    player_data = {
                        "id": p.get("id"),
                        "name": p.get("name", "Non-Striker"),
                        "team_name": team_name,
                        "photo_url": p.get("photo_url"),
                        "runs": p.get("runs", 0),
                        "balls": p.get("balls", 0),
                        "fours": p.get("fours", 0),
                        "sixes": p.get("sixes", 0)
                    }
                else:
                    player_data = {
                        "id": 2,
                        "name": "Non-Striker Batsman",
                        "team_name": team_name,
                        "photo_url": None,
                        "runs": 0, "balls": 0, "fours": 0, "sixes": 0
                    }
            elif norm_anim == "BOWLER":
                role = "CURRENT BOWLER"
                p = live_state.get("current_bowler")
                team_name = live_state.get("bowling_team") or (match.team2.name if match.team2 else "Team B")
                if not p and match.team2 and match.team2.players:
                    p = {"id": match.team2.players[0].id, "name": match.team2.players[0].name, "photo_url": match.team2.players[0].photo_url}
                if p:
                    player_data = {
                        "id": p.get("id"),
                        "name": p.get("name", "Opening Bowler"),
                        "team_name": team_name,
                        "photo_url": p.get("photo_url"),
                        "overs": p.get("overs", "0.0"),
                        "runs": p.get("runs", 0),
                        "wickets": p.get("wickets", 0),
                        "economy": p.get("economy", 0.0)
                    }
                else:
                    player_data = {
                        "id": 3,
                        "name": "Opening Bowler",
                        "team_name": team_name,
                        "photo_url": None,
                        "overs": "0.0", "runs": 0, "wickets": 0, "economy": 0.0
                    }

        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": "PLAYER_CARD",
            "role": role or "PLAYER",
            "match_id": match_id,
            "player": player_data,
            "is_persistent": payload.get("is_persistent", True),
            "duration": payload.get("duration"),
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
    elif anim_name in ("CUSTOM_TEXT", "TEXT_DISPLAY", "TEXT"):
        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": "CUSTOM_TEXT",
            "match_id": match_id,
            "text": payload.get("text", ""),
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
    elif anim_name in ("BATSMEN_DUO", "BATSMEN", "BATSMAN_DUO", "BATSMEN_PAIR"):
        try:
            live_state = get_live_match_state(db, match_id)
        except Exception:
            live_state = {}
        striker = payload.get("striker") or live_state.get("striker")
        non_striker = payload.get("non_striker") or live_state.get("non_striker")
        batting_team = payload.get("batting_team") or live_state.get("batting_team") or (match.team1.name if match.team1 else "Batting Team")
        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": "BATSMEN_DUO",
            "match_id": match_id,
            "batting_team": batting_team,
            "striker": striker or {"id": 1, "name": "Striker Batsman", "photo_url": None, "runs": 0, "balls": 0, "fours": 0, "sixes": 0},
            "non_striker": non_striker or {"id": 2, "name": "Non-Striker Batsman", "photo_url": None, "runs": 0, "balls": 0, "fours": 0, "sixes": 0},
            "is_persistent": payload.get("is_persistent", True),
            "duration": payload.get("duration"),
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
    elif anim_name in ("NO_BALL", "NO_BALL_HIT", "NOBALL", "NOBALL_HIT", "WIDE", "WIDE_HIT", "WIDE_BALL", "EXTRAS_WIDE", "FOUR", "FOUR_HIT", "SIX", "SIX_HIT", "OUT", "WICKET", "WICKET_HIT", "DOT", "DOT_BALL", "DOT_BALL_HIT", "ZERO", "0", "ONE", "ONE_RUN", "ONE_RUN_HIT", "SINGLE", "1", "TWO", "TWO_RUNS", "TWO_RUNS_HIT", "DOUBLE", "2", "50", "100", "MILESTONE_50", "MILESTONE_100", "FREE_HIT", "CHAMPIONS", "WINNER"):
        try:
            live_state = get_live_match_state(db, match_id)
        except Exception:
            live_state = {}
        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": anim_name,
            "match_id": match_id,
            "striker": live_state.get("striker"),
            "non_striker": live_state.get("non_striker"),
            "bowler": live_state.get("current_bowler"),
            "batting_team": live_state.get("batting_team"),
            "bowling_team": live_state.get("bowling_team"),
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
    elif anim_name in ("TOSS", "TOSS_DECISION", "TOSS_WINNER", "TOSS_RESULT"):
        winner_name = payload.get("toss_winner_name") or payload.get("team_name") or payload.get("winner_name")
        winner_logo = payload.get("toss_winner_logo") or payload.get("team_logo") or payload.get("logo_url")
        toss_id = payload.get("toss_winner_id")
        if not winner_name and toss_id:
            if match.team1 and match.team1.id == toss_id:
                winner_name = match.team1.name
                winner_logo = match.team1.logo_url
            elif match.team2 and match.team2.id == toss_id:
                winner_name = match.team2.name
                winner_logo = match.team2.logo_url
        if not winner_name:
            winner_name = match.team1.name if match.team1 else "Team 1"
            winner_logo = match.team1.logo_url if match.team1 else None

        toss_decision = payload.get("toss_decision") or payload.get("decision", "bat")

        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": "TOSS",
            "match_id": match_id,
            "toss_winner_id": toss_id,
            "toss_winner_name": winner_name,
            "toss_winner_logo": winner_logo or "",
            "team_name": winner_name,
            "team_logo": winner_logo or "",
            "toss_decision": toss_decision,
            "decision": toss_decision,
            "team1": {
                "id": match.team1.id if match.team1 else None,
                "name": match.team1.name if match.team1 else "Team 1",
                "short_name": match.team1.short_name if match.team1 else "T1",
                "logo_url": match.team1.logo_url if match.team1 else None,
            },
            "team2": {
                "id": match.team2.id if match.team2 else None,
                "name": match.team2.name if match.team2 else "Team 2",
                "short_name": match.team2.short_name if match.team2 else "T2",
                "logo_url": match.team2.logo_url if match.team2 else None,
            },
            "is_persistent": payload.get("is_persistent", True),
            "timestamp": int(datetime.utcnow().timestamp() * 1000)
        }
    else:
        # Standard VS Animation broadcast
        event_payload = {
            "type": "DISPLAY_ANIMATION",
            "animation": anim_name,
            "match_id": match_id,
            "team1": {
                "id": match.team1.id if match.team1 else None,
                "name": match.team1.name if match.team1 else "Team 1",
                "short_name": match.team1.short_name if match.team1 else "",
                "logo_url": match.team1.logo_url if match.team1 else None
            },
            "team2": {
                "id": match.team2.id if match.team2 else None,
                "name": match.team2.name if match.team2 else "Team 2",
                "short_name": match.team2.short_name if match.team2 else "",
                "logo_url": match.team2.logo_url if match.team2 else None
            }
        }

    await ws_manager.broadcast_to_match(match_id, event_payload)
    return {"status": "ok", "broadcasted": True, "event": event_payload}

