import logging
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from app.models.models import Match, Innings, Delivery, Wicket, Team, Player, Tournament

logger = logging.getLogger("cricket_app.scoring_engine")

def calculate_overs_display(legal_balls: int) -> str:
    overs = legal_balls // 6
    balls = legal_balls % 6
    return f"{overs}.{balls}"

def calculate_crr(runs: int, legal_balls: int) -> float:
    if legal_balls == 0:
        return 0.0
    return round((runs / legal_balls) * 6, 2)

def calculate_rrr(required_runs: int, required_balls: int) -> Optional[float]:
    if required_balls <= 0:
        return None
    return round((required_runs / required_balls) * 6, 2)

def start_match(
    db: Session,
    match_id: int,
    toss_winner_id: int,
    toss_decision: str,
    striker_id: int,
    non_striker_id: int,
    bowler_id: int,
    total_overs: Optional[int] = None,
    max_overs_per_bowler: Optional[int] = None
) -> Match:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    if total_overs is not None and total_overs > 0:
        match.total_overs = total_overs

    if max_overs_per_bowler is not None:
        match.max_overs_per_bowler = max_overs_per_bowler

    match.toss_winner_id = toss_winner_id
    match.toss_decision = toss_decision
    match.status = "live"

    # Determine batting & bowling team for 1st innings
    if toss_decision == "bat":
        batting_team_id = toss_winner_id
        bowling_team_id = match.team2_id if toss_winner_id == match.team1_id else match.team1_id
    else:
        bowling_team_id = toss_winner_id
        batting_team_id = match.team2_id if toss_winner_id == match.team1_id else match.team1_id

    # Clean up any existing unplayed innings for this match to prevent duplicate or conflicting innings
    existing_innings = db.query(Innings).filter(Innings.match_id == match.id).all()
    deliveries_count = db.query(Delivery).join(Innings, Delivery.innings_id == Innings.id).filter(Innings.match_id == match.id).count()
    if deliveries_count == 0 and existing_innings:
        match.current_innings_id = None
        db.flush()
        for inn in existing_innings:
            db.delete(inn)
        db.flush()

    # Create Innings 1
    innings1 = Innings(
        match_id=match.id,
        innings_number=1,
        batting_team_id=batting_team_id,
        bowling_team_id=bowling_team_id,
        total_runs=0,
        total_wickets=0,
        total_overs_bowled=0.0,
        legal_balls=0,
        is_completed=False,
        current_striker_id=striker_id,
        current_non_striker_id=non_striker_id,
        current_bowler_id=bowler_id
    )
    db.add(innings1)
    db.flush()

    match.current_innings_id = innings1.id
    db.commit()
    db.refresh(match)
    return match

def undo_toss(db: Session, match_id: int) -> Match:
    """
    Undoes / resets the match toss and opening player selections.
    Reverts the match status back to 'upcoming', removes unplayed innings,
    and clears toss winner, toss decision, current innings, winner, and result.
    """
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    # Check if match has any balls/deliveries recorded
    deliveries_count = db.query(Delivery).join(Innings, Delivery.innings_id == Innings.id).filter(Innings.match_id == match.id).count()
    if deliveries_count > 0:
        raise ValueError(f"Cannot undo toss because {deliveries_count} ball(s) have already been recorded. Please undo all deliveries first.")

    # Delete any innings associated with this match
    innings_list = db.query(Innings).filter(Innings.match_id == match.id).all()
    for inn in innings_list:
        db.delete(inn)
    db.flush()

    # Reset match fields
    match.toss_winner_id = None
    match.toss_decision = None
    match.current_innings_id = None
    match.status = "upcoming"
    match.winner_id = None
    match.result_text = None

    db.commit()
    db.refresh(match)
    return match

def start_second_innings(
    db: Session,
    match_id: int,
    striker_id: int,
    non_striker_id: int,
    bowler_id: int
) -> Innings:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    innings1 = db.query(Innings).filter(Innings.match_id == match.id, Innings.innings_number == 1).first()
    if not innings1:
        raise ValueError("Innings 1 not found")

    # Batting and Bowling swap for 2nd innings
    batting_team_id = innings1.bowling_team_id
    bowling_team_id = innings1.batting_team_id
    target_runs = innings1.total_runs + 1

    innings2 = Innings(
        match_id=match.id,
        innings_number=2,
        batting_team_id=batting_team_id,
        bowling_team_id=bowling_team_id,
        total_runs=0,
        total_wickets=0,
        total_overs_bowled=0.0,
        legal_balls=0,
        target_runs=target_runs,
        is_completed=False,
        current_striker_id=striker_id,
        current_non_striker_id=non_striker_id,
        current_bowler_id=bowler_id
    )
    db.add(innings2)
    db.flush()

    match.current_innings_id = innings2.id
    match.status = "live"
    db.commit()
    db.refresh(innings2)
    return innings2

