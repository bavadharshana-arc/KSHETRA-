"""
===============================================================================
KSHETRA: Persistence Layer — Database Engine & Session Setup
===============================================================================

STEP 1 OF THE PERSISTENCE PLAN (backend-persisted state, replacing browser-only
localStorage). This module ONLY wires up the SQLAlchemy engine/session and
SQLite pragmas. It is NOT imported by backend/main.py in this phase — /,
/health and /predict are completely unaffected, and no API router exists yet
that reads or writes through this connection.

Default database: a local SQLite file (backend/kshetra.db), matching the
project's "SQLite for local development" decision. The engine is built so
switching to PostgreSQL/PostGIS later is a `DATABASE_URL` change only:
  - No SQLite-specific column types are used anywhere in models.py.
  - Foreign-key enforcement and WAL mode are turned on explicitly for SQLite
    only (Postgres has FKs on by default and its own WAL-equivalent).
"""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "kshetra.db")

# Overridable via env var so a future PostgreSQL/PostGIS cutover is a
# one-line config change (e.g. DATABASE_URL=postgresql+psycopg://...).
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

_is_sqlite = DATABASE_URL.startswith("sqlite")

# SQLite needs check_same_thread=False for use across FastAPI's threadpool
# (irrelevant for other dialects, so only applied here).
connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        """
        SQLite disables foreign-key enforcement by default (unlike Postgres),
        and its default rollback-journal mode serializes writers more
        aggressively than necessary for this app's access pattern. Both are
        set per-connection since SQLite pragmas are not persisted in the file.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    """
    FastAPI-style dependency generator: yields a session, closes it after the
    request. Unused for now — no router in this codebase depends on it yet
    (that starts in Step 2). Defined here so Step 2 has nothing left to design.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
