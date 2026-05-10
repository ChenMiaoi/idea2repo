"""Experimental OAuth-backed Codex Responses provider for Idea2Repo."""

from __future__ import annotations

import json
import os
import base64
import platform
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import httpx

from .auth import AuthError, AuthProvider, OFFICIAL_OPENAI_JWT_CLAIM
from .codex_agent import (
    CODEX_SCHEMA_VERSION,
    DEFAULT_CODEX_TIMEOUT_SECONDS,
    CodexAgentError,
    CodexAnalysisResult,
    CodexDiscussionResult,
    CodexExecutionError,
    CodexNotLoggedInError,
    IdeaDiscussionTurn,
    ResearchAnalysis,
    build_discussion_prompt,
    build_research_prompt,
    discussion_json_schema,
    parse_discussion_turn,
    parse_research_analysis,
    research_analysis_json_schema,
)


OAUTH_CODEX_PROVIDER_ID = "openai-codex-oauth"
OAUTH_CODEX_API_SHAPE = "openai-codex-responses"
DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api"
DEFAULT_CODEX_RESPONSES_ENDPOINT = f"{DEFAULT_CODEX_BASE_URL}/codex/responses"
DEFAULT_OAUTH_CODEX_MODEL = "gpt-5.3-codex-spark"
CODEX_RESPONSES_ENDPOINT_ENV = "IDEA2REPO_CODEX_RESPONSES_URL"
CODEX_MODEL_ENV = "IDEA2REPO_CODEX_MODEL"
CODEX_ORIGINATOR_ENV = "IDEA2REPO_CODEX_ORIGINATOR"
CODEX_MAX_RETRIES = 3
CODEX_BASE_RETRY_DELAY_SECONDS = 1.0
ProgressCallback = Callable[[str], None]


@dataclass(frozen=True)
class CodexOAuthStatus:
    """Safe-to-print status for the Idea2Repo OAuth provider."""

    available: bool
    logged_in: bool
    status_text: str
    account_label: str = ""
    expires_at: float | None = None
    endpoint: str = DEFAULT_CODEX_RESPONSES_ENDPOINT


