import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.models import Tournament, Team, Player, Match, Innings, Delivery, Wicket
from app.services.scoring_engine import (
    start_match,
    start_second_innings,
    record_delivery,
    declare_batsman,
    swap_strike,
    change_bowler,
    select_new_batter,
    undo_last_delivery,
    undo_toss,
    get_live_match_state,
    get_full_scorecard,
    calculate_overs_display,
    calculate_crr
)
from app.services.stats_service import get_points_table

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def setup_sample_tournament(db):
    tourney = Tournament(name="Hostel Cup 2026", format_overs=5)
    db.add(tourney)
    db.flush()

    team_a = Team(tournament_id=tourney.id, name="Team A", short_name="TMA")
    team_b = Team(tournament_id=tourney.id, name="Team B", short_name="TMB")
    db.add_all([team_a, team_b])
    db.flush()

    # Players for Team A
    p_a1 = Player(team_id=team_a.id, name="Rahul")
    p_a2 = Player(team_id=team_a.id, name="Amit")
    p_a3 = Player(team_id=team_a.id, name="Rohit")
    p_a4 = Player(team_id=team_a.id, name="Vikas")

    # Players for Team B
    p_b1 = Player(team_id=team_b.id, name="Patel")
    p_b2 = Player(team_id=team_b.id, name="Sharma")
    p_b3 = Player(team_id=team_b.id, name="Kohli")
    p_b4 = Player(team_id=team_b.id, name="Jadeja")

    db.add_all([p_a1, p_a2, p_a3, p_a4, p_b1, p_b2, p_b3, p_b4])
    db.commit()

    match = Match(
        tournament_id=tourney.id,
        match_number=1,
        team1_id=team_a.id,
        team2_id=team_b.id,
        total_overs=2, # 2 overs for quick testing
        status="upcoming"
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return tourney, team_a, team_b, match

def test_start_match_and_scoring(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    
    # Start match: Team A bats first, Rahul on strike, Amit non-striker, Patel bowling
    players_a = team_a.players
    players_b = team_b.players
    
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    state = get_live_match_state(db_session, match.id)
    assert state["status"] == "live"
    assert state["runs"] == 0
    assert state["wickets"] == 0
    assert state["striker"]["name"] == "Rahul"
    assert state["non_striker"]["name"] == "Amit"
    assert state["current_bowler"]["name"] == "Patel"

    # Ball 1: 1 run (Rahul scores 1 -> Amit comes to strike)
    record_delivery(db_session, match.id, runs_batter=1)
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 1
    assert state["legal_balls"] == 1
    assert state["overs_display"] == "0.1"
    assert state["striker"]["name"] == "Amit"
    assert state["non_striker"]["name"] == "Rahul"
    assert state["striker"]["runs"] == 0
    assert state["non_striker"]["runs"] == 1

    # Ball 2: 4 runs (Amit hits four -> remains on strike)
    record_delivery(db_session, match.id, runs_batter=4)
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 5
    assert state["legal_balls"] == 2
    assert state["striker"]["name"] == "Amit"
    assert state["striker"]["runs"] == 4
    assert state["striker"]["fours"] == 1

    # Ball 3: Wide (+1 extra, legal ball does NOT advance)
    record_delivery(db_session, match.id, runs_batter=0, extras_type="wide", extras_runs=0)
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 6
    assert state["legal_balls"] == 2
    assert state["overs_display"] == "0.2"

    # Ball 4: Wicket (Amit caught, Rohit comes to crease)
    record_delivery(
        db_session,
        match.id,
        is_wicket=True,
        wicket_type="caught",
        player_out_id=players_a[1].id, # Amit
        new_batter_id=players_a[2].id  # Rohit
    )
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 6
    assert state["wickets"] == 1
    assert state["legal_balls"] == 3
    assert state["striker"]["name"] == "Rohit"
    assert state["non_striker"]["name"] == "Rahul"

def test_undo_delivery(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Record a six
    record_delivery(db_session, match.id, runs_batter=6)
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 6
    assert state["legal_balls"] == 1

    # Undo
    undo_last_delivery(db_session, match.id)
    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 0
    assert state["legal_balls"] == 0
    assert state["overs_display"] == "0.0"

def test_full_match_and_points_table(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    # Innings 1: 1 Over match
    match.total_overs = 1
    db_session.commit()

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # 6 balls in 1st innings: 2, 4, 6, 1, 0, 1 = 14 runs
    for runs in [2, 4, 6, 1, 0, 1]:
        record_delivery(db_session, match.id, runs_batter=runs)

    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 14
    assert state["is_innings_complete"] is True
    assert state["is_innings_break"] is True
    assert state["innings1_data"] is not None
    assert state["innings1_data"]["total_runs"] == 14
    assert state["innings1_data"]["target"] == 15
    assert state["innings1_data"]["top_batter"] is not None
    assert state["innings1_data"]["top_bowler"] is not None

    # Start Innings 2: Team B chases Target of 15 runs
    start_second_innings(
        db=db_session,
        match_id=match.id,
        striker_id=players_b[0].id,
        non_striker_id=players_b[1].id,
        bowler_id=players_a[0].id
    )

    state = get_live_match_state(db_session, match.id)
    assert state["is_innings_break"] is False
    assert state["target"] == 15
    assert state["required_runs"] == 15
    assert state["innings1_summary"] is not None
    assert "14" in state["innings1_summary"]

    # Team B hits 6, 6, 4 = 16 runs -> Wins!
    record_delivery(db_session, match.id, runs_batter=6)
    record_delivery(db_session, match.id, runs_batter=6)
    record_delivery(db_session, match.id, runs_batter=4)

    state = get_live_match_state(db_session, match.id)
    assert state["is_match_complete"] is True
    assert "won" in state["result_text"].lower()

    # Test undoing the winning delivery!
    undo_last_delivery(db_session, match.id)
    reopened_state = get_live_match_state(db_session, match.id)
    assert reopened_state["status"] == "live"
    assert reopened_state["is_match_complete"] is False
    assert reopened_state["result_text"] is None
    assert reopened_state["runs"] == 12  # 6 + 6 = 12 (the four was undid)
    assert reopened_state["target"] == 15
    assert reopened_state["required_runs"] == 3

    # Verify Points Table after match reopened (should be 0 points each as match is live again)
    table_reopened = get_points_table(db_session, tourney.id)
    assert table_reopened[0]["points"] == 0
    assert table_reopened[1]["points"] == 0

def test_mid_over_change_bowler_restart_over(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    # Start match
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: 4 runs
    record_delivery(db_session, match.id, runs_batter=4)
    # Ball 2: 2 runs
    record_delivery(db_session, match.id, runs_batter=2)

    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 6
    assert state["overs_display"] == "0.2"

    # Change Bowler mid-over with restart over enabled (reset_over_balls=True)
    from app.services.scoring_engine import change_bowler
    change_bowler(db_session, match.id, new_bowler_id=players_b[1].id, reset_over_balls=True)

    state_after_change = get_live_match_state(db_session, match.id)
    # Runs MUST stay the same (6 runs)
    assert state_after_change["runs"] == 6
    # Over balls MUST restart from 1st ball (0.0)
    assert state_after_change["overs_display"] == "0.0"
    assert state_after_change["legal_balls"] == 0
    assert state_after_change["current_bowler"]["name"] == players_b[1].name

    # New bowler bowls 1st ball: 1 run
    record_delivery(db_session, match.id, runs_batter=1)
    state_next = get_live_match_state(db_session, match.id)
    assert state_next["runs"] == 7
    assert state_next["overs_display"] == "0.1"

def test_noball_and_wide_with_wicket(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: No Ball + 1 Run + Run Out
    record_delivery(
        db_session,
        match.id,
        runs_batter=1,
        extras_type="noball",
        extras_runs=0,
        is_wicket=True,
        wicket_type="run_out",
        player_out_id=players_a[1].id, # Non-striker run out
        new_batter_id=players_a[2].id  # New batter comes in
    )

    state = get_live_match_state(db_session, match.id)
    # 1 penalty + 1 run = 2 runs
    assert state["runs"] == 2
    assert state["wickets"] == 1
    # Legal ball NOT incremented on No Ball
    assert state["legal_balls"] == 0
    assert state["overs_display"] == "0.0"
    assert state["current_over_balls"][0]["display"] == "W+1Nb"

    # Ball 2: Wide + Stumped
    record_delivery(
        db_session,
        match.id,
        runs_batter=0,
        extras_type="wide",
        extras_runs=0,
        is_wicket=True,
        wicket_type="stumped",
        player_out_id=players_a[0].id, # Striker stumped
        new_batter_id=players_a[3].id  # New batter
    )

    state2 = get_live_match_state(db_session, match.id)
    # 2 runs + 1 wide = 3 runs
    assert state2["runs"] == 3
    assert state2["wickets"] == 2
    # Legal ball NOT incremented on Wide
    assert state2["legal_balls"] == 0
    assert state2["overs_display"] == "0.0"
    assert state2["current_over_balls"][1]["display"] == "W+Wd"

def test_swap_strike(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    state = get_live_match_state(db_session, match.id)
    assert state["striker"]["name"] == players_a[0].name
    assert state["non_striker"]["name"] == players_a[1].name

    # Swap strike manually
    swap_strike(db_session, match.id)

    state_swapped = get_live_match_state(db_session, match.id)
    assert state_swapped["striker"]["name"] == players_a[1].name
    assert state_swapped["non_striker"]["name"] == players_a[0].name

def test_dic_declared_delivery(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: DIC with 1 run
    record_delivery(
        db=db_session,
        match_id=match.id,
        runs_batter=1,
        extras_type="dic",
        extras_runs=0
    )

    state = get_live_match_state(db_session, match.id)
    # 1 run added to innings total
    assert state["runs"] == 1
    # Legal ball count increases
    assert state["legal_balls"] == 1
    assert state["overs_display"] == "0.1"
    # Striker gets 1 run and 1 ball faced
    assert state["striker"]["id"] == players_a[0].id  # Strike did NOT rotate on 1 DIC!
    assert state["striker"]["runs"] == 1
    assert state["striker"]["balls"] == 1
    # Bowler conceded 1 run and bowled 1 legal ball
    assert state["current_bowler"]["runs"] == 1
    assert state["current_bowler"]["legal_balls"] == 1
    # Current over chip display
    assert state["current_over_balls"][0]["display"] == "1D"

    # Ball 2: DIC with 3 runs
    record_delivery(
        db=db_session,
        match_id=match.id,
        runs_batter=3,
        extras_type="dic",
        extras_runs=0
    )

    state2 = get_live_match_state(db_session, match.id)
    # Total runs = 1 + 3 = 4
    assert state2["runs"] == 4
    assert state2["legal_balls"] == 2
    assert state2["overs_display"] == "0.2"
    # Striker still stays on strike (3 DIC does not rotate strike)
    assert state2["striker"]["id"] == players_a[0].id
    assert state2["striker"]["runs"] == 4  # 1 + 3 = 4
    assert state2["striker"]["balls"] == 2
    assert state2["current_over_balls"][1]["display"] == "3D"

def test_penalty_runs_addition_and_deduction(db_session):
    from app.services.scoring_engine import apply_penalty_runs
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: 4 runs
    record_delivery(db_session, match.id, runs_batter=4)

    state = get_live_match_state(db_session, match.id)
    assert state["runs"] == 4

    # Apply +5 penalty runs to batting team (Team A)
    apply_penalty_runs(db_session, match.id, team_id=team_a.id, penalty_runs=5, reason="Slow Over Rate Penalty")

    state_after_add = get_live_match_state(db_session, match.id)
    # 4 + 5 = 9 runs
    assert state_after_add["runs"] == 9
    # Balls faced or legal balls unchanged
    assert state_after_add["legal_balls"] == 1

    # Deduct -2 runs from batting team (Team A)
    apply_penalty_runs(db_session, match.id, team_id=team_a.id, penalty_runs=-2, reason="Disciplinary Run Deduction")

    state_after_deduct = get_live_match_state(db_session, match.id)
    # 9 - 2 = 7 runs
    assert state_after_deduct["runs"] == 7
    assert state_after_deduct["legal_balls"] == 1

def test_max_overs_per_bowler_limit(db_session):
    from app.services.scoring_engine import change_bowler
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    # Start match with max 1 over per bowler
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id,
        max_overs_per_bowler=1
    )

    # Bowl 6 legal deliveries by bowler 0 (Patel)
    for _ in range(6):
        record_delivery(db_session, match.id, runs_batter=1)

    state = get_live_match_state(db_session, match.id)
    assert state["max_overs_per_bowler"] == 1
    
    # Check bowler status in available_bowlers
    patel_info = next(b for b in state["available_bowlers"] if b["id"] == players_b[0].id)
    assert patel_info["completed_overs"] == 1
    assert patel_info["is_max_reached"] is True

    other_bowler_info = next(b for b in state["available_bowlers"] if b["id"] == players_b[1].id)
    assert other_bowler_info["is_max_reached"] is False

    # Switching to player_b[1] should succeed
    change_bowler(db_session, match.id, new_bowler_id=players_b[1].id)

    # Attempting to switch back to player_b[0] who reached max quota (1 over) must raise ValueError
    with pytest.raises(ValueError, match="already bowled the maximum quota"):
        change_bowler(db_session, match.id, new_bowler_id=players_b[0].id)

def test_tournament_top_performers(db_session):
    from app.services.stats_service import get_tournament_leaderboards
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: 6 runs by player_a[0]
    record_delivery(db_session, match.id, runs_batter=6)
    # Ball 2: 4 runs by player_a[0]
    record_delivery(db_session, match.id, runs_batter=4)
    # Ball 3: wicket by bowler player_b[0]
    record_delivery(db_session, match.id, runs_batter=0, is_wicket=True, wicket_type="bowled", player_out_id=players_a[0].id, new_batter_id=players_a[2].id)

    leaderboards = get_tournament_leaderboards(db_session, tourney.id)
    assert leaderboards["best_batsman"] is not None
    assert leaderboards["best_batsman"]["player_id"] == players_a[0].id
    assert leaderboards["best_batsman"]["runs"] == 10
    
    assert leaderboards["best_bowler"] is not None
    assert leaderboards["best_bowler"]["player_id"] == players_b[0].id
    assert leaderboards["best_bowler"]["wickets"] == 1


def test_retired_and_other_dismissals(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: Retired hurt/out
    record_delivery(
        db=db_session,
        match_id=match.id,
        runs_batter=0,
        is_wicket=True,
        wicket_type="retired",
        player_out_id=players_a[0].id,
        new_batter_id=players_a[2].id
    )

    state = get_live_match_state(db_session, match.id)
    assert state["wickets"] == 1
    # Bowler should NOT get a wicket credit for retired batter
    assert state["current_bowler"]["wickets"] == 0

    # Ball 2: Other dismissal
    record_delivery(
        db=db_session,
        match_id=match.id,
        runs_batter=0,
        is_wicket=True,
        wicket_type="other",
        player_out_id=players_a[1].id
    )

    scorecard = get_full_scorecard(db_session, match.id)
    inn1_batting = scorecard["innings"][0]["batting"]
    dismissals = {b["id"]: b["dismissal"] for b in inn1_batting}
    assert dismissals[players_a[0].id] == "retired out"
    assert dismissals[players_a[1].id] == "out (other)"


def test_two_step_wicket_and_next_batter_selection(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Step 1: Wicket falls, scorer confirms wicket with new_batter_id=None
    record_delivery(
        db=db_session,
        match_id=match.id,
        runs_batter=0,
        is_wicket=True,
        wicket_type="bowled",
        player_out_id=players_a[0].id,
        new_batter_id=None
    )

    # Score and wickets update immediately
    state1 = get_live_match_state(db_session, match.id)
    assert state1["runs"] == 0
    assert state1["wickets"] == 1
    assert state1["legal_balls"] == 1
    assert state1["overs_display"] == "0.1"
    assert state1["striker"] is None
    assert state1["non_striker"]["name"] == players_a[1].name
    assert state1["needs_new_batter"] is True
    assert any(b["id"] == players_a[2].id for b in state1["available_batters"])

    # Step 2: Scorer selects next batter in dedicated modal
    select_new_batter(db=db_session, match_id=match.id, new_batter_id=players_a[2].id)

    state2 = get_live_match_state(db_session, match.id)
    assert state2["striker"]["name"] == players_a[2].name
    assert state2["non_striker"]["name"] == players_a[1].name
    assert state2["needs_new_batter"] is False


def test_dic_over_change_bowler_restart_over(db_session):
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: 4 runs by batsman
    record_delivery(db_session, match.id, runs_batter=4)
    # Ball 2: 1 run + 1 extra wide (2 runs total)
    record_delivery(db_session, match.id, runs_batter=0, extras_type="wide", extras_runs=1)
    # Ball 3: 2 runs
    record_delivery(db_session, match.id, runs_batter=2)

    # State before DIC Over: 4 + 2 + 2 = 8 runs, 2 legal balls (0.2 Ov)
    state_before = get_live_match_state(db_session, match.id)
    assert state_before["runs"] == 8
    assert state_before["legal_balls"] == 2
    assert state_before["overs_display"] == "0.2"
    assert state_before["current_bowler"]["name"] == players_b[0].name

    # DIC Over: Change bowler to players_b[1] and restart over from 1st ball
    change_bowler(db=db_session, match_id=match.id, new_bowler_id=players_b[1].id, reset_over_balls=True)

    state_after_dic = get_live_match_state(db_session, match.id)
    # Total match runs stay 8 (runs preserved!)
    assert state_after_dic["runs"] == 8
    # Over restarted from 1st ball (0.0 Ov)
    assert state_after_dic["legal_balls"] == 0
    assert state_after_dic["overs_display"] == "0.0"
    assert state_after_dic["current_bowler"]["name"] == players_b[1].name
    # Current over chips start cleanly for new bowler
    assert len(state_after_dic["current_over_balls"]) == 0

    # New bowler bowls full 6 legal balls
    for _ in range(6):
        record_delivery(db_session, match.id, runs_batter=1)

    state_over_done = get_live_match_state(db_session, match.id)
    assert state_over_done["runs"] == 14
    assert state_over_done["legal_balls"] == 6
    assert state_over_done["overs_display"] == "1.0"
    assert state_over_done["is_over_complete"] is True

def test_batsman_dic_declaration(db_session):
    """
    Tests Batsman DIC (Declared / Retired Out):
    - Declaring batter records retirement on scorecard without bowler wicket credit
    - Increments innings total wickets
    - Places incoming batter at the declared batter's crease position (striker or non-striker)
    """
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Ball 1: Striker scores 4 runs
    record_delivery(db_session, match.id, runs_batter=4)

    state1 = get_live_match_state(db_session, match.id)
    assert state1["runs"] == 4
    assert state1["wickets"] == 0
    assert state1["striker"]["id"] == players_a[0].id

    # Batsman DIC: Declare striker (players_a[0]), incoming batter is players_a[2]
    declare_batsman(
        db=db_session,
        match_id=match.id,
        player_out_id=players_a[0].id,
        new_batter_id=players_a[2].id
    )

    state2 = get_live_match_state(db_session, match.id)
    # Wicket count incremented to 1
    assert state2["wickets"] == 1
    # Match runs unchanged (4)
    assert state2["runs"] == 4
    # Incoming batter takes striker position
    assert state2["striker"]["id"] == players_a[2].id
    assert state2["non_striker"]["id"] == players_a[1].id
    # Bowler should NOT have a credited wicket for batsman declaration
    assert state2["current_bowler"]["wickets"] == 0

    # Verify dismissal record on full scorecard
    scorecard = get_full_scorecard(db_session, match.id)
    batters_dict = {b["id"]: b for b in scorecard["innings"][0]["batting"]}
    assert batters_dict[players_a[0].id]["dismissal"] == "retired out"
    assert batters_dict[players_a[0].id]["runs"] == 4


def test_batsman_dic_all_out_1st_innings(db_session):
    """
    When all batters are dismissed / declared in 1st innings,
    team is all-out and 1st innings completes, ready for 2nd innings.
    Team A has 4 players -> 3 wickets = All Out.
    """
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # 1st Wicket: Declare striker players_a[0], incoming players_a[2]
    declare_batsman(db_session, match.id, player_out_id=players_a[0].id, new_batter_id=players_a[2].id)

    # 2nd Wicket: Declare striker players_a[2], incoming players_a[3] (last bench batter)
    declare_batsman(db_session, match.id, player_out_id=players_a[2].id, new_batter_id=players_a[3].id)

    # 3rd Wicket: Declare non-striker players_a[1], no more batters available (all-out)
    declare_batsman(db_session, match.id, player_out_id=players_a[1].id, new_batter_id=None)

    state = get_live_match_state(db_session, match.id)
    assert state["wickets"] == 3
    assert state["is_innings_complete"] is True
    assert state["is_innings_break"] is True
    assert state["is_match_complete"] is False


def test_batsman_dic_all_out_2nd_innings_match_result(db_session):
    """
    When the chasing team is all out via batsman declaration in 2nd innings,
    match completes with winner and result text properly calculated.
    """
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Innings 1: Team A scores 20 runs
    for _ in range(3):
        record_delivery(db_session, match.id, runs_batter=6) # 18
    record_delivery(db_session, match.id, runs_batter=2) # 20

    # End 1st innings via declaration all out
    declare_batsman(db_session, match.id, player_out_id=players_a[0].id, new_batter_id=players_a[2].id)
    declare_batsman(db_session, match.id, player_out_id=players_a[2].id, new_batter_id=players_a[3].id)
    declare_batsman(db_session, match.id, player_out_id=players_a[1].id, new_batter_id=None)

    # Start 2nd innings: Team B chasing 21
    start_second_innings(
        db=db_session,
        match_id=match.id,
        striker_id=players_b[0].id,
        non_striker_id=players_b[1].id,
        bowler_id=players_a[0].id
    )

    # Team B scores 10 runs
    record_delivery(db_session, match.id, runs_batter=6)
    record_delivery(db_session, match.id, runs_batter=4)

    # Team B declares remaining wickets, causing all-out at 10 runs
    declare_batsman(db_session, match.id, player_out_id=players_b[0].id, new_batter_id=players_b[2].id)
    declare_batsman(db_session, match.id, player_out_id=players_b[2].id, new_batter_id=players_b[3].id)
    declare_batsman(db_session, match.id, player_out_id=players_b[1].id, new_batter_id=None)

    state = get_live_match_state(db_session, match.id)
    assert state["is_match_complete"] is True
    assert state["status"] == "completed"
    assert "won by 10 runs" in state["result_text"]


def test_undo_toss_before_balls_bowled(db_session):
    """
    Tests undoing toss when no balls have been bowled yet.
    The match is reverted to 'upcoming' status, innings 1 is deleted,
    and toss can be redone cleanly.
    """
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    # Start match with Toss: Team A elects to bat
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id,
        max_overs_per_bowler=2
    )

    state = get_live_match_state(db_session, match.id)
    assert state["status"] == "live"
    assert state["toss_winner_id"] == team_a.id
    assert state["toss_decision"] == "bat"
    assert state["current_innings_number"] == 1
    assert state["runs"] == 0

    # Undo Toss
    undone_match = undo_toss(db_session, match.id)
    assert undone_match.status == "upcoming"
    assert undone_match.toss_winner_id is None
    assert undone_match.toss_decision is None
    assert undone_match.current_innings_id is None

    # Verify live state after toss undo
    state_after = get_live_match_state(db_session, match.id)
    assert state_after["status"] == "upcoming"
    assert state_after["toss_winner_id"] is None
    assert state_after["toss_decision"] is None

    # Redo Toss with Team B electing to bowl
    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_b.id,
        toss_decision="bowl",
        striker_id=players_a[2].id,
        non_striker_id=players_a[3].id,
        bowler_id=players_b[1].id
    )

    state_redone = get_live_match_state(db_session, match.id)
    assert state_redone["status"] == "live"
    assert state_redone["toss_winner_id"] == team_b.id
    assert state_redone["toss_decision"] == "bowl"
    assert state_redone["striker"]["name"] == players_a[2].name
    assert state_redone["current_bowler"]["name"] == players_b[1].name


def test_undo_toss_guard_when_balls_exist(db_session):
    """
    Tests that undoing toss fails if deliveries have been bowled,
    and succeeds once those deliveries are undone.
    """
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Bowl 1 ball
    record_delivery(db_session, match.id, runs_batter=4)

    # Attempting to undo toss directly must raise ValueError
    with pytest.raises(ValueError, match="Cannot undo toss because 1 ball"):
        undo_toss(db_session, match.id)

    # Undo the 1 ball
    undo_last_delivery(db_session, match.id)

    # Now undoing toss succeeds!
    undone_match = undo_toss(db_session, match.id)
    assert undone_match.status == "upcoming"


def test_over_change_bowler_confirmation_and_scoring(db_session):
    """
    Tests that:
    1. An over finishing sets is_over_complete=True with previous bowler.
    2. Selecting and confirming the new bowler for the next over sets is_over_complete=False.
    3. Next over scoring (e.g. ball 1 of over 2) updates the score immediately without re-prompting.
    """
    from app.services.scoring_engine import change_bowler
    tourney, team_a, team_b, match = setup_sample_tournament(db_session)
    players_a = team_a.players
    players_b = team_b.players

    # 2 Overs match
    match.total_overs = 2
    db_session.commit()

    start_match(
        db=db_session,
        match_id=match.id,
        toss_winner_id=team_a.id,
        toss_decision="bat",
        striker_id=players_a[0].id,
        non_striker_id=players_a[1].id,
        bowler_id=players_b[0].id
    )

    # Bowl full 1st over (6 balls) by Bowler 0
    for _ in range(6):
        record_delivery(db_session, match.id, runs_batter=1)

    state1 = get_live_match_state(db_session, match.id)
    assert state1["runs"] == 6
    assert state1["legal_balls"] == 6
    assert state1["overs_display"] == "1.0"
    assert state1["is_over_complete"] is True
    assert state1["current_bowler"]["id"] == players_b[0].id

    # Confirm Bowler 1 for Over 2
    change_bowler(db_session, match.id, new_bowler_id=players_b[1].id)

    state_after_confirm = get_live_match_state(db_session, match.id)
    assert state_after_confirm["current_bowler"]["id"] == players_b[1].id
    assert state_after_confirm["is_over_complete"] is False  # Next over bowler is confirmed!

    # Record 1st ball of Over 2 (e.g. 4 runs)
    record_delivery(db_session, match.id, runs_batter=4)

    state_over2 = get_live_match_state(db_session, match.id)
    assert state_over2["runs"] == 10
    assert state_over2["legal_balls"] == 7
    assert state_over2["overs_display"] == "1.1"
    assert state_over2["is_over_complete"] is False
    assert state_over2["current_bowler"]["id"] == players_b[1].id







