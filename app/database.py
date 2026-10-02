import os
import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cricket_app.database")

Base = declarative_base()

def get_engine():
    # Ensure data directory exists
    db_path = settings.SQLITE_DB_PATH
    dir_name = os.path.dirname(db_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)

    sqlite_url = settings.get_database_url()
    
    engine = create_engine(
        sqlite_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        echo=False
    )

    # Configure SQLite PRAGMAs on each new DBAPI connection
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.close()

    logger.info(f"SQLite database initialized at: {db_path}")
    return engine

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from app.models import models
    Base.metadata.create_all(bind=engine)
    
    # Safe column migration for existing tables
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            # Migrations for matches
            try:
                conn.execute(text("ALTER TABLE matches ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE matches ADD COLUMN deleted_at DATETIME NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE matches ADD COLUMN scheduled_date DATETIME NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE matches ADD COLUMN max_overs_per_bowler INT NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("UPDATE matches SET is_deleted = 0 WHERE is_deleted IS NULL"))
                conn.commit()
            except Exception:
                pass

            # Migrations for tournaments
            try:
                conn.execute(text("ALTER TABLE tournaments ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE tournaments ADD COLUMN deleted_at DATETIME NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("UPDATE tournaments SET is_deleted = 0 WHERE is_deleted IS NULL"))
                conn.commit()
            except Exception:
                pass

            # Migrations for teams
            try:
                conn.execute(text("ALTER TABLE teams ADD COLUMN logo_url VARCHAR(500) NULL"))
                conn.commit()
            except Exception:
                pass

            # Migrations for players
            try:
                conn.execute(text("ALTER TABLE players ADD COLUMN photo_url VARCHAR(500) NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE players ADD COLUMN is_captain BOOLEAN DEFAULT 0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("UPDATE players SET is_captain = 0 WHERE is_captain IS NULL"))
                conn.commit()
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"Migration check: {e}")
        
    logger.info("Database tables initialized.")
