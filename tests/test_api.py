from fastapi.testclient import TestClient
from app.main import app

def test_create_and_get_tournament():
    with TestClient(app) as client:
        # Create tournament
        response = client.post("/api/tournaments", json={
            "name": "Champions Hostel League 2026",
            "format_overs": 8
        })
        assert response.status_code == 200
        tourney = response.json()
        assert tourney["name"] == "Champions Hostel League 2026"
        assert tourney["format_overs"] == 8
        tourney_id = tourney["id"]

        # Test photo upload endpoint
        dummy_file = ("team_logo.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82", "image/png")
        res_upload = client.post("/api/tournaments/upload/team-photo", files={"file": dummy_file})
        assert res_upload.status_code == 200
        upload_data = res_upload.json()
        assert "url" in upload_data
        uploaded_logo_url = upload_data["url"]

        # Add Team 1 with players and logo
        res_t1 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Alpha Strikers",
            "short_name": "ALS",
            "logo_url": uploaded_logo_url,
            "players": [{"name": "Rohan"}, {"name": "Kunal"}, {"name": "Gaurav"}]
        })
        assert res_t1.status_code == 200
        team1 = res_t1.json()
        assert len(team1["players"]) == 3
        assert team1["logo_url"] == uploaded_logo_url

        # Add Team 2 with players
        res_t2 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Beta Warriors",
            "short_name": "BTW",
            "players": [{"name": "Siddharth"}, {"name": "Harsh"}, {"name": "Aniket"}]
        })
        assert res_t2.status_code == 200
        team2 = res_t2.json()
        assert len(team2["players"]) == 3

        # Update Team 2 photo
        res_update_t2 = client.put(f"/api/tournaments/teams/{team2['id']}", json={
            "name": "Beta Warriors XI",
            "short_name": "BWX",
            "logo_url": "https://example.com/logo.png"
        })
        assert res_update_t2.status_code == 200
        assert res_update_t2.json()["name"] == "Beta Warriors XI"
        assert res_update_t2.json()["logo_url"] == "https://example.com/logo.png"

        # Schedule match with date
        res_match = client.post("/api/matches", json={
            "tournament_id": tourney_id,
            "match_number": 1,
            "team1_id": team1["id"],
            "team2_id": team2["id"],
            "total_overs": 2,
            "scheduled_date": "2026-09-16T16:30:00"
        })
        assert res_match.status_code == 200
        match = res_match.json()
        match_id = match["id"]
        assert match["scheduled_date"] is not None
        assert "Sep 16, 2026" in match["scheduled_date"]

        # Start match with toss
        res_toss = client.post(f"/api/scoring/matches/{match_id}/toss", json={
            "toss_winner_id": team1["id"],
            "toss_decision": "bat",
            "striker_id": team1["players"][0]["id"],
            "non_striker_id": team1["players"][1]["id"],
            "bowler_id": team2["players"][0]["id"]
        })
        assert res_toss.status_code == 200

        # Record a boundary (4 runs)
        res_deliv = client.post(f"/api/scoring/matches/{match_id}/delivery", json={
            "runs_batter": 4,
            "extras_type": "none",
            "extras_runs": 0
        })
        assert res_deliv.status_code == 200

        # Fetch live state
        res_live = client.get(f"/api/matches/{match_id}/live")
        assert res_live.status_code == 200
        live_data = res_live.json()
        assert live_data["runs"] == 4
        assert live_data["striker"]["name"] == "Rohan"
        assert live_data["striker"]["runs"] == 4

        # Fetch Scorecard
        res_card = client.get(f"/api/matches/{match_id}/scorecard")
        assert res_card.status_code == 200
        card_data = res_card.json()
        assert len(card_data["innings"]) == 1
        assert card_data["innings"][0]["total_runs"] == 4

        # Move Match to History (Soft Delete)
        res_del_match = client.delete(f"/api/matches/{match_id}")
        assert res_del_match.status_code == 200
        
        # Verify match is filtered out from active match list
        res_active_list = client.get(f"/api/matches?tournament_id={tourney_id}&is_deleted=false")
        assert res_active_list.status_code == 200
        assert len(res_active_list.json()) == 0

        # Verify match appears in history list
        res_hist_list = client.get(f"/api/matches?tournament_id={tourney_id}&is_deleted=true")
        assert res_hist_list.status_code == 200
        assert len(res_hist_list.json()) == 1
        assert res_hist_list.json()[0]["id"] == match_id

        # Restore Match from History back to Tournament
        res_restore = client.post(f"/api/matches/{match_id}/restore")
        assert res_restore.status_code == 200

        # Verify match is active again
        res_active_again = client.get(f"/api/matches?tournament_id={tourney_id}&is_deleted=false")
        assert res_active_again.status_code == 200
        assert len(res_active_again.json()) == 1

        # Permanently Delete Match
        res_perm_del = client.delete(f"/api/matches/{match_id}/permanent")
        assert res_perm_del.status_code == 200
        assert client.get(f"/api/matches/{match_id}").status_code == 404

        # Verify /history and /tournament/{id} web page routes
        res_history_page = client.get("/history")
        assert res_history_page.status_code == 200
        assert "History" in res_history_page.text

        res_tourney_page = client.get(f"/tournament/{tourney_id}")
        assert res_tourney_page.status_code == 200
        assert "History" in res_tourney_page.text

        # Delete Team
        res_del_team = client.delete(f"/api/tournaments/teams/{team2['id']}")
        assert res_del_team.status_code == 200

        # Move Tournament to History (Soft Delete)
        res_del_tourney = client.delete(f"/api/tournaments/{tourney_id}")
        assert res_del_tourney.status_code == 200

        # Verify tournament in history
        res_tourney_hist = client.get(f"/api/tournaments?is_deleted=true")
        assert res_tourney_hist.status_code == 200
        assert any(t["id"] == tourney_id for t in res_tourney_hist.json())

        # Restore Tournament
        res_rest_tourney = client.post(f"/api/tournaments/{tourney_id}/restore")
        assert res_rest_tourney.status_code == 200

        # Permanent Delete Tournament
        res_perm_tourney = client.delete(f"/api/tournaments/{tourney_id}/permanent")
        assert res_perm_tourney.status_code == 200
        assert client.get(f"/api/tournaments/{tourney_id}").status_code == 404

