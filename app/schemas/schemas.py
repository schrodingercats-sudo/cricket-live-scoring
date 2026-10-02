from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator

# Tournament Schemas
class TournamentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    format_overs: int = Field(default=10, ge=1, le=50)

class PlayerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    photo_url: Optional[str] = None
    is_captain: Optional[bool] = False

class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    photo_url: Optional[str] = None
    is_captain: Optional[bool] = None

class PlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    name: str
    photo_url: Optional[str] = None
    is_captain: bool = False

class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    short_name: Optional[str] = Field(None, max_length=10)
    logo_url: Optional[str] = None
    players: Optional[List[PlayerCreate]] = []

class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    short_name: Optional[str] = Field(None, max_length=10)
    logo_url: Optional[str] = None

class TeamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tournament_id: int
    name: str
    short_name: Optional[str] = None
    logo_url: Optional[str] = None
    players: List[PlayerResponse] = []

class TournamentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    format_overs: int
    status: str
    created_at: datetime
    teams: List[TeamResponse] = []

# Match Schemas
class MatchCreate(BaseModel):
    tournament_id: int
    match_number: Optional[int] = 1
    team1_id: int
    team2_id: int
    total_overs: int = Field(default=10, ge=1, le=50)
    max_overs_per_bowler: Optional[int] = Field(default=None, ge=1, le=50)
    scheduled_date: Optional[datetime] = None

class TossUpdate(BaseModel):
    toss_winner_id: int
    toss_decision: str = "bat"
    striker_id: int
    non_striker_id: int
    bowler_id: int
    total_overs: Optional[int] = None
    max_overs_per_bowler: Optional[int] = None

    @field_validator("toss_decision", mode="before")
    @classmethod
    def validate_toss_decision(cls, v: Any) -> str:
        if isinstance(v, str):
            clean = v.strip().lower()
            if clean in ("bat", "bowl"):
                return clean
        return "bat"

class SetActivePlayers(BaseModel):
    striker_id: Optional[int] = None
    non_striker_id: Optional[int] = None
    bowler_id: Optional[int] = None

class ChangeBowlerRequest(BaseModel):
    bowler_id: int
    reset_over_balls: bool = False


class SelectNewBatterRequest(BaseModel):
    new_batter_id: int

class PenaltyRunsRequest(BaseModel):
    team_id: int
    penalty_runs: int = Field(..., description="Penalty runs to add (positive) or deduct (negative)")
    reason: Optional[str] = "Penalty / Run adjustment"

class CustomBannerRequest(BaseModel):
    text: Optional[str] = Field(default="", description="Text or announcement to display on live screen")
    subtext: Optional[str] = None
    theme: Optional[str] = "fire" # fire, neon, danger, gold, cyber
    sound: Optional[str] = "fanfare" # fanfare, impact, roar, bell
    duration_ms: Optional[int] = 6000
    action: Optional[str] = "show" # show or hide

class MusicControlRequest(BaseModel):
    track: Optional[str] = Field(None, description="Filename of music track from music folder")
    action: str = Field(default="play", description="play or stop")
    volume: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)
    loop: Optional[bool] = False

class CommentaryDisplayRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500, description="Commentary text to display on live screen")


class RecordDeliveryRequest(BaseModel):
    runs_batter: int = Field(default=0, ge=0, le=7)
    extras_type: str = Field(default="none", pattern="^(none|wide|noball|bye|legbye|declared|dic)$")
    extras_runs: int = Field(default=0, ge=0, le=7)
    is_wicket: bool = False
    wicket_type: Optional[str] = None # bowled, caught, lbw, run_out, stumped, hit_wicket, other
    player_out_id: Optional[int] = None
    fielder_id: Optional[int] = None
    new_batter_id: Optional[int] = None

class DeclareBatsmanRequest(BaseModel):
    player_out_id: int
    new_batter_id: Optional[int] = None

# Batter & Bowler stats schema for live responses
class BatterLiveStat(BaseModel):
    id: int
    name: str
    runs: int
    balls: int
    fours: int
    sixes: int
    strike_rate: float
    is_on_strike: bool
    is_out: bool
    dismissal: Optional[str] = None

class BowlerLiveStat(BaseModel):
    id: int
    name: str
    overs: str
    maidens: int
    runs: int
    wickets: int
    economy: float
    is_current: bool

class OverBall(BaseModel):
    display: str # e.g. "0", "1", "4", "6", "W", "1Wd", "Nb", "W+1"
    is_wicket: bool = False
    runs: int = 0
    extras_type: str = "none"

class LiveMatchState(BaseModel):
    match_id: int
    tournament_name: str
    match_number: int
    status: str # upcoming, live, completed
    total_overs: int
    max_overs_per_bowler: Optional[int] = None
    current_innings_number: int
    batting_team: str
    batting_team_id: int
    batting_team_logo: Optional[str] = None
    bowling_team: str
    bowling_team_id: int
    bowling_team_logo: Optional[str] = None
    runs: int
    wickets: int
    overs_display: str # e.g. "4.2"
    legal_balls: int
    current_run_rate: float
    target: Optional[int] = None
    required_runs: Optional[int] = None
    required_balls: Optional[int] = None
    required_run_rate: Optional[float] = None
    striker: Optional[BatterLiveStat] = None
    non_striker: Optional[BatterLiveStat] = None
    current_bowler: Optional[BowlerLiveStat] = None
    recent_balls: List[OverBall] = []
    current_over_balls: List[OverBall] = []
    current_partnership_runs: int = 0
    current_partnership_balls: int = 0
    is_over_complete: bool = False
    is_innings_complete: bool = False
    is_match_complete: bool = False
    result_text: Optional[str] = None
    available_batters: List[PlayerResponse] = []
    available_bowlers: List[Any] = []
    innings1_summary: Optional[str] = None
