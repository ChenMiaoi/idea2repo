import type { PaperRecord } from "./literature.js";
import { verifiedRecords } from "./literature.js";

export type EvidenceGate = {
  related_work_verified: boolean;
  strong_baseline_defined: boolean;
  dataset_defined: boolean;
  metric_defined: boolean;
  claim_evidence_mapped: boolean;
};

export function submissionReady(gate: EvidenceGate): boolean {
  return Object.values(gate).every(Boolean);
}

export function blockingReasons(gate: EvidenceGate): string[] {
  const reasons: string[] = [];
  if (!gate.related_work_verified) reasons.push("verified_related_work_missing");
  if (!gate.strong_baseline_defined) reasons.push("strong_baseline_missing");
  if (!gate.dataset_defined) reasons.push("dataset_missing");
  if (!gate.metric_defined) reasons.push("metric_missing");
  if (!gate.claim_evidence_mapped) reasons.push("claim_evidence_missing");
  return reasons;
}

export function evaluateEvidenceGate(
  papers: PaperRecord[] = [],
  options: {
    baselines?: string[];
    datasets?: string[];
    metrics?: string[];
    claimEvidenceRows?: Record<string, string>[];
  } = {}
): EvidenceGate {
  const rows = options.claimEvidenceRows ?? [];
  const mapped = rows.some(
    (row) =>
      verifiedText(row.claim ?? "") &&
      verifiedText(row.required_evidence ?? "") &&
      verifiedText(row.planned_artifact ?? "") &&
      ["verified", "measured"].includes(row.status ?? "")
  );
  return {
    related_work_verified: verifiedRecords(papers).length > 0,
    strong_baseline_defined: (options.baselines ?? []).some(verifiedText),
    dataset_defined: (options.datasets ?? []).some(verifiedText),
    metric_defined: (options.metrics ?? []).some(verifiedText),
    claim_evidence_mapped: mapped
  };
}

export function evidenceGateMarkdown(gate: EvidenceGate): string {
  return `# Evidence Gate

- Submission readiness: ${submissionReady(gate) ? "ready" : "blocked"}
- Blocking reasons: ${blockingReasons(gate).join(", ") || "none"}

| Gate | Passed |
| --- | --- |
| Verified related work | ${yesNo(gate.related_work_verified)} |
| Strong baseline defined | ${yesNo(gate.strong_baseline_defined)} |
| Dataset defined | ${yesNo(gate.dataset_defined)} |
| Metric defined | ${yesNo(gate.metric_defined)} |
| Claim evidence mapped | ${yesNo(gate.claim_evidence_mapped)} |

This gate is evidence-based. Generated revised-plan prose does not make a project
submission-ready until the artifacts above contain verified evidence.
`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function verifiedText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !["todo", "tbd", "placeholder", "planned", "unknown", "unspecified"].some((marker) => normalized.includes(marker));
}
