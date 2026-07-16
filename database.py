import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    """Create the profiles table if it doesn't exist, and migrate existing tables."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id         SERIAL PRIMARY KEY,
                    name       VARCHAR(255) NOT NULL UNIQUE,
                    access_key VARCHAR(255) NOT NULL,
                    secret_key VARCHAR(255) NOT NULL,
                    region     VARCHAR(100) NOT NULL DEFAULT 'us-east-1',
                    color      VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    env_tag    VARCHAR(50)  NOT NULL DEFAULT 'other',
                    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)
            # Migrate: add color column to tables created before this feature
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS color VARCHAR(20) NOT NULL DEFAULT '#6366f1'
            """)
            # Migrate: add env_tag column to tables created before this feature
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS env_tag VARCHAR(50) NOT NULL DEFAULT 'other'
            """)

            # ── Instance cache table ───────────────────────────────────────
            # Stores the last-known EC2 state per instance so the dashboard
            # reads from Postgres instead of hitting AWS on every request.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS instance_cache (
                    instance_id   VARCHAR(50)  NOT NULL,
                    profile_name  VARCHAR(255) NOT NULL,
                    profile_color VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env   VARCHAR(50)  NOT NULL DEFAULT 'other',
                    name          VARCHAR(255) NOT NULL DEFAULT '-',
                    state         VARCHAR(50)  NOT NULL,
                    instance_type VARCHAR(50)  NOT NULL,
                    public_ip     VARCHAR(50)  NOT NULL DEFAULT '-',
                    private_ip    VARCHAR(50)  NOT NULL DEFAULT '-',
                    public_dns    TEXT         NOT NULL DEFAULT '-',
                    az            VARCHAR(100) NOT NULL DEFAULT '-',
                    cached_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (instance_id, profile_name)
                )
            """)

            # ── Scheduler metadata table ───────────────────────────────────
            # Single-row table tracking the last/next run times and status.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS scheduler_meta (
                    id           INT          PRIMARY KEY DEFAULT 1,
                    last_run_at  TIMESTAMPTZ,
                    next_run_at  TIMESTAMPTZ,
                    last_status  VARCHAR(20)  NOT NULL DEFAULT 'never',
                    last_error   TEXT,
                    CONSTRAINT single_row CHECK (id = 1)
                )
            """)
            # Ensure the single metadata row exists
            cur.execute("""
                INSERT INTO scheduler_meta (id) VALUES (1)
                ON CONFLICT (id) DO NOTHING
            """)
            # Migrate: add poll_interval_seconds to tables created before this feature
            cur.execute("""
                ALTER TABLE scheduler_meta
                ADD COLUMN IF NOT EXISTS poll_interval_seconds INT
            """)
        conn.commit()
