"""Helpers for safe dynamic SQL UPDATE clauses."""

PROFILE_UPDATE_COLUMNS = frozenset({
    "name", "access_key", "secret_key", "regions", "color", "env_tag",
})
SSL_UPDATE_COLUMNS = frozenset({
    "domain_name", "port", "environment", "owner", "notes",
})
WEBSITE_UPDATE_COLUMNS = frozenset({
    "name", "url", "environment", "monitoring_interval", "timeout_seconds",
    "expected_status", "keyword", "maintenance_mode", "notes",
})


def build_update_clause(updates: dict, allowed: frozenset[str]) -> tuple[str, list]:
    """Return (set_clause, values) for a parameterized UPDATE."""
    unknown = set(updates) - allowed
    if unknown:
        raise ValueError(f"Invalid update fields: {', '.join(sorted(unknown))}")
    if not updates:
        raise ValueError("No fields to update")
    set_clause = ", ".join(f"{col} = %s" for col in updates)
    return set_clause, list(updates.values())