def test_video_endpoint_and_six_scoring():
    with TestClient(app) as client:
        # Check /static/videos/six.mp4 and /static/videos/four.mp4 static endpoints
        resp_vid6 = client.get("/static/videos/six.mp4")
        assert resp_vid6.status_code == 200
        assert len(resp_vid6.content) > 1000000

        resp_vid4 = client.get("/static/videos/four.mp4")
        assert resp_vid4.status_code == 200
        assert len(resp_vid4.content) > 1000000

def test_custom_banner_endpoint():
    with TestClient(app) as client:
        # Create tournament & match
        res_t = client.post("/api/tournaments", json={"name": "Banner Cup", "format_overs": 5})
        t_id = res_t.json()["id"]
        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "T1", "short_name": "T1", "players": [{"name": "P1"}, {"name": "P2"}]})
        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "T2", "short_name": "T2", "players": [{"name": "P3"}, {"name": "P4"}]})
        m_id = client.post("/api/matches", json={
            "tournament_id": t_id, "match_number": 1, "team1_id": res_t1.json()["id"], "team2_id": res_t2.json()["id"], "total_overs": 5
        }).json()["id"]

        # Send custom banner
        res_banner = client.post(f"/api/scoring/matches/{m_id}/custom-banner", json={
            "text": "WHAT A SHOT! 🔥",
            "subtext": "Maximum Distance 105m",
            "theme": "fire",
            "sound": "fanfare",
            "duration_ms": 5000,
            "action": "show"
        })
        assert res_banner.status_code == 200
        data = res_banner.json()
        assert data["banner"]["text"] == "WHAT A SHOT! 🔥"
        assert data["banner"]["theme"] == "fire"
        assert data["banner"]["sound"] == "fanfare"

        # Dismiss banner
        res_hide = client.post(f"/api/scoring/matches/{m_id}/custom-banner", json={
            "action": "hide"
        })
        assert res_hide.status_code == 200
        assert res_hide.json()["banner"]["action"] == "hide"