class CodexOAuthClient:
    """Native experimental provider modeled after GSD-style OAuth harnesses."""

    def __init__(
        self,
        *,
        auth_provider: AuthProvider | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout_seconds: float = DEFAULT_CODEX_TIMEOUT_SECONDS,
        http_client: httpx.Client | None = None,
        max_retries: int = CODEX_MAX_RETRIES,
        retry_base_seconds: float = CODEX_BASE_RETRY_DELAY_SECONDS,
        originator: str | None = None,
        session_id: str | None = None,
        reasoning_effort: str | None = None,
    ) -> None:
        self.auth_provider = auth_provider or AuthProvider()
        endpoint_value = endpoint or os.environ.get(CODEX_RESPONSES_ENDPOINT_ENV) or DEFAULT_CODEX_BASE_URL
        self.endpoint = _resolve_codex_responses_url(endpoint_value)
        self.model = model or os.environ.get(CODEX_MODEL_ENV) or DEFAULT_OAUTH_CODEX_MODEL
        self.timeout_seconds = timeout_seconds
        self.http_client = http_client
        self.max_retries = max(0, max_retries)
        self.retry_base_seconds = max(0.0, retry_base_seconds)
        self.originator = originator or os.environ.get(CODEX_ORIGINATOR_ENV) or "idea2repo"
        self.session_id = session_id
        self.reasoning_effort = reasoning_effort

    def check_login(self) -> CodexOAuthStatus:
        session = self.auth_provider.current_session()
        if session.mode != "openai_account" or not session.is_authenticated:
            return CodexOAuthStatus(
                available=True,
                logged_in=False,
                status_text="not logged in",
                endpoint=self.endpoint,
            )
        if session.is_expired:
            return CodexOAuthStatus(
                available=True,
                logged_in=False,
                status_text="OpenAI account session expired",
                account_label=session.account_label,
                expires_at=session.expires_at,
                endpoint=self.endpoint,
            )
        return CodexOAuthStatus(
            available=True,
            logged_in=True,
            status_text=f"logged in via openai_account ({session.account_label})",
            account_label=session.account_label,
            expires_at=session.expires_at,
            endpoint=self.endpoint,
        )

    def require_logged_in(self) -> CodexOAuthStatus:
        status = self.check_login()
        if not status.logged_in and "expired" in status.status_text.casefold():
            try:
                self.auth_provider.access_token(refresh_if_needed=True)
            except AuthError as exc:
                raise CodexNotLoggedInError(str(exc)) from exc
            status = self.check_login()
        if not status.logged_in:
            raise CodexNotLoggedInError(
                "Idea2Repo OAuth is not logged in. Run `idea2repo auth login` before generating."
            )
        return status

    def analyze_idea(
        self,
        idea: str,
        *,
        requested_domains: Sequence[str] | None = None,
        timeline_weeks: int = 12,
        resources: Sequence[str] | None = None,
        stack: str = "python",
        progress_callback: ProgressCallback | None = None,
    ) -> CodexAnalysisResult:
        status = self.require_logged_in()
        prompt = build_research_prompt(
            idea,
            requested_domains=requested_domains,
            timeline_weeks=timeline_weeks,
            resources=resources,
            stack=stack,
        )
        if progress_callback is not None:
            progress_callback("Codex OAuth: building structured research-analysis request")
        payload = _responses_payload(
            prompt,
            research_analysis_json_schema(),
            self.model,
            instructions=_research_instructions(research_analysis_json_schema()),
            reasoning_effort=self.reasoning_effort,
        )
        analysis, events = self._request_structured(
            payload,
            parser=parse_research_analysis,
            progress_callback=progress_callback,
        )
        return CodexAnalysisResult(
            analysis=analysis,
            provider_id=OAUTH_CODEX_PROVIDER_ID,
            api_shape=OAUTH_CODEX_API_SHAPE,
            codex_version=None,
            codex_model=self.model,
            stdout_events=events,
        )

    def discuss_idea(
        self,
        idea: str,
        *,
        conversation: Sequence[Mapping[str, str]] = (),
        progress_callback: ProgressCallback | None = None,
    ) -> CodexDiscussionResult:
        status = self.require_logged_in()
        prompt = build_discussion_prompt(idea, conversation=conversation)
        schema = discussion_json_schema()
        if progress_callback is not None:
            progress_callback("Codex OAuth: thinking about clarifying questions")
        payload = _responses_payload(
            prompt,
            schema,
            self.model,
            instructions=_discussion_instructions(schema),
            reasoning_effort=self.reasoning_effort,
        )
        turn, events = self._request_structured(
            payload,
            parser=parse_discussion_turn,
            progress_callback=progress_callback,
        )
        return CodexDiscussionResult(
            turn=turn,
            provider_id=OAUTH_CODEX_PROVIDER_ID,
            api_shape=OAUTH_CODEX_API_SHAPE,
            codex_version=None,
            codex_model=self.model,
            stdout_events=events,
        )

    def _request_structured(
        self,
        payload: Mapping[str, Any],
        *,
        parser: Callable[..., ResearchAnalysis] | Callable[..., IdeaDiscussionTurn],
        progress_callback: ProgressCallback | None,
    ) -> tuple[Any, tuple[dict[str, Any], ...]]:
        client = self.http_client or httpx.Client(timeout=self.timeout_seconds)
        close_client = self.http_client is None
        try:
            last_retryable: _RetryableCodexHTTPError | None = None
            for attempt in range(self.max_retries + 1):
                try:
                    return self._request_structured_once(
                        client,
                        payload,
                        parser=parser,
                        progress_callback=progress_callback,
                        retry_auth=True,
                    )
                except _RetryableCodexHTTPError as exc:
                    last_retryable = exc
                    if attempt >= self.max_retries:
                        raise CodexExecutionError(
                            f"Codex OAuth request failed with HTTP {exc.status_code}: {exc.detail}"
                        ) from exc
                    delay = self.retry_base_seconds * (2**attempt)
                    if progress_callback is not None:
                        progress_callback(
                            f"Codex OAuth: transient HTTP {exc.status_code}; retrying"
                        )
                    if delay > 0:
                        time.sleep(delay)
            if last_retryable is not None:
                raise CodexExecutionError(
                    f"Codex OAuth request failed with HTTP {last_retryable.status_code}: "
                    f"{last_retryable.detail}"
                ) from last_retryable
            raise CodexExecutionError("Codex OAuth request failed before receiving a response")
        finally:
            if close_client:
                client.close()

    def _request_structured_once(
        self,
        client: httpx.Client,
        payload: Mapping[str, Any],
        *,
        parser: Callable[..., ResearchAnalysis] | Callable[..., IdeaDiscussionTurn],
        progress_callback: ProgressCallback | None,
        retry_auth: bool,
    ) -> tuple[Any, tuple[dict[str, Any], ...]]:
        token = self._access_token()
        account_id = _chatgpt_account_id(token)
        headers = _codex_headers(
            token,
            account_id,
            originator=self.originator,
            session_id=self.session_id,
        )
        try:
            with client.stream(
                "POST",
                self.endpoint,
                headers=headers,
                json=dict(payload),
                timeout=self.timeout_seconds,
            ) as response:
                if response.status_code in {401, 403} and retry_auth:
                    response.close()
                    if progress_callback is not None:
                        progress_callback("Codex OAuth: refreshing expired credentials")
                    self.auth_provider.refresh_session()
                    return self._request_structured_once(
                        client,
                        payload,
                        parser=parser,
                        progress_callback=progress_callback,
                        retry_auth=False,
                    )
                if response.status_code < 200 or response.status_code >= 300:
                    detail = _http_error_detail(response)
                    if _is_retryable_error(response.status_code, detail):
                        raise _RetryableCodexHTTPError(response.status_code, detail or response.reason_phrase)
                    raise CodexExecutionError(
                        f"Codex OAuth request failed with HTTP {response.status_code}: "
                        f"{detail or response.reason_phrase}"
                    )
                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    text = response.read().decode(response.encoding or "utf-8", errors="replace")
                    return _parse_json_response(text, parser=parser)
                return _parse_sse_response(response, parser=parser, progress_callback=progress_callback)
        except AuthError as exc:
            raise CodexNotLoggedInError(str(exc)) from exc
        except httpx.TimeoutException as exc:
            raise CodexExecutionError(
                f"Codex OAuth request timed out after {self.timeout_seconds:g}s"
            ) from exc
        except httpx.HTTPError as exc:
            raise CodexExecutionError(f"Codex OAuth request failed: {exc}") from exc

    def _access_token(self) -> str:
        try:
            return self.auth_provider.access_token(refresh_if_needed=True)
        except AuthError as exc:
            raise CodexNotLoggedInError(str(exc)) from exc


