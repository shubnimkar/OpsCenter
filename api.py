from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import psycopg2
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from database import get_connection, init_db
from crypto import encrypt, decrypt
from scheduler import start_scheduler, stop_scheduler, get_scheduler_status, trigger_poll, reschedule_job, MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS

app = FastAPI(title="AWS Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    start_scheduler()


@app.on_event("shutdown")
def shutdown():
    stop_scheduler()


# ── Schemas ──────────────────────────────────────────────────────────────────

ENV_TAGS = {"prod", "staging", "dev", "sandbox", "other"}


class ProfileCreate(BaseModel):
    name: str
    access_key: str
    secret_key: str
    regions: List[str] = ["us-east-1"]
    color: str = "#6366f1"
    env_tag: str = "other"

    @field_validator("name", "access_key", "secret_key")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()

    @field_validator("regions")
    @classmethod
    def valid_regions(cls, v: List[str]) -> List[str]:
        v = [r.strip() for r in v if r and r.strip()]
        if not v:
            raise ValueError("At least one region must be specified")
        return v

    @field_validator("color")
    @classmethod
    def valid_color(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("color must be a hex value like #rgb or #rrggbb")
        return v

    @field_validator("env_tag")
    @classmethod
    def valid_env_tag(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ENV_TAGS:
            raise ValueError(f"env_tag must be one of: {', '.join(sorted(ENV_TAGS))}")
        return v


class ProfileUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""
    name: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    regions: Optional[List[str]] = None
    color: Optional[str] = None
    env_tag: Optional[str] = None

    @field_validator("name", "access_key", "secret_key", mode="before")
    @classmethod
    def not_empty(cls, v):
        if v is not None and (not isinstance(v, str) or not v.strip()):
            raise ValueError("Field must not be empty")
        return v.strip() if isinstance(v, str) else v

    @field_validator("regions", mode="before")
    @classmethod
    def valid_regions(cls, v):
        if v is None:
            return v
        v = [r.strip() for r in v if r and r.strip()]
        if not v:
            raise ValueError("At least one region must be specified")
        return v

    @field_validator("color", mode="before")
    @classmethod
    def valid_color(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v.startswith("#") or len(v) not in (4, 7):
            raise ValueError("color must be a hex value like #rgb or #rrggbb")
        return v

    @field_validator("env_tag", mode="before")
    @classmethod
    def valid_env_tag(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in ENV_TAGS:
            raise ValueError(f"env_tag must be one of: {', '.join(sorted(ENV_TAGS))}")
        return v


class ProfileResponse(BaseModel):
    id: int
    name: str
    regions: List[str]
    color: str
    env_tag: str
    account_id: Optional[str] = None
    last_tested_at: Optional[datetime] = None
    last_test_ok: Optional[bool] = None


class ConnectionTestRequest(BaseModel):
    access_key: str
    secret_key: str
    region: str = "us-east-1"

    @field_validator("access_key", "secret_key", "region")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()


class ConnectionTestResponse(BaseModel):
    ok: bool
    account_id: Optional[str] = None
    arn: Optional[str] = None
    message: str


# ── Instances ─────────────────────────────────────────────────────────────────

@app.get("/api/instances")
def instances():
    """
    Returns cached EC2 instance data from Postgres.
    The background scheduler keeps this table fresh (default: every 5 minutes).
    Falls back to an empty list if the cache has never been populated yet.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    profile_name  AS "Profile",
                    profile_color AS "ProfileColor",
                    profile_env   AS "ProfileEnvTag",
                    name          AS "Name",
                    state         AS "State",
                    instance_id   AS "Instance ID",
                    instance_type AS "Instance Type",
                    public_ip     AS "Public IP",
                    private_ip    AS "Private IP",
                    public_dns    AS "Public DNS",
                    az            AS "AZ",
                    cached_at     AS "CachedAt"
                FROM instance_cache
                ORDER BY profile_name, name
            """)
            return cur.fetchall()


# ── S3 Buckets ────────────────────────────────────────────────────────────────

@app.get("/api/s3-buckets")
def s3_buckets():
    """
    Returns cached S3 bucket data from Postgres.
    The background scheduler keeps this table fresh (default: every 5 minutes).
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    bucket_name   AS "BucketName",
                    profile_name  AS "Profile",
                    profile_color AS "ProfileColor",
                    profile_env   AS "ProfileEnvTag",
                    region        AS "Region",
                    creation_date AS "CreationDate",
                    cached_at     AS "CachedAt"
                FROM s3_bucket_cache
                ORDER BY profile_name, bucket_name
            """)
            return cur.fetchall()


# ── Lambda Functions ──────────────────────────────────────────────────────────

@app.get("/api/lambdas")
def lambdas():
    """
    Returns cached Lambda function data from Postgres.
    The background scheduler keeps this table fresh (default: every 5 minutes).
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    function_name AS "FunctionName",
                    profile_name  AS "Profile",
                    profile_color AS "ProfileColor",
                    profile_env   AS "ProfileEnvTag",
                    region        AS "Region",
                    runtime       AS "Runtime",
                    handler       AS "Handler",
                    state         AS "State",
                    last_modified AS "LastModified",
                    code_size     AS "CodeSize",
                    memory_size   AS "MemorySize",
                    timeout       AS "Timeout",
                    description   AS "Description",
                    cached_at     AS "CachedAt"
                FROM lambda_cache
                ORDER BY profile_name, function_name
            """)
            return cur.fetchall()


# ── Scheduler ─────────────────────────────────────────────────────────────────

@app.get("/api/scheduler/status")
def scheduler_status():
    """
    Returns scheduler metadata: last run time, next run time, status, and any errors.
    """
    return get_scheduler_status()


@app.post("/api/scheduler/trigger", status_code=202)
def scheduler_trigger():
    """
    Manually trigger an immediate EC2 poll outside the normal interval.
    Runs asynchronously — returns immediately; the poll runs in the background.
    """
    return trigger_poll()


class SchedulerConfigUpdate(BaseModel):
    poll_interval_seconds: int

    @field_validator("poll_interval_seconds")
    @classmethod
    def valid_interval(cls, v: int) -> int:
        if not (MIN_INTERVAL_SECONDS <= v <= MAX_INTERVAL_SECONDS):
            raise ValueError(
                f"poll_interval_seconds must be between {MIN_INTERVAL_SECONDS} and {MAX_INTERVAL_SECONDS}"
            )
        return v


@app.patch("/api/scheduler/config")
def scheduler_config(payload: SchedulerConfigUpdate):
    """
    Update the poll interval at runtime — no restart required.
    The new value is persisted to the DB and survives server restarts.
    """
    try:
        return reschedule_job(payload.poll_interval_seconds)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ── Connection test ───────────────────────────────────────────────────────────

@app.post("/api/profiles/test-connection", response_model=ConnectionTestResponse)
def test_connection(payload: ConnectionTestRequest):
    """
    Validate AWS credentials by calling STS GetCallerIdentity.
    Returns account info on success, or an error message on failure.
    """
    try:
        session = boto3.Session(
            aws_access_key_id=payload.access_key,
            aws_secret_access_key=payload.secret_key,
            region_name=payload.region,
        )
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        return ConnectionTestResponse(
            ok=True,
            account_id=identity.get("Account"),
            arn=identity.get("Arn"),
            message="Connection successful",
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        return ConnectionTestResponse(ok=False, message=f"{code}: {msg}")
    except NoCredentialsError:
        return ConnectionTestResponse(ok=False, message="Invalid or missing credentials")
    except Exception as e:
        return ConnectionTestResponse(ok=False, message=str(e))


@app.post("/api/profiles/{profile_id}/test-connection", response_model=ConnectionTestResponse)
def test_saved_profile_connection(profile_id: int):
    """
    Test the stored credentials for an existing profile.
    Decrypts keys from the DB, calls STS GetCallerIdentity, and persists
    the result (last_tested_at, last_test_ok, account_id) back to the profile row.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT access_key, secret_key, regions FROM profiles WHERE id = %s",
                (profile_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    region = (row["regions"] or ["us-east-1"])[0]

    ok = False
    account_id_val = None
    arn_val = None
    message = "Unknown error"

    try:
        session = boto3.Session(
            aws_access_key_id=decrypt(row["access_key"]),
            aws_secret_access_key=decrypt(row["secret_key"]),
            region_name=region,
        )
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        ok = True
        account_id_val = identity.get("Account")
        arn_val = identity.get("Arn")
        message = "Connection successful"
    except ClientError as e:
        message = f"{e.response['Error']['Code']}: {e.response['Error']['Message']}"
    except NoCredentialsError:
        message = "Invalid or missing credentials"
    except Exception as e:
        message = str(e)

    # Persist result — always write, whether success or failure
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE profiles
                SET last_tested_at = NOW(),
                    last_test_ok   = %s,
                    account_id     = CASE WHEN %s THEN %s ELSE account_id END
                WHERE id = %s
                """,
                (ok, ok, account_id_val, profile_id),
            )
        conn.commit()

    return ConnectionTestResponse(
        ok=ok,
        account_id=account_id_val,
        arn=arn_val,
        message=message,
    )


# ── Profiles ──────────────────────────────────────────────────────────────────

@app.get("/api/profiles", response_model=list[ProfileResponse])
def list_profiles():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, regions, color, env_tag, account_id, last_tested_at, last_test_ok FROM profiles ORDER BY sort_order NULLS LAST, id"
            )
            return cur.fetchall()


class ProfileReorderRequest(BaseModel):
    ordered_ids: List[int]


@app.patch("/api/profiles/reorder", status_code=204)
def reorder_profiles(payload: ProfileReorderRequest):
    """
    Accepts a list of profile IDs in the desired display order and
    writes sort_order = position index to each row.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            for idx, profile_id in enumerate(payload.ordered_ids):
                cur.execute(
                    "UPDATE profiles SET sort_order = %s WHERE id = %s",
                    (idx, profile_id),
                )
        conn.commit()


@app.post("/api/profiles", response_model=ProfileResponse, status_code=201)
def create_profile(payload: ProfileCreate):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO profiles (name, access_key, secret_key, regions, color, env_tag)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, name, regions, color, env_tag, account_id, last_tested_at, last_test_ok
                    """,
                    (payload.name, encrypt(payload.access_key), encrypt(payload.secret_key), payload.regions, payload.color, payload.env_tag),
                )
                row = cur.fetchone()
            conn.commit()
        return row
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"Profile '{payload.name}' already exists")


