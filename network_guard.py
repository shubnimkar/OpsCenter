"""
network_guard.py
----------------
SSRF protections for outbound HTTP/TLS checks (uptime monitor, SSL checker).
"""

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset({
    "localhost",
    "metadata.google.internal",
    "metadata.google",
})

_METADATA_IPS = frozenset({
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("fd00:ec2::254"),
})


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip in _METADATA_IPS
        or ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
    )


def _normalize_hostname(hostname: str) -> str:
    host = hostname.strip().lower().rstrip(".")
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    return host


import urllib3.util.connection as urllib3_conn
import threading
from contextlib import contextmanager

_dns_overrides = threading.local()

def _get_dns_overrides() -> dict:
    if not hasattr(_dns_overrides, "mapping"):
        _dns_overrides.mapping = {}
    return _dns_overrides.mapping

_original_create_connection = urllib3_conn.create_connection

def _patched_create_connection(address, *args, **kwargs):
    host, port = address
    mapping = _get_dns_overrides()
    if host in mapping:
        return _original_create_connection((mapping[host], port), *args, **kwargs)
    return _original_create_connection(address, *args, **kwargs)

urllib3_conn.create_connection = _patched_create_connection


@contextmanager
def dns_resolver_override(host: str, ip: str):
    """Context manager to force urllib3 to connect to a specific IP for a given hostname."""
    mapping = _get_dns_overrides()
    mapping[host] = ip
    try:
        yield
    finally:
        mapping.pop(host, None)


def assert_hostname_allowed(hostname: str) -> str:
    """Raise ValueError if hostname is not safe to connect to. Returns the first validated IP address string."""
    host = _normalize_hostname(hostname)
    if not host:
        raise ValueError("Hostname must not be empty")
    if host in BLOCKED_HOSTNAMES or host.endswith(".local") or host.endswith(".internal"):
        raise ValueError(f"Hostname not allowed: {host}")

    # Literal IP in hostname
    try:
        ip = ipaddress.ip_address(host)
        if _is_blocked_ip(ip):
            raise ValueError(f"IP address not allowed: {host}")
        return str(ip)
    except ValueError as exc:
        if "not allowed" in str(exc):
            raise

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname: {host}") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if _is_blocked_ip(ip):
            raise ValueError(f"Hostname resolves to blocked address: {ip}")

    return infos[0][4][0]


def validate_http_url(url: str) -> str:
    """Validate an HTTP(S) URL for uptime checks. Returns the normalized URL."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("url must start with http:// or https://")
    if not parsed.hostname:
        raise ValueError("url must include a hostname")
    if parsed.username or parsed.password:
        raise ValueError("url must not include credentials")
    assert_hostname_allowed(parsed.hostname)
    return url


def resolve_and_validate_http_url(url: str) -> tuple[str, str, str]:
    """Validate HTTP(S) URL and return (normalized_url, hostname, resolved_ip)."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("url must start with http:// or https://")
    if not parsed.hostname:
        raise ValueError("url must include a hostname")
    if parsed.username or parsed.password:
        raise ValueError("url must not include credentials")
    resolved_ip = assert_hostname_allowed(parsed.hostname)
    return url.strip(), parsed.hostname, resolved_ip


def validate_tls_target(domain: str, port: int) -> tuple[str, int, str]:
    """Validate domain/port for SSL certificate checks. Returns (host, port, resolved_ip)."""
    host = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if host.startswith(prefix):
            host = host[len(prefix):]
    host = host.split("/")[0].split(":")[0]
    if not host:
        raise ValueError("domain_name must not be empty")
    if not (1 <= port <= 65535):
        raise ValueError("port must be between 1 and 65535")
    resolved_ip = assert_hostname_allowed(host)
    return host, port, resolved_ip

