import os
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_VIDEOS_DIR = os.path.join(BASE_DIR, "static", "videos")
VIDEO_EXTENSIONS = {".mp4", ".webm", ".m4v", ".mov", ".ogg", ".mkv"}

def get_video_file_mtime(file_path: str) -> int:
    """Get the file modification timestamp as an integer without reading file content."""
    try:
        if os.path.isfile(file_path):
            return int(os.path.getmtime(file_path))
    except Exception as e:
        logger.debug(f"Error getting mtime for {file_path}: {e}")
    return 1

def get_all_video_versions() -> Dict[str, int]:
    """
    Scan static/videos directory (and immediate subdirectories) to collect
    lightweight mtime versions for all video files.
    
    Returns a dictionary mapping:
    - filename (e.g., 'four.mp4' -> 1711234567)
    - relative path (e.g., 'teams/team1.mp4' -> 1711234568)
    - normalized lowercase name for resilient lookup
    """
    versions: Dict[str, int] = {}
    if not os.path.exists(STATIC_VIDEOS_DIR):
        return versions

    try:
        for root, _, files in os.walk(STATIC_VIDEOS_DIR):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in VIDEO_EXTENSIONS:
                    full_path = os.path.join(root, f)
                    mtime = get_video_file_mtime(full_path)
                    rel_path = os.path.relpath(full_path, STATIC_VIDEOS_DIR).replace("\\", "/")
                    
                    # Store exact relative path and base filename
                    versions[rel_path] = mtime
                    versions[f] = mtime
                    versions[f.lower()] = mtime
    except Exception as e:
        logger.warning(f"Error scanning video directory '{STATIC_VIDEOS_DIR}': {e}")

    return versions

def get_video_version(filename_or_path: str) -> int:
    """
    Get the modification version for a specific video filename or path.
    Does not read the file body.
    """
    if not filename_or_path:
        return 1
        
    # Strip any query parameters or leading slashes
    clean = filename_or_path.split("?")[0].strip()
    if clean.startswith("/static/videos/"):
        clean = clean[len("/static/videos/"):]
    elif clean.startswith("static/videos/"):
        clean = clean[len("static/videos/"):]
    elif clean.startswith("/"):
        clean = clean.lstrip("/")

    full_path = os.path.join(STATIC_VIDEOS_DIR, clean)
    if os.path.isfile(full_path):
        return get_video_file_mtime(full_path)

    # Fallback to searching by basename in static/videos
    base_name = os.path.basename(clean)
    base_path = os.path.join(STATIC_VIDEOS_DIR, base_name)
    if os.path.isfile(base_path):
        return get_video_file_mtime(base_path)

    return 1

def get_versioned_video_url(filename_or_path: str) -> str:
    """
    Generate a cache-busted URL for a video file based on its file modification time.
    Example: '/static/videos/four.mp4?v=1711234567'
    """
    if not filename_or_path:
        return "/static/videos/"
        
    clean = filename_or_path.split("?")[0].strip()
    if clean.startswith("/static/videos/"):
        clean = clean[len("/static/videos/"):]
    elif clean.startswith("static/videos/"):
        clean = clean[len("static/videos/"):]
    elif clean.startswith("/"):
        clean = clean.lstrip("/")

    version = get_video_version(clean)
    return f"/static/videos/{clean}?v={version}"

STATIC_DIR = os.path.join(BASE_DIR, "static")

def get_static_asset_url(path: str) -> str:
    """
    Generate versioned URL for any static asset (JS, CSS, images, etc.) using file mtime.
    Example: '/static/js/scorer.js?v=1711234567'
    """
    if not path:
        return ""
    clean = path.split("?")[0].strip()
    if clean.startswith("/static/"):
        clean_rel = clean[len("/static/"):]
    elif clean.startswith("static/"):
        clean_rel = clean[len("static/"):]
    elif clean.startswith("/"):
        clean_rel = clean.lstrip("/")
    else:
        clean_rel = clean

    full_path = os.path.join(STATIC_DIR, clean_rel)
    mtime = 1
    if os.path.isfile(full_path):
        try:
            mtime = int(os.path.getmtime(full_path))
        except Exception:
            mtime = 1
    return f"/static/{clean_rel}?v={mtime}"

