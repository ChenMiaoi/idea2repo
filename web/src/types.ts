import type { LucideIcon } from "lucide-react";

export type RuntimePlanItem = {
  id: string;
  stage_id?: string;
  step: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped";
  blocker?: string;
  artifacts: string[];
  input_refs: string[];
  output_refs: string[];
  evidence_refs: string[];
  decision_ids: string[];
  next_actions: string[];
  updated_at: string;
};

export type RouteScore = {
  id: string;
  route: string;
  score: number;
  gate: "ready" | "blocked" | "warning";
  feasible: number;
  novelty: number;
  impact: number;
  progress: number;
};

export type LiteratureRecord = {
  id: string;
  citation: string;
  finding: string;
  relevance: number;
  evidence: "high" | "medium" | "low";
  selected: boolean;
};

export type BoardColumn = {
  title: string;
  tone: "plan" | "active" | "validate" | "done" | "blocked";
  tasks: string[];
};

export type ArtifactNode = {
  path: string;
  status: "clean" | "modified" | "missing";
  depth: number;
};

export type ProviderService = {
  name: string;
  status: "running" | "offline";
  detail: string;
};

export type PermissionKey =
  | "localFirst"
  | "write"
  | "network"
  | "install"
  | "publish";

export type PermissionState = Record<PermissionKey, boolean>;

export type RunLogEntry = {
  time: string;
  label: string;
  tone: "ok" | "warn" | "blocked";
};

export type NavItem = {
  label: string;
  icon: LucideIcon;
};

export type RuntimeEvent =
  | { type: "run.started"; run_id: string; idea: string; output_root: string; timestamp: string }
  | { type: "run.completed"; run_id: string; timestamp: string }
  | { type: "run.failed"; run_id: string; error: string; timestamp: string }
  | { type: "run.cancelled"; run_id: string; reason?: string; timestamp: string }
  | { type: "stage.started"; run_id: string; stage_id: string; label: string; timestamp: string }
  | { type: "stage.completed"; run_id: string; stage_id: string; artifacts: string[]; timestamp: string }
  | { type: "stage.skipped"; run_id: string; stage_id: string; reason: string; timestamp: string }
  | { type: "stage.failed"; run_id: string; stage_id: string; error: string; timestamp: string }
  | { type: "stage.blocked"; run_id: string; stage_id: string; reason: string; timestamp: string }
  | { type: "plan.updated"; run_id: string; plan: RuntimePlanItem[]; timestamp: string }
  | { type: "decision.recorded"; run_id: string; decision_id: string; stage_id?: string; title: string; timestamp: string }
  | { type: "idea.optimized"; run_id: string; stage_id?: string; summary: string; target_domain?: string; target_venues?: string[]; path?: string; timestamp: string }
  | { type: "paper.found"; run_id: string; paper_id: string; title: string; stage_id?: string; venue?: string; year?: number | null; relevance_score?: number; ccf_rank?: "A" | "B" | "C" | "unknown"; venue_match?: "target" | "primary" | "secondary" | "ccf_a" | "known" | "unknown"; track_status?: "main_conference" | "journal" | "workshop" | "demo" | "short_paper" | "unknown"; novelty_risk?: "high" | "medium" | "low" | "unknown"; pdf_status?: "available" | "unavailable" | "needs_approval" | "downloaded"; reason?: string; timestamp: string }
  | { type: "pdf.downloaded"; run_id: string; paper_id: string; path: string; sha256: string; bytes: number; source_url?: string; extraction_quality?: "empty" | "weak" | "ok"; mean_chars_per_page?: number; weak_pages?: number[]; extraction_pages?: Array<{ page: number; char_count: number; text_density: number; quality: "empty" | "weak" | "ok" }>; timestamp: string }
  | { type: "evidence.extracted"; run_id: string; evidence_id: string; paper_id: string; title?: string; venue?: string; claim: string; claim_type: "method" | "dataset" | "metric" | "baseline" | "limitation" | "result" | "threat" | "future_work"; page: number; section?: string; quote: string; chunk_id: string; confidence: number; provenance?: { source: "pdf_chunk"; artifact: string; pdf_path?: string; pdf_sha256?: string; source_url?: string; extracted_at: string }; timestamp: string }
  | { type: "paper.note.written"; run_id: string; paper_id: string; path: string; status: "verified" | "metadata_only"; evidence_rows: number; title?: string; timestamp: string }
  | { type: "survey.updated"; run_id: string; path: string; verified_papers: number; clusters: number; baselines: number; datasets: number; metrics: number; timestamp: string }
  | { type: "question.asked"; run_id: string; question_id: string; question: string; why_it_matters: string; related_score_dimensions: string[]; evidence_refs: string[]; options?: string[]; required: boolean; timestamp: string }
  | { type: "score.updated"; run_id: string; stage_id?: string; score: number; max_score: number; confidence: number; hard_blockers: string[]; timestamp: string }
  | { type: "reviewer.reported"; run_id: string; reviewer_id: "R1" | "R2" | "R3"; role: string; verdict: "Weak reject" | "Borderline" | "Weak accept"; artifact: string; open_tasks: number; timestamp: string }
  | { type: "rebuttal.task.created"; run_id: string; task_id: string; reviewer_id: "R1" | "R2" | "R3"; title: string; binding_type: "paper_note" | "evidence_ref" | "score_dimension"; binding_ref: string; score_dimension?: string; evidence_refs: string[]; timestamp: string }
  | { type: "rebuttal.task.resolved"; run_id: string; task_id: string; reviewer_id: "R1" | "R2" | "R3"; score_snapshot_id: string; timestamp: string }
  | { type: "solution.generated"; run_id: string; stage_id?: string; summary: string; artifacts: string[]; timestamp: string }
  | { type: "artifact.written"; run_id: string; path: string; sha256: string; bytes: number; timestamp: string }
  | { type: "artifact.snapshot"; run_id: string; snapshot_id: string; path: string; timestamp: string }
  | { type: "artifact.restored"; run_id: string; snapshot_id: string; path: string; timestamp: string }
  | { type: "tool.started"; run_id: string; tool_call_id: string; tool_name: string; timestamp: string }
  | { type: "tool.completed"; run_id: string; tool_call_id: string; success: boolean; summary: string; timestamp: string }
  | { type: "approval.requested"; run_id: string; approval_id: string; stage_id?: string; action: string; risk: string; timestamp: string }
  | { type: "approval.resolved"; run_id: string; approval_id: string; decision: "approved" | "denied"; timestamp: string };

