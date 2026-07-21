"""
auth.py
-------
API key authentication middleware for the FastAPI app.
"""

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

API_KEY = os.getenv("API_KEY")

PUBLIC_PREFIXES = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
)


def _is_public(path: str) -> bool:
    return path == "/health" or any(path.startswith(p) for p in PUBLIC_PREFIXES)


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not API_KEY:
            return JSONResponse(
                status_code=503,
                content={"detail": "API_KEY environment variable is not configured"},
            )

        if request.method == "OPTIONS" or _is_public(request.url.path):
            return await call_next(request)

        if request.headers.get("X-API-Key") != API_KEY:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key"},
            )

        return await call_next(request)
