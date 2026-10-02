import os
import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.video_service import (
    get_all_video_versions,
    get_video_version,
    get_versioned_video_url,
    STATIC_VIDEOS_DIR
)

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_video_versions_api(client):
    """Test /api/videos/versions endpoint returns existing video files with modification timestamps."""
    response = client.get("/api/videos/versions")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    versions = data["versions"]
    assert "four.mp4" in versions
    assert "six.mp4" in versions
    assert isinstance(versions["four.mp4"], int)
    assert versions["four.mp4"] > 0

def test_single_video_version_api(client):
    """Test /api/videos/version endpoint for single file lookup."""
    response = client.get("/api/videos/version?file=four.mp4")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["file"] == "four.mp4"
    assert data["url"].startswith("/static/videos/four.mp4?v=")

def test_mtime_change_detection(tmp_path):
    """Test that modifying a video file's mtime automatically generates a new versioned URL."""
    four_path = os.path.join(STATIC_VIDEOS_DIR, "four.mp4")
    original_mtime = int(os.path.getmtime(four_path))
    v1 = get_video_version("four.mp4")
    url1 = get_versioned_video_url("four.mp4")
    assert f"?v={original_mtime}" in url1

    # Simulate video file modification by touching mtime forward
    new_mtime = original_mtime + 500
    os.utime(four_path, (new_mtime, new_mtime))
    try:
        v2 = get_video_version("four.mp4")
        url2 = get_versioned_video_url("four.mp4")
        assert v2 == new_mtime
        assert v2 != v1
        assert f"?v={new_mtime}" in url2
        assert url1 != url2
    finally:
        # Restore original mtime
        os.utime(four_path, (original_mtime, original_mtime))

def test_unchanged_video_version_stability():
    """Test that when a file is NOT modified, the version stays completely identical."""
    url1 = get_versioned_video_url("six.mp4")
    url2 = get_versioned_video_url("six.mp4")
    assert url1 == url2

def test_arbitrary_video_name_support():
    """Test that video version service supports arbitrary videos in static/videos."""
    test_vid = os.path.join(STATIC_VIDEOS_DIR, "test_custom_anim.mp4")
    with open(test_vid, "wb") as f:
        f.write(b"fake_video_bytes_data")
    
    try:
        all_versions = get_all_video_versions()
        assert "test_custom_anim.mp4" in all_versions
        url = get_versioned_video_url("test_custom_anim.mp4")
        assert url.startswith("/static/videos/test_custom_anim.mp4?v=")
    finally:
        if os.path.exists(test_vid):
            os.remove(test_vid)

def test_video_cache_headers(client):
    """Test that versioned video URLs are cached with max-age, while unversioned revalidate."""
    # Versioned video request -> public cache
    res_versioned = client.get("/static/videos/four.mp4?v=12345")
    assert res_versioned.status_code == 200
    cache_ctrl = res_versioned.headers.get("Cache-Control", "")
    assert "public" in cache_ctrl
    assert "max-age=" in cache_ctrl

    # Unversioned video request -> no-cache revalidate
    res_unversioned = client.get("/static/videos/four.mp4")
    assert res_unversioned.status_code == 200
    assert "no-cache" in res_unversioned.headers.get("Cache-Control", "")

def test_live_view_renders_video_urls(client):
    """Test that live view HTML contains the versioned preloads and INITIAL_VIDEO_VERSIONS."""
    # Create tournament & match
    res_t = client.post("/api/tournaments", json={"name": "Video Test Cup", "format_overs": 5})
    t_id = res_t.json()["id"]
    res_t1 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Team A", "short_name": "TMA", "players": [{"name": "P1"}]})
    res_t2 = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "Team B", "short_name": "TMB", "players": [{"name": "P2"}]})
    m_id = client.post("/api/matches", json={
        "tournament_id": t_id, "match_number": 1, "team1_id": res_t1.json()["id"], "team2_id": res_t2.json()["id"], "total_overs": 5
    }).json()["id"]

    res_live = client.get(f"/match/{m_id}/live")
    assert res_live.status_code == 200
    html = res_live.text
    assert "/static/videos/four.mp4?v=" in html
    assert "/static/videos/six.mp4?v=" in html
    assert "INITIAL_VIDEO_VERSIONS" in html
