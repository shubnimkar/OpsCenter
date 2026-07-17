from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional, List
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
    Decrypts keys from the DB and calls STS GetCallerIdentity.
    Uses the first region in the profile's regions list.
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

    try:
        session = boto3.Session(
            aws_access_key_id=decrypt(row["access_key"]),
            aws_secret_access_key=decrypt(row["secret_key"]),
            region_name=region,
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


# ── Profiles ──────────────────────────────────────────────────────────────────

@app.get("/api/profiles", response_model=list[ProfileResponse])
def list_profiles():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, regions, color, env_tag FROM profiles ORDER BY name")
            return cur.fetchall()


@app.post("/api/profiles", response_model=ProfileResponse, status_code=201)
def create_profile(payload: ProfileCreate):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO profiles (name, access_key, secret_key, regions, color, env_tag)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, name, regions, color, env_tag
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
                    f"UPDATE profiles SET {set_clause} WHERE id = %s RETURNING id, name, regions, color, env_tag",
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