def record_delivery(
    db: Session,
    match_id: int,
    runs_batter: int = 0,
    extras_type: str = "none", # none, wide, noball, bye, legbye
    extras_runs: int = 0,
    is_wicket: bool = False,
    wicket_type: Optional[str] = None,
    player_out_id: Optional[int] = None,
    fielder_id: Optional[int] = None,
    new_batter_id: Optional[int] = None
) -> Delivery:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match or not match.current_innings_id:
        raise ValueError("Match is not in a live state")

    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings or innings.is_completed:
        raise ValueError("Current innings is completed or invalid")

    striker_id = innings.current_striker_id
    non_striker_id = innings.current_non_striker_id
    bowler_id = innings.current_bowler_id

    if not striker_id or not non_striker_id or not bowler_id:
        raise ValueError("Active striker, non-striker, and bowler must all be set before recording a delivery")

    # Determine legal delivery & run calculations
    is_legal = True
    total_ball_runs = 0
    actual_batter_runs = runs_batter
    actual_extras_runs = extras_runs

    if extras_type == "wide":
        is_legal = False
        actual_batter_runs = 0
        actual_extras_runs = 1 + extras_runs # 1 penalty + extra byes/runs
        total_ball_runs = actual_extras_runs
    elif extras_type == "noball":
        is_legal = False
        actual_extras_runs = 1 + extras_runs # 1 penalty + extra
        total_ball_runs = actual_batter_runs + actual_extras_runs
    elif extras_type in ("bye", "legbye"):
        is_legal = True
        actual_batter_runs = 0
        actual_extras_runs = runs_batter + extras_runs
        total_ball_runs = actual_extras_runs
    elif extras_type in ("declared", "dic"):
        is_legal = True
        actual_batter_runs = runs_batter
        actual_extras_runs = 0
        total_ball_runs = actual_batter_runs
    else: # normal legal delivery
        is_legal = True
        actual_extras_runs = extras_runs
        total_ball_runs = actual_batter_runs + actual_extras_runs

    current_legal_balls = innings.legal_balls
    over_number = current_legal_balls // 6
    ball_in_over = (current_legal_balls % 6) + (1 if is_legal else 0)

    # Create delivery
    delivery = Delivery(
        innings_id=innings.id,
        over_number=over_number,
        ball_number=ball_in_over,
        legal_ball_number=current_legal_balls + (1 if is_legal else 0),
        batsman_id=striker_id,
        non_striker_id=non_striker_id,
        bowler_id=bowler_id,
        runs_batter=actual_batter_runs,
        extras_type=extras_type,
        extras_runs=actual_extras_runs,
        total_runs=total_ball_runs,
        is_legal_delivery=is_legal,
        is_wicket=is_wicket
    )
    db.add(delivery)
    db.flush()

    # Handle Wicket if any
    wicket_obj = None
    if is_wicket:
        out_player_id = player_out_id if player_out_id else striker_id
        wicket_obj = Wicket(
            delivery_id=delivery.id,
            innings_id=innings.id,
            player_out_id=out_player_id,
            wicket_type=wicket_type or "bowled",
            fielder_id=fielder_id
        )
        db.add(wicket_obj)
        innings.total_wickets += 1

    # Update innings totals
    innings.total_runs += total_ball_runs
    if is_legal:
        innings.legal_balls += 1
    
    innings.total_overs_bowled = float(calculate_overs_display(innings.legal_balls))

    # Strike Rotation Logic
    # 1. Runs completed: for 1, 3, 5 runs ran, batsmen swap ends (Declared runs do NOT swap ends)
    runs_for_rotation = 0
    if extras_type in ("none", "noball"):
        runs_for_rotation = actual_batter_runs
    elif extras_type in ("bye", "legbye", "wide"):
        runs_for_rotation = actual_extras_runs if extras_type != "wide" else (actual_extras_runs - 1)
    elif extras_type in ("declared", "dic"):
        runs_for_rotation = 0 # Batting strike does NOT change on declared / dic

    next_striker = striker_id
    next_non_striker = non_striker_id

    if runs_for_rotation % 2 != 0:
        next_striker, next_non_striker = next_non_striker, next_striker

    # Handle replacement batter on wicket
    batting_players_count = db.query(Player).filter(Player.team_id == innings.batting_team_id).count()
    max_wickets = max(1, batting_players_count - 1) if batting_players_count > 1 else 10

    is_all_out = innings.total_wickets >= max_wickets

    if is_wicket and not is_all_out:
        out_player_id = player_out_id if player_out_id else striker_id
        if new_batter_id:
            if out_player_id == next_striker:
                next_striker = new_batter_id
            elif out_player_id == next_non_striker:
                next_non_striker = new_batter_id
            else:
                next_striker = new_batter_id
        else:
            if out_player_id == next_striker:
                next_striker = None
            elif out_player_id == next_non_striker:
                next_non_striker = None
            else:
                next_striker = None

    # Over completion check
    over_completed = is_legal and (innings.legal_balls % 6 == 0)
    if over_completed and not is_all_out:
        # Swap striker and non-striker at end of over
        next_striker, next_non_striker = next_non_striker, next_striker

    innings.current_striker_id = next_striker
    innings.current_non_striker_id = next_non_striker

    # Check Innings / Match Completion
    total_quota_balls = match.total_overs * 6
    is_overs_limit_reached = innings.legal_balls >= total_quota_balls

    if innings.innings_number == 1:
        if is_all_out or is_overs_limit_reached:
            innings.is_completed = True
    elif innings.innings_number == 2:
        target = innings.target_runs or 0
        if innings.total_runs >= target:
            # Chasing team won!
            innings.is_completed = True
            match.status = "completed"
            match.winner_id = innings.batting_team_id
            wickets_left = max_wickets - innings.total_wickets
            match.result_text = f"{innings.batting_team.name} won by {wickets_left} wickets"
        elif is_all_out or is_overs_limit_reached:
            innings.is_completed = True
            match.status = "completed"
            if innings.total_runs == target - 1:
                match.result_text = "Match Tied"
                match.winner_id = None
            elif innings.total_runs < target - 1:
                runs_diff = (target - 1) - innings.total_runs
                match.winner_id = innings.bowling_team_id
                match.result_text = f"{innings.bowling_team.name} won by {runs_diff} runs"

    db.commit()
    db.refresh(delivery)
    return delivery

def change_bowler(db: Session, match_id: int, new_bowler_id: int, reset_over_balls: bool = False):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match or not match.current_innings_id:
        raise ValueError("Match is not in a live state")
    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings:
        raise ValueError("Innings not found")
    
    # Check max overs per bowler limit
    if match.max_overs_per_bowler:
        bowler_legal_balls = db.query(Delivery).filter(
            Delivery.innings_id == innings.id,
            Delivery.bowler_id == new_bowler_id,
            Delivery.is_legal_delivery == True
        ).count()
        bowler_completed_overs = bowler_legal_balls // 6
        if bowler_completed_overs >= match.max_overs_per_bowler:
            bowler_player = db.query(Player).filter(Player.id == new_bowler_id).first()
            bowler_name = bowler_player.name if bowler_player else "Bowler"
            raise ValueError(f"{bowler_name} has already bowled the maximum quota of {match.max_overs_per_bowler} overs")

    current_legal_balls = innings.legal_balls
    balls_in_this_over = current_legal_balls % 6

    if reset_over_balls and balls_in_this_over > 0:
        # Mid-over bowler change with over restart (DIC Over):
        # Roll back legal balls of this unfinished over so new bowler bowls full 6 balls,
        # but KEEP all runs, extras, and wickets from previous balls counted in total score!
        current_over_idx = current_legal_balls // 6
        deliveries_in_cur_over = db.query(Delivery).filter(
            Delivery.innings_id == innings.id,
            Delivery.over_number == current_over_idx
        ).all()

        for d in deliveries_in_cur_over:
            d.is_legal_delivery = False
            d.over_number = -1

        innings.legal_balls = current_over_idx * 6
        innings.total_overs_bowled = float(calculate_overs_display(innings.legal_balls))

    innings.current_bowler_id = new_bowler_id
    db.commit()
    db.refresh(innings)
    return innings

def select_new_batter(db: Session, match_id: int, new_batter_id: int):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match or not match.current_innings_id:
        raise ValueError("Match is not in a live state")
    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings:
        raise ValueError("Innings not found")
    
    # Place new batter at vacant spot (or striker if vacant)
    if not innings.current_striker_id:
        innings.current_striker_id = new_batter_id
    elif not innings.current_non_striker_id:
        innings.current_non_striker_id = new_batter_id
    else:
        innings.current_striker_id = new_batter_id

    db.commit()
    db.refresh(innings)
    return innings

def swap_strike(db: Session, match_id: int):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match or not match.current_innings_id:
        raise ValueError("Match is not in a live state")
    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings:
        raise ValueError("Innings not found")

    if not innings.current_striker_id or not innings.current_non_striker_id:
        raise ValueError("Both striker and non-striker must be set on crease to swap strike")

    # Swap striker and non-striker
    innings.current_striker_id, innings.current_non_striker_id = (
        innings.current_non_striker_id,
        innings.current_striker_id
    )
    db.commit()
    db.refresh(innings)
    return innings

