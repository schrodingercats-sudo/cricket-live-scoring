import random
import logging
import httpx
from typing import Optional, Dict, Any

logger = logging.getLogger("cricket_app.commentary_service")

# Curated phrases and templates for high-energy cricket broadcast commentary
BOUNDARY_FOUR_TEMPLATES = [
    "CRACKING SHOT! {striker} pierces the infield with surgical precision and finds the boundary rope for FOUR!",
    "GLORIOUS TIMING! {striker} leans into the drive, sending the ball racing across the lush outfield for 4 runs!",
    "SWEETLY STRUCK! Off the meat of the bat by {striker} — no chance for the sweeper as it crosses the fence for FOUR!",
    "PULLED AWAY WITH POWER! {striker} rocks onto the back foot and thumps it to the mid-wicket boundary for FOUR!",
    "BEAUTIFULLY PLACED! {striker} finds the gap through extra cover, bringing up a valuable four runs!"
]

BOUNDARY_SIX_TEMPLATES = [
    "MASSIVE MAXIMUM! {striker} launches this high, handsome, and into the stands for a colossal SIX!",
    "OUT OF THE PARK! That is sheer brute power from {striker} — towering into the night sky for 6 runs!",
    "CLEAN AS A WHISTLE! {striker} stands tall and deposits this one way over long-on for a sensational SIX!",
    "THAT'S HUGE! Sweet connection from {striker}, clearing the boundary ropes with consummate ease for SIX!",
    "DISPATCHED INTO ORBIT! {striker} gets underneath it and sends it sailing over the ropes for a monster 6!"
]

WICKET_TEMPLATES = [
    "GONE! BIG BREAKTHROUGH! {bowler} strikes with authority, sending {out_batter} back to the dugout!",
    "STUMPS SHATTERED / WICKET DOWN! {bowler} breaks the crucial partnership — {out_batter} has to depart for {out_runs} ({out_balls})!",
    "WHAT A DELIVERY! {bowler} produces a piece of magic and claims the prized wicket of {out_batter}!",
    "OUT! A huge moment in this contest as {bowler} gets {out_batter}! The fielding team is ecstatic!",
    "TIMBER / CAUGHT! {bowler} delivers under pressure and dismisses {out_batter} ({out_runs} off {out_balls})!"
]

DOT_BALL_TEMPLATES = [
    "TIGHT BOWLING! {bowler} beats the bat with a probing line and length — dot ball recorded.",
    "EXCELLENT DISCIPLINE! {bowler} gives nothing away to {striker}, keeping the pressure firmly on.",
    "BEATEN OUTSIDE OFF! {bowler} extracts sharp bounce and movement, leaving {striker} with no room to score.",
    "SOLID DEFENSE! {striker} plays it with soft hands straight into the covers — no run taken."
]

RUN_TEMPLATES = [
    "Quick single worked into the gap by {striker} — good proactive running between the wickets.",
    "Pushed into the deep by {striker}, and the batsmen comfortably jog through for a single.",
    "Nicely placed by {striker} into the vacant pocket for a brisk two runs!",
    "Superb running between the wickets by {striker} and {non_striker} to convert one into two."
]

WIDE_TEMPLATES = [
    "Strayed down the leg side! Umpire signals WIDE — extra run added to the total for {bowler}.",
    "Way outside the tramline! That's called a wide delivery by the umpire."
]

NOBALL_TEMPLATES = [
    "OVERSTEPPED! Siren sounds for a NO BALL from {bowler} — free hit coming up for {striker}!",
    "Front foot infringement! No Ball called, and {striker} will have a golden Free Hit opportunity on the next delivery!"
]

SITUATION_TEMPLATES_CHASE = [
    "The chase is on! {batting_team} are {runs}/{wickets} in {overs} ov, needing {req_runs} runs from {req_balls} balls (RRR: {rrr}).",
    "Pressure cooker atmosphere! {batting_team} require {req_runs} runs off {req_balls} deliveries. {striker} ({striker_runs}*) holds the key!",
    "Game hanging in the balance! With {req_runs} needed from {req_balls} balls, {bowling_team} are hunting wickets while {batting_team} target the boundaries."
]

SITUATION_TEMPLATES_1ST_INN = [
    "{batting_team} progressing at {crr} runs per over, standing at {runs}/{wickets} after {overs} overs.",
    "Solid platform being built! {batting_team} reach {runs}/{wickets} in {overs} overs with {striker} ({striker_runs}*) looking in commanding touch.",
    "{bowling_team} striving for breakthroughs as {batting_team} post {runs}/{wickets} in {overs} overs."
]

