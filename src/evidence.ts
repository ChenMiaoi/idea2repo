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
    claimEvidenceRows?: Array<Record<string, unknown>>;
  } = {}
): EvidenceGate {
  const rows = options.claimEvidenceRows ?? [];
  const mapped = rows.some(structuredEvidenceRow);
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

function verifiedText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !["todo", "tbd", "placeholder", "planned", "unknown", "unspecified"].some((marker) => normalized.includes(marker));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function structuredEvidenceRow(row: Record<string, unknown>): boolean {
  const confidence = typeof row.confidence === "number" ? row.confidence : Number.NaN;
  return Boolean(
    verifiedText(row.paper_id) &&
      verifiedText(row.claim) &&
      isEvidenceClaimType(row.claim_type) &&
      Number.isFinite(confidence) &&
      confidence > 0 &&
      confidence <= 1 &&
      Number.isFinite(Number(row.page)) &&
      Number(row.page) >= 1 &&
      verifiedText(row.quote) &&
      verifiedText(row.chunk_id) &&
      ["verified", "measured"].includes(stringValue(row.status)) &&
      hasPdfChunkProvenance(row.provenance)
  );
}

function hasPdfChunkProvenance(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const provenance = value as Record<string, unknown>;
  return provenance.source === "pdf_chunk" && verifiedText(provenance.artifact) && verifiedText(provenance.extracted_at);
}

function isEvidenceClaimType(value: unknown): boolean {
  return typeof value === "string" && ["method", "dataset", "metric", "baseline", "limitation", "result", "threat", "future_work"].includes(value);
}
