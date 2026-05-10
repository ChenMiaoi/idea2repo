"""Evidence gates for CCF-A readiness."""

from __future__ import annotations

from dataclasses import dataclass

from .literature import PaperRecord, verified_records


@dataclass(frozen=True)
class EvidenceGate:
    """Evidence-backed readiness state separate from idea potential scoring."""

    related_work_verified: bool
    strong_baseline_defined: bool
    dataset_defined: bool
    metric_defined: bool
    claim_evidence_mapped: bool

    @property
    def submission_ready(self) -> bool:
        return all(
            (
                self.related_work_verified,
                self.strong_baseline_defined,
                self.dataset_defined,
                self.metric_defined,
                self.claim_evidence_mapped,
            )
        )

    @property
    def blocking_reasons(self) -> tuple[str, ...]:
        reasons: list[str] = []
        if not self.related_work_verified:
            reasons.append("verified_related_work_missing")
        if not self.strong_baseline_defined:
            reasons.append("strong_baseline_missing")
        if not self.dataset_defined:
            reasons.append("dataset_missing")
        if not self.metric_defined:
            reasons.append("metric_missing")
        if not self.claim_evidence_mapped:
            reasons.append("claim_evidence_missing")
        return tuple(reasons)


def evaluate_evidence_gate(
    papers: list[PaperRecord] | None = None,
    *,
    baselines: list[str] | None = None,
    datasets: list[str] | None = None,
    metrics: list[str] | None = None,
    claim_evidence_rows: list[dict[str, str]] | None = None,
) -> EvidenceGate:
    verified = verified_records(papers or [])
    rows = claim_evidence_rows or []
    mapped_rows = [
        row for row in rows
        if _verified_text(row.get("claim", ""))
        and _verified_text(row.get("required_evidence", ""))
        and _verified_text(row.get("planned_artifact", ""))
        and row.get("status") in {"verified", "measured"}
    ]
    return EvidenceGate(
        related_work_verified=len(verified) > 0,
        strong_baseline_defined=bool([item for item in baselines or [] if _verified_text(item)]),
        dataset_defined=bool([item for item in datasets or [] if _verified_text(item)]),
        metric_defined=bool([item for item in metrics or [] if _verified_text(item)]),
        claim_evidence_mapped=bool(mapped_rows),
    )


def evidence_gate_markdown(gate: EvidenceGate) -> str:
    status = "ready" if gate.submission_ready else "blocked"
    reasons = ", ".join(gate.blocking_reasons) or "none"
    return f"""# Evidence Gate

- Submission readiness: {status}
- Blocking reasons: {reasons}

| Gate | Passed |
| --- | --- |
| Verified related work | {_yes_no(gate.related_work_verified)} |
| Strong baseline defined | {_yes_no(gate.strong_baseline_defined)} |
| Dataset defined | {_yes_no(gate.dataset_defined)} |
| Metric defined | {_yes_no(gate.metric_defined)} |
| Claim evidence mapped | {_yes_no(gate.claim_evidence_mapped)} |

This gate is evidence-based. Generated revised-plan prose does not make a project
submission-ready until the artifacts above contain verified evidence.
"""


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _verified_text(value: str) -> bool:
    normalized = " ".join(value.split()).casefold()
    if not normalized:
        return False
    placeholders = ("todo", "tbd", "placeholder", "planned", "unknown", "unspecified")
    return not any(marker in normalized for marker in placeholders)