export type RuntimeArtifact = {
  path: string;
  bytes: number;
  text: boolean;
};

export type RuntimeDecision = {
  id: string;
  title: string;
  stage_id?: string;
  timestamp: string;
};

export type RuntimeApproval = {
  id: string;
  action: string;
  stage_id?: string;
  risk?: string;
  decision?: "approved" | "denied";
  timestamp: string;
};

export type RuntimePaper = {
  id: string;
  title: string;
  venue?: string;
  year?: number | null;
  pdf_status?: string;
  novelty_risk?: string;
  reason?: string;
  timestamp: string;
};

export type RuntimeEvidence = {
  id: string;
  paper_id: string;
  claim: string;
  claim_type: string;
  page: number;
  quote: string;
  chunk_id: string;
  confidence: number;
  timestamp: string;
};

export type RuntimeQuestion = {
  id: string;
  question: string;
  why_it_matters: string;
  related_score_dimensions: string[];
  evidence_refs: string[];
  options?: string[];
  required: boolean;
  timestamp: string;
};

export type RuntimeScoreSnapshot = {
  score: number;
  max_score: number;
  confidence: number;
  hard_blockers: string[];
  stage_id?: string;
  timestamp: string;
};

export type RuntimeRunSummary = {
  id: string;
  status: "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  idea: string;
  output_root: string;
  created_at: string;
  updated_at: string;
};

export type RuntimeViewState = {
  runId: string;
  outputRoot: string;
  status: RuntimeRunSummary["status"];
  connected: boolean;
  events: RuntimeEvent[];
  plan: RuntimePlanItem[];
  artifacts: RuntimeArtifact[];
  decisions: RuntimeDecision[];
  approvals: RuntimeApproval[];
  papers: RuntimePaper[];
  evidence: RuntimeEvidence[];
  questions: RuntimeQuestion[];
  scores: RuntimeScoreSnapshot[];
  error?: string;
};
