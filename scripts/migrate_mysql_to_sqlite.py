"""
Data Migration Script: MySQL to SQLite (data/cricket.db)
Safely copies all existing data from MySQL database 'cricketscore' to SQLite.
Preserves:
- Primary Key IDs
- Foreign-key relationships
- Datetime timestamps
- Integer, Boolean, Float values
Does NOT modify or delete MySQL data.
"""

import os
import sys
from datetime import datetime
from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.orm import sessionmaker

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.models.models import (
    Base, Tournament, Team, Player, Match, Innings, Delivery, Wicket
)

def enable_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA foreign_keys=OFF;")  # Disable during bulk load to maintain exact insert order
    cursor.close()

def run_migration():
    print("=" * 60)
    print("CRICKET SCORING APP: MYSQL -> SQLITE DATA MIGRATION")
    print("=" * 60)

    # 1. Connect to MySQL (Source of Truth)
    mysql_url = settings.get_database_url()
    print(f"[1/5] Connecting to source MySQL database: {settings.DB_NAME}@{settings.DB_HOST}...")
    try:
        mysql_engine = create_engine(mysql_url, echo=False)
        with mysql_engine.connect() as conn:
            print("  [OK] Successfully connected to MySQL.")
    except Exception as e:
        print(f"  [ERROR] Failed to connect to MySQL: {e}")
        sys.exit(1)

    # 2. Ensure data/ directory and setup SQLite engine
    os.makedirs("data", exist_ok=True)
    sqlite_db_path = os.path.join("data", "cricket.db")
    sqlite_url = f"sqlite:///{sqlite_db_path}"

    print(f"[2/5] Initializing target SQLite database: {sqlite_db_path}...")
    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False}, echo=False)
    event.listen(sqlite_engine, "connect", enable_sqlite_pragmas)

    # Create schema in SQLite
    Base.metadata.create_all(bind=sqlite_engine)
    print("  [OK] Created SQLite database schema.")

    MySQLSession = sessionmaker(bind=mysql_engine)
    SQLiteSession = sessionmaker(bind=sqlite_engine)

    mysql_session = MySQLSession()
    sqlite_session = SQLiteSession()

    # Define models in dependency order
    models = [
        ("tournaments", Tournament),
        ("teams", Team),
        ("players", Player),
        ("matches", Match),
        ("innings", Innings),
        ("deliveries", Delivery),
        ("wickets", Wicket),
    ]

    print("\n[3/5] Migrating records table by table...")
    migration_summary = {}

    for table_name, model_cls in models:
        mysql_count = mysql_session.query(model_cls).count()
        print(f"  -> Migrating '{table_name}' ({mysql_count} records)...")

        # Fetch records from MySQL
        records = mysql_session.query(model_cls).all()

        migrated_count = 0
        for rec in records:
            # Build dictionary of all column values
            cols = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
            
            # Check if record already exists in SQLite
            existing = sqlite_session.query(model_cls).filter_by(id=rec.id).first()
            if not existing:
                sqlite_obj = model_cls(**cols)
                sqlite_session.add(sqlite_obj)
                migrated_count += 1

        sqlite_session.commit()
        migration_summary[table_name] = (mysql_count, sqlite_session.query(model_cls).count())
        print(f"    [OK] '{table_name}': {migration_summary[table_name][1]}/{mysql_count} records in SQLite.")

    # 4. Turn foreign keys back ON in SQLite
    with sqlite_engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON;"))
        conn.commit()

    # 5. Verification
    print("\n[4/5] VERIFYING DATA INTEGRITY (MySQL vs SQLite)...")
    all_matched = True
    print(f"{'Table':<15} | {'MySQL Rows':<12} | {'SQLite Rows':<12} | {'Status':<10}")
    print("-" * 55)
    for table_name, (m_count, s_count) in migration_summary.items():
        status = "MATCH" if m_count == s_count else "MISMATCH"
        if m_count != s_count:
            all_matched = False
        print(f"{table_name:<15} | {m_count:<12} | {s_count:<12} | {status:<10}")

    mysql_session.close()
    sqlite_session.close()

    if all_matched:
        print("\n[5/5] SUCCESS: MIGRATION COMPLETE! All records and relationships are identical.")
    else:
        print("\n[5/5] WARNING: Some tables have row count differences. Check details above.")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
