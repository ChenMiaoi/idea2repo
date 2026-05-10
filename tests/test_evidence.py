import unittest

from idea2repo.evidence import evaluate_evidence_gate
from idea2repo.literature import PaperRecord
from idea2repo.scoring import diagnose_idea


class EvidenceGateTests(unittest.TestCase):
    def test_empty_evidence_blocks_submission_readiness(self) -> None:
        diagnosis = diagnose_idea(
            "A new agent memory method with benchmark baseline dataset metric recent related work",
            requested_domains=["ai"],
        )
        self.assertGreater(diagnosis.revised_score.total, 0)
        self.assertFalse(diagnosis.evidence_gate.submission_ready)
        self.assertIn("verified_related_work_missing", diagnosis.evidence_gate.blocking_reasons)
        self.assertIn("strong_baseline_missing", diagnosis.evidence_gate.blocking_reasons)

    def test_verified_artifacts_can_pass_gate(self) -> None:
        paper = PaperRecord(
            paper_id="https://openalex.org/W123",
            title="Verified Agent Work",
            venue="ICLR",
            year=2026,
            authors=("Ada Lovelace",),
            source_url="https://openalex.org/W123",
            bibtex_key="lovelace2026verified",
            openalex_id="https://openalex.org/W123",
        )
        gate = evaluate_evidence_gate(
            [paper],
            baselines=["strong baseline"],
            datasets=["dataset"],
            metrics=["metric"],
            claim_evidence_rows=[
                {
                    "claim": "claim",
                    "required_evidence": "evidence",
                    "planned_artifact": "results/table.md",
                    "status": "verified",
                }
            ],
        )
        self.assertTrue(gate.submission_ready)
        self.assertEqual(gate.blocking_reasons, ())

    def test_placeholders_do_not_pass_gate(self) -> None:
        paper = PaperRecord(
            paper_id="bad",
            title="Bad",
            venue="Bad",
            year=2026,
            authors=("Ada Lovelace",),
            source_url="not-a-url",
            bibtex_key="bad2026",
        )
        gate = evaluate_evidence_gate(
            [paper],
            baselines=["TODO: baseline"],
            datasets=["planned dataset"],
            metrics=["unknown metric"],
            claim_evidence_rows=[
                {
                    "claim": "TODO claim",
                    "required_evidence": "evidence",
                    "planned_artifact": "results/table.md",
                    "status": "verified",
                },
                {
                    "claim": "real claim",
                    "required_evidence": "real evidence",
                    "planned_artifact": "",
                    "status": "verified",
                },
                {
                    "claim": "real claim",
                    "required_evidence": "real evidence",
                    "planned_artifact": "results/table.md",
                    "status": "planned",
                },
            ],
        )
        self.assertFalse(gate.submission_ready)
        self.assertIn("verified_related_work_missing", gate.blocking_reasons)
        self.assertIn("strong_baseline_missing", gate.blocking_reasons)
        self.assertIn("dataset_missing", gate.blocking_reasons)
        self.assertIn("metric_missing", gate.blocking_reasons)
        self.assertIn("claim_evidence_missing", gate.blocking_reasons)

    def test_generated_words_do_not_lift_evidence_gate(self) -> None:
        diagnosis = diagnose_idea(
            "benchmark baseline dataset metric recent related work ablation generalization",
            requested_domains=["ai"],
        )
        self.assertNotIn("missing_verifiable_experiment_plan", {trigger.value for trigger in diagnosis.revised_score.cap_triggers})
        self.assertFalse(diagnosis.evidence_gate.submission_ready)


if __name__ == "__main__":
    unittest.main()
