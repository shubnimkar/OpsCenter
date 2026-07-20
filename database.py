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
            # Migrate: persist connection-test results so they survive restarts
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ
            """)
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS last_test_ok BOOLEAN
            """)
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS account_id VARCHAR(32)
            """)
            # Migrate: manual sort order (default to id so existing rows get a stable order)
            cur.execute("""
                ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS sort_order INT
            """)
            cur.execute("""
                UPDATE profiles SET sort_order = id WHERE sort_order IS NULL
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

            # ── SES account stats cache table ─────────────────────────────
            # Stores sandbox/production status + aggregate bounce/complaint/reject
            # counts (from GetSendStatistics) per profile/region.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ses_account_stats_cache (
                    profile_name            VARCHAR(255) NOT NULL,
                    profile_color           VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env             VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region                  VARCHAR(100) NOT NULL,
                    sending_enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
                    in_sandbox              BOOLEAN      NOT NULL DEFAULT TRUE,
                    max_24_hour_send        DOUBLE PRECISION NOT NULL DEFAULT 0,
                    total_delivery_attempts BIGINT       NOT NULL DEFAULT 0,
                    total_bounces           BIGINT       NOT NULL DEFAULT 0,
                    total_complaints        BIGINT       NOT NULL DEFAULT 0,
                    total_rejects           BIGINT       NOT NULL DEFAULT 0,
                    cached_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (profile_name, region)
                )
            """)

            # ── SES sending quota cache table ─────────────────────────────
            # Stores the send quota per profile/region (Max24HourSend,
            # MaxSendRate, SentLast24Hours) from ses.get_send_quota().
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ses_sending_quota_cache (
                    profile_name       VARCHAR(255) NOT NULL,
                    profile_color      VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env        VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region             VARCHAR(100) NOT NULL,
                    max_24_hour_send   DOUBLE PRECISION NOT NULL DEFAULT 0,
                    max_send_rate      DOUBLE PRECISION NOT NULL DEFAULT 0,
                    sent_last_24_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
                    cached_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (profile_name, region)
                )
            """)

            # ── SES identity cache table ───────────────────────────────────
            # Stores verified SES identities (domains + email addresses) per
            # profile/region so the dashboard never blocks on AWS API calls.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ses_identity_cache (
                    identity                VARCHAR(255) NOT NULL,
                    profile_name            VARCHAR(255) NOT NULL,
                    profile_color           VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env             VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region                  VARCHAR(100) NOT NULL,
                    identity_type           VARCHAR(20)  NOT NULL DEFAULT 'EmailAddress',
                    verification_status     VARCHAR(50)  NOT NULL DEFAULT 'NotStarted',
                    dkim_enabled            BOOLEAN      NOT NULL DEFAULT FALSE,
                    dkim_verification_status VARCHAR(50) NOT NULL DEFAULT 'NotStarted',
                    bounce_topic_arn        TEXT,
                    complaint_topic_arn     TEXT,
                    delivery_topic_arn      TEXT,
                    forwarding_enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
                    cached_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (identity, profile_name, region)
                )
            """)

            # ── Route 53 hosted zone cache table ───────────────────────────
            # Stores hosted zones per profile (Route 53 is a global service).
            cur.execute("""
                CREATE TABLE IF NOT EXISTS route53_zone_cache (
                    zone_id          VARCHAR(64)  NOT NULL,
                    name             VARCHAR(255) NOT NULL,
                    profile_name     VARCHAR(255) NOT NULL,
                    profile_color    VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env      VARCHAR(50)  NOT NULL DEFAULT 'other',
                    private_zone     BOOLEAN      NOT NULL DEFAULT FALSE,
                    comment          TEXT         NOT NULL DEFAULT '',
                    record_count     INT          NOT NULL DEFAULT 0,
                    caller_reference TEXT         NOT NULL DEFAULT '',
                    tags             JSONB        NOT NULL DEFAULT '{}',
                    cached_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (zone_id, profile_name)
                )
            """)

            # ── Route 53 DNS record cache table ────────────────────────────
            # Stores individual DNS records per hosted zone.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS route53_record_cache (
                    zone_id          VARCHAR(64)  NOT NULL,
                    record_name      TEXT         NOT NULL,
                    record_type      VARCHAR(20)  NOT NULL,
                    profile_name     VARCHAR(255) NOT NULL,
                    profile_color    VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env      VARCHAR(50)  NOT NULL DEFAULT 'other',
                    ttl              INT,
                    values           TEXT[]       NOT NULL DEFAULT '{}',
                    alias_target     TEXT,
                    set_identifier   TEXT         NOT NULL DEFAULT '',
                    weight           INT,
                    region           VARCHAR(100) NOT NULL DEFAULT '',
                    failover         VARCHAR(20)  NOT NULL DEFAULT '',
                    cached_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (zone_id, record_name, record_type, profile_name, set_identifier)
                )
            """)
        conn.commit()