def declare_batsman(
    db: Session,
    match_id: int,
    player_out_id: int,
    new_batter_id: Optional[int] = None
):
    """
    Declares a batter's innings complete (Batsman DIC / Retired Out).
    Records the retirement on the scorecard, increments innings wickets,
    and places the incoming new batter at the declared batter's crease position (striker or non-striker).
    """
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match or not match.current_innings_id:
        raise ValueError("Match is not in a live state")
    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings:
        raise ValueError("Innings not found")

    if player_out_id not in (innings.current_striker_id, innings.current_non_striker_id):
        raise ValueError("Selected player is not currently batting on the crease")

    # Determine which end was vacated
    is_striker_out = (player_out_id == innings.current_striker_id)

    # Record delivery / wicket entry for the retirement without advancing legal balls or over
    delivery = Delivery(
        innings_id=innings.id,
        bowler_id=innings.current_bowler_id,
        batsman_id=player_out_id,
        non_striker_id=innings.current_non_striker_id if is_striker_out else innings.current_striker_id,
        runs_batter=0,
        extras_type="none",
        extras_runs=0,
        total_runs=0,
        is_wicket=True,
        is_legal_delivery=False,
        over_number=innings.legal_balls // 6,
        ball_number=0
    )
    db.add(delivery)
    db.flush()

    wicket = Wicket(
        delivery_id=delivery.id,
        innings_id=innings.id,
        player_out_id=player_out_id,
        wicket_type="retired",
        fielder_id=None
    )
    db.add(wicket)

    innings.total_wickets += 1

    # Check all out condition
    batting_players_count = db.query(Player).filter(Player.team_id == innings.batting_team_id).count()
    max_wickets = max(1, batting_players_count - 1) if batting_players_count > 1 else 10

    # Determine remaining available bench batters
    out_player_ids = set(
        row[0] for row in db.query(Wicket.player_out_id).filter(Wicket.innings_id == innings.id).all()
    )
    other_batter_on_crease = innings.current_non_striker_id if is_striker_out else innings.current_striker_id
    if other_batter_on_crease:
        out_player_ids.add(other_batter_on_crease)

    bench_batters_count = db.query(Player).filter(
        Player.team_id == innings.batting_team_id,
        ~Player.id.in_(out_player_ids)
    ).count()

    is_all_out = (innings.total_wickets >= max_wickets) or (bench_batters_count == 0 and not new_batter_id) or (new_batter_id is None and innings.total_wickets >= max_wickets)

    if not is_all_out and new_batter_id:
        # Place new batter at the vacated spot
        if is_striker_out:
            innings.current_striker_id = new_batter_id
        else:
            innings.current_non_striker_id = new_batter_id
    else:
        # Vacate the spot
        if is_striker_out:
            innings.current_striker_id = None
        else:
            innings.current_non_striker_id = None

    # Handle innings / match completion if all out
    if is_all_out:
        innings.is_completed = True
        if innings.innings_number == 1:
            # 1st Innings completed (Innings break ready for 2nd innings)
            innings.is_completed = True
        elif innings.innings_number == 2:
            # 2nd Innings completed (Match completed)
            innings.is_completed = True
            match.status = "completed"
            target = innings.target_runs or 0
            if innings.total_runs >= target:
                match.winner_id = innings.batting_team_id
                wickets_left = max(0, max_wickets - innings.total_wickets)
                match.result_text = f"{innings.batting_team.name} won by {wickets_left} wickets"
            elif innings.total_runs == target - 1:
                match.result_text = "Match Tied"
                match.winner_id = None
            else:
                runs_diff = (target - 1) - innings.total_runs
                match.winner_id = innings.bowling_team_id
                match.result_text = f"{innings.bowling_team.name} won by {runs_diff} runs"

    db.commit()
    db.refresh(innings)
    return innings

def undo_last_delivery(db: Session, match_id: int) -> Optional[Delivery]:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    if not match.current_innings_id:
        latest_innings = db.query(Innings).filter(Innings.match_id == match.id).order_by(Innings.innings_number.desc()).first()
        if not latest_innings:
            raise ValueError("No innings found for this match")
        match.current_innings_id = latest_innings.id

    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    if not innings:
        raise ValueError("Innings not found")

    # Get the latest delivery in this innings
    last_delivery = db.query(Delivery).filter(Delivery.innings_id == innings.id).order_by(Delivery.id.desc()).first()
    if not last_delivery:
        # If no deliveries in 2nd innings, check if we can revert back to 1st innings
        if innings.innings_number == 2:
            innings1 = db.query(Innings).filter(Innings.match_id == match.id, Innings.innings_number == 1).first()
            if innings1:
                db.delete(innings)
                match.current_innings_id = innings1.id
                match.status = "live"
                match.result_text = None
                match.winner_id = None
                innings1.is_completed = False
                db.commit()
                return None
        if innings.innings_number == 1:
            raise ValueError("No deliveries to undo in this match. You can use 'Undo Toss' to reset opening selection.")
        raise ValueError("No deliveries to undo in this innings")

    # Delete the delivery (associated wicket is deleted via CASCADE)
    prev_striker_id = last_delivery.batsman_id
    prev_non_striker_id = last_delivery.non_striker_id
    prev_bowler_id = last_delivery.bowler_id

    db.delete(last_delivery)
    db.flush()

    # Recalculate innings stats from scratch for pure accuracy
    deliveries = db.query(Delivery).filter(Delivery.innings_id == innings.id).order_by(Delivery.id.asc()).all()
    wickets = db.query(Wicket).filter(Wicket.innings_id == innings.id).all()

    total_runs = sum(d.total_runs for d in deliveries)
    legal_balls = sum(1 for d in deliveries if d.is_legal_delivery)
    total_wickets = len(wickets)

    innings.total_runs = total_runs
    innings.legal_balls = legal_balls
    innings.total_wickets = total_wickets
    innings.total_overs_bowled = float(calculate_overs_display(legal_balls))
    innings.is_completed = False

    # Restore previous striker, non-striker, bowler
    innings.current_striker_id = prev_striker_id
    innings.current_non_striker_id = prev_non_striker_id
    innings.current_bowler_id = prev_bowler_id

    # Reopen match if completed
    match.status = "live"
    match.winner_id = None
    match.result_text = None

    db.commit()
    return last_delivery

def apply_penalty_runs(
    db: Session,
    match_id: int,
    team_id: int,
    penalty_runs: int,
    reason: Optional[str] = None
) -> Innings:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    innings = db.query(Innings).filter(
        Innings.match_id == match_id,
        Innings.batting_team_id == team_id
    ).order_by(Innings.innings_number.desc()).first()

    if not innings:
        raise ValueError("Cannot adjust runs: this team has not started their innings yet.")

    # Update total runs
    innings.total_runs = max(0, innings.total_runs + penalty_runs)

    # If Innings 1 is adjusted, recalculate target for Innings 2
    if innings.innings_number == 1:
        inn2 = db.query(Innings).filter(Innings.match_id == match_id, Innings.innings_number == 2).first()
        if inn2:
            inn2.target_runs = innings.total_runs + 1

    # If 2nd innings is adjusted and chase completed
    if innings.innings_number == 2 and innings.target_runs is not None and match.status == "live":
        if innings.total_runs >= innings.target_runs:
            batting_players_count = db.query(Player).filter(Player.team_id == innings.batting_team_id).count()
            max_wickets = max(1, batting_players_count - 1) if batting_players_count > 1 else 10
            wickets_left = max(0, max_wickets - innings.total_wickets)
            innings.is_completed = True
            match.status = "completed"
            match.winner_id = innings.batting_team_id
            match.result_text = f"{innings.batting_team.name} won by {wickets_left} wickets"

    db.commit()
    db.refresh(innings)
    return innings

