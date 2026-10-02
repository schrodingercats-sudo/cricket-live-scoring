from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.models.models import Tournament, Team, Match, Innings, Delivery, Wicket, Player

def get_points_table(db: Session, tournament_id: int) -> List[Dict[str, Any]]:
    teams = db.query(Team).filter(Team.tournament_id == tournament_id).all()
    matches = db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.is_deleted == False,
        Match.status == "completed"
    ).all()

    # Initialize stats map per team
    table = {}
    for team in teams:
        table[team.id] = {
            "team_id": team.id,
            "team_name": team.name,
            "short_name": team.short_name or team.name[:3].upper(),
            "logo_url": team.logo_url,
            "played": 0,
            "won": 0,
            "lost": 0,
            "tied": 0,
            "no_result": 0,
            "points": 0,
            "runs_scored": 0,
            "balls_faced": 0, # in legal balls
            "runs_conceded": 0,
            "balls_bowled": 0, # in legal balls
            "nrr": 0.0,
            "nrr_display": "0.000"
        }

    for m in matches:
        # Check team participation
        if m.team1_id in table:
            table[m.team1_id]["played"] += 1
        if m.team2_id in table:
            table[m.team2_id]["played"] += 1

        # Check winner
        if m.winner_id:
            table[m.winner_id]["won"] += 1
            table[m.winner_id]["points"] += 2
            loser_id = m.team2_id if m.winner_id == m.team1_id else m.team1_id
            if loser_id in table:
                table[loser_id]["lost"] += 1
        elif m.result_text and "Tied" in m.result_text:
            if m.team1_id in table:
                table[m.team1_id]["tied"] += 1
                table[m.team1_id]["points"] += 1
            if m.team2_id in table:
                table[m.team2_id]["tied"] += 1
                table[m.team2_id]["points"] += 1
        else:
            if m.team1_id in table:
                table[m.team1_id]["no_result"] += 1
                table[m.team1_id]["points"] += 1
            if m.team2_id in table:
                table[m.team2_id]["no_result"] += 1
                table[m.team2_id]["points"] += 1

        # NRR Runs & Overs Accumulation
        for inn in m.innings:
            if inn.batting_team_id == m.team1_id and m.team1_id in table:
                table[m.team1_id]["runs_scored"] += inn.total_runs
                # If all out before full quota, overs faced = total match quota
                all_out = (inn.total_wickets >= len(inn.batting_team.players) - 1) if inn.batting_team and inn.batting_team.players else False
                balls_faced = (m.total_overs * 6) if all_out else inn.legal_balls
                table[m.team1_id]["balls_faced"] += balls_faced

                if m.team2_id in table:
                    table[m.team2_id]["runs_conceded"] += inn.total_runs
                    table[m.team2_id]["balls_bowled"] += balls_faced

            elif inn.batting_team_id == m.team2_id and m.team2_id in table:
                table[m.team2_id]["runs_scored"] += inn.total_runs
                all_out = (inn.total_wickets >= len(inn.batting_team.players) - 1) if inn.batting_team and inn.batting_team.players else False
                balls_faced = (m.total_overs * 6) if all_out else inn.legal_balls
                table[m.team2_id]["balls_faced"] += balls_faced

                if m.team1_id in table:
                    table[m.team1_id]["runs_conceded"] += inn.total_runs
                    table[m.team1_id]["balls_bowled"] += balls_faced

    # Compute Final NRR and sort
    result = []
    for team_id, data in table.items():
        # Formula: (Runs Scored / Overs Faced) - (Runs Conceded / Overs Bowled)
        overs_faced = data["balls_faced"] / 6.0
        overs_bowled = data["balls_bowled"] / 6.0

        for_rr = (data["runs_scored"] / overs_faced) if overs_faced > 0 else 0.0
        against_rr = (data["runs_conceded"] / overs_bowled) if overs_bowled > 0 else 0.0
        nrr_val = round(for_rr - against_rr, 3)
        data["nrr"] = nrr_val
        data["nrr_display"] = f"{nrr_val:+.3f}" if nrr_val != 0 else "0.000"
        result.append(data)

    # Sort by Points (DESC), then NRR (DESC), then Won (DESC)
    result.sort(key=lambda x: (x["points"], x["nrr"], x["won"]), reverse=True)
    return result