def test_live_page_and_logo():
    with TestClient(app) as client:
        # Create tournament & match
        res_t = client.post("/api/tournaments", json={"name": "Logo Cup", "format_overs": 5})
        t_id = res_t.json()["id"]
        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Team A", "short_name": "TA", "players": [{"name": "P1"}]})
        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Team B", "short_name": "TB", "players": [{"name": "P2"}]})
        m_id = client.post("/api/matches", json={
            "tournament_id": t_id, "match_number": 1, "team1_id": res_t1.json()["id"], "team2_id": res_t2.json()["id"], "total_overs": 5
        }).json()["id"]

        # Request live page
        res_live = client.get(f"/match/{m_id}/live")
        assert res_live.status_code == 200
        assert "live-stadium-logo" in res_live.text
        assert "live-target-container" in res_live.text

        # Request logo file
        res_logo = client.get("/logo/baps-color-logo-white-wordmark.1veoral3ktspt.png")
        assert res_logo.status_code == 200
        assert res_logo.headers["content-type"] == "image/png"

def test_second_innings_live_chase():
    with TestClient(app) as client:
        # Create tournament & match with 2 overs
        res_t = client.post("/api/tournaments", json={"name": "Chase Cup", "format_overs": 2})
        t_id = res_t.json()["id"]
        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Alpha", "short_name": "ALP", "players": [{"name": "A1"}, {"name": "A2"}]})
        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Beta", "short_name": "BET", "players": [{"name": "B1"}, {"name": "B2"}]})
        m_id = client.post("/api/matches", json={
            "tournament_id": t_id, "match_number": 1, "team1_id": res_t1.json()["id"], "team2_id": res_t2.json()["id"], "total_overs": 2
        }).json()["id"]

        # Start innings 1
        t1_p = res_t1.json()["players"]
        t2_p = res_t2.json()["players"]
        client.post(f"/api/scoring/matches/{m_id}/start-innings", json={
            "striker_id": t1_p[0]["id"], "non_striker_id": t1_p[1]["id"], "bowler_id": t2_p[0]["id"]
        })

        # Deliveries for innings 1: 12 runs in 2 overs
        for _ in range(12):
            client.post(f"/api/scoring/matches/{m_id}/delivery", json={"runs_batter": 1})

        # End innings 1
        client.post(f"/api/scoring/matches/{m_id}/end-innings")

        # Start innings 2 (Target: 13 runs in 12 balls)
        client.post(f"/api/scoring/matches/{m_id}/start-innings", json={
            "striker_id": t2_p[0]["id"], "non_striker_id": t2_p[1]["id"], "bowler_id": t1_p[0]["id"]
        })

        # Bowl 2 deliveries (4 runs scored)
        client.post(f"/api/scoring/matches/{m_id}/delivery", json={"runs_batter": 4})

        # Check live page
        res_live = client.get(f"/match/{m_id}/live")
        assert res_live.status_code == 200
        assert "live-target-container" in res_live.text
        assert "NEED" in res_live.text
        assert "RUNS IN" in res_live.text
        assert "BALLS" in res_live.text

