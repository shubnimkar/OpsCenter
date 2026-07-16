"""
scheduler.py
------------
Background scheduler that polls EC2 state across all AWS profiles and
writes results to the instance_cache table in Postgres.

The dashboard reads from that cache, so every GET /api/instances is
instant and never blocked by AWS API latency or rate limits.

Configuration (via environment variables):
  POLL_INTERVAL_SECONDS   How often to poll AWS. Default: 300 (5 minutes).
  The interval can also be changed at runtime via PATCH /api/scheduler/config
  without restarting the server; the new value is persisted in scheduler_meta.
"""

import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from database import get_connection, DATABASE_URL
from crypto import decrypt

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

# Minimum/maximum bounds for safety
MIN_INTERVAL_SECONDS = 60       # 1 minute
MAX_INTERVAL_SECONDS = 86_400   # 24 hours

DEFAULT_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))
JOB_ID = "ec2_poll"

# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_name(tags) -> str:
    if not tags:
        return "-"
    for tag in tags:
        if tag["Key"] == "Name":
            return tag["Value"] or "-"
    return "-"


def _fetch_instances_for_profile(profile: dict) -> list[dict]:
    """Call AWS EC2 describe_instances for one profile. Returns a list of row dicts."""
    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=profile["region"],
    )
    ec2 = session.client("ec2")
    paginator = ec2.get_paginator("describe_instances")

    rows = []
    for page in paginator.paginate():
        for reservation in page["Reservations"]:
            for instance in reservation["Instances"]:
                rows.append({
                    "instance_id":   instance["InstanceId"],
                    "profile_name":  profile["name"],
                    "profile_color": profile["color"],
                    "profile_env":   profile.get("env_tag", "other"),
                    "name":          _get_name(instance.get("Tags")),
                    "state":         instance["State"]["Name"],
                    "instance_type": instance["InstanceType"],
                    "public_ip":     instance.get("PublicIpAddress") or "-",
                    "private_ip":    instance.get("PrivateIpAddress") or "-",
                    "public_dns":    instance.get("PublicDnsName") or "-",
                    "az":            instance["Placement"]["AvailabilityZone"],
                })
    return rows


def _upsert_rows(conn, rows: list[dict]) -> None:
    """Bulk-upsert instance rows into instance_cache."""
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO instance_cache
                    (instance_id, profile_name, profile_color, profile_env,
                     name, state, instance_type,
                     public_ip, private_ip, public_dns, az, cached_at)
                VALUES
                    (%(instance_id)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(name)s, %(state)s, %(instance_type)s,
                     %(public_ip)s, %(private_ip)s, %(public_dns)s, %(az)s, NOW())
                ON CONFLICT (instance_id, profile_name)
                DO UPDATE SET
                    profile_color = EXCLUDED.profile_color,
                    profile_env   = EXCLUDED.profile_env,
                    name          = EXCLUDED.name,
                    state         = EXCLUDED.state,
                    instance_type = EXCLUDED.instance_type,
                    public_ip     = EXCLUDED.public_ip,
                    private_ip    = EXCLUDED.private_ip,
                    public_dns    = EXCLUDED.public_dns,
                    az            = EXCLUDED.az,
                    cached_at     = NOW()
                """,
                row,
            )


def _set_meta(conn, *, status: str, error: str | None = None, next_run_at=None) -> None:
    """Update the single scheduler_meta row."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE scheduler_meta
            SET last_run_at  = NOW(),
                last_status  = %s,
                last_error   = %s,
                next_run_at  = %s
            WHERE id = 1
            """,
            (status, error, next_run_at),
        )


def _load_persisted_interval() -> int | None:
    """
    Read the poll interval previously saved to scheduler_meta.
    Returns None if the column doesn't exist yet or no value is stored.
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT poll_interval_seconds FROM scheduler_meta WHERE id = 1"
                )
                row = cur.fetchone()
                if row and row["poll_interval_seconds"]:
                    return int(row["poll_interval_seconds"])
    except Exception:
        pass
    return None


