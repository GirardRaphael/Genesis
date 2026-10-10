"""Opt-in text model adapters sharing persisted, conservative reservations."""

from datetime import datetime, timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import time
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from .db import BudgetExceeded


class LiveUnavailable(ValueError):
    pass


class BillingUncertain(RuntimeError):
    pass


class Price(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    provider: str
    model: str
    currency: str
    effective_at: datetime
    expires_at: datetime
    source_url: str
    retrieved_at: datetime
    input_per_million: Decimal = Field(ge=0)
    output_per_million: Decimal = Field(ge=0)
    max_input_tokens: int = Field(ge=5000, le=100000)
    max_output_tokens: int = Field(ge=128, le=4096)
    billing_rules: str
    cache_write_per_million: Decimal = Field(default=0, ge=0)
    cache_read_per_million: Decimal = Field(default=0, ge=0)


def live_configuration(role="planning", provider=None, model_override=None):
    provider = provider or os.getenv("GENESIS_PROVIDER", "anthropic")
    if provider != "anthropic":
        raise LiveUnavailable(
            "Only Anthropic live execution is enabled; create a new Anthropic run"
        )
    key_name = "ANTHROPIC_API_KEY"
    if not os.getenv(key_name):
        raise LiveUnavailable(f"{key_name} is not configured; fixture execution remains available")
    prefix = "GENESIS_ANTHROPIC"
    model = model_override or os.getenv(
        prefix + "_ECONOMY_MODEL"
        if role in {"traffic", "exception"}
        else prefix + "_VERIFIER_MODEL"
        if role == "monitoring"
        else prefix + "_MODEL"
    )
    price_path = os.getenv("GENESIS_PRICE_FILE")
    if not model or not price_path:
        raise LiveUnavailable("Live model and verified price file are required")
    try:
        raw = json.loads(Path(price_path).read_text(encoding="utf-8"))
        if "prices" in raw:
            raw = next(record for record in raw["prices"] if record["model"] == model)
        price = Price.model_validate(raw)
        current = datetime.now(timezone.utc)
        if any(
            d.tzinfo is None for d in [price.effective_at, price.expires_at, price.retrieved_at]
        ):
            raise ValueError("Timezone required")
        if price.provider != provider or price.model != model or price.currency != "USD":
            raise ValueError("Price/model mismatch")
        if price.cache_write_per_million <= 0 or price.cache_read_per_million <= 0:
            raise ValueError("Anthropic cache billing categories require explicit rates")
        if not price.effective_at <= current < price.expires_at or price.retrieved_at > current:
            raise ValueError("Price expired/not current")
        if (
            not price.source_url.startswith("https://")
            or price.billing_rules != "anthropic_text_cache_output"
        ):
            raise ValueError("Unsupported billing configuration")
    except Exception as exc:
        raise LiveUnavailable("Price file is missing, invalid, stale, or incompatible") from exc
    return model, price


class ModelAdapter:
    def __init__(self, store, run_id, fence, role):
        request = store.get_run(run_id)["request"]
        self.provider = request.get("provider")
        if self.provider != os.getenv("GENESIS_PROVIDER", "anthropic"):
            raise LiveUnavailable(
                "This run targets a provider that is no longer active; create a new run for the selected provider"
            )
        configured_models = request.get("model_policy", {})
        self.model, self.price = live_configuration(
            role, self.provider, configured_models.get(role)
        )
        from anthropic import Anthropic

        self.client = Anthropic(max_retries=0, timeout=45)
        self.store, self.run_id, self.fence = store, run_id, fence

    def explain(self, role, prompt, evidence, invocation_id):
        from anthropic import RateLimitError as AnthropicRateLimit

        input_text = json.dumps(
            {"role": role, "verified_evidence": evidence}, ensure_ascii=True, separators=(",", ":")
        )
        # ASCII text has a conservative one-token-per-byte bound plus bounded API framing.
        input_bound = len((prompt + input_text).encode("utf-8")) + 4096
        if input_bound > self.price.max_input_tokens:
            raise LiveUnavailable("Evidence exceeds configured input bound")
        maximum = (
            Decimal(input_bound)
            * max(
                self.price.input_per_million,
                self.price.cache_write_per_million,
                self.price.cache_read_per_million,
            )
            + Decimal(self.price.max_output_tokens) * self.price.output_per_million
        ) / Decimal(1000000)
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "evidence_refs": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "evidence_refs"],
            "additionalProperties": False,
        }
        for number in range(1, 4):
            attempt_id = str(uuid4())
            self.store.reserve(self.run_id, attempt_id, maximum, self.fence)
            self.store.append_event(
                self.run_id,
                "model.started",
                {
                    "attempt_id": attempt_id,
                    "attempt": number,
                    "requested_model": self.model,
                    "provider": self.provider,
                    "price_version": self.price.version,
                    "reservation_usd": str(maximum),
                    "max_input_tokens": input_bound,
                    "max_output_tokens": self.price.max_output_tokens,
                },
                invocation_id,
                fence=self.fence,
            )
            started = time.monotonic()
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.price.max_output_tokens,
                    system=prompt,
                    messages=[{"role": "user", "content": input_text}],
                    service_tier="standard_only",
                    output_config={
                        "effort": "low",
                        "format": {"type": "json_schema", "schema": schema},
                    },
                )
            except AnthropicRateLimit as exc:
                # A rejected 429 has no generated response; only this explicit rejection is retried.
                self.store.settle(self.run_id, attempt_id, 0, self.fence)
                quota_unavailable = getattr(exc, "code", None) == "insufficient_quota"
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {
                        "attempt_id": attempt_id,
                        "attempt": number,
                        "error_code": "insufficient_quota" if quota_unavailable else "rate_limited",
                        "retryable": not quota_unavailable and number < 3,
                        "duration_ms": int((time.monotonic() - started) * 1000),
                        "usage_source": "request_rejected",
                        "cost_usd": "0",
                    },
                    invocation_id,
                    fence=self.fence,
                )
                if quota_unavailable:
                    raise LiveUnavailable(
                        "Provider API credits/quota are unavailable; configure API billing before another live run"
                    )
                if number == 3:
                    raise LiveUnavailable(
                        "Provider model requests were rate limited after bounded retries; retry only after provider limits recover"
                    )
                time.sleep(number)
                continue
            except Exception as exc:
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {
                        "attempt_id": attempt_id,
                        "attempt": number,
                        "error_code": "provider_attempt_uncertain",
                        "retryable": False,
                        "duration_ms": int((time.monotonic() - started) * 1000),
                        "input_tokens": None,
                        "output_tokens": None,
                        "cost_usd": None,
                        "billing_uncertain": True,
                    },
                    invocation_id,
                    fence=self.fence,
                )
                raise BillingUncertain(
                    "Provider attempt uncertain; reservation retained and automatic redispatch disabled"
                ) from exc
            if response.usage is None:
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {
                        "attempt_id": attempt_id,
                        "attempt": number,
                        "provider": self.provider,
                        "error_code": "usage_unavailable",
                        "billing_uncertain": True,
                        "retryable": False,
                        "input_tokens": None,
                        "output_tokens": None,
                        "cost_usd": None,
                        "duration_ms": int((time.monotonic() - started) * 1000),
                    },
                    invocation_id,
                    fence=self.fence,
                )
                raise BillingUncertain("Provider usage unavailable; reservation retained")
            usage = response.usage
            cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
            cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
            input_tokens = usage.input_tokens + cache_read + cache_write
            completion_status = (
                "completed" if response.stop_reason == "end_turn" else response.stop_reason
            )
            output_text = "".join(block.text for block in response.content if block.type == "text")
            charge = (
                Decimal(usage.input_tokens) * self.price.input_per_million
                + Decimal(usage.output_tokens) * self.price.output_per_million
                + Decimal(cache_read) * self.price.cache_read_per_million
                + Decimal(cache_write) * self.price.cache_write_per_million
            ) / Decimal(1000000)
            value = {
                "attempt_id": attempt_id,
                "attempt": number,
                "provider": self.provider,
                "requested_model": self.model,
                "resolved_model": response.model,
                "provider_response_id": response.id,
                "input_tokens": input_tokens,
                "uncached_input_tokens": usage.input_tokens,
                "cache_creation_input_tokens": cache_write,
                "output_tokens": usage.output_tokens,
                "cached_input_tokens": cache_read,
                "reasoning_output_tokens": None,
                "cost_usd": str(charge),
                "currency": "USD",
                "price_version": self.price.version,
                "usage_source": "provider",
                "cost_source": "conservative_cache_write_estimate"
                if cache_write
                else "price_estimate",
                "duration_ms": int((time.monotonic() - started) * 1000),
                "status": completion_status,
            }
            try:
                self.store.settle(self.run_id, attempt_id, charge, self.fence)
            except BudgetExceeded:
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {**value, "error_code": "billing_overrun", "retryable": False},
                    invocation_id,
                    fence=self.fence,
                )
                raise
            if completion_status != "completed":
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {**value, "error_code": "response_incomplete_or_refused", "retryable": False},
                    invocation_id,
                    fence=self.fence,
                )
                raise RuntimeError("Model response did not complete")
            try:
                explanation = json.loads(output_text)
                if (
                    set(explanation) != {"summary", "evidence_refs"}
                    or not isinstance(explanation["summary"], str)
                    or not isinstance(explanation["evidence_refs"], list)
                    or not all(isinstance(ref, str) for ref in explanation["evidence_refs"])
                ):
                    raise ValueError("Invalid shape")
                allowed_refs = set(evidence.get("evidence_refs", []))
                prior_message = evidence.get("prior_agent_message") or {}
                allowed_refs.update(prior_message.get("evidence_refs", []))
                if not set(explanation["evidence_refs"]) <= allowed_refs:
                    raise ValueError("Model cited an unavailable artifact")
            except Exception as exc:
                self.store.append_event(
                    self.run_id,
                    "model.failed",
                    {
                        **value,
                        "error_code": "output_schema_or_evidence_invalid",
                        "retryable": False,
                    },
                    invocation_id,
                    fence=self.fence,
                )
                raise RuntimeError("Model output schema invalid") from exc
            self.store.append_event(
                self.run_id, "model.completed", value, invocation_id, fence=self.fence
            )
            return explanation, value