def oauth_provider_payload(client: CodexOAuthClient | None = None) -> dict[str, Any]:
    client = client or CodexOAuthClient()
    status = client.check_login()
    errors = [] if status.logged_in else [status.status_text]
    return {
        "ok": status.logged_in,
        "errors": errors,
        "provider_id": OAUTH_CODEX_PROVIDER_ID,
        "api_shape": OAUTH_CODEX_API_SHAPE,
        "codex_available": True,
        "codex_logged_in": status.logged_in,
        "codex_model": client.model,
        "endpoint": status.endpoint,
        "report": oauth_provider_report(client),
    }


def oauth_provider_report(client: CodexOAuthClient | None = None) -> str:
    client = client or CodexOAuthClient()
    status = client.check_login()
    lines = [
        "# Provider Configuration",
        "",
        "## Active Provider",
        "",
        f"- Provider ID: {OAUTH_CODEX_PROVIDER_ID}",
        f"- API shape: {OAUTH_CODEX_API_SHAPE}",
        f"- Endpoint: {status.endpoint}",
        f"- Login: {'logged in' if status.logged_in else 'not logged in'}",
        f"- Account: {status.account_label or 'unset'}",
        f"- Model: {client.model}",
        "",
        "## Boundary",
        "",
        "- Experimental GSD-style OAuth provider.",
        "- Store Idea2Repo OAuth credentials under ~/.idea2repo/agent/codex/credentials.json.",
        "- Do not read ~/.codex auth files or browser cookies.",
        "- Do not write tokens, Authorization headers, or private provider responses into generated repos.",
    ]
    return "\n".join(lines) + "\n"


def _responses_payload(
    prompt: str,
    schema: Mapping[str, Any],
    model: str,
    *,
    instructions: str,
    reasoning_effort: str | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "store": False,
        "stream": True,
        "instructions": instructions,
        "input": [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}],
            }
        ],
        "text": {"verbosity": "medium"},
        "include": ["reasoning.encrypted_content"],
        "tool_choice": "auto",
        "parallel_tool_calls": True,
    }
    if reasoning_effort:
        payload["reasoning"] = {"effort": reasoning_effort, "summary": "auto"}
    return payload


