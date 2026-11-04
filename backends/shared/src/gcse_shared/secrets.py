"""Loads credentials from the single gitignored secrets file (config/secrets.env)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def load_secrets(path: Path) -> None:
    """Load KEY=VALUE pairs into the environment. Real env vars win (useful in CI/production)."""
    if path.exists():
        load_dotenv(path, override=False)


def require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value or value == "placeholder":
        raise RuntimeError(f"{name} is not set. Locally: add it to config/secrets.env (see config/secrets.example.env). "
                           f"On a host (Render): add it as an environment variable in the service settings.")
    return value
