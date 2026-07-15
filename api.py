from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional
import psycopg2

from aws_data import get_instances
from database import get_connection, init_db
from crypto import encrypt

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

class ProfileCreate(BaseModel):
    name: str
    access_key: str
    secret_key: str
    region: str = "us-east-1"

    @field_validator("name", "access_key", "secret_key", "region")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()


class ProfileUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""
    name: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    region: Optional[str] = None

    @field_validator("name", "access_key", "secret_key", "region", mode="before")
    @classmethod
    def not_empty(cls, v):
        if v is not None and (not isinstance(v, str) or not v.strip()):
            raise ValueError("Field must not be empty")
        return v.strip() if isinstance(v, str) else v


class ProfileResponse(BaseModel):
    id: int
    name: str
    region: str


# ── Instances ─────────────────────────────────────────────────────────────────

@app.get("/api/instances")
def instances():
    return get_instances()


# ── Profiles ──────────────────────────────────────────────────────────────────

@app.get("/api/profiles", response_model=list[ProfileResponse])
def list_profiles():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, region FROM profiles ORDER BY name")
            return cur.fetchall()


@app.post("/api/profiles", response_model=ProfileResponse, status_code=201)
def create_profile(payload: ProfileCreate):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO profiles (name, access_key, secret_key, region)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, name, region
                    """,
                    (payload.name, encrypt(payload.access_key), encrypt(payload.secret_key), payload.region),
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
                    f"UPDATE profiles SET {set_clause} WHERE id = %s RETURNING id, name, region",
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