def generate_dynamic_template_commentary(state: Dict[str, Any]) -> str:
    """Generates instant, highly contextual commentary from match state without external network calls."""
    if not state:
        return "Welcome to live cricket coverage! Awaiting start of play."

    batting_team = state.get("batting_team") or "Batting Team"
    bowling_team = state.get("bowling_team") or "Bowling Team"
    runs = state.get("runs", 0)
    wickets = state.get("wickets", 0)
    overs = state.get("overs_display", "0.0")
    crr = f"{state.get('current_run_rate', 0.0):.2f}"
    
    striker = state.get("striker") or {}
    non_striker = state.get("non_striker") or {}
    bowler = state.get("current_bowler") or {}
    
    striker_name = striker.get("name") or "Striker"
    striker_runs = striker.get("runs", 0)
    striker_balls = striker.get("balls", 0)
    
    non_striker_name = non_striker.get("name") or "Non-Striker"
    
    bowler_name = bowler.get("name") or "Bowler"
    bowler_figures = f"{bowler.get('overs', '0.0')}-{bowler.get('maidens', 0)}-{bowler.get('runs', 0)}-{bowler.get('wickets', 0)}"

    last_d = state.get("latest_delivery") or {}
    last_ball_tag = state.get("last_ball_tag") or "SCORE UPDATE"
    last_out = state.get("last_out_batter") or {}
    
    inn_num = state.get("current_innings_number", 1)
    target = state.get("target")
    req_runs = state.get("required_runs", 0)
    req_balls = state.get("required_balls", 0)
    rrr = f"{state.get('required_run_rate', 0.0):.2f}" if state.get('required_run_rate') else "0.0"

    parts = []

    # 1. Action on the last ball or active event
    if last_d.get("is_wicket"):
        out_n = last_out.get("name") or "Batter"
        out_r = last_out.get("runs", 0)
        out_b = last_out.get("balls", 0)
        tmpl = random.choice(WICKET_TEMPLATES)
        parts.append(tmpl.format(bowler=bowler_name, out_batter=out_n, out_runs=out_r, out_balls=out_b))
    elif last_d.get("runs_batter") == 6:
        tmpl = random.choice(BOUNDARY_SIX_TEMPLATES)
        parts.append(tmpl.format(striker=striker_name, bowler=bowler_name))
    elif last_d.get("runs_batter") == 4:
        tmpl = random.choice(BOUNDARY_FOUR_TEMPLATES)
        parts.append(tmpl.format(striker=striker_name, bowler=bowler_name))
    elif last_d.get("extras_type") == "noball":
        tmpl = random.choice(NOBALL_TEMPLATES)
        parts.append(tmpl.format(striker=striker_name, bowler=bowler_name))
    elif last_d.get("extras_type") == "wide":
        tmpl = random.choice(WIDE_TEMPLATES)
        parts.append(tmpl.format(bowler=bowler_name))
    elif last_d.get("runs_batter") in (1, 2, 3):
        tmpl = random.choice(RUN_TEMPLATES)
        parts.append(tmpl.format(striker=striker_name, non_striker=non_striker_name, runs=last_d.get("runs_batter")))
    elif last_d.get("runs_batter") == 0:
        tmpl = random.choice(DOT_BALL_TEMPLATES)
        parts.append(tmpl.format(striker=striker_name, bowler=bowler_name))
    else:
        parts.append(f"{batting_team} are {runs}/{wickets} after {overs} overs.")

    # 2. Add Match Situation / Chase Context
    if inn_num == 2 and target:
        if req_runs <= 0:
            parts.append(f"VICTORY REACHED! {batting_team} seal the chase successfully!")
        elif req_balls <= 6 and req_runs <= 18:
            parts.append(f"Down to the wire! Just {req_runs} needed off {req_balls} balls in a thrilling finish!")
        else:
            tmpl = random.choice(SITUATION_TEMPLATES_CHASE)
            parts.append(tmpl.format(
                batting_team=batting_team, bowling_team=bowling_team,
                runs=runs, wickets=wickets, overs=overs,
                req_runs=req_runs, req_balls=req_balls, rrr=rrr,
                striker=striker_name, striker_runs=striker_runs
            ))
    else:
        tmpl = random.choice(SITUATION_TEMPLATES_1ST_INN)
        parts.append(tmpl.format(
            batting_team=batting_team, bowling_team=bowling_team,
            runs=runs, wickets=wickets, overs=overs, crr=crr,
            striker=striker_name, striker_runs=striker_runs
        ))

    return " ".join(parts)


async def generate_ai_commentary(state: Dict[str, Any], ollama_url: str = "http://127.0.0.1:11434") -> Dict[str, Any]:
    """
    Attempts fast local Ollama AI generation with fallback to instant rule-based engine.
    Never raises exceptions or blocks the application.
    """
    if not state:
        return {"commentary": "Match coverage live on screen.", "source": "engine"}

    # Prompt construction for Ollama
    striker = state.get("striker") or {}
    bowler = state.get("current_bowler") or {}
    target_val = state.get("target")
    req_runs = state.get("required_runs")
    req_balls = state.get("required_balls")
    target_str = f"Target: {target_val}, Need {req_runs} in {req_balls}b" if target_val else "1st Innings"
    crr_val = float(state.get('current_run_rate') or 0.0)

    prompt = (
        f"You are an energetic TV cricket commentator. Write 1 or 2 concise, exciting, broadcast-quality commentary sentences "
        f"for this live ball.\n"
        f"Match: {state.get('batting_team')} vs {state.get('bowling_team')}\n"
        f"Score: {state.get('runs')}/{state.get('wickets')} in {state.get('overs_display')} overs (CRR: {crr_val:.2f})\n"
        f"Striker: {striker.get('name', 'Batter')} ({striker.get('runs', 0)} off {striker.get('balls', 0)}b)\n"
        f"Bowler: {bowler.get('name', 'Bowler')}\n"
        f"Last Ball Event: {last_ball_tag} ({last_d.get('total_runs', 0)} runs)\n"
        f"Target/Chase: {target_str}\n"
        f"Return ONLY the commentary text with no quotes, preamble or explanation."
    )

    try:
        async with httpx.AsyncClient(timeout=1.6) as client:
            resp = await client.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": "llama3",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 60}
                }
            )
            if resp.status_code == 200:
                result = resp.json()
                text = result.get("response", "").strip().strip('"')
                if text and len(text) > 10:
                    return {"commentary": text, "source": "ollama"}
    except Exception as e:
        logger.debug(f"Ollama commentary bypass/notice: {e}")

    # Seamless instant fallback
    fallback_text = generate_dynamic_template_commentary(state)
    return {"commentary": fallback_text, "source": "engine"}