def test_player_photo_upload_and_management():
    with TestClient(app) as client:
        # Create tournament
        res_t = client.post("/api/tournaments", json={"name": "Photo League 2026", "format_overs": 5})
        assert res_t.status_code == 200
        tourney_id = res_t.json()["id"]

        # Upload player photo
        dummy_file = ("player.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82", "image/png")
        res_upload = client.post("/api/tournaments/upload/player-photo", files={"file": dummy_file})
        assert res_upload.status_code == 200
        player_photo_url = res_upload.json()["url"]
        assert "player_" in player_photo_url

        # Create Team with player having photo
        res_t1 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Super Kings",
            "short_name": "CSK",
            "players": [
                {"name": "MS Dhoni", "photo_url": player_photo_url},
                {"name": "Ruturaj Gaikwad", "photo_url": None}
            ]
        })
        assert res_t1.status_code == 200
        team1 = res_t1.json()
        assert team1["players"][0]["name"] == "MS Dhoni"
        assert team1["players"][0]["photo_url"] == player_photo_url
        player1_id = team1["players"][0]["id"]
        player2_id = team1["players"][1]["id"]

        # Add new player with photo to existing team
        res_add_p = client.post(f"/api/tournaments/teams/{team1['id']}/players", json={
            "name": "Ravindra Jadeja",
            "photo_url": "https://example.com/jadeja.png"
        })
        assert res_add_p.status_code == 200
        added_p = res_add_p.json()
        assert added_p["name"] == "Ravindra Jadeja"
        assert added_p["photo_url"] == "https://example.com/jadeja.png"

        # Update player 2 name and photo
        res_update_p2 = client.put(f"/api/tournaments/players/{player2_id}", json={
            "name": "Ruturaj G.",
            "photo_url": "https://example.com/rutu.png"
        })
        assert res_update_p2.status_code == 200
        assert res_update_p2.json()["name"] == "Ruturaj G."
        assert res_update_p2.json()["photo_url"] == "https://example.com/rutu.png"

        # Direct file upload for player 1 photo
        dummy_file2 = ("dhoni_new.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82", "image/png")
        res_upload_direct = client.post(f"/api/tournaments/players/{player1_id}/photo", files={"file": dummy_file2})
        assert res_upload_direct.status_code == 200
        assert res_upload_direct.json()["photo_url"] is not None
        assert f"player_{player1_id}_" in res_upload_direct.json()["photo_url"]

        # Delete added player
        res_del_p = client.delete(f"/api/tournaments/players/{added_p['id']}")
        assert res_del_p.status_code == 200

def test_player_animations_api():
    with TestClient(app) as client:
        # Create tournament & match
        res_t = client.post("/api/tournaments", json={"name": "Animation Test Tourney", "format_overs": 5})
        assert res_t.status_code == 200
        t_id = res_t.json()["id"]

        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Titans",
            "players": [{"name": "Hardik", "photo_url": "https://example.com/hardik.png"}, {"name": "Gill"}]
        })
        t1_id = res_t1.json()["id"]
        t1_players = res_t1.json()["players"]

        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Royals",
            "players": [{"name": "Boult", "photo_url": "https://example.com/boult.png"}, {"name": "Samson"}]
        })
        t2_id = res_t2.json()["id"]
        t2_players = res_t2.json()["players"]

        res_m = client.post("/api/matches", json={
            "tournament_id": t_id,
            "match_number": 1,
            "team1_id": t1_id,
            "team2_id": t2_id,
            "total_overs": 5
        })
        m_id = res_m.json()["id"]

        # 1. Test VS animation endpoint (existing preserved)
        res_vs = client.post(f"/api/matches/{m_id}/animation", json={"animation": "VS"})
        assert res_vs.status_code == 200
        assert res_vs.json()["event"]["animation"] == "VS"

        # Start innings with toss
        client.post(f"/api/scoring/matches/{m_id}/toss", json={
            "toss_winner_id": t1_id,
            "toss_decision": "bat",
            "striker_id": t1_players[0]["id"],
            "non_striker_id": t1_players[1]["id"],
            "bowler_id": t2_players[0]["id"]
        })

        # Deliver a 4
        client.post(f"/api/scoring/matches/{m_id}/delivery", json={
            "runs_batter": 4,
            "extras_type": "none",
            "extras_runs": 0
        })

        # 2. Test STRIKER animation trigger
        res_striker = client.post(f"/api/matches/{m_id}/animation", json={"animation": "STRIKER"})
        assert res_striker.status_code == 200
        st_data = res_striker.json()["event"]
        assert st_data["animation"] == "PLAYER_CARD"
        assert st_data["role"] == "STRIKER"
        assert st_data["player"]["name"] == "Hardik"
        assert st_data["player"]["runs"] == 4
        assert st_data["player"]["photo_url"] == "https://example.com/hardik.png"

        # 3. Test NON-STRIKER animation trigger
        res_non = client.post(f"/api/matches/{m_id}/animation", json={"animation": "NON_STRIKER"})
        assert res_non.status_code == 200
        non_data = res_non.json()["event"]
        assert non_data["animation"] == "PLAYER_CARD"
        assert non_data["role"] == "NON-STRIKER"
        assert non_data["player"]["name"] == "Gill"
        assert non_data["player"]["runs"] == 0

        # 4. Test BOWLER animation trigger
        res_bowler = client.post(f"/api/matches/{m_id}/animation", json={"animation": "BOWLER"})
        assert res_bowler.status_code == 200
        bw_data = res_bowler.json()["event"]
        assert bw_data["animation"] == "PLAYER_CARD"
        assert bw_data["role"] == "CURRENT BOWLER"
        assert bw_data["player"]["name"] == "Boult"
        assert bw_data["player"]["runs"] == 4
        assert bw_data["player"]["photo_url"] == "https://example.com/boult.png"

        # 5. Test CUSTOM_TEXT animation trigger
        res_custom = client.post(f"/api/matches/{m_id}/animation", json={
            "animation": "CUSTOM_TEXT",
            "text": "Welcome to the Final Match!\nABHI AVENGERS"
        })
        assert res_custom.status_code == 200
        custom_data = res_custom.json()["event"]
        assert custom_data["animation"] == "CUSTOM_TEXT"
        assert custom_data["type"] == "DISPLAY_ANIMATION"
        assert custom_data["text"] == "Welcome to the Final Match!\nABHI AVENGERS"

        # 6. Test STOP / REMOVE animation trigger
        res_stop = client.post(f"/api/matches/{m_id}/animation", json={"action": "STOP"})
        assert res_stop.status_code == 200
        assert res_stop.json()["action"] == "STOP"
        assert res_stop.json()["event"]["type"] == "STOP_ANIMATION"