def _parse_sse_response(
    response: httpx.Response,
    *,
    parser: Callable[..., ResearchAnalysis] | Callable[..., IdeaDiscussionTurn],
    progress_callback: ProgressCallback | None,
) -> tuple[Any, tuple[dict[str, Any], ...]]:
    events: list[dict[str, Any]] = []
    text_parts: list[str] = []
    emitted_progress: set[str] = set()
    for raw_line in response.iter_lines():
        line = raw_line.strip()
        if not line or line.startswith(":"):
            continue
        if line.startswith("data:"):
            data = line[5:].strip()
        else:
            data = line
        if data == "[DONE]":
            break
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        events.append(event)
        event_type = str(event.get("type") or event.get("event") or "event")
        if event_type == "error":
            raise CodexExecutionError(_event_error_message(event))
        if event_type == "response.failed":
            raise CodexExecutionError(_response_failed_message(event))
        if progress_callback is not None:
            label = _safe_progress_label(event_type)
            if label not in emitted_progress or "completed" in label or "error" in label:
                progress_callback(label)
                emitted_progress.add(label)
        delta = _event_text_delta(event, event_type)
        if delta:
            text_parts.append(delta)
        response_payload = event.get("response")
        if isinstance(response_payload, Mapping):
            final_text = _response_output_text(response_payload)
            if final_text and not text_parts:
                text_parts.append(final_text)
    analysis = parser("".join(text_parts), events=events)
    return analysis, tuple(events)


def _research_instructions(schema: Mapping[str, Any]) -> str:
    schema_text = json.dumps(dict(schema), ensure_ascii=False, sort_keys=True)
    return (
        "You are Idea2Repo's Codex-backed research agent. "
        "Return exactly one JSON object and no Markdown, prose, code fence, or citations. "
        "The JSON object must validate against this ResearchAnalysis JSON Schema. "
        "Do not fabricate papers, BibTeX, datasets, metrics, or experiment results; "
        "when evidence needs verification, express it as search queries or verification tasks. "
        f"Schema version: {CODEX_SCHEMA_VERSION}. JSON Schema: {schema_text}"
    )


def _discussion_instructions(schema: Mapping[str, Any]) -> str:
    schema_text = json.dumps(dict(schema), ensure_ascii=False, sort_keys=True)
    return (
        "You are Idea2Repo's Codex-backed research intake agent. "
        "Return exactly one JSON object and no Markdown, prose, or code fence. "
        "The JSON object must validate against this IdeaDiscussionTurn JSON Schema. "
        "Ask only necessary clarification questions. If enough information is available, "
        "set ready_to_analyze to true and include concise visible assumptions. "
        f"JSON Schema: {schema_text}"
    )


def _http_error_detail(response: httpx.Response) -> str:
    try:
        body = response.read()
    except httpx.HTTPError:
        return ""
    text = body.decode(response.encoding or "utf-8", errors="replace").strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return " ".join(text.split())[:500]
    if isinstance(payload, Mapping):
        error = payload.get("error")
        if isinstance(error, Mapping):
            friendly = _friendly_codex_error(response.status_code, error)
            message = str(error.get("message") or friendly or "").strip()
            code = str(error.get("code") or error.get("type") or "").strip()
            if friendly:
                return friendly
            if message and code:
                return f"{message} ({code})"[:500]
            if message:
                return message[:500]
        if "message" in payload:
            return str(payload["message"])[:500]
    return " ".join(text.split())[:500]


def _parse_json_response(
    text: str,
    *,
    parser: Callable[..., ResearchAnalysis] | Callable[..., IdeaDiscussionTurn],
) -> tuple[Any, tuple[dict[str, Any], ...]]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return parser(text), ()
    if not isinstance(payload, dict):
        return parser(text), ()
    events = (payload,)
    output_text = _response_output_text(payload) or text
    analysis = parser(output_text, events=events)
    return analysis, events


def _event_text_delta(event: Mapping[str, Any], event_type: str = "") -> str:
    lowered = event_type.casefold()
    if lowered and not lowered.endswith(".delta"):
        return ""
    for key in ("delta", "text"):
        value = event.get(key)
        if isinstance(value, str):
            return value
    if isinstance(event.get("content"), str):
        return str(event["content"])
    return ""


