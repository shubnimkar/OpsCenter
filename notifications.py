"""
notifications.py
----------------
Notification evaluator for SSL and Uptime alerts.

Called after each SSL refresh and uptime check. Compares the current
resource state against the previous alert state to detect:
  - New problems (site down, SSL expiring / expired)
  - Recoveries (site back online, SSL renewed to valid)

Deduplication: one active alert_event row per (alert_type, resource_key).
A new alert only fires when the state *changes* — not on every check.

Email delivery: sends to all addresses in notification_recipients via the
SES identity configured in notification_settings.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Alert type constants ──────────────────────────────────────────────────────

ALERT_UPTIME_DOWN      = "uptime_down"
ALERT_UPTIME_RECOVERED = "uptime_recovered"
ALERT_SSL_WARNING      = "ssl_expiring_warning"   # ≤ 30 days
ALERT_SSL_CRITICAL     = "ssl_expiring_critical"  # ≤ 7 days
ALERT_SSL_EXPIRED      = "ssl_expired"
ALERT_SSL_RECOVERED    = "ssl_recovered"

SSL_WARNING_DAYS  = 30
SSL_CRITICAL_DAYS = 7

# ── DB helpers ────────────────────────────────────────────────────────────────


def _get_active_event(conn, alert_type: str, resource_key: str) -> Optional[dict]:
    """Return the active (unresolved) alert event for this resource, or None."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, alert_type, resource_key, title, message, severity,
                   first_fired, last_fired, resolved_at, is_read
            FROM alert_events
            WHERE alert_type = %s AND resource_key = %s AND resolved_at IS NULL
            ORDER BY first_fired DESC
            LIMIT 1
            """,
            (alert_type, resource_key),
        )
        return cur.fetchone()


def _fire_event(conn, alert_type: str, resource_key: str,
                title: str, message: str, severity: str) -> int:
    """
    Insert a new alert event row and return its id.
    Any previous resolved event for the same key is left untouched (history).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO alert_events
                (alert_type, resource_key, title, message, severity,
                 first_fired, last_fired)
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
            """,
            (alert_type, resource_key, title, message, severity),
        )
        row = cur.fetchone()
    return row["id"]


def _resolve_event(conn, alert_type: str, resource_key: str,
                   title: str, message: str) -> Optional[int]:
    """
    Resolve the active alert for this resource. Returns the resolved event id,
    or None if there was nothing to resolve.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE alert_events
            SET resolved_at = NOW(),
                title       = %s,
                message     = %s
            WHERE alert_type = %s AND resource_key = %s AND resolved_at IS NULL
            RETURNING id
            """,
            (title, message, alert_type, resource_key),
        )
        row = cur.fetchone()
    return row["id"] if row else None


def _mark_notified(conn, event_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE alert_events SET email_sent = TRUE WHERE id = %s",
            (event_id,),
        )


# ── Email delivery ────────────────────────────────────────────────────────────


def _get_notification_settings(conn) -> dict:
    """Return the notification_settings row (sender + enabled flag)."""
    with conn.cursor() as cur:
        cur.execute("SELECT sender_email, enabled FROM notification_settings WHERE id = 1")
        row = cur.fetchone()
    return dict(row) if row else {"sender_email": None, "enabled": False}


def _get_recipients(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT email FROM notification_recipients WHERE enabled = TRUE ORDER BY id"
        )
        return [r["email"] for r in cur.fetchall()]


def _get_ses_credentials_for_sender(conn, sender_email: str) -> Optional[dict]:
    """
    Find an AWS profile that has a verified SES identity matching sender_email
    and return its decrypted credentials + region. We pick the first match.

    Matching strategy (mirrors how SES actually authorises a From address):
      1. Exact match on the full email address (e.g. alerts@example.com)
      2. Domain match on the domain part (e.g. example.com) — a verified domain
         covers every address under it, so this is the correct fallback.
    """
    from crypto import decrypt

    domain = sender_email.split("@", 1)[-1] if "@" in sender_email else sender_email

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.access_key, p.secret_key, s.region
            FROM ses_identity_cache s
            JOIN profiles p ON p.name = s.profile_name
            WHERE s.identity IN (%s, %s)
              AND s.verification_status = 'Success'
            ORDER BY
              -- prefer exact email match over domain match
              CASE WHEN s.identity = %s THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (sender_email, domain, sender_email),
        )
        row = cur.fetchone()

    if not row:
        return None

    return {
        "access_key": decrypt(row["access_key"]),
        "secret_key": decrypt(row["secret_key"]),
        "region":     row["region"],
    }


def _send_email(sender: str, recipients: list[str],
                subject: str, body_text: str, body_html: str,
                creds: dict) -> bool:
    """Send an email via SES using the supplied credentials. Returns True on success."""
    try:
        import boto3
        session = boto3.Session(
            aws_access_key_id=creds["access_key"],
            aws_secret_access_key=creds["secret_key"],
            region_name=creds["region"],
        )
        ses = session.client("ses")
        ses.send_email(
            Source=sender,
            Destination={"ToAddresses": recipients},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": body_text, "Charset": "UTF-8"},
                    "Html": {"Data": body_html, "Charset": "UTF-8"},
                },
            },
        )
        logger.info("Notification email sent to %d recipient(s): %s", len(recipients), subject)
        return True
    except Exception as exc:
        logger.warning("Failed to send notification email: %s", exc)
        return False


def _build_email(title: str, message: str, severity: str) -> tuple[str, str, str]:
    """Return (subject, plain_text, html) for a notification."""
    severity_emoji = {"critical": "🔴", "warning": "🟡", "info": "🟢"}.get(severity, "⚪")
    subject = f"{severity_emoji} Opscentre — {title}"

    plain = f"{title}\n\n{message}\n\n---\nOpscentre"

    severity_color = {"critical": "#ef4444", "warning": "#f59e0b", "info": "#10b981"}.get(severity, "#6b7280")
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:{severity_color};padding:20px 28px;">
            <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">☁️ Opscentre</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px;">
            <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a;">{title}</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">{message}</p>
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              This notification was sent by your Opscentre. Log in to view details.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    return subject, plain, html


def _deliver(conn, event_id: int, title: str, message: str, severity: str) -> None:
    """Attempt email delivery and mark the event as notified."""
    settings = _get_notification_settings(conn)
    if not settings.get("enabled"):
        return

    sender = settings.get("sender_email")
    if not sender:
        logger.warning("Notification email not sent — no sender configured")
        return

    recipients = _get_recipients(conn)
    if not recipients:
        logger.debug("No notification recipients configured — skipping email")
        return

    creds = _get_ses_credentials_for_sender(conn, sender)
    if not creds:
        logger.warning(
            "Notification email not sent — sender '%s' not found as verified SES identity", sender
        )
        return

    subject, plain, html = _build_email(title, message, severity)
    sent = _send_email(sender, recipients, subject, plain, html, creds)
    if sent:
        _mark_notified(conn, event_id)


# ── Uptime evaluator ──────────────────────────────────────────────────────────

# Statuses that mean "something is wrong"
_DOWN_STATUSES = {"offline", "degraded", "content_validation_failed"}


def evaluate_uptime(website_id: int, website_name: str, url: str,
                    new_status: str) -> None:
    """
    Called after every uptime check result is written.
    Fires an alert if the site just went down, resolves it if it recovered.
    """
    from database import get_connection

    resource_key = f"uptime:{website_id}"
    is_down = new_status in _DOWN_STATUSES

    try:
        with get_connection() as conn:
            active_down = _get_active_event(conn, ALERT_UPTIME_DOWN, resource_key)

            if is_down and not active_down:
                # Newly down — fire alert
                status_label = new_status.replace("_", " ").title()
                title   = f"{website_name} is {status_label}"
                message = (
                    f"The website <b>{website_name}</b> ({url}) entered status "
                    f"<b>{status_label}</b>. Immediate attention may be required."
                )
                event_id = _fire_event(
                    conn, ALERT_UPTIME_DOWN, resource_key,
                    title, message, "critical",
                )
                conn.commit()
                logger.info("Uptime alert fired: %s → %s (event_id=%d)", url, new_status, event_id)
                _deliver(conn, event_id, title, message, "critical")

            elif not is_down and active_down:
                # Site recovered — resolve and fire recovery notification
                title   = f"{website_name} recovered"
                message = (
                    f"The website <b>{website_name}</b> ({url}) is back online."
                )
                event_id = _resolve_event(
                    conn, ALERT_UPTIME_DOWN, resource_key, title, message
                )
                conn.commit()
                if event_id:
                    logger.info("Uptime alert resolved: %s recovered (event_id=%d)", url, event_id)

                # Also fire a separate info event so the recovery appears in the bell
                rec_id = _fire_event(
                    conn, ALERT_UPTIME_RECOVERED, resource_key,
                    title, message, "info",
                )
                # Auto-resolve recovery events immediately (they're informational)
                _resolve_event(conn, ALERT_UPTIME_RECOVERED, resource_key, title, message)
                conn.commit()
                _deliver(conn, rec_id, title, message, "info")

    except Exception as exc:
        logger.error("evaluate_uptime failed for website_id=%d: %s", website_id, exc)


# ── SSL evaluator ─────────────────────────────────────────────────────────────


def evaluate_ssl(domain_id: int, domain_name: str,
                 new_status: str, days_remaining: Optional[int]) -> None:
    """
    Called after every SSL refresh.
    Fires alerts for expiring/expired certs and resolves them when renewed.
    """
    from database import get_connection

    resource_key = f"ssl:{domain_id}"

    try:
        with get_connection() as conn:
            # Check existing active alerts for this domain
            active_critical = _get_active_event(conn, ALERT_SSL_CRITICAL, resource_key)
            active_warning  = _get_active_event(conn, ALERT_SSL_WARNING,  resource_key)
            active_expired  = _get_active_event(conn, ALERT_SSL_EXPIRED,  resource_key)

            if new_status == "expired":
                # Resolve warning and critical alerts since they are superseded by expired
                resolved_any = False
                for atype in (ALERT_SSL_WARNING, ALERT_SSL_CRITICAL):
                    eid = _resolve_event(
                        conn, atype, resource_key,
                        f"SSL certificate expired: {domain_name}",
                        f"The SSL certificate for {domain_name} has expired.",
                    )
                    if eid:
                        resolved_any = True
                if resolved_any:
                    conn.commit()

                if not active_expired:
                    title   = f"SSL certificate expired: {domain_name}"
                    message = (
                        f"The SSL certificate for <b>{domain_name}</b> has <b>expired</b>. "
                        f"Visitors will see a security warning. Renew immediately."
                    )
                    event_id = _fire_event(
                        conn, ALERT_SSL_EXPIRED, resource_key,
                        title, message, "critical",
                    )
                    conn.commit()
                    logger.info("SSL expired alert fired: %s (event_id=%d)", domain_name, event_id)
                    _deliver(conn, event_id, title, message, "critical")

            elif new_status == "expiring_soon" and days_remaining is not None:
                if days_remaining <= SSL_CRITICAL_DAYS:
                    # Resolve warning and expired alerts since they are superseded by critical
                    resolved_any = False
                    for atype in (ALERT_SSL_WARNING, ALERT_SSL_EXPIRED):
                        eid = _resolve_event(
                            conn, atype, resource_key,
                            f"SSL certificate critical: {domain_name}",
                            f"The SSL certificate for {domain_name} has entered critical status.",
                        )
                        if eid:
                            resolved_any = True
                    if resolved_any:
                        conn.commit()

                    if not active_critical:
                        title   = f"SSL expiring in {days_remaining} day(s): {domain_name}"
                        message = (
                            f"The SSL certificate for <b>{domain_name}</b> expires in "
                            f"<b>{days_remaining} day(s)</b>. Renew it before it expires "
                            f"to avoid service disruption."
                        )
                        event_id = _fire_event(
                            conn, ALERT_SSL_CRITICAL, resource_key,
                            title, message, "critical",
                        )
                        conn.commit()
                        logger.info(
                            "SSL critical alert fired: %s (%d days) (event_id=%d)",
                            domain_name, days_remaining, event_id,
                        )
                        _deliver(conn, event_id, title, message, "critical")

                else:
                    # Resolve critical and expired alerts since they are superseded by warning
                    resolved_any = False
                    for atype in (ALERT_SSL_CRITICAL, ALERT_SSL_EXPIRED):
                        eid = _resolve_event(
                            conn, atype, resource_key,
                            f"SSL certificate warning: {domain_name}",
                            f"The SSL certificate for {domain_name} has entered warning status.",
                        )
                        if eid:
                            resolved_any = True
                    if resolved_any:
                        conn.commit()

                    if not active_warning:
                        title   = f"SSL expiring in {days_remaining} day(s): {domain_name}"
                        message = (
                            f"The SSL certificate for <b>{domain_name}</b> will expire in "
                            f"<b>{days_remaining} day(s)</b>. Schedule a renewal soon."
                        )
                        event_id = _fire_event(
                            conn, ALERT_SSL_WARNING, resource_key,
                            title, message, "warning",
                        )
                        conn.commit()
                        logger.info(
                            "SSL warning alert fired: %s (%d days) (event_id=%d)",
                            domain_name, days_remaining, event_id,
                        )
                        _deliver(conn, event_id, title, message, "warning")

            elif new_status == "valid":
                # Cert is now valid — resolve any active alerts
                recovered = False
                for atype in (ALERT_SSL_EXPIRED, ALERT_SSL_CRITICAL, ALERT_SSL_WARNING):
                    eid = _resolve_event(
                        conn, atype, resource_key,
                        f"SSL certificate renewed: {domain_name}",
                        f"The SSL certificate for <b>{domain_name}</b> is now valid.",
                    )
                    if eid:
                        recovered = True

                if recovered:
                    conn.commit()
                    title   = f"SSL certificate renewed: {domain_name}"
                    message = f"The SSL certificate for <b>{domain_name}</b> is now valid."
                    rec_id  = _fire_event(
                        conn, ALERT_SSL_RECOVERED, resource_key,
                        title, message, "info",
                    )
                    _resolve_event(conn, ALERT_SSL_RECOVERED, resource_key, title, message)
                    conn.commit()
                    logger.info("SSL alert resolved (recovered): %s (event_id=%d)", domain_name, rec_id)
                    _deliver(conn, rec_id, title, message, "info")

    except Exception as exc:
        logger.error("evaluate_ssl failed for domain_id=%d: %s", domain_id, exc)
