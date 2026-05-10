import base64
import json
import unittest

import httpx

from idea2repo.auth import AuthSession
from idea2repo.codex_agent import CodexExecutionError, CodexSchemaError
from idea2repo.codex_oauth import (
    OAUTH_CODEX_API_SHAPE,
    OAUTH_CODEX_PROVIDER_ID,
    CodexOAuthClient,
)


class FakeAuthProvider:
    def __init__(self) -> None:
        self.refreshes = 0
        self.token = _jwt("acct-test")

    def current_session(self) -> AuthSession:
        return AuthSession(mode="openai_account", account_label="researcher@example.test", expires_at=9999999999)

    def access_token(self, **kwargs) -> str:
        return self.token

    def refresh_session(self) -> AuthSession:
        self.refreshes += 1
        return self.current_session()


class CodexOAuthTests(unittest.TestCase):
    def test_oauth_client_parses_sse_structured_analysis(self) -> None:
        payload = json.dumps(_analysis_payload())
        sse = "\n".join(
            [
                'data: {"type":"response.created"}',
                f'data: {json.dumps({"type": "response.output_text.delta", "delta": payload})}',
                f'data: {json.dumps({"type": "response.output_text.done", "text": payload})}',
                'data: {"type":"response.completed"}',
                "data: [DONE]",
                "",
            ]
        )

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.headers["authorization"], f"Bearer {_jwt('acct-test')}")
            self.assertEqual(request.headers["chatgpt-account-id"], "acct-test")
            self.assertEqual(request.headers["openai-beta"], "responses=experimental")
            self.assertEqual(request.headers["originator"], "idea2repo")
            self.assertIn("idea2repo (", request.headers["user-agent"])
            self.assertEqual(request.headers["accept"], "text/event-stream")
            body = json.loads(request.content)
            self.assertEqual(body["model"], "gpt-5.3-codex-spark")
            self.assertFalse(body["store"])
            self.assertTrue(body["stream"])
            self.assertEqual(body["text"], {"verbosity": "medium"})
            self.assertNotIn("format", body["text"])
            self.assertEqual(body["include"], ["reasoning.encrypted_content"])
            self.assertEqual(body["tool_choice"], "auto")
            self.assertTrue(body["parallel_tool_calls"])
            self.assertEqual(body["reasoning"], {"effort": "high", "summary": "auto"})
            self.assertIn("ResearchAnalysis JSON Schema", body["instructions"])
            self.assertIn('"schema_version"', body["instructions"])
            return httpx.Response(200, content=sse)

        progress: list[str] = []
        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            retry_base_seconds=0,
            reasoning_effort="high",
        )
        result = client.analyze_idea("agent memory", progress_callback=progress.append)

        self.assertEqual(result.provider_id, OAUTH_CODEX_PROVIDER_ID)
        self.assertEqual(result.api_shape, OAUTH_CODEX_API_SHAPE)
        self.assertEqual(result.analysis.raw_score.total, 41)
        self.assertTrue(any("receiving structured analysis" in item for item in progress))

    def test_oauth_client_refreshes_once_on_401(self) -> None:
        auth = FakeAuthProvider()
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(401, text="expired")
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"output_text": json.dumps(_analysis_payload())},
            )

        client = CodexOAuthClient(
            auth_provider=auth,  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            retry_base_seconds=0,
        )
        result = client.analyze_idea("agent memory")

        self.assertEqual(result.analysis.revised_score.total, 73)
        self.assertEqual(auth.refreshes, 1)
        self.assertEqual(calls, 2)

    def test_oauth_client_rejects_invalid_schema(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, headers={"content-type": "application/json"}, json={"output_text": "{}"})

        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            retry_base_seconds=0,
        )
        with self.assertRaises(CodexSchemaError):
            client.analyze_idea("agent memory")

    def test_oauth_client_reports_http_errors(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="temporarily unavailable")

        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            max_retries=0,
        )
        with self.assertRaisesRegex(CodexExecutionError, "temporarily unavailable"):
            client.analyze_idea("agent memory")

    def test_oauth_client_reports_streaming_400_without_response_not_read(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, content=b'{"error":"bad request"}')

        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            retry_base_seconds=0,
        )
        with self.assertRaisesRegex(CodexExecutionError, "HTTP 400"):
            client.analyze_idea("agent memory")

    def test_oauth_client_resolves_base_url_like_gsd(self) -> None:
        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            endpoint="https://chatgpt.com/backend-api",
        )
        self.assertEqual(client.endpoint, "https://chatgpt.com/backend-api/codex/responses")

    def test_oauth_client_discussion_turn_uses_selected_model_and_reasoning(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            self.assertEqual(body["model"], "gpt-test")
            self.assertEqual(body["reasoning"], {"effort": "medium", "summary": "auto"})
            self.assertIn("IdeaDiscussionTurn JSON Schema", body["instructions"])
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"output_text": json.dumps(_discussion_payload())},
            )

        client = CodexOAuthClient(
            auth_provider=FakeAuthProvider(),  # type: ignore[arg-type]
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            model="gpt-test",
            reasoning_effort="medium",
        )

        result = client.discuss_idea("agent memory")

        self.assertTrue(result.turn.ready_to_analyze)
        self.assertEqual(result.turn.derived_config.output_slug, "agent-memory")


