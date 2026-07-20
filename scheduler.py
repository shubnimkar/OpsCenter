"""
scheduler.py
------------
Background scheduler that polls EC2 and S3 state across all AWS profiles
and writes results to the cache tables in Postgres.

The dashboard reads from those caches, so every GET request is instant
and never blocked by AWS API latency or rate limits.

Configuration (via environment variables):
  POLL_INTERVAL_SECONDS   How often to poll AWS. Default: 300 (5 minutes).
  The interval can also be changed at runtime via PATCH /api/scheduler/config
  without restarting the server; the new value is persisted in scheduler_meta.
"""

import logging
import os
import threading
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

MIN_INTERVAL_SECONDS = 60       # 1 minute
MAX_INTERVAL_SECONDS = 86_400   # 24 hours

DEFAULT_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))
JOB_ID = "ec2_poll"
S3_JOB_ID = "s3_poll"
LAMBDA_JOB_ID = "lambda_poll"
IAM_JOB_ID = "iam_poll"
SES_JOB_ID = "ses_poll"
ROUTE53_JOB_ID = "route53_poll"
SSL_JOB_ID = "ssl_poll"

# ── Shared helpers ────────────────────────────────────────────────────────────


def _get_name(tags) -> str:
    if not tags:
        return "-"
    for tag in tags:
        if tag["Key"] == "Name":
            return tag["Value"] or "-"
    return "-"


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


def _write_meta_success() -> None:
    """Record a clean run when there are no profiles."""
    try:
        with get_connection() as conn:
            _set_meta(conn, status="ok")
            conn.commit()
    except Exception as exc:
        logger.warning("Could not update scheduler_meta: %s", exc)


def _load_persisted_interval() -> int | None:
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


# ── EC2 poll ──────────────────────────────────────────────────────────────────


def _fetch_instances_for_profile(profile: dict) -> list[dict]:
    """Call AWS EC2 describe_instances for one profile."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]

    rows = []
    for region in regions:
        session = boto3.Session(
            aws_access_key_id=decrypt(profile["access_key"]),
            aws_secret_access_key=decrypt(profile["secret_key"]),
            region_name=region,
        )
        ec2 = session.client("ec2")
        paginator = ec2.get_paginator("describe_instances")

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


def _upsert_instances(conn, rows: list[dict]) -> None:
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
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll")
        _write_meta_success()
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

    try:
        with get_connection() as conn:
            _upsert_instances(conn, all_rows)
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
        logger.error("Failed to write EC2 cache to DB: %s", exc)


# ── S3 poll ───────────────────────────────────────────────────────────────────


def _fetch_buckets_for_profile(profile: dict) -> list[dict]:
    """Call AWS S3 list_buckets for one profile. Returns a list of row dicts."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]
    region = regions[0] if isinstance(regions, list) else regions

    session = boto3.Session(
        aws_access_key_id=decrypt(profile["access_key"]),
        aws_secret_access_key=decrypt(profile["secret_key"]),
        region_name=region,
    )
    s3 = session.client("s3")
    response = s3.list_buckets()

    rows = []
    for bucket in response.get("Buckets", []):
        bucket_name = bucket["Name"]
        try:
            loc = s3.get_bucket_location(Bucket=bucket_name)
            bucket_region = loc.get("LocationConstraint") or "us-east-1"
        except Exception:
            bucket_region = "-"

        rows.append({
            "bucket_name":   bucket_name,
            "profile_name":  profile["name"],
            "profile_color": profile["color"],
            "profile_env":   profile.get("env_tag", "other"),
            "region":        bucket_region,
            "creation_date": bucket.get("CreationDate"),
        })
    return rows


