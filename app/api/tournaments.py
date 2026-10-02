import os
import uuid
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Tournament, Team, Player
from app.schemas.schemas import (
    TournamentCreate, TournamentResponse,
    TeamCreate, TeamUpdate, TeamResponse,
    PlayerCreate, PlayerUpdate, PlayerResponse
)
from app.services.stats_service import get_points_table, get_tournament_leaderboards

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])

@router.post("", response_model=TournamentResponse)
def create_tournament(payload: TournamentCreate, db: Session = Depends(get_db)):
    tourney = Tournament(
        name=payload.name,
        format_overs=payload.format_overs,
        status="active",
        is_deleted=False
    )
    db.add(tourney)
    db.commit()
    db.refresh(tourney)
    return tourney

@router.get("", response_model=List[TournamentResponse])
def list_tournaments(
    is_deleted: Optional[bool] = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(Tournament)
    if is_deleted is not None:
        query = query.filter(Tournament.is_deleted == is_deleted)
    tournaments = query.order_by(Tournament.id.desc()).all()
    return tournaments

@router.get("/{tournament_id}", response_model=TournamentResponse)
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tourney

@router.delete("/{tournament_id}")
def delete_tournament(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    
    # Soft delete -> moves tournament to history
    tourney.is_deleted = True
    tourney.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Tournament moved to history successfully", "status": "archived"}

@router.post("/{tournament_id}/restore")
def restore_tournament(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    
    # Restore tournament
    tourney.is_deleted = False
    tourney.deleted_at = None
    db.commit()
    return {"message": "Tournament restored successfully", "tournament_id": tourney.id}

@router.delete("/{tournament_id}/permanent")
def permanent_delete_tournament(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    db.delete(tourney)
    db.commit()
    return {"message": "Tournament permanently deleted"}


# Upload team photo
@router.post("/upload/team-photo")
async def upload_team_photo(file: UploadFile = File(...)):
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"}
    filename = file.filename or "team_photo.png"
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    
    unique_name = f"team_{uuid.uuid4().hex[:12]}{ext}"
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    upload_dir = os.path.join(base_dir, "static", "uploads", "teams")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/static/uploads/teams/{unique_name}"}


# Upload player photo
@router.post("/upload/player-photo")
async def upload_player_photo(file: UploadFile = File(...)):
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"}
    filename = file.filename or "player_photo.png"
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    
    unique_name = f"player_{uuid.uuid4().hex[:12]}{ext}"
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    upload_dir = os.path.join(base_dir, "static", "uploads", "players")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/static/uploads/players/{unique_name}"}


@router.post("/{tournament_id}/teams", response_model=TeamResponse)
def add_team(tournament_id: int, payload: TeamCreate, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    
    team = Team(
        tournament_id=tournament_id,
        name=payload.name,
        short_name=payload.short_name or payload.name[:3].upper(),
        logo_url=payload.logo_url
    )
    db.add(team)
    db.flush()

    if payload.players:
        for p in payload.players:
            if p.name and p.name.strip():
                player = Player(
                    team_id=team.id,
                    name=p.name.strip(),
                    photo_url=p.photo_url,
                    is_captain=bool(p.is_captain)
                )
                db.add(player)
    
    db.commit()
    db.refresh(team)
    return team

@router.put("/teams/{team_id}", response_model=TeamResponse)
def update_team(team_id: int, payload: TeamUpdate, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if payload.name is not None:
        team.name = payload.name
    if payload.short_name is not None:
        team.short_name = payload.short_name
    if payload.logo_url is not None:
        team.logo_url = payload.logo_url
    
    db.commit()
    db.refresh(team)
    return team

@router.post("/teams/{team_id}/photo", response_model=TeamResponse)
async def update_team_photo(team_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"}
    filename = file.filename or "team_photo.png"
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    
    unique_name = f"team_{team_id}_{uuid.uuid4().hex[:8]}{ext}"
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    upload_dir = os.path.join(base_dir, "static", "uploads", "teams")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    team.logo_url = f"/static/uploads/teams/{unique_name}"
    db.commit()
    db.refresh(team)
    return team

@router.post("/teams/{team_id}/players", response_model=PlayerResponse)
def add_player(team_id: int, payload: PlayerCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if payload.is_captain:
        # Unmark existing captains in this team
        db.query(Player).filter(Player.team_id == team_id).update({Player.is_captain: False})
        
    player = Player(
        team_id=team_id,
        name=payload.name.strip(),
        photo_url=payload.photo_url,
        is_captain=bool(payload.is_captain)
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player

@router.put("/players/{player_id}", response_model=PlayerResponse)
def update_player(player_id: int, payload: PlayerUpdate, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    if payload.name is not None:
        player.name = payload.name.strip()
    if payload.photo_url is not None:
        player.photo_url = payload.photo_url
    if payload.is_captain is not None:
        if payload.is_captain:
            # Unmark existing captains in this team
            db.query(Player).filter(Player.team_id == player.team_id).update({Player.is_captain: False})
        player.is_captain = bool(payload.is_captain)
    
    db.commit()
    db.refresh(player)
    return player

@router.post("/players/{player_id}/photo", response_model=PlayerResponse)
async def update_player_photo(player_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"}
    filename = file.filename or "player_photo.png"
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    
    unique_name = f"player_{player_id}_{uuid.uuid4().hex[:8]}{ext}"
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    upload_dir = os.path.join(base_dir, "static", "uploads", "players")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    player.photo_url = f"/static/uploads/players/{unique_name}"
    db.commit()
    db.refresh(player)
    return player

@router.delete("/teams/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    db.delete(team)
    db.commit()
    return {"message": "Team deleted"}

@router.delete("/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return {"message": "Player deleted"}

@router.get("/{tournament_id}/points")
def get_points(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return get_points_table(db, tournament_id)

@router.get("/{tournament_id}/stats")
def get_stats(tournament_id: int, db: Session = Depends(get_db)):
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return get_tournament_leaderboards(db, tournament_id)