def test_undo_toss_api_endpoint():
    """Test the POST /api/scoring/matches/{match_id}/toss/undo endpoint."""
    with TestClient(app) as client:
        # 1. Create Tournament
        res_t = client.post("/api/tournaments/", json={"name": "Undo Toss League", "format_overs": 5})
        tourney_id = res_t.json()["id"]

        # 2. Create Teams
        res_t1 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Titans",
            "players": [{"name": "P1"}, {"name": "P2"}, {"name": "P3"}]
        })
        t1_id = res_t1.json()["id"]
        t1_p1_id = res_t1.json()["players"][0]["id"]
        t1_p2_id = res_t1.json()["players"][1]["id"]

        res_t2 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Royals",
            "players": [{"name": "P4"}, {"name": "P5"}, {"name": "P6"}]
        })
        t2_id = res_t2.json()["id"]
        t2_p1_id = res_t2.json()["players"][0]["id"]

        # 3. Create Match
        res_m = client.post("/api/matches/", json={
            "tournament_id": tourney_id,
            "team1_id": t1_id,
            "team2_id": t2_id,
            "total_overs": 5
        })
        m_id = res_m.json()["id"]

        # 4. Perform Toss & Start
        res_toss = client.post(f"/api/scoring/matches/{m_id}/toss", json={
            "toss_winner_id": t1_id,
            "toss_decision": "bat",
            "striker_id": t1_p1_id,
            "non_striker_id": t1_p2_id,
            "bowler_id": t2_p1_id
        })
        assert res_toss.status_code == 200
        assert res_toss.json()["data"]["status"] == "live"

        # 5. Undo Toss via API
        res_undo_toss = client.post(f"/api/scoring/matches/{m_id}/toss/undo")
        assert res_undo_toss.status_code == 200
        data = res_undo_toss.json()["data"]
        assert data["status"] == "upcoming"
        assert data["toss_winner_id"] is None
        assert data["toss_decision"] is None


