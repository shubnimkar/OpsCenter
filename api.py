from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional
import psycopg2
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from aws_data import get_instances
from database import get_connection, init_db
from crypto import encrypt, decrypt

app = FastAPI(title="AWS EC2 Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ── Schemas ──────────────────────────────────────────────────────────────────

ENV_TAGS = {"prod", "staging", "dev", "sandbox", "other"}


class ProfileCreate(BaseModel):
    name: str
    access_key: str
    secret_key: str
    region: str = "us-east-1"
    color: str = "#6366f1"
    env_tag: str = "other"

    @field_validator("name", "access_key", "secret_key", "region")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()

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
    region: Optional[str] = None
    color: Optional[str] = None
    env_tag: Optional[str] = None

    @field_validator("name", "access_key", "secret_key", "region", mode="before")
    @classmethod
    def not_empty(cls, v):
        if v is not None and (not isinstance(v, str) or not v.strip()):
            raise ValueError("Field must not be empty")
        return v.strip() if isinstance(v, str) else v

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
    region: str
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
    return get_instances()


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
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT access_key, secret_key, region FROM profiles WHERE id = %s",
                (profile_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        session = boto3.Session(
            aws_access_key_id=decrypt(row["access_key"]),
            aws_secret_access_key=decrypt(row["secret_key"]),
            region_name=row["region"],
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
            cur.execute("SELECT id, name, region, color, env_tag FROM profiles ORDER BY name")
            return cur.fetchall()


@app.post("/api/profiles", response_model=ProfileResponse, status_code=201)
def create_profile(payload: ProfileCreate):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO profiles (name, access_key, secret_key, region, color, env_tag)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, name, region, color, env_tag
                    """,
                    (payload.name, encrypt(payload.access_key), encrypt(payload.secret_key), payload.region, payload.color, payload.env_tag),
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

    # Build SET clause dynamically from provided fields only
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
                    f"UPDATE profiles SET {set_clause} WHERE id = %s RETURNING id, name, region, color, env_tag",
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