def _persist_interval(seconds: int) -> None:
    """Save the current poll interval to scheduler_meta so it survives restarts."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE scheduler_meta SET poll_interval_seconds = %s WHERE id = 1",
                    (seconds,),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("Could not persist interval to DB: %s", exc)


# ── Core poll job ─────────────────────────────────────────────────────────────


def poll_ec2() -> None:
    """
    Fetch EC2 instance data for every profile and refresh the cache.
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    logger.info("EC2 poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll")
        _write_meta_success([])
        return

    all_rows: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            rows = _fetch_instances_for_profile(profile)
            all_rows.extend(rows)
            logger.debug("Profile %s → %d instance(s)", profile["name"], len(rows))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

    # Write results + meta in one transaction
    try:
        with get_connection() as conn:
            _upsert_rows(conn, all_rows)
            status = "ok" if not profile_errors else "partial"
            error_text = "\n".join(profile_errors) if profile_errors else None
            _set_meta(conn, status=status, error=error_text)
            conn.commit()
        logger.info(
            "EC2 poll complete: %d instance(s) cached, %d profile error(s)",
            len(all_rows),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write cache to DB: %s", exc)


def _write_meta_success(rows: list) -> None:
    """Helper to record a clean run when there are no profiles."""
    try:
        with get_connection() as conn:
            _set_meta(conn, status="ok")
            conn.commit()
    except Exception as exc:
        logger.warning("Could not update scheduler_meta: %s", exc)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

# Use a Postgres-backed jobstore so duplicate runs are avoided when
# multiple uvicorn workers start (e.g. --workers 2).
# Falls back gracefully to in-memory if the DB URL isn't set.
def _build_jobstore():
    try:
        # APScheduler expects a SQLAlchemy URL (postgresql://, not postgres://)
        sa_url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return SQLAlchemyJobStore(url=sa_url)
    except Exception as exc:
        logger.warning("Could not create SQLAlchemy jobstore (%s) — using in-memory", exc)
        return None


_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """Start the background scheduler. Called once from FastAPI startup."""
    global _scheduler

    # Use the persisted interval if it exists, else fall back to env var / default
    interval = _load_persisted_interval() or DEFAULT_INTERVAL_SECONDS

    jobstore = _build_jobstore()
    jobstores = {"default": jobstore} if jobstore else {}

    _scheduler = BackgroundScheduler(
        jobstores=jobstores,
        executors={"default": ThreadPoolExecutor(1)},
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 60},
    )

    _scheduler.add_job(
        poll_ec2,
        trigger="interval",
        seconds=interval,
        id=JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),  # run immediately on startup
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — polling every %d seconds (%d minutes)",
        interval,
        interval // 60,
    )


def stop_scheduler() -> None:
    """Graceful shutdown. Called from FastAPI shutdown."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def reschedule_job(new_interval_seconds: int) -> dict:
    """
    Change the poll interval at runtime without restarting.
    The new value is persisted to scheduler_meta so it survives restarts.
    Returns the updated status dict.
    """
    if not (MIN_INTERVAL_SECONDS <= new_interval_seconds <= MAX_INTERVAL_SECONDS):
        raise ValueError(
            f"Interval must be between {MIN_INTERVAL_SECONDS} and {MAX_INTERVAL_SECONDS} seconds"
        )

    if not _scheduler or not _scheduler.running:
        raise RuntimeError("Scheduler is not running")

    _scheduler.reschedule_job(
        JOB_ID,
        trigger="interval",
        seconds=new_interval_seconds,
    )

    _persist_interval(new_interval_seconds)

    logger.info(
        "Scheduler interval updated to %d seconds (%d minutes)",
        new_interval_seconds,
        new_interval_seconds // 60,
    )
    return get_scheduler_status()


def get_scheduler_status() -> dict:
    """Return metadata for the GET /api/scheduler/status endpoint."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT last_run_at, next_run_at, last_status, last_error, poll_interval_seconds FROM scheduler_meta WHERE id = 1"
                )
                meta = cur.fetchone()
    except Exception as exc:
        meta = None
        logger.warning("Could not read scheduler_meta: %s", exc)

    # Get live values from APScheduler (more accurate than DB)
    next_run = None
    live_interval = None
    if _scheduler and _scheduler.running:
        job = _scheduler.get_job(JOB_ID)
        if job:
            if job.next_run_time:
                next_run = job.next_run_time.isoformat()
            # Extract interval from the trigger
            if hasattr(job.trigger, "interval"):
                live_interval = int(job.trigger.interval.total_seconds())

    poll_interval = live_interval or (meta["poll_interval_seconds"] if meta and meta.get("poll_interval_seconds") else DEFAULT_INTERVAL_SECONDS)

    return {
        "running": bool(_scheduler and _scheduler.running),
        "poll_interval_seconds": poll_interval,
        "min_interval_seconds": MIN_INTERVAL_SECONDS,
        "max_interval_seconds": MAX_INTERVAL_SECONDS,
        "last_run_at": meta["last_run_at"].isoformat() if meta and meta["last_run_at"] else None,
        "next_run_at": next_run,
        "last_status": meta["last_status"] if meta else "unknown",
        "last_error": meta["last_error"] if meta else None,
    }