def test_toss_total_overs_customization():
    """Test that setting total_overs at toss time updates the match total_overs."""
    with TestClient(app) as client:
        res_t = client.post("/api/tournaments/", json={"name": "Overs Toss League", "format_overs": 10})
        tourney_id = res_t.json()["id"]

        res_t1 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Eagles",
            "players": [{"name": "E1"}, {"name": "E2"}]
        })
        t1_id = res_t1.json()["id"]
        e1_id = res_t1.json()["players"][0]["id"]
        e2_id = res_t1.json()["players"][1]["id"]

        res_t2 = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Hawks",
            "players": [{"name": "H1"}, {"name": "H2"}]
        })
        t2_id = res_t2.json()["id"]
        h1_id = res_t2.json()["players"][0]["id"]

        # Match scheduled with default 10 overs
        res_m = client.post("/api/matches/", json={
            "tournament_id": tourney_id,
            "team1_id": t1_id,
            "team2_id": t2_id,
            "total_overs": 10
        })
        m_id = res_m.json()["id"]
        assert res_m.json()["total_overs"] == 10

        # At toss time, teams agree to play an 8 overs match!
        res_toss = client.post(f"/api/scoring/matches/{m_id}/toss", json={
            "toss_winner_id": t1_id,
            "toss_decision": "bat",
            "striker_id": e1_id,
            "non_striker_id": e2_id,
            "bowler_id": h1_id,
            "total_overs": 8,
            "max_overs_per_bowler": 2
        })
        assert res_toss.status_code == 200
        live_data = res_toss.json()["data"]
        assert live_data["status"] == "live"
        assert live_data["total_overs"] == 8
        assert live_data["max_overs_per_bowler"] == 2

        # Verify live match endpoint also reports 8 total overs
        res_live = client.get(f"/api/matches/{m_id}/live")
        assert res_live.status_code == 200
        assert res_live.json()["total_overs"] == 8


def test_captain_specification():
    with TestClient(app) as client:
        # Create tournament
        res_t = client.post("/api/tournaments", json={
            "name": "Captain Test League",
            "format_overs": 10
        })
        assert res_t.status_code == 200
        tourney_id = res_t.json()["id"]

        # Create team with initial players, marking the first one as captain
        res_team = client.post(f"/api/tournaments/{tourney_id}/teams", json={
            "name": "Super Kings",
            "players": [
                {"name": "MS Dhoni", "is_captain": True},
                {"name": "Ruturaj Gaikwad", "is_captain": False},
                {"name": "Ravindra Jadeja", "is_captain": False}
            ]
        })
        assert res_team.status_code == 200
        team = res_team.json()
        players = team["players"]
        assert len(players) == 3
        dhoni = next(p for p in players if p["name"] == "MS Dhoni")
        ruturaj = next(p for p in players if p["name"] == "Ruturaj Gaikwad")
        assert dhoni["is_captain"] is True
        assert ruturaj["is_captain"] is False

        # Add a new player and designate as new captain
        res_add = client.post(f"/api/tournaments/teams/{team['id']}/players", json={
            "name": "Ben Stokes",
            "is_captain": True
        })
        assert res_add.status_code == 200
        new_player = res_add.json()
        assert new_player["is_captain"] is True

        # Check that Dhoni is no longer captain and Stokes is
        res_get_t = client.get(f"/api/tournaments/{tourney_id}")
        t_data = res_get_t.json()
        sk_team = next(t for t in t_data["teams"] if t["id"] == team["id"])
        dhoni_updated = next(p for p in sk_team["players"] if p["id"] == dhoni["id"])
        stokes_updated = next(p for p in sk_team["players"] if p["id"] == new_player["id"])
        assert dhoni_updated["is_captain"] is False
        assert stokes_updated["is_captain"] is True

        # Update player: Make Ruturaj captain via PUT /players/{id}
        res_update = client.put(f"/api/tournaments/players/{ruturaj['id']}", json={
            "is_captain": True
        })
        assert res_update.status_code == 200
        assert res_update.json()["is_captain"] is True

        # Verify stokes is no longer captain
        res_get_t2 = client.get(f"/api/tournaments/{tourney_id}")
        sk_team2 = next(t for t in res_get_t2.json()["teams"] if t["id"] == team["id"])
        ruturaj_final = next(p for p in sk_team2["players"] if p["id"] == ruturaj["id"])
        stokes_final = next(p for p in sk_team2["players"] if p["id"] == new_player["id"])
        assert ruturaj_final["is_captain"] is True
        assert stokes_final["is_captain"] is False


