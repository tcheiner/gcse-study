"""Loads mark schemes from config/mark_schemes/<board>/{board.yaml, paper2_<tariff>.yaml}."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from gcse_shared.config import load_yaml
from gcse_shared.logging import logged

_TARIFF_FILE = re.compile(r"^paper2_(\d+)\.yaml$")


class SchemeNotFound(Exception):
    pass


@dataclass(frozen=True)
class MarkScheme:
    board: dict[str, Any]
    scheme: dict[str, Any]

    @property
    def tariff(self) -> int:
        return int(self.scheme["tariff"])

    @property
    def levels(self) -> list[dict[str, Any]]:
        return self.scheme["levels"]

    def level(self, n: int) -> dict[str, Any] | None:
        return next((lv for lv in self.levels if lv["level"] == n), None)

    def level_for_mark(self, mark: int) -> dict[str, Any] | None:
        return next((lv for lv in self.levels if lv["min"] <= mark <= lv["max"]), None)


class MarkSchemeRepo:
    def __init__(self, root: Path) -> None:
        self.root = root

    @logged
    def boards(self) -> list[dict[str, Any]]:
        out = []
        for d in sorted(p for p in self.root.iterdir() if p.is_dir()):
            meta_path = d / "board.yaml"
            if not meta_path.exists():
                continue
            meta = load_yaml(meta_path)
            tariffs = sorted(
                int(m.group(1)) for f in d.iterdir() if (m := _TARIFF_FILE.match(f.name))
            )
            out.append({**meta, "id": meta.get("id", d.name), "tariffs": tariffs})
        return out

    @logged
    def get(self, board: str, tariff: int) -> MarkScheme:
        # Board ids come from user input: only allow simple slugs to avoid path traversal.
        if not re.fullmatch(r"[a-z0-9-]+", board):
            raise SchemeNotFound(f"Unknown board '{board}'")
        board_dir = self.root / board
        scheme_path = board_dir / f"paper2_{int(tariff)}.yaml"
        if not (board_dir / "board.yaml").exists() or not scheme_path.exists():
            raise SchemeNotFound(f"No mark scheme for board '{board}' with {tariff} marks")
        return MarkScheme(board=load_yaml(board_dir / "board.yaml"), scheme=load_yaml(scheme_path))