def _response_output_text(payload: Mapping[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text
    parts: list[str] = []
    output = payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, Mapping):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for content_item in content:
                if not isinstance(content_item, Mapping):
                    continue
                text = content_item.get("text")
                if isinstance(text, str):
                    parts.append(text)
    return "".join(parts)


class _RetryableCodexHTTPError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _resolve_codex_responses_url(raw: str) -> str:
    normalized = raw.strip().rstrip("/")
    if not normalized:
        normalized = DEFAULT_CODEX_BASE_URL
    if normalized.endswith("/codex/responses"):
        return normalized
    if normalized.endswith("/codex"):
        return f"{normalized}/responses"
    return f"{normalized}/codex/responses"


def _codex_headers(
    token: str,
    account_id: str,
    *,
    originator: str,
    session_id: str | None,
) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "chatgpt-account-id": account_id,
        "OpenAI-Beta": "responses=experimental",
        "originator": originator,
        "User-Agent": _user_agent(),
        "accept": "text/event-stream",
        "content-type": "application/json",
    }
    if session_id:
        headers["session_id"] = session_id
    return headers


def _user_agent() -> str:
    return f"idea2repo ({platform.system()} {platform.release()}; {platform.machine()})"


def _chatgpt_account_id(token: str) -> str:
    payload = _decode_jwt_payload(token)
    openai_auth = payload.get(OFFICIAL_OPENAI_JWT_CLAIM) if payload is not None else None
    if isinstance(openai_auth, Mapping):
        account_id = str(openai_auth.get("chatgpt_account_id") or "").strip()
        if account_id:
            return account_id
    raise CodexNotLoggedInError(
        "OpenAI OAuth access token does not contain a ChatGPT account id; run `idea2repo auth login` again."
    )


def _decode_jwt_payload(token: str) -> Mapping[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode((payload + padding).encode("ascii"))
        data = json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, Mapping) else None


def _is_retryable_error(status_code: int, detail: str) -> bool:
    if status_code in {429, 500, 502, 503, 504}:
        return True
    lowered = detail.casefold()
    return any(
        marker in lowered
        for marker in (
            "rate limit",
            "ratelimit",
            "overloaded",
            "service unavailable",
            "upstream connect",
            "connection refused",
        )
    )


def _friendly_codex_error(status_code: int, error: Mapping[str, Any]) -> str:
    code = str(error.get("code") or error.get("type") or "")
    if status_code == 429 or any(
        marker in code.casefold()
        for marker in ("usage_limit_reached", "usage_not_included", "rate_limit_exceeded")
    ):
        plan = str(error.get("plan_type") or "").strip()
        plan_suffix = f" ({plan.lower()} plan)" if plan else ""
        resets_at = _float_value(error.get("resets_at"))
        retry = ""
        if resets_at is not None:
            minutes = max(0, round((resets_at - time.time()) / 60))
            retry = f" Try again in ~{minutes} min."
        return f"You have hit your ChatGPT usage limit{plan_suffix}.{retry}".strip()
    return ""


def _float_value(value: object) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _event_error_message(event: Mapping[str, Any]) -> str:
    error = event.get("error")
    if isinstance(error, Mapping):
        error_type = str(error.get("type") or "").strip()
        code = str(error.get("code") or "").strip()
        message = str(error.get("message") or "").strip()
        prefix = f"Codex {error_type}" if error_type else "Codex error"
        detail = message or code or json.dumps(dict(error), ensure_ascii=False)
        return f"{prefix}: {detail}"
    message = str(event.get("message") or "").strip()
    return message or f"Codex error: {json.dumps(dict(event), ensure_ascii=False)}"


def _response_failed_message(event: Mapping[str, Any]) -> str:
    response = event.get("response")
    if isinstance(response, Mapping):
        error = response.get("error")
        if isinstance(error, Mapping):
            message = str(error.get("message") or "").strip()
            code = str(error.get("code") or error.get("type") or "").strip()
            if message and code:
                return f"{message} ({code})"
            if message:
                return message
    return "Codex response failed"


def _safe_progress_label(event_type: str) -> str:
    lowered = event_type.casefold()
    if "completed" in lowered:
        return "Codex OAuth: completed structured analysis"
    if "output" in lowered or "delta" in lowered:
        return "Codex OAuth: receiving structured analysis"
    if "error" in lowered or "failed" in lowered:
        return "Codex OAuth: provider reported an error"
    return f"Codex OAuth: {event_type}"