def test_match_scorecard_pdf_generation():
    with TestClient(app) as client:
        # Create tournament, teams, and match
        res_t = client.post("/api/tournaments", json={"name": "PDF Cup 2026", "format_overs": 5})
        assert res_t.status_code == 200
        t_id = res_t.json()["id"]

        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Abhi Avengers",
            "short_name": "ABA",
            "players": [{"name": "Abhi"}, {"name": "Rohit"}, {"name": "Kohli"}]
        })
        assert res_t1.status_code == 200
        t1_id = res_t1.json()["id"]

        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Royal Strikers",
            "short_name": "RYS",
            "players": [{"name": "Dhoni"}, {"name": "Hardik"}, {"name": "Bumrah"}]
        })
        assert res_t2.status_code == 200
        t2_id = res_t2.json()["id"]

        res_m = client.post("/api/matches", json={
            "tournament_id": t_id,
            "match_number": 72,
            "team1_id": t1_id,
            "team2_id": t2_id,
            "total_overs": 5
        })
        assert res_m.status_code == 200
        match_id = res_m.json()["id"]

        # Fetch scorecard PDF
        res_pdf = client.get(f"/api/matches/{match_id}/scorecard/pdf")
        assert res_pdf.status_code == 200
        assert res_pdf.headers.get("content-type") == "application/pdf"
        assert "Content-Disposition" in res_pdf.headers
        disposition = res_pdf.headers["Content-Disposition"]
        assert "Abhi_Avengers_vs_Royal_Strikers" in disposition
        assert "_Scorecard.pdf" in disposition
        assert len(res_pdf.content) > 1000
        # PDF starts with %PDF header
        assert res_pdf.content.startswith(b"%PDF")

def test_commentator_dashboard():
    with TestClient(app) as client:
        # Create tournament & match
        res_t = client.post("/api/tournaments", json={
            "name": "Super Commentary Cup",
            "format_overs": 5
        })
        assert res_t.status_code == 200
        t_id = res_t.json()["id"]

        res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Commentary Team A",
            "short_name": "CTA",
            "players": [{"name": "Player A1"}, {"name": "Player A2"}, {"name": "Player A3"}]
        })
        t1_id = res_t1.json()["id"]
        t1_p = res_t1.json()["players"]

        res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={
            "name": "Commentary Team B",
            "short_name": "CTB",
            "players": [{"name": "Player B1"}, {"name": "Player B2"}, {"name": "Player B3"}]
        })
        t2_id = res_t2.json()["id"]
        t2_p = res_t2.json()["players"]

        res_m = client.post("/api/matches", json={
            "tournament_id": t_id,
            "match_number": 88,
            "team1_id": t1_id,
            "team2_id": t2_id,
            "total_overs": 5
        })
        match_id = res_m.json()["id"]

        # 1. Test Commentator Page HTML render (both routes)
        res_page1 = client.get(f"/commentator/{match_id}")
        assert res_page1.status_code == 200
        assert "COMMENTATOR" in res_page1.text.upper()
        assert "RECENT COMMENTARY" not in res_page1.text.upper()

        res_page2 = client.get(f"/match/{match_id}/commentator")
        assert res_page2.status_code == 200
        assert "COMMENTATOR" in res_page2.text.upper()

        # 2. Start toss
        client.post(f"/api/scoring/matches/{match_id}/toss", json={
            "toss_winner_id": t1_id,
            "toss_decision": "bat",
            "striker_id": t1_p[0]["id"],
            "non_striker_id": t1_p[1]["id"],
            "bowler_id": t2_p[0]["id"]
        })

        # 3. Score a SIX
        client.post(f"/api/scoring/matches/{match_id}/delivery", json={
            "runs_batter": 6,
            "extras_type": "none",
            "extras_runs": 0
        })

        # 4. Check live state has all_batters, all_bowlers, extras_breakdown, last_ball
        res_live = client.get(f"/api/matches/{match_id}/live")
        assert res_live.status_code == 200
        live_data = res_live.json()
        assert live_data["runs"] == 6
        assert len(live_data["all_batters"]) > 0
        assert len(live_data["all_bowlers"]) > 0
        assert live_data["last_ball"]["tag"] == "SIX"

        # 5. Test Generate Commentary API
        res_comm = client.post(f"/api/scoring/matches/{match_id}/generate-commentary")
        assert res_comm.status_code == 200
        comm_data = res_comm.json()
        assert "commentary" in comm_data
        assert len(comm_data["commentary"]) > 5

        # 6. Test Send Commentary to Live View API
        res_disp = client.post(f"/api/scoring/matches/{match_id}/commentary-display", json={
            "text": "What a massive six over long-on!"
        })
        assert res_disp.status_code == 200
        assert res_disp.json()["status"] == "ok"