def _upsert_s3_buckets(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO s3_bucket_cache
                    (bucket_name, profile_name, profile_color, profile_env,
                     region, creation_date, cached_at)
                VALUES
                    (%(bucket_name)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(region)s, %(creation_date)s, NOW())
                ON CONFLICT (bucket_name, profile_name)
                DO UPDATE SET
                    profile_color = EXCLUDED.profile_color,
                    profile_env   = EXCLUDED.profile_env,
                    region        = EXCLUDED.region,
                    creation_date = EXCLUDED.creation_date,
                    cached_at     = NOW()
                """,
                row,
            )


def poll_s3() -> None:
    """
    Fetch S3 bucket data for every profile and refresh the cache.
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    logger.info("S3 poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB for S3 poll: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll for S3")
        return

    all_rows: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            rows = _fetch_buckets_for_profile(profile)
            all_rows.extend(rows)
            logger.debug("S3 profile %s → %d bucket(s)", profile["name"], len(rows))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS S3 error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected S3 error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

    try:
        with get_connection() as conn:
            _upsert_s3_buckets(conn, all_rows)
            conn.commit()
        logger.info(
            "S3 poll complete: %d bucket(s) cached, %d profile error(s)",
            len(all_rows),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write S3 cache to DB: %s", exc)


# ── Lambda poll ───────────────────────────────────────────────────────────────


def _fetch_lambdas_for_profile(profile: dict) -> list[dict]:
    """Call AWS Lambda list_functions for one profile across all its regions."""
    regions = profile.get("regions") or [profile.get("region", "us-east-1")]

    rows = []
    for region in regions:
        try:
            session = boto3.Session(
                aws_access_key_id=decrypt(profile["access_key"]),
                aws_secret_access_key=decrypt(profile["secret_key"]),
                region_name=region,
            )
            lam = session.client("lambda")
            paginator = lam.get_paginator("list_functions")

            for page in paginator.paginate():
                for fn in page.get("Functions", []):
                    # Parse LastModified (ISO 8601 string from AWS)
                    last_modified = None
                    if fn.get("LastModified"):
                        try:
                            from datetime import datetime as dt
                            last_modified = dt.fromisoformat(
                                fn["LastModified"].replace("Z", "+00:00")
                            )
                        except Exception:
                            last_modified = None

                    rows.append({
                        "function_name": fn["FunctionName"],
                        "profile_name":  profile["name"],
                        "profile_color": profile["color"],
                        "profile_env":   profile.get("env_tag", "other"),
                        "region":        region,
                        "runtime":       fn.get("Runtime", "-"),
                        "handler":       fn.get("Handler", "-"),
                        "state":         fn.get("State", "-"),
                        "last_modified": last_modified,
                        "code_size":     fn.get("CodeSize", 0),
                        "memory_size":   fn.get("MemorySize", 0),
                        "timeout":       fn.get("Timeout", 0),
                        "description":   fn.get("Description", ""),
                    })
        except (ClientError, NoCredentialsError) as exc:
            logger.warning(
                "AWS Lambda error for profile %s region %s: %s",
                profile["name"], region, exc,
            )
        except Exception as exc:
            logger.warning(
                "Unexpected Lambda error for profile %s region %s: %s",
                profile["name"], region, exc,
            )
    return rows


def _upsert_lambdas(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO lambda_cache
                    (function_name, profile_name, profile_color, profile_env,
                     region, runtime, handler, state,
                     last_modified, code_size, memory_size, timeout, description, cached_at)
                VALUES
                    (%(function_name)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(region)s, %(runtime)s, %(handler)s, %(state)s,
                     %(last_modified)s, %(code_size)s, %(memory_size)s, %(timeout)s,
                     %(description)s, NOW())
                ON CONFLICT (function_name, profile_name, region)
                DO UPDATE SET
                    profile_color = EXCLUDED.profile_color,
                    profile_env   = EXCLUDED.profile_env,
                    runtime       = EXCLUDED.runtime,
                    handler       = EXCLUDED.handler,
                    state         = EXCLUDED.state,
                    last_modified = EXCLUDED.last_modified,
                    code_size     = EXCLUDED.code_size,
                    memory_size   = EXCLUDED.memory_size,
                    timeout       = EXCLUDED.timeout,
                    description   = EXCLUDED.description,
                    cached_at     = NOW()
                """,
                row,
            )


def poll_lambda() -> None:
    """
    Fetch Lambda function data for every profile and refresh the cache.
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    logger.info("Lambda poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB for Lambda poll: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll for Lambda")
        return

    all_rows: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            rows = _fetch_lambdas_for_profile(profile)
            all_rows.extend(rows)
            logger.debug("Lambda profile %s → %d function(s)", profile["name"], len(rows))
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected Lambda error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

    try:
        with get_connection() as conn:
            _upsert_lambdas(conn, all_rows)
            conn.commit()
        logger.info(
            "Lambda poll complete: %d function(s) cached, %d profile error(s)",
            len(all_rows),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write Lambda cache to DB: %s", exc)


# ── IAM poll ─────────────────────────────────────────────────────────────────


def _upsert_iam_users(conn, rows: list[dict]) -> None:
    if not rows:
        return
    import json as _json
    with conn.cursor() as cur:
        for row in rows:
            # Serialize JSONB fields
            row_copy = {
                **row,
                "inline_policies":    _json.dumps(row.get("inline_policies", [])),
                "access_keys_detail": _json.dumps(
                    [
                        {
                            k: (v.isoformat() if hasattr(v, "isoformat") else v)
                            for k, v in item.items()
                        }
                        for item in row.get("access_keys_detail", [])
                    ]
                ),
            }
            cur.execute(
                """
                INSERT INTO iam_user_cache
                    (username, profile_name, profile_color, profile_env,
                     user_id, arn, path, created_at, password_last_used,
                     password_created_at, last_activity,
                     mfa_enabled, console_access, access_key_count, active_key_count,
                     access_keys_detail, groups, attached_policies, inline_policies, cached_at)
                VALUES
                    (%(username)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(user_id)s, %(arn)s, %(path)s, %(created_at)s, %(password_last_used)s,
                     %(password_created_at)s, %(last_activity)s,
                     %(mfa_enabled)s, %(console_access)s, %(access_key_count)s, %(active_key_count)s,
                     %(access_keys_detail)s, %(groups)s, %(attached_policies)s, %(inline_policies)s, NOW())
                ON CONFLICT (username, profile_name)
                DO UPDATE SET
                    profile_color        = EXCLUDED.profile_color,
                    profile_env          = EXCLUDED.profile_env,
                    user_id              = EXCLUDED.user_id,
                    arn                  = EXCLUDED.arn,
                    path                 = EXCLUDED.path,
                    created_at           = EXCLUDED.created_at,
                    password_last_used   = EXCLUDED.password_last_used,
                    password_created_at  = EXCLUDED.password_created_at,
                    last_activity        = EXCLUDED.last_activity,
                    mfa_enabled          = EXCLUDED.mfa_enabled,
                    console_access       = EXCLUDED.console_access,
                    access_key_count     = EXCLUDED.access_key_count,
                    active_key_count     = EXCLUDED.active_key_count,
                    access_keys_detail   = EXCLUDED.access_keys_detail,
                    groups               = EXCLUDED.groups,
                    attached_policies    = EXCLUDED.attached_policies,
                    inline_policies      = EXCLUDED.inline_policies,
                    cached_at            = NOW()
                """,
                row_copy,
            )


def _upsert_iam_roles(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO iam_role_cache
                    (role_name, profile_name, profile_color, profile_env,
                     role_id, arn, path, created_at, description,
                     max_session_duration, attached_policies, trusted_services, cached_at)
                VALUES
                    (%(role_name)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(role_id)s, %(arn)s, %(path)s, %(created_at)s, %(description)s,
                     %(max_session_duration)s, %(attached_policies)s, %(trusted_services)s, NOW())
                ON CONFLICT (role_name, profile_name)
                DO UPDATE SET
                    profile_color        = EXCLUDED.profile_color,
                    profile_env          = EXCLUDED.profile_env,
                    role_id              = EXCLUDED.role_id,
                    arn                  = EXCLUDED.arn,
                    path                 = EXCLUDED.path,
                    created_at           = EXCLUDED.created_at,
                    description          = EXCLUDED.description,
                    max_session_duration = EXCLUDED.max_session_duration,
                    attached_policies    = EXCLUDED.attached_policies,
                    trusted_services     = EXCLUDED.trusted_services,
                    cached_at            = NOW()
                """,
                row,
            )


def _upsert_iam_groups(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO iam_group_cache
                    (group_name, profile_name, profile_color, profile_env,
                     group_id, arn, path, created_at,
                     member_count, attached_policies, cached_at)
                VALUES
                    (%(group_name)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(group_id)s, %(arn)s, %(path)s, %(created_at)s,
                     %(member_count)s, %(attached_policies)s, NOW())
                ON CONFLICT (group_name, profile_name)
                DO UPDATE SET
                    profile_color     = EXCLUDED.profile_color,
                    profile_env       = EXCLUDED.profile_env,
                    group_id          = EXCLUDED.group_id,
                    arn               = EXCLUDED.arn,
                    path              = EXCLUDED.path,
                    created_at        = EXCLUDED.created_at,
                    member_count      = EXCLUDED.member_count,
                    attached_policies = EXCLUDED.attached_policies,
                    cached_at         = NOW()
                """,
                row,
            )


def poll_iam() -> None:
    """
    Fetch IAM users, roles, and groups for every profile and refresh the cache.
    IAM is a global service — one request per profile (no region loop).
    Called by APScheduler and by the manual trigger endpoint.
    """
    from aws_data import get_iam_users, get_iam_roles, get_iam_groups
    from botocore.exceptions import ClientError, NoCredentialsError

    logger.info("IAM poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB for IAM poll: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll for IAM")
        return

    all_users: list[dict] = []
    all_roles: list[dict] = []
    all_groups: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            users = get_iam_users(profile)
            all_users.extend(users)
            logger.debug("IAM profile %s → %d user(s)", profile["name"], len(users))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS IAM users error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (users): {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected IAM users error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (users): {msg}")

        try:
            roles = get_iam_roles(profile)
            all_roles.extend(roles)
            logger.debug("IAM profile %s → %d role(s)", profile["name"], len(roles))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS IAM roles error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (roles): {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected IAM roles error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (roles): {msg}")

        try:
            groups = get_iam_groups(profile)
            all_groups.extend(groups)
            logger.debug("IAM profile %s → %d group(s)", profile["name"], len(groups))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS IAM groups error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (groups): {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected IAM groups error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']} (groups): {msg}")

    try:
        with get_connection() as conn:
            _upsert_iam_users(conn, all_users)
            _upsert_iam_roles(conn, all_roles)
            _upsert_iam_groups(conn, all_groups)
            conn.commit()
        logger.info(
            "IAM poll complete: %d user(s), %d role(s), %d group(s) cached, %d error(s)",
            len(all_users), len(all_roles), len(all_groups), len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write IAM cache to DB: %s", exc)


# ── SES poll ─────────────────────────────────────────────────────────────────


def _upsert_ses_account_stats(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO ses_account_stats_cache
                    (profile_name, profile_color, profile_env, region,
                     sending_enabled, in_sandbox, max_24_hour_send,
                     total_delivery_attempts, total_bounces,
                     total_complaints, total_rejects, cached_at)
                VALUES
                    (%(profile_name)s, %(profile_color)s, %(profile_env)s, %(region)s,
                     %(sending_enabled)s, %(in_sandbox)s, %(max_24_hour_send)s,
                     %(total_delivery_attempts)s, %(total_bounces)s,
                     %(total_complaints)s, %(total_rejects)s, NOW())
                ON CONFLICT (profile_name, region)
                DO UPDATE SET
                    profile_color            = EXCLUDED.profile_color,
                    profile_env              = EXCLUDED.profile_env,
                    sending_enabled          = EXCLUDED.sending_enabled,
                    in_sandbox               = EXCLUDED.in_sandbox,
                    max_24_hour_send         = EXCLUDED.max_24_hour_send,
                    total_delivery_attempts  = EXCLUDED.total_delivery_attempts,
                    total_bounces            = EXCLUDED.total_bounces,
                    total_complaints         = EXCLUDED.total_complaints,
                    total_rejects            = EXCLUDED.total_rejects,
                    cached_at                = NOW()
                """,
                row,
            )


def _upsert_ses_sending_quotas(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO ses_sending_quota_cache
                    (profile_name, profile_color, profile_env, region,
                     max_24_hour_send, max_send_rate, sent_last_24_hours, cached_at)
                VALUES
                    (%(profile_name)s, %(profile_color)s, %(profile_env)s, %(region)s,
                     %(max_24_hour_send)s, %(max_send_rate)s, %(sent_last_24_hours)s, NOW())
                ON CONFLICT (profile_name, region)
                DO UPDATE SET
                    profile_color      = EXCLUDED.profile_color,
                    profile_env        = EXCLUDED.profile_env,
                    max_24_hour_send   = EXCLUDED.max_24_hour_send,
                    max_send_rate      = EXCLUDED.max_send_rate,
                    sent_last_24_hours = EXCLUDED.sent_last_24_hours,
                    cached_at          = NOW()
                """,
                row,
            )


def _upsert_ses_identities(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO ses_identity_cache
                    (identity, profile_name, profile_color, profile_env, region,
                     identity_type, verification_status,
                     dkim_enabled, dkim_verification_status,
                     bounce_topic_arn, complaint_topic_arn, delivery_topic_arn,
                     forwarding_enabled, cached_at)
                VALUES
                    (%(identity)s, %(profile_name)s, %(profile_color)s, %(profile_env)s, %(region)s,
                     %(identity_type)s, %(verification_status)s,
                     %(dkim_enabled)s, %(dkim_verification_status)s,
                     %(bounce_topic_arn)s, %(complaint_topic_arn)s, %(delivery_topic_arn)s,
                     %(forwarding_enabled)s, NOW())
                ON CONFLICT (identity, profile_name, region)
                DO UPDATE SET
                    profile_color            = EXCLUDED.profile_color,
                    profile_env              = EXCLUDED.profile_env,
                    identity_type            = EXCLUDED.identity_type,
                    verification_status      = EXCLUDED.verification_status,
                    dkim_enabled             = EXCLUDED.dkim_enabled,
                    dkim_verification_status = EXCLUDED.dkim_verification_status,
                    bounce_topic_arn         = EXCLUDED.bounce_topic_arn,
                    complaint_topic_arn      = EXCLUDED.complaint_topic_arn,
                    delivery_topic_arn       = EXCLUDED.delivery_topic_arn,
                    forwarding_enabled       = EXCLUDED.forwarding_enabled,
                    cached_at                = NOW()
                """,
                row,
            )


def poll_ses() -> None:
    """
    Fetch SES identity data, sending quotas, and account stats (sandbox status,
    bounce/complaint/reject counts) for every profile and refresh the cache.
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    from aws_data import get_ses_identities, get_ses_sending_quota, get_ses_account_stats
    from botocore.exceptions import ClientError, NoCredentialsError

    logger.info("SES poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB for SES poll: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll for SES")
        return

    all_rows: list[dict] = []
    all_quota_rows: list[dict] = []
    all_account_stats: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            rows = get_ses_identities(profile)
            all_rows.extend(rows)
            logger.debug("SES profile %s → %d identity(ies)", profile["name"], len(rows))
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS SES error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected SES error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

        try:
            quota_rows = get_ses_sending_quota(profile)
            all_quota_rows.extend(quota_rows)
            logger.debug("SES quota profile %s → %d region(s)", profile["name"], len(quota_rows))
        except Exception as exc:
            logger.warning("SES quota error for profile %s: %s", profile["name"], exc)

        try:
            account_stats = get_ses_account_stats(profile)
            all_account_stats.extend(account_stats)
            logger.debug("SES account stats profile %s → %d region(s)", profile["name"], len(account_stats))
        except Exception as exc:
            logger.warning("SES account stats error for profile %s: %s", profile["name"], exc)

    try:
        with get_connection() as conn:
            _upsert_ses_identities(conn, all_rows)
            _upsert_ses_sending_quotas(conn, all_quota_rows)
            _upsert_ses_account_stats(conn, all_account_stats)
            conn.commit()
        logger.info(
            "SES poll complete: %d identity(ies), %d quota row(s), %d account stat row(s) cached, %d profile error(s)",
            len(all_rows),
            len(all_quota_rows),
            len(all_account_stats),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write SES cache to DB: %s", exc)


# ── Route 53 poll ─────────────────────────────────────────────────────────────

ROUTE53_JOB_ID = "route53_poll"


def _upsert_route53_zones(conn, rows: list[dict]) -> None:
    if not rows:
        return
    import json as _json
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO route53_zone_cache
                    (zone_id, name, profile_name, profile_color, profile_env,
                     private_zone, comment, record_count, caller_reference, tags, cached_at)
                VALUES
                    (%(zone_id)s, %(name)s, %(profile_name)s, %(profile_color)s, %(profile_env)s,
                     %(private_zone)s, %(comment)s, %(record_count)s, %(caller_reference)s,
                     %(tags)s, NOW())
                ON CONFLICT (zone_id, profile_name)
                DO UPDATE SET
                    name             = EXCLUDED.name,
                    profile_color    = EXCLUDED.profile_color,
                    profile_env      = EXCLUDED.profile_env,
                    private_zone     = EXCLUDED.private_zone,
                    comment          = EXCLUDED.comment,
                    record_count     = EXCLUDED.record_count,
                    caller_reference = EXCLUDED.caller_reference,
                    tags             = EXCLUDED.tags,
                    cached_at        = NOW()
                """,
                {**row, "tags": _json.dumps(row.get("tags", {}))},
            )


def _upsert_route53_records(conn, rows: list[dict]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO route53_record_cache
                    (zone_id, record_name, record_type, profile_name, profile_color, profile_env,
                     ttl, values, alias_target, set_identifier, weight, region, failover, cached_at)
                VALUES
                    (%(zone_id)s, %(record_name)s, %(record_type)s, %(profile_name)s,
                     %(profile_color)s, %(profile_env)s,
                     %(ttl)s, %(values)s, %(alias_target)s, %(set_identifier)s,
                     %(weight)s, %(region)s, %(failover)s, NOW())
                ON CONFLICT (zone_id, record_name, record_type, profile_name, set_identifier)
                DO UPDATE SET
                    profile_color  = EXCLUDED.profile_color,
                    profile_env    = EXCLUDED.profile_env,
                    ttl            = EXCLUDED.ttl,
                    values         = EXCLUDED.values,
                    alias_target   = EXCLUDED.alias_target,
                    weight         = EXCLUDED.weight,
                    region         = EXCLUDED.region,
                    failover       = EXCLUDED.failover,
                    cached_at      = NOW()
                """,
                row,
            )


def poll_route53() -> None:
    """
    Fetch Route 53 hosted zones and their DNS records for every profile and refresh the cache.
    Route 53 is a global service — one request per profile (no region loop).
    Called by APScheduler on every interval tick and by the manual trigger endpoint.
    """
    from aws_data import get_route53_hosted_zones, get_route53_records
    from botocore.exceptions import ClientError, NoCredentialsError

    logger.info("Route 53 poll started")
    profiles = []

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, access_key, secret_key, regions, region, color, env_tag FROM profiles ORDER BY name"
                )
                profiles = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to load profiles from DB for Route 53 poll: %s", exc)
        return

    if not profiles:
        logger.info("No profiles configured — nothing to poll for Route 53")
        return

    all_zones: list[dict] = []
    all_records: list[dict] = []
    profile_errors: list[str] = []

    for profile in profiles:
        try:
            zones = get_route53_hosted_zones(profile)
            all_zones.extend(zones)
            logger.debug("Route 53 profile %s → %d zone(s)", profile["name"], len(zones))

            for zone in zones:
                try:
                    records = get_route53_records(profile, zone["zone_id"])
                    all_records.extend(records)
                    logger.debug(
                        "Route 53 zone %s → %d record(s)", zone["zone_id"], len(records)
                    )
                except Exception as exc:
                    logger.warning(
                        "Route 53 records error for zone %s: %s", zone["zone_id"], exc
                    )
        except (ClientError, NoCredentialsError) as exc:
            msg = str(exc)
            logger.warning("AWS Route 53 error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")
        except Exception as exc:
            msg = str(exc)
            logger.warning("Unexpected Route 53 error for profile %s: %s", profile["name"], msg)
            profile_errors.append(f"{profile['name']}: {msg}")

    try:
        with get_connection() as conn:
            _upsert_route53_zones(conn, all_zones)
            _upsert_route53_records(conn, all_records)
            conn.commit()
        logger.info(
            "Route 53 poll complete: %d zone(s), %d record(s) cached, %d profile error(s)",
            len(all_zones),
            len(all_records),
            len(profile_errors),
        )
    except Exception as exc:
        logger.error("Failed to write Route 53 cache to DB: %s", exc)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────
def _build_jobstore():
    try:
        sa_url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return SQLAlchemyJobStore(url=sa_url)
    except Exception as exc:
        logger.warning("Could not create SQLAlchemy jobstore (%s) — using in-memory", exc)
        return None


_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """Start the background scheduler. Called once from FastAPI startup."""
    global _scheduler

    interval = _load_persisted_interval() or DEFAULT_INTERVAL_SECONDS

    jobstore = _build_jobstore()
    jobstores = {"default": jobstore} if jobstore else {}

    _scheduler = BackgroundScheduler(
        jobstores=jobstores,
        executors={"default": ThreadPoolExecutor(2)},
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 60},
    )

    _scheduler.add_job(
        poll_ec2,
        trigger="interval",
        seconds=interval,
        id=JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    _scheduler.add_job(
        poll_s3,
        trigger="interval",
        seconds=interval,
        id=S3_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    _scheduler.add_job(
        poll_lambda,
        trigger="interval",
        seconds=interval,
        id=LAMBDA_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    _scheduler.add_job(
        poll_iam,
        trigger="interval",
        seconds=interval,
        id=IAM_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    _scheduler.add_job(
        poll_ses,
        trigger="interval",
        seconds=interval,
        id=SES_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    _scheduler.add_job(
        poll_route53,
        trigger="interval",
        seconds=interval,
        id=ROUTE53_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )

    # SSL certificates — daily refresh is sufficient; use 86400 s but honour
    # whatever interval the user has configured (shorter interval = more frequent checks).
    from ssl_checker import refresh_all_domains as poll_ssl
    _scheduler.add_job(
        poll_ssl,
        trigger="interval",
        seconds=max(interval, 3600),  # at least hourly to avoid hammering external hosts
        id=SSL_JOB_ID,
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
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
    """Change the poll interval at runtime without restarting."""
    if not (MIN_INTERVAL_SECONDS <= new_interval_seconds <= MAX_INTERVAL_SECONDS):
        raise ValueError(
            f"Interval must be between {MIN_INTERVAL_SECONDS} and {MAX_INTERVAL_SECONDS} seconds"
        )

    if not _scheduler or not _scheduler.running:
        raise RuntimeError("Scheduler is not running")

    _scheduler.reschedule_job(JOB_ID, trigger="interval", seconds=new_interval_seconds)
    _scheduler.reschedule_job(S3_JOB_ID, trigger="interval", seconds=new_interval_seconds)
    _scheduler.reschedule_job(LAMBDA_JOB_ID, trigger="interval", seconds=new_interval_seconds)
    _scheduler.reschedule_job(IAM_JOB_ID, trigger="interval", seconds=new_interval_seconds)
    _scheduler.reschedule_job(SES_JOB_ID, trigger="interval", seconds=new_interval_seconds)
    _scheduler.reschedule_job(ROUTE53_JOB_ID, trigger="interval", seconds=new_interval_seconds)
    # SSL uses max(interval, 3600) to avoid hammering external TLS endpoints
    _scheduler.reschedule_job(SSL_JOB_ID, trigger="interval", seconds=max(new_interval_seconds, 3600))
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

    next_run = None
    live_interval = None
    if _scheduler and _scheduler.running:
        job = _scheduler.get_job(JOB_ID)
        if job:
            if job.next_run_time:
                next_run = job.next_run_time.isoformat()
            if hasattr(job.trigger, "interval"):
                live_interval = int(job.trigger.interval.total_seconds())

    poll_interval = live_interval or (
        meta["poll_interval_seconds"] if meta and meta.get("poll_interval_seconds")
        else DEFAULT_INTERVAL_SECONDS
    )

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
    Immediately run EC2, S3, Lambda, IAM, and SES poll jobs outside the scheduler interval.
    Used by POST /api/scheduler/trigger (the dashboard Refresh button).
    """
    ec2_thread    = threading.Thread(target=poll_ec2,      daemon=True, name="ec2-manual-poll")
    s3_thread     = threading.Thread(target=poll_s3,       daemon=True, name="s3-manual-poll")
    lambda_thread = threading.Thread(target=poll_lambda,   daemon=True, name="lambda-manual-poll")
    iam_thread    = threading.Thread(target=poll_iam,      daemon=True, name="iam-manual-poll")
    ses_thread    = threading.Thread(target=poll_ses,      daemon=True, name="ses-manual-poll")
    r53_thread    = threading.Thread(target=poll_route53,  daemon=True, name="route53-manual-poll")
    from ssl_checker import refresh_all_domains as _ssl_poll
    ssl_thread    = threading.Thread(target=_ssl_poll,     daemon=True, name="ssl-manual-poll")
    ec2_thread.start()
    s3_thread.start()
    lambda_thread.start()
    iam_thread.start()
    ses_thread.start()
    r53_thread.start()
    ssl_thread.start()
    return {"triggered": True, "message": "EC2, S3, Lambda, IAM, SES, Route 53 and SSL poll started in background"}