def trigger_poll() -> dict:
    """
    Immediately run the poll job outside the scheduler interval.
    Used by POST /api/scheduler/trigger (the dashboard Refresh button).
    """
    import threading
    thread = threading.Thread(target=poll_ec2, daemon=True, name="ec2-manual-poll")
    thread.start()
    return {"triggered": True, "message": "Poll started in background"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_name(tags) -> str:
    if not tags:
        return "-"
    for tag in tags:
        if tag["Key"] == "Name":
            return tag["Value"] or "-"
    return "-"


def _fetch_instances_for_profile(profile: dict) -> list[dict]:
    """Call AWS EC2 describe_instances for one profile. Returns a list of row dicts."""
    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=profile["region"],
    )
    ec2 = session.client("ec2")
    paginator = ec2.get_paginator("describe_instances")

    rows = []
    for page in paginator.paginate():
        for reservation in page["Reservations"]:
            for instance in reservation["Instances"]:
                rows.append({
                    "instance_id":   instance["InstanceId"],
                    "profile_name":  profile["name"],
                    "profile_color": profile["color"],
                    "profile_env":   profile.get("env_tag", "other"),
                    "name":          _get_name(instance.get("Tags")),
                    "state":         instance["State"]["Name"],
                    "instance_type": instance["InstanceType"],
                    "public_ip":     instance.get("PublicIpAddress") or "-",
                    "private_ip":    instance.get("PrivateIpAddress") or "-",
                    "public_dns":    instance.get("PublicDnsName") or "-",
                    "az":            instance["Placement"]["AvailabilityZone"],
                })
    return rows


def _upsert_rows(conn, rows: list[dict]) -> None:
    """Bulk-upsert instance rows into instance_cache."""
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO instance_cache
                    (instance_id, profile_name, profile_color, profile_env,
                     name, state, instance_type,
                     public_ip, private_ip, public_dns, az, cached_at)
                VALUES
                    (%(instance_id)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(name)s, %(state)s, %(instance_type)s,
                     %(public_ip)s, %(private_ip)s, %(public_dns)s, %(az)s, NOW())
                ON CONFLICT (instance_id, profile_name)
                DO UPDATE SET
                    profile_color = EXCLUDED.profile_color,
                    profile_env   = EXCLUDED.profile_env,
                    name          = EXCLUDED.name,
                    state         = EXCLUDED.state,
                    instance_type = EXCLUDED.instance_type,
                    public_ip     = EXCLUDED.public_ip,
                    private_ip    = EXCLUDED.private_ip,
                    public_dns    = EXCLUDED.public_dns,
                    az            = EXCLUDED.az,
                    cached_at     = NOW()
                """,
                row,
            )


def _set_meta(conn, *, status: str, error: str | None = None, next_run_at=None) -> None:
    """Update the single scheduler_meta row."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE scheduler_meta
            SET last_run_at  = NOW(),
                last_status  = %s,
                last_error   = %s,
                next_run_at  = %s
            WHERE id = 1
            """,
            (status, error, next_run_at),
        )


# ── Core poll job ─────────────────────────────────────────────────────────────


def poll_ec2() -> None:
    """
    Fetch EC2 instance data for every profile and refresh the cache.
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    logger.info("EC2 poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll")
        _write_meta_success([])
        return

    all_rows: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            rows = _fetch_instances_for_profile(profile)
            all_rows.extend(rows)
            logger.debug("Profile %s → %d instance(s)", profile["name"], len(rows))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

    # Write results + meta in one transaction
    try:
        with get_connection() as conn:
            _upsert_rows(conn, all_rows)
            status = "ok" if not profile_errors else "partial"
            error_text = "\n".join(profile_errors) if profile_errors else None
            _set_meta(conn, status=status, error=error_text)
            conn.commit()
        logger.info(
            "EC2 poll complete: %d instance(s) cached, %d profile error(s)",
            len(all_rows),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write cache to DB: %s", exc)


def _write_meta_success(rows: list) -> None:
    """Helper to record a clean run when there are no profiles."""
    try:
        with get_connection() as conn:
            _set_meta(conn, status="ok")
            conn.commit()
    except Exception as exc:
        logger.warning("Could not update scheduler_meta: %s", exc)
