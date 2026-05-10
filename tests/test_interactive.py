import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from idea2repo.codex_agent import CodexDiscussionResult, CodexLoginStatus, DerivedResearchConfig, IdeaDiscussionTurn
from idea2repo.codex_models import CodexModelCatalog, CodexModelInfo, CodexReasoningLevel
from idea2repo.interactive import InteractiveSession


class FakeCodexClient:
    def __init__(self, turns=None) -> None:
        self.turns = list(turns or [_ready_turn()])

    def check_login(self) -> CodexLoginStatus:
        return CodexLoginStatus(
            available=True,
            logged_in=True,
            status_text="Logged in using ChatGPT",
            binary="/usr/bin/codex",
            version="codex-cli test",
        )

    def logout(self) -> None:
        return None

    def discuss_idea(self, *args, **kwargs):
        return CodexDiscussionResult(
            turn=self.turns.pop(0),
            provider_id="openai-codex-cli",
            api_shape="codex-exec-json",
            codex_version="codex-cli test",
            codex_model="gpt-test",
            stdout_events=(),
        )


class InteractiveTests(unittest.TestCase):
    def test_logged_in_session_lets_codex_derive_generation_config(self) -> None:
        calls: list[dict[str, object]] = []
        prompts: list[str] = []
        outputs: list[str] = []

        def generate_func(*args, **kwargs):
            calls.append({"args": args, "kwargs": kwargs})
            return SimpleNamespace(
                root=Path(args[1]),
                analysis_source="codex",
                provider_id="openai-codex-cli",
                diagnosis=SimpleNamespace(
                    routes=[SimpleNamespace(domain=SimpleNamespace(label="AI/LLM Agent"))],
                    raw_score=SimpleNamespace(total=58),
                    revised_score=SimpleNamespace(total=76),
                ),
            )

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "generated"
            answers = iter(
                [
                    "agent memory benchmark",
                    "/exit",
                ]
            )

            def input_func(prompt: str) -> str:
                prompts.append(prompt)
                return next(answers)

            session = InteractiveSession(
                codex_client=FakeCodexClient(),
                input_func=input_func,
                output_func=outputs.append,
                generate_func=generate_func,
                model_catalog=_catalog(),
            )

            self.assertEqual(session.run(), 0)

        self.assertEqual(prompts[0], "Research idea > ")
        self.assertEqual(calls[0]["args"][0], "agent memory benchmark")
        self.assertEqual(calls[0]["args"][1], Path("generated_repos") / "agent-memory")
        self.assertEqual(calls[0]["kwargs"]["requested_domains"], ["ai"])
        self.assertEqual(calls[0]["kwargs"]["timeline_weeks"], 16)
        self.assertEqual(calls[0]["kwargs"]["resources"], ["single-researcher"])
        self.assertEqual(calls[0]["kwargs"]["stack"], "python")
        self.assertEqual(calls[0]["kwargs"]["provider"], "openai-codex-cli")
        self.assertEqual(calls[0]["kwargs"]["codex_model"], "gpt-test")
        self.assertEqual(calls[0]["kwargs"]["reasoning_effort"], "medium")
        self.assertEqual(calls[0]["kwargs"]["discussion_assumptions"], ["No GPU is available."])
        self.assertIn("progress_callback", calls[0]["kwargs"])
        self.assertFalse(any("Target domain" in prompt for prompt in prompts))
        self.assertFalse(any("Timeline weeks" in prompt for prompt in prompts))
        self.assertTrue(any("Generated Idea2Repo project" in line for line in outputs))

    def test_discussion_loop_waits_for_user_reply_before_analysis(self) -> None:
        calls: list[dict[str, object]] = []
        prompts: list[str] = []
        outputs: list[str] = []
        turns = [
            IdeaDiscussionTurn(
                assistant_message="What hardware simulator should this target?",
                ready_to_analyze=False,
                missing_information=["target simulator"],
                derived_config=DerivedResearchConfig(output_slug="riscv-testing"),
            ),
            _ready_turn(output_slug="riscv-testing"),
        ]

        def generate_func(*args, **kwargs):
            calls.append({"args": args, "kwargs": kwargs})
            return SimpleNamespace(
                root=Path(args[1]),
                analysis_source="codex",
                provider_id="openai-codex-cli",
                diagnosis=SimpleNamespace(
                    routes=[SimpleNamespace(domain=SimpleNamespace(label="Systems"))],
                    raw_score=SimpleNamespace(total=58),
                    revised_score=SimpleNamespace(total=76),
                ),
            )

        answers = iter(["riscv testing", "use verilator and qemu", "/exit"])

        def input_func(prompt: str) -> str:
            prompts.append(prompt)
            return next(answers)

        session = InteractiveSession(
            codex_client=FakeCodexClient(turns),
            input_func=input_func,
            output_func=outputs.append,
            generate_func=generate_func,
            model_catalog=_catalog(),
        )

        self.assertEqual(session.run(), 0)
        self.assertIn("Codex > ", prompts)
        self.assertEqual(calls[0]["args"][1], Path("generated_repos") / "riscv-testing")
        self.assertTrue(any("What hardware simulator" in line for line in outputs))

    def test_help_lists_model_and_reasoning_not_old_config_commands(self) -> None:
        outputs: list[str] = []
        answers = iter(["/help", "/exit"])

        session = InteractiveSession(
            codex_client=FakeCodexClient(),
            input_func=lambda prompt: next(answers),
            output_func=outputs.append,
            generate_func=lambda *args, **kwargs: None,
            model_catalog=_catalog(),
        )

        self.assertEqual(session.run(), 0)
        help_text = "\n".join(outputs)
        self.assertIn("/model", help_text)
        self.assertIn("/reasoning", help_text)
        self.assertNotIn("/weeks", help_text)
        self.assertNotIn("/domain", help_text)


def _ready_turn(output_slug: str = "agent-memory") -> IdeaDiscussionTurn:
    return IdeaDiscussionTurn(
        assistant_message="I have enough context and will analyze this as an AI systems project.",
        ready_to_analyze=True,
        assumptions=["No GPU is available."],
        derived_config=DerivedResearchConfig(
            timeline_weeks=16,
            resources=["single-researcher"],
            stack="python",
            output_slug=output_slug,
            requested_domains=["ai"],
        ),
    )


def _catalog() -> CodexModelCatalog:
    return CodexModelCatalog(
        models=(
            CodexModelInfo(
                slug="gpt-test",
                display_name="GPT Test",
                default_reasoning="medium",
                supported_reasoning=(
                    CodexReasoningLevel("low"),
                    CodexReasoningLevel("medium"),
                    CodexReasoningLevel("high"),
                ),
                priority=0,
            ),
        ),
        source="test",
        available=True,
    )


if __name__ == "__main__":
    unittest.main()
