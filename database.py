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
            # Migrate: add regions array column (multi-region support)
            # Backfills existing rows from the legacy single-region column
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS regions TEXT[] NOT NULL DEFAULT '{}'
            """)
            cur.execute("""
                UPDATE profiles
                SET regions = ARRAY[region]
                WHERE regions = '{}'
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

            # ── S3 bucket cache table ──────────────────────────────────────
            # Stores the last-known S3 bucket metadata per profile so the
            # dashboard reads from Postgres instead of hitting AWS on every request.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS s3_bucket_cache (
                    bucket_name   VARCHAR(255) NOT NULL,
                    profile_name  VARCHAR(255) NOT NULL,
                    profile_color VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env   VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region        VARCHAR(100) NOT NULL DEFAULT '-',
                    creation_date TIMESTAMPTZ,
                    cached_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (bucket_name, profile_name)
                )
            """)

            # ── Lambda function cache table ────────────────────────────────
            # Stores the last-known Lambda function metadata per profile/region.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS lambda_cache (
                    function_name VARCHAR(255) NOT NULL,
                    profile_name  VARCHAR(255) NOT NULL,
                    profile_color VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env   VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region        VARCHAR(100) NOT NULL,
                    runtime       VARCHAR(50)  NOT NULL DEFAULT '-',
                    handler       VARCHAR(255) NOT NULL DEFAULT '-',
                    state         VARCHAR(50)  NOT NULL DEFAULT '-',
                    last_modified TIMESTAMPTZ,
                    code_size     BIGINT       NOT NULL DEFAULT 0,
                    memory_size   INT          NOT NULL DEFAULT 0,
                    timeout       INT          NOT NULL DEFAULT 0,
                    description   TEXT         NOT NULL DEFAULT '',
                    cached_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (function_name, profile_name, region)
                )
            """)

            # ── IAM user cache table ───────────────────────────────────────
            # Stores the last-known IAM user metadata per profile.
            # IAM is a global service — one set of users per account/profile.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS iam_user_cache (
                    username        VARCHAR(128) NOT NULL,
                    profile_name    VARCHAR(255) NOT NULL,
                    profile_color   VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env     VARCHAR(50)  NOT NULL DEFAULT 'other',
                    user_id         VARCHAR(64)  NOT NULL DEFAULT '-',
                    arn             TEXT         NOT NULL DEFAULT '-',
                    path            TEXT         NOT NULL DEFAULT '/',
                    created_at      TIMESTAMPTZ,
                    password_last_used TIMESTAMPTZ,
                    password_created_at TIMESTAMPTZ,
                    last_activity   TIMESTAMPTZ,
                    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
                    console_access  BOOLEAN      NOT NULL DEFAULT FALSE,
                    access_key_count INT         NOT NULL DEFAULT 0,
                    active_key_count INT         NOT NULL DEFAULT 0,
                    access_keys_detail JSONB     NOT NULL DEFAULT '[]',
                    groups          TEXT[]       NOT NULL DEFAULT '{}',
                    attached_policies TEXT[]     NOT NULL DEFAULT '{}',
                    inline_policies JSONB        NOT NULL DEFAULT '[]',
                    cached_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (username, profile_name)
                )
            """)
            # Migrate: add inline_policies to tables created before this feature
            cur.execute("""
                ALTER TABLE iam_user_cache
                ADD COLUMN IF NOT EXISTS inline_policies JSONB NOT NULL DEFAULT '[]'
            """)
            # Migrate: add extended access/activity fields
            cur.execute("""
                ALTER TABLE iam_user_cache
                ADD COLUMN IF NOT EXISTS password_created_at TIMESTAMPTZ
            """)
            cur.execute("""
                ALTER TABLE iam_user_cache
                ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ
            """)
            cur.execute("""
                ALTER TABLE iam_user_cache
                ADD COLUMN IF NOT EXISTS access_keys_detail JSONB NOT NULL DEFAULT '[]'
            """)

            # ── IAM role cache table ───────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS iam_role_cache (
                    role_name       VARCHAR(128) NOT NULL,
                    profile_name    VARCHAR(255) NOT NULL,
                    profile_color   VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env     VARCHAR(50)  NOT NULL DEFAULT 'other',
                    role_id         VARCHAR(64)  NOT NULL DEFAULT '-',
                    arn             TEXT         NOT NULL DEFAULT '-',
                    path            TEXT         NOT NULL DEFAULT '/',
                    created_at      TIMESTAMPTZ,
                    description     TEXT         NOT NULL DEFAULT '',
                    max_session_duration INT     NOT NULL DEFAULT 3600,
                    attached_policies TEXT[]     NOT NULL DEFAULT '{}',
                    trusted_services  TEXT[]     NOT NULL DEFAULT '{}',
                    cached_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (role_name, profile_name)
                )
            """)

            # ── IAM group cache table ──────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS iam_group_cache (
                    group_name      VARCHAR(128) NOT NULL,
                    profile_name    VARCHAR(255) NOT NULL,
                    profile_color   VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env     VARCHAR(50)  NOT NULL DEFAULT 'other',
                    group_id        VARCHAR(64)  NOT NULL DEFAULT '-',
                    arn             TEXT         NOT NULL DEFAULT '-',
                    path            TEXT         NOT NULL DEFAULT '/',
                    created_at      TIMESTAMPTZ,
                    member_count    INT          NOT NULL DEFAULT 0,
                    attached_policies TEXT[]     NOT NULL DEFAULT '{}',
                    cached_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (group_name, profile_name)
                )
            """)
        conn.commit()
