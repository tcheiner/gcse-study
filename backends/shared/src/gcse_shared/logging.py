"""Logging per the project convention.

- File: <log_dir>/DDMMYYYY_HH-MM-SS-MS.log, new file on every startup.
- Rotates to a fresh file if the process runs past midnight.
- Line format: [ISO8601] [LEVEL] [ENTER|EXIT|ERROR] fn | data
- Modes: "debug" (ENTER/EXIT for every decorated fn) or "production" (errors only).
"""
from __future__ import annotations

import functools
import inspect
import logging
import time
from datetime import datetime, date
from pathlib import Path
from typing import Any, Callable

LOGGER_NAME = "gcse"
_REDACT = {"api_key", "password", "token", "secret", "authorization"}
_MAX_VALUE_LEN = 200


def _log_filename(now: datetime) -> str:
    return now.strftime("%d%m%Y_%H-%M-%S-") + f"{now.microsecond // 1000:03d}.log"


class DailyFileHandler(logging.Handler):
    """Writes to a timestamped file; opens a new one when the date changes."""

    def __init__(self, log_dir: Path) -> None:
        super().__init__()
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._open(datetime.now())

    def _open(self, now: datetime) -> None:
        self._day: date = now.date()
        self.path = self.log_dir / _log_filename(now)
        self._stream = self.path.open("a", encoding="utf-8")

    def emit(self, record: logging.LogRecord) -> None:
        try:
            now = datetime.now()
            if now.date() != self._day:
                self._stream.close()
                self._open(now)
            self._stream.write(self.format(record) + "\n")
            self._stream.flush()
        except Exception:  # pragma: no cover - logging must never crash the app
            self.handleError(record)

    def close(self) -> None:
        self._stream.close()
        super().close()


class _Formatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds")
        phase = getattr(record, "phase", "-")
        fn = getattr(record, "fn", record.funcName)
        return f"[{ts}] [{record.levelname}] [{phase}] {fn} | {record.getMessage()}"


def setup_logging(log_dir: Path, mode: str = "debug") -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    for h in list(logger.handlers):
        logger.removeHandler(h)
        h.close()
    handler = DailyFileHandler(log_dir)
    handler.setFormatter(_Formatter())
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG if mode == "debug" else logging.ERROR)
    logger.propagate = False
    return logger


def _summarise(value: Any) -> Any:
    if isinstance(value, str) and len(value) > _MAX_VALUE_LEN:
        return value[:_MAX_VALUE_LEN] + f"…(+{len(value) - _MAX_VALUE_LEN} chars)"
    if isinstance(value, type):
        return value.__name__
    if hasattr(value, "model_dump"):
        return {k: _summarise(v) for k, v in value.model_dump().items()}
    if isinstance(value, dict):
        return {k: ("***" if k.lower() in _REDACT else _summarise(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_summarise(v) for v in value[:10]]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    text = repr(value)  # anything else: keep log lines short
    return text if len(text) <= _MAX_VALUE_LEN else text[:_MAX_VALUE_LEN] + "…"


def _bound_args(fn: Callable, args: tuple, kwargs: dict) -> dict[str, Any]:
    try:
        bound = inspect.signature(fn).bind_partial(*args, **kwargs)
    except TypeError:
        return {"args": "<unbindable>"}
    return {
        k: ("***" if k.lower() in _REDACT else _summarise(v))
        for k, v in bound.arguments.items()
        if k not in ("self", "cls")
    }


def logged(fn: Callable) -> Callable:
    """Log ENTER (inputs), EXIT (output + duration) and ERROR for sync or async fns."""
    logger = logging.getLogger(LOGGER_NAME)
    name = fn.__qualname__

    def _enter(args, kwargs):
        logger.debug("%s", _bound_args(fn, args, kwargs), extra={"phase": "ENTER", "fn": name})

    def _exit(result, start):
        ms = (time.perf_counter() - start) * 1000
        logger.debug("%s | %.1fms", _summarise(result), ms, extra={"phase": "EXIT", "fn": name})

    def _error(exc, start):
        ms = (time.perf_counter() - start) * 1000
        logger.error("%s: %s | %.1fms", type(exc).__name__, exc, ms, extra={"phase": "ERROR", "fn": name})

    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            _enter(args, kwargs)
            start = time.perf_counter()
            try:
                result = await fn(*args, **kwargs)
            except Exception as exc:
                _error(exc, start)
                raise
            _exit(result, start)
            return result
        return async_wrapper

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        _enter(args, kwargs)
        start = time.perf_counter()
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:
            _error(exc, start)
            raise
        _exit(result, start)
        return result
    return wrapper