def _get_innings_summary_data(db: Session, inn: Innings, match: Match) -> Optional[Dict[str, Any]]:
    if not inn:
        return None
    deliveries = db.query(Delivery).filter(Delivery.innings_id == inn.id).order_by(Delivery.id.asc()).all()
    wickets = db.query(Wicket).filter(Wicket.innings_id == inn.id).all()

    # Calculate batter stats
    batters_map = {}
    for p in inn.batting_team.players:
        batters_map[p.id] = {
            "name": p.name,
            "photo_url": p.photo_url,
            "runs": 0,
            "balls": 0,
            "fours": 0,
            "sixes": 0,
            "strike_rate": 0.0
        }

    bowlers_map = {}
    for p in inn.bowling_team.players:
        bowlers_map[p.id] = {
            "name": p.name,
            "photo_url": p.photo_url,
            "legal_balls": 0,
            "runs": 0,
            "wickets": 0,
            "maidens": 0,
            "economy": 0.0,
            "overs": "0.0"
        }

    overs_runs_map = {}
    for d in deliveries:
        if d.batsman_id in batters_map:
            if d.is_legal_delivery or d.extras_type == "noball":
                batters_map[d.batsman_id]["balls"] += 1
            batters_map[d.batsman_id]["runs"] += d.runs_batter
            if d.runs_batter == 4:
                batters_map[d.batsman_id]["fours"] += 1
            elif d.runs_batter == 6:
                batters_map[d.batsman_id]["sixes"] += 1

        if d.bowler_id in bowlers_map:
            if d.is_legal_delivery:
                bowlers_map[d.bowler_id]["legal_balls"] += 1
            if d.extras_type not in ("bye", "legbye"):
                bowlers_map[d.bowler_id]["runs"] += d.total_runs
            if d.is_wicket and d.wicket and d.wicket.wicket_type not in ("run_out", "retired"):
                bowlers_map[d.bowler_id]["wickets"] += 1

        ov_num = d.over_number
        if ov_num not in overs_runs_map:
            overs_runs_map[ov_num] = {"bowler_id": d.bowler_id, "runs": 0, "legal_balls": 0}
        overs_runs_map[ov_num]["runs"] += d.total_runs
        if d.is_legal_delivery:
            overs_runs_map[ov_num]["legal_balls"] += 1

    for ov_num, ov_data in overs_runs_map.items():
        if ov_data["legal_balls"] == 6 and ov_data["runs"] == 0:
            b_id = ov_data["bowler_id"]
            if b_id in bowlers_map:
                bowlers_map[b_id]["maidens"] += 1

    for b in batters_map.values():
        if b["balls"] > 0:
            b["strike_rate"] = round((b["runs"] / b["balls"]) * 100, 1)

    for b in bowlers_map.values():
        b["overs"] = calculate_overs_display(b["legal_balls"])
        if b["legal_balls"] > 0:
            b["economy"] = round((b["runs"] / b["legal_balls"]) * 6, 2)

    # Top batsman of innings 1 (most runs, then highest strike rate)
    batted = [b for b in batters_map.values() if b["balls"] > 0 or b["runs"] > 0]
    top_batter = max(batted, key=lambda x: (x["runs"], x["strike_rate"]), default=None)

    # Top bowler of innings 1 (most wickets, then lowest runs conceded)
    bowled = [b for b in bowlers_map.values() if b["legal_balls"] > 0]
    top_bowler = max(bowled, key=lambda x: (x["wickets"], -x["runs"]), default=None)

    overs_str = calculate_overs_display(inn.legal_balls)
    crr = calculate_crr(inn.total_runs, inn.legal_balls)

    return {
        "team_name": inn.batting_team.name,
        "team_id": inn.batting_team_id,
        "total_runs": inn.total_runs,
        "total_wickets": inn.total_wickets,
        "overs": overs_str,
        "legal_balls": inn.legal_balls,
        "crr": crr,
        "target": inn.total_runs + 1,
        "top_batter": top_batter,
        "top_bowler": top_bowler,
        "summary_text": f"{inn.batting_team.name} {inn.total_runs}/{inn.total_wickets} ({overs_str} Ov)"
    }

def _build_team_state(team) -> Dict[str, Any]:
    if not team:
        return {"id": None, "name": "", "short_name": "", "logo_url": None, "captain": None, "players": []}
    players_list = [
        {"id": p.id, "name": p.name, "photo_url": p.photo_url, "is_captain": getattr(p, "is_captain", False)}
        for p in team.players
    ]
    captain_obj = next((p for p in players_list if p.get("is_captain")), None)
    if not captain_obj and players_list:
        captain_obj = players_list[0]
    return {
        "id": team.id,
        "name": team.name,
        "short_name": getattr(team, "short_name", "") or "",
        "logo_url": team.logo_url,
        "captain": captain_obj,
        "players": players_list
    }

