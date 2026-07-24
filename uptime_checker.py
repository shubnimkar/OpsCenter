"""
uptime_checker.py
-----------------
Core health-check logic for the Website Uptime Monitor.

Each call to check_website() makes a single HTTP GET request, measures
response time, optionally validates a keyword in the response body, and
returns a result dict that maps directly to a website_monitor_history row.

Status rules:
  online      — HTTP status matches expected_status AND response time ≤ threshold AND keyword present (if configured)
  degraded    — website responds but response time > threshold (2 s default)
  offline     — connection timeout / DNS failure / SSL error / unexpected HTTP status
  maintenance — monitoring continues but status is forced to "maintenance"
  content_validation_failed — HTTP status OK but keyword missing
"""

import logging
import time
from typing import Optional

import requests
from requests.exceptions import (
    ConnectionError as ReqConnectionError,
    Timeout,
    SSLError,
    TooManyRedirects,
    RequestException,
)

from network_guard import resolve_and_validate_http_url, dns_resolver_override

logger = logging.getLogger(__name__)

# Response time threshold above which a website is considered "degraded" (ms)
DEGRADED_THRESHOLD_MS = 2000

# Hard limit: if the site hasn't responded within this many seconds, mark offline
DEFAULT_TIMEOUT_SECONDS = 30


def check_website(
    url: str,
    expected_status: int = 200,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    keyword: Optional[str] = None,
    maintenance_mode: bool = False,
) -> dict:
    """
    Perform a single HTTP GET health check on *url*.

    Returns a dict with keys:
        status          — "online" | "degraded" | "offline" | "maintenance" | "content_validation_failed"
        http_status     — integer HTTP status code, or None on connection failure
        response_time_ms— integer milliseconds, or None on connection failure
        error_message   — human-readable error string, or None on success
    """
    if maintenance_mode:
        return {
            "status": "maintenance",
            "http_status": None,
            "response_time_ms": None,
            "error_message": None,
        }

    try:
        url, hostname, resolved_ip = resolve_and_validate_http_url(url)
    except ValueError as exc:
        return {
            "status": "offline",
            "http_status": None,
            "response_time_ms": None,
            "error_message": str(exc),
        }

    start = time.monotonic()
    http_status = None
    response_time_ms = None
    error_message = None
    body = None

    try:
        current_url = url
        max_redirects = 5
        redirect_count = 0

        while True:
            from urllib.parse import urlparse, urljoin
            parsed_current = urlparse(current_url)
            current_host = parsed_current.hostname
            if not current_host:
                raise RequestException("Invalid redirect URL")

            if redirect_count > 0:
                from network_guard import assert_hostname_allowed
                try:
                    current_ip = assert_hostname_allowed(current_host)
                except ValueError as exc:
                    raise RequestException(f"Redirect to unsafe host blocked: {exc}")
            else:
                current_ip = resolved_ip

            with dns_resolver_override(current_host, current_ip):
                response = requests.get(
                    current_url,
                    timeout=timeout_seconds,
                    allow_redirects=False,
                    headers={"User-Agent": "UptimeMonitor/1.0"},
                    verify=True,
                )

            if response.status_code in (301, 302, 303, 307, 308):
                redirect_target = response.headers.get("Location")
                if not redirect_target:
                    break
                current_url = urljoin(current_url, redirect_target)
                redirect_count += 1
                if redirect_count > max_redirects:
                    raise TooManyRedirects("Too many redirects")
            else:
                break

        elapsed = time.monotonic() - start
        response_time_ms = int(elapsed * 1000)
        http_status = response.status_code

        # Capture body for keyword check (limit to first 512 KB)
        try:
            body = response.text[:524288]
        except Exception:
            body = ""

    except Timeout:
        error_message = f"Connection timed out after {timeout_seconds}s"
    except SSLError as exc:
        error_message = f"SSL handshake failed: {exc}"
    except ReqConnectionError as exc:
        error_message = f"Connection error: {exc}"
    except TooManyRedirects:
        error_message = "Too many redirects"
    except RequestException as exc:
        error_message = f"Request failed: {exc}"
    except Exception as exc:
        error_message = f"Unexpected error: {exc}"

    # ── Determine status ────────────────────────────────────────────────────

    if error_message:
        # Could not reach the server at all
        return {
            "status": "offline",
            "http_status": http_status,
            "response_time_ms": None,
            "error_message": error_message,
        }

    # HTTP status mismatch → offline
    if http_status != expected_status:
        return {
            "status": "offline",
            "http_status": http_status,
            "response_time_ms": response_time_ms,
            "error_message": f"Unexpected HTTP status: {http_status} (expected {expected_status})",
        }

    # Keyword validation (optional)
    if keyword and body is not None:
        if keyword not in body:
            return {
                "status": "content_validation_failed",
                "http_status": http_status,
                "response_time_ms": response_time_ms,
                "error_message": f"Keyword '{keyword}' not found in response body",
            }

    # Degraded: responds but slow
    if response_time_ms is not None and response_time_ms > DEGRADED_THRESHOLD_MS:
        return {
            "status": "degraded",
            "http_status": http_status,
            "response_time_ms": response_time_ms,
            "error_message": None,
        }

    # All good
    return {
        "status": "online",
        "http_status": http_status,
        "response_time_ms": response_time_ms,
        "error_message": None,
    }
