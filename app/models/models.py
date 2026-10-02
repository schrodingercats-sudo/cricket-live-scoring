from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from app.database import Base

class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    format_overs = Column(Integer, default=10, nullable=False)
    status = Column(String(30), default="active", nullable=False) # 'active', 'completed'
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    teams = relationship("Team", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="tournament", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    short_name = Column(String(10), nullable=True)
    logo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tournament = relationship("Tournament", back_populates="teams")
    players = relationship("Player", back_populates="team", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    photo_url = Column(String(500), nullable=True)
    is_captain = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    team = relationship("Team", back_populates="players")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    match_number = Column(Integer, default=1, nullable=False)
    team1_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team2_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    total_overs = Column(Integer, default=10, nullable=False)
    max_overs_per_bowler = Column(Integer, nullable=True) # Max overs a single bowler can throw
    
    toss_winner_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    toss_decision = Column(String(10), nullable=True) # 'bat', 'bowl'
    status = Column(String(30), default="upcoming", nullable=False) # 'upcoming', 'live', 'completed'
    scheduled_date = Column(DateTime, nullable=True) # Date and time scheduled for the match
    
    current_innings_id = Column(Integer, nullable=True)
    winner_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    result_text = Column(String(200), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tournament = relationship("Tournament", back_populates="matches")
    team1 = relationship("Team", foreign_keys=[team1_id])
    team2 = relationship("Team", foreign_keys=[team2_id])
    toss_winner = relationship("Team", foreign_keys=[toss_winner_id])
    winner = relationship("Team", foreign_keys=[winner_id])
    innings = relationship("Innings", back_populates="match", cascade="all, delete-orphan", foreign_keys="Innings.match_id")


class Innings(Base):
    __tablename__ = "innings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    innings_number = Column(Integer, default=1, nullable=False) # 1 or 2
    batting_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    bowling_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    
    total_runs = Column(Integer, default=0, nullable=False)
    total_wickets = Column(Integer, default=0, nullable=False)
    total_overs_bowled = Column(Float, default=0.0, nullable=False) # e.g. 4.2
    legal_balls = Column(Integer, default=0, nullable=False)
    target_runs = Column(Integer, nullable=True) # set for 2nd innings
    is_completed = Column(Boolean, default=False, nullable=False)
    
    current_striker_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    current_non_striker_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    current_bowler_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    match = relationship("Match", back_populates="innings", foreign_keys=[match_id])
    batting_team = relationship("Team", foreign_keys=[batting_team_id])
    bowling_team = relationship("Team", foreign_keys=[bowling_team_id])
    striker = relationship("Player", foreign_keys=[current_striker_id])
    non_striker = relationship("Player", foreign_keys=[current_non_striker_id])
    bowler = relationship("Player", foreign_keys=[current_bowler_id])
    
    deliveries = relationship("Delivery", back_populates="innings", cascade="all, delete-orphan")
    wickets = relationship("Wicket", back_populates="innings", cascade="all, delete-orphan")


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    innings_id = Column(Integer, ForeignKey("innings.id", ondelete="CASCADE"), nullable=False)
    over_number = Column(Integer, nullable=False) # 0, 1, 2...
    ball_number = Column(Integer, nullable=False) # 1, 2, 3... in over
    legal_ball_number = Column(Integer, default=0, nullable=False) # cumulative legal balls
    
    batsman_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    non_striker_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    bowler_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    
    runs_batter = Column(Integer, default=0, nullable=False)
    extras_type = Column(String(20), default="none", nullable=False) # 'none', 'wide', 'noball', 'bye', 'legbye'
    extras_runs = Column(Integer, default=0, nullable=False)
    total_runs = Column(Integer, default=0, nullable=False)
    is_legal_delivery = Column(Boolean, default=True, nullable=False)
    is_wicket = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    innings = relationship("Innings", back_populates="deliveries")
    batsman = relationship("Player", foreign_keys=[batsman_id])
    non_striker = relationship("Player", foreign_keys=[non_striker_id])
    bowler = relationship("Player", foreign_keys=[bowler_id])
    wicket = relationship("Wicket", back_populates="delivery", uselist=False, cascade="all, delete-orphan")


class Wicket(Base):
    __tablename__ = "wickets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    delivery_id = Column(Integer, ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False)
    innings_id = Column(Integer, ForeignKey("innings.id", ondelete="CASCADE"), nullable=False)
    player_out_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    wicket_type = Column(String(30), nullable=False) # 'bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'other'
    fielder_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    delivery = relationship("Delivery", back_populates="wicket")
    innings = relationship("Innings", back_populates="wickets")
    player_out = relationship("Player", foreign_keys=[player_out_id])
    fielder = relationship("Player", foreign_keys=[fielder_id])
