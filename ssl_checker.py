"""
ssl_checker.py
--------------
Utilities for fetching SSL certificate details from a domain via a direct
TLS socket connection. No AWS dependency — works for any public or
internal hostname.
"""

import ssl
import socket
import logging
from datetime import datetime, timezone

from cryptography import x509
from cryptography.hazmat.backends import default_backend

from network_guard import validate_tls_target

logger = logging.getLogger(__name__)

# Days threshold for "Expiring Soon" status
EXPIRING_SOON_DAYS = 30


def _compute_status(expiry_date: datetime | None, days_remaining: int | None) -> str:
    """Derive the SSL status string from expiry info."""
    if expiry_date is None or days_remaining is None:
        return "error"
    if days_remaining < 0:
        return "expired"
    if days_remaining <= EXPIRING_SOON_DAYS:
        return "expiring_soon"
    return "valid"


def fetch_ssl_info(domain: str, port: int = 443, timeout: int = 10) -> dict:
    """
    Open a TLS connection to domain:port and return certificate metadata.
    Uses binary DER form + the `cryptography` library so we get full cert
    details even for expired or self-signed certificates.

    Returns a dict with:
        issuer, valid_from, expiry_date, days_remaining, status, error (None if ok)
    """
    try:
        domain, port = validate_tls_target(domain, port)
    except ValueError as exc:
        return {
            "issuer": "",
            "valid_from": None,
            "expiry_date": None,
            "days_remaining": None,
            "status": "error",
            "san_list": [],
            "key_algorithm": "",
            "error": str(exc),
        }

    ctx = ssl.create_default_context()
    # Disable verification so we can inspect expired / self-signed certs
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((domain, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                der_bytes = ssock.getpeercert(binary_form=True)
    except (socket.gaierror, socket.timeout, ConnectionRefusedError, OSError) as exc:
        logger.warning("SSL fetch failed for %s:%s — %s", domain, port, exc)
        return {
            "issuer": "",
            "valid_from": None,
            "expiry_date": None,
            "days_remaining": None,
            "status": "error",
            "san_list": [],
            "key_algorithm": "",
            "error": str(exc),
        }
    except Exception as exc:
        logger.warning("Unexpected SSL error for %s:%s — %s", domain, port, exc)
        return {
            "issuer": "",
            "valid_from": None,
            "expiry_date": None,
            "days_remaining": None,
            "status": "error",
            "san_list": [],
            "key_algorithm": "",
            "error": str(exc),
        }

    if not der_bytes:
        return {
            "issuer": "",
            "valid_from": None,
            "expiry_date": None,
            "days_remaining": None,
            "status": "error",
            "san_list": [],
            "key_algorithm": "",
            "error": "No certificate returned by server",
        }

    # Parse the DER-encoded certificate with the cryptography library
    try:
        cert = x509.load_der_x509_certificate(der_bytes, default_backend())
    except Exception as exc:
        logger.warning("Failed to parse certificate for %s — %s", domain, exc)
        return {
            "issuer": "",
            "valid_from": None,
            "expiry_date": None,
            "days_remaining": None,
            "status": "error",
            "san_list": [],
            "key_algorithm": "",
            "error": f"Certificate parse error: {exc}",
        }

    # Extract issuer — prefer O (Organization), fall back to CN (CommonName)
    issuer = ""
    try:
        org = cert.issuer.get_attributes_for_oid(x509.NameOID.ORGANIZATION_NAME)
        cn  = cert.issuer.get_attributes_for_oid(x509.NameOID.COMMON_NAME)
        issuer = (org[0].value if org else "") or (cn[0].value if cn else "")
    except Exception:
        pass

    # Validity dates — cryptography returns timezone-aware UTC datetimes
    try:
        valid_from  = cert.not_valid_before_utc
        expiry_date = cert.not_valid_after_utc
    except AttributeError:
        # cryptography < 42 uses naive datetimes; add UTC manually
        valid_from  = cert.not_valid_before.replace(tzinfo=timezone.utc)
        expiry_date = cert.not_valid_after.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    days_remaining = (expiry_date - now).days
    status = _compute_status(expiry_date, days_remaining)

    # Subject Alternative Names
    san_list: list[str] = []
    try:
        san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        san_list = san_ext.value.get_values_for_type(x509.DNSName)
    except x509.ExtensionNotFound:
        pass
    except Exception:
        pass

    # Key algorithm and size
    key_algorithm = ""
    try:
        from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa, ed25519, ed448
        pub_key = cert.public_key()
        if isinstance(pub_key, rsa.RSAPublicKey):
            key_size = pub_key.key_size
            key_algorithm = f"RSA-{key_size}"
        elif isinstance(pub_key, ec.EllipticCurvePublicKey):
            curve_name = pub_key.curve.name  # e.g. "secp256r1"
            # Map OpenSSL curve names to friendlier labels
            _CURVE_LABELS = {
                "secp256r1": "ECDSA P-256",
                "secp384r1": "ECDSA P-384",
                "secp521r1": "ECDSA P-521",
                "prime256v1": "ECDSA P-256",
            }
            key_algorithm = _CURVE_LABELS.get(curve_name, f"ECDSA {curve_name}")
        elif isinstance(pub_key, dsa.DSAPublicKey):
            key_algorithm = f"DSA-{pub_key.key_size}"
        elif isinstance(pub_key, ed25519.Ed25519PublicKey):
            key_algorithm = "Ed25519"
        elif isinstance(pub_key, ed448.Ed448PublicKey):
            key_algorithm = "Ed448"
    except Exception:
        pass

    return {
        "issuer": issuer,
        "valid_from": valid_from,
        "expiry_date": expiry_date,
        "days_remaining": days_remaining,
        "status": status,
        "san_list": san_list,
        "key_algorithm": key_algorithm,
        "error": None,
    }


def refresh_domain(domain_id: int) -> dict | None:
    """
    Load a domain row from the DB, fetch its SSL cert, update the row,
    and return the updated row dict (or None if domain not found).
    """
    from database import get_connection  # local import avoids circular deps at module load

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, domain_name, port FROM ssl_certificates WHERE id = %s",
                (domain_id,),
            )
            row = cur.fetchone()

    if not row:
        return None

    info = fetch_ssl_info(row["domain_name"], row["port"])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ssl_certificates
                SET issuer         = %s,
                    valid_from     = %s,
                    expiry_date    = %s,
                    days_remaining = %s,
                    status         = %s,
                    san_list       = %s,
                    key_algorithm  = %s,
                    last_checked   = NOW(),
                    updated_at     = NOW()
                WHERE id = %s
                RETURNING
                    id, domain_name, port, environment, owner, notes,
                    issuer, valid_from, expiry_date,
                    days_remaining, status, san_list, key_algorithm,
                    last_checked, created_at, updated_at
                """,
                (
                    info["issuer"],
                    info["valid_from"],
                    info["expiry_date"],
                    info["days_remaining"],
                    info["status"],
                    info["san_list"],
                    info["key_algorithm"],
                    domain_id,
                ),
            )
            updated = cur.fetchone()
        conn.commit()

    # Evaluate notification state after writing the result
    if updated:
        try:
            from notifications import evaluate_ssl
            evaluate_ssl(
                domain_id=domain_id,
                domain_name=updated["domain_name"],
                new_status=updated["status"],
                days_remaining=updated["days_remaining"],
            )
        except Exception as notif_exc:
            logger.warning("SSL notification eval failed for domain_id=%d: %s", domain_id, notif_exc)

    return updated


def refresh_all_domains() -> None:
    """
    Refresh SSL certificate info for every domain in ssl_certificates.
    Called by the background scheduler.
    """
    from database import get_connection

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM ssl_certificates ORDER BY id")
                ids = [r["id"] for r in cur.fetchall()]
    except Exception as exc:
        logger.error("Failed to load SSL domains from DB: %s", exc)
        return

    logger.info("SSL refresh started — %d domain(s)", len(ids))

    for domain_id in ids:
        try:
            result = refresh_domain(domain_id)
            if result:
                logger.debug(
                    "SSL refreshed: %s → status=%s days=%s",
                    result["domain_name"],
                    result["status"],
                    result["days_remaining"],
                )
        except Exception as exc:
            logger.warning("Failed to refresh SSL for domain id=%s: %s", domain_id, exc)

    logger.info("SSL refresh complete — %d domain(s) processed", len(ids))