def get_tournament_leaderboards(db: Session, tournament_id: int) -> Dict[str, Any]:
    # Top Run Scorers (sum of runs_batter from deliveries in this tournament)
    top_scorers_query = (
        db.query(
            Player.id,
            Player.name,
            Player.photo_url,
            Team.name.label("team_name"),
            func.sum(Delivery.runs_batter).label("total_runs"),
            func.sum(case((Delivery.is_legal_delivery == True, 1), (Delivery.extras_type == "noball", 1), else_=0)).label("balls_faced"),
            func.sum(case((Delivery.runs_batter == 4, 1), else_=0)).label("fours"),
            func.sum(case((Delivery.runs_batter == 6, 1), else_=0)).label("sixes")
        )
        .join(Team, Player.team_id == Team.id)
        .join(Delivery, Delivery.batsman_id == Player.id)
        .join(Innings, Delivery.innings_id == Innings.id)
        .join(Match, Innings.match_id == Match.id)
        .filter(
            Match.tournament_id == tournament_id,
            Match.is_deleted == False
        )
        .group_by(Player.id, Player.name, Player.photo_url, Team.name)
        .order_by(func.sum(Delivery.runs_batter).desc())
        .limit(15)
        .all()
    )

    top_scorers = []
    for row in top_scorers_query:
        runs = row.total_runs or 0
        balls = row.balls_faced or 0
        sr = round((runs / balls) * 100, 1) if balls > 0 else 0.0
        top_scorers.append({
            "player_id": row.id,
            "player_name": row.name,
            "photo_url": row.photo_url,
            "team_name": row.team_name,
            "runs": runs,
            "balls": balls,
            "fours": row.fours or 0,
            "sixes": row.sixes or 0,
            "strike_rate": sr
        })

    # Top Wicket Takers (decided strictly from maximum wickets in this tournament)
    top_bowlers_query = (
        db.query(
            Player.id,
            Player.name,
            Player.photo_url,
            Team.name.label("team_name"),
            func.count(Wicket.id).label("total_wickets")
        )
        .join(Team, Player.team_id == Team.id)
        .join(Delivery, Delivery.bowler_id == Player.id)
        .join(Wicket, Wicket.delivery_id == Delivery.id)
        .join(Innings, Delivery.innings_id == Innings.id)
        .join(Match, Innings.match_id == Match.id)
        .filter(
            Match.tournament_id == tournament_id,
            Match.is_deleted == False,
            ~Wicket.wicket_type.in_(["run_out", "retired"])
        )
        .group_by(Player.id, Player.name, Player.photo_url, Team.name)
        .order_by(func.count(Wicket.id).desc())
        .limit(15)
        .all()
    )

    top_bowlers = []
    for row in top_bowlers_query:
        bowler_id = row.id
        wickets = row.total_wickets or 0
        
        # Calculate overs & runs conceded for this bowler in tournament
        bowler_stats = (
            db.query(
                func.sum(case((Delivery.is_legal_delivery == True, 1), else_=0)).label("legal_balls"),
                func.sum(case((Delivery.extras_type.in_(["bye", "legbye"]), 0), else_=Delivery.total_runs)).label("runs")
            )
            .join(Innings, Delivery.innings_id == Innings.id)
            .join(Match, Innings.match_id == Match.id)
            .filter(
                Match.tournament_id == tournament_id,
                Match.is_deleted == False,
                Delivery.bowler_id == bowler_id
            )
            .first()
        )
        
        legal_b = (bowler_stats.legal_balls if bowler_stats and bowler_stats.legal_balls else 0)
        runs_conc = (bowler_stats.runs if bowler_stats and bowler_stats.runs else 0)
        overs_str = f"{legal_b // 6}.{legal_b % 6}"
        econ = round((runs_conc / legal_b) * 6, 2) if legal_b > 0 else 0.0

        top_bowlers.append({
            "player_id": row.id,
            "player_name": row.name,
            "photo_url": row.photo_url,
            "team_name": row.team_name,
            "wickets": wickets,
            "overs": overs_str,
            "runs": runs_conc,
            "economy": econ
        })

    # Identify Best Batsman (maximum runs) and Best Bowler (maximum wickets)
    best_batsman = top_scorers[0] if (top_scorers and top_scorers[0]["runs"] > 0) else None
    best_bowler = top_bowlers[0] if (top_bowlers and top_bowlers[0]["wickets"] > 0) else None

    return {
        "best_batsman": best_batsman,
        "best_bowler": best_bowler,
        "top_scorers": top_scorers,
        "top_bowlers": top_bowlers
    }
