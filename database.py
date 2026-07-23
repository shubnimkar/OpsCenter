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
                    function_name        VARCHAR(255) NOT NULL,
                    profile_name         VARCHAR(255) NOT NULL,
                    profile_color        VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
                    profile_env          VARCHAR(50)  NOT NULL DEFAULT 'other',
                    region               VARCHAR(100) NOT NULL,
                    runtime              VARCHAR(50)  NOT NULL DEFAULT '-',
                    handler              VARCHAR(255) NOT NULL DEFAULT '-',
                    state                VARCHAR(50)  NOT NULL DEFAULT '-',
                    last_modified        TIMESTAMPTZ,
                    code_size            BIGINT       NOT NULL DEFAULT 0,
                    memory_size          INT          NOT NULL DEFAULT 0,
                    timeout              INT          NOT NULL DEFAULT 0,
                    description          TEXT         NOT NULL DEFAULT '',
                    last_invocation_time TIMESTAMPTZ,
                    cached_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (function_name, profile_name, region)
                )
            """)
            # Migrate: add last_invocation_time to tables created before this feature
            cur.execute("""
                ALTER TABLE lambda_cache
                ADD COLUMN IF NOT EXISTS last_invocation_time TIMESTAMPTZ
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

            # ── SSL Certificate monitoring table ────────────────────────────
            # User-managed domains with SSL certificate metadata fetched via
            # direct TLS socket connections (not AWS ACM).
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ssl_certificates (
                    id             SERIAL       PRIMARY KEY,
                    domain_name    VARCHAR(255) NOT NULL UNIQUE,
                    port           INT          NOT NULL DEFAULT 443,
                    environment    VARCHAR(50)  NOT NULL DEFAULT 'production',
                    owner          VARCHAR(255) NOT NULL DEFAULT '',
                    notes          TEXT         NOT NULL DEFAULT '',
                    renewal_date   DATE,
                    issuer         TEXT         NOT NULL DEFAULT '',
                    valid_from     TIMESTAMPTZ,
                    expiry_date    TIMESTAMPTZ,
                    days_remaining INT,
                    status         VARCHAR(20)  NOT NULL DEFAULT 'unknown',
                    last_checked   TIMESTAMPTZ,
                    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)
            # Migrations for ssl_certificates if table was created without some columns
            cur.execute("""
                ALTER TABLE ssl_certificates
                ADD COLUMN IF NOT EXISTS renewal_date DATE
            """)
            cur.execute("""
                ALTER TABLE ssl_certificates
                ADD COLUMN IF NOT EXISTS owner VARCHAR(255) NOT NULL DEFAULT ''
            """)
            cur.execute("""
                ALTER TABLE ssl_certificates
                ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''
            """)
            # Migrate: add SAN list and key algorithm columns
            cur.execute("""
                ALTER TABLE ssl_certificates
                ADD COLUMN IF NOT EXISTS san_list TEXT[] NOT NULL DEFAULT '{}'
            """)
            cur.execute("""
                ALTER TABLE ssl_certificates
                ADD COLUMN IF NOT EXISTS key_algorithm VARCHAR(50) NOT NULL DEFAULT ''
            """)

            # ── Website Uptime Monitor ─────────────────────────────────────
            # Stores each monitored website with its monitoring configuration.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS website_monitor (
                    id                  SERIAL       PRIMARY KEY,
                    name                VARCHAR(255) NOT NULL,
                    url                 TEXT         NOT NULL UNIQUE,
                    environment         VARCHAR(50)  NOT NULL DEFAULT 'production',
                    monitoring_interval INT          NOT NULL DEFAULT 300,
                    timeout_seconds     INT          NOT NULL DEFAULT 30,
                    expected_status     INT          NOT NULL DEFAULT 200,
                    keyword             TEXT         NOT NULL DEFAULT '',
                    maintenance_mode    BOOLEAN      NOT NULL DEFAULT FALSE,
                    notes               TEXT         NOT NULL DEFAULT '',
                    -- Latest check snapshot (denormalised for fast dashboard reads)
                    last_status         VARCHAR(40)  NOT NULL DEFAULT 'unknown',
                    last_http_status    INT,
                    last_response_time  INT,
                    last_checked_at     TIMESTAMPTZ,
                    next_check_at       TIMESTAMPTZ,
                    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)
            # Migrations for website_monitor added later
            cur.execute("""
                ALTER TABLE website_monitor
                ADD COLUMN IF NOT EXISTS keyword TEXT NOT NULL DEFAULT ''
            """)
            cur.execute("""
                ALTER TABLE website_monitor
                ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE
            """)
            cur.execute("""
                ALTER TABLE website_monitor
                ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''
            """)

            # ── Website monitor history ────────────────────────────────────
            # Append-only log of every health-check result per website.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS website_monitor_history (
                    id               SERIAL       PRIMARY KEY,
                    website_id       INT          NOT NULL REFERENCES website_monitor(id) ON DELETE CASCADE,
                    status           VARCHAR(40)  NOT NULL,
                    http_status      INT,
                    response_time_ms INT,
                    error_message    TEXT,
                    checked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_wmh_website_checked
                    ON website_monitor_history (website_id, checked_at DESC)
            """)

            # ── Notification alert events ──────────────────────────────────
            # Dedup log of every fired alert. One active row per
            # (alert_type, resource_key) — resolved_at NULL means still firing.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS alert_events (
                    id           SERIAL       PRIMARY KEY,
                    alert_type   VARCHAR(50)  NOT NULL,
                    resource_key VARCHAR(255) NOT NULL,
                    title        TEXT         NOT NULL,
                    message      TEXT         NOT NULL,
                    severity     VARCHAR(20)  NOT NULL DEFAULT 'info',
                    first_fired  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    last_fired   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    resolved_at  TIMESTAMPTZ,
                    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
                    email_sent   BOOLEAN      NOT NULL DEFAULT FALSE
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_alert_events_unread
                    ON alert_events (is_read, first_fired DESC)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_alert_events_active
                    ON alert_events (alert_type, resource_key, resolved_at)
                    WHERE resolved_at IS NULL
            """)

            # ── Notification settings ──────────────────────────────────────
            # Single-row table: which SES identity to send from + enabled flag.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notification_settings (
                    id           INT  PRIMARY KEY DEFAULT 1,
                    sender_email TEXT,
                    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
                    CONSTRAINT single_row CHECK (id = 1)
                )
            """)
            cur.execute("""
                INSERT INTO notification_settings (id) VALUES (1)
                ON CONFLICT (id) DO NOTHING
            """)

            # ── Notification recipients ────────────────────────────────────
            # List of email addresses that receive alerts.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notification_recipients (
                    id         SERIAL       PRIMARY KEY,
                    email      VARCHAR(255) NOT NULL UNIQUE,
                    enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)

        conn.commit()
