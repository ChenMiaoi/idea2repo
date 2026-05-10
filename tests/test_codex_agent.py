import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from idea2repo.codex_agent import (
    CodexCliClient,
    CodexExecutionError,
    CodexNotInstalledError,
    CodexSchemaError,
    parse_discussion_turn,
    parse_research_analysis,
)


class CodexAgentTests(unittest.TestCase):
    def test_check_login_reports_logged_in_codex_cli(self) -> None:
        with patch("idea2repo.codex_agent.shutil.which", return_value="/usr/bin/codex"):
            with patch("idea2repo.codex_agent.subprocess.run") as run:
                run.side_effect = [
                    subprocess.CompletedProcess(["codex", "--version"], 0, "codex-cli 0.130.0\n", ""),
                    subprocess.CompletedProcess(["codex", "login", "status"], 0, "Logged in using ChatGPT\n", ""),
                ]

                status = CodexCliClient().check_login()

        self.assertTrue(status.available)
        self.assertTrue(status.logged_in)
        self.assertEqual(status.version, "codex-cli 0.130.0")

    def test_missing_codex_binary_is_explicit(self) -> None:
        with patch("idea2repo.codex_agent.shutil.which", return_value=None):
            status = CodexCliClient().check_login()
            self.assertFalse(status.available)
            with self.assertRaises(CodexNotInstalledError):
                CodexCliClient().require_installed()

    def test_analyze_idea_uses_output_schema_and_validates_final_message(self) -> None:
        payload = _analysis_payload()

        def fake_run(command, **kwargs):
            if command[:2] == ["codex", "--version"]:
                return subprocess.CompletedProcess(command, 0, "codex-cli test\n", "")
            if command[:3] == ["codex", "login", "status"]:
                return subprocess.CompletedProcess(command, 0, "Logged in using ChatGPT\n", "")
            if command[:2] == ["codex", "exec"]:
                self.assertIn("--model", command)
                self.assertIn("gpt-test", command)
                self.assertIn("-c", command)
                self.assertIn('model_reasoning_effort="high"', command)
                schema_path = Path(command[command.index("--output-schema") + 1])
                message_path = Path(command[command.index("--output-last-message") + 1])
                self.assertTrue(schema_path.exists())
                message_path.write_text(json.dumps(payload), encoding="utf-8")
                return subprocess.CompletedProcess(
                    command,
                    0,
                    json.dumps({"type": "done", "content": json.dumps(payload)}) + "\n",
                    "",
                )
            raise AssertionError(command)

        with tempfile.TemporaryDirectory() as tmp:
            with patch("idea2repo.codex_agent.shutil.which", return_value="/usr/bin/codex"):
                with patch("idea2repo.codex_agent.subprocess.run", side_effect=fake_run):
                    result = CodexCliClient(
                        cwd=tmp,
                        model="gpt-test",
                        reasoning_effort="high",
                    ).analyze_idea("agent memory")

        self.assertEqual(result.provider_id, "openai-codex-cli")
        self.assertEqual(result.api_shape, "codex-exec-json")
        self.assertEqual(result.analysis.raw_score.total, 41)
        self.assertEqual(result.analysis.revised_score.total, 73)

    def test_parse_research_analysis_rejects_non_json_and_missing_fields(self) -> None:
        with self.assertRaises(CodexSchemaError):
            parse_research_analysis("not json")
        with self.assertRaises(CodexSchemaError):
            parse_research_analysis(json.dumps({"idea_summary": "missing most fields"}))

    def test_parse_research_analysis_accepts_json_with_trailing_stream_text(self) -> None:
        payload = _analysis_payload()
        text = json.dumps(payload) + "\n\n" + json.dumps({"type": "response.completed"})

        analysis = parse_research_analysis(text)

        self.assertEqual(analysis.raw_score.total, 41)

    def test_parse_research_analysis_normalizes_numeric_timeline_weeks(self) -> None:
        payload = _analysis_payload()
        payload["timeline"] = [{"week": 12, "deliverable": "Final report", "exit_criteria": "Done"}]

        analysis = parse_research_analysis(json.dumps(payload))

        self.assertEqual(analysis.timeline[0].week, "12")

    def test_parse_discussion_turn_validates_ready_config(self) -> None:
        turn = parse_discussion_turn(
            json.dumps(
                {
                    "assistant_message": "I have enough context to proceed.",
                    "ready_to_analyze": True,
                    "missing_information": [],
                    "assumptions": ["Use Python scaffold."],
                    "derived_config": {
                        "timeline_weeks": 12,
                        "resources": [],
                        "stack": "python",
                        "output_slug": "agent-memory",
                        "requested_domains": ["ai"],
                    },
                }
            )
        )

        self.assertTrue(turn.ready_to_analyze)
        self.assertEqual(turn.derived_config.output_slug, "agent-memory")

    def test_analyze_idea_reports_codex_timeout(self) -> None:
        def fake_run(command, **kwargs):
            if command[:2] == ["codex", "--version"]:
                return subprocess.CompletedProcess(command, 0, "codex-cli test\n", "")
            if command[:3] == ["codex", "login", "status"]:
                return subprocess.CompletedProcess(command, 0, "Logged in using ChatGPT\n", "")
            raise subprocess.TimeoutExpired(command, kwargs.get("timeout", 1))

        with tempfile.TemporaryDirectory() as tmp:
            with patch("idea2repo.codex_agent.shutil.which", return_value="/usr/bin/codex"):
                with patch("idea2repo.codex_agent.subprocess.run", side_effect=fake_run):
                    with self.assertRaises(CodexExecutionError):
                        CodexCliClient(cwd=tmp, timeout_seconds=1).analyze_idea("agent memory")


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


if __name__ == "__main__":
    unittest.main()