def get_live_match_state(db: Session, match_id: int) -> Dict[str, Any]:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    if match.status == "upcoming" or not match.current_innings_id:
        return {
            "match_id": match.id,
            "tournament_name": match.tournament.name if match.tournament else "",
            "match_number": match.match_number,
            "status": match.status,
            "total_overs": match.total_overs,
            "max_overs_per_bowler": match.max_overs_per_bowler,
            "runs": 0,
            "wickets": 0,
            "overs": "0.0",
            "overs_display": "0.0",
            "legal_balls": 0,
            "current_run_rate": 0.0,
            "current_innings_number": 0,
            "team1": _build_team_state(match.team1),
            "team2": _build_team_state(match.team2),
            "batting_team": match.team1.name if match.team1 else "",
            "bowling_team": match.team2.name if match.team2 else "",
            "batting_team_id": match.team1_id,
            "bowling_team_id": match.team2_id,
            "striker": None,
            "non_striker": None,
            "bowler": None,
            "current_over_balls": [],
            "recent_balls": [],
            "current_partnership": {"runs": 0, "balls": 0},
            "is_over_complete": False,
            "is_innings_complete": False,
            "is_match_complete": False,
            "needs_new_batter": False,
            "available_batters": [],
            "available_bowlers": [],
            "all_batters": [],
            "all_bowlers": [],
            "extras_breakdown": {"total": 0, "wides": 0, "noballs": 0, "byes": 0, "legbyes": 0, "penalty": 0},
            "fall_of_wickets": [],
            "last_ball": {"type": "MATCH NOT STARTED", "desc": "Awaiting toss & start of play", "runs": 0, "extras_type": "none", "is_wicket": False},
            "last_ball_tag": "MATCH NOT STARTED",
            "last_ball_desc": "Awaiting toss & start of play",
            "partnership_batter1": {"runs": 0, "balls": 0, "name": ""},
            "partnership_batter2": {"runs": 0, "balls": 0, "name": ""},
            "toss_winner_id": match.toss_winner_id,
            "toss_decision": match.toss_decision,
            "result_text": match.result_text
        }

    innings = db.query(Innings).filter(Innings.id == match.current_innings_id).first()
    deliveries = db.query(Delivery).filter(Delivery.innings_id == innings.id).order_by(Delivery.id.asc()).all()
    wickets = db.query(Wicket).filter(Wicket.innings_id == innings.id).order_by(Wicket.id.asc()).all()

    # Build out_player_ids map with Wicket object
    out_map = {w.player_out_id: w for w in wickets}

    # Batter stats computation
    batters_stat_map = {}
    for p in innings.batting_team.players:
        batters_stat_map[p.id] = {
            "id": p.id,
            "name": p.name,
            "photo_url": p.photo_url,
            "runs": 0,
            "balls": 0,
            "dots": 0,
            "fours": 0,
            "sixes": 0,
            "strike_rate": 0.0,
            "is_on_strike": (p.id == innings.current_striker_id),
            "is_out": (p.id in out_map),
            "dismissal": out_map.get(p.id).wicket_type if p.id in out_map else None
        }

    # Bowler stats computation
    bowlers_stat_map = {}
    for p in innings.bowling_team.players:
        bowlers_stat_map[p.id] = {
            "id": p.id,
            "name": p.name,
            "photo_url": p.photo_url,
            "legal_balls": 0,
            "maidens": 0,
            "runs": 0,
            "wickets": 0,
            "dots": 0,
            "overs": "0.0",
            "economy": 0.0,
            "wides": 0,
            "noballs": 0,
            "is_current": (p.id == innings.current_bowler_id)
        }

    # Extras breakdown tracking
    extras_breakdown = {
        "total": 0,
        "wides": 0,
        "noballs": 0,
        "byes": 0,
        "legbyes": 0,
        "penalty": 0
    }

    # Over-by-over analysis for maidens and over balls
    overs_runs_map = {}

    # Fall of wickets tracking
    running_fow_score = 0
    running_fow_legal = 0
    fall_of_wickets = []
    w_count = 0

    for d in deliveries:
        running_fow_score += d.total_runs
        if d.is_legal_delivery:
            running_fow_legal += 1

        # Fall of wicket record
        if d.is_wicket and d.wicket:
            w_count += 1
            p_out_name = d.wicket.player_out.name if d.wicket.player_out else "Batter"
            fall_of_wickets.append({
                "wicket_num": w_count,
                "player_name": p_out_name,
                "player_id": d.wicket.player_out_id,
                "runs": running_fow_score,
                "over": calculate_overs_display(running_fow_legal)
            })

        # Batter stats
        if d.batsman_id in batters_stat_map:
            # Ball counted for batter if legal OR no-ball
            if d.is_legal_delivery or d.extras_type == "noball":
                batters_stat_map[d.batsman_id]["balls"] += 1
                if d.runs_batter == 0 and not d.is_wicket:
                    batters_stat_map[d.batsman_id]["dots"] += 1
            batters_stat_map[d.batsman_id]["runs"] += d.runs_batter
            if d.runs_batter == 4:
                batters_stat_map[d.batsman_id]["fours"] += 1
            elif d.runs_batter == 6:
                batters_stat_map[d.batsman_id]["sixes"] += 1

        # Bowler stats
        if d.bowler_id in bowlers_stat_map:
            b_stat = bowlers_stat_map[d.bowler_id]
            if d.is_legal_delivery:
                b_stat["legal_balls"] += 1
                if d.total_runs == 0 and not d.extras_type:
                    b_stat["dots"] += 1
            # Bowler runs conceded (byes and leg byes do NOT count against bowler)
            if d.extras_type not in ("bye", "legbye"):
                b_stat["runs"] += d.total_runs
            
            # Bowler wickets (run outs & retired do NOT count as bowler wickets)
            if d.is_wicket and d.wicket and d.wicket.wicket_type not in ("run_out", "retired"):
                b_stat["wickets"] += 1

            if d.extras_type == "wide":
                b_stat["wides"] += d.extras_runs
            elif d.extras_type == "noball":
                b_stat["noballs"] += 1

        # Extras breakdown tally
        if d.extras_type == "wide":
            extras_breakdown["wides"] += d.extras_runs
            extras_breakdown["total"] += d.extras_runs
        elif d.extras_type == "noball":
            extras_breakdown["noballs"] += d.extras_runs
            extras_breakdown["total"] += d.extras_runs
        elif d.extras_type == "bye":
            extras_breakdown["byes"] += d.extras_runs
            extras_breakdown["total"] += d.extras_runs
        elif d.extras_type == "legbye":
            extras_breakdown["legbyes"] += d.extras_runs
            extras_breakdown["total"] += d.extras_runs
        elif d.extras_type in ("penalty", "pen"):
            extras_breakdown["penalty"] += d.extras_runs
            extras_breakdown["total"] += d.extras_runs

        # Over tally
        ov_num = d.over_number
        if ov_num not in overs_runs_map:
            overs_runs_map[ov_num] = {"bowler_id": d.bowler_id, "runs": 0, "legal_balls": 0}
        overs_runs_map[ov_num]["runs"] += d.total_runs
        if d.is_legal_delivery:
            overs_runs_map[ov_num]["legal_balls"] += 1

    # Calculate maidens
    for ov_num, ov_data in overs_runs_map.items():
        if ov_data["legal_balls"] == 6 and ov_data["runs"] == 0:
            b_id = ov_data["bowler_id"]
            if b_id in bowlers_stat_map:
                bowlers_stat_map[b_id]["maidens"] += 1

    # Finalize strike rates & economy
    for b_id, b_data in batters_stat_map.items():
        if b_data["balls"] > 0:
            b_data["strike_rate"] = round((b_data["runs"] / b_data["balls"]) * 100, 1)

    for b_id, b_data in bowlers_stat_map.items():
        b_data["overs"] = calculate_overs_display(b_data["legal_balls"])
        if b_data["legal_balls"] > 0:
            b_data["economy"] = round((b_data["runs"] / b_data["legal_balls"]) * 6, 2)

    # Format ball badges for current over
    current_over_balls = []
    current_over_idx = innings.legal_balls // 6
    for d in deliveries:
        if d.over_number == current_over_idx and (d.is_legal_delivery or d.extras_type in ("wide", "noball")):
            if d.extras_type == "wide":
                base = f"{d.extras_runs}Wd" if d.extras_runs > 1 else "Wd"
                display = f"W+{base}" if d.is_wicket else base
            elif d.extras_type == "noball":
                base = f"{d.runs_batter}Nb" if d.runs_batter > 0 else "Nb"
                display = f"W+{base}" if d.is_wicket else base
            elif d.extras_type == "bye":
                base = f"{d.extras_runs}B"
                display = f"W+{base}" if d.is_wicket else base
            elif d.extras_type == "legbye":
                base = f"{d.extras_runs}Lb"
                display = f"W+{base}" if d.is_wicket else base
            elif d.extras_type in ("declared", "dic"):
                base = f"{d.runs_batter}D"
                display = f"W+{base}" if d.is_wicket else base
            else:
                if d.is_wicket:
                    display = f"W+{d.runs_batter}" if d.runs_batter > 0 else "W"
                else:
                    display = str(d.runs_batter)

            current_over_balls.append({
                "display": display,
                "is_wicket": d.is_wicket,
                "runs": d.total_runs,
                "extras_type": d.extras_type
            })

    # Recent 12 balls
    recent_balls = []
    for d in deliveries[-12:]:
        if d.extras_type == "wide":
            base = f"{d.extras_runs}Wd" if d.extras_runs > 1 else "Wd"
            display = f"W+{base}" if d.is_wicket else base
        elif d.extras_type == "noball":
            base = f"{d.runs_batter}Nb" if d.runs_batter > 0 else "Nb"
            display = f"W+{base}" if d.is_wicket else base
        elif d.extras_type == "bye":
            base = f"{d.extras_runs}B"
            display = f"W+{base}" if d.is_wicket else base
        elif d.extras_type == "legbye":
            base = f"{d.extras_runs}Lb"
            display = f"W+{base}" if d.is_wicket else base
        elif d.extras_type in ("declared", "dic"):
            base = f"{d.runs_batter}D"
            display = f"W+{base}" if d.is_wicket else base
        else:
            if d.is_wicket:
                display = f"W+{d.runs_batter}" if d.runs_batter > 0 else "W"
            else:
                display = str(d.runs_batter)

        recent_balls.append({
            "display": display,
            "is_wicket": d.is_wicket,
            "runs": d.total_runs,
            "extras_type": d.extras_type
        })

    # Current partnership computation
    current_partnership_runs = 0
    current_partnership_balls = 0
    p_b1_runs = 0
    p_b1_balls = 0
    p_b2_runs = 0
    p_b2_balls = 0
    # Search backwards from last delivery until a wicket is encountered
    for d in reversed(deliveries):
        if d.is_wicket:
            break
        current_partnership_runs += d.total_runs
        if d.is_legal_delivery:
            current_partnership_balls += 1
            if innings.current_striker_id and d.batsman_id == innings.current_striker_id:
                p_b1_runs += d.runs_batter
                p_b1_balls += 1
            elif innings.current_non_striker_id and d.batsman_id == innings.current_non_striker_id:
                p_b2_runs += d.runs_batter
                p_b2_balls += 1
        elif d.extras_type == "noball":
            if innings.current_striker_id and d.batsman_id == innings.current_striker_id:
                p_b1_runs += d.runs_batter
                p_b1_balls += 1
            elif innings.current_non_striker_id and d.batsman_id == innings.current_non_striker_id:
                p_b2_runs += d.runs_batter
                p_b2_balls += 1

    # Striker & Non-striker objects
    striker_obj = batters_stat_map.get(innings.current_striker_id)
    non_striker_obj = batters_stat_map.get(innings.current_non_striker_id)
    bowler_obj = bowlers_stat_map.get(innings.current_bowler_id)

    partnership_batter1 = {
        "id": striker_obj["id"] if striker_obj else None,
        "name": striker_obj["name"] if striker_obj else "Striker",
        "runs": p_b1_runs,
        "balls": p_b1_balls
    }
    partnership_batter2 = {
        "id": non_striker_obj["id"] if non_striker_obj else None,
        "name": non_striker_obj["name"] if non_striker_obj else "Non-Striker",
        "runs": p_b2_runs,
        "balls": p_b2_balls
    }

    # Build ALL BATSMEN list for Commentator Dashboard
    all_batters_list = []
    for p in innings.batting_team.players:
        b_stat = batters_stat_map.get(p.id)
        if not b_stat:
            continue
        is_striker = (p.id == innings.current_striker_id)
        is_non_striker = (p.id == innings.current_non_striker_id)
        is_out = (p.id in out_map)
        has_batted = (b_stat["balls"] > 0 or b_stat["runs"] > 0 or is_striker or is_non_striker or is_out)
        
        dismissal_text = "not out"
        status_label = "YET TO BAT"
        status_class = "yet_to_bat"

        if is_striker:
            status_label = "STRIKER"
            status_class = "striker"
            dismissal_text = "batting"
        elif is_non_striker:
            status_label = "NOT OUT"
            status_class = "not_out"
            dismissal_text = "batting"
        elif is_out:
            w_item = out_map[p.id]
            w_type = w_item.wicket_type or "out"
            f_name = w_item.fielder.name if getattr(w_item, "fielder", None) else ""
            b_name = w_item.delivery.bowler.name if getattr(w_item, "delivery", None) and getattr(w_item.delivery, "bowler", None) else ""
            
            if w_type == "bowled":
                dismissal_text = f"b {b_name}" if b_name else "b bowler"
            elif w_type == "caught":
                dismissal_text = f"c {f_name} b {b_name}" if f_name and b_name else (f"c {f_name}" if f_name else "caught")
            elif w_type == "lbw":
                dismissal_text = f"lbw b {b_name}" if b_name else "lbw"
            elif w_type == "run_out":
                dismissal_text = f"run out ({f_name})" if f_name else "run out"
            elif w_type == "stumped":
                dismissal_text = f"st {f_name} b {b_name}" if f_name and b_name else "stumped"
            elif w_type == "hit_wicket":
                dismissal_text = f"hit wicket b {b_name}" if b_name else "hit wicket"
            elif w_type == "retired":
                dismissal_text = "retired out"
            else:
                dismissal_text = w_type.replace("_", " ")

            status_label = "OUT"
            status_class = "out"
        elif has_batted:
            status_label = "NOT OUT"
            status_class = "not_out"
            dismissal_text = "not out"

        all_batters_list.append({
            "id": p.id,
            "name": p.name,
            "photo_url": p.photo_url,
            "runs": b_stat["runs"],
            "balls": b_stat["balls"],
            "dots": b_stat["dots"],
            "fours": b_stat["fours"],
            "sixes": b_stat["sixes"],
            "strike_rate": b_stat["strike_rate"],
            "status": status_label,
            "status_class": status_class,
            "dismissal": dismissal_text,
            "is_striker": is_striker,
            "is_non_striker": is_non_striker,
            "is_out": is_out,
            "has_batted": has_batted
        })

    # Sort: Striker first (0), Non-Striker (1), Out (2), other active (3), yet to bat (4)
    def _sort_batters(b):
        if b["is_striker"]: return 0
        if b["is_non_striker"]: return 1
        if b["is_out"]: return 2
        if b["has_batted"]: return 3
        return 4
    all_batters_list.sort(key=_sort_batters)

    # Build ALL BOWLERS list for Commentator Dashboard
    all_bowlers_list = []
    for p in innings.bowling_team.players:
        b_stat = bowlers_stat_map.get(p.id)
        if not b_stat:
            continue
        is_current = (p.id == innings.current_bowler_id)
        has_bowled = (b_stat["legal_balls"] > 0 or b_stat["runs"] > 0 or b_stat.get("wides", 0) > 0 or b_stat.get("noballs", 0) > 0)
        
        all_bowlers_list.append({
            "id": p.id,
            "name": p.name,
            "photo_url": p.photo_url,
            "overs": b_stat["overs"],
            "legal_balls": b_stat["legal_balls"],
            "maidens": b_stat["maidens"],
            "runs": b_stat["runs"],
            "wickets": b_stat["wickets"],
            "dots": b_stat["dots"],
            "economy": b_stat["economy"],
            "wides": b_stat.get("wides", 0),
            "noballs": b_stat.get("noballs", 0),
            "is_current": is_current,
            "has_bowled": has_bowled
        })

    def _sort_bowlers(b):
        if b["is_current"]: return (0, -b["wickets"], b["economy"])
        if b["has_bowled"]: return (1, -b["wickets"], b["economy"])
        return (2, 0, 0)
    all_bowlers_list.sort(key=_sort_bowlers)

    # Required runs/balls/RRR for 2nd innings or after 1st innings completes
    required_runs = None
    required_balls = None
    rrr = None
    effective_target = innings.target_runs
    if innings.innings_number == 2 and innings.target_runs is not None:
        required_runs = max(0, innings.target_runs - innings.total_runs)
        total_balls_quota = match.total_overs * 6
        required_balls = max(0, total_balls_quota - innings.legal_balls)
        rrr = calculate_rrr(required_runs, required_balls)
    elif innings.innings_number == 1 and innings.is_completed:
        effective_target = innings.total_runs + 1
        required_runs = effective_target
        total_balls_quota = match.total_overs * 6
        required_balls = total_balls_quota
        rrr = calculate_rrr(required_runs, required_balls)

    # Available bench batters (not yet batted / not currently out or on crease)
    batted_player_ids = set(out_map.keys())
    if innings.current_striker_id:
        batted_player_ids.add(innings.current_striker_id)
    if innings.current_non_striker_id:
        batted_player_ids.add(innings.current_non_striker_id)
    
    available_batters = [
        {"id": p.id, "name": p.name, "photo_url": p.photo_url}
        for p in innings.batting_team.players
        if p.id not in batted_player_ids
    ]

    # Available bowlers with quota tracking
    available_bowlers = []
    for p in innings.bowling_team.players:
        b_stat = bowlers_stat_map.get(p.id, {})
        legal_b = b_stat.get("legal_balls", 0)
        completed_ov = legal_b // 6
        is_max_reached = bool(match.max_overs_per_bowler and completed_ov >= match.max_overs_per_bowler)
        available_bowlers.append({
            "id": p.id,
            "name": p.name,
            "photo_url": p.photo_url,
            "legal_balls": legal_b,
            "overs": b_stat.get("overs", "0.0"),
            "completed_overs": completed_ov,
            "max_overs": match.max_overs_per_bowler,
            "is_max_reached": is_max_reached
        })

    # Calculate 1st innings summary data
    inn1 = db.query(Innings).filter(Innings.match_id == match.id, Innings.innings_number == 1).first()
    innings1_data = None
    if inn1:
        innings1_data = _get_innings_summary_data(db, inn1, match)

    is_innings_break = bool(innings.innings_number == 1 and innings.is_completed and match.status != "completed")

    needs_new_batter = bool(
        not innings.is_completed
        and match.status != "completed"
        and (innings.current_striker_id is None or innings.current_non_striker_id is None)
        and len(available_batters) > 0
    )

    last_delivery_info = None
    last_out_batter = None
    last_delivery_bowler_id = None
    last_ball_tag = "DOT BALL"
    last_ball_desc = "No runs scored"

    if deliveries:
        last_d = deliveries[-1]
        last_delivery_bowler_id = last_d.bowler_id
        
        # Build last_ball_tag & desc
        if last_d.is_wicket:
            last_ball_tag = "WICKET"
            p_out_n = "Batter"
            if last_d.wicket and last_d.wicket.player_out:
                p_out_n = last_d.wicket.player_out.name
            w_tp = (last_d.wicket.wicket_type if last_d.wicket else "OUT").replace('_', ' ').upper()
            last_ball_desc = f"WICKET! {p_out_n} dismissed ({w_tp})"
        elif last_d.runs_batter == 6:
            last_ball_tag = "SIX"
            last_ball_desc = "MASSIVE SIX! Clears the boundary rope!"
        elif last_d.runs_batter == 4:
            last_ball_tag = "FOUR"
            last_ball_desc = "CRACKING FOUR! Races to the fence!"
        elif last_d.extras_type == "wide":
            last_ball_tag = "WIDE"
            last_ball_desc = f"Wide ball (+{last_d.extras_runs} extra)"
        elif last_d.extras_type == "noball":
            last_ball_tag = "NO BALL"
            last_ball_desc = f"No Ball! (+{last_d.total_runs} runs • Free Hit next)"
        elif last_d.extras_type == "bye":
            last_ball_tag = "BYE"
            last_ball_desc = f"Bye (+{last_d.extras_runs} extra)"
        elif last_d.extras_type == "legbye":
            last_ball_tag = "LEG BYE"
            last_ball_desc = f"Leg Bye (+{last_d.extras_runs} extra)"
        elif last_d.extras_type in ("declared", "dic"):
            last_ball_tag = "DIC RUN"
            last_ball_desc = f"DIC Run (+{last_d.runs_batter} runs to striker)"
        elif last_d.runs_batter == 1:
            last_ball_tag = "1 RUN"
            last_ball_desc = "Single taken • Strike rotated"
        elif last_d.runs_batter == 2:
            last_ball_tag = "2 RUNS"
            last_ball_desc = "Quick double between wickets"
        elif last_d.runs_batter == 3:
            last_ball_tag = "3 RUNS"
            last_ball_desc = "Superb placement & running, 3 runs"
        else:
            last_ball_tag = "DOT BALL"
            last_ball_desc = "Dot ball • Good tight delivery"

        last_delivery_info = {
            "id": last_d.id,
            "bowler_id": last_d.bowler_id,
            "runs_batter": last_d.runs_batter,
            "total_runs": last_d.total_runs,
            "extras_type": last_d.extras_type,
            "extras_runs": last_d.extras_runs,
            "is_wicket": last_d.is_wicket,
            "tag": last_ball_tag,
            "desc": last_ball_desc
        }
        if last_d.is_wicket and last_d.wicket:
            w_obj = last_d.wicket
            p_out = db.query(Player).filter(Player.id == w_obj.player_out_id).first()
            if p_out:
                b_stat = batters_stat_map.get(p_out.id, {})
                last_out_batter = {
                    "id": p_out.id,
                    "name": p_out.name,
                    "photo_url": p_out.photo_url,
                    "runs": b_stat.get("runs", 0),
                    "balls": b_stat.get("balls", 0),
                    "fours": b_stat.get("fours", 0),
                    "sixes": b_stat.get("sixes", 0),
                    "dismissal": (w_obj.wicket_type or "out").replace("_", " ").upper(),
                    "wicket_type": w_obj.wicket_type,
                    "team_name": innings.batting_team.name
                }
                last_delivery_info["player_out"] = last_out_batter

    is_over_complete = bool(
        innings.legal_balls > 0
        and innings.legal_balls % 6 == 0
        and len(deliveries) > 0
        and deliveries[-1].is_legal_delivery
        and not innings.is_completed
        and match.status != "completed"
        and (innings.current_bowler_id is None or innings.current_bowler_id == last_delivery_bowler_id)
    )

    return {
        "match_id": match.id,
        "tournament_name": match.tournament.name if match.tournament else "",
        "match_number": match.match_number,
        "status": match.status,
        "total_overs": match.total_overs,
        "max_overs_per_bowler": match.max_overs_per_bowler,
        "current_innings_number": innings.innings_number,
        "batting_team": innings.batting_team.name,
        "batting_team_id": innings.batting_team_id,
        "batting_team_logo": innings.batting_team.logo_url,
        "bowling_team": innings.bowling_team.name,
        "bowling_team_id": innings.bowling_team_id,
        "bowling_team_logo": innings.bowling_team.logo_url,
        "team1": _build_team_state(match.team1),
        "team2": _build_team_state(match.team2),
        "runs": innings.total_runs,
        "wickets": innings.total_wickets,
        "overs_display": calculate_overs_display(innings.legal_balls),
        "legal_balls": innings.legal_balls,
        "current_run_rate": calculate_crr(innings.total_runs, innings.legal_balls),
        "target": effective_target,
        "required_runs": required_runs,
        "required_balls": required_balls,
        "required_run_rate": rrr,
        "striker": striker_obj,
        "non_striker": non_striker_obj,
        "needs_new_batter": needs_new_batter,
        "current_bowler": bowler_obj,
        "recent_balls": recent_balls,
        "current_over_balls": current_over_balls,
        "current_partnership_runs": current_partnership_runs,
        "current_partnership_balls": current_partnership_balls,
        "partnership_batter1": partnership_batter1,
        "partnership_batter2": partnership_batter2,
        "all_batters": all_batters_list,
        "all_bowlers": all_bowlers_list,
        "extras_breakdown": extras_breakdown,
        "fall_of_wickets": fall_of_wickets,
        "last_ball": {
            "tag": last_ball_tag,
            "desc": last_ball_desc,
            "runs": last_delivery_info["total_runs"] if last_delivery_info else 0,
            "is_wicket": last_delivery_info["is_wicket"] if last_delivery_info else False,
            "extras_type": last_delivery_info["extras_type"] if last_delivery_info else "none"
        },
        "last_ball_tag": last_ball_tag,
        "last_ball_desc": last_ball_desc,
        "is_over_complete": is_over_complete,
        "is_innings_complete": innings.is_completed,
        "is_innings_break": is_innings_break,
        "is_match_complete": match.status == "completed",
        "result_text": match.result_text,
        "available_batters": available_batters,
        "available_bowlers": available_bowlers,
        "innings1_data": innings1_data,
        "innings1_summary": innings1_data["summary_text"] if innings1_data else None,
        "latest_delivery": last_delivery_info,
        "last_out_batter": last_out_batter,
        "toss_winner_id": match.toss_winner_id,
        "toss_decision": match.toss_decision,
        "toss_winner_name": match.toss_winner.name if match.toss_winner else None,
        "total_deliveries": len(deliveries)
    }

