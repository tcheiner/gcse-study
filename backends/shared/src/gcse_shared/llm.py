"""Thin wrapper around the Anthropic SDK for structured (Pydantic) responses.

The API key is passed per call so each user profile can supply its own key.
"""
from __future__ import annotations

from typing import TypeVar

import anthropic
from pydantic import BaseModel

from .logging import logged

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Raised when the model call fails or returns nothing usable."""

    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class LLMSettings(BaseModel):
    model: str
    effort: str = "high"
    max_tokens: int = 16000
    use_fallbacks: bool = True
    timeout_seconds: float = 120.0


def make_client(api_key: str | None, timeout: float) -> anthropic.AsyncAnthropic:
    # api_key=None lets the SDK resolve credentials from the environment (dev only).
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout)


@logged
async def structured_call(
    *,
    settings: LLMSettings,
    system: str,
    user: str,
    output_type: type[T],
    api_key: str | None,
    client: anthropic.AsyncAnthropic | None = None,
) -> T:
    client = client or make_client(api_key, settings.timeout_seconds)
    kwargs: dict = dict(
        model=settings.model,
        max_tokens=settings.max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": settings.effort},
        output_format=output_type,
    )
    try:
        if settings.use_fallbacks:
            # Server-side refusal fallback: the API re-routes a safety decline itself.
            response = await client.beta.messages.parse(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
            )
        else:
            response = await client.messages.parse(**kwargs)
    except anthropic.AuthenticationError as e:
        raise LLMError("invalid_api_key", "The Claude API key was rejected.") from e
    except anthropic.PermissionDeniedError as e:
        raise LLMError("permission_denied", "The Claude API key lacks permission for this model.") from e
    except anthropic.RateLimitError as e:
        raise LLMError("rate_limited", "Claude is rate limiting requests. Try again shortly.", True) from e
    except anthropic.BadRequestError as e:
        raise LLMError("bad_request", f"Claude rejected the request: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise LLMError("upstream_error", f"Claude returned {e.status_code}.", e.status_code >= 500) from e
    except anthropic.APIConnectionError as e:
        raise LLMError("connection_error", "Could not reach Claude.", True) from e

    if response.stop_reason == "refusal":
        raise LLMError("refusal", "Claude declined to mark this response.")
    if response.stop_reason == "max_tokens":
        raise LLMError("truncated", "Claude's response was cut off.", True)
    if response.parsed_output is None:
        raise LLMError("unparseable", "Claude's response could not be read.", True)
    return response.parsed_output


@logged
async def check_key(*, api_key: str, model: str, timeout: float,
                    client: anthropic.AsyncAnthropic | None = None) -> None:
    """Confirm the key works and can use the configured model. Retrieving a model costs no tokens."""
    client = client or make_client(api_key, timeout)
    try:
        await client.models.retrieve(model)
    except anthropic.AuthenticationError as e:
        raise LLMError("invalid_api_key", "The Claude API key was rejected.") from e
    except anthropic.PermissionDeniedError as e:
        raise LLMError("permission_denied", "This key cannot use the required Claude model.") from e
    except anthropic.NotFoundError as e:
        raise LLMError("permission_denied", "This key cannot use the required Claude model.") from e
    except anthropic.RateLimitError as e:
        raise LLMError("rate_limited", "Claude is rate limiting requests. Try again shortly.", True) from e
    except anthropic.APIStatusError as e:
        raise LLMError("upstream_error", f"Claude returned {e.status_code}.", e.status_code >= 500) from e
    except anthropic.APIConnectionError as e:
        raise LLMError("connection_error", "Could not reach Claude.", True) from e