@app.patch("/api/profiles/{profile_id}", response_model=ProfileResponse)
def patch_profile(profile_id: int, payload: ProfileUpdate):
    """Partial update — only updates the fields that are provided."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    # Encrypt credential fields before storing
    if "access_key" in updates:
        updates["access_key"] = encrypt(updates["access_key"])
    if "secret_key" in updates:
        updates["secret_key"] = encrypt(updates["secret_key"])
    set_clause = ", ".join(f"{col} = %s" for col in updates)
    values = list(updates.values()) + [profile_id]

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE profiles SET {set_clause} WHERE id = %s RETURNING id, name, regions, color, env_tag, account_id, last_tested_at, last_test_ok",
                    values,
                )
                row = cur.fetchone()
            conn.commit()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        return row
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"Profile name already exists")


@app.delete("/api/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM profiles WHERE id = %s RETURNING id", (profile_id,))
            deleted = cur.fetchone()
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Profile not found")


class ProfileSummary(BaseModel):
    ec2_count: int
    s3_count: int
    lambda_count: int
    iam_user_count: int


@app.get("/api/profiles/{profile_id}/summary", response_model=ProfileSummary)
def profile_summary(profile_id: int):
    """
    Returns cached resource counts for a single profile.
    Reads from the existing cache tables — no AWS calls made.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Resolve profile name
            cur.execute("SELECT name FROM profiles WHERE id = %s", (profile_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            profile_name = row["name"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM instance_cache WHERE profile_name = %s",
                (profile_name,),
            )
            ec2_count = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM s3_bucket_cache WHERE profile_name = %s",
                (profile_name,),
            )
            s3_count = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM lambda_cache WHERE profile_name = %s",
                (profile_name,),
            )
            lambda_count = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM iam_user_cache WHERE profile_name = %s",
                (profile_name,),
            )
            iam_user_count = cur.fetchone()["cnt"]

    return ProfileSummary(
        ec2_count=ec2_count,
        s3_count=s3_count,
        lambda_count=lambda_count,
        iam_user_count=iam_user_count,
    )


