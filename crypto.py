import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

_key = os.getenv("ENCRYPTION_KEY")
if not _key:
    raise RuntimeError("ENCRYPTION_KEY environment variable is not set")

_fernet = Fernet(_key.encode())


def encrypt(value: str) -> str:
    """Encrypt a plaintext string and return a base64 token string."""
    return _fernet.encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token string back to plaintext."""
    return _fernet.decrypt(token.encode()).decode()
