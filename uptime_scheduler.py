"""
uptime_scheduler.py
-------------------
Single-job uptime monitoring scheduler.

A single APScheduler job runs every minute (TICK_SECONDS = 60).
On each tick it:
  1. Loads all monitored websites from the DB.
  2. Checks whether each site's configured monitoring_interval has elapsed
     since its last check (using next_check_at).
  3. Runs checks only for due sites — in a thread pool so they don't block.
  4. Writes results back to website_monitor (snapshot) and
     website_monitor_history (append log).

This scales well because we have only one scheduled job, regardless of how
many websites are being monitored. Each website can still have its own
monitoring frequency.
"""

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from database import get_connection
from uptime_checker import check_website

logger = logging.getLogger(__name__)

TICK_SECONDS   = 60          # How often the scheduler checks for due sites
MAX_WORKERS    = 10          # Parallel HTTP checks per tick
UPTIME_JOB_ID  = "uptime_monitor_tick"
HISTORY_RETENTION_DAYS = int(os.getenv("UPTIME_HISTORY_RETENTION_DAYS", "90"))

_last_purge_hour: int | None = None

# Module-level reference so api.py can call run_check_for_website()
_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="uptime-check")

_active_checks = set()
_active_checks_lock = threading.Lock()


def _maybe_purge_history() -> None:
    """Delete uptime history older than HISTORY_RETENTION_DAYS (once per UTC hour)."""
    global _last_purge_hour
    hour = datetime.now(timezone.utc).hour
    if _last_purge_hour == hour:
        return
    _last_purge_hour = hour
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM website_monitor_history
                    WHERE checked_at < NOW() - make_interval(days => %s)
                    """,
                    (HISTORY_RETENTION_DAYS,),
                )
                deleted = cur.rowcount
            conn.commit()
        if deleted:
            logger.info("Purged %d uptime history row(s) older than %d days", deleted, HISTORY_RETENTION_DAYS)
    except Exception as exc:
        logger.warning("Failed to purge uptime history: %s", exc)


# ── Core check function ───────────────────────────────────────────────────────


def run_check_for_website(website_id: int) -> None:
    """
    Load one website from the DB, run an HTTP health check, and persist the
    result. Called both by the scheduler tick and by the manual refresh endpoint.
    """
    with _active_checks_lock:
        if website_id in _active_checks:
            logger.debug("uptime: check for website_id=%d already in progress — skipping", website_id)
            return
        _active_checks.add(website_id)

    try:
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id, name, url, expected_status, timeout_seconds,
                               keyword, maintenance_mode, monitoring_interval
                        FROM website_monitor
                        WHERE id = %s
                        """,
                        (website_id,),
                    )
                    site = cur.fetchone()

            if not site:
                logger.warning("uptime: website_id=%d not found — skipping", website_id)
                return

            result = check_website(
                url=site["url"],
                expected_status=site["expected_status"],
                timeout_seconds=site["timeout_seconds"],
                keyword=site["keyword"] or None,
                maintenance_mode=site["maintenance_mode"],
            )

            now = datetime.now(timezone.utc)
            next_check = now + timedelta(seconds=site["monitoring_interval"])

            with get_connection() as conn:
                with conn.cursor() as cur:
                    # Update snapshot on the website row
                    cur.execute(
                        """
                        UPDATE website_monitor SET
                            last_status        = %s,
                            last_http_status   = %s,
                            last_response_time = %s,
                            last_checked_at    = %s,
                            next_check_at      = %s,
                            updated_at         = NOW()
                        WHERE id = %s
                        """,
                        (
                            result["status"],
                            result["http_status"],
                            result["response_time_ms"],
                            now,
                            next_check,
                            website_id,
                        ),
                    )
                    # Append history record
                    cur.execute(
                        """
                        INSERT INTO website_monitor_history
                            (website_id, status, http_status, response_time_ms, error_message, checked_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            website_id,
                            result["status"],
                            result["http_status"],
                            result["response_time_ms"],
                            result["error_message"],
                            now,
                        ),
                    )
                conn.commit()

            logger.debug(
                "uptime: id=%d url=%s status=%s http=%s rt=%sms",
                website_id,
                site["url"],
                result["status"],
                result["http_status"],
                result["response_time_ms"],
            )

            # Evaluate notification state after writing the result
            try:
                from notifications import evaluate_uptime
                evaluate_uptime(
                    website_id=website_id,
                    website_name=site["name"],
                    url=site["url"],
                    new_status=result["status"],
                )
            except Exception as notif_exc:
                logger.warning("uptime: notification eval failed for id=%d: %s", website_id, notif_exc)

        except Exception as exc:
            logger.error("uptime: error checking website_id=%d: %s", website_id, exc)
    finally:
        with _active_checks_lock:
            _active_checks.discard(website_id)


# ── Scheduler tick ────────────────────────────────────────────────────────────


def _uptime_tick() -> None:
    """
    Called by APScheduler every TICK_SECONDS.
    Loads all sites and dispatches checks for those that are due.
    """
    _maybe_purge_history()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM website_monitor
                    WHERE next_check_at IS NULL
                       OR next_check_at <= NOW()
                    ORDER BY next_check_at NULLS FIRST
                    """
                )
                due_ids = [r["id"] for r in cur.fetchall()]
    except Exception as exc:
        logger.error("uptime tick: failed to load due websites: %s", exc)
        return

    if not due_ids:
        return

    logger.info("uptime tick: %d site(s) due for check", len(due_ids))

    futures = {
        _executor.submit(run_check_for_website, wid): wid
        for wid in due_ids
    }
    for future in as_completed(futures):
        wid = futures[future]
        exc = future.exception()
        if exc:
            logger.error("uptime tick: check failed for id=%d: %s", wid, exc)


# ── Scheduler integration ─────────────────────────────────────────────────────


def register_uptime_scheduler(scheduler) -> None:
    """
    Register the uptime tick job with an existing APScheduler instance.
    Called once from scheduler.start_scheduler() so we share the same
    BackgroundScheduler without creating a second one.
    """
    scheduler.add_job(
        _uptime_tick,
        trigger="interval",
        seconds=TICK_SECONDS,
        id=UPTIME_JOB_ID,
        replace_existing=True,
        # Run the first tick immediately so newly added sites are checked right away
        next_run_time=datetime.now(timezone.utc),
        coalesce=True,
        max_instances=1,
        misfire_grace_time=30,
    )
    logger.info("Uptime monitor registered — ticking every %d seconds", TICK_SECONDS)
