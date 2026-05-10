"""Codex model catalog helpers for Idea2Repo."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


DEFAULT_FALLBACK_MODEL = "gpt-5.3-codex-spark"
DEFAULT_FALLBACK_REASONING = "medium"


@dataclass(frozen=True)
class CodexReasoningLevel:
    effort: str
    description: str = ""


@dataclass(frozen=True)
class CodexModelInfo:
    slug: str
    display_name: str
    default_reasoning: str
    supported_reasoning: tuple[CodexReasoningLevel, ...]
    priority: int = 9999

    def supports_reasoning(self, effort: str) -> bool:
        return effort in {level.effort for level in self.supported_reasoning}


@dataclass(frozen=True)
class CodexModelCatalog:
    models: tuple[CodexModelInfo, ...]
    source: str
    available: bool
    error: str = ""

    def default_model(self) -> CodexModelInfo:
        if self.models:
            return sorted(self.models, key=lambda model: (model.priority, model.slug))[0]
        return fallback_model_info()

    def get(self, slug: str) -> CodexModelInfo | None:
        for model in self.models:
            if model.slug == slug:
                return model
        fallback = fallback_model_info()
        if slug == fallback.slug:
            return fallback
        return None

    def supported_reasoning(self, slug: str) -> tuple[CodexReasoningLevel, ...]:
        model = self.get(slug) or self.default_model()
        return model.supported_reasoning

    def validate_model(self, slug: str) -> CodexModelInfo:
        model = self.get(slug)
        if model is None:
            available = ", ".join(model.slug for model in self.models[:10])
            suffix = f" Available examples: {available}" if available else ""
            raise ValueError(f"unsupported Codex model: {slug}.{suffix}")
        return model

    def validate_reasoning(self, slug: str, effort: str) -> None:
        model = self.validate_model(slug)
        if not model.supports_reasoning(effort):
            levels = ", ".join(level.effort for level in model.supported_reasoning)
            raise ValueError(f"model {slug} does not support reasoning '{effort}'. Supported: {levels}")


def fallback_model_info() -> CodexModelInfo:
    return CodexModelInfo(
        slug=DEFAULT_FALLBACK_MODEL,
        display_name="GPT-5.3 Codex Spark",
        default_reasoning=DEFAULT_FALLBACK_REASONING,
        supported_reasoning=(
            CodexReasoningLevel("low", "Fast responses with lighter reasoning"),
            CodexReasoningLevel("medium", "Balanced reasoning"),
            CodexReasoningLevel("high", "Greater reasoning depth"),
            CodexReasoningLevel("xhigh", "Extra high reasoning depth"),
        ),
        priority=9999,
    )


def fallback_catalog(error: str = "") -> CodexModelCatalog:
    return CodexModelCatalog(
        models=(fallback_model_info(),),
        source="fallback",
        available=False,
        error=error,
    )


def load_codex_model_catalog(
    *,
    binary: str = "codex",
    cache_path: str | Path | None = None,
    timeout_seconds: float = 30,
) -> CodexModelCatalog:
    """Load the official Codex model catalog from CLI, then local cache."""

    cli_error = ""
    try:
        completed = subprocess.run(
            [binary, "debug", "models"],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            models = _parse_catalog_payload(json.loads(completed.stdout))
            if models:
                return CodexModelCatalog(models=models, source="codex debug models", available=True)
        cli_error = (completed.stderr or completed.stdout or "").strip()
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        cli_error = str(exc)

    path = Path(cache_path).expanduser() if cache_path is not None else Path.home() / ".codex/models_cache.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        models = _parse_catalog_payload(payload)
        if models:
            return CodexModelCatalog(models=models, source=str(path), available=True)
    except (OSError, json.JSONDecodeError) as exc:
        cache_error = str(exc)
    else:
        cache_error = "cache did not contain models"

    detail = "; ".join(part for part in (cli_error, cache_error) if part)
    return fallback_catalog(detail)


def _parse_catalog_payload(payload: Mapping[str, Any]) -> tuple[CodexModelInfo, ...]:
    raw_models = payload.get("models")
    if not isinstance(raw_models, list):
        return ()
    models: list[CodexModelInfo] = []
    for item in raw_models:
        if not isinstance(item, Mapping):
            continue
        slug = str(item.get("slug") or item.get("id") or "").strip()
        if not slug:
            continue
        levels = _reasoning_levels(item.get("supported_reasoning_levels"))
        if not levels:
            default = str(item.get("default_reasoning_level") or DEFAULT_FALLBACK_REASONING)
            levels = (CodexReasoningLevel(default),)
        models.append(
            CodexModelInfo(
                slug=slug,
                display_name=str(item.get("display_name") or item.get("name") or slug),
                default_reasoning=str(item.get("default_reasoning_level") or levels[0].effort),
                supported_reasoning=levels,
                priority=_int_value(item.get("priority"), default=9999),
            )
        )
    return tuple(sorted(models, key=lambda model: (model.priority, model.slug)))


def _reasoning_levels(value: object) -> tuple[CodexReasoningLevel, ...]:
    if not isinstance(value, list):
        return ()
    levels: list[CodexReasoningLevel] = []
    for item in value:
        if not isinstance(item, Mapping):
            continue
        effort = str(item.get("effort") or "").strip()
        if not effort:
            continue
        levels.append(CodexReasoningLevel(effort, str(item.get("description") or "")))
    return tuple(levels)


def _int_value(value: object, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