def _analysis_payload() -> dict[str, object]:
    return {
        "schema_version": 1,
        "idea_summary": "Agent memory benchmark",
        "problem_statement": "Agents need verifiable long-horizon memory evaluation.",
        "domain_route": {
            "key": "ai_llm_agent",
            "label": "AI/LLM Agent",
            "candidate_venues": ["NeurIPS", "ICLR"],
            "rationale": "The idea centers on agent evaluation.",
        },
        "raw_score": {
            "total": 41,
            "rationale": "Novelty and evidence are not yet grounded.",
            "cap_reasons": ["missing recent related work"],
        },
        "revised_score": {
            "total": 73,
            "rationale": "A benchmark-first plan could be feasible.",
            "cap_reasons": ["needs strong baselines"],
        },
        "feasibility": "Feasible if scoped to a small benchmark first.",
        "risks": ["Related work may already cover the core idea."],
        "related_work_queries": ["agent memory benchmark related work"],
        "paper_clusters": [
            {
                "name": "Memory benchmarks",
                "core_problem": "Evaluate long-horizon memory behavior.",
                "method_pattern": "Benchmark and ablation study.",
                "representative_papers": [],
                "collision_risk": "Unknown until verified.",
                "verification_queries": ["long horizon agent memory benchmark"],
            }
        ],
        "novelty_gaps": ["Tie memory compression to falsifiable task failures."],
        "revised_plan": {
            "summary": "Build a benchmark-first memory compression study.",
            "key_changes": ["Start from related-work collision checks."],
            "evidence_required": ["Verified related-work matrix."],
            "feasibility": "Feasible with narrow scope.",
        },
        "experiment_plan": {
            "baselines": ["long-context baseline"],
            "datasets": ["source-needed benchmark"],
            "metrics": ["task success metric"],
            "ablations": ["without compression"],
            "failure_cases": ["memory overwrite failures"],
            "reproducibility_checks": ["seed and config logging"],
        },
        "timeline": [
            {
                "week": "1",
                "deliverable": "Verify related work.",
                "exit_criteria": "Related-work matrix has source URLs.",
            }
        ],
        "reviewer_simulation": "A reviewer will ask for stronger baselines.",
        "artifact_contents": {},
    }


def _discussion_payload() -> dict[str, object]:
    return {
        "assistant_message": "I have enough context to proceed.",
        "ready_to_analyze": True,
        "missing_information": [],
        "assumptions": ["Use Python."],
        "derived_config": {
            "timeline_weeks": 12,
            "resources": [],
            "stack": "python",
            "output_slug": "agent-memory",
            "requested_domains": ["ai"],
        },
    }


def _jwt(account_id: str) -> str:
    header = _b64_json({"alg": "none", "typ": "JWT"})
    payload = _b64_json(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": account_id},
            "email": "researcher@example.test",
        }
    )
    return f"{header}.{payload}.signature"


def _b64_json(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


if __name__ == "__main__":
    unittest.main()