# ── IAM ───────────────────────────────────────────────────────────────────────

@app.get("/api/iam/users")
def iam_users():
    """Returns cached IAM user data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    username             AS "Username",
                    profile_name         AS "Profile",
                    profile_color        AS "ProfileColor",
                    profile_env          AS "ProfileEnvTag",
                    user_id              AS "UserId",
                    arn                  AS "Arn",
                    path                 AS "Path",
                    created_at           AS "CreatedAt",
                    password_last_used   AS "PasswordLastUsed",
                    password_created_at  AS "PasswordCreatedAt",
                    last_activity        AS "LastActivity",
                    mfa_enabled          AS "MfaEnabled",
                    console_access       AS "ConsoleAccess",
                    access_key_count     AS "AccessKeyCount",
                    active_key_count     AS "ActiveKeyCount",
                    access_keys_detail   AS "AccessKeysDetail",
                    groups               AS "Groups",
                    attached_policies    AS "AttachedPolicies",
                    inline_policies      AS "InlinePolicies",
                    cached_at            AS "CachedAt"
                FROM iam_user_cache
                ORDER BY profile_name, username
            """)
            return cur.fetchall()


@app.get("/api/iam/roles")
def iam_roles():
    """Returns cached IAM role data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    role_name            AS "RoleName",
                    profile_name         AS "Profile",
                    profile_color        AS "ProfileColor",
                    profile_env          AS "ProfileEnvTag",
                    role_id              AS "RoleId",
                    arn                  AS "Arn",
                    path                 AS "Path",
                    created_at           AS "CreatedAt",
                    description          AS "Description",
                    max_session_duration AS "MaxSessionDuration",
                    attached_policies    AS "AttachedPolicies",
                    trusted_services     AS "TrustedServices",
                    cached_at            AS "CachedAt"
                FROM iam_role_cache
                ORDER BY profile_name, role_name
            """)
            return cur.fetchall()


