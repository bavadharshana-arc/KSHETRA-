import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# backend/ (the parent of migrations/) holds database.py and models.py using
# flat imports (same convention as backend/main.py's `from demo_fallback
# import ...`), so it must be on sys.path regardless of the CWD `alembic` is
# invoked from.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import Base, DATABASE_URL  # noqa: E402
import models  # noqa: E402,F401  (import registers all ORM classes on Base.metadata)
from legal import db_models as legal_db_models  # noqa: E402,F401  (Step 6B statutory clock engine tables)
from blockers import db_models as blockers_db_models  # noqa: E402,F401  (Step 7B blocker engine tables)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Always use the same DATABASE_URL the running app would use (env var
# override, default local SQLite file) — alembic.ini deliberately leaves
# sqlalchemy.url unset so there is exactly one place this is configured.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# KSHETRA's six persistence-plan tables (Project, Parcel, Alert, CaseAction,
# AuditLog, Prediction) — see backend/models.py — plus, since Step 6B, the
# six statutory-clock-engine tables (RuleSet, AcquisitionEvent,
# CourtStayEvent, ExtensionEvidence, EventConflict, StatutoryClock) — see
# backend/legal/db_models.py — plus, since Step 7B, the three blocker-engine
# tables (Blocker, BlockerEvidence, BlockerAction) — see
# backend/blockers/db_models.py.
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite can't ALTER most column properties in place; batch mode
        # makes future migrations (not this initial one) portable across
        # SQLite and PostgreSQL without separate scripts.
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
