"""YAML configuration loading shared by every subject backend."""
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    return data


@lru_cache
def load_settings(path: str) -> dict[str, Any]:
    """Cached settings loader (path as str so it is hashable)."""
    return load_yaml(Path(path))