@app.get("/api/iam/groups")
def iam_groups():
    """Returns cached IAM group data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    group_name        AS "GroupName",
                    profile_name      AS "Profile",
                    profile_color     AS "ProfileColor",
                    profile_env       AS "ProfileEnvTag",
                    group_id          AS "GroupId",
                    arn               AS "Arn",
                    path              AS "Path",
                    created_at        AS "CreatedAt",
                    member_count      AS "MemberCount",
                    attached_policies AS "AttachedPolicies",
                    cached_at         AS "CachedAt"
                FROM iam_group_cache
                ORDER BY profile_name, group_name
            """)
            return cur.fetchall()


# ── SES ───────────────────────────────────────────────────────────────────────

@app.get("/api/ses-identities")
def ses_identities():
    """Returns cached SES identity data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    identity                 AS "Identity",
                    identity_type            AS "IdentityType",
                    profile_name             AS "Profile",
                    profile_color            AS "ProfileColor",
                    profile_env              AS "ProfileEnvTag",
                    region                   AS "Region",
                    verification_status      AS "VerificationStatus",
                    dkim_enabled             AS "DkimEnabled",
                    dkim_verification_status AS "DkimVerificationStatus",
                    bounce_topic_arn         AS "BounceTopicArn",
                    complaint_topic_arn      AS "ComplaintTopicArn",
                    delivery_topic_arn       AS "DeliveryTopicArn",
                    forwarding_enabled       AS "ForwardingEnabled",
                    cached_at                AS "CachedAt"
                FROM ses_identity_cache
                ORDER BY profile_name, region, identity
            """)
            return cur.fetchall()


@app.get("/api/ses-account-stats")
def ses_account_stats():
    """Returns cached SES account stats (sandbox status, bounce/complaint/reject counts) from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    profile_name            AS "Profile",
                    profile_color           AS "ProfileColor",
                    profile_env             AS "ProfileEnvTag",
                    region                  AS "Region",
                    sending_enabled         AS "SendingEnabled",
                    in_sandbox              AS "InSandbox",
                    max_24_hour_send        AS "Max24HourSend",
                    total_delivery_attempts AS "TotalDeliveryAttempts",
                    total_bounces           AS "TotalBounces",
                    total_complaints        AS "TotalComplaints",
                    total_rejects           AS "TotalRejects",
                    cached_at               AS "CachedAt"
                FROM ses_account_stats_cache
                ORDER BY profile_name, region
            """)
            return cur.fetchall()