def get_full_scorecard(db: Session, match_id: int) -> Dict[str, Any]:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError("Match not found")

    innings_list = db.query(Innings).filter(Innings.match_id == match.id).order_by(Innings.innings_number.asc()).all()

    scorecard_innings = []
    for inn in innings_list:
        deliveries = db.query(Delivery).filter(Delivery.innings_id == inn.id).order_by(Delivery.id.asc()).all()
        wickets = db.query(Wicket).filter(Wicket.innings_id == inn.id).order_by(Wicket.id.asc()).all()

        out_map = {w.player_out_id: w for w in wickets}

        # Batting stats
        batters = {}
        for p in inn.batting_team.players:
            batters[p.id] = {
                "id": p.id,
                "name": p.name,
                "photo_url": p.photo_url,
                "runs": 0,
                "balls": 0,
                "fours": 0,
                "sixes": 0,
                "strike_rate": 0.0,
                "dismissal": "Did not bat",
                "is_out": False
            }

        # Bowler stats
        bowlers = {}
        for p in inn.bowling_team.players:
            bowlers[p.id] = {
                "id": p.id,
                "name": p.name,
                "photo_url": p.photo_url,
                "legal_balls": 0,
                "maidens": 0,
                "runs": 0,
                "wickets": 0,
                "overs": "0.0",
                "economy": 0.0
            }

        # Extras breakdown
        extras_wides = 0
        extras_noballs = 0
        extras_byes = 0
        extras_legbyes = 0

        # Fall of wickets tracking
        running_score = 0
        running_legal_balls = 0
        fow_list = []
        wicket_count = 0

        overs_runs_map = {}

        for d in deliveries:
            running_score += d.total_runs
            if d.is_legal_delivery:
                running_legal_balls += 1

            # Batter runs & balls
            if d.batsman_id in batters:
                batters[d.batsman_id]["dismissal"] = "not out"
                if d.is_legal_delivery or d.extras_type == "noball":
                    batters[d.batsman_id]["balls"] += 1
                batters[d.batsman_id]["runs"] += d.runs_batter
                if d.runs_batter == 4:
                    batters[d.batsman_id]["fours"] += 1
                elif d.runs_batter == 6:
                    batters[d.batsman_id]["sixes"] += 1

            if d.non_striker_id in batters and batters[d.non_striker_id]["dismissal"] == "Did not bat":
                batters[d.non_striker_id]["dismissal"] = "not out"

            # Extras
            if d.extras_type == "wide":
                extras_wides += d.extras_runs
            elif d.extras_type == "noball":
                extras_noballs += d.extras_runs
            elif d.extras_type == "bye":
                extras_byes += d.extras_runs
            elif d.extras_type == "legbye":
                extras_legbyes += d.extras_runs

            # Bowler
            if d.bowler_id in bowlers:
                b_stat = bowlers[d.bowler_id]
                if d.is_legal_delivery:
                    b_stat["legal_balls"] += 1
                if d.extras_type not in ("bye", "legbye"):
                    b_stat["runs"] += d.total_runs
                if d.is_wicket and d.wicket and d.wicket.wicket_type not in ("run_out", "retired"):
                    b_stat["wickets"] += 1

            # Maidens tally
            ov_num = d.over_number
            if ov_num not in overs_runs_map:
                overs_runs_map[ov_num] = {"bowler_id": d.bowler_id, "runs": 0, "legal_balls": 0}
            overs_runs_map[ov_num]["runs"] += d.total_runs
            if d.is_legal_delivery:
                overs_runs_map[ov_num]["legal_balls"] += 1

            # Fall of wicket record
            if d.is_wicket and d.wicket:
                wicket_count += 1
                fow_list.append({
                    "wicket_num": wicket_count,
                    "player_name": d.wicket.player_out.name,
                    "runs": running_score,
                    "over": calculate_overs_display(running_legal_balls)
                })

        # Calculate maidens
        for ov_num, ov_data in overs_runs_map.items():
            if ov_data["legal_balls"] == 6 and ov_data["runs"] == 0:
                b_id = ov_data["bowler_id"]
                if b_id in bowlers:
                    bowlers[b_id]["maidens"] += 1

        # Dismissal formatting
        for p_id, w in out_map.items():
            if p_id in batters:
                batters[p_id]["is_out"] = True
                f_name = w.fielder.name if w.fielder else ""
                b_name = w.delivery.bowler.name if w.delivery and w.delivery.bowler else ""
                
                if w.wicket_type == "bowled":
                    batters[p_id]["dismissal"] = f"b {b_name}"
                elif w.wicket_type == "caught":
                    batters[p_id]["dismissal"] = f"c {f_name} b {b_name}" if f_name else f"c & b {b_name}"
                elif w.wicket_type == "lbw":
                    batters[p_id]["dismissal"] = f"lbw b {b_name}"
                elif w.wicket_type == "run_out":
                    batters[p_id]["dismissal"] = f"run out ({f_name})" if f_name else "run out"
                elif w.wicket_type == "stumped":
                    batters[p_id]["dismissal"] = f"st {f_name} b {b_name}" if f_name else f"st b {b_name}"
                elif w.wicket_type == "hit_wicket":
                    batters[p_id]["dismissal"] = f"hit wicket b {b_name}"
                elif w.wicket_type == "retired":
                    batters[p_id]["dismissal"] = "retired out"
                elif w.wicket_type == "other":
                    batters[p_id]["dismissal"] = "out (other)"
                else:
                    batters[p_id]["dismissal"] = w.wicket_type

        # Strike rates
        for b_id, b_data in batters.items():
            if b_data["balls"] > 0:
                b_data["strike_rate"] = round((b_data["runs"] / b_data["balls"]) * 100, 1)

        # Bowling table formatting (only include bowlers who bowled)
        active_bowlers = []
        for b_id, b_data in bowlers.items():
            if b_data["legal_balls"] > 0:
                b_data["overs"] = calculate_overs_display(b_data["legal_balls"])
                b_data["economy"] = round((b_data["runs"] / b_data["legal_balls"]) * 6, 2)
                active_bowlers.append(b_data)

        total_extras = extras_wides + extras_noballs + extras_byes + extras_legbyes

        scorecard_innings.append({
            "innings_number": inn.innings_number,
            "batting_team_name": inn.batting_team.name,
            "batting_team_logo": inn.batting_team.logo_url,
            "bowling_team_name": inn.bowling_team.name,
            "bowling_team_logo": inn.bowling_team.logo_url,
            "total_runs": inn.total_runs,
            "total_wickets": inn.total_wickets,
            "overs": calculate_overs_display(inn.legal_balls),
            "run_rate": calculate_crr(inn.total_runs, inn.legal_balls),
            "batting": [b for b in batters.values() if b["dismissal"] != "Did not bat" or b["balls"] > 0],
            "did_not_bat": [b["name"] for b in batters.values() if b["dismissal"] == "Did not bat" and b["balls"] == 0],
            "bowling": active_bowlers,
            "extras": {
                "total": total_extras,
                "wides": extras_wides,
                "noballs": extras_noballs,
                "byes": extras_byes,
                "legbyes": extras_legbyes
            },
            "fall_of_wickets": fow_list
        })

    toss_winner_name = match.toss_winner.name if match.toss_winner else None
    toss_decision = match.toss_decision
    toss_text = f"{toss_winner_name} won toss & elected to {toss_decision.upper()}" if (toss_winner_name and toss_decision) else None

    return {
        "match_id": match.id,
        "tournament_name": match.tournament.name if match.tournament else "",
        "match_number": match.match_number,
        "team1_name": match.team1.name,
        "team1_logo": match.team1.logo_url,
        "team2_name": match.team2.name,
        "team2_logo": match.team2.logo_url,
        "status": match.status,
        "toss_winner_name": toss_winner_name,
        "toss_decision": toss_decision,
        "toss_text": toss_text,
        "result_text": match.result_text,
        "innings": scorecard_innings
    }
