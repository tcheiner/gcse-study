import re
from datetime import datetime

from gcse_shared.logging import _bound_args, _log_filename


def test_filename_format():
    name = _log_filename(datetime(2026, 11, 4, 9, 5, 7, 123456))
    assert name == "04112026_09-05-07-123.log"


def test_api_key_is_redacted_and_long_text_truncated():
    def fn(api_key, answer):
        pass
    out = _bound_args(fn, ("sk-ant-secret", "x" * 500), {})
    assert out["api_key"] == "***"
    assert len(out["answer"]) < 260 and "chars" in out["answer"]