@app.get("/api/ses-sending-quotas")
def ses_sending_quotas():
    """Returns cached SES sending quota data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    profile_name       AS "Profile",
                    profile_color      AS "ProfileColor",
                    profile_env        AS "ProfileEnvTag",
                    region             AS "Region",
                    max_24_hour_send   AS "Max24HourSend",
                    max_send_rate      AS "MaxSendRate",
                    sent_last_24_hours AS "SentLast24Hours",
                    cached_at          AS "CachedAt"
                FROM ses_sending_quota_cache
                ORDER BY profile_name, region
            """)
            return cur.fetchall()


# ── Route 53 ─────────────────────────────────────────────────────────────────

@app.get("/api/route53/zones")
def route53_zones():
    """Returns cached Route 53 hosted zone data from Postgres."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    zone_id          AS "ZoneId",
                    name             AS "Name",
                    profile_name     AS "Profile",
                    profile_color    AS "ProfileColor",
                    profile_env      AS "ProfileEnvTag",
                    private_zone     AS "PrivateZone",
                    comment          AS "Comment",
                    record_count     AS "RecordCount",
                    caller_reference AS "CallerReference",
                    tags             AS "Tags",
                    cached_at        AS "CachedAt"
                FROM route53_zone_cache
                ORDER BY profile_name, name
            """)
            return cur.fetchall()


