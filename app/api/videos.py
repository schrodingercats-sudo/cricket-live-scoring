from fastapi import APIRouter, Query
from app.services.video_service import (
    get_all_video_versions,
    get_video_version,
    get_versioned_video_url,
    STATIC_VIDEOS_DIR
)
import os

router = APIRouter(prefix="/api/videos", tags=["Videos"])

@router.get("/versions")
def list_video_versions():
    """
    Returns the file modification versions for all animation videos in static/videos.
    Lightweight, fast os.stat only without reading file contents.
    """
    versions = get_all_video_versions()
    return {
        "status": "ok",
        "versions": versions
    }

@router.get("/version")
def get_single_video_version(file: str = Query(..., description="Video filename or path (e.g., four.mp4)")):
    """
    Returns the modification version and cache-busted URL for a single video file.
    """
    version = get_video_version(file)
    url = get_versioned_video_url(file)
    return {
        "status": "ok",
        "file": file,
        "version": version,
        "url": url
    }
