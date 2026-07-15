import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    """Create the profiles table if it doesn't exist."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id         SERIAL PRIMARY KEY,
                    name       VARCHAR(255) NOT NULL UNIQUE,
                    access_key VARCHAR(255) NOT NULL,
                    secret_key VARCHAR(255) NOT NULL,
                    region     VARCHAR(100) NOT NULL DEFAULT 'us-east-1',
                    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()