@app.get("/api/route53/records")
def route53_records(zone_id: str | None = None):
    """Returns cached Route 53 DNS records from Postgres, optionally filtered by zone."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            if zone_id:
                cur.execute("""
                    SELECT
                        zone_id        AS "ZoneId",
                        record_name    AS "RecordName",
                        record_type    AS "RecordType",
                        profile_name   AS "Profile",
                        profile_color  AS "ProfileColor",
                        profile_env    AS "ProfileEnvTag",
                        ttl            AS "TTL",
                        values         AS "Values",
                        alias_target   AS "AliasTarget",
                        set_identifier AS "SetIdentifier",
                        weight         AS "Weight",
                        region         AS "Region",
                        failover       AS "Failover",
                        cached_at      AS "CachedAt"
                    FROM route53_record_cache
                    WHERE zone_id = %s
                    ORDER BY record_name, record_type
                """, (zone_id,))
            else:
                cur.execute("""
                    SELECT
                        zone_id        AS "ZoneId",
                        record_name    AS "RecordName",
                        record_type    AS "RecordType",
                        profile_name   AS "Profile",
                        profile_color  AS "ProfileColor",
                        profile_env    AS "ProfileEnvTag",
                        ttl            AS "TTL",
                        values         AS "Values",
                        alias_target   AS "AliasTarget",
                        set_identifier AS "SetIdentifier",
                        weight         AS "Weight",
                        region         AS "Region",
                        failover       AS "Failover",
                        cached_at      AS "CachedAt"
                    FROM route53_record_cache
                    ORDER BY profile_name, record_name, record_type
                """)
            return cur.fetchall()


# ── SSL Certificate Monitoring ────────────────────────────────────────────────

SSL_ENVIRONMENTS = {"production", "uat", "development"}


class SSLDomainCreate(BaseModel):
    domain_name: str
    port: int = 443
    environment: str = "production"
    owner: str = ""
    notes: str = ""

    @field_validator("domain_name")
    @classmethod
    def valid_domain(cls, v: str) -> str:
        v = v.strip().lower()
        # Strip leading protocol if user pastes a URL
        for prefix in ("https://", "http://"):
            if v.startswith(prefix):
                v = v[len(prefix):]
        # Strip trailing slash / path
        v = v.split("/")[0]
        if not v:
            raise ValueError("domain_name must not be empty")
        return v

    @field_validator("port")
    @classmethod
    def valid_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError("port must be between 1 and 65535")
        return v

    @field_validator("environment")
    @classmethod
    def valid_environment(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in SSL_ENVIRONMENTS:
            raise ValueError(f"environment must be one of: {', '.join(sorted(SSL_ENVIRONMENTS))}")
        return v


class SSLDomainUpdate(BaseModel):
    domain_name: Optional[str] = None
    port: Optional[int] = None
    environment: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("domain_name", mode="before")
    @classmethod
    def valid_domain(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        for prefix in ("https://", "http://"):
            if v.startswith(prefix):
                v = v[len(prefix):]
        v = v.split("/")[0]
        if not v:
            raise ValueError("domain_name must not be empty")
        return v

    @field_validator("port", mode="before")
    @classmethod
    def valid_port(cls, v):
        if v is None:
            return v
        if not (1 <= int(v) <= 65535):
            raise ValueError("port must be between 1 and 65535")
        return int(v)

    @field_validator("environment", mode="before")
    @classmethod
    def valid_environment(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in SSL_ENVIRONMENTS:
            raise ValueError(f"environment must be one of: {', '.join(sorted(SSL_ENVIRONMENTS))}")
        return v


def _row_to_ssl_dict(row: dict) -> dict:
    """Serialize a psycopg2 RealDictRow for the SSL endpoint response."""
    r = dict(row)
    # Convert datetimes → ISO strings
    for key in ("valid_from", "expiry_date", "last_checked", "created_at", "updated_at"):
        if r.get(key) and hasattr(r[key], "isoformat"):
            r[key] = r[key].isoformat()
    return r


@app.get("/api/ssl-certificates")
def list_ssl_certificates():
    """Return all tracked SSL domains with their latest certificate status."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, domain_name, port, environment, owner, notes,
                    issuer, valid_from, expiry_date,
                    days_remaining, status, san_list, key_algorithm,
                    last_checked, created_at, updated_at
                FROM ssl_certificates
                ORDER BY domain_name
            """)
            rows = cur.fetchall()
    return [_row_to_ssl_dict(r) for r in rows]


@app.post("/api/ssl-certificates", status_code=201)
def create_ssl_certificate(payload: SSLDomainCreate, background_tasks: BackgroundTasks):
    """
    Add a new domain to track. Immediately triggers an async SSL certificate
    fetch so the dashboard shows data without waiting for the next scheduler run.
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ssl_certificates
                        (domain_name, port, environment, owner, notes)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING
                        id, domain_name, port, environment, owner, notes,
                        issuer, valid_from, expiry_date,
                        days_remaining, status, san_list, key_algorithm,
                        last_checked, created_at, updated_at
                    """,
                    (
                        payload.domain_name,
                        payload.port,
                        payload.environment,
                        payload.owner,
                        payload.notes,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail=f"Domain '{payload.domain_name}' is already being tracked",
        )

    domain_id = row["id"]

    # Kick off SSL check in the background so the response is instant
    from ssl_checker import refresh_domain
    background_tasks.add_task(refresh_domain, domain_id)

    return _row_to_ssl_dict(row)


@app.patch("/api/ssl-certificates/{domain_id}")
def update_ssl_certificate(domain_id: int, payload: SSLDomainUpdate):
    """Partial update of domain metadata."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    set_clause = ", ".join(f"{col} = %s" for col in updates)
    set_clause += ", updated_at = NOW()"
    values = list(updates.values()) + [domain_id]

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE ssl_certificates
                    SET {set_clause}
                    WHERE id = %s
                    RETURNING
                        id, domain_name, port, environment, owner, notes,
                        issuer, valid_from, expiry_date,
                        days_remaining, status, san_list, key_algorithm,
                        last_checked, created_at, updated_at
                    """,
                    values,
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Domain name already exists")

    if not row:
        raise HTTPException(status_code=404, detail="Domain not found")

    return _row_to_ssl_dict(row)


@app.delete("/api/ssl-certificates/{domain_id}", status_code=204)
def delete_ssl_certificate(domain_id: int):
    """Remove a domain from SSL monitoring."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ssl_certificates WHERE id = %s RETURNING id",
                (domain_id,),
            )
            deleted = cur.fetchone()
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Domain not found")


@app.post("/api/ssl-certificates/{domain_id}/refresh", status_code=202)
def refresh_ssl_certificate(domain_id: int, background_tasks: BackgroundTasks):
    """
    Trigger an immediate SSL check for a single domain.
    Runs asynchronously — returns immediately.
    """
    # Verify domain exists first
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM ssl_certificates WHERE id = %s", (domain_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Domain not found")

    from ssl_checker import refresh_domain
    background_tasks.add_task(refresh_domain, domain_id)

    return {"triggered": True, "message": "SSL certificate refresh started in background"}
